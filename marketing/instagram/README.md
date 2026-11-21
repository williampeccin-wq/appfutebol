# Operação do Instagram — @convocados.app

A estratégia está em [`docs/plano-instagram.md`](../../docs/plano-instagram.md).
Este diretório é a **execução**: a fonte das artes, o gerador de PNG e o combinado
de quem faz o quê.

```
artes.css     tokens e estilo de todas as peças (navy + ouro)
pecas.mjs     o texto e o markup de cada peça — é AQUI que se muda uma legenda
render.mjs    gera os PNGs no tamanho exato, com o Chrome headless
saida/        os PNGs (não versionados: são derivados, rode o render)
```

## Gerar as artes

```bash
node marketing/instagram/render.mjs
```

```bash
node marketing/instagram/render.mjs 01-lancamento 02-pix-1
```

Precisa do Google Chrome instalado (ou aponte outro com `CHROME=/caminho/do/binario`).
Nenhuma dependência de npm. O script confere o tamanho de cada PNG e falha se algum
sair fora da medida ou em branco.

As dez peças:

| id | medida | onde entra |
|---|---|---|
| `01-lancamento` | 1080×1080 | semana 1, seg 23/11 |
| `02-pix-1` … `02-pix-5` | 1080×1350 | carrossel do PIX com IA, semana 1, qua 25/11 |
| `03-story-cta` | 1080×1920 | fecha qualquer sequência de stories |
| `03-story-enquete` | 1080×1920 | abre a sequência D |
| `04-capa-reel` | 1080×1920 | capa dos R1, R2, R3, R6 e R7 |
| `04-card-feed` | 1080×1080 | mesma frase da capa, em card de feed |

Para uma capa nova, troque o objeto `TEMPLATE` em `pecas.mjs` (etiqueta, duas linhas
de título e apoio) e rode o render. Os ganchos dos R1–R8 estão na seção 5 do plano.

### Armadilhas que já morderam estas artes

- **Entrelinha abaixo de 1.0 quebra acento em caixa alta.** O título vira "LESÃO",
  "DÁ", "CÊ" e o acento encosta na linha de cima. Mínimo 1.06.
- **A assinatura é absoluta no rodapé.** Conteúdo que cresce passa por cima dela se o
  `padding-bottom` do slide não reservar ~200 px.
- **Na capa de reel o texto tem que ficar no quadrado central.** O que vaza desse
  recorte some na grade do perfil. É por isso que `.tall.centro` existe.
- **Confira o PNG, não o HTML.** Três desses defeitos passaram pela revisão na tela e
  só apareceram no PNG exportado.

## Quem faz o quê

| Etapa | Quem |
|---|---|
| Calendário, gancho, legenda, hashtag, texto alternativo | Claude |
| Gerar as artes | Claude |
| **Publicar o post** | **precisa do seu ok, a cada vez** |
| Ler comentários e DMs | Claude |
| Redigir as respostas | Claude |
| **Mandar a resposta** | **precisa do seu ok, a cada vez** |
| Ler Insights e Play Console, diagnosticar, trazer decisão | Claude |

O ok vai em lote, não peça por peça: segunda, as três peças da semana prontas para um
"manda"; de manhã, as respostas do dia redigidas para um "manda". Dois ok por semana e
a conta roda. O que não acontece é post saindo sem você ter lido o texto — o nome na
conta é o seu, e a marca se sustenta justamente na promessa de que quem responde é
gente ([`docs/marca-comunicacao.md`](../../docs/marca-comunicacao.md)).

## O que falta ligar

1. **Converter @convocados.app para conta Business ou Creator.** Sem isso não há API,
   não há Insights e não há indexação no Google.
2. **Conectar o Upload-Post** (plugin já habilitado na conta) ao Instagram, pelo OAuth
   dele. O servidor do plugin **ainda não aparece nesta sessão** — plugins carregam na
   abertura da sessão, então vale conferir numa sessão nova.
3. **Decidir o grandfathering** antes de qualquer fala pública sobre preço: se quem
   entrou no lançamento mantém o PIX com IA quando o gating chegar. Até decidir, a
   fala é "hoje tá liberado pra quem está começando com a gente" — nunca "grátis".
   Seção 10 do plano.
4. **Tarefa recorrente** (segunda prepara a semana, manhã redige respostas, sexta lê os
   números) — montar depois que o pipe de publicação estiver de pé.

## Vídeo

Os reels são gravados no celular; não há geração de vídeo aqui. O que este diretório
entrega para um reel é a **capa** (`04-capa-reel`). Roteiro, cena a cena e legenda
estão na seção 5 do plano.
