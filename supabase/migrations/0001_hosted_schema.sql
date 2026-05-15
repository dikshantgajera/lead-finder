create extension if not exists pgcrypto;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('leads', 'crm', 'final-list', 'fb-page-id-reports', 'map-gap')),
  name text not null,
  storage_path text not null,
  record_count integer not null default 0,
  size_bytes bigint not null default 0,
  source_job_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists files_user_kind_name_idx
  on public.files (user_id, kind, name);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null check (type in ('search', 'enrich', 'fb-page-ids', 'find-ads', 'map-gap')),
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancel_requested', 'cancelled')),
  input_json jsonb not null default '{}'::jsonb,
  progress_step text not null default '',
  progress_log jsonb not null default '[]'::jsonb,
  github_run_id bigint null,
  result_file_id uuid null,
  result_summary_json jsonb null,
  error_message text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null
);

alter table public.files enable row level security;
alter table public.jobs enable row level security;

drop policy if exists "users_manage_own_files" on public.files;
create policy "users_manage_own_files"
  on public.files
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_jobs" on public.jobs;
create policy "users_manage_own_jobs"
  on public.jobs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values
  ('leads', 'leads', false),
  ('crm', 'crm', false),
  ('final-list', 'final-list', false),
  ('fb-page-id-reports', 'fb-page-id-reports', false)
on conflict (id) do nothing;
