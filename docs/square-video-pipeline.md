# Square Video Meme Pipeline (1080x1080 MP4)

## Purpose
This document defines the **current end-to-end square video meme generation pipeline** for this project.

It is the video counterpart to the square image PNG pipeline and documents how the system works **today** (not future design ideas).

Current v1 scope:
- square video output only
- 1080x1080 MP4 templates
- `top_caption` layout only
- static caption only
- no timed subtitles
- mixed image + video results supported in the dashboard UI

---

## High-Level Pipeline Overview
The current square video flow runs through the same product surfaces as image generation, but branches at render time by `asset_type`.

1. MP4 template is stored in Supabase storage (typically under `square-video/<slug>.mp4`).
2. Template metadata is stored in `meme_templates`.
3. Generator loads active templates and filters by requested output format.
4. LLM generation creates draft meme content (`title`, `top_text`, etc).
5. Backend render/upload stage runs video render path.
6. FFmpeg loads base MP4 and applies static top-caption overlay.
7. Final MP4 is uploaded to generated memes storage.
8. `generated_memes.image_url` is set to the final MP4 public URL.
9. Dashboard results grid detects video and renders `<video>`.

Flow diagram:

```text
Template MP4 -> meme_templates metadata -> generation -> video renderer -> ffmpeg output MP4 -> storage upload -> generated_memes row -> dashboard video playback
```

Related runtime files:
- `app/(app)/dashboard/create/page.tsx`
- `app/(app)/dashboard/generating/page.tsx`
- `lib/actions/memes.ts`
- `renderer/renderMemeVideoTemplate.ts`
- `components/dashboard/meme-results-grid.tsx`

---

## Current System Scope and Constraints

### Supported (current)
- `asset_type = "video"`
- `media_format = "mp4"`
- `source_media_path` points to base MP4 template asset
- `preview_image_filename` stored for compatibility/poster workflows
- `image_filename` also populated with preview image key for compatibility
- `top_caption` templates
- static text overlay on video output
- video rendering in dashboard result cards
- mixed image/video result sets in one grid

### Not supported (current)
- timed subtitle overlays
- multiple timed text regions
- bottom-caption or complex multi-slot video-specific composition (unless represented by existing shared slot metadata, which generation currently does not use for video)
- animated text effects
- transitions
- motion-aware caption placement
- custom per-frame rendering logic

---

## Database and Template Schema Requirements
Video templates are stored in `meme_templates` and currently reuse the same layout metadata model used by image templates for top-caption placement.

Required/expected fields for square video templates:

- `asset_type`: must be `"video"` (used for filtering and render branching)
- `media_format`: currently `"mp4"`
- `source_media_path`: storage key to the base MP4 template
- `source_media_filename`: original/source filename reference
- `preview_image_filename`: preview/poster image key
- `image_filename`: also set to preview image key for compatibility with existing flows
- `is_active`: template must be active to be selected
- `text_layout_type`: layout type (`top_caption` expected for v1)
- `pattern_type`: semantic/template categorization
- `meme_mechanic`: semantic generation signal
- `slot_1_x`, `slot_1_y`, `slot_1_width`, `slot_1_height`: caption box geometry
- `slot_1_max_chars`: max chars for slot-1 generation/render wrapping
- `slot_1_max_lines`: max lines for slot-1
- `font`, `font_size`, `alignment`, `text_color`, `stroke_color`, `stroke_width`: text style
- `canvas_width`, `canvas_height`: expected 1080x1080 for current flow
- `content_region_x`, `content_region_y`, `content_region_width`, `content_region_height`: semantic/content region metadata

Notes:
- Generator currently reads both `text_layout_type` and `template_type` compatibility paths.
- Video and image templates intentionally share slot/font/canvas schema so generation + renderer logic can be reused.

---

## Template Onboarding Process (Square Video)
Use this process to onboard a new square video template.

1. Source/create a base 1080x1080 MP4 template.
2. Export a preview JPG (poster-like) for the template.
3. Prepare approved template JSON under `templates/approved/` with video fields.
4. Run publish script with video args:

```bash
pnpm tsx scripts/templates/publish-approved-to-supabase.ts \
  --approved="./templates/approved" \
  --videos="/path/to/square-video-standard" \
  --previews="./templates/previews" \
  --bucket="meme-templates" \
  --storage-prefix="square" \
  --video-storage-prefix="square-video" \
  --dry-run=false
```

5. Ensure DB payload sets:
   - `asset_type: "video"`
   - `media_format: "mp4"`
   - slot 1 geometry + typography fields
6. Confirm uploaded storage keys:
   - video key pattern: `square-video/<slug>.mp4`
   - preview key pattern: `square-video/<slug>-preview.<ext>`
