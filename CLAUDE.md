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
landing/                 landing page, publicada à parte
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

## Deploy: duas branches, dois destinos

| Branch | Vai para | O quê |
|---|---|---|
| `main` | https://convocados.app.br | o produto, o que vai para o Play |
| `production` | https://harmoniafc-prod.pages.dev | Harmonia FC, o clube real |

Push para a branch → o Cloudflare publica sozinho. Conferir se subiu:

```bash
curl -s https://convocados.app.br/js/core/version.js
```

**As branches divergiram.** A `production` tem commits específicos do Harmonia que
não estão no `main` — nunca faça push force de uma para a outra. Para levar um fix
do Convocados ao Harmonia, use `cherry-pick` numa branch `port-v<versão>`. O
conflito quase sempre é vocabulário: o Harmonia diz "carnê" onde o Convocados diz
"churrasco".

## Armadilhas que já morderam

- **`club_id` em toda escrita.** O RLS é por clube (`tenant_isolation_*`). Gravação
  granular sem `club_id` volta 403. Já quebrou `players` e `presence`. Mapa em
  `docs/rls-audit-2026-08.md`.
- **"Carnê" é nome interno, "Churrasco" é o que aparece na tela.** Classes e chave
  de aba usam `carne`; todo texto visível diz churrasco. Detalhe na skill.
- **Cache em produção.** Não há `?v=` no `index.html` publicado: o `_headers` manda
  `Cache-Control: no-cache` em `/*` e um F5 normal já traz o deploy.

## Sobre o `docs/`

Boa parte descreve **plano, não implementação** — `club-profile-design.md`, por
exemplo, lista módulos de clube que existem no perfil padrão mas que o código nunca
consulta. Ao usar um doc como fonte, confirme no código antes.
