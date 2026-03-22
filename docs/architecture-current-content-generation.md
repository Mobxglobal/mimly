# Architecture report: current content generation (square image & square video)

**Scope:** Facts from codebase inspection as of repo state. **No redesign.** Goal: baseline for a future metadata-driven vertical slideshow pipeline.

**Primary implementation file:** `lib/actions/memes.ts` (`generateMockMemes`, `generateMoreMemes`, `regenerateTemplateIdea`).  
**Renderers:** `renderer/renderMemeTemplate.ts`, `renderer/renderMemeVideoTemplate.ts`, `renderer/caption-wrap.ts`.

---

## 1. DATABASE / SUPABASE SCHEMA

### 1.1 `meme_templates`

**Confirmed**

- The app loads templates with **admin** Supabase client: `.from("meme_templates").select("*")` in `generateMockMemes` (`lib/actions/memes.ts`).
- **No `CREATE TABLE meme_templates` migration** appears in-repo; table shape is implied by **runtime reads**, **`scripts/templates/publish-approved-to-supabase.ts`** upserts, and docs (`docs/template-onboarding-pipeline.md`, `docs/square-video-pipeline.md`).

**Columns / fields observed in code (read path + publish path)**

| Column / field | Inferred type (from usage) | Required in practice | Read / written in codebase | Purpose |
|----------------|----------------------------|--------------------|----------------------------|---------|
| `template_id` | number in publish script; coerced to string in app | **Effectively required** for stable identity | App: mapping `String(t.template_id ?? t.id ?? t.slug)`; insert `generated_memes.template_id`; storage path segment | Primary template key in generation + storage paths |
| `slug` | text | **Required** (filter + upsert conflict key in publish script) | Selection, logging, slug-specific prompt tuning, `onConflict: "slug"` | Human id, ordering pool, special cases |
| `template_name` / `name` | text | **Required** for compatible rows (`loadCompatibleTemplates` filters empty) | Prompts, `generated_memes.format`, 3-slot title fallback | Display + LLM context |
| `is_active` / `active` / `status` | boolean / string | Optional; default **active** if missing | `isActive()` in `loadCompatibleTemplates` | Template gating |
| `asset_type` | text (`image` / `video`) | Optional; defaults **`image`** | Filters `targetAssetType`; video branch for render/upload | Square image vs square video pipeline switch |
| `media_format` | text | Optional | Mapped to `CompatibleTemplate.media_format` (trimmed lowercase) | Carried in memory; **not used** in render path in TS |
| `text_layout_type` / `template_type` | text | Optional | `normalizeTemplateType(text_layout_type ?? template_type)` → `top_caption` \| `side_caption` \| `overlay` \| `sign_caption` | Prompt “template type” guidance |
| `template_logic` | text | Optional (empty string ok) | Injected into LLM “Template metadata” block | Narrative / angle instructions |
| `example_output` | text | Optional | Injected into LLM block | Few-shot style guidance |
| `meme_mechanic` | text | Optional | `getMemeMechanicGuidance` (`reject_vs_prefer`, `difficult_choice`, else none) | Extra prompt block |
| `emotion_style` | text | Optional | LLM prompt | Tone |
| `context_fit`, `business_fit`, `promotion_fit` | text | Optional | LLM prompt; `promotion_fit` drives `derivePromoMode` heuristics | Fit + promo mode |
| `slot_1_role` … `slot_3_role` | text / null | **Slot 1 required** for compatible templates | Prompts + slot layout; `hasSlot2` / `hasSlot3` detection | Slot semantics |
| `slot_*_max_chars`, `slot_*_max_lines` | int-like | Optional with defaults in mapper | LLM limits + validation + wrap (`getEffectiveSlotMaxChars`, `toInt`) | Length + line budget |
| `slot_*_x/y/width/height` (1–2 in app mapper) | int-like | Optional (renderer falls back for video slot 1 only) | PNG SVG layout; video slot 1 overlay | Text box geometry |
| `image_filename` | text (storage key) | **Required for image render** (if missing, no download → `image_url` null) | `storage.from(memeTemplatesBucket).download(imageFilename)` | Base still image |
| `source_media_path` | text | **Required for video** (`throw` if empty) | `download(sourceVideoPath)` | Base MP4 in bucket |
| `preview_image_filename` | text | Set on publish for video; **not read** in `memes.ts` generation | Publish script only in tooling | Likely for admin/UI elsewhere |
| `source_media_filename` | text | Publish / CLI tooling | Not read in `generateMockMemes` | Local file resolution in publish script |
| `canvas_width`, `canvas_height` | int | Optional; default **1080×1080** in mapper | SVG size (image); video overlay helper | Canvas dimensions |
| `font`, `font_size`, `alignment`, `text_color`, `stroke_color`, `stroke_width` | text / int | Optional with renderer defaults | Image SVG + video `drawtext` / overlay | Typography |
| `content_region_*`, `pattern_type` | numeric / text | Present on **video** DB payload in publish script | **No references** in `lib/actions/memes.ts` or renderers | Appear **unused** at runtime in app |

