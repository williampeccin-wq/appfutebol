# Republicar o Convocados numa conta de organização

## Por que

Três reprovações de acesso à produção (14/08, 30/08, 16/09), todas com "seu app precisa de mais
testes". A parte automática sempre passou — em 14/09 o botão estava habilitado. O que reprova é a
análise, e o motivo documentado que sobra é engajamento, medido por sinais que o Google não
detalha.

O suporte respondeu em 29/09, sem ambiguidade, que **converter a conta não resolve**:

> "converting your account to an organization account **will not remove the requirement**. Any apps
> originally created under a personal account subject to these rules will **permanently inherit**
> the testing requirement (...) even if they are later transferred to an organization account."

E indicou o caminho na mesma mensagem:

> "you could create a new organization account and publish a new app within your organization for
> direct access to the production track."

Conta de organização não faz teste fechado — nem neste app, nem nos próximos. Como o Convocados é
multi-clube e vai ter outros apps, isso deixa de ser contorno e vira a estrutura certa.

## O que já está pronto (branch `pacote-organizacao`)

- **`.well-known/assetlinks.json`**: acrescentada a entrada do package novo. A entrada antiga
  continua lá, então o app atual segue funcionando. Falta só a impressão digital — está com o
  texto `PREENCHER_COM_O_SHA256_DO_APP_SIGNING_DO_APP_NOVO`, e é isso que o passo 6 preenche.
- **`manifest.webmanifest`**: `related_applications` declara os dois packages, para o
  `getInstalledRelatedApps()` continuar reconhecendo quem tem qualquer um dos dois instalado.
- **Projeto TWA novo** em `~/Downloads/Convocados - organizacao/`, cópia do atual com
  `applicationId` trocado nos DOIS lugares do `build.gradle` (o do bloco `twaManifest`, linha 24,
  importa: ele alimenta o `providerAuthority`, que precisa ser único — com a authority repetida o
  segundo app não instala num aparelho que já tem o primeiro). versionCode 1, versionName 1.0.0.
- **AAB já construído e conferido**: package `br.app.convocados.android`, targetSdk 36, assinado
  com a MESMA chave de upload de sempre (`signing.keystore`, fingerprint `6D:68:…:C2:E3`).

O projeto antigo continua intacto em `~/Downloads/Convocados - Google Play package (1)/`.

## Passo a passo

**1. D-U-N-S.** Já solicitado (gratuito, até 30 dias úteis). Quando chegar, confira **razão social
e endereço** exatamente como a D&B registrou — o Google compara, e divergência derruba a
verificação com "We couldn't match the D-U-N-S number and the address that you provided".

**2. Criar a conta de desenvolvedor de organização** (US$ 25, uma vez). Uma conta Google só pode
ter uma conta de desenvolvedor, então use **outro e-mail** — o seu já é dono da conta pessoal.
Depois, em Usuários e permissões, adicione o seu e-mail atual como administrador.

**3. Criar o app** na conta nova: nome `Convocados`, package `br.app.convocados.android`.

**4. Preencher a ficha** usando o que já está escrito:
[play-store-listing.md](play-store-listing.md) (nome, descrição curta e completa, categoria) e
[store-privacy-labels.md](store-privacy-labels.md) (segurança de dados). Mais a classificação de
conteúdo e a URL da política de privacidade (`https://convocados.app.br/privacidade`).

**5. Subir o AAB** de `~/Downloads/Convocados - organizacao/source/app/build/outputs/bundle/release/app-release.aab`.
Pode ser como rascunho ou numa faixa de teste interno — o objetivo aqui é só fazer o Google gerar
a chave de assinatura do app.

**6. Pegar a impressão digital.** Console → Testar e lançar → **Integridade do app** → Assinatura
de apps → SHA-256 da **chave de assinatura do app** (não a de upload; a de upload é a `6D:68:…`).

**7. Preencher o assetlinks e publicar o site.** Trocar o `PREENCHER_…` pelo SHA-256 do passo 6,
mergear esta branch no `main` e conferir no ar:

```bash
curl -s https://convocados.app.br/.well-known/assetlinks.json
```

⚠️ **Sem isso a TWA abre com barra de endereço**, parecendo um navegador. É o único passo desta
lista que estraga a aparência do app se for esquecido.

**8. Lançar em produção.** Sem teste fechado, sem contador, sem formulário de acesso.

**9. Registrar o package novo** na Verificação de desenvolvedor Android (prazo geral: 30/09/2026).

**10. Avisar os testadores** para instalar o app novo quando estiver no ar.

## O que NÃO fazer

- **Não apagar o app atual.** Ele não atrapalha, e o teste fechado dele continua sendo o plano B
  caso algo trave na conta nova. Apagar também não libera o package: app com instalações na vida
  tem o nome bloqueado para sempre.
- **Não tentar transferir o app** da conta pessoal para a organização: a resposta do suporte diz
  explicitamente que a exigência acompanha o app, mesmo transferido.
