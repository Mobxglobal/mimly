/**
 * Shape produced when mapping `meme_templates` rows for generation/render in
 * `generateMockMemes` (`loadCompatibleTemplates`). Shared for QA tooling only.
 */
export type CompatibleTemplate = {
  template_id: string;
  template_name: string;
  slug: string;
  height_bucket: string | null;
  template_family: string;
  text_layout_type: string | null;
  template_type: "top_caption" | "side_caption" | "overlay" | "sign_caption";
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
  image_filename: string | null;
  source_media_path: string | null;
  preview_image_filename: string | null;
  canvas_width: number;
  canvas_height: number;
  font: string | null;
  font_size: number | null;
  alignment: string | null;
  text_color: string | null;
  stroke_color: string | null;
  stroke_width: number | null;
  slot_1_x: number | null;
  slot_1_y: number | null;
  slot_1_width: number | null;
  slot_1_height: number | null;
  slot_2_x: number | null;
  slot_2_y: number | null;
  slot_2_width: number | null;
  slot_2_height: number | null;
  slot_3_x: number | null;
  slot_3_y: number | null;
  slot_3_width: number | null;
  slot_3_height: number | null;
};
