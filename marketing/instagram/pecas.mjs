// Peças de arte do Instagram do Convocados: o texto e o markup de cada uma.
// Isto é a FONTE do que vai publicado. Mudou a legenda ou o título? Muda aqui,
// roda `node marketing/instagram/render.mjs` e o PNG sai novo.
// Regras de fala sobre preço: docs/plano-instagram.md, seção 10. Não prometa
// "PIX com IA grátis" em nenhuma legenda deste arquivo.

const LOJA = 'https://play.google.com/store/apps/details?id=br.app.convocados.android';
const ASSINATURA = `<div class="mark"><span class="sg">Convoca. Joga. Resenha.</span><span class="hn">@convocados.app</span></div>`;
const BARRA = `<div class="goldbar"></div>`;

const pilula = (txt) => `<div class="pill"><i></i><span>${txt}</span></div>`;
const olho = (n, badge) =>
  `<div class="eyebrow"><span class="n">${n}</span><span class="ln"></span><span class="bd">${badge}</span></div>`;
const bolinhas = (ativa, total = 5) =>
  `<div class="dots">${Array.from({ length: total }, (_, i) => `<i class="${i === ativa ? 'on' : ''}"></i>`).join('')}</div>`;

// ---------------------------------------------------------------- 1 · lançamento
const lancamento = {
  id: '01-lancamento',
  nome: 'Post de lançamento',
  w: 1080, h: 1080,
  quando: 'Semana 1 · seg 23/11, 19h · pilar 4',
  legenda: `Tá no ar. O Convocados saiu do nosso grupo de pelada e foi pra loja.

Confirmar presença, sortear os times, fila de espera automática quando lota, churrasco, campeonato — e a mensalidade que se confere sozinha.

O sorteio de times e a confirmação de presença são de graça.

👉 Link na bio pra baixar no Google Play.
⚽ Marca o admin da sua pelada aqui 👇

#pelada #futebolamador #appdepelada #organizarpelada`,
  html: `
<div class="art post">
  <div class="ring"></div><div class="ring2"></div>
  <div class="ct">
    ${pilula('Já está no Google Play')}
    <h1>Convocados</h1>
    <p class="tag">O app que organiza a sua pelada.</p>
    <div class="rule"></div>
    <div class="feats">
      <div class="feat">⚽ Confirmar presença</div>
      <div class="feat">🎽 Sorteio de times</div>
      <div class="feat">⏳ Fila de espera</div>
    </div>
    <div class="cta"><span><b>Baixe agora</b><small>Grátis · Google Play · só Brasil</small></span></div>
  </div>
  <div class="foot"><span class="sg">Convoca. Joga. Resenha.</span><span class="hn">@convocados.app</span></div>
  ${BARRA}
</div>`,
};

// ------------------------------------------------------------ 2 · carrossel PIX
const slide = (n, badge, corpo, mod = '', total = 5) => `
<div class="art slide ${mod}">
  <div class="ring"></div>
  ${bolinhas(n - 1, total)}
  ${olho(String(n).padStart(2, '0'), badge)}
  ${corpo}
  ${ASSINATURA}
  ${BARRA}
</div>`;

