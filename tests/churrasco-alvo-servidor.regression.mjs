// Regressão do ACHADO 20/08 (auditoria da votação): o alvo do voto de churrasco
// não era validado no servidor. Qualquer string virava uma dupla avaliada, e o
// ranking da carne aceitava duplas que nunca existiram.
//
// A correção faz o servidor recalcular a dupla responsável pelo jogo. O risco
// dela é o oposto do bug: se o cálculo do servidor DIVERGIR do cálculo do
// cliente, o voto legítimo passa a ser recusado com invalid_target — e a votação
// quebra para todo mundo, que foi exatamente o tipo de estrago do dia 20/08.
//
// Por isso este teste não verifica o servidor sozinho: ele importa a função REAL
// do cliente (domain/carne.js) e a função REAL do servidor (extraída do
// submit-rating/index.ts) e exige que as duas concordem, data a data.
//
// Rodar: node tests/churrasco-alvo-servidor.regression.mjs

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { getChurrascoDuo } from '../appfutebol_run/js/domain/carne.js';

// ---------------------------------------------------------------- servidor real
//
// Extrai o trecho puro do index.ts (do marcador até o Deno.serve) e importa. Não
// é uma cópia do algoritmo: é o arquivo que vai para produção. Se alguém mexer lá
// e divergir do cliente, este teste quebra.

const fonte = readFileSync(new URL('../supabase/functions/submit-rating/index.ts', import.meta.url), 'utf8');
const inicio = fonte.indexOf('// ---- Dupla do churrasco');
const fim = fonte.indexOf('Deno.serve(');
assert.ok(inicio > 0 && fim > inicio, 'o bloco da dupla precisa existir no submit-rating');

const dir = mkdtempSync(join(tmpdir(), 'churrasco-'));
const arquivo = join(dir, 'duo.ts');
writeFileSync(arquivo, `${fonte.slice(inicio, fim)}\nexport { churrascoDuoKey };\n`);
const { churrascoDuoKey } = await import(pathToFileURL(arquivo).href);

// ---------------------------------------------------------------- fixture

const PARES = [
  { player1_id: 'p1', player2_id: 'p2' },
  { player1_id: 'p3', player2_id: 'p4' },
  { player1_id: 'p5', player2_id: 'p6' },
];
const INICIO = '2026-06-10';
const ESCALA = [{ date: '2026-07-15', player1_id: 'p9', player2_id: 'p1' }];

const rotationCliente = { start_date: INICIO, pairs: PARES };
const carneServidor = [
  { type: 'carne_rotation', start_date: INICIO, pairs: PARES },
  ...ESCALA.map((e) => ({ type: 'carne_schedule', ...e })),
];
const jogadores = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p9'].map((id) => ({ id, name: id.toUpperCase() }));

// ---------------------------------------------------------------- cenário 1
//
// Cliente e servidor têm de produzir a MESMA chave, semana a semana. Inclui data
// anterior ao início do rodízio (semana negativa, onde o módulo em JS morde) e a
// data com escala datada, que tem prioridade sobre o rodízio.

const DATAS = [
  '2026-06-10', '2026-06-17', '2026-06-24', '2026-07-01', '2026-07-08',
  '2026-07-15', // escala datada: p9|p1 vence o rodízio
  '2026-07-22', '2026-07-29', '2026-08-05', '2026-08-12', '2026-08-19',
  '2026-06-03', // antes do início: semana -1
  '2026-05-27', // antes do início: semana -2
];

for (const data of DATAS) {
  const doCliente = getChurrascoDuo(ESCALA, rotationCliente, jogadores, data);
  const doServidor = churrascoDuoKey({ carne: carneServidor }, data);
  assert.equal(
    doServidor,
    doCliente?.key ?? null,
    `cliente e servidor divergiram em ${data}: servidor=${doServidor} cliente=${doCliente?.key}`,
  );
}

// A escala datada realmente venceu o rodízio (senão o teste acima passaria por
// coincidência, comparando dois cálculos igualmente errados).
assert.equal(
  churrascoDuoKey({ carne: carneServidor }, '2026-07-15'),
  'p1|p9',
  'a escala datada tem prioridade e a chave vem ordenada',
);

// ---------------------------------------------------------------- cenário 2
//
// Chave sempre ordenada: a mesma dupla não pode gerar duas chaves diferentes
// conforme a ordem em que foi cadastrada, senão vira voto duplicado no ranking.

const invertido = [{ type: 'carne_rotation', start_date: INICIO, pairs: [{ player1_id: 'p2', player2_id: 'p1' }] }];
assert.equal(
  churrascoDuoKey({ carne: invertido }, '2026-06-10'),
  'p1|p2',
  'a ordem do cadastro não pode mudar a chave',
);

// ---------------------------------------------------------------- cenário 3
//
// Sem rodízio e sem escala o servidor devolve null — e null significa ACEITAR o
// voto, não recusar. É a escolha deliberada da correção: recusar voto legítimo
// por não saber calcular é pior do que aceitar um alvo que só um jogador
// autenticado do clube conseguiria enviar.

assert.equal(churrascoDuoKey({ carne: [] }, '2026-08-19'), null, 'sem rodízio não há o que validar');
assert.equal(churrascoDuoKey({}, '2026-08-19'), null, 'blob sem carnê não pode explodir');
assert.equal(churrascoDuoKey({ carne: carneServidor }, ''), null, 'data vazia não vira validação');
assert.equal(
  churrascoDuoKey({ carne: [{ type: 'carne_rotation', start_date: '', pairs: PARES }] }, '2026-08-19'),
  null,
  'rodízio sem data de início não valida nada',
);

console.log(`OK — ${DATAS.length + 7} asserções. Servidor e cliente concordam sobre a dupla em todas as datas.`);
