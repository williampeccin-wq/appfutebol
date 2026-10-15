// Presença automática: "todo mundo dentro, quem não vai avisa".
//
// De onde veio (13/10/2026): conversando com outros grupos, apareceu um que
// funciona ao contrário do Harmonia — o jogo abre na segunda ao meio-dia com os
// fixos JÁ confirmados e cada um só avisa quando não vai. O app obrigava todo
// mundo a confirmar, toda semana.
//
// A regra é uma só, mas roda em dois lugares: no aparelho do admin (quando ele
// abre o jogo na mão) e no cron `auto-open-games` (quando o jogo abre no
// horário). O que este teste guarda:
//
//   1. as duas cópias do arquivo são IDÊNTICAS — Edge Function não importa de
//      fora da própria pasta, então a regra é copiada, e cópia diverge;
//   2. os predicados do arquivo (que não importa nada, por causa da cópia)
//      concordam com os originais de authz/rules.engine/confirmations. Regra
//      de mensalidade em dois lugares já divergiu nesta base ("16/16 → 14/16");
//   3. o plano nunca passa do limite, nunca mexe em quem já respondeu e roda
//      duas vezes sem mudar nada.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = { location: { hostname: 'teste.local' } };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const {
  abrirComPresencaAutomatica, bloqueadoPorMensalidade, ehGoleiro, emAtraso, entradasDaPresencaAutomatica,
  isentoDeMensalidade, linhaDoBanco, motivoDeNaoEntrar, planejarPresencaAutomatica, presencaAutomaticaLigada,
  soChurrasco,
} = await import('../appfutebol_run/js/domain/presenca-automatica.js');
const { isCarneOnly, isMensalidadeExempt } = await import('../appfutebol_run/js/domain/authz.js');
const { cedeVezNaFilaPorMensalidade, isGameFull, shouldBlockPresenceForFinance } =
  await import('../appfutebol_run/js/domain/rules.engine.js');
const { classifyGameConfirmations, isGoalkeeperPlayer } = await import('../appfutebol_run/js/domain/confirmations.js');
const { DEFAULT_PROFILE, getClubProfile, perfilDoFormulario, presencaAutomatica } =
  await import('../appfutebol_run/js/domain/club-profile.js');
const { replaceState, getState } = await import('../appfutebol_run/js/core/state.js');
const { getWaitlistView, toggleConfirmation } = await import('../appfutebol_run/js/modules/game/game.service.js');

// ---------------------------------------------------------------- 1) as duas cópias

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
assert.equal(
  ler('../supabase/functions/auto-open-games/presenca-automatica.js'),
  ler('../appfutebol_run/js/domain/presenca-automatica.js'),
  'a cópia da Edge Function divergiu do domínio: copie appfutebol_run/js/domain/presenca-automatica.js para supabase/functions/auto-open-games/',
);
assert.doesNotMatch(ler('../appfutebol_run/js/domain/presenca-automatica.js'), /^\s*import\s/m,
  'o arquivo não pode importar nada: a Edge Function não alcança o resto do app');

const cron = ler('../supabase/functions/auto-open-games/index.ts');
assert.match(cron, /from "\.\/presenca-automatica\.js"/, 'o cron usa a cópia do domínio, não uma regra própria');
assert.match(cron, /ignoreDuplicates: true/, 'o cron nunca sobrescreve a resposta de quem já respondeu');

// ---------------------------------------------------------------- 2) predicados concordam

const JOGO = 'game_2026-10-21_2000';
const HOJE = '2026-10-19';
const VENCIDO = '2026-10-10';

const jogador = (n, extra = {}) => ({
  id: `p_${1700000000000 + n}`,
  name: `Jogador ${String(n).padStart(2, '0')}`,
  phone: `5199000${String(n).padStart(4, '0')}`,
  position: 'meia',
  plays_football: true,
  mens_ok: true,
  ...extra,
});

const variacoes = [
  {}, { mens_ok: false }, { mens_ok: undefined }, { position: 'gol' }, { position: 'gol', mens_ok: false },
  { position: 'gol', mens_ok: false, gk_pays: true }, { position: 'Goleiro' }, { role: 'carne', mens_ok: false },
  { role: 'carne', is_admin: true, mens_ok: false }, { plays_football: false, mens_ok: false },
  { plays_football: false, is_admin: true }, { is_admin: true, mens_ok: false },
];
const ajustes = [
  { mens_enforcement_mode: 'none', mens_expire_date: VENCIDO },
  { mens_enforcement_mode: 'partial', mens_expire_date: VENCIDO },
  { mens_enforcement_mode: 'total', mens_expire_date: VENCIDO, fila_prioriza_em_dia: true },
  { mens_enforcement_mode: 'total', mens_expire_date: '2099-01-01', fila_prioriza_em_dia: true },
  { mens_enforcement_mode: 'partial', mens_expire_date: '' },
  { fila_prioriza_em_dia: true, mens_expire_date: VENCIDO },
];

