# Current Text Layout Source of Truth

## Executive Summary
- The current rendering system is **primarily character-count based**, not true width-measurement based.
- Both image and video renderers use a very similar word-wrap algorithm (`testLine.length <= maxChars`) and enforce max lines by truncating additional wrapped lines.
- Vertical placement is computed from `lineHeight` and slot height, then centered.
- Horizontal overflow prevention depends on `maxChars` being a good proxy for rendered width; there is no pixel-width measurement or dynamic font-size reduction.
- Video has two render paths:
  - `ffmpeg drawtext` path (`renderer/renderMemeVideoTemplate.ts`)
  - PNG-overlay fallback path using image renderer logic (`renderTopCaptionOverlayPng` from `renderer/renderMemeTemplate.ts`)
- Upstream generation validation in `lib/actions/memes.ts` is also character-count/single-line based and does not do pixel-width validation.

---

## Files Inspected
- `renderer/renderMemeTemplate.ts`
- `renderer/renderMemeVideoTemplate.ts`
- `lib/actions/memes.ts`
- repo-wide symbol search for render/wrap/validation references

---

## 1) Image Renderer Source of Truth
Primary file: `renderer/renderMemeTemplate.ts`

### Wrapping and line breaking
- `wrapText(text, maxChars, maxLines)`:
  - splits text by spaces
  - builds `testLine = currentLine + " " + word`
  - accepts line only if `testLine.length <= maxChars`
  - otherwise pushes current line and starts new line with current word
  - stops adding once `lines.length >= maxLines`
- This is **char-count wrapping**, not width measurement.
- No explicit 2-line balancing logic beyond greedy wrapping.

### Handling `slot_*_max_chars` and `slot_*_max_lines`
- `buildSVG(...)` creates slot configs and passes:
  - `slot_1_max_chars ?? 20`, `slot_1_max_lines ?? 2`
  - same pattern for slot 2 and slot 3
- `renderedText` uses `wrapText(slot.text, slot.maxChars, slot.maxLines)`.

### Alignment and horizontal placement
- `getTextAnchor(alignment)` maps:
  - left -> `start`
  - right -> `end`
  - default -> `middle`
- `getXPosition(slot, alignment)`:
  - left -> `slot.x + 20`
  - right -> `slot.x + slot.width - 20`
  - center -> `slot.x + slot.width / 2`
- So left/right include fixed 20px inset; center has no explicit inset.

### Vertical positioning / line height
- In `renderLines(...)`:
  - `lineHeight = round(fontSize * 1.2)`
  - `totalTextHeight = lines.length * lineHeight`
  - `startY = slot.y + (slot.height - totalTextHeight)/2 + fontSize`
  - each line at `y = startY + i * lineHeight`
- This is block-centering inside slot height.

### Stroke / outline rendering
- If `strokeWidth > 0` and `strokeColor` exists, each `<text>` gets:
  - `stroke`, `stroke-width`, `paint-order="stroke"`
- No additional shadow/outline fallback beyond this.

### Width measuring / overflow safeguards
- No glyph/pixel width measurement in image renderer.
- No auto font-size reduction.
- No clipping/masking to slot width.
- Overflow prevention relies on `maxChars` quality and chosen font.

---

## 2) Video Renderer Source of Truth
Primary file: `renderer/renderMemeVideoTemplate.ts`

### Wrapping and line breaking
- Video renderer has its own `wrapText(text, maxChars, maxLines)` with the same greedy char-count behavior as image renderer.
- Uses `normalizeText(...)` first to collapse whitespace/newlines.

### Width constraints and alignment
- For drawtext path:
  - `xExpr` computed from slot/alignment:
    - left: `slotX + 20`
    - right: `slotX + slotWidth - 20 - text_w`
    - center: `slotX + slotWidth/2 - text_w/2`
- `maxChars` and `maxLines` from template (`slot_1_max_chars`, `slot_1_max_lines`) drive wrapped lines before joining with `\n`.
- Again, this is char-count pre-wrap plus drawtext block rendering; no pre-render width measurement.

### Vertical positioning / line height
- Drawtext path computes:
  - `lineHeight = round(fontSize * 1.2)`
  - `lineCount = max(1, lines.length)`
  - `startY = round(slotY + (slotHeight - totalTextHeight)/2 + fontSize)`
  - `line_spacing = max(0, lineHeight - fontSize)` in drawtext args

### FFmpeg drawtext usage
- Drawtext filter string built as:
  - `drawtext=text='...'`
  - `x=...`, `y=...`
  - `fontsize=...`
  - `fontcolor=...`
  - `line_spacing=...`
  - optional `borderw` / `bordercolor` for stroke
