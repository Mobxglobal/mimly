alter table public.generation_jobs
  add column if not exists metadata jsonb not null default '{}'::jsonb;