**Special: `template_family`**

- **Not present** in codebase (grep: no matches). Unknown whether it exists in Supabase; **not used** by the app.

**Special: 3-slot templates**

- `hasSlot3(t)` treats any non-empty `slot_3_role` or non-null slot-3 layout/max fields as “3-slot”.
- **Exception:** slug `distracted-boyfriend` is allowed through the “no slot 3” filter even if it has slot-3 metadata (`loadCompatibleTemplates`).

**JSON columns on templates**

- No `jsonb` template column is read in `memes.ts`. Template metadata is **flat columns** + optional spread `...rest` for **image** payloads in `buildDbPayload` (publish script), so extra keys from approved JSON can be upserted—**but** the generation mapper only copies the fields listed in `CompatibleTemplate` / `loadCompatibleTemplates` (plus raw row for `select("*")` is narrowed by the `.map()`). **Unknown** which extra columns exist in production DB.

### 1.2 `generated_memes`

**In-repo migrations / `supabase/schema.sql`**

- Core: `id`, `user_id`, `template_id`, `top_text`, `bottom_text`, `title`, `format`, `image_url`, `created_at`.
- Added: `variant_type`, `generation_run_id`, `batch_number`, `variant_metadata` (jsonb), `post_caption`, `idea_group_id`.

**Insert payload from `generateMockMemes` (confirmed)**

```json
{
  "user_id": "<uuid>",
  "template_id": "<string>",
  "idea_group_id": "<uuid>",
  "title": "<string>",
  "format": "<template.template_name>",
  "top_text": "<string>",
  "bottom_text": "<string|null>",
  "post_caption": "<string>",
  "image_url": "<public url|null>",
  "variant_type": "standard|promo|important_day",
  "generation_run_id": "<uuid>",
  "batch_number": 1,
  "variant_metadata": { "media_type": "image|video", "important_day_key"?: "...", "important_day_label"?: "..." }
}
```

**Schema check before generation:** selects `id, template_id, idea_group_id, variant_type, generation_run_id, batch_number, variant_metadata, post_caption` (validates these columns exist for user client).

**Note:** **`slot_3_text` is not persisted** to `generated_memes` (no column in insert); only `top_text` / `bottom_text` / `post_caption` / etc.

---

## 2. TEMPLATE DATA MODEL IN CODE

### 2.1 `CompatibleTemplate` (generation + render input in `memes.ts`)

Defined inside `generateMockMemes` (`lib/actions/memes.ts`):

