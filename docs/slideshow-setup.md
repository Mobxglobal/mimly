# Vertical Slideshow Setup

Short runbook for ingesting slideshow background assets and generating slideshow outputs.

## 0) Prerequisites

- Required env vars:
  - `OPENAI_API_KEY`
  - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
  - `SUPABASE_SERVICE_ROLE_KEY`
- Optional env vars:
  - `SLIDESHOW_INGEST_DIR` (override default local source folder for ingestion)
  - `SLIDESHOW_ASSETS_BUCKET` (default: `slideshow-assets`)
  - `SLIDESHOW_STORAGE_PREFIX` (default: `vertical`)

## 1) Apply migration

Apply:

- `supabase/migrations/20260317120000_vertical_slideshow.sql`

This adds slideshow fields (`template_family`, `slideshow_config`) and the `slideshow_image_assets` table.

## 2) Confirm storage buckets

- Create/confirm a bucket for source slideshow backgrounds:
  - default: `slideshow-assets`
- Keep existing `generated-memes` bucket available (used for rendered slide outputs).

## 3) Prepare local source images

- Put vertical images in **`~/Desktop/New_templates/tt-slideshow`** (default path used by the ingest script).
- Override with `--dir="/path/to/folder"` or `SLIDESHOW_INGEST_DIR`.
- Supported extensions: `.png`, `.jpg`, `.jpeg`, `.webp`.

## 4) Run ingestion script

Script:

- `scripts/slideshow/ingest-tt-slideshow.ts`

### 4a) Dry run first

```bash
pnpm exec tsx scripts/slideshow/ingest-tt-slideshow.ts --dry-run=true
```

Uses default folder `~/Desktop/New_templates/tt-slideshow`.

### 4b) Real ingestion

```bash
pnpm exec tsx scripts/slideshow/ingest-tt-slideshow.ts --dry-run=false
```

Optional explicit path (same as default on macOS):

```bash
pnpm exec tsx scripts/slideshow/ingest-tt-slideshow.ts --dry-run=false --dir="$HOME/Desktop/New_templates/tt-slideshow"
```

Useful options:

- `--limit=20`
- `--report=./tmp/slideshow-ingest-report.json`
- `--storage-prefix=vertical`
- `--vision-delay-ms=400` (or `SLIDESHOW_VISION_DELAY_MS`) — optional pause between vision API calls to reduce burst rate limits

Notes:

- Ingestion is idempotent by content hash.
- If a file hash already exists, it is skipped.
- To force re-processing, change the file or remove the existing DB row.
- If OpenAI returns **429 (rate limit)**, the script **retries with backoff** (and honors `Retry-After` / “try again in …ms” when present). Re-running the same command is safe: already-ingested files are skipped and only missing ones are processed.

## 5) Ensure at least one active slideshow template exists

`generate-vertical-slideshow` only uses `meme_templates` rows where:

- `template_family = 'vertical_slideshow'`
- `is_active = true`

Example SQL:

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
  'Create a cohesive 3-5 slide vertical story that matches the brand voice. Slides build narrative tension then resolve; image mood should stay consistent across the set.',
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

## 6) Generate from workspace UI

In `/workspace/[workspaceId]`:

1. Send a prompt that resolves to slideshow format.
2. Generation runs and renders a vertical slideshow.
3. UI shows swipeable 9:16 slides and slideshow download options.

## 7) Output shape (for debugging)

One slideshow output = one `generated_memes` row.

- `image_url`: first slide preview URL
- `variant_metadata` includes:
  - `output_format: "vertical_slideshow"`
  - `slide_count`
  - `slides[]` with per-slide `image_url`

## Quick re-run checklist

- Migration applied
- Env vars set
- Bucket exists
- Dry run passes
- Real ingest passes
- Active `vertical_slideshow` template exists
