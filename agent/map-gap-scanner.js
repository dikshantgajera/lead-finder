const { chromium } = require('playwright');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const DEFAULT_CONFIG = {
  maxResults: 50,
  reviewThreshold: 20,
  headless: true,
  delayBetweenRequests: 3000,
};

function isGoogleBlockedPage(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    return /unusual traffic|not a robot|sorry\//i.test(text);
  }).catch(() => false);
}

async function createBrowser(headless = true) {
  const browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  return { browser, context, page };
}

// Load a Google Maps results URL and wait for the listings feed to appear.
async function loadResultsView(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);

  if (await isGoogleBlockedPage(page)) {
    throw new Error('Google blocked the request with an unusual-traffic check');
  }

  await page.waitForSelector('[role="feed"], a.hfpxzc, .Nv2PK, [data-section-id]', { timeout: 15000 })
    .catch(() => {});

  await sleep(1000);
}

async function searchGoogleMaps(page, niche, city, onProgress = () => {}, maxResults = Infinity) {
  const query = `${niche} in ${city}`;
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  await loadResultsView(page, url);
  await autoScrollFeed(page, onProgress, maxResults);
}

// Scroll the currently-loaded results feed to the bottom (or until the
// max-results target is reached), so every listing is in the DOM before extraction.
async function autoScrollFeed(page, onProgress = () => {}, maxResults = Infinity) {
  // Scroll the results feed all the way to the bottom BEFORE extracting anything.
  // Keep scrolling until Google shows "You've reached the end of the list" OR the
  // feed stops growing (no new cards / no new height) for several consecutive checks.
  // The whole loop is driven from Node so we can report live progress.
  const MAX_SCROLLS = 80;          // hard safety cap
  const STABLE_LIMIT = 6;          // consecutive no-growth checks = end of list
  let stable = 0;
  let lastCount = 0;

  for (let i = 0; i < MAX_SCROLLS; i++) {
    const state = await page.evaluate(async () => {
      const feed = document.querySelector('[role="feed"]');
      if (!feed) return { count: 0, atEnd: true, height: 0 };

      const sel = 'a.hfpxzc, .Nv2PK, div[role="article"]';

      // Jump to the bottom, then nudge the last card into view — Google only
      // fetches the next batch when the last result actually enters the viewport.
      feed.scrollTop = feed.scrollHeight;
      const cardsNow = feed.querySelectorAll(sel);
      if (cardsNow.length) {
        cardsNow[cardsNow.length - 1].scrollIntoView({ block: 'end' });
      }
      await new Promise(r => setTimeout(r, 1400));

      // If nothing new appeared, give it a wiggle (up a bit, then back down).
      // This re-triggers the lazy-load observer when a plain scroll stalls.
      if (feed.querySelectorAll(sel).length === cardsNow.length) {
        feed.scrollTop = feed.scrollHeight - 600;
        await new Promise(r => setTimeout(r, 500));
        feed.scrollTop = feed.scrollHeight;
        await new Promise(r => setTimeout(r, 900));
      }

      const cards = feed.querySelectorAll(sel);
      const text = feed.innerText || '';
      const atEnd = /you've reached the end of the list|reached the end of the list/i.test(text);
      return { count: cards.length, atEnd, height: feed.scrollHeight };
    }).catch(() => ({ count: lastCount, atEnd: true, height: 0 }));

    onProgress(`Scrolling results... ${state.count} businesses loaded`);

    // Stop as soon as we've loaded enough to hit the max-results target,
    // even if Google still has more listings to show below.
    if (state.count >= maxResults) {
      onProgress(`Reached target of ${maxResults} businesses — stopping scroll.`);
      break;
    }

    if (state.atEnd) {
      onProgress(`Reached the end of the list — ${state.count} businesses loaded.`);
      break;
    }

    // No new cards since last scroll? Count consecutive stalls before giving up.
    if (state.count <= lastCount) {
      stable += 1;
      if (stable >= STABLE_LIMIT) {
        onProgress(`No more results loading — ${state.count} businesses loaded.`);
        break;
      }
    } else {
      stable = 0;
    }
    lastCount = state.count;
  }

  await sleep(1500);
}

