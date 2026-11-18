# Criar a conta de desenvolvedor de organização — passo a passo

Detalhamento do passo 2 de [pacote-organizacao.md](pacote-organizacao.md).
Fonte: páginas de ajuda do Play Console lidas em 10/11/2026
(answer/6112435, 13628312, 13634885, 13205715, 15633622, 10788890, 10841920).

## Antes de abrir o site do Google — deixe isso na mão

- [ ] **D-U-N-S: 630024079**
- [ ] **Razão social e endereço exatamente como estão no certificado da D&B.**
      O Google compara com o que a D&B registrou. Copie letra por letra, incluindo
      abreviações, complemento e CEP. Divergência derruba a verificação.
- [ ] **Comprovante de inscrição no CNPJ** (PDF ou foto). É um dos documentos que o
      Google aceita no Brasil, listado como "Extract from CNPJ register".
- [ ] **Seu documento com foto**, colorido, válido, **não** fotocópia: RG, CNH ou
      passaporte. "Submitting unsupported documents is the primary reason for
      developer verification failures."
- [ ] **Cartão de crédito** para os US$ 25. Aceita Mastercard, Visa, Amex, Visa
      Electron. **Não aceita pré-pago.** De preferência no nome que você declarar.
- [ ] **Telefone** que receba SMS ou ligação — vai ser **exibido publicamente** na
      página do app.
- [ ] **E-mails que recebam mensagem de verdade.** O Google manda código de 6
      dígitos para o e-mail de contato E para o e-mail de desenvolvedor.
      - Contato (não aparece na loja): `william@tambrefinanciamentos.net`
      - Desenvolvedor (**aparece na loja**): `suporte@convocados.app.br`
      **Confirme que a caixa `suporte@` existe e recebe** antes de chegar nessa
      tela; se não existir, use o `william@tambrefinanciamentos.net` nos dois.
      Não use `williampeccin@gmail.com`: o Google orienta contra e-mail pessoal
      em conta de organização.

## As duas contas Google (conferido em 10/11/2026)

| Conta | Papel |
|---|---|
| `williampeccin@gmail.com` | conta de desenvolvedor **pessoal**, dona do app atual `br.app.convocados` e das três reprovações. Abriu o tíquete 9-2775000041527. **Não serve** para a conta nova — uma conta Google só pode ter uma conta de desenvolvedor. |
| `william@tambrefinanciamentos.net` | **livre**, não tem conta de desenvolvedor. É esta que abre a conta de organização. Vantagem extra: é e-mail no domínio da empresa, não genérico — que é o que o Google pede em conta de organização. |

## Pré-passo: registrar convocados.app.br no Search Console — ✅ FEITO 10/11/2026

Feito sob `william@tambrefinanciamentos.net`, método "Arquivo HTML", arquivo
`appfutebol_run/google06d2723d58d32e53.html` (commit 6373d29).

⚠️ **Não remova esse arquivo do repositório** — o Search Console perde a verificação.

Detalhe que custou uma volta: o Cloudflare Pages tira a extensão `.html` da URL e
devolve **308** de `/google06d2723d58d32e53.html` para `/google06d2723d58d32e53`.
O Google seguiu o redirecionamento e aceitou mesmo assim. Se um dia falhar, o plano
B é a metatag no `<head>` do `index.html`, que não passa por redirecionamento.

Como o mesmo login é dono do site no Search Console e vai ser dono da conta no
Play Console, a verificação de site lá sai automática:

"the request will be automatically approved".

## Conta criada — 10/11/2026 ✅

- **Nome do desenvolvedor:** Convocados
- **Tipo:** conta da organização
- **ID da conta:** 7282005806719666194
- **Proprietária:** `william@tambrefinanciamentos.net` (não pode ser trocada)
- **Site declarado:** `https://convocados.app.br`
- **Telefone público:** +5548991520230
- **E-mail público:** `suporte@convocados.app.br`
- **D-U-N-S:** reconhecido automaticamente; razão social e endereço vieram da
  D&B sem digitação (TAMBRE LTDA, R Cel Pedro Demoro 1725 sala 304, Florianópolis)
- **Declarado no formulário:** plano pago por assinatura; `williampeccin@gmail.com`
  declarada como outra conta Google usada no Play Console, citando o caso
  9-2775000041527 — o tíquete em que o próprio suporte orientou a criar conta de
  organização e publicar um app novo.

### Pendências de verificação abertas na criação

| Tarefa | Situação |
|---|---|
| Declare seu status de comerciante | ✅ **Comerciante**, 10/11 |
| Verificar o site da organização | ✅ **Site verificado**, 10/11 — aprovação automática, porque o `convocados.app.br` já estava registrado no Search Console sob a mesma conta. Foi o pré-passo da manhã que comprou isso. |
| Confirme sua identidade | ✅ documentos enviados 10/11 (documento com foto + Comprovante de Inscrição no CNPJ). O card saiu da página inicial — falta só o Google aprovar. |
| Verificar números de telefone | ⏳ **bloqueado até o Google aprovar os documentos.** É o último da fila, de propósito. |

