const STORAGE_KEY = 'harmonia_data';

const defaultSeed = {
  session: {
    playerId: null,
  },
  players: [
    {
      id: 'p1',
      name: 'William',
      phone: '48991520230',
      birthDate: '1988-01-15',
      role: 'jogador',
      position: 'meia',
      mens_ok: true,
      is_admin: true,
      password_hash: '123456',
    },
    {
      id: 'p2',
      name: 'André',
      phone: '48999999999',
      birthDate: '1991-03-12',
      role: 'jogador',
      position: 'zag',
      mens_ok: true,
      is_admin: false,
      password_hash: '123456',
    },
    {
      id: 'p3',
      name: 'Lucas',
      phone: '48988888888',
      birthDate: '1994-07-25',
      role: 'jogador',
      position: 'atk',
      mens_ok: false,
      is_admin: false,
      password_hash: '123456',
    },
    {
      id: 'p4',
      name: 'Marcelo',
      phone: '48977777777',
      birthDate: '1987-10-01',
      role: 'carne',
      position: null,
      mens_ok: false,
      is_admin: false,
      password_hash: '123456',
    },
  ],
  game: {
    game_date: '2026-04-01',
    game_time: '20:30',
    max_players: 14,
    mens_expire_date: '2026-04-10',
    open: true,
    sort_result: null,
  },
  confirmations: [
    { player_id: 'p1', confirmed: true, timestamp: '2026-03-29T18:00:00.000Z' },
    { player_id: 'p2', confirmed: true, timestamp: '2026-03-29T18:05:00.000Z' },
    { player_id: 'p3', confirmed: false, timestamp: null },
  ],
  championship: {
    id: 'champ-2026-01',
    start_date: '2026-01-08',
    end_date: null,
    closed: false,
    ranking: [
      { player_id: 'p1', points: 14 },
      { player_id: 'p2', points: 11 },
      { player_id: 'p3', points: 8 },
    ],
  },
  carne: [
    { player_id: 'p1', active: true },
    { player_id: 'p4', active: true },
  ],
  notifications: [
    {
      id: 'n1',
      message: 'Jogo confirmado para quarta às 20:30.',
      created_at: '2026-03-29T19:30:00.000Z',
    },
    {
      id: 'n2',
      message: 'Tabela da carne atualizada para a próxima quarta.',
      created_at: '2026-03-28T17:10:00.000Z',
    },
  ],
  ui: {
    currentTab: 'home',
    authMode: 'login',
    authMessage: null,
  },
};

export function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSeed));
    return structuredClone(defaultSeed);
  }

  try {
    const parsed = JSON.parse(raw);
    const seed = structuredClone(defaultSeed);
    return {
      ...seed,
      ...parsed,
      session: {
        ...seed.session,
        ...(parsed.session || {}),
      },
      ui: {
        ...seed.ui,
        ...(parsed.ui || {}),
      },
    };
  } catch (error) {
    console.warn('Falha ao ler dados locais. Seed padrão foi restaurada.', error);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSeed));
    return structuredClone(defaultSeed);
  }
}

export function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function reset() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSeed));
  return structuredClone(defaultSeed);
}
