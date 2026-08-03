# Auditoria RLS / multi-tenant — convocados-prod (03/08/2026)

Raio-x completo do estado de RLS do banco `convocados-prod`, feito a partir de
introspecção read-only (`pg_policies`, `pg_get_functiondef`, `information_schema.triggers`,
`pg_class.relrowsecurity`). Objetivo: fechar o **H2** do backlog (Lote 2) — "o repo
não reproduz o banco" — com **precisão**, separando o que é versionamento seguro do
que muda produção.

> Regra de ouro desta fase: **nada de alterar RLS ao vivo às cegas** durante a janela
> de teste fechado (12 testadores × 14 dias). Um erro de policy volta a quebrar
> gravação (foi o que aconteceu com a presença em 03/08). As mudanças que tocam prod
> ficam abaixo, marcadas **[REVISAR — pós-janela]**.

## 1. Estado atual (verificado)

- **RLS LIGADO em todas as 14 tabelas** (`relrowsecurity = true`). `relforcerowsecurity = false`
  (normal: só o dono da tabela ignora RLS, não usuários de API).
- **Isolamento por clube** via policies RESTRICTIVE `tenant_isolation_*`
  (`club_id = ANY(current_club_ids())`, ou `key = ANY(...)` nos blobs) em: players,
  presence_confirmations, app_meta, game_state, finance_entries, finance_public,
  ratings, pix_receipts, push_log, push_subscriptions. **Funciona** (o 403 da presença
  em 03/08 provou que a camada está ativa).
- **Escalada de `is_admin`: BLOQUEADA hoje.** Defesa em triggers `BEFORE` em `players`:
  - `harmonia_guard_player_update` força `NEW.is_admin := OLD.is_admin` para não-admin
    (e trava `mens_ok`, `role`, `plays_football`, `in_carne_group`).
  - `prevent_non_admin_player_privilege_changes` rebloqueia `is_admin`, `auth_user_id`,
    `role`, `mens_ok`, `carne_group`.
  - `harmonia_guard_player_insert` impede auto-inserção como admin (exceto bootstrap do
    1º admin). `harmonia_guard_free_single_admin` aplica o teto de 1 admin no plano free.
  - Todos tratam `service_role` (bypass) corretamente e são `SECURITY DEFINER`.
  - **Severidade real do "só no trigger": BAIXA.** Dropar/desabilitar trigger exige
    privilégio de **dono da tabela**, que `anon`/`authenticated` NÃO têm via PostgREST.
    Não é explorável remotamente. É questão de **defesa em profundidade + versionamento**,
    não de buraco aberto. (A auditoria 30/07 marcou como ALTO; rebaixado para MÉDIO.)

## 2. O gap real do H2 (o repo NÃO reproduz um banco funcional)

A maioria das funções/policies ESTÁ versionada (multitenant_p1..p7, guard_player_pending,
finance_public). Mas ficaram **órfãs na prod** (legado do dump 21/07), fora de migrations:

| Item | Situação | Impacto se recriar do repo |
|---|---|---|
| Função `harmonia_is_own_player_id(text)` | Só na prod | Policies de presença/confirmação que a usam **falham ao criar** |
| Permissivas `harmonia_presence_*` (read/insert/update/delete admin_or_self) | Só na prod | `presence_confirmations` fica **só com a RESTRICTIVE → escrita 100% travada** |
| Geração ANTIGA de policies sem prefixo (`players_read_authenticated`, `players_insert_admin`, `players_update_self_or_admin`, `app_meta_write_admin`, `game_state_write_admin`, `app_state_*`, `confirmations_*`) | Só na prod | Duplicatas — ver §3 |
| Tabelas `confirmations` e `app_state` | Só na prod, **VAZIAS (0 linhas)** | Legado morto; sem `tenant_isolation` → landmine de vazamento |

**Corrigido nesta sessão (seguro/idempotente):** `migrations/20260803000000_version_harmonia_is_own_player_id.sql`
versiona a função órfã (CREATE OR REPLACE, no-op contra a prod).

## 3. Duplicação de policies (3 gerações empilhadas)

