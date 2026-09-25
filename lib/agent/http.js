import { AgentError } from './auth.js';
export function json(body,status=200,headers={}) { return Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}}); }
export function failure(error) {
  const known = error instanceof AgentError;
  return json({error:{code:known ? error.code : 'service_unavailable',retryable:!known || error.status===503 || error.status===429}},known ? error.status : 503);
}
export async function readBody(request) {
  const reader=request.body?.getReader(); if (!reader) throw new AgentError('invalid_json',400);
  let text=''; let bytes=0; const decoder=new TextDecoder();
  try { while (true) { const {done,value}=await reader.read(); if(done) break; bytes+=value.byteLength; if(bytes>8192) {await reader.cancel(); throw new AgentError('body_too_large',413);} text+=decoder.decode(value,{stream:true}); } text+=decoder.decode(); }
  finally {reader.releaseLock();}
  try{return JSON.parse(text);}catch{throw new AgentError('invalid_json',400);}
}
