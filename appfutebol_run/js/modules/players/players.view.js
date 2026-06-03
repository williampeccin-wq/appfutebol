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

function isCarneOnly(player) {
  return player?.plays_football === false;
}

function isFinancePending(player) {
  return !isCarneOnly(player) && !player?.mens_ok;
}

function renderFinanceControls(player, currentPlayer) {
  if (isCarneOnly(player)) return '<span class="switch-placeholder">—</span>';

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

  return `
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
      <div class="card-title" id="player-management-title">Gerenciar jogadores</div>
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

        <div class="player-admin-actions"><button class="btn btn-primary" type="button" data-action="add-player">Adicionar</button><button class="btn btn-secondary" type="button" data-action="cancel-edit" id="cancel-edit-button" style="display:none;">Cancelar</button></div>
      </div>
    </section>
  `;
}

function renderSelfProfileCard(currentPlayer) {
  // Edição do próprio cadastro fica concentrada na Home, recolhida atrás do botão Editar.
  return '';
}




export function renderPlayersScreen(snapshot, currentPlayer, projectedPlayers = null, editingPlayerId = null) {
  const sourcePlayers = Array.isArray(projectedPlayers) && projectedPlayers.length ? projectedPlayers : listPlayers();
  const orderedPlayers = [...sourcePlayers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const allPlayers = orderedPlayers;
  const jogadores = orderedPlayers.filter((player) => player.plays_football !== false);
  const carneGroup = orderedPlayers.filter((player) => player.in_carne_group === true);
  const carneOnly = carneGroup.filter((player) => player.plays_football === false);
  const jogadoresFinanceiros = jogadores.filter((player) => !isCarneOnly(player));
  const emDia = jogadoresFinanceiros.filter((player) => !!player.mens_ok).length;
  const pendentes = jogadoresFinanceiros.filter((player) => !player.mens_ok).length;
  const adimplencia = jogadoresFinanceiros.length ? Math.round((emDia / jogadoresFinanceiros.length) * 100) : 100;

  return `
    <section class="section-stack">
      <section class="card">
        <div class="card-title">Sessão atual</div>
        <div class="session-card">
          <div class="session-main">
            ${getAvatarHtml(currentPlayer, "avatar-lg")}
            <div>
              <div class="row-title">${currentPlayer.name}</div>
              <div class="row-subtitle">${getRoleLabel(currentPlayer)} · ${formatPhone(currentPlayer.phone)}${currentPlayer.birthDate ? ` · Nasc. ${formatBirthDate(currentPlayer.birthDate)}` : ''}</div>
            </div>
          </div>
          <div class="chip-row">
            <span class="tag is-neutral">${currentPlayer.plays_football === false ? 'Somente carne' : getPositionLabel(currentPlayer.position)}</span>
            <span class="tag ${currentPlayer.plays_football === false || currentPlayer.mens_ok ? 'is-ok' : 'is-warn'}">${currentPlayer.plays_football === false || currentPlayer.mens_ok ? 'Mensalidade ok' : 'Mensalidade pendente'}</span>
          </div>
        </div>
      </section>

      ${renderPlayerManagementCard(currentPlayer)}
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

        <div class="players-switch-table" role="table" aria-label="Jogadores">
          <div class="players-switch-head" role="row">
            <div role="columnheader">Jogador</div>
            <div role="columnheader">Posição</div>
            <div role="columnheader">Pago</div>
            <div role="columnheader">No jogo</div>
            <div role="columnheader">Ações</div>
          </div>
          ${jogadores.map((player) => renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId)).join('')}
        </div>

        <div class="switch-legend">
          <span><span class="legend-switch is-on"></span> Pago / dentro do jogo</span>
          <span><span class="legend-switch is-off"></span> Pendente / fora do jogo</span>
        </div>
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
        <div class="card-title">Tabela da carne Harmonia</div>
        <div class="empty-inline">Nenhuma dupla cadastrada ainda. O admin pode criar a primeira dupla acima.</div>
      </section>
    `;
  }

  return `
    <section class="card carne-schedule-card">
      <div class="carne-schedule-header">
        <div>
          <div class="card-title carne-schedule-title">Tabela da carne Harmonia</div>
          <p class="carne-schedule-subtitle">Rodízio semanal de quarta-feira em duplas.</p>
        </div>
        ${nextEntry ? `
          <div class="carne-next-pill">
            <span>Próxima</span>
            <strong>${formatScheduleDate(nextEntry.date)}</strong>
          </div>
        ` : ''}
      </div>

      <div class="carne-schedule-list ${admin ? 'has-actions' : 'no-actions'}" role="table" aria-label="Tabela da carne Harmonia">
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

export function renderCarneScreen(snapshot, currentPlayer, projectedPlayers = null, editingPlayerId = null) {
  const sourcePlayers = Array.isArray(projectedPlayers) && projectedPlayers.length ? projectedPlayers : listPlayers();
  const orderedPlayers = [...sourcePlayers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const carneGroup = orderedPlayers.filter((player) => player.in_carne_group === true);
  const carneOnly = carneGroup.filter((player) => player.plays_football === false);
  const jogadoresNoCarne = carneGroup.filter((player) => player.plays_football !== false);
  const schedule = getCarneScheduleEntries(snapshot, orderedPlayers);

  return `
    <section class="section-stack">
      ${renderCarneScheduleForm(currentPlayer, orderedPlayers)}

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
            <div class="kpi-value">${schedule.length}</div>
            <div class="kpi-label">Duplas cadastradas</div>
          </div>
        </div>
      </section>

      ${renderCarneScheduleTable(schedule, orderedPlayers, currentPlayer)}

      <section class="card">
        <div class="card-title">Somente carne</div>
        <div class="placeholder-list">
          ${carneOnly.length ? carneOnly.map((player) => renderCarneMemberRow(player)).join('') : '<div class="empty-inline">Nenhum perfil somente carne cadastrado.</div>'}
        </div>
      </section>

      <section class="card">
        <div class="card-title">Jogadores no grupo da carne</div>
        <div class="placeholder-list">
          ${jogadoresNoCarne.length ? jogadoresNoCarne.map((player) => renderCarneMemberRow(player)).join('') : '<div class="empty-inline">Nenhum jogador vinculado ao grupo da carne.</div>'}
        </div>
      </section>
    </section>
  `;
}

function renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId = null) {
  const isEditing = player.id === editingPlayerId;
  const currentFlag = isCurrentPlayer(player, currentPlayer);

  return `
    <div class="players-switch-row player-row-card ${currentFlag ? 'is-current' : ''} ${isEditing ? 'is-editing' : ''}" role="row">
      <div class="players-switch-player player-row-identity" role="cell">
        ${getAvatarHtml(player)}
        <div class="players-switch-player-text">
          <div class="row-title">${player.name}${currentFlag ? ' · você' : ''}</div>
          ${isAdmin(currentPlayer) ? `<div class="access-status ${player.auth_user_id ? 'has-access' : 'no-access'}">${player.auth_user_id ? 'Acesso criado' : 'Sem acesso'}</div>` : ''}
        </div>
      </div>

      <div class="player-row-status" role="cell">
        <span class="position-pill">${player.plays_football === false ? 'Somente carne' : getPositionLabel(player.position)}</span>
        ${renderFinanceControls(player, currentPlayer)}
      </div>

      <div class="player-row-actions" role="cell">
        ${isAdmin(currentPlayer) ? `<button class="icon-action-button player-edit-near-paid" type="button" data-action="edit-player" data-id="${player.id}" title="Editar jogador" aria-label="Editar jogador">✎</button>` : ''}
        ${isAdmin(currentPlayer) && player.auth_user_id ? `<button class="icon-action-button player-reset-password-near-paid" type="button" data-action="reset-player-password" data-id="${player.id}" title="Resetar senha" aria-label="Resetar senha">🔑</button>` : ''}
        ${isAdmin(currentPlayer) && !player.auth_user_id ? `<button class="access-action-button" type="button" data-action="create-player-access" data-id="${player.id}" title="Criar acesso" aria-label="Criar acesso">Criar acesso</button>` : ''}
        ${isAdmin(currentPlayer) && !isCurrentPlayer(player, currentPlayer) && !player.auth_user_id ? `<button class="icon-action-button player-delete-near-paid" type="button" data-action="delete-player" data-id="${player.id}" title="Excluir jogador" aria-label="Excluir jogador">🗑</button>` : ''}
        ${isAdmin(currentPlayer) && !isCurrentPlayer(player, currentPlayer) && player.auth_user_id ? `<button class="icon-action-button player-delete-protected" type="button" data-action="delete-player-protected" data-id="${player.id}" title="Jogador com acesso ativo. Remova o acesso antes de excluir." aria-label="Exclusão bloqueada">🔒</button>` : ''}
      </div>
    </div>
  `;
}

