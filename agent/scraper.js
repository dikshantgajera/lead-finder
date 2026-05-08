const { chromium } = require('playwright');

const TARGET_URL = 'https://app.targetron.com/local-businesses?limit=12';
const DEFAULT_TARGET_LEAD_COUNT = 100;

/** Sleep helper */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Fill an Ant Design Select/AutoComplete field by typing and picking the first match.
 * Verified against live Targetron DOM: inputs are #rc_select_0, #rc_select_1, #rc_select_2
 */
async function fillAntSelect(page, inputSelector, value) {
  const input = page.locator(inputSelector).first();
  await input.click();
  await sleep(500);
  
  // Clear safely using keyboard to avoid React state sync issues
  await input.press('Control+A');
  await input.press('Backspace');
  await input.fill('');
  await input.type(value, { delay: 80 });
  await sleep(1500); // wait for async dropdown to populate

  // Look for both standard Select and TreeSelect dropdowns
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-tree-select-dropdown:not(.ant-select-dropdown-hidden)').first();
  
  try {
    await dropdown.waitFor({ state: 'visible', timeout: 6000 });
    
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 1. Try to find an exact text match
    let exactMatch = dropdown.locator('.ant-select-item-option-content, .ant-select-tree-title')
      .filter({ hasText: new RegExp(`^${escapedValue}$`, 'i') })
      .first();
      
    if (await exactMatch.isVisible().catch(() => false)) {
      await exactMatch.click();
      await sleep(600);
      return;
    }
    
    // 2. Fallback to partial match (using .last() to prefer leaf nodes in trees)
    let partialMatch = dropdown.locator('.ant-select-item-option-content, .ant-select-tree-title')
      .filter({ hasText: new RegExp(escapedValue, 'i') })
      .last(); 
      
    if (await partialMatch.isVisible().catch(() => false)) {
      await partialMatch.click();
      await sleep(600);
      return;
    }
    
    // 3. Fallback to just clicking the first available option
    const firstOption = dropdown.locator('.ant-select-item-option, .ant-select-tree-treenode').first();
    if (await firstOption.isVisible().catch(() => false)) {
      await firstOption.click();
      await sleep(600);
      return;
    }
    
    await input.press('Enter');
    await sleep(600);
  } catch {
    // Fallback if dropdown didn't appear at all
    await input.press('Enter');
    await sleep(600);
  }
}

/**
 * Extract leads from all visible cards on the current page.
 * Verified card structure:
 *   .ant-space.card                       ← one card per business
 *     .ant-space-vertical.info-container  ← holds all text info
 *       span.main-text                    ← first one = business name
 *       span.main-text (with US, XX, ...) ← address
 *       span.main-text "Status:"          ← status label
 *       span.main-text (next sibling)     ← status value
 */
