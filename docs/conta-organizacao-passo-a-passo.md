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
