# Generate More Media UX Recommendation

## 1) Current Behavior

### What “Generate more” does today
- `/dashboard/memes` loads all user rows from `generated_memes` and renders `MemeResultsSection` (`app/(app)/dashboard/memes/page.tsx`).
- The top-level **Generate more** button in `MemeResultsSection` submits a server action passed as `onGenerateMore`.
- That action calls `generateMoreMemes()` in `lib/actions/memes.ts`.
- `generateMoreMemes()` calls:
  - `generateMockMemes(undefined, { limit: 3, excludeExistingUserTemplates: true })`
  - with **no `outputFormat`**, so `generateMockMemes` defaults to `"square_image"`.

### Where it defaults to image/PNG
- In `generateMockMemes`, `outputFormat` defaults to `"square_image"`, then:
  - `targetAssetType = outputFormat === "square_video" ? "video" : "image"`
- Because `generateMoreMemes()` omits `outputFormat`, top-level continuation currently filters to image templates (`asset_type = "image"`).

### What is preserved vs lost from original request
- Initial generation preserves format only during `/dashboard/generating` request:
  - `format` query param is read in `app/(app)/dashboard/generating/page.tsx`
  - `generateMockMemes(..., { outputFormat: format })` is called
- After redirect to `/dashboard/memes`, there is no format param/state persisted for continuation.
- `generated_memes` rows currently include media hints (`variant_metadata.media_type` + URL extension behavior), but there is no explicit “batch format preference” state used by top-level continuation.

### Additional observed behavior relevant to UX
- Per-card “More ideas” in `components/dashboard/meme-results-grid.tsx` calls `regenerateTemplateIdea(templateId)`.
- `regenerateTemplateIdea` also omits `outputFormat`, so it defaults to image filtering too.
- For video template IDs, this can miss the target in filtered templates and return “Template not found for regeneration.”

---

## 2) UX Options Considered

## Option A — Continue same format automatically (silent default)
Use last batch media type as continuation source-of-truth and keep one button.

Pros:
- Lowest UI complexity; preserves current button simplicity.
- Matches user expectation for “more of this.”
- Minimal disruption to existing layout.

Cons:
- No explicit override in the same click path.
- Ambiguous for mixed result screens unless rule is defined.

## Option B — Primary button + dropdown override (recommended)
Primary click continues default format; adjacent caret/dropdown allows “More images” / “More videos” (future: mixed).

Pros:
- Cleanest product balance: one-click default + explicit control.
- Works for image-only, video-only, and mixed futures.
- Avoids modal friction.
- Keeps MVP low risk while exposing intent clearly.

Cons:
- Slight UI complexity increase.
- Requires passing format into actions.

## Option C — Segmented control above button
User selects Images/Video then clicks Generate more.

Pros:
- Explicit state, easy to reason about.

Cons:
- Persistent control adds visual noise.
- Worse for quick “do the same thing again.”

## Option D — Modal chooser after click
Clicking Generate more opens modal: images/videos/mixed.

Pros:
- Very explicit.

Cons:
- Extra click every time; too heavy for frequent continuation.
- Overkill for current architecture.

## Option E — Two separate buttons (“More images”, “More videos”)

Pros:
- Very explicit.

Cons:
- Clutters action area.
- Duplicative for users who usually want one default continuation.

---

## 3) Recommended Approach

Use **Option B: primary button + lightweight dropdown override**, with **same-format continuation as default**.

Why this is cleanest now:
- Product clarity: default behavior is predictable (“more like this”).
- UX efficiency: one click for common path.
- Architecture fit: current flow already supports `outputFormat`; continuation just fails to pass it.
- Future-ready: mixed mode can be added as a dropdown item later without redesign.

---

## 4) Recommended Product Behavior

### MVP behavior (build now)
- Top-level **Generate more** button:
  - defaults to user’s most recent inferred media type preference.
  - if latest batch is image -> generate more images.
  - if latest batch is video -> generate more videos.
- Add dropdown menu on the same control with explicit overrides:
  - “Generate more images”
  - “Generate more videos”
