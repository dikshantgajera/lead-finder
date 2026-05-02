const { chromium } = require('playwright');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function interruptibleSleep(ms) {
  const end = Date.now() + ms;
  while (!shouldStop && Date.now() < end) {
    await sleep(Math.min(250, end - Date.now()));
  }
  return !shouldStop;
}

const SOCIAL_PLATFORMS = [
  { key: 'facebook',  label: 'Facebook',  hosts: ['facebook.com', 'fb.com'] },
  { key: 'instagram', label: 'Instagram', hosts: ['instagram.com'] },
  { key: 'linkedin',  label: 'LinkedIn',  hosts: ['linkedin.com'] },
  { key: 'x',         label: 'X',         hosts: ['x.com', 'twitter.com'] },
  { key: 'youtube',   label: 'YouTube',   hosts: ['youtube.com', 'youtu.be'] },
  { key: 'tiktok',    label: 'TikTok',    hosts: ['tiktok.com'] },
];

// ── Abort state ───────────────────────────────────────────────
let shouldStop = false;
let activeBrowser = null;
function stopEnrichment() {
  shouldStop = true;
  if (activeBrowser) activeBrowser.close().catch(() => {});
}
function resetStop() {
  shouldStop = false;
  activeBrowser = null;
}
function isStopped() { return shouldStop; }

// ── Prefix matching ───────────────────────────────────────────
function extractPrefix(masked) {
  if (!masked) return '';
  return masked.replace(/\*+.*$/, '').replace(/\*+$/, '').trim();
}

/** Returns true only if foundWebsite clearly starts with the unmasked prefix */
function websitePrefixMatch(maskedWebsite, foundWebsite) {
  if (!maskedWebsite || !foundWebsite) return false;
  const prefix = extractPrefix(maskedWebsite);
  if (prefix.length < 7) return false; // too short to be reliable
  const cleanPrefix = prefix.replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();
  const cleanFound  = foundWebsite.replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();
  return cleanFound.startsWith(cleanPrefix);
}

function cityFromLead(lead) {
  return (lead.address || '').split(',').map(s => s.trim()).filter(Boolean).join(' ');
}

function isUsableWebsite(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./i, '');
    return host.includes('.') && !platformForUrl(normalized);
  } catch {
    return false;
  }
}

function isBetterPhone(phone) {
  return String(phone || '').replace(/\D/g, '').length >= 8;
}

function phoneKey(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function phoneDedupeKey(phone) {
  let digits = phoneKey(phone);
  if (digits.startsWith('91') && digits.length > 6) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length > 5) digits = digits.slice(1);
  return digits.length >= 5 ? digits.slice(0, 5) : digits;
}

