# Convocados

App de futebol amador: quem joga essa semana, quem pagou, quem faz o churrasco,
quem ganhou o campeonato. PWA em **vanilla JS, sem framework e sem build**, servida
como estático pelo Cloudflare Pages e empacotada como TWA no Google Play.

Tudo — código, commits, interface, documentação — é em **português do Brasil**.

## Antes de mexer em qualquer tela

Leia a skill **`design-convocados`** (`.claude/skills/design-convocados/SKILL.md`).
Ela define os tokens de cor válidos, o tema escuro, a escala de espaçamento e tipo,
os alvos de toque, o vocabulário do produto e as armadilhas conhecidas do
`app.css`. Não é opcional: o CSS tem duas paletas convivendo e 370 `!important`, e
sem essas regras cada tela nova diverge um pouco mais.

Quem usa Claude Code carrega a skill automaticamente. Quem não usa, leia o arquivo —
é markdown comum.

## Onde as coisas estão

```
appfutebol_run/          o app inteiro (é isso que o Pages publica)
  index.html             shell; não há bundler, os módulos ES carregam direto
  css/app.css            TODO o CSS, ~7,6 mil linhas, 7 telas
  js/core/app.js         router (renderTab) + telas home, weekly_game, config
  js/modules/<domínio>/  <domínio>.view.js = markup, <domínio>.service.js = lógica
  js/domain/             regras puras (sorteio, confirmações, carnê, autorização)
  js/services/           Supabase, auth, push, PIX
tests/*.regression.mjs   suíte de regressão (node --test, sem dependência)
supabase/                migrations, edge functions e SQL avulso (ADHOC_*, CRON_*)
docs/                    decisões de produto e design
landing/                 landing page, publicada à parte em www.convocados.app.br
```

A migração do markup para `js/modules/` está **pela metade**: home, jogo da semana e
config ainda moram no `core/app.js`. A tabela completa de "que tela mora onde" está
na skill.

## Rodar local

```bash
python3 .claude/dev-server.py     # http://localhost:8000
```

Serve `appfutebol_run` sem cache e injeta `?v=mtime` nos imports, então editar um
arquivo e dar F5 basta. Não abra o `index.html` por `file://` — módulos ES exigem
HTTP. O `env.js` aponta para o Supabase **dev**; o guard de ambiente bloqueia
credencial de produção em localhost de propósito.

## Antes de commitar

Rode as três checagens que a CI roda (`.github/workflows/testes.yml`):

```bash
for f in $(find appfutebol_run/js -name '*.js'); do node --input-type=module --check < "$f" || echo "QUEBRADO: $f"; done
npx --yes eslint@9.39.5
node --test "tests/*.regression.mjs"
```

O app não tem build, então o `--check` é a única validação estática de import e
sintaxe. O eslint roda **uma regra só** (`no-undef`): existe porque três chamadas de
telemetria usavam variável fora de escopo e viraram `ReferenceError` no celular do
testador.

## Versão e commits

Toda mudança que chega ao usuário sobe o `APP_VERSION` em
`appfutebol_run/js/core/version.js` (formato `vX.Y.Z-slug-curto`). Ele alimenta o
aviso de "há versão nova" dentro do app e o rodapé do login — sem bump, quem está
logado não é avisado.

Mensagem de commit descreve **o efeito para quem usa**, em português, com a versão
no fim:

```
fix(players): a linha volta a ser uma só, com o nome ganhando a largura (v1.191.0)
```

## Deploy: duas branches, três destinos

| Branch | Diretório | Vai para | O quê |
|---|---|---|---|
| `main` | `appfutebol_run/` | https://convocados.app.br | o produto, o que vai para o Play |
| `main` | `landing/` | https://www.convocados.app.br | a landing, projeto separado no Cloudflare |
| `production` | `appfutebol_run/` | https://harmoniafc-prod.pages.dev | Harmonia FC, o clube real |

Repare no **`www`**: a landing e o app são dois projetos do Cloudflare que saem da
**mesma branch**, separados só por subdomínio. Sem o `www` você cai no app.

