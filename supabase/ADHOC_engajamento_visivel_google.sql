-- O QUE O GOOGLE CONSEGUIU VER DO NOSSO TESTE
--
-- A 3ª reprovação (16/09/2026) veio depois de a parte automática PASSAR: em
-- 14/09 o botão "Solicitar a produção" estava habilitado, ou seja, 12+ inscritos
-- por 14 dias corridos. Sobra o outro motivo documentado — engajamento
-- insuficiente no período de teste (support.google.com/.../answer/14151465).
--
-- A hipótese a testar: o uso real dos testadores acontece no PWA (aba do
-- navegador), e o Google SÓ enxerga o que roda dentro do app instalado pela
-- Play. Se for isso, do lado deles o teste parece morto mesmo tendo acontecido.
--
-- O campo `detail->>'twa'` existe desde 02/09/2026 e diz exatamente isso:
-- true  = abriu o app instalado pela Play (a TWA)  → o Google conta
-- false = abriu o site no navegador (PWA)          → invisível para o Google
--
-- Janela: 02/09 (primeiro dia com o flag) até 14/09 (dia do pedido).

with janela as (
  select timestamptz '2026-09-02 00:00-03' as ini,
         timestamptz '2026-09-14 23:59-03' as fim
),
aberturas as (
  select a.player_id,
         (a.detail->>'twa') = 'true'                              as pela_play,
         (a.created_at at time zone 'America/Sao_Paulo')::date     as dia
    from public.activity_log a, janela j
   where a.action = 'app_open'
     and a.created_at between j.ini and j.fim
)
select coalesce(p.data->>'name','?')                      as nome,
       count(distinct dia) filter (where pela_play)       as dias_no_app_da_play,
       count(distinct dia) filter (where not pela_play)   as dias_no_navegador,
       count(*)            filter (where pela_play)       as aberturas_na_play,
       count(*)                                           as aberturas_total
  from aberturas x
  join public.players p on p.id = x.player_id
 where p.club_id = 'e2af269c-20d0-4739-b7db-80ed93165192'
 group by 1
 order by 2 desc nulls last, 5 desc;

-- ------------------------------------------------------------------ resumo
-- É este número que decide: quantas pessoas o Google viu usando, e em quantos
-- dias. Se "pessoas_com_3_dias_ou_mais_na_play" for baixo, a reprovação por
-- engajamento para de ser mistério — e a correção não é pagar testador, é fazer
-- o teste acontecer DENTRO do app instalado.
--
-- with janela as (
--   select timestamptz '2026-09-02 00:00-03' as ini,
--          timestamptz '2026-09-14 23:59-03' as fim
-- ),
-- aberturas as (
--   select a.player_id,
--          (a.detail->>'twa') = 'true' as pela_play,
--          (a.created_at at time zone 'America/Sao_Paulo')::date as dia
--     from public.activity_log a, janela j
--    where a.action = 'app_open' and a.created_at between j.ini and j.fim
-- ),
-- por_pessoa as (
--   select player_id, count(distinct dia) filter (where pela_play) as dias_play
--     from aberturas group by player_id
-- )
-- select count(*)                                   as pessoas_que_abriram,
--        count(*) filter (where dias_play >= 1)     as pessoas_vistas_pela_play,
--        count(*) filter (where dias_play >= 3)     as pessoas_com_3_dias_ou_mais_na_play,
--        round(avg(dias_play), 1)                   as media_de_dias_na_play
--   from por_pessoa;
