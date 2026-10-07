import { accessToken, ACCESS_COOKIE, timingSafeEqualHex } from '../../../../lib/access.js';
import { runClaimEvaluation } from '../../../../lib/evaluation/claim-evaluation.js';
export const runtime='nodejs';
export const maxDuration=120;
let cached=null;let running=null;
export async function POST(request) {
  const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if(process.env.VERCEL_ENV!=='preview')return reply({error:'Evaluation is available only on Preview.'},403);
  if(!process.env.APP_ACCESS_PASSWORD)return reply({error:'Workspace authentication must be configured.'},503);
  const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${ACCESS_COOKIE}=`))?.slice(ACCESS_COOKIE.length+1);
  if(!timingSafeEqualHex(cookie,await accessToken(process.env.APP_ACCESS_PASSWORD)))return reply({error:'Authentication required.'},401);
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Same-origin request required.'},403);
  if(!process.env.TYPESAFE_API_KEY)return reply({error:'TypeSafe is not configured.'},503);
  // Fixed synthetic inputs only; no caller-supplied sources or claims. Reuse
  // results per warm instance for an hour to avoid accidental repeat charges.
  if(cached&&Date.now()-cached.at<3600000)return reply({...cached.result,cached:true});
  try {
    if(!running)running=runClaimEvaluation().then(result=>{cached={at:Date.now(),result};return result;}).finally(()=>{running=null;});
    return reply(await running);
  }catch{return reply({error:'Evaluation failed; no claims approved.'},503);}
}
