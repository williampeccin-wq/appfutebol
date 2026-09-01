-- QUANTO TEMPO CADA TESTADOR REALMENTE USOU O APP.
--
-- Fonte: activity_log, action = 'session', gravado pelo medidor (tester-meter.js,
-- ativo desde 01/09/2026 e só no clube de teste). O detail traz:
--   secs  = segundos COM O APP EM FOCO desde o último registro (não aba aberta)
--   total = acumulado da sessão até ali
--   acoes = toques/teclas de verdade (scroll não conta)
--   meta  = já tinha passado dos 4 minutos
--
-- É isto que separa quem usou de quem abriu e fechou — independentemente do que
-- a pessoa diga no grupo.

with s as (
  select a.player_id,
         (a.detail->>'secs')::int                     as secs,
         (a.detail->>'acoes')::int                    as acoes,
         coalesce((a.detail->>'meta')::boolean,false)  as bateu_meta,
         a.created_at
    from public.activity_log a
   where a.action = 'session'
     and a.created_at >= now() - interval '14 days'
),
por_pessoa as (
  select player_id,
         count(*)                    as trechos,
         sum(secs)                   as segs_total,
         max(secs)                   as maior_trecho,
         percentile_cont(0.5) within group (order by secs)::int as mediana,
         sum(acoes)                  as acoes,
         bool_or(bateu_meta)         as ja_bateu_meta,
         max(created_at)             as ultima
    from s group by player_id
)
select
  coalesce(p.data->>'name','(sem nome)')                as nome,
  case
    when x.segs_total is null      then '— sem registro'
    when x.segs_total <  60        then '🔴 menos de 1 min no total'
    when not x.ja_bateu_meta       then '🟡 usou, mas nunca bateu 4 min'
    else                                '🟢 bateu a meta'
  end                                                    as situacao,
  -- Tempo total em foco, em minutos e segundos.
  to_char((x.segs_total || ' seconds')::interval,'MI:SS') as tempo_total,
  to_char((x.maior_trecho || ' seconds')::interval,'MI:SS') as maior_sessao,
  to_char((x.mediana || ' seconds')::interval,'MI:SS')    as sessao_mediana,
  x.trechos,
  x.acoes,
  -- Um número alto de segundos com poucas ações = app aberto e abandonado.
  case when coalesce(x.acoes,0) = 0 then null
       else round(x.segs_total::numeric / x.acoes, 1) end as segs_por_acao,
  to_char(x.ultima at time zone 'America/Sao_Paulo','DD/MM HH24:MI') as ultima_sessao
from public.players p
left join por_pessoa x on x.player_id = p.id
where p.club_id = 'e2af269c-20d0-4739-b7db-80ed93165192'
  and p.auth_user_id is not null
  and coalesce((p.data->>'deleted')::boolean,false) is not true
  and p.data->>'name' not ilike '%(apagar)%'
order by x.segs_total desc nulls last, nome;
