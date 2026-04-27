alter table public.workspaces
  add column if not exists session_id text;

create index if not exists idx_workspaces_session_id
  on public.workspaces (session_id);
