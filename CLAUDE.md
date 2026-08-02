# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

PWA brasileira para gestão de clubes de futebol amador (Convocados / Harmonia FC): confirmações de jogo, mensalidade com carnê, campeonato, PIX com leitura de comprovante por IA, votação de desempenho, push notifications e passkey. Arquitetura multi-tenant construída; hoje em produção como single-tenant.

## Como rodar

Não há build — arquivos estáticos servidos diretamente. **Não abrir via `file://`** (ES modules exigem HTTP).

```bash
cd appfutebol_run
python3 -m http.server 8000
# ou
npx serve -l 8000
```

Abrir `http://localhost:8000`. Login de teste admin: `48991520230` / `gagredb`.

## Deploy

Cloudflare Pages, sem CI. Processo manual:
1. Trocar `env.js` para apontar para `env.prod.js`
2. Subir os arquivos de `appfutebol_run/`
3. Bumpar a versão (`?v=x.xx.x`) nas importações para forçar reload nos clientes

`_headers` define `Cache-Control: no-cache` globalmente — é isso que torna o versionamento por query string eficaz.

## Dois ambientes, dois projetos Supabase

- `env.dev.js` → projeto DEV (`fjnelycvneutmyzjrozs`) — livre para usar em localhost
- `env.prod.js` → projeto PROD (`kpgghcrmbkrwpvtegcjh`) — bloqueado em localhost pelo `domain/environment.guard.js`

`env.js` é o arquivo ativo (symlink/cópia manual). Nunca commitar `env.js` apontando para prod.

## Arquitetura

### Estado único como blob

Todo o estado da aplicação vive em um único objeto em memória (`core/state.js`) e é persistido como um **único JSON blob** no Supabase (`app_state`, `key='default'` hoje, `key=club_id` no multi-tenant). Não há queries granulares para leitura do estado principal.

Tabelas granulares existem apenas para: `presence_confirmations`, `ratings`, `pix_receipts`, `push_subscriptions`, `push_log`.

### Storage adapter (híbrido otimista)

`domain/storage.adapter.js` escreve em `localStorage` sincronamente (UI imediata) e enfileira escrita remota no Supabase. Um contador `pendingRemoteWrites` impede que o poll de sync sobrescreva edits pendentes. Conflito detectado via `expectedUpdatedAt` — dispara o evento customizado `harmonia:remote-conflict`.

### Fluxo de boot

`app.js` → `assertRuntimeEnvironmentAllowed()` → carrega estado (remoto > local) → `validateAndRepairState()` → renderiza. Toda mutação de estado passa por `replaceState()`, que roda o repair antes de gravar.

### Renderização

Sem framework. `app.js` constrói HTML como strings e injeta em `#app`. Features ficam em `js/modules/`.

### Camadas de autorização

1. **UI:** `domain/authz.js` (client-side, UX)
2. **Freemium:** `domain/gating.js` — `isPro()` — explicitamente "UI only, servidor é autoritativo"
3. **Segurança real:** RLS no Supabase (`supabase/migrations/`)

### Confirmações — regra canônica

Toda contagem de "jogador confirmado" deve passar por `domain/confirmations.js`. Regra: `status ? status==='confirmed' : confirmed===true`, escopo estrito ao `game_key` ativo (sem fallback para outros jogos).

## Decisões de negócio que não estão no código

- **PROD travado até a loja:** Nenhuma feature nova vai ao PROD antes do Convocados ser publicado na App Store/Play Store. Só fixes de emergência sobem ao PROD, e nascem do branch `production` (não do `main`).
- **Freemium:** Free organiza o jogo; Pro gere o clube. Nunca remover do Free o que já era Free. Preço Pro: R$39,90/mês.
- **Multi-tenant em andamento:** Schema migrado e cliente parcialmente atualizado. A transição completa (passar de `key='default'` para `key=club_id`) acontece só no go-live junto com a loja.
- **PIX-IA é o diferencial principal:** Edge Function `pix-receipt` usa Haiku para extrair valor/data do comprovante. Secret `ANTHROPIC_API_KEY` necessária no Supabase.
- **Auth por telefone:** Contas no formato `phone@harmonia.app` — não são e-mails reais. Sessão em `localStorage` sob `harmonia_auth_session`.
- **Passkey:** `passkeyEnabled: false` no DEV, `true` no PROD. Fluxo funciona apenas no domínio de produção.
- **Service Worker passivo:** Não faz cache de assets (isso é responsabilidade do Cloudflare). Existe só para satisfazer critério de instalabilidade PWA e receber Web Push.