```535:581:lib/actions/memes.ts
  type CompatibleTemplate = {
    template_id: string;
    template_name: string;
    slug: string;
    template_type: TemplateType;
    asset_type: "image" | "video";
    media_format: string | null;
    template_logic: string;
    meme_mechanic: string;
    emotion_style: string;
    slot_1_role: string;
    slot_2_role: string | null;
    slot_3_role: string | null;
    slot_1_max_chars: number;
    slot_2_max_chars: number;
    slot_3_max_chars: number;
    slot_1_max_lines: number;
    slot_2_max_lines: number;
    slot_3_max_lines: number;
    context_fit: string;
    business_fit: string;
    promotion_fit: string;
    example_output: string;
    isTwoSlot: boolean;

    // Rendering metadata (MVP: 1/2-slot only)
    image_filename?: string | null;
    source_media_path?: string | null;
    preview_image_filename?: string | null;
    canvas_width: number;
    canvas_height: number;
    font?: string | null;
    font_size?: number | null;
    alignment?: string | null;
    text_color?: string | null;
    stroke_color?: string | null;
    stroke_width?: number | null;

    slot_1_x?: number | null;
    slot_1_y?: number | null;
    slot_1_width?: number | null;
    slot_1_height?: number | null;
    slot_2_x?: number | null;
    slot_2_y?: number | null;
    slot_2_width?: number | null;
    slot_2_height?: number | null;
  };
```

Comment says “1/2-slot only” but **`slot_3_role` / slot-3 max fields** exist for **prompting/validation**. **Slot 3 layout fields are not mapped** from DB rows into `CompatibleTemplate` (renderer type supports them, but mapper does not populate them).

### 2.2 `MemeTemplateForRender` (square image renderer)

`renderer/renderMemeTemplate.ts` — includes **slot_1–3** geometry and max chars/lines.

### 2.3 `MemeVideoTemplateForRender` (square video renderer)

`renderer/renderMemeVideoTemplate.ts` — **slot_1 only** (+ canvas, font styles). No slot 2/3.

### 2.4 Zod / shared validators

- **No Zod schemas** found for templates in the app path; validation is **imperative** inside `generateMockMemes`.

### 2.5 DB vs in-memory mismatches (confirmed)

| Topic | Mismatch |
|--------|----------|
| `template_id` | DB may store numeric `template_id`; app uses **string** everywhere. |
| `text_layout_type` vs `template_type` | Publish uses `text_layout_type` for video; mapper prefers `text_layout_type ?? template_type`. |
| 3-slot layout | Renderer can draw slot 3 **if** `slot_3_x`… exist on the object passed to `renderMemePNGFromTemplate`; **`CompatibleTemplate` omits them**, so they are **not** passed from `loadCompatibleTemplates` (unless TypeScript structural typing receives extra fields—**it does not**, object literal is explicit). **Likely broken or incomplete for true 3-box render.** |
| Video | LLM may produce `bottom_text` for 2-slot video templates; **video renderer only burns in `topText`**. |

---

## 3. GENERATION PAYLOAD FORMAT (square image path)

### 3.1 End-to-end trace

1. **Entry:** `generateMockMemes(promotion?, options?)` — default `outputFormat: "square_image"` → `targetAssetType: "image"`.
2. **Templates:** Admin fetch `meme_templates` `*`, then `loadCompatibleTemplates`:
   - Active filter (`is_active` / `active` / `status`).
   - `asset_type === "image"`.
   - Exclude templates with slot-3 signals **except** slug `distracted-boyfriend`.
   - Map row → `CompatibleTemplate` (see §2).
3. **Pool:** `ORDERED_TEMPLATE_SLUG_POOL` constant (image-centric slug list) → `buildOrderedTemplatePool` (exclusions, forced single template for regen).
4. **Batch:** First `batchSize` templates (default **3**); variant assignment (promo + important day) **without changing** the core generation contract.
5. **LLM:** `generateForTemplate` builds a **single string prompt** (not a separate JSON request body for “template payload”). OpenAI request: `gpt-4o-mini`, `temperature: 0.6`, `response_format: { type: "json_object" }`.

### 3.2 Expected model output (structured)

**1-slot (`!isTwoSlot && !isThreeSlot`):**

```json
{
  "title": "string",
  "top_text": "string",
  "bottom_text": null,
  "post_caption": "string"
}
```

