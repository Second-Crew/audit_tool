import { verifyClaim, quotePresent, CLAIM_RUBRIC, SUPPORT_THRESHOLD } from '../audit/claim-verification.js';
import { CLAIM_CASES, CLAIM_CASESET_VERSION } from './claim-cases.js';
import { MODEL } from '../audit/typesafe.js';
export function summarizePredictions(rows, predict) {
  let tp=0,fp=0,fn=0,tn=0;
  for(const row of rows) {
    const positive=row.expected==='supported';const accepted=predict(row);
    if(accepted&&positive)tp++;else if(accepted)fp++;else if(positive)fn++;else tn++;
  }
  const accepted=tp+fp;const positives=tp+fn;
  return {cases:rows.length,accepted,trueAccepts:tp,falseAccepts:fp,missedSupported:fn,trueRejects:tn,
    precision:accepted?tp/accepted:null,recall:positives?tp/positives:null,
    precisionInterval95:accepted?wilson(tp,accepted):null};
}
function wilson(successes,n) {
  const z=1.96,p=successes/n,denominator=1+z*z/n;
  const center=(p+z*z/(2*n))/denominator;
  const margin=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/denominator;
  return {lower:Math.max(0,center-margin),upper:Math.min(1,center+margin)};
}
export async function runClaimEvaluation({cases=CLAIM_CASES,verify=verifyClaim,env=process.env,timeoutMs=60000}={}) {
  const started=Date.now(),controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  const rows=new Array(cases.length);let cursor=0;
  async function worker(){while(cursor<cases.length){const index=cursor++;const item=cases[index];
    const result=controller.signal.aborted?{verdict:'unavailable',status:'unavailable',wouldAccept:false,reason:'evaluation_deadline',usage:{inputTokens:0,outputTokens:0}}:await verify(item,{env,signal:controller.signal});
    rows[index]={...item,quoteBaselineAccepts:quotePresent(item.source,item.quote),result};
  }}
  try{await Promise.all(Array.from({length:Math.min(4,cases.length)},worker));}finally{clearTimeout(timeout);}
  const groups=Object.fromEntries([...new Set(rows.map(r=>r.profile))].map(profile=>[profile,summarizePredictions(rows.filter(r=>r.profile===profile),r=>r.result.wouldAccept)]));
  return {casesetVersion:CLAIM_CASESET_VERSION,rubricVersion:CLAIM_RUBRIC,model:MODEL,threshold:SUPPORT_THRESHOLD,
    createdAt:new Date().toISOString(),elapsedMs:Date.now()-started,scope:'synthetic_development_only',productionApproved:false,
    metrics:summarizePredictions(rows,r=>r.result.wouldAccept),quoteOnlyBaseline:summarizePredictions(rows,r=>r.quoteBaselineAccepts),byProfile:groups,
    unavailable:rows.filter(r=>r.result.status==='unavailable').length,needsReview:rows.filter(r=>r.result.status==='needs_review').length,
    usage:rows.reduce((sum,row)=>({inputTokens:sum.inputTokens+(row.result.usage?.inputTokens||0),outputTokens:sum.outputTokens+(row.result.usage?.outputTokens||0)}),{inputTokens:0,outputTokens:0}),rows,
    nextGate:'Independent reviewer-labeled website cases, separate tuning and held-out sets, and per-profile precision/coverage validation are required before production approval.'};
}