variacoes.forEach((extra, i) => {
  const p = jogador(i + 1, extra);
  const rotulo = JSON.stringify(extra);
  assert.equal(soChurrasco(p), isCarneOnly(p), `soChurrasco diverge de authz.isCarneOnly em ${rotulo}`);
  assert.equal(ehGoleiro(p), isGoalkeeperPlayer(p), `ehGoleiro diverge de isGoalkeeperPlayer em ${rotulo}`);
  assert.equal(isentoDeMensalidade(p), isMensalidadeExempt(p), `isenção diverge de authz em ${rotulo}`);
  for (const settings of ajustes) {
    // No app o vencimento é global e a projeção o carimba no jogo; é o que os originais leem.
    const game = { game_key: JOGO, mens_expire_date: settings.mens_expire_date };
    const onde = `${rotulo} com ${JSON.stringify(settings)}`;
    assert.equal(
      bloqueadoPorMensalidade(p, settings, HOJE),
      shouldBlockPresenceForFinance(p, game, settings.mens_enforcement_mode || 'none', HOJE),
      `bloqueio por mensalidade diverge do rules.engine em ${onde}`,
    );
    assert.equal(
      settings.fila_prioriza_em_dia === true && emAtraso(p, settings, HOJE),
      cedeVezNaFilaPorMensalidade(p, game, settings, HOJE),
      `"em atraso" diverge da preferência na fila em ${onde}`,
    );
  }
});

// ---------------------------------------------------------------- 3) o plano

const SEM_REGRA = { mens_enforcement_mode: 'none', mens_expire_date: VENCIDO };
const jogo = (extra = {}) => ({ id: JOGO, game_key: JOGO, max_players: 4, open: false, ...extra });
const planejar = (players, extra = {}) => planejarPresencaAutomatica({
  players, game: jogo(), settings: SEM_REGRA, confirmations: [], tetoGoleiros: 2, hoje: HOJE, ...extra,
});

// Cabe todo mundo: entram todos, ninguém na fila.
{
  const plano = planejar([jogador(1), jogador(2), jogador(3)]);
  assert.deepEqual(plano.linha, ['p_1700000000001', 'p_1700000000002', 'p_1700000000003']);
  assert.deepEqual(plano.fila, []);
}

// Sobra gente: entra até o limite, por ordem de cadastro; o resto vai para a fila NA MESMA ordem.
{
  const elenco = [6, 3, 1, 5, 2, 4].map((n) => jogador(n));
  const plano = planejar(elenco);
  assert.deepEqual(plano.linha.map((id) => id.slice(-1)), ['1', '2', '3', '4'], 'os 4 mais antigos entram');
  assert.deepEqual(plano.fila.map((id) => id.slice(-1)), ['5', '6'], 'os mais novos esperam, em ordem');
}

// Preferência "em dia primeiro": só com a chave ligada, e só depois do vencimento.
{
  const elenco = [jogador(1, { mens_ok: false }), jogador(2), jogador(3), jogador(4), jogador(5)];
  const semChave = planejar(elenco);
  assert.ok(semChave.linha.includes('p_1700000000001'), 'sem a preferência, atraso não muda a ordem');
  const comChave = planejar(elenco, { settings: { ...SEM_REGRA, fila_prioriza_em_dia: true } });
  assert.deepEqual(comChave.fila, ['p_1700000000001'], 'com a preferência, quem está em atraso é quem sobra');
  const antesDeVencer = planejar(elenco, { settings: { fila_prioriza_em_dia: true, mens_expire_date: '2099-01-01' } });
  assert.deepEqual(antesDeVencer.fila, ['p_1700000000005'], 'antes do vencimento ninguém está em atraso');
}

// Quem não entra sozinho, e por quê.
{
  const bloqueio = { mens_enforcement_mode: 'partial', mens_expire_date: VENCIDO };
  const motivo = (extra, settings = SEM_REGRA) => motivoDeNaoEntrar(jogador(1, extra), settings, HOJE);
  assert.equal(motivo({}), null, 'jogador comum é fixo');
  assert.equal(motivo({ auto_presenca: false }), 'avulso', 'o admin tirou da lista de fixos');
  assert.equal(motivo({ pending: true }), 'pendente', 'cadastro aguardando aprovação não é membro');
  assert.equal(motivo({ left_team: true }), 'saiu');
  assert.equal(motivo({ plays_football: false }), 'nao_joga', 'sócio só do churrasco não joga');
  assert.equal(motivo({ mens_ok: false }, bloqueio), 'mensalidade', 'bloqueado não entra automático');
  assert.equal(motivo({ mens_ok: false }), null, 'sem regra de bloqueio, atraso não tira ninguém');
  assert.equal(motivo({ mens_ok: undefined }, bloqueio), null, 'registro sem o campo não é inadimplente');
}

