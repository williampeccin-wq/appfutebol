-- H2 (versionamento) — Fase 1, passo 2: versiona as PERMISSIVAS de presença.
--
-- As policies permissivas harmonia_presence_* (read/insert/update/delete) vivem
-- só na prod (legado do dump 21/07). A migration multitenant_p2_rls só criou a
-- camada RESTRICTIVE tenant_isolation_presence. Sem estas permissivas, um banco
-- recriado do repo teria presence_confirmations SÓ com a RESTRICTIVE e NENHUMA
-- permissiva -> escrita 100% travada (nada permitido). Estas policies são o que
-- de fato AUTORIZA a gravação de presença (admin ou o próprio jogador).
--
-- EFEITO na prod: NENHUM. As policies já existem idênticas; o DROP IF EXISTS +
-- CREATE reescreve com a mesma definição. Depende de harmonia_is_own_player_id
-- (versionada em 20260803000000).
--
-- Se aplicar manualmente no SQL Editor (fora do supabase db push), envolva o
-- bloco em begin; ... commit; para manter o DROP+CREATE atômico.

drop policy if exists harmonia_presence_read_authenticated on public.presence_confirmations;
create policy harmonia_presence_read_authenticated on public.presence_confirmations
  for select to authenticated using (true);

drop policy if exists harmonia_presence_insert_admin_or_self on public.presence_confirmations;
create policy harmonia_presence_insert_admin_or_self on public.presence_confirmations
  for insert to authenticated
  with check (harmonia_is_admin() or harmonia_is_own_player_id(player_id));

drop policy if exists harmonia_presence_update_admin_or_self on public.presence_confirmations;
create policy harmonia_presence_update_admin_or_self on public.presence_confirmations
  for update to authenticated
  using      (harmonia_is_admin() or harmonia_is_own_player_id(player_id))
  with check (harmonia_is_admin() or harmonia_is_own_player_id(player_id));

drop policy if exists harmonia_presence_delete_admin_or_self on public.presence_confirmations;
create policy harmonia_presence_delete_admin_or_self on public.presence_confirmations
  for delete to authenticated
  using (harmonia_is_admin() or harmonia_is_own_player_id(player_id));
