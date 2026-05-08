const fs = require('fs');
const path = require('path');

const DEFAULT_THROTTLE_MS = Number(process.env.META_ADS_THROTTLE_MS || 750);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function firstValue(...values) {
  return values.map(clean).find(Boolean) || '';
}

function getSocialLinks(lead) {
  const nested = lead.social_profiles && typeof lead.social_profiles === 'object' ? lead.social_profiles : {};
  const list = Array.isArray(lead.social_links) ? lead.social_links : [];
  const links = [
    lead.facebook_url,
    lead.instagram_url,
    nested.facebook,
    nested.instagram,
    ...list,
  ].filter(Boolean);

  let facebook_url = '';
  let instagram_url = '';
  for (const value of links) {
    const url = clean(value);
    if (!facebook_url && /(^|\/\/|\.)(facebook|fb)\.com/i.test(url)) facebook_url = url;
    if (!instagram_url && /(^|\/\/|\.)instagram\.com/i.test(url)) instagram_url = url;
  }
  return { facebook_url, instagram_url };
}

function extractFacebookIdentity(url) {
  if (!url) return {};
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (host !== 'facebook.com' && host !== 'fb.com' && !host.endsWith('.facebook.com')) return {};
    const id = parsed.searchParams.get('id') || '';
    const parts = parsed.pathname.split('/').map(part => part.trim()).filter(Boolean);
    const lower = parts.map(part => part.toLowerCase());
    if (lower[0] === 'profile.php') return id ? { pageId: id } : {};
    if (lower[0] === 'pages' && parts.length >= 2) {
      const pageId = parts.find(part => /^\d{5,}$/.test(part)) || id;
      return { facebookPageSlug: parts[1], ...(pageId ? { pageId } : {}) };
    }
    if (parts[0] && !['groups', 'events', 'marketplace', 'people', 'share', 'sharer'].includes(lower[0])) {
      return { facebookPageSlug: parts[0], ...(id ? { pageId: id } : {}) };
    }
  } catch {}
  return {};
}

function extractInstagramIdentity(url) {
  if (!url) return {};
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (host !== 'instagram.com' && !host.endsWith('.instagram.com')) return {};
    const username = parsed.pathname.split('/').map(part => part.trim()).filter(Boolean)[0] || '';
    if (username && !['about', 'accounts', 'explore', 'p', 'reel', 'stories', 'tv'].includes(username.toLowerCase())) {
      return { instagramUsername: username.replace(/^@/, '') };
    }
  } catch {}
  return {};
}

function leadName(lead) {
  return firstValue(lead.name, lead.company, lead.business_name, 'Unknown Company');
}

function leadPhone(lead) {
  return firstValue(
    lead.phone_full,
    lead.phone_google_maps,
    lead.phone_google_profile,
    lead.phone_original,
    lead.phone,
    ...(Array.isArray(lead.phone_numbers) ? lead.phone_numbers : [])
  );
}

function leadAddress(lead) {
  return firstValue(lead.address_full, lead.full_address, lead.address);
}

function leadWebsite(lead) {
  return firstValue(lead.website_full, lead.website);
}

function adsFoundCount(ads) {
  return Number(ads?.ads_found_count ?? ads?.activeAdsCount ?? ads?.active_ads_count ?? 0) || 0;
}

function toFinalCompany(lead, adsStatus, ads = {}) {
  const socials = getSocialLinks(lead);
  return {
    name: leadName(lead),
    phone: leadPhone(lead),
    full_address: leadAddress(lead),
    website: leadWebsite(lead),
    facebook_url: socials.facebook_url,
    instagram_url: socials.instagram_url,
    ads_status: adsStatus,
    ads_found_count: adsFoundCount(ads),
    ...(ads.matched_page_name ? { matched_page_name: ads.matched_page_name } : {}),
    ...(ads.matched_page_id ? { matched_page_id: ads.matched_page_id } : {}),
  };
}

function normalizeTokens(value) {
  return clean(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length >= 3);
}

function addressSignals(address) {
  const text = clean(address).toLowerCase();
  const pincode = (text.match(/\b\d{6}\b/) || [''])[0];
  const parts = text.split(',').map(part => part.trim()).filter(Boolean);
  const state = parts.length >= 2 ? parts[parts.length - 2] : '';
  const city = parts.length >= 3 ? parts[parts.length - 3] : (parts[parts.length - 2] || '');
  const area = parts.length >= 4 ? parts[parts.length - 4] : (parts[0] || '');
  return { text, pincode, state, city, area, tokens: new Set(normalizeTokens(text)) };
}

