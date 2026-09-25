'use client';
import { useState } from 'react';
import TypeSafePanel from './TypeSafePanel.js';
const percent=value=>value==null?'Not measurable':`${Math.round(value*100)}%`;
export default function InternalDiagnostics({ semantic }) {
  const [open,setOpen]=useState(false),[result,setResult]=useState(null),[running,setRunning]=useState(false),[error,setError]=useState('');
  async function evaluate(){
    setRunning(true);setError('');
    try{
      const response=await fetch('/api/internal/claim-evaluation',{method:'POST'});
      const data=await response.json();if(!response.ok)throw new Error(data.error || 'Evaluation unavailable.');setResult(data);
    }catch(error){setError(error.message || 'Evaluation unavailable.');}finally{setRunning(false);}
  }
  return <details className="mx-auto my-8 max-w-7xl rounded border border-slate-200 bg-slate-50 p-4 print:hidden" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm text-slate-600">Internal diagnostics</summary>
    {open&&<div className="mt-4 space-y-4">
      <section className="rounded border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Claim verification validation</h2>
        <p className="mt-2 text-sm text-slate-600">Preview only. Tests 24 synthetic development cases across service, ecommerce, SaaS and informational content. Compares evidence support checks with quote matching alone. This does not certify real-website accuracy or approve outreach.</p>
        <button disabled={running} onClick={evaluate} className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{running?'Testing claim support…':'Run development evaluation'}</button>
        <p className="mt-2 text-xs text-slate-500">Uses the configured TypeSafe API; up to 20 model requests. Results may be reused for one hour on the same server instance.</p>
        {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {result&&<div className="mt-4 space-y-3 text-sm">
          <p>Accepted-claim precision: {percent(result.metrics.precision)} · Quote-only baseline: {percent(result.quoteOnlyBaseline.precision)}</p>
          <p>False accepts: {result.metrics.falseAccepts} · Supported claims accepted: {result.metrics.trueAccepts}/{result.metrics.trueAccepts+result.metrics.missedSupported} · Needs review: {result.needsReview} · Unavailable: {result.unavailable}</p>
          <p>95% precision interval: {result.metrics.precisionInterval95?`${percent(result.metrics.precisionInterval95.lower)}–${percent(result.metrics.precisionInterval95.upper)}`:'Not measurable'}. Small synthetic sample; independent validation still required.</p>
          {result.rows.map(row=><details className="rounded border p-3" key={row.id}><summary className="cursor-pointer">{row.id} · expected {row.expected} · returned {row.result.verdict}{row.result.status==='needs_review'?' (review)':''}</summary><p className="mt-2">Claim: {row.claim}</p><blockquote className="mt-2 border-l-2 pl-3">{row.source}</blockquote></details>)}
          <p className="text-xs text-slate-500">Rubric {result.rubricVersion} · Model {result.model} · {result.usage.inputTokens} input tokens · {result.usage.outputTokens} output tokens · {Math.round(result.elapsedMs/1000)} seconds. Production approval: no.</p>
        </div>}
      </section>
      {semantic&&semantic.mode!=='off'&&<details><summary className="cursor-pointer text-sm">Archived content-scoring pilot</summary><p className="my-2 text-sm text-slate-600">Historical experimental output. Not used to determine report scores or outreach eligibility.</p><TypeSafePanel result={semantic}/></details>}
    </div>}
  </details>;
}
