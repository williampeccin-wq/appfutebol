# Convocados — Desenho da arquitetura Multi-tenant (Fase 1 do Freemium)

> Objetivo: cada **clube** vira uma entidade isolada, para que muitos clubes usem o mesmo app sem se misturarem — a fundação do Freemium (cobrar por clube). Hoje é single-tenant (`key='default'`).

## Princípio
**Isolamento por `club_id` + RLS.** Um usuário só enxerga e escreve dados do(s) clube(s) dele. Nada de "default".

---

## 1. O modelo de dados

### Nova tabela `clubs` (o inquilino)
```
clubs: id (uuid) · name · slug · plan (free|pro) · plan_status · owner_auth_user_id
       · invite_code · created_at
```

### `club_id` em tudo
| Tabela | Hoje | Multi-tenant |
|---|---|---|
| `players` | sem club | **+ `club_id`** |
| `app_meta` | `key='default'` (blob) | `key = club_id` (um blob por clube) |
| `game_state` | `key='default'` | `key = club_id` |
| `presence_confirmations` | game_key+player | **+ `club_id`** |
| `ratings` / `pix_receipts` / `push_subscriptions` / `push_log` | — | **+ `club_id`** |

### RLS (o que faz o isolamento)
- Função `current_club_ids()` → clubes do usuário logado (via os player rows dele).
- Toda tabela: `USING (club_id = ANY(current_club_ids()))`.
- `app_meta`/`game_state`: `USING (key = ANY(current_club_ids()::text[]))`.
- Escrita: admin do clube só grava no **próprio** clube.

---

## 2. Decisões que preciso do seu voto

### (A) Um usuário pertence a 1 clube ou a vários?
- **1 clube por usuário [MVP, recomendo começar]:** `players.club_id`. Um telefone = uma conta = um clube. Simples, isola tudo, entrega rápido. Quem joga em 2 peladas: fica pra depois.
- **Multi-clube (tabela `memberships`):** um login, vários clubes, com seletor de "clube atual". Mais realista pra plataforma, porém bem mais código (auth, sessão, seletor). Dá pra evoluir pra isso depois.

### (B) Formato dos dados: manter o blob (por clube) ou normalizar?
- **Blob por clube [recomendo p/ o MVP multi-tenant]:** `app_meta.data` continua o blob, só troca `key='default'` por `key=club_id`. **Muito menos trabalho**, isola na hora. O "sair do blob" (anti-apagão) é melhoria SEPARADA, não é bloqueador de multi-tenant.
- **Normalizar em tabelas por entidade:** mais robusto (fim dos apagões), mas é uma reescrita grande — some ao multi-tenant e vira 2–3 meses.

### (C) Colisão do login por telefone
Hoje o email é `telefone@harmonia.app` (global). Com vários clubes, dois clubes podem ter o telefone X.
- **MVP:** telefone **globalmente único** na plataforma (um telefone = uma conta = um clube). Evita a colisão sem código extra.
- **Futuro:** email por clube (`telefone@<slug>.convocados...`) ou login por telefone global + memberships.

### (D) Onde fica o banco de PRODUÇÃO do Convocados?
Hoje o app aponta pro **Supabase DEV (dados de teste)**. A plataforma pública precisa de um **Supabase de produção próprio** — NÃO o DEV, NÃO o Harmonia.
- ⚠️ **Custo:** no plano free do Supabase, sua org já tem 2 projetos ativos (dev+fc). Um 3º exige **Pro (~US$25/mês)** ou uma **org free separada**. Decisão de infra.

---

## 3. Onboarding (o fluxo novo de entrada)
```
Cadastro →  "Criar um clube"  → vira admin do clube novo (club_id próprio, invite_code gerado)
        └─  "Entrar num clube" → digita o invite_code → vira membro pendente (aprovação do admin)
```
O `register-player` (já server-side) passa a: criar o clube OU associar ao clube do código, setando `players.club_id`.

## 4. Migração dos dados existentes
- Cada base atual (Harmonia PROD, e o DEV de teste) vira **um clube**: cria `clubs`, seta `club_id` em todos os players, re-keia `app_meta`/`game_state` de `'default'` → `club_id`, backfill de `club_id` em presence/ratings/pix/push.
- **Harmonia** entra como **clube nº 1** da plataforma (casa com a decisão "migrar o Harmonia quando publicar").

## 5. Plano de construção (em passos testados, tudo no DEV)
1. **Schema:** `clubs` + `club_id` nas tabelas (migração, você roda) — sem quebrar o app atual (club_id default temporário).
2. **RLS por clube** (`current_club_ids()` + policies) — testar isolamento com 2 clubes.
3. **Cliente:** ler/gravar `app_meta`/`game_state` por `key=club_id` (não mais 'default'); resolver o club_id na sessão.
4. **register-player:** criar clube / entrar por código; `players.club_id`.
5. **Onboarding UI:** telas "Criar clube" / "Entrar com código".
6. **Migração** dos dados existentes → 1 clube.
7. (Depois) **Gating Free×Pro** no servidor → **billing**.

## 6. Riscos
| Risco | Mitigação |
|---|---|
| Quebrar o app atual durante a migração | club_id com default temporário; migrar em passos; testar no DEV |
| RLS mal-feita = vazamento entre clubes | testar isolamento com 2 clubes reais antes de tudo |
| Blob por clube herda os apagões | manter as travas anti-apagão; normalizar depois |
| Custo do Supabase de produção | decidir Pro vs org nova ANTES do go-live público |

> Ordem: schema → RLS → cliente → onboarding → migração. **Nada vai pro Harmonia PROD** até estar provado no DEV e você decidir migrar.
