-- Harmonia FC — Supabase schema v1.50
-- Keep legacy app_state as fallback, then add split tables for lower-conflict writes.

create table if not exists public.app_state (
  key text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_state (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.confirmations (
  player_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_meta (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
alter table public.players enable row level security;
alter table public.game_state enable row level security;
alter table public.confirmations enable row level security;
alter table public.app_meta enable row level security;

drop policy if exists "harmonia_app_state_select" on public.app_state;
create policy "harmonia_app_state_select" on public.app_state for select to anon using (true);
drop policy if exists "harmonia_app_state_insert" on public.app_state;
create policy "harmonia_app_state_insert" on public.app_state for insert to anon with check (true);
drop policy if exists "harmonia_app_state_update" on public.app_state;
create policy "harmonia_app_state_update" on public.app_state for update to anon using (true) with check (true);
drop policy if exists "harmonia_app_state_delete" on public.app_state;
create policy "harmonia_app_state_delete" on public.app_state for delete to anon using (true);

drop policy if exists "harmonia_players_select" on public.players;
create policy "harmonia_players_select" on public.players for select to anon using (true);
drop policy if exists "harmonia_players_insert" on public.players;
create policy "harmonia_players_insert" on public.players for insert to anon with check (true);
drop policy if exists "harmonia_players_update" on public.players;
create policy "harmonia_players_update" on public.players for update to anon using (true) with check (true);
drop policy if exists "harmonia_players_delete" on public.players;
create policy "harmonia_players_delete" on public.players for delete to anon using (true);

drop policy if exists "harmonia_game_select" on public.game_state;
create policy "harmonia_game_select" on public.game_state for select to anon using (true);
drop policy if exists "harmonia_game_insert" on public.game_state;
create policy "harmonia_game_insert" on public.game_state for insert to anon with check (true);
drop policy if exists "harmonia_game_update" on public.game_state;
create policy "harmonia_game_update" on public.game_state for update to anon using (true) with check (true);
drop policy if exists "harmonia_game_delete" on public.game_state;
create policy "harmonia_game_delete" on public.game_state for delete to anon using (true);

drop policy if exists "harmonia_confirmations_select" on public.confirmations;
create policy "harmonia_confirmations_select" on public.confirmations for select to anon using (true);
drop policy if exists "harmonia_confirmations_insert" on public.confirmations;
create policy "harmonia_confirmations_insert" on public.confirmations for insert to anon with check (true);
drop policy if exists "harmonia_confirmations_update" on public.confirmations;
create policy "harmonia_confirmations_update" on public.confirmations for update to anon using (true) with check (true);
drop policy if exists "harmonia_confirmations_delete" on public.confirmations;
create policy "harmonia_confirmations_delete" on public.confirmations for delete to anon using (true);

drop policy if exists "harmonia_meta_select" on public.app_meta;
create policy "harmonia_meta_select" on public.app_meta for select to anon using (true);
drop policy if exists "harmonia_meta_insert" on public.app_meta;
create policy "harmonia_meta_insert" on public.app_meta for insert to anon with check (true);
drop policy if exists "harmonia_meta_update" on public.app_meta;
create policy "harmonia_meta_update" on public.app_meta for update to anon using (true) with check (true);
drop policy if exists "harmonia_meta_delete" on public.app_meta;
create policy "harmonia_meta_delete" on public.app_meta for delete to anon using (true);

-- Optional: legacy row remains available for fallback/migration.
insert into public.app_state (key, state)
values ('default', '{}'::jsonb)
on conflict (key) do nothing;