function tokenOverlap(left, right) {
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const token of left) if (right.has(token)) hits += 1;
  return hits / Math.max(left.size, right.size);
}

function categoryTokens(lead) {
  return new Set(normalizeTokens(firstValue(lead.category, lead.type, lead.business_category, lead.name)));
}

function companyKey(lead) {
  const socials = getSocialLinks(lead);
  return [
    leadName(lead),
    leadPhone(lead),
    leadWebsite(lead),
    socials.facebook_url,
    socials.instagram_url,
  ].map(value => clean(value).toLowerCase()).filter(Boolean).join('|');
}

function baseCompetitorScore(targetLead, candidateLead, candidateAds, usageCount = 0) {
  const targetAddress = addressSignals(leadAddress(targetLead));
  const targetCategory = categoryTokens(targetLead);
  const targetWebsite = leadWebsite(targetLead).toLowerCase();
  const candidateAddress = addressSignals(leadAddress(candidateLead));
  const candidateCategory = categoryTokens(candidateLead);
  const socials = getSocialLinks(candidateLead);
  let score = 0;
  const reasons = [];

  if (targetAddress.pincode && targetAddress.pincode === candidateAddress.pincode) {
    score += 45;
    reasons.push('same_pincode');
  }
  if (targetAddress.city && targetAddress.city === candidateAddress.city) {
    score += 25;
    reasons.push('same_city');
  }
  if (targetAddress.area && targetAddress.area === candidateAddress.area) {
    score += 20;
    reasons.push('same_area');
  }
  if (targetAddress.state && targetAddress.state === candidateAddress.state) {
    score += 10;
    reasons.push('same_state');
  }

  const addressOverlap = tokenOverlap(targetAddress.tokens, candidateAddress.tokens);
  score += addressOverlap * 25;
  if (addressOverlap > 0.15) reasons.push('address_overlap');

  const categoryOverlap = tokenOverlap(targetCategory, candidateCategory);
  score += categoryOverlap * 25;
  if (categoryOverlap > 0) reasons.push('similar_category');

  if (socials.facebook_url || socials.instagram_url) {
    score += 8;
    reasons.push('has_social');
  }
  if (leadWebsite(candidateLead)) {
    score += 4;
    reasons.push('has_website');
  }
  if (candidateAds?.ads_status === 'running_ads') {
    score += 35;
    reasons.push('running_ads');
  }
  const foundCount = adsFoundCount(candidateAds);
  if (foundCount > 0) {
    score += Math.min(foundCount, 10) * 2;
    reasons.push('ads_found_count');
  }
  if (usageCount > 0) {
    score -= usageCount * 18;
    reasons.push(`usage_penalty_${usageCount}`);
  }
  if (targetWebsite && targetWebsite === leadWebsite(candidateLead).toLowerCase()) score -= 100;

  return { score, reasons };
}

