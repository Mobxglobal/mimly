-- Vertical slideshow: template family columns + curated image library for slide backgrounds.

-- Template family distinguishes square memes from vertical slideshow content.
alter table public.meme_templates
  add column if not exists template_family text not null default 'square_meme';

comment on column public.meme_templates.template_family is
  'square_meme | vertical_slideshow — drives which generation pipeline loads the row.';

alter table public.meme_templates
  add column if not exists slideshow_config jsonb;

comment on column public.meme_templates.slideshow_config is
  'Metadata-driven limits for vertical_slideshow: layout_a/b max chars/lines, font sizes, colors.';

-- Curated vertical (9:16) images for slideshow backgrounds; metadata supports LLM-driven matching.
create table if not exists public.slideshow_image_assets (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null,
  storage_path text not null,
  public_url text,
  theme text,
  mood text,
  setting text,
  subject_type text,
  industry_tags text[] not null default '{}',
  color_profile text,
  text_overlay_suitability text,
  layout_a_fit smallint,
  layout_b_fit smallint,
  summary text,
  notes text,
  raw_metadata jsonb,
  created_at timestamptz not null default now(),
  constraint slideshow_image_assets_content_hash_unique unique (content_hash),
  constraint slideshow_image_assets_layout_a_fit_range check (
    layout_a_fit is null or (layout_a_fit >= 0 and layout_a_fit <= 10)
  ),
  constraint slideshow_image_assets_layout_b_fit_range check (
    layout_b_fit is null or (layout_b_fit >= 0 and layout_b_fit <= 10)
  )
);

create unique index if not exists slideshow_image_assets_storage_path_key
  on public.slideshow_image_assets (storage_path);

comment on table public.slideshow_image_assets is
  'Supabase-backed library of vertical images; ingestion fills metadata for slideshow matching.';

alter table public.slideshow_image_assets enable row level security;

-- Authenticated users can read assets (generation uses service role which bypasses RLS).
create policy "slideshow_image_assets_select_authenticated"
  on public.slideshow_image_assets
  for select
  to authenticated
  using (true);
