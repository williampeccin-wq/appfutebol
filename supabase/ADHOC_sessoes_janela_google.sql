-- QUANTO TEMPO O TESTE DUROU, NA JANELA QUE O GOOGLE OLHOU
--
-- Complemento de ADHOC_engajamento_visivel_google.sql. Aquela consulta mostrou
-- que o uso está no lugar certo (dentro do app da Play) mas espalhado por poucos
-- dias: 14 testadores, mediana de 3 dias cada em 13 dias de janela.
--
-- Falta a outra metade da pergunta: cada abertura foi uma sessão de verdade ou
-- um abre-e-fecha? É o que separa "houve teste" de "12 contas com uma sessão
-- curta cada", que é a assinatura que o Google reprova.
--
-- Fonte: activity_log, action='session', do medidor (tester-meter.js, ativo
-- desde 01/09 e só no clube de teste). O detail traz:
--   secs  = segundos COM O APP EM FOCO no trecho (aba aberta em segundo plano
--           não conta)
--   acoes = toques/teclas de verdade (scroll não conta)
--   meta  = o trecho já passou dos 4 minutos
--
-- Janela fixa: 02/09 a 14/09/2026 — de quando o flag `twa` passou a existir até
-- o dia do pedido de produção. Mesma janela da outra consulta, para os dois
-- resultados poderem ser lidos lado a lado.

with janela as (
  select timestamptz '2026-09-02 00:00-03' as ini,
         timestamptz '2026-09-14 23:59-03' as fim
),
trechos as (
  select a.player_id,
         (a.detail->>'secs')::int                              as secs,
         coalesce((a.detail->>'acoes')::int, 0)                 as acoes,
         (a.created_at at time zone 'America/Sao_Paulo')::date  as dia
    from public.activity_log a, janela j
   where a.action = 'session'
     and a.created_at between j.ini and j.fim
),
por_pessoa as (
  select player_id,
         count(distinct dia)                                     as dias,
         count(*)                                                as trechos,
         sum(secs)                                               as segs_total,
         max(secs)                                               as maior_trecho,
         percentile_cont(0.5) within group (order by secs)::int   as mediana_trecho,
         sum(acoes)                                              as acoes
    from trechos
   group by player_id
)
select coalesce(p.data->>'name','(sem nome)')                     as nome,
       x.dias,
       to_char((x.segs_total || ' seconds')::interval,'MI:SS')     as tempo_total,
       to_char((x.segs_total / greatest(x.dias,1) || ' seconds')::interval,'MI:SS') as tempo_por_dia,
       to_char((x.maior_trecho || ' seconds')::interval,'MI:SS')   as maior_sessao,
       to_char((x.mediana_trecho || ' seconds')::interval,'MI:SS') as sessao_mediana,
       x.acoes,
       -- Muitos segundos com poucas ações = app aberto e abandonado na tela.
       case when x.acoes = 0 then null
            else round(x.segs_total::numeric / x.acoes, 1) end     as segs_por_acao
  from public.players p
  join por_pessoa x on x.player_id = p.id
 where p.club_id = 'e2af269c-20d0-4739-b7db-80ed93165192'
   and coalesce((p.data->>'deleted')::boolean,false) is not true
   and p.data->>'name' not ilike '%(apagar)%'
 order by x.segs_total desc nulls last;

-- --------------------------------------------------------------- o resumo
-- Os três números que respondem à pergunta. Rode separado.
--
-- with janela as (
--   select timestamptz '2026-09-02 00:00-03' as ini,
--          timestamptz '2026-09-14 23:59-03' as fim
-- ),
-- trechos as (
--   select a.player_id, (a.detail->>'secs')::int as secs
--     from public.activity_log a, janela j
--    where a.action = 'session' and a.created_at between j.ini and j.fim
-- ),
-- por_pessoa as (
--   select player_id, sum(secs) as segs from trechos group by player_id
-- )
-- select count(*)                                              as testadores_medidos,
--        to_char((percentile_cont(0.5) within group (order by segs)::int
--                 || ' seconds')::interval,'MI:SS')            as mediana_de_tempo_total,
--        count(*) filter (where segs >= 240)                   as com_4_min_ou_mais,
--        count(*) filter (where segs <  60)                    as abaixo_de_1_min
--   from por_pessoa;
