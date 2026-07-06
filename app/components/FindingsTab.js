import { SeverityBadge } from './ui.js';

export default function FindingsTab({ findings, severityFilter, onFilterChange }) {
  const filteredFindings = severityFilter === 'all'
    ? findings
    : findings.filter((finding) => finding.severity === severityFilter);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Prioritized Findings</h2>
          <p className="mt-1 text-sm text-slate-500">Each item includes evidence, confidence, and a recommended fix.</p>
        </div>
        <div className="flex gap-2 print:hidden">
          {['all', 'high', 'medium', 'low'].map((severity) => (
            <button
              key={severity}
              onClick={() => onFilterChange(severity)}
              className={`rounded-md px-3 py-2 text-sm font-semibold capitalize transition ${
                severityFilter === severity
                  ? 'bg-slate-950 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {severity}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredFindings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
        {!filteredFindings.length && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">No findings match this filter.</div>
        )}
      </div>
    </section>
  );
}

function FindingCard({ finding }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{finding.category}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Confidence: {finding.confidence}</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-950">{finding.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{finding.description}</p>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">Impact {finding.scoreImpact}</div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Evidence</div>
          <p className="mt-2 break-words text-sm leading-6 text-slate-700">{finding.evidence || 'No evidence provided'}</p>
          {finding.url && (
            <a href={finding.url} target="_blank" rel="noreferrer" className="mt-3 block break-words text-sm font-medium text-cyan-700 hover:text-cyan-900">
              {finding.url}
            </a>
          )}
        </div>
        <div className="rounded-md border border-cyan-100 bg-cyan-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Recommendation</div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{finding.recommendation}</p>
        </div>
      </div>
    </article>
  );
}