Push para a branch → o Cloudflare publica sozinho. Conferir se subiu:

```bash
curl -s https://convocados.app.br/js/core/version.js
```

```bash
curl -s https://www.convocados.app.br/ | grep -o '<title>[^<]*</title>'
```

**As branches divergiram.** A `production` tem commits específicos do Harmonia que
não estão no `main` — nunca faça push force de uma para a outra. Para levar um fix
do Convocados ao Harmonia, use `cherry-pick` numa branch `port-v<versão>`. O
conflito quase sempre é vocabulário: o Harmonia diz "carnê" onde o Convocados diz
"churrasco".

## Direção de produto (decidido em 13/10/2026)

- **Diversão no Free, controle no Pro.** O que faz o jogo acontecer — confirmar,
  fila, sorteio, agendar a abertura das inscrições — é Free. O que gere o clube —
  dinheiro, cobrança automática, relatórios, multi-admin — é Pro. É essa a régua
  para decidir onde um recurso novo mora.
- **O Harmonia é um clube, não o padrão.** Costume de clube vira configuração no
  perfil (`js/domain/club-profile.js`), com o comportamento atual como default,
  nunca constante no código. Para configurar, preferir poucas perguntas no
  onboarding a uma tela de ajustes que só cresce.
- **Presença automática** ("todos dentro, quem não vai avisa") é
  `profile.presence.mode = 'opt_out'`. A regra mora em
  `js/domain/presenca-automatica.js` e tem **cópia idêntica** em
  `supabase/functions/auto-open-games/`: mexeu num, copie para o outro (o teste
  compara byte a byte). Design em `docs/presenca-automatica-design.md`.
- **Financeiro não sincroniza com planilha nos dois sentidos**: edição dos dois
  lados gera conflito, coluna renomeada quebra o vínculo e o escopo do Sheets
  exige verificação do Google. O caminho é exportar CSV e dar layout de desktop
  às telas de admin — o app já roda no navegador.

## Pendências

- **Presença automática, entrega 2:** lembrete na véspera para quem está dentro
  só pelo automático (`data.auto === true`), a pergunta "como o grupo confirma
  presença?" no onboarding e mostrar ao admin quem entrou sem tocar em nada.
- **Churrasco por rateio:** há clube que faz churrasco uma vez por mês e divide
  entre os presentes, sem dupla. Separar no perfil a frequência (todo jogo,
  mensal, avulso) de quem paga (dupla do rodízio ou rateio entre presentes).
  Validar com mais dois ou três grupos antes de construir.
- **Coluna Pro do `docs/freemium-plano.md`:** revisar com a régua acima — notas,
  campeonato e churrasco/rodízio parecem diversão, não controle.
- **Financeiro:** exportar CSV e layout de desktop para as telas de admin.
- A presença automática e o agendamento no Free **não foram portados** para a
  `production`. O Harmonia não precisa deles enquanto usar o modo de sempre;
  lá o clube único já vale como Pro.

## Armadilhas que já morderam

- **`club_id` em toda escrita.** O RLS é por clube (`tenant_isolation_*`). Gravação
  granular sem `club_id` volta 403. Já quebrou `players` e `presence`. Mapa em
  `docs/rls-audit-2026-08.md`.
- **"Carnê" é nome interno, "Churrasco" é o que aparece na tela.** Classes e chave
  de aba usam `carne`; todo texto visível diz churrasco. Detalhe na skill.
- **Cache em produção.** Não há `?v=` no `index.html` publicado: o `_headers` manda
  `Cache-Control: no-cache` em `/*` e um F5 normal já traz o deploy.
- **`updated_at` é o relógio do celular, não do servidor.** `game_state` e
  `app_meta` são gravados inteiros, com `updated_at: now` do aparelho, e nenhum
  trigger corrige. Nunca decida "outro cliente gravou?" comparando esses carimbos.
  Em 04/11/2026 isso apagou o resultado do jogo minutos depois de lançado: a
  pontuação não entrou e a votação de jogador não abriu. Desde a v1.213.0 (Harmonia
  v1.202.0) o `saveSplitState` relê o conteúdo do servidor e **sempre** faz o merge
  de 3 vias antes de gravar. Teste: `tests/conflito-sobrescrita.regression.mjs`.
