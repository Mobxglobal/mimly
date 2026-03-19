alter table public.generated_memes
  add column if not exists variant_type text not null default 'standard',
  add column if not exists generation_run_id uuid,
  add column if not exists batch_number integer not null default 1,
  add column if not exists variant_metadata jsonb;
