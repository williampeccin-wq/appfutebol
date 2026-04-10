import { buildGameView, buildPlayersView } from "../domain/projection.js";
import { APP_VERSION } from "./version.js";
import { getState, patchState, replaceState, subscribe } from './state.js';
import { getState as loadPersistedState, saveState as savePersistedState, getStorageMeta } from '../domain/storage.adapter.js';
import { getCurrentPlayer, login, logout, register, restoreSession } from '../services/auth.service.js';
import { renderAuthScreen } from '../modules/auth/auth.view.js';
import { renderPlayersScreen } from '../modules/players/players.view.js';
import { canManagePresence, isConfirmed, toggleConfirmation } from '../modules/game/game.service.js';
import { hasCapacity } from '../modules/game/game.service.js';
import { canConfirm } from '../modules/finance/finance.service.js';

const appElement = document.getElementById('app');

init();

function init() {
  const data = loadPersistedState();
  replaceState(data);
  restoreSession();

  subscribe((snapshot) => {
    persist(snapshot);
    render(snapshot);
  });

  render(getState());
}

function persist(snapshot) {
  savePersistedState(snapshot);
}

function render(snapshot) {
  const currentPlayer = getCurrentPlayer();

  if (!currentPlayer) {
    appElement.innerHTML = renderAuthScreen(snapshot.ui);
    bindAuthEvents();
    return;
  }

  const requestedTab = snapshot.ui.currentTab || 'home';
  const activeTab = !currentPlayer.is_admin && requestedTab === 'config' ? 'home' : requestedTab;
  if (activeTab !== requestedTab) {
    patchState({ ui: { currentTab: activeTab } });
    return;
  }

  appElement.innerHTML = `
    <div class="header">
      <div class="header-row">
        <div>
          <div class="header-title">HARMONIA <span style='font-size:12px;opacity:0.7;'>${APP_VERSION}</span></div>
          <div class="header-subtitle">${buildHeaderSubtitle(currentPlayer)}</div>
        </div>
        <div class="header-actions">
          <div class="header-badge">${currentPlayer.is_admin ? 'Admin' : currentPlayer.role === 'carne' ? 'Carne' : 'Jogador'}</div>
          <button class="header-logout" type="button" id="logout-button">Sair</button>
        </div>
      </div>
    </div>

    <nav class="nav" aria-label="Navegação principal">
      ${renderNavButton('home', 'Home', activeTab)}
      ${renderNavButton('players', 'Jogadores', activeTab)}
      ${renderNavButton('championship', 'Campeonato', activeTab)}
      ${currentPlayer.is_admin ? renderNavButton('config', 'Config', activeTab) : ''}
    </nav>

    <main class="content">
      ${renderTab(snapshot, activeTab, currentPlayer)}
    </main>
  `;

  bindAppEvents(currentPlayer);
}

function bindAuthEvents() {
  const modeButtons = appElement.querySelectorAll('[data-auth-mode]');
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      patchState({
        ui: {
          authMode: button.dataset.authMode,
          authMessage: null,
        },
      });
    });
  });

  const loginForm = appElement.querySelector('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const result = login(formData.get('phone'), formData.get('password'));
      if (!result.ok) {
        patchState({
          ui: {
            authMode: 'login',
            authMessage: { type: 'error', text: result.message },
          },
        });
      }
    });
  }

  const registerForm = appElement.querySelector('#register-form');
  if (registerForm) {
    const roleSelect = registerForm.querySelector('#register-role');
    const positionGroup = registerForm.querySelector('#position-group');
    const togglePosition = () => {
      const role = roleSelect?.value === 'carne' ? 'carne' : 'jogador';
      if (positionGroup) {
        positionGroup.style.display = role === 'carne' ? 'none' : 'grid';
      }
    };

    togglePosition();
    roleSelect?.addEventListener('change', togglePosition);

    registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const result = register({
        name: formData.get('name'),
        phone: formData.get('phone'),
        birthDate: formData.get('birthDate'),
        role: formData.get('role'),
        position: formData.get('position'),
        password: formData.get('password'),
        passwordConfirm: formData.get('passwordConfirm'),
      });

      if (!result.ok) {
        patchState({
          ui: {
            authMode: 'register',
            authMessage: { type: 'error', text: result.message },
          },
        });
      }
    });
  }
}



