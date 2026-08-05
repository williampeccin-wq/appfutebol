// Escalação dos times como IMAGEM (canvas), no formato de escalação de TV:
// campo de fundo, os dois times frente a frente, avatar + nome de cada jogador
// posicionado pela posição cadastrada.
//
// POR QUE IMAGEM E NÃO TEXTO: a lista em texto era editável no WhatsApp — o
// admin corrigia a escalação lá e o app nunca ficava sabendo (foi o que
// aconteceu em 15/07: Robson desistiu, Thiago jogou, e o campeonato pontuou o
// jogador errado). Imagem não se edita: para mudar a escalação é preciso voltar
// ao app. É poka-yoke, não trava absoluta (dá para mandar um texto depois), mas
// empurra a correção para o lugar onde ela conta.
//
// Avatares vêm do Supabase Storage, que responde `access-control-allow-origin:*`
// — por isso dá para desenhar no canvas sem "sujar" (tainted) e ainda exportar.
// Sem foto (ou se a foto falhar), cai nas iniciais: a imagem nunca deixa de sair.

import { getInitials, getPlayerPhoto } from '../players/players.service.js';
import { rotuloDoTime, timesDoSorteio } from '../../domain/draw-teams.js';
import { buildStrengthResolver } from './game.service.js';

const W = 1080;
const H = 1350;

// Mesma paleta da interface (:root do app.css). A arte deixa de ser um campo
// verde genérico e passa a parecer parte do Convocados: fundo marinho, linhas
// em azul suave, dourado da marca.
const COR = {
  fundo: '#060a16',        // --hfc-navy-900
  fundoTopo: '#0c1a38',    // --hfc-navy-800
  faixa: 'rgba(255,255,255,0.028)',
  linha: 'rgba(150,195,255,0.22)',   // --hfc-line, um pouco mais visível
  texto: '#eef2f9',        // --hfc-text
  muted: '#8b97b0',        // --hfc-text-muted
  ouro: '#f0a500',         // --hfc-gold
  chip: 'rgba(6,10,22,0.82)',
};

const ORDEM_LINHAS = ['gol', 'zag', 'meia', 'atk'];

// Cores por time. As duas primeiras são as de sempre (dourado da marca e azul);
// as demais entram só quando o clube joga com 3+.
const CORES_DE_TIME = ['#f0a500', '#8fb4ff', '#19c37d', '#ff9d7a', '#d3a4ff', '#ffc23d'];
function corDoTime(indice) {
  return CORES_DE_TIME[indice % CORES_DE_TIME.length];
}

function posicaoDe(player) {
  if (player?.rental_goalkeeper) return 'gol';
  const raw = String(player?.position || '').toLowerCase();
  if (raw === 'gol' || raw === 'goleiro') return 'gol';
  if (raw === 'zag') return 'zag';
  if (raw === 'atk' || raw === 'ata') return 'atk';
  return 'meia';
}

// Carrega a foto. Nunca rejeita: sem foto o desenho usa iniciais.
function carregarFoto(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';   // exigido p/ exportar o canvas depois
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function desenharCampo(ctx) {
  // Gradiente marinho igual ao fundo do app, em vez de gramado verde.
  const fundo = ctx.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, COR.fundoTopo);
  fundo.addColorStop(0.55, COR.fundo);
  fundo.addColorStop(1, COR.fundoTopo);
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, W, H);

  // Faixas quase imperceptíveis: dão profundidade sem virar gramado.
  ctx.fillStyle = COR.faixa;
  const faixa = H / 12;
  for (let i = 0; i < 12; i += 2) ctx.fillRect(0, i * faixa, W, faixa);

  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 4;
  const m = 36;                       // margem do gramado
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);

  // Meio-campo + círculo central
  ctx.beginPath();
  ctx.moveTo(m, H / 2); ctx.lineTo(W - m, H / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 105, 0, Math.PI * 2);
  ctx.stroke();

  // Grandes áreas
  const areaW = 420, areaH = 170;
  ctx.strokeRect((W - areaW) / 2, m, areaW, areaH);
  ctx.strokeRect((W - areaW) / 2, H - m - areaH, areaW, areaH);
}

