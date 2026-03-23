-- Hardening: enforce at most one queued/running generation job per workspace.

create unique index if not exists generation_jobs_one_active_per_workspace_idx
  on public.generation_jobs(workspace_id)
  where status in ('queued', 'running');
