/**
 * agent/fb_page_id_scraper.js
 *
 * Playwright agent that:
 *   1. Reads CRM leads from data/crm/<file>
 *   2. Deduplicates by facebook_url (multiple leads may share one page)
 *   3. For each unique Facebook URL:
 *      a. Navigates to the About/Page transparency section
 *      b. Extracts the visible Page transparency "Page ID"
 *      c. If enabled, falls back to embedded script/meta data
 *   4. Saves Page IDs back into the CRM file with --update-crm, or writes a
 *      data/emails/fb-page-ids-<timestamp>.json report when not updating CRM
 *
 * Usage:
 *   node agent/fb_page_id_scraper.js [--file <crm-filename>] [--all-crm] [--limit <n>] [--headless]
 *
 * Options:
 *   --file      CRM JSON filename inside data/crm/  (default: latest file)
 *   --all-crm   Read every JSON file in data/crm/
 *   --selected-indexes
 *               Comma-separated zero-based CRM row indexes to process
 *   --limit     Process at most N unique FB URLs    (default: all)
 *   --headless  Run browser headlessly              (default: false = visible)
 *   --output    Output filename in data/emails/     (default: auto-generated)
 *   --update-crm
 *               Save found IDs back into data/crm source file(s)
 *   --source-fallback
 *               Allow embedded script/meta fallback (default: false)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ─── Config ──────────────────────────────────────────────────────────────────

const DATA_DIR   = path.join(__dirname, '..', 'data');
const CRM_DIR    = path.join(DATA_DIR, 'crm');
const EMAILS_DIR = path.join(DATA_DIR, 'emails');

// User-provided class list for the login-popup close button
const FB_CLOSE_CLASSES =
  'x1ey2m1c xtijo5x x1o0tod xg01cxk x47corl x10l6tqk x13vifvy x1ebt8du x19991ni x1dhq9h x1iwo8zk x1033uif x179ill4 x1b60jn0'
    .trim().split(/\s+/);

const THROTTLE_MS  = Number(process.env.FB_THROTTLE_MS  || 2500);
const NAV_TIMEOUT  = Number(process.env.FB_NAV_TIMEOUT_MS || 30000);
const PAGE_TIMEOUT = Number(process.env.FB_PAGE_TIMEOUT_MS || 8000);

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    headless: false,
    limit: Infinity,
    file: null,
    output: null,
    allCrm: false,
    sourceFallback: false,
    selectedIndexes: [],
    updateCrm: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--headless')                    { args.headless = true; }
    else if (f === '--all-crm')                { args.allCrm = true; }
    else if (f === '--source-fallback')        { args.sourceFallback = true; }
    else if (f === '--update-crm')             { args.updateCrm = true; }
    else if (f === '--file'   && argv[i + 1]) { args.file   = argv[++i]; }
    else if (f === '--output' && argv[i + 1]) { args.output = argv[++i]; }
    else if (f === '--selected-indexes' && argv[i + 1]) { args.selectedIndexes = parseSelectedIndexes(argv[++i]); }
    else if (f === '--limit'  && argv[i + 1]) { args.limit  = parseInt(argv[++i], 10) || Infinity; }
  }
  return args;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function clean(v) { return String(v || '').trim(); }

function parseSelectedIndexes(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map(part => Number.parseInt(part.trim(), 10))
    .filter(index => Number.isInteger(index) && index >= 0))]
    .sort((a, b) => a - b);
}

function latestJsonIn(dir) {
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) throw new Error(`No JSON files in ${dir}`);
  return files[0].name;
}

function readJsonArray(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.leads)) return parsed.leads;
  throw new Error(`Expected array in ${filePath}`);
}

function readCrmFiles(fileNames) {
  const leads = [];
  for (const fileName of fileNames) {
    const crmPath = path.join(CRM_DIR, path.basename(fileName));
    if (!fs.existsSync(crmPath)) {
      throw new Error(`CRM file not found: ${crmPath}`);
    }
    const fileLeads = readJsonArray(crmPath);
    for (let index = 0; index < fileLeads.length; index++) {
      leads.push({ ...fileLeads[index], __crm_file: path.basename(fileName), __crm_index: index });
    }
  }
  return leads;
}

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function autoOutputName() {
  // Include full timestamp so each run gets a fresh file
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `fb-page-ids-${stamp}.json`;
}

function normalizeFacebookUrl(value) {
  const raw = clean(value);
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^m\./i, 'www.');
    if (!/^www\./i.test(parsed.hostname) && /(^|\.)facebook\.com$/i.test(parsed.hostname)) {
      parsed.hostname = `www.${parsed.hostname}`;
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function facebookUrlKey(value) {
  const normalized = normalizeFacebookUrl(value);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    parsed.protocol = 'https:';
    parsed.searchParams.sort();
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return normalized.replace(/\/+$/, '');
  }
}

function leadFacebookUrl(lead) {
  const nested = lead.social_profiles && typeof lead.social_profiles === 'object' ? lead.social_profiles : {};
  const socialLinks = Array.isArray(lead.social_links) ? lead.social_links : [];
  const candidates = [
    nested.facebook,
    nested.fb,
    lead.facebook_url,
    ...socialLinks,
  ].map(clean).filter(Boolean);

  return candidates.find(url => /(^|\/\/|\.)(facebook|fb)\.com/i.test(url)) || '';
}

function leadWebsite(lead) {
  return clean(
    lead.website_full ||
    lead.website ||
    lead.company_website ||
    lead.business_website ||
    ''
  );
}

// ─── Dedup: build a unique URL -> [lead names] map ───────────────────────────

function buildUniqueUrlMap(leads) {
  const map = new Map(); // url -> { lead (first), names: [], websites: [], crm_files: [], crm_refs: [] }
  for (const lead of leads) {
    const originalUrl = leadFacebookUrl(lead);
    const url = facebookUrlKey(originalUrl);
    const website = leadWebsite(lead);
    const ref = lead.__crm_file && Number.isInteger(lead.__crm_index)
      ? { file: lead.__crm_file, index: lead.__crm_index }
      : null;
    if (!url) continue;
    if (!map.has(url)) {
      map.set(url, {
        lead,
        names: [clean(lead.name || lead.business_name || 'Unknown')],
        websites: website ? [website] : [],
        crm_files: lead.__crm_file ? [lead.__crm_file] : [],
        crm_refs: ref ? [ref] : [],
      });
    } else {
      const entry = map.get(url);
      entry.names.push(clean(lead.name || lead.business_name || 'Unknown'));
      if (website && !entry.websites.includes(website)) entry.websites.push(website);
      if (lead.__crm_file && !entry.crm_files.includes(lead.__crm_file)) entry.crm_files.push(lead.__crm_file);
      if (ref && !entry.crm_refs.some(existing => existing.file === ref.file && existing.index === ref.index)) {
        entry.crm_refs.push(ref);
      }
    }
  }
  return map;
}

function applyFacebookPageIdsToLeads(leads, results, now = new Date().toISOString()) {
  let updated = 0;
  for (const result of results) {
    if (!result || result.status !== 'found' || !result.facebook_page_id) continue;
    const refs = Array.isArray(result.crm_refs) ? result.crm_refs : [];
    for (const ref of refs) {
      const index = Number(ref.index);
      if (!Number.isInteger(index) || index < 0 || index >= leads.length) continue;
      const lead = leads[index];
      lead.facebook_page_id = result.facebook_page_id;
      lead.facebook_page_id_source = result.extraction_source || '';
      lead.facebook_page_id_scraped_at = result.scraped_at || now;
      updated += 1;
    }
  }
  return updated;
}

function updateCrmFilesWithResults(results) {
  const byFile = new Map();
  for (const result of results) {
    for (const ref of Array.isArray(result.crm_refs) ? result.crm_refs : []) {
      if (!ref.file) continue;
      if (!byFile.has(ref.file)) byFile.set(ref.file, []);
      byFile.get(ref.file).push(result);
    }
  }

  let updated = 0;
  const files = [];
  for (const [fileName, fileResults] of byFile.entries()) {
    const crmPath = path.join(CRM_DIR, path.basename(fileName));
    const leads = readJsonArray(crmPath);
    const count = applyFacebookPageIdsToLeads(leads, fileResults);
    if (!count) continue;
    fs.writeFileSync(crmPath, JSON.stringify(leads, null, 2));
    updated += count;
    files.push(path.basename(fileName));
  }

  return { updated, files };
}

function facebookAboutUrls(fbUrl) {
  const normalized = normalizeFacebookUrl(fbUrl);
  if (!normalized) return [];

  try {
    const parsed = new URL(normalized);
    const parts = parsed.pathname.split('/').map(part => part.trim()).filter(Boolean);
    const lower = parts.map(part => part.toLowerCase());
    const urls = [];

    if (lower[0] === 'profile.php') {
      const id = parsed.searchParams.get('id');
      if (id) {
        urls.push(`https://www.facebook.com/profile.php?id=${encodeURIComponent(id)}&sk=about_profile_transparency`);
        urls.push(`https://www.facebook.com/profile.php?id=${encodeURIComponent(id)}&sk=about`);
      }
    } else if (lower[0] === 'people' && parts.length >= 2) {
      const personId = parts.find(part => /^\d{5,}$/.test(part));
      const peoplePath = personId
        ? `/people/${encodeURIComponent(parts[1])}/${encodeURIComponent(personId)}/`
        : `/${parts.map(encodeURIComponent).join('/')}/`;
      urls.push(`https://www.facebook.com${peoplePath}about_profile_transparency`);
      urls.push(`https://www.facebook.com${peoplePath}about`);
    } else {
      const slugParts = parts.filter(part => !['about', 'about_profile_transparency'].includes(part.toLowerCase()));
      const basePath = `/${slugParts.map(encodeURIComponent).join('/')}`.replace(/\/+$/, '');
      if (basePath && basePath !== '/') {
        urls.push(`https://www.facebook.com${basePath}/about_profile_transparency`);
        urls.push(`https://www.facebook.com${basePath}/about`);
      }
    }

    urls.push(normalized);
    return [...new Set(urls)];
  } catch {
    return [normalized.replace(/\/+$/, '') + '/about_profile_transparency', normalized.replace(/\/+$/, '') + '/about', normalized];
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractPageTransparencyPageIdFromText(text) {
  const raw = String(text || '');
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, ' ').trim();
  const patterns = [
    /Page transparency.{0,500}?\b(\d{7,})\b\s+Page ID\b/i,
    /\bPage ID\b[:\s-]*(\d{7,})\b/i,
    /\b(\d{7,})\b\s+\bPage ID\b/i,
  ];
  for (const re of patterns) {
    const match = compact.match(re);
    if (match) return match[1];
  }

  const lines = raw.split(/\r?\n/)
    .map(line => clean(line))
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (!/\bPage ID\b/i.test(lines[i])) continue;

    const sameLine = lines[i].match(/\bPage ID\b[:\s-]*(\d{7,})\b/i);
    if (sameLine) return sameLine[1];

    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      const before = lines[j].match(/\b(\d{7,})\b/);
      if (before) return before[1];
    }

    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 4); j++) {
      const after = lines[j].match(/\b(\d{7,})\b/);
      if (after) return after[1];
    }
  }

  return null;
}

async function clickTextIfVisible(page, text) {
  const exact = new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`, 'i');
  const locators = [
    page.getByRole('link', { name: exact }).first(),
    page.getByRole('button', { name: exact }).first(),
    page.getByText(exact).first(),
  ];

  for (const locator of locators) {
    try {
      if (await locator.isVisible({ timeout: 1000 })) {
        await locator.click({ timeout: 1500 });
        await sleep(900);
        return true;
      }
    } catch {}
  }
  return false;
}

async function extractVisibleTransparencyPageId(page) {
  return page.evaluate(() => document.body ? document.body.innerText : '')
    .then(extractPageTransparencyPageIdFromText)
    .catch(() => null);
}

// ─── Page ID extraction — Strategy A: raw HTML scripts (login-wall-safe) ──────

/**
 * Extract numeric Page ID purely from inline <script> tags and meta tags.
 * Facebook embeds the page entity data in JS bundles even when the login
 * wall overlay is active, so this works without needing to dismiss the popup
 * or navigate away.
 */
