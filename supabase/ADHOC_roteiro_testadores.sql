-- Acompanhamento do ROTEIRO DO TESTADOR pelo activity_log.
--
-- Cada passo do roteiro deixa um evento próprio na tabela public.activity_log
-- (telemetria temporária do piloto — ver js/services/activity-log.js):
--
--   passo 1  abrir "Jogadores"        -> action='tab'                detail->>'tab'='players'
--   passo 2  marcar mensalidade       -> action='payment_toggled'    detail->>'paid'
--   passo 3  cadastrar jogador teste  -> action='player_added'
--   passo 4  confirmar presença       -> action='presence_confirmed'
--   passo 5  abrir o jogo ("Ver jogo")-> action='tab'                detail->>'tab'='weekly_game'
--   passo 6  sortear times            -> action='team_draw'
--   passo 7  sortear de novo          -> action='team_draw' (2ª vez)
--   passo 8  excluir jogador teste    -> action='player_deleted'
--
-- A tabela não tem policy de SELECT: estas queries só rodam no SQL Editor /
-- service_role. Rodar no projeto convocados-prod (nwsnakzttmvuyejbfzom).

-- ------------------------------------------------- 1) checklist por testador
with ev as (
  select player_id, name, action, detail, created_at
    from public.activity_log
   where created_at >= now() - interval '30 days'
),
p as (
  select player_id,
         max(name)                                                             as nome,
         count(*) filter (where action = 'tab' and detail->>'tab' = 'players')      as n1,
         count(*) filter (where action = 'payment_toggled')                         as n2,
         count(*) filter (where action = 'player_added')                            as n3,
         count(*) filter (where action = 'presence_confirmed')                      as n4,
         count(*) filter (where action = 'tab' and detail->>'tab' = 'weekly_game')  as n5,
         count(*) filter (where action = 'team_draw')                               as n67,
         count(*) filter (where action = 'player_deleted')                          as n8,
         max(created_at)                                                            as ultima_atividade,
         max(detail->>'v') filter (where action = 'app_open')                       as versao
    from ev
   group by player_id
)
select nome,
       case when n1  > 0 then '✓' else '·' end as "1 jogadores",
       case when n2  > 0 then '✓' else '·' end as "2 mensalidade",
       case when n3  > 0 then '✓' else '·' end as "3 cadastrou",
       case when n4  > 0 then '✓' else '·' end as "4 presença",
       case when n5  > 0 then '✓' else '·' end as "5 abriu jogo",
       case when n67 > 0 then '✓' else '·' end as "6 sorteou",
       case when n67 > 1 then '✓' else '·' end as "7 sorteou 2x",
       case when n8  > 0 then '✓' else '·' end as "8 limpou",
       (n1>0)::int + (n2>0)::int + (n3>0)::int + (n4>0)::int
         + (n5>0)::int + (n67>0)::int + (n67>1)::int + (n8>0)::int as "passos_de_8",
       versao,
       to_char(ultima_atividade at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as ultima_atividade
  from p
 order by "passos_de_8" desc, nome;

-- ------------------------------------------- 2) linha do tempo de um testador
-- Troque o nome. Serve para ver ONDE a pessoa parou (e quanto tempo levou).
select to_char(created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as quando,
       action,
       detail
  from public.activity_log
 where name ilike '%Paulo Henrique%'
   and created_at >= now() - interval '30 days'
 order by created_at;

-- --------------------------------------------------- 3) quem ainda não entrou
-- Testador que tem login criado mas nunca apareceu no log.
select p.data->>'name' as nome, p.is_admin, p.data->>'phone' as telefone
  from public.players p
 where p.auth_user_id is not null
   and not exists (
         select 1 from public.activity_log a
          where a.player_id = p.id
            and a.created_at >= now() - interval '30 days')
 order by 1;

-- ------------------------------------------------ 4) resumo do dia (por ação)
select date_trunc('day', created_at at time zone 'America/Sao_Paulo')::date as dia,
       action,
       count(*)                     as eventos,
       count(distinct player_id)    as pessoas
  from public.activity_log
 where created_at >= now() - interval '14 days'
 group by 1, 2
 order by 1 desc, 3 desc;
