create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  company_name text,
  industry text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  domain text not null,
  requested_url text not null,
  status text not null default 'completed',
  crawl_summary jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  category_details jsonb not null default '{}'::jsonb,
  competitors jsonb not null default '[]'::jsonb,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists clients_domain_idx on public.clients (domain);
create index if not exists audits_client_created_idx on public.audits (client_id, created_at desc);
create index if not exists audits_domain_created_idx on public.audits (domain, created_at desc);
create index if not exists audits_scores_gin_idx on public.audits using gin (scores);
create index if not exists audits_findings_gin_idx on public.audits using gin (findings);

alter table public.clients enable row level security;
alter table public.audits enable row level security;

-- Server-side requests should use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- Add user/team policies later when the product moves beyond internal-team use.

-- Report sends: who a diagnostic report was sent to and whether they opened
-- the tracked link (/r/<send id>).
create table if not exists public.report_sends (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid references public.audits(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  domain text not null,
  prospect_name text,
  prospect_email text not null,
  sent_at timestamptz not null default now(),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0
);

create index if not exists report_sends_domain_idx on public.report_sends (domain, sent_at desc);
create index if not exists report_sends_email_idx on public.report_sends (prospect_email);

alter table public.report_sends enable row level security;
