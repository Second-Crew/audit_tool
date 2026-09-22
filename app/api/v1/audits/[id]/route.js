import { authenticateAgent } from '../../../../../lib/agent/auth.js';
import { getJob, publicJob } from '../../../../../lib/agent/store.js';
import { json, failure } from '../../../../../lib/agent/http.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,{params}) {
  try {const identity=authenticateAgent(request,'audits:read');return json(publicJob(await getJob(params.id,identity.tenantId)));}
  catch(error){return failure(error);}
}