function uniquePhoneNumbers(...phones) {
  const seen = new Set();
  const out = [];
  for (const phone of phones.flat()) {
    const value = String(phone || '').replace(/\s+/g, ' ').trim();
    const digits = phoneKey(value);
    const key = phoneDedupeKey(value);
    if (!value || digits.length < 5 || key.length < 5 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function shouldAcceptFoundWebsite(leadWebsite, foundWebsite) {
  if (!foundWebsite || foundWebsite.includes('google.com') || platformForUrl(foundWebsite)) return false;
  if (!leadWebsite) return true;
  if (isUsableWebsite(leadWebsite)) return true;
  return websitePrefixMatch(leadWebsite, foundWebsite);
}

function emptySocialProfiles() {
  return SOCIAL_PLATFORMS.reduce((acc, p) => {
    acc[p.key] = '';
    return acc;
  }, {});
}

function normalizeUrl(raw, baseUrl = '') {
  if (!raw || typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value || /^(mailto|tel|sms|javascript):/i.test(value)) return '';

  try {
    const parsed = new URL(value, baseUrl || undefined);
    if (parsed.hostname.includes('google.') && parsed.pathname === '/url') {
      const q = parsed.searchParams.get('q') || parsed.searchParams.get('url') || parsed.searchParams.get('adurl') || parsed.searchParams.get('u');
      if (q) return normalizeUrl(q);
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function platformForUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    return SOCIAL_PLATFORMS.find(p =>
      p.hosts.some(domain => host === domain || host.endsWith(`.${domain}`))
    );
  } catch {
    return null;
  }
}

function isLikelyProfileUrl(url) {
  try {
    const parsed = new URL(url);
    const platform = platformForUrl(url);
    if (!platform) return false;

    const path = parsed.pathname.toLowerCase();
    const combined = `${parsed.hostname}${path}`;
    const blocked = [
      '/share', '/sharer', '/intent', '/plugins', '/dialog', '/login',
      '/signup', '/privacy', '/terms', '/policy', '/help', '/search',
      '/hashtag', '/explore', '/watch', '/embed', '/status/', '/share?'
    ];
    if (blocked.some(part => combined.includes(part))) return false;

    if (platform.key === 'linkedin') return path.includes('/company/') || path.includes('/school/') || path.includes('/in/');
    if (platform.key === 'youtube') return path.includes('/@') || path.includes('/channel/') || path.includes('/c/') || path.includes('/user/');
    if (platform.key === 'tiktok') return path.includes('/@');

    const slug = path.replace(/^\/+|\/+$/g, '').split('/')[0];
    return slug.length >= 2;
  } catch {
    return false;
  }
}

function mergeSocialProfiles(...profiles) {
  const merged = emptySocialProfiles();
  for (const profile of profiles) {
    for (const platform of SOCIAL_PLATFORMS) {
      if (!merged[platform.key] && profile && profile[platform.key]) {
        merged[platform.key] = profile[platform.key];
      }
    }
  }
  return merged;
}

function flattenSocialProfiles(profile) {
  return SOCIAL_PLATFORMS
    .map(platform => profile && profile[platform.key] ? profile[platform.key] : '')
    .filter(Boolean);
}

async function socialProfilesFromCurrentPage(page, baseUrl = '') {
  const hrefs = await page.$$eval('a, [role="link"]', links =>
    links.flatMap(a => [
      a.href,
      a.getAttribute('href'),
      a.getAttribute('data-url'),
      a.getAttribute('data-href'),
      a.getAttribute('data-rw')
    ].filter(Boolean))
  ).catch(() => []);

  const profiles = emptySocialProfiles();
  for (const raw of hrefs) {
    const url = normalizeUrl(raw, baseUrl);
    if (!url || !isLikelyProfileUrl(url)) continue;
    const platform = platformForUrl(url);
    if (platform && !profiles[platform.key]) profiles[platform.key] = url;
  }
  return profiles;
}

async function visibleTextAfterLabel(page, label) {
  return page.evaluate(labelText => {
    const stops = /^(located in|address|phone|hours|suggest an edit|own this business|profiles|from |reviews|website|directions|save|share|call)\b/i;
    const lines = (document.body.innerText || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const labelPrefix = `${labelText.toLowerCase()}:`;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.toLowerCase().startsWith(labelPrefix)) continue;

      const parts = [line.slice(labelPrefix.length).trim()];
      for (let j = i + 1; j < lines.length; j += 1) {
        if (stops.test(lines[j])) break;
        parts.push(lines[j]);
        if (parts.join(' ').length > 180) break;
      }
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    }
    return '';
  }, label).catch(() => '');
}

async function firstHrefFromSelectors(page, selectors) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      const href = await el.evaluate(node => {
        const link = node.closest('a') || node.querySelector?.('a');
        return node.href || node.getAttribute('href') || link?.href || link?.getAttribute('href') || '';
      }).catch(() => '');
      const normalized = normalizeUrl(href);
      if (normalized) return normalized;
    }
  }
  return '';
}

async function textFromSelectors(page, selectors, label = '') {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      const text = await el.evaluate((node, labelText) => {
        const aria = node.getAttribute('aria-label') || '';
        const raw = aria || node.innerText || node.textContent || '';
        const cleaned = raw.replace(/\s+/g, ' ').trim();
        if (!labelText) return cleaned;
        return cleaned.replace(new RegExp(`^${labelText}:\\s*`, 'i'), '').trim();
      }, label).catch(() => '');
      if (text) return text;
    }
  }
  return '';
}

