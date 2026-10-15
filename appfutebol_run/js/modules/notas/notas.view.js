// Markup das Notas da rodada: o card da home e o popup com o ranking.
// A regra de quando aparece e o cálculo moram em notas.service.js.

import { formatarMedia } from './notas.service.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// "sáb, 11/10"
function dataCurta(gameDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(gameDate || ''));
  if (!m) return '';
  const dia = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
  return `${DIAS[dia]}, ${m[3]}/${m[2]}`;
}

function horaDe(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : ''}`;
}

function nomeDe(jogadores, id) {
  return jogadores.find((p) => String(p.id) === String(id))?.name || 'Jogador';
}

/**
 * Card da home. `linhas` = notasDaRodada(); null enquanto carrega.
 */
export function renderNotasRodadaCard({ jogo, linhas, meuId, jogadores, fechaEmMs }) {
  const craque = (linhas || []).find((l) => l.posicao === 1);
  const minha = (linhas || []).find((l) => String(l.id) === String(meuId));
  let resumo;
  if (!linhas) resumo = 'Carregando as notas…';
  else if (!linhas.length) resumo = 'Ninguém votou neste jogo.';
  else {
    const partes = [];
    if (craque) partes.push(`Craque: <strong>${escapeHtml(nomeDe(jogadores, craque.id))}</strong> · ${formatarMedia(craque.media)}`);
    if (minha && !minha.poucosVotos) partes.push(`Sua média: <strong>${formatarMedia(minha.media)}</strong>`);
    resumo = partes.join('<br>') || 'Poucos votos para fechar uma média.';
  }
  return `
    <section class="home-v2-card notas-rodada-card">
      <div class="home-v2-card-head">
        <div>
          <strong>Notas do jogo de ${escapeHtml(dataCurta(jogo?.game_date))}</strong>
          <span>A votação acabou · fica aqui até ${horaDe(fechaEmMs)}</span>
        </div>
      </div>
      <p class="notas-rodada-resumo">${resumo}</p>
      ${linhas && linhas.length ? '<button class="btn btn-secondary notas-rodada-cta" type="button" data-notas-rodada-abrir>Ver as notas</button>' : ''}
    </section>
  `;
}

function renderLinha(linha, { jogadores, meuId, renderAvatar }) {
  const jogador = jogadores.find((p) => String(p.id) === String(linha.id)) || { id: linha.id, name: 'Jogador' };
  const classes = ['notas-rodada-linha'];
  if (linha.posicao === 1) classes.push('is-craque');
  if (String(linha.id) === String(meuId)) classes.push('is-eu');
  const nota = linha.poucosVotos
    ? '<span class="notas-rodada-nota is-poucos">poucos votos</span>'
    : `<span class="notas-rodada-nota">${formatarMedia(linha.media)}</span>`;
  return `
    <li class="${classes.join(' ')}">
      <span class="notas-rodada-pos">${linha.posicao ?? '–'}</span>
      ${renderAvatar(jogador, 'notas-rodada-avatar')}
      <span class="notas-rodada-nome">
        ${escapeHtml(jogador.name || '')}
        <small>${linha.votos} voto${linha.votos === 1 ? '' : 's'}</small>
      </span>
      ${nota}
    </li>
  `;
}

/**
 * Popup com o ranking. modo: 'completo' | 'so_minha'.
 * `renderAvatar(player, classeExtra)` vem do app (foto assinada, áurea).
 */
export function renderNotasRodadaModal({ jogo, linhas, modo, meuId, jogadores, renderAvatar }) {
  const ctx = { jogadores, meuId, renderAvatar };
  const minha = linhas.find((l) => String(l.id) === String(meuId));
  const visiveis = modo === 'completo'
    ? linhas
    : linhas.filter((l) => l.posicao && l.posicao <= 3);

  const destaque = minha ? `
      <div class="notas-rodada-minha">
        <span>Sua média</span>
        <strong>${minha.poucosVotos ? '–' : formatarMedia(minha.media)}</strong>
        <small>${minha.poucosVotos ? 'Poucos votos para fechar uma média' : `${minha.votos} voto${minha.votos === 1 ? '' : 's'}${minha.posicao ? ` · ${minha.posicao}º lugar` : ''}`}</small>
      </div>` : '';

  return `
    <div class="perf-vote-backdrop" data-notas-rodada-fechar></div>
    <div class="perf-vote-modal game-vote-modal notas-rodada-modal" role="dialog" aria-modal="true" aria-labelledby="notas-rodada-titulo">
      <div class="perf-vote-head">
        <div class="notas-rodada-titulo" id="notas-rodada-titulo">Notas do jogo de ${escapeHtml(dataCurta(jogo?.game_date))}</div>
      </div>
      ${destaque}
      ${modo === 'completo' ? '' : '<div class="notas-rodada-sub">Top 3 da rodada</div>'}
      <ol class="notas-rodada-lista">
        ${visiveis.map((l) => renderLinha(l, ctx)).join('')}
      </ol>
      <p class="perf-vote-hint">Média das notas que o grupo deu. Ninguém vê quem votou.</p>
      <div class="perf-vote-actions">
        <button type="button" class="btn btn-primary" data-notas-rodada-fechar>Fechar</button>
      </div>
    </div>
  `;
}
