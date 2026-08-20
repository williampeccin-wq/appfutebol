// Regressão do ACHADO 20/08 (auditoria da votação): a votação foi desacoplada do
// jogo ativo — vale o jogo com JANELA ABERTA —, mas o carregamento de estado traz
// as confirmações de presença SÓ do jogo ativo. Como é dessa lista que sai quem
// pode votar, no instante em que o próximo jogo era criado a votação do jogo
// anterior desaparecia da tela para todo mundo, ainda dentro da janela de 47h.
//
// A correção não podia ser carregar as confirmações de vários jogos no estado
// compartilhado: `snapshot.confirmations` é lido em pontos que NÃO filtram por
// jogo (app.js:2452 e :2494), e misturar jogos ali faria o app tratar quem se
// confirmou semana passada como confirmado hoje. Por isso a votação ganhou uma
// leitura própria, escopada ao jogo, fora do estado compartilhado.
//
// Rodar: node tests/votacao-confirmacoes.regression.mjs

import assert from 'node:assert/strict';

// ---------------------------------------------------------------- servidor falso

const PRESENCAS = [
  // Jogo ANTERIOR (o da votação aberta).
  { game_key: 'game_2026-08-19_2030', player_id: 'p1', status: 'confirmed', data: {}, confirmed_at: '2026-08-18T00:10:00Z', updated_at: '2026-08-18T00:10:00Z' },
  { game_key: 'game_2026-08-19_2030', player_id: 'p2', status: 'confirmed', data: {}, confirmed_at: '2026-08-18T00:11:00Z', updated_at: '2026-08-18T00:11:00Z' },
  // Cancelou: não pode contar como quem jogou.
  { game_key: 'game_2026-08-19_2030', player_id: 'p3', status: 'cancelled', data: {}, cancelled_at: '2026-08-18T22:00:00Z', updated_at: '2026-08-18T22:00:00Z' },
  // Jogo NOVO (o ativo). Se vazar para a votação, avalia quem não jogou.
  { game_key: 'game_2026-08-26_2030', player_id: 'p9', status: 'confirmed', data: {}, confirmed_at: '2026-08-20T12:00:00Z', updated_at: '2026-08-20T12:00:00Z' },
];

const pedidos = [];

globalThis.window = {
  HARMONIA_SUPABASE: {
    enabled: true,
    url: 'https://exemplo-teste.supabase.co',
    anonKey: 'anon-teste',
    environment: 'test',
  },
  location: { hostname: 'teste.local' },
  dispatchEvent: () => true,
  addEventListener: () => {},
};
globalThis.localStorage = {
  _v: { harmonia_auth_session: JSON.stringify({ access_token: 'token-teste', user: { id: 'u1' } }) },
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; },
};

globalThis.fetch = async (alvo) => {
  const url = String(alvo);
  pedidos.push(url);
  const casa = url.match(/game_key=eq\.([^&]+)/);
  const chave = casa ? decodeURIComponent(casa[1]) : null;
  const linhas = chave ? PRESENCAS.filter((p) => p.game_key === chave) : PRESENCAS;
  return { ok: true, status: 200, json: async () => linhas, text: async () => JSON.stringify(linhas) };
};

const { fetchConfirmationsForGame } = await import('../appfutebol_run/js/services/storage.supabase.js');

// ---------------------------------------------------------------- cenário 1
//
// Lê o jogo PEDIDO, não o ativo. É o coração do achado.

const res = await fetchConfirmationsForGame('game_2026-08-19_2030');

assert.equal(res.ok, true, 'a leitura deveria funcionar');
assert.ok(
  pedidos.some((u) => u.includes('game_key=eq.game_2026-08-19_2030')),
  'a requisição precisa ser escopada ao jogo pedido',
);
assert.deepEqual(
  res.rows.map((r) => r.player_id).sort(),
  ['p1', 'p2', 'p3'],
  'só as confirmações do jogo pedido — nenhuma do jogo novo',
);
assert.ok(
  !res.rows.some((r) => r.player_id === 'p9'),
  'confirmação do jogo ativo não pode vazar para a votação do jogo anterior',
);

// ---------------------------------------------------------------- cenário 2
//
// As linhas chegam no formato que a elegibilidade entende: quem cancelou tem de
// sair com confirmed=false, senão volta o bug "removido antes do voto ainda
// aparece pra receber nota".

const porId = Object.fromEntries(res.rows.map((r) => [r.player_id, r]));

assert.equal(porId.p1.confirmed, true, 'quem confirmou precisa vir como confirmado');
assert.equal(porId.p1.status, 'confirmed', 'status normalizado');
assert.equal(porId.p1.game_key, 'game_2026-08-19_2030', 'a entrada carrega o jogo a que pertence');
assert.ok(porId.p1.timestamp, 'sem timestamp o desempate por entrada mais recente não funciona');
assert.equal(porId.p3.confirmed, false, 'quem cancelou NÃO conta como quem jogou');

// ---------------------------------------------------------------- cenário 3
//
// Entradas inválidas não podem virar votante fantasma, e chave vazia não pode
// virar uma leitura da tabela inteira.

const vazio = await fetchConfirmationsForGame('');
assert.equal(vazio.ok, false, 'chave vazia não deve consultar o servidor');
assert.deepEqual(vazio.rows, [], 'chave vazia devolve lista vazia');

console.log('OK — 10 asserções em 3 cenários. A votação lê as confirmações do jogo dela, não do jogo ativo.');