async function extractBusinessCards(page) {
  return page.evaluate(() => {
    const cardSelectors = [
      'a.hfpxzc',
      'div[role="article"]',
      '.Nv2PK',
      '[class*="section-result"]',
      '[role="feed"] > div > div > a',
      '[role="feed"] a[href*="maps/place"]',
      '[data-section-id] a[href*="maps/place"]',
    ];
    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > cards.length) cards = found;
    }

    const seen = new Set();
    const results = [];

    for (const card of cards) {
      if (!card || !card.querySelector) continue;
      const cardText = card.textContent || '';

      const nameEl = card.querySelector('h3, [class*="fontHeadline"], [class*="title"]');
      const name = nameEl?.textContent?.trim() || card.getAttribute('aria-label') || '';
      if (!name || name.length < 2) continue;

      // Stable Google place identifier from the listing link. The hex CID pair
      // (e.g. "0x89c25...:0x3f2...") is unique per business and identical across
      // every map tile, so it is the most reliable key for de-duplication.
      const anchor = (card.tagName === 'A' && card.href)
        ? card
        : (card.querySelector('a[href*="maps/place"]') || card.closest('a[href*="maps/place"]'));
      const href = (anchor && anchor.href) || '';
      let placeId = '';
      const cidMatch = href.match(/0x[0-9a-f]+:0x[0-9a-f]+/i) || href.match(/!1s([^!?&]+)/);
      if (cidMatch) placeId = cidMatch[0].replace(/^!1s/, '');

      // Within a single view, skip repeats by place id (or name when id is absent).
      const localKey = placeId || name;
      if (seen.has(localKey)) continue;
      seen.add(localKey);

      // Extract rating + review count from card text
      let rating = 0;
      let reviewCount = 0;
      const containerText = (card.parentElement?.textContent || card.textContent || '');

      // Pattern 1: "4.7 ★★★★★ 225 Google reviews", "4.7 ★★★★★ · 225 reviews"
      const ratingReviewMatch = containerText.match(/(\d+\.\d)\s*[★☆]*\s*·?\s*\(?\s*([\d,]+)\s*(?:Google\s*)?(?:reviews?|ratings?)/i);
      if (ratingReviewMatch) {
        rating = parseFloat(ratingReviewMatch[1]);
        reviewCount = parseInt(ratingReviewMatch[2].replace(/,/g, ''), 10);
      }

      // Pattern 1a: "4.7 ★★★★★ (225)" or "4.7 (225)" without "reviews" keyword
      if (!reviewCount) {
        const parenMatch = containerText.match(/(\d+\.\d)\s*[★☆·\s]*\((\d[\d,]*)\)/);
        if (parenMatch) {
          if (!rating) { const v = parseFloat(parenMatch[1]); if (v >= 1 && v <= 5) rating = v; }
          reviewCount = parseInt(parenMatch[2].replace(/,/g, ''), 10);
        }
      }

      // Pattern 2: fontBodyMedium dmRWX class (current Google Maps card element)
      if (!rating || !reviewCount) {
        const rw = card.querySelector('.fontBodyMedium.dmRWX');
        if (rw) {
          const t = rw.textContent || '';
          const m = t.match(/(\d+\.\d)\s*[★☆]*\s*·?\s*\(?\s*([\d,]+)\s*(?:Google\s*)?(?:reviews?|ratings?)/i);
          if (m) {
            if (!rating) { const v = parseFloat(m[1]); if (v >= 1 && v <= 5) rating = v; }
            if (!reviewCount) reviewCount = parseInt(m[2].replace(/,/g, ''), 10);
          }
          if (!reviewCount) {
            const pm = t.match(/(\d+\.\d)\s*[★☆·\s]*\((\d[\d,]*)\)/);
            if (pm) {
              if (!rating) { const v = parseFloat(pm[1]); if (v >= 1 && v <= 5) rating = v; }
              reviewCount = parseInt(pm[2].replace(/,/g, ''), 10);
            }
          }
        }
      }

      // Pattern 3: aria-label on star element (within card or its parent)
      if (!rating || !reviewCount) {
        const scope = card.parentElement || card;
        const starEl = scope.querySelector('[aria-label*="star"], [aria-label*="stars"], [aria-label*="rated"]');
        if (starEl) {
          const label = starEl.getAttribute('aria-label') || '';
          const rM = label.match(/(\d+\.?\d*)\s*(?:stars?|rated)/i);
          const rvM = label.match(/([\d,]+)\s*(?:Google\s*)?(?:reviews?|ratings?)/i);
          if (rM && !rating) rating = parseFloat(rM[1]);
          if (rvM && !reviewCount) reviewCount = parseInt(rvM[1].replace(/,/g, ''), 10);
        }
      }

      // Pattern 3: standalone "4.7" in card (last resort)
      if (!rating) {
        const nums = cardText.match(/(\d+\.\d)/g);
        if (nums) {
          for (const n of nums) {
            const val = parseFloat(n);
            if (val >= 1 && val <= 5) { rating = val; break; }
          }
        }
      }

      // Extract address from card text
      let address = '';
      const addrSelectors = card.querySelectorAll('[class*="address"], [aria-label*="Address"]');
      for (const el of addrSelectors) {
        const t = el.textContent?.trim();
        if (t && t.length > 5) { address = t; break; }
      }
      if (!address) {
        // Look for address-like patterns in card text
        const addrPatterns = [
          /(\d+[\s,][A-Za-z\s,]+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Nagar|Colony|Colony)\s*[,\s][A-Za-z\s]+)/i,
          /(\d+[\s,][A-Za-z\s,]+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Nagar|Colony)\s*[,\s][A-Za-z\s]+,\s*[A-Za-z\s]+\s*\d{6})/i,
        ];
        for (const p of addrPatterns) {
          const m = cardText.match(p);
          if (m) { address = m[1].trim(); break; }
        }
      }

      // Extract phone from card text
      let phone = '';
      const phoneEl = card.querySelector('[href^="tel:"]');
      if (phoneEl) {
        const fromHref = (phoneEl.getAttribute('href') || '').replace('tel:', '').trim();
        const fromText = phoneEl.textContent?.trim() || '';
        phone = fromText.replace(/\D/g, '').length >= 7 ? fromText : fromHref;
      }
      if (!phone || phone.replace(/\D/g, '').length < 7) {
        const gPattern = /(\+?[\d\s\-().]{7,20})/g;
        const allM = cardText.matchAll(gPattern);
        for (const m of allM) {
          const cleaned = m[1].replace(/\D/g, '');
          const first4 = parseInt(cleaned.substring(0, 4), 10);
          if (cleaned.length >= 7 && cleaned.length <= 15 && !(first4 >= 1900 && first4 <= 2099 && cleaned.length <= 8)) {
            phone = m[1].trim();
            break;
          }
        }
      }

      // Extract website from card
      let website = '';
      const linkEls = card.querySelectorAll('a.rogA2c.ITvuef, a[href*="http"]:not([href*="google.com"]):not([href*="maps.google"])');
      for (const el of linkEls) {
        const href = el.href || '';
        if (href && href.startsWith('http')) { website = href; break; }
      }

      results.push({
        name,
        placeId,
        rating,
        reviewCount,
        address,
        phone,
        website,
        hours: '',
        hasWebsite: !!website,
        hasHours: false,
        hasPhotos: false,
        respondsToReviews: false,
        gaps: [],
      });
    }
    return results;
  });
}

