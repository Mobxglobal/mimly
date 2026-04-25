import type { MemeTemplateForRender } from "@/renderer/renderMemeTemplate";

function toNullableInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

/**
 * Maps a `meme_templates` row (Supabase) to {@link MemeTemplateForRender} for PNG renderers.
 */
export function mapMemeTemplateRowForRender(
  t: Record<string, unknown>
): MemeTemplateForRender {
  return {
    slug: t.slug ? String(t.slug).trim() : null,
    meme_mechanic: t.meme_mechanic ? String(t.meme_mechanic).trim() : null,
    canvas_width: toNullableInt(t.canvas_width) ?? 1080,
    canvas_height: toNullableInt(t.canvas_height) ?? 1080,
    height_bucket: t.height_bucket ? String(t.height_bucket).trim() : null,
    template_family: t.template_family ? String(t.template_family).trim() : null,
    text_layout_type: t.text_layout_type
      ? String(t.text_layout_type).trim()
      : null,
    font_size: toNullableInt(t.font_size),
    alignment: t.alignment ? String(t.alignment).trim() : null,
    text_color: t.text_color ? String(t.text_color).trim() : null,
    stroke_color: t.stroke_color ? String(t.stroke_color).trim() : null,
    stroke_width: toNullableInt(t.stroke_width),
    font: t.font ? String(t.font).trim() : null,
    slot_1_x: toNullableInt(t.slot_1_x),
    slot_1_y: toNullableInt(t.slot_1_y),
    slot_1_width: toNullableInt(t.slot_1_width),
    slot_1_height: toNullableInt(t.slot_1_height),
    slot_1_max_chars: toNullableInt(t.slot_1_max_chars),
    slot_1_max_lines: toNullableInt(t.slot_1_max_lines),
    slot_2_x: toNullableInt(t.slot_2_x),
    slot_2_y: toNullableInt(t.slot_2_y),
    slot_2_width: toNullableInt(t.slot_2_width),
    slot_2_height: toNullableInt(t.slot_2_height),
    slot_2_max_chars: toNullableInt(t.slot_2_max_chars),
    slot_2_max_lines: toNullableInt(t.slot_2_max_lines),
    slot_3_x: toNullableInt(t.slot_3_x),
    slot_3_y: toNullableInt(t.slot_3_y),
    slot_3_width: toNullableInt(t.slot_3_width),
    slot_3_height: toNullableInt(t.slot_3_height),
    slot_3_max_chars: toNullableInt(t.slot_3_max_chars),
    slot_3_max_lines: toNullableInt(t.slot_3_max_lines),
  };
}
