-- Prerequisites for anonymous workspace slideshow generation (outputs with user_id NULL).
--
-- Server-side generation uses the Supabase service role (bypasses RLS), so you do NOT need
-- policies that grant anon/authenticated INSERT on generated_memes.
--
-- Apply after:
--   - 20260317120000_vertical_slideshow.sql (slideshow_image_assets table)
--   - 20260323120000_workspace_domain.sql (nullable generated_memes.user_id) — this file is idempotent with that.

-- 1) Allow NULL user_id on generated outputs (anonymous / pre-auth workspace).
alter table public.generated_memes
  alter column user_id drop not null;

-- 2) Optional but recommended: allow the anon key to read the curated slideshow background catalog.
--    (Generation still uses the service role; this helps if any client/edge path reads assets with anon.)
drop policy if exists "slideshow_image_assets_select_anon" on public.slideshow_image_assets;
create policy "slideshow_image_assets_select_anon"
  on public.slideshow_image_assets
  for select
  to anon
  using (true);
