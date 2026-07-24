// O caminho "admin mexe na tela → perfil gravado".
//
// Esta era a única parte da parametrização SEM cobertura: a transformação
// FormData → perfil morava dentro do listener de submit, e é exatamente ali que
// os erros silenciosos moram — um `name=` que não bate com o que o handler lê,
// uma seção esquecida no spread, um checkbox lido como string. Em todos esses
// casos o admin salva, o app diz "salvo", e o valor não foi.
//
// A função é pura e aceita qualquer coisa com `.get(nome)`: FormData no
// browser, Map aqui.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';

globalThis.window = { location: { hostname: 'teste.local' } };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { DEFAULT_PROFILE, getClubProfile, perfilDoFormulario, goleirosPorJogo, isModuleOn, usaPosicoes } =
  await import('../appfutebol_run/js/domain/club-profile.js');

const SEM_LEGADO = { legacyBlob: false };
const atual = getClubProfile({}, SEM_LEGADO);

// Um formulário como o browser o entrega: checkbox marcado vira 'on', checkbox
// desmarcado simplesmente NÃO APARECE (não vem 'off'). Errar isso faz todo
// módulo parecer ligado.
const formulario = (campos) => new Map(Object.entries(campos));

// ---------------------------------------------------------------- caso completo

const preenchido = perfilDoFormulario(formulario({
  format: 'futsal5',
  players_per_team: '5',
  goalkeepers_per_game: '0',
  cadence: 'quinzenal',
  day_of_week: '6',
  mod_campeonato: 'on',
  mod_votacao: 'on',
  // churrasco e usa_posicoes DESMARCADOS: ausentes, como o browser faz
  pts_win: '2', pts_draw: '1', pts_loss: '0', pts_no_play: '0',
}), atual);

assert.equal(preenchido.game.format, 'futsal5', 'formato escolhido');
assert.equal(preenchido.game.players_per_team, 5, 'jogadores por time viram número, não string');
assert.equal(preenchido.game.goalkeepers_per_game, 0, 'zero goleiros é um valor válido, não "vazio"');
assert.equal(preenchido.game.cadence, 'quinzenal', 'cadência escolhida');
assert.equal(preenchido.game.day_of_week, 6, 'dia da semana vira número');

assert.equal(preenchido.modules.churrasco, false, 'checkbox AUSENTE = desmarcado (o browser não manda "off")');
assert.equal(preenchido.modules.campeonato, true, 'checkbox marcado = ligado');
assert.equal(preenchido.positions.enabled, false, 'posições desmarcadas');

assert.deepEqual(preenchido.championship.points, { win: 2, draw: 1, loss: 0, no_play: 0 },
  'pontuação custom chega inteira');

// ---------------------------------------------------------------- não destruir

// O que o formulário NÃO controla precisa sobreviver. Sem os spreads, salvar a
// tela apagaria a temporada e o dataset — dado que ninguém pediu para mexer.
const comHistorico = getClubProfile({
  profile: {
    schema_version: 1,
    championship: { legacy_dataset: 'harmonia_rei_da_quadra', season: { id: 'verao-2027', label: 'Verão 2027' } },
    modules: { pix_ia: false, mensalidade: true },
    game: { default_time: '09:00', teams: 2 },
  },
}, SEM_LEGADO);

const preservado = perfilDoFormulario(formulario({ cadence: 'semanal', day_of_week: '3' }), comHistorico);

assert.equal(preservado.championship.legacy_dataset, 'harmonia_rei_da_quadra',
  'salvar a tela não pode desligar o dataset histórico do clube');
assert.equal(preservado.championship.season.id, 'verao-2027',
  'a temporada não está na tela e precisa sobreviver ao salvamento');
assert.equal(preservado.modules.pix_ia, false,
  'módulo fora da tela mantém o valor do clube');
assert.equal(preservado.game.default_time, '09:00',
  'horário padrão não está na tela e precisa sobreviver');
assert.equal(preservado.game.teams, 2, 'nº de times (Fase 2) sobrevive intacto');

// ---------------------------------------------------------------- entrada suja

// Campo apagado pelo admin, ou texto onde se espera número: cai no valor atual
// em vez de virar NaN/0 e zerar a configuração do clube.
const sujo = perfilDoFormulario(formulario({
  players_per_team: '',
  goalkeepers_per_game: 'abc',
  day_of_week: '-1',
  pts_win: '',
}), atual);

assert.equal(sujo.game.players_per_team, DEFAULT_PROFILE.game.players_per_team,
  'campo vazio mantém o valor atual, não vira 0');
assert.equal(sujo.game.goalkeepers_per_game, DEFAULT_PROFILE.game.goalkeepers_per_game,
  'texto onde se espera número mantém o valor atual');
assert.equal(sujo.game.day_of_week, DEFAULT_PROFILE.game.day_of_week,
  'número negativo é rejeitado');
assert.equal(sujo.championship.points.win, DEFAULT_PROFILE.championship.points.win,
  'pontuação vazia mantém a atual');

// ---------------------------------------------------------------- fim a fim

// O perfil gravado precisa ser lido de volta pelos MESMOS acessores que o app
// usa em produção. Testar só a montagem não provaria que o app enxerga.
const estadoSalvo = { profile: preenchido };
assert.equal(goleirosPorJogo(estadoSalvo, SEM_LEGADO), 0,
  'o app lê 0 goleiros do perfil que a tela gravou');
assert.equal(isModuleOn(estadoSalvo, 'churrasco', SEM_LEGADO), false,
  'o app enxerga o churrasco desligado pela tela');
assert.equal(usaPosicoes(estadoSalvo, SEM_LEGADO), false,
  'o app enxerga as posições desligadas pela tela');
assert.equal(preenchido.schema_version, 1, 'o perfil gravado é versionado');

console.log('OK — 22 asserções. A tela de configuração grava o que promete, sem apagar o resto.');
