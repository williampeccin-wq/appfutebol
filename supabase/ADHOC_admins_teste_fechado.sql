-- AD-HOC (teste fechado) — promover TODO o clube a administrador.
--
-- Por que não dá para fazer isso pelo app: promover é UPDATE direto em players,
-- e o trigger trg_harmonia_free_single_admin (20260712100000) recusa a promoção
-- com `free_single_admin` quando o clube não é 'pro' e já existe outro admin.
-- O app ainda não mostrava essa recusa — dizia "Jogador atualizado com sucesso".
--
-- Rodar no SQL Editor do projeto convocados-prod (nwsnakzttmvuyejbfzom).
-- Passo 0 primeiro, para pegar o club_id; depois o passo 1 com o id no lugar.

-- ---------------------------------------------------------------- passo 0
select id, name, plan, created_at
  from public.clubs
 order by created_at;

-- ---------------------------------------------------------------- passo 1
begin;

-- Age como service_role para os DOIS triggers de guarda de privilégio
-- (harmonia_guard_player_update e prevent_non_admin_player_privilege_changes).
-- SEM esta linha o UPDATE não falha: ele é silenciosamente REVERTIDO linha a
-- linha (o trigger repõe NEW.is_admin := OLD.is_admin) e parece que funcionou.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Gate de multi-admin: só clube 'pro' pode ter mais de um administrador.
update public.clubs
   set plan = 'pro'
 where id = 'COLE_O_CLUB_ID_AQUI';

-- Promove todo mundo do clube. O updated_at é de propósito: é ele que o
-- heartbeat dos celulares observa para disparar a releitura — sem isso os
-- aparelhos só veriam a mudança no próximo reload.
update public.players
   set is_admin = true,
       updated_at = now()
 where club_id = 'COLE_O_CLUB_ID_AQUI'
   and is_admin is distinct from true;

commit;

-- ---------------------------------------------------------------- conferência
select data->>'name' as nome,
       is_admin,
       (auth_user_id is not null) as tem_login
  from public.players
 where club_id = 'COLE_O_CLUB_ID_AQUI'
 order by 1;

-- ---------------------------------------------------------------- desfazer
-- begin;
-- select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- update public.players set is_admin = false, updated_at = now()
--  where club_id = 'COLE_O_CLUB_ID_AQUI' and id <> 'ID_DO_DONO';
-- update public.clubs set plan = 'free' where id = 'COLE_O_CLUB_ID_AQUI';
-- commit;