// NUNCA mexe em quem já respondeu: quem avisou que não vai não volta.
{
  const elenco = [jogador(1), jogador(2), jogador(3)];
  const jaRespondeu = [{ game_key: JOGO, player_id: 'p_1700000000002', confirmed: false, status: 'cancelled' }];
  const plano = planejar(elenco, { confirmations: jaRespondeu });
  assert.deepEqual(plano.linha, ['p_1700000000001', 'p_1700000000003']);
  assert.deepEqual(plano.fora, [{ id: 'p_1700000000002', motivo: 'ja_respondeu' }]);
  // Resposta em OUTRO jogo não conta.
  const outroJogo = [{ game_key: 'game_2026-10-14_2000', player_id: 'p_1700000000002', confirmed: false, status: 'cancelled' }];
  assert.equal(planejar(elenco, { confirmations: outroJogo }).linha.length, 3);
}

// Vaga já ocupada (confirmado antes da abertura, convidado) desconta do limite.
{
  const elenco = [jogador(1), jogador(2), jogador(3), jogador(4)];
  const plano = planejar(elenco, {
    game: jogo({ guest_players: [{ name: 'Primo', position: 'meia' }, { name: 'Goleiro', position: 'gol' }] }),
    confirmations: [{ game_key: JOGO, player_id: 'p_1700000000004', confirmed: true, status: 'confirmed' }],
  });
  assert.deepEqual(plano.linha, ['p_1700000000001', 'p_1700000000002'], '4 vagas − 1 confirmado − 1 convidado de linha');
  assert.deepEqual(plano.fila, ['p_1700000000003']);
}

// Goleiro: teto próprio, não ocupa vaga de linha e não tem fila.
{
  const elenco = [jogador(1, { position: 'gol' }), jogador(2, { position: 'gol' }), jogador(3, { position: 'gol' }),
    jogador(4), jogador(5), jogador(6), jogador(7)];
  const plano = planejar(elenco);
  assert.deepEqual(plano.goleiros, ['p_1700000000001', 'p_1700000000002']);
  assert.equal(plano.linha.length, 4, 'goleiro não tira vaga de linha');
  assert.deepEqual(plano.fora, [{ id: 'p_1700000000003', motivo: 'teto_goleiros' }]);
  assert.equal(planejar(elenco, { tetoGoleiros: 0 }).goleiros.length, 3, 'clube sem goleiro fixo não tem teto');
  assert.equal(planejar(elenco, { game: jogo({ rental_goalkeepers: [{ id: 'a' }, { id: 'b' }] }) }).goleiros.length, 0,
    'goleiro de aluguel ocupa o teto');
}

// Jogo sem limite: entram todos.
assert.equal(planejar([1, 2, 3, 4, 5, 6].map((n) => jogador(n)), { game: jogo({ max_players: 0 }) }).fila.length, 0);

// ---------------------------------------------------------------- abrir: uma vez só

const ELENCO = [1, 2, 3, 4, 5, 6].map((n) => jogador(n)).concat(jogador(7, { position: 'gol' }));
const AGORA = '2026-10-19T15:00:00.000Z';
const abrir = (game, confirmations) => abrirComPresencaAutomatica({
  players: ELENCO, game, settings: SEM_REGRA, confirmations, tetoGoleiros: 2, hoje: HOJE, agora: AGORA,
});

const aberto = abrir(jogo({ open: true }), []);
assert.equal(aberto.game.presence_mode, 'opt_out', 'o jogo sai carimbado: é o que inverte os textos da tela');
assert.equal(aberto.game.auto_confirmed_at, AGORA);
assert.equal(aberto.confirmations.length, 7);
assert.ok(aberto.confirmations.every((entry) => entry.auto === true && entry.game_key === JOGO));

const deNovo = abrir(aberto.game, aberto.confirmations);
assert.equal(deNovo.plano, null, 'fechar e reabrir não roda de novo');
assert.equal(deNovo.confirmations, aberto.confirmations);

// Rodar o plano por cima do que ele mesmo gravou (o tick repetido do cron) não acrescenta nada.
const repetido = planejarPresencaAutomatica({
  players: ELENCO, game: jogo(), settings: SEM_REGRA, confirmations: aberto.confirmations, tetoGoleiros: 2, hoje: HOJE,
});
assert.deepEqual([repetido.linha, repetido.goleiros, repetido.fila], [[], [], []], 'o plano é idempotente');

// ---------------------------------------------------------------- o app enxerga o que foi gravado

