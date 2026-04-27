-- MVP: allow browser Supabase client (anon key) to receive Realtime postgres_changes on generation_jobs.
-- Replace with stricter RLS when auth ships (see project notes).

alter table public.generation_jobs enable row level security;

drop policy if exists "mvp_allow_read_generation_jobs" on public.generation_jobs;
create policy "mvp_allow_read_generation_jobs"
  on public.generation_jobs
  for select
  using (true);

-- Denormalized from workspaces.session_id at enqueue time (optional analytics / future RLS).
alter table public.generation_jobs
  add column if not exists session_id text;

create index if not exists generation_jobs_session_id_idx
  on public.generation_jobs (session_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'generation_jobs'
  ) then
    alter publication supabase_realtime add table public.generation_jobs;
  end if;
end $$;