const RAIO = 46;

// Quebra a lista em N fileiras de tamanho parecido, preservando a ordem (que já
// vem ordenada por posição, então goleiro aparece primeiro).
function emFileiras(players, quantidade) {
  if (!players.length) return [];
  const n = Math.max(1, quantidade);
  const porFileira = Math.ceil(players.length / n);
  const fileiras = [];
  for (let i = 0; i < players.length; i += porFileira) fileiras.push(players.slice(i, i + porFileira));
  return fileiras;
}

function desenharJogador(ctx, x, y, player, foto, cor, raio = RAIO) {
  const r = raio;

  // Avatar (círculo recortado) ou iniciais
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (foto) {
    // cobre o círculo mantendo proporção (equivalente a object-fit: cover)
    const escala = Math.max((r * 2) / foto.width, (r * 2) / foto.height);
    const fw = foto.width * escala, fh = foto.height * escala;
    ctx.drawImage(foto, x - fw / 2, y - fh / 2, fw, fh);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';   // --hfc-glass
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = cor;
    ctx.font = `bold ${Math.round(r * 0.85)}px -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getInitials(player?.name) || '?', x, y + 2);
  }
  ctx.restore();

  // Anel na cor do time
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = cor;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Luva do goleiro
  if (posicaoDe(player) === 'gol') {
    ctx.font = `${Math.round(r * 0.65)}px -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧤', x + r - 8, y - r + 10);
  }

  // Nome numa tarja (legível sobre qualquer parte do gramado)
  const nome = String(player?.name || 'Jogador').split(' ')[0];
  const rotulo = nome;   // sem marcador de convidado — o admin pediu a arte limpa
  const fonteNome = Math.max(14, Math.round(r * 0.56));
  ctx.font = `bold ${fonteNome}px -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // A tarja ENCOSTA na base do avatar (visual de escalação de TV) em vez de
  // ficar solta abaixo: economiza a altura que fazia o nome de uma fileira
  // invadir os avatares da fileira seguinte.
  const alturaTarja = fonteNome + 10;
  const larg = Math.max(ctx.measureText(rotulo).width + 22, r * 2);
  const ty = y + r - 2;
  ctx.fillStyle = COR.chip;
  // roundRect é recente (Chrome 99+/Safari 16+): num Android antigo a imagem
  // inteira quebraria por causa da tarja. Canto reto é degradação aceitável.
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x - larg / 2, ty - alturaTarja / 2, larg, alturaTarja, 10);
    ctx.fill();
  } else {
    ctx.fillRect(x - larg / 2, ty - alturaTarja / 2, larg, alturaTarja);
  }
  ctx.fillStyle = COR.texto;
  ctx.fillText(rotulo, x, ty);
}

// Distribui os jogadores de um time em linhas por posição, dentro da metade
// do campo. `dePara` = 1 desenha de cima para baixo (Time A), -1 espelhado.
// `porPosicao=false` (3+ times): os jogadores viram fileiras corridas, sem
// agrupar por posição. Com 3 times ninguém joga uma formação — é rodízio — e
// insistir em 4 fileiras dentro de uma faixa que encolheu deixava os avatares
// minúsculos e os nomes empilhados. Menos fileiras, mais espaço, mais legível.
function layoutTime(players, topo, altura, sentido, porPosicao = true) {
  const grupos = porPosicao
    ? ORDEM_LINHAS.map((pos) => players.filter((p) => posicaoDe(p) === pos)).filter((g) => g.length)
    : emFileiras(players, Math.min(2, Math.max(1, Math.ceil(players.length / 5))));
  if (!grupos.length) return { posicoes: [], raio: RAIO };

  // O RAIO É CALCULADO, não fixo. Com 3+ times a faixa de cada um encolhe, e um
  // raio fixo fazia a tarja de nome de uma fileira invadir os avatares da
  // seguinte — exatamente o que a renderização mostrou com 3 times.
  // A largura também limita: muitos jogadores na mesma fileira se encostariam.
  const porFileira = Math.max(...grupos.map((g) => g.length));
  const cabeNaAltura = (altura / grupos.length) * 0.40;
  const cabeNaLargura = ((W - 120) / Math.max(1, porFileira)) * 0.42;
  const r = Math.max(18, Math.min(RAIO, cabeNaAltura, cabeNaLargura));

  const posicoes = [];
  // `altura / n` com o centro de cada faixa — não `altura / (n+1)`, que sobrava
  // espaço nas pontas e comprimia as fileiras a ponto da tarja de nome de uma
  // invadir os avatares da seguinte.
  const passo = altura / grupos.length;
  grupos.forEach((grupo, i) => {
    const offset = passo * (i + 0.5);
    const y = sentido === 1 ? topo + offset : topo + altura - offset;
    // Fileira CENTRADA, com espaçamento proporcional ao raio. Espalhar sempre
    // até as bordas deixava dois jogadores em pontas opostas com um vazio
    // enorme no meio — visível assim que o clube joga com 3 times.
    // O espaçamento é limitado pela largura do CARD (avatar + tarja de nome),
    // não só pelo avatar: tarjas de nomes longos se encostavam.
    const larguraCard = Math.max(r * 2.4, 120);
    const espacamento = Math.max(larguraCard, (W - 140) / Math.max(1, grupo.length));
    const largura = Math.min(espacamento * (grupo.length - 1), W - 140);
    const inicio = (W - largura) / 2;
    grupo.forEach((p, j) => {
      posicoes.push({ player: p, x: grupo.length === 1 ? W / 2 : inicio + espacamento * j, y });
    });
  });
  return { posicoes, raio: r };
}

function desenharCabecalho(ctx, titulo, subtitulo, escudo) {
  ctx.fillStyle = 'rgba(6,10,22,0.72)';
  ctx.fillRect(0, 0, W, 132);
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 132); ctx.lineTo(W, 132); ctx.stroke();

  // Com escudo, título e escudo andam juntos e CENTRADOS como um bloco só —
  // centrar o texto e encostar o escudo na borda deixava o conjunto torto.
  const alturaEscudo = 74;
  ctx.font = 'bold 46px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  const larguraTitulo = ctx.measureText(titulo).width;
  const larguraBloco = escudo ? alturaEscudo + 18 + larguraTitulo : larguraTitulo;
  const inicio = (W - larguraBloco) / 2;

  if (escudo) {
    const proporcao = (escudo.width || 1) / (escudo.height || 1);
    ctx.drawImage(escudo, inicio, 52 - alturaEscudo / 2, alturaEscudo * proporcao, alturaEscudo);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COR.texto;
  ctx.fillText(titulo, escudo ? inicio + alturaEscudo + 18 : inicio, 52);

  ctx.textAlign = 'center';
  ctx.fillStyle = COR.muted;
  ctx.font = '28px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.fillText(subtitulo, W / 2, 100);
}

// Rodapé com a marca. É o que faz a imagem circular no WhatsApp levar o
// endereço junto — quem vê a escalação de um amigo descobre de onde ela veio.
function desenharRodape(ctx, marca) {
  const y = H - 46;
  ctx.fillStyle = 'rgba(6,10,22,0.72)';
  ctx.fillRect(0, y - 24, W, 70);
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, y - 24); ctx.lineTo(W, y - 24); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COR.ouro;
  ctx.font = 'bold 26px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.fillText(marca, W / 2, y + 2);
}

function rotuloTime(ctx, texto, y, cor) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 30px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.fillStyle = cor;
  ctx.fillText(texto, W / 2, y);
}

const ALTURA_SELO_UNIF = 130;
const LARGURA_MAX_UNIF = Math.round(ALTURA_SELO_UNIF * 0.82);

// Calcula o yTopo do uniforme de cada time: Time 0 → próximo à linha de fundo
// superior (Goal A), Time N-1 → próximo à linha de fundo inferior (Goal B).
// Com 3+ times os intermediários ficam nas divisórias de faixa.
function yUniforme(indice, total, topo, alturaUtil) {
  if (total === 1) return topo + alturaUtil - ALTURA_SELO_UNIF - 12;
  if (indice === 0) return topo + 12;
  if (indice === total - 1) return topo + alturaUtil - ALTURA_SELO_UNIF - 12;
  const faixa = alturaUtil / total;
  return topo + faixa * indice + 12;
}

// Uniforme de cada time próximo à sua linha de fundo, no lado DIREITO do campo.
function desenharUniformesCanto(ctx, uniformes, cores, topo, alturaUtil) {
  const m = 36;
  const xDireita = W - m - 10;
  const total = uniformes.length;

  uniformes.forEach((uniforme, i) => {
    if (!uniforme) return;
    const iw = uniforme.width || 1;
    const ih = uniforme.height || 1;
    const ehKitCompleto = ih / iw > 1.4;
    const sx = 0;
    const sy = ehKitCompleto ? ih * 0.02 : 0;
    const sw = iw;
    const sh = ehKitCompleto ? ih * 0.44 : ih;
    const aspecto = sw / sh;
    const largura = Math.min(ALTURA_SELO_UNIF * aspecto, LARGURA_MAX_UNIF);
    const altura = largura / aspecto;
    const yTopo = yUniforme(i, total, topo, alturaUtil);
    const xEsq = xDireita - largura;
    const r = 14;
    const traca = () => {
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(xEsq, yTopo, largura, altura, r);
      else ctx.rect(xEsq, yTopo, largura, altura);
    };
    ctx.save();
    traca();
    ctx.clip();
    ctx.drawImage(uniforme, sx, sy, sw, sh, xEsq, yTopo, largura, altura);
    ctx.restore();
    traca();
    ctx.lineWidth = 3;
    ctx.strokeStyle = cores[i] || 'rgba(255,255,255,0.7)';
    ctx.stroke();
  });
}

// Média do time: círculo na cor do time no lado ESQUERDO, na mesma altura do
// uniforme oposto — cria simetria visual dentro de cada faixa de campo.
function desenharMediaTime(ctx, media, indice, total, cor, topo, alturaUtil) {
  if (media === null) return;
  const m = 36;
  const raio = 44;
  const x = m + 10 + raio;
  const yTopo = yUniforme(indice, total, topo, alturaUtil);
  const yCenter = yTopo + ALTURA_SELO_UNIF / 2;

  ctx.beginPath();
  ctx.arc(x, yCenter, raio, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(6,10,22,0.72)';
  ctx.fill();
  ctx.strokeStyle = cor;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = cor;
  ctx.font = `bold 18px -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  ctx.fillText('★', x, yCenter - 15);
  ctx.font = `bold 26px -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  ctx.fillText(media.toFixed(1), x, yCenter + 10);
}

function formatarData(iso, hora) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return hora ? String(hora) : '';
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${dias[d.getDay()]}, ${m[3]}/${m[2]}${hora ? ` · ${hora}` : ''}`;
}

