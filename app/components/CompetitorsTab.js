import { Metric, TextList } from './ui.js';

export default function CompetitorsTab({ competitorComparison }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Manual Competitor Comparison</h2>
        <p className="mt-1 text-sm text-slate-500">Phase 1 compares manually submitted competitors without paid SERP APIs.</p>
      </div>
      {competitorComparison.length ? (
        <div className="grid grid-cols-1 gap-4">
          {competitorComparison.map((competitor) => (
            <CompetitorCard key={competitor.url || competitor.domain} competitor={competitor} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
          No competitors were submitted for this audit.
        </div>
      )}
    </section>
  );
}

function CompetitorCard({ competitor }) {
  if (competitor.error) {
    return (
      <article className="rounded-lg border border-red-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{competitor.name}</h3>
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Crawl failed</span>
        </div>
        <p className="mt-1 break-words text-sm text-slate-500">{competitor.domain}</p>
        <div className="mt-4 rounded-md border border-red-100 bg-red-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">Reason</div>
          <p className="mt-2 break-words text-sm leading-6 text-slate-700">{competitor.error}</p>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          This competitor was excluded from the score comparison. Check the URL and rerun the audit to include it.
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{competitor.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{competitor.domain} · {competitor.crawledPages} pages crawled</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Metric label="GEO / AEO" value={competitor.scores?.aeoGeo ?? 'N/A'} />
          <Metric label="Overall" value={competitor.scores?.overall ?? 'N/A'} />
          <Metric label="Diff" value={`${competitor.scoreDiff > 0 ? '+' : ''}${competitor.scoreDiff}`} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextList title="Gaps" items={competitor.gaps} empty="No major gaps detected." />
        <TextList title="Advantages" items={competitor.advantages} empty="No major advantages detected." />
      </div>
    </article>
  );
}