async function extractCardsFromPage(page) {
  return page.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('.ant-space.card');

    cards.forEach((card) => {
      const infoContainer = card.querySelector('[class*="info-container"]');
      const source = infoContainer || card;

      // ── Business Name ──
      const nameEl = card.querySelector('h2.title, h2.h2.title, .place-title h2');
      const name = nameEl ? nameEl.innerText.trim() : '';

      // ── All main-text spans from the ENTIRE card (not just infoContainer) ──
      // This is intentional: website/phone/email spans sit in a different subtree
      // than the infoContainer, so we must query the whole card.
      const allMainTextCard = Array.from(card.querySelectorAll('span.main-text'));
      // For address we still prefer infoContainer scope
      const allMainTextSource = Array.from(source.querySelectorAll('span.main-text'));

      // ── Address ──
      let address = '';
      const addrSpan = allMainTextSource.find((s) => /^[A-Z]{2},/.test(s.innerText.trim()));
      if (addrSpan) {
        address = addrSpan.innerText.trim().replace(/\s?\*+$/, '');
      }

      // ── Website ──
      // Targetron renders the website as a plain span.main-text whose text starts with
      // "http". The rest is masked with stars. We query from the whole card so we don't
      // miss spans that live outside the info-container subtree.
      let website = '';
      const websiteSpan = allMainTextCard.find((s) =>
        s.innerText.trim().toLowerCase().startsWith('http')
      );
      if (websiteSpan) {
        website = websiteSpan.innerText.trim().replace(/\*+$/, '').trim();
      } else {
        // Text-based fallback: grab first http token from card's raw text
        const httpMatch = card.innerText.match(/(https?:\/\/[^\s\*]+)/i);
        if (httpMatch) website = httpMatch[1].trim();
      }

      // ── Phone ──
      // Targetron renders phone as a span.main-text with mostly digits (e.g. "6126113****").
      // We look for spans containing 7+ digit characters that aren't the address or website.
      let phone = '';
      const phoneSpan = allMainTextCard.find((s) => {
        const txt = s.innerText.trim();
        // Skip if it looks like address (starts with 2-letter country code + comma)
        if (/^[A-Z]{2},/.test(txt)) return false;
        // Skip if it looks like a URL
        if (txt.toLowerCase().startsWith('http')) return false;
        // Skip known labels
        if (/^(status|employees|revenue|type):/i.test(txt)) return false;
        // Must have at least 7 digit characters to be a phone number
        const digitCount = (txt.match(/\d/g) || []).length;
        return digitCount >= 7;
      });
      if (phoneSpan) {
        phone = phoneSpan.innerText.trim().replace(/\*+$/, '').trim();
      } else {
        // Text-based fallback: look for phone-like patterns in card text
        const phoneMatch = card.innerText.match(/\b(\d[\d\s\-()]{6,}\d)\**/);
        if (phoneMatch) phone = phoneMatch[1].trim();
      }

      // ── Status ──
      let status = 'Unknown';
      const statusLabelIdx = allMainTextCard.findIndex(
        (s) => s.innerText.trim().toLowerCase() === 'status:'
      );
      if (statusLabelIdx !== -1 && allMainTextCard[statusLabelIdx + 1]) {
        status = allMainTextCard[statusLabelIdx + 1].innerText.trim();
      } else {
        const cardText = card.innerText;
        const match = cardText.match(/Status:\s*\n\s*([^\n]+)/i);
        if (match) status = match[1].trim();
      }

      if (name && name.length > 1) {
        results.push({ name, address, status, website, phone });
      }
    });

    return results;
  });
}

async function createTargetronPage() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();
  return { browser, page };
}

async function applySearchFilters(page, { category, country, city }, onProgress) {
  onProgress('Navigating to Targetron...');
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await sleep(3000);

  if (category) {
    onProgress(`Setting category: ${category}`);
    await fillAntSelect(page, 'input#rc_select_0', category).catch((e) =>
      onProgress(`Category warning: ${e.message}`)
    );
  }

  if (country) {
    onProgress(`Setting country: ${country}`);
    await fillAntSelect(page, 'input#rc_select_1', country).catch((e) =>
      onProgress(`Country warning: ${e.message}`)
    );
  }

  if (city) {
    onProgress(`Setting city: ${city}`);
    await fillAntSelect(page, 'input#rc_select_2', city).catch((e) =>
      onProgress(`City warning: ${e.message}`)
    );
  }

  onProgress('Clicking search button...');
  try {
    const searchBtn = page.locator('button.search-button, .ant-btn.search-button').first();
    await searchBtn.waitFor({ state: 'visible', timeout: 5000 });
    await searchBtn.click();
  } catch {
    await page.keyboard.press('Enter');
  }

  onProgress('Waiting for results to load...');
  await sleep(5000);
}

async function dismissModal(page) {
  try {
    await page.keyboard.press('Escape');
    await sleep(600);
    const closeBtn = page.locator('.ant-modal-close, .ant-modal-wrap button.ant-btn-default').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await sleep(600);
    }
  } catch { /* ignore */ }
}

async function getAvailablePageCount(page) {
  return page.evaluate(() => {
    const pageItems = Array.from(document.querySelectorAll(
      '.ant-pagination-item, .ant-pagination-item a, [class*="pagination"] [title]'
    ));

    const numbers = pageItems
      .flatMap((el) => [el.getAttribute('title'), el.textContent])
      .map((value) => String(value || '').trim())
      .filter((value) => /^\d+$/.test(value))
      .map(Number)
      .filter(Number.isFinite);

    const pageSize = 12;
    const bodyText = document.body.innerText || '';
    const totalMatch = bodyText.match(/(?:of|total)\s+([\d,]+)\s+(?:results?|businesses?|records?|leads?)/i)
      || bodyText.match(/([\d,]+)\s+(?:results?|businesses?|records?|leads?)\s+(?:found|available)/i);
    const totalResults = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0;
    const totalPagesFromResults = totalResults > 0 ? Math.ceil(totalResults / pageSize) : 0;

    return Math.max(1, ...numbers, totalPagesFromResults);
  });
}

