import { authenticateAgent, AgentError } from '../../../../../../lib/agent/auth.js';
import { getJob } from '../../../../../../lib/agent/store.js';
import { json, failure } from '../../../../../../lib/agent/http.js';
import { applyOutreachPolicy } from '../../../../../../lib/agent/result.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,{params}) {
  try {
    const identity=authenticateAgent(request,'audits:read');const job=await getJob(params.id,identity.tenantId);
    if(!['completed','partial'].includes(job.status)) throw new AgentError('result_not_ready',409);
    return json(applyOutreachPolicy(job.result));
  } catch(error){return failure(error);}
}
