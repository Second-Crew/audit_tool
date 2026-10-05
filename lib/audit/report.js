import { buildComparisonChartSvg } from '../comparison-chart.js';
import { visibilityEngineRows } from './visibility-display.js';
import { pageSpeedStatusText } from './pagespeed-status.js';

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
      <div class="muted">${escapeHtml(audit.input.companyName || primary.signals.domain)} · ${escapeHtml(primary.signals.startUrl)} · ${new Date(audit.createdAt).toISOString().replace('T', ' ').replace('Z', ' UTC')}</div>
    </section>

    ${primary.signals.contentEvidence?.status === 'incomplete' ? `<section class="card"><strong>Content assessment unavailable</strong><p>${primary.signals.contentEvidence.usablePages} of ${primary.signals.contentEvidence.pages} sampled pages had enough extractable text. ${escapeHtml(primary.signals.contentEvidence.limitation || 'Review incomplete pages.')} Repeat the audit before using content recommendations or an overall grade.</p></section>` : ''}
    ${primary.signals.contentEvidence?.status === 'sufficient' && scores.overall == null ? `<section class="card"><strong>N/A means not measured, not zero</strong><p>On-site checks are reviewable below. ${scores.aeoGeo == null ? 'AI citation outcomes were not measured for a complete two-engine panel. ' : 'AI citations were measured only for the dated query panel shown below. '}Search ranking and a validated AI-readiness scale remain unavailable. The overall grade is withheld.</p></section>` : ''}
    <section class="grid">
      ${scoreCard('Overall', scores.overall)}
      ${scoreCard(scores.aeoGeo == null ? 'GEO/AEO' : 'GEO/AEO observed visibility', scores.aeoGeo)}
      ${scoreCard('AI Readiness', scores.aiReadiness)}
      ${scoreCard('Technical SEO', scores.seo)}
      ${scoreCard('Mobile', scores.mobile)}
      ${scoreCard('Desktop', scores.desktop)}
      ${scoreCard('Security', scores.security)}
      ${scoreCard('Accessibility', scores.accessibility)}
    </section>

    <section class="card">
      <h2>Google PageSpeed measurements</h2>
      <p class="muted">Lighthouse lab measurements of the requested URL at audit time; mobile and desktop are measured separately.</p>
      ${['mobile', 'desktop'].map(device => `<p><strong>${device === 'mobile' ? 'Mobile' : 'Desktop'}: ${scores[device] == null ? 'Measurement unavailable' : `${scores[device]}/100`}</strong> — ${escapeHtml(pageSpeedStatusText(compatibility.pageSpeedDiagnostics?.[device], scores[device]))}</p>`).join('')}
    </section>

    ${compatibility.observedVisibility?.status === 'observed' ? `<section class="section">
      <h2>Observed AI answer visibility</h2>
      <p>This ${escapeHtml(compatibility.observedVisibility.market)} panel used 10 fixed unbranded queries, three runs per query and engine, on at least two dates (${escapeHtml(compatibility.observedVisibility.observedFrom?.slice(0, 10))} to ${escapeHtml(compatibility.observedVisibility.observedTo?.slice(0, 10))}). The 0–100 number is the equal-weight own-domain citation rate across ChatGPT Search and Google AI Mode. It is a snapshot of these queries, not a ranking prediction or a site-readiness grade. Google AI Overviews are not included.</p>
      <table><thead><tr><th>Engine</th><th>Own-domain citations</th><th>Citation score</th><th>Answer presence</th><th>Brand mentions</th></tr></thead><tbody>
        ${visibilityEngineRows(compatibility.observedVisibility).map(row =>
          `<tr><td>${row.label}</td><td>${row.citations}</td><td>${row.score == null ? 'N/A' : `${row.score}/100`}</td><td>${row.answers}</td><td>${row.mentions}</td></tr>`).join('')}
      </tbody></table>
      <h2 style="margin-top:20px">Query-level citation counts</h2>
      <table><thead><tr><th>Frozen query</th><th>ChatGPT Search</th><th>Google AI Mode</th></tr></thead><tbody>
        ${compatibility.observedVisibility.queryBreakdown.map((query) => `<tr><td>${escapeHtml(query.prompt)}</td><td>${query.engines['chatgpt-search'].citations}/3</td><td>${query.engines['google-ai-mode'].citations}/3</td></tr>`).join('')}
      </tbody></table>
    </section>` : ''}

    <section class="card">
      <h2>Executive Summary</h2>
      <p>${escapeHtml(compatibility.aiInsights.executiveSummary)}</p>
      <p class="muted">Narrative provider: ${escapeHtml(compatibility.llm?.status === 'generated' ? `${compatibility.llm.provider} / ${compatibility.llm.model}` : `deterministic fallback (${compatibility.llm?.status || 'skipped'})`)}</p>
      <p class="muted">This report records sampled on-site evidence.${scores.aeoGeo == null ? ' A fixed query panel and observed AI results are needed to assess visibility.' : ' The observed visibility number applies only to its dated ChatGPT Search and Google AI Mode panel.'}</p>
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
      <h2>${scores.overall == null ? 'Evidence Review' : 'Recommended Roadmap'}</h2>
      <div class="cols">
        ${scores.overall == null ? '<div class="card">Review the observed findings and page checks below. Verify unavailable measurements, then use query-level outcomes before assigning search or AI impact.</div>' : (compatibility.aiInsights.roadmap || []).map((item) => `
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
            <li>Optional llms.txt: ${primary.signals.llms.found ? 'observed' : 'not observed'} (not a ranking requirement)</li>
          </ul>
        </div>
        <div class="card">
          <strong>Competitors</strong>
          <ul>
            ${audit.competitorComparison.length ? audit.competitorComparison.map((competitor) => `<li>${escapeHtml(competitor.domain)}: ${competitor.error ? `crawl failed (${escapeHtml(competitor.error)})` : `${competitor.crawledPages} pages crawled; GEO/AEO outcome not assessed`}</li>`).join('') : '<li>No manual competitors submitted</li>'}
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
              <td><strong>${category.score == null ? 'Not assessed' : `${category.score}/100`}</strong>${category.score == null && category.reason ? `<br><span class="muted">${escapeHtml(category.reason)}</span>` : ''}</td>
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
              <td>${competitor.scoreDiff == null ? 'Not assessed' : `${competitor.scoreDiff > 0 ? '+' : ''}${competitor.scoreDiff}`}
</td>
              <td>${competitor.gaps.map(escapeHtml).join('<br>') || escapeHtml(competitor.comparisonReason || 'No major gaps detected')}</td>
              <td>${competitor.advantages.map(escapeHtml).join('<br>') || escapeHtml(competitor.comparisonReason || 'No major advantages detected')}</td>
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