const carrossel = [
  {
    id: '02-pix-1', nome: 'Carrossel PIX · capa', w: 1080, h: 1350,
    quando: 'Semana 1 · qua 25/11, 19h · pilar 2',
    legenda: `Conferir comprovante de mensalidade de pelada na mão é a parte mais chata de organizar. O jogador manda o comprovante do PIX e o Convocados lê e dá baixa sozinho.

Você abre e vê quem tá em dia. Pronto.

O app não movimenta dinheiro: o PIX é do jogador pra sua conta, direto. O app só lê o comprovante.

👉 Link na bio.
💾 Salva esse carrossel e manda pro tesoureiro do seu grupo.

#pelada #mensalidade #futebolamador #appdepelada`,
    html: slide(1, 'PIX com IA', `
      <h2>Ele manda o comprovante.<br><em>O app dá baixa.</em></h2>
      <p class="sub">Você não confere mais nada na mão.</p>
      <div class="swipe"><span>arrasta</span><span class="ar">→</span></div>`, 'capa'),
  },
  {
    id: '02-pix-2', nome: 'Carrossel PIX · o problema', w: 1080, h: 1350,
    html: slide(2, 'Hoje é assim', `
      <h2>30 jogadores.<br><em>30 prints.</em></h2>
      <p class="sub wide">Um por um, no meio de duzentas mensagens do grupo. Todo mês.</p>
      <div class="stack">
        <div class="rec a"><div class="t">Comprovante PIX</div><div class="v">R$ 60,00</div><div class="m">05/11 · 21:14</div></div>
        <div class="rec b"><div class="t">Comprovante PIX</div><div class="v">R$ 60,00</div><div class="m">06/11 · 08:02</div></div>
        <div class="rec c"><div class="t">Comprovante PIX</div><div class="v">R$ 60,00</div><div class="m">06/11 · 23:47</div></div>
        <span class="count">+27</span>
      </div>`),
  },
  {
    id: '02-pix-3', nome: 'Carrossel PIX · o jogador manda', w: 1080, h: 1350,
    html: slide(3, 'O jogador', `
      <h2>Paga o PIX e<br>manda o print.</h2>
      <div class="flow">
        <div class="fb"><div class="k">NO BANCO</div><div class="v">Paga a mensalidade</div></div>
        <span class="fa">→</span>
        <div class="fb"><div class="k">COMPARTILHAR</div><div class="v">Manda direto pro Convocados</div></div>
      </div>
      <p class="sub wide">No Android o comprovante vai pelo próprio “Compartilhar” do banco. Dois toques.</p>`),
  },
  {
    id: '02-pix-4', nome: 'Carrossel PIX · o app lê', w: 1080, h: 1350,
    html: slide(4, 'O app', `
      <h2>Lê o comprovante.<br><em>Baixa sozinho.</em></h2>
      <div class="phone">
        <div class="top"><i></i></div>
        <div class="bd">
          <p class="ph-t">Mensalidade · Novembro</p>
          <div class="row hl"><span class="av">C</span><span class="nmz">Caue</span><span class="st pago">PAGO</span></div>
          <div class="row"><span class="av">F</span><span class="nmz">Feijó</span><span class="st pago">PAGO</span></div>
          <div class="row"><span class="av">R</span><span class="nmz">Rodrigo</span><span class="st pago">PAGO</span></div>
          <div class="row"><span class="av">W</span><span class="nmz">Wesley</span><span class="st pend">PENDENTE</span></div>
          <div class="btn">Copiar lista de pendentes</div>
        </div>
      </div>
      <p class="sub wide">Valor, data e quem pagou. Você só abre e vê quem está em dia.</p>`),
  },
  {
    id: '02-pix-5', nome: 'Carrossel PIX · CTA', w: 1080, h: 1350,
    html: slide(5, 'Convocados', `
      <h2>A pelada inteira<br><em>num app.</em></h2>
      <div class="badges">
        <div class="bdg"><span class="ck">✓</span>Presença com fila de espera</div>
        <div class="bdg"><span class="ck">✓</span>Sorteio de times equilibrado</div>
        <div class="bdg"><span class="ck">✓</span>Churrasco, nota e campeonato</div>
      </div>
      <div class="freebox">O <b>sorteio de times</b> e a <b>confirmação de presença</b> são, e sempre vão ser, <b>de graça</b>.</div>
      <div class="ctaB"><span><b>Baixe no Google Play</b><small>convocados.app.br · só Brasil</small></span></div>`),
  },
];