async function fromGoogleSearchProfile(page, lead, onProgress) {
  const result = { website: '', address: '', phone: '', source: 'google_search_profile', social_profiles: emptySocialProfiles() };
  try {
    if (isStopped()) return result;
    const query = `${lead.name || ''} ${cityFromLead(lead)}`.trim();
    if (!query) return result;
    onProgress(`    🔎 Google business panel: "${query}"`);

    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded', timeout: 30000 });
    if (await isGoogleBlockedPage(page)) {
      onProgress('    ⛔ Google blocked the business panel request with an unusual-traffic page');
      return result;
    }
    if (!(await interruptibleSleep(1800))) return result;

    const website = await firstHrefFromSelectors(page, [
      'a[data-dtype="d_lg"]',
      'div[data-attrid="visit_official_website"] a',
      'a[aria-label*="Website"]',
      'a:has-text("Website")',
    ]);
    if (shouldAcceptFoundWebsite(lead.website, website)) result.website = website;

    result.address = await visibleTextAfterLabel(page, 'Address');
    result.phone = await visibleTextAfterLabel(page, 'Phone');
    result.social_profiles = await socialProfilesFromCurrentPage(page);

    const socialCount = flattenSocialProfiles(result.social_profiles).length;
    if (result.website) onProgress(`    ✅ Website (Google panel): ${result.website}`);
    if (result.address) onProgress(`    ✅ Address (Google panel): ${result.address}`);
    if (result.phone) onProgress(`    📞 Phone (Google panel): ${result.phone}`);
    if (socialCount) onProgress(`    ✅ Social profiles (Google panel): ${socialCount} found`);
  } catch (err) {
    onProgress(`    ❌ Google panel error: ${err.message}`);
  }
  return result;
}

async function socialProfilesFromWebsite(page, website, onProgress) {
  const profiles = emptySocialProfiles();
  if (isStopped()) return profiles;
  const url = normalizeUrl(website);
  if (!url) return profiles;
  if (isLikelyProfileUrl(url)) {
    const platform = platformForUrl(url);
    if (platform) profiles[platform.key] = url;
  }

  try {
    if (isStopped()) return profiles;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (!(await interruptibleSleep(1500))) return profiles;
    const found = await socialProfilesFromCurrentPage(page, url);
    const merged = mergeSocialProfiles(profiles, found);
    const count = flattenSocialProfiles(merged).length;
    if (count) onProgress(`    ✅ Social profiles (website): ${count} found`);
    return merged;
  } catch (err) {
    onProgress(`    ⚠️  Social profile scan skipped: ${err.message}`);
    return profiles;
  }
}

function socialFields(profile) {
  return {
    facebook_url:  profile.facebook  || '',
    instagram_url: profile.instagram || '',
    linkedin_url:  profile.linkedin  || '',
    x_url:         profile.x         || '',
    youtube_url:   profile.youtube   || '',
    tiktok_url:    profile.tiktok    || '',
    social_links:  flattenSocialProfiles(profile),
  };
}

