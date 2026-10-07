export default function TypeSafePanel({ result }) {
  if (!result || result.mode === 'off') return null;
  return (
    <section className="rounded-lg border border-indigo-200 bg-white p-6 shadow-sm print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">TypeSafe content assessment</h2>
          <p className="mt-1 text-sm text-slate-600">Experimental · Internal review only · {result.status}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-slate-950">{result.score == null ? 'Not scored' : `${result.score}/100`}</div>
          <div className="text-xs text-slate-500">Sampled content score</div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{result.caveat}</p>
      {result.reason && <p className="mt-2 text-sm text-amber-800">{result.reason}</p>}
      <p className="mt-3 text-sm text-slate-600">
        {result.coverage?.assessed || 0} of {result.coverage?.sampled || 0} sampled pages assessed; {result.coverage?.crawled || 0} pages crawled.
        {' '}Rubric: {result.rubricVersion} · Requested model: {result.model}
      </p>
      <p className="mt-1 text-xs text-slate-500">Weights: topic clarity 40%, useful detail 40%, supporting evidence 20%. An incomplete or uncertain sample has no combined score.</p>
      <div className="mt-4 space-y-3">
        {(result.pages || []).map((page) => (
          <details key={page.url} className="rounded-md border border-slate-200 p-3">
            <summary className="cursor-pointer break-words text-sm font-semibold text-slate-900">
              {page.title || page.url} · {page.score == null ? 'Needs review' : `${page.score}/100`} · {page.status}
            </summary>
            <p className="mt-2 break-all text-xs text-slate-500">{page.url}</p>
            <p className="mt-2 text-sm text-slate-700">Page purpose: {page.pageType?.choice || 'Unknown'}{page.pageType?.status === 'needs_review' ? ' (uncertain)' : ''}</p>
            {page.reason && <p className="mt-2 text-sm text-amber-800">{page.reason}</p>}
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {Object.values(page.dimensions || {}).map((dimension) => (
                <li key={dimension.label}>{dimension.label}: {dimension.normalizedScore}/100 · Model confidence: {Math.round(dimension.confidence * 100)}%</li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-semibold text-slate-600">Assessed HTML excerpt{page.excerptTruncated ? ' (truncated)' : ''} — external claims are unverified</p>
            <blockquote className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-sm leading-6 text-slate-700">{page.excerpt}</blockquote>
          </details>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Usage: {result.usage?.inputTokens || 0} input tokens · {result.usage?.outputTokens || 0} output tokens.</p>
    </section>
  );
}
