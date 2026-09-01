// Lógica pura do rodízio de churrasco (sem DOM, sem fetch).
// Importada por app.js e testada diretamente.

// Sentinela do "Grupo": quando o número de integrantes do churrasco é ímpar,
// sobra alguém sem par. O admin escala o GRUPO (todo mundo) como dupla dessa
// pessoa em vez de deixá-la sozinha. Não é um jogador: é um id reservado que
// nunca colide com id real e atravessa rodízio, votação e ranking como se fosse
// o segundo integrante.
export const CARNE_GROUP_ID = '__grupo__';
export const CARNE_GROUP_NAME = 'Grupo';

export function isCarneGroupId(id) {
  return String(id ?? '') === CARNE_GROUP_ID;
}

export function carneGroupMember() {
  return { id: CARNE_GROUP_ID, name: CARNE_GROUP_NAME, is_carne_group: true };
}

export function carneDiffDays(aIso, bIso) {
  const noon = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`).getTime();
  return Math.round((noon(aIso) - noon(bIso)) / 86400000);
}

// Dupla responsável pelo churrasco de um jogo.
//
// scheduleEntries : carne_schedule já resolvidos e ordenados por data
//                   [{ date, player1_id, player2_id }, ...]
// rotation        : { start_date, pairs: [{ player1_id, player2_id }] }
// players         : array de jogadores do snapshot (para resolver nome)
// gameIso         : data do jogo no formato YYYY-MM-DD
//
// Prioridade: entrada datada (carne_schedule) exata > cálculo do rodízio.
export function getChurrascoDuo(scheduleEntries, rotation, players, gameIso) {
  if (!gameIso) return null;

  const findPlayer = (id) => {
    if (isCarneGroupId(id)) return carneGroupMember();
    return (players || []).find((p) => String(p.id) === String(id)) || { id, name: 'Jogador' };
  };

  const override = (scheduleEntries || [])
    .find((e) => String(e?.date || '').slice(0, 10) === gameIso);
  if (override) {
    const key = [String(override.player1_id), String(override.player2_id)].sort().join('|');
    return { player1: findPlayer(override.player1_id), player2: findPlayer(override.player2_id), key };
  }

  const pairs = Array.isArray(rotation?.pairs) ? rotation.pairs : [];
  const startIso = String(rotation?.start_date || '').slice(0, 10);
  if (!pairs.length || !startIso) return null;
  const week = Math.round(carneDiffDays(gameIso, startIso) / 7);
  const idx = ((week % pairs.length) + pairs.length) % pairs.length;
  const pair = pairs[idx];
  if (!pair) return null;
  const key = [String(pair.player1_id), String(pair.player2_id)].sort().join('|');
  return { player1: findPlayer(pair.player1_id), player2: findPlayer(pair.player2_id), key };
}
