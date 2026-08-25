// Os contadores do topo da aba Jogadores (Todos / Pagos / Pendentes / Dentro do
// jogo) eram <span> decorativos: mostravam o número certo e ignoravam o toque.
// O guia do testador manda usar esses filtros pra navegar a lista, então "não
// funciona" chegou como bug do roteiro.
//
// Este teste trava as duas metades do conserto: cada pill sai como botão
// clicável com `data-action="players-filter"`, e a lista renderizada obedece o
// filtro ativo — sem mexer nas contagens, que continuam sendo o total do grupo.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = { location: { hostname: 'teste.local' } };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = { getElementById: () => null, querySelector: () => null };

const { renderPlayersScreen } = await import('../appfutebol_run/js/modules/players/players.view.js');

const admin = { id: 'a1', name: 'Admin', role: 'admin', is_admin: true, plays_football: true };

// mens_expire_date no futuro: quem tem mens_ok true está em dia.
const snapshot = {
  settings: { mens_expire_date: '2099-12-31' },
  players: [],
  games: [],
};

const jogadores = [
  { id: 'p1', name: 'Ana', plays_football: true, mens_ok: true, isConfirmed: true },
  { id: 'p2', name: 'Bruno', plays_football: true, mens_ok: true, isConfirmed: false },
  { id: 'p3', name: 'Carla', plays_football: true, mens_ok: false, isConfirmed: true },
  { id: 'p4', name: 'Diego', plays_football: true, mens_ok: false, isConfirmed: false },
  // Só churrasco: fora de todas as contagens de jogador.
  { id: 'p5', name: 'Elias', plays_football: false, mens_ok: false, isConfirmed: false },
];

const render = (filtro) => renderPlayersScreen(snapshot, admin, jogadores, null, filtro);

// Cada linha da lista carrega o id do jogador; é assim que dá pra saber quem
// sobreviveu ao filtro sem depender do texto exato do card.
function nomesVisiveis(html) {
  const inicio = html.indexOf('aria-label="Jogadores"');
  const fim = html.indexOf('switch-legend');
  const trecho = html.slice(inicio, fim);
  return jogadores.filter((p) => trecho.includes(p.name)).map((p) => p.name);
}

test('os contadores viram botões de filtro clicáveis', () => {
  const html = render('all');
  for (const key of ['all', 'paid', 'pending', 'in_game']) {
    assert.ok(
      html.includes(`data-action="players-filter"`) && html.includes(`data-filter="${key}"`),
      `pill ${key} precisa ser botão com data-action/data-filter`,
    );
  }
  assert.ok(!/<span class="filter-pill/.test(html), 'nenhum filtro pode continuar sendo <span> morto');
});

test('as contagens não mudam com o filtro ativo', () => {
  for (const filtro of ['all', 'paid', 'pending', 'in_game']) {
    const html = render(filtro);
    assert.ok(html.includes('Todos <strong>4</strong>'), `Todos deve contar 4 em ${filtro}`);
    assert.ok(html.includes('Pagos <strong>2</strong>'), `Pagos deve contar 2 em ${filtro}`);
    assert.ok(html.includes('Pendentes <strong>2</strong>'), `Pendentes deve contar 2 em ${filtro}`);
    assert.ok(html.includes('Dentro do jogo <strong>2</strong>'), `Dentro do jogo deve contar 2 em ${filtro}`);
  }
});

test('o filtro ativo fica marcado', () => {
  const html = render('pending');
  assert.ok(/data-filter="pending"[\s\S]{0,80}aria-pressed="true"/.test(html), 'pendentes deve vir aria-pressed=true');
  assert.ok(/data-filter="paid"[\s\S]{0,80}aria-pressed="false"/.test(html), 'pagos deve vir aria-pressed=false');
});

test('cada filtro corta a lista para o grupo certo', () => {
  assert.deepEqual(nomesVisiveis(render('all')).sort(), ['Ana', 'Bruno', 'Carla', 'Diego']);
  assert.deepEqual(nomesVisiveis(render('paid')).sort(), ['Ana', 'Bruno']);
  assert.deepEqual(nomesVisiveis(render('pending')).sort(), ['Carla', 'Diego']);
  assert.deepEqual(nomesVisiveis(render('in_game')).sort(), ['Ana', 'Carla']);
});

test('filtro sem ninguém mostra recado em vez de lista vazia', () => {
  const todosPagos = jogadores.map((p) => ({ ...p, mens_ok: true }));
  const html = renderPlayersScreen(snapshot, admin, todosPagos, null, 'pending');
  assert.ok(html.includes('players-filter-empty'), 'precisa do estado vazio');
  assert.ok(html.includes('Pendentes <strong>0</strong>'), 'contador de pendentes deve zerar');
});

test('filtro desconhecido não some com a lista', () => {
  assert.deepEqual(nomesVisiveis(render('vixe')).sort(), ['Ana', 'Bruno', 'Carla', 'Diego']);
});
