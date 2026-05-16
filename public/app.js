/* ── Lead Finder v2 — Frontend Logic (no Puter) ── */
/* CATEGORIES and COUNTRIES are loaded from leaddata.js  */

/* ════════════════════════════════════════════════
   UTILS
════════════════════════════════════════════════ */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}
function escAttr(str) { return esc(str).replace(/"/g, '&quot;'); }
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
}
function showToast(msg, duration = 4000) {
  const wrap = document.getElementById('errorToast');
  document.getElementById('errorMsg').textContent = msg;
  wrap.style.display = 'block';
  clearTimeout(wrap._t);
  wrap._t = setTimeout(() => { wrap.style.display = 'none'; }, duration);
}
function setAgentStatus(state, text) {
  document.getElementById('statusDot').className = 'orb-dot ' + state;
  document.getElementById('statusText').textContent = text;
}
function addLog(logEl, msg) {
  const p = document.createElement('p');
  p.textContent = msg;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}
async function readJsonResponse(response, label = 'Request') {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  const preview = text.slice(0, 300);
  if (!contentType.toLowerCase().includes('application/json')) {
    console.error(`${label} returned non-JSON`, {
      status: response.status,
      contentType,
      preview,
    });
    throw new Error(`${label} returned ${contentType || 'non-JSON'}: ${preview}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    console.error(`${label} returned invalid JSON`, {
      status: response.status,
      contentType,
      preview,
    });
    throw new Error(`${label} returned invalid JSON: ${preview}`);
  }
}
function syncStickyUiOffsets() {
  const navEl = document.querySelector('.nav-island');
  const navHeight = navEl ? Math.ceil(navEl.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--nav-island-height', `${navHeight}px`);
}
function setupTableScrollbars() {
  document.querySelectorAll('.table-scroll').forEach(scrollEl => {
    let topEl = scrollEl.previousElementSibling;
    if (!topEl || !topEl.classList.contains('table-scroll-top')) {
      topEl = document.createElement('div');
      topEl.className = 'table-scroll-top';
      topEl.innerHTML = '<div></div>';
      scrollEl.parentNode.insertBefore(topEl, scrollEl);
    }

    const topInner = topEl.firstElementChild;
    const syncWidth = () => {
      topInner.style.width = `${scrollEl.scrollWidth}px`;
      topEl.style.display = scrollEl.scrollWidth > scrollEl.clientWidth ? 'block' : 'none';
    };

    if (!scrollEl._topScrollbarBound) {
      let syncing = false;
      topEl.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        scrollEl.scrollLeft = topEl.scrollLeft;
        syncing = false;
      });
      scrollEl.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        topEl.scrollLeft = scrollEl.scrollLeft;
        syncing = false;
      });
      if (window.ResizeObserver) {
        scrollEl._topScrollbarObserver = new ResizeObserver(syncWidth);
        scrollEl._topScrollbarObserver.observe(scrollEl);
      }
      scrollEl._topScrollbarBound = true;
    }

    syncWidth();
    topEl.scrollLeft = scrollEl.scrollLeft;
  });
}
function statusBadge(s) {
  const l = (s || '').toLowerCase();
  if (l.includes('operational') || l === 'open') return `<span class="badge badge-operational">Operational</span>`;
  if (l.includes('permanently'))  return `<span class="badge badge-closed">Permanently Closed</span>`;
  if (l.includes('temporarily'))  return `<span class="badge badge-temp-closed">Temporarily Closed</span>`;
  return `<span class="badge badge-unknown">${esc(s || 'Unknown')}</span>`;
}
function websiteCell(url) {
  if (!url) return '<span class="col-empty">—</span>';
  const display = url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 35);
  return `<a href="${escAttr(url)}" class="website-link">${esc(display)}</a>`;
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
function getLeadPhoneNumbers(lead) {
  const values = [
    lead.phone_google_maps,
    lead.phone_google_profile,
    lead.phone_full,
    lead.phone_original,
    lead.phone,
    ...(Array.isArray(lead.phone_numbers) ? lead.phone_numbers : [])
  ];
  const seen = new Set();
  return values.map(v => String(v || '').replace(/\s+/g, ' ').trim()).filter(v => {
    const digits = phoneKey(v);
    const key = phoneDedupeKey(v);
    if (!v || digits.length < 5 || key.length < 5 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function phoneCell(lead) {
  const phones = getLeadPhoneNumbers(lead);
  if (!phones.length) return '<span class="col-empty">—</span>';
  return `<div class="phone-list">${phones.map(phone => `<span>${esc(phone)}</span>`).join('')}</div>`;
}
function getLeadSocialLinks(lead) {
  const direct = [
    lead.facebook_url,
    lead.instagram_url,
    lead.linkedin_url,
    lead.x_url,
    lead.youtube_url,
    lead.tiktok_url
  ].filter(Boolean);
  const nested = lead.social_profiles ? Object.values(lead.social_profiles).filter(Boolean) : [];
  const list = Array.isArray(lead.social_links) ? lead.social_links : [];
  return [...new Set([...direct, ...nested, ...list])];
}
function socialLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('facebook.com') || host === 'fb.com') return 'FB';
    if (host.includes('instagram.com')) return 'IG';
    if (host.includes('linkedin.com')) return 'IN';
    if (host.includes('youtube.com') || host === 'youtu.be') return 'YT';
    if (host.includes('tiktok.com')) return 'TT';
    if (host.includes('twitter.com') || host === 'x.com') return 'X';
  } catch {}
  return 'Social';
}
function socialCell(lead) {
  const links = getLeadSocialLinks(lead);
  if (!links.length) return '<span class="col-empty">—</span>';
  return `<div class="social-links">${links.map(url =>
    `<a href="${escAttr(url)}" class="social-link">${esc(socialLabel(url))}</a>`
  ).join('')}</div>`;
}
function getLeadCategory(lead) {
  return lead?.business_category || lead?.category || lead?.type || '';
}
function categoryCell(lead) {
  const category = getLeadCategory(lead);
  return category ? `<span class="category-pill">${esc(category)}</span>` : '<span class="col-empty">—</span>';
}
function leadsToCSV(leads) {
  const H = ['Name','Business Category','Address','Website','Primary Phone','All Phones','Original Phone','Google Maps Phone','Google Profile Phone','Status','Facebook Page ID','Facebook','Instagram','LinkedIn','X/Twitter','YouTube','TikTok','Social Links'];
  const rows = leads.map(l =>
    [
      l.name,
      getLeadCategory(l),
      l.address_full||l.address,
      l.website_full||l.website,
      l.phone_full||l.phone,
      getLeadPhoneNumbers(l).join(' | '),
      l.phone_original || l.phone,
      l.phone_google_maps,
      l.phone_google_profile,
      l.status,
      l.facebook_page_id,
      l.facebook_url || l.social_profiles?.facebook,
      l.instagram_url || l.social_profiles?.instagram,
      l.linkedin_url || l.social_profiles?.linkedin,
      l.x_url || l.social_profiles?.x,
      l.youtube_url || l.social_profiles?.youtube,
      l.tiktok_url || l.social_profiles?.tiktok,
      getLeadSocialLinks(l).join(' | ')
    ]
    .map(v => `"${(v||'').replace(/"/g,'""')}"`).join(','));
  return [H.join(','), ...rows].join('\n');
}
function downloadCSV(csv, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' }));
  a.download = filename;
  a.click();
}

const hostedApi = window.LeadFinderHosted || null;
const hostedFileIndex = {
  leads: new Map(),
  crm: new Map(),
  'final-list': new Map(),
  'map-gap': new Map(),
};
const activeHostedJobs = {
  search: null,
  enrich: null,
  'fb-page-ids': null,
  'find-ads': null,
  'map-gap': null,
};
let pendingImportKind = null;
let currentLeadsFileMeta = null;
let currentCrmFileMeta = null;
let currentFinalListFileMeta = null;

function isHostedMode() {
  return !!(hostedApi && hostedApi.isHosted());
}

function mapKind(kind) {
  return kind;
}

function registerHostedFiles(kind, files) {
  const key = mapKind(kind);
  hostedFileIndex[key].clear();
  (files || []).forEach(file => hostedFileIndex[key].set(file.name, file));
  return files;
}

function hostedFileMeta(kind, name) {
  return hostedFileIndex[mapKind(kind)].get(name) || null;
}

async function ensureHostedFile(kind, name) {
  let meta = hostedFileMeta(kind, name);
  if (meta) return meta;
  const files = await hostedApi.listFiles(mapKind(kind));
  registerHostedFiles(kind, files);
  meta = hostedFileMeta(kind, name);
  if (!meta) throw new Error(`File not found: ${name}`);
  return meta;
}

async function loadHostedFile(kind, name) {
  const meta = await ensureHostedFile(kind, name);
  const payload = await hostedApi.readFileById(meta.id);
  return { meta: payload.file || meta, data: payload.data };
}

function renderJobLog(logEl, messages) {
  if (!logEl) return;
  logEl.innerHTML = '';
  (Array.isArray(messages) ? messages : []).forEach(message => addLog(logEl, message));
}

function updateJobProgressBar(barEl, messages, terminal = false) {
  if (!barEl) return;
  if (terminal) {
    barEl.style.width = '100%';
    return;
  }
  const count = Array.isArray(messages) ? messages.length : 0;
  const width = Math.min(92, 12 + count * 6);
  barEl.style.width = `${width}%`;
}

async function updateAuthUi() {
  const button = document.getElementById('authActionBtn');
  if (!button) return;
  if (!isHostedMode()) {
    button.textContent = 'Local Mode';
    button.disabled = true;
    return;
  }

  try {
    const session = await hostedApi.getSession();
    if (session?.user?.email) {
      button.textContent = `Sign Out (${session.user.email})`;
      button.disabled = false;
    } else {
      button.textContent = 'Hosted Sign In';
      button.disabled = false;
    }
  } catch (error) {
    button.textContent = 'Hosted Config Error';
    button.disabled = true;
    console.error(error);
  }
}

async function handleAuthAction() {
  if (!isHostedMode()) return;
  try {
    const session = await hostedApi.getSession();
    if (session?.user?.email) {
      await hostedApi.signOut();
      showToast('Signed out of hosted workspace.');
    } else {
      const email = prompt('Enter your email for a magic sign-in link:');
      if (!email) return;
      await hostedApi.signInWithEmail(email.trim());
      showToast('Check your email for the sign-in link.');
    }
  } catch (error) {
    showToast(error.message || 'Authentication failed.');
  } finally {
    updateAuthUi();
  }
}

function triggerImport(kind) {
  pendingImportKind = kind;
  const input = document.getElementById('importJsonInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

async function handleImportFileChange(event) {
  const [file] = event.target.files || [];
  if (!file || !pendingImportKind) return;

  if (isHostedMode()) {
    try {
      const saved = await hostedApi.importFile(pendingImportKind, file);
      showToast(`Imported ${saved.name}.`);
      if (pendingImportKind === 'leads') loadLeadsLibrary();
      else if (pendingImportKind === 'crm') loadCrmLibrary();
      else if (pendingImportKind === 'final-list') loadFinalList();
    } catch (error) {
      showToast(`Import failed: ${error.message}`);
    }
  } else {
    try {
      const text = await file.text();
      sessionLeads = JSON.parse(text);
      finishSearch(sessionLeads);
      showToast(`Loaded ${file.name} into the Search view.`);
    } catch (error) {
      showToast(`Import failed: ${error.message}`);
    }
  }

  pendingImportKind = null;
}

/* ════════════════════════════════════════════════
   CATEGORY DROPDOWN
════════════════════════════════════════════════ */
let catHighlight = -1, catOpen = false;
const categoryExpanded = new Set();

function categoryRow(type, payload) {
  const current = document.getElementById('category').value;
  const isLeaf = type === 'leaf' || type === 'search';
  const isActive = isLeaf && payload.value === current;
  const indent = type === 'group' ? 0 : type === 'sub' ? 1 : 2;
  const count = payload.count ? ` <span class="category-count">(${payload.count})</span>` : '';
  const chevron = isLeaf
    ? '<span class="category-tree-spacer"></span>'
    : `<span class="category-tree-chevron">${categoryExpanded.has(payload.key) ? '&#9662;' : '&#9656;'}</span>`;
  const meta = type === 'search'
    ? `<span class="category-path">${esc(payload.group)} / ${esc(payload.sub)}</span>`
    : '';

  return `<div class="category-item category-tree-row category-${type}${isActive ? ' active' : ''}"
    data-type="${type}"
    data-key="${escAttr(payload.key || '')}"
    data-value="${escAttr(payload.value || '')}"
    data-selectable="${isLeaf ? 'true' : 'false'}"
    style="--category-indent:${indent}">
      ${chevron}
      <span class="category-check"></span>
      <span class="category-tree-text">
        <span class="category-tree-title">${esc(payload.label || payload.name)}${count}</span>
        ${meta}
      </span>
    </div>`;
}

function buildCategoryList(filter) {
  const list = document.getElementById('categoryList');
  const q = (filter || '').trim().toLowerCase();

  if (q) {
    const matches = CATEGORY_OPTIONS.filter(option => option.searchText.includes(q));
    if (!matches.length) {
      list.innerHTML = '<div class="category-no-results">No matching categories</div>';
      catHighlight = -1;
      return;
    }
    list.innerHTML = matches.map(option => categoryRow('search', option)).join('');
    catHighlight = -1;
    return;
  }

  const rows = [];
  CATEGORY_TREE.forEach(group => {
    const groupKey = `group:${group.name}`;
    rows.push(categoryRow('group', { ...group, key: groupKey }));
    if (!categoryExpanded.has(groupKey)) return;

    group.subs.forEach(sub => {
      const subKey = `sub:${group.name}:${sub.name}`;
      rows.push(categoryRow('sub', { ...sub, key: subKey }));
      if (!categoryExpanded.has(subKey)) return;

      sub.items.forEach(value => {
        rows.push(categoryRow('leaf', {
          key: `type:${value}`,
          value,
          label: formatCategoryLabel(value)
        }));
      });
    });
  });

  list.innerHTML = rows.join('');
  catHighlight = -1;
}
function openCategoryDropdown() { const w=document.getElementById('categoryWrap'); if(!w.classList.contains('open')){w.classList.add('open');catOpen=true;buildCategoryList(document.getElementById('category').value);} }
function closeCategoryDropdown() { document.getElementById('categoryWrap').classList.remove('open'); catOpen=false; catHighlight=-1; }
function toggleCategoryDropdown() { catOpen ? closeCategoryDropdown() : (document.getElementById('category').focus(), openCategoryDropdown()); }
function filterCategories() { openCategoryDropdown(); buildCategoryList(document.getElementById('category').value); }
function selectCategory(e, val) { e.preventDefault(); document.getElementById('category').value=val; closeCategoryDropdown(); }
function toggleCategoryRow(row) {
  const key = row.dataset.key;
  if (!key) return;
  if (categoryExpanded.has(key)) categoryExpanded.delete(key);
  else categoryExpanded.add(key);
  buildCategoryList(document.getElementById('category').value);
}
function activateCategoryRow(row) {
  if (!row) return;
  if (row.dataset.selectable === 'true') {
    document.getElementById('category').value = row.dataset.value;
    closeCategoryDropdown();
  } else {
    toggleCategoryRow(row);
  }
}
function categoryKeyNav(e) {
  if (!catOpen) { if (e.key==='ArrowDown'||e.key==='Enter') openCategoryDropdown(); return; }
  const items = document.querySelectorAll('#categoryList .category-item');
  if (!items.length) return;
  if (e.key==='ArrowDown') { e.preventDefault(); catHighlight=Math.min(catHighlight+1,items.length-1); updateCatHL(items); }
  else if (e.key==='ArrowUp') { e.preventDefault(); catHighlight=Math.max(catHighlight-1,0); updateCatHL(items); }
  else if (e.key==='Enter') { e.preventDefault(); if(catHighlight>=0&&items[catHighlight]) activateCategoryRow(items[catHighlight]); else closeCategoryDropdown(); }
  else if (e.key==='Escape') closeCategoryDropdown();
}
function updateCatHL(items) { items.forEach((el,i)=>{ el.classList.toggle('highlighted',i===catHighlight); if(i===catHighlight)el.scrollIntoView({block:'nearest'}); }); }

/* ════════════════════════════════════════════════
   COUNTRY DROPDOWN
════════════════════════════════════════════════ */
let ctryHighlight = -1, ctryOpen = false;

function buildCountryList(filter) {
  const list = document.getElementById('countryList');
  const q = (filter||'').trim().toLowerCase();
  const matches = q ? COUNTRIES.filter(c => c.toLowerCase().includes(q)) : COUNTRIES;
  if (!matches.length) { list.innerHTML = '<div class="category-no-results">No matching countries</div>'; return; }
  list.innerHTML = matches.map(cat => {
    const cur = document.getElementById('country').value;
    let label = esc(cat);
    if (q) { const idx=cat.toLowerCase().indexOf(q); if(idx!==-1) label=esc(cat.slice(0,idx))+`<span class="match-highlight">${esc(cat.slice(idx,idx+q.length))}</span>`+esc(cat.slice(idx+q.length)); }
    return `<div class="category-item${cat===cur?' active':''}" data-value="${escAttr(cat)}" onmousedown="selectCountry(event,'${cat.replace(/'/g,"\\'")}'">${label}</div>`;
  }).join('');
  ctryHighlight = -1;
}
function openCountryDropdown() { const w=document.getElementById('countryWrap'); if(!w.classList.contains('open')){w.classList.add('open');ctryOpen=true;buildCountryList(document.getElementById('country').value);} }
function closeCountryDropdown() { const w=document.getElementById('countryWrap'); if(w)w.classList.remove('open'); ctryOpen=false; }
function toggleCountryDropdown() { ctryOpen ? closeCountryDropdown() : (document.getElementById('country').focus(), openCountryDropdown()); }
function filterCountries() { openCountryDropdown(); buildCountryList(document.getElementById('country').value); }
function selectCountry(e, val) { e.preventDefault(); document.getElementById('country').value=val; closeCountryDropdown(); }
function countryKeyNav(e) {
  if (!ctryOpen) { if (e.key==='ArrowDown'||e.key==='Enter') openCountryDropdown(); return; }
  const items = document.querySelectorAll('#countryList .category-item');
  if (!items.length) return;
  if (e.key==='ArrowDown') { e.preventDefault(); ctryHighlight=Math.min(ctryHighlight+1,items.length-1); updateCtryHL(items); }
  else if (e.key==='ArrowUp') { e.preventDefault(); ctryHighlight=Math.max(ctryHighlight-1,0); updateCtryHL(items); }
  else if (e.key==='Enter') { e.preventDefault(); if(ctryHighlight>=0&&items[ctryHighlight]) document.getElementById('country').value=items[ctryHighlight].dataset.value; closeCountryDropdown(); }
  else if (e.key==='Escape') closeCountryDropdown();
}
function updateCtryHL(items) { items.forEach((el,i)=>{ el.classList.toggle('highlighted',i===ctryHighlight); if(i===ctryHighlight)el.scrollIntoView({block:'nearest'}); }); }

document.addEventListener('mousedown', e => {
  const categoryRowEl = e.target.closest('#categoryList .category-item');
  if (categoryRowEl) {
    e.preventDefault();
    activateCategoryRow(categoryRowEl);
    return;
  }
  if (!document.getElementById('categoryWrap').contains(e.target)) closeCategoryDropdown();
  if (!document.getElementById('countryWrap').contains(e.target)) closeCountryDropdown();
});

/* ════════════════════════════════════════════════
   VIEW SWITCHING
════════════════════════════════════════════════ */
function switchView(view) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + view).classList.add('active');
  document.querySelectorAll('.app-view').forEach(v => v.style.display = 'none');
  document.getElementById('view-' + view).style.display = 'block';
  if (view === 'leads')  loadLeadsLibrary();
  if (view === 'crm')    loadCrmLibrary();
  if (view === 'final-list') {
    loadFinalList();
  }
  if (view === 'map-gap') {
    document.getElementById('mgDetailSection').style.display = 'none';
    document.getElementById('mgLibrarySection').style.display = 'block';
    loadMapGapLibrary();
  }
}

/* ════════════════════════════════════════════════
   SEARCH
════════════════════════════════════════════════ */
let sessionLeads = [];
let isSearching  = false;
let pageDiscovery = null;

function currentSearchCriteria() {
  return {
    category: document.getElementById('category').value.trim(),
    country: document.getElementById('country').value.trim(),
    city: document.getElementById('city').value.trim()
  };
}

function searchCriteriaKey(criteria) {
  return [criteria.category, criteria.country, criteria.city].join('\u001f');
}

function resetPageSelection() {
  pageDiscovery = null;
  const block = document.getElementById('pageStartBlock');
  const input = document.getElementById('startPage');
  if (block) block.hidden = true;
  if (input) {
    input.min = '1';
    input.max = '';
    input.value = '1';
  }
}

async function discoverPages(criteria, criteriaKey) {
  if (isHostedMode()) {
    isSearching = false;
    pageDiscovery = { key: criteriaKey, from: 1, to: 999 };
    const startInput = document.getElementById('startPage');
    startInput.min = '1';
    startInput.removeAttribute('max');
    startInput.value = '1';
    document.getElementById('pageRangeNote').textContent = 'Hosted mode does not precompute the last page. Choose the page to start scraping from.';
    document.getElementById('pageStartBlock').hidden = false;
    document.getElementById('searchBtnText').textContent = 'Start Scraping';
    setAgentStatus('idle', 'Hosted search ready');
    showToast('Hosted mode is ready. Choose a start page and click Start Scraping.');
    return;
  }

  isSearching = true;
  setAgentStatus('running', 'Checking pages…');
  document.getElementById('searchBtn').disabled = true;
  document.getElementById('searchBtnText').textContent = 'Checking pages…';

  try {
    const response = await fetch('/api/search/pages?' + new URLSearchParams(criteria));
    const data = await readJsonResponse(response, 'Page discovery');
    if (!response.ok) throw new Error(data.error || 'Could not discover available pages.');
    if (!data.totalPages) throw new Error('No result pages found for this search.');

    pageDiscovery = { key: criteriaKey, from: data.from || 1, to: data.to || data.totalPages };
    const startInput = document.getElementById('startPage');
    startInput.min = String(pageDiscovery.from);
    startInput.max = String(pageDiscovery.to);
    startInput.value = String(pageDiscovery.from);
    document.getElementById('pageRangeNote').textContent = `Available pages: ${pageDiscovery.from} to ${pageDiscovery.to}. Choose where scraping should start.`;
    document.getElementById('pageStartBlock').hidden = false;
    document.getElementById('searchBtnText').textContent = 'Start Scraping';
    setAgentStatus('idle', `Pages ${pageDiscovery.from}-${pageDiscovery.to}`);
    showToast(`Pages available: ${pageDiscovery.from} to ${pageDiscovery.to}. Select a start page.`);
  } catch (error) {
    resetPageSelection();
    showToast(error.message || 'Could not discover pages.');
    setAgentStatus('error', 'Error');
  } finally {
    isSearching = false;
    document.getElementById('searchBtn').disabled = false;
  }
}

function startSearch() {
  if (isSearching) return;
  const { category, country, city } = currentSearchCriteria();
  if (!category && !country && !city) { showToast('Fill at least one search field.'); return; }
  const criteria = { category, country, city };
  const criteriaKey = searchCriteriaKey(criteria);

  if (!pageDiscovery || pageDiscovery.key !== criteriaKey) {
    resetPageSelection();
    discoverPages(criteria, criteriaKey);
    return;
  }

  const startPageInput = document.getElementById('startPage');
  const startPage = Number.parseInt(startPageInput.value, 10);
  if (!Number.isInteger(startPage) || startPage < pageDiscovery.from || startPage > pageDiscovery.to) {
    showToast(`Choose a start page from ${pageDiscovery.from} to ${pageDiscovery.to}.`);
    startPageInput.focus();
    return;
  }

  isSearching = true;
  sessionLeads = [];
  setAgentStatus('running', 'Agent Running…');
  document.getElementById('searchBtn').disabled = true;
  document.getElementById('searchBtnText').textContent = 'Searching…';
  document.getElementById('progressSection').style.display = 'block';
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('progressLog').innerHTML = '';

  if (isHostedMode()) {
    hostedApi.startJob('search', {
      category,
      country,
      city,
      startPage,
      targetLeadCount: 100,
      file_name: `leads-${new Date().toISOString().slice(0, 10)}.json`,
    }).then(job => {
      activeHostedJobs.search = job.id;
      return hostedApi.pollJob(job.id, {
        intervalMs: 4000,
        onUpdate(nextJob) {
          renderJobLog(document.getElementById('progressLog'), nextJob.progress_log);
          updateJobProgressBar(document.getElementById('progressBar'), nextJob.progress_log);
        },
      });
    }).then(async job => {
      activeHostedJobs.search = null;
      if (job.status !== 'completed') throw new Error(job.error_message || 'Search job failed.');
      const payload = await hostedApi.readFileById(job.result_file_id);
      finishSearch(payload.data, { skipSavePrompt: true });
      showToast(`✅ Search complete. Saved ${payload.file.name} to Leads.`);
    }).catch(error => {
      activeHostedJobs.search = null;
      showToast(error.message || 'Search failed.');
      resetSearch();
    });
    return;
  }

  const evtSource = new EventSource('/api/search?' + new URLSearchParams({ category, country, city, startPage }));
  evtSource.onmessage = e => {
    try {
      const d = JSON.parse(e.data);
      if (d.type === 'progress' || d.type === 'status') addLog(document.getElementById('progressLog'), d.message);
      if (d.type === 'done')  { evtSource.close(); finishSearch(d.leads || []); }
      if (d.type === 'error') { evtSource.close(); showToast(d.message); resetSearch(); }
    } catch {}
  };
  evtSource.onerror = () => { evtSource.close(); showToast('Connection lost.'); resetSearch(); };
}

function finishSearch(leads, options = {}) {
  isSearching = false;
  sessionLeads = leads;
  resetPageSelection();
  document.getElementById('searchBtn').disabled = false;
  document.getElementById('searchBtnText').textContent = 'Find Leads';
  document.getElementById('progressSection').style.display = 'none';

  if (!leads.length) { setAgentStatus('idle', 'No Results'); showToast('No leads found.'); return; }

  setAgentStatus('done', leads.length + ' leads found');
  renderResultsTable(leads);
  document.getElementById('resultsSection').style.display = 'block';
  document.getElementById('resultsSection').scrollIntoView({ behavior:'smooth', block:'start' });
  if (!options.skipSavePrompt) openSaveModal();
}

function resetSearch() {
  isSearching = false;
  resetPageSelection();
  document.getElementById('searchBtn').disabled = false;
  document.getElementById('searchBtnText').textContent = 'Find Leads';
  document.getElementById('progressSection').style.display = 'none';
  setAgentStatus('error', 'Error');
}

function renderResultsTable(leads) {
  document.getElementById('resultsMeta').textContent = leads.length + ' leads';
  document.getElementById('resultsBody').innerHTML = leads.map((l, i) => `
    <tr class="row-enter" style="animation-delay:${i*14}ms">
      <td class="col-num">${i+1}</td>
      <td class="col-name">${esc(l.name)}</td>
      <td class="col-category">${categoryCell(l)}</td>
      <td class="col-address">${esc(l.address||'—')}</td>
      <td class="col-website">${websiteCell(l.website)}</td>
      <td class="col-phone">${esc(l.phone||'—')}</td>
      <td class="col-status">${statusBadge(l.status)}</td>
    </tr>`).join('');
  setupTableScrollbars();
}

function clearResults() {
  sessionLeads = [];
  document.getElementById('resultsSection').style.display = 'none';
  setAgentStatus('idle', 'Agent Idle');
}

/* ════════════════════════════════════════════════
   SAVE MODAL
════════════════════════════════════════════════ */
function openSaveModal() {
  if (!sessionLeads.length) return;
  document.getElementById('saveCount').textContent = sessionLeads.length;
  document.getElementById('saveFileName').value = 'leads-' + new Date().toISOString().slice(0,10);
  document.getElementById('saveModal').style.display = 'grid';
  setTimeout(() => document.getElementById('saveFileName').focus(), 100);
}
function closeSaveModal() { document.getElementById('saveModal').style.display = 'none'; }

async function confirmSave() {
  const fn = document.getElementById('saveFileName').value.trim();
  if (!fn) { showToast('Enter a filename.'); return; }
  if (isHostedMode()) {
    try {
      const saved = await hostedApi.saveFile('leads', fn, sessionLeads);
      registerHostedFiles('leads', [saved, ...Array.from(hostedFileIndex.leads.values()).filter(file => file.name !== saved.name)]);
      showToast(`✅ Saved "${saved.name}" — ${saved.record_count} leads`);
      closeSaveModal();
    } catch (e) {
      showToast('Save failed: ' + e.message);
    }
    return;
  }
  try {
    const r = await fetch('/api/leads/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fn, leads: sessionLeads })
    });
    const d = await readJsonResponse(r, 'Save leads');
    if (!r.ok) throw new Error(d.error);
    showToast(`✅ Saved "${d.filename}" — ${d.count} leads`);
    closeSaveModal();
  } catch(e) { showToast('Save failed: ' + e.message); }
}

