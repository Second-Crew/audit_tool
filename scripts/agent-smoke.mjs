// Never log credentials. Run against an authorized Preview API with a worker.
import { randomUUID } from 'node:crypto';
const base=process.env.AUDIT_API_URL;
const key=process.env.AUDIT_API_KEY;
if(!base||!key) throw new Error('Set AUDIT_API_URL and AUDIT_API_KEY');
const target=new URL(base);
if(target.protocol!=='https:' && !['localhost','127.0.0.1'].includes(target.hostname)) throw new Error('HTTPS required');
const headers={Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()};
async function call(path,options={}) {
  const response=await fetch(new URL(path,base),{...options,headers,redirect:'error',signal:AbortSignal.timeout(20000)});
  const body=await response.json();if(!response.ok) throw new Error(body.error?.code||`HTTP ${response.status}`);return body;
}
const job=await call('/api/v1/audits',{method:'POST',body:JSON.stringify({url:process.argv[2]||'https://example.com',maxPages:5})});
const replay=await call('/api/v1/audits',{method:'POST',body:JSON.stringify({url:process.argv[2]||'https://example.com',maxPages:5})});
if(job.id!==replay.id||!replay.replayed) throw new Error('Idempotency failed');
console.log('Audit queued',job.id);
const deadline=Date.now()+600000;
while(Date.now()<deadline) {
  const current=await call(job.links.self);
  if(['failed','cancelled'].includes(current.status)) throw new Error(current.error?.code||current.status);
  if(['completed','partial'].includes(current.status)) {
    const result=await call(job.links.result);
    console.log(JSON.stringify({id:job.id,status:current.status,pages:result.coverage.pagesCrawled,findings:result.findings.length,eligible:result.findings.filter(f=>f.outreachEligible).length,scores:result.scores},null,2));process.exit(0);
  }
  await new Promise(r=>setTimeout(r,5000));
}
throw new Error('Polling deadline exceeded; the job may still be queued. Check worker health.');
