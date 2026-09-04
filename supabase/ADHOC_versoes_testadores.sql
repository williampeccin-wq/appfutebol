-- QUEM JÁ ESTÁ NO PACOTE NOVO DA PLAY — e quem ficou para trás.
--
-- O campo `av` é gravado a cada `app_open` desde 02/09/2026, via
-- navigator.getInstalledRelatedApps(). Ele traz o versionName do APP ANDROID
-- instalado — não confundir com `v`, que é a versão do conteúdo web (PWA).
--
--   2.0.2.0 = versionCode 4  (lançado 01/09)  ← o atual
--   2.0.1.0 = versionCode 3  (lançado 14/08)
--
-- ⚠️ LIMITE: só sabemos a versão de quem ABRIU o app. Quem tem instalado e não
-- abre é invisível aqui — para o número agregado de toda a base, o lugar é
-- Estatísticas no Play Console, quebrando por "Versão do app".
--
-- ⚠️ A Play instala em segundo plano, mas o Android só troca o app quando ele
-- NÃO está em execução. Quem deixa o app parado nos aplicativos recentes segue
-- no pacote velho. Por isso o pedido aos testadores é: atualizar, FECHAR pelos
-- recentes, e abrir de novo.

-- ------------------------------------------------------------ placar do dia
select coalesce(pacote, '(nunca abriu desde 02/09)') as pacote_android,
       count(*)                                       as pessoas
  from (
    select p.id,
           (array_agg(a.detail->>'av' order by a.created_at desc)
              filter (where a.detail->>'av' is not null))[1] as pacote
      from public.players p
      left join public.activity_log a
             on a.player_id = p.id and a.action = 'app_open'
            and a.created_at >= now() - interval '14 days'
     where p.club_id = 'e2af269c-20d0-4739-b7db-80ed93165192'
       and p.auth_user_id is not null
       and coalesce((p.data->>'deleted')::boolean,false) is not true
     group by p.id
  ) t
 group by 1 order by 2 desc;

-- ------------------------------------------------------- detalhe por pessoa
-- Rode separado. Ordena os desatualizados primeiro — é quem você cobra.
-- select coalesce(p.data->>'name','?') as nome,
--        (array_agg(a.detail->>'av'  order by a.created_at desc)
--           filter (where a.detail->>'av' is not null))[1]  as pacote_android,
--        (array_agg(a.detail->>'twa' order by a.created_at desc))[1] as pela_play,
--        (array_agg(a.detail->>'v'   order by a.created_at desc))[1] as pwa,
--        count(a.id)                                                 as aberturas,
--        to_char(max(a.created_at) at time zone 'America/Sao_Paulo','DD/MM HH24:MI') as ultima
--   from public.players p
--   left join public.activity_log a
--          on a.player_id = p.id and a.action = 'app_open'
--         and a.created_at >= now() - interval '14 days'
--  where p.club_id = 'e2af269c-20d0-4739-b7db-80ed93165192'
--    and p.auth_user_id is not null
--    and coalesce((p.data->>'deleted')::boolean,false) is not true
--    and p.data->>'name' not ilike '%(apagar)%'
--  group by p.id, p.data->>'name'
--  order by 2 nulls first, 6 desc nulls last;
