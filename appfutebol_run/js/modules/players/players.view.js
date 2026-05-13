import {
  formatBirthDate,
  formatPhone,
  getInitials,
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
  if (!isAdmin(currentPlayer)) return '';
  if (isCarneOnly(player)) return '';
  if (isFinancePending(player)) {
    return `<button class="btn btn-secondary finance-action-button" type="button" data-action="mark-paid" data-id="${player.id}">Marcar pago</button>`;
  }

  return `<button class="btn btn-primary finance-action-button" type="button" data-action="mark-debt" data-id="${player.id}">Marcar inadimplente</button>`;
}



function renderAdminGameRemovalControl(player, currentPlayer, confirmed) {
  if (!isAdmin(currentPlayer)) return '';
  if (isCarneOnly(player)) return '';
  if (!confirmed) return '';

  return `<button class="btn btn-danger presence-remove-button" type="button" data-action="admin-remove-from-game" data-id="${player.id}">Remover</button>`;
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

        <select id="new-role" class="input">
          <option value="player">Jogador</option>
          <option value="carne">Carne</option>
        </select>

        <select id="new-position" class="input" data-role-dependent="position">
          <option value="meia">Meia</option>
          <option value="zag">Zagueiro</option>
          <option value="atk">Atacante</option>
        </select>

        <label><input id="new-admin" type="checkbox" /> Admin</label>
        <label><input id="new-mens" type="checkbox" checked /> Mensalidade OK</label>

        <div class="player-admin-actions"><button class="btn btn-primary" type="button" data-action="add-player">Adicionar</button><button class="btn btn-secondary" type="button" data-action="cancel-edit" id="cancel-edit-button" style="display:none;">Cancelar</button></div>
      </div>
    </section>
  `;
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
            <div class="avatar avatar-lg">${getInitials(currentPlayer.name)}</div>
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

      <section class="card">
        <div class="card-title">Resumo do elenco</div>
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-value">${allPlayers.length}</div>
            <div class="kpi-label">Perfis cadastrados</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${jogadores.length}</div>
            <div class="kpi-label">Jogadores do futebol</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${carneOnly.length}</div>
            <div class="kpi-label">Somente carne</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${allPlayers.filter((player) => player.plays_football !== false && player.isConfirmed).length}</div>
            <div class="kpi-label">Confirmados no jogo</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${emDia}</div>
            <div class="kpi-label">Financeiro em dia</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${pendentes}</div>
            <div class="kpi-label">Financeiro pendente</div>
          </div>
          <div class="kpi-box kpi-box--highlight">
            <div class="kpi-value">${adimplencia}%</div>
            <div class="kpi-label">Adimplência</div>
          </div>
          <div class="kpi-box kpi-box--muted">
            <div class="kpi-value">${jogadoresFinanceiros.length}</div>
            <div class="kpi-label">Base financeira</div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Jogadores do futebol</div>
        <div class="placeholder-list">
          ${jogadores.map((player) => renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId)).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-title">Permissões</div>
        <p class="footer-note">
          ${isAdmin(currentPlayer)
            ? 'Você está logado como administrador. Na próxima fase, o CRUD de jogadores e a gestão do grupo da carne entram aqui.'
            : 'Você está logado como usuário comum. A aba Config fica restrita ao admin.'}
        </p>
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

export function renderCarneScreen(snapshot, currentPlayer, projectedPlayers = null, editingPlayerId = null) {
  const sourcePlayers = Array.isArray(projectedPlayers) && projectedPlayers.length ? projectedPlayers : listPlayers();
  const orderedPlayers = [...sourcePlayers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const carneGroup = orderedPlayers.filter((player) => player.in_carne_group === true);
  const carneOnly = carneGroup.filter((player) => player.plays_football === false);
  const jogadoresNoCarne = carneGroup.filter((player) => player.plays_football !== false);
  const schedule = getCarneScheduleEntries(snapshot, orderedPlayers);

  return `
    <section class="section-stack">
      ${renderPlayerManagementCard(currentPlayer)}
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
          ${carneOnly.length ? carneOnly.map((player) => renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId)).join('') : '<div class="empty-inline">Nenhum perfil somente carne cadastrado.</div>'}
        </div>
      </section>

      <section class="card">
        <div class="card-title">Jogadores no grupo da carne</div>
        <div class="placeholder-list">
          ${jogadoresNoCarne.length ? jogadoresNoCarne.map((player) => renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId)).join('') : '<div class="empty-inline">Nenhum jogador vinculado ao grupo da carne.</div>'}
        </div>
      </section>
    </section>
  `;
}

function renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId = null) {
  const isEditing = player.id === editingPlayerId;
  const currentFlag = isCurrentPlayer(player, currentPlayer);
  const confirmed = player.plays_football === false ? false : !!player.isConfirmed;
  const financePending = isFinancePending(player);

  return `
    <div class="placeholder-row ${currentFlag ? 'is-current' : ''} ${isEditing ? 'is-editing' : ''}">
      <div class="placeholder-main">
        <div class="avatar">${getInitials(player.name)}</div>
        <div>
          <div class="row-title">${player.name}${currentFlag ? ' · você' : ''}</div>
          <div class="row-subtitle">
            ${player.plays_football === false ? 'Somente carne' : getPositionLabel(player.position)} · ${formatPhone(player.phone)}${player.birthDate ? ` · Nasc. ${formatBirthDate(player.birthDate)}` : ''}
          </div>
          <div class="chip-row chip-row-sm">
            <span class="tag is-neutral">${getRoleLabel(player)}</span>
            ${player.plays_football !== false ? `<span class="tag ${confirmed ? 'is-ok' : 'is-neutral'}">${confirmed ? 'Confirmado' : 'Não confirmado'}</span>` : ''}
          </div>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        ${player.plays_football === false ? '' : `<div class="tag ${financePending ? 'is-warn' : 'is-ok'}">${financePending ? 'Pendente' : 'Em dia'}</div>`}
        ${renderFinanceControls(player, currentPlayer)}
        ${renderAdminGameRemovalControl(player, currentPlayer, confirmed)}
        ${isAdmin(currentPlayer) && !isCurrentPlayer(player, currentPlayer) ? `<button class="btn btn-secondary finance-action-button" type="button" data-action="edit-player" data-id="${player.id}">Editar</button>` : ''}
        ${isAdmin(currentPlayer) && !isCurrentPlayer(player, currentPlayer) ? `<button class="btn btn-secondary finance-action-button" type="button" data-action="delete-player" data-id="${player.id}">Excluir</button>` : ''}
      </div>
    </div>
  `;
}

