# Vertical slideshow setup

## 1. Run migration

Apply `supabase/migrations/20260317120000_vertical_slideshow.sql` (adds `template_family`, `slideshow_config` on `meme_templates`, and `slideshow_image_assets`).

## 2. Storage buckets

Create a public (or signed) bucket for curated backgrounds, default name **`slideshow-assets`**.

- Optional env: `SLIDESHOW_ASSETS_BUCKET`
- Ingestion script stores under prefix `vertical/` (override with `--storage-prefix=` or `SLIDESHOW_STORAGE_PREFIX`)

Ensure **`generated-memes`** remains available for rendered slide PNGs (existing bucket).

## 3. Ingest images

Place vertical images in `~/Desktop/tt-slideshow` (or pass `--dir=`).

```bash
pnpm exec tsx scripts/slideshow/ingest-tt-slideshow.ts --dry-run=true
pnpm exec tsx scripts/slideshow/ingest-tt-slideshow.ts --dry-run=false --dir="/path/to/tt-slideshow"
```

Requires `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Idempotency: same file hash → row skipped (metadata not refreshed). Delete the row or change file to re-process.

## 4. Add a slideshow template row

`generate-vertical-slideshow` loads `meme_templates` where `template_family = 'vertical_slideshow'` and the row is active.

Example (adjust `template_id` / constraints to match your table):

```sql
insert into public.meme_templates (
  template_id,
  template_name,
  slug,
  is_active,
  template_family,
  asset_type,
  slot_1_role,
  template_logic,
  emotion_style,
  context_fit,
  business_fit,
  promotion_fit,
  example_output,
  slideshow_config
) values (
  91001,
  'Brand vertical stories',
  'brand-vertical-stories',
  true,
  'vertical_slideshow',
  'image',
  'slideshow',
  'Create a cohesive 3–5 slide vertical story that matches the brand voice. Slides build narrative tension then resolve; image mood should stay consistent across the set.',
  'witty',
  'General SMB marketing contexts',
  'B2B and B2C brand social',
  'light promo when promotion_fit allows',
  '{"slide_count":4,"slideshow_intent":"...","slides":[...]}',
  '{
    "layout_a_max_chars": 26,
    "layout_b_max_chars": 34,
    "layout_a_max_lines": 3,
    "layout_b_max_lines": 4,
    "font_size_layout_a": 68,
    "font_size_layout_b": 68
  }'::jsonb
)
on conflict (slug) do update set
  template_family = excluded.template_family,
  slideshow_config = excluded.slideshow_config,
  is_active = excluded.is_active;
```

Slug `brand-vertical-stories` matches the default ordering pool in `lib/memes/slideshow/generate-vertical-slideshow.ts`.

## 5. UI

Create → choose **Vertical Slideshow** → Generate. Results show a swipeable 9:16 preview and per-slide downloads.

## 6. Output model

One `generated_memes` row per slideshow; `variant_metadata` includes `media_type: "slideshow"`, `output_format: "vertical_slideshow"`, `slide_count`, `slideshow_intent`, and `slides[]` with `image_url` per slide. `image_url` on the row is the **first slide** for simple previews.
