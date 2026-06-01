create or replace function public.harmonia_service_link_player_access(
  p_player_id text,
  p_auth_user_id text,
  p_email text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if p_player_id is null or length(trim(p_player_id)) = 0 then
    raise exception 'missing_player_id';
  end if;

  if p_auth_user_id is null or length(trim(p_auth_user_id)) = 0 then
    raise exception 'missing_auth_user_id';
  end if;

  alter table public.players disable trigger trg_harmonia_guard_player_update;
  alter table public.players disable trigger trg_prevent_non_admin_player_privilege_changes;

  update public.players
  set
    auth_user_id = p_auth_user_id,
    data = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(data, '{auth_user_id}', to_jsonb(p_auth_user_id), true),
          '{email}', to_jsonb(p_email), true
        ),
        '{login_phone}', to_jsonb(p_phone), true
      ),
      '{phone}', to_jsonb(p_phone), true
    ),
    updated_at = now()
  where id = p_player_id;

  get diagnostics v_updated_count = row_count;

  alter table public.players enable trigger trg_prevent_non_admin_player_privilege_changes;
  alter table public.players enable trigger trg_harmonia_guard_player_update;

  if v_updated_count <> 1 then
    raise exception 'player_not_found_or_not_unique:%', p_player_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'player_id', p_player_id,
    'auth_user_id', p_auth_user_id,
    'email', p_email
  );
exception
  when others then
    begin
      alter table public.players enable trigger trg_prevent_non_admin_player_privilege_changes;
    exception when others then
      null;
    end;

    begin
      alter table public.players enable trigger trg_harmonia_guard_player_update;
    exception when others then
      null;
    end;

    raise;
end;
$$;

revoke all on function public.harmonia_service_link_player_access(text, text, text, text) from public;
grant execute on function public.harmonia_service_link_player_access(text, text, text, text) to service_role;
