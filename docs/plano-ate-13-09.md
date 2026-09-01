# Plano até o reenvio — 01/09 a 14/09/2026

> Reprovação anterior: revisão em 30/08 21:14 → os 14 dias fecham em **13/09 (domingo)**.
> **Reenviar na segunda, 14/09**, para capturar a atividade de domingo e ter um dia de margem.

## Legenda de confiança — leia antes

| | O que significa |
|---|---|
| 🔵 **Documentado** | Exigência escrita pelo Google. Se não fizer, reprova. |
| 🟡 **Causa nomeada** | Consta no texto da reprovação como causa possível, sem limiar definido. |
| ⚪ **Seguro barato** | Sem evidência de que funcione. Custo quase zero, prejuízo zero se não funcionar. |

Nada aqui é "isto resolve". Não existe caso público de alguém que foi reprovado, fez X e foi
aprovado — duas passadas de pesquisa, ~200 agentes, zero relatos fechando o ciclo.

---

## HOJE — terça, 01/09

**1. 🔵 Mensagem ao grupo dos testadores.** É a única exigência documentada da janela.
   Dois pedidos: **não desinstalar o app até dia 14**, e **aceitar a notificação** quando o app pedir.

**2. 🟡 Subir o Release A na faixa Alpha.** versionCode 4, notas prontas em
   [changelog-teste-fechado.md](changelog-teste-fechado.md). É o item em que o Google
   registra zero desde 14/08, e "não agir sobre feedback com atualizações" é uma das duas
   causas que ele nomeia.

### Estratégia de versões — três lançamentos ancorados em feedback

| | Quando | versionCode / nome | Conteúdo |
|---|---|---|---|
| R1 | 01/09 | 4 · 2.0.2.0 | backlog v1.171–1.181 |
| R2 | 05/09, após o jogo de quinta | 5 · 2.0.3.0 | v1.182–1.185 + o que sair |
| R3 | 11/09, após os jogos de 06 e 10 | 6 · 2.0.4.0 | o que vier da rodada |

- **Cada lançamento vem DEPOIS de um jogo.** É o que transforma "subi três builds" em
  "coletei feedback e agi sobre ele", que é a frase da reprovação.
- **Nunca subir versão sem mudança real** — melhor pular do que inventar.
- **R3 no dia 11, nunca no 13:** cada `.aab` passa por revisão, e chegar no dia 14 com
  lançamento preso em análise é péssima aparência.
- **Incrementar versionName junto com o versionCode.**
- **As notas são a carga útil**: numa TWA o pacote muda quase nada; o que o revisor lê é a nota.

**3. ⚪ Verificar se o clube de teste está no plano PRO.** A abertura automática está dentro de
   `if (isPro)` no `auto-open-games`. Se o clube for free, o `auto_open_at` é ignorado em
   silêncio — sem erro, sem push. Se for free, abra os jogos manualmente nos mesmos horários:
   o push é idêntico ("manual ou automático").

**4. ⚪ Agendar os quatro jogos** (ou anotar para abrir na mão):

| Jogo | `auto_open_at` (push) | Data do jogo |
|---|---|---|
| 1 | `2026-09-01T19:00` | qui 03/09, 20:00 |
| 2 | `2026-09-04T19:00` | dom 06/09, 10:00 |
| 3 | `2026-09-08T19:00` | qui 10/09, 20:00 |
| 4 | `2026-09-11T19:00` | dom 13/09, 10:00 |

**5. ⚪ Pedir feedback por e-mail a 3 ou 4 testadores**, para `suporte@convocados.app.br`.
   O Google não lê essa caixa, mas é o canal que você declarou no Console e te dá material
   datado para o campo "resumo do feedback e como foi coletado" — hoje você responderia
   "WhatsApp". **Responda esses e-mails**: o texto do Google fala em *agir* sobre o feedback.

---

## ROTINA — a cada 2 ou 3 dias

**🔵 Conferir o gráfico Público de instalação** (Estatísticas → Público de instalação, 28 dias).
A linha tem que ficar **plana ou subindo**. Hoje está em 22, com piso de ~20 no período anterior.
Se cair, alguém desinstalou — e pelas palavras do suporte do Google isso zera o período
registrado daquela pessoa. Não dá para saber **quem**: o Console só entrega agregado. O único
caminho é perguntar no grupo.

**Não faça:** roteiro novo, tarefa diária, cobrança individual. Foi o que custou as duas janelas
anteriores e não tem um único caso público que sustente.

**Não mexa nas listas de testadores.** Consolidar as duas listas parece arrumação inofensiva, mas
tirar e recolocar alguém pode zerar a continuidade dele — que é exatamente o que está sendo medido.

---

## CALENDÁRIO

| Data | O que acontece |
|---|---|
| ter **01/09** | Msg ao grupo · Release A (vC 4) · agendar jogos · push 19:00 |
| qui **03/09** | Jogo 1 — confirmar que o push saiu e que houve confirmações |
| sex **04/09** | Push do jogo 2 (19:00) · conferir gráfico |
| dom **06/09** | Jogo 2 |
| ter **08/09** | Push do jogo 3 (19:00) · conferir gráfico |
| qui **10/09** | Jogo 3 |
| sex **11/09** | Push do jogo 4 (19:00) · **Release B (vC 5)** |
| dom **13/09** | Jogo 4 — fecham os 14 dias |
| seg **14/09** | **Reenviar o pedido de acesso à produção** |

---

## ANTES DE REENVIAR — checklist do dia 14

- [ ] Gráfico de instalação em 12 ou mais, sem quedas na reta final
- [ ] Painel com o terceiro critério riscado e o botão habilitado
- [ ] Duas versões novas publicadas na faixa desde a última revisão (vC 4 e 5)
- [ ] Respostas do formulário revisadas — **sem a frase "11 versões publicadas"**, que
      contradiz o registro do Google; usar a formulação que explica a TWA
- [ ] Conferir o limite real dos campos do formulário (300 ou 1000 caracteres) e usar a
      versão do texto que couber

## EM PARALELO

- **Tíquete de suporte**: acompanhar a caixa do proprietário da conta. Quatro fontes
  independentes dizem que vem boilerplate, inclusive após escalação interna. Se vier algo
  específico, tem precedência sobre este plano inteiro.
- **Verificação de desenvolvedor Android**: prazo 30/09, Brasil na primeira leva. Não é desta
  janela, mas não pode passar batido. Ver [[verificacao-desenvolvedor-android]].
