# Controle financeiro do clube — design

Status: **estudo / design** (não implementado). Origem: pedido do usuário (17/07/2026) — histórico de coleta de mensalidade → demonstrativo financeiro → futuro controle de receitas/despesas publicável ao grupo. Ver `club-profile-design.md`, `harmonia-monetizacao` (memória).

## Estado atual (o que existe)

- **"Relatório de pagamentos"** = apenas o botão **"Copiar pagos/pendentes"** (`players.view.js`) — copia o status do ciclo atual pro WhatsApp. Não há relatório, histórico nem demonstrativo.
- **`mens_ok`** = booleano por jogador (estado atual, sem ciclo). Um `mens_expire_date` global. Ao virar o mês, o admin reseta na mão. **Não gera histórico.**
- **`pix_receipts`** (tabela granular): `{e2e_id, player_id, auth_user_id, amount, paid_date, beneficiary, bank, created_at, club_id}` → **histórico real de entradas** (via PIX-IA). Subaproveitado hoje (só confirma o `mens_ok`).
- **`canManageFinance(player)`** já existe em `authz.js` (hoje = `isAdmin`) — gancho pronto pra um papel dedicado (tesoureiro) sem ser admin pleno.
- **Config** = área admin atual: Acesso restrito, Convite do clube, Jogos, settings de mensalidade (valor/beneficiário/vencimento — parte já vive na aba Jogadores).

## O que falta (o pedido)

1. **Ciclos + histórico** de mensalidade (quem pagou, quanto, quando — mês a mês).
2. **Demonstrativo financeiro** (saldo, entradas/saídas, inadimplência ao longo do tempo).
3. **Despesas** (não só mensalidade — aluguel de quadra, coletes, bola…).
4. **Publicação ao grupo** (transparência: membro vê um resumo read-only).

## Modelo de dados

Decisão de arquitetura: **NÃO vai no blob** (`app_meta.data`). Dado financeiro é **append-only e cresce sem teto** — bloato do blob = risco de apagão + polling caro. Segue o padrão das tabelas granulares (`pix_receipts`, `ratings`): **tabela própria**.

### `finance_entries` (livro-caixa, nova tabela granular)
```
id            uuid pk
club_id       uuid            -- RLS por clube
kind          text            -- 'receita' | 'despesa'
category      text            -- 'mensalidade' | 'diaria' | 'quadra' | 'material' | 'outro'
amount        numeric(12,2)
date          date            -- competência (dia do fato)
description   text
player_id     text null       -- quando é mensalidade/diária de um membro
cycle_id      text null       -- vincula ao ciclo de mensalidade (abaixo)
source        text            -- 'pix_ia' | 'manual' | 'ajuste'
pix_e2e_id    text null       -- rastro pro comprovante PIX (dedup)
created_by    uuid
created_at    timestamptz
```
- **Mensalidade paga** vira uma `finance_entry` (kind=receita, category=mensalidade). O PIX-IA já preenche `amount/date/player_id` → deixa de só marcar `mens_ok` e passa a **lançar no caixa**.
- **Despesa** = lançamento manual do admin.
- **Idempotência**: `pix_e2e_id` único evita lançar o mesmo comprovante duas vezes.

### Ciclos de mensalidade — o que dá o "histórico"
Hoje `mens_ok` é atemporal. Pra ter histórico, a mensalidade precisa de **competência mensal**. Duas abordagens:

- **(A) Ciclo explícito** (`finance_cycles`: `id, club_id, ref (2026-07), amount, due_date, status`): ao abrir o mês, o app materializa a cobrança de cada membro; pagar = `finance_entry` vinculada ao `cycle_id`. Fecha o mês → snapshot vira histórico. **Recomendado** — dá inadimplência por mês, "colou 8/12 em jul".
- **(B) Derivar do ledger**: sem tabela de ciclo; agrupa `finance_entries` de mensalidade por mês. Mais simples, mas não representa "quem DEVIA e não pagou" (só quem pagou). Inadimplência fica fraca.

Recomendo **(A)** pro produto (a dor do dono é justamente *inadimplência*), começando simples (um ciclo/mês, valor único do `settings`).