async function extractPageIdFromSource(page) {
  return page.evaluate(() => {
    // ── 1. fb:page_id meta tag ──────────────────────────────────────────────
    const metaFb = document.querySelector('meta[property="fb\\:page_id"]');
    if (metaFb && /^\d{5,}$/.test((metaFb.content || '').trim())) {
      return metaFb.content.trim();
    }

    // ── 2. Scan all inline scripts for known JSON key patterns ─────────────
    const patterns = [
      /"pageID"\s*:\s*"(\d{7,})"/,           // pageID (string)
      /"pageID"\s*:\s*(\d{7,})/,             // pageID (number)
      /"page_id"\s*:\s*"(\d{7,})"/,          // page_id (string)
      /"page_id"\s*:\s*(\d{7,})/,            // page_id (number)
      /"entity_id"\s*:\s*"(\d{7,})"/,        // entity_id (string)
      /"entity_id"\s*:\s*(\d{7,})/,          // entity_id (number)
      /"ownerID"\s*:\s*"(\d{7,})"/,          // ownerID
      /"ownerID"\s*:\s*(\d{7,})/,
      /"userID"\s*:\s*"(\d{7,})"/,           // userID on page context
      /"profile_id"\s*:\s*"(\d{7,})"/,
      /"profile_id"\s*:\s*(\d{7,})/,
      /\\"pageID\\":\\"(\d{7,})\\"/,         // escaped variants
      /\\"page_id\\":\\"(\d{7,})\\"/,
    ];

    const scripts = Array.from(document.querySelectorAll('script'));
    for (const s of scripts) {
      const text = s.textContent || '';
      if (!text.includes('"pageID"') &&
          !text.includes('"page_id"') &&
          !text.includes('"entity_id"') &&
          !text.includes('"ownerID"') &&
          !text.includes('"profile_id"')) continue;

      for (const re of patterns) {
        const m = text.match(re);
        if (m && m[1] && m[1].length >= 7) return m[1];
      }
    }

    // ── 3. og:url or canonical that contains /pages/name/<id> ─────────────
    const ogUrl = document.querySelector('meta[property="og\\:url"]');
    const ogContent = ogUrl && ogUrl.content;
    if (ogContent) {
      const m = ogContent.match(/\/pages\/[^/]+\/(\d{7,})/);
      if (m) return m[1];
    }

    // ── 4. Current URL ─────────────────────────────────────────────────────
    const m1 = location.href.match(/\/pages\/[^/]+\/(\d{7,})/);
    if (m1) return m1[1];
    const m2 = location.href.match(/[?&]id=(\d{7,})/);
    if (m2) return m2[1];

    return null;
  });
}

