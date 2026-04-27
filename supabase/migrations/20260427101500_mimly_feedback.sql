create table if not exists public.mimly_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid null,
  session_id text not null,
  was_content_good boolean not null,
  would_use_again boolean not null,
  looks_like_ai_slop text not null check (looks_like_ai_slop in ('not_really', 'a_bit')),
  user_agent text null,
  source text not null default 'beta_gate'
);

create index if not exists mimly_feedback_created_at_idx on public.mimly_feedback (created_at desc);
