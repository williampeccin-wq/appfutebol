// A cadência do clube precisa DECIDIR algo, não só ficar guardada.
//
// A tela "Como o clube joga" (v1.144.0) já deixava escolher cadência e dia da
// semana, mas nada lia esses valores: eram gravados e relidos apenas para
// preencher o próprio formulário. Um controle que não faz nada é pior do que
// não ter o controle — o admin configura "quinzenal, sábado" e o app segue
// exatamente igual, sem avisar que ignorou.
//
// Rodar: node tests/cadencia.regression.mjs

import assert from 'node:assert/strict';

globalThis.window = { location: { hostname: 'teste.local' } };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { proximaDataDeJogo, horarioPadraoDeJogo } =
  await import('../appfutebol_run/js/domain/club-profile.js');

const SEM_LEGADO = { legacyBlob: false };
const clube = (game) => ({ profile: { schema_version: 1, game } });

// Sexta-feira, 24/07/2026.
const sexta = new Date(2026, 6, 24);
assert.equal(sexta.getDay(), 5, 'sanidade: 24/07/2026 é sexta');

// ---------------------------------------------------------------- semanal

// Quarta (3) a partir de uma sexta → a quarta seguinte, 29/07.
assert.equal(
  proximaDataDeJogo(clube({ cadence: 'semanal', day_of_week: 3 }), sexta, SEM_LEGADO),
  '2026-07-29',
  'semanal às quartas, criado numa sexta → próxima quarta',
);

// Sábado (6) a partir de uma sexta → o dia seguinte, 25/07.
assert.equal(
  proximaDataDeJogo(clube({ cadence: 'semanal', day_of_week: 6 }), sexta, SEM_LEGADO),
  '2026-07-25',
  'semanal aos sábados, criado numa sexta → o sábado de amanhã',
);

// O dia de HOJE não conta: quem cria o jogo hoje quer o PRÓXIMO.
assert.equal(
  proximaDataDeJogo(clube({ cadence: 'semanal', day_of_week: 5 }), sexta, SEM_LEGADO),
  '2026-07-31',
  'semanal às sextas, criado numa sexta → a próxima sexta, não hoje',
);

// ---------------------------------------------------------------- quinzenal

assert.equal(
  proximaDataDeJogo(clube({ cadence: 'quinzenal', day_of_week: 3 }), sexta, SEM_LEGADO),
  '2026-08-05',
  'quinzenal às quartas → pula uma semana',
);

// ---------------------------------------------------------------- mensal

// 24/07 é a 4ª sexta do mês. Mensal preserva a semana do mês (é assim que os
// grupos marcam: "última sexta", não "dia 24").
assert.equal(
  proximaDataDeJogo(clube({ cadence: 'mensal', day_of_week: 5 }), sexta, SEM_LEGADO),
  '2026-08-28',
  'mensal às sextas, 4ª do mês → 4ª sexta de agosto',
);

// 1ª quarta de julho é dia 01. A 1ª quarta de agosto é dia 05.
const primeiraQuarta = new Date(2026, 6, 1);
assert.equal(primeiraQuarta.getDay(), 3, 'sanidade: 01/07/2026 é quarta');
assert.equal(
  proximaDataDeJogo(clube({ cadence: 'mensal', day_of_week: 3 }), primeiraQuarta, SEM_LEGADO),
  '2026-08-05',
  'mensal às quartas, 1ª do mês → 1ª quarta do mês seguinte',
);

// Mês que não tem a 5ª ocorrência: cai na última, sem vazar para o mês seguinte.
const quintaSexta = new Date(2026, 6, 31);   // 5ª sexta de julho
assert.equal(quintaSexta.getDay(), 5, 'sanidade: 31/07/2026 é sexta');
const mensalEstouro = proximaDataDeJogo(clube({ cadence: 'mensal', day_of_week: 5 }), quintaSexta, SEM_LEGADO);
assert.ok(
  mensalEstouro.startsWith('2026-08'),
  `mensal não pode vazar para setembro quando agosto não tem a 5ª sexta (veio ${mensalEstouro})`,
);

// ---------------------------------------------------------------- avulso

assert.equal(
  proximaDataDeJogo(clube({ cadence: 'avulso', day_of_week: 3 }), sexta, SEM_LEGADO),
  '',
  'clube sem periodicidade não recebe sugestão — o admin digita a data',
);

// ---------------------------------------------------------------- horário

assert.equal(horarioPadraoDeJogo({}, SEM_LEGADO), '20:00', 'default é o horário de hoje');
assert.equal(
  horarioPadraoDeJogo(clube({ default_time: '09:00' }), SEM_LEGADO),
  '09:00',
  'clube que joga de manhã não fica preso às 20:00',
);

console.log('OK — 12 asserções. Cadência e dia da semana passam a decidir a próxima data de jogo.');

// ---------------------------------------------------------------- tamanho do jogo
//
// Estes campos existiam no perfil desde a F1 mas NINGUÉM os lia. Foram ligados
// junto com a abertura da tela: expor um controle sem consumi-lo é o defeito
// que esta suíte existe para impedir.

const { goleirosPorJogo, jogadoresPorTime, limiteSugeridoDeJogo, usaPosicoes, FORMATOS } =
  await import('../appfutebol_run/js/domain/club-profile.js');

assert.equal(goleirosPorJogo({}, SEM_LEGADO), 2, 'default de goleiros é o de hoje');
assert.equal(goleirosPorJogo(clube({ goalkeepers_per_game: 0 }), SEM_LEGADO), 0,
  'clube sem goleiro fixo pode zerar');
assert.equal(goleirosPorJogo(clube({ goalkeepers_per_game: 1 }), SEM_LEGADO), 1,
  'clube com um goleiro só');

assert.equal(jogadoresPorTime({}, SEM_LEGADO), 11, 'default de jogadores por time é o de hoje');
assert.equal(limiteSugeridoDeJogo({}, SEM_LEGADO), 22, 'limite sugerido = 11 x 2 times');
assert.equal(
  limiteSugeridoDeJogo(clube({ players_per_team: 5 }), SEM_LEGADO), 10,
  'futsal sugere 10 jogadores de linha, não 22',
);

assert.equal(usaPosicoes({}, SEM_LEGADO), true, 'por padrão o clube usa posição, como hoje');
assert.equal(
  usaPosicoes({ profile: { positions: { enabled: false } } }, SEM_LEGADO), false,
  'clube de pelada simples pode desligar posição',
);

// Os presets precisam bater com os números que preenchem — senão o seletor
// mente para o admin.
assert.equal(FORMATOS.futsal5.players_per_team, 5, 'preset futsal = 5 por time');
assert.equal(FORMATOS.society7.players_per_team, 7, 'preset society = 7 por time');
assert.equal(FORMATOS.campo11.players_per_team, 11, 'preset campo = 11 por time');
assert.equal(FORMATOS.custom.players_per_team, null, 'custom não sobrescreve o que o admin digitou');

console.log('OK — +11 asserções. Tamanho do jogo, goleiros e posições também decidem comportamento.');
