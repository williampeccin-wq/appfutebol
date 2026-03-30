import { getState, replaceState, subscribe } from './state.js';
import { load, save } from '../services/storage.local.js';

const appElement = document.getElementById('app');

init();

function init() {
  const data = load();
  replaceState(data);

  subscribe((snapshot) => {
    persist(snapshot);
    render(snapshot);
  });

  render(getState());
}

function persist(snapshot) {
  save(snapshot);
}

function render(snapshot) {
  const activeTab = snapshot.ui.currentTab || 'home';

  appElement.innerHTML = `
    <div class="header">
      <div class="header-row">
        <div>
          <div class="header-title">HARMONIA</div>
          <div class="header-subtitle">Base limpa da fase 1 · rebuild do zero</div>
        </div>
        <div class="header-badge">Mock local ativo</div>
      </div>
    </div>

    <nav class="nav" aria-label="Navegação principal">
      ${renderNavButton('home', 'Home', activeTab)}
      ${renderNavButton('players', 'Jogadores', activeTab)}
      ${renderNavButton('championship', 'Campeonato', activeTab)}
      ${renderNavButton('config', 'Config', activeTab)}
    </nav>

    <main class="content">
      ${renderTab(snapshot, activeTab)}
    </main>
  `;

  bindNavEvents();
}

function renderNavButton(tab, label, activeTab) {
  const activeClass = tab === activeTab ? 'is-active' : '';
  return `<button class="nav-button ${activeClass}" type="button" data-tab="${tab}">${label}</button>`;
}

function bindNavEvents() {
  const buttons = appElement.querySelectorAll('[data-tab]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const snapshot = getState();
      const next = {
        ...snapshot,
        ui: {
          ...snapshot.ui,
          currentTab: button.dataset.tab,
        },
      };
      replaceState(next);
    });
  });
}

function renderTab(snapshot, activeTab) {
  switch (activeTab) {
    case 'players':
      return renderPlayers(snapshot);
    case 'championship':
      return renderChampionship(snapshot);
    case 'config':
      return renderConfig(snapshot);
    case 'home':
    default:
      return renderHome(snapshot);
  }
}

function renderHome(snapshot) {
  const game = snapshot.game;
  const confirmedCount = snapshot.confirmations.filter((item) => item.confirmed).length;
  const maxPlayers = game?.max_players || 0;
  const fillPercent = maxPlayers ? Math.min(100, Math.round((confirmedCount / maxPlayers) * 100)) : 0;
  const mensalidade = buildMensalidadeMeta(game);

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
        <div class="card-title">Resumo rápido</div>
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-value">${snapshot.players.filter((player) => player.role === 'jogador').length}</div>
            <div class="kpi-label">Jogadores cadastrados</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${snapshot.carne.length}</div>
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
          ${snapshot.notifications.map((notification) => `
            <div class="info-line">• ${notification.message}</div>
          `).join('')}
        </div>
      </section>
    </section>
  `;
}

function renderPlayers(snapshot) {
  const players = [...snapshot.players].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return `
    <section class="section-stack">
      <section class="card">
        <div class="card-title">Jogadores e perfis</div>
        <div class="placeholder-list">
          ${players.map((player) => `
            <div class="placeholder-row">
              <div class="placeholder-main">
                <div class="avatar">${getInitials(player.name)}</div>
                <div>
                  <div class="row-title">${player.name}</div>
                  <div class="row-subtitle">${player.role === 'carne' ? 'Somente carne' : getPositionLabel(player.position)} · ${formatPhone(player.phone)}</div>
                </div>
              </div>
              <div class="tag ${player.mens_ok ? 'is-ok' : 'is-warn'}">${player.mens_ok ? 'Em dia' : 'Pendente'}</div>
            </div>
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

function renderConfig(snapshot) {
  return `
    <section class="section-stack">
      <section class="card">
        <div class="card-title">Fase 1 concluída</div>
        <div class="info-block">
          <div class="info-line">• Base nova criada do zero</div>
          <div class="info-line">• Estado central ativo</div>
          <div class="info-line">• Storage local funcional</div>
          <div class="info-line">• UI mobile baseada no visual atual</div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Próxima fase</div>
        <p class="footer-note">
          A próxima etapa deve construir autenticação real com telefone e senha, mantendo esta base limpa e sem herdar a lógica frágil do monólito anterior.
        </p>
      </section>

      <section class="card">
        <div class="card-title">Snapshot técnico</div>
        <p class="footer-note">
          Players: ${snapshot.players.length} · Confirmações: ${snapshot.confirmations.length} · Notificações: ${snapshot.notifications.length}
        </p>
      </section>
    </section>
  `;
}

function buildMensalidadeMeta(game) {
  if (!game?.mens_expire_date) {
    return {
      className: 'is-warn',
      title: 'Sem data definida',
      subline: 'A data de vencimento mensal ainda não foi configurada.',
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

function formatDate(value) {
  if (!value) {
    return '--/--/----';
  }

  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
}

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return digits;
}

function getPositionLabel(position) {
  const labels = {
    zag: 'Zagueiro',
    meia: 'Meia',
    atk: 'Atacante',
  };
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
