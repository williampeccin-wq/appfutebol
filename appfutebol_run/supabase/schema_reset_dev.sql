-- Harmonia FC — RESET DEV ONLY
-- Rode isto somente no projeto harmonia-dev. Não rode na base oficial.

drop table if exists public.confirmations cascade;
drop table if exists public.players cascade;
drop table if exists public.game_state cascade;
drop table if exists public.app_meta cascade;
drop table if exists public.app_state cascade;

create table public.app_state (
  key text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.players (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.game_state (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.confirmations (
  player_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.app_meta (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
alter table public.players enable row level security;
alter table public.game_state enable row level security;
alter table public.confirmations enable row level security;
alter table public.app_meta enable row level security;

create policy "harmonia_app_state_all_anon" on public.app_state for all to anon using (true) with check (true);
create policy "harmonia_players_all_anon" on public.players for all to anon using (true) with check (true);
create policy "harmonia_game_all_anon" on public.game_state for all to anon using (true) with check (true);
create policy "harmonia_confirmations_all_anon" on public.confirmations for all to anon using (true) with check (true);
create policy "harmonia_meta_all_anon" on public.app_meta for all to anon using (true) with check (true);

grant select, insert, update, delete on public.app_state to anon;
grant select, insert, update, delete on public.players to anon;
grant select, insert, update, delete on public.game_state to anon;
grant select, insert, update, delete on public.confirmations to anon;
grant select, insert, update, delete on public.app_meta to anon;

insert into public.game_state (key, data)
values ('default', '{"game_date":"2026-05-06","game_time":"20:30","max_players":18,"mens_expire_date":"2026-05-10","open":true,"sort_result":null}'::jsonb);

insert into public.app_meta (key, data)
values ('default', '{"championship":{"id":"champ-2026-01","start_date":"2026-01-08","end_date":null,"closed":false,"ranking":[]},"carne":[],"notifications":[]}'::jsonb);

insert into public.app_state (key, state)
values ('default', '{}'::jsonb);
