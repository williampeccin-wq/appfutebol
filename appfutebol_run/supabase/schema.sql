-- Harmonia FC — Supabase schema v1.56 AUTH DEV
-- DEV reset-safe schema. Use only on harmonia-dev or a disposable database.

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

drop policy if exists "harmonia_app_state_all_anon" on public.app_state;
create policy "harmonia_app_state_all_anon" on public.app_state for all to anon using (true) with check (true);

drop policy if exists "harmonia_players_all_anon" on public.players;
create policy "harmonia_players_all_anon" on public.players for all to anon using (true) with check (true);

drop policy if exists "harmonia_game_all_anon" on public.game_state;
create policy "harmonia_game_all_anon" on public.game_state for all to anon using (true) with check (true);

drop policy if exists "harmonia_confirmations_all_anon" on public.confirmations;
create policy "harmonia_confirmations_all_anon" on public.confirmations for all to anon using (true) with check (true);

drop policy if exists "harmonia_meta_all_anon" on public.app_meta;
create policy "harmonia_meta_all_anon" on public.app_meta for all to anon using (true) with check (true);

grant select, insert, update, delete on public.app_state to anon;
grant select, insert, update, delete on public.players to anon;
grant select, insert, update, delete on public.game_state to anon;
grant select, insert, update, delete on public.confirmations to anon;
grant select, insert, update, delete on public.app_meta to anon;

insert into public.game_state (key, data)
values ('default', '{"game_date":"2026-05-06","game_time":"20:30","max_players":18,"mens_expire_date":"2026-05-10","open":true,"sort_result":null}'::jsonb)
on conflict (key) do nothing;

insert into public.app_meta (key, data)
values ('default', '{"championship":{"id":"champ-2026-01","start_date":"2026-01-08","end_date":null,"closed":false,"ranking":[]},"carne":[],"notifications":[]}'::jsonb)
on conflict (key) do nothing;

insert into public.app_state (key, state)
values ('default', '{}'::jsonb)
on conflict (key) do nothing;
