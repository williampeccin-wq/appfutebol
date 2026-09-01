// Regressão: rodízio do churrasco com número ÍMPAR de integrantes.
//
// Quando sobra alguém sem par, o admin escala o "Grupo" (todo mundo) como dupla
// dessa pessoa. O Grupo é um id reservado (__grupo__), não um jogador — e três
// camadas já apagaram dados por não conhecer ids assim:
//   - state.guard.sanitizeCarne poda duplas com jogador inexistente;
//   - audit.service acusa dupla órfã / jogador repetido;
//   - submit-rating recusa o voto quando a chave da dupla diverge do cliente.
//
// Rodar: node --test tests/churrasco-grupo-impar.regression.mjs

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Import de NAMESPACE de propósito: com import nomeado, a versão anterior do
// código quebrava no carregamento ("não exporta CARNE_GROUP_ID") e escondia as
// asserções do guard e da auditoria, que são o que este teste protege.
import * as carne from '../appfutebol_run/js/domain/carne.js';
import { sanitizeCarne } from '../appfutebol_run/js/domain/state.guard.js';
import { runIntegrityAudit } from '../appfutebol_run/js/domain/audit.service.js';

const { getChurrascoDuo } = carne;
const CARNE_GROUP_ID = '__grupo__';   // contrato: id reservado, gravado no blob
const CARNE_GROUP_NAME = 'Grupo';
const isCarneGroupId = (id) => String(id ?? '') === CARNE_GROUP_ID;

// Mesma extração do churrasco-alvo-servidor: importa a função REAL que vai para
// produção, não uma cópia do algoritmo.
const fonte = readFileSync(new URL('../supabase/functions/submit-rating/index.ts', import.meta.url), 'utf8');
const inicio = fonte.indexOf('// ---- Dupla do churrasco');
const fim = fonte.indexOf('Deno.serve(');
assert.ok(inicio > 0 && fim > inicio, 'o bloco da dupla precisa existir no submit-rating');
const dir = mkdtempSync(join(tmpdir(), 'churrasco-grupo-'));
const arquivo = join(dir, 'duo.ts');
writeFileSync(arquivo, `${fonte.slice(inicio, fim)}\nexport { churrascoDuoKey };\n`);
const { churrascoDuoKey } = await import(pathToFileURL(arquivo).href);

// ---------------------------------------------------------------- fixture
// 5 integrantes = 2 duplas + 1 sobrando, que fica com o Grupo.
const JOGADORES = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({ id, name: id.toUpperCase() }));
const INICIO = '2026-09-02';
const PARES = [
  { player1_id: 'p1', player2_id: 'p2' },
  { player1_id: 'p3', player2_id: 'p4' },
  { player1_id: 'p5', player2_id: CARNE_GROUP_ID }, // quem sobrou + Grupo
];
const ROTATION = { start_date: INICIO, pairs: PARES };
const CARNE_BLOB = [{ type: 'carne_rotation', start_date: INICIO, pairs: PARES }];
const SEMANA_DO_GRUPO = '2026-09-16'; // índice 2 do ciclo

// 1. A dupla da semana ímpar resolve o Grupo como segundo integrante, com nome.
{
  const duo = getChurrascoDuo([], ROTATION, JOGADORES, SEMANA_DO_GRUPO);
  assert.ok(duo, 'a semana do Grupo precisa ter dupla');
  assert.equal(duo.player1.name, 'P5');
  assert.equal(duo.player2.name, CARNE_GROUP_NAME, 'o Grupo tem de virar nome, não "Jogador"');
  assert.ok(isCarneGroupId(duo.player2.id), 'o segundo integrante é o sentinela do Grupo');
}

// 2. Cliente e servidor concordam sobre a chave — incluindo a semana do Grupo.
//    Se divergirem, o voto legítimo volta como invalid_target.
for (const data of ['2026-09-02', '2026-09-09', SEMANA_DO_GRUPO, '2026-09-23', '2026-09-30', '2026-10-07']) {
  const cliente = getChurrascoDuo([], ROTATION, JOGADORES, data);
  const servidor = churrascoDuoKey({ carne: CARNE_BLOB }, data);
  assert.equal(servidor, cliente?.key ?? null, `cliente e servidor divergiram em ${data}`);
}

// 3. A chave do Grupo é ordenada como qualquer outra (não pode duplicar no ranking).
{
  const direto = churrascoDuoKey({ carne: CARNE_BLOB }, SEMANA_DO_GRUPO);
  const invertido = churrascoDuoKey({
    carne: [{ type: 'carne_rotation', start_date: INICIO, pairs: [{ player1_id: CARNE_GROUP_ID, player2_id: 'p5' }] }],
  }, INICIO);
  assert.equal(direto, invertido, 'a ordem do cadastro não pode mudar a chave da dupla com Grupo');
}

// 4. O guard NÃO pode podar a dupla com Grupo (era o caminho do apagão do carnê).
{
  const estado = { players: JOGADORES.map((p) => ({ ...p })), carne: [{ id: 'carne_rotation', type: 'carne_rotation', start_date: INICIO, pairs: PARES.map((p) => ({ ...p })) }] };
  const { state } = sanitizeCarne(estado);
  const pares = state.carne.find((e) => e.type === 'carne_rotation').pairs;
  assert.equal(pares.length, 3, 'a dupla com Grupo tem de sobreviver ao guard');
  assert.ok(pares.some((p) => isCarneGroupId(p.player2_id)), 'o sentinela do Grupo continua na dupla');
}

// 4b. …mas jogador de verdade que não existe mais continua sendo podado.
{
  const comOrfa = { players: JOGADORES.map((p) => ({ ...p })), carne: [{ id: 'carne_rotation', type: 'carne_rotation', start_date: INICIO, pairs: [...PARES.map((p) => ({ ...p })), { player1_id: 'p9', player2_id: 'p1' }] }] };
  const { state } = sanitizeCarne(comOrfa);
  const pares = state.carne.find((e) => e.type === 'carne_rotation').pairs;
  assert.equal(pares.length, 3, 'dupla com jogador inexistente continua sendo removida');
}

// 5. A auditoria não acusa a dupla com Grupo como órfã nem o Grupo como repetido.
{
  const paresComDoisGrupos = [
    { player1_id: 'p1', player2_id: 'p2' },
    { player1_id: 'p3', player2_id: CARNE_GROUP_ID },
    { player1_id: 'p5', player2_id: CARNE_GROUP_ID },
  ];
  const { findings } = runIntegrityAudit({
    players: JOGADORES.map((p) => ({ ...p, name: p.name })),
    carne: [{ type: 'carne_rotation', start_date: INICIO, pairs: paresComDoisGrupos }],
  });
  const titulos = findings.map((f) => f.title).join(' | ');
  assert.ok(!/inexistente/.test(titulos), `Grupo não é dupla órfã: ${titulos}`);
  assert.ok(!/repetido/.test(titulos), `Grupo pode cobrir mais de uma semana: ${titulos}`);
}

// 6. Por último (para não mascarar as asserções acima): o sentinela é contrato
// entre cliente, guard, auditoria e servidor. Se mudar sem que os quatro mudem
// juntos, as duplas já gravadas viram lixo.
assert.equal(carne.CARNE_GROUP_ID, CARNE_GROUP_ID, 'o id do Grupo é contrato e não pode mudar');
assert.equal(carne.CARNE_GROUP_NAME, CARNE_GROUP_NAME);
assert.equal(carne.isCarneGroupId(CARNE_GROUP_ID), true);
assert.equal(carne.isCarneGroupId('p1'), false);

console.log('churrasco-grupo-impar: todos os casos OK');
