# Square text renderer — temporary calibration

**Purpose:** Visual inspection of the 1080×1080 square text layout before changing the renderer.

## Run

```bash
npm run calibrate:square-text
```

Outputs PNGs under `debug-output/square-text-calibration/` (gitignored). A `README.md` is written there listing metrics and case notes.

## Production behavior

`generateMockMemes` does **not** pass `debug: true`; guides appear **only** when `renderSquareTextMemePng({ ..., debug: true })` is used (calibration script only).

## Guide legend (on-canvas)

- **Red verticals:** x = 96 and x = 984 (horizontal safe band).
- **Blue dashed vertical:** x = 112 (multi-line `text-anchor="start"` anchor).
- **Magenta dashed vertical:** x = 540 (canvas center).
- **Orange horizontals:** y = 96 and y = 984 (top/bottom margin lines).
- **Light blue row bands + cyan dashed:** approximate per-line row (baseline = cyan).

Wrapped copy is limited to **896px** measured width per line (from multi-line anchor x = 112). The calibration script asserts each wrapped line stays within that budget (±1px).

Remove this doc, the `debug` flag, and `scripts/generate-square-text-calibration.ts` when calibration is done.
