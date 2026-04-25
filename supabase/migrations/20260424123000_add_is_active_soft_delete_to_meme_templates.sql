-- Soft-delete support for meme templates.
-- Templates moved to QA "delete" bucket are marked inactive (is_active=false).

alter table public.meme_templates
add column if not exists is_active boolean not null default true;

do $$
declare
  has_active boolean;
  has_status boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meme_templates'
      and column_name = 'active'
  ) into has_active;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meme_templates'
      and column_name = 'status'
  ) into has_status;

  if has_active and has_status then
    execute $sql$
      update public.meme_templates
      set is_active = case
        when coalesce(active, true) = false then false
        when lower(coalesce(status, 'active')) <> 'active' then false
        else true
      end
    $sql$;
  elsif has_active then
    execute $sql$
      update public.meme_templates
      set is_active = coalesce(active, true)
    $sql$;
  elsif has_status then
    execute $sql$
      update public.meme_templates
      set is_active = lower(coalesce(status, 'active')) = 'active'
    $sql$;
  end if;
end $$;

create index if not exists idx_meme_templates_is_active
  on public.meme_templates (is_active);
