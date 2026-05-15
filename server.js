const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { spawn } = require('child_process');
const { scrapeLeads, discoverLeadPages } = require('./agent/scraper');
const { enrichLeadsWithProgress, stopEnrichment } = require('./agent/enricher');
const { run: checkFacebookPageAds } = require('./scripts/check-fb-page-ads');
const { scanForGaps } = require('./agent/map-gap-scanner');
const { auditBusiness, generateSummary } = require('./agent/map-gap-auditor');
const { generateAuditPdf } = require('./agent/map-gap-pdf');
const { generateMapGapOutreach } = require('./agent/ai_generator');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Data directories ──────────────────────────────────────────
const DATA_DIR     = path.join(__dirname, 'data');
const LEADS_DIR    = path.join(DATA_DIR, 'leads');
const CRM_DIR      = path.join(DATA_DIR, 'crm');
const EMAILS_DIR   = path.join(DATA_DIR, 'emails');
const FINAL_LIST_DIR  = path.join(DATA_DIR, 'final-list');
const MAP_GAP_DIR  = path.join(DATA_DIR, 'map-gap');
const AUDITS_DIR   = path.join(DATA_DIR, 'audits');
const LEGACY_FINAL_LIST_FILE = path.join(DATA_DIR, 'final-list.json');

[DATA_DIR, LEADS_DIR, CRM_DIR, EMAILS_DIR, FINAL_LIST_DIR, MAP_GAP_DIR, AUDITS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Frontend ──────────────────────────────────────────────────
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/final-list', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Scrape (SSE) ──────────────────────────────────────────────
app.get('/api/search/pages', async (req, res) => {
  const { category = '', country = '', city = '' } = req.query;

  try {
    const pages = await discoverLeadPages({ category, country, city });
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not discover available pages' });
  }
});

app.get('/api/search', async (req, res) => {
  const { category = '', country = '', city = '', startPage = '1' } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    send('status', { message: 'Agent started...' });
    const leads = await scrapeLeads({ category, country, city, startPage, targetLeadCount: 100 },
      msg => send('progress', { message: msg }));
    send('done', { leads });
  } catch (err) {
    send('error', { message: err.message || 'Unknown error' });
  } finally {
    res.end();
  }
});

// ── Leads: file management ────────────────────────────────────
function safeName(name) {
  return name.replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '-').trim();
}

function uniqueJsonName(dir, baseName) {
  const base = safeName(baseName || 'emails') || 'emails';
  let filename = `${base}.json`;
  let i = 2;
  while (fs.existsSync(path.join(dir, filename))) {
    filename = `${base}-${i}.json`;
    i += 1;
  }
  return filename;
}

