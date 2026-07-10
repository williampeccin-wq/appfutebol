# Convocados — Plano de execução do Freemium

> Modelo escolhido: **Freemium SaaS — assinatura "Pro" por clube, paga pelo admin.**
> Princípio da linha: **o Free organiza o JOGO. O Pro gere o CLUBE.**
> Âncora de preço: R$20–50/clube/mês (a validar com clubes reais e com o custo medido).

---

## 1. A divisão Free × Pro

### 🆓 Free — o jogo da semana
O núcleo tem que ser **genuinamente útil sozinho**, senão não há adoção (e sem base não há conversão). Nada aqui tem custo marginal relevante.

| Funcionalidade | Por que fica no Free |
|---|---|
| Cadastro/login (telefone+senha, passkey) | Base do app |
| Auto-cadastro com **aprovação do admin** | Base + controle de quem entra |
| **Auto-exclusão de conta** | **Exigência de loja** — nunca pode ser paga |
| Criar jogo + **confirmação de presença** (linha + goleiros) | O core loop da pelada |
| **Fila de espera** automática + push de promoção | Retenção; Web Push não tem custo por mensagem |
| **Sorteio de times básico** (equilíbrio por posição) | O core loop |
| Convidados + goleiro de aluguel | Faz parte do jogo |
| **Compartilhar** lista/times no WhatsApp | Canal de aquisição — traz clubes novos |
| Foto de perfil | Cosmético |
| Push essencial ("inscrições abertas") | Retenção, custo ~zero |
| **Limites:** até ~25 membros · 1 admin · histórico de 3 jogos | Segmenta por tamanho, não por dor |

### ⭐ Pro — gerir o clube
Onde está **dinheiro, competição, inteligência e escala**. Aqui moram os custos marginais reais.

| Funcionalidade | Por que é Pro |
|---|---|
| 🤖 **PIX automático (a IA lê o comprovante)** | **O gancho.** Custo real por chamada (Anthropic). Substitui trabalho manual do admin. |
| 💸 Mensalidade avançada: beneficiário validado, **regra de bloqueio** (parcial/total), relatório pagos/pendentes, copiar lista | Quem gere caixa tem caixa |
| 🔔 **Lembrete automático de atraso** (cron diário) | Automação recorrente |
| 🏆 **Campeonato + Rei da Quadra + histórico de campeões** | Profundidade de gestão |
| ⭐ Avaliações/notas (desempenho + churrasco) | Engajamento avançado |
| 🎽 **Sorteio inteligente** (índice de força = notas + pontos do campeonato) | Diferencial real; depende das notas |
| 📅 Carnê / rodízio de duplas | Gestão do clube |
| ⚡ Abertura automática de inscrições (agendada) | Automação (cron) |
| 👥 **Membros ilimitados + multi-admin** | Escala |
| 📈 **Histórico completo** (jogos, presença, financeiro) | Valor acumulado → lock-in |

### ⚖️ As 3 chamadas debatíveis (precisam do seu voto)

**(a) Mensalidade manual — Free ou Pro?**
- **Opção A (recomendo):** marcar pago/pendente, vencimento e valor ficam **no Free**; o **PIX-IA + lembrete + relatório** vão pro Pro. → o admin *sente a dor* de conferir 30 comprovantes na mão e converte pela automação. Free mais útil, conversão mais natural.
- **Opção B (agressivo):** **toda** mensalidade no Pro. Linha mais limpa ("Free não mexe em dinheiro"), converte mais cedo, mas o Free perde o que mais importa pro grupo.

**(b) Avaliações/notas — Free ou Pro?**
São a parte *divertida* (resenha). No Free aumentam a stickiness; no Pro engordam o tier pago. Meio-termo: **notas no Free**, e o **sorteio inteligente que as usa** fica no Pro.

**(c) Campeonato — tudo Pro, ou ranking simples no Free?**
O campeonato dá "alma" ao grupo. Alternativa: **ranking simples de vitórias no Free**, e o **Rei da Quadra completo + histórico de campeões** no Pro.

---

## 2. Plano de execução

### Fase 0 — Lançar grátis *(onde estamos)*
Publicar o Convocados sem cobrança, validar retenção, ouvir os clubes. **Sem base, não há o que monetizar.** Nada de billing agora.

### Fase 1 — Multi-tenant (a fundação, e a maior pedra)
Sem isso, não existe "clube cobrável". Já estava no roadmap como Fase 4.
- `club_id` em todas as tabelas + **RLS por clube**
- Sair do blob único `app_meta.data` (`key='default'`) → estado por clube
- Onboarding: criar clube → vira admin → convida membros (link/código)
- **Decisão:** um usuário pode pertencer a mais de um clube?
- Migrar o Harmonia (clube existente) pro modelo novo
- Estimativa: **4–6 semanas**

### Fase 2 — Planos e gating
- Tabela `clubs` com `plan` (free|pro), `plan_status`, `plan_expires_at`, `trial_ends_at`
- ⚠️ **Gating no SERVIDOR** (Edge Functions + RLS conferem o plano). Nunca só no cliente — senão qualquer um burla.
- Limites (membros, histórico) aplicados no servidor
- UI: cadeados + telas de upsell **nos pontos de dor** (ao tentar usar o PIX-IA, abrir o campeonato…)
- Estimativa: **2–3 semanas**

### Fase 3 — Billing
- ⚠️ **Decidir o trilho primeiro** (depende de pesquisar as regras do Play):
  - **Cobrança externa** (portal web + Stripe/PIX recorrente) — sem corte da loja, mas precisa caber na política
  - **Play Billing** (Digital Goods API na TWA) — corte de 15–30%, porém à prova de política
- Webhooks → atualizam `clubs.plan`
- Portal do assinante: upgrade, cancelar, recibo/NF
- **Trial do Pro (14 dias)** — converte bem melhor que paywall seco
- Estimativa: **2–3 semanas** + burocracia

### Fase 4 — Preço, upsell e métricas
- **Medir o custo real por clube** (Anthropic por comprovante + Supabase) → define o **piso** do preço
- Validar preço com **5–10 clubes reais** (entrevista / pré-venda)
- Métricas: ativação, conversão free→pro, churn, LTV/CAC
- Iterar os limites do Free (o número mágico de membros)

---

## 3. Riscos e decisões abertas
| Item | Por quê importa |
|---|---|
| **Regras do Play Billing** | Define o trilho de cobrança. Pesquisar **antes** da Fase 3. |
| **PF × PJ para faturar** | Hoje o controlador é pessoa física (CPF). Cobrança recorrente + nota fiscal pedem estrutura. |
| **Custo por comprovante (IA)** | É o piso do preço. Medir com dados reais antes de precificar. |
| **Usuário em vários clubes** | Muda o modelo de dados e a sessão. Decidir na Fase 1. |
| **Migração do Harmonia** | O clube ao vivo precisa entrar no multi-tenant sem quebrar. |

> Ordem inegociável: **Fase 1 → Fase 2 → Fase 3.** Billing antes de multi-tenant não faz sentido — não há entidade para cobrar.
