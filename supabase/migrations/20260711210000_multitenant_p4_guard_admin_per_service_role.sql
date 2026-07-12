-- Multi-tenant Fase 1 · PASSO 4 — ajuste do guard de insert de player.
--
-- O guard bloqueava is_admin=true sempre que já existiam players (regra do mundo
-- single-tenant: "só o 1º player global vira admin"). No multi-tenant, o DONO de
-- cada clube novo é admin mesmo já havendo players de OUTROS clubes. O
-- register-player (service_role, autoridade no servidor) faz esse insert com
-- auth.uid() NULL. Então o bloqueio passa a valer só p/ chamadas AUTENTICADAS
-- (impede escalada de privilégio de usuário logado); o service_role fica livre
-- pra marcar o admin do clube. Resto da função idêntico ao original.

CREATE OR REPLACE FUNCTION public.harmonia_guard_player_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.auth_user_id is null or NEW.auth_user_id <> auth.uid()::text then
    if not public.harmonia_is_admin() then
      raise exception 'player_insert_not_allowed';
    end if;
  end if;

  -- + auth.uid() is not null: só barra admin vindo de sessão AUTENTICADA.
  -- service_role (register-player) tem auth.uid() null e é a autoridade → passa.
  if NEW.is_admin is true and public.harmonia_has_any_player()
     and not public.harmonia_is_admin() and auth.uid() is not null then
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
$function$;
