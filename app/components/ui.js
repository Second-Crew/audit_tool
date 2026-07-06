export function ScoreCard({ label, value, caption }) {
  const tone = getScoreTone(value);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mt-3 text-4xl font-semibold ${tone.text}`}>{formatScore(value)}</div>
      <div className="mt-2 text-sm text-slate-500">{caption}</div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${value == null ? 0 : Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function StatusPill({ score }) {
  const tone = getScoreTone(score);
  const label = score >= 80 ? 'Strong' : score >= 60 ? 'Developing' : 'Needs Work';

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.pill}`}>{label}</span>;
}

export function Metric({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
    </div>
  );
}

export function MetricCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 break-words text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export function SignalPanel({ title, items }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <div className="text-sm text-slate-600">{item.label}</div>
            <div className={`text-sm font-semibold ${item.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UrlList({ title, urls }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-2">
        {urls.length ? urls.slice(0, 12).map((pageUrl) => (
          <a key={pageUrl} href={pageUrl} target="_blank" rel="noreferrer" className="block break-words rounded-md border border-slate-200 px-3 py-2 text-sm text-cyan-700 hover:border-cyan-300 hover:bg-cyan-50">
            {pageUrl}
          </a>
        )) : (
          <p className="text-sm text-slate-500">No pages detected.</p>
        )}
      </div>
    </div>
  );
}

export function TextList({ title, items, empty }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-3 space-y-2">
        {items?.length ? items.map((item) => (
          <div key={item} className="rounded-md bg-white px-3 py-2 text-sm leading-6 text-slate-700">{item}</div>
        )) : (
          <p className="text-sm text-slate-500">{empty}</p>
        )}
      </div>
    </div>
  );
}

export function SeverityBadge({ severity }) {
  const classes = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-sky-100 text-sky-700',
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${classes[severity] || 'bg-slate-100 text-slate-700'}`}>{severity}</span>;
}

export function CheckStatus({ status, score, maxScore }) {
  const classes = {
    passed: 'text-emerald-700 bg-emerald-50',
    partial: 'text-amber-700 bg-amber-50',
    unknown: 'text-slate-700 bg-slate-100',
    failed: 'text-red-700 bg-red-50',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${classes[status] || classes.failed}`}>
      {status} · {score}/{maxScore}
    </span>
  );
}

export function getScoreTone(value) {
  if (value == null) {
    return {
      text: 'text-slate-400',
      bar: 'bg-slate-300',
      pill: 'bg-slate-100 text-slate-700',
    };
  }

  if (value >= 75) {
    return {
      text: 'text-emerald-700',
      bar: 'bg-emerald-500',
      pill: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (value >= 55) {
    return {
      text: 'text-amber-700',
      bar: 'bg-amber-500',
      pill: 'bg-amber-100 text-amber-700',
    };
  }

  return {
    text: 'text-red-700',
    bar: 'bg-red-500',
    pill: 'bg-red-100 text-red-700',
  };
}

export function formatScore(value) {
  return value == null ? 'N/A' : value;
}
