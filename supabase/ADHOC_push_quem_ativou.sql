-- QUEM ATIVOU AS NOTIFICAÇÕES — e, principalmente, quem tentou e não conseguiu.
--
-- Duas fontes, porque uma só não conta a história inteira:
--   • public.push_subscriptions → a VERDADE de quem tem inscrição ativa. Existe
--     desde sempre; não precisou de código novo. Uma linha por APARELHO.
--   • activity_log (push_enabled / push_denied / push_disabled) → instrumentado
--     em 01/09/2026. Só pega quem tocou no botão A PARTIR dessa data. Serve para
--     ver quem RECUSOU ou DESLIGOU, coisa que a tabela de inscrições não guarda.
--
-- Leia assim: "✅ ativou" é fato do banco. "⚠️ recusou" e "🔕 desligou" só
-- aparecem para quem mexeu no botão depois de 01/09. "— nunca pediu" é ambíguo:
-- pode ser quem nunca tentou OU quem tentou antes da instrumentação.

with tester as (
  select id, coalesce(data->>'name','(sem nome)') as nome, data->>'phone' as telefone
    from public.players
   where club_id = 'e2af269c-20d0-4739-b7db-80ed93165192'
     and auth_user_id is not null
     and coalesce((data->>'deleted')::boolean,false) is not true
     and data->>'name' not ilike '%(apagar)%'
),
subs as (
  select player_id,
         count(*)                                as aparelhos,
         min(created_at)                          as ativou_em,
         -- Só interessa separar celular de computador: um testador que ativou no
         -- desktop não recebe o push no aparelho onde o app está instalado.
         string_agg(distinct case
           when user_agent ilike '%android%'   then 'Android'
           when user_agent ilike '%iphone%'
             or user_agent ilike '%ipad%'      then 'iOS'
           when user_agent ilike '%windows%'
             or user_agent ilike '%macintosh%' then 'Computador'
           else 'outro' end, ', ')               as onde
    from public.push_subscriptions
   where club_id = 'e2af269c-20d0-4739-b7db-80ed93165192'
   group by player_id
),
tentativas as (
  select player_id,
         count(*) filter (where action = 'push_denied')   as recusou,
         count(*) filter (where action = 'push_disabled') as desligou,
         max(created_at) filter (where action = 'push_denied') as recusou_em,
         (array_agg(detail->>'reason' order by created_at desc)
            filter (where action = 'push_denied'))[1]     as motivo
    from public.activity_log
   where action in ('push_enabled','push_denied','push_disabled')
   group by player_id
)
select
  t.nome,
  t.telefone,
  case
    when s.player_id is not null                      then '✅ ativou'
    when coalesce(x.desligou,0) > 0                   then '🔕 desligou depois'
    when coalesce(x.recusou,0) > 0                    then '⚠️ tentou e recusou'
    else                                                   '— nunca pediu'
  end                                                  as situacao,
  s.onde                                               as aparelho,
  s.aparelhos,
  to_char(s.ativou_em at time zone 'America/Sao_Paulo','DD/MM HH24:MI')  as ativou_em,
  -- denied = negou na caixa do sistema · dismissed = fechou sem responder
  -- ios_needs_install = iPhone sem o app instalado · unsupported = navegador velho
  x.motivo                                             as motivo_da_recusa,
  to_char(x.recusou_em at time zone 'America/Sao_Paulo','DD/MM HH24:MI') as recusou_em
from tester t
left join subs       s on s.player_id = t.id
left join tentativas x on x.player_id = t.id
order by (s.player_id is not null) desc,   -- quem ativou primeiro
         coalesce(x.recusou,0) desc,       -- depois quem recusou (é quem cobrar)
         t.nome;

-- ---------------------------------------------------------------- placar seco
-- Rode sozinha quando quiser só o número do dia.
-- select count(*) filter (where s.player_id is not null) as com_push,
--        count(*)                                        as testadores
--   from public.players t
--   left join public.push_subscriptions s on s.player_id = t.id
--  where t.club_id = 'e2af269c-20d0-4739-b7db-80ed93165192'
--    and t.auth_user_id is not null;
