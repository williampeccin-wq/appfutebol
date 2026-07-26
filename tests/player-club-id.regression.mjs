// INCIDENTE 26/07: admin de clube novo não conseguia gravar NENHUM jogador.
//
// A gravação de player (aprovar cadastro, editar, adicionar) subia SEM club_id.
// No multi-tenant, o banco então usava o DEFAULT do schema (o clube legado), e a
// RLS `with check (club_id = any(current_club_ids()))` rejeitava com 403 — o
// clube legado não pertence ao admin de um clube novo.
//
// Sintoma no campo: a testadora entrou no Nova Resenha, ficou pendente, e o
// admin não conseguia aprovar ("não foi possível salvar no servidor"). Era um
// bloqueador de FUNDAÇÃO do onboarding: sem gravar player, nada de multi-tenant.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';

const AGORA = '2026-07-26T22:00:00.000Z';
const CLUB_UUID = 'e2af269c-20d0-4739-b7db-80ed93165192';   // o Nova Resenha real

// Captura os payloads enviados ao endpoint /players.
const upsertsDePlayer = [];

function novoServidor() {
  upsertsDePlayer.length = 0;
  return {
    players: [
      { id: 'p_admin', auth_user_id: 'u_admin', is_admin: true, club_id: CLUB_UUID,
        data: { id: 'p_admin', name: 'Admin', active: true, phone: '48900000003' }, updated_at: AGORA },
      { id: 'p_pend', auth_user_id: 'u_pend', is_admin: false, club_id: CLUB_UUID,
        data: { id: 'p_pend', name: 'Pendente', active: true, pending: true, phone: '54996338328' }, updated_at: AGORA },
    ],
    game: { key: CLUB_UUID, data: { game_key: 'g1', game_date: '2026-08-05' }, updated_at: AGORA },
    meta: { key: CLUB_UUID, data: { profile: { schema_version: 1 }, games: [] }, updated_at: AGORA },
  };
}

function instalarFetch(servidor, { resolveClube = true } = {}) {
  globalThis.fetch = async (url, options = {}) => {
    const alvo = String(url);
    const metodo = String(options.method || 'GET').toUpperCase();
    const json = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => '' });

    if (metodo === 'GET') {
      // resolveClubKey pergunta o club_id do usuário logado
      if (alvo.includes('select=club_id')) {
        return json(resolveClube ? [{ club_id: CLUB_UUID }] : []);
      }
      if (alvo.includes('/players')) return json(servidor.players);
      if (alvo.includes('/presence_confirmations')) return json([]);
      if (alvo.includes('/game_state')) return json([servidor.game]);
      if (alvo.includes('/app_meta')) return json([servidor.meta]);
    }
    if (metodo === 'POST') {
      const corpo = JSON.parse(options.body || '{}');
      if (alvo.includes('/players')) { upsertsDePlayer.push(corpo); return json([corpo]); }
      return json([corpo]);
    }
    return json([]);
  };
}

globalThis.window = {
  HARMONIA_SUPABASE: { enabled: true, url: 'https://exemplo-teste.supabase.co', anonKey: 'anon', environment: 'test' },
  location: { hostname: 'teste.local' },
  dispatchEvent: () => true,
  addEventListener: () => {},
};
globalThis.localStorage = {
  _v: { harmonia_auth_session: JSON.stringify({ access_token: 't', user: { id: 'u_admin' } }) },
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; },
};

const storage = await import('../appfutebol_run/js/services/storage.supabase.js');

// ---------------------------------------------------------------- multi-tenant

const s1 = novoServidor();
instalarFetch(s1, { resolveClube: true });

const carga = await storage.loadRemoteState();
assert.equal(carga.ok, true, 'o estado do clube carrega');

// Aprova a pendente (pending=false) e grava.
const estado = carga.state;
estado.players = estado.players.map((p) => (p.id === 'p_pend' ? { ...p, pending: false } : p));
const gravacao = await storage.saveRemoteState(estado);
assert.equal(gravacao.ok, true, `a gravação deve funcionar (veio ${JSON.stringify(gravacao)})`);

// O CERNE: o upsert do player aprovado tem de carregar o club_id, senão a RLS
// (com o default legado) devolve 403.
const upsertPend = upsertsDePlayer.find((u) => u.id === 'p_pend');
assert.ok(upsertPend, 'o player aprovado foi gravado');
assert.equal(upsertPend.club_id, CLUB_UUID,
  'o upsert de player no multi-tenant PRECISA enviar o club_id do clube — sem ele, 403');

// ---------------------------------------------------------------- single-tenant

// Sem club_id resolvido (Harmonia single-tenant, key='default'), o payload NÃO
// deve trazer club_id — a coluna nem existe nesse banco, e enviá-la quebraria.
storage.resetClubKeyCache();
const s2 = novoServidor();
instalarFetch(s2, { resolveClube: false });   // não resolve clube → cai em 'default'

const carga2 = await storage.loadRemoteState();
const estado2 = carga2.state;
estado2.players = estado2.players.map((p) => (p.id === 'p_pend' ? { ...p, pending: false } : p));
await storage.saveRemoteState(estado2);

const upsertSingle = upsertsDePlayer.find((u) => u.id === 'p_pend');
if (upsertSingle) {
  assert.equal('club_id' in upsertSingle, false,
    'no single-tenant o upsert NÃO deve enviar club_id (a coluna não existe)');
}

console.log('OK — 5 asserções. Player carrega o club_id no multi-tenant; não no single-tenant.');