// ---------------------------------------------------------------- 3 · stories
const stories = [
  {
    id: '03-story-cta', nome: 'Story · CTA para a loja', w: 1080, h: 1920,
    quando: 'Fecha qualquer sequência de stories',
    nota: 'Figurinha de link sobre a área a ~300 px da base, apontando pra loja.',
    html: `
<div class="art tall">
  <div class="ring"></div>
  ${pilula('Já está no Google Play')}
  <h2>Organiza<br>a pelada.<br><em>E a resenha.</em></h2>
  <div class="rule"></div>
  <div class="feats">
    <div class="feat"><span class="ck">✓</span>Presença num toque</div>
    <div class="feat"><span class="ck">✓</span>Sorteio de times de graça</div>
    <div class="feat"><span class="ck">✓</span>Mensalidade que se confere sozinha</div>
  </div>
  <div class="down"><span class="tx">Toca no link<br>e baixa agora</span><span class="ar">↓</span></div>
  ${ASSINATURA}
  ${BARRA}
</div>`,
  },
  {
    id: '03-story-enquete', nome: 'Story · enquete de abertura', w: 1080, h: 1920,
    nota: 'Cole a figurinha de enquete real por cima do bloco, com as mesmas 3 opções.',
    html: `
<div class="art tall">
  <div class="ring"></div>
  ${pilula('Pergunta séria')}
  <h2>Como você<br>organiza a sua<br><em>pelada hoje?</em></h2>
  <div class="qbox">
    <div class="q">Marca aí 👇</div>
    <div class="op"><i></i>Planilha</div>
    <div class="op"><i></i>Grupo do zap</div>
    <div class="op"><i></i>Na cabeça</div>
  </div>
  <div class="down"><span class="tx">Tem jeito melhor<br>no link aqui</span><span class="ar">↓</span></div>
  ${ASSINATURA}
  ${BARRA}
</div>`,
  },
];

// ------------------------------------------------- 4 · template de capa de reel
// Troque TEMPLATE pra gerar a capa de outro reel. Os ganchos dos R1–R8 estão em
// docs/plano-instagram.md, seção 5.
export const TEMPLATE = {
  etiqueta: 'O app que organiza a pelada',
  linha1: 'Sua pelada',
  linha2: 'ainda é uma planilha?',
  apoio: 'Confirmação, goleiro e fila de espera num toque.',
};

const template = (t) => [
  {
    id: '04-capa-reel', nome: 'Capa de reel (template)', w: 1080, h: 1920,
    quando: 'Capa dos R1, R2, R3, R6 e R7',
    nota: 'O texto fica dentro do quadrado central: é o recorte que a grade do perfil mostra.',
    html: `
<div class="art tall centro">
  <div class="ring"></div>
  ${pilula(t.etiqueta)}
  <h2>${t.linha1}<br><em>${t.linha2}</em></h2>
  <p class="kick">${t.apoio}</p>
  ${ASSINATURA}
  ${BARRA}
</div>`,
  },
  {
    id: '04-card-feed', nome: 'Card de feed (template)', w: 1080, h: 1080,
    html: `
<div class="art card">
  <div class="ring"></div>
  ${pilula(t.etiqueta)}
  <h2>${t.linha1}<br><em>${t.linha2}</em></h2>
  <p class="kick">${t.apoio}</p>
  ${ASSINATURA}
  ${BARRA}
</div>`,
  },
];