/* ════════════════════════════════════════════════
   LEADS LIBRARY
════════════════════════════════════════════════ */
let currentLeadsFile = null;
let currentLeadsData = [];

async function loadLeadsLibrary() {
  const grid = document.getElementById('leadsGrid');
  grid.innerHTML = '<div class="file-empty">Loading…</div>';
  document.getElementById('leadsDetail').style.display = 'none';
  document.getElementById('leadsLibrary').style.display = 'block';
  try {
    if (isHostedMode()) {
      const files = registerHostedFiles('leads', await hostedApi.listFiles('leads'));
      if (!files.length) { grid.innerHTML = '<div class="file-empty">No saved lead files yet. Run a search and save it.</div>'; return; }
      grid.innerHTML = files.map(f => `
        <div class="file-card" onclick="openLeadsFile('${escAttr(f.name)}')">
          <div class="file-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="file-info">
            <h4>${esc(f.name)}</h4>
            <p>${f.record_count || 0} leads · ${formatDate(f.created_at)}</p>
          </div>
        </div>`).join('');
      return;
    }
    const r = await fetch('/api/leads/files');
    const files = await readJsonResponse(r, 'Load lead files');
    if (!files.length) { grid.innerHTML = '<div class="file-empty">No saved lead files yet. Run a search and save it.</div>'; return; }
    grid.innerHTML = files.map(f => `
      <div class="file-card" onclick="openLeadsFile('${escAttr(f.name)}')">
        <div class="file-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="file-info">
          <h4>${esc(f.name)}</h4>
          <p>${f.leadCount} leads · ${formatDate(f.createdAt)}</p>
        </div>
      </div>`).join('');
  } catch(e) { grid.innerHTML = '<div class="file-empty">Failed to load library.</div>'; }
}

