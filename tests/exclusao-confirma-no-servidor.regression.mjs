// RELATO DO TESTE FECHADO 24/08: ao excluir o jogador de teste, tarja vermelha
// de erro — e a exclusão TINHA funcionado.
//
// savePlayerLogicalDelete decidia "não persistiu" olhando SÓ a representação
// devolvida pelo PATCH. Ela volta vazia sempre que o Prefer não é honrado (204
// sem corpo) ou o corpo não parseia — nada disso significa que a gravação
// falhou. O app então acusava falha com a linha já apagada, e o passo 8 do
// roteiro do testador não era registrado (o log fica no caminho de sucesso).
//
// Regra: antes de acusar falha, RELER a linha e perguntar ao servidor.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';

const AGORA = '2026-08-24T12:00:00.000Z';

let leiturasDeVerificacao = 0;

function instalarFetch({ representacaoVazia }) {
  const linha = {
    id: 'p_teste',
    auth_user_id: null,
    is_admin: false,
    data: { id: 'p_teste', name: 'Testador Silva', phone: '48933333333', active: true },
    updated_at: AGORA,
  };

  globalThis.fetch = async (url, options = {}) => {
    const alvo = String(url);
    const metodo = String(options.method || 'GET').toUpperCase();
    const json = (data, status = 200) => ({
      ok: true, status, json: async () => data, text: async () => '',
    });

    if (metodo === 'GET' && alvo.includes('/players')) {
      if (linha.data.deleted) leiturasDeVerificacao += 1;
      return json([linha]);
    }

    if (metodo === 'PATCH' && alvo.includes('/players')) {
      const corpo = JSON.parse(options.body || '{}');
      linha.data = corpo.data;          // o servidor APLICA a exclusão
      linha.updated_at = corpo.updated_at;
      // ...mas devolve a representação vazia (Prefer não honrado / 204).
      return representacaoVazia ? json(null, 204) : json([linha]);
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

// ------------------------------------------ representação vazia (o caso real)

instalarFetch({ representacaoVazia: true });
const semRepresentacao = await storage.savePlayerLogicalDelete('p_teste');

assert.equal(semRepresentacao.ok, true,
  'exclusão aplicada no servidor NÃO pode ser reportada como falha só porque o PATCH voltou sem corpo');
assert.ok(leiturasDeVerificacao > 0, 'a confirmação tem de vir de uma releitura da linha');

// ------------------------------------------------- representação normal (ok)

leiturasDeVerificacao = 0;
instalarFetch({ representacaoVazia: false });
const comRepresentacao = await storage.savePlayerLogicalDelete('p_teste');

assert.equal(comRepresentacao.ok, true, 'com representação normal segue funcionando');
assert.equal(leiturasDeVerificacao, 0,
  'quando a representação já prova a exclusão, não gasta uma leitura extra');

console.log('OK — 4 asserções. Exclusão só é reportada como falha depois de conferir no servidor.');