**2-slot (`isTwoSlot`):**

```json
{
  "title": "string",
  "top_text": "string",
  "bottom_text": "string",
  "post_caption": "string"
}
```

**3-slot (`isThreeSlot` = truthy `template.slot_3_role`):**

```json
{
  "slot_1_text": "string",
  "slot_2_text": "string",
  "slot_3_text": "string"
}
```

- **Title:** not from model — `titleValidation` uses **`template.template_name` truncated** to `TITLE_MAX_CHARS` (45).
- **`post_caption`:** not requested from model for 3-slot path; **`buildFallbackPostCaption`** used.

**`top_caption` vs other `template_type` values:** same JSON shapes; differences are **prompt text** (`getTemplateTypeWritingGuidance`, `getSlotWritingGuidance`), not schema.

### 3.3 Validation (high level)

- JSON parse with recovery (`safeJsonParse`).
- `validateTitle` (non–3-slot only).
- `validatePostCaption` (non–3-slot; max `POST_CAPTION_MAX_CHARS` 220).
- `validateSlotTextSingleLine` per slot: single line, max chars, fragment heuristics (`looksLikeCutOffFragment`), **woman-yelling-cat** slot_1 extra rule (`looksIncompleteWomanYellingCaption`), optional **short-label mode** for ultra-tight `side_caption`.
- 1-slot: `bottom_text` must be **null/undefined** (normalized empty not enough — explicit `one_slot_bottom_text_not_null` if raw bottom present).

### 3.4 Retries / fallbacks

- **Per template:** up to **3** attempts; each failure sets `previousFailureRule` → `getRetryCorrectiveGuidance` appended to next prompt.
- **Pool:** On repeated failure after retries, logs “Fallback replacement” and continues to **next** template in ordered pool until `insertedCount === batchSize` or pool exhausted.
- **Post caption:** If invalid/missing, **`buildFallbackPostCaption`** fills `post_caption`.
- **Ideal char targets:** `getIdealSlotTargets` adjusts soft targets by **slug** (`drake`, `two-buttons`, `woman-yelling-cat`) and attempt number.

---

## 4. VIDEO PIPELINE PAYLOAD FORMAT (square video)

### 4.1 Selection

- Same `generateMockMemes`; `outputFormat === "square_video"` → `targetAssetType === "video"`.
- Same template pool ordering; **only templates with `asset_type` video** remain. If none → error `"No active square video templates found."`.

### 4.2 Template fields required for video generation/render

| Field | Role |
|--------|------|
| `source_media_path` | **Required** — download base MP4 from `memeTemplatesBucket`. |
| Slot 1 layout / font fields | Optional; video renderer has **hardcoded defaults** for x/y/width/height/font if null (`renderMemeVideoTemplate.ts`). |
| `canvas_width/height` | Optional; defaults 1080×1080 in `toMemeTemplateForRender` fallback path. |

### 4.3 How video templates differ from image (schema/code)

- **Asset:** MP4 from `source_media_path` vs PNG from `image_filename`.
- **Render:** `renderMemeMP4FromTemplate({ baseVideoBuffer, template, topText })` — **only `topText`**.
- **Publish script** writes extra video columns (`content_region_*`, `pattern_type`, …) — **not consumed** by app render/generation code.

### 4.4 Render payload into video renderer

- `template`: subset `MemeVideoTemplateForRender` (slot_1 box, typography, canvas).
- `topText`: **`generated.top_text`** after validation (same LLM output as image path).

### 4.5 Files involved (square video)

- `lib/actions/memes.ts` — branch `template.asset_type === "video"`.
- `renderer/renderMemeVideoTemplate.ts` — ffmpeg `drawtext` or PNG overlay fallback via `renderTopCaptionOverlayPng` in `renderMemeTemplate.ts`.
- `renderer/caption-wrap.ts` — shared wrapping.

### 4.6 Hardcoded vs metadata-driven (video)

