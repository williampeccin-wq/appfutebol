// FONTE ÚNICA DE VERDADE PARA CONFIRMAÇÕES
//
// Antes deste módulo existiam 3 contadores diferentes de "confirmados"
// (banner do topo, buildGameView e renderHome), cada um com regra própria
// de campo (confirmed vs status), escopo de jogo (game_key) e inclusão de
// goleiro/carne. Eles divergiam entre si e em relação ao banco.
//
// Aqui centralizamos UMA regra, alinhada ao leitor do Supabase
// (confirmationFromPresenceRow), para que todas as telas mostrem o mesmo
// número e ele bata com o banco.

// Reconciliação canônica de "confirmado".
// Espelha exatamente o leitor do Supabase: se houver status, ele manda;
// senão, cai no booleano `confirmed`.
export function isConfirmedEntry(entry) {
  if (!entry) return false;
  // Cancelamento explícito vence um `status` defasado: se a entrada diz
  // confirmed===false (ex.: resíduo de sync com status='confirmed' antigo), o
  // jogador NÃO está confirmado. Sem isso a Home contava quem já cancelou.
  if (entry.confirmed === false) return false;
  const status = String(entry.status || '').trim().toLowerCase();
  if (status) return status === 'confirmed';
  return entry.confirmed === true;
}

export function isWaitlistEntry(entry) {
  if (!entry) return false;
  const status = String(entry.status || '').trim().toLowerCase();
  return entry.confirmed !== true && (status === 'waitlist' || status === 'waitlisted');
}

// Escopo de jogo canônico: ESTRITO. A entrada pertence ao jogo `gameKey`
// somente quando seu próprio game_key é igual. Entradas sem game_key NÃO
// vazam para o jogo ativo — isso é o que impede confirmações de um jogo
// aparecerem em outro (um jogo novo nasce com zero confirmados).
export function belongsToGame(entry, gameKey) {
  return String((entry && entry.game_key) || '') === String(gameKey || '');
}

export function isGoalkeeperPlayer(player) {
  const raw = String((player && player.position) || '').trim().toLowerCase();
  return raw === 'gol' || raw === 'goleiro';
}

export function isGoalkeeperEntry(entry, player) {
  if (!entry) return false;
  if (entry.goalkeeper === true) return true;
  if (entry.segment === 'goalkeeper') return true;
  return isGoalkeeperPlayer(player);
}

// Um jogador de LINHA é aquele que joga futebol e não é "carne".
function playsAsLine(player) {
  if (!player) return false;
  if (player.plays_football === false) return false;
  if (player.role === 'carne') return false;
  return true;
}

// Classificador único. Recebe o estado e a chave do jogo já resolvida e
// devolve listas e contagens consistentes para TODAS as telas.
export function classifyGameConfirmations(state, gameKey) {
  const players = Array.isArray(state && state.players) ? state.players : [];
  const playersById = new Map(players.map((p) => [String(p.id), p]));
  const confirmations = Array.isArray(state && state.confirmations) ? state.confirmations : [];

  const scoped = confirmations.filter((entry) => belongsToGame(entry, gameKey));

  const linePlayerIds = [];
  const goalkeeperIds = [];
  const waitlistIds = [];

  scoped.forEach((entry) => {
    const player = playersById.get(String(entry.player_id)) || null;

    if (isConfirmedEntry(entry)) {
      if (isGoalkeeperEntry(entry, player)) {
        if (player) goalkeeperIds.push(String(entry.player_id));
      } else if (playsAsLine(player)) {
        linePlayerIds.push(String(entry.player_id));
      }
      return;
    }

    if (isWaitlistEntry(entry)) {
      if (player) waitlistIds.push(String(entry.player_id));
    }
  });

  // Ordena fila de espera por horário (mais antigo primeiro).
  const waitlistOrdered = scoped
    .filter((entry) => isWaitlistEntry(entry) && playersById.has(String(entry.player_id)))
    .sort((a, b) =>
      String(a.waitlisted_at || a.timestamp || '').localeCompare(String(b.waitlisted_at || b.timestamp || ''))
    )
    .map((entry) => String(entry.player_id));

  return {
    linePlayerIds,
    goalkeeperIds,
    waitlistPlayerIds: waitlistOrdered.length ? waitlistOrdered : waitlistIds,
    lineCount: linePlayerIds.length,
    goalkeeperCount: goalkeeperIds.length,
    waitlistCount: (waitlistOrdered.length ? waitlistOrdered : waitlistIds).length,
  };
}
