-- Run this in Supabase SQL editor if you already have profiles/generated_memes.
-- Adds onboarding_drafts so the magic-link callback can load brand data by email.

create table if not exists public.onboarding_drafts (
  email text primary key,
  draft jsonb not null,
  created_at timestamptz default now()
);

alter table public.onboarding_drafts enable row level security;

create policy "Allow insert onboarding draft"
  on public.onboarding_drafts for insert
  with check (true);

create policy "Allow update onboarding draft"
  on public.onboarding_drafts for update
  with check (true);

create policy "Users can read and delete own draft by email"
  on public.onboarding_drafts for select
  using ((auth.jwt() ->> 'email') = email);

create policy "Users can delete own draft by email"
  on public.onboarding_drafts for delete
  using ((auth.jwt() ->> 'email') = email);