async function isGoogleBlockedPage(page) {
  if (/google\.[^/]+\/sorry\//i.test(page.url())) return true;
  const text = await page.evaluate(() => document.body.innerText || '').catch(() => '');
  return /unusual traffic|not a robot/i.test(text);
}

// ── Google Maps extractor (PRIMARY) ──────────────────────────
async function fromGoogleMaps(page, lead, onProgress) {
  const result = { website:'', address:'', phone:'', source:'google_maps', social_profiles: emptySocialProfiles() };
  try {
    if (isStopped()) return result;
    const city  = cityFromLead(lead);
    const query = encodeURIComponent(`${lead.name} ${city}`);

    await page.goto(`https://www.google.com/maps/search/${query}`, {
      waitUntil:'domcontentloaded', timeout:30000 });
    if (await isGoogleBlockedPage(page)) {
      onProgress('    ⛔ Google blocked the Maps request with an unusual-traffic page');
      return result;
    }
    if (!(await interruptibleSleep(1500))) return result;
    await page.waitForSelector(
      '[data-item-id="authority"], [data-item-id="address"], [data-item-id^="phone"], [role="feed"]',
      { timeout: 8000 }
    ).catch(() => {});

    // Click first result only when Maps shows a results feed instead of a business detail panel.
    const hasDetailPanel = await page.locator('[data-item-id="authority"], [data-item-id="address"], [data-item-id^="phone"]').count().catch(() => 0);
    const firstCard = page.locator('[role="feed"] a, [role="feed"] .Nv2PK').first();
    if (!hasDetailPanel && await firstCard.isVisible().catch(()=>false)) {
      if (isStopped()) return result;
      await firstCard.click();
      if (!(await interruptibleSleep(1500))) return result;
      await page.waitForSelector(
        '[data-item-id="authority"], [data-item-id="address"], [data-item-id^="phone"]',
        { timeout: 8000 }
      ).catch(() => {});
    }

    // Website — Maps button
    result.website = await firstHrefFromSelectors(page, [
      'a[data-item-id="authority"]',
      'a[aria-label*="Website"]',
      'a[aria-label*="ebsite"]',
      'a:has-text("Website")',
    ]);
    if (!shouldAcceptFoundWebsite(lead.website, result.website)) result.website = '';

    // Address
    result.address = await textFromSelectors(page, [
      '[data-item-id="address"]',
      '[aria-label^="Address:"]',
      '[data-item-id="address"] .fontBodyMedium',
      'button[aria-label*="ddress"] .fontBodyMedium',
      'div[aria-label*="ddress"]',
    ], 'Address');

    // Phone
    result.phone = await textFromSelectors(page, [
      '[data-item-id^="phone"]',
      '[aria-label^="Phone:"]',
      '[data-item-id^="phone"] .fontBodyMedium',
      'button[aria-label*="hone"] .fontBodyMedium',
      'a[href^="tel:"]',
    ], 'Phone');
    if (result.phone.startsWith('tel:')) result.phone = result.phone.slice(4);

    if (result.website) onProgress(`    ✅ Website (Maps): ${result.website}`);
    else                onProgress(`    ⚠️  No website in Maps profile`);
    if (result.address) onProgress(`    ✅ Address (Maps): ${result.address}`);
    if (result.phone)   onProgress(`    📞 Phone (Maps): ${result.phone}`);

    result.social_profiles = await socialProfilesFromCurrentPage(page);
    const socialCount = flattenSocialProfiles(result.social_profiles).length;
    if (socialCount) onProgress(`    ✅ Social profiles (Maps): ${socialCount} found`);

  } catch (err) {
    onProgress(`    ❌ Maps error: ${err.message}`);
  }
  return result;
}

// ── Google Search (FALLBACK — website only, strict prefix) ────
async function websiteFromGoogleSearch(page, lead, onProgress) {
  try {
    if (isStopped()) return '';
    const city  = cityFromLead(lead);
    const query = `${lead.name} ${city}`;
    onProgress(`    🔎 Google Search: "${query}"`);

    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
      waitUntil:'domcontentloaded', timeout:30000 });
    if (await isGoogleBlockedPage(page)) {
      onProgress('    ⛔ Google blocked the Search fallback with an unusual-traffic page');
      return '';
    }
    if (!(await interruptibleSleep(1500))) return '';

    // Try Knowledge Panel website first
    const kpSelectors = ['a[data-dtype="d_lg"]','div[data-attrid="visit_official_website"] a'];
    for (const sel of kpSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(()=>false)) {
        const href = await el.getAttribute('href').catch(()=>'');
        const normalized = normalizeUrl(href);
        if (normalized && !normalized.includes('google.com')) {
          if (shouldAcceptFoundWebsite(lead.website, normalized)) {
            onProgress(`    ✅ Website (Search KP): ${normalized}`);
            return normalized;
          } else {
            onProgress(`    ⛔ Website prefix mismatch — skipping`);
            return '';
          }
        }
      }
    }

    // Try organic results with prefix check
    const SKIP = ['google.com','facebook.com','yelp.com','instagram.com',
                  'twitter.com','linkedin.com','yellowpages.com','bbb.org'];
    const links = page.locator('#search .g a[href^="http"]');
    const count = await links.count().catch(()=>0);
    for (let i = 0; i < Math.min(count, 5); i++) {
      const href = await links.nth(i).getAttribute('href').catch(()=>'');
      const normalized = normalizeUrl(href);
      if (!normalized || SKIP.some(s=>normalized.includes(s))) continue;
      if (shouldAcceptFoundWebsite(lead.website, normalized)) {
        onProgress(`    ✅ Website (organic): ${normalized}`);
        return normalized;
      }
    }
    onProgress(`    ⛔ No website found via Google Search (prefix required)`);
  } catch (err) {
    onProgress(`    ❌ Search error: ${err.message}`);
  }
  return '';
}

