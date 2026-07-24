import {
  ACTIVE_CHAMPIONSHIP,
  TEAM_RESULT_OPTIONS,
  calculateAnnualRanking,
  calculateCurrentRanking,
  getActiveChampionshipMeta,
  getChampionshipState,
  getFootballPlayers,
  getHistoricalAnnual,
  getHistoricalTournaments,
  getResultSummary,
  getEffectiveChampionshipResults,
  buildRemovedByGameKey,
  getResultAuditRows,
  getActiveDrawTeams,
  getChampionshipDrawOptions,
  getTeamOutcomeLabel,
  getManualChampionshipResults,
  buildLineupFromDraw,
} from './championship.service.js';
import { canManageChampionship } from '../../domain/authz.js';
import { getAvatarHtml } from '../players/players.service.js';
import { getCachedRatings, playerRatingAverages } from '../../services/ratings.service.js';
import { isVotingEnabled } from '../../core/flags.js';

function normalizeChampionshipPlayerName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function findChampionshipPlayerRecord(snapshot, row) {
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const target = normalizeChampionshipPlayerName(row?.name || row?.player || row?.jogador);

  return players.find((player) => normalizeChampionshipPlayerName(player?.name) === target) || null;
}

function getChampionshipPlayerPhoto(player) {
  return player?.photo || player?.photo_url || player?.avatar || player?.image || player?.image_url || '';
}

function renderChampionshipPlayerAvatar(snapshot, row) {
  const player = findChampionshipPlayerRecord(snapshot, row);

  if (player) {
    return getAvatarHtml(player, 'championship-ranking-avatar');
  }

  const name = row?.name || row?.player || row?.jogador || '?';
  const initial = String(name).trim().charAt(0).toUpperCase() || '?';
  return `<div class="championship-ranking-avatar">${escapeHtml(initial)}</div>`;
}


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  if (!value) return '--/--/----';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return escapeHtml(value);
  return `${day}/${month}/${year}`;
}

function getStatusLabel(status) {
  if (status === 'win') return 'Vitória';
  if (status === 'draw') return 'Empate';
  if (status === 'loss') return 'Derrota';
  return 'WO / Não jogou';
}

function getStatusClass(status) {
  if (status === 'win') return 'is-win';
  if (status === 'draw') return 'is-draw';
  if (status === 'loss') return 'is-loss';
  return 'is-no-play';
}

function getPositionShortLabel(position) {
  const value = String(position || '').toLowerCase();
  if (value === 'gol') return 'Gol';
  if (value === 'zag') return 'Zag';
  if (value === 'atk') return 'Ata';
  return 'Meia';
}


