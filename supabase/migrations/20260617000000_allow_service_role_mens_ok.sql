-- Libera o service_role (backend confiável) a alterar mens_ok no players.
--
-- Os triggers de guarda do players bloqueiam mudança de mens_ok/role/etc por
-- quem não é admin — proteção correta contra um jogador se marcar pago mexendo
-- direto no banco. Mas a Edge Function read-pix-receipt grava com a service_role
-- DEPOIS de validar o comprovante PIX, e estava sendo barrada também.
--
-- Solução: tratar service_role como autorizado (igual admin) nos dois triggers.
-- service_role só existe dentro da Edge Function (nunca no cliente), então é seguro.
-- Corpo reproduzido idêntico ao atual, com o único acréscimo do atalho de role.

create or replace function public.harmonia_guard_player_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if public.harmonia_is_admin() or auth.role() = 'service_role' then
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

  NEW.data = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(NEW.data, '{}'::jsonb), '{id}', to_jsonb(NEW.id), true),
      '{auth_user_id}', coalesce(to_jsonb(NEW.auth_user_id), 'null'::jsonb), true
    ),
    '{is_admin}', to_jsonb(NEW.is_admin), true
  );

  return NEW;
end;
$function$;

create or replace function public.prevent_non_admin_player_privilege_changes()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  actor_is_admin boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  select coalesce(p.is_admin, false)
  into actor_is_admin
  from public.players p
  where p.auth_user_id = auth.uid()::text
  limit 1;

  if coalesce(actor_is_admin, false) = true then
    return new;
  end if;

  if old.auth_user_id is distinct from new.auth_user_id then
    raise exception 'Only admins can change auth_user_id';
  end if;

  if old.is_admin is distinct from new.is_admin then
    raise exception 'Only admins can change is_admin';
  end if;

  if coalesce(old.data->>'mens_ok', '') is distinct from coalesce(new.data->>'mens_ok', '') then
    raise exception 'Only admins can change mens_ok';
  end if;

  if coalesce(old.data->>'role', '') is distinct from coalesce(new.data->>'role', '') then
    raise exception 'Only admins can change role';
  end if;

  if coalesce(old.data->>'is_admin', '') is distinct from coalesce(new.data->>'is_admin', '') then
    raise exception 'Only admins can change data.is_admin';
  end if;

  if coalesce(old.data->>'carne_group', '') is distinct from coalesce(new.data->>'carne_group', '') then
    raise exception 'Only admins can change carne_group';
  end if;

  return new;
end;
$function$;
