# Ficha da Play Store — Convocados (rascunho pra colar no Play Console)

> Texto pronto pra colar. Revise tom/detalhes antes de enviar. Português (Brasil).

## Identidade
- **Nome do app:** `Convocados` *(máx. 30 caracteres)*
- **Package name (app novo, conta de organização):** `br.app.convocados.android`
  *(o `br.app.convocados` está queimado: package de app com instalações nunca é reutilizável)*
- **Categoria:** Esportes
- **Tags/target:** futebol amador, pelada, organização de grupo
- **E-mail de contato:** `suporte@convocados.app.br` *(o e-mail aparece público na ficha; com conta de organização, endereço da marca em vez do pessoal)*
- **Nome do desenvolvedor (público):** será a razão social verificada — `Tambre Ltda`. Conta de organização exibe razão social e endereço na página do app.
- **Política de privacidade (URL):** `https://convocados.app.br/privacidade`  *(URL canônica — o Cloudflare Pages remove o `.html`; evita redirect na validação do Google)*

## Descrição curta *(máx. 80 caracteres)*
```
Organize a pelada e pare de conferir PIX na mão. Presença, times e mensalidade.
```
*(78 caracteres. Lidera com a dor que o diferencial resolve + palavras-chave de busca: pelada, presença, times, mensalidade, PIX.)*

## Descrição completa *(máx. 4000 caracteres)*
```
A sua pelada organizada do começo ao fim — e a mensalidade que se confere sozinha.

Chega de planilha, de "quem confirmou?" no grupo do zap e de ficar conferindo comprovante de PIX na mão.

🤖 A MENSALIDADE QUE SE CONFERE SOZINHA
O jogador paga o PIX e manda o comprovante. O Convocados lê o comprovante e dá baixa automaticamente — você não confere mais nada na mão. O admin vê na hora quem está em dia e quem está devendo. Se o print vier cortado, o app pede o comprovante inteiro em vez de acusar erro.

⚽ CONFIRMAÇÃO DE PRESENÇA EM UM TOQUE
Abra a lista da semana e confirme. Vagas de linha e goleiros contadas na hora, com fila de espera automática quando lota — e quem está na fila entra sozinho assim que abre vaga.

🎽 SORTEIO DE TIMES EQUILIBRADO — E DE GRAÇA
Times sorteados pelo equilíbrio de cada jogador. Chega de time desbalanceado. Desistiu depois do sorteio? O time se atualiza na hora e o administrador é avisado para remanejar antes de todo mundo chegar no campo. E o sorteio é, e sempre vai ser, de graça.

🏆 CAMPEONATO E RANKING
Registre resultados, acompanhe o "Rei da Quadra" e o histórico de campeões do grupo.

⭐ RESENHA PÓS-JOGO
O grupo dá nota ao desempenho (e ao churrasco!). Anônimo, sem climão.

🔔 AVISOS NA HORA
Inscrições abertas, desfalque no time depois do sorteio, votação aberta, mensalidade vencendo, cadastro novo para aprovar. O administrador escolhe quais avisos o grupo recebe.

📣 RECADOS DO GRUPO
O administrador escreve um recado e ele aparece na tela inicial de todo mundo, por inteiro.

👥 FEITO PRA GRUPOS FECHADOS
Novo cadastro entra como pendente e só acessa depois que o admin aprova. Você controla quem entra.

Feito por quem joga pelada de verdade. Preço justo e transparente — e aqui a gente responde de verdade.

Convoca. Joga. Resenha.
```
*(Ordem proposital: o **diferencial (PIX-IA) como herói** no topo — é o que ninguém mais tem e o que aparece antes do "ler mais". O "de graça" só onde é compromisso seguro: **o sorteio**. Fecho com a **voz de marca** (feito por quem joga, transparência, atendimento) — atacando a fraqueza do líder.)*

> ⚠️ **Decisão a bater antes de ligar o gating (a armadilha do Chega+):** no lançamento Fase 0 tudo sai grátis, **incluindo o PIX-IA**. Como o PIX-IA é o gancho do Pro (R$39,90), quando o gating entrar, ou (a) o PIX-IA vira Pro e os grupos que já usavam free são **grandfathered** (mantêm), ou (b) fica free e o gancho do Pro passa a ser o pacote (lembrete+relatório+campeonato+sorteio inteligente). **Nunca tirar de quem já tinha** — foi o erro deles. A ficha acima NÃO promete "PIX grátis pra sempre" de propósito, justamente pra não amarrar essa mão.

## Rating de conteúdo
- Responder o questionário do Play (o app não tem conteúdo adulto/violento; coleta de dados declarada no Data Safety — ver [store-privacy-labels.md](store-privacy-labels.md)).

## Assets visuais (você gera — não dá pra eu produzir)
- **Ícone hi-res 512×512:** usar `img/icon-512.png` (já existe).
- **Feature graphic 1024×500:** criar (banner com o escudo Convocados + slogan).
- **Screenshots do telefone (mín. 2, ideal 4–8):** capturar do app rodando — sugestões: home (Hoje no Convocados, com o card de presença), lista de confirmados com a fila de espera, sorteio de times, envio de comprovante PIX, lista de jogadores com o interruptor de mensalidade, ranking do campeonato.
  *(evite a tela de login como primeira imagem — a primeira é a que aparece na busca)*

## Data Safety
- Preencher conforme [store-privacy-labels.md](store-privacy-labels.md) (coleta declarada, exclusão de conta = sim, criptografia em trânsito = sim, sem publicidade/tracking).
