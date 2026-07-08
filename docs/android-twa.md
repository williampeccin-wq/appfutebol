# Empacotar o Convocados para Android (TWA / Bubblewrap)

> Guia do que roda na **sua máquina/contas** para publicar o PWA na Play Store como um app nativo (TWA — Trusted Web Activity). O PWA já está pronto (manifest, ícones, service worker, safe-area). Falta gerar o pacote Android e verificar a posse do domínio.

## Pré-requisitos
- **Node.js** instalado (já tem).
- **JDK 17** (o Bubblewrap pede; ele pode baixar o Android SDK sozinho).
- **`convocados.app.br` servindo o PWA em HTTPS** — este é o pré-requisito crítico. A TWA aponta pro manifest nesse domínio. Confirme que `https://convocados.app.br/manifest.webmanifest` e `https://convocados.app.br/` abrem o app. (Hoje o app vive no deploy do branch `main` no Cloudflare Pages — apontar `convocados.app.br` pra ele.)
- Conta de desenvolvedor **Google Play** (taxa única US$25).

## Passo a passo

### 1. Instalar o Bubblewrap
```bash
npm i -g @bubblewrap/cli
```

### 2. Inicializar o projeto TWA
```bash
bubblewrap init --manifest https://convocados.app.br/manifest.webmanifest
```
Responda:
- **Package name:** `br.app.convocados`  ⚠️ **IMUTÁVEL depois de publicado** — casa com o `assetlinks.json` já commitado.
- **App name:** `Convocados`
- **Display / theme color:** já vêm do manifest (`#0C1A38`).
- **Signing key:** deixe o Bubblewrap gerar um keystore **OU** (recomendado) use **Play App Signing** (o Google guarda a chave — se perder a sua, não consegue mais atualizar o app).

### 3. Pegar o fingerprint SHA-256 da chave
```bash
bubblewrap fingerprint
# ou, se gerou keystore manual:
keytool -list -v -keystore android.keystore -alias android | grep SHA256
```
Se usar **Play App Signing**, pegue o SHA-256 no **Play Console → App integrity → App signing key**.

### 4. Completar o `assetlinks.json` e publicar
- Edite `appfutebol_run/.well-known/assetlinks.json`: troque `SUBSTITUA_PELO_SHA256_...` pelo fingerprint do passo 3 (formato `AA:BB:CC:...`).
- Faça deploy (commit no `main` → Cloudflare Pages).
- **Verifique ao vivo:** `https://convocados.app.br/.well-known/assetlinks.json` deve retornar **200**, `Content-Type: application/json`, com o fingerprint certo. (Teste rápido no verificador do Google: https://developers.google.com/digital-asset-links/tools/generator)

> ⚠️ O `assetlinks.json` precisa estar no ar **antes** de testar o app — senão a TWA mostra a barra de URL do Chrome (sinal de que a verificação falhou).

### 5. Buildar o pacote
```bash
bubblewrap build
```
Gera:
- `app-release-signed.aab` → é o que sobe pra Play Store.
- `app-release-signed.apk` → pra instalar e testar no aparelho.

### 6. Testar no aparelho (antes de publicar)
Instale o APK e confira:
- **Sem barra de URL** (= Digital Asset Links verificado ✅).
- Login/cadastro, **Web Push** (a TWA usa o push do Chrome — a infra atual funciona), fotos, navegação.
- Safe-area (topo/rodapé) respeitando o recorte — já tratado no CSS.

### 7. Publicar na Play Store
- Play Console → criar app → subir o `.aab`.
- Preencher a ficha + **Data Safety** usando [store-privacy-labels.md](store-privacy-labels.md).
- Política de privacidade: apontar pra `https://convocados.app.br/privacidade.html`.
- Enviar pra revisão.

## Gotchas
- **Package name é definitivo** (`br.app.convocados`). Escolhido, não muda.
- **Guarde o keystore** (ou use Play App Signing) — perder = não atualizar mais.
- **targetSdkVersion:** o Bubblewrap usa uma recente; a Play exige atualizações periódicas de target.
- **iOS é outra história:** WKWebView não roda service worker → Web Push quebra. iOS = Capacitor + push nativo (Fase 3 iOS, depois). Ver [[harmonia-produtizacao]].

## O que eu (assistente) já deixei pronto no repo
- `manifest.webmanifest` completo e Convocados (name/short_name/icons 192/512/maskable/standalone/theme).
- Ícones em `img/` (16→1024 + maskable + apple-touch).
- `<head>` com manifest, theme-color, apple metas, `viewport-fit=cover`.
- Safe-area no header e na bottom-nav (ativada pelo viewport-fit=cover).
- `.well-known/assetlinks.json` (template — falta o fingerprint) + regra no `_headers`.
