import { getSupabaseConfig, supabaseRequest } from '../supabase.js';
import { AgentError } from './auth.js';
function config() { const value = getSupabaseConfig(); if (!value) throw new AgentError('storage_unavailable',503); return value; }
export async function rpc(name, args = {}) { return supabaseRequest(config(), `/rpc/${name}`, {method:'POST',body:JSON.stringify(args)}); }
export async function getJob(id, tenant) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new AgentError('not_found',404);
  const rows = await supabaseRequest(config(), `/agent_audit_jobs?id=eq.${id}&tenant_id=eq.${encodeURIComponent(tenant)}&select=*`, {cache:'no-store'});
  if (!rows?.length) throw new AgentError('not_found',404);
  return rows[0];
}
export async function cancelJob(id, tenant) {
  await getJob(id,tenant);
  await supabaseRequest(config(), `/agent_audit_jobs?id=eq.${id}&tenant_id=eq.${encodeURIComponent(tenant)}&status=in.(queued,running)`, {
    method:'PATCH',body:JSON.stringify({status:'cancelled',stage:'cancelled',updated_at:new Date().toISOString(),lease_token:null,lease_until:null}),
  });
  return getJob(id,tenant);
}
export async function updateLease(job, patch) {
  return supabaseRequest(config(), `/agent_audit_jobs?id=eq.${job.id}&lease_token=eq.${job.lease_token}&status=eq.running`, {
    method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({...patch,updated_at:new Date().toISOString()}),
  });
}
export function publicJob(job) {
  return { schemaVersion:'1.0', id:job.id, status:job.status, stage:job.stage, createdAt:job.created_at, updatedAt:job.updated_at,
    attempts:job.attempts, error:job.error_code ? {code:job.error_code} : null,
    links:{self:`/api/v1/audits/${job.id}`,result:`/api/v1/audits/${job.id}/result`,cancel:`/api/v1/audits/${job.id}/cancel`} };
}
