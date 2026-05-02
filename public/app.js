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
  return `<a href="${escAttr(url)}" target="_blank" rel="noopener" class="website-link">${esc(display)}</a>`;
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
    `<a href="${escAttr(url)}" target="_blank" rel="noopener" class="social-link">${esc(socialLabel(url))}</a>`
  ).join('')}</div>`;
}
function leadsToCSV(leads) {
  const H = ['Name','Address','Website','Primary Phone','All Phones','Original Phone','Google Maps Phone','Google Profile Phone','Status','Facebook','Instagram','LinkedIn','X/Twitter','YouTube','TikTok','Social Links'];
  const rows = leads.map(l =>
    [
      l.name,
      l.address_full||l.address,
      l.website_full||l.website,
      l.phone_full||l.phone,
      getLeadPhoneNumbers(l).join(' | '),
      l.phone_original || l.phone,
      l.phone_google_maps,
      l.phone_google_profile,
      l.status,
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

/* ════════════════════════════════════════════════
   CATEGORY DROPDOWN
════════════════════════════════════════════════ */
let catHighlight = -1, catOpen = false;

function buildCategoryList(filter) {
  const list = document.getElementById('categoryList');
  const q = (filter||'').trim().toLowerCase();
  const matches = q ? CATEGORIES.filter(c => c.toLowerCase().includes(q)) : CATEGORIES;
  if (!matches.length) { list.innerHTML = '<div class="category-no-results">No matching categories</div>'; return; }
  list.innerHTML = matches.map((cat,i) => {
    const cur = document.getElementById('category').value;
    let label = esc(cat);
    if (q) {
      const idx = cat.toLowerCase().indexOf(q);
      if (idx !== -1) label = esc(cat.slice(0,idx)) + `<span class="match-highlight">${esc(cat.slice(idx,idx+q.length))}</span>` + esc(cat.slice(idx+q.length));
    }
    return `<div class="category-item${cat===cur?' active':''}" data-value="${escAttr(cat)}" onmousedown="selectCategory(event,'${cat.replace(/'/g,"\\'")}'">${label}</div>`;
  }).join('');
  catHighlight = -1;
}
function openCategoryDropdown() { const w=document.getElementById('categoryWrap'); if(!w.classList.contains('open')){w.classList.add('open');catOpen=true;buildCategoryList(document.getElementById('category').value);} }
function closeCategoryDropdown() { document.getElementById('categoryWrap').classList.remove('open'); catOpen=false; }
function toggleCategoryDropdown() { catOpen ? closeCategoryDropdown() : (document.getElementById('category').focus(), openCategoryDropdown()); }
function filterCategories() { openCategoryDropdown(); buildCategoryList(document.getElementById('category').value); }
function selectCategory(e, val) { e.preventDefault(); document.getElementById('category').value=val; closeCategoryDropdown(); }
function categoryKeyNav(e) {
  if (!catOpen) { if (e.key==='ArrowDown'||e.key==='Enter') openCategoryDropdown(); return; }
  const items = document.querySelectorAll('#categoryList .category-item');
  if (!items.length) return;
  if (e.key==='ArrowDown') { e.preventDefault(); catHighlight=Math.min(catHighlight+1,items.length-1); updateCatHL(items); }
  else if (e.key==='ArrowUp') { e.preventDefault(); catHighlight=Math.max(catHighlight-1,0); updateCatHL(items); }
  else if (e.key==='Enter') { e.preventDefault(); if(catHighlight>=0&&items[catHighlight]) document.getElementById('category').value=items[catHighlight].dataset.value; closeCategoryDropdown(); }
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
  if (view === 'emails') loadEmailsLibrary();
}

/* ════════════════════════════════════════════════
   SEARCH
════════════════════════════════════════════════ */
let sessionLeads = [];
let isSearching  = false;