function getPresenceIcon(reason, confirmed, capacityOk) {
  if (confirmed) return "✅";
  if (!capacityOk) return "🚫";

  switch (reason) {
    case "inadimplente":
    case "mensalidade_pendente":
    case "mensalidade_vencida":
      return "💸";
    case "carne":
    case "carne_only":
      return "📄";
    case "inactive":
      return "⛔";
    default:
      return "ℹ️";
  }
}

function getPresenceReasonLabel(reason) {
  switch (reason) {
    case 'carne_only':
      return 'Somente carnê';
    case 'mensalidade_pendente':
      return 'Mensalidade pendente';
    case 'mensalidade_sem_data':
      return 'Mensalidade sem data';
    case 'mensalidade_vencida':
      return 'Mensalidade vencida';
    case 'inscricoes_fechadas':
      return 'Inscrições fechadas';
    case 'game_full':
      return 'Jogo cheio';
    default:
      return 'Ação indisponível';
  }
}

function buildPresenceFeedback({ confirmed, capacityOk, presenceGuard, currentPlayer, carneStatus }) {
  if (confirmed) {
    return {
      icon: getPresenceIcon('confirmed', confirmed, capacityOk),
      toneClass: 'is-ok',
      title: 'Você está confirmado',
      text: 'Sua vaga está reservada. Se precisar, você ainda pode cancelar a presença.',
      badge: 'Confirmado',
    };
  }

  if (!capacityOk) {
    return {
      icon: getPresenceIcon('game_full', confirmed, capacityOk),
      toneClass: 'is-warn',
      title: 'Sem vagas no momento',
      text: 'O jogo já está cheio. Se alguém cancelar, a vaga volta a ficar disponível.',
      badge: 'Jogo cheio',
    };
  }

  if (presenceGuard.ok) {
    return {
      icon: getPresenceIcon('ok', confirmed, capacityOk),
      toneClass: 'is-neutral',
      title: 'Pronto para confirmar',
      text: 'Seu cadastro está apto para confirmar presença neste jogo.',
      badge: 'Liberado',
    };
  }

  const reasons = Array.isArray(presenceGuard?.decision?.reasons) ? presenceGuard.decision.reasons : [];
  const primaryReason = reasons[0] || 'unknown';

  return {
    icon: getPresenceIcon(primaryReason, confirmed, capacityOk),
    toneClass: 'is-warn',
    title: getPresenceReasonLabel(primaryReason),
    text: presenceGuard.message || (
      carneStatus
        ? 'Você está vinculado ao grupo do carnê e não pode confirmar presença agora.'
        : currentPlayer?.role === 'carne'
          ? 'Perfis somente carnê não participam da confirmação do jogo.'
          : 'Sua confirmação está bloqueada no momento.'
    ),
    badge: getPresenceReasonLabel(primaryReason),
  };
}


function bindAppEvents(currentPlayer) {
  appElement.querySelector('#logout-button')?.addEventListener('click', () => logout());

  const buttons = appElement.querySelectorAll('[data-tab]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      patchState({ ui: { currentTab: button.dataset.tab } });
    });
  });

  appElement.querySelector('#confirm-btn')?.addEventListener('click', () => {
    toggleConfirmation(currentPlayer.id);
  });
}

function renderNavButton(tab, label, activeTab) {
  const activeClass = tab === activeTab ? 'is-active' : '';
  return `<button class="nav-button ${activeClass}" type="button" data-tab="${tab}">${label}</button>`;
}

function renderTab(snapshot, activeTab, currentPlayer) {
  switch (activeTab) {
    case 'players':
      return renderPlayersScreen(snapshot, currentPlayer, buildPlayersView(snapshot));
    case 'championship':
      return renderChampionship(snapshot);
    case 'config':
      return renderConfig(snapshot, currentPlayer);
    case 'home':
    default:
      return renderHome(snapshot, currentPlayer);
  }
}

