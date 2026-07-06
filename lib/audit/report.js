import { buildComparisonChartSvg } from '../comparison-chart.js';

export function generateEvidenceReport(audit, compatibility) {
  const primary = audit.primary;
  const scores = compatibility.scores;
  const topFindings = primary.scoring.findings.slice(0, 12);
  const categoryRows = Object.values(primary.scoring.categoryDetails);
  const comparisonChart = buildComparisonChartSvg({
    primaryName: audit.input.companyName || primary.signals.domain,
    primaryScores: primary.scoring.scores,
    competitors: audit.competitorComparison,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Second Crew GEO/AEO Audit - ${escapeHtml(audit.input.companyName || primary.signals.domain)}</title>
  <style>
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #f8fafc; color: #111827; line-height: 1.55; }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 36px 24px 56px; }
    .header { border-bottom: 1px solid #dbe3ef; padding-bottom: 24px; margin-bottom: 24px; }
    .brand { font-size: 12px; letter-spacing: 2px; font-weight: 700; color: #334155; text-transform: uppercase; }
    h1 { margin: 10px 0 8px; font-size: 34px; line-height: 1.1; }
    .muted { color: #64748b; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 22px 0; }
    .card { background: #fff; border: 1px solid #dbe3ef; border-radius: 8px; padding: 16px; }
    .score { font-size: 30px; font-weight: 800; }
    .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
    .section { margin-top: 26px; }
    h2 { font-size: 21px; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dbe3ef; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #e5edf6; text-align: left; vertical-align: top; font-size: 14px; }
    th { background: #eef4fb; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #475569; }
    tr:last-child td { border-bottom: 0; }
    .pill { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .high { background: #fee2e2; color: #991b1b; }
    .medium { background: #fef3c7; color: #92400e; }
    .low { background: #e0f2fe; color: #075985; }
    .passed { color: #047857; font-weight: 700; }
    .partial, .unknown { color: #b45309; font-weight: 700; }
    .failed { color: #b91c1c; font-weight: 700; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    ul { padding-left: 18px; }
    @media (max-width: 760px) { .grid, .cols { grid-template-columns: 1fr; } h1 { font-size: 27px; } }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="header">
      <div class="brand">Second Crew</div>
      <h1>GEO/AEO Evidence Audit</h1>
      <div class="muted">${escapeHtml(audit.input.companyName || primary.signals.domain)} · ${escapeHtml(primary.signals.startUrl)} · ${new Date(audit.createdAt).toLocaleString()}</div>
    </section>

    <section class="grid">
      ${scoreCard('Overall', scores.overall)}
      ${scoreCard('GEO/AEO', scores.aeoGeo)}
      ${scoreCard('AI Readiness', scores.aiReadiness)}
      ${scoreCard('SEO', scores.seo)}
      ${scoreCard('Mobile', scores.mobile)}
      ${scoreCard('Desktop', scores.desktop)}
      ${scoreCard('Security', scores.security)}
      ${scoreCard('Accessibility', scores.accessibility)}
    </section>

    <section class="card">
      <h2>Executive Summary</h2>
      <p>${escapeHtml(compatibility.aiInsights.executiveSummary)}</p>
      <p class="muted">Narrative provider: ${escapeHtml(compatibility.llm?.status === 'generated' ? `${compatibility.llm.provider} / ${compatibility.llm.model}` : `deterministic fallback (${compatibility.llm?.status || 'skipped'})`)}</p>
      <p class="muted">This is an evidence-based readiness prediction, not a live ranking guarantee. Live SERP, backlink, review, and brand mention providers can be added later through provider adapters.</p>
    </section>

    <section class="section">
      <h2>Score Narrative</h2>
      <div class="cols">
        ${(compatibility.aiInsights.scoreNarrative || []).map((item) => `
          <div class="card">
            <strong>${escapeHtml(item.label)}${item.score == null ? '' : ` · ${escapeHtml(item.score)}/100`}</strong>
            <p>${escapeHtml(item.explanation)}</p>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="section">
      <h2>Recommended Roadmap</h2>
      <div class="cols">
        ${(compatibility.aiInsights.roadmap || []).map((item) => `
          <div class="card">
            <strong>${escapeHtml(item.phase)} · ${escapeHtml(item.title)}</strong>
            <ul>
              ${(item.actions || []).map((action) => `<li>${escapeHtml(action)}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="section">
      <h2>Audit Coverage</h2>
      <div class="cols">
        <div class="card">
          <strong>Primary crawl</strong>
          <ul>
            <li>${primary.signals.pageCount} pages crawled</li>
            <li>${primary.signals.sitemap.urlCount} sitemap URLs found</li>
            <li>robots.txt: ${primary.signals.robots.found ? 'found' : 'missing'}</li>
            <li>llms.txt: ${primary.signals.llms.found ? 'found' : 'missing'}</li>
          </ul>
        </div>
        <div class="card">
          <strong>Competitors</strong>
          <ul>
            ${audit.competitorComparison.length ? audit.competitorComparison.map((competitor) => `<li>${escapeHtml(competitor.domain)}: ${competitor.error ? `crawl failed (${escapeHtml(competitor.error)})` : `${competitor.scores.aeoGeo}/100 GEO/AEO, ${competitor.crawledPages} pages crawled`}</li>`).join('') : '<li>No manual competitors submitted</li>'}
          </ul>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Category Scores</h2>
      <table>
        <thead><tr><th>Category</th><th>Score</th><th>Evidence Snapshot</th></tr></thead>
        <tbody>
          ${categoryRows.map((category) => `
            <tr>
              <td>${escapeHtml(category.name)}</td>
              <td><strong>${category.score}/100</strong></td>
              <td>${category.checks.slice(0, 4).map((check) => `<div><span class="${check.status}">${escapeHtml(check.status)}</span>: ${escapeHtml(check.label)} - ${escapeHtml(check.evidence || '')}</div>`).join('')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>Prioritized Findings</h2>
      <table>
        <thead><tr><th>Severity</th><th>Finding</th><th>Evidence</th><th>Recommendation</th></tr></thead>
        <tbody>
          ${topFindings.map((finding) => `
            <tr>
              <td><span class="pill ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span></td>
              <td><strong>${escapeHtml(finding.title)}</strong><br><span class="muted">${escapeHtml(finding.description)}</span></td>
              <td>${finding.url ? `<div><a href="${escapeAttribute(finding.url)}">${escapeHtml(finding.url)}</a></div>` : ''}${escapeHtml(finding.evidence || '')}<br><span class="muted">Confidence: ${escapeHtml(finding.confidence)}</span></td>
              <td>${escapeHtml(finding.recommendation)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>

    ${audit.competitorComparison.length ? `
    <section class="section">
      <h2>Manual Competitor Comparison</h2>
      ${comparisonChart ? `<div class="card" style="margin-bottom:14px">${comparisonChart}</div>` : ''}
      <table>
        <thead><tr><th>Competitor</th><th>GEO/AEO Diff</th><th>Gaps</th><th>Advantages</th></tr></thead>
        <tbody>
          ${audit.competitorComparison.map((competitor) => competitor.error ? `
            <tr>
              <td>${escapeHtml(competitor.name)}<br><span class="muted">${escapeHtml(competitor.domain)}</span></td>
              <td colspan="3">Crawl failed: ${escapeHtml(competitor.error)}</td>
            </tr>
          ` : `
            <tr>
              <td>${escapeHtml(competitor.name)}<br><span class="muted">${escapeHtml(competitor.domain)}</span></td>
              <td>${competitor.scoreDiff > 0 ? '+' : ''}${competitor.scoreDiff}</td>
              <td>${competitor.gaps.map(escapeHtml).join('<br>') || 'No major gaps detected'}</td>
              <td>${competitor.advantages.map(escapeHtml).join('<br>') || 'No major advantages detected'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
    ` : ''}
  </main>
</body>
</html>`;
}

function scoreCard(label, score) {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="score">${score == null ? 'N/A' : `${score}`}</div></div>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