async function openLeadsFile(name) {
  try {
    if (isHostedMode()) {
      const payload = await loadHostedFile('leads', name);
      currentLeadsData = payload.data;
      currentLeadsFile = name;
      currentLeadsFileMeta = payload.file || payload.meta;
      leadsSelectedIndices.clear();
      document.getElementById('leadsLibrary').style.display = 'none';
      document.getElementById('leadsDetail').style.display = 'block';
      document.getElementById('leadsDetailName').textContent = name;
      document.getElementById('enrichProgress').style.display = 'none';
      document.getElementById('leadsFilterInput').value = '';
      document.getElementById('leadsFilterMeta').textContent = '';
      renderLeadsDetailTable(currentLeadsData);
      updateBulkDeleteBtn();
      return;
    }
    const r = await fetch('/api/leads/file/' + encodeURIComponent(name));
    currentLeadsData = await readJsonResponse(r, 'Open lead file');
    currentLeadsFile = name;
    leadsSelectedIndices.clear();
    document.getElementById('leadsLibrary').style.display = 'none';
    document.getElementById('leadsDetail').style.display = 'block';
    document.getElementById('leadsDetailName').textContent = name;
    document.getElementById('enrichProgress').style.display = 'none';
    document.getElementById('leadsFilterInput').value = '';
    document.getElementById('leadsFilterMeta').textContent = '';
    renderLeadsDetailTable(currentLeadsData);
    updateBulkDeleteBtn();
  } catch(e) { showToast('Could not open file.'); }
}

function closeLeadsDetail() {
  document.getElementById('leadsDetail').style.display = 'none';
  document.getElementById('leadsLibrary').style.display = 'block';
  currentLeadsFile = null;
  currentLeadsFileMeta = null;
  currentLeadsData = [];
  leadsSelectedIndices.clear();
  updateBulkDeleteBtn();
}

/* ════════════════════════════════════════════════
   LEADS MULTI-SELECT & FILTER
════════════════════════════════════════════════ */
let leadsSelectedIndices = new Set(); // indices into currentLeadsData

function renderLeadsDetailTable(leads) {
  const q = (document.getElementById('leadsFilterInput')?.value || '').trim().toLowerCase();
  const filtered = q
    ? leads.filter(l =>
        (l.name||'').toLowerCase().includes(q) ||
        getLeadCategory(l).toLowerCase().includes(q) ||
        (l.address||'').toLowerCase().includes(q) ||
        (l.status||'').toLowerCase().includes(q) ||
        (l.website||'').toLowerCase().includes(q) ||
        (l.phone||'').toLowerCase().includes(q)
      )
    : leads;

  const meta = document.getElementById('leadsFilterMeta');
  if (meta) meta.textContent = q ? `${filtered.length} of ${leads.length} shown` : `${leads.length} leads`;

  document.getElementById('leadsDetailBody').innerHTML = filtered.map((l, fi) => {
    const origIdx = leads.indexOf(l); // real index for selection tracking
    const checked = leadsSelectedIndices.has(origIdx) ? 'checked' : '';
    return `
    <tr class="row-enter" style="animation-delay:${fi*14}ms" data-idx="${origIdx}">
      <td class="col-check"><input type="checkbox" class="row-check" ${checked} onchange="toggleRowSelect(${origIdx},this)"></td>
      <td class="col-num">${fi+1}</td>
      <td class="col-name">${esc(l.name)}</td>
      <td class="col-category">${categoryCell(l)}</td>
      <td class="col-address">${esc(l.address||'—')}</td>
      <td class="col-website">${websiteCell(l.website)}</td>
      <td class="col-phone">${esc(l.phone||'—')}</td>
      <td class="col-status">${statusBadge(l.status)}</td>
    </tr>`;
  }).join('');

  // Sync select-all checkbox state
  const allChecks = document.querySelectorAll('#leadsDetailBody .row-check');
  const selectAll = document.getElementById('leadsSelectAll');
  if (selectAll) {
    selectAll.checked = allChecks.length > 0 && [...allChecks].every(c => c.checked);
    selectAll.indeterminate = !selectAll.checked && [...allChecks].some(c => c.checked);
  }
  setupTableScrollbars();
}

function filterLeadsTable() {
  leadsSelectedIndices.clear(); // clear selection when filter changes
  updateBulkDeleteBtn();
  renderLeadsDetailTable(currentLeadsData);
}

function toggleRowSelect(origIdx, checkbox) {
  if (checkbox.checked) leadsSelectedIndices.add(origIdx);
  else leadsSelectedIndices.delete(origIdx);
  updateBulkDeleteBtn();
  // Update select-all state
  const allChecks = document.querySelectorAll('#leadsDetailBody .row-check');
  const selectAll = document.getElementById('leadsSelectAll');
  if (selectAll) {
    selectAll.checked = allChecks.length > 0 && [...allChecks].every(c => c.checked);
    selectAll.indeterminate = !selectAll.checked && [...allChecks].some(c => c.checked);
  }
}

