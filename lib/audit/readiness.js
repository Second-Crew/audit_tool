export const AI_TECHNICAL_VERSION = 'ai-technical-checklist-v1';
export const AI_TECHNICAL_DEFINITION = 'Sampled technical checks. Equal-weight HTML retrieval, Googlebot and OAI-SearchBot robots permission, Google-applicable indexing and text-snippet directives, and extractable main text. This measures technical checks, not citations or recommendations. Robots permission does not prove retrieval; indexing permission does not prove indexing; browser-rendered text does not prove provider rendering.';
export const CORE_RULES = [
  ['html', 'Successful HTML retrieval'],
  ['googlebot', 'Googlebot robots permission'],
  ['oaiSearchBot', 'OAI-SearchBot robots permission'],
  ['indexing', 'Applicable indexing directives permit indexing'],
  ['snippets', 'Applicable snippet directives permit text snippets'],
  ['mainText', 'Usable main text can be extracted'],
];

// Pure: no fetches, clock reads, provider calls or weighted feature points.
export function scoreAiTechnicalReadiness(signals) {
  const sample = [...(signals.pages || []), ...(signals.sampleFailures || []).map(f => ({
    url: f.finalUrl || f.url, requestedUrl: f.url, status: f.status, failure: f,
  }))];
  const checks = sample.flatMap(page => pageChecks(page, signals));
  const counts = { passed: 0, failed: 0, unknown: 0, notApplicable: 0 };
  for (const check of checks) counts[check.status === 'not_applicable' ? 'notApplicable' : check.status]++;
  const assessed = counts.passed + counts.failed;
  const applicable = assessed + counts.unknown;
  const score = assessed ? Math.round(100 * counts.passed / assessed) : null;
  const blockers = checks.filter(check => check.status === 'failed' && ['googlebot', 'oaiSearchBot', 'indexing', 'snippets'].includes(check.id));
  return { version: AI_TECHNICAL_VERSION, name: 'AI Technical Readiness', subtitle: 'Sampled technical checks',
    definition: AI_TECHNICAL_DEFINITION, formula: 'round(100 × passed / assessed applicable core checks)',
    score, counts, assessed, applicable, coverage: applicable ? assessed / applicable : 0,
    status: !assessed ? 'Could not assess' : counts.unknown ? 'Provisional' : 'Assessed',
    reason: !assessed ? (sample.length ? 'Retrieval, robots, directive and content evidence were unavailable for the requested sample.' : 'No public pages or failed requested pages were recorded.') : null,
    possibleRange: counts.unknown ? { min: Math.round(100 * counts.passed / applicable), max: Math.round(100 * (counts.passed + counts.unknown) / applicable) } : null,
    samplePages: sample.length, checks, blockers,
    supportingFeatures: signals.supportingFeatures || [],
  };
}

function pageChecks(page, signals) {
  const failure = page.failure;
  const knownHtml = !failure && page.status >= 200 && page.status < 300;
  const technical = page.technical || {};
  const source = page.evidenceSource || 'fetched_html';
  const check = (id, value, evidence, evidenceSource = source) => ({ id, label: CORE_RULES.find(rule => rule[0] === id)[1],
    url: page.requestedUrl || page.url, finalUrl: page.url, observedAt: page.observedAt || failure?.observedAt || null,
    evidenceSource, status: value == null ? 'unknown' : value ? 'passed' : 'failed', evidence });
  const bot = (name) => {
    const paths = signals.robots?.botAccess?.[name]?.pages || [];
    const results = [...new Set([page.requestedUrl || page.url, page.url])].map(url => paths.find(p => p.url === url)?.allowed ?? null);
    return results.includes(false) ? false : results.every(result => result === true) ? true : null;
  };
  const directives = [page.fetchedIndexing, page.indexing].filter(Boolean);
  const denyIndex = directives.some(d => d.indexAllowed === false || d.unavailableAfter?.some(time => page.observedAt && time <= Date.parse(page.observedAt)));
  const denySnippet = directives.some(d => d.snippetAllowed === false);
  const allTextExcluded = page.indexing?.partialExclusions > 0 && page.indexing.snippetTextLength === 0 && (page.text?.length || 0) > 0;
  const directiveKnown = knownHtml && directives.length > 0 && !technical.truncated;
  const partial = page.indexing?.partialExclusions || 0;
  const directiveEvidence = [...new Set(directives.flatMap(d => d.sources.map(s => `${s.source}: ${s.value}`)))].join('; ') || 'No applicable robots meta or X-Robots-Tag restrictions observed';
  const textLength = page.text?.length;
  // Sparse script HTML or failed/skipped rendering cannot establish absence.
  const textKnown = knownHtml && Number.isFinite(textLength) && !technical.truncated;
  const textValue = !textKnown ? null : textLength >= 80 ? true : !technical.rendered && (technical.hasScripts || technical.renderStatus === 'unavailable') ? null : false;
  return [
    check('html', knownHtml ? true : failure?.reason === 'audit_bot_blocked' || !page.status ? null : false,
      knownHtml ? `HTTP ${page.status}; HTML retrieved${page.requestedUrl && page.url !== page.requestedUrl ? '; redirected to recorded final URL' : ''}` : failure?.reason === 'audit_bot_blocked' ? 'Not requested: audit crawler robots block' : !page.status ? 'Transport unavailable; site failure could not be established' : `HTTP ${page.status}; ${failure?.reason || 'HTML retrieval failed'}`, 'fetched_http'),
    check('googlebot', bot('Googlebot'), 'Sampled requested/final paths checked against robots.txt; permission is not confirmed retrieval', 'robots_txt'),
    check('oaiSearchBot', bot('OAI-SearchBot'), 'Sampled requested/final paths checked against robots.txt; permission is not confirmed retrieval', 'robots_txt'),
    check('indexing', denyIndex ? false : directiveKnown ? true : null, directiveKnown || denyIndex ? `${directiveEvidence}; Google-applicable rules; permission is not confirmed indexing` : 'Page directives unavailable or HTML truncated'),
    check('snippets', denySnippet || allTextExcluded ? false : directiveKnown ? true : null, directiveKnown || denySnippet ? `${directiveEvidence}; ${partial} partial data-nosnippet exclusions; ${page.indexing?.snippetTextLength ?? 'unknown'} remaining main-text characters; Google text-snippet semantics` : 'Snippet directives unavailable or HTML truncated'),
    check('mainText', textValue, `${textLength ?? 'unknown'} main-text characters; threshold ≥80 after boilerplate/explicitly hidden content removal${technical.fetchedTextLength != null ? `; fetched HTML ${technical.fetchedTextLength} characters` : ''}${textValue == null ? '; content evidence unavailable or requires rendering' : ''}`),
  ];
}
