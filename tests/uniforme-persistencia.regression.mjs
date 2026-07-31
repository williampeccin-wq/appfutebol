// A biblioteca de uniformes (settings.uniforms) precisa SOBREVIVER ao ida-e-volta
// com o servidor.
//
// A auditoria de 30/07 achou que `uniforms` estava FORA do whitelist de `settings`
// no splitState (gravação) e no composeState (leitura) do storage.supabase.js — o
// admin cadastrava um uniforme, via na hora (localStorage otimista), e ele sumia
// no primeiro sync/reload. Mesma classe de falha silenciosa do perfil do clube e
// do carne_rotation ("salvo sem saber"). Além disso, a foto passou a ir para o
// Storage (URL), não como base64 no blob — este teste também trava isso.
//
// Rodar: node tests/uniforme-persistencia.regression.mjs

import assert from 'node:assert/strict';

const AGORA = '2026-07-30T22:00:00.000Z';

const servidor = {
  players: [{ id: 'p1', auth_user_id: null, is_admin: true, data: { id: 'p1', name: 'Admin', active: true }, updated_at: AGORA }],
  presence: [],
  game: { key: 'default', data: { game_key: 'g1', game_date: '2026-08-05' }, updated_at: AGORA },
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

// 1) Carrega — clube novo começa sem uniformes.
const carga = await storage.loadRemoteState();
assert.equal(carga.ok, true, 'o estado deveria carregar');
assert.deepEqual(carga.state.settings.uniforms, [], 'clube novo começa com biblioteca de uniformes vazia');

// 2) Admin cadastra dois uniformes (photo = URL do Storage, NÃO base64).
const estado = carga.state;
estado.settings = {
  ...estado.settings,
  uniforms: [
    { id: 'unif_a', name: 'Azul', photo: 'https://exemplo-teste.supabase.co/storage/v1/object/public/player-photos/unif_a-x.jpg' },
    { id: 'unif_b', name: 'Preto', photo: 'https://exemplo-teste.supabase.co/storage/v1/object/public/player-photos/unif_b-y.jpg' },
  ],
};

const gravacao = await storage.saveRemoteState(estado);
assert.equal(gravacao.ok, true, 'a gravação dos uniformes deveria funcionar');

// 3) Chegaram ao servidor, dentro do blob do clube (é aqui que o whitelist os descartava).
assert.ok(Array.isArray(servidor.meta.data.settings.uniforms), 'uniforms tem de estar no app_meta gravado');
assert.equal(servidor.meta.data.settings.uniforms.length, 2, 'os dois uniformes foram persistidos no servidor');
assert.equal(servidor.meta.data.settings.uniforms[0].name, 'Azul', 'o nome do uniforme foi persistido');

// 4) E voltam na leitura seguinte — é aqui que sumiam.
const recarga = await storage.loadRemoteState();
assert.equal(recarga.state.settings.uniforms.length, 2, 'os uniformes voltam na leitura');
assert.equal(recarga.state.settings.uniforms[1].id, 'unif_b', 'o id sobreviveu ao ida-e-volta');
assert.ok(recarga.state.settings.uniforms[1].photo.includes('unif_b'), 'a URL do Storage sobreviveu');

// 5) E a foto é URL do Storage, não base64 no blob (evita inchaço do app_meta).
assert.equal(recarga.state.settings.uniforms[0].photo.startsWith('data:'), false, 'a foto do uniforme é URL do Storage, não base64');

console.log('OK — a biblioteca de uniformes sobrevive ao ida-e-volta e vai para o Storage (não base64).');