function toggleSelectAll(masterChk) {
  const allChecks = document.querySelectorAll('#leadsDetailBody .row-check');
  allChecks.forEach(c => {
    c.checked = masterChk.checked;
    const idx = parseInt(c.closest('tr').dataset.idx, 10);
    if (masterChk.checked) leadsSelectedIndices.add(idx);
    else leadsSelectedIndices.delete(idx);
  });
  updateBulkDeleteBtn();
}

function updateBulkDeleteBtn() {
  const btn = document.getElementById('leadsDeleteSelectedBtn');
  const countEl = document.getElementById('selectedCount');
  if (!btn) return;
  const n = leadsSelectedIndices.size;
  if (countEl) countEl.textContent = n;
  btn.style.display = n > 0 ? 'inline-flex' : 'none';
}

async function deleteSelectedLeads() {
  if (!currentLeadsFile || leadsSelectedIndices.size === 0) return;
  if (!confirm(`Delete ${leadsSelectedIndices.size} selected lead${leadsSelectedIndices.size > 1 ? 's' : ''}?`)) return;
  // Filter out selected indices
  const remaining = currentLeadsData.filter((_, i) => !leadsSelectedIndices.has(i));
  try {
    if (isHostedMode()) {
      await hostedApi.updateFile(currentLeadsFileMeta.id, remaining, { name: currentLeadsFile });
      showToast(`✅ Deleted ${leadsSelectedIndices.size} lead${leadsSelectedIndices.size > 1 ? 's' : ''}. ${remaining.length} remaining.`);
      currentLeadsData = remaining;
      leadsSelectedIndices.clear();
      updateBulkDeleteBtn();
      renderLeadsDetailTable(currentLeadsData);
      return;
    }
    const r = await fetch('/api/leads/file/' + encodeURIComponent(currentLeadsFile), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: remaining })
    });
    const d = await readJsonResponse(r, 'Delete selected leads');
    if (!r.ok) throw new Error(d.error);
    showToast(`✅ Deleted ${leadsSelectedIndices.size} lead${leadsSelectedIndices.size > 1 ? 's' : ''}. ${remaining.length} remaining.`);
    currentLeadsData = remaining;
    leadsSelectedIndices.clear();
    updateBulkDeleteBtn();
    renderLeadsDetailTable(currentLeadsData);
  } catch(e) { showToast('Delete failed: ' + e.message); }
}

function exportCurrentLeads() {
  if (!currentLeadsData.length) return;
  downloadCSV(leadsToCSV(currentLeadsData), currentLeadsFile.replace('.json','.csv'));
}

async function deleteLeadsFile() {
  if (!currentLeadsFile || !confirm(`Delete "${currentLeadsFile}"?`)) return;
  try {
    if (isHostedMode()) {
      await hostedApi.deleteFile(currentLeadsFileMeta.id);
      showToast('File deleted.');
      closeLeadsDetail();
      loadLeadsLibrary();
      return;
    }
    await fetch('/api/leads/file/' + encodeURIComponent(currentLeadsFile), { method:'DELETE' });
    showToast('File deleted.');
    closeLeadsDetail();
    loadLeadsLibrary();
  } catch { showToast('Delete failed.'); }
}

/* ════════════════════════════════════════════════
   FIND LEADS (ENRICHMENT AGENT)
════════════════════════════════════════════════ */
function startEnrichment() {
  if (!currentLeadsFile) return;

  const selectedIndexes = [...leadsSelectedIndices]
    .filter(i => Number.isInteger(i) && i >= 0 && i < currentLeadsData.length)
    .sort((a, b) => a - b);
  const sourceLeads = selectedIndexes.length
    ? selectedIndexes.map(i => currentLeadsData[i])
    : currentLeadsData;

  // Count operational leads
  const operationalLeads = sourceLeads.filter(l =>
    (l.status || '').toLowerCase().includes('operational') ||
    (l.status || '').toLowerCase() === 'open'
  );

  if (operationalLeads.length === 0) {
    showToast(selectedIndexes.length
      ? 'No operational leads in the selected rows.'
      : 'No operational leads in this file to enrich.');
    return;
  }

  const estimatedMins = Math.ceil((operationalLeads.length * 10) / 60);
  const scopeText = selectedIndexes.length
    ? `${operationalLeads.length} selected operational lead${operationalLeads.length > 1 ? 's' : ''}`
    : `${operationalLeads.length} operational lead${operationalLeads.length > 1 ? 's' : ''}`;
  if (!confirm(`Enrich ${scopeText}?\n\nEstimated time: ~${estimatedMins} minute${estimatedMins > 1 ? 's' : ''}.\n\nYou can stop at any time with the Stop button.`)) return;

  const btn     = document.getElementById('findLeadsBtn');
  const stopBtn = document.getElementById('stopEnrichBtn');
  btn.style.display     = 'none';
  stopBtn.style.display = 'inline-flex';

  const logEl = document.getElementById('enrichLog');
  logEl.innerHTML = '';
  document.getElementById('enrichProgress').style.display = 'block';
  document.getElementById('enrichSubText').textContent =
    `Enriching ${scopeText} via Google Maps… (est. ${estimatedMins} min)`;
  setAgentStatus('running', 'Find Leads running…');

  if (isHostedMode()) {
    hostedApi.startJob('enrich', {
      source_file_id: currentLeadsFileMeta.id,
      selectedIndexes,
      file_name: currentLeadsFile,
    }).then(job => {
      activeHostedJobs.enrich = job.id;
      return hostedApi.pollJob(job.id, {
        intervalMs: 4000,
        onUpdate(nextJob) {
          renderJobLog(logEl, nextJob.progress_log);
          document.getElementById('enrichSubText').textContent = nextJob.progress_step || `Enriching ${scopeText} via Google Maps…`;
        },
      });
    }).then(async job => {
      activeHostedJobs.enrich = null;
      if (job.status !== 'completed') throw new Error(job.error_message || 'Enrichment failed.');
      showToast(`✅ Saved to CRM: ${(job.result_summary_json || {}).file_name || currentLeadsFile}`);
      document.getElementById('enrichSubText').textContent =
        `✅ Complete! ${((job.result_summary_json || {}).count || 0)} leads saved to CRM tab.`;
      finishEnrichment(btn, stopBtn);
      setAgentStatus('done', 'Enrichment complete');
      loadCrmLibrary();
    }).catch(error => {
      activeHostedJobs.enrich = null;
      showToast('Enrichment error: ' + error.message);
      finishEnrichment(btn, stopBtn);
      setAgentStatus('error', 'Error');
    });
    return;
  }

  fetch('/api/enrich/stream', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ filename: currentLeadsFile, selectedIndexes })
  }).then(res => {
    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let   buf    = '';

    function pump() {
      reader.read().then(({ done, value }) => {
        if (done) { finishEnrichment(btn, stopBtn); return; }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop();
        lines.forEach(line => {
          if (!line.startsWith('data:')) return;
          try {
            const d = JSON.parse(line.slice(5).trim());
            if (d.type === 'progress' || d.type === 'status') addLog(logEl, d.message);
            if (d.type === 'done') {
              showToast(`✅ Saved to CRM: ${d.filename} — ${d.count} leads`);
              document.getElementById('enrichSubText').textContent =
                `✅ Complete! ${d.count} leads saved to CRM tab.`;
              finishEnrichment(btn, stopBtn);
              setAgentStatus('done', 'Enrichment complete');
            }
            if (d.type === 'error') {
              showToast('Enrichment error: ' + d.message);
              finishEnrichment(btn, stopBtn);
              setAgentStatus('error', 'Error');
            }
          } catch {}
        });
        pump();
      });
    }
    pump();
  }).catch(e => {
    showToast('Enrichment failed: ' + e.message);
    finishEnrichment(btn, stopBtn);
    setAgentStatus('error', 'Error');
  });
}

function finishEnrichment(btn, stopBtn) {
  btn.style.display     = 'inline-flex';
  stopBtn.style.display = 'none';
}

async function stopEnrichment() {
  try {
    if (isHostedMode()) {
      if (!activeHostedJobs.enrich) throw new Error('No hosted enrichment job is running.');
      await hostedApi.cancelJob(activeHostedJobs.enrich);
      showToast('⏹ Cancellation requested.');
      setAgentStatus('idle', 'Stopping…');
      return;
    }
    await fetch('/api/enrich/stop', { method: 'POST' });
    showToast('⏹ Stop requested — finishing current lead…');
    setAgentStatus('idle', 'Stopping…');
  } catch { showToast('Could not send stop signal.'); }
}

/* ════════════════════════════════════════════════
   CRM LIBRARY
════════════════════════════════════════════════ */
let currentCrmFile = null;
let currentCrmData = [];
let crmSelectedIndices = new Set();
let crmStatusFilter = 'all';

async function loadCrmLibrary() {
  const grid = document.getElementById('crmGrid');
  grid.innerHTML = '<div class="file-empty">Loading…</div>';
  document.getElementById('crmDetail').style.display = 'none';
  document.getElementById('crmLibrary').style.display = 'block';
  try {
    if (isHostedMode()) {
      const files = registerHostedFiles('crm', await hostedApi.listFiles('crm'));
      if (!files.length) { grid.innerHTML = '<div class="file-empty">No CRM files yet. Run "Find Leads" on a saved scrape.</div>'; return; }
      grid.innerHTML = files.map(f => `
        <div class="file-card crm-card" onclick="openCrmFile('${escAttr(f.name)}')">
          <div class="file-icon" style="background:rgba(130,179,107,0.12);color:var(--green)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div class="file-info">
            <h4>${esc(f.name)}</h4>
            <p>${f.record_count || 0} leads · ${formatDate(f.created_at)}</p>
          </div>
        </div>`).join('');
        return;
    }
    const r = await fetch('/api/crm/files');
    const files = await readJsonResponse(r, 'Load CRM files');
    if (!files.length) { grid.innerHTML = '<div class="file-empty">No CRM files yet. Run "Find Leads" on a saved scrape.</div>'; return; }
    grid.innerHTML = files.map(f => `
      <div class="file-card crm-card" onclick="openCrmFile('${escAttr(f.name)}')">
        <div class="file-icon" style="background:rgba(130,179,107,0.12);color:var(--green)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <div class="file-info">
          <h4>${esc(f.name)}</h4>
          <p>${f.leadCount} leads · ${formatDate(f.createdAt)}</p>
        </div>
      </div>`).join('');
  } catch { grid.innerHTML = '<div class="file-empty">Failed to load CRM.</div>'; }
}

async function openCrmFile(name) {
  try {
    if (isHostedMode()) {
      const payload = await loadHostedFile('crm', name);
      currentCrmData = payload.data;
      currentCrmFile = name;
      currentCrmFileMeta = payload.file || payload.meta;
      crmSelectedIndices.clear();
      crmStatusFilter = 'all';
      document.getElementById('crmLibrary').style.display = 'none';
      document.getElementById('crmDetail').style.display = 'block';
      document.getElementById('crmDetailName').textContent = name;
      document.getElementById('crmFilterInput').value = '';
      document.querySelectorAll('.crm-filter-chip').forEach(c => c.classList.remove('active'));
      document.getElementById('crmChipAll').classList.add('active');
      renderCrmDetailTable();
      return;
    }
    const r = await fetch('/api/crm/file/' + encodeURIComponent(name));
    currentCrmData = await readJsonResponse(r, 'Open CRM file');
    currentCrmFile = name;
    crmSelectedIndices.clear();
    crmStatusFilter = 'all';
    document.getElementById('crmLibrary').style.display = 'none';
    document.getElementById('crmDetail').style.display = 'block';
    document.getElementById('crmDetailName').textContent = name;
    document.getElementById('crmFilterInput').value = '';
    // Reset chips
    document.querySelectorAll('.crm-filter-chip').forEach(c => c.classList.remove('active'));
    document.getElementById('crmChipAll').classList.add('active');
    renderCrmDetailTable();
  } catch { showToast('Could not open CRM file.'); }
}

