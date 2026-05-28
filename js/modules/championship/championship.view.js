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
  getResultAuditRows,
  getActiveDrawTeams,
  getTeamOutcomeLabel,
} from './championship.service.js';
import { canManageChampionship } from '../../domain/authz.js';

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


function renderRankingTable(rows, { annual = false } = {}) {
  if (!rows.length) {
    return '<div class="empty-state">Nenhum jogador elegível para o campeonato.</div>';
  }

  return `
    <div class="championship-table-wrap">
      <table class="championship-table">
        <thead>
          <tr>
            <th>Pos.</th>
            <th>Jogador</th>
            <th>Pts</th>
            ${annual ? '<th>Abertura</th><th>Inverno</th>' : '<th>V</th><th>E</th><th>D</th><th>NJ</th>'}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td><span class="rank-badge">${row.rank}</span></td>
              <td class="championship-player-name">${escapeHtml(row.name)}</td>
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

function renderResultForm(snapshot, currentPlayer) {
  if (!canManageChampionship(currentPlayer)) return '';

  const players = getFootballPlayers(snapshot);
  if (!players.length) {
    return `
      <section class="card">
        <div class="card-title">Lançar resultado</div>
        <div class="empty-state">Cadastre jogadores com perfil jogador antes de lançar resultados.</div>
      </section>
    `;
  }

  const draw = getActiveDrawTeams(snapshot);
  if (!draw.ok) {
    return `
      <section class="card championship-result-card">
        <div class="card-title">Lançar resultado do jogo</div>
        <div class="empty-state">${escapeHtml(draw.message)}</div>
        <p class="footer-note">O resultado do campeonato usa o último sorteio da aba Jogo da semana. Depois do sorteio, informe qual time venceu ou se houve empate.</p>
      </section>
    `;
  }

  const playerById = new Map(players.map((player) => [String(player.id), player]));
  const renderTeamPlayers = (ids) => ids.map((playerId) => {
    const player = playerById.get(String(playerId));
    return `<span>${escapeHtml(player?.name || 'Jogador removido')}</span>`;
  }).join('');

  const today = draw.created_at ? new Date(draw.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  return `
    <section class="card championship-result-card">
      <div class="card-title">Lançar resultado do jogo</div>
      <p class="footer-note">Informe o resultado do time sorteado. O sistema distribui automaticamente os pontos para todos os jogadores do jogo.</p>
      <div class="form-grid compact-grid championship-date-grid">
        <label>
          Data do jogo
          <input type="date" id="championship-result-date" value="${today}">
        </label>
        <label>
          Resultado
          <select id="championship-team-outcome">
            ${TEAM_RESULT_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="championship-teams-result-grid">
        <div class="championship-team-result-box">
          <div class="championship-team-label">Time A</div>
          <div class="championship-team-player-list">${renderTeamPlayers(draw.team_a)}</div>
        </div>
        <div class="championship-team-result-box">
          <div class="championship-team-label">Time B</div>
          <div class="championship-team-player-list">${renderTeamPlayers(draw.team_b)}</div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" type="button" data-action="save-championship-result">Salvar resultado</button>
      </div>
    </section>
  `;
}

function renderResultsHistory(snapshot, currentPlayer) {
  const results = getEffectiveChampionshipResults(snapshot);
  const players = getFootballPlayers(snapshot);

  return `
    <section class="card">
      <div class="card-title">Auditoria dos jogos lançados</div>
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
    </section>
  `;
}

function renderSimpleAnnualHistoryTable(rows) {
  if (!rows.length) return '<div class="empty-state">Sem dados.</div>';
  return `
    <div class="championship-table-wrap">
      <table class="championship-table">
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

function renderHistoricalBlock() {
  const tournaments = getHistoricalTournaments();
  const annual = getHistoricalAnnual();

  return `
    <section class="card">
      <div class="card-title">Histórico estático</div>
      <p class="footer-note">Importado do arquivo Rei da Quadra. Nesta versão o histórico é somente leitura; o campeonato atual é calculado pelo app.</p>
      <details class="history-details" open>
        <summary>Anuais</summary>
        <div class="history-grid">
          ${annual.map((item) => `
            <div class="history-card">
              <div class="history-title">${item.year}</div>
              ${renderSimpleAnnualHistoryTable(item.rows.slice(0, 10))}
            </div>
          `).join('')}
        </div>
      </details>
      <details class="history-details">
        <summary>Campeonatos anteriores</summary>
        <div class="history-grid">
          ${tournaments.map((item) => `
            <div class="history-card">
              <div class="history-title">${escapeHtml(item.name)}</div>
              ${renderRankingTable(item.rows.slice(0, 10))}
            </div>
          `).join('')}
        </div>
      </details>
    </section>
  `;
}

export function renderChampionshipScreen(snapshot, currentPlayer) {
  const activeMeta = getActiveChampionshipMeta(snapshot);
  const currentRanking = calculateCurrentRanking(snapshot);
  const annualRanking = calculateAnnualRanking(snapshot);
  const resultCount = getEffectiveChampionshipResults(snapshot).length;

  return `
    <section class="section-stack championship-screen">
      <section class="hero-card championship-hero">
        <div class="hero-label">Campeonato atual</div>
        <div class="hero-date">${ACTIVE_CHAMPIONSHIP.label}</div>
        <div class="hero-meta">${formatDate(activeMeta.start_date)} até ${formatDate(activeMeta.end_date)} · ${resultCount} jogo(s) lançado(s)</div>
      </section>

      <section class="card championship-rule-card">
        <div class="card-title">Regra de pontuação</div>
        <div class="championship-rule-grid">
          <div><strong>3</strong><span>Vitória</span></div>
          <div><strong>2</strong><span>Empate</span></div>
          <div><strong>1</strong><span>Derrota</span></div>
          <div><strong>0</strong><span>Não jogou</span></div>
        </div>
        <p class="footer-note">Desempate: pontos, vitórias, empates e derrotas. Se persistir empate, os jogadores mantêm a mesma posição.</p>
      </section>

      ${renderResultForm(snapshot, currentPlayer)}

      <section class="card">
        <div class="card-title">Classificação · Inverno 26</div>
        ${renderRankingTable(currentRanking)}
      </section>

      <section class="card">
        <div class="card-title">Classificação anual · 2026</div>
        <p class="footer-note">Soma do Abertura 26 importado do histórico com o Inverno 26 calculado pelo app.</p>
        ${renderRankingTable(annualRanking, { annual: true })}
      </section>

      ${renderResultsHistory(snapshot, currentPlayer)}
      ${renderHistoricalBlock()}
    </section>
  `;
}
