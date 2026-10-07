import { authenticateAgent } from '../../../../../lib/agent/auth.js';
import { getJob, publicJob } from '../../../../../lib/agent/store.js';
import { json, failure } from '../../../../../lib/agent/http.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,{params}) {
  try {const identity=authenticateAgent(request,'audits:read');const {id}=await params;return json(publicJob(await getJob(id,identity.tenantId)));}
  catch(error){return failure(error);}
}
