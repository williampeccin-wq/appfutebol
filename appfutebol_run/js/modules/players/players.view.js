import {
  formatBirthDate,
  formatPhone,
  getInitials,
  getAvatarHtml,
  getPositionLabel,
  getRoleLabel,
  isAdmin,
  isConfirmed,
  isCurrentPlayer,
  listCarneOnly,
  listJogadores,
  listPlayers,
} from './players.service.js';
import { getCachedRatings, duoRatingAverages } from '../../services/ratings.service.js';
import { isVotingEnabled } from '../../core/flags.js';
import { isMensalidadeExempt } from '../../domain/authz.js';

function isCarneOnly(player) {
  return player?.plays_football === false;
}

function isFinancePending(player) {
  return !isMensalidadeExempt(player) && !player?.mens_ok;
}

function renderFinanceControls(player, currentPlayer) {
  if (isMensalidadeExempt(player)) return '<span class="switch-placeholder">—</span>';

  const isPaid = !isFinancePending(player);
  const action = isPaid ? 'mark-debt' : 'mark-paid';
  const label = isPaid ? 'Pago' : 'Pendente';

  if (!isAdmin(currentPlayer)) {
    return `
      <span class="switch-label static-finance-label ${isPaid ? 'is-ok' : 'is-warn'}">
        ${label}
      </span>
    `;
  }

  // Comprovante PIX enviado pelo jogador, mas sem E2E legível → aguarda revisão.
  const review = (!isPaid && player.mens_review && typeof player.mens_review === 'object') ? player.mens_review : null;
  const reviewChip = review ? `
    <button
      class="btn btn-secondary btn-sm pix-review-chip"
      type="button"
      data-action="open-pix-review"
      data-id="${player.id}"
      title="Comprovante enviado: ${escapeAttr(review.beneficiary || '')} · ${review.amount ? `R$ ${Number(review.amount).toFixed(2).replace('.', ',')}` : 's/ valor'} · ${review.date || 's/ data'}"
    >📷 Revisar</button>
  ` : '';

  // Pago via PIX (comprovante do próprio jogador) → selo clicável com detalhes.
  const payment = (isPaid && player.mens_payment && typeof player.mens_payment === 'object') ? player.mens_payment : null;
  const paidChip = payment ? `
    <button
      class="btn btn-secondary btn-sm pix-review-chip"
      type="button"
      data-action="open-pix-info"
      data-id="${player.id}"
      title="Pago via PIX — toque para ver detalhes"
    >📷 PIX</button>
  ` : '';

  return `
    ${reviewChip}
    ${paidChip}
    <button
      class="switch-control ${isPaid ? 'is-on' : 'is-off'}"
      type="button"
      data-action="${action}"
      data-id="${player.id}"
      aria-pressed="${isPaid ? 'true' : 'false'}"
      title="${isPaid ? 'Marcar como pendente' : 'Marcar como pago'}"
    >
      <span class="switch-track"><span class="switch-thumb"></span></span>
      <span class="switch-label ${isPaid ? 'is-ok' : 'is-warn'}">${label}</span>
    </button>
  `;
}

function escapeAttr(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}



function renderAdminGameRemovalControl(player, currentPlayer, confirmed) {
  if (!isAdmin(currentPlayer)) return '';
  if (isCarneOnly(player)) return '<span class="switch-placeholder">—</span>';

  const action = confirmed ? 'admin-remove-from-game' : 'admin-add-to-game';
  const label = confirmed ? 'Dentro' : 'Fora';

  return `
    <button
      class="switch-control ${confirmed ? 'is-on' : 'is-off'}"
      type="button"
      data-action="${action}"
      data-id="${player.id}"
      aria-pressed="${confirmed ? 'true' : 'false'}"
      title="${confirmed ? 'Remover do jogo' : 'Incluir no jogo'}"
    >
      <span class="switch-track"><span class="switch-thumb"></span></span>
      <span class="switch-label ${confirmed ? 'is-ok' : 'is-neutral'}">${label}</span>
    </button>
  `;
}

