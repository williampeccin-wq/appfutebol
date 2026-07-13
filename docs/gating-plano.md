# Convocados — Gating Free×Pro (Passo 7) · plano de execução

> **Princípio:** server-gate o que tem **custo/abuso/dados** (PIX-IA, lembrete, limite de membros); client-gate (cadeado + upsell) o que é **só exibição** (campeonato, sorteio inteligente, carnê). O plano vive em `clubs.plan` (`free`|`pro`), resolvido pelo `club_id` do chamador.

## Descoberta que ampliou o passo
No Passo 3 só o CLIENTE virou multi-tenant. **5 Edge Functions ainda liam `app_meta key='default'`** (apagado no 3c) → quebradas no DEV multi-tenant. O gating senta em cima de "terminar o multi-tenant no servidor".

## Padrão do gate (por-chamador)
```ts
// 1) jogador + clube do chamador
const { data: playerRow } = await admin.from("players")
  .select("id,data,club_id").eq("auth_user_id", userId).maybeSingle();
const clubId = String(playerRow?.club_id || "");
// 2) plano do clube
const { data: clubRow } = await admin.from("clubs").select("plan").eq("id", clubId).maybeSingle();
if ((clubRow?.plan || "free") !== "pro") return json({ ok:false, error:"pro_required", message:"..." });
// 3) blob por club_id (nunca 'default')
const { data: metaRow } = await admin.from("app_meta").select("data").eq("key", clubId).maybeSingle();
```
Inserts em tabelas de linha (pix_receipts, ratings…) passam a setar `club_id: clubId`.

## Estado por função
| Função | Tipo | club-scope | Gate Pro | Status |
|---|---|---|---|---|
| **read-pix-receipt** | por-chamador | ✅ | ✅ (PIX-IA é o gancho, tem custo) | FEITO + deployado; testado Free→pro_required |
| **submit-rating** | por-chamador | ⏳ | ❌ (notas são Free) | pendente |
| **notify-waitlist-promotion** | por-chamador | ⏳ | ❌ (fila é Free) | pendente |
| **auto-open-games** | cron | ⏳ iterar clubes | ❌ | pendente |
| **send-overdue-reminders** | cron | ⏳ iterar clubes | ✅ (lembrete é Pro) | pendente |

Crons mudam de "1 blob 'default'" para **loop sobre todos os clubes** (`select id,plan from clubs`), lendo `app_meta key=club_id` de cada.

## Grandfathering
Harmonia = **club1** entra como **Pro cortesia** (`update clubs set plan='pro' where id=club1`). Regra: **nunca tirar de quem já tinha** (o erro do Chega+). Clubes novos nascem `free`.

## Depois do server-side
- **Cliente:** cadeado + upsell nas features Pro de tela (usa `getClubInfo().plan`). client-side aceitável (sem custo/abuso).
- **Limites:** membros (~25) e histórico (3 jogos) no servidor (register-player checa contagem vs plano).
- **Billing (Fase 3):** o que VIRA `clubs.plan`='pro'. Por ora, flip manual (SQL/admin). Trilho Play vs externo = decisão posterior.
