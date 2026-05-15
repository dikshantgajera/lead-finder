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

      // Pattern 1: "4.7 ★★★★★ 225 Google reviews" or "4.7 (225)"
      const ratingReviewMatch = cardText.match(/(\d+\.\d)\s*[★☆]*\s*\(?\s*([\d,]+)\s*(?:Google\s*)?reviews?/i);
      if (ratingReviewMatch) {
        rating = parseFloat(ratingReviewMatch[1]);
        reviewCount = parseInt(ratingReviewMatch[2].replace(/,/g, ''), 10);
      }

      // Pattern 2: aria-label on star element
      if (!rating || !reviewCount) {
        const starEl = card.querySelector('[aria-label*="star"], [aria-label*="rated"]');
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
    // Last resort: click via DOM evaluate
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
    await page.waitForSelector('[role="dialog"], [data-item-id="overview"], div[jsaction*="mouseover:pane"]', { timeout: 8000 });
  } catch (e) {}
  await sleep(2000);

  const details = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Find where the selected business's detail section starts
    // The detail panel typically appears after a click and has concentrated data
    // We search the full body text for relevant patterns

    // Rating: look for "X.X" near rating keywords
    let rating = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/stars?|reviews?|rated|out of 5/i.test(line)) {
        const m = line.match(/(\d+\.\d)/);
        if (m) {
          const val = parseFloat(m[1]);
          if (val >= 1 && val <= 5) { rating = val; break; }
        }
      }
    }
    if (!rating) {
      const allNums = text.match(/(\d+\.\d)/g);
      if (allNums) {
        for (const n of allNums) {
          const val = parseFloat(n);
          if (val >= 1 && val <= 5) { rating = val; break; }
        }
      }
    }

    // Review count
    let reviewCount = 0;
    const rvM = text.match(/([\d,]+)\s*(?:Google\s*)?reviews?/i);
    if (rvM) reviewCount = parseInt(rvM[1].replace(/,/g, ''), 10);

    // Phone — try tel: links first
    let phone = '';
    const telLinks = document.querySelectorAll('a[href^="tel:"]');
    for (const a of telLinks) {
      const fromHref = (a.getAttribute('href') || '').replace('tel:', '').trim();
      const fromText = a.textContent?.trim() || '';
      const num = fromText.replace(/\D/g, '').length >= 7 ? fromText : fromHref;
      const digits = num.replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) { phone = num; break; }
    }

    // Try Google Maps-specific DOM patterns
    if (!phone) {
      const els = document.querySelectorAll('[data-phonenumber], [data-item-id*="phone"], [aria-label*="phone" i]');
      for (const el of els) {
        const num = el.getAttribute('data-phonenumber') || el.textContent?.trim() || '';
        const digits = num.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15) { phone = num; break; }
      }
    }

    // Fallback: broad text pattern
    if (!phone) {
      const gPattern = /(\+?[\d\s\-().]{7,20})/g;
      const allM = text.matchAll(gPattern);
      for (const m of allM) {
        const cleaned = m[1].replace(/\D/g, '');
        const first4 = parseInt(cleaned.substring(0, 4), 10);
        if (cleaned.length >= 7 && cleaned.length <= 15 && !(first4 >= 1900 && first4 <= 2099 && cleaned.length <= 8)) {
          phone = m[1].trim();
          break;
        }
      }
    }

    // Fallback to text patterns — global, handles any country format
    if (!phone) {
      const globalPattern = /(\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{3,10})/g;
      const allMatches = text.matchAll(globalPattern);
      for (const m of allMatches) {
        const cleaned = m[1].replace(/\D/g, '');
        if (cleaned.length >= 7 && cleaned.length <= 15 && !/^\d{4}$/.test(cleaned)) {
          phone = m[1].trim();
          break;
        }
      }
    }

    // Address — look for common address patterns
    let address = '';
    const addrPatterns = [
      /(\d+[\s,][A-Za-z\s,]+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Nagar|Colony)[\s\S]{0,80}(?:,\s*[A-Za-z\s]+){1,3})/i,
      /([A-Za-z\s]+(?:Road|Rd|Street|St|Nagar|Colony)[\s\S]{0,80}(?:,\s*[A-Za-z\s]+){1,3})/i,
    ];
    for (const p of addrPatterns) {
      const m = text.match(p);
      if (m) { address = m[1].trim().substring(0, 150); break; }
    }

    // Website — scope to detail panel only
    let website = '';
    const detailPanel = document.querySelector('[role="dialog"], [data-item-id="overview"], div[jsaction*="mouseover:pane"], [aria-label*="Details"], .rogA2c.ITvuef');
    const ctx = detailPanel || document;

    const websiteLinks = ctx.querySelectorAll('a.rogA2c.ITvuef, a[data-item-id="authority"], a[aria-label*="Website"], a[aria-label*="ebsite"]');

    // Also search inside .rogA2c containers for links
    const containerLinks = ctx.querySelectorAll('.rogA2c.ITvuef a');
    for (const a of [...websiteLinks, ...containerLinks]) {
      const href = a.href || a.getAttribute('href') || '';
      if (href && !href.includes('google.com') && !href.includes('maps.google') && href.startsWith('http')) {
        website = href;
        break;
      }
    }
    if (!website && detailPanel) {
      const ctxText = detailPanel.textContent || '';
      const wm = ctxText.match(/(https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?)/);
      if (wm) website = wm[1];
    }
    // Do NOT fall back to full page text — too unreliable

    // Hours
    let hours = '';
    const hm = text.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[\s\S]{0,200}(?:AM|PM|am|pm|Closed|Open))/i);
    if (hm) hours = hm[1].trim().substring(0, 200);

    // Photos
    const photosCount = parseInt(text.match(/(\d+)\s*photos?/i)?.[1] || '0', 10) || 0;

    // Review responses
    const respondsToReviews = text.toLowerCase().includes('owner') &&
      (text.toLowerCase().includes('response from') || text.toLowerCase().includes('replied'));

    return { website, hours, phone, address, rating, reviewCount, photosCount, respondsToReviews };
  });

  return details;
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
      if (!lead.hasHours) {
        lead.gaps.push('no_hours');
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
