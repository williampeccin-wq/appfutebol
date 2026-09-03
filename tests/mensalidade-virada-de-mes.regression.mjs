// VIRADA DE MÊS DA MENSALIDADE (01/09/2026)
//
// Histórico que este teste existe para não repetir:
//
//   04/08 — 58fdb1f fez `isMensOkEffective` retornar false depois do vencimento.
//           Todo mundo virava "Pendente" no dia seguinte ao vencimento e o ciclo
//           NUNCA virava: a data ficava parada, então o clube ficava pendente
//           para sempre.
//   11/08 — a97d6ad reverteu. Desde então o único reset era manual (admin salva
//           uma nova data de vencimento no Config).
//   01/09 — o mês virou e ninguém mudou de status, porque não existia gatilho
//           automático nenhum.
//
// O conserto NÃO volta a mexer na leitura (`isMensOkEffective` continua sendo
// `mens_ok` puro). Ele reescreve o dado uma vez, na virada do mês, carimbando
// `settings.mens_last_reset_month`.
//
// As duas travas que importam:
//
//   1. ESTREIA SILENCIOSA. No deploy, os status que já estão no ar (acertados na
//      mão pelo admin) NÃO podem ser atropelados. Clube sem carimbo só arma o
//      gatilho. Foi requisito explícito.
//   2. O CARIMBO PRECISA SOBREVIVER AO SERVIDOR. `settings` é serializado por
//      whitelist no storage.supabase.js; campo fora da lista some no sync. Se o
//      carimbo sumisse, a virada ficaria eternamente "armando" e nunca zeraria
//      ninguém — a mesma falha silenciosa do `uniforms` (30/07).
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import test from 'node:test';

const AGORA = '2026-09-01T09:00:00.000Z';

