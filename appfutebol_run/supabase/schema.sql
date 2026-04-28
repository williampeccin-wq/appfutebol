-- Harmonia FC — Supabase foundation schema
-- Run this in Supabase SQL Editor.

create table if not exists public.app_state (
  key text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

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

insert into public.app_state (key, state)
values ('default', '{}'::jsonb)
on conflict (key) do nothing;
