create table if not exists public.workspace_output_pins (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  generated_meme_id uuid not null references public.generated_memes(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (workspace_id, generated_meme_id)
);

create index if not exists workspace_output_pins_workspace_id_idx
  on public.workspace_output_pins (workspace_id, pinned_at asc);

create index if not exists workspace_output_pins_generated_meme_id_idx
  on public.workspace_output_pins (generated_meme_id);
