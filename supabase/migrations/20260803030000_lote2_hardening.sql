-- Lote 2 — hardening. Muda produção, mas BAIXO risco. Aplicar deliberadamente
-- (idealmente com o banco calmo). Testar leitura/escrita de admin e não-admin
-- logo depois.
--
-- ⚠️ Se aplicar no SQL Editor manualmente, rode o arquivo inteiro de uma vez
-- (é envolto por transação pelo supabase db push; no editor, use begin/commit).

-- ── L2: revogar GRANT ALL de `anon` nas tabelas de finanças ──────────────────
-- As migrations 20260717000000/100000 deram `grant all ... to anon` (provável
-- copy-paste). NÃO é explorável hoje (as policies de finance são todas
-- {authenticated}, e a RLS barra anon sem policy permissiva), mas o grant não
-- deveria existir — se um dia alguém adicionar policy anon ou desligar RLS, ele
-- vira acesso real. Revogar é defesa em profundidade e não afeta o caminho
-- {authenticated} (que tem os próprios grants). REVOKE de privilégio inexistente
-- é no-op silencioso — seguro rodar.
revoke all on table public.finance_entries from anon;
revoke all on table public.finance_public  from anon;

-- ── Tabelas legadas MORTAS (0 linhas, sem tenant_isolation, fora de migrations) ─
-- `confirmations` e `app_state` são resquício do dump 21/07. O app usa
-- presence_confirmations + app_meta/game_state; nenhum caminho de código
-- lê/grava estas duas (verificado 03/08). Sem isolamento por clube, seriam
-- landmine de vazamento se um dia recebessem dados. Removê-las elimina o risco.
-- (O campo vestigial `stateTable: 'app_state'` na config do cliente é inofensivo
-- — só aparece em debug/metadata, nenhuma query o usa; pode ser limpo depois.)
drop table if exists public.confirmations;
drop table if exists public.app_state;
