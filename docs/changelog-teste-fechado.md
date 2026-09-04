# Mudanças desde o último pacote na Play (v3 · 14/08/2026)

> O Google só enxerga lançamentos na faixa: código de versão, notas da versão e o pacote.
> Deploys do PWA são invisíveis para ele. Este documento converte as 15 versões de conteúdo
> publicadas entre 14/08 e 01/09 em dois lançamentos reais na faixa Alpha.
> **Limite das notas da versão na Play: 500 caracteres por idioma.**

## Plano de lançamentos

| Pacote | Quando | Cobre | versionCode |
|---|---|---|---|
| Release A | agora (01/09) | v1.171.0 → v1.181.0 (17–25/08) | 4 |
| Release B | ~11/09, antes do reenvio | v1.182.0 → v1.185.0 + o que vier | 5 |

Build: `bubblewrap build` com o versionCode incrementado, assinado com a chave de upload
`6D:68:E2:C1:95:69:4E:40:A6:CC:4D:F2:C2:61:25:AA:58:63:5D:CE:B3:EB:F3:99:CC:E8:2A:8B:F5:8F:C2:E3`.
Subir na faixa Teste fechado - Alpha. Não afeta o contador de testadores (é por opt-in).

---

## RELEASE A — notas da versão (493 caracteres, pronto para colar)

```
Correções que vieram do teste fechado:

• Acabou o aviso falso de "não consegui salvar" ao confirmar presença e ao excluir jogador — a ação tinha funcionado.
• Promover alguém a administrador agora confirma de verdade, e explica quando não é permitido.
• Sorteio de times mais equilibrado: a média das notas era calculada com dados incompletos.
• Os filtros Pagos, Pendentes e Dentro do jogo agora filtram.
• Campeonato: o resultado não some quando outra pessoa mexe no ranking ao mesmo tempo.
```

## RELEASE B — notas da versão (475 caracteres, pronto para colar)

```
Correções e novidades desta rodada:

• Os avisos de "inscrições abertas" voltaram a chegar no celular — o envio automático estava falhando e ninguém era notificado.
• Quem tinha bloqueado as notificações agora vê como liberar, em vez de um aviso sem saída.
• Campeonato: dá para encerrar e editar a temporada, e as notas recomeçam a cada uma.
• Churrasco: só quem esteve no jogo vota, e o rodízio trata número ímpar.
```

---

## Lista completa das mudanças (para o formulário e para o seu registro)

### Erros falsos — a ação funcionava e a tela acusava falha
- **v1.171.0 (17/08)** — testador com perfil Jogador via tarja vermelha "não consegui salvar"
  logo após confirmar presença, e a presença tinha sido salva. O app tentava gravar linhas de
  outros jogadores; o servidor recusava e a tela culpava a internet. A gravação passou a
  respeitar o alcance de cada perfil, e a mensagem passou a distinguir rede, recusa 4xx e
  sessão expirada. Regressão automatizada incluída.
- **(17/08)** — havia dois listeners de falha remota com textos diferentes; todo conflito de
  concorrência exibia o toast do outro. Unificados.
- **v1.179.0 (24/08)** — excluir o jogador de teste mostrava tarja de falha, e a exclusão tinha
  funcionado. Passa a conferir no servidor antes de acusar.

### Ação que anunciava sucesso sem confirmação do servidor
- **v1.177.0 (24/08)** — promover alguém a administrador confirmava na tela e não acontecia:
  um limite de plano recusava em silêncio. O salvar passou a esperar a resposta do servidor, e
  as recusas do banco viraram texto em português. Também corrigido o baseline que fazia a sessão
  do admin desfazer a edição de perfil alheia.

### Resultado errado sem sinal de erro
- **v1.174.0 (20/08)** — a leitura das notas era truncada silenciosamente pelo servidor a partir
  de certo volume; a média incorreta alimentava o equilíbrio dos times no sorteio. Passou a ser
  paginada. Nenhuma tela quebrava — só o sorteio saía desequilibrado.

### Uso simultâneo
- **v1.173.0 (20/08)** — resultado do campeonato sumia quando outro cliente mexia no ranking.
- **v1.175.0 (20/08)** — elegibilidade do voto vinha do jogo ativo, não do jogo da janela.
- **v1.176.0 (20/08)** — `created_at` na view devolvia o voter_id.
- **(20/08)** — validação do alvo do voto e limite de tamanho da cédula.

### Navegação
- **v1.181.0 (25/08)** — os contadores Pagos, Pendentes e Dentro do jogo eram decorativos:
  mostravam o número certo e ignoravam o toque. Viraram filtros, com teste de regressão.

### Campeonato e temporada
- **v1.182.0 (31/08)** — encerrar e editar temporada; a janela da temporada passa a valer.
- **v1.183.0 (31/08)** — a nota recomeça a cada temporada e a home segue a temporada certa.

### Churrasco e votação
- **v1.184.0 (31/08)** — só quem esteve no jogo vota no churrasco; recuperado o CSS do upsell.
- **v1.184.1 (31/08)** — sócio de carnê volta a votar na dupla.
- **v1.185.0 (01/09)** — "Grupo" como dupla de quem sobra no rodízio ímpar.

### Mensalidade
- **v1.186.0 (01/09)** — virada de mês: no dia 1º todo mundo volta a "Pendente" automaticamente.
  Antes o único reset era manual (admin salvando uma data nova no Config).
