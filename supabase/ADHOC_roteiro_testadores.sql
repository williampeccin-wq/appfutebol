-- CHECKLIST DO ROTEIRO DO TESTADOR — UMA query só, tudo numa tabela.
--
-- Cole no SQL Editor e aperte Run. É uma instrução única de propósito: o editor
-- mostra apenas o resultado da ÚLTIMA instrução do arquivo, então um arquivo com
-- várias queries só exibe a última.
--
-- Uma linha por testador com login. Quem nunca abriu o app também aparece (com
-- tudo em '·'), que é justamente o que você quer enxergar.
--
-- Passo -> rastro (public.activity_log, telemetria do piloto):
--   1 abrir "Jogadores"       action='tab'   detail->>'tab'='players'
--   2 marcar mensalidade      action='payment_toggled'
--   3 cadastrar jogador       action='player_added'
--   4 confirmar presença      action='presence_confirmed'
--   5 abrir o jogo            action='tab'   detail->>'tab'='weekly_game'
--   6 sortear times           action='team_draw'
--   7 sortear de novo         action='team_draw' (2ª vez)
--   8 excluir o jogador teste  -> vem da tabela players (data.deleted_by_auth_user_id),
--      não do log: assim o passo conta mesmo se o app engasgar no aviso de tela.
--
-- A coluna `onde_parou` diz o próximo passo pendente de cada pessoa.

with testadores as (
  select id, auth_user_id,
         coalesce(data->>'name', '(sem nome)') as nome,
         is_admin
    from public.players
   where auth_user_id is not null
     and coalesce((data->>'deleted')::boolean, false) is not true
),
ev as (
  select player_id, action, detail, created_at
    from public.activity_log
   where created_at >= now() - interval '30 days'
),
excluiu as (
  select data->>'deleted_by_auth_user_id' as auth_user_id, count(*) as n8
    from public.players
   where coalesce((data->>'deleted')::boolean, false) is true
     and (data->>'deleted_at')::timestamptz >= now() - interval '30 days'
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
         count(distinct (e.created_at at time zone 'America/Sao_Paulo')::date)         as dias_ativos,
         min(e.created_at)                                                             as primeiro_acesso,
         max(e.created_at)                                                             as ultima_atividade,
         max(e.detail->>'v') filter (where e.action = 'app_open')                      as versao
    from testadores t
    left join ev e      on e.player_id = t.id
    left join excluiu x on x.auth_user_id = t.auth_user_id
   group by t.id, t.nome, t.is_admin
)
select nome,
       case when is_admin then 'admin' else 'jogador' end as perfil,
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
       case when n1  = 0 then '1 abrir Jogadores'
            when n2  = 0 then '2 marcar mensalidade'
            when n3  = 0 then '3 cadastrar jogador'
            when n4  = 0 then '4 confirmar presença'
            when n5  = 0 then '5 abrir o jogo'
            when n67 = 0 then '6 sortear times'
            when n67 < 2 then '7 sortear de novo'
            when n8  = 0 then '8 excluir o teste'
            else 'concluiu' end                                    as onde_parou,
       eventos,
       dias_ativos,
       versao,
       to_char(primeiro_acesso  at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as primeiro_acesso,
       to_char(ultima_atividade at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as ultima_atividade
  from agg
 -- agg.ultima_atividade (qualificado) = o timestamp cru; sem a qualificação o
 -- ORDER BY pegaria a coluna de saída já formatada em texto e ordenaria errado.
 order by passos_de_8 desc, agg.ultima_atividade desc nulls last, nome;
