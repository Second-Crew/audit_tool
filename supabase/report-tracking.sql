-- Review the hosted definition and grants before applying to an isolated Preview.
-- Do not apply to a database shared with Production.
begin;

-- The route calls this as service_role. Invoker rights avoid granting the RPC
-- any extra table access; workspace-access.sql supplies server CRUD privileges.
create or replace function public.record_report_open(send_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  update public.report_sends
  set open_count = open_count + 1,
      first_opened_at = coalesce(first_opened_at, clock_timestamp()),
      last_opened_at = clock_timestamp()
  where id = send_id and audit_id is not null
  returning audit_id;
$$;

revoke all on function public.record_report_open(uuid) from public, anon, authenticated;
grant execute on function public.record_report_open(uuid) to service_role;
commit;
