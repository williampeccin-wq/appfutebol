# Respostas — Solicitar acesso de produção (Play Console)

> **ENVIADO em 14/09/2026, 13:11.** O painel confirmou "Recebemos seu pedido de acesso de
> produção"; a resposta vem por e-mail ao proprietário da conta, em até sete dias. Um toast
> de erro (5838FAEE) apareceu no rodapé no mesmo momento — ruído do painel, não do envio: se
> o formulário tivesse falhado, a tela continuaria oferecendo "Solicitar o acesso de produção".
> Terceira tentativa; as duas anteriores foram reprovadas em 14/08 e 30/08.

## 3ª REPROVAÇÃO (16/09/2026, 18:06) — o que sabemos e o que não

**Correção do que eu (Claude) escrevi em 17/09 neste arquivo:** eu disse que o gargalo era o
contador de 14 dias e que o botão desabilitado provava isso. Errado. O botão fica desabilitado
DEPOIS da reprovação, porque a análise reinicia o relógio. **Em 14/09 ele estava habilitado** —
e ele só habilita com os três critérios cumpridos. Ou seja: a parte automática passou, e quem
reprovou foi a análise.

### O que é fato

- O botão estava habilitado em 14/09 → 12+ testadores inscritos por 14 dias consecutivos, ok.
- O critério "pelo menos 12 testadores que aceitaram" segue riscado no painel.
- O artigo oficial (answer/14151465) lista dois motivos para "precisa de mais testes": menos de
  12 testadores que aceitaram **ou engajamento insuficiente no período de teste**. O primeiro
  está descartado pelo próprio painel.
- **A página "Feedback de teste" do Console está VAZIA.** Nenhum testador enviou feedback pela
  Play em dois meses — todo o feedback veio por WhatsApp, e a telemetria fica no nosso banco.
- Definição oficial de participação contínua (FAQ do mesmo artigo): conta permanecer inscrito;
  quem sai antes dos 14 dias não conta, e quem sai e volta recomeça. Não mede uso.

### O que é hipótese (não provado)

Que a reprovação venha do engajamento **medido pelo Google** — instalações e aberturas — e que
tudo o que comprova o teste de verdade esteja invisível para ele: 468 aberturas e 158 ações de
presença na nossa telemetria, roteiros cumpridos por 14 de 17, feedback detalhado no WhatsApp,
uso real no PWA fora da Play. 22 pessoas instalaram e testaram; a Play enxerga quase nada disso.

### Plano até 30/09

1. Pedir a 8–10 testadores que mandem feedback **pela Play Store do celular** (app → fim da
   página → seção do programa de teste). É o único sinal de engajamento que o Google registra
   sozinho, e hoje está zerado.
2. Manter as aberturas nos dias de jogo — o push voltou a funcionar e isso o Google conta.
3. Não mexer nas listas de testadores (sair e voltar reinicia a contagem individual).
4. Abrir tíquete de suporte perguntando o que é medido. Texto em inglês, 998 caracteres:

```
App: br.app.convocados (personal developer account).

I requested production access on 14 Sep 2026 — the "Request production" button was enabled, so the automated criteria (12+ testers opted in for 14 consecutive days) were met. It was rejected on 16 Sep with "your app needs more testing". The 12-tester criterion still shows as met, so I assume the reason is insufficient engagement.

I need to understand what engagement is measured, because it does not match what I see. The app organises weekly amateur football matches, so real use concentrates on match days, twice a week. During the test: 22 devices with the app installed, 3 releases published, 468 app opens and 158 presence actions in my telemetry, and 14 of 17 testers completed a guided 8-step script.

My "Test feedback" page is empty: feedback came over WhatsApp, not through Play.

Questions:
1. Which engagement signals do you evaluate?
2. Which is below the expected level for my app?
3. What should I produce in the next 14 days?
```

## O formulário MUDOU (conferido na tela em 14/09/2026)

São **4 etapas** e **300 caracteres por campo** — não mais os 7 campos longos descritos
abaixo, que valiam até agosto. Enunciados exatos, como aparecem hoje:

