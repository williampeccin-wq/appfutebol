# Runway de publicação — Convocados na Play Store

> Fonte única da trilha até publicar. Android primeiro (TWA); iOS depois. **Nada aqui toca o Harmonia PROD** — a migração do clube ao vivo é evento único, só DEPOIS de publicar.
> Legenda: ✅ feito · 🔜 próximo · ⏳ depende de você · 🤖 eu (assistente) · 👤 você

## 1. Prontidão do app (código) — quase tudo ✅
| Item | Status |
|---|---|
| PWA: manifest Convocados + ícones (16→1024+maskable) + service worker | ✅ 🤖 |
| Rebrand visível Harmonia→Convocados | ✅ 🤖 (v1.114.0) |
| Auto-exclusão de conta (bloqueador de loja) | ✅ 🤖 (v1.111.0) |
| Auto-cadastro com aprovação do admin + push | ✅ 🤖 (v1.113.0) |
| Páginas legais + links no app + consentimento no cadastro | ✅ 🤖 (falta preencher dados) |
| Prep TWA: assetlinks + viewport-fit + safe-area | ✅ 🤖 (v1.115.0) |
| Defense-in-depth anon (migração) | ✅ 🤖 (falta rodar) |

## 2. Fechar os bloqueadores de loja restantes
| Item | Status | Quem |
|---|---|---|
| **Menores de 18 no grupo?** → se sim, consentimento parental (LGPD art.14 + ECA) + ajuste no cadastro/labels/política | ⏳ | 👤 responder → 🤖 implementa |
| Preencher `{{dados}}` da política/termos (controlador, CNPJ/CPF, e-mail, cidade, data) | ⏳ | 👤 passa → 🤖 preenche |
| Revisão jurídica da política/termos | ⏳ | 👤 |
| Rodar 2 migrações no DEV (guard_pending + anon-revoke) → eu fecho os testes | ⏳ | 👤 roda → 🤖 verifica |
| Testar push num aparelho de admin | ⏳ | 👤 |
| Limpar usuários de teste no DEV | ⏳ | 👤 |

## 3. Infraestrutura de publicação
| Item | Status | Quem |
|---|---|---|
| **`convocados.app.br` servindo o PWA em HTTPS** (apontar o domínio pro deploy do `main` no Cloudflare Pages) | ⏳ **crítico** | 👤 |
| `assetlinks.json` no ar em `/.well-known/` (já commitado; falta o fingerprint) | ⏳ | 👤 (após gerar a chave) |

## 4. Empacotar Android (TWA) — ver [android-twa.md](android-twa.md)
| Item | Status | Quem |
|---|---|---|
| `bubblewrap init` (package `br.app.convocados`) | 🔜 ⏳ | 👤 |
| Gerar chave / Play App Signing → pegar SHA-256 → colar no assetlinks → deploy → verificar ao vivo | 🔜 ⏳ | 👤 |
| `bubblewrap build` → AAB + testar APK no aparelho (sem barra de URL = ok) | 🔜 ⏳ | 👤 |

## 5. Submissão na Play Store
| Item | Status | Quem |
|---|---|---|
| Conta de desenvolvedor Google Play (US$25, única) | ⏳ | 👤 |
| Ficha da loja (nome/descrição/screenshots/feature graphic) — copy pronto em [play-store-listing.md](play-store-listing.md) | ✅ copy 🤖 / screenshots ⏳ 👤 | ambos |
| Data Safety — preencher com [store-privacy-labels.md](store-privacy-labels.md) | ✅ mapa 🤖 / preencher ⏳ 👤 | ambos |
| Subir AAB → revisão → publicar | ⏳ | 👤 |

## 6. Pós-publicação — migração do Harmonia (evento único)
Só aqui o clube ao vivo migra pro Convocados publicado. Referência do que entra: [[harmonia-promocao-prod-plano]]. **Não antes.**

---

## 🎯 O caminho crítico (o que trava tudo)
1. **`convocados.app.br` no ar** (sem isso a TWA não valida) — 👤
2. **Bubblewrap + chave + assetlinks com fingerprint** — 👤
3. **Conta Play + AAB** — 👤

## O que EU posso adiantar enquanto isso (é só pedir)
- Implementar o consentimento parental (assim que você disser se há menores).
- Preencher os `{{dados}}` da política (assim que você passar).
- Gerar o **feature graphic**/screenshots a partir do preview (posso capturar telas).
- Qualquer ajuste fino de UX/PWA antes de empacotar.
