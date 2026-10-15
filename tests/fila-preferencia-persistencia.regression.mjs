// A preferência na fila para quem está em dia (settings.fila_prioriza_em_dia)
// precisa SOBREVIVER ao ida-e-volta com o servidor.
//
// A chave entrou na v1.202.0 pelo formulário de mensalidade, mas ficou FORA do
// whitelist de `settings` no splitState (gravação) e no composeState (leitura)
// do storage.supabase.js — o admin ligava, via ligada na hora (localStorage
// otimista), e ela sumia no primeiro sync/reload. Como o app_meta gravado nunca
// a levava, a Edge Function auto-open-games também nunca a via ligada. Mesma
// falha silenciosa do `uniforms` (30/07) e do carimbo da virada de mês (01/09).
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';

const AGORA = '2026-10-15T22:00:00.000Z';

const servidor = {
  players: [{ id: 'p1', auth_user_id: null, is_admin: true, data: { id: 'p1', name: 'Admin', active: true }, updated_at: AGORA }],
  presence: [],
  game: { key: 'default', data: { game_key: 'g1', game_date: '2026-10-21' }, updated_at: AGORA },
  meta: { key: 'default', data: { championship: null, games: [], carne: [], settings: {} }, updated_at: AGORA },
};

globalThis.fetch = async (url, options = {}) => {
  const alvo = String(url);
  const metodo = String(options.method || 'GET').toUpperCase();
  const json = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => '' });

  if (metodo === 'GET') {
    if (alvo.includes('/players')) return json(servidor.players);
    if (alvo.includes('/presence_confirmations')) return json(servidor.presence);
    if (alvo.includes('/game_state')) return json([servidor.game]);
    if (alvo.includes('/app_meta')) return json([servidor.meta]);
  }
  if (metodo === 'POST') {
    const corpo = JSON.parse(options.body || '{}');
    if (alvo.includes('/app_meta')) {
      servidor.meta = { key: 'default', data: corpo.data, updated_at: corpo.updated_at };
      return json([servidor.meta]);
    }
    if (alvo.includes('/game_state')) {
      servidor.game = { key: 'default', data: corpo.data, updated_at: corpo.updated_at };
      return json([servidor.game]);
    }
    return json([corpo]);
  }
  return json([]);
};

globalThis.window = {
  HARMONIA_SUPABASE: { enabled: true, url: 'https://exemplo-teste.supabase.co', anonKey: 'anon', environment: 'test' },
  location: { hostname: 'teste.local' },
  dispatchEvent: () => true,
  addEventListener: () => {},
};
globalThis.localStorage = {
  _v: { harmonia_auth_session: JSON.stringify({ access_token: 't', user: { id: 'u1' } }) },
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; },
};

const storage = await import('../appfutebol_run/js/services/storage.supabase.js');

// 1) Carrega — clube novo começa com a preferência desligada.
const carga = await storage.loadRemoteState();
assert.equal(carga.ok, true, 'o estado deveria carregar');
assert.equal(carga.state.settings.fila_prioriza_em_dia, false, 'clube novo começa sem preferência na fila');

// 2) Admin liga a chave no formulário de mensalidade (como o app.js grava).
const estado = carga.state;
estado.settings = { ...estado.settings, mens_enforcement_mode: 'none', fila_prioriza_em_dia: true };

const gravacao = await storage.saveRemoteState(estado);
assert.equal(gravacao.ok, true, 'a gravação deveria funcionar');

// 3) Chegou ao app_meta — é este blob que a Edge Function auto-open-games lê.
assert.equal(servidor.meta.data.settings.fila_prioriza_em_dia, true, 'fila_prioriza_em_dia tem de estar no app_meta gravado');

// 4) E volta na leitura seguinte — é aqui que sumia.
const recarga = await storage.loadRemoteState();
assert.equal(recarga.state.settings.fila_prioriza_em_dia, true, 'a preferência volta ligada na leitura');

// 5) Desligar também persiste, e lixo no blob não liga a chave por engano.
recarga.state.settings = { ...recarga.state.settings, fila_prioriza_em_dia: false };
await storage.saveRemoteState(recarga.state);
assert.equal(servidor.meta.data.settings.fila_prioriza_em_dia, false, 'desligar também chega ao servidor');

servidor.meta = { ...servidor.meta, data: { ...servidor.meta.data, settings: { ...servidor.meta.data.settings, fila_prioriza_em_dia: 'true' } }, updated_at: '2026-10-15T23:00:00.000Z' };
const comLixo = await storage.loadRemoteState();
assert.equal(comLixo.state.settings.fila_prioriza_em_dia, false, 'só o booleano true liga a preferência');

console.log('OK — a preferência na fila para quem está em dia sobrevive ao ida-e-volta com o servidor.');
