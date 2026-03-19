alter table public.generated_memes
  add column if not exists post_caption text;
