# Ficha da Play Store — respostas prontas, na ordem das telas

App `br.app.convocados.android` · app ID `4974977379650534239` ·
conta de organização `7282005806719666194`.

Conta de organização **não tem teste fechado obrigatório**: terminando estas
tarefas, a faixa de produção libera. Nenhum item abaixo pede testador.

Atalho para a lista de pendências:
`play.google.com/console/u/0/developers/7282005806719666194/app/4974977379650534239/app-dashboard`

---

## 1 · Política de privacidade

**Monitorar e aprimorar → Políticas e programas → Conteúdo do app → Política de Privacidade**

```
https://convocados.app.br/privacidade
```

Sem `.html` — o Cloudflare Pages remove a extensão, e uma URL que redireciona
faz a validação do Google reclamar.

---

## 2 · Acesso ao app  ⚠️ o item que já derrubou duas análises

Mesma tela, aparece como **"Detalhes do login"** — a própria página avisa que
antes se chamava "Acesso ao app".

A pergunta é **"Alguma parte do seu app é restrita?"**. Responda **Sim** (o app
exige login e o conteúdo é por clube). Aí surge o botão de adicionar instruções:

| Campo | Valor |
|---|---|
| Nome | `Login de demonstração` |
| Nome de usuário | `48900000001` |
| Senha | `123456` |

No campo de instruções, **diga que o login é por telefone**. Sem isso o revisor
tenta colar e-mail e recebe "credenciais inválidas" — foi o que aconteceu:

```
O login é feito com NÚMERO DE TELEFONE, não e-mail.

1. Abra https://convocados.app.br
2. No campo "Telefone", digite: 48900000001
3. No campo "Senha", digite: 123456
4. Toque em Entrar

A conta já está aprovada e tem perfil de administrador, com acesso a todas as
telas: jogo da semana, sorteio de times, jogadores, churrasco, campeonato e
financeiro. Não é preciso código de convite para entrar com ela.
```

---

## 3 · Anúncios

**Não**, o app não contém anúncios. Não há SDK de publicidade.

---

## 4 · Classificação indicativa (questionário)

Categoria: **Aplicativo (não é jogo)** → subcategoria **Esportes** ou
**Utilitários**.

Responda **Não** para: violência, conteúdo sexual, linguagem imprópria, drogas,
jogos de azar, conteúdo gerado por usuários com transmissão ao vivo, compras
digitais dentro do app.

Responda **Sim** para: **os usuários podem interagir** (há listas, votos e nomes
visíveis entre membros do mesmo clube — grupo fechado, aprovado pelo admin).

Resultado esperado: **Livre / L**.

---

## 5 · Público-alvo e conteúdo  ⚠️ decisão sua

O app permite cadastrar **menor de idade** com nome e consentimento do
responsável (campos `minor`, `guardian_name`, `parental_consent_at`), e hoje há
3 cadastros assim no clube de teste.

Isso cria uma escolha de verdade:

- **Marcar apenas 18+** — o que recomendo. O app é feito para o organizador da
  pelada, que é adulto; menor entra cadastrado por um adulto, não se inscreve
  sozinho. Mantém o app fora da **Política para Famílias**, que traria exigências
  próprias de publicidade, conteúdo e privacidade.
- **Incluir 13–17** — obrigaria a cumprir a Política para Famílias inteira. Só
  vale se a intenção for divulgar o app para adolescentes, o que não é o caso.

Em "o app é direcionado a crianças?" → **Não**.

---

## 6 · Segurança dos dados

O detalhamento está em [store-privacy-labels.md](store-privacy-labels.md). Resumo
do que marcar:

**Coletado** (finalidade sempre *funcionalidade do app / gestão da conta*, nunca
publicidade ou análise):

| Categoria | Tipo | Obrigatório |
|---|---|---|
| Informações pessoais | Nome | sim |
| Informações pessoais | Telefone | sim |
| Informações pessoais | Outras (data de nascimento) | sim |
| Informações financeiras | Outras (valor, data e banco da mensalidade) | opcional |
| Fotos e vídeos | Fotos (perfil e comprovante) | opcional |
| Atividade no app | Outro conteúdo gerado pelo usuário (presença, votos) | — |
| IDs do dispositivo | ID do dispositivo (token de aviso) | opcional |

**Compartilhado:** a **imagem do comprovante PIX**, com a Anthropic (EUA), só
para leitura automática. A imagem não é armazenada por lá.

**Não coletado:** localização, contatos, mensagens, saúde, histórico de
navegação, dados de diagnóstico.

Perguntas finais: criptografia em trânsito **sim**; usuário pode pedir exclusão
dos dados **sim** (há auto-exclusão dentro do app).

---

## 7 · Detalhes do app (a vitrine)

| Campo | Valor |
|---|---|
| Nome | `Convocados` |
| Categoria | Esportes |
| E-mail de contato | o mesmo da conta de desenvolvedor |
| Site | `https://convocados.app.br` |

Descrição curta (78 de 80 caracteres):

```
Organize a pelada e pare de conferir PIX na mão. Presença, times e mensalidade.
```

A descrição completa está em [play-store-listing.md](play-store-listing.md),
pronta para colar.

**Artes** — as três já existem no repositório:

| O quê | Arquivo |
|---|---|
| Ícone 512×512 | `appfutebol_run/img/icon-512.png` |
| Feature graphic 1024×500 | `appfutebol_run/img/play-feature-graphic.png` |
| 6 capturas 1125×2000 | `docs/play-assets/1-home.png` … `6-financeiro.png` |

---

## 8 · Produção

Com tudo acima verde: **Testar e lançar → Produção → Criar nova versão**.

Reaproveite o mesmo pacote que já está no teste interno (versionCode 1,
versionName 1.0.0, minSdk 24, targetSdk 36) em vez de subir outro.

Notas da versão:

```
Primeira versão do Convocados.

Confirmação de presença, sorteio de times equilibrado, controle da mensalidade
com leitura automática do comprovante PIX, rodízio do churrasco, campeonato com
ranking e caixa do grupo.
```

---

## Ainda em aberto

- **Instalar e conferir que o app abre sem barra de endereço.** O `assetlinks`
  está no ar e validado pela API do Google, e o `assetStatements` do pacote
  aponta para `convocados.app.br` — as duas pontas conferem. Falta só a prova no
  aparelho, que depende do Android voltar a ligar. Vale fazer antes de a versão
  sair do teste interno.
- **Verificação de Desenvolvedor Android** para `br.app.convocados.android`: o
  prazo anotado (30/09/2026) já passou. Conferir o estado atual antes de
  publicar.