// ------------------------------------------------- 5 · carrossel "23h47"
// Semana 2, ter 01/12, 19h · pilar 1. É o gancho do reel R4 em carrossel, porque
// a produção de vídeo está parada (plano, seção 4).
const noite = [
  {
    id: '05-noite-1', nome: '23h47 · capa', w: 1080, h: 1350,
    quando: 'Semana 2 · ter 01/12, 19h · pilar 1',
    legenda: `Quem organiza pelada conhece o 23h47: contando quem confirmou no grupo do zap, no meio de 87 mensagens não lidas.

Confirmação de presença, vaga de goleiro separada e fila de espera automática. Você abre e já está contado.

Isso é de graça no Convocados.

👉 Link na bio.
📲 Manda pro admin do seu grupo. Ele tá acordado agora fazendo isso.

#pelada #futebolamador #organizarpelada #appdepelada`,
    html: slide(1, '23:47', `
      <h2>23:47.<br><em>E você ainda<br>tá contando.</em></h2>
      <p class="sub">A noite de quem organiza a pelada.</p>
      <div class="swipe"><span>arrasta</span><span class="ar">→</span></div>`, 'capa'),
  },
  {
    id: '05-noite-2', nome: '23h47 · o grupo', w: 1080, h: 1350,
    html: slide(2, 'O grupo do zap', `
      <h2>87 mensagens.<br><em>Nenhuma lista.</em></h2>
      <p class="sub wide">“Vou”, “acho que vou”, “se der eu vou”. Conta isso aí.</p>
      <div class="stack">
        <div class="rec msg a"><div class="t">22:14</div><div class="v">vou</div></div>
        <div class="rec msg b"><div class="t">23:02</div><div class="v">acho que vou</div></div>
        <div class="rec msg c"><div class="t">23:41</div><div class="v">se der eu vou</div></div>
        <span class="count">+84</span>
      </div>`),
  },
  {
    id: '05-noite-3', nome: '23h47 · o goleiro', w: 1080, h: 1350,
    html: slide(3, 'A conta não fecha', `
      <h2>E o goleiro?<br><em>Confirmou dois?</em></h2>
      <div class="flow">
        <div class="fb"><div class="k">VOCÊ CONTOU</div><div class="v">14 confirmados no grupo</div></div>
        <span class="fa">→</span>
        <div class="fb"><div class="k">MAS</div><div class="v">dois zagueiros e nenhum goleiro</div></div>
      </div>
      <p class="sub wide">Rolar o grupo não separa quem joga na linha de quem vai no gol.</p>`),
  },
  {
    id: '05-noite-4', nome: '23h47 · o app', w: 1080, h: 1350,
    html: slide(4, 'No Convocados', `
      <h2>Ou você abre<br><em>e já tá contado.</em></h2>
      <div class="phone">
        <div class="top"><i></i></div>
        <div class="bd">
          <p class="ph-t">Convocação · quarta</p>
          <div class="row hl"><span class="av">L</span><span class="nmz">Linha</span><span class="st pago">12/14</span></div>
          <div class="row hl"><span class="av">G</span><span class="nmz">Goleiro</span><span class="st pago">2/2</span></div>
          <div class="row"><span class="av">F</span><span class="nmz">Fila de espera</span><span class="st pend">4 NA FILA</span></div>
          <div class="btn">Confirmar presença</div>
        </div>
      </div>
      <p class="sub wide">Linha e gol contados separado. Sem rolar nada.</p>`),
  },
  {
    id: '05-noite-5', nome: '23h47 · CTA', w: 1080, h: 1350,
    html: slide(5, 'Convocados', `
      <h2>Lotou?<br><em>A fila corre só.</em></h2>
      <div class="badges">
        <div class="bdg"><span class="ck">✓</span>Presença num toque</div>
        <div class="bdg"><span class="ck">✓</span>Fila por ordem de chegada</div>
        <div class="bdg"><span class="ck">✓</span>Desistiu um, o próximo é avisado</div>
      </div>
      <div class="freebox">A <b>confirmação de presença</b>, a <b>fila de espera</b> e o <b>sorteio de times</b> são, e sempre vão ser, <b>de graça</b>.</div>
      <div class="ctaB"><span><b>Baixe no Google Play</b><small>convocados.app.br · só Brasil</small></span></div>`),
  },
];

