#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { scrapeLeads } = require('../../agent/scraper');
const { enrichLeadsWithProgress } = require('../../agent/enricher');
const { scanForGaps } = require('../../agent/map-gap-scanner');
const { auditBusiness, generateSummary } = require('../../agent/map-gap-auditor');
const fbPageIdScraper = require('../../agent/fb_page_id_scraper');
const adsChecker = require('../check-fb-page-ads');
const {
  appendProgress,
  downloadFile,
  findFileById,
  getJob,
  isCancellationRequested,
  saveFileForUser,
  updateJob,
} = require('./supabase');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const CRM_DIR = path.join(DATA_DIR, 'crm');
const EMAILS_DIR = path.join(DATA_DIR, 'emails');
const FINAL_LIST_DIR = path.join(DATA_DIR, 'final-list');

for (const dir of [DATA_DIR, CRM_DIR, EMAILS_DIR, FINAL_LIST_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function progress(jobId, message, step) {
  console.log(message);
  await appendProgress(jobId, message, step);
  if (await isCancellationRequested(jobId)) {
    await updateJob(jobId, {
      status: 'cancelled',
      progress_step: 'Cancelled',
      finished_at: new Date().toISOString(),
    });
    throw new Error('__cancelled__');
  }
}

async function runSearch(job) {
  const input = job.input_json || {};
  await progress(job.id, 'Starting hosted search job...', 'Starting search');
  const leads = await scrapeLeads(
    {
      category: input.category || '',
      country: input.country || '',
      city: input.city || '',
      startPage: Number(input.startPage || 1),
      targetLeadCount: Number(input.targetLeadCount || 100),
    },
    message => {
      progress(job.id, message, 'Scraping Targetron').catch(error => {
        console.error(error.message || error);
      });
    }
  );
  const file = await saveFileForUser(
    job.user_id,
    'leads',
    input.file_name || `leads-${new Date().toISOString().slice(0, 10)}.json`,
    leads,
    job.id
  );
  return {
    resultFileId: file.id,
    summary: {
      count: leads.length,
      file_name: file.name,
    },
  };
}

async function runEnrich(job) {
  const input = job.input_json || {};
  const source = await findFileById(input.source_file_id);
  if (!source) throw new Error('Source leads file not found.');
  const leads = await downloadFile(source);
  const selectedIndexes = Array.isArray(input.selectedIndexes) ? input.selectedIndexes : [];
  const subset = selectedIndexes.length
    ? selectedIndexes.filter(index => Number.isInteger(index) && index >= 0 && index < leads.length).map(index => leads[index])
    : leads;

  await progress(job.id, `Starting enrichment for ${subset.length} lead(s)...`, 'Starting enrichment');
  const enriched = await enrichLeadsWithProgress(
    subset,
    message => {
      progress(job.id, message, 'Enriching leads').catch(error => {
        console.error(error.message || error);
      });
    },
    lead => {
      progress(job.id, `Enriched ${lead.name || 'lead'}`, 'Enriching leads').catch(error => {
        console.error(error.message || error);
      });
    }
  );
  const crmFile = await saveFileForUser(job.user_id, 'crm', input.file_name || source.name, enriched, job.id);
  return {
    resultFileId: crmFile.id,
    summary: {
      count: enriched.length,
      file_name: crmFile.name,
    },
  };
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function runNodeScript(jobId, scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { cwd: ROOT, env: process.env });
    let stdout = '';
    let stderr = '';

    const handleLine = async line => {
      if (!line.trim()) return;
      stdout += `${line}\n`;
      try {
        await progress(jobId, line.trim(), 'Running Playwright');
      } catch (error) {
        if (error.message === '__cancelled__') {
          child.kill('SIGTERM');
          return;
        }
        reject(error);
      }
    };

    let stdoutBuffer = '';
    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();
      for (const line of lines) handleLine(line);
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', code => {
      if (stdoutBuffer.trim()) stdout += `${stdoutBuffer.trim()}\n`;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

async function runFbPageIds(job) {
  const input = job.input_json || {};
  const source = await findFileById(input.source_file_id);
  if (!source) throw new Error('Source CRM file not found.');
  const crmData = await downloadFile(source);
  const tempSourceName = `hosted-crm-${job.id}.json`;
  const tempSourcePath = path.join(CRM_DIR, tempSourceName);
  const reportName = input.report_file_name || `fb-page-ids-${timestamp()}.json`;
  const tempReportPath = path.join(EMAILS_DIR, reportName);
  writeJson(tempSourcePath, crmData);

  const args = [
    '--file', tempSourceName,
    '--output', reportName,
  ];
  if (Array.isArray(input.selectedIndexes) && input.selectedIndexes.length) {
    args.push('--selected-indexes', input.selectedIndexes.join(','));
  }
  args.push('--headless');
  if (input.sourceFallback) args.push('--source-fallback');

  await progress(job.id, 'Starting Facebook Page ID job...', 'Starting FB Page IDs');
  await runNodeScript(job.id, path.join(ROOT, 'agent', 'fb_page_id_scraper.js'), args);

  const report = JSON.parse(fs.readFileSync(tempReportPath, 'utf8'));
  const updatedCrm = JSON.parse(JSON.stringify(crmData));
  const updatedCount = fbPageIdScraper.__test.applyFacebookPageIdsToLeads(updatedCrm, report);

  const crmFile = await saveFileForUser(job.user_id, 'crm', source.name, updatedCrm, job.id);
  const reportFile = await saveFileForUser(job.user_id, 'fb-page-id-reports', reportName, report, job.id);

  return {
    resultFileId: crmFile.id,
    summary: {
      crm_file_id: crmFile.id,
      crm_file_name: crmFile.name,
      report_file_id: reportFile.id,
      report_file_name: reportFile.name,
      updated: updatedCount,
      found: report.filter(item => item.status === 'found').length,
      notFound: report.filter(item => item.status === 'not_found').length,
      errors: report.filter(item => item.status === 'error').length,
    },
  };
}

async function runFindAds(job) {
  const input = job.input_json || {};
  const source = await findFileById(input.source_file_id);
  if (!source) throw new Error('Source CRM file not found.');
  const crmData = await downloadFile(source);
  const tempSourceName = `hosted-crm-${job.id}.json`;
  const tempSourcePath = path.join(CRM_DIR, tempSourceName);
  const outputName = input.file_name || `fb-ad-status-${path.basename(source.name, '.json')}-all-${timestamp()}.json`;
  const outputPath = path.join(FINAL_LIST_DIR, outputName);
  writeJson(tempSourcePath, crmData);

  await progress(job.id, 'Starting Find Ads job...', 'Starting ads check');
  const result = await adsChecker.run({
    sourceFile: tempSourceName,
    outputFile: outputPath,
    country: input.country || 'ALL',
    selectedIndexes: Array.isArray(input.selectedIndexes) ? input.selectedIndexes : null,
    headless: true,
    throttleMs: Number(input.throttleMs || process.env.FB_AD_CHECKER_THROTTLE_MS || 3000),
    onProgress: message => progress(job.id, message, 'Checking Meta Ads Library'),
  });
  const finalList = result.results || JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const file = await saveFileForUser(job.user_id, 'final-list', outputName, finalList, job.id);
  return {
    resultFileId: file.id,
    summary: {
      file_name: file.name,
      checked: result.checked,
      saved: result.saved,
      running_ads: result.runningAds,
      not_running_ads: result.notRunningAds,
      unknown: result.unknown,
    },
  };
}

async function runMapGap(job) {
  const input = job.input_json || {};
  const { niche, city, maxResults = 50, reviewThreshold = 20 } = input;

  if (!niche || !city) throw new Error('Missing niche or city');

  await progress(job.id, `Scanning Google Maps for "${niche}" in "${city}"...`, 'Starting map gap scan');

  const results = await scanForGaps({
    niche,
    city,
    maxResults: Number(maxResults),
    reviewThreshold: Number(reviewThreshold),
    onProgress: message => progress(job.id, message, 'Scanning Google Maps'),
  });

  const audited = results.map(r => ({
    ...r,
    audit: auditBusiness(r, { reviewThreshold: Number(reviewThreshold) }),
  }));

  const summary = generateSummary(audited.map(r => r.audit));

  const fileName = `map-gap-${niche.replace(/[^a-zA-Z0-9]/g, '-')}-${city.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;

  const file = await saveFileForUser(job.user_id, 'map-gap', fileName, audited, job.id);

  return {
    resultFileId: file.id,
    summary: {
      file_name: file.name,
      count: audited.length,
      targets: audited.filter(r => r.isTarget).length,
      totalBusinesses: summary.totalBusinesses,
      targetCount: summary.targetCount,
      averageScore: summary.averageScore,
      targetPercentage: summary.targetPercentage,
      gradeDistribution: summary.gradeDistribution,
      topGaps: summary.topGaps,
    },
  };
}

async function main() {
  const jobId = process.argv[2];
  if (!jobId) throw new Error('Usage: node scripts/hosted/run-job.js <job-id>');

  const job = await getJob(jobId);
  await updateJob(jobId, {
    status: 'running',
    started_at: new Date().toISOString(),
    progress_step: 'Booting runner',
  });

  try {
    let result;
    if (job.type === 'search') result = await runSearch(job);
    else if (job.type === 'enrich') result = await runEnrich(job);
    else if (job.type === 'fb-page-ids') result = await runFbPageIds(job);
    else if (job.type === 'find-ads') result = await runFindAds(job);
    else if (job.type === 'map-gap') result = await runMapGap(job);
    else throw new Error(`Unsupported job type: ${job.type}`);

    await updateJob(jobId, {
      status: 'completed',
      progress_step: 'Completed',
      result_file_id: result.resultFileId || null,
      result_summary_json: result.summary || null,
      finished_at: new Date().toISOString(),
    });
  } catch (error) {
    if (error.message === '__cancelled__') return;
    await updateJob(jobId, {
      status: 'failed',
      progress_step: 'Failed',
      error_message: error.message,
      finished_at: new Date().toISOString(),
    });
    throw error;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