- FFmpeg invocation encodes with H.264 settings (currently `H264_QUICKTIME_FRIENDLY` constant).

### Fallback path
- If drawtext filter unavailable, renderer calls `renderTopCaptionOverlayPng(...)` from `renderer/renderMemeTemplate.ts`.
- That fallback uses the **image SVG layout rules** for slot 1 text, then overlays PNG onto video with ffmpeg `overlay`.
- If overlay path also fails, raw video copy path is used (no caption).

### Width/overflow safeguards
- Same as image: no pixel width measurement, no adaptive font-size, no hard clipping to slot bounds.
- Depends on char-count wrapping + drawtext/runtime text metrics.

---

## 3) Are Image and Video Using the Same Layout Rules?

### Where parity exists
- Greedy char-count wrapping behavior is effectively the same (space-split + `length <= maxChars`).
- Same alignment concepts (`left/right/center`) and same 20px inset for left/right.
- Same line-height formula (`fontSize * 1.2`) and vertical centering math.
- Same stroke intent (outline via stroke/border settings).
- Video fallback overlay path literally reuses image SVG renderer logic via `renderTopCaptionOverlayPng`.

### Where parity breaks
- Image renderer outputs SVG text composited with Sharp.
- Video primary path uses FFmpeg `drawtext` runtime rendering, which can differ subtly from SVG text metrics and font rendering.
- Video has a raw-copy fallback path (if both drawtext and overlay fail) that can produce no caption.
- Image supports slots 1/2/3 in renderer, while video renderer currently accepts/uses only slot 1 in its direct drawtext path.

---

## 4) Horizontal Overflow Protections Today
- Validation and wrapping are mostly char-count based:
  - `validateSlotTextSingleLine(...)` in `lib/actions/memes.ts` enforces max chars, not max pixel width.
  - Renderers wrap by `string.length`, not rendered text width.
- No width-aware measure function exists for current font/size.
- No auto-shrink font-size if line still visually exceeds slot width.
- No explicit clipping region to prevent text from crossing slot boundaries.
- Therefore horizontal overflow risk exists when character width distribution is wide (or font metrics differ from assumed average).

---

## 5) Vertical Overflow Protections Today
- Render-time max line cap exists:
  - wrap function stops at `maxLines`.
- Renderers compute total block height and vertically center in slot.
- There is no explicit check that resulting baseline positions/glyph extents never exceed slot bounds in all fonts/metrics.
- If text would need more than max lines, excess content is dropped by wrap truncation behavior.

---

## 6) Validation Before Rendering (`lib/actions/memes.ts`)
- `normalizeSingleLine(...)` removes newlines and collapses whitespace.
- `validateSlotTextSingleLine(...)` enforces:
  - non-empty
  - `cleaned.length <= maxChars`
  - fragment heuristics via `looksLikeCutOffFragment(...)`
  - some template-specific checks (e.g., woman-yelling-cat rule)
- Important: validation is **single-line normalized string length** based, not width-based and not real line-break simulation in pixels.
- Prompting guidance includes `max_chars` and `max_lines` messaging, but final hard validation is char-count + fragment rules.
- No render-time preflight that measures actual text box width against slot width.

---

## 7) Why the Current Overflow Issue Is Happening
Given current implementation, a caption like:
`When you realize your client misunderstood everything`
can overflow horizontally because:

1. The pipeline validates by **character count**, not actual rendered width.
2. Wrapping uses greedy `string.length` thresholds, which assume average character width.
3. Real font metrics (and drawtext/SVG renderer differences) can produce a line wider than expected even when under char limit.
4. There is no final width clamp, no dynamic font shrink, and no clipping mask to contain overflow.

So the current system can pass validation and still render text that visually exceeds slot edges in certain templates/fonts/text combinations.

---

## What the Current Source of Truth Actually Is
- **Source-of-truth rule set is currently char-count + slot metadata + greedy wrapping**, implemented in:
  - `renderer/renderMemeTemplate.ts`
  - `renderer/renderMemeVideoTemplate.ts`
  - upstream validation in `lib/actions/memes.ts`
- It is not a true width-measured typography layout engine.
- Video and image are mostly aligned in logic, with drawtext-vs-SVG rendering differences and video fallback branches.

---

## Why the Current Overflow Issue Is Happening
- Because current constraints are primarily `maxChars`/`maxLines` based and do not include pixel-width validation or adaptive sizing.
- In practice, “valid by chars” can still be “too wide on screen” for particular wording/font/render-path combinations.
