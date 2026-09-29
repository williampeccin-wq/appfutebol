# Labels de dados para as lojas — Apple Privacy Nutrition & Google Data Safety

> **Uso:** referência para preencher os formulários de privacidade no **App Store Connect** (Apple) e no **Google Play Console** (Data Safety). Inventário conferido contra o código em **29/09/2026** (revisão anterior: 08/07/2026). **Revise antes de enviar** — label impreciso é motivo de remoção, não só de rejeição.
>
> ⚠️ **PENDÊNCIA QUE BLOQUEIA O ENVIO:** o app registra telemetria de uso (`js/services/activity-log.js`)
> para TODOS os clubes — aberturas, navegação entre abas, confirmação e cancelamento de presença,
> sorteio, cadastro e exclusão de jogador, baixa de mensalidade e ativação de push, com nome e id do
> jogador. O próprio arquivo diz "REMOVER ANTES DO GO-LIVE NA LOJA". Enquanto estiver ligado, a linha
> "App info and performance ❌ sem analytics" **está errada**. Decidir antes de publicar: remover, ou
> declarar como **App activity → App interactions**. Ver a seção no fim.

## Princípios que valem para os dois
- **Nenhum rastreamento (tracking):** o app **não** tem publicidade, SDK de analytics, nem rastreamento entre apps/sites. Em "Data Used to Track You" (Apple) → **nenhum**.
- **Sem SDK de terceiros no cliente:** o único terceiro que recebe dado pessoal é a **Anthropic** (EUA), e é **server-to-server** (não um SDK embarcado), só para ler o comprovante PIX — imagem **transitória, não armazenada**.
- **Exclusão de conta:** confirmado no código (29/09) — Perfil → **"Excluir minha conta"**, com bloqueio quando a pessoa é o único administrador. Responda **"sim, usuários podem solicitar exclusão"** e informe a mesma URL pública.
- **Criptografia em trânsito:** sim (HTTPS).
- **Finalidade de tudo:** funcionalidade do app / gestão de conta. Nada de publicidade/analytics.

---

## Inventário (fonte da verdade)
| Dado | Coletado? | Onde fica | Compartilhado? |
|---|---|---|---|
| Nome | Sim | Supabase | Não |
| Telefone (login + contato) | Sim | Supabase | Não |
| Data de nascimento | Sim | Supabase | Não |
| Senha | Sim (hash) | Supabase Auth | Não |
| E-mail | **Não** — usamos identificador técnico `telefone@harmonia.app`, derivado do telefone, não um e-mail real do usuário | Supabase Auth | Não |
| Foto de perfil | Sim (opcional) | Supabase Storage | Não |
| Comprovante PIX (imagem) | Transitório (opcional) | **Não armazenado** | **Sim → Anthropic (EUA)**, só p/ leitura |
| Metadados do PIX (valor, data, beneficiário, banco, e2e) | Sim | Supabase | Não |
| Confirmações de presença | Sim | Supabase | Não |
| Votos/avaliações | Sim (exibidos anonimizados) | Supabase | Não |
| Inscrição de push (token do dispositivo) | Sim (opcional) | Supabase | Não |
| Passkey (credencial pública) | Sim (opcional) | Supabase | Não |
| Localização / Contatos do telefone / Saúde | **Não coletado** | — | — |

---

## 🍎 Apple — Privacy Nutrition Labels
Para cada tipo: **Linked to identity = Sim** (app com conta) e **Used for tracking = Não** em todos. Finalidade = **App Functionality** (a mensalidade também "Account Management").

| Categoria Apple | Tipo | Coletar? | Observação |
|---|---|---|---|
| Contact Info | **Name** | ✅ | Funcionalidade do app |
| Contact Info | **Phone Number** | ✅ | Login + contato |
| Contact Info | Email Address | ❌ | Identificador técnico derivado do telefone, não e-mail real |
| Financial Info | **Other Financial Info** | ✅ | Metadados do pagamento da mensalidade (valor/data/banco). NÃO é compra in-app da Apple |
| User Content | **Photos or Videos** | ✅ | Foto de perfil (armazenada) + imagem do comprovante PIX (transitória, enviada à Anthropic) |
| User Content | **Other User Content** | ✅ | Votos/avaliações e confirmações de presença |
| Identifiers | **User ID** | ✅ | ID da conta |
| Identifiers | **Device ID** | ✅ (se push ligado) | Token de push do dispositivo |
| Other Data | **Other Data Types** | ✅ | Data de nascimento |
| Location / Contacts / Health / Browsing & Search History / Usage Data / Diagnostics / Sensitive Info | — | ❌ | Nada disso é coletado |

