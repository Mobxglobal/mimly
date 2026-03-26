-- Engagement template: birthday_names_list (text_layout_type-driven in engagement_text family).
-- Idempotent insert for the next bespoke engagement layout.

insert into public.meme_templates (
  slug,
  template_name,
  template_family,
  asset_type,
  media_format,
  text_layout_type,
  is_active,
  template_id,
  slot_1_role,
  slot_1_max_chars,
  slot_1_max_lines,
  slot_2_role,
  slot_2_max_chars,
  slot_2_max_lines,
  template_logic,
  example_output,
  canvas_width,
  canvas_height,
  image_filename,
  pattern_type,
  meme_mechanic,
  emotion_style,
  context_fit,
  business_fit,
  promotion_fit
)
select
  'birthday-names-list',
  'Birthday Names List',
  'engagement_text',
  'image',
  'png',
  'birthday_names_list',
  true,
  99021,
  'subject group',
  22,
  1,
  'gift / reward phrase',
  22,
  1,
  'Generate a headline in the format "These {slot_1} deserve {slot_2} for their birthday" and a names array of exactly 24 unique first names (no surnames, no numbering, no bullets). Keep slot_1 and slot_2 concise and socially natural.',
  'These women deserve a spa day for their birthday',
  1080,
  1080,
  null,
  'engagement',
  'birthday_claim_names_grid',
  'Playful, socially-native, reaction-friendly',
  'A recognizable cohort + a concrete birthday reward that invites comments and tagging.',
  'Applicable to audience-led social formats where names list relevancy increases engagement.',
  false
where not exists (
  select 1
  from public.meme_templates mt
  where mt.slug = 'birthday-names-list'
     or mt.template_id = 99021
);
