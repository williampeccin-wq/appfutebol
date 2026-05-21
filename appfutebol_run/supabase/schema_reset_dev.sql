-- Harmonia FC — RESET DEV ONLY — v1.58.9 RLS STATE HARDENING
-- Rode isto somente no projeto DEV correto: https://fjnelycvneutmyzjrozs.supabase.co
-- NÃO rode na base oficial/prod.

drop table if exists public.confirmations cascade;
drop table if exists public.players cascade;
drop table if exists public.game_state cascade;
drop table if exists public.app_meta cascade;
drop table if exists public.app_state cascade;

drop function if exists public.harmonia_is_admin() cascade;
drop function if exists public.harmonia_has_any_player() cascade;
drop function if exists public.harmonia_is_own_player_id(text) cascade;
drop function if exists public.harmonia_guard_player_insert() cascade;
drop function if exists public.harmonia_guard_player_update() cascade;

create table public.app_state (
  key text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.players (
  id text primary key,
  auth_user_id text,
  is_admin boolean not null default false,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index idx_players_auth_user_id on public.players (auth_user_id);
create index idx_players_is_admin on public.players (is_admin);

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

create or replace function public.harmonia_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.players p
    where p.auth_user_id = auth.uid()::text
      and p.is_admin is true
  );
$$;

create or replace function public.harmonia_has_any_player()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.players);
$$;

create or replace function public.harmonia_is_own_player_id(target_player_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.players p
    where p.id = target_player_id
      and p.auth_user_id = auth.uid()::text
  );
$$;

create or replace function public.harmonia_guard_player_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.auth_user_id is null or NEW.auth_user_id <> auth.uid()::text then
    if not public.harmonia_is_admin() then
      raise exception 'player_insert_not_allowed';
    end if;
  end if;

  if NEW.is_admin is true and public.harmonia_has_any_player() and not public.harmonia_is_admin() then
    raise exception 'admin_insert_not_allowed';
  end if;

  NEW.data = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(NEW.data, '{}'::jsonb), '{id}', to_jsonb(NEW.id), true),
      '{auth_user_id}', coalesce(to_jsonb(NEW.auth_user_id), 'null'::jsonb), true
    ),
    '{is_admin}', to_jsonb(NEW.is_admin), true
  );

  return NEW;
end;
$$;

create or replace function public.harmonia_guard_player_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.harmonia_is_admin() then
    NEW.data = jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(NEW.data, '{}'::jsonb), '{id}', to_jsonb(NEW.id), true),
        '{auth_user_id}', coalesce(to_jsonb(NEW.auth_user_id), 'null'::jsonb), true
      ),
      '{is_admin}', to_jsonb(NEW.is_admin), true
    );
    return NEW;
  end if;

  if OLD.auth_user_id is null or OLD.auth_user_id <> auth.uid()::text then
    raise exception 'player_update_not_allowed';
  end if;

  NEW.id := OLD.id;
  NEW.auth_user_id := OLD.auth_user_id;
  NEW.is_admin := OLD.is_admin;

  if coalesce(NEW.data->>'mens_ok', '') is distinct from coalesce(OLD.data->>'mens_ok', '') then
    raise exception 'mens_ok_is_admin_only';
  end if;

  if coalesce(NEW.data->>'role', '') is distinct from coalesce(OLD.data->>'role', '') then
    raise exception 'role_is_admin_only';
  end if;

  if coalesce(NEW.data->>'plays_football', '') is distinct from coalesce(OLD.data->>'plays_football', '') then
    raise exception 'plays_football_is_admin_only';
  end if;

  if coalesce(NEW.data->>'in_carne_group', '') is distinct from coalesce(OLD.data->>'in_carne_group', '') then
    raise exception 'in_carne_group_is_admin_only';
  end if;

  if coalesce(NEW.data->>'position', '') is distinct from coalesce(OLD.data->>'position', '') then
    raise exception 'position_is_admin_only';
  end if;

  NEW.data = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(NEW.data, '{}'::jsonb), '{id}', to_jsonb(NEW.id), true),
      '{auth_user_id}', coalesce(to_jsonb(NEW.auth_user_id), 'null'::jsonb), true
    ),
    '{is_admin}', to_jsonb(NEW.is_admin), true
  );

  return NEW;