- **Metadata-driven:** slot 1 position/size, font size, alignment, colors, stroke, max chars/lines (with defaults).
- **Hardcoded:** ffmpeg codec flags (`libx264`, `yuv420p`, `+faststart`), default slot box when DB nulls, line height `fontSize * 1.2`, multiline → left alignment rule, `drawtext` unavailable → overlay path → remux without caption.

---

## 5. RENDERER METADATA USAGE

### 5.1 Square image (`renderMemePNGFromTemplate` / `buildSVG`)

**Consumed from template:**

- `canvas_width`, `canvas_height`
- `font_size` (default 48), `alignment` (default `center`), `text_color`, `stroke_color`, `stroke_width`, `font` (default Arial)
- Per-slot: `slot_N_x/y/width/height`, `slot_N_max_chars` (default 20), `slot_N_max_lines` (default 2)
- Only slots with **non-empty text** and **all** of x/y/width/height **non-null** are rendered.

**Wrapping:** `wrapCaptionWithSoftEarlySplit` from `caption-wrap.ts`.

**Hardcoded / behavioral:**

- Padding: **20px** from slot edges for left/right/center x (`getXPosition`).
- Vertical centering within slot box; line height `fontSize * 1.2`.
- **Multiline:** alignment forced to **`left`** for `lines.length > 1` (per-slot in `buildSVG`).
- SVG `text-anchor` derived from alignment.

### 5.2 Square video (`renderMemeMP4FromTemplate`)

**Consumed:** slot 1 geometry defaults (80, 65, 920, 170), `slot_1_max_chars` (56 default), `slot_1_max_lines` (2), `font_size` (46 default), `alignment`, colors, stroke.

**Ignored:** slot 2/3 entirely; `canvas_*` only used when converting to overlay PNG helper.

---

## 6. UI FLOW

### 6.1 Creation

- **`app/(app)/dashboard/create/page.tsx`**: user picks format (`square_image` | `square_video`; `vertical_short` shown as **disabled**), optional promotion, navigates to `/dashboard/generating?format=...&promotion=...`.

### 6.2 Generating state

- **`app/(app)/dashboard/generating/page.tsx`**: client `useEffect` calls **server action** `generateMockMemes(promotion, { outputFormat: format })`, deduped by `generationKey`. On success, `router.replace("/dashboard/memes")`.
- **Note:** `format` type includes `vertical_short`. At runtime, `generateMockMemes` treats only `square_video` as video; **any other value behaves like square image** (`targetAssetType` branch). Create UI does not enable vertical; manual URL could still hit this path.

### 6.3 Result / preview

- **`app/(app)/dashboard/memes/page.tsx`**: loads `generated_memes` `select("*")` for user; infers `defaultContinuationFormat` from `variant_metadata` (`output_format`, `requested_output_format`, or `media_type`) or URL extension on `image_url`.
- **`components/dashboard/meme-results-section.tsx`**: layout + “Generate more” split (default / images / videos).
- **`components/dashboard/meme-results-grid.tsx`**: grouped display; `<video>` if `isVideoMemeVariant` (metadata `media_type` or URL extension).

### 6.4 Request payload from UI to backend

- **No REST body.** Generation is **Next.js server actions** with **positional + options object**:
  - Initial: `generateMockMemes(promotion?: string, { outputFormat })`
  - More: `generateMoreMemes(outputFormat?)`
  - Regenerate: `regenerateTemplateIdea(templateId, outputFormat?)` → internally `forcedTemplateId`, `forceStandardVariant: true`, `limit: 1`.

### 6.5 Square image vs square video decision

- **Primary:** `options.outputFormat` in `generateMockMemes` (`square_video` → video templates).
- **UI continuation:** memes page + grid pass `square_image` / `square_video` into `generateMoreMemes` / `regenerateTemplateIdea` based on inferred media type.

---

## 7. STORAGE / OUTPUT MODEL

### 7.1 Database