// ── Enrich one lead ───────────────────────────────────────────
async function enrichOne(page, lead, onProgress) {
  const out = {
    ...lead,
    website_full:  isUsableWebsite(lead.website) ? lead.website : '',
    address_full:  lead.address || '',
    phone_full:    lead.phone   || '',
    phone_original: lead.phone || '',
    phone_google_maps: '',
    phone_google_profile: '',
    phone_numbers: uniquePhoneNumbers(lead.phone),
    confidence:    0,
    match_source:  'none',
    social_profiles: emptySocialProfiles(),
    facebook_url:  '',
    instagram_url: '',
    linkedin_url:  '',
    x_url:         '',
    youtube_url:   '',
    tiktok_url:    '',
    social_links:  [],
    enriched:      true,
  };

  // Step 1 — Google Maps (primary)
  if (isStopped()) return out;
  const maps = await fromGoogleMaps(page, lead, onProgress);
  if (isStopped()) return out;

  if (maps.website) {
    out.website_full = maps.website;
    out.match_source = 'google_maps';
    out.confidence   = 85;
  }
  if (maps.address) { out.address_full = maps.address; }
  if (maps.phone) {
    out.phone_full = maps.phone;
    out.phone_google_maps = maps.phone;
  }

  // Step 2 — Google Search business panel fills missing old fields and social profiles.
  const needsGooglePanel =
    !out.website_full ||
    !maps.address ||
    !isBetterPhone(out.phone_full) ||
    flattenSocialProfiles(maps.social_profiles).length === 0;
  const googlePanel = needsGooglePanel
    ? await fromGoogleSearchProfile(page, lead, onProgress)
    : { website: '', address: '', phone: '', social_profiles: emptySocialProfiles() };
  if (isStopped()) return out;

  if (!out.website_full && googlePanel.website) {
    out.website_full = googlePanel.website;
    out.match_source = 'google_search_profile';
    out.confidence   = Math.max(out.confidence, 70);
  }
  if (!maps.address && googlePanel.address) out.address_full = googlePanel.address;
  if (googlePanel.phone) {
    out.phone_google_profile = googlePanel.phone;
    if (!isBetterPhone(out.phone_full)) out.phone_full = googlePanel.phone;
  }

  // Step 3 — legacy organic fallback if the business panel did not expose a website.
  if (!out.website_full && lead.website) {
    const found = await websiteFromGoogleSearch(page, lead, onProgress);
    if (isStopped()) return out;
    if (found) {
      out.website_full = found;
      out.match_source = 'google_search';
      out.confidence   = Math.max(out.confidence, 65);
    } else {
      out.website_full = '';
      out.confidence   = maps.address || googlePanel.address ? Math.max(out.confidence, 50) : 10;
    }
  }

  const websiteSocial = out.website_full && !out.website_full.includes('*')
    ? await socialProfilesFromWebsite(page, out.website_full, onProgress)
    : emptySocialProfiles();
  if (isStopped()) return out;
  out.phone_numbers = uniquePhoneNumbers(
    out.phone_google_maps,
    out.phone_google_profile,
    out.phone_full,
    out.phone_original,
    lead.phone_numbers || []
  );
  out.social_profiles = mergeSocialProfiles(maps.social_profiles, googlePanel.social_profiles, websiteSocial);
  Object.assign(out, socialFields(out.social_profiles));

  return out;
}

// ── Main export ───────────────────────────────────────────────
async function enrichLeadsWithProgress(leads, onProgress, onLeadDone) {
  resetStop();
  shouldStop = false;

  // Filter: operational only
  const operational = leads.filter(l =>
    (l.status||'').toLowerCase().includes('operational') ||
    (l.status||'').toLowerCase() === 'open'
  );

  onProgress(`🔍 Enriching ${operational.length} operational leads (${leads.length - operational.length} skipped — not operational)`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  activeBrowser = browser;

  // Build output: non-operational leads pass through unchanged
  const results = leads.map(l => ({ ...l, enriched: false, match_source: 'skipped' }));

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport:  { width: 1400, height: 900 },
    });
    const page = await context.newPage();

    for (let i = 0; i < operational.length; i++) {
      if (shouldStop) {
        onProgress(`⛔ Stopped by user after ${i} leads.`);
        break;
      }

      const lead = operational[i];
      const idx  = leads.findIndex(l => l.name === lead.name && l.address === lead.address);

      onProgress(`\n[${i + 1}/${operational.length}] "${lead.name}"`);

      try {
        const enriched = await enrichOne(page, lead, onProgress);
        if (shouldStop) {
          onProgress(`⛔ Stopped by user while processing "${lead.name}".`);
          break;
        }
        results[idx] = enriched;
        onLeadDone(enriched);
      } catch (err) {
        if (shouldStop) {
          onProgress(`⛔ Stopped by user while processing "${lead.name}".`);
          break;
        }
        onProgress(`  ❌ Fatal error: ${err.message}`);
        results[idx] = { ...lead, enriched: false, match_source: 'error' };
      }

      // 10-second polite delay (unless last lead or stopped)
      if (i < operational.length - 1 && !shouldStop) {
        onProgress(`  ⏱ Waiting 10s before next lead…`);
        await interruptibleSleep(10000);
      }
    }
  } finally {
    activeBrowser = null;
    await browser.close().catch(() => {});
  }

  return results;
}

module.exports = { enrichLeadsWithProgress, stopEnrichment };