**1 · Sobre seu teste fechado**
- [escolha] Foi fácil recrutar testadores? (Muito difícil … Muito fácil, com "Nem difícil nem fácil" no meio)
- [texto] Como você recrutou usuários para o teste fechado? Por exemplo, você convidou amigos e familiares ou usou um provedor de testes pago?
- [texto] Descreva o engajamento dos testadores durante o teste fechado. Inclua se os testadores usaram ou não todos os recursos do app e se isso foi consistente com o esperado de um usuário real. Caso contrário, descreva as diferenças previstas.
- [texto] Envie um resumo do feedback recebido dos testadores. Especifique como ele foi coletado.

**2 · Sobre o app** — público-alvo, proposta de valor e faixa estimada de instalações.

**3 · Preparação para produção**
- [texto] Quais mudanças você fez no app com base no que aprendeu durante o teste fechado?
- [texto] Como você decidiu que o app está pronto para produção?

**4 · Testes adicionais** — "Conte o que mudou no seu último teste fechado."
- [texto] O que você fez diferente desta vez?

A etapa 4 é nova e existe por causa das reprovações: ela pergunta o que mudou **desde a
última revisão**, não o que o teste inteiro foi. Responder ali com telemetria e cobertura —
que é a resposta certa para a etapa 3 — repete o que já foi reprovado duas vezes. O que
mudou desta vez: a credencial do revisor (apontava para conta inexistente nas duas revisões,
corrigida em 03/09), os avisos automáticos que nunca saíam (401, corrigidos em 04/09) e três
pacotes publicados no período (4, 5 e 7, em 01, 08 e 10/09), cada um depois de um jogo real.

## Respostas levadas ao formulário (recomendadas; o texto final foi ajustado na hora)

| Campo | Texto |
|---|---|
| Recrutamento | Convite direto por WhatsApp e em grupos de futebol: jogadores e organizadores do meu time amador, que já usavam o app como site (PWA) antes da Play. Alguns testadores são familiares e amigos de fora do time. Não usei provedor pago de testes nem recrutamento aberto. |
| Engajamento | 3 roteiros guiados medidos por telemetria: 468 aberturas, 158 ações de presença, 14 de 17 fizeram 7 ou 8 dos 8 passos do fluxo admin. Recursos centrais cobertos; pós-jogo, não. Difere do uso real: quase todos como admin (produção é 1 para 15-30) e uso diário em vez de no dia do jogo. |
| Feedback | Coleta por WhatsApp (conversa pessoal), telemetria própria que mostra onde cada um parou e observação do aparelho quando o relato não batia. Resumo: ajustes de UX, regras de mensalidade, filtros de jogadores, perda de login e salvamento que não persistia. Houve também sugestões de evolução. |
| Mudanças | Corrigi o que o teste revelou: o aviso de inscrições abertas não chegava, porque o servidor recusava a chamada; erro falso de "não salvei" com a gravação já feita; promoção a admin que dizia ter dado certo sem aplicar; filtro que não filtrava; e PIX que recusava comprovante válido. |
| Prontidão | 30+ dias de uso por organizadores reais, com mensalidade e PIX de verdade. Fluxos centrais percorridos de ponta a ponta e medidos por telemetria, não por relato. Nenhum defeito relatado em aberto, e cada correção virou teste automatizado. Dado isolado por clube com RLS ativo no banco. |
| O que fiz diferente | Corrigi a credencial declarada ao revisor, que apontava para uma conta inexistente nas duas revisões — sem ela ninguém entrava no app. Fiz os avisos automáticos voltarem a chegar aos testadores. E lancei 3 versões no período, cada uma depois de um jogo real, com correções vindas do uso. |

Guardar isto importa: se vier outra reprovação, a primeira pergunta é o que exatamente foi
declarado — foi não ter esse registro que deixou a segunda tentativa no escuro.

---

# HISTÓRICO — formulário antigo (7 campos longos, válido até agosto/2026)

> O que está abaixo era a estrutura das duas primeiras tentativas. Mantido porque o texto
> longo é a matéria-prima das versões curtas e porque os números das duas rodadas de teste
> estão aqui.

> App: br.app.convocados · Liberação prevista: **28/08/2026** (14 dias após a revisão de 14/08).
> Perguntas conferidas no artigo oficial (answer/14151465) em 25/08/2026.
> ⚠️ `[CONFIRMAR]` = depende de você. Não invente nada aqui.
> ⚠️ O formulário **não salva** se você clicar em Descartar ou sair sem "Próxima"/"Aplicar".
> Escreva/cole tudo de uma vez, seção por seção.

## Estrutura real do formulário (7 campos)

