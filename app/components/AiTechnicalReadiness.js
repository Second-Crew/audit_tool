import { readinessSummary } from '../../lib/audit/readiness-display.js';

export default function AiTechnicalReadiness({ checklist }) {
  if (!checklist) return null;
  return <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-semibold text-slate-950">AI Technical Readiness</h2>
    {readinessSummary(checklist).map(line => <p key={line} className="text-sm text-slate-700">{line}</p>)}
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <h3 className="font-semibold">Critical access / reuse blockers</h3>
      {checklist.blockers.length ? <ul className="mt-2 list-disc space-y-2 pl-5">{checklist.blockers.map((check, index) => <li key={index}><strong>{check.label}</strong>: {check.url} — {check.evidence}</li>)}</ul> : <p className="mt-2">No failed crawler/indexing/snippet checks recorded; unknown checks remain unverified.</p>}
    </div>
    <h3 className="font-semibold">Supporting features</h3>
    <div className="grid gap-4 lg:grid-cols-2">{checklist.supportingFeatures.map(feature => <article key={feature.id} className="rounded-lg border border-slate-200 p-4 text-sm">
      <h4 className="font-semibold">{feature.name} — {feature.status}</h4>
      <p className="mt-2">Presence: {feature.presence}</p>
      <p className="mt-2 text-slate-600">{feature.rationale}</p>
      {feature.issues.map(issue => <p key={issue} className="mt-2 text-amber-900">Issue: {issue}</p>)}
      {feature.recommendedFixes.map(fix => <p key={fix} className="mt-2">Recommended action: {fix}</p>)}
      <details className="mt-3"><summary className="cursor-pointer font-medium">Evidence ({feature.evidence.length})</summary>
        {feature.evidence.length ? feature.evidence.map((e, index) => <p key={index} className="mt-2 break-words text-slate-600">{e.url} · {e.observedAt || 'Observation time unavailable'} · {e.evidenceSource} — {e.facts}</p>) : <p className="mt-2">No feature evidence in the assessed sample.</p>}
      </details>
    </article>)}</div>
    <details><summary className="cursor-pointer text-sm font-semibold">Per-page core checks ({checklist.checks.length})</summary>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Check / status</th><th className="p-2">Requested → final URL</th><th className="p-2">Source / time</th><th className="p-2">Evidence</th></tr></thead><tbody>{checklist.checks.map((check, index) => <tr key={index} className="border-t border-slate-200"><td className="p-2">{check.label}: {check.status}</td><td className="p-2 break-all">{check.url} → {check.finalUrl}</td><td className="p-2">{check.evidenceSource} / {check.observedAt || 'unavailable'}</td><td className="p-2">{check.evidence}</td></tr>)}</tbody></table></div>
    </details>
  </section>;
}
