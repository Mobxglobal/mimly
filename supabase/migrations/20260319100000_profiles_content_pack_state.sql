-- MVP content pack: unlock entitlement + last completed batch index (1–3)
alter table public.profiles
  add column if not exists content_pack_unlocked_at timestamptz;

alter table public.profiles
  add column if not exists content_pack_last_completed_batch integer default 0;

comment on column public.profiles.content_pack_unlocked_at is
  'When set, user has paid / unlocked the content pack product (full batch visibility).';

comment on column public.profiles.content_pack_last_completed_batch is
  'Highest content pack batch (1–3) successfully generated for this user.';