**Data Used to Track You:** nenhum.

> Nota Apple: a nutrition label cobre o que o **app + SDKs embarcados** coletam. A Anthropic é chamada **server-side** (não é SDK no app), então não entra como "third-party SDK"; mesmo assim, declaramos a transferência na Política de Privacidade por transparência (LGPD art. 33).

---

## 🤖 Google — Data Safety
Google separa **Collected** (vai pros seus servidores) de **Shared** (vai a terceiros). Para cada: finalidade = **App functionality / Account management**; **não** para publicidade/analytics.

### Coletado
| Categoria Google | Tipo | Obrigatório? |
|---|---|---|
| Personal info | **Name** | Obrigatório |
| Personal info | **Phone number** | Obrigatório |
| Personal info | **Other info** (data de nascimento) | Obrigatório |
| Financial info | **Other financial info** (metadados da mensalidade paga por PIX, fora do app) | Opcional |
| Photos and videos | **Photos** (foto de perfil + comprovante) | Opcional |
| App activity | **Other user-generated content** (votos, confirmações) | — |
| App activity | **App interactions** (telemetria de uso — ver pendência no topo) | Obrigatório **se a telemetria for mantida** |
| Device or other IDs | **Device or other IDs** (token de push) | Opcional |
| App info and performance | — | ❌ (sem relatório de falhas; ver pendência da telemetria) |
| Location / Contacts / Messages / Health | — | ❌ |

### Compartilhado (Shared)
| Dado | Com quem | Finalidade |
|---|---|---|
| **Imagem do comprovante PIX** (Photos) | Anthropic (EUA) | Funcionalidade do app (leitura automática do comprovante) |

> Nuance Google: há exceção de "sharing" para **processamento por prestador de serviço em seu nome** (o dado é processado e **não** armazenado pelo terceiro). O envio à Anthropic é transitório e não armazenado → pode se enquadrar como *processamento*, não *compartilhamento*. Na dúvida, **declare como compartilhado** (mais conservador) e descreva a finalidade.

### Perguntas obrigatórias do Data Safety
- **Dados criptografados em trânsito?** → **Sim**.
- **Usuários podem pedir exclusão dos dados?** → **Sim** (auto-exclusão in-app + web em convocados.app.br).
- **Coleta é opcional para alguns dados?** → Foto, push e comprovante PIX são **opcionais**; nome/telefone são obrigatórios.
- **App direcionado a crianças (Play Families)?** → depende se o grupo tem menores (decisão pendente). Se sim, há obrigações adicionais.

---

## Telemetria: remover ou declarar (decidir antes de publicar)

O `activity-log.js` nasceu como instrumento do piloto de testadores, para saber quem abria o app —
era a única forma de medir o teste fechado. Na conta de organização esse motivo deixa de existir,
porque não há mais teste fechado a provar.

**Opção A — remover.** Apagar `js/services/activity-log.js`, as chamadas em `core/app.js` e a tabela
`public.activity_log`. O Data Safety fica exatamente como está escrito aqui, sem linha de analytics.
É o que o próprio arquivo manda fazer.

**Opção B — manter e declarar.** Marcar **App activity → App interactions** como coletado, finalidade
*App functionality / Analytics*. Nesse caso vale tirar o campo `name` do payload: o `player_id` já
identifica, e duplicar o nome em cada linha de log é PII desnecessária.

O `tester-meter.js` (tempo de sessão) **não** entra nessa decisão: ele já é travado no clube de teste
(`if (String(clubId) !== CLUBE_TESTE) return`) e nunca roda para usuário real.

## ⚠️ Pendências que afetam os labels
- **Menores de 18:** se houver, ambas as lojas exigem tratamento especial (Apple Kids Category / Google Families) e consentimento parental. Definir.
- **E-mail real:** hoje NÃO coletamos (identificador técnico). Se um dia pedir e-mail de verdade, atualizar os dois labels.
- **Confirme na submissão** que nada de analytics/publicidade foi adicionado — qualquer SDK futuro muda os labels.
