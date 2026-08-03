-- H2 (versionamento) — Fase 1, passo seguro e idempotente.
--
-- CONTEXTO: a auditoria 30/07 apontou que funções/policies de segurança são
-- REFERENCIADAS mas nunca DEFINIDAS em migrations/. Verificação 03/08 refinou:
-- a maioria ESTÁ versionada (multitenant_p1..p7, guard_player_pending,
-- finance_public), MAS a função `harmonia_is_own_player_id(text)` ficou órfã —
-- não é definida em NENHUMA migration, apesar de ser usada pelas policies
-- permissivas de presence_confirmations e confirmations (harmonia_presence_*,
-- harmonia_confirmations_*). Ela existe só na prod (legado do dump 21/07).
--
-- EFEITO na prod (convocados-prod): NENHUM. É CREATE OR REPLACE com o corpo
-- idêntico ao que já está em produção — no-op. O objetivo é só trazer a função
-- para o controle de versão, para que um ambiente novo (dev/staging) recriado a
-- partir do repo tenha a função e as policies que dependem dela não quebrem.
--
-- As demais lacunas (recriar as permissivas harmonia_presence_*/confirmations_*
-- que também estão só na prod, dropar tabelas mortas, deduplicar as policies da
-- geração antiga) MUDAM produção e estão documentadas em docs/rls-audit-2026-08.md
-- para uma sessão revisada FORA da janela de teste fechado.

create or replace function public.harmonia_is_own_player_id(target_player_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.players p
    where p.id = target_player_id
      and p.auth_user_id = auth.uid()::text
  );
$$;

-- Convenção das demais funções SECURITY DEFINER de segurança (ver p2_rls):
-- sem execução para `public`; só authenticated + service_role.
revoke all on function public.harmonia_is_own_player_id(text) from public;
grant execute on function public.harmonia_is_own_player_id(text) to authenticated, service_role;
