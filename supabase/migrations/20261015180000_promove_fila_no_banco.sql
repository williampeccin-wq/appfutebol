-- O BANCO promove o primeiro da fila quando abre uma vaga de linha.
--
-- INCIDENTE 14/10/2026 (Harmonia): até aqui a promoção morava só no aparelho de
-- quem fazia a ação, e dois buracos deixavam a fila parada:
--   1. jogador comum cancela (o Broca, 09:54): o app dele promove o primeiro da
--      fila, mas a policy harmonia_presence_*_admin_or_self só deixa gravar a
--      PRÓPRIA linha — a promoção não chega ao banco, e a fila só anda quando um
--      admin abre o app e a reconciliação do sync promove por ele;
--   2. admin remove (o Caue, 16:56): saída e promoção iam em paralelo e a trava
--      de lotação via a entrada antes da saída (corrigido no cliente na
--      v1.207.0, mas qualquer cliente velho ainda faz assim).
-- Aqui a promoção acontece na MESMA transação em que a vaga abre, venha de onde
-- vier.
--
-- A ordem da fila espelha getWaitlistEntries (game.service.js) — a fila que a
-- tela mostra tem de ser a fila que entra:
--   - chegada: waitlisted_at, ou o timestamp, como confirmationFromPresenceRow;
--   - com settings.fila_prioriza_em_dia ligada, quem está em atraso cede a vez
--     (cedeVezNaFilaPorMensalidade): mens_ok === false, depois do vencimento do
--     jogo, e não isento (carne ou goleiro não-pagante; admin nunca é carne).
-- A conta de vaga espelha a trava trg_presence_line_capacity (20260929190000),
-- e o UPDATE de promoção passa por ela: se esta conta errar, a trava barra.
--
-- Na tabela, quem está na fila tem status 'cancelled' e data.status 'waitlist'
-- (presencePayloadFromConfirmation grava assim).
--
-- Tolerante aos DOIS schemas, como a trava de lotação: convocados-prod tem
-- club_id e app_meta por clube; harmonia-fc não tem club_id e usa 'default'.

create or replace function public.presence_promove_fila()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old        jsonb := to_jsonb(old);
  v_club       text;
  v_meta_key   text;
  v_meta       jsonb;
  v_game       jsonb;
  v_max        int;
  v_linha      int;
  v_convidados int;
  v_vagas      int;
  v_prioriza   boolean;
  v_vencido    boolean;
  v_agora      timestamptz := now();
  v_iso        text;
  v_proximo    text;
  v_linhas     int;
