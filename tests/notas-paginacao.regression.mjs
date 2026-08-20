// Regressão do ACHADO 20/08 (auditoria da votação): a leitura de notas trazia a
// tabela inteira sem paginação, e o PostgREST corta a resposta no teto de linhas
// do projeto (db-max-rows) SEM erro e SEM aviso. O cliente recebia um pedaço e
// calculava a média como se fosse tudo.
//
// Não é cosmético: essas médias alimentam buildStrengthResolver, que equilibra
// os times no sorteio. Truncar = time desequilibrado e "melhor votado" errado,
// sem nada quebrar na tela. Quando o achado foi medido, a tabela tinha 992
// linhas — oito abaixo do teto padrão de 1000, ou seja, uma cédula de distância.
//
// Rodar: node tests/notas-paginacao.regression.mjs

import assert from 'node:assert/strict';

// ---------------------------------------------------------------- servidor falso

// Servidor que se comporta como o PostgREST: respeita Range e NUNCA devolve mais
// que `teto` linhas de uma vez — mesmo que peçam mais.
function instalarFetch({ total, teto = 1000, ignoraRange = false }) {
  const todas = Array.from({ length: total }, (_, i) => ({
    kind: 'desempenho',
    game_key: `game_${i % 10}`,
    target_id: `p${i}`,
    score: (i % 10) + 1,
  }));
  const chamadas = [];

  globalThis.fetch = async (alvo, options = {}) => {
    chamadas.push(String(options?.headers?.Range || 'sem-range'));
    const range = String(options?.headers?.Range || '');
    const casa = range.match(/^(\d+)-(\d+)$/);
    const de = (casa && !ignoraRange) ? Number(casa[1]) : 0;
    const ate = (casa && !ignoraRange) ? Number(casa[2]) : teto - 1;
    const fatia = todas.slice(de, Math.min(ate + 1, de + teto));
    return {
      ok: true,
      status: fatia.length < total ? 206 : 200,
      json: async () => fatia,
    };
  };

  return { chamadas, todas };
}

globalThis.window = {
  HARMONIA_SUPABASE: { enabled: true, url: 'https://exemplo-teste.supabase.co', anonKey: 'anon-teste' },
};
globalThis.localStorage = {
  getItem: () => JSON.stringify({ access_token: 'token-teste', user: { id: 'u1' } }),
  setItem: () => {},
  removeItem: () => {},
};

const { fetchRatings } = await import('../appfutebol_run/js/services/ratings.service.js');

// ---------------------------------------------------------------- cenário 1
//
// O caso exato do achado: mais linhas do que o teto do projeto. Antes da
// correção vinham 1000 e o resto sumia em silêncio.

instalarFetch({ total: 2350, teto: 1000 });
const r1 = await fetchRatings({});

assert.equal(r1.ok, true, 'a leitura deveria funcionar');
assert.equal(r1.rows.length, 2350, 'todas as linhas precisam chegar, não só a primeira página');
assert.equal(r1.rows[0].target_id, 'p0', 'a primeira linha tem de ser a primeira do servidor');
assert.equal(r1.rows[2349].target_id, 'p2349', 'a última linha tem de ser a última do servidor');
assert.equal(new Set(r1.rows.map((r) => r.target_id)).size, 2350, 'nenhuma linha pode vir duplicada');

// ---------------------------------------------------------------- cenário 2
//
// Abaixo do teto: uma requisição só, sem páginas extras. Uma correção de
// paginação que passa a fazer três chamadas onde bastava uma é custo escondido.

const alvo2 = instalarFetch({ total: 400, teto: 1000 });
const r2 = await fetchRatings({});

assert.equal(r2.rows.length, 400, 'todas as linhas do conjunto pequeno');
assert.equal(alvo2.chamadas.length, 1, 'conjunto abaixo do teto deve custar UMA requisição');

// ---------------------------------------------------------------- cenário 3
//
// Exatamente no teto: o caso de fronteira que engana. A primeira página vem
// cheia, então é preciso pedir a próxima para descobrir que acabou.

const alvo3 = instalarFetch({ total: 1000, teto: 1000 });
const r3 = await fetchRatings({});

assert.equal(r3.rows.length, 1000, 'total igual ao teto não pode perder nem ganhar linha');
assert.equal(alvo3.chamadas.length, 2, 'página cheia exige uma confirmação de que acabou');

// ---------------------------------------------------------------- cenário 4
//
// Servidor que IGNORA o Range (proxy no meio, configuração estranha). Sem uma
// trava, o laço repetiria a primeira página até o teto de páginas e devolveria
// 50 mil linhas duplicadas — pior que truncar, porque envenena a média.

const alvo4 = instalarFetch({ total: 2350, teto: 1000, ignoraRange: true });
const r4 = await fetchRatings({});

assert.equal(r4.ok, true, 'mesmo com Range ignorado a leitura não pode explodir');
assert.equal(r4.rows.length, 1000, 'para na primeira página repetida em vez de acumular duplicatas');
assert.ok(alvo4.chamadas.length <= 2, 'não pode martelar o servidor 50 vezes');
assert.equal(new Set(r4.rows.map((r) => r.target_id)).size, 1000, 'nada duplicado no resultado');

console.log('OK — 12 asserções em 4 cenários. A leitura de notas não trunca em silêncio nem duplica.');
