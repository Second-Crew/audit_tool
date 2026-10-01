// Only public query-level aggregates are read here, never observation payloads
// or conversation links. Shared by the dashboard and both prospect exports.
export function visibilityEngineRows(visibility) {
  return [['ChatGPT Search', 'chatgpt-search'], ['Google AI Mode', 'google-ai-mode']].map(([label, key]) => {
    const queries = visibility?.queryBreakdown?.map(query => query.engines?.[key]);
    const complete = queries?.length && queries.every(query => query &&
      ['citations', 'answers', 'mentions', 'runs'].every(field => Number.isInteger(query[field]) && query[field] >= 0));
    const counts = complete ? queries.reduce((total, query) => ({
      citations: total.citations + query.citations, answers: total.answers + query.answers,
      mentions: total.mentions + query.mentions, runs: total.runs + query.runs,
    }), { citations: 0, answers: 0, mentions: 0, runs: 0 }) : null;
    const format = field => counts?.runs ? `${counts[field]}/${counts.runs}` : 'Not available';
    return { key, label, score: visibility?.engines?.[key]?.score ?? null,
      citations: format('citations'), answers: format('answers'), mentions: format('mentions') };
  });
}