function renderPlayerManagementCard(currentPlayer) {
  if (!isAdmin(currentPlayer)) return '';

  return `
    <section class="card" id="player-management-card">
      <details class="player-create-details" id="player-form-details">
        <summary class="player-create-summary">
          <span class="card-title" id="player-management-title">Novo jogador</span>
          <span class="btn btn-secondary btn-sm player-create-open-indicator">Adicionar jogador</span>
        </summary>
      <div class="player-admin-form">
        <input id="new-name" class="input" type="text" placeholder="Nome" />
        <input id="new-phone" class="input" type="tel" placeholder="Telefone" />
        <input id="new-birthdate" class="input" type="date" />

        <label class="player-photo-upload">
          <span class="player-photo-preview" id="new-photo-preview">Foto</span>
          <span class="player-photo-upload-copy">
            <strong>Foto do jogador</strong>
            <small>Selecionar ou trocar foto</small>
          </span>
          <input id="new-photo" type="file" accept="image/*" />
        </label>

        <select id="new-role" class="input">
          <option value="player">Jogador</option>
          <option value="carne">Carne</option>
        </select>

        <select id="new-position" class="input" data-role-dependent="position">
          <option value="gol">Goleiro</option>
          <option value="zag">Zagueiro</option>
          <option value="meia">Meia</option>
          <option value="atk">Atacante</option>
        </select>

        <label><input id="new-admin" type="checkbox" /> Admin</label>
        <label><input id="new-mens" type="checkbox" checked /> Mensalidade OK</label>
        <label id="gk-pays-group" style="display:none;"><input id="new-gk-pays" type="checkbox" /> Goleiro paga mensalidade</label>

        <div class="player-admin-actions"><button class="btn btn-primary" type="button" data-action="add-player">Adicionar</button><button class="btn btn-secondary" type="button" data-action="cancel-edit" id="cancel-edit-button" style="display:none;">Cancelar</button></div>
      </div>
      </details>
    </section>
  `;
}

function renderSelfProfileCard(currentPlayer) {
  // Edição do próprio cadastro fica concentrada na Home, recolhida atrás do botão Editar.
  return '';
}

// Fila de aprovação (admin): auto-cadastros aguardando liberação para o grupo.
function renderPendingApprovalCard(pendingPlayers, currentPlayer) {
  if (!isAdmin(currentPlayer) || !pendingPlayers.length) return '';
  return `
    <section class="card pending-approval-card">
      <div class="pending-approval-head">
        <span class="card-title">Pendentes de aprovação</span>
        <span class="pending-approval-count">${pendingPlayers.length}</span>
      </div>
      <p class="footer-note">Cadastros novos aguardando sua liberação para entrar no grupo.</p>
      <div class="pending-approval-list">
        ${pendingPlayers.map((p) => `
          <div class="pending-approval-row">
            <div class="pending-approval-id">
              <strong>${escapeHtml(p.name || 'Sem nome')}</strong>
              <small>${escapeHtml(p.phone || '')}</small>
            </div>
            <div class="pending-approval-actions">
              <button class="btn btn-primary btn-sm" type="button" data-action="approve-player" data-id="${escapeAttr(p.id)}">Aprovar</button>
              <button class="btn btn-danger btn-sm" type="button" data-action="reject-player" data-id="${escapeAttr(p.id)}">Recusar</button>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}




