// Shared copy for the dashboard and exports. Historical reports have no v1
// checklist and are never rescored from incomplete archived evidence.
export function readinessSummary(checklist) {
  if (!checklist) return [];
  const { counts, possibleRange } = checklist;
  return [
    `${checklist.status}${checklist.score == null ? '' : ` · ${checklist.score}/100`}. ${checklist.subtitle}.`,
    `${counts.passed} passed, ${counts.failed} failed, ${counts.unknown} unknown; coverage ${checklist.assessed}/${checklist.applicable} applicable checks (${Math.round(checklist.coverage * 100)}%) across ${checklist.samplePages} sampled/requested pages.`,
    ...(possibleRange ? [`Possible score range: ${possibleRange.min}–${possibleRange.max}/100 if unknown checks fail versus pass. This is missing checklist evidence, not statistical confidence.`] : []),
    ...(checklist.reason ? [checklist.reason] : []),
    `Methodology: ${checklist.version}. Formula: ${checklist.formula}.`,
    checklist.definition,
    'Main-text threshold: at least 80 characters after removing boilerplate and explicitly hidden content. Google-applicable directive checks combine fetched and rendered restrictions; partial snippet exclusions are preserved separately. Failed requests remain in the sample; transport errors stay unknown.',
    'Optional supporting features have descriptive quality assessments and contribute no presence/absence points.',
  ];
}

export function readinessMarkdown(checklist) {
  if (!checklist) return [];
  const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
  const lines = ['## AI Technical Readiness', '', ...readinessSummary(checklist).flatMap(line => [line, ''])];
  lines.push('### Critical access / reuse blockers', '');
  if (!checklist.blockers.length) lines.push('No failed crawler/indexing/snippet checks recorded; unknown checks remain unverified.', '');
  for (const blocker of checklist.blockers) lines.push(`- ${cell(blocker.label)}: ${cell(blocker.url)} — ${cell(blocker.evidence)}`);
  lines.push('', '### Supporting features', '');
  for (const feature of checklist.supportingFeatures) {
    lines.push(`#### ${feature.name} — ${feature.status}`, '', `Presence: ${feature.presence}. ${feature.rationale}`, '');
    if (!feature.evidence.length) lines.push('No feature evidence in the assessed sample.', '');
    for (const evidence of feature.evidence) lines.push(`- Evidence: ${cell(evidence.url)} · ${cell(evidence.observedAt || 'Observation time unavailable')} · ${cell(evidence.evidenceSource)} — ${cell(evidence.facts)}`);
    for (const issue of feature.issues) lines.push(`- Issue: ${cell(issue)}`);
    for (const fix of feature.recommendedFixes) lines.push(`- Recommended action: ${cell(fix)}`);
    lines.push('');
  }
  lines.push('### Per-page core checks', '', '| Check | Status | Requested → final URL | Source / time | Evidence |', '| --- | --- | --- | --- | --- |');
  for (const check of checklist.checks) lines.push(`| ${cell(check.label)} | ${check.status} | ${cell(check.url)} → ${cell(check.finalUrl)} | ${cell(check.evidenceSource)} / ${cell(check.observedAt || 'unavailable')} | ${cell(check.evidence)} |`);
  lines.push('');
  return lines;
}

export function readinessHtml(checklist) {
  if (!checklist) return '';
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<section class="section"><h2>AI Technical Readiness</h2>${readinessSummary(checklist).map(line => `<p>${esc(line)}</p>`).join('')}
    <h3>Critical access / reuse blockers</h3>${checklist.blockers.length ? `<ul>${checklist.blockers.map(check => `<li><strong>${esc(check.label)}</strong>: ${esc(check.url)} — ${esc(check.evidence)}</li>`).join('')}</ul>` : '<p>No failed crawler/indexing/snippet checks recorded; unknown checks remain unverified.</p>'}
    <h3>Supporting features</h3>${checklist.supportingFeatures.map(feature => `<article class="card"><h3>${esc(feature.name)} — ${esc(feature.status)}</h3><p>Presence: ${esc(feature.presence)}. ${esc(feature.rationale)}</p>
      ${feature.evidence.length ? feature.evidence.map(e => `<p>Evidence: ${esc(e.url)} · ${esc(e.observedAt || 'Observation time unavailable')} · ${esc(e.evidenceSource)} — ${esc(e.facts)}</p>`).join('') : '<p>No feature evidence in the assessed sample.</p>'}
      ${feature.issues.map(issue => `<p>Issue: ${esc(issue)}</p>`).join('')}${feature.recommendedFixes.map(fix => `<p>Recommended action: ${esc(fix)}</p>`).join('')}</article>`).join('')}
    <details><summary>Per-page core checks (${checklist.checks.length})</summary><table><thead><tr><th>Check / status</th><th>Requested → final URL</th><th>Source / time</th><th>Evidence</th></tr></thead><tbody>${checklist.checks.map(check => `<tr><td>${esc(check.label)}: ${esc(check.status)}</td><td>${esc(check.url)} → ${esc(check.finalUrl)}</td><td>${esc(check.evidenceSource)} / ${esc(check.observedAt || 'unavailable')}</td><td>${esc(check.evidence)}</td></tr>`).join('')}</tbody></table></details></section>`;
}
