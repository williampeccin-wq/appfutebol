-- Multi-tenant Fase 1 · PASSO 5b — cliente lê o próprio clube.
--
-- clubs estava com RLS ligada e SEM policy (secure-by-default do Passo 1). Agora
-- o cliente precisa ler name/invite_code/plan do PRÓPRIO clube (mostrar o código
-- de convite na área admin, nome do clube, futuramente o plano). Policy de leitura
-- escopada: só o(s) clube(s) do usuário logado. Escrita segue só via service_role.

drop policy if exists clubs_read_own on public.clubs;
create policy clubs_read_own on public.clubs
  for select to authenticated
  using (id = any (public.current_club_ids()));
