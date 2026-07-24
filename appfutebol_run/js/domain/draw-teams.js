// TIMES DO SORTEIO — leitura e escrita em N times
//
// O sorteio nasceu com exatamente dois times, gravados como `team_a` e
// `team_b`. Isso não é um número: é o SHAPE do dado, espalhado por 7 arquivos e
// por tudo que já está gravado no banco. Clube que joga com 3 times em rodízio
// não cabe nesse formato.
//
// ESTRATÉGIA: `teams` (array de arrays) passa a ser a verdade. Nada lê o par
// `team_a`/`team_b` diretamente — tudo passa por `timesDoSorteio()`, que
// projeta o formato antigo no novo. Na escrita, gravamos os DOIS: `teams` com a
// verdade completa e `team_a`/`team_b` com os dois primeiros, para que um
// cliente rodando código velho (PWA com service worker em cache) continue
// mostrando algo coerente em vez de uma tela vazia.
//
// Os dois primeiros times NUNCA mudam de posição, então um sorteio de 2 times
// lido por código velho é idêntico ao que era.

export const ROTULOS_DE_TIME = ['A', 'B', 'C', 'D', 'E', 'F'];

export function rotuloDoTime(indice) {
  return ROTULOS_DE_TIME[indice] || String(indice + 1);
}

/**
 * Times de um sorteio, SEMPRE como array de arrays.
 *
 * Aceita os dois formatos e devolve um só. As entradas continuam cruas — id
 * (string) para jogador cadastrado, objeto para convidado/goleiro de aluguel,
 * que não têm id persistente. Quem consome resolve como precisar.
 */
export function timesDoSorteio(draw) {
  if (!draw || typeof draw !== 'object') return [];

  if (Array.isArray(draw.teams)) {
    return draw.teams.map((time) => (Array.isArray(time) ? time : []));
  }

  // Formato legado. Só devolve o segundo time se ele existir, para um sorteio
  // pela metade não virar "2 times, um vazio".
  const times = [Array.isArray(draw.team_a) ? draw.team_a : []];
  if (Array.isArray(draw.team_b)) times.push(draw.team_b);
  return times;
}

/** Quantos times este sorteio tem de fato. */
export function quantidadeDeTimes(draw) {
  return timesDoSorteio(draw).length;
}

/** Total de jogadores no sorteio, somando todos os times. */
export function totalDeJogadores(draw) {
  return timesDoSorteio(draw).reduce((soma, time) => soma + time.length, 0);
}

/**
 * Devolve o sorteio com os times informados, gravando nos DOIS formatos.
 *
 * `team_a`/`team_b` continuam preenchidos com os dois primeiros times: é o que
 * mantém código antigo funcionando durante a transição. Com um time só,
 * `team_b` vira `[]` em vez de sumir — o formato legado sempre teve os dois
 * campos, e código velho faria `.length` neles sem checar.
 */
export function comTimes(draw, listas) {
  const times = (Array.isArray(listas) ? listas : []).map((time) => (Array.isArray(time) ? time : []));
  return {
    ...(draw || {}),
    teams: times,
    team_a: times[0] || [],
    team_b: times[1] || [],
  };
}

/** Id de uma entrada do sorteio (convidado/goleiro vêm como objeto). */
export function idDaEntrada(entrada) {
  return (entrada && typeof entrada === 'object') ? entrada.id : entrada;
}

/**
 * Em qual time (índice) está o jogador, ou -1. Comparação por id, para
 * funcionar tanto com entradas-string quanto com entradas-objeto.
 */
export function timeDoJogador(draw, playerId) {
  const alvo = String(playerId);
  return timesDoSorteio(draw).findIndex((time) =>
    time.some((entrada) => String(idDaEntrada(entrada)) === alvo));
}

/** Remove o jogador de todos os times, preservando o número de times. */
export function semJogador(draw, playerId) {
  const alvo = String(playerId);
  return comTimes(draw, timesDoSorteio(draw).map((time) =>
    time.filter((entrada) => String(idDaEntrada(entrada)) !== alvo)));
}