end;
$$;

create trigger trg_harmonia_guard_player_insert
before insert on public.players
for each row execute function public.harmonia_guard_player_insert();

create trigger trg_harmonia_guard_player_update
before update on public.players
for each row execute function public.harmonia_guard_player_update();

alter table public.app_state enable row level security;
alter table public.players enable row level security;
alter table public.game_state enable row level security;
alter table public.confirmations enable row level security;
alter table public.app_meta enable row level security;

revoke all on public.app_state from anon;
revoke all on public.players from anon;
revoke all on public.game_state from anon;
revoke all on public.confirmations from anon;
revoke all on public.app_meta from anon;

grant select, insert, update, delete on public.app_state to authenticated;
grant select, insert, update, delete on public.players to authenticated;
grant select, insert, update, delete on public.game_state to authenticated;
grant select, insert, update, delete on public.confirmations to authenticated;
grant select, insert, update, delete on public.app_meta to authenticated;

create policy "harmonia_app_state_read_authenticated"
on public.app_state for select to authenticated
using (true);

create policy "harmonia_app_state_write_admin"
on public.app_state for all to authenticated
using (public.harmonia_is_admin())
with check (public.harmonia_is_admin());

create policy "harmonia_players_read_authenticated"
on public.players for select to authenticated
using (true);

create policy "harmonia_players_insert_admin_or_self"
on public.players for insert to authenticated
with check (
  public.harmonia_is_admin()
  or (
    auth_user_id = auth.uid()::text
    and (is_admin is false or public.harmonia_has_any_player() is false)
  )
);

create policy "harmonia_players_update_admin_or_self"
on public.players for update to authenticated
using (public.harmonia_is_admin() or auth_user_id = auth.uid()::text)
with check (public.harmonia_is_admin() or auth_user_id = auth.uid()::text);

create policy "harmonia_players_delete_admin"
on public.players for delete to authenticated
using (public.harmonia_is_admin());

create policy "harmonia_game_read_authenticated"
on public.game_state for select to authenticated
using (true);

create policy "harmonia_game_write_admin"
on public.game_state for all to authenticated
using (public.harmonia_is_admin())
with check (public.harmonia_is_admin());

create policy "harmonia_confirmations_read_authenticated"
on public.confirmations for select to authenticated
using (true);

create policy "harmonia_confirmations_insert_admin_or_self"
on public.confirmations for insert to authenticated
with check (public.harmonia_is_admin() or public.harmonia_is_own_player_id(player_id));

create policy "harmonia_confirmations_update_admin_or_self"
on public.confirmations for update to authenticated
using (public.harmonia_is_admin() or public.harmonia_is_own_player_id(player_id))
with check (public.harmonia_is_admin() or public.harmonia_is_own_player_id(player_id));

create policy "harmonia_confirmations_delete_admin_or_self"
on public.confirmations for delete to authenticated
using (public.harmonia_is_admin() or public.harmonia_is_own_player_id(player_id));

create policy "harmonia_meta_read_authenticated"
on public.app_meta for select to authenticated
using (true);

create policy "harmonia_meta_write_admin"
on public.app_meta for all to authenticated
using (public.harmonia_is_admin())
with check (public.harmonia_is_admin());

insert into public.game_state (key, data)
values ('default', '{"game_date":"2026-05-06","game_time":"20:30","max_players":18,"mens_expire_date":"2026-05-10","open":true,"sort_result":null}'::jsonb);

insert into public.app_meta (key, data)
values ('default', '{"championship":{"id":"champ-2026-01","start_date":"2026-01-08","end_date":null,"closed":false,"ranking":[]},"carne":[],"notifications":[]}'::jsonb);

insert into public.app_state (key, state)
values ('default', '{}'::jsonb);