// --------------------------------------------- 6 · carrossel "O que é grátis"
// Semana 2, qua 02/12, 19h · pilar 4. A peça que mais fala de preço do plano
// inteiro — cada palavra aqui passou pela seção 10. Nada diz que o PIX com IA é
// grátis; a fala é "hoje tá liberado pra quem está começando com a gente".
const gratis = [
  {
    id: '06-gratis-1', nome: 'Grátis · capa', w: 1080, h: 1350,
    quando: 'Semana 2 · qua 02/12, 19h · pilar 4',
    legenda: `O que é de graça num app de pelada, e o que não é. Preço na cara, sem precisar chamar ninguém no WhatsApp pra descobrir.

Organizar o jogo é de graça: confirmar presença, sortear os times, fila de espera e aprovar quem entra no clube. Isso não vira pago.

O Pro é R$39,90 por mês pelo clube todo — dá menos de uma água por jogador.

E preço combinado é preço mantido. Se um dia mudar, você fica sabendo antes, aqui, e não numa fatura.

👉 Link na bio.
💾 Salva pra quando for escolher.

#pelada #futebolamador #appdepelada #organizarpelada`,
    html: slide(1, 'Preço na cara', `
      <h2>O que é<br>de graça <em>e o<br>que não é.</em></h2>
      <p class="sub">Sem chamar ninguém no WhatsApp pra descobrir.</p>
      <div class="swipe"><span>arrasta</span><span class="ar">→</span></div>`, 'capa', 6),
  },
  {
    id: '06-gratis-2', nome: 'Grátis · o jogo', w: 1080, h: 1350,
    html: slide(2, 'De graça, sempre', `
      <h2>Organizar<br><em>o jogo.</em></h2>
      <div class="badges">
        <div class="bdg"><span class="ck">✓</span>Confirmar presença</div>
        <div class="bdg"><span class="ck">✓</span>Sorteio de times</div>
        <div class="bdg"><span class="ck">✓</span>Fila de espera</div>
        <div class="bdg"><span class="ck">✓</span>Aprovar quem entra no clube</div>
      </div>
      <p class="sub wide">Isso não vira pago depois.</p>`, '', 6),
  },
  {
    id: '06-gratis-3', nome: 'Grátis · o Pro', w: 1080, h: 1350,
    html: slide(3, 'O que o Pro abre', `
      <h2>A gestão<br><em>do clube.</em></h2>
      <div class="badges">
        <div class="bdg"><span class="ck pro">★</span>PIX com IA: o comprovante dá baixa sozinho</div>
        <div class="bdg"><span class="ck pro">★</span>Lembrete de quem está atrasado</div>
        <div class="bdg"><span class="ck pro">★</span>Campeonato completo e sorteio por nota</div>
      </div>`, '', 6),
  },
  {
    id: '06-gratis-4', nome: 'Grátis · o preço', w: 1080, h: 1350,
    html: slide(4, 'Quanto custa', `
      <h2>R$ 39,90<br><em>o clube todo.</em></h2>
      <p class="sub wide">Por mês, não por jogador. Num grupo de 20, dá menos de uma água por pessoa — e dá pra ratear.</p>
      <div class="flow">
        <div class="fb"><div class="k">VOCÊ PAGA</div><div class="v">R$ 39,90 pelo clube</div></div>
        <span class="fa">→</span>
        <div class="fb"><div class="k">NÃO PAGA</div><div class="v">por cada jogador que entra</div></div>
      </div>`, '', 6),
  },
  {
    id: '06-gratis-5', nome: 'Grátis · a promessa', w: 1080, h: 1350,
    html: slide(5, 'O combinado', `
      <h2>Se o preço mudar,<br><em>você sabe antes.</em></h2>
      <p class="sub wide">Preço combinado é preço mantido. Se um dia mudar, você fica sabendo aqui, com antecedência — nunca por uma surpresa na fatura.</p>
      <div class="freebox">O <b>PIX com IA</b> faz parte do Pro. Hoje ele tá liberado pra quem está começando com a gente.</div>`, 'folga', 6),
  },
  {
    id: '06-gratis-6', nome: 'Grátis · CTA', w: 1080, h: 1350,
    html: slide(6, 'Convocados', `
      <h2>Testa com um<br><em>mês de jogo.</em></h2>
      <p class="sub wide">Se faltar alguma coisa, me fala nos comentários. Eu respondo e eu conserto.</p>
      <div class="ctaB"><span><b>Baixe no Google Play</b><small>convocados.app.br · só Brasil</small></span></div>`, '', 6),
  },
];

// ------------------------------------------------- 7 · card do sorteio
// Semana 2, qui 03/12, 9h · pilar 2. Gancho do reel R3 em card.
const sorteio = {
  id: '07-sorteio', nome: 'Card · sorteio de times', w: 1080, h: 1080,
  quando: 'Semana 2 · qui 03/12, 9h · pilar 2',
  legenda: `Sortear time de pelada sem ninguém reclamar: o app equilibra por posição, conta o goleiro separado e respeita dupla fixa. Vinte segundos.

Depois joga os times prontos no grupo do zap.

O sorteio de times no Convocados é, e sempre vai ser, de graça.

👉 Link na bio.
⚽ Manda no grupo da sua pelada.

#pelada #sorteiodetimes #futebolamador #appdepelada`,
  html: `
<div class="art card">
  <div class="ring"></div>
  ${pilula('Vinte segundos')}
  <h2>Sorteio de times<br><em>sem reclamação.</em></h2>
  <p class="kick">Equilibrado por posição, goleiro na conta, dupla fixa respeitada — e pronto no grupo do zap.</p>
  ${ASSINATURA}
  ${BARRA}
</div>`,
};

export const LINK_LOJA = LOJA;
export const PECAS = [
  lancamento, ...carrossel, ...stories, ...template(TEMPLATE),
  ...noite, ...gratis, sorteio,
];