begin
  -- Só interessa quem DEIXA de estar confirmado (cancelou, foi removido, cedeu
  -- a vaga, foi apagado).
  if coalesce(old.status, '') <> 'confirmed' then
    return null;
  end if;
  if tg_op = 'UPDATE' and coalesce(new.status, '') = 'confirmed' then
    return null;
  end if;

  -- Tudo daqui para baixo é melhor-esforço: um erro inesperado (dado torto no
  -- app_meta, coluna que não existe num dos schemas) NÃO pode impedir ninguém de
  -- sair do jogo. Vira aviso no log do Postgres e a fila fica para o app.
  begin

  v_club := nullif(v_old ->> 'club_id', '');
  v_meta_key := coalesce(v_club, 'default');

  -- Mesmo lock da trava de lotação: confirmação e promoção na fila, uma por vez.
  perform pg_advisory_xact_lock(hashtext(v_meta_key || '|' || old.game_key));

  select m.data into v_meta from app_meta m where m.key = v_meta_key limit 1;

  select g into v_game
  from jsonb_array_elements(coalesce(v_meta -> 'games', '[]'::jsonb)) g
  where g ->> 'game_key' = old.game_key
  limit 1;

  v_max := nullif(v_game ->> 'max_players', '')::int;
  if v_max is null or v_max < 1 then
    return null; -- jogo desconhecido ou sem limite
  end if;

  v_prioriza := coalesce(v_meta -> 'settings' ->> 'fila_prioriza_em_dia', '') = 'true';
  v_vencido := coalesce(
    to_char(v_agora at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') > nullif(left(v_game ->> 'mens_expire_date', 10), ''),
    false);
  v_iso := to_char(v_agora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  loop
    select count(*) into v_linha
    from presence_confirmations c
    left join players p on p.id = c.player_id
    where c.game_key = old.game_key
      and c.status = 'confirmed'
      and coalesce(to_jsonb(c) ->> 'club_id', '') is not distinct from coalesce(v_club, '')
      and coalesce(lower(p.data ->> 'position'), '') not in ('gol', 'goleiro')
      and coalesce(c.data ->> 'goalkeeper', '') <> 'true'
      and coalesce(c.data ->> 'segment', '') <> 'goalkeeper'
      and coalesce(c.data ->> 'presence_role', '') <> 'goalkeeper';

    select count(*) into v_convidados
    from jsonb_array_elements(coalesce(v_game -> 'guest_players', '[]'::jsonb)) gp
    where coalesce(lower(gp ->> 'position'), '') not in ('gol', 'goleiro');

    v_vagas := v_max - v_linha - v_convidados;
    exit when v_vagas <= 0;

    select c.player_id into v_proximo
    from presence_confirmations c
    left join players p on p.id = c.player_id
    where c.game_key = old.game_key
      and c.status <> 'confirmed'
      and lower(coalesce(c.data ->> 'status', '')) in ('waitlist', 'waitlisted')
      and coalesce(to_jsonb(c) ->> 'club_id', '') is not distinct from coalesce(v_club, '')
    order by
      -- cedeVezNaFilaPorMensalidade
      (v_prioriza and v_vencido
        and (p.data -> 'mens_ok') = 'false'::jsonb
        and not (
          -- isento: carne (admin nunca é carne), quem não joga, goleiro não-pagante
          (coalesce(p.is_admin, false) = false and coalesce(p.data ->> 'role', '') = 'carne')
          or (p.data -> 'plays_football') = 'false'::jsonb
          or (coalesce(lower(p.data ->> 'position'), '') in ('gol', 'goleiro')
              and coalesce(p.data -> 'gk_pays', 'null'::jsonb) <> 'true'::jsonb)
        )) asc,
      coalesce(c.data ->> 'waitlisted_at', c.data ->> 'timestamp', '') asc,
      c.player_id asc
    limit 1;

    exit when v_proximo is null;

    -- A promoção NUNCA pode desfazer a saída: se a trava de lotação recusar
    -- (conta divergente, convidado novo…), só a promoção volta atrás.
    begin
      update presence_confirmations c
      set status = 'confirmed',
        confirmed_at = v_agora,
        cancelled_at = null,
        removed_by_admin = false,
        updated_at = v_agora,
        data = coalesce(c.data, '{}'::jsonb) || jsonb_build_object(
          'confirmed', true,
          'status', 'confirmed',
          'timestamp', v_iso,
          'confirmed_at', v_iso,
          'cancelled_at', null,
          'waitlisted_at', null,
          'waitlist_position', null,
          'removed_by_admin', false,
          'source', 'banco_promove_fila'
        )
      where c.game_key = old.game_key
        and c.player_id = v_proximo
        and coalesce(to_jsonb(c) ->> 'club_id', '') is not distinct from coalesce(v_club, '');
      get diagnostics v_linhas = row_count;
    exception when check_violation then
      v_linhas := 0;
    end;

    exit when v_linhas = 0;
    v_proximo := null;
  end loop;

  exception when others then
    raise warning 'presence_promove_fila (%): % [%]', old.game_key, sqlerrm, sqlstate;
  end;

  return null;
end;
$$;

comment on function public.presence_promove_fila() is
  'Promove o primeiro da fila de espera quando um confirmado de linha sai do jogo. Ordem da fila = getWaitlistEntries do app. Ver INCIDENTE 14/10/2026 (Harmonia).';

drop trigger if exists trg_presence_promove_fila on public.presence_confirmations;

create trigger trg_presence_promove_fila
after update or delete on public.presence_confirmations
for each row
execute function public.presence_promove_fila();