**Parte 1 · Sobre o teste fechado** → botão "Próxima"
1. [escolha] Foi fácil recrutar testadores para o app?
2. [texto] Engajamento dos testadores durante o teste fechado, incluindo:
   • se usaram todos os recursos disponíveis no app;
   • se o uso correspondeu ao comportamento esperado do usuário de produção, **com detalhes sobre as diferenças observadas**.
3. [texto] Resuma o feedback recebido dos testadores e **descreva como ele foi coletado**.

**Parte 2 · Sobre o app/jogo** → botão "Próxima" *(não é público, não afeta a visibilidade do app)*
4. [texto] Público-alvo — "a resposta mais específica possível".
5. [texto] Proposta de valor: como o app agrega valor aos usuários.
6. [escolha] Intervalo estimado de instalações no primeiro ano.

**Parte 3 · Sobre a prontidão para produção** → botão "Aplicar"
7. [texto] Mudanças feitas no app com base no que você aprendeu no teste fechado.
8. [texto] Como você determinou que o app estava pronto para produção.

## Números de apoio

| | Rodada 1 (14–21/08) | Rodada 2 (18–25/08) |
|---|---|---|
| Contas de testador | 21 | 20 |
| Abriram o app | 20 | 17 |
| Aberturas registradas | 468 | — |
| Roteiro concluído | 15 (Presença) | 9 de 8/8 · 14 com ≥7 de 8 |
| Ações de presença | 81 confirmações + 77 cancelamentos | — |
| Ativos nas últimas 48h | — | 15 de 20 |

22 pessoas distintas · 3 estados (SC, RS, GO) · 11 versões desde 14/08 (v1.171.0 → v1.181.0).

---

# PARTE 1 · SOBRE O TESTE FECHADO

## 1 · Foi fácil recrutar testadores? `[escolha]`

Marque a opção honesta. Os dados sustentam **"fácil"** ou **"moderadamente fácil"**: 22 pessoas
entraram em cerca de duas semanas, todas vindas de grupos de futebol amador que já existiam.
Não marque "difícil" — contradiz o volume de participação que você vai descrever a seguir.

## 2 · Engajamento dos testadores `[texto]`

```
Os testadores foram recrutados dentro do público real do app: organizadores e jogadores de
times amadores de futebol, em três estados (SC, RS e GO). [CONFIRMAR: o núcleo veio de um
clube que já usava o app e o restante de organizadores de pelada conhecidos, convidados por
WhatsApp.] Ao todo, 22 pessoas participaram, nos dois papéis que o app tem: administrador
(organiza o jogo, controla mensalidade, sorteia os times) e jogador (confirma presença).

Cobertura dos recursos. Publiquei uma página de roteiros (/guia-testador) com três trilhas
guiadas — Presença, Jogadores e Mensalidades, e Sorteio de Times — e acompanhei a execução
por telemetria própria, que registra cada passo. Na primeira rodada o foco foi o fluxo do
jogador: 468 aberturas do app e 158 ações de presença (81 confirmações e 77 cancelamentos),
com 15 testadores concluindo a trilha. Na segunda rodada o foco foi o fluxo do administrador,
em um roteiro de 8 passos que percorre a lista de jogadores, a marcação de mensalidade, o
cadastro de um jogador, a confirmação de presença, a abertura do jogo da semana, dois
sorteios de times e a exclusão do jogador de teste: 9 testadores completaram os 8 passos e 14
dos 17 que abriram o app fizeram 7 ou 8. Nas últimas 48 horas, 15 dos 20 testadores estavam
ativos. As funções centrais foram todas exercitadas; o que ficou com menos cobertura foram os
recursos periféricos de pós-jogo, como o registro de resultado do campeonato e a votação de
desempenho, usados de forma espontânea por parte do grupo e não incluídos nos roteiros.

Diferenças em relação ao uso esperado em produção. Três, e todas conhecidas:
(1) o teste concentrou uso em sessões seguidas, enquanto na produção o uso se concentra em
torno do dia do jogo, uma vez por semana;
(2) a proporção de administradores foi muito maior do que será em produção — quase todos os
testadores receberam perfil de administrador para poderem percorrer os roteiros, enquanto na
produção a proporção real é de um administrador para 15 a 30 jogadores;
(3) o roteiro pedia ações que um usuário real não repete, como cadastrar e depois excluir um
jogador de teste e refazer o sorteio duas vezes seguidas.

Essas diferenças foram deliberadas: elas forçaram, em duas semanas, um volume de operações
que na produção levaria meses — e foi justamente esse excesso que revelou os problemas de uso
simultâneo descritos no campo seguinte.
```