async function refreshCurrentCrmFile() {
  if (!currentCrmFile) return;
  try {
    if (isHostedMode()) {
      const payload = await loadHostedFile('crm', currentCrmFile);
      currentCrmData = payload.data;
      currentCrmFileMeta = payload.file || payload.meta;
      crmSelectedIndices = new Set([...crmSelectedIndices].filter(i => i >= 0 && i < currentCrmData.length));
      renderCrmDetailTable();
      return;
    }
    const r = await fetch('/api/crm/file/' + encodeURIComponent(currentCrmFile));
    currentCrmData = await readJsonResponse(r, 'Refresh CRM file');
    crmSelectedIndices = new Set([...crmSelectedIndices].filter(i => i >= 0 && i < currentCrmData.length));
    renderCrmDetailTable();
  } catch {
    showToast('CRM updated, but the table refresh failed.');
  }
}

function closeCrmDetail() {
  document.getElementById('crmDetail').style.display = 'none';
  document.getElementById('crmLibrary').style.display = 'block';
  currentCrmFile = null;
  currentCrmFileMeta = null;
  currentCrmData = [];
  crmSelectedIndices.clear();
}

// Filter helpers
function getCrmFilteredEntries() {
  const q = (document.getElementById('crmFilterInput').value || '').toLowerCase();
  return currentCrmData.map((lead, origIdx) => ({ lead, origIdx })).filter(entry => {
    const l = entry.lead;
    const text = [l.name, getLeadCategory(l), l.address_full, l.address, l.status, l.website, l.facebook_page_id, l.phone, ...getLeadPhoneNumbers(l), ...getLeadSocialLinks(l)].join(' ').toLowerCase();
    const matchText = !q || text.includes(q);
    const status = (l.status || '').toLowerCase();
    let matchStatus = true;
    if (crmStatusFilter === 'operational')  matchStatus = status.includes('operational');
    else if (crmStatusFilter === 'temporarily') matchStatus = status.includes('temporarily');
    else if (crmStatusFilter === 'permanently') matchStatus = status.includes('permanently');
    else if (crmStatusFilter === 'unknown')     matchStatus = !status || status === 'unknown' || status === '—';
    return matchText && matchStatus;
  });
}

function getCrmFilteredRows() {
  return getCrmFilteredEntries().map(entry => entry.lead);
}

function filterCrmTable() {
  crmSelectedIndices.clear();
  renderCrmDetailTable();
}

function setCrmStatusFilter(val, chip) {
  crmStatusFilter = val;
  document.querySelectorAll('.crm-filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  crmSelectedIndices.clear();
  renderCrmDetailTable();
}

function toggleCrmSelectAll(chk) {
  const entries = getCrmFilteredEntries();
  if (chk.checked) entries.forEach(entry => crmSelectedIndices.add(entry.origIdx));
  else entries.forEach(entry => crmSelectedIndices.delete(entry.origIdx));
  renderCrmDetailTable();
}

function toggleCrmRow(origIdx) {
  if (crmSelectedIndices.has(origIdx)) crmSelectedIndices.delete(origIdx);
  else crmSelectedIndices.add(origIdx);
  updateCrmSelectionUI();
  setupTableScrollbars();
}

function updateCrmSelectionUI() {
  const count = crmSelectedIndices.size;
  const deleteBtn = document.getElementById('crmDeleteSelectedBtn');
  const countEl   = document.getElementById('crmSelectedCount');
  deleteBtn.style.display = count > 0 ? '' : 'none';
  if (countEl) countEl.textContent = count;
  // Sync select-all checkbox state
  const entries = getCrmFilteredEntries();
  const visibleSelected = entries.filter(entry => crmSelectedIndices.has(entry.origIdx)).length;
  const selectAll = document.getElementById('crmSelectAll');
  if (selectAll) {
    selectAll.indeterminate = visibleSelected > 0 && visibleSelected < entries.length;
    selectAll.checked = entries.length > 0 && visibleSelected === entries.length;
  }
  // Update row highlight
  document.querySelectorAll('#crmDetailBody tr').forEach(tr => {
    const origIdx = Number(tr.dataset.origIdx);
    tr.classList.toggle('row-selected', crmSelectedIndices.has(origIdx));
  });
}

function renderCrmDetailTable() {
  const entries = getCrmFilteredEntries();
  const rows = entries.map(entry => entry.lead);
  const meta = document.getElementById('crmFilterMeta');
  if (meta) meta.textContent = rows.length + ' / ' + currentCrmData.length + ' leads';

  document.getElementById('crmDetailBody').innerHTML = entries.map((entry, i) => {
    const l = entry.lead;
    const conf = l.confidence || 0;
    const confColor = conf >= 70 ? 'var(--green)' : conf >= 40 ? 'var(--warning)' : 'var(--danger)';
    const checked = crmSelectedIndices.has(entry.origIdx) ? 'checked' : '';
    return `
    <tr class="row-enter ${crmSelectedIndices.has(entry.origIdx) ? 'row-selected' : ''}" style="animation-delay:${i*14}ms" data-orig-idx="${entry.origIdx}">
      <td class="col-check"><input type="checkbox" ${checked} onchange="toggleCrmRow(${entry.origIdx})"></td>
      <td class="col-num">${i+1}</td>
      <td class="col-name">${esc(l.name)}</td>
      <td class="col-category">${categoryCell(l)}</td>
      <td class="col-address">${esc(l.address_full||l.address||'—')}</td>
      <td class="col-website">${websiteCell(l.website_full||l.website)}</td>
      <td class="col-social">${socialCell(l)}</td>
      <td style="font-family:var(--mono);font-size:.78rem">${esc(l.facebook_page_id || '—')}</td>
      <td class="col-phone">${phoneCell(l)}</td>
      <td class="col-status">${statusBadge(l.status)}</td>
      <td style="color:${confColor};font-family:var(--mono);font-size:.82rem">${conf}%</td>
      <td style="color:var(--muted);font-size:.78rem">${esc(l.match_source||'—')}</td>
    </tr>`;
  }).join('');

  updateCrmSelectionUI();
}

async function deleteSelectedCrm() {
  if (!crmSelectedIndices.size) return;
  if (!confirm(`Delete ${crmSelectedIndices.size} selected record(s)?`)) return;
  const selected = new Set(crmSelectedIndices);
  const remaining = currentCrmData.filter((_, i) => !selected.has(i));
  try {
    if (isHostedMode()) {
      await hostedApi.updateFile(currentCrmFileMeta.id, remaining, { name: currentCrmFile });
      currentCrmData = remaining;
      crmSelectedIndices.clear();
      renderCrmDetailTable();
      showToast(`Deleted ${selected.size} record(s).`);
      return;
    }
    await fetch('/api/crm/file/' + encodeURIComponent(currentCrmFile), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(remaining)
    });
    currentCrmData = remaining;
    crmSelectedIndices.clear();
    renderCrmDetailTable();
    showToast(`Deleted ${selected.size} record(s).`);
  } catch { showToast('Delete failed.'); }
}

function exportCrmFile() {
  if (!currentCrmData.length) return;
  downloadCSV(leadsToCSV(currentCrmData), currentCrmFile.replace('.json','.csv'));
}

