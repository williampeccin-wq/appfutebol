// O perfil do clube precisa SOBREVIVER ao ida-e-volta com o servidor.
//
// Quando a F1 foi escrita, `profile` não existia em nenhum ponto do pipeline de
// estado: nem no composeState (leitura), nem no splitState (gravação), nem no
// replaceState, nem no cache local. Um admin poderia configurar o clube, ver a
// tela confirmar, e o perfil sumir na primeira sincronização — a mesma classe
// de falha silenciosa do INCIDENTE 23/07.
//
// Este teste existe porque plumbing que ninguém exercita é plumbing que quebra.
//
// Rodar: node tests/profile-persistencia.regression.mjs

import assert from 'node:assert/strict';

const AGORA = '2026-07-23T22:00:00.000Z';

const servidor = {
  players: [{ id: 'p1', auth_user_id: null, is_admin: true, data: { id: 'p1', name: 'Admin', active: true }, updated_at: AGORA }],
  presence: [],
  game: { key: 'default', data: { game_key: 'g1', game_date: '2026-07-29' }, updated_at: AGORA },
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
const { getClubProfile, isModuleOn } = await import('../appfutebol_run/js/domain/club-profile.js');

// 1) Carrega, configura o clube e grava.
const carga = await storage.loadRemoteState();
assert.equal(carga.ok, true, 'o estado deveria carregar');
assert.equal(carga.state.profile, null, 'clube sem perfil começa sem perfil');

const estado = carga.state;
estado.profile = {
  schema_version: 1,
  game: { cadence: 'quinzenal', day_of_week: 6, default_time: '09:00' },
  modules: { churrasco: false, campeonato: true },
  championship: { points: { win: 2, draw: 1, loss: 0, no_play: 0 } },
};

const gravacao = await storage.saveRemoteState(estado);
assert.equal(gravacao.ok, true, 'a gravação do perfil deveria funcionar');

// 2) O perfil chegou ao servidor, dentro do blob do clube.
assert.ok(servidor.meta.data.profile, 'o perfil tem de estar no app_meta gravado');
assert.equal(servidor.meta.data.profile.game.cadence, 'quinzenal', 'a cadência escolhida foi persistida');
assert.equal(servidor.meta.data.profile.modules.churrasco, false, 'o módulo desligado foi persistido');

// 3) E volta na leitura seguinte — é aqui que ele sumia.
const recarga = await storage.loadRemoteState();
assert.ok(recarga.state.profile, 'o perfil precisa voltar na leitura');
assert.equal(recarga.state.profile.game.day_of_week, 6, 'o dia de jogo sobreviveu ao ida-e-volta');

// 4) E os acessores enxergam o que foi gravado, com os defaults completando.
const perfil = getClubProfile(recarga.state, { legacyBlob: false });
assert.equal(perfil.game.cadence, 'quinzenal', 'o acessor lê a cadência do clube');
assert.equal(perfil.game.teams, 2, 'o que o clube não declarou vem do default');
assert.deepEqual(perfil.championship.points, { win: 2, draw: 1, loss: 0, no_play: 0 }, 'a pontuação do clube vale');
assert.equal(isModuleOn(recarga.state, 'churrasco', { legacyBlob: false }), false, 'o clube sem churrasco continua sem churrasco');
assert.equal(isModuleOn(recarga.state, 'campeonato', { legacyBlob: false }), true, 'o que ele usa segue ligado');

console.log('OK — 12 asserções. O perfil do clube sobrevive ao ida-e-volta com o servidor.');
