import { authenticateAgent } from '../../../../../../lib/agent/auth.js';
import { cancelJob, publicJob } from '../../../../../../lib/agent/store.js';
import { json, failure } from '../../../../../../lib/agent/http.js';
export const runtime='nodejs';
export async function POST(request,{params}) {
  try {const identity=authenticateAgent(request,'audits:cancel');const {id}=await params;return json(publicJob(await cancelJob(id,identity.tenantId)));}
  catch(error){return failure(error);}
}