### Regra do e-mail de contato (descoberta só nesta tela)

O e-mail de contato (privado) tem três exigências que o formulário de inscrição
não antecipa:

> "precisa ser diferente do endereço de e-mail associado a sua Conta do Google;
> deve corresponder ao domínio do site de sua organização; precisa representar
> sua organização"

Ou seja: **não** pode ser `william@tambrefinanciamentos.net` (é o login) e
**tem** que ser `@convocados.app.br` (domínio do site declarado).

| Campo | Valor |
|---|---|
| Nome do contato | William Peccin |
| E-mail do contato (privado) | `contato@convocados.app.br` |
| Telefone para contato | +5548991520230 |
| E-mail do desenvolvedor (público) | `suporte@convocados.app.br` |
| Telefone do desenvolvedor (público) | +5548991520230 |

Os dois e-mails exigem código de 6 dígitos. O `convocados.app.br` usa **Email
Routing da Cloudflare**, que só entrega endereços com regra criada — sem regra
para `contato@` e `suporte@`, o código é descartado em silêncio.

### O que fica bloqueado enquanto a verificação não sai

O botão **Criar app** está desabilitado ("Conclua as verificações da conta para
criar apps"). Isso trava os passos 3 a 8 do plano: criar o app, preencher a
ficha, subir o AAB, pegar o SHA-256 da chave de assinatura, preencher o
assetlinks e publicar. Não há contorno — é espera.

A ordem real das telas foi: tipo de conta → nome do desenvolvedor → perfil para
pagamentos (D-U-N-S) → sua organização → perfil público → sobre você → apps →
contato → termos. A página de ajuda do Google lista a taxa antes do tipo de
conta; na prática não é essa a ordem.

## Criar a conta

### 1. Isole o login

Use a **mesma janela anônima** do Search Console, logada em
`william@tambrefinanciamentos.net`. Se a inscrição pegar a conta errada
(`williampeccin@gmail.com`), os US$ 25 vão para uma conta que já tem conta de
desenvolvedor e o dinheiro se perde.

### 2. Abra a inscrição

**https://play.google.com/apps/publish/signup**

### 3. Aceite o Contrato de Distribuição para Desenvolvedores

### 4. Pague os US$ 25

Taxa única. "If this information is determined to be invalid, your registration
fee will not be refunded" — ou seja, se a verificação de identidade reprovar por
dado inválido, não devolvem.

### 5. Tipo de conta: **Organização**

> "Choose an organization account if you're creating an account for an
> organization or business—for example, if you're engaged in commercial,
> industrial, professional, or governmental activities."

A página de ajuda não diz que dá para trocar o tipo depois. Trate como definitivo.

### 6. Preencha os dados da organização

| Campo | O que pôr | Público? |
|---|---|---|
| Developer name | `Convocados` | **sim** (pode mudar depois) |
| D-U-N-S number | `630024079` | não |
| Organization name (perfil de pagamentos) | razão social **igual à D&B** | **sim** |
| Organization address (perfil de pagamentos) | endereço **igual à D&B** | **sim** |
| Organization phone number | telefone da empresa | não |
| Organization website | `https://convocados.app.br` | não |
| Contact name | seu nome | não |
| Contact email address | e-mail no domínio | não — "This email address will not be shown on Google Play" |
| Contact phone number | seu telefone | não |
| Developer email address | e-mail no domínio | **sim** |
| Developer phone number | telefone | **sim** |

O que o Google exibe na loja: "your legal name, legal address, developer email
address, and developer phone number". Ou seja, **razão social e endereço da
Tambre aparecem na página do app**. O nome em destaque é o *Developer name*
(`Convocados`), mas o restante fica visível.

E-mails e telefone de desenvolvedor são confirmados por código de 6 dígitos
(telefone, por SMS ou ligação).

### 7. Tarefa de verificação

Vai aparecer uma tarefa de verificação na home do Console e "Verifications
pending" no perfil de pagamentos. O Google pede, para organização,
**dois tipos de documento**:

1. Registro da organização — no Brasil: comprovante de CNPJ, alvará/licença, ou
   certificado MEI.
2. Documento com foto de um representante autorizado — passaporte, RG, CNH ou
   RNE. "The government-issued photo ID can be issued in any country."

> "All submitted documents must exactly match the information in your payment
> profile." — nome, endereço, tudo.

Se perceber divergência: "you can update your payment profile information during
the verification task" — corrija no perfil de pagamentos em vez de mandar
documento que não casa.

Prazos que o Google declara: verificação do meio de pagamento "can take up to 5
days". O prazo total da verificação de identidade não está declarado em nenhuma
das páginas.

**Você não pode enviar app antes da conta estar verificada:** "You must verify
your developer account before you can submit apps for consideration on Google
Play."

### 8. Adicione seu login pessoal como administrador

Opcional, mas prático: Console da conta nova → **Usuários e permissões** →
convidar `williampeccin@gmail.com` como administrador, para conseguir olhar as
duas contas sem trocar de login.

## Armadilhas

- Entrar logado em várias contas Google ao mesmo tempo — a inscrição gruda na
  conta ativa.
- Cartão pré-pago: recusado.
- Usar o `williampeccin@gmail.com` em qualquer campo: é a conta pessoal, e o
  Google orienta explicitamente contra e-mail genérico ou pessoal em conta de
  organização.
- URL de rede social no campo de site: "You can't verify social media profile URLs."
- Confundir isso com o passo 9 do plano (Verificação de Desenvolvedor Android,
  prazo 30/09/2026) — são coisas diferentes.

## Feito — estado em 18/11/2026

A conta de organização está ativa e o app foi criado nela.

| Item | Valor |
|---|---|
| ID da conta de organização | `7282005806719666194` |
| ID do app | `4974977379650534239` |
| Pacote | `br.app.convocados.android` |
| SHA-256 da chave de **assinatura do app** (gerada pelo Google) | `82:81:07:CA:00:20:0E:BA:2B:7F:A6:BA:07:84:C7:65:B8:EB:32:18:B3:E8:98:59:E4:68:D4:C9:7B:42:DB:BF` |
| SHA-256 da chave de **upload** (nossa, no keystore) | começa em `6D:68:` — não é essa que vai no assetlinks |
| Primeiro AAB | versionCode 1, versionName 1.0.0, minSdk 24, targetSdk 36 |
| Faixa | teste interno, lista de testadores "William Peccin" (1 usuário) |

O `assetlinks.json` e o `manifest.webmanifest` do `main` já registram o pacote
novo (commit `80e4fc4`, 18/11/2026), validado pela API de Digital Asset Links do
Google.

### O que a conta de organização dispensa

O `play-producao-respostas.md` — 28 KB de respostas para o formulário de
"solicitar acesso de produção" — era exigência da conta **pessoal**. Numa conta
de organização a faixa de produção aparece direto no painel do app, sem teste
fechado, sem 12 testadores por 14 dias e sem formulário. O documento fica como
histórico.

### O que falta

As "tarefas de configuração" do painel do app: detalhes da loja, classificação
indicativa, público-alvo, segurança dos dados, anúncios, política de privacidade
e **acesso ao app** (credencial do revisor — o login é por **telefone**, não
e-mail; foi o que derrubou duas das três reprovações).

Falta gerar as **capturas de tela** do telefone. O ícone 512×512
(`appfutebol_run/img/icon-512.png`) e o feature graphic 1024×500
(`appfutebol_run/img/play-feature-graphic.png`) já existem e estão no tamanho
certo.

## Enviado para análise — 18/11/2026, 16:21

Versão `1 (1.0.0)` enviada para a faixa de **produção**, lançamento completo,
país **Brasil**. Doze mudanças foram para análise de uma vez: a versão, a ficha
da loja, classificação indicativa, público-alvo, política de privacidade,
declaração de anúncios, segurança dos dados, apps de saúde, status de
comerciante, categoria do app, detalhes do login e recursos financeiros.

Nenhuma etapa de teste fechado foi exigida — que era o motivo de existir a conta
de organização.

O que foi resolvido no mesmo dia e sustentou o envio:

- `assetlinks.json` com o pacote novo e o SHA-256 da chave de assinatura do
  Google, validado pela API de Digital Asset Links
- clube de demonstração anonimizado (`ADHOC_anonimiza_clube_demo.sql`), porque o
  revisor entra nele e a ficha é pública
- seis capturas geradas automaticamente (`scripts/capturar-telas-loja.mjs`)
- credencial do revisor (`48900000001`) testada de verdade: o próprio script de
  captura entrou com ela e navegou por todas as abas
- política de privacidade e termos deixaram de se declarar "rascunho"
- passkey ligada em produção (v1.216.0), com registro e login verificados

### Ainda em aberto

- **Instalar pelo teste interno e conferir que abre sem barra de endereço.** As
  duas pontas do `assetlinks` conferem, mas a prova no aparelho não foi feita —
  o Android do dono não liga. Um erro aqui se corrige publicando arquivo no
  site, sem nova versão no Play.
- **Verificação de Desenvolvedor Android** para `br.app.convocados.android`: o
  prazo anotado (30/09/2026) já passou e o pacote mudou de nome. Conferir.