function readDirMeta(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(filename => {
      const fp   = path.join(dir, filename);
      const stat = fs.statSync(fp);
      let count  = 0;
      try { count = JSON.parse(fs.readFileSync(fp, 'utf8')).length; } catch {}
      return { name: filename, leadCount: count, size: stat.size,
               createdAt: stat.birthtime.toISOString(),
               modifiedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function finalListNameForSource(sourceFile) {
  const base = safeName(path.basename(sourceFile || '', '.json')) || `final-list-${new Date().toISOString().slice(0, 10)}`;
  return base.startsWith('leads-')
    ? `final-list-${base.slice('leads-'.length)}.json`
    : `${base}-final-list.json`;
}

function finalListFilePath(name) {
  const safe = path.basename(name || '');
  if (!safe || safe !== name || !safe.endsWith('.json')) return null;
  if (safe === 'final-list.json') return LEGACY_FINAL_LIST_FILE;
  return path.join(FINAL_LIST_DIR, safe);
}

function readFinalListArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function readAllFinalLists() {
  const items = [];
  if (fs.existsSync(LEGACY_FINAL_LIST_FILE)) items.push(...readFinalListArray(LEGACY_FINAL_LIST_FILE));
  for (const file of fs.readdirSync(FINAL_LIST_DIR).filter(f => f.endsWith('.json'))) {
    items.push(...readFinalListArray(path.join(FINAL_LIST_DIR, file)));
  }
  return items;
}

app.get('/api/leads/files', (req, res) => {
  try { res.json(readDirMeta(LEADS_DIR)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/save', (req, res) => {
  const { filename, leads } = req.body;
  if (!filename || !leads) return res.status(400).json({ error: 'Missing filename or leads' });
  const fname = safeName(filename) + '.json';
  try {
    fs.writeFileSync(path.join(LEADS_DIR, fname), JSON.stringify(leads, null, 2));
    res.json({ success: true, filename: fname, count: leads.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leads/file/:name', (req, res) => {
  const fp = path.join(LEADS_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { res.json(JSON.parse(fs.readFileSync(fp, 'utf8'))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/leads/file/:name', (req, res) => {
  const fp = path.join(LEADS_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(fp); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Update (overwrite) leads in a file — used by bulk-delete from frontend
app.patch('/api/leads/file/:name', (req, res) => {
  const fp = path.join(LEADS_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  const { leads } = req.body;
  if (!Array.isArray(leads)) return res.status(400).json({ error: 'leads must be an array' });
  try {
    fs.writeFileSync(fp, JSON.stringify(leads, null, 2));
    res.json({ success: true, count: leads.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CRM: file management ──────────────────────────────────────
app.get('/api/crm/files', (req, res) => {
  try { res.json(readDirMeta(CRM_DIR)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/crm/file/:name', (req, res) => {
  const fp = path.join(CRM_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { res.json(JSON.parse(fs.readFileSync(fp, 'utf8'))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/crm/file/:name', (req, res) => {
  const fp = path.join(CRM_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(fp); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Overwrite CRM file after bulk-delete from frontend
app.patch('/api/crm/file/:name', (req, res) => {
  const fp = path.join(CRM_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  const body = req.body;
  const leads = Array.isArray(body) ? body : body.leads;
  if (!Array.isArray(leads)) return res.status(400).json({ error: 'Body must be array or {leads:[]}' });
  try {
    fs.writeFileSync(fp, JSON.stringify(leads, null, 2));
    res.json({ success: true, count: leads.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/crm/find-ads', async (req, res) => {
  const { sourceFile, country = 'ALL', selectedIndexes, dryRun = false } = req.body || {};
  try {
    const outputFile = path.join(
      FINAL_LIST_DIR,
      `fb-ad-status-${safeName(path.basename(sourceFile || 'crm', '.json'))}-${String(country || 'ALL').toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    const result = await checkFacebookPageAds({
      sourceFile,
      country: country || 'ALL',
      selectedIndexes,
      outputFile,
      dryRun,
    });
    res.json({
      ...result,
      finalList: result.results,
      finalListPath: result.outputPath,
      notRunningAds: result.notRunningAds,
    });
  } catch (e) {
    const status = /not found/i.test(e.message) ? 404 : 400;
    res.status(status).json({
      success: false,
      error: e.message,
      progressMessages: Array.isArray(e.progressMessages) ? e.progressMessages : [],
    });
  }
});

// ── Enrichment (SSE stream) ───────────────────────────────────
app.post('/api/enrich/stream', async (req, res) => {
  const { filename, selectedIndexes } = req.body;
  if (!filename) return res.status(400).json({ error: 'Missing filename' });

  const leadsPath = path.join(LEADS_DIR, filename);
  if (!fs.existsSync(leadsPath))
    return res.status(404).json({ error: 'Leads file not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    const leads = JSON.parse(fs.readFileSync(leadsPath, 'utf8'));
    const selected = Array.isArray(selectedIndexes)
      ? [...new Set(selectedIndexes)]
          .filter(i => Number.isInteger(i) && i >= 0 && i < leads.length)
          .sort((a, b) => a - b)
          .map(i => leads[i])
      : [];
    const leadsToEnrich = selected.length ? selected : leads;

    send('status', {
      message: selected.length
        ? `Starting enrichment of ${selected.length} selected lead(s)…`
        : `Starting enrichment of ${leads.length} leads…`
    });

    const enriched = await enrichLeadsWithProgress(
      leadsToEnrich,
      msg  => send('progress', { message: msg }),
      lead => send('lead_done', { lead })
    );

    fs.writeFileSync(path.join(CRM_DIR, filename), JSON.stringify(enriched, null, 2));
    send('done', { filename, count: enriched.length });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

// ── Stop enrichment ──────────────────────────────────────────
app.post('/api/enrich/stop', (req, res) => {
  stopEnrichment();
  res.json({ stopped: true });
});

// ── Facebook Page ID Scraper (SSE stream) ─────────────────────
// POST /api/crm/fb-page-ids/stream
// Body: { sourceFile, allCrm, selectedIndexes, limit, headless, sourceFallback, updateCrm }
// Streams SSE events: status | progress | lead_done | done | error
app.post('/api/crm/fb-page-ids/stream', async (req, res) => {
  const {
    sourceFile,
    allCrm = false,
    selectedIndexes,
    limit,
    headless = false,
    sourceFallback = false,
    updateCrm = true,
  } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let childDone = false;
  let clientClosed = false;

  const send = (type, data) => {
    if (clientClosed || res.writableEnded || res.destroyed) return;
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  // Scraper auto-generates a timestamped filename — capture it from stdout
  let detectedOutputName = null;

  const args = [
    path.join(__dirname, 'agent', 'fb_page_id_scraper.js'),
  ];
  if (allCrm) args.push('--all-crm');
  else if (sourceFile) args.push('--file', path.basename(sourceFile));
  if (!allCrm && Array.isArray(selectedIndexes)) {
    const indexes = [...new Set(selectedIndexes)]
      .map(index => Number.parseInt(index, 10))
      .filter(index => Number.isInteger(index) && index >= 0)
      .sort((a, b) => a - b);
    if (indexes.length) args.push('--selected-indexes', indexes.join(','));
  }
  if (limit && Number.isInteger(Number(limit))) args.push('--limit', String(limit));
  if (headless) args.push('--headless');
  if (sourceFallback) args.push('--source-fallback');
  if (updateCrm) args.push('--update-crm');

  send('status', { message: 'Starting Facebook Page ID scraper…' });

  const child = spawn(process.execPath, args, {
    cwd: __dirname,
    env: { ...process.env },
  });

  let buffer = '';
  let foundFromEvents = 0;
  let notFoundFromEvents = 0;
  let errorsFromEvents = 0;
  let crmRowsUpdated = 0;
  let crmFilesUpdated = '';

  function processLine(line) {
    line = line.trim();
    if (!line) return;

    // Capture the output filename the scraper chose
    const outMatch = line.match(/💾 Output\s*:\s*(.+\.json)/);
    if (outMatch) { detectedOutputName = outMatch[1].trim(); }

    // Parse structured progress from stdout markers
    if (line.startsWith('→ [')) {
      const nameMatch = line.match(/→ \[(.+?)\]/);
      send('progress', { message: line, company: nameMatch ? nameMatch[1] : '' });
    } else if (line.includes('✅ Page ID')) {
      const idMatch = line.match(/Page ID[^:]*:\s*(\d+)/);
      foundFromEvents += 1;
      send('lead_done', { message: line, page_id: idMatch ? idMatch[1] : '' });
    } else if (line.includes('⚠') || line.includes('❌')) {
      if (line.includes('Page ID not found')) notFoundFromEvents += 1;
      if (line.includes('❌')) errorsFromEvents += 1;
      send('progress', { message: line });
    } else if (line.includes('💾 Saved')) {
      send('progress', { message: line });
    } else if (line.includes('CRM rows updated')) {
      const updatedMatch = line.match(/CRM rows updated\s*:\s*(\d+)/);
      if (updatedMatch) crmRowsUpdated = Number(updatedMatch[1]) || 0;
      send('status', { message: line });
    } else if (line.includes('CRM files updated')) {
      const filesMatch = line.match(/CRM files updated\s*:\s*(.+)$/);
      if (filesMatch) crmFilesUpdated = filesMatch[1].trim();
      send('status', { message: line });
    } else if (line.startsWith('📋') || line.startsWith('📊') || line.startsWith('🔗') || line.startsWith('🎯') || line.startsWith('💾') || line.startsWith('🔎') || line.startsWith('📝') || line.startsWith('☑️')) {
      send('status', { message: line });
    } else if (line.includes('Done!') || line.includes('═══')) {
      // Summary block — handled in close
    } else {
      send('progress', { message: line });
    }
  }

  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) processLine(line);
  });

  child.stderr.on('data', chunk => {
    const text = chunk.toString().trim();
    if (text) send('progress', { message: `[stderr] ${text}` });
  });

  child.on('error', err => {
    childDone = true;
    send('error', { message: `Could not start scraper: ${err.message}` });
    if (!res.writableEnded && !res.destroyed) res.end();
  });

  child.on('close', (code, signal) => {
    childDone = true;
    if (buffer.trim()) processLine(buffer.trim());

    if (updateCrm) {
      if (code === 0) {
        send('done', {
          filename: sourceFile || 'CRM',
          count: foundFromEvents + notFoundFromEvents + errorsFromEvents,
          found: foundFromEvents,
          notFound: notFoundFromEvents,
          errors: errorsFromEvents,
          updated: crmRowsUpdated,
          crmFilesUpdated,
          message: `Done — ${foundFromEvents} Page IDs found and ${crmRowsUpdated} CRM row(s) updated.`,
        });
      } else {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        send('error', { message: `Scraper exited with ${reason}` });
      }
      if (!res.writableEnded && !res.destroyed) res.end();
      return;
    }

    // Use detected name, or fall back to newest fb-page-ids-* file in emails dir
    let outputName = detectedOutputName;
    if (!outputName) {
      try {
        const candidates = fs.readdirSync(EMAILS_DIR)
          .filter(f => f.startsWith('fb-page-ids-') && f.endsWith('.json'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(EMAILS_DIR, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        if (candidates.length) outputName = candidates[0].name;
      } catch {}
    }

    let results = [];
    if (outputName) {
      try { results = JSON.parse(fs.readFileSync(path.join(EMAILS_DIR, outputName), 'utf8')); } catch {}
    }

    const found    = results.filter(r => r.status === 'found').length;
    const notFound = results.filter(r => r.status === 'not_found').length;
    const errors   = results.filter(r => r.status === 'error').length;
    if (code === 0 || results.length > 0) {
      send('done', {
        filename: outputName || 'fb-page-ids.json',
        count: results.length,
        found,
        notFound,
        errors,
        message: `Done — ${found} Page IDs found, ${notFound} not found, ${errors} errors.`,
      });
    } else {
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      send('error', { message: `Scraper exited with ${reason}` });
    }
    if (!res.writableEnded && !res.destroyed) res.end();
  });

  res.on('close', () => {
    clientClosed = true;
    if (!childDone && !child.killed) child.kill();
  });
});

// ── Facebook Page ID reports: file management ─────────────────
app.get('/api/emails/files', (req, res) => {
  try { res.json(readDirMeta(EMAILS_DIR)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/emails/file/:name', (req, res) => {
  const fp = path.join(EMAILS_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { res.json(JSON.parse(fs.readFileSync(fp, 'utf8'))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/emails/file/:name', (req, res) => {
  const fp = path.join(EMAILS_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(fp); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Final List: saved "not running ads" companies ─────────────
app.get('/api/final-list/files', (req, res) => {
  try {
    const files = readDirMeta(FINAL_LIST_DIR);
    if (fs.existsSync(LEGACY_FINAL_LIST_FILE)) {
      const stat = fs.statSync(LEGACY_FINAL_LIST_FILE);
      files.push({
        name: 'final-list.json',
        leadCount: readFinalListArray(LEGACY_FINAL_LIST_FILE).length,
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      });
      files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/final-list/file/:name', (req, res) => {
  const fp = finalListFilePath(req.params.name);
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { res.json(readFinalListArray(fp)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/final-list/file/:name', (req, res) => {
  const fp = finalListFilePath(req.params.name);
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(fp); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/final-list', (req, res) => {
  try {
    res.json(readAllFinalLists());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/final-list', (req, res) => {
  try {
    for (const file of fs.readdirSync(FINAL_LIST_DIR).filter(f => f.endsWith('.json'))) {
      fs.unlinkSync(path.join(FINAL_LIST_DIR, file));
    }
    if (fs.existsSync(LEGACY_FINAL_LIST_FILE)) fs.writeFileSync(LEGACY_FINAL_LIST_FILE, JSON.stringify([], null, 2));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Map Gap: scan Google Maps for gaps (SSE stream) ────────────
app.post('/api/map-gap/scan/stream', async (req, res) => {
  const { niche, city, maxResults = 50, reviewThreshold = 20 } = req.body || {};
  if (!niche || !city) return res.status(400).json({ error: 'Missing niche or city' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    const results = await scanForGaps({
      niche, city, maxResults, reviewThreshold,
      onProgress: msg => send('progress', { message: msg }),
    });

    const audited = results.map(r => ({
      ...r,
      audit: auditBusiness(r, { reviewThreshold }),
    }));

    const summary = generateSummary(audited.map(r => r.audit));
    const filename = `map-gap-${safeName(niche)}-${safeName(city)}-${new Date().toISOString().slice(0, 10)}.json`;
    fs.writeFileSync(path.join(MAP_GAP_DIR, filename), JSON.stringify(audited, null, 2));

    send('done', {
      filename,
      count: audited.length,
      targets: audited.filter(r => r.isTarget).length,
      summary,
    });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

// ── Map Gap: generate audit PDF ────────────────────────────────
app.post('/api/map-gap/audit/pdf', async (req, res) => {
  const { lead, audit, niche = '', city = '' } = req.body || {};
  if (!lead || !audit) return res.status(400).json({ error: 'Missing lead or audit data' });

  try {
    const filename = `audit-${safeName(lead.name)}-${Date.now()}.pdf`;
    const outputPath = path.join(AUDITS_DIR, filename);
    await generateAuditPdf(audit, outputPath, { niche, city });
    res.json({ success: true, filename, path: filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Map Gap: generate outreach message ─────────────────────────
app.post('/api/map-gap/outreach', async (req, res) => {
  const { lead, audit } = req.body || {};
  if (!lead || !audit) return res.status(400).json({ error: 'Missing lead or audit data' });

  try {
    const message = await generateMapGapOutreach(lead, audit);
    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Map Gap: result files ──────────────────────────────────────
app.get('/api/map-gap/files', (req, res) => {
  try { res.json(readDirMeta(MAP_GAP_DIR)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/map-gap/file/:name', (req, res) => {
  const fp = path.join(MAP_GAP_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { res.json(JSON.parse(fs.readFileSync(fp, 'utf8'))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/map-gap/file/:name', (req, res) => {
  const fp = path.join(MAP_GAP_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(fp); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Map Gap: audit PDF files ───────────────────────────────────
app.get('/api/map-gap/audits', (req, res) => {
  try {
    const files = fs.readdirSync(AUDITS_DIR)
      .filter(f => f.endsWith('.pdf'))
      .map(filename => {
        const fp = path.join(AUDITS_DIR, filename);
        const stat = fs.statSync(fp);
        return { name: filename, size: stat.size, createdAt: stat.birthtime.toISOString() };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/map-gap/audits/:name', (req, res) => {
  const fp = path.join(AUDITS_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(fp);
});

app.delete('/api/map-gap/audits/:name', (req, res) => {
  const fp = path.join(AUDITS_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(fp); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Health ────────────────────────────────────────────────────
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.listen(PORT, () =>
  console.log(`\n🎯 Lead Finder Portal → http://0.0.0.0:${PORT}\n`));