7. Activate template (`is_active = true`) when ready.
8. Generate via create flow with Square Video selected.
9. Validate final MP4 playback in `/dashboard/memes`.

Current naming/path conventions in repo:
- video storage prefix default: `square-video`
- image storage prefix default: `square`
- approved docs/examples: `templates/approved/*.json`
- previews folder used by publish script: `templates/previews`

### Video Pipeline Scripts in Order (Operator Runbook)
Use this sequence for end-to-end square video template onboarding.

#### Step 1 — Create video drafts from local MP4s
Ingests raw MP4 templates, extracts technical metadata, creates draft JSON, and creates poster previews.

Script:
- `scripts/templates/create-video-drafts-from-preset.ts`

Command:
```bash
pnpm tsx scripts/templates/create-video-drafts-from-preset.ts \
  --input="/Users/alexattinger/Desktop/New_templates/square-video-standard" \
  --preset="square-video-standard" \
  --drafts="./templates/drafts" \
  --previews="./templates/previews"
```

#### Step 2 — Render review previews for video drafts
Builds rendered QA previews from draft JSON + poster frame so caption placement can be validated.

Script:
- `scripts/templates/render-video-draft-previews.ts`

Command:
```bash
pnpm tsx scripts/templates/render-video-draft-previews.ts \
  --drafts="./templates/drafts" \
  --previews="./templates/previews" \
  --sample-text="When the launch is falling apart but you stay calm"
```

#### Step 3 — Enrich video drafts with semantic metadata
Extracts multiple frames from each MP4 and fills semantic fields using the model.

Script:
- `scripts/templates/enrich-video-drafts-with-llm.ts`

Dry run:
```bash
pnpm tsx scripts/templates/enrich-video-drafts-with-llm.ts \
  --drafts="./templates/drafts" \
  --model="gpt-4.1-mini" \
  --frames-dir="./templates/previews/video-frames" \
  --dry-run=true
```

Real run:
```bash
pnpm tsx scripts/templates/enrich-video-drafts-with-llm.ts \
  --drafts="./templates/drafts" \
  --model="gpt-4.1-mini" \
  --frames-dir="./templates/previews/video-frames" \
  --dry-run=false
```

#### Step 4 — Move approved JSON into approved folder
No dedicated script currently; this is a manual move after review.

All drafts:
```bash
mv ./templates/drafts/*.json ./templates/approved/
```

Single file:
```bash
mv ./templates/drafts/oscar-reaction.json ./templates/approved/
```

#### Step 5 — Publish approved video templates to Supabase
Uploads MP4 + preview image and upserts template rows in `meme_templates`.

Script:
- `scripts/templates/publish-approved-to-supabase.ts`

Dry run:
```bash
pnpm tsx scripts/templates/publish-approved-to-supabase.ts \
  --approved="./templates/approved" \
  --videos="/Users/alexattinger/Desktop/New_templates/square-video-standard" \
  --previews="./templates/previews" \
  --bucket="meme-templates" \
  --storage-prefix="square" \
  --video-storage-prefix="square-video" \
  --dry-run=true
```

Real run:
```bash
pnpm tsx scripts/templates/publish-approved-to-supabase.ts \
  --approved="./templates/approved" \
  --videos="/Users/alexattinger/Desktop/New_templates/square-video-standard" \
  --previews="./templates/previews" \
  --bucket="meme-templates" \
  --storage-prefix="square" \
  --video-storage-prefix="square-video" \
  --dry-run=false
```

#### Full pipeline summary
Exact order:
1. `scripts/templates/create-video-drafts-from-preset.ts`
2. `scripts/templates/render-video-draft-previews.ts`
3. `scripts/templates/enrich-video-drafts-with-llm.ts`
4. manual move to `templates/approved/`
5. `scripts/templates/publish-approved-to-supabase.ts`

Supporting folders:
- raw input MP4s: `/Users/alexattinger/Desktop/New_templates/square-video-standard`
- drafts: `./templates/drafts`
- previews: `./templates/previews`
- extracted semantic frames: `./templates/previews/video-frames`
- approved: `./templates/approved`

Important note:
- Step 5 uses the same publish script as image templates, with video-specific flags:
  - `--videos`
  - `--previews`
  - `--video-storage-prefix`
- There is no separate `publish-video-approved-to-supabase.ts` in the current process.

Optional cleanup between batches:
```bash
pnpm tsx scripts/templates/clean-local-template-artifacts.ts --all=true --dry-run=true
pnpm tsx scripts/templates/clean-local-template-artifacts.ts --all=true --dry-run=false
```

---

## Backend Generation Flow
Primary implementation: `lib/actions/memes.ts`.

### Where `outputFormat` enters
- `generateMockMemes(promotionContext?, options?)` accepts:
  - `outputFormat?: "square_image" | "square_video"`
