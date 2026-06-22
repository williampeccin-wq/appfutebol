-- Segurança (#2 da auditoria jun/26): amarra cada inscrição de push ao seu dono
-- (auth.uid()), para um membro logado não poder APAGAR/REATRIBUIR a inscrição de
-- outro (as policies eram using(true) em UPDATE/DELETE → DoS de notificações:
-- silenciar avisos de outro, ou desviar o push pro dispositivo errado).

-- Dono da inscrição = usuário autenticado que a criou. Default carimba auth.uid()
-- no INSERT, então o cliente não precisa (nem consegue forjar) enviar esse campo.
alter table public.push_subscriptions
  add column if not exists auth_user_id text default (auth.uid())::text;

-- Backfill dos registros existentes: dono = auth_user_id do jogador (via player_id).
-- Linhas sem player_id/sem match ficam null (ninguém as altera; o envio por
-- service_role ainda as lê e remove sozinho quando expiram).
update public.push_subscriptions s
   set auth_user_id = p.auth_user_id
  from public.players p
 where s.auth_user_id is null
   and s.player_id is not null
   and p.id = s.player_id
   and p.auth_user_id is not null;

-- INSERT: só com a inscrição marcada como sua (o default garante isso).
drop policy if exists "push_insert_authenticated" on public.push_subscriptions;
create policy "push_insert_authenticated"
  on public.push_subscriptions for insert to authenticated
  with check (auth_user_id = (auth.uid())::text);

-- UPDATE: só a própria inscrição.
drop policy if exists "push_update_authenticated" on public.push_subscriptions;
create policy "push_update_authenticated"
  on public.push_subscriptions for update to authenticated
  using (auth_user_id = (auth.uid())::text)
  with check (auth_user_id = (auth.uid())::text);

-- DELETE: só a própria inscrição.
drop policy if exists "push_delete_authenticated" on public.push_subscriptions;
create policy "push_delete_authenticated"
  on public.push_subscriptions for delete to authenticated
  using (auth_user_id = (auth.uid())::text);
