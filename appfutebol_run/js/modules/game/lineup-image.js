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

const W = 1080;
const H = 1350;

const COR = {
  campo: '#1f7a44',
  campoEscuro: '#1a6b3c',
  linha: 'rgba(255,255,255,0.55)',
  fundo: '#0c1626',
  texto: '#ffffff',
  timeA: '#f0c040',   // dourado da marca
  timeB: '#7db8ff',
  chip: 'rgba(8,18,32,0.72)',
  muted: '#9fb2cc',
};

const ORDEM_LINHAS = ['gol', 'zag', 'meia', 'atk'];

function posicaoDe(player) {
  if (player?.rental_goalkeeper) return 'gol';
  const raw = String(player?.position || '').toLowerCase();
  if (raw === 'gol' || raw === 'goleiro') return 'gol';
  if (raw === 'zag') return 'zag';
  if (raw === 'atk' || raw === 'ata') return 'atk';
  return 'meia';
}

function ehTemporario(player) {
  return !!(player?.temporary || player?.guest || player?.rental_goalkeeper);
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
  ctx.fillStyle = COR.campo;
  ctx.fillRect(0, 0, W, H);

  // Faixas alternadas de grama (leitura de campo, sem pesar)
  ctx.fillStyle = COR.campoEscuro;
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

function desenharJogador(ctx, x, y, player, foto, cor) {
  const r = RAIO;

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
    ctx.fillStyle = '#14263d';
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = cor;
    ctx.font = 'bold 40px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
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
    ctx.font = '30px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧤', x + r - 8, y - r + 10);
  }

  // Nome numa tarja (legível sobre qualquer parte do gramado)
  const nome = String(player?.name || 'Jogador').split(' ')[0];
  const rotulo = ehTemporario(player) ? `${nome}*` : nome;
  ctx.font = 'bold 26px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // A tarja ENCOSTA na base do avatar (visual de escalação de TV) em vez de
  // ficar solta abaixo: economiza a altura que fazia o nome de uma fileira
  // invadir os avatares da fileira seguinte.
  const larg = Math.max(ctx.measureText(rotulo).width + 26, 92);
  const ty = y + r - 2;
  ctx.fillStyle = COR.chip;
  // roundRect é recente (Chrome 99+/Safari 16+): num Android antigo a imagem
  // inteira quebraria por causa da tarja. Canto reto é degradação aceitável.
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x - larg / 2, ty - 18, larg, 36, 10);
    ctx.fill();
  } else {
    ctx.fillRect(x - larg / 2, ty - 18, larg, 36);
  }
  ctx.fillStyle = COR.texto;
  ctx.fillText(rotulo, x, ty);
}

// Distribui os jogadores de um time em linhas por posição, dentro da metade
// do campo. `dePara` = 1 desenha de cima para baixo (Time A), -1 espelhado.
function layoutTime(players, topo, altura, sentido) {
  const grupos = ORDEM_LINHAS
    .map((pos) => players.filter((p) => posicaoDe(p) === pos))
    .filter((g) => g.length);
  if (!grupos.length) return [];

  const posicoes = [];
  // `altura / n` com o centro de cada faixa — não `altura / (n+1)`, que sobrava
  // espaço nas pontas e comprimia as fileiras a ponto da tarja de nome de uma
  // invadir os avatares da seguinte.
  const passo = altura / grupos.length;
  grupos.forEach((grupo, i) => {
    const offset = passo * (i + 0.5);
    const y = sentido === 1 ? topo + offset : topo + altura - offset;
    const larguraUtil = W - 200;
    grupo.forEach((p, j) => {
      const x = grupo.length === 1
        ? W / 2
        : 100 + (larguraUtil / (grupo.length - 1)) * j;
      posicoes.push({ player: p, x, y });
    });
  });
  return posicoes;
}

function desenharCabecalho(ctx, titulo, subtitulo) {
  ctx.fillStyle = 'rgba(8,18,32,0.78)';
  ctx.fillRect(0, 0, W, 132);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COR.texto;
  ctx.font = 'bold 46px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.fillText(titulo, W / 2, 52);
  ctx.fillStyle = COR.muted;
  ctx.font = '28px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.fillText(subtitulo, W / 2, 96);
}

function rotuloTime(ctx, texto, y, cor) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 30px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.fillStyle = cor;
  ctx.fillText(texto, W / 2, y);
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
export async function gerarImagemEscalacao(snapshot, { titulo = 'ESCALAÇÃO' } = {}) {
  const sort = snapshot?.game?.sort_result;
  if (!sort || (!sort.team_a?.length && !sort.team_b?.length)) return null;

  const byId = new Map((snapshot.players || []).map((p) => [String(p.id), p]));
  const resolver = (entry) => (entry && typeof entry === 'object') ? entry : byId.get(String(entry));
  const timeA = (sort.team_a || []).map(resolver).filter(Boolean);
  const timeB = (sort.team_b || []).map(resolver).filter(Boolean);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, W, H);
  desenharCampo(ctx);

  // Faixas dos times, com folga reservada para os rótulos TIME A / TIME B.
  const topo = 132;
  const centro = H / 2;
  const areaTopoA = topo + 46;
  const areaAltura = centro - 13 - areaTopoA;
  const areaTopoB = centro + 13;
  const posA = layoutTime(timeA, areaTopoA, areaAltura, 1);
  const posB = layoutTime(timeB, areaTopoB, areaAltura, -1);

  // Carrega todas as fotos em paralelo — uma que falhe não derruba a imagem.
  const todas = [...posA, ...posB];
  const fotos = await Promise.all(todas.map((p) => carregarFoto(getPlayerPhoto(p.player))));

  desenharCabecalho(ctx, titulo, formatarData(snapshot?.game?.game_date, snapshot?.game?.game_time));
  rotuloTime(ctx, 'TIME A', topo + 26, COR.timeA);
  rotuloTime(ctx, 'TIME B', areaTopoB + areaAltura + 38, COR.timeB);

  todas.forEach((p, i) => {
    const cor = i < posA.length ? COR.timeA : COR.timeB;
    desenharJogador(ctx, p.x, p.y, p.player, fotos[i], cor);
  });

  if (todas.some((p) => ehTemporario(p.player))) {
    ctx.textAlign = 'center';
    ctx.font = '22px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.fillStyle = COR.muted;
    ctx.fillText('* convidado', W / 2, H - 16);
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
