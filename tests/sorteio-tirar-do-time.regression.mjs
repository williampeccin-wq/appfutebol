// INCIDENTE 16/09/2026 (Harmonia): o jogo lotou, o Bignotti ficou na fila de
// espera e o Broquinha desistiu. Os admins receberam o push (isso funcionou),
// mas o Broquinha CONTINUOU no time — e não havia botão nenhum para tirá-lo.
//
// Cadeia real:
//   1. o Broquinha cancela. A presença dele grava; o sorteio, não — mora em
//      `app_meta`, admin-only (ver sorteio-quem-cancelou.regression.mjs);
//   2. semQuemCancelou esconde o Broquinha do time na hora de exibir. Esconder,
//      só: o que está gravado continua com ele dentro;
//   3. o admin abre o app, o Bignotti é promovido da fila e o admin o põe no
//      Time A. Essa edição carimba `adjusted_at` com AGORA — mais novo que o
//      cancelamento do Broquinha;
//   4. a trava "o admin mexeu depois, não desfaz" passa a valer, o filtro para
//      de agir e o Broquinha RESSUSCITA no time;
//   5. o admin não tem como consertar: a tela só oferece "Mover". Sobrava
//      re-sortear tudo, desmanchando times já combinados.
//
// Regra: o admin edita o sorteio que ele está VENDO. A base de toda edição é o
// sorteio já filtrado, então quem saiu sai do que fica gravado — e passa a
// existir o "Tirar do time" para a mão do admin, quando nada disso pegar.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import { replaceState, getState } from '../appfutebol_run/js/core/state.js';
import { addConfirmedPlayerToDraw, moveDrawnPlayer, removeDrawnPlayer } from '../appfutebol_run/js/modules/game/game.service.js';
import { timesDoSorteio } from '../appfutebol_run/js/domain/draw-teams.js';

const JOGO = 'g_2026-09-16_2000';
const SORTEADO_EM = '2026-09-16T18:00:00.000Z';
const CANCELOU_EM = '2026-09-16T19:00:00.000Z';

let ddd = 10;
const jogador = (id, name) => ({
  id, name, active: true, position: 'meia', plays_football: true, role: 'player',
  phone: `489${String(ddd++).padStart(2, '0')}00000`,
});

const confirmado = (id) => ({
  game_key: JOGO, player_id: id, confirmed: true, status: 'confirmed',
  confirmed_at: SORTEADO_EM, cancelled_at: null, timestamp: SORTEADO_EM,
});

const cancelou = (id) => ({
  game_key: JOGO, player_id: id, confirmed: false, status: 'cancelled',
  confirmed_at: null, cancelled_at: CANCELOU_EM, timestamp: CANCELOU_EM,
});

const ELENCO = ['broquinha', 'p2', 'p3', 'p4', 'p5', 'p6', 'bignotti'];

function montarEstado() {
  const game = {
    game_key: JOGO,
    game_date: '2026-09-16',
    status: 'aberto',
    max_players: 12,
    sort_result: {
      id: 'd1',
      created_at: SORTEADO_EM,
      team_a: ['broquinha', 'p2', 'p3'],
      team_b: ['p4', 'p5', 'p6'],
    },
    draw_history: [],
  };

  replaceState({
    session: { playerId: 'p_admin' },
    players: [
      { ...jogador('p_admin', 'Admin'), is_admin: true },
      ...ELENCO.map((id) => jogador(id, id)),
    ],
    game,
    games: [game],
    active_game_id: JOGO,
    // O Bignotti já entrou (promovido da fila quando o Broquinha saiu); o
    // Broquinha está cancelado e continua gravado dentro do Time A.
    confirmations: [
      cancelou('broquinha'),
      ...['p2', 'p3', 'p4', 'p5', 'p6', 'bignotti'].map(confirmado),
    ],
  });
}

const times = () => timesDoSorteio(getState().game.sort_result);
const noSorteio = () => times().flat().map(String);

// ------------------------------------------- o caso do incidente

montarEstado();

// O admin põe o Bignotti no Time A — a edição que ressuscitava o Broquinha.
const incluiu = addConfirmedPlayerToDraw('bignotti', 0);
assert.equal(incluiu.ok, true, 'o admin consegue incluir quem entrou pela fila');
assert.ok(!noSorteio().includes('broquinha'),
  'quem cancelou NÃO volta ao time quando o admin edita o sorteio depois');
assert.deepEqual(times(), [['p2', 'p3', 'bignotti'], ['p4', 'p5', 'p6']],
  'a edição parte do sorteio exibido: sai o Broquinha, entra o Bignotti');

// E a remoção agora está GRAVADA, não só escondida: é isso que impede a volta.
assert.ok(getState().game.sort_result.adjusted_at > CANCELOU_EM,
  'a edição do admin carimba adjusted_at — e mesmo assim o Broquinha não voltou');

// Mover também não pode ressuscitar ninguém.
montarEstado();
assert.equal(moveDrawnPlayer('p2', 0).ok, true, 'mover continua funcionando');
assert.ok(!noSorteio().includes('broquinha'), 'mover não traz de volta quem cancelou');

// ------------------------------------------- o botão que faltava

montarEstado();

const tirou = removeDrawnPlayer('p2');
assert.equal(tirou.ok, true, 'o admin consegue tirar alguém do time');
assert.equal(tirou.message, 'Jogador tirado do time.');
assert.deepEqual(times(), [['p3'], ['p4', 'p5', 'p6']],
  'sai só quem foi apontado (e o Broquinha, que já tinha cancelado)');

// Tirar do time NÃO mexe na presença: quem continua confirmado reaparece na
// lista de "confirmados fora do sorteio", de onde dá para recolocar.
const presencaDoP2 = getState().confirmations.find((entry) => entry.player_id === 'p2');
assert.equal(presencaDoP2.confirmed, true, 'tirar do time não cancela a presença');
assert.equal(presencaDoP2.status, 'confirmed', 'nem mexe no status dela');

// O número de times não muda, mesmo esvaziando um deles — o rodízio conta com o
// índice para rótulo e uniforme.
removeDrawnPlayer('p3');
assert.equal(times().length, 2, 'time vazio continua existindo');
assert.deepEqual(times()[0], [], 'e vazio de verdade');

// ------------------------------------------- o que não pode acontecer

montarEstado();
assert.equal(removeDrawnPlayer('p_admin').ok, false, 'quem não está no sorteio não é "tirado"');
assert.equal(removeDrawnPlayer('broquinha').ok, false,
  'quem já saiu por cancelamento não aparece como removível');
assert.deepEqual(times(), [['broquinha', 'p2', 'p3'], ['p4', 'p5', 'p6']],
  'tentativa inválida não grava nada por cima do sorteio');

console.log('OK — 15 asserções. Quem cancelou não volta ao time, e o admin tem como tirar na mão.');
