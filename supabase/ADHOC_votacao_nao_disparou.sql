-- POR QUE O AVISO DE VOTAÇÃO NÃO CHEGOU (rodar no SQL Editor do projeto harmonia-fc)
--
-- O push de votação sai de send-push, ação `trigger_voting`, disparada pelo app no
-- momento em que o admin lança o resultado (production/app.js:1696). É
-- fire-and-forget: se falhar, nem o admin nem o jogador veem erro.
--
-- Três causas possíveis, e cada consulta abaixo elimina uma:
--   1. Você não estava CONFIRMADO no jogo — o alvo é só quem confirmou presença.
--   2. Já existia linha no push_log para (kind, game_key): a função trata como
--      "já enviei" e sai calada. Acontece se o resultado for lançado duas vezes.
--   3. Sua inscrição de push morreu (troca de aparelho, rotação de chave VAPID).

-- 1) O disparo chegou a acontecer? Últimos 7 dias, todos os tipos.
select kind,
       game_key,
       status,
       error,
       to_char(sent_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando
  from public.push_log
 where sent_at >= now() - interval '7 days'
 order by sent_at desc
 limit 30;

-- 2) Quem era alvo do último jogo, e quem tinha aparelho para receber.
-- Alvo = presença confirmada (os DOIS formatos valem, como na função).
-- with jogo as (
--   select game_key
--     from public.presence_confirmations
--    group by game_key
--    order by max(coalesce(updated_at, created_at)) desc
--    limit 1
-- )
-- select coalesce(p.data->>'name', '?')                                as nome,
--        coalesce(c.status, '-')                                       as status,
--        (select count(*) from public.push_subscriptions s
--          where s.player_id = p.id)                                   as inscricoes_de_push
--   from public.presence_confirmations c
--   join public.players p on p.id = c.player_id
--  cross join jogo j
--  where c.game_key = j.game_key
--    and (c.status = 'confirmed' or (c.data->>'confirmed')::boolean is true)
--  order by inscricoes_de_push, nome;

-- 3) E a SUA inscrição? Zero aqui explica receber nada, mesmo sendo alvo.
-- select coalesce(p.data->>'name','?') as nome,
--        count(s.endpoint)             as inscricoes,
--        max(to_char(s.created_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI')) as mais_recente
--   from public.players p
--   left join public.push_subscriptions s on s.player_id = p.id
--  where p.data->>'name' ilike '%william%'
--  group by 1;
