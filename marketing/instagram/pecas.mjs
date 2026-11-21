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
const slide = (n, badge, corpo, mod = '') => `
<div class="art slide ${mod}">
  <div class="ring"></div>
  ${bolinhas(n - 1)}
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

export const LINK_LOJA = LOJA;
export const PECAS = [lancamento, ...carrossel, ...stories, ...template(TEMPLATE)];