export function renderPlayersScreen(snapshot, currentPlayer, projectedPlayers = null, editingPlayerId = null) {
  const sourcePlayers = Array.isArray(projectedPlayers) && projectedPlayers.length ? projectedPlayers : listPlayers();
  const orderedPlayers = [...sourcePlayers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  // Auto-cadastro pendente NÃO é membro: sai das listas/contagens de membro e
  // aparece só na fila de aprovação do admin (renderPendingApprovalCard).
  const pendingPlayers = orderedPlayers.filter((player) => player.pending === true);
  const activePlayers = orderedPlayers.filter((player) => player.pending !== true);
  const allPlayers = activePlayers;
  const jogadores = activePlayers.filter((player) => player.plays_football !== false);
  const carneGroup = activePlayers.filter((player) => player.in_carne_group === true);
  // "Somente carne" = qualquer perfil que não joga (independente do grupo), para
  // garantir que todos sejam editáveis aqui na aba Jogadores.
  const carneOnly = activePlayers.filter((player) => player.plays_football === false);
  const jogadoresFinanceiros = jogadores.filter((player) => !isMensalidadeExempt(player));
  const emDia = jogadoresFinanceiros.filter((player) => !!player.mens_ok).length;
  const pendentes = jogadoresFinanceiros.filter((player) => !player.mens_ok).length;
  const adimplencia = jogadoresFinanceiros.length ? Math.round((emDia / jogadoresFinanceiros.length) * 100) : 100;
  const mensDue = String(snapshot?.settings?.mens_expire_date || '').slice(0, 10);
  const mensDueLabel = mensDue ? mensDue.split('-').reverse().join('/') : 'não definido';

  return `
    <section class="section-stack">
      ${renderPlayerManagementCard(currentPlayer)}
      ${renderPendingApprovalCard(pendingPlayers, currentPlayer)}
      ${renderSelfProfileCard(currentPlayer)}
      <section class="players-admin-panel">
        <div class="players-admin-header">
          <div>
            <h2>Jogadores</h2>
            
          </div>
          <div class="players-filter-row">
            <span class="filter-pill is-active">Todos <strong>${jogadores.length}</strong></span>
            <span class="filter-pill is-ok">Pagos <strong>${emDia}</strong></span>
            <span class="filter-pill is-warn">Pendentes <strong>${pendentes}</strong></span>
            <span class="filter-pill is-ok">Dentro do jogo <strong>${allPlayers.filter((player) => player.plays_football !== false && player.isConfirmed).length}</strong></span>
          </div>
        </div>

        ${isAdmin(currentPlayer) ? `
          <div class="players-pay-actions">
            <span class="players-pay-due">Vencimento da mensalidade: <strong>${mensDueLabel}</strong></span>
            <button class="btn btn-secondary btn-sm" type="button" id="copy-payments-btn">Copiar pagos/pendentes</button>
          </div>
        ` : ''}

        <div class="player-compact-list" role="table" aria-label="Jogadores">
          ${jogadores.map((player) => renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId)).join('')}
        </div>

        <div class="switch-legend">
          <span><span class="legend-switch is-on"></span> Pago</span>
          <span><span class="legend-switch is-off"></span> Pendente</span>
        </div>

        ${carneOnly.length ? `
          <div class="players-carne-only">
            <div class="players-subhead">Somente carne <strong>${carneOnly.length}</strong></div>
            <div class="player-compact-list" role="table" aria-label="Somente carne">
              ${carneOnly.map((player) => renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId)).join('')}
            </div>
          </div>
        ` : ''}
      </section>
    </section>
  `;
}


const DEFAULT_CARNE_SCHEDULE = [
  ['2026-05-19', 'PANGA', 'ADRIEL'],
  ['2026-05-13', 'SOLI', 'MALVADEZA'],
  ['2026-05-20', 'DICÃO', 'GUILHERME'],
  ['2026-05-27', 'ADRIANO', 'NINIU'],
  ['2026-06-03', 'DICK', 'LUQUINHA'],
  ['2026-06-10', 'WILLIAM', 'TELO'],
  ['2026-06-17', 'VINÍ', 'PH'],
  ['2026-06-24', 'CAETANO', 'PAULO'],
  ['2026-07-01', 'BAHIA', 'TROCHINHO'],
  ['2026-07-08', 'DAVID', 'MATEUS'],
  ['2026-07-15', 'MARIO', 'VINICIUS'],
  ['2026-07-22', 'JÚNIOR', 'SAMUEL'],
  ['2026-07-29', 'BROCA', 'BROQUINHA'],
  ['2026-08-05', 'ANDRÉ', 'CAUÊ'],
  ['2026-08-12', 'GEDIMITO', 'VITOR'],
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function formatScheduleDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return escapeHtml(value);
  return `${day}/${month}`;
}

function getPlayerName(playersById, id) {
  return playersById.get(String(id))?.name || 'Jogador não encontrado';
}

