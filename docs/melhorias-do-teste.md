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

**CORREÇÃO DO DIAGNÓSTICO (08/09):** não foi toque acidental. O app **já exigia digitar o
nome exato** do jogador para excluir — o admin digitou "Ben" deliberadamente. O que faltava
era o app dizer que aquele cadastro carregava o login de outra pessoa.

**PARCIALMENTE IMPLEMENTADO (v1.192.0):** quando o jogador tem `auth_user_id`, o modal muda
de título para "Excluir jogador COM acesso" e avisa que a pessoa perde o login e não consegue
recuperar sozinha, sugerindo "Marcar que saiu do time" como alternativa.

**Ainda na fila:**

- A tela de "nenhum jogador vinculado" continua sendo beco sem saída — quem cair nela não tem
  como voltar pelo app, igual ao card de notificações bloqueadas que corrigimos em 03/09.
- Registrar edições de perfil no activity_log (ver abaixo).

**Pontos a decidir:**

- Avisar o excluído por push? (existe infra, ver item 1)
- Registrar edições de perfil no activity_log — hoje só há `player_added` e `player_deleted`,
  e por isso não dá para saber quem renomeou o cadastro dela para "Ben" nem quando.

**Para o formulário:** é o exemplo mais forte de "problema que só aparece com gente real
usando" — nenhum teste automatizado encontraria, porque depende de um humano interpretar
um roteiro de um jeito não previsto.

## 3. Linha da lista de Jogadores empilha demais no celular (visão do admin)

**Descoberto em:** 08/09/2026 · **origem:** uso real no teste fechado · **status:** na fila

Para quem é admin, cada linha carrega **seis elementos** competindo pela largura: avatar,
nome, subtítulo (posição · acesso), interruptor Pago/Pendente e quatro botões de ícone
(editar, chave/criar acesso, sair do jogo, excluir). Num aparelho de ~390px o resultado é
que o nome — a única coisa que identifica a pessoa — é o primeiro a ser cortado:

```
Caetano H...     Zagueiro · A...
Dougla...        Atacante...
Fabiana D...     Meia · Acess...
```

**Comportamento desejado:**

- O nome nunca é truncado antes das ações. Se algo tem que sobrar, é ícone, não identidade.
- Ações secundárias vão para um menu de excesso (⋮), deixando na linha só o que se usa toda
  semana: o interruptor de mensalidade.
- **A lixeira sai da linha principal.** Hoje a ação destrutiva fica a um toque de distância
  das rotineiras, num alvo pequeno e espremido — e em 24/08 e 27/08 um testador excluiu o
  jogador errado por aí, deixando outra pessoa sem acesso por 12 dias (ver item 2).

**Pontos a decidir:**

- Menu de excesso por linha, ou modo de edição que revela as ações?
- Duas linhas por jogador em telas estreitas (nome em cima, controles embaixo) resolveria sem
  esconder nada — custa altura, ganha legibilidade.
- O subtítulo precisa mesmo mostrar "Acesso"? O ícone de chave já comunica isso.

**IMPLEMENTADO em 08/09/2026 (v1.190.0).** Menu de excesso (⋮) com editar, acesso, "saiu do
time" e excluir; a exclusão separada por uma linha e em vermelho. Uma linha por jogador: o
avatar desta lista caiu de 62px para 38px (via `--player-avatar-size` no escopo da lista) e as
folgas encolheram, devolvendo ~40px ao nome. A tentativa de quebrar em duas linhas foi
descartada — desperdiçava altura numa lista de 24 pessoas. Entra nas notas do R3.

## 4. "Avisos · 1 recado(s)" na home: contava e não mostrava

**Descoberto em:** 09/09/2026 · **origem:** revisão da home antes do pacote 6 · **status:** corrigido

A home listava um item **Avisos** com o texto *"1 recado(s)"*. O recado em si não
aparecia ali nem em nenhuma outra tela, e o item não é clicável — é uma `div`, não um
botão. Ou seja: o app informava que existe um aviso e não dava caminho nenhum para
lê-lo. Na Config, o mesmo campo se descreve como *"mensagem fixa que aparece na home
de todos"* — a promessa não era cumprida.

É o terceiro caso do mesmo padrão nesta rodada (card de push sem botão, "nenhum
jogador vinculado" sem saída): **contador sem destino**. Vale registrar porque é
exatamente o tipo de coisa que um revisor da Play abre, toca, nada acontece, e anota
como defeito.

**IMPLEMENTADO em 09/09/2026 (v1.194.0).** O item deixou de contar e passou a mostrar:
cada recado vira uma linha própria, com título "Recado" e o texto integral (o bloco já
quebra em várias linhas, então mensagem longa cabe). Recado em branco não gera linha.
Entra nas notas do R3.