### Migração / compat
- `mens_ok` continua como **flag derivada** do ciclo atual (o resto do app não quebra): `mens_ok = existe finance_entry de mensalidade no ciclo vigente`.
- `pix_receipts` existentes podem ser **importados** como `finance_entries` (backfill) → o histórico não nasce vazio.

## As telas

1. **Demonstrativo (dashboard financeiro)** — saldo atual, entradas × saídas do mês, gráfico simples mês a mês, **taxa de coleta** (ex: "colou R$ 800 de R$ 1.200 · 8/12 membros") e **inadimplentes**.
2. **Lançamentos** — lista do livro-caixa (filtro receita/despesa/categoria/mês); botão "＋ Despesa" e "＋ Entrada manual"; cada mensalidade paga aparece aqui (com rastro do comprovante PIX).
3. **Ciclo do mês** — abrir/fechar mês, ver quem pagou/deve, cobrar (push) os pendentes.
4. **Publicar ao grupo** (transparência) — toggle no `profile`/settings: membro vê um **resumo read-only** (saldo, entradas/saídas do mês, sem PII de quem está devendo — ou com, decisão do admin). Fecha o loop "prestação de contas" que gera confiança no grupo.

## Navegação — a ideia do usuário, avaliada

Proposta do usuário: **(i)** distribuir os controles de admin **contextualmente ao fim de cada aba**; **(ii)** transformar a área admin atual (Config) na **área de controle financeiro**.

Avaliação:
- **(i) Controles contextuais por aba = boa ideia, e já é parcialmente assim.** Ex.: gestão de jogadores já vive na aba Jogadores; config de jogo cabe ao fim da aba Jogo; vencimento da mensalidade já aparece em Jogadores. Levar os settings pra perto de onde o recurso vive **melhora descoberta e enxuga o Config**. Regra: cada aba mostra, no fim e só pro admin, os controles daquele domínio.
- **(ii) Config → Financeiro = faz sentido, com um ajuste.** A nav inferior tem 6 slots (Home, Jogo, Jogadores, Churrasco, Campeonato, Config); adicionar "Financeiro" sem tirar nada = 7 (apertado no mobile). **Reaproveitar o slot do Config vira Financeiro é net-zero e inteligente.** Mas o Config tem coisas não-financeiras (convite, acesso, plano). Essas migram para:
  - **menu do perfil** (avatar no topo → "Clube / Configurações"): convite, plano/assinatura, exclusão de conta, settings globais;
  - **contextual** nas abas: config de jogo, de mensalidade (valor/beneficiário/vencimento na aba Financeiro).

**Recomendação de navegação:**
- Renomear o slot **Config → Financeiro** (ícone de carteira/$), Pro. Lar do demonstrativo + lançamentos + ciclos.
- **Settings de admin distribuídos contextualmente** ao fim de cada aba (jogo, jogadores, churrasco, campeonato).
- **Menu do perfil** (avatar) absorve o "meta-admin" do clube (convite, plano, conta, perfil do clube do [[club-profile-design]]).
- `canManageFinance` habilita a aba Financeiro (permite um **tesoureiro** que não é admin pleno — futuro).

## Faseamento

- **F1 — Histórico + demonstrativo básico (MVP):** tabela `finance_entries`; PIX-IA passa a lançar receita de mensalidade; backfill de `pix_receipts`; tela Demonstrativo (saldo/mês, taxa de coleta) + Lançamentos; despesa manual. Já entrega o "demonstrativo" pedido.
- **F2 — Ciclos:** `finance_cycles` (abrir/fechar mês, inadimplência por competência, cobrança dos pendentes). `mens_ok` vira derivado.
- **F3 — Publicação ao grupo:** resumo read-only pro membro (toggle no profile).
- **F4 — Reorg de navegação:** Config→Financeiro + settings contextuais + menu do perfil. (Pode vir antes se preferir estruturar a casa primeiro.)

## Relação com Free/Pro e club_profile

- **Financeiro é o carro-chefe do Pro** ("gerir o clube"). Casa com a decisão pendente de empurrar mensalidade pro Pro (ver [[harmonia-monetizacao]]). Gate: `isModuleOn(state,'mensalidade') && isPro()` (ver precedência em `club-profile-design.md`).
- Módulo `financeiro` liga/desliga no `profile.modules` (clube que não cobra nada desliga a aba inteira).