// ─── Strategy B: visible Page Transparency text from About ───────────────────

async function extractPageIdFromAbout(page, fbUrl) {
  for (const aboutUrl of facebookAboutUrls(fbUrl)) {
    try {
      console.log(`  ↳ Checking transparency: ${aboutUrl}`);
      await page.goto(aboutUrl, { timeout: NAV_TIMEOUT, waitUntil: 'domcontentloaded' });
      await sleep(1600);
      await dismissPopup(page);
      await sleep(600);
    } catch {
      continue;
    }

    let id = await extractVisibleTransparencyPageId(page);
    if (id) return { id, source: 'about_transparency' };

    await clickTextIfVisible(page, 'About');
    await clickTextIfVisible(page, 'Page transparency');
    id = await extractVisibleTransparencyPageId(page);
    if (id) return { id, source: 'about_transparency' };

    try { await page.evaluate(() => window.scrollBy(0, 900)); } catch {}
    await sleep(700);
    id = await extractVisibleTransparencyPageId(page);
    if (id) return { id, source: 'about_transparency' };
  }

  return null;
}

// ─── Popup dismissal ─────────────────────────────────────────────────────────

async function dismissPopup(page) {
  // Strategy 1: the user-provided class list
  try {
    const found = await page.evaluate((classes) => {
      const els = document.querySelectorAll('div[role="button"], button, [tabindex]');
      for (const el of els) {
        if (classes.every(c => el.classList.contains(c))) { el.click(); return true; }
      }
      return false;
    }, FB_CLOSE_CLASSES);
    if (found) { await sleep(600); return true; }
  } catch {}

  // Strategy 2: aria-label variations
  for (const label of ['Close', 'close', 'Not now', 'Not Now', 'Dismiss']) {
    try {
      const btn = page.locator(`[aria-label="${label}"]`).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click({ timeout: 1500 });
        await sleep(600);
        return true;
      }
    } catch {}
  }

  // Strategy 3: any dialog close button
  try {
    const btn = page.locator('[role="dialog"] [aria-label]').first();
    if (await btn.isVisible({ timeout: 1000 })) {
      await btn.click();
      await sleep(600);
      return true;
    }
  } catch {}

  return false;
}