function renderHome(snapshot, currentPlayer) {
  let workingSnapshot = snapshot;

  if (!canConfirm(currentPlayer)) {
    const latest = getState();
    const hadConfirmed = latest.confirmations?.some(
      (c) => c.player_id === currentPlayer.id && c.confirmed
    );

    if (hadConfirmed) {
      patchState({
        confirmations: latest.confirmations.map((c) =>
          c.player_id === currentPlayer.id ? { ...c, confirmed: false } : c
        ),
      });
      workingSnapshot = getState();
    }
  }

  const gameView = buildGameView(workingSnapshot, currentPlayer.id);
  const game = gameView.game;
  const confirmedCount = gameView.confirmedCount;
  const maxPlayers = gameView.maxPlayers || 0;
  const fillPercent = maxPlayers ? Math.min(100, Math.round((confirmedCount / maxPlayers) * 100)) : 0;
  const vagasRestantes = gameView.spotsLeft;
  const mensalidade = buildMensalidadeMeta(game, currentPlayer);
  const carneStatus = workingSnapshot.carne.some((entry) => entry.player_id === currentPlayer.id && entry.active);
  const confirmed = gameView.isConfirmed;
  const presenceGuard = canManagePresence(currentPlayer, game);
  const capacityOk = confirmed || gameView.canConfirm || hasCapacity();
  const canRenderPresenceAction = confirmed || (presenceGuard.ok && capacityOk);
  const statusNote = !confirmed && !capacityOk
    ? 'O jogo já está cheio.'
    : presenceGuard.ok
      ? ''
      : presenceGuard.message;
  const presenceFeedback = buildPresenceFeedback({
    confirmed,
    capacityOk,
    presenceGuard,
    currentPlayer,
    carneStatus,
  });

  return `
    <section class="section-stack">
      <section class="hero-card">
        <div class="hero-label">Próximo jogo</div>
        <div class="hero-date">${formatDate(game?.game_date)}</div>
        <div class="hero-meta">${game?.game_time || '--:--'} · ${game?.open ? 'Inscrições abertas' : 'Inscrições fechadas'}</div>
        <div class="hero-progress">
          <div class="progress-track">
            <div class="progress-bar" style="width:${fillPercent}%"></div>
          </div>
          <div class="progress-text">${confirmedCount} / ${maxPlayers} confirmados</div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Usuário logado</div>
        <div class="session-card compact">
          <div class="session-main">
            <div class="avatar avatar-lg">${getInitials(currentPlayer.name)}</div>
            <div>
              <div class="row-title">${currentPlayer.name}</div>
              <div class="row-subtitle">${currentPlayer.is_admin ? 'Administrador' : currentPlayer.role === 'carne' ? 'Somente carne' : getPositionLabel(currentPlayer.position)} · ${formatPhone(currentPlayer.phone)}</div>
            </div>
          </div>
          <div class="chip-row">
            <span class="tag ${currentPlayer.mens_ok ? 'is-ok' : 'is-warn'}">${currentPlayer.mens_ok ? 'Mensalidade ok' : 'Mensalidade pendente'}</span>
            <span class="tag is-neutral">${carneStatus ? 'Grupo da carne ativo' : 'Sem grupo da carne'}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Confirmação de presença</div>
        <div class="info-block">
          <div class="chip-row" style="margin-bottom:12px;">
            <span class="tag ${presenceFeedback.toneClass}">${presenceFeedback.badge}</span>
          </div>
          <div class="info-line">Vagas restantes: <strong>${vagasRestantes}</strong></div>
          <div class="info-line">Seu status atual: <strong>${confirmed ? 'Confirmado' : 'Não confirmado'}</strong></div>
          <div class="status-box ${presenceFeedback.toneClass}" style="margin-top:12px;">
            <div class="status-title">${presenceFeedback.icon} ${presenceFeedback.title}</div>
            <div class="status-subline">${presenceFeedback.text}</div>
          </div>
          ${statusNote && statusNote !== presenceFeedback.text ? `<p class="footer-note">${statusNote}</p>` : ''}
          ${canRenderPresenceAction ? `
            <div class="actions" style="margin-top:12px;">
              <button class="btn btn-primary" type="button" id="confirm-btn">${confirmed ? 'Cancelar presença' : 'Confirmar presença'}</button>
            </div>
          ` : ''}
        </div>
      </section>

      <section class="card">
        <div class="card-title">Resumo rápido</div>
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-value">${workingSnapshot.players.filter((player) => player.role === 'jogador').length}</div>
            <div class="kpi-label">Jogadores cadastrados</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${workingSnapshot.carne.length}</div>
            <div class="kpi-label">Grupo da carne</div>
          </div>
        </div>
      </section>

      <section class="status-box ${mensalidade.className}">
        <div class="status-title">Mensalidade · ${mensalidade.title}</div>
        <div class="status-subline">${mensalidade.subline}</div>
      </section>

      <section class="card">
        <div class="card-title">Notificações recentes</div>
        <div class="info-block">
          ${workingSnapshot.notifications.map((notification) => `
            <div class="info-line">• ${notification.message}</div>
          `).join('')}
        </div>
      </section>
    </section>
  `;
}