function getCarneScheduleEntries(snapshot, orderedPlayers) {
  const rawEntries = Array.isArray(snapshot?.carne) ? snapshot.carne : [];
  const savedSchedule = rawEntries
    .filter((entry) => entry?.type === 'carne_schedule')
    .map((entry, index) => ({
      id: String(entry.id || `carne_schedule_${index}`),
      type: 'carne_schedule',
      date: String(entry.date || ''),
      player1_id: String(entry.player1_id || ''),
      player2_id: String(entry.player2_id || ''),
      active: entry.active !== false,
      source: 'saved',
    }))
    .filter((entry) => entry.date && entry.player1_id && entry.player2_id);

  if (savedSchedule.length) {
    return savedSchedule.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  const playersByName = new Map();
  orderedPlayers.forEach((player) => {
    playersByName.set(normalizeName(player.name), player);
  });

  return DEFAULT_CARNE_SCHEDULE
    .map(([date, name1, name2], index) => {
      const player1 = playersByName.get(normalizeName(name1));
      const player2 = playersByName.get(normalizeName(name2));
      if (!player1 || !player2) return null;
      return {
        id: `seed_carne_schedule_${index}`,
        type: 'carne_schedule',
        date,
        player1_id: String(player1.id),
        player2_id: String(player2.id),
        active: true,
        source: 'seed',
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getNextScheduleEntry(schedule) {
  if (!schedule.length) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const next = schedule.find((entry) => {
    const date = new Date(`${entry.date}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date >= today;
  });

  return next || schedule[0];
}

function renderPlayerOptions(players, selectedId = '') {
  return players
    .map((player) => `<option value="${escapeHtml(player.id)}" ${String(player.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(player.name)}</option>`)
    .join('');
}

function renderCarneScheduleForm(currentPlayer, orderedPlayers) {
  if (!isAdmin(currentPlayer)) return '';

  return `
    <section class="card" id="carne-schedule-form-card">
      <div class="card-title" id="carne-schedule-form-title">Cadastrar dupla da carne</div>
      <div class="player-admin-form carne-schedule-form">
        <input id="carne-schedule-id" type="hidden" value="" />
        <input id="carne-schedule-date" class="input" type="date" />
        <select id="carne-schedule-player-1" class="input">
          <option value="">Responsável 1</option>
          ${renderPlayerOptions(orderedPlayers)}
        </select>
        <select id="carne-schedule-player-2" class="input">
          <option value="">Responsável 2</option>
          ${renderPlayerOptions(orderedPlayers)}
        </select>
        <div class="player-admin-actions">
          <button class="btn btn-primary" type="button" data-action="save-carne-schedule">Salvar dupla</button>
          <button class="btn btn-secondary" type="button" data-action="cancel-carne-schedule-edit" id="cancel-carne-schedule-edit-button" style="display:none;">Cancelar</button>
        </div>
      </div>
      <p class="footer-note">Somente jogadores cadastrados podem ser selecionados. A sequência funciona como calendário recorrente: após a última dupla, o ciclo recomeça.</p>
    </section>
  `;
}

function renderCarneScheduleTable(schedule, orderedPlayers, currentPlayer) {
  const playersById = new Map(orderedPlayers.map((player) => [String(player.id), player]));
  const nextEntry = getNextScheduleEntry(schedule);
  const admin = isAdmin(currentPlayer);

  if (!schedule.length) {
    return `
      <section class="card carne-schedule-card">
        <div class="card-title">Tabela da carne Convocados</div>
        <div class="empty-inline">Nenhuma dupla cadastrada ainda. O admin pode criar a primeira dupla acima.</div>
      </section>
    `;
  }

  return `
    <section class="card carne-schedule-card">
      <div class="carne-schedule-header">
        <div>
          <div class="card-title carne-schedule-title">Tabela da carne Convocados</div>
          <p class="carne-schedule-subtitle">Rodízio semanal de quarta-feira em duplas.</p>
        </div>
        ${nextEntry ? `
          <div class="carne-next-pill">
            <span>Próxima</span>
            <strong>${formatScheduleDate(nextEntry.date)}</strong>
          </div>
        ` : ''}
      </div>

      <div class="carne-schedule-list ${admin ? 'has-actions' : 'no-actions'}" role="table" aria-label="Tabela da carne Convocados">
        <div class="carne-schedule-list-head" role="row">
          <div role="columnheader">Data</div>
          <div role="columnheader">Dupla responsável</div>
          ${admin ? '<div role="columnheader">Ações</div>' : ''}
        </div>

        ${schedule.map((entry) => {
          const isNext = nextEntry && String(nextEntry.id) === String(entry.id);
          const player1 = getPlayerName(playersById, entry.player1_id);
          const player2 = getPlayerName(playersById, entry.player2_id);
          return `
            <div class="carne-schedule-item ${isNext ? 'is-next' : ''} ${admin ? 'has-actions' : 'no-actions'}" role="row">
              <div class="carne-date-box" role="cell">
                <span>${formatScheduleDate(entry.date)}</span>
                <small>Quarta</small>
              </div>
              <div class="carne-pair-boxes" role="cell">
                <div class="carne-player-box">${escapeHtml(player1)}</div>
                <div class="carne-player-box">${escapeHtml(player2)}</div>
              </div>
              ${admin ? `
                <div class="carne-schedule-actions" role="cell">
                  <button class="btn btn-secondary btn-sm" type="button" data-action="edit-carne-schedule" data-id="${escapeHtml(entry.id)}">Editar</button>
                  <button class="btn btn-danger btn-sm" type="button" data-action="delete-carne-schedule" data-id="${escapeHtml(entry.id)}">Excluir</button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>

      <p class="footer-note carne-next-note">${nextEntry ? `Próxima dupla: ${formatScheduleDate(nextEntry.date)} · ${escapeHtml(getPlayerName(playersById, nextEntry.player1_id))} e ${escapeHtml(getPlayerName(playersById, nextEntry.player2_id))}.` : ''}</p>
    </section>
  `;
}


function renderCarneMemberRow(player) {
  return `
    <div class="carne-member-row">
      <div class="carne-member-main">
        ${getAvatarHtml(player)}
        <div>
          <div class="row-title">${escapeHtml(player.name)}</div>
          <div class="row-subtitle">
            ${player.plays_football === false ? 'Somente carne' : getRoleLabel(player)}
            ${player.birthDate ? ` · Nasc. ${formatBirthDate(player.birthDate)}` : ''}
          </div>
        </div>
      </div>
      <div class="carne-member-tags">
        <span class="position-pill">${player.plays_football === false ? 'Somente carne' : getPositionLabel(player.position)}</span>
        ${player.plays_football !== false ? `<span class="tag ${player.mens_ok ? 'is-ok' : 'is-warn'}">${player.mens_ok ? 'Pago' : 'Pendente'}</span>` : ''}
      </div>
    </div>
  `;
}

function renderCarneSchedule(currentPlayer, orderedPlayers, rotation, dates, dirty = false, editingIndex = -1) {
  const admin = isAdmin(currentPlayer);
  const playersById = new Map(orderedPlayers.map((player) => [String(player.id), player]));
  const pairs = Array.isArray(rotation?.pairs) ? rotation.pairs : [];
  const isoDates = Array.isArray(dates) ? dates : [];
  const dateFor = (index) => isoDates[index] || '';

  // Jogadores que aparecem em mais de uma dupla (concorrência) — para alertar.
  const counts = new Map();
  pairs.forEach((pair) => [pair.player1_id, pair.player2_id].forEach((idv) => counts.set(String(idv), (counts.get(String(idv)) || 0) + 1)));
  const dupIds = new Set([...counts.entries()].filter(([, n]) => n > 1).map(([idv]) => idv));

  const dateCell = (index) => `
    <span class="carne-row-date ${index === 0 ? 'is-next' : ''}">
      <strong>${formatScheduleDate(dateFor(index))}</strong>
      ${index === 0 ? '<small>Próxima</small>' : ''}
    </span>
  `;

  const pairRow = (pair, index) => {
    if (admin && index === editingIndex) {
      return `
        <div class="carne-rotation-item is-editing" data-pair-index="${index}">
          ${dateCell(index)}
          <span class="carne-rotation-edit-fields">
            <select id="carne-pair-edit-1" class="input">${renderPlayerOptions(orderedPlayers, pair.player1_id)}</select>
            <select id="carne-pair-edit-2" class="input">${renderPlayerOptions(orderedPlayers, pair.player2_id)}</select>
          </span>
          <span class="carne-rotation-item-actions">
            <button class="icon-action-button is-ok" type="button" data-action="carne-pair-save" data-id="${index}" title="Salvar" aria-label="Salvar">✓</button>
            <button class="icon-action-button" type="button" data-action="carne-pair-cancel-edit" title="Cancelar" aria-label="Cancelar">✕</button>
            <button class="icon-action-button is-danger" type="button" data-action="carne-rotation-remove-pair" data-id="${index}" title="Remover dupla" aria-label="Remover dupla">🗑</button>
          </span>
        </div>
      `;
    }
    const dup = dupIds.has(String(pair.player1_id)) || dupIds.has(String(pair.player2_id));
    return `
      <div class="carne-rotation-item ${index === 0 ? 'is-next' : ''} ${dup ? 'is-conflict' : ''} ${admin ? '' : 'no-actions'}" data-pair-index="${index}">
        ${dateCell(index)}
        <span class="carne-rotation-names">${escapeHtml(getPlayerName(playersById, pair.player1_id))} <small>e</small> ${escapeHtml(getPlayerName(playersById, pair.player2_id))}${dup ? ' <span class="carne-conflict-flag" title="Jogador repetido no rodízio">⚠️</span>' : ''}</span>
        ${admin ? `
        <span class="carne-rotation-item-actions">
          <button class="icon-action-button" type="button" data-action="carne-pair-edit" data-id="${index}" title="Editar dupla" aria-label="Editar dupla">✎</button>
          <button class="carne-drag-handle" type="button" title="Arraste para reordenar" aria-label="Arraste para reordenar">⠿</button>
        </span>` : ''}
      </div>
    `;
  };

  const listHtml = pairs.length
    ? pairs.map((pair, index) => pairRow(pair, index)).join('')
    : `<div class="empty-inline">${admin ? 'Nenhuma dupla no rodízio ainda. Adicione abaixo.' : 'Nenhuma dupla no rodízio ainda.'}</div>`;

  if (!admin) {
    return `
      <section class="card carne-rotation-card">
        <div class="card-title">Calendário da carne</div>
        <p class="footer-note">Rodízio semanal automático. A dupla do topo é a próxima responsável.</p>
        <div class="carne-rotation-list">${listHtml}</div>
      </section>
    `;
  }

  return `
    <section class="card carne-rotation-card" id="carne-rotation-card">
      <div class="card-title">Calendário da carne</div>
      <p class="footer-note">Arraste pelo ⠿ para mudar a data de uma dupla, toque em ✎ para trocar os integrantes. A dupla do topo é a próxima. <strong>Tudo salva automaticamente.</strong></p>

      ${dupIds.size ? '<div class="carne-rotation-warning">⚠️ Há jogador(es) em mais de uma dupla. Cada pessoa deve estar em só uma.</div>' : ''}

      <label class="field-label">
        Próxima quarta (data da dupla do topo)
        <input id="carne-rotation-start" class="input" type="date" value="${rotation?.start_date || ''}" />
      </label>

      <div class="carne-rotation-list">${listHtml}</div>

      <div class="carne-rotation-add">
        <select id="carne-rotation-player-1" class="input"><option value="">Responsável 1</option>${renderPlayerOptions(orderedPlayers)}</select>
        <select id="carne-rotation-player-2" class="input"><option value="">Responsável 2</option>${renderPlayerOptions(orderedPlayers)}</select>
        <button class="btn btn-primary" type="button" data-action="carne-rotation-add-pair">Adicionar dupla</button>
      </div>
    </section>
  `;
}

export function renderCarneScreen(snapshot, currentPlayer, projectedPlayers = null, editingPlayerId = null, rotation = null, calendar = null, dirty = false, editingPairIndex = -1) {
  const sourcePlayers = Array.isArray(projectedPlayers) && projectedPlayers.length ? projectedPlayers : listPlayers();
  const orderedPlayers = [...sourcePlayers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const carneGroup = orderedPlayers.filter((player) => player.in_carne_group === true);
  const carneOnly = carneGroup.filter((player) => player.plays_football === false);
  const jogadoresNoCarne = carneGroup.filter((player) => player.plays_football !== false);
  const carneRotation = rotation || { pairs: [], start_date: '' };
  const carneDates = Array.isArray(calendar) ? calendar : [];
  const cycleLength = Array.isArray(carneRotation.pairs) ? carneRotation.pairs.length : 0;

  return `
    <section class="section-stack">
      ${renderCarneSchedule(currentPlayer, orderedPlayers, carneRotation, carneDates, dirty, editingPairIndex)}

      ${renderChurrascoRanking(snapshot)}

      <section class="card">
        <div class="card-title">Resumo do carne</div>
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-value">${carneGroup.length}</div>
            <div class="kpi-label">Integrantes do grupo</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${carneOnly.length}</div>
            <div class="kpi-label">Somente carne</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${jogadoresNoCarne.length}</div>
            <div class="kpi-label">Jogadores também no carne</div>
          </div>
          <div class="kpi-box kpi-box--highlight">
            <div class="kpi-value">${cycleLength}</div>
            <div class="kpi-label">Duplas no rodízio</div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Somente carne</div>
        <div class="placeholder-list">
          ${carneOnly.length ? carneOnly.map((player) => renderCarneMemberRow(player)).join('') : '<div class="empty-inline">Nenhum perfil somente carne cadastrado.</div>'}
        </div>
      </section>
    </section>
  `;
}

// Ranking dos churrascos do CICLO atual do rodízio (N duplas = N semanas).
// Vive na aba Carne (lar natural do rodízio de duplas).
function renderChurrascoRanking(snapshot) {
  if (!isVotingEnabled()) return '';
  const churras = getCachedRatings().filter((r) => r.kind === 'churrasco');
  if (!churras.length) {
    return `
      <section class="card">
        <div class="card-title">Ranking dos churrascos 🥩</div>
        <div class="empty-inline">Ainda não há notas de churrasco.</div>
      </section>`;
  }
  const n = ((snapshot.carne || []).find((e) => e.type === 'carne_rotation')?.pairs || []).length;
  // Jogos com churrasco, mais recentes primeiro → recorta o ciclo atual (N jogos).
  const lastByGame = {};
  for (const r of churras) {
    const g = String(r.game_key);
    if (!lastByGame[g] || String(r.created_at) > String(lastByGame[g])) lastByGame[g] = r.created_at;
  }
  const recentGames = Object.keys(lastByGame).sort((a, b) => String(lastByGame[b]).localeCompare(String(lastByGame[a])));
  const cycleGames = n ? recentGames.slice(0, n) : recentGames;
  const duos = duoRatingAverages(churras, cycleGames);
  const name = (id) => (snapshot.players || []).find((p) => String(p.id) === String(id))?.name || 'Jogador';
  const list = Object.entries(duos)
    .map(([key, agg]) => { const [a, b] = String(key).split('|'); return { names: `${name(a)} e ${name(b)}`, avg: agg.avg, votes: agg.votes }; })
    .sort((x, y) => y.avg - x.avg);
  return `
    <section class="card">
      <div class="card-title">Ranking dos churrascos 🥩</div>
      <p class="footer-note">Média da dupla no ciclo atual do rodízio${n ? ` (${n} duplas)` : ''}.</p>
      <div class="churrasco-rank-list">
        ${list.map((d, i) => `
          <div class="churrasco-rank-row">
            <span class="churrasco-rank-pos">${i + 1}</span>
            <span class="churrasco-rank-name">${escapeHtml(d.names)}</span>
            <span class="churrasco-rank-avg">${d.avg.toFixed(1)} <small>${d.votes} voto${d.votes === 1 ? '' : 's'}</small></span>
          </div>`).join('')}
      </div>
    </section>
  `;
}

// Linha compacta unificada (jogadores e somente-carne): avatar + nome/subtítulo
// à esquerda; à direita, o controle de mensalidade (quando jogador) e as ações,
// distribuídos. Linha curta, ocupa melhor a largura em vez do grid de 5 colunas.
function renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId = null) {
  const admin = isAdmin(currentPlayer);
  const currentFlag = isCurrentPlayer(player, currentPlayer);
  const isEditing = player.id === editingPlayerId;
  const carneOnly = isCarneOnly(player);
  const access = admin ? (player.auth_user_id ? 'Acesso criado' : 'Sem acesso') : '';
  const subtitle = `${carneOnly ? 'Somente carne' : getPositionLabel(player.position)}${access ? ` · ${access}` : ''}`;

  return `
    <div class="player-compact-row ${currentFlag ? 'is-current' : ''} ${isEditing ? 'is-editing' : ''}" role="row">
      <div class="player-compact-main">
        ${getAvatarHtml(player)}
        <div class="player-compact-text">
          <div class="row-title">${escapeHtml(player.name || '')}${currentFlag ? ' · você' : ''}</div>
          <div class="row-subtitle">${subtitle}</div>
        </div>
      </div>
      <div class="player-compact-right">
        ${carneOnly ? '' : renderFinanceControls(player, currentPlayer)}
        ${admin ? `
          <div class="carne-edit-actions">
            <button class="icon-action-button player-edit-near-paid" type="button" data-action="edit-player" data-id="${player.id}" title="Editar" aria-label="Editar"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            ${player.auth_user_id
              ? `<button class="icon-action-button player-reset-password-near-paid" type="button" data-action="reset-player-password" data-id="${player.id}" title="Resetar senha" aria-label="Resetar senha"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2"/><path d="M16.5 6.5l3 3"/></svg></button>`
              : `<button class="access-action-button" type="button" data-action="create-player-access" data-id="${player.id}">Criar acesso</button>`}
            ${!currentFlag ? `<button class="icon-action-button player-delete-near-paid" type="button" data-action="delete-player" data-id="${player.id}" title="Excluir" aria-label="Excluir"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/><path d="M10 11v6M14 11v6"/></svg></button>` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

