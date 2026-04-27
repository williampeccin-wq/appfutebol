-- Harmonia FC — Supabase foundation schema
-- Run this in Supabase SQL Editor.

create table if not exists public.app_state (
  key text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- MVP policy:
-- This allows the frontend anon key to read/write the shared app state.
-- For a closed test group, keep the Supabase project private and do not expose service_role keys.
-- Later versions should replace this with authenticated-user scoped policies.
drop policy if exists "harmonia_app_state_select" on public.app_state;
create policy "harmonia_app_state_select"
on public.app_state
for select
to anon
using (true);

drop policy if exists "harmonia_app_state_insert" on public.app_state;
create policy "harmonia_app_state_insert"
on public.app_state
for insert
to anon
with check (true);

drop policy if exists "harmonia_app_state_update" on public.app_state;
create policy "harmonia_app_state_update"
on public.app_state
for update
to anon
using (true)
with check (true);

-- Optional initial row. The app also creates this automatically by upserting
-- the current local state when Supabase is configured and empty.
insert into public.app_state (key, state)
values ('default', '{}'::jsonb)
on conflict (key) do nothing;
