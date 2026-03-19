alter table public.generated_memes
  add column if not exists idea_group_id uuid;
