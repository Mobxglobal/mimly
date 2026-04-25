-- Baseline: medium + top_caption templates use a larger caption for visual impact.
--
-- To test one template first, temporarily use:
--   and slug = 'barbie-sad'
-- then widen to all medium + top_caption rows.

update public.meme_templates
set font_size = 54
where lower(trim(coalesce(height_bucket, ''))) = 'medium'
  and lower(trim(coalesce(text_layout_type, ''))) = 'top_caption';
