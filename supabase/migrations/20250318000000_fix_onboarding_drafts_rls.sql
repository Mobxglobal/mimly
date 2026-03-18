-- Fix onboarding_drafts RLS so the magic-link callback can read drafts reliably.
-- The previous policy relied on `auth.jwt() ->> 'email'`, which isn't guaranteed to exist.

drop policy if exists "Users can read and delete own draft by email" on public.onboarding_drafts;
drop policy if exists "Users can delete own draft by email" on public.onboarding_drafts;

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

