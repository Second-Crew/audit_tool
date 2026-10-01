-- Read-only release evidence. Run in each intended database as an administrator.
-- This inspects schema/access metadata; it does not expose report contents.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon_grants,
  has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as authenticated_grants,
  has_table_privilege('service_role', c.oid, 'select') as server_select,
  has_table_privilege('service_role', c.oid, 'insert') as server_insert,
  has_table_privilege('service_role', c.oid, 'update') as server_update,
  has_table_privilege('service_role', c.oid, 'delete') as server_delete
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in
  ('clients','audits','report_sends','dashboard_audit_attempts','dashboard_audit_leases');

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in
  ('clients','audits','report_sends','dashboard_audit_attempts','dashboard_audit_leases');

select p.oid::regprocedure as function_name, p.prosecdef as security_definer, p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as server_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('record_report_open','reserve_dashboard_audit','release_dashboard_audit');

select count(*) as saved_audits, min(created_at) as oldest_audit, max(created_at) as newest_audit,
  count(*) filter (where report ? 'observed_panel' and report->'observed_panel' <> 'null'::jsonb) as raw_panel_records
from public.audits;