- Keep button label simple: `Generate more` (optional subtitle/tooltip: `Default: Images`/`Default: Videos`).

### Per-card behavior
- Per-card “More ideas” should use that template’s own media type (inferred from row metadata/url) and pass matching format for regeneration.

### Future mixed behavior (defer)
- Do not expose “mixed” until backend contract exists (e.g., balanced candidate selection across `asset_type` values and clear count strategy).

---

## 5) Technical Implementation Plan (Minimal Disruption)

## Source of truth for continuation format
Near-term pragmatic source:
- infer from latest generated rows on `/dashboard/memes`:
  - preferred: `variant_metadata.media_type`
  - fallback: URL extension in `image_url` (`.mp4` => video else image)
- define small server-side helper in `app/(app)/dashboard/memes/page.tsx` to compute default continuation format.

Later cleaner source (optional):
- persist explicit user continuation preference in profile/session.

## Required changes by file

### `lib/actions/memes.ts`
1. Update `generateMoreMemes` signature:
   - from `generateMoreMemes(): Promise<{ error: string | null }>`
   - to `generateMoreMemes(outputFormat?: "square_image" | "square_video"): Promise<{ error: string | null }>`
2. Pass through to `generateMockMemes`:
   - `{ limit: 3, excludeExistingUserTemplates: true, outputFormat }`
3. Update `regenerateTemplateIdea(templateId, outputFormat?)` similarly, passing `outputFormat`.

### `app/(app)/dashboard/memes/page.tsx`
1. Infer default continuation format from fetched `memes` list.
2. Expose server actions for:
   - default continuation
   - explicit image continuation
   - explicit video continuation
3. Pass these handlers + default format to `MemeResultsSection`.

### `components/dashboard/meme-results-section.tsx`
1. Replace single submit button with:
   - primary button (uses default handler)
   - small dropdown/caret menu for explicit image/video handlers
2. Keep pending UI skeleton behavior intact.

### `components/dashboard/meme-results-grid.tsx`
1. Per-card `handleMoreIdeas` should pass media-aware `outputFormat` into `regenerateTemplateIdea`.
2. Reuse existing media detection logic already present in this file (`variant_metadata.media_type` + URL heuristic).

### No route/query changes required for MVP
- `/dashboard/create` and `/dashboard/generating` already pass format for initial generation.
- Continuation can be solved entirely in actions + results UI.

## Backward compatibility
- If no format inferred, default to `"square_image"` to preserve existing behavior.
- Existing image pipeline remains unchanged by default path.

---

## 6) Edge Cases

### Older rows without explicit media metadata
- Use fallback URL-based detection already implemented in results grid (`.mp4|.webm|.m4v`).
- If still ambiguous, default continuation to image.

### Mixed result sets
- MVP rule: derive default from most recent row (or most recent generation run if grouped).
- Expose explicit dropdown override so user can always pick image/video.
- Defer true mixed generation mode.

### Manual refresh / deep links
- Since default is inferred from DB rows server-side on each `/dashboard/memes` load, refresh/deep link remains deterministic.

### `generated_memes.image_url` used for MP4
- Continue relying on this unified field (already current contract).
- Media type detection should prefer `variant_metadata.media_type` when available.

### Future support for true mixed-format “generate more”
- Add explicit mode enum (e.g., `square_image | square_video | mixed_square`).
- Define count split strategy and selection/filter logic in `generateMockMemes`.
- Keep current dropdown UI and add “Generate mixed set” item when backend is ready.

---

## 7) Final Recommendation Summary

### Build now
- Implement **same-format-by-default continuation** plus **dropdown override** (images/videos).
- Pass `outputFormat` through `generateMoreMemes` and `regenerateTemplateIdea`.
- Infer default format from current memes data on results page.

### Defer for later
- True mixed-format generation mode and dedicated mixed selection logic.
- Persistent user-level continuation preference store (optional enhancement).

This gives the cleanest UX now, fixes current ambiguity, and fits the existing architecture with low risk to the image pipeline.

