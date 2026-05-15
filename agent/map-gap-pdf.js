const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function generateAuditHtml(audit, niche = '', city = '') {
  const gapRows = audit.gaps.map(gap => `
    <tr class="gap-row gap-${gap.severity}">
      <td class="gap-label">${gap.label}</td>
      <td class="gap-detail">${gap.detail}</td>
      <td class="gap-score">${gap.score}/${gap.maxScore}</td>
      <td class="gap-severity"><span class="badge badge-${gap.severity}">${gap.severity}</span></td>
    </tr>
  `).join('');

  const strengthItems = audit.strengths.map(s => `<li>${s}</li>`).join('');

  const scoreBar = (score, max, label) => {
    const pct = Math.round((score / max) * 100);
    return `
      <div class="score-bar-item">
        <div class="score-bar-label">${label}</div>
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:${pct}%;background:${pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'}"></div>
        </div>
        <div class="score-bar-value">${score}/${max}</div>
      </div>
    `;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Google Maps Audit — ${audit.businessName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: #f8fafc; padding: 40px; }
  .report { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; padding: 40px; }
  .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
  .header .subtitle { opacity: 0.8; font-size: 14px; }
  .header .niche { margin-top: 12px; display: inline-block; background: rgba(255,255,255,0.15); padding: 4px 12px; border-radius: 20px; font-size: 12px; }
  .score-section { padding: 32px 40px; border-bottom: 1px solid #e2e8f0; }
  .score-circle { display: flex; align-items: center; gap: 32px; }
  .circle { width: 120px; height: 120px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: conic-gradient(${audit.percentage >= 70 ? '#22c55e' : audit.percentage >= 40 ? '#f59e0b' : '#ef4444'} ${audit.percentage * 3.6}deg, #e2e8f0 0deg); }
  .circle-inner { width: 96px; height: 96px; border-radius: 50%; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .circle-score { font-size: 36px; font-weight: 800; color: ${audit.percentage >= 70 ? '#22c55e' : audit.percentage >= 40 ? '#f59e0b' : '#ef4444'}; }
  .circle-grade { font-size: 14px; color: #64748b; font-weight: 600; }
  .score-meta h2 { font-size: 20px; margin-bottom: 4px; }
  .score-meta p { color: #64748b; font-size: 14px; }
  .details-section { padding: 32px 40px; border-bottom: 1px solid #e2e8f0; }
  .details-section h3 { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: #1a1a2e; }
  .detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .detail-card { background: #f8fafc; padding: 16px; border-radius: 8px; }
  .detail-card .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .detail-card .value { font-size: 16px; font-weight: 600; color: #1a1a2e; }
  .bars-section { padding: 32px 40px; border-bottom: 1px solid #e2e8f0; }
  .bars-section h3 { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
  .score-bar-item { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .score-bar-label { width: 140px; font-size: 13px; color: #475569; }
  .score-bar-track { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .score-bar-value { width: 50px; font-size: 13px; font-weight: 600; color: #1a1a2e; text-align: right; }
  .gaps-section { padding: 32px 40px; }
  .gaps-section h3 { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; }
  td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
  .gap-label { font-weight: 600; }
  .gap-detail { color: #64748b; }
  .gap-score { font-weight: 600; text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-critical { background: #fee2e2; color: #dc2626; }
  .badge-warning { background: #fef3c7; color: #d97706; }
  .strengths-section { padding: 24px 40px 32px; background: #f0fdf4; border-top: 1px solid #bbf7d0; }
  .strengths-section h3 { font-size: 14px; font-weight: 700; color: #166534; margin-bottom: 8px; }
  .strengths-section ul { padding-left: 20px; }
  .strengths-section li { font-size: 13px; color: #15803d; margin-bottom: 4px; }
  .footer { padding: 20px 40px; background: #f8fafc; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="report">
  <div class="header">
    <h1>Google Maps Audit</h1>
    <div class="subtitle">Prepared for ${audit.businessName}</div>
    ${niche || city ? `<div class="niche">${niche}${niche && city ? ' • ' : ''}${city}</div>` : ''}
  </div>

  <div class="score-section">
    <div class="score-circle">
      <div class="circle">
        <div class="circle-inner">
          <div class="circle-score">${audit.percentage}</div>
          <div class="circle-grade">Grade: ${audit.grade}</div>
        </div>
      </div>
      <div class="score-meta">
        <h2>Overall Score: ${audit.totalScore}/${audit.maxScore}</h2>
        <p>Your Google Maps presence scored across 5 key dimensions</p>
      </div>
    </div>
  </div>

  <div class="details-section">
    <h3>Business Details</h3>
    <div class="detail-grid">
      <div class="detail-card">
        <div class="label">Rating</div>
        <div class="value">${audit.rating ? audit.rating + ' ★' : 'N/A'}</div>
      </div>
      <div class="detail-card">
        <div class="label">Reviews</div>
        <div class="value">${audit.reviewCount}</div>
      </div>
      <div class="detail-card">
        <div class="label">Website</div>
        <div class="value">${audit.website ? 'Linked' : 'Missing'}</div>
      </div>
    </div>
  </div>

  <div class="bars-section">
    <h3>Score Breakdown</h3>
    ${scoreBar(audit.scores.reviews, audit.weights.reviews, 'Reviews')}
    ${scoreBar(audit.scores.website, audit.weights.website, 'Website')}
    ${scoreBar(audit.scores.reviewResponses, audit.weights.reviewResponses, 'Review Responses')}
    ${scoreBar(audit.scores.profileCompleteness, audit.weights.profileCompleteness, 'Profile Completeness')}
    ${scoreBar(audit.scores.phoneReadiness, audit.weights.phoneReadiness, 'Phone Readiness')}
  </div>

  <div class="gaps-section">
    <h3>Identified Gaps (${audit.gapCount})</h3>
    <table>
      <thead>
        <tr>
          <th>Issue</th>
          <th>Details</th>
          <th>Score</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
        ${gapRows}
      </tbody>
    </table>
  </div>

  ${audit.strengths.length > 0 ? `
  <div class="strengths-section">
    <h3>Strengths</h3>
    <ul>${strengthItems}</ul>
  </div>
  ` : ''}

  <div class="footer">
    Generated on ${new Date(audit.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    • Map Gap Audit System
  </div>
</div>
</body>
</html>`;
}

async function generateAuditPdf(audit, outputPath, options = {}) {
  const niche = options.niche || '';
  const city = options.city || '';
  const html = generateAuditHtml(audit, niche, city);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return outputPath;
  } finally {
    await browser.close();
  }
}

module.exports = { generateAuditPdf, generateAuditHtml };
