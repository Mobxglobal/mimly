create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  generated_meme_id uuid not null references public.generated_memes (id) on delete cascade,
  created_by_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null
);

create index if not exists share_links_generated_meme_id_idx
  on public.share_links (generated_meme_id);

alter table public.share_links enable row level security;
