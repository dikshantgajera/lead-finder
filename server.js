const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { scrapeLeads }            = require('./agent/scraper');
const { enrichLeadsWithProgress, stopEnrichment } = require('./agent/enricher');
const { generateSalesPitch }     = require('./agent/ai_generator');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Data directories ──────────────────────────────────────────
const DATA_DIR     = path.join(__dirname, 'data');
const LEADS_DIR    = path.join(DATA_DIR, 'leads');
const CRM_DIR      = path.join(DATA_DIR, 'crm');
const EMAILS_DIR   = path.join(DATA_DIR, 'emails');

[DATA_DIR, LEADS_DIR, CRM_DIR, EMAILS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Frontend ──────────────────────────────────────────────────
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Scrape (SSE) ──────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { category = '', country = '', city = '' } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    send('status', { message: 'Agent started...' });
    const leads = await scrapeLeads({ category, country, city },
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

// ── AI Generation ─────────────────────────────────────────────
app.post('/api/ai/generate', async (req, res) => {
  const { lead, valueProposition, baseUrl, model } = req.body;
  
  if (!lead) return res.status(400).json({ error: 'Missing lead data' });

  try {
    const email = await generateSalesPitch(lead, { valueProposition, baseUrl, model });
    res.json({ success: true, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/generate-batch/stream', async (req, res) => {
  const { leads, sourceFile, valueProposition, baseUrl, model } = req.body;

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'Missing leads array' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  const generated = [];

  try {
    send('status', { message: `Starting AI email generation for ${leads.length} selected lead(s).` });

    for (let i = 0; i < leads.length; i += 1) {
      const lead = leads[i] || {};
      const company = lead.name || `Lead ${i + 1}`;
      send('progress', {
        index: i + 1,
        total: leads.length,
        company,
        message: `[${i + 1}/${leads.length}] Generating email for ${company}...`
      });

      try {
        const email = await generateSalesPitch(lead, { valueProposition, baseUrl, model });
        const subjectMatch = email.match(/^\s*Subject:\s*(.+)$/im);
        generated.push({
          company,
          website: lead.website_full || lead.website || '',
          phone: lead.phone_full || lead.phone || '',
          address: lead.address_full || lead.address || '',
          status: lead.status || '',
          source_file: sourceFile || '',
          source_lead: company,
          service_pitch: valueProposition || '',
          model: model || '',
          generated_email: email,
          subject: subjectMatch ? subjectMatch[1].trim() : '',
          lead
        });
        send('lead_done', { index: i + 1, total: leads.length, company });
      } catch (error) {
        generated.push({
          company,
          website: lead.website_full || lead.website || '',
          phone: lead.phone_full || lead.phone || '',
          address: lead.address_full || lead.address || '',
          status: lead.status || '',
          source_file: sourceFile || '',
          source_lead: company,
          service_pitch: valueProposition || '',
          model: model || '',
          generated_email: '',
          error: error.message,
          lead
        });
        send('lead_error', {
          index: i + 1,
          total: leads.length,
          company,
          message: `${company}: ${error.message}`
        });
      }
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const sourceBase = (sourceFile || 'crm-selected').replace(/\.json$/i, '');
    const filename = uniqueJsonName(EMAILS_DIR, `${sourceBase}-ai-emails-${stamp}`);
    fs.writeFileSync(path.join(EMAILS_DIR, filename), JSON.stringify(generated, null, 2));

    send('done', {
      filename,
      count: generated.length,
      successCount: generated.filter(item => item.generated_email).length,
      errorCount: generated.filter(item => item.error).length
    });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

// ── Emails: file management ───────────────────────────────────
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

// ── Health ────────────────────────────────────────────────────
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.listen(PORT, () =>
  console.log(`\n🎯 Lead Finder Portal → http://localhost:${PORT}\n`));