- **A votação de jogador depende do resultado lançado.** A janela abre no
  `created_at` do resultado e dura `ratings_perf_window_hours`; a do churrasco é só
  relógio (23h → 12h). Votação de jogador "que não apareceu" quase sempre é resultado
  ausente no aparelho ou no servidor — confira `app_meta` e `push_log` antes de
  culpar o celular. Relançar o resultado empurra o início da janela.

## Pendências conhecidas

- **Corrida entre ler e gravar o `app_meta`.** O merge da v1.213.0 fecha o caso do
  relógio, mas dois aparelhos gravando no mesmo instante ainda podem perder dado.
  Fechar de vez exige o banco: carimbar `updated_at = now()` por trigger e/ou gravar
  com condição de versão. Migration manual nos dois projetos.
- **O heartbeat do sync também compara carimbos de cliente.** Um aparelho pode não
  perceber uma mudança até a próxima gravação mais nova. O trigger acima resolve as
  duas coisas.
- **Resultado lançado tarde trava a votação de jogador.** Não está decidido entre
  (a) avisar o admin quando o jogo termina sem resultado e (b) abrir a votação
  sozinha um tempo depois do jogo, mesmo sem resultado.
- **Edge Function não sobe com o push.** O push publica só o PWA. Mudou algo em
  `supabase/functions/*`, faça o deploy à mão nos **dois** projetos Supabase: o do
  Harmonia sai da branch `production` e o do Convocados sai do `main`.

## Quem vota no quê

| Votação | Quem pode votar | Janela |
|---|---|---|
| Desempenho | só quem confirmou presença no jogo, e só em quem também jogou | abre quando o admin lança o resultado |
| Churrasco | **qualquer integrante do clube**, confirmado ou não | das 23h do dia do jogo às 12h do dia seguinte |

A regra fica em dois lugares, que têm de bater: `maybeShowCarneVote` /
`maybeShowPerfVote` em `core/app.js` (decide se o modal abre) e a Edge Function
`submit-rating` (decide se o voto é gravado).

**Por que o churrasco é aberto (24/11/2026, v1.217.0 no Convocados e v1.203.0 no
Harmonia).** Antes só votava quem tinha confirmado o jogo, mais quem era "Somente
churrasco". Só que presença no jogo não diz quem comeu: quem foi só ao churrasco
ficava sem votar, e quem jogou e foi embora votava. Na medição dos 14 jogos de
19/08 a 18/11 no Harmonia, votos de quem não estava em nenhum dos dois grupos eram
1 ou 2 por jogo. O risco de fraude era pequeno, e o de deixar gente de fora,
frequente. Por isso a trava saiu.

**Pendente: auditar.** Depois de algumas semanas com a regra nova, rode
`supabase/ADHOC_churrasco_quem_votou.sql` no Harmonia. Se os "outros" (quem não
confirmou e não é "Somente churrasco") passarem muito de 1 ou 2 por jogo, o próximo
passo combinado é este: quem não confirmou o jogo toca em **"Estive no churrasco"**
antes de votar, e a aba Churrasco mostra os nomes de quem votou, sem as notas.

**Descartado: geolocalização.** O churrasco é sempre no mesmo lugar, mas a
localização no momento do voto não diz se a pessoa comeu: há quem vote na manhã
seguinte. Rastrear em segundo plano um PWA não consegue, e no Play exige uma
permissão que a loja quase sempre recusa. Além disso, exigiria versão nova no Play,
declaração de coleta de localização e cuidado com a LGPD, e a coordenada vem do
celular, sem como o servidor conferir. Só faz sentido, se fizer, como atalho
opcional por cima do "Estive no churrasco".

## Sobre o `docs/`

Boa parte descreve **plano, não implementação** — `club-profile-design.md`, por
exemplo, lista módulos de clube que existem no perfil padrão mas que o código nunca
consulta. Ao usar um doc como fonte, confirme no código antes.
