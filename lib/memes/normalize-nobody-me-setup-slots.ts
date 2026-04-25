/**
 * Two-slot "nobody_me_setup" templates (e.g. victorian-nobody-me): the model often
 * merges "Nobody: me: …" into `top_text` with an empty `bottom_text`. This
 * normalizes to fixed labels plus a single reaction phrase for slot 2.
 */
export function normalizeNobodyMeSetupSlots(
  topRaw: unknown,
  bottomRaw: unknown
): { top: string; bottom: string } {
  const t =
    typeof topRaw === "string"
      ? topRaw.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim()
      : "";
  const b =
    typeof bottomRaw === "string"
      ? bottomRaw.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim()
      : "";

  if (/^nobody:\s*$/i.test(t) && b) {
    const body = b.replace(/^me:\s*/i, "").trim();
    return {
      top: "Nobody:",
      bottom: body ? `Me: ${body}` : "Me: …",
    };
  }

  const combined = b ? `${t} ${b}`.replace(/\s+/g, " ").trim() : t;
  const nobodyMatch = combined.match(/^nobody:\s*(.*)$/i);
  if (!nobodyMatch) {
    const phrase = t.replace(/^me:\s*/i, "").trim();
    return {
      top: "Nobody:",
      bottom: phrase ? `Me: ${phrase}` : "Me: …",
    };
  }

  const afterNobody = (nobodyMatch[1] ?? "").trim();
  const meMatch = afterNobody.match(/^me:\s*(.*)$/i);
  if (meMatch) {
    const reaction = (meMatch[1] ?? "").trim();
    return {
      top: "Nobody:",
      bottom: reaction ? `Me: ${reaction}` : "Me: …",
    };
  }

  if (afterNobody) {
    return { top: "Nobody:", bottom: `Me: ${afterNobody}` };
  }

  return { top: "Nobody:", bottom: "Me: …" };
}