- `outputFormat` defaults to `"square_image"`.
- `targetAssetType` is derived:
  - `"square_video"` -> `"video"`
  - otherwise -> `"image"`

### Template filtering for video
- Templates are loaded from `meme_templates`.
- `loadCompatibleTemplates(...)` filters active templates by:
  - `asset_type === targetAssetType`
  - additional slot/type guards already used by image flow
- For square video requests, only `asset_type = "video"` templates remain.

### Reuse of existing generation logic
- Same generation loop and variant assignment logic are reused.
- Same LLM content generation pipeline is reused for `top_text`/caption drafting.
- Same insertion target table is reused: `generated_memes`.

### Render/upload branch and DB write
- In the render stage:
  - `template.asset_type === "video"` triggers `renderMemeMP4FromTemplate(...)`.
  - base MP4 downloaded from `source_media_path` in templates bucket.
  - final MP4 uploaded to generated bucket as `generated_memes/<user>/<template>/<uuid>.mp4`.
  - public URL stored in `image_url` column.
- Row inserted into `generated_memes` with shared fields plus `variant_metadata` (includes media type marker in current implementation).

Related backend files:
- `lib/actions/memes.ts` (generation + selection + render/upload + insert)
- `renderer/renderMemeVideoTemplate.ts` (video rendering)
- `renderer/renderMemeTemplate.ts` (overlay PNG helper used by video fallback)

---

## Video Renderer Implementation
Primary renderer: `renderer/renderMemeVideoTemplate.ts`

### Entry point
`renderMemeMP4FromTemplate(params)` where params include:
- `baseVideoBuffer: Buffer`
- `template: MemeVideoTemplateForRender`
- `topText: string`

### Template metadata consumed
- `canvas_width`, `canvas_height`
- slot-1 geometry: `slot_1_x`, `slot_1_y`, `slot_1_width`, `slot_1_height`
- slot-1 limits: `slot_1_max_chars`, `slot_1_max_lines`
- style: `font`, `font_size`, `alignment`, `text_color`, `stroke_color`, `stroke_width`

