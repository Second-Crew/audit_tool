// Query-panel outcome measurement. This is intentionally separate from
// on-site checks: a crawl cannot establish whether an answer engine cited us.
export function scoreObservedVisibility(observations, targetDomain, {
  engine,
  minQueries = 10,
  minRunsPerQuery = 3,
  queryIds = null,
} = {}) {
  if (!engine) throw new Error('An engine is required for a comparable query panel');
  const domain = normalizeDomain(targetDomain);
  const rows = (observations || []).filter((row) => row.valid === true && row.engine === engine && row.queryId && row.runId && typeof row.answerShown === 'boolean');
  const queries = new Map();
  for (const row of rows) {
    if (!queries.has(row.queryId)) queries.set(row.queryId, new Map());
    queries.get(row.queryId).set(row.runId, row);
  }
  const expectedIds = Array.isArray(queryIds) ? [...new Set(queryIds)] : null;
  const requiredQueries = expectedIds?.length || minQueries;
  const candidates = expectedIds ? expectedIds.map((id) => [id, queries.get(id) || new Map()]) : [...queries.entries()];
  const completeQueries = candidates.filter(([, runs]) => runs.size >= minRunsPerQuery);
  if (completeQueries.length < requiredQueries) {
    return {
      status: 'not_assessed',
      score: null,
      engine,
      queryCount: completeQueries.length,
      requiredQueries,
      requiredRunsPerQuery: minRunsPerQuery,
      reason: 'The fixed query panel has insufficient complete repeated observations.',
    };
  }

  // Equal query weighting avoids letting heavily repeated prompts dominate.
  const selected = completeQueries.map(([queryId, runs]) => ({
    queryId,
    rows: [...runs.values()],
  }));
  const rate = (predicate) => selected.reduce((total, query) => total + query.rows.filter(predicate).length / query.rows.length, 0) / selected.length;
  const citationRate = rate((row) => row.answerShown && (row.citedUrls || []).some((url) => matchesDomain(url, domain)));
  const answerTriggerRate = rate((row) => row.answerShown);
  const mentionRate = rate((row) => row.answerShown && row.brandMentioned === true);
  const triggered = selected.flatMap((query) => query.rows).filter((row) => row.answerShown);
  const citationWhenTriggered = triggered.length
    ? triggered.filter((row) => (row.citedUrls || []).some((url) => matchesDomain(url, domain))).length / triggered.length
    : null;

  return {
    status: 'observed',
    engine,
    metric: 'fixed_panel_citation_rate',
    score: Math.round(citationRate * 100),
    citationRate,
    answerTriggerRate,
    mentionRate,
    citationWhenTriggered,
    queryCount: selected.length,
    runCount: selected.reduce((total, query) => total + query.rows.length, 0),
    interpretation: 'Observed citation rate for this query panel and engine; not a universal ranking or prediction.',
  };
}

function normalizeDomain(value) {
  const host = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase();
  return host.replace(/^www\./, '');
}

function matchesDomain(value, domain) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}
