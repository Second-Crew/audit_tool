-- Isolated test database only; run after dashboard-admission.sql.
begin;
do $$
declare a jsonb; b jsonb; n integer;
begin
  a := public.reserve_dashboard_audit('dashboard:preview', repeat('a',64));
  b := public.reserve_dashboard_audit('dashboard:preview', repeat('b',64));
  if a->>'leaseId' is null or b->>'leaseId' is null or a->>'leaseId' = b->>'leaseId' then raise exception 'distinct leases missing'; end if;
  if public.reserve_dashboard_audit('dashboard:preview', repeat('c',64))->>'error' <> 'busy' then raise exception 'global ceiling missing'; end if;
  if public.reserve_dashboard_audit('dashboard:production', repeat('a',64))->>'leaseId' is null then raise exception 'environment isolation missing'; end if;
  perform public.release_dashboard_audit((a->>'leaseId')::uuid);
  perform public.release_dashboard_audit((a->>'leaseId')::uuid);
  a := public.reserve_dashboard_audit('dashboard:preview', repeat('a',64));
  if a->>'leaseId' is null then raise exception 'release missing'; end if;
  for n in 1..3 loop perform public.reserve_dashboard_audit('dashboard:preview', repeat('a',64)); end loop;
  if public.reserve_dashboard_audit('dashboard:preview', repeat('a',64))->>'error' <> 'rate_limit' then raise exception 'rate limit missing'; end if;
  update public.dashboard_audit_attempts set created_at = now() - interval '11 minutes';
  update public.dashboard_audit_leases set expires_at = now() - interval '1 minute';
  if public.reserve_dashboard_audit('dashboard:preview', repeat('a',64))->>'leaseId' is null then raise exception 'expiry recovery missing'; end if;
  if has_function_privilege('anon','public.reserve_dashboard_audit(text,text)','execute')
     or has_function_privilege('authenticated','public.release_dashboard_audit(uuid)','execute')
     or has_table_privilege('anon','public.dashboard_audit_attempts','select')
     or has_table_privilege('authenticated','public.dashboard_audit_leases','insert') then raise exception 'public access allowed'; end if;
  if not has_function_privilege('service_role','public.reserve_dashboard_audit(text,text)','execute') then raise exception 'service access missing'; end if;
  raise notice 'PASS: distinct leases, global ceiling, environment isolation, idempotent release, rate limit, expiry recovery, restricted roles';
end $$;
set local role service_role;
select public.reserve_dashboard_audit('dashboard:local', repeat('d',64)) as service_role_reservation;
rollback;
