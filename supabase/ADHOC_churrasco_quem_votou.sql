-- QUEM VOTOU NO CHURRASCO SEM TER CONFIRMADO O JOGO (somente leitura)
--
-- Desde v1.217.0 (24/11/2026) qualquer integrante vota no churrasco, tenha ou não
-- confirmado o jogo. Esta consulta mede se isso trouxe muito voto de quem nem foi.
--
-- Leitura: "outros" é quem não confirmou o jogo e não é "Somente churrasco". Antes
-- da trava (19/08 e 26/08) eram 1 a 2 por jogo. Se subir muito acima disso, vale
-- voltar a restringir — ou partir para o "Estive no churrasco" com lista pública.

-- 1) Por jogo: de onde vieram os votos
with conf as (
  select game_key, player_id::text as pid
    from public.presence_confirmations
   where status = 'confirmed' or (data->>'confirmed')::boolean is true
), votos as (
  select game_key, voter_id::text as vid
    from public.ratings
   where kind = 'churrasco'
   group by 1, 2
), so_churrasco as (
  select id::text as pid
    from public.players
   where data->>'plays_football' = 'false' or data->>'role' = 'carne'
)
select v.game_key,
       count(*)                                                        as votos,
       count(*) filter (where c.pid is not null)                       as confirmados,
       count(*) filter (where c.pid is null and k.pid is not null)     as somente_churrasco,
       count(*) filter (where c.pid is null and k.pid is null)         as outros
  from votos v
  left join conf c         on c.game_key = v.game_key and c.pid = v.vid
  left join so_churrasco k on k.pid = v.vid
 group by v.game_key
 order by v.game_key desc
 limit 12;

-- 2) Quem são os "outros" (nome, jogo e nota)
-- with conf as (
--   select game_key, player_id::text as pid
--     from public.presence_confirmations
--    where status = 'confirmed' or (data->>'confirmed')::boolean is true
-- )
-- select r.game_key, p.data->>'name' as nome, r.score,
--        to_char(r.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando
--   from public.ratings r
--   join public.players p on p.id::text = r.voter_id::text
--   left join conf c on c.game_key = r.game_key and c.pid = r.voter_id::text
--  where r.kind = 'churrasco'
--    and c.pid is null
--    and coalesce(p.data->>'plays_football', 'true') <> 'false'
--    and coalesce(p.data->>'role', '') <> 'carne'
--    and r.updated_at >= '2026-11-24'
--  order by r.game_key desc, nome;