function renderRankingTable(rows, { annual = false, snapshot = null } = {}) {
  if (!rows.length) {
    return '<div class="empty-state">Nenhum jogador elegível para o campeonato.</div>';
  }

  return `
    <div class="championship-table-wrap">
      <table class="championship-table">
        <thead>
          <tr>
            <th>Pos.</th>
            <th>Foto</th><th>Jogador</th>
            <th>Pts</th>
            ${annual ? '<th>Abertura</th><th>Inverno</th>' : '<th>V</th><th>E</th><th>D</th><th>NJ</th>'}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td><span class="rank-badge">${row.rank}</span></td>
              <td class="championship-player-avatar">${renderChampionshipPlayerAvatar(snapshot, row)}</td><td class="championship-player-name">${escapeHtml(row.name)}</td>
              <td><strong>${row.points}</strong></td>
              ${annual ? `
                <td>${row.abertura_points || 0}</td>
                <td>${row.current_points || 0}</td>
              ` : `
                <td>${row.wins}</td>
                <td>${row.draws}</td>
                <td>${row.losses}</td>
                <td>${row.no_play}</td>
              `}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function shortRoundLabel(date) {
  const [year, month, day] = String(date || '').split('-');
  if (!year || !month || !day) return escapeHtml(String(date || ''));
  return `${day}/${month}`;
}

// Matriz jogador × data: replica a planilha Rei da Quadra (Pos, Jogador, Pts,
// V/E/D/WO, Ap% e uma coluna por rodada com os pontos daquele dia, coloridos
// pelo resultado). É a visão principal do campeonato atual.
function renderRoundMatrix(snapshot) {
  const ranking = calculateCurrentRanking(snapshot);
  if (!ranking.length) {
    return '<div class="empty-state">Nenhum jogador elegível para o campeonato.</div>';
  }

  const rounds = getEffectiveChampionshipResults(snapshot);
  const removedByGameKey = buildRemovedByGameKey(snapshot);
  const pointsByStatus = { win: 3, draw: 2, loss: 1, no_play: 0 };
  // Nota média de desempenho por jogador (todas as notas do campeonato vigente).
  // Sem filtrar por rodada lançada — a votação acontece logo após o jogo, antes
  // do resultado ser lançado, então restringir aos game_keys com resultado
  // esconderia as notas recém-dadas.
  const showNota = isVotingEnabled();
  const playerAvg = showNota ? playerRatingAverages(getCachedRatings()) : {};

  return `
    <div class="championship-table-wrap championship-matrix-wrap">
      <table class="championship-table championship-matrix-table">
        <thead>
          <tr>
            <th class="cm-freeze cm-c1">Pos.</th>
            <th class="cm-freeze cm-c2 championship-matrix-name-col">Jogador</th>
            <th class="cm-freeze cm-c3">Pts</th>
            ${showNota ? '<th title="Nota média de desempenho (votação)">★</th>' : ''}
            <th>V</th><th>E</th><th>D</th><th>WO</th><th>Ap</th>
            ${rounds.map((round) => `<th title="${escapeHtml(round.date)}">${shortRoundLabel(round.date)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${ranking.map((row) => {
            const ap = row.played ? Math.round((row.points / (3 * row.played)) * 100) : null;
            return `
              <tr>
                <td class="cm-freeze cm-c1"><span class="rank-badge">${row.rank}</span></td>
                <td class="cm-freeze cm-c2 championship-player-name championship-matrix-name-col"><div class="cm-name">${renderChampionshipPlayerAvatar(snapshot, row)}<span>${escapeHtml(row.name)}</span></div></td>
                <td class="cm-freeze cm-c3"><strong>${row.points}</strong></td>
                ${showNota ? `<td class="championship-nota-cell">${playerAvg[String(row.player_id)] ? `<span class="championship-nota" title="${playerAvg[String(row.player_id)].votes} voto(s)">${playerAvg[String(row.player_id)].avg.toFixed(1)}</span>` : '<span class="championship-nota is-empty">–</span>'}</td>` : ''}
                <td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.no_play}</td>
                <td>${ap === null ? '–' : `${ap}%`}</td>
                ${rounds.map((round) => {
                  const removedSet = round.game_key ? removedByGameKey.get(String(round.game_key)) : null;
                  const status = (removedSet && removedSet.has(String(row.player_id)))
                    ? 'no_play'
                    : (round.statuses?.[String(row.player_id)] || 'no_play');
                  const pts = pointsByStatus[status] ?? 0;
                  return `<td class="championship-matrix-cell ${getStatusClass(status)}">${pts}</td>`;
                }).join('')}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Editor de "quem realmente jogou". O sorteio é a intenção; o jogo é a
// realidade — alguém desiste em cima da hora, entra um substituto, outro sai no
// meio. Sem isto, o resultado atribuía vitória/derrota a quem nem apareceu (e
// não havia como dar 0 a um jogador específico, nem incluir o substituto).
// `lineup` é { playerId: 'a' | 'b' | 'out' }.
function renderLineupEditor(selectedDraw, players, lineup, ajustado) {
  const nomeDe = new Map(players.map((p) => [String(p.id), p.name || 'Jogador']));
  const naEscalacao = Object.keys(lineup).filter((id) => nomeDe.has(id));
  const ordenar = (ids) => ids.slice().sort((a, b) =>
    String(nomeDe.get(a)).localeCompare(String(nomeDe.get(b)), 'pt-BR'));

  const linha = (id) => {
    const v = lineup[id] || 'out';
    return `
      <div class="player-compact-row" role="row">
        <div class="player-compact-main"><div class="player-compact-text">
          <div class="row-title">${escapeHtml(nomeDe.get(id))}</div>
        </div></div>
        <div class="player-compact-right">
          <select class="championship-control-v2" data-lineup-player="${escapeHtml(id)}" aria-label="Time de ${escapeHtml(nomeDe.get(id))}">
            <option value="a"${v === 'a' ? ' selected' : ''}>Time A</option>
            <option value="b"${v === 'b' ? ' selected' : ''}>Time B</option>
            <option value="out"${v === 'out' ? ' selected' : ''}>Não jogou</option>
          </select>
        </div>
      </div>`;
  };

  // Quem pode ser adicionado: jogador registrado que não está na escalação.
  const fora = ordenar(players.map((p) => String(p.id)).filter((id) => !(id in lineup)));
  const nA = naEscalacao.filter((id) => lineup[id] === 'a').length;
  const nB = naEscalacao.filter((id) => lineup[id] === 'b').length;
  const nOut = naEscalacao.filter((id) => lineup[id] === 'out').length;

  return `
    <details class="championship-teams-result-details championship-teams-result-details-v2"${ajustado ? ' open' : ''}>
      <summary>
        <span>Ajustar quem jogou${ajustado ? ' · ajustado' : ''}</span>
        <small>${nA} x ${nB}${nOut ? ` · ${nOut} fora` : ''}</small>
      </summary>
      <p class="footer-note" style="margin:6px 0 10px;">Quem desistiu em cima da hora fica como <strong>Não jogou</strong> (0 ponto). Se entrou alguém no lugar, adicione abaixo e escolha o time. Convidados não pontuam e não aparecem aqui.</p>
      <div class="player-compact-list" role="table" aria-label="Quem jogou">
        ${ordenar(naEscalacao).map(linha).join('')}
      </div>
      ${fora.length ? `
        <label class="championship-field-v2" style="margin-top:10px;">
          <span>Adicionar jogador que não estava no sorteio</span>
          <select id="championship-add-to-lineup" class="championship-control-v2">
            <option value="">Selecione…</option>
            ${fora.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(nomeDe.get(id))}</option>`).join('')}
          </select>
        </label>` : ''}
    </details>`;
}

function renderResultForm(snapshot, currentPlayer, selectedDrawId = null, lineupState = null, cardOpen = false) {
  if (!canManageChampionship(currentPlayer)) return '';

  const players = getFootballPlayers(snapshot);
  if (!players.length) {
    return `<section class="card"><div class="card-title">Lançar resultado</div><div class="empty-state">Cadastre jogadores com perfil jogador antes de lançar resultados.</div></section>`;
  }

  const draws = getChampionshipDrawOptions(snapshot);
  if (!draws.length) {
    return `
      <section class="card championship-result-card championship-result-card-v2">
        <div class="card-title">Lançar resultado do jogo</div>
        <div class="empty-state">Faça o sorteio dos times antes de lançar o resultado do campeonato.</div>
        <p class="footer-note">O lançamento fica vinculado ao sorteio para manter auditoria visual do campeonato.</p>
      </section>`;
  }

  // O sorteio ESCOLHIDO no seletor comanda a tela. Antes era sempre `draws[0]`
  // (o mais recente), então trocar o seletor não mexia na data nem nas
  // escalações exibidas: dava para escolher o sorteio de um jogo e ver os times
  // de outro — e a data ia para o resultado com o valor errado. Ficava
  // invisível enquanto a lista só tinha sorteios do mesmo jogo.
  const selectedDraw = (selectedDrawId && draws.find((draw) => String(draw.id) === String(selectedDrawId))) || draws[0];
  const playerById = new Map(players.map((player) => [String(player.id), player]));
  const selectedDate = selectedDraw.date || (selectedDraw.created_at ? new Date(selectedDraw.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  // Escalação: o ajuste do admin vale, mas só enquanto for do MESMO sorteio —
  // trocar de sorteio recomeça do zero (senão o ajuste de um jogo vazaria pro
  // outro, que é a classe de bug que acabamos de consertar aqui).
  const ajustado = !!(lineupState && String(lineupState.drawId) === String(selectedDraw.id));
  const lineup = ajustado ? lineupState.map : buildLineupFromDraw(selectedDraw);

  const manualResults = getManualChampionshipResults(snapshot);
  const existingResult = manualResults.find((result) => String(result.draw_id || '') === String(selectedDraw.id || '') || String(result.date || '') === String(selectedDate));

  const renderTeamPlayers = (ids) => ids.map((playerId) => {
    const player = playerById.get(String(playerId));
    return `<span class="championship-team-player-pill"><strong>${escapeHtml(player?.name || 'Jogador removido')}</strong><small>${escapeHtml(getPositionShortLabel(player?.position))}</small></span>`;
  }).join('');

  return `
    <!-- estado de aberto preservado entre renders: cada ajuste de escalação
         re-renderiza a tela, e sem isto o card fechava a cada alteração — o
         admin tinha de reabrir e rolar até aqui de novo a cada jogador. -->
    <details class="card championship-result-card championship-result-card-v2 champ-collapse"${cardOpen ? ' open' : ''}>
      <summary class="champ-collapse-summary">
        <span class="card-title">🏆 Lançar resultado do jogo</span>
        <span class="champ-collapse-chevron" aria-hidden="true"></span>
      </summary>
      <p class="championship-result-subtitle-v2">Selecione o sorteio correto. O lançamento fica auditável e vinculado ao sorteio, não apenas ao último jogo aberto.</p>

      <div class="championship-result-badges-v2">
        <span class="championship-pill-v2 is-blue">Sorteios disponíveis: ${draws.length}</span>
        <span class="championship-pill-v2 ${existingResult ? 'is-gold' : 'is-green'}">${existingResult ? 'Sorteio já lançado' : 'Sorteio sem resultado'}</span>
      </div>

      <div class="championship-result-divider-v2"></div>

      <div class="championship-result-form-v2">
        <label class="championship-field-v2 championship-draw-field-v2">
          <span>Sorteio</span>
          <select id="championship-draw-id" class="championship-control-v2">
            ${draws.map((draw) => {
              const date = draw.date || (draw.created_at ? new Date(draw.created_at).toISOString().slice(0, 10) : '');
              const result = manualResults.find((entry) => String(entry.draw_id || '') === String(draw.id || '') || String(entry.date || '') === String(date));
              const total = (draw.team_a?.length || 0) + (draw.team_b?.length || 0);
              const isSel = String(draw.id) === String(selectedDraw.id);
              return `<option value="${escapeHtml(draw.id)}"${isSel ? ' selected' : ''}>${formatDate(date)} · ${draw.game_time || '--:--'} · ${total} jogadores${result ? ' · lançado' : ''}</option>`;
            }).join('')}
          </select>
        </label>

        <label class="championship-field-v2">
          <span>Data do jogo</span>
          <input id="championship-result-date" class="championship-control-v2" type="date" value="${selectedDate}">
        </label>

        <label class="championship-field-v2">
          <span>Resultado</span>
          <select id="championship-team-outcome" class="championship-control-v2">
            ${TEAM_RESULT_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
          </select>
        </label>
      </div>

      <details class="championship-teams-result-details championship-teams-result-details-v2">
        <summary><span>Ver escalações do sorteio selecionado</span><small>Time A ${selectedDraw.team_a.length} x ${selectedDraw.team_b.length} Time B</small></summary>
        <div class="championship-teams-result-grid">
          <div class="championship-team-result-box"><div class="championship-team-label">Time A</div><div class="championship-team-player-list">${renderTeamPlayers(selectedDraw.team_a)}</div></div>
          <div class="championship-team-result-box"><div class="championship-team-label">Time B</div><div class="championship-team-player-list">${renderTeamPlayers(selectedDraw.team_b)}</div></div>
        </div>
      </details>

      ${renderLineupEditor(selectedDraw, players, lineup, ajustado)}

      <button class="btn btn-primary championship-save-result-btn-v2" type="button" data-action="save-championship-result">Salvar resultado</button>

      <div class="championship-result-info-v2"><strong>i</strong><span>Se este sorteio já tiver resultado, salvar novamente substitui o lançamento anterior.</span></div>
    </details>`;
}
function renderResultsHistory(snapshot, currentPlayer) {
  const results = getEffectiveChampionshipResults(snapshot);
  const players = getFootballPlayers(snapshot);

  return `
    <details class="card champ-collapse">
      <summary class="champ-collapse-summary">
        <span class="card-title">Auditoria dos jogos lançados</span>
        <span class="champ-collapse-chevron" aria-hidden="true"></span>
      </summary>
      <div class="champ-collapse-body">
      <p class="footer-note">Cada rodada abaixo é usada para calcular a classificação. A importação inicial veio da planilha Rei da Quadra.</p>
      ${results.length ? `
        <div class="championship-audit-list">
          ${results.slice().reverse().map((result) => {
            const summary = getResultSummary(result, players);
            const rows = getResultAuditRows(result, players);
            const unmatched = rows.filter((row) => !row.matched).length;

            return `
              <details class="championship-audit-item">
                <summary>
                  <div>
                    <strong>${formatDate(result.date)}</strong>
                    <span>${result.imported ? 'Importado da planilha' : getTeamOutcomeLabel(result.outcome)}</span>
                  </div>
                  <small>${summary.win} V · ${summary.draw} E · ${summary.loss} D · ${summary.no_play} WO${unmatched ? ` · ${unmatched} sem vínculo` : ''}</small>
                </summary>

                <div class="championship-audit-table-wrap">
                  <table class="championship-audit-table">
                    <thead>
                      <tr>
                        <th>Jogador</th>
                        <th>Origem</th>
                        <th>Resultado</th>
                        <th>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.map((row) => `
                        <tr class="${row.matched ? '' : 'is-unmatched'}">
                          <td>${escapeHtml(row.name)}</td>
                          <td>${escapeHtml(row.sheet_name || row.name)}</td>
                          <td><span class="status-chip ${getStatusClass(row.status)}">${getStatusLabel(row.status)}</span></td>
                          <td><strong>${row.points}</strong></td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>

                ${canManageChampionship(currentPlayer) && !result.imported ? `
                  <div class="actions">
                    <button class="btn btn-danger btn-sm" type="button" data-action="delete-championship-result" data-id="${escapeHtml(result.id)}">Excluir lançamento</button>
                  </div>
                ` : ''}
              </details>
            `;
          }).join('')}
        </div>
      ` : '<div class="empty-state">Nenhum resultado lançado para o Inverno 26.</div>'}
      </div>
    </details>
  `;
}

function renderSimpleAnnualHistoryTable(rows) {
  if (!rows.length) return '<div class="empty-state">Sem dados.</div>';
  return `
    <div class="championship-table-wrap">
      <table class="championship-table championship-table-simple">
        <thead><tr><th>Pos.</th><th>Jogador</th><th>Pts</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td><span class="rank-badge">${row.rank}</span></td>
              <td class="championship-player-name">${escapeHtml(row.name)}</td>
              <td><strong>${row.points}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderHistoricalBlock(snapshot) {
  // Passa o snapshot: o histórico estático pertence a um clube específico e só
  // aparece para quem opta por ele no perfil.
  const tournaments = getHistoricalTournaments(snapshot);
  const annual = getHistoricalAnnual(snapshot);

  if (!tournaments.length && !annual.length) return '';

  return `
    <section class="card">
      <div class="card-title">Histórico estático</div>
      <p class="footer-note">Importado do arquivo Rei da Quadra. Somente leitura; o campeonato atual é calculado pelo app. Toque em cada temporada para abrir.</p>

      <div class="history-section-label">Anuais</div>
      <div class="history-list">
        ${annual.map((item, index) => `
          <details class="history-year">
            <summary class="history-year-summary">
              <span class="history-year-name">${item.year}</span>
              <span class="history-year-hint">${item.rows.length} jogador${item.rows.length === 1 ? '' : 'es'}</span>
            </summary>
            ${renderSimpleAnnualHistoryTable(item.rows.slice(0, 10))}
          </details>
        `).join('')}
      </div>

      <div class="history-section-label">Campeonatos anteriores</div>
      <div class="history-list">
        ${tournaments.map((item, index) => `
          <details class="history-year">
            <summary class="history-year-summary">
              <span class="history-year-name">${escapeHtml(item.name)}</span>
              <span class="history-year-hint">${item.rows.length} jogador${item.rows.length === 1 ? '' : 'es'}</span>
            </summary>
            ${renderRankingTable(item.rows.slice(0, 10), { snapshot })}
          </details>
        `).join('')}
      </div>
    </section>
  `;
}

// Card colapsável (details/summary) com visual de card padrão + chevron.
function collapsibleCard({ title, note = '', body = '', open = false, extraClass = '' }) {
  return `
    <details class="card champ-collapse ${extraClass}"${open ? ' open' : ''}>
      <summary class="champ-collapse-summary">
        <span class="card-title">${title}</span>
        <span class="champ-collapse-chevron" aria-hidden="true"></span>
      </summary>
      <div class="champ-collapse-body">
        ${note ? `<p class="footer-note">${note}</p>` : ''}
        ${body}
      </div>
    </details>`;
}

export function renderChampionshipScreen(snapshot, currentPlayer, selectedDrawId = null, lineupState = null, resultCardOpen = false) {
  const activeMeta = getActiveChampionshipMeta(snapshot);
  const annualRanking = calculateAnnualRanking(snapshot);
  const resultCount = getEffectiveChampionshipResults(snapshot).length;

  return `
    <section class="section-stack championship-screen">
      <section class="hero-card championship-hero championship-hero-current">
        <div class="hero-label">Campeonato atual</div>
        <div class="hero-date">${ACTIVE_CHAMPIONSHIP.label}</div>
        <div class="hero-meta">${formatDate(activeMeta.start_date)} até ${formatDate(activeMeta.end_date)} · ${resultCount} jogo(s) lançado(s)</div>
      </section>

      ${renderResultForm(snapshot, currentPlayer, selectedDrawId, lineupState, resultCardOpen)}

      ${collapsibleCard({
        title: 'Classificação atual · Inverno 26',
        note: 'Pontos por rodada (3 vitória · 2 empate · 1 derrota · 0 não jogou). Importado da planilha Rei da Quadra + resultados lançados no app.',
        body: renderRoundMatrix(snapshot),
        open: true,
      })}

      ${collapsibleCard({
        title: 'Classificação anual · 2026',
        note: 'Soma do Abertura 26 importado do histórico com o Inverno 26 calculado pelo app.',
        body: renderRankingTable(annualRanking, { annual: true, snapshot }),
      })}

      ${renderHistoricalBlock(snapshot, )}
      ${renderResultsHistory(snapshot, currentPlayer)}
    </section>
  `;
}
