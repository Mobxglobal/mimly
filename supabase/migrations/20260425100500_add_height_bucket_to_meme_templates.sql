alter table public.meme_templates
add column if not exists height_bucket text default 'medium';

update public.meme_templates
set height_bucket = 'medium'
where height_bucket is null;

alter table public.meme_templates
alter column height_bucket set default 'medium';

alter table public.meme_templates
alter column height_bucket set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meme_templates_height_bucket_check'
  ) then
    alter table public.meme_templates
      add constraint meme_templates_height_bucket_check
      check (height_bucket in ('short', 'medium', 'tall', 'full'));
  end if;
end $$;