- **v1.188.0 (03/09)** — **vindo do teste fechado:** o lembrete de atraso passou a chegar todo dia
  desde o dia 1º. Duas causas somadas: a virada zerava o clube inteiro mas deixava o vencimento
  no mês velho (logo, já "vencido" no dia 1º), e a data guardada no clube estava num ano errado
  digitado no Config (10/09/**2020**) — nunca corrigido porque nada nunca a movia. Agora o
  vencimento acompanha o ciclo (mesmo dia, mês novo), o servidor só cobra depois do prazo **deste
  mês**, e o push diz a data: *"sua mensalidade venceu em 10/09"*.

### Distribuição e infraestrutura (invisível ao testador)
- **(15/08)** — banner e depois modal de atualização para Android, criados ao descobrir pela
  telemetria que os testadores estavam em três versões diferentes ao mesmo tempo.
- **(17/08)** — botão "Já atualizei" cortado pela barra de navegação.
- **v1.172.0 (18/08)** — modal removido quando a base convergiu.
- **(18–19/08)** — auto-open e PIX voltam a funcionar no projeto sem tabela `clubs`; detecção de
  tabela ausente pelo código do PostgREST; `club_id` no `push_log`; falha de um clube deixa de
  calar o cron dos outros; `send-push` e `submit-rating` tolerantes ao projeto sem multi-tenant.
- **v1.178.0 / v1.180.0 (24/08)** — instrumentação dos roteiros corrigida: dois passos não
  estavam sendo gravados, o que escondia onde o testador parava.
- **(14/08)** — página `/guia-testador` com os três roteiros e registro da versão no `app_open`.

---

## Nota para o formulário de acesso à produção

A resposta sobre mudanças **não pode** dizer "11 versões publicadas": nos registros do Google isso
é um lançamento. Use a formulação que explica a arquitetura:

```
Publiquei 11 atualizações de conteúdo durante o teste. O app é uma TWA: o conteúdo é servido pela web e chega ao testador sem novo pacote, por isso o histórico de versões da faixa não reflete cada uma.
```


---

## Mudanças de 01 a 04/09 (entram no Release B)

### Notificações que nunca chegavam — o achado mais importante da semana
- **04/09 · agendador (cron)** — a abertura automática de inscrições **nunca funcionou**
  neste projeto. O `pg_cron` reportava "succeeded" em toda execução, mas isso só significa
  que a requisição foi enfileirada: a resposta HTTP real era **401
  `UNAUTHORIZED_NO_AUTH_HEADER`** em 100% das rodadas, a cada 5 minutos. O comando
  agendado mandava `Content-Type` e `x-cron-secret`, mas **faltava o header
  `Authorization`**, que o gateway exige antes de chegar na função. Consequência para o
  testador: nenhum aviso de "inscrições abertas" jamais saiu.
  **Como só se descobre testando:** o painel do agendador dizia sucesso. A verdade estava
  em `net._http_response`. Sem alguém reclamar de não receber aviso, isso ficaria invisível.

### Ativar notificações era difícil demais
- **01/09 (v1.187.0)** — o convite "Avisos no celular" ficava no **rodapé** da home e
  dentro de Perfil → Editar cadastro. Subiu para o **topo absoluto da tela inicial**, com
  destaque e botão de largura total.
- **03/09** — quem já tinha recusado a permissão via um aviso **sem botão nenhum**,
  mandando "reative nas configurações do navegador", sem dizer onde. Como o Android não
  pergunta duas vezes, era um beco sem saída. Agora há o link **"Ver como liberar"** para
  um guia com as telas (`/guia-notificacoes`).

### Medição do teste (interno — não vai nas notas da loja)
- **01/09** — medidor de sessão no clube de teste: tempo com o app em foco e número de
  interações reais (toque/tecla; scroll não conta).
- **03/09 (v1.188.0)** — ao trocar de usuário sem recarregar, o relógio seguia correndo e,
  pior, o `player` não trocava: o tempo de quem entrava era gravado sob o ID de quem saiu.
- **02/09** — o log passou a distinguir **app instalado pela Play** de **aba do navegador**
  (`twa`) e a registrar a **versão do pacote Android** (`av`), via
  `getInstalledRelatedApps()` — exigiu declarar `related_applications` no manifest.
- **01/09** — log de `push_enabled` / `push_denied` (com motivo) / `push_disabled`.

### Fora do app (não é mudança de código, mas conta na submissão)
- **04/09** — a credencial de teste declarada ao Google (`Detalhes do login`) apontava para
  uma **conta que nunca existiu**. Estava assim desde 22/07, nas duas revisões. Conta criada,
  aprovada e promovida a administradora; instruções reescritas em inglês explicando que o
  login é por **telefone**, não e-mail.

---

## Para o formulário de acesso à produção

O campo "mudanças feitas com base no que aprendeu no teste" ganha um exemplo forte, porque
mostra um problema que **só o teste com gente real revela**:

```
Descobri que os avisos automáticos de "inscrições abertas" nunca chegavam aos testadores. O agendador reportava sucesso a cada execução, mas a chamada era rejeitada com 401 por falta de um cabeçalho de autorização. Corrigi e os avisos voltaram a sair. Também movi o atalho de ativar notificações para o topo da tela inicial.
```

*(437 caracteres — cabe em campo de 500; se o limite for 300, corte a última frase.)*

**Deixe de fora** a correção da credencial de revisor: é higiene de submissão, não melhoria
do app, e não ajuda a narrativa de "evoluí o produto com o feedback".
