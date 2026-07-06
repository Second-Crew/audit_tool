// Renders the primary-site vs competitors score comparison as a standalone
// SVG string so the same chart works in the React workspace and inside the
// generated HTML report that gets emailed to prospects (no JS required).

const DIMENSIONS = [
  { key: 'overall', label: 'Overall' },
  { key: 'aeoGeo', label: 'GEO/AEO' },
  { key: 'crawlability', label: 'Crawl' },
  { key: 'structuredData', label: 'Schema' },
  { key: 'answerReadiness', label: 'Answers' },
  { key: 'entityTrust', label: 'Trust' },
  { key: 'seo', label: 'SEO' },
];

const COMPETITOR_COLORS = ['#64748b', '#d97706', '#7c3aed', '#e11d48', '#059669'];
const PRIMARY_COLOR = '#0891b2';

export function buildComparisonChartSvg({ primaryName, primaryScores, competitors }) {
  const scoredCompetitors = (competitors || []).filter((competitor) => !competitor.error && competitor.scores);
  if (!primaryScores || !scoredCompetitors.length) return '';

  const series = [
    { name: `${primaryName || 'Audited site'} (you)`, scores: primaryScores, color: PRIMARY_COLOR, width: 3 },
    ...scoredCompetitors.slice(0, COMPETITOR_COLORS.length).map((competitor, index) => ({
      name: competitor.name || competitor.domain,
      scores: competitor.scores,
      color: COMPETITOR_COLORS[index],
      width: 2,
    })),
  ];

  const plot = { left: 64, right: 736, top: 24, bottom: 232 };
  const x = (index) => plot.left + (index * (plot.right - plot.left)) / (DIMENSIONS.length - 1);
  const y = (value) => plot.bottom - (clampScore(value) / 100) * (plot.bottom - plot.top);

  const gridlines = [0, 25, 50, 75, 100].map((tick) => `
    <line x1="${plot.left}" y1="${y(tick)}" x2="${plot.right}" y2="${y(tick)}" stroke="#e2e8f0" stroke-width="1" />
    <text x="${plot.left - 10}" y="${y(tick) + 4}" text-anchor="end" font-size="11" fill="#64748b">${tick}</text>
  `).join('');

  const xLabels = DIMENSIONS.map((dimension, index) => `
    <text x="${x(index)}" y="${plot.bottom + 20}" text-anchor="middle" font-size="11" fill="#475569">${escapeXml(dimension.label)}</text>
  `).join('');

  const lines = series.map((entry) => {
    const points = DIMENSIONS.map((dimension, index) => `${x(index)},${y(entry.scores[dimension.key])}`).join(' ');
    const dots = DIMENSIONS.map((dimension, index) => `
      <circle cx="${x(index)}" cy="${y(entry.scores[dimension.key])}" r="${entry.width + 1}" fill="${entry.color}" />
    `).join('');
    return `
      <polyline points="${points}" fill="none" stroke="${entry.color}" stroke-width="${entry.width}" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
    `;
  }).join('');

  const itemsPerRow = 3;
  const legendRows = Math.ceil(series.length / itemsPerRow);
  const legendTop = plot.bottom + 40;
  const legend = series.map((entry, index) => {
    const row = Math.floor(index / itemsPerRow);
    const column = index % itemsPerRow;
    const legendX = plot.left - 24 + column * 236;
    const legendY = legendTop + row * 20;
    return `
      <line x1="${legendX}" y1="${legendY}" x2="${legendX + 22}" y2="${legendY}" stroke="${entry.color}" stroke-width="${entry.width}" />
      <text x="${legendX + 28}" y="${legendY + 4}" font-size="12" fill="#334155">${escapeXml(truncate(entry.name, 28))}</text>
    `;
  }).join('');

  const height = legendTop + legendRows * 20 + 8;

  return `<svg viewBox="0 0 760 ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Score comparison against competitors" style="max-width:920px;width:100%;height:auto;display:block">
    <text x="${plot.left - 40}" y="14" font-size="12" fill="#64748b">Score (0-100)</text>
    ${gridlines}
    ${xLabels}
    ${lines}
    ${legend}
  </svg>`;
}

function clampScore(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function truncate(value, max) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