// As telas contam pela regra única (classifyGameConfirmations) e a lotação por
// isGameFull. O que a abertura gera tem de ser lido do mesmo jeito.
{
  const estado = { players: ELENCO, confirmations: aberto.confirmations };
  const lido = classifyGameConfirmations(estado, JOGO);
  assert.equal(lido.lineCount, 4, 'linha cheia, sem passar do limite');
  assert.equal(lido.goalkeeperCount, 1);
  assert.deepEqual(lido.waitlistPlayerIds, ['p_1700000000005', 'p_1700000000006'], 'a fila sai na ordem do plano');
  assert.equal(isGameFull(aberto.game, aberto.confirmations), true);
}

// "Não vou" é o cancelamento de sempre: sai, e o primeiro da fila entra.
{
  replaceState({
    players: ELENCO,
    game: aberto.game,
    games: [aberto.game],
    active_game_id: JOGO,
    confirmations: aberto.confirmations,
    settings: SEM_REGRA,
  });
  const resultado = toggleConfirmation('p_1700000000002');
  assert.equal(resultado.ok, true);
  assert.equal(resultado.promotedPlayerId, 'p_1700000000005', 'o primeiro da fila automática é quem entra');
  assert.deepEqual(getWaitlistView().map((item) => String(item.player_id)), ['p_1700000000006']);

  // Voltou pro jogo por conta própria: deixa de ser "automático".
  const cheio = toggleConfirmation('p_1700000000002');
  assert.match(cheio.message, /fila de espera/, 'jogo cheio: quem saiu e quer voltar entra na fila');
  toggleConfirmation('p_1700000000003'); // abre vaga; o 6 (primeiro da fila) entra
  toggleConfirmation('p_1700000000004'); // abre outra; agora o 2 entra
  const voltou = getState().confirmations.find((entry) => entry.player_id === 'p_1700000000002');
  assert.equal(voltou.confirmed, true);
}

// ---------------------------------------------------------------- a linha que o cron grava

{
  const plano = planejar([1, 2, 3, 4, 5].map((n) => jogador(n)).concat(jogador(9, { position: 'gol' })));
  const entradas = entradasDaPresencaAutomatica(plano, AGORA);
  const linhas = entradas.map((entrada) => linhaDoBanco(entrada, AGORA, 'clube-1'));
  const dentro = linhas.find((l) => l.player_id === 'p_1700000000001');
  assert.equal(dentro.status, 'confirmed');
  assert.equal(dentro.confirmed_at, AGORA);
  assert.equal(dentro.club_id, 'clube-1', 'sem club_id a RLS do clube não enxerga a linha');
  assert.equal(dentro.data.auto, true);

  // O leitor do app (confirmationFromPresenceRow) acha a fila em data.status; a
  // COLUNA status de quem espera é 'cancelled'. Gravar 'waitlist' na coluna
  // faria a pessoa sumir da fila na tela.
  const espera = linhas.find((l) => l.player_id === 'p_1700000000005');
  assert.equal(espera.status, 'cancelled');
  assert.equal(espera.data.status, 'waitlist');
  assert.ok(espera.data.waitlisted_at > AGORA, 'a fila nova fica depois do instante de abertura');

  const goleiro = linhas.find((l) => l.player_id === 'p_1700000000009');
  assert.equal(goleiro.data.segment, 'goalkeeper', 'sem o segmento, a trava do banco contaria o goleiro como linha');
  assert.equal('club_id' in linhaDoBanco(entradas[0], AGORA, null), false, 'projeto single-tenant não tem a coluna');
}

// ---------------------------------------------------------------- o perfil do clube

const SEM_LEGADO = { legacyBlob: false };
assert.equal(DEFAULT_PROFILE.presence.mode, 'opt_in', 'o padrão é o comportamento de sempre');
assert.equal(presencaAutomatica({}, SEM_LEGADO), false, 'clube sem perfil não muda de comportamento');
assert.equal(presencaAutomatica({ profile: { presence: { mode: 'opt_out' } } }, SEM_LEGADO), true);
assert.equal(presencaAutomaticaLigada({ presence: { mode: 'opt_out' } }), true, 'o cron lê o perfil cru do blob');
assert.equal(presencaAutomaticaLigada(null), false);

{
  const atual = getClubProfile({}, SEM_LEGADO);
  const form = (campos) => new Map(Object.entries(campos));
  assert.equal(perfilDoFormulario(form({ presence_mode: 'opt_out' }), atual).presence.mode, 'opt_out');
  assert.equal(perfilDoFormulario(form({ presence_mode: 'qualquer' }), atual).presence.mode, 'opt_in',
    'valor desconhecido não vira modo');
  const ligado = getClubProfile({ profile: { presence: { mode: 'opt_out' } } }, SEM_LEGADO);
  assert.equal(perfilDoFormulario(form({}), ligado).presence.mode, 'opt_out',
    'formulário sem o campo não desliga o que estava ligado');
}

console.log('ok — presença automática: mesma regra no app e no cron, sem passar do limite e sem mexer em quem já respondeu');
