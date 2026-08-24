-- Consultas de apoio do roteiro do testador. RODE UMA DE CADA VEZ: o SQL Editor
-- só mostra o resultado da última instrução do arquivo (selecione a query com o
-- mouse e aperte Run). O checklist principal está em ADHOC_roteiro_testadores.sql.

-- ------------------------------------------- 1) linha do tempo de um testador
-- Troque o nome. Serve para ver ONDE a pessoa parou e quanto tempo levou.
select to_char(a.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as quando,
       coalesce(p.data->>'name', a.name) as nome,
       a.action,
       a.detail
  from public.activity_log a
  left join public.players p on p.id = a.player_id
 where coalesce(p.data->>'name', a.name) ilike '%Paulo Henrique%'
   and a.created_at >= now() - interval '30 days'
 order by a.created_at;

-- --------------------------------------------------- 2) quem ainda não entrou
select p.data->>'name' as nome, p.is_admin, p.data->>'phone' as telefone
  from public.players p
 where p.auth_user_id is not null
   and not exists (
         select 1 from public.activity_log a
          where a.player_id = p.id
            and a.created_at >= now() - interval '30 days')
 order by 1;

-- ------------------------------------------------ 3) resumo do dia (por ação)
select date_trunc('day', created_at at time zone 'America/Sao_Paulo')::date as dia,
       action,
       count(*)                  as eventos,
       count(distinct player_id) as pessoas
  from public.activity_log
 where created_at >= now() - interval '14 days'
 group by 1, 2
 order by 1 desc, 3 desc;

-- ------------------------------------- 4) jogadores excluídos (passo 8 do log)
select p.data->>'name'                                as jogador_excluido,
       quem.data->>'name'                             as excluido_por,
       to_char((p.data->>'deleted_at')::timestamptz at time zone 'America/Sao_Paulo',
               'DD/MM HH24:MI')                       as quando
  from public.players p
  left join public.players quem
         on quem.auth_user_id = p.data->>'deleted_by_auth_user_id'
 where coalesce((p.data->>'deleted')::boolean, false) is true
 order by (p.data->>'deleted_at')::timestamptz desc;
