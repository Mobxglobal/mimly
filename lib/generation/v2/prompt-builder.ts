type TemplateRow = Record<string, unknown>;

export function buildSimplePrompt(input: string, template: TemplateRow): string {
  const userInput = String(input ?? "").replace(/\s+/g, " ").trim();
  const templateName = String(template.template_name ?? template.slug ?? "template").trim();
  const memeMechanic = String(template.meme_mechanic ?? "general meme").trim();
  const hasSecondSlot =
    template.slot_2_max_chars != null || template.slot_2_max_lines != null;
  const hasThirdSlot =
    template.slot_3_max_chars != null || template.slot_3_max_lines != null;

  const slotSchema = {
    title: "short title, under 45 chars",
    top_text: "primary meme text",
    bottom_text: hasSecondSlot ? "secondary text for slot 2" : null,
    slot_3_text: hasThirdSlot ? "optional slot 3 text if needed" : null,
  };

  return [
    "Write meme copy as valid JSON only.",
    `Template: ${templateName}`,
    `Mechanic: ${memeMechanic}`,
    `User input: ${userInput}`,
    "Make it short, relatable, and specific.",
    "No hashtags. No markdown. No extra keys.",
    `JSON schema: ${JSON.stringify(slotSchema)}`,
  ].join("\n");
}
