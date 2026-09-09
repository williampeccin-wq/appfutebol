# Harmonia FC

App de futebol amador do Harmonia FC: quem joga essa semana, quem pagou, quem faz o
carnê, quem ganhou o campeonato. PWA em **vanilla JS, sem framework e sem build**,
servida como estático pelo Cloudflare Pages.

Tudo — código, commits, interface, documentação — é em **português do Brasil**.

## Esta branch não é a principal

O repositório tem duas branches ativas, e elas **divergiram**:

| Branch | Vai para | O quê |
|---|---|---|
| `main` | https://convocados.app.br | Convocados, o produto genérico que vai para o Play |
| **`production`** (esta) | https://harmoniafc-prod.pages.dev | Harmonia FC, o clube real |

O desenvolvimento acontece no `main`. Esta branch recebe **ports** e tem commits
próprios que o `main` não tem. **Nunca faça push force de uma para a outra.**

Para trazer um fix do Convocados:

```bash
git checkout -b port-v<versão> origin/production
git cherry-pick -n <commit do main>
# resolver, rodar os checks, commitar
git checkout production && git merge --ff-only port-v<versão>
git push origin production
```

O que esperar do conflito: `js/domain/*` e `supabase/functions/*` costumam estar
idênticos; o atrito fica em `core/app.js` e `players.view.js`, e quase sempre é
**vocabulário** — o Harmonia diz "carnê" onde o Convocados diz "churrasco".
Resolva mantendo a palavra desta branch. A suíte daqui é menor (12 arquivos contra
24) e não há `tests/README.md`: o cherry-pick conflita nele, é só remover.

## Antes de mexer em qualquer tela

Leia a skill **`design-harmonia`** (`.claude/skills/design-harmonia/SKILL.md`):
tokens de cor válidos, tema escuro, escala, alvos de toque, vocabulário e as
armadilhas do `app.css`. Ela também registra **dois bugs de contraste já corrigidos
no `main` e ainda não portados para cá** — vale ler antes de criar tela nova.

Quem usa Claude Code carrega a skill automaticamente. Quem não usa, leia o arquivo.

## Onde as coisas estão

```
appfutebol_run/          o app inteiro (é isso que o Pages publica)
  css/app.css            TODO o CSS, ~7,1 mil linhas, 6 telas
  js/core/app.js         router (renderTab) + telas home, weekly_game, config
  js/modules/<domínio>/  <domínio>.view.js = markup, <domínio>.service.js = lógica
  js/domain/             regras puras (sorteio, confirmações, carnê, autorização)
  js/services/           Supabase, auth, push, PIX
tests/*.regression.mjs   suíte de regressão (node --test, sem dependência)
supabase/                migrations, edge functions e SQL avulso (ADHOC_*, CRON_*)
docs/                    decisões de produto e design
```

Não há tela de financeiro nesta branch: `finance.service.js` existe, view não.
A migração do markup para `js/modules/` está pela metade — home, jogo da semana e
config ainda moram no `core/app.js`. Tabela completa na skill.

## Rodar local

```bash
python3 .claude/dev-server.py     # http://localhost:8000
```

Serve `appfutebol_run` sem cache e injeta `?v=mtime` nos imports. Não abra o
`index.html` por `file://` — módulos ES exigem HTTP. O `env.js` aponta para o
Supabase **dev**; o guard bloqueia credencial de produção em localhost de propósito.

## Antes de commitar

As três checagens que a CI roda (`.github/workflows/testes.yml`):

```bash
for f in $(find appfutebol_run/js -name '*.js'); do node --input-type=module --check < "$f" || echo "QUEBRADO: $f"; done
npx --yes eslint@9.39.5
node --test "tests/*.regression.mjs"
```

Sem build, o `--check` é a única validação estática de import e sintaxe. O eslint
roda **uma regra só** (`no-undef`).

## Versão e commits

Toda mudança que chega ao usuário sobe o `APP_VERSION` em
`appfutebol_run/js/core/version.js` (`vX.Y.Z-slug-curto`) — ele alimenta o aviso de
versão nova e o rodapé do login. Conferir o deploy:

```bash
curl -s https://harmoniafc-prod.pages.dev/js/core/version.js
```

Mensagem de commit descreve o efeito para quem usa, em português, com a versão no
fim: `feat(carne): "Grupo" como dupla de quem sobra no rodízio ímpar (v1.185.0)`

## Armadilhas que já morderam

- **`club_id` em toda escrita.** O RLS é por clube (`tenant_isolation_*`). Gravação
  granular sem `club_id` volta 403. Já quebrou `players` e `presence`.
- **Carnê e churrasco são coisas diferentes.** Carnê é o grupo/rodízio de pagamento
  e o rótulo da aba; churrasco é a **dupla** sorteada da semana. Detalhe na skill.
- **Cache.** O `_headers` manda `Cache-Control: no-cache` em `/*`: um F5 normal já
  traz o deploy, sem `?v=` manual.

## Sobre o `docs/`

Boa parte descreve **plano, não implementação**. Ao usar um doc como fonte,
confirme no código antes.