## 3 · Feedback recebido e como foi coletado `[texto]`

```
Coletei feedback por três canais.

(1) Relato direto. [CONFIRMAR: acompanhamento por WhatsApp, individual e em grupo, pedindo
que cada testador contasse o que travou e em que passo parou.] Foi o canal que trouxe os
achados mais graves.
(2) Telemetria própria. Instrumentei o app para registrar cada passo dos roteiros e a versão
instalada, o que me mostrava exatamente onde cada pessoa parava, sem depender de quem
respondia.
(3) Observação direta em aparelho de testador, quando o relato não batia com o que a tela
mostrava.

Resumo do que foi relatado:

- Mensagens de erro falsas. Testadores com perfil de jogador viam uma tarja vermelha de "não
consegui salvar" logo após confirmar presença — e a presença tinha sido salva. O mesmo padrão
apareceu ao excluir um jogador.
- Ação que dizia ter dado certo sem ter acontecido. Um administrador promovia outro testador a
administrador, a tela confirmava e nada mudava. Só ficou visível quando olhei o aparelho do
outro testador.
- Navegação que não respondia ao toque. Um testador relatou que os filtros de "Pagos" e
"Pendentes" na lista de jogadores não faziam nada.
- Versões desencontradas. A telemetria mostrou testadores em três versões diferentes ao mesmo
tempo, o que atrasava a chegada das correções.
- Comportamento sob uso simultâneo. Com vários testadores mexendo no mesmo jogo, apareceram
perda de resultado do campeonato e voto atribuído ao jogo errado.
- Sorteio desequilibrado sem erro visível. O volume de notas acumulado no teste disparou uma
auditoria interna que encontrou a causa: a leitura das notas era truncada silenciosamente pelo
servidor, e a média incorreta alimentava o equilíbrio dos times.

Registrei cada item, corrigi e publiquei nova versão para os testadores — 11 versões desde
14/08. As correções estão detalhadas na seção sobre prontidão para produção.
```

---

# PARTE 2 · SOBRE O APP

## 4 · Público-alvo `[texto]`

```
Organizadores e jogadores de futebol amador recorrente no Brasil — a "pelada" semanal.

O usuário principal é o organizador do grupo: a pessoa que marca o jogo, controla quem
confirmou presença, cobra a mensalidade dos participantes e monta os times. Hoje ele faz isso
com uma planilha e uma lista no grupo de WhatsApp, conferindo comprovante de PIX manualmente.
Tipicamente é homem ou mulher entre 25 e 50 anos, responsável por um grupo de 15 a 30
jogadores que joga toda semana no mesmo horário.

O usuário secundário é o jogador do grupo, de 18 a 55 anos, que usa o app para confirmar
presença, ver quem já está dentro, acompanhar a própria mensalidade e ver os times sorteados.

Não é um app para o público geral de esportes nem para torcedores: só faz sentido para quem
participa de um grupo fechado que joga de forma recorrente.
```

## 5 · Proposta de valor `[texto]`

```
O Convocados substitui a planilha e a lista no grupo de WhatsApp que hoje sustentam a
organização de um time amador, resolvendo quatro trabalhos manuais que recaem sobre uma única
pessoa:

Presença. O jogador confirma em um toque. As vagas de linha e de goleiro são contadas na hora,
com fila de espera automática quando lota. O organizador para de contar mensagens no grupo
para saber quantos vêm.

Mensalidade. O organizador vê na hora quem está em dia e quem está devendo, e o jogador
acompanha a própria situação sem precisar perguntar. Isso elimina a conferência manual de
comprovante de pagamento, que é a tarefa mais penosa de quem organiza.

Times equilibrados. O sorteio distribui os jogadores confirmados considerando posição e
desempenho, em vez do sorteio aleatório que produz partidas desiguais. O sorteio é gratuito e
vai continuar sendo.

Vida do grupo. Registro de resultados, ranking do campeonato e votação anônima de desempenho
pós-jogo, que é o que mantém o grupo engajado entre uma partida e outra.

O acesso é controlado: quem se cadastra entra como pendente e só passa a ver os dados do grupo
depois que o administrador aprova.
```