function startSearch() {
  if (isSearching) return;
  const category = document.getElementById('category').value.trim();
  const country  = document.getElementById('country').value.trim();
  const city     = document.getElementById('city').value.trim();
  if (!category && !country && !city) { showToast('Fill at least one search field.'); return; }

  isSearching = true;
  sessionLeads = [];
  setAgentStatus('running', 'Agent Running…');
  document.getElementById('searchBtn').disabled = true;
  document.getElementById('searchBtnText').textContent = 'Searching…';
  document.getElementById('progressSection').style.display = 'block';
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('progressLog').innerHTML = '';

  const evtSource = new EventSource('/api/search?' + new URLSearchParams({ category, country, city }));
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

function finishSearch(leads) {
  isSearching = false;
  sessionLeads = leads;
  document.getElementById('searchBtn').disabled = false;
  document.getElementById('searchBtnText').textContent = 'Find Leads';
  document.getElementById('progressSection').style.display = 'none';

  if (!leads.length) { setAgentStatus('idle', 'No Results'); showToast('No leads found.'); return; }

  setAgentStatus('done', leads.length + ' leads found');
  renderResultsTable(leads);
  document.getElementById('resultsSection').style.display = 'block';
  document.getElementById('resultsSection').scrollIntoView({ behavior:'smooth', block:'start' });
  openSaveModal();
}

function resetSearch() {
  isSearching = false;
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
  try {
    const r = await fetch('/api/leads/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fn, leads: sessionLeads })
    });
    const d = await r.json();
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
    const r = await fetch('/api/leads/files');
    const files = await r.json();
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
    const r = await fetch('/api/leads/file/' + encodeURIComponent(name));
    currentLeadsData = await r.json();
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
    const r = await fetch('/api/leads/file/' + encodeURIComponent(currentLeadsFile), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: remaining })
    });
    const d = await r.json();
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
    const r = await fetch('/api/crm/files');
    const files = await r.json();
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
    const r = await fetch('/api/crm/file/' + encodeURIComponent(name));
    currentCrmData = await r.json();
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

function closeCrmDetail() {
  document.getElementById('crmDetail').style.display = 'none';
  document.getElementById('crmLibrary').style.display = 'block';
  currentCrmFile = null;
  currentCrmData = [];
  crmSelectedIndices.clear();
}