async function getBusinessDetails(page, cardIndex) {
  const cardSelectors = [
    'a.hfpxzc',
    'div[role="article"]',
    '.Nv2PK',
    '[role="feed"] a[href*="maps/place"]',
    '[role="feed"] > div > div > a',
  ];
  let clickable = null;
  for (const sel of cardSelectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count();
      if (cardIndex < count) {
        clickable = loc.nth(cardIndex);
        const isVisible = await clickable.isVisible().catch(() => false);
        if (isVisible) break;
      }
    } catch (e) {}
  }
  if (!clickable) {
    try {
      await page.evaluate((idx) => {
        const cards = document.querySelectorAll('a.hfpxzc, .Nv2PK, div[role="article"]');
        const card = cards[idx];
        if (card) card.click();
      }, cardIndex);
      await sleep(3000);
    } catch (e) {
      return null;
    }
  } else {
    try {
      await clickable.click({ timeout: 8000, force: true });
    } catch (e) {
      await clickable.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(500);
      await clickable.click({ timeout: 8000, force: true }).catch(() => {});
    }
    await sleep(3000);
  }

  try {
    await page.waitForSelector('[data-item-id="authority"], [data-item-id="address"], [data-item-id^="phone"]', { timeout: 8000 });
  } catch (e) {}
  // Wait for rating element to fully load (loads async after panel opens)
  try {
    await page.waitForSelector('[aria-label*="stars"], [aria-label*="star"], [aria-label*="rated"]', { timeout: 5000 });
  } catch (e) {}
  await sleep(1500);

  // Extract fields using Playwright locators (same pattern as enricher.js)
  const result = { website: '', hours: '', phone: '', address: '', rating: 0, reviewCount: 0, photosCount: 0, respondsToReviews: false };

  // Website
  for (const sel of ['a[data-item-id="authority"]', 'a[aria-label*="Website"]', 'a[aria-label*="ebsite"]', 'a.rogA2c.ITvuef', '.rogA2c.ITvuef a']) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        const href = await el.evaluate(node => {
          const link = node.closest('a') || node.querySelector('a');
          return node.href || node.getAttribute('href') || link?.href || '';
        }).catch(() => '');
        if (href && !href.includes('google.com') && !href.includes('maps.google') && href.startsWith('http')) {
          result.website = href;
          break;
        }
      }
    } catch (e) {}
  }

  // Address
  for (const sel of ['[data-item-id="address"]', 'button[data-item-id="address"]', '[aria-label*="Address"]']) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        const text = await el.evaluate(node => {
          const t = node.getAttribute('aria-label') || node.innerText || node.textContent || '';
          return t.replace(/\s+/g, ' ').trim();
        }).catch(() => '');
        if (text && text.length > 5) {
          result.address = text.replace(/^Address:\s*/i, '');
          break;
        }
      }
    } catch (e) {}
  }

  // Phone
  for (const sel of ['[data-item-id^="phone"]', 'button[data-item-id*="phone"]', 'a[href^="tel:"]']) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        const text = await el.evaluate(node => {
          const t = node.innerText || node.textContent || node.getAttribute('href') || '';
          return t.replace(/^tel:/i, '').replace(/\s+/g, ' ').trim();
        }).catch(() => '');
        if (text && text.replace(/\D/g, '').length >= 7) {
          result.phone = text;
          break;
        }
      }
    } catch (e) {}
  }

  // Hours
  for (const sel of ['[data-item-id="hours"]', 'button[data-item-id="hours"]']) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        const text = await el.evaluate(node => {
          const t = node.innerText || node.textContent || '';
          return t.replace(/\s+/g, ' ').trim();
        }).catch(() => '');
        if (text && text.length > 5) { result.hours = text; break; }
      }
    } catch (e) {}
  }

  // Rating + Reviews — use Playwright locator for aria-label, fall back to scoped evaluate
  let rating = 0;
  let reviewCount = 0;

  try {
    const starEl = page.locator('[aria-label*="star"], [aria-label*="stars"], [aria-label*="rated"]').first();
    if (await starEl.isVisible().catch(() => false)) {
      const label = await starEl.getAttribute('aria-label').catch(() => '') || '';
      const rm = label.match(/(\d+\.?\d*)\s*(?:stars?|rated|out of)/i);
      if (rm) { const v = parseFloat(rm[1]); if (v >= 1 && v <= 5) rating = v; }
      const rvm = label.match(/([\d,]+)\s*(?:Google\s*)?(?:reviews?|ratings?)/i);
      if (rvm) reviewCount = parseInt(rvm[1].replace(/,/g, ''), 10);
    }
  } catch (e) {}

  try {
    const rwEl = page.locator('.fontBodyMedium.dmRWX').first();
    if (await rwEl.isVisible().catch(() => false)) {
      const rwText = await rwEl.evaluate(el => el.textContent || '').catch(() => '');
      if (rwText) {
        const rm = rwText.match(/(\d+\.?\d*)\s*(?:stars?|rated|out of)/i);
        if (rm && !rating) { const v = parseFloat(rm[1]); if (v >= 1 && v <= 5) rating = v; }
        const rvm = rwText.match(/([\d,]+)\s*(?:Google\s*)?(?:reviews?|ratings?)/i);
        if (rvm && !reviewCount) reviewCount = parseInt(rvm[1].replace(/,/g, ''), 10);
        if (!reviewCount) {
          const pm = rwText.match(/[★☆·\s]*\((\d[\d,]*)\)/);
          if (pm) reviewCount = parseInt(pm[1].replace(/,/g, ''), 10);
        }
      }
    }
  } catch (e) {}

  // Fallback: scoped evaluate on detail panel
  if (!rating || !reviewCount) {
    const extras = await page.evaluate(() => {
      const ctx = document.querySelector('[role="dialog"], [data-item-id="overview"]') || document;
      const rw = ctx.querySelector('.fontBodyMedium.dmRWX');
      const text = (rw && rw.textContent) || ctx.textContent || '';

      let r = 0, rv = 0;

      // Pattern: "4.7 ★★★★★ 225 reviews" or "4.7 ★★★★★ · 225 reviews" (star chars or · between rating and count)
      const combined = text.match(/(\d+\.\d)\s*[★☆\s]*\s*·?\s*\(?\s*([\d,]+)\s*(?:Google\s*)?(?:reviews?|ratings?)/i);
      if (combined) { r = parseFloat(combined[1]); rv = parseInt(combined[2].replace(/,/g, ''), 10); }

      // Pattern: "4.7 stars" or "Rated 4.7"
      if (!r) {
        const rm = text.match(/(\d+\.\d)\s*(?:stars?|rated|out of)/i);
        if (rm) { const v = parseFloat(rm[1]); if (v >= 1 && v <= 5) r = v; }
      }

      // Pattern: standalone "4.7" near rating keywords
      if (!r) {
        const lines = text.split('\n');
        for (const line of lines) {
          if (/stars?|reviews?|ratings?|rated|out of 5/i.test(line)) {
            const nm = line.match(/(\d+\.\d)/);
            if (nm) { const v = parseFloat(nm[1]); if (v >= 1 && v <= 5) { r = v; break; } }
          }
        }
      }

      // Review count
      if (!rv) {
        const rvm = text.match(/([\d,]+)\s*(?:Google\s*)?(?:reviews?|ratings?)/i);
        if (rvm) rv = parseInt(rvm[1].replace(/,/g, ''), 10);
      }
      if (!rv) {
        const parenRv = text.match(/[★☆·\s]*\((\d[\d,]*)\)\s*(?:Google\s*)?(?:reviews?|ratings?)/i);
        if (parenRv) rv = parseInt(parenRv[1].replace(/,/g, ''), 10);
      }

      const photosCount = parseInt(text.match(/(\d+)\s*photos?/i)?.[1] || '0', 10) || 0;
      const respondsToReviews = text.toLowerCase().includes('owner') &&
        (text.toLowerCase().includes('response from') || text.toLowerCase().includes('replied'));

      return { rating: r, reviewCount: rv, photosCount, respondsToReviews };
    }).catch(() => ({}));

    if (extras.rating) rating = extras.rating;
    if (extras.reviewCount) reviewCount = extras.reviewCount;
    result.photosCount = extras.photosCount || 0;
    result.respondsToReviews = extras.respondsToReviews || false;
  }

  result.rating = rating;
  result.reviewCount = reviewCount;

  return result;
}

