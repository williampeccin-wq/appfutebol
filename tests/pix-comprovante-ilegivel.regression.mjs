// Regressão do INCIDENTE 09/09/2026 (Digão, Harmonia): um comprovante PIX
// legítimo foi recusado com "O valor do comprovante não bate com o valor da
// mensalidade".
//
// O que tinha acontecido: ele fotografou a tela do banco com outro celular e
// pegou só a metade de baixo do comprovante — recebedor, pagador e ID da
// transação. Valor e data ficaram fora do quadro. O prompt de visão manda
// devolver amount=0 e date="" quando o campo está ilegível, e a validação
// tratava esses dois valores como "pagou errado" / "não é deste mês". O jogador
// recebia uma acusação em vez da única instrução que resolvia (reenviar o
// comprovante inteiro), e a recusa não deixava rastro nenhum no log.
//
// Este teste protege as duas metades da correção:
//   1. ilegível é uma recusa PRÓPRIA (amount_unreadable / date_unreadable);
//   2. a data do pagamento é derivada do E2E quando o campo não foi lido — o
//      E2E carrega AAAAMMDDHHMM em UTC, e é o que salvaria o print do Digão.
//
// Rodar: node tests/pix-comprovante-ilegivel.regression.mjs

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------- servidor real
//
// Mesmo padrão de churrasco-alvo-servidor: extrai o bloco puro do index.ts e
// importa. Não é cópia do algoritmo — é o arquivo que vai para produção.

const fonte = readFileSync(new URL('../supabase/functions/read-pix-receipt/index.ts', import.meta.url), 'utf8');
const inicio = fonte.indexOf('// ---- Data do pagamento a partir do E2E');
const fim = fonte.indexOf('const PROMPT = [');
assert.ok(inicio > 0 && fim > inicio, 'o bloco puro de valor/data precisa existir no read-pix-receipt');

const dir = mkdtempSync(join(tmpdir(), 'pix-'));
const arquivo = join(dir, 'validacao.ts');
writeFileSync(arquivo, `${fonte.slice(inicio, fim)}\nexport { dateFromE2e, amountReject, resolvePaidDate };\n`);
const { dateFromE2e, amountReject, resolvePaidDate } = await import(pathToFileURL(arquivo).href);

let n = 0;
const eq = (real, esperado, msg) => { assert.deepEqual(real, esperado, msg); n += 1; };

// ------------------------------------------------------- 1) o caso do Digão
//
// E2E do comprovante real: ISPB 03419786, 2026-09-10 01:58 UTC. Em Brasília
// (UTC-3) isso é 09/09 às 22:58 — que é exatamente o horário impresso no
// comprovante ("gerado em 09/09/2026 às 22:58:46"). Setembro, mês corrente.
const E2E_DIGAO = 'E03419786202609100158IIMVEFW5KVF';
eq(dateFromE2e(E2E_DIGAO), '2026-09-09', 'a data do E2E do Digão tem que cair em 09/09 (BRT)');

// Print recortado: sem valor e sem data, mas com o E2E visível.
eq(amountReject(0, 50), 'amount_unreadable', 'valor 0 é ilegível, não é valor errado');
eq(
  resolvePaidDate('', E2E_DIGAO, '2026-09'),
  { date: '2026-09-09', reject: '' },
  'sem data no print, o E2E resolve — era o que faltava para o comprovante do Digão passar',
);

// ------------------------------------------------------- 2) ilegível × errado
eq(amountReject(50, 50), '', 'valor exato passa');
eq(amountReject(50.0, 50), '', 'valor exato em float passa');
eq(amountReject(40, 50), 'amount_mismatch', 'valor diferente continua sendo recusa de divergência');
eq(amountReject(49.99, 50), 'amount_mismatch', 'centavo de diferença ainda recusa');
eq(amountReject(-5, 50), 'amount_unreadable', 'valor negativo é leitura quebrada, não divergência');
eq(amountReject(Number.NaN, 50), 'amount_unreadable', 'NaN é leitura quebrada');

eq(
  resolvePaidDate('', '', '2026-09'),
  { date: '', reject: 'date_unreadable' },
  'sem data e sem E2E: ilegível, não "mês errado"',
);
eq(
  resolvePaidDate('não sei', 'lixo', '2026-09'),
  { date: '', reject: 'date_unreadable' },
  'data em formato livre e E2E inválido: ilegível',
);
eq(
  resolvePaidDate('2026-08-30', '', '2026-09'),
  { date: '2026-08-30', reject: 'date_not_current_month' },
  'data legível de outro mês continua recusada como mês errado',
);

// ------------------------------------------------------- 3) precedência
//
// A data lida do comprovante manda; o E2E é rede de segurança, não substituto.
eq(
  resolvePaidDate('2026-09-02', E2E_DIGAO, '2026-09'),
  { date: '2026-09-02', reject: '' },
  'com data legível no print, ela é que vale',
);

// ------------------------------------------------------- 4) fuso na virada
//
// Um PIX das 22h de 30/09 em Brasília carimba 01/10 em UTC no E2E. Sem a
// conversão para BRT, ele cairia em outubro e seria recusado como "não é deste
// mês" no dia seguinte ao pagamento.
eq(dateFromE2e('E00000000202610010158ABCDEFGHIJK'), '2026-09-30', 'a virada de mês respeita o UTC-3');
eq(dateFromE2e('E00000000202609101000ABCDEFGHIJK'), '2026-09-10', 'meio do dia não vira a data');

// ------------------------------------------------------- 5) E2E que não serve
eq(dateFromE2e(''), '', 'E2E vazio não vira data');
eq(dateFromE2e('E0341978620260910'), '', 'E2E truncado antes da hora não vira data');
eq(dateFromE2e('X03419786202609100158IIMVEFW5KVF'), '', 'sem o "E" inicial não é E2E');
eq(dateFromE2e('E03419786202613100158IIMVEFW5KVF'), '', 'mês 13 não vira data');
eq(dateFromE2e('E03419786202602300158IIMVEFW5KVF'), '', '30 de fevereiro não vira 02 de março');
eq(dateFromE2e('E03419786202609102558IIMVEFW5KVF'), '', 'hora 25 não vira data');

// ------------------------------------------------------- 6) o app sabe explicar
//
// Recusa nova sem mensagem cai no texto genérico "Não consegui validar o
// comprovante" — que é o mesmo beco sem saída que a correção veio desfazer.
const app = readFileSync(new URL('../appfutebol_run/js/core/app.js', import.meta.url), 'utf8');
for (const motivo of ['amount_unreadable', 'date_unreadable']) {
  assert.match(app, new RegExp(`\\b${motivo}:`), `${motivo} precisa de mensagem em PIX_REJECT_MESSAGES`);
  n += 1;
}

console.log(`OK — ${n} asserções. Comprovante ilegível é recusa própria e o E2E cobre a data.`);
