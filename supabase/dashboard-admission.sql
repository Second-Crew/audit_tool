-- Review and apply to an isolated Preview database before activation.
-- Shared dashboard controls are independent of the optional agent API.
begin;
create table if not exists public.dashboard_audit_attempts (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  client_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists dashboard_attempts_client_idx
  on public.dashboard_audit_attempts(scope, client_hash, created_at);
create table if not exists public.dashboard_audit_leases (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  expires_at timestamptz not null default clock_timestamp() + interval '15 minutes'
);
alter table public.dashboard_audit_attempts enable row level security;
alter table public.dashboard_audit_leases enable row level security;
revoke all on public.dashboard_audit_attempts, public.dashboard_audit_leases from public, anon, authenticated;

create or replace function public.reserve_dashboard_audit(p_scope text, p_client_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n integer; lease_id uuid; current_time_at timestamptz;
begin
  if p_scope is null or p_scope not in ('dashboard:production', 'dashboard:preview', 'dashboard:local')
     or p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid admission scope or client hash';
  end if;
  -- One atomic decision across API instances, including different clients.
  perform pg_advisory_xact_lock(hashtextextended('admission:' || p_scope, 0));
  current_time_at := clock_timestamp();
  delete from public.dashboard_audit_attempts where scope = p_scope and created_at <= current_time_at - interval '10 minutes';
  delete from public.dashboard_audit_leases where scope = p_scope and expires_at <= current_time_at;
  select count(*) into n from public.dashboard_audit_attempts where scope = p_scope and client_hash = p_client_hash;
  if n >= 5 then return jsonb_build_object('error', 'rate_limit'); end if;
  -- Busy attempts count toward the address limit, as in the old route.
  insert into public.dashboard_audit_attempts(scope, client_hash) values(p_scope, p_client_hash);
  select count(*) into n from public.dashboard_audit_leases where scope = p_scope;
  if n >= 2 then return jsonb_build_object('error', 'busy'); end if;
  insert into public.dashboard_audit_leases(scope, expires_at)
    values(p_scope, current_time_at + interval '15 minutes') returning id into lease_id;
  return jsonb_build_object('leaseId', lease_id);
end $$;

create or replace function public.release_dashboard_audit(p_lease_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.dashboard_audit_leases where id = p_lease_id;
$$;
revoke all on function public.reserve_dashboard_audit(text,text) from public, anon, authenticated;
revoke all on function public.release_dashboard_audit(uuid) from public, anon, authenticated;
grant execute on function public.reserve_dashboard_audit(text,text) to service_role;
grant execute on function public.release_dashboard_audit(uuid) to service_role;
commit;
