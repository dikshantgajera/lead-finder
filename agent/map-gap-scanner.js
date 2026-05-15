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

async function searchGoogleMaps(page, niche, city) {
  const query = `${niche} in ${city}`;
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);

  if (await isGoogleBlockedPage(page)) {
    throw new Error('Google blocked the request with an unusual-traffic check');
  }

  await page.waitForSelector('[role="feed"], a.hfpxzc, .Nv2PK, [data-section-id]', { timeout: 15000 })
    .catch(() => {});

  await sleep(1000);

  await page.evaluate(async () => {
    const scrollContainer = document.querySelector('[role="feed"]');
    if (!scrollContainer) return;
    let prev = 0;
    for (let i = 0; i < 15; i++) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      await new Promise(r => setTimeout(r, 800));
      if (scrollContainer.scrollTop === prev) break;
      prev = scrollContainer.scrollTop;
    }
  }).catch(() => {});

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
      if (!name || name.length < 2 || seen.has(name)) continue;
      seen.add(name);

      // Extract rating + review count from card text
      let rating = 0;
      let reviewCount = 0;
      const containerText = (card.parentElement?.textContent || card.textContent || '');

      // Pattern 1: "4.7 ★★★★★ 225 Google reviews" or "4.7 (225)"
      const ratingReviewMatch = containerText.match(/(\d+\.\d)\s*[★☆]*\s*\(?\s*([\d,]+)\s*(?:Google\s*)?reviews?/i);
      if (ratingReviewMatch) {
        rating = parseFloat(ratingReviewMatch[1]);
        reviewCount = parseInt(ratingReviewMatch[2].replace(/,/g, ''), 10);
      }

      // Pattern 2: aria-label on star element (within card or its parent)
      if (!rating || !reviewCount) {
        const scope = card.parentElement || card;
        const starEl = scope.querySelector('[aria-label*="star"], [aria-label*="stars"], [aria-label*="rated"]');
        if (starEl) {
          const label = starEl.getAttribute('aria-label') || '';
          const rM = label.match(/(\d+\.?\d*)\s*(?:stars?|rated)/i);
          const rvM = label.match(/([\d,]+)\s*(?:Google\s*)?reviews?/i);
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
      const rvm = label.match(/([\d,]+)\s*(?:Google\s*)?reviews?/i);
      if (rvm) reviewCount = parseInt(rvm[1].replace(/,/g, ''), 10);
    }
  } catch (e) {}

  // Fallback: scoped evaluate on detail panel
  if (!rating || !reviewCount) {
    const extras = await page.evaluate(() => {
      const ctx = document.querySelector('[role="dialog"], [data-item-id="overview"]') || document;
      const text = ctx.textContent || '';

      let r = 0, rv = 0;

      // Pattern: "4.7 ★★★★★ 225 reviews" (star chars between rating and count)
      const combined = text.match(/(\d+\.\d)\s*[★☆\s]*\s*\(?\s*([\d,]+)\s*(?:Google\s*)?reviews?/i);
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
          if (/stars?|reviews?|rated|out of 5/i.test(line)) {
            const nm = line.match(/(\d+\.\d)/);
            if (nm) { const v = parseFloat(nm[1]); if (v >= 1 && v <= 5) { r = v; break; } }
          }
        }
      }

      // Review count
      if (!rv) {
        const rvm = text.match(/([\d,]+)\s*(?:Google\s*)?reviews?/i);
        if (rvm) rv = parseInt(rvm[1].replace(/,/g, ''), 10);
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

async function scanForGaps({ niche, city, maxResults, reviewThreshold, onProgress }) {
  const config = { ...DEFAULT_CONFIG, maxResults, reviewThreshold };
  const { browser, context, page } = await createBrowser(config.headless);
  const results = [];

  try {
    onProgress(`Searching Google Maps for "${niche}" in "${city}"...`);
    await searchGoogleMaps(page, niche, city);
    onProgress('Extracting business listings...');

    const cards = await extractBusinessCards(page);
    onProgress(`Found ${cards.length} businesses. Analyzing gaps...`);

    const toProcess = Math.min(cards.length, config.maxResults);

    for (let i = 0; i < toProcess; i++) {
      const lead = cards[i];
      onProgress(`[${i + 1}/${toProcess}] Analyzing: ${lead.name}`);

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

      lead.gaps = [];
      if (lead.reviewCount < config.reviewThreshold) {
        lead.gaps.push('low_reviews');
      }
      if (!lead.hasWebsite) {
        lead.gaps.push('no_website');
      }
      if (!lead.respondsToReviews && lead.reviewCount > 0) {
        lead.gaps.push('no_review_responses');
      }
      if (!lead.hasPhotos) {
        lead.gaps.push('no_photos');
      }
      if (!lead.phone) {
        lead.gaps.push('no_phone');
      }

      lead.gapCount = lead.gaps.length;
      lead.isTarget = lead.gapCount >= 2;

      results.push(lead);

      if (i < toProcess - 1) {
        await sleep(config.delayBetweenRequests);
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