// Filter helpers
function getCrmFilteredEntries() {
  const q = (document.getElementById('crmFilterInput').value || '').toLowerCase();
  return currentCrmData.map((lead, origIdx) => ({ lead, origIdx })).filter(entry => {
    const l = entry.lead;
    const text = [l.name, l.address_full, l.address, l.status, l.website, l.phone, ...getLeadPhoneNumbers(l), ...getLeadSocialLinks(l)].join(' ').toLowerCase();
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
  const emailBtn  = document.getElementById('crmGenerateEmailsBtn');
  const countEl   = document.getElementById('crmSelectedCount');
  const emailCountEl = document.getElementById('crmEmailSelectedCount');
  deleteBtn.style.display = count > 0 ? '' : 'none';
  if (emailBtn) emailBtn.style.display = count > 0 ? '' : 'none';
  if (countEl) countEl.textContent = count;
  if (emailCountEl) emailCountEl.textContent = count;
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
      <td class="col-address">${esc(l.address_full||l.address||'—')}</td>
      <td class="col-website">${websiteCell(l.website_full||l.website)}</td>
      <td class="col-social">${socialCell(l)}</td>
      <td class="col-phone">${phoneCell(l)}</td>
      <td class="col-status">${statusBadge(l.status)}</td>
      <td style="color:${confColor};font-family:var(--mono);font-size:.82rem">${conf}%</td>
      <td style="color:var(--muted);font-size:.78rem">${esc(l.match_source||'—')}</td>
      <td>
        <button class="btn-ghost" style="padding:4px 8px;font-size:0.75rem;" onclick="openAiModal(${i})">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Pitch
        </button>
      </td>
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

function getAiValueProposition() {
  const selectVal = document.getElementById('aiServiceSelect').value;
  return selectVal === 'custom'
    ? document.getElementById('aiValueProp').value.trim()
    : selectVal;
}

function saveAiSettings() {
  const baseUrl = document.getElementById('aiBaseUrl').value.trim();
  const modelName = document.getElementById('aiModelName').value.trim();
  localStorage.setItem('aiBaseUrl', baseUrl);
  localStorage.setItem('aiModelName', modelName);
  return { baseUrl, modelName };
}

function hydrateAiSettings() {
  const savedUrl = localStorage.getItem('aiBaseUrl');
  const savedModel = localStorage.getItem('aiModelName');
  if (savedUrl) document.getElementById('aiBaseUrl').value = savedUrl;
  if (savedModel) document.getElementById('aiModelName').value = savedModel;
}

async function generateSelectedCrmEmails() {
  if (!crmSelectedIndices.size || !currentCrmFile) return;
  hydrateAiSettings();

  const leads = [...crmSelectedIndices]
    .sort((a, b) => a - b)
    .map(i => currentCrmData[i])
    .filter(Boolean);

  if (!leads.length) return;

  const estimatedMins = Math.max(1, Math.ceil((leads.length * 45) / 60));
  if (!confirm(`Generate AI emails for ${leads.length} selected lead(s)?\n\nEstimated time: ~${estimatedMins} minute${estimatedMins > 1 ? 's' : ''} with your local llama.cpp speed.\n\nProgress will be shown on this CRM page and the result will be saved to Email List.`)) return;

  const { baseUrl, modelName } = saveAiSettings();
  const valueProp = getAiValueProposition();
  const btn = document.getElementById('crmGenerateEmailsBtn');
  const panel = document.getElementById('crmEmailProgress');
  const title = document.getElementById('crmEmailProgressTitle');
  const sub = document.getElementById('crmEmailProgressSub');
  const count = document.getElementById('crmEmailProgressCount');
  const bar = document.getElementById('crmEmailProgressBar');
  const log = document.getElementById('crmEmailLog');

  btn.disabled = true;
  panel.style.display = 'block';
  title.textContent = 'Generating selected emails...';
  sub.textContent = 'Connecting to local AI model. Each completed lead will update here.';
  count.textContent = `0 / ${leads.length}`;
  bar.style.width = '0%';
  log.innerHTML = '';
  setAgentStatus('running', 'AI emails running...');

  try {
    const res = await fetch('/api/ai/generate-batch/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leads,
        sourceFile: currentCrmFile,
        valueProposition: valueProp,
        baseUrl,
        model: modelName
      })
    });

    if (!res.ok || !res.body) {
      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}
      throw new Error(data.error || raw || 'Failed to start batch generation');
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    function updateProgress(done, total) {
      count.textContent = `${done} / ${total}`;
      bar.style.width = `${Math.round((done / total) * 100)}%`;
    }

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
          if (d.type === 'status' || d.type === 'progress') {
            addLog(log, d.message);
            if (d.index && d.total) {
              sub.textContent = d.company ? `Working on ${d.company}` : d.message;
              updateProgress(Math.max(0, d.index - 1), d.total);
            }
          }
          if (d.type === 'lead_done' || d.type === 'lead_error') {
            addLog(log, d.type === 'lead_done' ? `Saved email for ${d.company}.` : `Failed: ${d.message}`);
            updateProgress(d.index, d.total);
          }
          if (d.type === 'done') {
            title.textContent = 'Email file saved';
            sub.textContent = `${d.successCount} generated, ${d.errorCount} failed. Saved as ${d.filename}.`;
            updateProgress(d.count, d.count || leads.length);
            showToast(`Saved to Email List: ${d.filename}`);
            crmSelectedIndices.clear();
            renderCrmDetailTable();
            setAgentStatus('done', 'AI emails complete');
          }
          if (d.type === 'error') {
            throw new Error(d.message);
          }
        } catch (error) {
          throw error;
        }
      });
      await pump();
    }

    await pump();
  } catch (error) {
    title.textContent = 'Email generation failed';
    sub.textContent = error.message;
    addLog(log, `Error: ${error.message}`);
    showToast('Email generation failed: ' + error.message, 7000);
    setAgentStatus('error', 'AI email error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteCrmFile() {
  if (!currentCrmFile || !confirm(`Delete "${currentCrmFile}"?`)) return;
  try {
    await fetch('/api/crm/file/' + encodeURIComponent(currentCrmFile), { method:'DELETE' });
    showToast('File deleted.');
    closeCrmDetail();
    loadCrmLibrary();
  } catch { showToast('Delete failed.'); }
}


/* ════════════════════════════════════════════════
   EMAIL LIST LIBRARY
════════════════════════════════════════════════ */
let currentEmailsFile = null;
let currentEmailsData = [];

async function loadEmailsLibrary() {
  const grid = document.getElementById('emailsGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="file-empty">Loading…</div>';
  document.getElementById('emailsDetail').style.display  = 'none';
  document.getElementById('emailsLibrary').style.display = 'block';
  try {
    const r = await fetch('/api/emails/files');
    const files = await r.json();
    if (!files.length) {
      grid.innerHTML = '<div class="file-empty">No email list files yet.</div>';
      return;
    }
    grid.innerHTML = files.map(f => `
      <div class="file-card email-card" onclick="openEmailsFile('${escAttr(f.name)}')">
        <div class="file-icon" style="background:rgba(117,169,173,.12);color:var(--cyan)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
        <div class="file-info">
          <h4>${esc(f.name)}</h4>
          <p>${f.leadCount} contacts · ${formatDate(f.createdAt)}</p>
        </div>
      </div>`).join('');
  } catch { grid.innerHTML = '<div class="file-empty">Failed to load email lists.</div>'; }
}

async function openEmailsFile(name) {
  try {
    const r = await fetch('/api/emails/file/' + encodeURIComponent(name));
    currentEmailsData = await r.json();
    currentEmailsFile = name;
    document.getElementById('emailsLibrary').style.display = 'none';
    document.getElementById('emailsDetail').style.display  = 'block';
    document.getElementById('emailsDetailName').textContent = name;
    renderEmailsDetailTable(currentEmailsData);
  } catch { showToast('Could not open email list file.'); }
}

function closeEmailsDetail() {
  document.getElementById('emailsDetail').style.display  = 'none';
  document.getElementById('emailsLibrary').style.display = 'block';
  currentEmailsFile = null;
  currentEmailsData = [];
}

function renderEmailsDetailTable(contacts) {
  document.getElementById('emailsDetailBody').innerHTML = contacts.map((c, i) => `
    <tr class="row-enter" style="animation-delay:${i*12}ms">
      <td class="col-num">${i+1}</td>
      <td class="col-name">${esc(c.company || '—')}</td>
      <td class="col-website">${websiteCell(c.website)}</td>
      <td class="col-person" style="color:var(--cyan);font-weight:700">${esc(c.service_pitch || c.person_name || '—')}</td>
      <td class="col-jobtitle">${esc(c.subject || c.job_title || '—')}</td>
      <td class="col-email">${emailBodyCell(c)}</td>
      <td style="color:var(--muted);font-size:.78rem;font-family:var(--mono)">${esc(c.error ? 'Failed' : (c.status || c.seniority || 'Generated'))}</td>
      <td style="color:var(--muted);font-size:.78rem">${esc(c.source_lead || '—')}</td>
    </tr>`).join('');
  setupTableScrollbars();
}

function emailBodyCell(c) {
  if (c.generated_email) {
    return `<textarea class="email-preview" readonly>${esc(c.generated_email)}</textarea>`;
  }
  if (c.error) {
    return `<span class="col-empty">${esc(c.error)}</span>`;
  }
  return `<a href="mailto:${escAttr(c.email)}" class="email-link">${esc(c.email || '—')}</a>`;
}

function emailsToCSV(contacts) {
  const H = ['Company','Website','Service Or Person','Subject Or Job Title','Generated Email Or Email','Status','Source Lead','Address','Phone'];
  const rows = contacts.map(c =>
    [
      c.company,
      c.website,
      c.service_pitch || c.person_name,
      c.subject || c.job_title,
      c.generated_email || c.email,
      c.error ? 'Failed: ' + c.error : (c.status || c.seniority),
      c.source_lead,
      c.address,
      c.phone
    ]
    .map(v => `"${(v||'').replace(/"/g,'""')}"`).join(','));
  return [H.join(','), ...rows].join('\n');
}

function exportEmailsFile() {
  if (!currentEmailsData.length) return;
  downloadCSV(emailsToCSV(currentEmailsData), currentEmailsFile.replace('.json','.csv'));
}

async function deleteEmailsFile() {
  if (!currentEmailsFile || !confirm(`Delete "${currentEmailsFile}"?`)) return;
  try {
    await fetch('/api/emails/file/' + encodeURIComponent(currentEmailsFile), { method:'DELETE' });
    showToast('File deleted.');
    closeEmailsDetail();
    loadEmailsLibrary();
  } catch { showToast('Delete failed.'); }
}

/* ════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  buildCategoryList();
  buildCountryList();
  syncStickyUiOffsets();
  setupTableScrollbars();
  window.addEventListener('resize', syncStickyUiOffsets);
  if (window.ResizeObserver) {
    const navEl = document.querySelector('.nav-island');
    if (navEl) {
      const navObserver = new ResizeObserver(syncStickyUiOffsets);
      navObserver.observe(navEl);
    }
  }
});

/* ════════════════════════════════════════════════
   AI GENERATOR
════════════════════════════════════════════════ */
let currentAiLeadIndex = null;

function openAiModal(index) {
  currentAiLeadIndex = index;
  const rows = getCrmFilteredRows();
  const lead = rows[index];
  
  document.getElementById('aiLeadName').textContent = lead.name || 'this business';
  document.getElementById('aiEmailResult').value = '';
  document.getElementById('aiCopyBtn').style.display = 'none';
  hydrateAiSettings();
  
  document.getElementById('aiModal').style.display = 'grid';
}

function closeAiModal() {
  document.getElementById('aiModal').style.display = 'none';
  currentAiLeadIndex = null;
  document.getElementById('aiSettingsPanel').style.display = 'none';
}

function toggleAiSettings() {
  const panel = document.getElementById('aiSettingsPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function handleAiServiceChange() {
  const select = document.getElementById('aiServiceSelect');
  const customWrapper = document.getElementById('aiCustomPropWrapper');
  if (select.value === 'custom') {
    customWrapper.style.display = 'block';
  } else {
    customWrapper.style.display = 'none';
  }
}

async function generateAiPitch() {
  if (currentAiLeadIndex === null) return;
  const rows = getCrmFilteredRows();
  const lead = rows[currentAiLeadIndex];
  
  const valueProp = getAiValueProposition();
  const { baseUrl, modelName } = saveAiSettings();
  
  const btn = document.getElementById('aiGenerateBtn');
  const btnText = document.getElementById('aiGenerateBtnText');
  
  btn.disabled = true;
  btnText.textContent = 'Generating...';
  document.getElementById('aiEmailResult').value = 'Connecting to local AI model...';
  
  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead, valueProposition: valueProp, baseUrl, model: modelName })
    });

    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`Server returned non-JSON response: ${raw.trim().slice(0, 160) || 'empty response'}`);
    }

    if (!res.ok) throw new Error(data.error || 'Failed to generate');
    
    document.getElementById('aiEmailResult').value = data.email;
    document.getElementById('aiCopyBtn').style.display = 'inline-flex';
    showToast('✨ AI pitch generated!');
  } catch (err) {
    document.getElementById('aiEmailResult').value = `Error: ${err.message}\nCheck that your local model server is running and that the Base URL points to the API endpoint, such as http://127.0.0.1:8080 or http://127.0.0.1:8080/v1 for llama.cpp.`;
    showToast('Failed to generate pitch');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Regenerate Pitch';
  }
}

function copyAiEmail() {
  const text = document.getElementById('aiEmailResult').value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard');
  }).catch(err => {
    showToast('Failed to copy text');
  });
}