// Gera a imagem da escalação. Devolve um Blob PNG, ou null se não houver
// sorteio. `titulo` deixa o nome do clube parametrizável (multi-tenant).
// Caminho resolvido a partir do MÓDULO, não da página. Com './img/...' o
// escudo só carregava quando a página estava na raiz — qualquer outra rota (ou
// uma página de teste em subpasta) ficava sem escudo, em silêncio.
const ESCUDO_PADRAO = new URL('../../../assets/harmonia-crest.jpeg', import.meta.url).href;

export async function gerarImagemEscalacao(snapshot, { titulo = 'ESCALAÇÃO', escudoUrl = ESCUDO_PADRAO, marcaRodape = 'Harmonia FC' } = {}) {
  const sort = snapshot?.game?.sort_result;
  const listas = timesDoSorteio(sort);
  if (!listas.some((t) => t.length)) return null;

  const byId = new Map((snapshot.players || []).map((p) => [String(p.id), p]));
  const resolver = (entry) => (entry && typeof entry === 'object') ? entry : byId.get(String(entry));
  const times = listas.map((time) => time.map(resolver).filter(Boolean));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, W, H);
  desenharCampo(ctx);

  // Uma faixa horizontal por time. Com 2 times é o campo clássico (um de frente
  // para o outro); com 3+ viram faixas empilhadas — não é um campo de verdade,
  // mas é honesto: o clube que joga em rodízio não tem "dois lados".
  const topo = 132;
  const alturaUtil = H - topo - 96;   // 96 = faixa do rodapé
  const faixa = alturaUtil / times.length;
  const layouts = times.map((time, i) => layoutTime(
    time,
    topo + faixa * i + 40,
    faixa - 46,
    // Só o segundo time de um confronto de 2 é espelhado (fica "de frente").
    (times.length === 2 && i === 1) ? -1 : 1,
    times.length <= 2,
  ));
  const posPorTime = layouts.map((l) => l.posicoes);

  // Uniforme atribuído a cada time no sorteio (biblioteca do clube em settings).
  const bibliotecaUnif = Array.isArray(snapshot?.settings?.uniforms) ? snapshot.settings.uniforms : [];
  const unifPorId = new Map(bibliotecaUnif.map((u) => [String(u.id), u]));
  const unifDoTime = Array.isArray(sort?.uniforms) ? sort.uniforms : [];
  const fotosUnifPorTime = times.map((_t, i) => unifPorId.get(String(unifDoTime[i]))?.photo || null);

  // Carrega todas as fotos em paralelo — uma que falhe não derruba a imagem.
  const todas = posPorTime.flat();
  const [fotos, escudo, uniformes] = await Promise.all([
    Promise.all(todas.map((p) => carregarFoto(getPlayerPhoto(p.player)))),
    carregarFoto(escudoUrl),   // nunca rejeita: sem escudo, o título fica sozinho
    Promise.all(fotosUnifPorTime.map((src) => carregarFoto(src))),
  ]);

  const { strengthOf } = buildStrengthResolver(times.flat(), snapshot);
  // Mesma métrica do selo "⚡" no Sorteio: força normalizada dentro do plantel.
  const mediaTimes = times.map((time) => {
    const vals = time
      .filter((p) => !p?.temporary && !p?.guest && !p?.rental_goalkeeper)
      .map((p) => strengthOf(p));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  desenharCabecalho(ctx, titulo, formatarData(snapshot?.game?.game_date, snapshot?.game?.game_time), escudo);
  times.forEach((_t, i) => rotuloTime(ctx, `TIME ${rotuloDoTime(i)}`, topo + faixa * i + 22, corDoTime(i)));

  let cursor = 0;
  posPorTime.forEach((posicoes, i) => {
    posicoes.forEach((p) => {
      desenharJogador(ctx, p.x, p.y, p.player, fotos[cursor], corDoTime(i), layouts[i].raio);
      cursor += 1;
    });
  });

  const coresDosTimes = times.map((_, i) => corDoTime(i));
  desenharUniformesCanto(ctx, uniformes, coresDosTimes, topo, alturaUtil);
  mediaTimes.forEach((media, i) => desenharMediaTime(ctx, media, i, times.length, corDoTime(i), topo, alturaUtil));
  desenharRodape(ctx, marcaRodape);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
