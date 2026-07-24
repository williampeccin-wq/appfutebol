// Fase 1 do perfil de clube: nenhum clube herda os costumes NEM OS DADOS de
// outro. O gatilho concreto: as rodadas importadas e o histórico estático do
// Harmonia eram constantes de módulo, aplicadas a qualquer clube e casadas por
// NOME normalizado — um jogador chamado "Junior" num clube novo recebia os
// pontos do Junior do Harmonia. Isso foi flagrado por acidente ao escrever o
// teste de pontuação, com um jogador fictício aparecendo com 16 pontos.
//
// Rodar: node tests/club-profile.regression.mjs

import assert from 'node:assert/strict';

// O serviço de campeonato lê a key do blob para saber se é a instalação legada.
// Aqui não há sessão, então isLegacyBlobKey devolve `true` (fallback 'default')
// — exatamente o cenário "Harmonia de hoje".
globalThis.window = { location: { hostname: 'teste.local' } };
globalThis.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};

const { getClubProfile, isModuleOn, getChampionshipPoints } =
  await import('../appfutebol_run/js/domain/club-profile.js');
const { getImportedChampionshipResults, getHistoricalTournaments, calculateAnnualRanking } =
  await import('../appfutebol_run/js/modules/championship/championship.service.js');

// Um clube com nomes que EXISTEM na planilha do Harmonia. Se o vazamento
// voltar, ele reaparece exatamente aqui.
const clube = (profile) => ({
  players: [
    { id: 'p1', name: 'Junior', plays_football: true, active: true },
    { id: 'p2', name: 'Gui', plays_football: true, active: true },
    { id: 'p3', name: 'William', plays_football: true, active: true },
  ],
  confirmations: [],
  games: [],
  championship: { active: { id: 'temp', results: [] } },
  ...(profile ? { profile } : {}),
});

// ---------------------------------------------------------------- defaults

const padrao = getClubProfile({}, { legacyBlob: false });
assert.equal(padrao.game.teams, 2, 'o default estrutural continua o de hoje');
assert.equal(padrao.game.cadence, 'semanal', 'cadência default é a atual');
assert.deepEqual(padrao.championship.points, { win: 3, draw: 2, loss: 1, no_play: 0 }, 'pontuação default é a atual');
assert.equal(padrao.championship.legacy_dataset, null, 'o dataset histórico NÃO pode vir ligado por omissão');

// A ponte: só a instalação original (blob legado, sem perfil) enxerga o dataset.
assert.equal(getClubProfile({}, { legacyBlob: true }).championship.legacy_dataset, 'harmonia_rei_da_quadra',
  'a instalação legada continua enxergando o próprio histórico');
assert.equal(getClubProfile({ profile: { schema_version: 1 } }, { legacyBlob: true }).championship.legacy_dataset, null,
  'assim que o perfil existe, a ponte sai de cena e vale o que o perfil diz');

// Perfil parcial não zera o resto.
const parcial = getClubProfile({ profile: { modules: { carne: false } } }, { legacyBlob: false });
assert.equal(parcial.modules.carne, false, 'o que o clube declarou vale');
assert.equal(parcial.modules.campeonato, true, 'o que ele não declarou vem do default');
assert.equal(parcial.game.teams, 2, 'seção não declarada fica intacta');

// ---------------------------------------------------------------- módulos

assert.equal(isModuleOn({}, 'churrasco'), true, 'sem perfil, tudo ligado como hoje');
assert.equal(isModuleOn({ profile: { modules: { churrasco: false } } }, 'churrasco'), false,
  'clube que não faz churrasco desliga o módulo');

// ---------------------------------------------------------------- o vazamento

const novo = clube({ schema_version: 1, modules: { campeonato: true } });

assert.deepEqual(getImportedChampionshipResults(novo), [],
  'clube novo não pode enxergar as rodadas importadas de outro clube');
assert.deepEqual(getHistoricalTournaments(novo), [],
  'clube novo não pode enxergar o histórico estático de outro clube');

const ranking = calculateAnnualRanking(novo);
const pontos = Object.fromEntries(ranking.map((r) => [r.name, r.points]));
assert.equal(pontos.Junior, 0, 'Junior de outro clube começa do zero, não com 16 pontos');
assert.equal(pontos.Gui, 0, 'Gui de outro clube começa do zero');
assert.equal(pontos.William, 0, 'William de outro clube começa do zero');

// ---------------------------------------------------------------- o Harmonia

// Sem perfil e no blob legado, o Harmonia continua vendo o próprio histórico:
// a correção não pode custar o dado de quem já usa o app.
const harmonia = clube(null);
assert.equal(getImportedChampionshipResults(harmonia).length, 5,
  'a instalação legada continua com as 5 rodadas importadas');
assert.ok(getHistoricalTournaments(harmonia).length > 0,
  'a instalação legada continua com o histórico estático');

const rankingHarmonia = calculateAnnualRanking(harmonia);
assert.ok((rankingHarmonia.find((r) => r.name === 'Junior')?.points || 0) > 0,
  'no Harmonia, Junior mantém os pontos que sempre teve');

// ---------------------------------------------------------------- pontuação custom

const futsal = { profile: { championship: { points: { win: 2, draw: 1, loss: 0, no_play: 0 } } } };
assert.deepEqual(getChampionshipPoints(futsal), { win: 2, draw: 1, loss: 0, no_play: 0 },
  'clube que pontua diferente não fica preso ao 3/2/1/0');

console.log('OK — 19 asserções. Clube novo não herda dado nem costume; a instalação legada segue intacta.');
