import { authenticateAgent, AgentError } from '../../../../lib/agent/auth.js';
import { validateAgentInput, idempotencyKey, requestHash } from '../../../../lib/agent/input.js';
import { rpc, publicJob } from '../../../../lib/agent/store.js';
import { json, failure, readBody } from '../../../../lib/agent/http.js';
import { assertPublicHttpUrl } from '../../../../lib/audit/url.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request) {
  try {
    const identity=authenticateAgent(request,'audits:create');
    const key=idempotencyKey(request);
    const input=validateAgentInput(await readBody(request));
    try {await assertPublicHttpUrl(input.url);} catch {throw new AgentError('url_not_public_or_unresolvable',400);}
    const data=await rpc('enqueue_agent_audit',{p_tenant:identity.tenantId,p_credential:identity.credentialId,p_key:key,p_hash:requestHash(input),p_input:input});
    if(data.error) throw new AgentError(data.error,data.error==='idempotency_conflict'?409:429);
    return json({...publicJob(data.job),replayed:data.replayed},data.replayed?200:202,{Location:`/api/v1/audits/${data.job.id}`,'Retry-After':'5'});
  } catch(error) {return failure(error);}
}
