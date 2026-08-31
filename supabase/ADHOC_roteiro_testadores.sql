-- QUEM FEZ E QUEM NÃO FEZ O ROTEIRO — uma query só, a rodada inteira.
--
-- Cole no SQL Editor e aperte Run. É uma instrução única de propósito: o editor
-- mostra apenas o resultado da ÚLTIMA instrução do arquivo.
--
-- Uma linha por testador com login. Quem não fez nada na janela aparece com
-- tudo em '·' — é justamente quem você precisa cobrar.
--
-- A janela padrão é de 7 DIAS: um ✓ quer dizer "fez em algum momento da rodada",
-- não "fez hoje". A coluna `quando` mostra quando a pessoa mexeu pela última vez.
--
-- ATENÇÃO ao ler os passos 2 e 3: até a v1.180.0 eles NUNCA eram gravados (bug de
-- escopo no cliente, corrigido em 24/08/2026). Quem rodou o roteiro em versão
-- anterior aparece sem eles mesmo tendo feito — o dado não existe no banco.

with janela as (
  -- ⬇⬇⬇ A ÚNICA LINHA PARA EDITAR: a partir de QUANDO contar. ⬇⬇⬇
  select now() - interval '7 days' as inicio                 -- a rodada inteira do teste

  -- Outras janelas — troque a linha acima por UMA destas:
  --   select now() - interval '24 hours'                    as inicio   -- últimas 24 horas
  --   select now() - interval '48 hours'                    as inicio   -- hoje e ontem
  --   select date_trunc('day', now() at time zone 'America/Sao_Paulo')
  --          at time zone 'America/Sao_Paulo'               as inicio   -- só hoje, desde 00:00
  --   select timestamptz '2026-08-25 19:00-03'              as inicio   -- desde um horário exato
  --   select now() - interval '30 days'                     as inicio   -- histórico do piloto
),
testadores as (
  select id, auth_user_id,
         coalesce(data->>'name', '(sem nome)') as nome,
         is_admin
    from public.players
   where auth_user_id is not null
     and coalesce((data->>'deleted')::boolean, false) is not true
),
ev as (
  select a.player_id, a.action, a.detail, a.created_at
    from public.activity_log a, janela j
   where a.created_at >= j.inicio
),
excluiu as (
  select p.data->>'deleted_by_auth_user_id' as auth_user_id, count(*) as n8
    from public.players p, janela j
   where coalesce((p.data->>'deleted')::boolean, false) is true
     and (p.data->>'deleted_at')::timestamptz >= j.inicio
   group by 1
),
agg as (
  select t.nome,
         t.is_admin,
         count(*) filter (where e.action = 'tab' and e.detail->>'tab' = 'players')     as n1,
         count(*) filter (where e.action = 'payment_toggled')                          as n2,
         count(*) filter (where e.action = 'player_added')                             as n3,
         count(*) filter (where e.action = 'presence_confirmed')                       as n4,
         count(*) filter (where e.action = 'tab' and e.detail->>'tab' = 'weekly_game') as n5,
         count(*) filter (where e.action = 'team_draw')                                as n67,
         coalesce(max(x.n8), 0)                                                        as n8,
         count(e.created_at)                                                           as eventos,
         max(e.created_at)                                                             as ultima_atividade,
         max(e.detail->>'v') filter (where e.action = 'app_open')                       as versao
    from testadores t
    left join ev e      on e.player_id = t.id
    left join excluiu x on x.auth_user_id = t.auth_user_id
   group by t.id, t.nome, t.is_admin
)
select nome,
       case when is_admin then 'admin' else 'jogador' end as perfil,
       case when eventos = 0 then '✗ nem abriu o app'
            when n1  = 0 then 'parou antes de 1 · abrir Jogadores'
            when n2  = 0 then 'parou em 2 · marcar mensalidade'
            when n3  = 0 then 'parou em 3 · cadastrar jogador'
            when n4  = 0 then 'parou em 4 · confirmar presença'
            when n5  = 0 then 'parou em 5 · abrir o jogo'
            when n67 = 0 then 'parou em 6 · sortear times'
            when n67 < 2 then 'parou em 7 · sortear de novo'
            when n8  = 0 then 'parou em 8 · excluir o teste'
            else '✓ CONCLUIU' end                          as situacao,
       case when n1  > 0 then '✓' else '·' end as "1 jogadores",
       case when n2  > 0 then '✓' else '·' end as "2 mensalidade",
       case when n3  > 0 then '✓' else '·' end as "3 cadastrou",
       case when n4  > 0 then '✓' else '·' end as "4 presença",
       case when n5  > 0 then '✓' else '·' end as "5 abriu jogo",
       case when n67 > 0 then '✓' else '·' end as "6 sorteou",
       case when n67 > 1 then '✓' else '·' end as "7 sorteou 2x",
       case when n8  > 0 then '✓' else '·' end as "8 limpou",
       (n1>0)::int + (n2>0)::int + (n3>0)::int + (n4>0)::int
         + (n5>0)::int + (n67>0)::int + (n67>1)::int + (n8>0)::int as passos_de_8,
       -- Quando foi a última vez que a pessoa mexeu no app. Com a janela larga,
       -- é isto que separa quem fez agora de quem fez ontem.
       case when ultima_atividade is null then '—'
            when (ultima_atividade at time zone 'America/Sao_Paulo')::date
                 = (now() at time zone 'America/Sao_Paulo')::date         then 'hoje'
            when (ultima_atividade at time zone 'America/Sao_Paulo')::date
                 = (now() at time zone 'America/Sao_Paulo')::date - 1     then 'ontem'
            else to_char(ultima_atividade at time zone 'America/Sao_Paulo', 'DD/MM')
       end                                                                as quando,
       versao,
       to_char(ultima_atividade at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as ultima_atividade
  from agg
 -- agg.ultima_atividade (qualificado) = o timestamp cru; sem a qualificação o
 -- ORDER BY pegaria a coluna de saída já formatada em texto e ordenaria errado.
 order by passos_de_8 desc, agg.ultima_atividade desc nulls last, nome;