function renderChampionship(snapshot) {
  const ranking = snapshot.championship?.ranking || [];

  return `
    <section class="section-stack">
      <section class="card">
        <div class="card-title">Campeonato atual</div>
        <div class="info-block">
          <div class="info-line">Período iniciado em ${formatDate(snapshot.championship?.start_date)}</div>
          <div class="info-line">Status: ${snapshot.championship?.closed ? 'Encerrado' : 'Ativo'}</div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Ranking</div>
        <div class="placeholder-list">
          ${ranking.map((item, index) => {
            const player = snapshot.players.find((entry) => entry.id === item.player_id);
            return `
              <div class="placeholder-row">
                <div class="placeholder-main">
                  <div class="avatar">${index + 1}</div>
                  <div>
                    <div class="row-title">${player?.name || 'Jogador removido'}</div>
                    <div class="row-subtitle">Pontuação acumulada</div>
                  </div>
                </div>
                <div class="tag is-neutral">${item.points} pts</div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    </section>
  `;
}

function renderConfig(snapshot, currentPlayer) {
  if (!currentPlayer.is_admin) {
    return `
      <section class="section-stack">
        <section class="card">
          <div class="card-title">Acesso restrito</div>
          <p class="footer-note">Somente administradores podem acessar a configuração do sistema.</p>
        </section>
      </section>
    `;
  }

  return `
    <section class="section-stack">
      <section class="card">
        <div class="card-title">Fase 4 concluída</div>
        <div class="info-block">
          <div class="info-line">• Confirmação de presença integrada à Home</div>
          <div class="info-line">• Toggle confirmar / cancelar persistido em storage local</div>
          <div class="info-line">• Perfis carne continuam fora da confirmação do jogo</div>
          <div class="info-line">• Estrutura pronta para regras de mensalidade na próxima fase</div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Admin snapshot</div>
        <p class="footer-note">
          Players: ${snapshot.players.length} · Confirmações ativas: ${buildGameView(snapshot, null).confirmedCount}
        </p>
      </section>
    </section>
  `;
}

function buildMensalidadeMeta(game, currentPlayer) {
  if (currentPlayer.role === 'carne') {
    return {
      className: 'is-ok',
      title: 'Não aplicável',
      subline: 'Perfis somente carne não dependem da mensalidade do futebol para acessar o sistema.',
    };
  }

  if (!game?.mens_expire_date) {
    return {
      className: 'is-warn',
      title: 'Sem data definida',
      subline: 'A data de vencimento mensal ainda não foi configurada.',
    };
  }

  if (!currentPlayer.mens_ok) {
    return {
      className: 'is-danger',
      title: 'Pendente',
      subline: 'Sua mensalidade está marcada como pendente no sistema.',
    };
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const expireDate = new Date(`${game.mens_expire_date}T12:00:00`);

  if (expireDate < today) {
    return {
      className: 'is-danger',
      title: 'Pendente',
      subline: `Mensalidade vencida em ${formatDate(game.mens_expire_date)}.`,
    };
  }

  const diffInDays = Math.ceil((expireDate.getTime() - today.getTime()) / 86400000);
  if (diffInDays <= 3) {
    return {
      className: 'is-warn',
      title: 'Atenção',
      subline: `Mensalidade vence em ${formatDate(game.mens_expire_date)}.`,
    };
  }

  return {
    className: 'is-ok',
    title: 'Em dia',
    subline: `Mensalidade válida até ${formatDate(game.mens_expire_date)}.`,
  };
}

function buildHeaderSubtitle(currentPlayer) {
  const profile = currentPlayer.is_admin ? 'Administrador' : currentPlayer.role === 'carne' ? 'Perfil carne' : getPositionLabel(currentPlayer.position);
  return `${currentPlayer.name} · ${profile}`;
}

function formatDate(value) {
  if (!value) return '--/--/----';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
}

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return digits;
}

function getPositionLabel(position) {
  const labels = { zag: 'Zagueiro', meia: 'Meia', atk: 'Atacante' };
  return labels[position] || 'Sem posição';
}

function getInitials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}