## 6 · Instalações estimadas no primeiro ano `[escolha]`

Escolha a faixa **conservadora e realista**. Não há prêmio por prometer volume, e um número
inflado destoa do resto das respostas. Considerando que cada organizador que adota traz junto
um grupo de 15 a 30 jogadores, a faixa baixa (ordem de milhares, não de centenas de milhares)
é a coerente. [CONFIRMAR: escolha a faixa conforme sua própria projeção.]

---

# PARTE 3 · SOBRE A PRONTIDÃO PARA PRODUÇÃO

## 7 · Mudanças feitas com base no teste fechado `[texto]`

```
Publiquei 11 versões durante o teste fechado, da v1.171.0 à v1.181.0. As mudanças relevantes:

Erros falsos que assustavam o usuário (v1.171.0 e v1.179.0). O app tentava gravar dados fora
da permissão daquele perfil; o servidor recusava e a tela culpava a conexão, mesmo com a ação
tendo funcionado. A gravação passou a respeitar o alcance de cada perfil, e a mensagem de erro
passou a refletir a causa real — rede, recusa do servidor ou sessão expirada. O caso da
exclusão de jogador (v1.179.0) tinha a mesma raiz: o app acusava falha sem perguntar ao
servidor se a operação havia sido aplicada. Agora ele confere antes de acusar.

Confirmação de sucesso sem confirmação do servidor (v1.177.0). Ao promover outro usuário a
administrador, a tela anunciava sucesso antes da resposta do servidor, escondendo uma regra de
limite de plano que recusava a operação. O salvamento passou a esperar a confirmação, e as
recusas do banco viraram mensagens em português que explicam o motivo.

Equilíbrio do sorteio de times (v1.174.0). A leitura das notas dos jogadores era truncada
silenciosamente pelo servidor a partir de certo volume, e a média incorreta alimentava a
divisão dos times. A leitura passou a ser paginada. Nenhuma tela quebrava — só o resultado
saía errado.

Uso simultâneo (v1.173.0, v1.175.0, v1.176.0). Com vários usuários no mesmo jogo, o resultado
do campeonato podia ser perdido e um voto podia ser atribuído ao jogo errado. Corrigido.

Filtros que não respondiam (v1.181.0). Os contadores de "Pagos", "Pendentes" e "Dentro do
jogo" na lista de jogadores eram apenas visuais: mostravam o número certo e ignoravam o toque.
Viraram filtros funcionais.

Distribuição de correções (v1.172.0). Ao descobrir que os testadores estavam em versões
diferentes, criei um aviso de atualização dentro do app para Android e o removi assim que a
base convergiu.

Diagnóstico (v1.178.0 e v1.180.0). Corrigi a própria instrumentação, que estava deixando de
registrar dois passos dos roteiros. Sem isso eu não teria como saber onde os usuários param.
```

## 8 · Como determinei que o app está pronto `[texto]`

```
Usei três critérios.

Cobertura verificada, não presumida. Não me baseei em quem disse que testou: instrumentei o
app para registrar cada passo dos roteiros. Na última rodada, 14 dos 17 testadores que abriram
o app completaram 7 ou 8 dos 8 passos do roteiro do administrador, e a rodada anterior somou
158 ações de presença no fluxo do jogador. Isso significa que os três caminhos centrais do app
— confirmar presença, gerenciar jogadores e mensalidades, e sortear os times — foram
percorridos de ponta a ponta por pessoas independentes, em aparelhos e redes variados.

Nenhum problema conhecido em aberto. Todos os bugs relatados durante o teste foram corrigidos
e publicados para os testadores, e a versão em teste hoje (v1.181.0) já incorpora todos eles.
Não há relato pendente sem correção.

Proteção contra regressão. Cada correção dessas passou a ter um teste automatizado que
reproduz o problema original, verificado falhando antes da correção. O que o teste fechado
encontrou não volta silenciosamente.

O aprendizado que mudou meu critério de prontidão: os problemas sérios deste app não eram
telas quebradas — eram operações que diziam ter dado certo sem ter dado, e resultados
calculados de forma errada sem nenhum sinal de erro. Nenhum apareceria com um único usuário em
um único aparelho. Por isso o critério deixou de ser "as telas funcionam" e passou a ser "a
gravação foi confirmada pelo servidor e o resultado foi conferido", que é o padrão aplicado nas
correções acima.
```
