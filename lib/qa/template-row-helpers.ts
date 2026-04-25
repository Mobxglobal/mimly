/**
 * Row-level helpers aligned with template filtering in `generateMockMemes`
 * (`loadCompatibleTemplates` slot checks).
 */

export function isActiveTemplateRow(t: Record<string, unknown>): boolean {
  if (typeof t.is_active === "boolean") return t.is_active;
  if (typeof t.active === "boolean") return t.active;
  if (typeof t.status === "string") return t.status.toLowerCase() === "active";
  return true;
}

function nonEmpty(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim().length > 0;
}

export function hasSlot3Row(t: Record<string, unknown>): boolean {
  return (
    nonEmpty(t.slot_3_role) ||
    t.slot_3_max_chars != null ||
    t.slot_3_max_lines != null ||
    t.slot_3_x != null ||
    t.slot_3_y != null ||
    t.slot_3_width != null ||
    t.slot_3_height != null
  );
}

export function hasCompleteSlot3DefinitionRow(t: Record<string, unknown>): boolean {
  if (!hasSlot3Row(t)) return false;
  return (
    nonEmpty(t.slot_3_role) &&
    t.slot_3_max_chars != null &&
    t.slot_3_max_lines != null &&
    t.slot_3_x != null &&
    t.slot_3_y != null &&
    t.slot_3_width != null &&
    t.slot_3_height != null
  );
}

export function hasSlot2Row(t: Record<string, unknown>): boolean {
  return (
    nonEmpty(t.slot_2_role) ||
    t.slot_2_max_chars != null ||
    t.slot_2_max_lines != null ||
    t.slot_2_x != null ||
    t.slot_2_y != null
  );
}

export function toIntRow(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export type MemeTemplateType =
  | "top_caption"
  | "side_caption"
  | "overlay"
  | "sign_caption";

export function normalizeTemplateTypeRow(value: unknown): MemeTemplateType {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    normalized === "top_caption" ||
    normalized === "side_caption" ||
    normalized === "overlay" ||
    normalized === "sign_caption"
  ) {
    return normalized;
  }
  return "top_caption";
}

export function getEffectiveSlotMaxCharsRow(
  templateType: MemeTemplateType,
  rawValue: unknown,
  fallback: number
): number {
  const normalized = toIntRow(rawValue, fallback);
  if (templateType === "side_caption" && normalized <= 16) {
    return 17;
  }
  return normalized;
}

export function isThreeSlotRow(t: Record<string, unknown>): boolean {
  return hasCompleteSlot3DefinitionRow(t);
}

export function isTwoSlotRow(t: Record<string, unknown>): boolean {
  return hasSlot2Row(t);
}
