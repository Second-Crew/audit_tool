-- Apply once in the same Supabase project used by the API and worker.
-- No grants to anon/authenticated; all access goes through server-side tenant checks.
create table if not exists public.agent_audit_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  credential_id text not null,
  idempotency_key text not null,
  request_hash text not null,
  input jsonb not null,
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','cancelled')),
  stage text not null default 'queued',
  result jsonb,
  error_code text,
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
alter table public.agent_audit_jobs enable row level security;
revoke all on public.agent_audit_jobs from anon, authenticated;
grant select, insert, update on public.agent_audit_jobs to service_role;
create index if not exists agent_jobs_queue_idx on public.agent_audit_jobs(status, created_at);
create index if not exists agent_jobs_tenant_idx on public.agent_audit_jobs(tenant_id, created_at desc);

create or replace function public.enqueue_agent_audit(p_tenant text, p_credential text, p_key text, p_hash text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare job agent_audit_jobs; n integer;
begin
  -- Serialize enqueue and quotas per tenant; replay is checked before quota.
  perform pg_advisory_xact_lock(hashtextextended('agent:' || p_tenant, 0));
  select * into job from agent_audit_jobs where tenant_id=p_tenant and idempotency_key=p_key;
  if found then
    if job.request_hash <> p_hash then return jsonb_build_object('error','idempotency_conflict'); end if;
    return jsonb_build_object('job',to_jsonb(job),'replayed',true);
  end if;
  select count(*) into n from agent_audit_jobs where tenant_id=p_tenant and created_at > now()-interval '1 day';
  if n >= 20 then return jsonb_build_object('error','daily_limit'); end if;
  select count(*) into n from agent_audit_jobs where tenant_id=p_tenant and status in ('queued','running');
  if n >= 2 then return jsonb_build_object('error','queue_limit'); end if;
  insert into agent_audit_jobs(tenant_id,credential_id,idempotency_key,request_hash,input)
    values(p_tenant,p_credential,p_key,p_hash,p_input) returning * into job;
  return jsonb_build_object('job',to_jsonb(job),'replayed',false);
end $$;

create or replace function public.claim_agent_audit()
returns jsonb language plpgsql security definer set search_path = public as $$
declare job agent_audit_jobs; n integer;
begin
  -- Global lock ensures the concurrency ceiling across worker instances.
  perform pg_advisory_xact_lock(hashtextextended('agent:workers',0));
  update agent_audit_jobs set status='failed',stage='failed',error_code='worker_lease_expired',updated_at=now()
    where status='running' and lease_until < now() and attempts >= 2;
  update agent_audit_jobs set status='queued',stage='queued',lease_token=null,lease_until=null,updated_at=now()
    where status='running' and lease_until < now() and attempts < 2;
  select count(*) into n from agent_audit_jobs where status='running';
  if n >= 2 then return null; end if;
  select * into job from agent_audit_jobs where status='queued' order by created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update agent_audit_jobs set status='running',stage='starting',attempts=attempts+1,
    lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now()
    where id=job.id returning * into job;
  return to_jsonb(job);
end $$;

revoke all on function public.enqueue_agent_audit(text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.claim_agent_audit() from public,anon,authenticated;
grant execute on function public.enqueue_agent_audit(text,text,text,text,jsonb) to service_role;
grant execute on function public.claim_agent_audit() to service_role;