`players` tem **3 gerações** de permissivas por comando (ex.: read = `players_read_authenticated`
+ `harmonia_players_read_authenticated` + `harmonia_players_authenticated_read`). Como
permissivas se somam por **OR**, a **mais frouxa vence** — as intenções mais restritas
viram decoração, e fica difícil raciocinar sobre o efetivo. `app_meta`/`game_state`
idem (3 read + 3 write). Não é buraco (a RESTRICTIVE e os triggers seguram), mas é dívida
técnica que atrapalha qualquer mudança futura.

## 4. Plano priorizado

### Seguro / baixo risco — migrations AUTORADAS (aplicar quando quiser)
- [x] **Versionar `harmonia_is_own_player_id`** → `20260803000000_version_harmonia_is_own_player_id.sql`
      (no-op contra prod).
- [x] **Versionar as permissivas `harmonia_presence_*`** → `20260803020000_version_presence_permissives.sql`
      (no-op contra prod; torna o repo capaz de reproduzir a presença funcional).
- [x] **L2 — revogar `grant all to anon`** em finance_entries/finance_public
      (confirmado presente nas migrations 20260717; RLS já barra anon, é defesa em
      profundidade) → em `20260803030000_lote2_hardening.sql`.
- [x] **Dropar tabelas mortas** `confirmations` + `app_state` (0 linhas, sem
      tenant_isolation, nenhum caminho de código as usa — verificado) → mesmo arquivo
      `20260803030000_lote2_hardening.sql`.

> **Como aplicar:** `supabase db push` (aplica as migrations novas em ordem) OU colar
> cada arquivo no SQL Editor. As de versionamento são no-op; a de hardening muda prod
> (baixo risco). Testar presença + um fluxo de admin logo depois.

### Captura COMPLETA de reprodutibilidade (recomendado) — `supabase db pull`
Em vez de transcrever à mão todas as ~60 policies (propenso a erro), a forma correta de
fechar "o repo reproduz o banco" é o CLI (já instalado, 2.101.0):
```bash
supabase link --project-ref nwsnakzttmvuyejbfzom   # pede a senha do DB (você digita)
supabase db pull                                    # gera migration com o schema vivo
```
Isso versiona fielmente TODO o schema atual (policies, funções, triggers, grants) numa
migration única — inclusive as ~30 policies órfãs da geração antiga. Revisar o diff antes
de commitar.

### [REVISAR — pós-janela / go-live] muda produção, exige cuidado

**Deduplicar policies (3 gerações).** Manter UMA geração por comando (a `harmonia_*_admin_or_self`,
mais correta) e dropar as outras duas. ⚠️ **Verificar equivalência policy a policy antes de
dropar** — permissivas se somam (OR), dropar a errada remove acesso legítimo. Banco calmo +
testar admin/não-admin logo após. Melhor DEPOIS do `db pull` (para ter o baseline fiel).

**M2 — activity_log.** INSERT com `with check(true)` deixa qualquer autenticado forjar
club_id/player_id/name. **Risco real hoje: BAIXO** — a tabela **não tem policy de SELECT**,
então ninguém lê via API (só você, via dashboard/service_role); o único risco é poluição por
inserção forjada, não vazamento de PII. É telemetria **temporária** (app_open/tab, ver
`js/services/activity-log.js`). Plano correto: **REMOVER o tracking do cliente antes do
go-live** (não agora — perde a visibilidade dos testadores no piloto).

**Defesa em profundidade (opcional).** Espelhar o anti-escalada de `is_admin` no `with_check`
das policies de `players` (hoje só nos triggers). Só robustez — não fecha buraco explorável.

## 5. Verificado / sem ação necessária
- **L3** (RESTRICTIVE só `to authenticated`) — fica **subsumido pelo L2**: revogado o grant
  anon, o anon nem alcança a tabela; ampliar a RESTRICTIVE para `public` seria redundante.
- **L4** (comentário enganoso em finance_public) — cosmético; finance_public carrega
  player_id/devedores por design (PII intra-clube), protegido por tenant_isolation + admin.
- `ratings`/`pix_receipts`/`push_log` têm **só** a RESTRICTIVE, sem permissiva → travadas
  para `authenticated`. OK: são escritas por Edge Function (service_role, ignora RLS) e não
  lidas direto pelo cliente (ratings/pix vão no blob; push_log é server-side). Sem ação.

---
Relacionado: `migrations/20260711000000_multitenant_p2_rls.sql`, memória `[[club-id-stamp-rls]]`.