// ─── Per-URL scrape ───────────────────────────────────────────────────────────

async function scrapeUrl(page, fbUrl, leadNames, options = {}) {
  const { crmFiles = [], crmRefs = [], websites = [], sourceFallback = false } = options;
  const primary = leadNames[0];
  const others  = leadNames.slice(1);

  console.log(`\n→ [${primary}]${others.length ? ` + ${others.length} more` : ''}`);
  console.log(`  URL: ${fbUrl}`);

  const base = {
    names: leadNames,
    website: websites[0] || '',
    websites,
    crm_files: crmFiles,
    crm_refs: crmRefs,
    facebook_url: fbUrl,
    facebook_page_id: null,
    extraction_source: null,
    status: 'pending',
    error: null,
    scraped_at: new Date().toISOString(),
  };

  try {
    // The visible Page transparency panel is the canonical target for this agent.
    const transparency = await extractPageIdFromAbout(page, fbUrl);
    if (transparency && transparency.id) {
      console.log(`  ✅ Page ID (from Page transparency): ${transparency.id}`);
      return {
        ...base,
        facebook_page_id: transparency.id,
        extraction_source: transparency.source,
        status: 'found',
      };
    }

    if (sourceFallback) {
      console.log('  ↳ Page transparency ID not visible; trying embedded source fallback');
      await page.goto(normalizeFacebookUrl(fbUrl), { timeout: NAV_TIMEOUT, waitUntil: 'domcontentloaded' });
      await sleep(1200);
      await dismissPopup(page);
      const pageId = await extractPageIdFromSource(page);
      if (pageId) {
        console.log(`  ✅ Page ID (from source fallback): ${pageId}`);
        return {
          ...base,
          facebook_page_id: pageId,
          extraction_source: 'source_fallback',
          status: 'found',
        };
      }
    }

    console.log('  ⚠ Page ID not found');
    return { ...base, status: 'not_found' };

  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return { ...base, status: 'error', error: err.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  const crmFileNames = args.allCrm
    ? fs.readdirSync(CRM_DIR).filter(file => file.endsWith('.json')).sort()
    : [args.file || latestJsonIn(CRM_DIR)];
  if (!crmFileNames.length) {
    console.error(`No CRM JSON files found in ${CRM_DIR}`);
    process.exit(1);
  }

  let allLeads = readCrmFiles(crmFileNames);
  if (!args.allCrm && args.selectedIndexes.length) {
    allLeads = args.selectedIndexes
      .filter(index => index < allLeads.length)
      .map(index => allLeads[index]);
  }

  // Build deduplicated URL map
  const urlMap   = buildUniqueUrlMap(allLeads);
  const urlEntries = [...urlMap.entries()]; // [ [url, {lead, names}], ... ]
  const limited  = Number.isFinite(args.limit) ? urlEntries.slice(0, args.limit) : urlEntries;

  console.log(`\n📋 CRM source      : ${args.allCrm ? `${crmFileNames.length} files` : path.basename(crmFileNames[0])}`);
  console.log(`☑️  Selected rows   : ${args.selectedIndexes.length ? args.selectedIndexes.length : 'all'}`);
  console.log(`📊 Total leads     : ${allLeads.length}`);
  console.log(`🔗 Unique FB URLs  : ${urlMap.size}`);
  console.log(`🎯 Processing      : ${limited.length} URLs\n`);
  console.log(`🔎 Source fallback : ${args.sourceFallback ? 'enabled' : 'disabled'}\n`);
  console.log(`📝 CRM update      : ${args.updateCrm ? 'enabled' : 'disabled'}\n`);

  // Output report — disabled when saving directly back to CRM.
  const outName = args.output || autoOutputName();
  const outPath = path.join(EMAILS_DIR, outName);
  if (!args.updateCrm) {
    ensureDir(EMAILS_DIR);
    console.log(`💾 Output          : ${outName}\n`);
  }

  // Launch browser
  const browser = await chromium.launch({
    headless: args.headless,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US',
    ],
  });

  const context = await browser.newContext({
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });

  // Stealth: mask webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT);

  const results = [];

  try {
    for (let i = 0; i < limited.length; i++) {
      const [fbUrl, { names, websites, crm_files, crm_refs }] = limited[i];
      const result = await scrapeUrl(page, fbUrl, names, {
        websites,
        crmFiles: crm_files,
        crmRefs: crm_refs,
        sourceFallback: args.sourceFallback,
      });
      results.push(result);

      if (!args.updateCrm) {
        // Save after every lead when generating a separate report file.
        fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
        console.log(`  💾 Saved (${results.length}/${limited.length}) → ${outName}`);
      }

      if (i < limited.length - 1 && THROTTLE_MS > 0) {
        console.log(`  ⏱  Waiting ${THROTTLE_MS}ms…`);
        await sleep(THROTTLE_MS);
      }
    }
  } finally {
    await browser.close();
  }

  const found    = results.filter(r => r.status === 'found').length;
  const notFound = results.filter(r => r.status === 'not_found').length;
  const errors   = results.filter(r => r.status === 'error').length;
  const crmUpdate = args.updateCrm ? updateCrmFilesWithResults(results) : { updated: 0, files: [] };

  console.log('\n═══════════════════════════════════════');
  console.log('✅ Done!');
  console.log(`   Found Page IDs : ${found}`);
  console.log(`   Not found      : ${notFound}`);
  console.log(`   Errors         : ${errors}`);
  if (args.updateCrm) {
    console.log(`   CRM rows updated : ${crmUpdate.updated}`);
    console.log(`   CRM files updated: ${crmUpdate.files.length ? crmUpdate.files.join(', ') : 'none'}`);
  } else {
    console.log(`   Output file    : ${outPath}`);
  }
  console.log('═══════════════════════════════════════\n');

  return { found, notFound, errors, outPath: args.updateCrm ? null : outPath, outName: args.updateCrm ? null : outName, crmUpdate };
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  __test: {
    buildUniqueUrlMap,
    applyFacebookPageIdsToLeads,
    extractPageTransparencyPageIdFromText,
    facebookAboutUrls,
    normalizeFacebookUrl,
    parseSelectedIndexes,
    parseArgs,
  },
};