function pickCompetitors(target, leads, adsByIndex, maxCompetitors = 2, options = {}) {
  const {
    allowFallbackCompetitors = false,
    competitorUsage = new Map(),
  } = options;
  const targetKey = companyKey(target.lead);
  const selectedKeys = new Set();

  const rank = (allowNonRunning) => leads
    .map((lead, index) => ({ lead, index }))
    .filter(item => item.index !== target.index)
    .filter(item => companyKey(item.lead) !== targetKey)
    .filter(item => {
      const socials = getSocialLinks(item.lead);
      if (!socials.facebook_url && !socials.instagram_url) return false;
      const ads = adsByIndex.get(item.index) || {};
      if (ads.reason === 'missing_social_profiles' || ads.ads_status === 'skipped') return false;
      if (ads.ads_status === 'running_ads') return true;
      return allowNonRunning && ads.ads_status !== 'unknown';
    })
    .map(item => {
      const ads = adsByIndex.get(item.index) || {};
      const usageKey = companyKey(item.lead);
      const { score, reasons } = baseCompetitorScore(target.lead, item.lead, ads, competitorUsage.get(usageKey) || 0);
      return { ...item, ads, score, reasons, usageKey };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => {
      const usageDelta = (competitorUsage.get(a.usageKey) || 0) - (competitorUsage.get(b.usageKey) || 0);
      if (Math.abs(b.score - a.score) <= 10 && usageDelta !== 0) return usageDelta;
      return b.score - a.score;
    });

  const runningRanked = rank(false);
  let selected = runningRanked;
  if (selected.length < maxCompetitors && allowFallbackCompetitors) {
    const selectedUsageKeys = new Set(selected.map(item => item.usageKey));
    selected = [
      ...selected,
      ...rank(true).filter(item => !selectedUsageKeys.has(item.usageKey) && item.ads.ads_status !== 'running_ads'),
    ];
  }

  const limited = [];
  for (const item of selected) {
    if (selectedKeys.has(item.usageKey)) continue;
    selectedKeys.add(item.usageKey);
    limited.push(item);
    if (limited.length >= maxCompetitors) break;
  }

  const selectionWarning = runningRanked.length < maxCompetitors
    ? `Only ${runningRanked.length} running-ad competitors found for this company.`
    : '';

  return limited.map(item => {
    const company = toFinalCompany(item.lead, item.ads.ads_status || 'unknown', item.ads);
    return {
      ...company,
      competitor_score: Number(item.score.toFixed(2)),
      competitor_match_reasons: item.reasons,
      ...(selectionWarning ? { competitor_selection_warning: selectionWarning } : {}),
    };
  });
}

async function defaultAdsChecker({ lead, identity, country }) {
  if (lead.ads_status === 'running_ads' || lead.running_ads === true || Number(lead.active_ads_count || 0) > 0) {
    return { ads_status: 'running_ads', activeAdsCount: Number(lead.active_ads_count || 1), warnings: [] };
  }
  if (lead.ads_status === 'not_running_ads' || lead.running_ads === false || Number(lead.active_ads_count) === 0) {
    return { ads_status: 'not_running_ads', activeAdsCount: 0, warnings: [] };
  }

  return {
    ads_status: 'skipped',
    activeAdsCount: 0,
    skipped_reason: 'missing_stored_ad_status',
    warnings: ['No stored ad status found on this CRM lead.'],
  };
}

function buildIdentity(lead) {
  const socials = getSocialLinks(lead);
  const facebook = extractFacebookIdentity(socials.facebook_url);
  const instagram = extractInstagramIdentity(socials.instagram_url);
  return {
    ...socials,
    ...facebook,
    ...instagram,
    hasSocial: Boolean(socials.facebook_url || socials.instagram_url),
  };
}

function readJsonArray(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.leads)) return parsed.leads;
  throw new Error('Lead file must contain an array or { leads: [] }');
}

function mergeFinalList(existing, additions) {
  const byKey = new Map();
  for (const item of existing) {
    const key = [
      item?.company?.name,
      item?.company?.phone,
      item?.company?.full_address,
    ].map(clean).join('|');
    byKey.set(key, item);
  }
  for (const item of additions) {
    const key = [
      item.company.name,
      item.company.phone,
      item.company.full_address,
    ].map(clean).join('|');
    byKey.set(key, item);
  }
  return [...byKey.values()];
}

