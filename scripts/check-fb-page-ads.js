#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CRM_DIR = path.join(ROOT, 'data', 'crm');
const FINAL_LIST_DIR = path.join(ROOT, 'data', 'final-list');
const DEFAULT_THROTTLE_MS = Number(process.env.FB_AD_CHECKER_THROTTLE_MS || 3000);

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function firstValue(...values) {
  return values.map(clean).find(Boolean) || '';
}

function parseArgs(argv) {
  const args = {
    country: 'ALL',
    sourceFile: '',
    outputFile: '',
    limit: 0,
    selectedIndexes: null,
    headless: true,
    browserChannel: process.env.FB_AD_CHECKER_BROWSER_CHANNEL || 'chrome',
    dryRun: false,
    throttleMs: DEFAULT_THROTTLE_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--country') args.country = argv[++i] || args.country;
    else if (arg === '--source') args.sourceFile = argv[++i] || '';
    else if (arg === '--output') args.outputFile = argv[++i] || '';
    else if (arg === '--limit') args.limit = Number(argv[++i] || 0) || 0;
    else if (arg === '--selected-indexes') {
      args.selectedIndexes = String(argv[++i] || '')
        .split(',')
        .map(value => Number(value.trim()))
        .filter(Number.isInteger);
    }
    else if (arg === '--throttle-ms') args.throttleMs = Number(argv[++i] || 0) || 0;
    else if (arg === '--headed') args.headless = false;
    else if (arg === '--browser-channel') args.browserChannel = argv[++i] || args.browserChannel;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  args.country = clean(args.country || 'ALL').toUpperCase();
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/check-fb-page-ads.js [options]

Options:
  --source <file>       CRM JSON filename from data/crm. Defaults to newest file.
  --country <code>      Ads Library country code. Defaults to ALL.
  --output <file>       Output JSON filename/path. Defaults to data/final-list/fb-ad-status-...
  --selected-indexes    Comma-separated CRM row indexes to check.
  --limit <number>      Check only the first N CRM rows that have facebook_page_id.
  --throttle-ms <ms>    Delay between unique Page ID checks. Defaults to 3000.
  --headed              Run Chrome visibly instead of headless.
  --browser-channel     Playwright browser channel. Defaults to chrome.
  --dry-run             Print records without writing the output file.
`);
}

function latestJsonFile(dir) {
  const files = fs.readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const fullPath = path.join(dir, file);
      return { file, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.file || '';
}

function readJsonArray(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.leads)) return parsed.leads;
  throw new Error('CRM file must contain an array or { leads: [] }');
}

function getFacebookUrl(lead) {
  const nested = lead.social_profiles && typeof lead.social_profiles === 'object' ? lead.social_profiles : {};
  const links = [
    lead.facebook_url,
    nested.facebook,
    ...(Array.isArray(lead.social_links) ? lead.social_links : []),
  ].map(clean).filter(Boolean);
  return links.find(url => /(^|\/\/|\.)(facebook|fb)\.com/i.test(url)) || '';
}

function buildAdsLibraryUrl(id, country = 'ALL') {
  const searchUrl = new URL('https://www.facebook.com/ads/library/');
  searchUrl.searchParams.set('active_status', 'active');
  searchUrl.searchParams.set('ad_type', 'all');
  searchUrl.searchParams.set('country', country);
  searchUrl.searchParams.set('is_targeted_country', 'false');
  searchUrl.searchParams.set('media_type', 'all');
  searchUrl.searchParams.set('search_type', 'page');
  searchUrl.searchParams.set('sort_data[direction]', 'desc');
  searchUrl.searchParams.set('sort_data[mode]', 'total_impressions');
  searchUrl.searchParams.set('view_all_page_id', id);
  return searchUrl.toString();
}

function parseCount(value) {
  const number = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function parseAdsLibraryContent(content) {
  const text = clean(content);
  const libraryIds = [...text.matchAll(/\bLibrary ID:\s*([0-9]+)/gi)].map(match => match[1]);
  const resultsMatch = text.match(/(?:~|about\s+)?([0-9][0-9,]*)\s+results?\b/i);
  const noResults = /\b(no results|0 results|there are no ads|couldn't find any ads|we couldn't find)/i.test(text);
  const resultCount = resultsMatch ? parseCount(resultsMatch[1]) : 0;

  if (libraryIds.length > 0 || resultCount > 0) {
    return {
      ads_status: 'running_ads',
      running_ads: true,
      ads_found_count: resultCount || libraryIds.length,
      evidence: {
        result_label: resultsMatch ? resultsMatch[0] : '',
        library_ids_sample: libraryIds.slice(0, 5),
      },
    };
  }

  if (noResults) {
    return {
      ads_status: 'not_running_ads',
      running_ads: false,
      ads_found_count: 0,
      evidence: {
        result_label: resultsMatch ? resultsMatch[0] : 'No results',
        library_ids_sample: [],
      },
    };
  }

  return {
    ads_status: 'not_running_ads',
    running_ads: false,
    ads_found_count: 0,
    evidence: {
      result_label: 'No active ads detected',
      library_ids_sample: [],
    },
    warning: 'No active ad result count or Library ID was detected on the Ads Library page.',
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function leadRecordBase(lead, sourceFile, index, country, checkedAt) {
  return {
    source_file: sourceFile,
    source_index: index,
    name: firstValue(lead.name, lead.company, lead.business_name, 'Unknown Company'),
    phone: firstValue(lead.phone_full, lead.phone_google_maps, lead.phone_google_profile, lead.phone_original, lead.phone),
    full_address: firstValue(lead.address_full, lead.full_address, lead.address),
    website: firstValue(lead.website_full, lead.website),
    facebook_url: getFacebookUrl(lead),
    facebook_page_id: clean(lead.facebook_page_id),
    country,
    checked_at: checkedAt,
  };
}

function formatOutputRecord(base, status) {
  return {
    company: {
      name: base.name,
      phone: base.phone,
      full_address: base.full_address,
      website: base.website,
      facebook_url: base.facebook_url,
      facebook_page_id: base.facebook_page_id,
      ads_status: status.ads_status,
      running_ads: status.running_ads,
      ads_found_count: status.ads_found_count,
      ads_library_url: base.ads_library_url,
      country: base.country,
    },
    competitors: [],
    source_file: base.source_file,
    source_index: base.source_index,
    checked_at: base.checked_at,
    reason: status.ads_status,
    ads_status: status.ads_status,
    running_ads: status.running_ads,
    ads_found_count: status.ads_found_count,
    ads_library_url: base.ads_library_url,
    facebook_page_id: base.facebook_page_id,
    country: base.country,
    ...(status.evidence ? { evidence: status.evidence } : {}),
    ...(status.warning ? { warnings: [status.warning] } : {}),
    ...(status.error ? { error: status.error, warnings: [status.error] } : {}),
  };
}

function statusFromRecord(record) {
  return {
    ads_status: record.ads_status,
    running_ads: record.running_ads,
    ads_found_count: record.ads_found_count,
    ...(record.evidence ? { evidence: record.evidence } : {}),
    ...(record.error ? { error: record.error } : {}),
    ...(Array.isArray(record.warnings) && record.warnings[0] ? { warning: record.warnings[0] } : {}),
  };
}

async function checkLead(lead, sourceFile, index, country, options = {}) {
  const checkedAt = new Date().toISOString();
  const id = clean(lead.facebook_page_id);
  const url = buildAdsLibraryUrl(id, country);
  const base = {
    ...leadRecordBase(lead, sourceFile, index, country, checkedAt),
    ads_library_url: url,
  };
  let page = null;

  try {
    if (!options.browser) throw new Error('Playwright browser is not available.');
    page = await options.browser.newPage({ viewport: { width: 1365, height: 900 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.navigationTimeoutMs || 45000 });
    await page.waitForTimeout(options.pageSettleMs || 8000);
    const content = await page.locator('body').innerText({ timeout: options.contentTimeoutMs || 15000 });
    return formatOutputRecord(base, parseAdsLibraryContent(content || ''));
  } catch (error) {
    return formatOutputRecord(base, {
      ads_status: 'unknown',
      running_ads: null,
      ads_found_count: 0,
      error: error.message,
    });
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function run(options) {
  const sourceFile = options.sourceFile || latestJsonFile(CRM_DIR);
  if (!sourceFile) throw new Error('No CRM JSON file found in data/crm');

  const sourcePath = path.join(CRM_DIR, path.basename(sourceFile));
  const leads = readJsonArray(sourcePath);
  const requestedIndexes = Array.isArray(options.selectedIndexes)
    ? new Set(options.selectedIndexes.filter(index => Number.isInteger(index) && index >= 0 && index < leads.length))
    : null;
  let rows = leads
    .map((lead, index) => ({ lead, index }))
    .filter(item => !requestedIndexes || requestedIndexes.has(item.index))
    .filter(item => clean(item.lead?.facebook_page_id));

  if (options.limit > 0) rows = rows.slice(0, options.limit);

  const scopeCount = requestedIndexes ? requestedIndexes.size : leads.length;
  const skippedLeads = leads
    .map((lead, index) => ({ lead, index }))
    .filter(item => !requestedIndexes || requestedIndexes.has(item.index))
    .filter(item => !clean(item.lead?.facebook_page_id))
    .map(item => ({
      index: item.index,
      name: firstValue(item.lead.name, item.lead.company, item.lead.business_name, `Lead ${item.index + 1}`),
      skipped_reason: 'missing_facebook_page_id',
    }));

  const results = [];
  const progressMessages = [];
  const statusByPageId = new Map();
  let browser = null;
  if (rows.length > 0) {
    browser = await chromium.launch({
      channel: options.browserChannel || process.env.FB_AD_CHECKER_BROWSER_CHANNEL || 'chrome',
      headless: options.headless !== false,
    });
  }

  try {
    for (let i = 0; i < rows.length; i += 1) {
      const { lead, index } = rows[i];
      const name = firstValue(lead.name, lead.company, lead.business_name, `Lead ${index + 1}`);
      const pageId = clean(lead.facebook_page_id);
      let checkedUniquePageId = false;
      if (statusByPageId.has(pageId)) {
        const base = {
          ...leadRecordBase(lead, path.basename(sourceFile), index, options.country, new Date().toISOString()),
          ads_library_url: buildAdsLibraryUrl(pageId, options.country),
        };
        const message = `[${i + 1}/${rows.length}] Reusing ${pageId} result for ${name}`;
        console.log(message);
        if (typeof options.onProgress === 'function') await options.onProgress(message);
        progressMessages.push(`Reused ${pageId} ad status for ${name}`);
        results.push(formatOutputRecord(base, statusByPageId.get(pageId)));
      } else {
        const message = `[${i + 1}/${rows.length}] Checking ${name} (${pageId}) in ${options.country}`;
        console.log(message);
        if (typeof options.onProgress === 'function') await options.onProgress(message);
        const result = await checkLead(lead, path.basename(sourceFile), index, options.country, {
          browser,
        });
        statusByPageId.set(pageId, statusFromRecord(result));
        checkedUniquePageId = true;
        progressMessages.push(`Checked ${name} (${pageId}) in ${options.country}`);
        results.push(result);
      }
      if (checkedUniquePageId && options.throttleMs > 0 && i < rows.length - 1) {
        const waitMessage = `Waiting ${options.throttleMs}ms before the next Ads Library check`;
        if (typeof options.onProgress === 'function') await options.onProgress(waitMessage);
        await sleep(options.throttleMs);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const outputFile = options.outputFile || path.join(
    FINAL_LIST_DIR,
    `fb-ad-status-${path.basename(sourceFile, '.json')}-${options.country.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  const outputPath = path.isAbsolute(outputFile) ? outputFile : path.join(ROOT, outputFile);

  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  }

  return {
    success: true,
    sourceFile: path.basename(sourceFile),
    outputPath,
    checked: results.length,
    uniquePageIdsChecked: statusByPageId.size,
    skipped: Math.max(0, scopeCount - results.length),
    saved: results.length,
    runningAds: results.filter(item => item.ads_status === 'running_ads').length,
    notRunningAds: results.filter(item => item.ads_status === 'not_running_ads').length,
    unknown: results.filter(item => item.ads_status === 'unknown').length,
    warnings: results.flatMap(item => item.warnings || []),
    failedLeads: results
      .filter(item => item.ads_status === 'unknown')
      .map(item => ({
        index: item.source_index,
        name: item.company?.name || `Lead ${Number(item.source_index) + 1}`,
        reason: item.error || (item.warnings || []).join('; ') || 'Unknown ad status',
      })),
    skippedLeads,
    progressMessages,
    results,
  };
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2)))
    .then(summary => {
      console.log(JSON.stringify({
        sourceFile: summary.sourceFile,
        outputPath: summary.outputPath,
        checked: summary.checked,
        skipped: summary.skipped,
        saved: summary.saved,
        runningAds: summary.runningAds,
        notRunningAds: summary.notRunningAds,
        unknown: summary.unknown,
      }, null, 2));
    })
    .catch(error => {
      console.error(error.message);
      process.exit(1);
    });
}

module.exports = {
  buildAdsLibraryUrl,
  parseAdsLibraryContent,
  run,
};