async function findAdsForCurrentCrm() {
  if (!currentCrmFile) return;
  const btn = document.getElementById('crmFindAdsBtn');
  const panel = document.getElementById('crmFindAdsProgress');
  const title = document.getElementById('crmFindAdsProgressTitle');
  const sub = document.getElementById('crmFindAdsProgressSub');
  const count = document.getElementById('crmFindAdsProgressCount');
  const bar = document.getElementById('crmFindAdsProgressBar');
  const log = document.getElementById('crmFindAdsLog');

  btn.disabled = true;
  btn.textContent = 'Finding ads...';
  panel.style.display = 'block';
  title.textContent = 'Finding ads...';
  const selectedIndexes = [...crmSelectedIndices]
    .filter(index => Number.isInteger(index) && index >= 0 && index < currentCrmData.length)
    .sort((a, b) => a - b);
  const scopedLeads = selectedIndexes.length
    ? selectedIndexes.map(index => currentCrmData[index]).filter(Boolean)
    : currentCrmData;
  const pageIdCount = scopedLeads.filter(lead => String(lead.facebook_page_id || '').trim()).length;
  const scopeText = selectedIndexes.length
    ? `${selectedIndexes.length} selected lead(s)`
    : `all ${currentCrmData.length} lead(s)`;
  sub.textContent = `Checking ${pageIdCount} Facebook Page ID(s) from ${scopeText} in ${currentCrmFile}.`;
  count.textContent = '0 saved';
  bar.style.width = '25%';
  log.innerHTML = '';
  const loggedMessages = new Set();
  const addFindAdsLog = message => {
    if (loggedMessages.has(message)) return;
    loggedMessages.add(message);
    addLog(log, message);
  };
  const logFindAdsFailures = data => {
    (data.failedLeads || []).forEach(failure => {
      addFindAdsLog(`Failed lead: ${failure.name || `Lead ${Number(failure.index) + 1}`} - ${failure.reason || 'Unknown reason'}`);
    });
  };
  addFindAdsLog('Checking Facebook Page IDs in Meta Ads Library...');
  setAgentStatus('running', 'Finding ads...');

  try {
    if (!pageIdCount) {
      addFindAdsLog('No CRM leads with facebook_page_id were found.');
    }

    const data = isHostedMode()
      ? await hostedApi.startJob('find-ads', {
          source_file_id: currentCrmFileMeta.id,
          country: 'ALL',
          ...(selectedIndexes.length ? { selectedIndexes } : {}),
          file_name: `fb-ad-status-${currentCrmFile.replace(/\.json$/i, '')}-all-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        }).then(job => {
          activeHostedJobs['find-ads'] = job.id;
          return hostedApi.pollJob(job.id, {
            intervalMs: 4000,
            onUpdate(nextJob) {
              renderJobLog(log, nextJob.progress_log);
              updateJobProgressBar(bar, nextJob.progress_log);
              sub.textContent = nextJob.progress_step || sub.textContent;
            },
          });
        }).then(job => {
          activeHostedJobs['find-ads'] = null;
          if (job.status !== 'completed') throw new Error(job.error_message || 'Find Ads failed');
          const summary = job.result_summary_json || {};
          return {
            success: true,
            checked: summary.checked || 0,
            saved: summary.saved || 0,
            runningAds: summary.running_ads || 0,
            notRunningAds: summary.not_running_ads || 0,
            unknown: summary.unknown || 0,
          };
        })
      : await (async () => {
          const res = await fetch('/api/crm/find-ads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceFile: currentCrmFile,
              country: 'ALL',
              ...(selectedIndexes.length ? { selectedIndexes } : {})
            })
          });
          const raw = await readJsonResponse(res, 'Find Ads');
          if (!res.ok || !raw.success) {
            const error = new Error(raw.error || 'Find Ads failed');
            error.progressMessages = raw.progressMessages || [];
            throw error;
          }
          return raw;
        })();

    bar.style.width = '100%';
    count.textContent = `${data.saved} saved`;
    title.textContent = 'Find Ads complete';
    sub.textContent = `${data.checked} checked, ${data.runningAds} running ads, ${data.notRunningAds} not running ads, ${data.skipped} skipped.`;
    (data.progressMessages || []).forEach(message => addFindAdsLog(message));
    (data.warnings || []).slice(0, 8).forEach(warning => addFindAdsLog(warning));
    if ((data.warnings || []).length > 8) addFindAdsLog(`${data.warnings.length - 8} more warning(s).`);
    logFindAdsFailures(data);
    showToast(`Saved ad status for ${data.saved} compan${data.saved === 1 ? 'y' : 'ies'} to Final List.`);
    setAgentStatus('done', 'Find Ads complete');
  } catch (error) {
    activeHostedJobs['find-ads'] = null;
    title.textContent = 'Find Ads failed';
    sub.textContent = error.message;
    (error.progressMessages || []).forEach(message => addFindAdsLog(message));
    (error.failedLeads || []).forEach(failure => {
      addFindAdsLog(`Failed lead: ${failure.name || `Lead ${Number(failure.index) + 1}`} - ${failure.reason || 'Unknown reason'}`);
    });
    addFindAdsLog(`Error: ${error.message}`);
    showToast('Find Ads failed: ' + error.message, 7000);
    setAgentStatus('error', 'Find Ads error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Find Ads';
  }
}

/* ════════════════════════════════════════════════
   GET FACEBOOK PAGE IDs (Playwright scraper)
════════════════════════════════════════════════ */
async function getFbPageIdsForCurrentCrm() {
  if (!currentCrmFile) return;

  const selectedIndexes = [...crmSelectedIndices]
    .filter(i => Number.isInteger(i) && i >= 0 && i < currentCrmData.length)
    .sort((a, b) => a - b);
  const sourceLeads = selectedIndexes.length
    ? selectedIndexes.map(i => currentCrmData[i])
    : currentCrmData;
  const hasFacebook = lead => getLeadSocialLinks(lead).some(url => /(^|\/\/|\.)(facebook|fb)\.com/i.test(String(url || '')));
  const leadsWithFb = sourceLeads.filter(hasFacebook);

  if (selectedIndexes.length && !leadsWithFb.length) {
    showToast('No selected leads with a Facebook URL.');
    return;
  }
  if (!selectedIndexes.length && !leadsWithFb.length) {
    showToast('No leads with a Facebook URL in this CRM file.');
    return;
  }

  const scopeText = selectedIndexes.length
    ? `${leadsWithFb.length} selected lead${leadsWithFb.length === 1 ? '' : 's'} with a Facebook URL`
    : `${leadsWithFb.length} lead${leadsWithFb.length === 1 ? '' : 's'} with a Facebook URL`;

  if (!confirm(
    `Get Facebook Page IDs for ${scopeText}?\n\n` +
    `This opens a browser window and visits each page.\n` +
    `Found Page IDs will be saved back into this CRM file.`
  )) return;

  const btn   = document.getElementById('crmFbPageIdsBtn');
  const panel = document.getElementById('crmFbPageIdsProgress');
  const title = document.getElementById('crmFbPageIdsTitle');
  const sub   = document.getElementById('crmFbPageIdsSub');
  const count = document.getElementById('crmFbPageIdsCount');
  const bar   = document.getElementById('crmFbPageIdsBar');
  const log   = document.getElementById('crmFbPageIdsLog');

  btn.disabled = true;
  btn.querySelector('svg').style.display = 'none';
  btn.childNodes[btn.childNodes.length - 1].textContent = ' Running…';
  panel.style.display = 'block';
  title.textContent = 'Getting Facebook Page IDs…';
  sub.textContent = `Visiting ${scopeText} from "${currentCrmFile}".`;
  count.textContent = '0 found';
  bar.style.width = '5%';
  log.innerHTML = '';
  setAgentStatus('running', 'FB Page IDs running…');

  let foundCount = 0;
  const total = leadsWithFb.length;

  try {
    if (isHostedMode()) {
      const job = await hostedApi.startJob('fb-page-ids', {
        source_file_id: currentCrmFileMeta.id,
        selectedIndexes,
        report_file_name: `fb-page-ids-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      });
      activeHostedJobs['fb-page-ids'] = job.id;
      const result = await hostedApi.pollJob(job.id, {
        intervalMs: 4000,
        onUpdate(nextJob) {
          renderJobLog(log, nextJob.progress_log);
          updateJobProgressBar(bar, nextJob.progress_log);
          sub.textContent = nextJob.progress_step || sub.textContent;
        },
      });
      activeHostedJobs['fb-page-ids'] = null;
      if (result.status !== 'completed') throw new Error(result.error_message || 'Facebook Page ID job failed');
      const summary = result.result_summary_json || {};
      title.textContent = 'Facebook Page IDs saved to CRM';
      sub.textContent = `Done — ${summary.found || 0} Page IDs found.`;
      count.textContent = `${summary.found || 0} found`;
      bar.style.width = '100%';
      showToast(`✅ Updated CRM — ${summary.found || 0} Page IDs found, ${summary.updated || 0} row(s) updated.`);
      setAgentStatus('done', 'FB Page IDs complete');
      await refreshCurrentCrmFile();
      return;
    }

    const res = await fetch('/api/crm/fb-page-ids/stream', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        sourceFile: currentCrmFile,
        selectedIndexes,
        updateCrm: true,
      }),
    });

    if (!res.ok || !res.body) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Server returned ${res.status}`);
    }

    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let   buf    = '';

    async function pump() {
      const { done, value } = await reader.read();
      if (done) return;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n\n');
      buf = lines.pop();
      lines.forEach(line => {
        if (!line.startsWith('data:')) return;
        try {
          const d = JSON.parse(line.slice(5).trim());

          if (d.type === 'status') {
            addLog(log, d.message);
            sub.textContent = d.message;
          }

          if (d.type === 'progress') {
            addLog(log, d.message);
            if (d.company) sub.textContent = `Checking: ${d.company}`;
          }

          if (d.type === 'lead_done') {
            foundCount += 1;
            count.textContent = `${foundCount} found`;
            bar.style.width = `${Math.min(95, Math.round((foundCount / total) * 100))}%`;
            addLog(log, d.message);
          }

          if (d.type === 'done') {
            title.textContent = 'Facebook Page IDs saved to CRM';
            sub.textContent   = d.message || `Done — ${d.found} Page IDs found.`;
            count.textContent = `${d.found || foundCount} found`;
            bar.style.width   = '100%';
            showToast(`✅ Updated CRM — ${d.found} Page IDs found, ${d.updated || 0} row(s) updated.`);
            setAgentStatus('done', 'FB Page IDs complete');
            refreshCurrentCrmFile();
          }

          if (d.type === 'error') {
            throw new Error(d.message);
          }
        } catch (err) {
          addLog(log, `Error: ${err.message}`);
        }
      });
      await pump();
    }

    await pump();
  } catch (err) {
    activeHostedJobs['fb-page-ids'] = null;
    title.textContent = 'FB Page IDs failed';
    sub.textContent   = err.message;
    addLog(log, `Error: ${err.message}`);
    showToast('FB Page IDs failed: ' + err.message, 7000);
    setAgentStatus('error', 'FB Page IDs error');
  } finally {
    btn.disabled = false;
    const svgEl = btn.querySelector('svg');
    if (svgEl) svgEl.style.display = '';
    btn.childNodes[btn.childNodes.length - 1].textContent = ' Get FB Page IDs';
  }
}

async function deleteCrmFile() {
  if (!currentCrmFile || !confirm(`Delete "${currentCrmFile}"?`)) return;
  try {
    if (isHostedMode()) {
      await hostedApi.deleteFile(currentCrmFileMeta.id);
      showToast('File deleted.');
      closeCrmDetail();
      loadCrmLibrary();
      return;
    }
    await fetch('/api/crm/file/' + encodeURIComponent(currentCrmFile), { method:'DELETE' });
    showToast('File deleted.');
    closeCrmDetail();
    loadCrmLibrary();
  } catch { showToast('Delete failed.'); }
}


/* ════════════════════════════════════════════════
   FINAL LIST
════════════════════════════════════════════════ */
let currentFinalListData = [];
let currentFinalListFile = null;

async function loadFinalList() {
  const grid = document.getElementById('finalListGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="file-empty">Loading...</div>';
  document.getElementById('finalListDetail').style.display = 'none';
  document.getElementById('finalListLibrary').style.display = 'block';
  try {
    if (isHostedMode()) {
      const files = registerHostedFiles('final-list', await hostedApi.listFiles('final-list'));
      if (!files.length) {
        grid.innerHTML = '<div class="file-empty">No Final List files yet. Open a CRM file and run Find Ads.</div>';
        return;
      }
      grid.innerHTML = files.map(f => `
        <div class="file-card crm-card" onclick="openFinalListFile('${escAttr(f.name)}')">
          <div class="file-icon" style="background:rgba(71,184,198,0.12);color:var(--cyan)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <div class="file-info">
            <h4>${esc(f.name)}</h4>
            <p>${f.record_count || 0} companies · ${formatDate(f.created_at)}</p>
          </div>
        </div>`).join('');
      return;
    }
    const r = await fetch('/api/final-list/files');
    const files = await readJsonResponse(r, 'Load Final List files');
    if (!files.length) {
      grid.innerHTML = '<div class="file-empty">No Final List files yet. Open a CRM file and run Find Ads.</div>';
      return;
    }
    grid.innerHTML = files.map(f => `
      <div class="file-card crm-card" onclick="openFinalListFile('${escAttr(f.name)}')">
        <div class="file-icon" style="background:rgba(71,184,198,0.12);color:var(--cyan)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
        <div class="file-info">
          <h4>${esc(f.name)}</h4>
          <p>${f.leadCount} companies · ${formatDate(f.createdAt)}</p>
        </div>
      </div>`).join('');
  } catch {
    grid.innerHTML = '<div class="file-empty">Failed to load Final List.</div>';
  }
}

async function openFinalListFile(name) {
  const body = document.getElementById('finalListBody');
  body.innerHTML = '<tr class="crm-empty-row"><td colspan="12">Loading...</td></tr>';
  try {
    if (isHostedMode()) {
      const payload = await loadHostedFile('final-list', name);
      currentFinalListData = payload.data;
      currentFinalListFile = name;
      currentFinalListFileMeta = payload.file || payload.meta;
      document.getElementById('finalListLibrary').style.display = 'none';
      document.getElementById('finalListDetail').style.display = 'block';
      document.getElementById('finalListDetailName').textContent = name;
      renderFinalListTable(currentFinalListData);
      return;
    }
    const r = await fetch('/api/final-list/file/' + encodeURIComponent(name));
    currentFinalListData = await readJsonResponse(r, 'Open Final List file');
    currentFinalListFile = name;
    document.getElementById('finalListLibrary').style.display = 'none';
    document.getElementById('finalListDetail').style.display = 'block';
    document.getElementById('finalListDetailName').textContent = name;
    renderFinalListTable(currentFinalListData);
  } catch {
    body.innerHTML = '<tr class="crm-empty-row"><td colspan="12">Failed to load Final List.</td></tr>';
  }
}

function closeFinalListDetail() {
  document.getElementById('finalListDetail').style.display = 'none';
  document.getElementById('finalListLibrary').style.display = 'block';
  currentFinalListFile = null;
  currentFinalListFileMeta = null;
  currentFinalListData = [];
}

function linkCell(url, label) {
  if (!url) return '<span class="col-empty">—</span>';
  return `<a href="${escAttr(url)}" class="website-link">${esc(label || url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 28))}</a>`;
}

function competitorCell(comp) {
  if (!comp) return '<span class="col-empty">No running-ad competitor found</span>';
  const socials = [comp.facebook_url ? linkCell(comp.facebook_url, 'FB') : '', comp.instagram_url ? linkCell(comp.instagram_url, 'IG') : ''].filter(Boolean).join(' ');
  return `
    <div style="display:grid;gap:4px">
      <strong>${esc(comp.name || '—')}</strong>
      <span style="color:var(--warning);font-size:.76rem;font-family:var(--mono)">${esc(comp.ads_status || '—')}</span>
      <span>${esc(comp.phone || '—')}</span>
      <span style="color:var(--muted)">${esc(comp.full_address || '—')}</span>
      <span>${websiteCell(comp.website)} ${socials}</span>
    </div>`;
}

function uniqueRunningCompetitors(competitors) {
  const seen = new Set();
  return (Array.isArray(competitors) ? competitors : []).filter(comp => {
    if (!comp || comp.ads_status !== 'running_ads') return false;
    const key = [comp.name, comp.phone, comp.website, comp.facebook_url, comp.instagram_url]
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean)
      .join('|');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderFinalListTable(items) {
  const meta = document.getElementById('finalListMeta');
  if (meta) meta.textContent = `${items.length} compan${items.length === 1 ? 'y' : 'ies'}`;
  const body = document.getElementById('finalListBody');
  if (!items.length) {
    body.innerHTML = '<tr class="crm-empty-row"><td colspan="13">No companies saved yet. Open a CRM file and run Find Ads.</td></tr>';
    setupTableScrollbars();
    return;
  }
  body.innerHTML = items.map((item, i) => {
    const company = item.company || {};
    const competitors = uniqueRunningCompetitors(item.competitors);
    return `
      <tr class="row-enter" style="animation-delay:${i*12}ms">
        <td class="col-num">${i+1}</td>
        <td class="col-name">${esc(company.name || '—')}</td>
        <td class="col-category">${categoryCell(company)}</td>
        <td class="col-phone">${esc(company.phone || '—')}</td>
        <td class="col-address">${esc(company.full_address || '—')}</td>
        <td class="col-website">${websiteCell(company.website)}</td>
        <td class="col-social">${linkCell(company.facebook_url, 'FB')}</td>
        <td class="col-social">${linkCell(company.instagram_url, 'IG')}</td>
        <td style="color:var(--warning);font-size:.78rem;font-family:var(--mono)">${esc(company.ads_status || '—')}</td>
        <td class="col-address">${competitorCell(competitors[0])}</td>
        <td class="col-address">${competitorCell(competitors[1])}</td>
        <td style="color:var(--muted);font-size:.78rem">${esc(item.checked_at ? new Date(item.checked_at).toLocaleString() : '—')}</td>
        <td style="color:var(--muted);font-size:.78rem">${esc(item.reason || (item.warnings || []).join('; ') || '—')}</td>
      </tr>`;
  }).join('');
  setupTableScrollbars();
}

function finalListToCSV(items) {
  const H = ['Company','Business Category','Phone','Full Address','Website','Facebook','Instagram','Ads Status','Competitor 1','Competitor 1 Phone','Competitor 1 Address','Competitor 1 Website','Competitor 1 Facebook','Competitor 1 Instagram','Competitor 1 Ads Status','Competitor 2','Competitor 2 Phone','Competitor 2 Address','Competitor 2 Website','Competitor 2 Facebook','Competitor 2 Instagram','Competitor 2 Ads Status','Checked At','Reason','Warnings'];
  const rows = items.map(item => {
    const company = item.company || {};
    const runningCompetitors = uniqueRunningCompetitors(item.competitors);
    const c1 = runningCompetitors[0] || {};
    const c2 = runningCompetitors[1] || {};
    return [
      company.name, company.category, company.phone, company.full_address, company.website, company.facebook_url, company.instagram_url, company.ads_status,
      c1.name, c1.phone, c1.full_address, c1.website, c1.facebook_url, c1.instagram_url, c1.ads_status,
      c2.name, c2.phone, c2.full_address, c2.website, c2.facebook_url, c2.instagram_url, c2.ads_status,
      item.checked_at, item.reason, (item.warnings || []).join(' | ')
    ].map(v => `"${String(v || '').replace(/"/g,'""')}"`).join(',');
  });
  return [H.join(','), ...rows].join('\n');
}

