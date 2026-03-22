-- Goal from onboarding: full-month pack vs on-demand creation
alter table public.profiles
  add column if not exists generation_mode text;

alter table public.profiles
  drop constraint if exists profiles_generation_mode_check;

alter table public.profiles
  add constraint profiles_generation_mode_check
  check (
    generation_mode is null
    or generation_mode in ('content_pack', 'on_demand')
  );

comment on column public.profiles.generation_mode is
  'Set during onboarding: content_pack | on_demand. NULL = legacy / default on_demand in app.';
