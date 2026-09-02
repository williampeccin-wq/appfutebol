# Melhorias vindas do teste fechado — fila

> Ideias que nasceram do teste fechado e ainda não foram implementadas. Serve para
> duas coisas: não perder o pedido, e alimentar as **notas de versão** dos próximos
> lançamentos e o campo do formulário de produção que pergunta o que mudou por causa
> do feedback ([changelog-teste-fechado.md](changelog-teste-fechado.md)).

## 1. Aviso de uniforme no sorteio dos times

**Pedido em:** 02/09/2026 · **origem:** teste fechado · **status:** na fila

Quando os times são sorteados e o admin define o uniforme de cada time, o jogador
não é avisado de qual camiseta deve levar. Hoje ele precisa abrir o app, achar a
escalação e conferir — e na prática pergunta no grupo.

**Comportamento desejado:** ao definir (ou trocar) o uniforme de um time, cada
jogador daquele time recebe um push dizendo qual camiseta usar. Exemplo:
*"Time A — leve a camisa branca. Jogo sexta, 20:00."*

**O que já existe e pode ser reaproveitado:**

- `game.sort_result.uniforms[idx]` guarda o uniforme por time — gravado em
  [app.js:1243](../appfutebol_run/js/core/app.js#L1243), lido pela imagem da escalação.
- A biblioteca de uniformes fica em `settings.uniforms` (Config), com id e foto.
- `sort_result.teams` / `team_a` / `team_b` dão os `player_id` de cada time.
- Infra de push pronta: `send-push` para disparo direcionado, e
  `notify-waitlist-promotion` como exemplo de push **por jogador** (não broadcast),
  com deduplicação no servidor.

**Pontos a decidir na implementação:**

- Disparar ao definir o uniforme, ou só quando o admin fechar o sorteio? Definir
  time a time geraria dois pushes seguidos; talvez agrupar com um pequeno atraso.
- Trocar o uniforme depois do primeiro aviso deve reenviar? Provavelmente sim, mas
  precisa de deduplicação por (jogo + time + uniforme) para não repetir.
- Uniforme só de um dos times: avisar só quem tem, ou esperar os dois?
- Respeitar a chave de notificações do clube, como os demais tipos.

**Por que vale:** é exatamente o tipo de melhoria que o teste fechado existe para
produzir — não é bug, é atrito real que só aparece com gente usando de verdade.
