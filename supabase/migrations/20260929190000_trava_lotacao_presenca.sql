-- Trava de lotação de linha no BANCO.
--
-- INCIDENTE 29/09/2026 (Harmonia): o jogo de 30/09 fechou com 17/16 confirmados
-- de linha. O limite (`max_players`) só existia no cliente: `isGameFull` decide
-- contra o snapshot que AQUELE aparelho tinha em mãos e a gravação em
-- `presence_confirmations` ia solta. Bastou um aparelho com estado defasado
-- (promoção automática da fila rodou achando que havia vaga) para o 17º entrar
-- — e o servidor aceitou sem piscar.
--
-- Aqui a regra passa a morar onde a verdade mora. Espelha `isGameFull`:
--   vaga de linha = max_players − (confirmados de linha + convidados de linha)
--   goleiro NÃO ocupa vaga de linha (tem teto próprio, checado no app)
--
-- Serializa por jogo com advisory lock: duas confirmações simultâneas deixam de
-- passar juntas pela contagem (era a outra metade do buraco).
--
-- Tolerante aos DOIS schemas: no convocados-prod (multi-tenant) as tabelas têm
-- `club_id` e a linha de `app_meta` é a do clube; no harmonia-fc (single-tenant)
-- não existe `club_id` e a linha é a 'default'. O acesso via `to_jsonb(...)`
-- evita referenciar uma coluna que pode não existir.

create or replace function public.presence_enforce_line_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club      text;
  v_meta_key  text;
  v_game      jsonb;
  v_max       int;
  v_eh_goleiro boolean;
  v_linha     int;
  v_convidados int;
begin
  -- Só interessa a transição para CONFIRMADO. Regravação de quem já estava
  -- confirmado (o app reescreve a linha ao carimbar segmento, por exemplo) não
  -- ocupa vaga nova e não pode ser barrada.
  if coalesce(new.status, '') <> 'confirmed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = 'confirmed' then
    return new;
  end if;

  v_club := nullif(to_jsonb(new) ->> 'club_id', '');
  v_meta_key := coalesce(v_club, 'default');

  -- Uma confirmação por vez por jogo: sem isto, dois INSERTs concorrentes leem
  -- a mesma contagem e ambos passam.
  perform pg_advisory_xact_lock(hashtext(v_meta_key || '|' || new.game_key));

  select g into v_game
  from app_meta m, jsonb_array_elements(m.data -> 'games') g
  where m.key = v_meta_key
    and g ->> 'game_key' = new.game_key
  limit 1;

  v_max := nullif(v_game ->> 'max_players', '')::int;

  -- Jogo desconhecido ou sem limite: não é papel desta trava inventar um.
  if v_max is null or v_max < 1 then
    return new;
  end if;

  -- Goleiro tem segmento próprio (teto de goleiros, checado no app) e não
  -- ocupa vaga de linha.
  select coalesce(lower(p.data ->> 'position'), '') in ('gol', 'goleiro')
    into v_eh_goleiro
  from players p
  where p.id = new.player_id;

  if coalesce(v_eh_goleiro, false)
     or coalesce(new.data ->> 'goalkeeper', '') = 'true'
     or coalesce(new.data ->> 'segment', '') = 'goalkeeper'
     or coalesce(new.data ->> 'presence_role', '') = 'goalkeeper' then
    return new;
  end if;

  select count(*) into v_linha
  from presence_confirmations c
  left join players p on p.id = c.player_id
  where c.game_key = new.game_key
    and c.status = 'confirmed'
    and c.player_id <> new.player_id
    and coalesce(to_jsonb(c) ->> 'club_id', '') is not distinct from coalesce(v_club, '')
    and coalesce(lower(p.data ->> 'position'), '') not in ('gol', 'goleiro')
    and coalesce(c.data ->> 'goalkeeper', '') <> 'true'
    and coalesce(c.data ->> 'segment', '') <> 'goalkeeper'
    and coalesce(c.data ->> 'presence_role', '') <> 'goalkeeper';

  select count(*) into v_convidados
  from jsonb_array_elements(coalesce(v_game -> 'guest_players', '[]'::jsonb)) gp
  where coalesce(lower(gp ->> 'position'), '') not in ('gol', 'goleiro');

  if v_linha + v_convidados >= v_max then
    raise exception
      'JOGO_LOTADO: % vaga(s) de linha ocupada(s) de % no jogo %',
      v_linha + v_convidados, v_max, new.game_key
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.presence_enforce_line_capacity() is
  'Barra confirmação de linha acima de max_players do jogo (app_meta). Goleiro e convidado-goleiro não ocupam vaga. Ver INCIDENTE 29/09/2026 (17/16 no Harmonia).';

drop trigger if exists trg_presence_line_capacity on public.presence_confirmations;

create trigger trg_presence_line_capacity
before insert or update on public.presence_confirmations
for each row
execute function public.presence_enforce_line_capacity();
