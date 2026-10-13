# Presença automática — "todos dentro, quem não vai avisa"

> Entrega 1 implementada em v1.206.0 (13/10/2026). Entrega 2 no fim.

## Por quê

O app nasceu com o costume do Harmonia: o jogo abre e cada um confirma a sua. Há
grupo que funciona ao contrário — o jogo abre (segunda, 12h) com os fixos já
confirmados e cada um só avisa quando **não** vai. Para esse grupo o app obrigava
todo mundo a confirmar, toda semana.

## A ideia

Não existe um segundo tipo de presença. **Abrir o jogo grava confirmações comuns
para quem é fixo.** Contagem, fila, promoção da fila, sorteio e churrasco seguem
como estão, e "não vou" é o cancelamento de sempre (que já promove o primeiro da
fila).

## Configuração

| Onde | Campo | O quê |
|---|---|---|
| Perfil do clube | `profile.presence.mode` | `opt_in` (padrão, comportamento de sempre) ou `opt_out` |
| Jogador | `auto_presenca` | `false` = só aparece de vez em quando, não entra sozinho. Ausente = entra |
| Jogo | `presence_mode`, `auto_confirmed_at` | carimbados **na abertura**; é o que inverte os textos da tela e garante "uma vez só" |

Tela: Config › Como o clube joga › "Como o grupo confirma presença". A marca do
jogador ("Entra automaticamente nos jogos") só aparece no cadastro quando o clube
está em `opt_out`.

## Quem entra

Ativo, joga futebol, com a marca ligada e não bloqueado por mensalidade (modos
`partial`/`total`, depois do vencimento, `mens_ok === false`, não isento).

- Linha entra até `max_players`, descontando convidados e quem já estava. O resto
  vai para a **fila de espera**.
- Sobrou gente: em dia primeiro (se o clube usa `fila_prioriza_em_dia`), depois o
  cadastro mais antigo. Não há "entrou no clube em" no jogador: vale `created_at`
  se existir, senão o carimbo do id (`p_<ms>`), senão o fim da fila.
- Goleiro tem teto próprio (`game.goalkeepers_per_game`) e não tem fila.
- **Nunca mexe em quem já tem resposta neste jogo.** Quem avisou que não vai não
  volta; rodar duas vezes não muda nada.
- Jogador cadastrado depois da abertura confirma pelo fluxo normal.

## Onde roda

O jogo abre por dois caminhos e os dois decidem igual:

| Caminho | Onde | Gravação |
|---|---|---|
| Admin abre na mão (editar ou criar jogo) | `core/app.js` → `abrirJogoComFixos` | pelo estado do app, caminho granular de sempre |
| Jogo abre no horário | cron `auto-open-games` → `confirmarFixos` | `upsert` com `ignoreDuplicates` em `presence_confirmations` |

A regra mora em `js/domain/presenca-automatica.js`, que **não importa nada** e tem
uma **cópia idêntica** em `supabase/functions/auto-open-games/` (Edge Function não
importa de fora da própria pasta). `tests/presenca-automatica.regression.mjs`
exige as duas iguais byte a byte e exige que os predicados copiados concordem com
os de `authz.js` / `rules.engine.js` / `confirmations.js`.

O desenho original previa uma função SQL. Ficou em JS porque a regra de
mensalidade teria de ser reescrita numa terceira linguagem, sem como testar aqui
(as suítes não têm banco) — e essa regra já divergiu uma vez nesta base.

No cron, a ordem é **gravar os fixos, depois abrir**. As duas gravações são
idempotentes: se a abertura perder a corrida do `updated_at`, o próximo tick
refaz o plano, não acha ninguém sem resposta e só abre. Se a gravação dos fixos
falhar, o jogo **fica fechado** até o próximo tick (`fixos_failed` na resposta).
A trava de lotação do banco (`trg_presence_line_capacity`) continua valendo como
rede: o plano já respeita o limite.

## O que o jogador vê

| Situação | Status na home | Botão |
|---|---|---|
| Dentro | Confirmado | **Não vou** |
| Avisou que não vai | Fora | **Voltar pro jogo** (ou "Entrar na fila", se lotou) |
| Na fila | Na fila | Sair da fila |

Push de abertura pelo cron, por situação: "Você está no jogo", "Você está na
fila" ou "Jogo aberto" (para quem não é fixo). Na abertura manual o envio é um só
para o clube ("Quem é fixo já está no jogo… Não vai? Avise no app") — o
`send-push` só aceita "todos" ou um jogador.

A confirmação automática leva `auto: true` em `data`. Some quando a pessoa
confirma por conta própria. Ainda não aparece na tela; existe para o lembrete da
entrega 2.

## Entrega 2 (não feita)

- **Lembrete da véspera** para quem está dentro por `auto: true` e não abriu o
  app: "ainda dá para avisar que não vai". É o antídoto da falta por inércia.
- **Pergunta no onboarding** do clube: "Como o grupo confirma presença?".
- Mostrar ao admin, na lista do jogo, quem está dentro só pelo automático.
