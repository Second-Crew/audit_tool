import { scoreObservedVisibility } from './observed-visibility.js';

export const VISIBILITY_ENGINES = ['chatgpt-search', 'google-ai-mode'];
const QUERY_COUNT = 10;
const RUNS_PER_QUERY = 3;
const MAX_AGE_DAYS = 30;

// A 0-100 observed citation score is only available for a reviewed, recent,
// site-specific panel on both engines. It is not a crawl-based readiness grade.
export function scoreProspectVisibility(panel, targetDomain, now = Date.now()) {
  const withheld = (reason, engines = {}) => ({
    status: 'not_assessed', score: null, metric: 'two_engine_observed_citation_rate',
    engines, reason,
  });
  if (!panel || !Array.isArray(panel.queries) || !Array.isArray(panel.observations) ||
      panel.observations.some((row) => !row || typeof row !== 'object')) {
    return withheld('A frozen query panel and observations are required.');
  }
  if (!sameDomain(panel.targetDomain, targetDomain)) {
    return withheld('The observed panel must target the audited website.');
  }
  if (panel.queries.length !== QUERY_COUNT ||
      ![panel.version, panel.market, panel.language, panel.brand].every((value) => typeof value === 'string' && value.trim())) {
    return withheld('The panel needs exactly 10 queries and complete scope metadata.');
  }
  const frozenAt = parseTimestamp(panel.frozenAt);
  if (!Number.isFinite(frozenAt) || frozenAt > now) return withheld('The panel must be frozen before collection.');
  const queries = new Map();
  const brand = panel.brand.trim().toLowerCase();
  const domain = normalizedDomain(targetDomain);
  for (const query of panel.queries) {
    if (typeof query?.id !== 'string' || !query.id.trim() || typeof query.prompt !== 'string' || !query.prompt.trim() || queries.has(query.id)) {
      return withheld('Panel query IDs and prompts must be unique and nonempty.');
    }
    const prompt = query.prompt.toLowerCase();
    if (prompt.includes(brand) || prompt.includes(domain)) return withheld('Panel prompts must not contain the target brand or domain.');
    queries.set(query.id, query.prompt);
  }

  const engines = {};
  for (const engine of VISIBILITY_ENGINES) {
    const rows = panel.observations.filter((row) => row.engine === engine && row.valid === true);
    if (rows.length !== QUERY_COUNT * RUNS_PER_QUERY) return withheld(`${engine} needs exactly 30 validated runs.`, engines);
    const runs = new Set();
    const evidence = new Set();
    const dates = new Set();
    const contexts = new Set();
    for (const row of rows) {
      if (row.validationStatus !== 'validated' || row.isolationVerified !== true || row.citationsVerified !== true ||
          row.prompt !== queries.get(row.queryId) || typeof row.answerShown !== 'boolean' ||
          typeof row.brandMentioned !== 'boolean' || !Array.isArray(row.citedUrls) ||
          !validHttpUrl(row.permalink) ||
          ![row.model, row.locationContext, row.personalizationState].every((value) => typeof value === 'string' && value.trim()) ||
          row.searchEnabled !== true || row.personalizationState !== 'off') {
        return withheld(`${engine} has an incomplete or unverified observation.`, engines);
      }
      if (row.citedUrls.some((url) => !validHttpUrl(url))) return withheld(`${engine} has an invalid citation URL.`, engines);
      if (!row.answerShown && (row.brandMentioned || row.citedUrls.length)) {
        return withheld(`${engine} records citations or a brand mention without an answer.`, engines);
      }
      const observedAt = parseTimestamp(row.observedAt);
      if (!Number.isFinite(observedAt) || observedAt < frozenAt || observedAt > now || now - observedAt > MAX_AGE_DAYS * 86400000) {
        return withheld(`${engine} observations must follow panel freeze and be within 30 days.`, engines);
      }
      const runKey = `${row.queryId}:${row.runId}`;
      if (!row.runId || runs.has(runKey) || evidence.has(row.permalink)) return withheld(`${engine} has duplicate runs or evidence links.`, engines);
      runs.add(runKey);
      evidence.add(row.permalink);
      dates.add(new Date(observedAt).toISOString().slice(0, 10));
      contexts.add(JSON.stringify([row.model, row.locationContext, row.personalizationState]));
    }
    if (dates.size < 2) return withheld(`${engine} needs observations on at least two dates.`, engines);
    if (contexts.size !== 1) return withheld(`${engine} must use a consistent model, location, and personalization context.`, engines);
    const result = scoreObservedVisibility(rows, targetDomain, {
      engine, queryIds: [...queries.keys()], minQueries: QUERY_COUNT, minRunsPerQuery: RUNS_PER_QUERY,
    });
    if (result.status !== 'observed' || result.runCount !== QUERY_COUNT * RUNS_PER_QUERY) {
      return withheld(`${engine} has an incomplete query panel.`, engines);
    }
    engines[engine] = result;
  }

  const queryBreakdown = [...queries].map(([id, prompt]) => ({
    id, prompt,
    engines: Object.fromEntries(VISIBILITY_ENGINES.map((engine) => {
      const rows = panel.observations.filter((row) => row.valid === true && row.engine === engine && row.queryId === id);
      return [engine, {
        citations: rows.filter((row) => row.answerShown && row.citedUrls.some((url) => citesDomain(url, domain))).length,
        answers: rows.filter((row) => row.answerShown).length,
        mentions: rows.filter((row) => row.answerShown && row.brandMentioned).length,
        runs: rows.length,
      }];
    })),
  }));

  return {
    status: 'observed',
    metric: 'two_engine_observed_citation_rate',
    score: Math.round(50 * (engines['chatgpt-search'].citationRate + engines['google-ai-mode'].citationRate)),
    engines,
    panelVersion: panel.version,
    market: panel.market,
    language: panel.language,
    queryCount: QUERY_COUNT,
    runCount: QUERY_COUNT * RUNS_PER_QUERY * VISIBILITY_ENGINES.length,
    queryBreakdown,
    observedFrom: new Date(Math.min(...panel.observations.filter((row) => row.valid === true && VISIBILITY_ENGINES.includes(row.engine)).map((row) => parseTimestamp(row.observedAt)))).toISOString(),
    observedTo: new Date(Math.max(...panel.observations.filter((row) => row.valid === true && VISIBILITY_ENGINES.includes(row.engine)).map((row) => parseTimestamp(row.observedAt)))).toISOString(),
    interpretation: 'Observed own-domain citation rate on this fixed ChatGPT Search and Google AI Mode panel. This is a dated visibility snapshot, not a ranking prediction or AI-readiness grade.',
  };
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  return Date.parse(value);
}

function normalizedDomain(value) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function sameDomain(a, b) {
  const left = normalizedDomain(a);
  return Boolean(left && left === normalizedDomain(b));
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function citesDomain(value, domain) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}