function exportFinalList() {
  if (!currentFinalListData.length) return;
  const base = (currentFinalListFile || 'final-list.json').replace(/\.json$/i, '');
  downloadCSV(finalListToCSV(currentFinalListData), `${base}.csv`);
}

async function clearFinalList() {
  if (!currentFinalListFile || !confirm(`Delete "${currentFinalListFile}"?`)) return;
  try {
    if (isHostedMode()) {
      await hostedApi.deleteFile(currentFinalListFileMeta.id);
      showToast('Final List file deleted.');
      closeFinalListDetail();
      loadFinalList();
      return;
    }
    await fetch('/api/final-list/file/' + encodeURIComponent(currentFinalListFile), { method:'DELETE' });
    showToast('Final List file deleted.');
    closeFinalListDetail();
    loadFinalList();
  } catch { showToast('Delete failed.'); }
}

/* ════════════════════════════════════════════════
   MAP GAP
════════════════════════════════════════════════ */
let mgResults = [];
let mgCurrentScan = null;
let mgCurrentFile = null;
let mgCurrentFilter = 'all';
let mgSelectedLead = null;
let mgSelectedAudit = null;

async function startMapGapScan() {
  const niche = document.getElementById('mgNiche').value.trim();
  const city = document.getElementById('mgCity').value.trim();
  const maxResults = parseInt(document.getElementById('mgMaxResults').value, 10) || 50;
  const reviewThreshold = parseInt(document.getElementById('mgReviewThreshold').value, 10) || 20;

  if (!niche || !city) {
    showToast('Please enter both a niche and city.');
    return;
  }

  const btn = document.getElementById('mgScanBtn');
  const btnText = document.getElementById('mgScanBtnText');
  btn.disabled = true;
  btnText.textContent = 'Scanning…';
  setAgentStatus('running', 'Map Gap Scanning');

  const progressSection = document.getElementById('mgProgressSection');
  const progressLog = document.getElementById('mgProgressLog');
  const progressBar = document.getElementById('mgProgressBar');
  const progressSub = document.getElementById('mgProgressSub');
  progressSection.style.display = 'block';
  progressLog.innerHTML = '';
  progressBar.style.width = '0%';

  document.getElementById('mgDetailSection').style.display = 'none';

  if (isHostedMode()) {
    try {
      const job = await hostedApi.startJob('map-gap', { niche, city, maxResults, reviewThreshold });
      activeHostedJobs['map-gap'] = job.id;
      await hostedApi.pollJob(job.id, {
        intervalMs: 4000,
        onUpdate(nextJob) {
          renderJobLog(progressLog, nextJob.progress_log);
          updateJobProgressBar(progressBar, nextJob.progress_log);
          progressSub.textContent = nextJob.progress_step || 'Scanning Google Maps';
        },
      });
      activeHostedJobs['map-gap'] = null;
      const completedJob = await hostedApi.getJob(job.id);
      if (completedJob.status !== 'completed') throw new Error(completedJob.error_message || 'Map gap scan failed.');
      const payload = await hostedApi.readFileById(completedJob.result_file_id);
      mgResults = payload.data || [];
      mgCurrentScan = completedJob.result_summary_json || {};
      mgCurrentFile = completedJob.result_filename || 'scan-results';
      progressBar.style.width = '100%';
      showMapGapDetail(mgCurrentFile);
      progressSub.textContent = `Done — ${mgCurrentScan.count || mgResults.length} businesses, ${mgCurrentScan.targets || mgResults.filter(r => r.isTarget).length} targets.`;
      showToast(`✅ Map gap scan complete. Saved to library.`);
    } catch (err) {
      activeHostedJobs['map-gap'] = null;
      showToast('Scan failed: ' + err.message);
      progressSub.textContent = 'Error: ' + err.message;
    } finally {
      btn.disabled = false;
      btnText.textContent = 'Scan for Gaps';
      setAgentStatus('idle', 'Agent Idle');
      loadMapGapLibrary();
    }
    return;
  }

  try {
    const res = await fetch('/api/map-gap/scan/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ niche, city, maxResults, reviewThreshold }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let progressCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'progress') {
            addLog(progressLog, event.message);
            progressCount++;
            progressBar.style.width = `${Math.min(progressCount * 2, 95)}%`;
            progressSub.textContent = event.message;
          } else if (event.type === 'done') {
            progressBar.style.width = '100%';
            mgResults = [];
            mgCurrentScan = event;

            try {
              const fileRes = await fetch('/api/map-gap/file/' + encodeURIComponent(event.filename));
              mgResults = await fileRes.json();
            } catch {}

            mgCurrentFile = event.filename;
            showMapGapDetail(event.filename);
            progressSub.textContent = `Done — ${event.count} businesses, ${event.targets} targets.`;
          } else if (event.type === 'error') {
            showToast(event.message);
            progressSub.textContent = 'Error: ' + event.message;
          }
        } catch {}
      }
    }
  } catch (err) {
    showToast('Scan failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Scan for Gaps';
    setAgentStatus('idle', 'Agent Idle');
    loadMapGapLibrary();
  }
}

function renderMapGapSummary(summary) {
  document.getElementById('mgStatTotal').textContent = summary.totalBusinesses;
  document.getElementById('mgStatTargets').textContent = summary.targetCount;
  document.getElementById('mgStatAvgScore').textContent = summary.averageScore;
  document.getElementById('mgStatPct').textContent = summary.targetPercentage + '%';
}

