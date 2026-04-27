-- Safe subset for future read paths (no prompts, metadata, or user ids).
create or replace view public.generation_jobs_public as
select
  id,
  workspace_id,
  status,
  created_at,
  updated_at
from public.generation_jobs;