// Read the map's current center + zoom from the URL Google rewrites after a search,
// e.g. ".../search/salon+in+virginia/@37.43,-78.65,7z". Returns null if not present.
function getMapCenter(url) {
  const m = (url || '').match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), zoom: parseFloat(m[3]) };
}

// Build a grid of zoomed-in search URLs around the original map center so we can
// re-search each sub-area. Tiles are ordered from the center outward (ring by ring),
// and the step is sized to roughly tile the originally-viewed region at the new zoom.
function buildGridViews(query, center, radius = 2) {
  const newZoom = Math.min(center.zoom + 2, 16);
  // Degrees spanned by one viewport at the new zoom ≈ tile step (≈900px viewport).
  const step = (360 * 900) / (256 * Math.pow(2, newZoom));
  const offsets = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue; // center already scanned
      offsets.push({ dx, dy, ring: Math.max(Math.abs(dx), Math.abs(dy)) });
    }
  }
  offsets.sort((a, b) => a.ring - b.ring); // expand outward from the center
  return offsets.map(({ dx, dy }) => {
    const lat = (center.lat + dy * step).toFixed(5);
    const lng = (center.lng + dx * step).toFixed(5);
    return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},${newZoom}z`;
  });
}

async function scanForGaps({ niche, city, maxResults, reviewThreshold, onProgress }) {
  const config = { ...DEFAULT_CONFIG, maxResults, reviewThreshold };
  const { browser, context, page } = await createBrowser(config.headless);
  const results = [];
  const seen = new Set();

  // Prefer the stable place id (identical across map tiles). Fall back to a
  // normalized name+address only when the id could not be extracted.
  const dedupeKey = (lead) => {
    if (lead.placeId) return `id:${lead.placeId.toLowerCase()}`;
    const name = (lead.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const addr = (lead.address || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
    return `na:${name}|${addr}`;
  };

  // Extract + audit every new business in the currently-loaded view, stopping
  // once we reach the global maxResults target. Returns how many new leads it added.
  const harvestCurrentView = async (label) => {
    const cards = await extractBusinessCards(page);
    onProgress(`${label}: ${cards.length} listings on screen, ${results.length}/${config.maxResults} collected so far.`);

    let added = 0;
    for (let i = 0; i < cards.length && results.length < config.maxResults; i++) {
      const lead = cards[i];
      // Skip obvious repeats before spending time on a detail fetch.
      if (seen.has(dedupeKey(lead))) continue;

      onProgress(`[${results.length + 1}/${config.maxResults}] Analyzing: ${lead.name}`);
      const details = await getBusinessDetails(page, i);
      if (details) {
        lead.website = details.website || lead.website;
        lead.hours = details.hours || lead.hours;
        lead.phone = details.phone || lead.phone;
        lead.address = details.address || lead.address;
        if (details.rating) lead.rating = details.rating;
        if (details.reviewCount) lead.reviewCount = details.reviewCount;
        lead.hasWebsite = !!details.website;
        lead.hasHours = !!details.hours && details.hours.length > 5;
        lead.hasPhotos = details.photosCount > 0;
        lead.respondsToReviews = details.respondsToReviews;
      }

      // Re-check after details fill in the address (better dedupe across tiles).
      const key = dedupeKey(lead);
      if (seen.has(key)) continue;
      seen.add(key);

      lead.gaps = [];
      if (lead.reviewCount < config.reviewThreshold) lead.gaps.push('low_reviews');
      if (!lead.hasWebsite) lead.gaps.push('no_website');
      if (!lead.respondsToReviews && lead.reviewCount > 0) lead.gaps.push('no_review_responses');
      if (!lead.hasPhotos) lead.gaps.push('no_photos');
      if (!lead.phone) lead.gaps.push('no_phone');

      lead.gapCount = lead.gaps.length;
      lead.isTarget = lead.gapCount >= 2;

      results.push(lead);
      added += 1;

      if (results.length < config.maxResults) await sleep(config.delayBetweenRequests);
    }
    return added;
  };

  try {
    onProgress(`Searching Google Maps for "${niche}" in "${city}"...`);
    await searchGoogleMaps(page, niche, city, onProgress, config.maxResults);
    onProgress('Extracting business listings...');
    await harvestCurrentView('Main area');

    // Google caps a single search at ~50–60 results. If we still need more,
    // re-run the search across a grid of nearby map points to break past the cap.
    if (results.length < config.maxResults) {
      const center = getMapCenter(page.url());
      if (center) {
        const query = `${niche} in ${city}`;
        const views = buildGridViews(query, center);
        onProgress(`Google's per-search limit reached (${results.length}). Sweeping ${views.length} nearby sub-areas for more...`);

        for (let t = 0; t < views.length && results.length < config.maxResults; t++) {
          await sleep(config.delayBetweenRequests);
          try {
            await loadResultsView(page, views[t]);
            await autoScrollFeed(page, onProgress, config.maxResults - results.length);
            await harvestCurrentView(`Sub-area ${t + 1}/${views.length}`);
          } catch (e) {
            onProgress(`Sub-area ${t + 1} skipped: ${e.message}`);
          }
        }
      } else {
        onProgress('Could not read map coordinates — skipping sub-area sweep.');
      }
    }

    const targets = results.filter(r => r.isTarget);
    onProgress(`Scan complete: ${results.length} businesses found, ${targets.length} have significant gaps.`);

    return results;
  } catch (err) {
    onProgress(`Error: ${err.message}`);
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = { scanForGaps, DEFAULT_CONFIG };
