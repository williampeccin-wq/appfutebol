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

## 2. Excluir jogador com login ativo deixa a pessoa órfã

**Descoberto em:** 08/09/2026 · **origem:** incidente real no teste fechado · **status:** na fila

Um admin pode excluir qualquer jogador, inclusive um que tenha conta de login vinculada.
A pessoa continua autenticando, mas o app não acha perfil e mostra *"Login autenticado, mas
nenhum jogador está vinculado a esse usuário"* — sem caminho de recuperação dentro do app.

**Como aconteceu:** no passo 8 do roteiro ("exclua o jogador de teste"), um testador pulou o
passo de criar e excluiu um registro pré-existente — o da ANDRIELE FABRO, que tinha login
ativo. Fez duas vezes: 24/08 e, depois de o registro reaparecer pela máquina de concorrência,
de novo em 27/08. Ela ficou sem acesso por 12 dias, e só se descobriu porque ela reclamou.

**Comportamento desejado:**

- Ao excluir um jogador **com `auth_user_id`**, exigir confirmação diferente da comum, dizendo
  o nome e que a pessoa perderá o acesso.
- Ou bloquear de vez: quem tem login só sai pela auto-exclusão de conta (que já existe).
- A tela de "nenhum jogador vinculado" precisa de saída: hoje é beco sem saída, igual ao card
  de notificações bloqueadas que corrigimos em 03/09.

**Pontos a decidir:**

- Avisar o excluído por push? (existe infra, ver item 1)
- Registrar edições de perfil no activity_log — hoje só há `player_added` e `player_deleted`,
  e por isso não dá para saber quem renomeou o cadastro dela para "Ben" nem quando.

**Para o formulário:** é o exemplo mais forte de "problema que só aparece com gente real
usando" — nenhum teste automatizado encontraria, porque depende de um humano interpretar
um roteiro de um jeito não previsto.