const servidor = {
  players: [{ id: 'p1', auth_user_id: null, is_admin: true, data: { id: 'p1', name: 'Admin', active: true }, updated_at: AGORA }],
  presence: [],
  game: { key: 'default', data: { game_key: 'g1', game_date: '2026-09-05' }, updated_at: AGORA },
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
globalThis.document = { getElementById: () => null, querySelector: () => null };

const { reconcileMensalidadeMonthTurn, getMensCycleMonth, isMensOkEffective, rollMensDueDateToMonth } =
  await import('../appfutebol_run/js/domain/rules.engine.js');

// Clube real no dia do deploy: uns pagos, uns pendentes, um isento de carnê.
const clube = () => ({
  settings: { mens_expire_date: '2026-09-10', mens_enforcement_mode: 'total' },
  players: [
    { id: 'p1', name: 'Ana', mens_ok: true },
    { id: 'p2', name: 'Bruno', mens_ok: false },
    { id: 'p3', name: 'Carla', mens_ok: true },
    { id: 'p4', name: 'Elias', role: 'carne', mens_ok: true },
  ],
});

// ---------------------------------------------------------------------------

test('deploy no meio do mês só ARMA o gatilho — ninguém é atropelado', () => {
  const antes = clube();
  const r = reconcileMensalidadeMonthTurn(antes, '2026-09');

  assert.equal(r.reset, false, 'a estreia da regra não pode zerar ninguém');
  assert.equal(r.zerados, 0, 'nenhum jogador zerado na estreia');
  assert.equal(r.state.settings.mens_last_reset_month, '2026-09', 'o mês corrente fica carimbado');
  assert.deepEqual(
    r.state.players.map((p) => p.mens_ok),
    [true, false, true, true],
    'os status vieram intactos do servidor e continuam intactos',
  );
  assert.equal(r.changed, true, 'o carimbo precisa ser gravado, senão rearma toda hora');
});

test('mesmo mês, app aberto dez vezes: idempotente', () => {
  const armado = reconcileMensalidadeMonthTurn(clube(), '2026-09').state;
  for (let i = 0; i < 10; i += 1) {
    const r = reconcileMensalidadeMonthTurn(armado, '2026-09');
    assert.equal(r.changed, false, 'nada a fazer no mesmo mês');
    assert.equal(r.state, armado, 'o estado nem é recriado');
  }
});

test('virou o mês: todo mundo volta a Pendente e o carimbo avança', () => {
  const armado = reconcileMensalidadeMonthTurn(clube(), '2026-09').state;
  const r = reconcileMensalidadeMonthTurn(armado, '2026-10');

  assert.equal(r.reset, true, 'a virada de 09 -> 10 tem de resetar');
  assert.equal(r.zerados, 3, 'os três que estavam pagos foram zerados');
  assert.equal(r.state.settings.mens_last_reset_month, '2026-10', 'o carimbo avança para o mês novo');
  assert.ok(
    r.state.players.every((p) => p.mens_ok === false),
    'ninguém sobra como Pago — inclusive o isento de carnê, igual ao reset manual do Config (a isenção é tratada na exibição)',
  );
  // A leitura continua sendo mens_ok puro: o conserto é no DADO, não na regra.
  assert.equal(isMensOkEffective(r.state.players[0]), false, 'a tela passa a mostrar Pendente');
  // O PRAZO ANDA JUNTO (03/09/2026). Antes o vencimento ficava parado no mês
  // velho: no dia 1º o clube inteiro voltava a Pendente JÁ VENCIDO, e o lembrete
  // diário de atraso disparava desde o primeiro dia do mês. Foi exatamente o
  // relato do clube ("a notificação de atraso já começa a contar quando vira o
  // mês"), com 19 pushes/dia.
  assert.equal(r.state.settings.mens_expire_date, '2026-10-10', 'o vencimento acompanha o ciclo, no mesmo dia');
  assert.equal(r.dueDateMoved, true, 'o app avisa no toast que o prazo mudou');
});

test('o prazo só anda para a frente, e o dia sobrevive a mês curto', () => {
  // Mês curto: dia 31 vira o último dia disponível, não escorrega para o mês seguinte.
  assert.equal(rollMensDueDateToMonth('2026-08-31', '2026-09'), '2026-09-30');
  assert.equal(rollMensDueDateToMonth('2027-01-31', '2027-02'), '2027-02-28');
  assert.equal(rollMensDueDateToMonth('2028-01-31', '2028-02'), '2028-02-29');
  // Vencimento já no mês corrente, ou adiantado pelo admin: intocado.
  assert.equal(rollMensDueDateToMonth('2026-09-10', '2026-09'), '2026-09-10');
  assert.equal(rollMensDueDateToMonth('2026-10-15', '2026-09'), '2026-10-15');
  // Ano errado digitado no Config (o caso real do clube) é recuperado na virada.
  assert.equal(rollMensDueDateToMonth('2020-09-10', '2026-10'), '2026-10-10');
  // Lixo entra, lixo sai — sem inventar data.
  for (const ruim of ['', null, undefined, '10/09/2026', '2026-09']) {
    assert.equal(rollMensDueDateToMonth(ruim, '2026-10'), String(ruim || '').slice(0, 10), `data inválida: ${String(ruim)}`);
  }
  assert.equal(rollMensDueDateToMonth('2026-08-10', 'setembro'), '2026-08-10', 'mês inválido não move nada');
});

test('clube sem vencimento definido vira o mês sem ganhar uma data do nada', () => {
  const semData = { ...clube(), settings: { mens_last_reset_month: '2026-09' } };
  const r = reconcileMensalidadeMonthTurn(semData, '2026-10');
  assert.equal(r.reset, true);
  assert.equal(r.state.settings.mens_expire_date, undefined, 'não inventa vencimento para quem nunca configurou');
  assert.equal(r.dueDateMoved, false);
});

test('vira o ano: 2026-12 -> 2027-01', () => {
  const dez = { ...clube(), settings: { ...clube().settings, mens_last_reset_month: '2026-12' } };
  const r = reconcileMensalidadeMonthTurn(dez, '2027-01');
  assert.equal(r.reset, true, 'a comparação de texto AAAA-MM tem de atravessar o ano');
});

test('celular com a data atrasada não reabre a cobrança do clube', () => {
  const outubro = { ...clube(), settings: { ...clube().settings, mens_last_reset_month: '2026-10' } };
  const r = reconcileMensalidadeMonthTurn(outubro, '2026-09');
  assert.equal(r.changed, false, 'carimbo à frente do relógio: não mexe em nada');
  assert.equal(r.reset, false, 'um relógio errado não pode zerar o mês inteiro de novo');
});

test('mês inválido não faz nada', () => {
  for (const ruim of ['', null, '2026', 'setembro', '2026-13-01']) {
    assert.equal(reconcileMensalidadeMonthTurn(clube(), ruim).changed, false, `mês inválido: ${String(ruim)}`);
  }
  // `undefined` NÃO entra na lista: cai no parâmetro default (getMensCycleMonth),
  // que é justamente como a app chama a função. Ali arma normalmente.
  assert.equal(reconcileMensalidadeMonthTurn(clube(), undefined).changed, true, 'sem argumento = mês de hoje');
});

test('getMensCycleMonth usa o mês LOCAL, não o UTC', () => {
  // 01/10 00:30 no horário de Brasília ainda é 30/09 03:30 em UTC. Se a chave
  // saísse de toISOString(), a virada atrasaria um dia (e no fim do mês, um mês).
  assert.equal(getMensCycleMonth(new Date(2026, 9, 1, 0, 30)), '2026-10');
  assert.equal(getMensCycleMonth(new Date(2026, 0, 31, 23, 59)), '2026-01');
});

// ---------------------------------------------------------------------------

test('o carimbo sobrevive ao ida-e-volta com o servidor', async () => {
  const storage = await import('../appfutebol_run/js/services/storage.supabase.js');

  const carga = await storage.loadRemoteState();
  assert.equal(carga.ok, true, 'o estado deveria carregar');
  assert.equal(carga.state.settings.mens_last_reset_month, '', 'clube novo chega sem carimbo');

  const estado = reconcileMensalidadeMonthTurn(carga.state, '2026-09').state;
  assert.equal(estado.settings.mens_last_reset_month, '2026-09');

  const gravacao = await storage.saveRemoteState(estado);
  assert.equal(gravacao.ok, true, 'a gravação deveria funcionar');

  // É aqui que o whitelist do splitState descartaria o campo.
  assert.equal(
    servidor.meta.data.settings.mens_last_reset_month,
    '2026-09',
    'o carimbo tem de chegar ao app_meta',
  );

  // E aqui que o whitelist do composeState o descartaria na volta.
  const recarga = await storage.loadRemoteState();
  assert.equal(
    recarga.state.settings.mens_last_reset_month,
    '2026-09',
    'o carimbo volta na leitura — sem isto a virada fica eternamente "armando"',
  );

  // Fecha o ciclo: com o carimbo de volta, a virada seguinte realmente reseta.
  assert.equal(reconcileMensalidadeMonthTurn(recarga.state, '2026-10').reset, true);
});