function renderMapGapResults(results) {
  const body = document.getElementById('mgResultsBody');
  const filtered = filterMapGapResults(results);

  document.getElementById('mgResultsMeta').textContent = `${filtered.length} businesses`;

  body.innerHTML = filtered.map((r, i) => {
    const a = r.audit || {};
    const gaps = (r.gaps || []).map(g => {
      const labels = { low_reviews: 'Reviews', no_website: 'Website', no_review_responses: 'Responses', no_hours: 'Hours', no_photos: 'Photos', no_phone: 'Phone' };
      return `<span class="mg-gap-badge mg-gap-${g.startsWith('no') ? 'critical' : 'warning'}">${labels[g] || g}</span>`;
    }).join('');

    const gradeColor = a.grade === 'A' ? '#22c55e' : a.grade === 'B' ? '#84cc16' : a.grade === 'C' ? '#f59e0b' : a.grade === 'D' ? '#f97316' : '#ef4444';

    return `<tr>
      <td>${i + 1}</td>
      <td><strong>${esc(r.name)}</strong></td>
      <td class="col-truncate">${esc(r.address || '—')}</td>
      <td>${esc(r.phone || '—')}</td>
      <td class="col-truncate">${r.hasWebsite ? esc(r.website) : '<span style="color:var(--danger)">Missing</span>'}</td>
      <td>${r.rating ? r.rating + ' ★' : '—'}</td>
      <td>${r.reviewCount || 0}</td>
      <td><strong style="color:${gradeColor}">${a.percentage || 0}</strong></td>
      <td><span class="mg-grade-badge" style="background:${gradeColor}22;color:${gradeColor}">${a.grade || 'F'}</span></td>
      <td>${gaps || '<span style="color:var(--muted)">None</span>'}</td>
      <td>
        <div class="mg-actions">
          <button class="btn-sm btn-ghost" onclick="showMgAudit(${i})" title="View Audit">Audit</button>
          <button class="btn-sm btn-ghost" onclick="generateMgOutreach(${i})" title="Generate Outreach">Outreach</button>
          <button class="btn-sm btn-ghost" onclick="copyMgToCrm(${i})" title="Copy to CRM">→ CRM</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const meta = document.getElementById('mgFilterMeta');
  if (meta) meta.textContent = `${filtered.length} of ${results.length}`;
}

function filterMapGapResults(results) {
  if (mgCurrentFilter === 'all') return results;
  if (mgCurrentFilter === 'targets') return results.filter(r => r.isTarget);
  return results.filter(r => (r.gaps || []).includes(mgCurrentFilter));
}

function filterMapGapTable() {
  const query = document.getElementById('mgFilterInput').value.toLowerCase();
  if (!query) {
    renderMapGapResults(mgResults);
    return;
  }
  const filtered = mgResults.filter(r => {
    const a = r.audit || {};
    return (r.name || '').toLowerCase().includes(query) ||
           (r.address || '').toLowerCase().includes(query) ||
           (r.gaps || []).some(g => g.includes(query)) ||
           String(a.percentage || '').includes(query);
  });
  renderMapGapResults(filtered);
}

function setMapGapFilter(filter, btn) {
  mgCurrentFilter = filter;
  document.querySelectorAll('#mgChipAll, #mgChipTargets, #mgChipNoWebsite, #mgChipLowReviews').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMapGapResults(mgResults);
}

async function showMgAudit(index) {
  const r = mgResults[index];
  if (!r || !r.audit) return;

  mgSelectedLead = r;
  mgSelectedAudit = r.audit;

  const a = r.audit;
  document.getElementById('mgAuditTitle').textContent = `Audit: ${r.name}`;
  document.getElementById('mgAuditSubtitle').textContent = `Score: ${a.percentage}/100 (Grade: ${a.grade})`;

  const body = document.getElementById('mgAuditBody');
  const gapRows = (a.gaps || []).map(g => `
    <div class="mg-audit-gap mg-gap-${g.severity}">
      <div class="mg-audit-gap-label">${g.label}</div>
      <div class="mg-audit-gap-detail">${g.detail}</div>
      <div class="mg-audit-gap-score">${g.score}/${g.maxScore}</div>
    </div>
  `).join('');

  const strengthItems = (a.strengths || []).map(s => `<li>${esc(s)}</li>`).join('');

  body.innerHTML = `
    <div class="mg-audit-score-circle" style="text-align:center;margin-bottom:24px">
      <div class="mg-audit-circle" style="width:100px;height:100px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;background:conic-gradient(${a.percentage >= 70 ? '#22c55e' : a.percentage >= 40 ? '#f59e0b' : '#ef4444'} ${a.percentage * 3.6}deg, #e2e8f0 0deg)">
        <div style="width:80px;height:80px;border-radius:50%;background:var(--bg-card);display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:28px;font-weight:800;color:${a.percentage >= 70 ? '#22c55e' : a.percentage >= 40 ? '#f59e0b' : '#ef4444'}">${a.percentage}</div>
          <div style="font-size:12px;color:var(--muted)">Grade: ${a.grade}</div>
        </div>
      </div>
    </div>
    <div class="mg-audit-details" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      <div class="mg-audit-detail-card"><div style="font-size:11px;color:var(--muted)">Rating</div><div style="font-weight:600">${r.rating ? r.rating + ' ★' : 'N/A'}</div></div>
      <div class="mg-audit-detail-card"><div style="font-size:11px;color:var(--muted)">Reviews</div><div style="font-weight:600">${a.reviewCount}</div></div>
      <div class="mg-audit-detail-card"><div style="font-size:11px;color:var(--muted)">Website</div><div style="font-weight:600">${r.hasWebsite ? 'Linked' : 'Missing'}</div></div>
    </div>
    <h4 style="margin-bottom:8px">Score Breakdown</h4>
    <div style="margin-bottom:20px">
      ${mgScoreBar(a.scores.reviews, a.weights.reviews, 'Reviews')}
      ${mgScoreBar(a.scores.website, a.weights.website, 'Website')}
      ${mgScoreBar(a.scores.reviewResponses, a.weights.reviewResponses, 'Review Responses')}
      ${mgScoreBar(a.scores.profileCompleteness, a.weights.profileCompleteness, 'Profile Completeness')}
      ${mgScoreBar(a.scores.phoneReadiness, a.weights.phoneReadiness, 'Phone Readiness')}
    </div>
    <h4 style="margin-bottom:8px">Gaps (${a.gapCount})</h4>
    <div style="margin-bottom:16px">${gapRows || '<p style="color:var(--muted)">No significant gaps found.</p>'}</div>
    ${(a.strengths || []).length > 0 ? `<h4 style="margin-bottom:8px;color:#166534">Strengths</h4><ul style="padding-left:20px;color:#15803d;font-size:13px">${strengthItems}</ul>` : ''}
  `;

  document.getElementById('mgAuditModal').style.display = 'flex';
}

function mgScoreBar(score, max, label) {
  const pct = Math.round((score / max) * 100);
  const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
    <div style="width:130px;font-size:12px;color:var(--muted)">${label}</div>
    <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div>
    </div>
    <div style="width:40px;font-size:12px;font-weight:600;text-align:right">${score}/${max}</div>
  </div>`;
}

function closeMgAuditModal() {
  document.getElementById('mgAuditModal').style.display = 'none';
}

async function downloadMgAuditPdf() {
  if (!mgSelectedLead || !mgSelectedAudit) return;
  try {
    const res = await fetch('/api/map-gap/audit/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead: mgSelectedLead,
        audit: mgSelectedAudit,
        niche: document.getElementById('mgNiche').value.trim(),
        city: document.getElementById('mgCity').value.trim(),
      }),
    });
    const data = await res.json();
    if (data.success) {
      window.open('/api/map-gap/audits/' + encodeURIComponent(data.filename), '_blank');
      showToast('PDF generated and opened.');
    } else {
      showToast('Failed to generate PDF: ' + data.error);
    }
  } catch (err) {
    showToast('PDF generation failed: ' + err.message);
  }
}

async function generateMgOutreach(index) {
  const r = mgResults[index];
  if (!r || !r.audit) return;

  mgSelectedLead = r;
  mgSelectedAudit = r.audit;

  document.getElementById('mgOutreachBusiness').textContent = r.name;
  document.getElementById('mgOutreachText').value = 'Generating…';
  document.getElementById('mgOutreachModal').style.display = 'flex';

  try {
    const res = await fetch('/api/map-gap/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead: r, audit: r.audit }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('mgOutreachText').value = data.message;
    } else {
      document.getElementById('mgOutreachText').value = 'Error: ' + data.error;
    }
  } catch (err) {
    document.getElementById('mgOutreachText').value = 'Error: ' + err.message;
  }
}

function closeMgOutreachModal() {
  document.getElementById('mgOutreachModal').style.display = 'none';
}

function copyMgOutreach() {
  const text = document.getElementById('mgOutreachText').value;
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
}

async function copyMgToCrm(index) {
  const r = mgResults[index];
  if (!r) return;

  const crmLead = {
    name: r.name,
    address: r.address,
    phone: r.phone,
    website: r.website || '',
    status: 'Operational',
    category: '',
    rating: r.rating,
    reviewCount: r.reviewCount,
    auditScore: r.audit?.percentage || 0,
    auditGrade: r.audit?.grade || 'F',
    gaps: r.gaps || [],
    enriched: true,
    match_source: 'map_gap',
    map_gap_audit: r.audit,
  };

  try {
    const filesRes = await fetch('/api/crm/files');
    const files = await filesRes.json();
    const filename = files.length > 0 ? files[0].name : `map-gap-${Date.now()}.json`;

    let existing = [];
    try {
      const existingRes = await fetch('/api/crm/file/' + encodeURIComponent(filename));
      if (existingRes.ok) existing = await existingRes.json();
    } catch {}

    existing.push(crmLead);
    await fetch('/api/crm/file/' + encodeURIComponent(filename), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(existing),
    });

    showToast(`"${r.name}" copied to CRM (${filename})`);
  } catch (err) {
    showToast('Copy failed: ' + err.message);
  }
}

async function auditAllMapGap() {
  if (!mgResults.length) return;
  showToast(`Generating PDFs for ${mgResults.length} businesses…`);

  const niche = document.getElementById('mgNiche').value.trim();
  const city = document.getElementById('mgCity').value.trim();
  let count = 0;

  for (const r of mgResults) {
    if (!r.audit) continue;
    try {
      await fetch('/api/map-gap/audit/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: r, audit: r.audit, niche, city }),
      });
      count++;
    } catch {}
  }

  showToast(`${count} audit PDFs generated.`);
}

function exportMapGapCsv() {
  if (!mgResults.length) return;

  const headers = ['Name', 'Address', 'Phone', 'Website', 'Rating', 'Reviews', 'Score', 'Grade', 'Gaps', 'Is Target'];
  const rows = mgResults.map(r => [
    r.name,
    r.address || '',
    r.phone || '',
    r.website || '',
    r.rating || '',
    r.reviewCount || 0,
    r.audit?.percentage || 0,
    r.audit?.grade || 'F',
    (r.gaps || []).join('; '),
    r.isTarget ? 'Yes' : 'No',
  ]);

  const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `map-gap-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadMapGapLibrary() {
  const grid = document.getElementById('mgLibraryGrid');
  if (!grid) return;

  try {
    let files;
    if (isHostedMode()) {
      files = registerHostedFiles('map-gap', await hostedApi.listFiles('map-gap'));
    } else {
      const res = await fetch('/api/map-gap/files');
      files = await res.json();
    }

    if (!files.length) {
      grid.innerHTML = '<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:40px">No scans yet. Run your first scan above.</p>';
      return;
    }

    grid.innerHTML = files.map(f => (`
      <div class="file-card" onclick="openMapGapFile('${escAttr(f.name)}')">
        <button class="file-card-delete" onclick="event.stopPropagation();deleteMapGapLibraryFile('${escAttr(f.name)}')" title="Delete scan">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
        <div class="file-card-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div class="file-card-name">${esc(f.name)}</div>
        <div class="file-card-meta">${f.record_count || f.leadCount || 0} businesses · ${formatDate(f.created_at || f.createdAt)}</div>
      </div>
    `)).join('');
  } catch {
    grid.innerHTML = '<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:40px">Failed to load scans.</p>';
  }
}

function showMapGapDetail(filename) {
  mgCurrentFile = filename;
  const summary = {
    totalBusinesses: mgResults.length,
    targetCount: mgResults.filter(r => r.isTarget).length,
    averageScore: mgResults.length > 0 ? Math.round(mgResults.reduce((s, r) => s + (r.audit?.percentage || 0), 0) / mgResults.length) : 0,
    targetPercentage: mgResults.length > 0 ? Math.round((mgResults.filter(r => r.isTarget).length / mgResults.length) * 100) : 0,
  };
  document.getElementById('mgDetailName').textContent = filename;
  document.getElementById('mgLibrarySection').style.display = 'none';
  document.getElementById('mgDetailSection').style.display = 'block';
  renderMapGapSummary(summary);
  renderMapGapResults(mgResults);
}

async function openMapGapFile(filename) {
  try {
    let data;
    if (isHostedMode()) {
      const meta = hostedFileMeta('map-gap', filename);
      if (!meta) throw new Error('File not found');
      const payload = await hostedApi.readFileById(meta.id);
      data = payload.data;
    } else {
      const res = await fetch('/api/map-gap/file/' + encodeURIComponent(filename));
      data = await res.json();
    }
    mgResults = data || [];
    showMapGapDetail(filename);
  } catch (err) {
    showToast('Failed to open scan: ' + err.message);
  }
}

function closeMapGapDetail() {
  document.getElementById('mgDetailSection').style.display = 'none';
  document.getElementById('mgLibrarySection').style.display = 'block';
  mgCurrentFile = null;
  mgResults = [];
  mgCurrentScan = null;
}

async function deleteMapGapFile() {
  if (!mgCurrentFile) return;
  const name = confirm(`Delete "${mgCurrentFile}"?`) && mgCurrentFile;
  if (!name) return;
  try {
    if (isHostedMode()) {
      const meta = hostedFileMeta('map-gap', name);
      if (meta) await hostedApi.deleteFile(meta.id);
    } else {
      await fetch('/api/map-gap/file/' + encodeURIComponent(name), { method: 'DELETE' });
    }
    showToast('File deleted.');
    closeMapGapDetail();
    loadMapGapLibrary();
  } catch { showToast('Delete failed.'); }
}

async function deleteMapGapLibraryFile(filename) {
  if (!filename || !confirm(`Delete "${filename}"?`)) return;
  try {
    if (isHostedMode()) {
      const meta = hostedFileMeta('map-gap', filename);
      if (meta) await hostedApi.deleteFile(meta.id);
    } else {
      await fetch('/api/map-gap/file/' + encodeURIComponent(filename), { method: 'DELETE' });
    }
    showToast('File deleted.');
    loadMapGapLibrary();
  } catch { showToast('Delete failed.'); }
}

/* ════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  buildCategoryList();
  buildCountryList();
  if (isHostedMode()) {
    hostedApi.init().then(() => updateAuthUi()).catch(error => {
      console.error(error);
      showToast(error.message || 'Hosted mode failed to initialize.');
      updateAuthUi();
    });
    hostedApi.onAuthChange(() => updateAuthUi());
  } else {
    updateAuthUi();
  }
  syncStickyUiOffsets();
  setupTableScrollbars();
  if (location.pathname === '/final-list') {
    switchView('final-list');
  }
  window.addEventListener('resize', syncStickyUiOffsets);
  if (window.ResizeObserver) {
    const navEl = document.querySelector('.nav-island');
    if (navEl) {
      const navObserver = new ResizeObserver(syncStickyUiOffsets);
      navObserver.observe(navEl);
    }
  }
});
