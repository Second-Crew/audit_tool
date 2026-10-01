export default function EvidencePanel({ result }) {
  if (!result) return null;
  const basics=result.scores.fetchedPageBasics;
  const failures=result.findings.filter(f=>['fail','needs_review','unknown'].includes(f.status));
  return <section className="rounded-lg border border-teal-200 bg-white p-6 shadow-sm">
    <h2 className="text-xl font-semibold text-slate-950">Evidence assessment</h2>
    <p className="mt-2 text-sm text-slate-600">Fetched-page basics: {basics.score == null ? 'Not scored' : `${basics.score}/100`} · {Math.round(basics.coverage*100)}% of weighted checks assessed · {result.coverage.pagesCrawled} pages</p>
    <p className="mt-2 text-sm text-slate-600">Provisional title, description and indexing checks on sampled HTML. This is not a ranking or AI visibility score. Site profile: {result.profile.value.replaceAll('_',' ')}{result.profile.requiresReview ? ' (suggested)' : ''}.</p>
    <p className="mt-2 text-sm text-slate-600">Automatic outreach stays disabled for checks that have not passed benchmark validation.</p>
    <div className="mt-4 space-y-2">{failures.slice(0,20).map(f=><details key={f.id} className="rounded border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-medium">{f.checkId} · {f.status.replaceAll('_',' ')} · {f.affectedUrls[0]}</summary>
      <p className="mt-2 text-sm">{f.recommendation}</p>
      <p className="mt-1 text-xs text-slate-500">{f.acceptanceTest}</p>
      <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(result.evidence.find(e=>e.id===f.evidenceIds[0])?.observation,null,2)}</pre>
    </details>)}</div>
    {failures.length>20&&<p className="mt-2 text-sm">Showing 20 of {failures.length} checks needing attention.</p>}
    <p className="mt-3 text-xs text-slate-500">Methodology: {result.methodologyVersion}. Evidence from fetched HTML{result.coverage.rendered ? ` and ${result.coverage.renderedPages} rendered pages` : ''}; live AI visibility is unassessed.</p>
  </section>;
}