### Text preparation
- Normalizes whitespace/newlines.
- Wraps by `slot_1_max_chars` and line limit.
- Computes centered Y placement inside slot box.
- Escapes drawtext-sensitive characters (`\`, `:`, `'`, `%`, newline).

### FFmpeg invocation path
Primary path (when drawtext available):
- Writes temp input file in OS temp dir (`fs.mkdtempSync(path.join(os.tmpdir(), "meme-video-"))`)
- Executes ffmpeg with `-vf drawtext=...`
- Re-encodes H.264 (`libx264`, `-preset veryfast`, `-crf 18`)
- copies audio (`-c:a copy`)
- sets `+faststart`

### Fallback path when drawtext is unavailable
If ffmpeg reports missing drawtext filter:
1. Calls `renderTopCaptionOverlayPng(...)` from `renderer/renderMemeTemplate.ts`
2. Generates full-canvas transparent PNG with caption text
3. Runs ffmpeg overlay filter:
   - `-filter_complex "[0:v][1:v]overlay=0:0:format=auto"`
4. Re-encodes video (`libx264`) and copies audio

If overlay path also fails:
- Falls back to raw video passthrough/remux (`-c:v copy -c:a copy`) so output is still playable.

### Temp/intermediate files
- Temp directory under OS tmp
- `input.mp4`
- `overlay.png` (fallback overlay path)
- `output.mp4`
- Temp directory cleaned with recursive remove in `finally`.

### Post-render upload
Handled in `lib/actions/memes.ts`:
- Upload buffer to generated bucket with `contentType: "video/mp4"`
- Retrieve public URL with `getPublicUrl(...)`
- Store URL in `generated_memes.image_url`

---

## Required Scripts, Commands, and Dependencies

### Current Required Runtime Dependencies
- `ffmpeg` must be installed and available in PATH (server-side execution dependency for video render).
- Node dependencies used directly by pipeline:
  - `sharp` (overlay PNG generation path)
  - `@supabase/supabase-js` (storage + DB access)
  - Next.js server action runtime (`lib/actions/memes.ts`)
- OpenAI API runtime dependency for content generation in `generateMockMemes`.

Environment variables used by current generation path:
- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- optional bucket overrides:
  - `MEME_TEMPLATES_BUCKET` (default: `meme-templates`)
  - `MEME_GENERATED_MEMES_BUCKET` (default: `generated-memes`)

### Current Useful Dev/Test Entry Points
- Run app locally:
```bash
npm run dev
```
- Trigger generation through UI:
  - `/dashboard/create` -> select Square Video -> generate
- Publish video templates (same publish path used for image templates, with video args):
```bash
pnpm tsx scripts/templates/publish-approved-to-supabase.ts \
  --approved="./templates/approved" \
  --videos="/path/to/square-video-standard" \
  --previews="./templates/previews" \
  --bucket="meme-templates" \
  --storage-prefix="square" \
  --video-storage-prefix="square-video" \
  --dry-run=true
```

No dedicated standalone CLI exists for running only video render; current execution path is through `generateMockMemes` in app flow.

---

## Frontend / UI Behavior

### Format selection
- `app/(app)/dashboard/create/page.tsx`
  - defines format options including `square_video`
  - writes `format` query param when routing to generating page

### Generating page format handling
- `app/(app)/dashboard/generating/page.tsx`
  - reads `format` from query params
  - maps to union including `"square_video"`
  - calls:
    - `generateMockMemes(promotion, { outputFormat: format })`

### Results rendering (image vs video)
- `components/dashboard/meme-results-grid.tsx`
  - checks variant metadata/media URL to detect video:
    - `variant_metadata.media_type`
    - URL extension heuristics (`.mp4`, `.webm`, `.m4v`)
  - renders `<video>` for video assets and `<img>` for image assets
  - supports mixed media cards in one grid

### Poster behavior
- Current results grid uses direct `video src` playback and does not set a poster image in the card.
- `preview_image_filename` is maintained mainly for template/publish compatibility and related workflows, not active poster rendering in this card component.

---

## Storage and Output Contract
- Final rendered video is stored as MP4 in generated memes bucket.
- Public URL for that MP4 is stored in `generated_memes.image_url`.
- `image_url` remains the output field for both image and video results to preserve a unified contract with existing table/UI flows.
- Frontend media choice is inferred from `variant_metadata.media_type` (preferred) and URL extension heuristics (fallback).
- Video template previews are uploaded/kept via `preview_image_filename` and compatibility `image_filename` at template level.

---

## Failure Points and Debugging Checklist

### Common failure points
- FFmpeg missing or incompatible build (especially missing `drawtext` filter).
- `source_media_path` missing/invalid in `meme_templates`.
- Invalid slot coordinates (`slot_1_*`) causing off-screen/poor text placement.
- Font/stroke/color settings resulting in unreadable captions over motion.
- Wrong `asset_type` leading to template filtering exclusion.
- Output generated but UI does not detect video (bad extension/metadata).
- Preview image mismatches or missing preview file during template publish.
- Supabase storage upload failures (template or generated asset).
- DB payload/schema mismatch in template publishing.

### Debug checklist
1. Confirm template row in `meme_templates` has:
   - `asset_type = video`
   - `media_format = mp4`
   - valid `source_media_path`
   - active status
2. Confirm source MP4 exists at expected storage key.
3. Confirm generating request uses `format=square_video`.
4. Confirm logs show `targetAssetType: "video"` and selected template `asset_type: "video"`.
5. Inspect ffmpeg stderr in server logs for drawtext/overlay failures.
6. Confirm generated upload key ends in `.mp4`.
7. Confirm `generated_memes.image_url` is non-null and points to uploaded MP4.
8. Confirm `components/dashboard/meme-results-grid.tsx` video detection path matches returned URL/metadata.

---

## Relationship to Square Image Pipeline
Shared components:
- Same create/generating flow and server action entry (`generateMockMemes`).
- Same template table (`meme_templates`) and generated table (`generated_memes`).
- Same semantic generation logic and variant framework.
- Same core slot-based metadata model (canvas, slot bounds, font settings).

Key differences:
- Image path renders PNG via `renderer/renderMemeTemplate.ts`.
- Video path renders MP4 via `renderer/renderMemeVideoTemplate.ts` and ffmpeg.
- Video templates rely on `source_media_path` + `media_format`.
- UI renders `<video>` for video outputs and `<img>` for image outputs.

Compatibility requirement:
- Video-specific work must preserve existing image pipeline behavior and DB contracts.

---

## Current Limitations and Recommended Next Refinements
Current refinements worth prioritizing:
- tighten caption positioning parity between drawtext path and overlay PNG path
- tune template-level Y offset defaults for better visual consistency
- improve readability over high-motion areas (contrast/stroke presets)
- improve wrapping parity against image renderer edge cases
- consider making overlay-image text path the default if drawtext variability remains high

These are improvement opportunities, not guaranteed behavior in the current implementation.

---

## Acceptance Criteria
Square video pipeline is considered working when all checks pass:

- Square Video can be selected in `/dashboard/create`.
- Generating flow passes `outputFormat = "square_video"`.
- Only compatible video templates are selected for the run.
- Render output is an MP4 artifact.
- Caption appears in the expected top-caption zone.
- Generated MP4 uploads successfully to storage.
- `generated_memes` row is inserted with correct fields (`image_url`, variants, metadata).
- `/dashboard/memes` renders playable video cards.
- Mixed image + video grid rendering still behaves correctly.

