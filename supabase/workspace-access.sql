-- Review in Preview first. This workspace is one trusted internal team;
-- browser users access it through the app gate, never through Supabase keys.
begin;
alter table public.clients enable row level security;
alter table public.audits enable row level security;
alter table public.report_sends enable row level security;
revoke all on public.clients, public.audits, public.report_sends from public, anon, authenticated;
grant select, insert, update, delete on public.clients, public.audits, public.report_sends to service_role;
commit;
