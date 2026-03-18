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
  user_id uuid not null references auth.users(id) on delete cascade,
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
-- `auth.jwt() ->> 'email'` isn't guaranteed to be present in the JWT claim,
-- so match drafts by the authenticated user's id via `auth.users`.
create policy "Users can read own draft by uid email"
  on public.onboarding_drafts for select
  using (
    exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and lower(u.email) = lower(onboarding_drafts.email)
    )
  );

create policy "Users can delete own draft by uid email"
  on public.onboarding_drafts for delete
  using (
    exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and lower(u.email) = lower(onboarding_drafts.email)
    )
  );

-- Generated memes: users can read/insert their own rows
create policy "Users can read own memes"
  on public.generated_memes for select
  using (auth.uid() = user_id);

create policy "Users can insert own memes"
  on public.generated_memes for insert
  with check (auth.uid() = user_id);