- **`generated_memes`:** one row per generated variant (standard/promo/important_day); links **`user_id`**, **`template_id`**, **`idea_group_id`** (per-idea UUID created per generation attempt in the loop).

### 7.2 Storage buckets

- **Template assets:** `MEME_TEMPLATES_BUCKET` (default `meme-templates`) — `image_filename` or `source_media_path` keys.
- **Outputs:** `MEME_GENERATED_MEMES_BUCKET` (default `generated-memes`).

### 7.3 Object paths for outputs

- Image: `generated_memes/{user.id}/{template.template_id}/{uuid}.png`
- Video: `generated_memes/{user.id}/{template.template_id}/{uuid}.mp4`

### 7.4 Public URL

- `getPublicUrl` → stored in **`generated_memes.image_url`** (used for both PNG and MP4).

### 7.5 Linkage

- **User:** `user_id` on row.
- **Template:** `template_id` string + `format` field set to **`template.template_name`** (not slug).

---

## 8. EXTENSION READINESS FOR VERTICAL SLIDESHOWS (facts only)

### 8.1 Likely reusable

- **Server action pattern** (`generateMockMemes`-style orchestration): profile load, admin template fetch, OpenAI JSON generation, retries, Supabase insert + storage upload.
- **Variant system:** `variant_type`, `variant_metadata`, promo / important-day assignment machinery.
- **Caption validation helpers** (single-line, max chars, fragment heuristics) if slideshow still needs short text.
- **Text wrapping helper** (`caption-wrap.ts`) for any fixed-width text overlay.

### 8.2 Tightly coupled to square 1080×1080 assumptions

- **`ORDERED_TEMPLATE_SLUG_POOL`:** static list, not format-aware.
- **Default canvas** 1080×1080 in template mapper and video overlay helper.
- **UI:** `aspect-square` preview cards; download SVG fallback in grid is **1080×1080**.
- **Storage path** does not encode format/aspect (only user + template + uuid).
- **Single-asset render:** one PNG or one MP4 per row — **no multi-slide structure** in DB or renderer.

### 8.3 Where metadata-driven extension is already partially modeled

- **Per-template** slot rectangles, fonts, colors, max chars/lines feed image renderer.
- **Template typing** (`template_type`) already branches prompt behavior.

### 8.4 Where schema/code changes will **definitely** be needed (for vertical slideshow)

- **New aspect ratio** (1080×1920) not represented in defaults or UI preview layout.
- **Slideshow semantics:** multiple frames or timed steps — **no** corresponding fields in `CompatibleTemplate`, renderers, or `generated_memes` row shape today.
- **`outputFormat` union** only `square_image` | `square_video` in server action options.
- **`variant_metadata`** today only stores `media_type` (+ optional important day keys); memes page also *reads* `output_format` / `requested_output_format` for inference but **generation does not write** those keys (confirmed in `variantMetadata` construction in `memes.ts`).

---

## Summary of current system shape (plain English)

Templates live in **`meme_templates`** and are loaded wholesale each run. The app filters them by **active flags**, **asset type** (image vs video), and a **hardcoded slug ordering list**, then picks a small batch. For each template it asks **OpenAI** for **strict JSON** (either classic `title` / `top_text` / `bottom_text` / `post_caption`, or a **three-slot** shape for templates with a `slot_3_role`), validates aggressively with retries, and then either **composites text onto a base PNG** (`sharp` + SVG) or **burns slot-1-only text into a base MP4** (`ffmpeg`, with overlay fallback). The result is uploaded to **Supabase storage** and a row is written to **`generated_memes`** with text fields, a **single** media URL in `image_url`, and **variant metadata** that mainly records **`media_type`** (and important-day keys for that variant). The dashboard **create → generating → memes** flow drives format via **query params and server-action options**, and the memes grid **infers video vs image** from metadata or file extension. Anything beyond **one square frame or one square video file per generation**—including **vertical 9:16** and **multi-slide timelines**—is **outside** the current persisted model and render contracts.