async function goToNextResultsPage(page) {
  const nextBtn = page.locator('.ant-pagination-next:not(.ant-pagination-disabled) button');
  const canGoNext = await nextBtn.isVisible().catch(() => false);

  if (!canGoNext) return false;

  await dismissModal(page);
  try {
    await nextBtn.click({ timeout: 8000 });
  } catch {
    return false;
  }

  await sleep(3000);
  return true;
}

async function advanceToPage(page, startPage, onProgress) {
  for (let current = 1; current < startPage; current += 1) {
    onProgress(`Skipping to selected start page ${startPage}: ${current + 1}/${startPage}`);
    const moved = await goToNextResultsPage(page);
    if (!moved) {
      throw new Error(`Could not reach selected start page ${startPage}. Pagination stopped at page ${current}.`);
    }
  }

  return startPage;
}

async function discoverLeadPages({ category, country, city }, onProgress = () => {}) {
  const { browser, page } = await createTargetronPage();

  try {
    await applySearchFilters(page, { category, country, city }, onProgress);

    const hasCards = await page.waitForSelector('.ant-space.card', { timeout: 15000 }).then(() => true).catch(() => false);
    if (!hasCards) {
      return { from: 0, to: 0, totalPages: 0 };
    }

    const totalPages = await getAvailablePageCount(page);
    onProgress(`Pages available: 1 to ${totalPages}`);
    return { from: 1, to: totalPages, totalPages };
  } finally {
    await browser.close();
  }
}

/**
 * Main scraping function
 * @param {object} params - { category, country, city, startPage, targetLeadCount }
 * @param {function} onProgress - callback for real-time progress messages
 * @returns {Array} leads - [{ name, address, status }, ...]
 */
async function scrapeLeads({ category, country, city, startPage = 1, targetLeadCount = DEFAULT_TARGET_LEAD_COUNT }, onProgress = () => {}) {
  const { browser, page } = await createTargetronPage();
  const leads = [];

  try {
    const safeStartPage = Math.max(1, Number.parseInt(startPage, 10) || 1);
    const safeTargetLeadCount = Math.max(1, Number.parseInt(targetLeadCount, 10) || DEFAULT_TARGET_LEAD_COUNT);

    await applySearchFilters(page, { category, country, city }, onProgress);

    const totalPages = await getAvailablePageCount(page);
    if (safeStartPage > totalPages) {
      throw new Error(`Start page ${safeStartPage} is outside the available range 1 to ${totalPages}.`);
    }

    onProgress(`Pages available: 1 to ${totalPages}. Starting from page ${safeStartPage}.`);
    let pageNum = await advanceToPage(page, safeStartPage, onProgress);

    // ── Paginate & Scrape ──
    while (pageNum <= totalPages && leads.length < safeTargetLeadCount) {
      onProgress(`Scraping page ${pageNum}...`);

      // Wait for at least one card
      try {
        await page.waitForSelector('.ant-space.card', { timeout: 15000 });
      } catch {
        onProgress('No cards found on this page — stopping.');
        break;
      }
      await sleep(1500);

      const pageLeads = await extractCardsFromPage(page);

      if (pageLeads.length === 0) {
        onProgress('No leads on this page — stopping.');
        break;
      }

      // ── Filter: keep only "Operational" profiles ──
      const operational = pageLeads.filter(l =>
        (l.status || '').toLowerCase().includes('operational')
      ).map(lead => ({
        ...lead,
        category: category || lead.category || '',
        search_category: category || lead.search_category || '',
      }));
      leads.push(...operational);
      onProgress(`Page ${pageNum}: ${pageLeads.length} scraped, ${operational.length} Operational kept (${leads.length} total)`);

      if (leads.length >= safeTargetLeadCount) {
        onProgress(`Lead target reached (${leads.length}/${safeTargetLeadCount}).`);
        break;
      }

      if (pageNum < totalPages) {
        onProgress(`Navigating to page ${pageNum + 1}...`);
        const moved = await goToNextResultsPage(page);
        if (!moved) {
          onProgress('⚠️ Pagination blocked (login wall). Returning leads collected so far.');
          break;
        }
        pageNum++;
      } else {
        break;
      }
    }

    onProgress(`✅ Search complete — ${leads.length} leads extracted.`);
    return leads;

  } catch (err) {
    onProgress(`❌ Error: ${err.message}`);
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeLeads, discoverLeadPages };
