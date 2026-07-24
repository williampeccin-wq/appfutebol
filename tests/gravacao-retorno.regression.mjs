// O adapter precisa DEVOLVER se a gravação remota deu certo. Antes ele resolvia
// `undefined` no sucesso e no conflito, então quem gravava afirmava "salvo" sem
// ter como saber — foi assim que um resultado de campeonato sumiu em silêncio.
import assert from 'node:assert/strict';

let falharRemoto = false;
globalThis.window = { location: { hostname: 'teste.local' }, dispatchEvent: () => true, addEventListener: () => {},
  HARMONIA_SUPABASE: { enabled: true, url: 'https://exemplo.supabase.co', anonKey: 'k', environment: 'test' } };
globalThis.localStorage = { _v: { harmonia_auth_session: JSON.stringify({ access_token: 't', user: { id: 'u' } }) },
  getItem(k) { return this._v[k] ?? null; }, setItem(k, v) { this._v[k] = String(v); }, removeItem(k) { delete this._v[k]; } };

globalThis.fetch = async (url, o = {}) => {
  const j = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
  const m = String(o.method || 'GET').toUpperCase();
  if (m === 'POST' && falharRemoto) return { ok: false, status: 500, text: async () => 'erro', json: async () => null };
  if (m === 'GET') {
    if (String(url).includes('/players')) return j([{ id: 'p1', is_admin: true, data: { id: 'p1', name: 'A', active: true }, updated_at: '2026-07-24T00:00:00Z' }]);
    if (String(url).includes('/presence')) return j([]);
    return j([{ key: 'default', data: { games: [] }, updated_at: '2026-07-24T00:00:00Z' }]);
  }
  return j([{}]);
};

const { getState, saveState } = await import('../appfutebol_run/js/domain/storage.adapter.js');
const estado = await getState();

const ok = await saveState({ ...estado, championship: { active: { id: 'x', results: [{ id: 'r', date: '2026-07-22' }] } } });
assert.equal(ok?.ok, true, `sucesso tem de devolver ok:true (veio ${JSON.stringify(ok)})`);

falharRemoto = true;
const ruim = await saveState({ ...estado, championship: { active: { id: 'y', results: [{ id: 'r2', date: '2026-07-23' }] } } });
assert.equal(ruim?.ok, false, `falha remota tem de devolver ok:false (veio ${JSON.stringify(ruim)})`);

console.log('OK — quem grava consegue saber se a gravação chegou ao servidor.');