async function findAdsWorkflow({
  sourceFile,
  crmDir,
  finalListPath,
  country = 'IN',
  maxCompetitors = 2,
  allowFallbackCompetitors = false,
  selectedIndexes,
  dryRun = false,
  adsChecker = defaultAdsChecker,
  throttleMs = DEFAULT_THROTTLE_MS,
}) {
  if (!sourceFile) throw new Error('sourceFile is required');
  const resolvedCrmDir = path.resolve(crmDir);
  const sourcePath = path.resolve(resolvedCrmDir, path.basename(sourceFile));
  if (!sourcePath.startsWith(resolvedCrmDir + path.sep) || !sourcePath.endsWith('.json')) {
    throw new Error('Invalid sourceFile');
  }
  if (!fs.existsSync(sourcePath)) throw new Error('CRM source file not found');

  const leads = readJsonArray(sourcePath);
  const requestedIndexes = Array.isArray(selectedIndexes)
    ? [...new Set(selectedIndexes)]
        .filter(index => Number.isInteger(index) && index >= 0 && index < leads.length)
        .sort((a, b) => a - b)
    : leads.map((_, index) => index);
  const activeIndexes = requestedIndexes.length ? requestedIndexes : leads.map((_, index) => index);
  const activeIndexSet = new Set(activeIndexes);
  const progressMessages = [];

  const checkedAt = new Date().toISOString();
  const adsByIndex = new Map();
  const notRunning = [];
  const warnings = [];
  const failedLeads = [];
  const skippedLeads = [];
  let checked = 0;
  let skipped = 0;
  let runningAds = 0;

  for (let index = 0; index < leads.length; index += 1) {
    if (!activeIndexSet.has(index)) continue;
    const lead = leads[index] || {};
    const identity = buildIdentity(lead);
    if (!identity.hasSocial) {
      skipped += 1;
      adsByIndex.set(index, {
        ads_status: 'skipped',
        reason: 'missing_social_profiles',
        skipped_reason: 'missing_social_profiles',
      });
      skippedLeads.push({ index, name: leadName(lead), skipped_reason: 'missing_social_profiles' });
      continue;
    }

    checked += 1;
    progressMessages.push(`Checking lead: ${leadName(lead)}`);
    try {
      const result = await adsChecker({ lead, identity, country, index });
      const ads_status = result.ads_status === 'running_ads'
        ? 'running_ads'
        : result.ads_status === 'not_running_ads'
          ? 'not_running_ads'
          : result.ads_status === 'skipped'
            ? 'skipped'
            : 'unknown';
      adsByIndex.set(index, {
        ...result,
        ads_status,
        ads_found_count: adsFoundCount(result),
        matched_page_name: result.matched_page_name || result.matchedPageName || result.raw?.matched_page_name,
        matched_page_id: result.matched_page_id || result.matchedPageId || result.raw?.matched_page_id,
      });
      if (Array.isArray(result.warnings) && result.warnings.length) {
        warnings.push(...result.warnings.map(message => `${leadName(lead)}: ${message}`));
      }
      if (result.failedReason) {
        failedLeads.push({ index, name: leadName(lead), reason: result.failedReason });
      }
      if (ads_status === 'running_ads') runningAds += 1;
      if (ads_status === 'not_running_ads') notRunning.push({ lead, index, result });
      if (ads_status === 'skipped') {
        skipped += 1;
        skippedLeads.push({
          index,
          name: leadName(lead),
          skipped_reason: result.skipped_reason || result.reason || result.failedReason || 'ads_check_skipped',
        });
      }
    } catch (error) {
      adsByIndex.set(index, { ads_status: 'skipped', warnings: [error.message] });
      skipped += 1;
      const name = leadName(lead);
      warnings.push(`${name}: ${error.message}`);
      failedLeads.push({ index, name, reason: error.message });
      skippedLeads.push({ index, name, skipped_reason: error.message });
    }

    if (throttleMs > 0 && index < leads.length - 1) await sleep(throttleMs);
  }

  const competitorUsage = new Map();
  const finalList = notRunning.map(item => {
    const competitors = pickCompetitors(item, leads, adsByIndex, maxCompetitors, {
      allowFallbackCompetitors,
      competitorUsage,
    });
    for (const competitor of competitors) {
      const key = [
        competitor.name,
        competitor.phone,
        competitor.website,
        competitor.facebook_url,
        competitor.instagram_url,
      ].map(value => clean(value).toLowerCase()).filter(Boolean).join('|');
      competitorUsage.set(key, (competitorUsage.get(key) || 0) + 1);
    }
    const competitorWarning = competitors.length < maxCompetitors
      ? `Only ${competitors.length} running-ad competitors found for this company.`
      : '';
    return {
      company: toFinalCompany(item.lead, 'not_running_ads', adsByIndex.get(item.index) || item.result),
      competitors,
      checked_at: checkedAt,
      reason: 'not_running_ads',
      warnings: [
        ...(Array.isArray(item.result.warnings) ? item.result.warnings : []),
        ...(competitorWarning ? [competitorWarning] : []),
      ],
    };
  });

  if (!dryRun) {
    fs.mkdirSync(path.dirname(finalListPath), { recursive: true });
    const existing = fs.existsSync(finalListPath) ? readJsonArray(finalListPath) : [];
    const merged = mergeFinalList(existing, finalList);
    fs.writeFileSync(finalListPath, JSON.stringify(merged, null, 2));
  }

  return {
    success: true,
    dryRun,
    checked,
    skipped,
    runningAds,
    notRunningAds: notRunning.length,
    saved: finalList.length,
    finalListPath,
    warnings,
    failedLeads,
    skippedLeads,
    progressMessages,
    finalList,
  };
}

module.exports = {
  buildIdentity,
  findAdsWorkflow,
  pickCompetitors,
  toFinalCompany,
};
