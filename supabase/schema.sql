-- MVP schema: profiles and generated_memes
-- Run this in the Supabase SQL editor (or via supabase db push) after enabling auth.

-- Profiles: one row per user, onboarding and brand context
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  brand_name text,
  what_you_do text,
  audience text,
  country text,
  generation_mode text check (
    generation_mode is null
    or generation_mode in ('content_pack', 'on_demand')
  ),
  content_pack_unlocked_at timestamptz,
  content_pack_last_completed_batch integer default 0,
  english_variant text check (
    english_variant is null
    or english_variant in ('en-GB', 'en-US')
  ),
  onboarding_completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Onboarding drafts: temporary store for brand data before magic-link callback (keyed by email)
create table if not exists public.onboarding_drafts (
  email text primary key,
  draft jsonb not null,
  created_at timestamptz default now()
);

-- Generated memes: per-user meme generation results
create table if not exists public.generated_memes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  template_id text,
  top_text text,
  bottom_text text,
  title text,
  format text,
  image_url text,
  created_at timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.onboarding_drafts enable row level security;
alter table public.generated_memes enable row level security;

-- Profiles: users can read/update/insert their own row
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Onboarding drafts: anyone can insert/update (before login); user can read/delete only their row by email
create policy "Allow insert onboarding draft"
  on public.onboarding_drafts for insert
  with check (true);

create policy "Allow update onboarding draft"
  on public.onboarding_drafts for update
  with check (true);

-- RLS note:
-- Supabase RLS in this project doesn't allow reading `auth.users` (permission denied),
-- so we match drafts by the authenticated user's JWT email claim instead.
create policy "Users can read own draft by email"
  on public.onboarding_drafts for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));

create policy "Users can delete own draft by email"
  on public.onboarding_drafts for delete
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Generated memes: users can read/insert their own rows
create policy "Users can read own memes"
  on public.generated_memes for select
  using (auth.uid() = user_id);

create policy "Users can insert own memes"
  on public.generated_memes for insert
  with check (auth.uid() = user_id);

-- Workspace domain: prompt-first AI workspaces
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  anon_token_hash text null,
  initial_prompt text not null,
  business_url text null,
  business_summary text null,
  detected_content_type text null,
  status text not null default 'active' check (status in ('active', 'archived')),
  preview_generations_used integer not null default 0,
  last_message_at timestamptz null,
  linked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  message_type text not null default 'text'
    check (message_type in ('text', 'status', 'generation_result', 'gate_notice')),
  content jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by_user_id uuid null references auth.users(id) on delete set null,
  trigger_message_id uuid null references public.workspace_messages(id) on delete set null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'blocked_auth', 'blocked_payment', 'cancelled')),
  block_reason text null,
  prompt text not null,
  output_format text null check (output_format is null or output_format in ('square_image', 'square_video', 'vertical_slideshow', 'square_text')),
  requested_variant_count integer not null default 3,
  generation_run_id text null,
  metadata jsonb not null default '{}'::jsonb,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_job_outputs (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid not null references public.generation_jobs(id) on delete cascade,
  generated_meme_id uuid not null references public.generated_memes(id) on delete cascade,
  output_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(generation_job_id, generated_meme_id)
);

create table if not exists public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action_type text not null check (action_type in ('auth_required', 'payment_required')),
  payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('manual', 'stripe')),
  status text not null check (status in ('active', 'inactive')),
  plan_code text not null check (plan_code in ('starter_pack', 'unlimited')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspaces_user_id_idx on public.workspaces(user_id);
create index if not exists workspaces_created_at_idx on public.workspaces(created_at desc);
create index if not exists workspaces_status_idx on public.workspaces(status);
create index if not exists workspaces_last_message_at_idx on public.workspaces(last_message_at desc);
create index if not exists workspaces_anon_token_hash_idx on public.workspaces(anon_token_hash);
create index if not exists workspace_messages_workspace_created_idx on public.workspace_messages(workspace_id, created_at asc);
create index if not exists generation_jobs_workspace_created_idx on public.generation_jobs(workspace_id, created_at desc);
create index if not exists generation_jobs_workspace_status_idx on public.generation_jobs(workspace_id, status);
create index if not exists generation_jobs_status_idx on public.generation_jobs(status);
create index if not exists generation_jobs_generation_run_id_idx on public.generation_jobs(generation_run_id);
create unique index if not exists generation_jobs_one_active_per_workspace_idx
  on public.generation_jobs(workspace_id)
  where status in ('queued', 'running');
create index if not exists generation_job_outputs_job_order_idx on public.generation_job_outputs(generation_job_id, output_order asc);
create index if not exists generation_job_outputs_generated_meme_idx on public.generation_job_outputs(generated_meme_id);
create index if not exists pending_actions_workspace_created_idx on public.pending_actions(workspace_id, created_at desc);
create index if not exists pending_actions_unresolved_idx on public.pending_actions(resolved_at) where resolved_at is null;
create unique index if not exists pending_actions_one_unresolved_payment_per_workspace_idx
  on public.pending_actions(workspace_id)
  where action_type = 'payment_required' and resolved_at is null;
create index if not exists entitlements_user_status_idx on public.entitlements(user_id, status, created_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_messages enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_job_outputs enable row level security;
alter table public.pending_actions enable row level security;
alter table public.entitlements enable row level security;

create policy "Users can read own workspaces"
  on public.workspaces for select
  using (auth.uid() = user_id);

create policy "Users can update own workspaces"
  on public.workspaces for update
  using (auth.uid() = user_id);

create policy "Users can insert own workspaces"
  on public.workspaces for insert
  with check (user_id is null or auth.uid() = user_id);

create policy "Users can read own workspace_messages"
  on public.workspace_messages for select
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_messages.workspace_id and w.user_id = auth.uid()
    )
  );

create policy "Users can insert own workspace_messages"
  on public.workspace_messages for insert
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_messages.workspace_id and w.user_id = auth.uid()
    )
  );

create policy "Users can read own generation_jobs"
  on public.generation_jobs for select
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = generation_jobs.workspace_id and w.user_id = auth.uid()
    )
  );

create policy "Users can insert own generation_jobs"
  on public.generation_jobs for insert
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = generation_jobs.workspace_id and w.user_id = auth.uid()
    )
  );

create policy "Users can read own generation_job_outputs"
  on public.generation_job_outputs for select
  using (
    exists (
      select 1
      from public.generation_jobs j
      join public.workspaces w on w.id = j.workspace_id
      where j.id = generation_job_outputs.generation_job_id and w.user_id = auth.uid()
    )
  );

create policy "Users can read own pending_actions"
  on public.pending_actions for select
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = pending_actions.workspace_id and w.user_id = auth.uid()
    )
  );

create policy "Users can read own entitlements"
  on public.entitlements for select
  using (auth.uid() = user_id);
