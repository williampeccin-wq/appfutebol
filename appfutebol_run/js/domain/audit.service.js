// Auditoria de integridade dos dados (determinística, read-only).
// Roda sobre o snapshot e devolve uma lista de "achados" para o admin revisar.
// NÃO escreve nada. Foco: pegar cedo o que já causou incidentes reais
// (apagão do carnê, contas duplicadas) + higiene geral.

function normName(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function nameById(players, id) {
  const p = (players || []).find((x) => String(x.id) === String(id));
  return p?.name || `#${id}`;
}

// level: 'high' | 'warn' | 'info'
function finding(level, title, detail = '') {
  return { level, title, detail };
}

export function runIntegrityAudit(snapshot = {}) {
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const carne = Array.isArray(snapshot.carne) ? snapshot.carne : [];
  const games = Array.isArray(snapshot.games) ? snapshot.games : [];
  const confirmations = Array.isArray(snapshot.confirmations) ? snapshot.confirmations : [];
  const game = snapshot.game || null;
  const validIds = new Set(players.map((p) => String(p.id)));
  const findings = [];

  // 1) Rodízio do carnê -------------------------------------------------------
  const rotation = carne.find((e) => e && e.type === 'carne_rotation');
  const pairs = Array.isArray(rotation?.pairs) ? rotation.pairs : [];
  if (!rotation || pairs.length === 0) {
    findings.push(finding('high', 'Rodízio do carnê vazio',
      'Nenhuma dupla no rodízio. Pode indicar perda de dados (apagão) — confira a aba Carne.'));
  } else {
    const orphanPairs = pairs.filter((p) =>
      !validIds.has(String(p?.player1_id)) || !validIds.has(String(p?.player2_id)));
    if (orphanPairs.length) {
      findings.push(finding('high', `${orphanPairs.length} dupla(s) do carnê com jogador inexistente`,
        'Há dupla(s) apontando para jogador removido. Edite o rodízio para corrigir.'));
    }
    const seen = new Map();
    for (const p of pairs) {
      for (const id of [p?.player1_id, p?.player2_id]) {
        if (!id) continue;
        seen.set(String(id), (seen.get(String(id)) || 0) + 1);
      }
    }
    const repeated = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => nameById(players, id));
    if (repeated.length) {
      findings.push(finding('warn', 'Jogador repetido no rodízio do carnê',
        `Aparece em mais de uma dupla: ${repeated.join(', ')}.`));
    }
  }

  // 2) Contas duplicadas ------------------------------------------------------
  const byPhone = new Map();
  const byName = new Map();
  for (const p of players) {
    const ph = digits(p.phone);
    if (ph) byPhone.set(ph, [...(byPhone.get(ph) || []), p.name || `#${p.id}`]);
    const nm = normName(p.name);
    if (nm) byName.set(nm, [...(byName.get(nm) || []), p.id]);
  }
  for (const [ph, names] of byPhone) {
    if (names.length > 1) {
      findings.push(finding('high', 'Telefone duplicado',
        `Mesmo telefone (${ph}) em: ${names.join(', ')}. Login pode colidir.`));
    }
  }
  for (const [nm, ids] of byName) {
    if (ids.length > 1) {
      findings.push(finding('warn', 'Nome duplicado (possível conta repetida)',
        `${ids.length} contas com o nome "${nm}". Conferir qual é a ativa (ex.: histórico/votação casam por nome).`));
    }
  }

  // 3) Acesso de login --------------------------------------------------------
  const semAcesso = players
    .filter((p) => p && p.role !== 'carne' && p.plays_football !== false && !p.auth_user_id)
    .map((p) => p.name || `#${p.id}`);
  if (semAcesso.length) {
    findings.push(finding('info', `${semAcesso.length} jogador(es) sem acesso de login`,
      `Sem credencial criada: ${semAcesso.slice(0, 8).join(', ')}${semAcesso.length > 8 ? '…' : ''}. Use "Criar acesso" se precisarem entrar.`));
  }

  // 4) Jogo ativo -------------------------------------------------------------
  const activeKey = String(game?.game_key || snapshot.active_game_id || '');
  if (activeKey) {
    const orphanConf = confirmations
      .filter((c) => c && c.confirmed && String(c.game_key || '') === activeKey && !validIds.has(String(c.player_id)));
    if (orphanConf.length) {
      findings.push(finding('warn', `${orphanConf.length} confirmação(ões) órfã(s) no jogo ativo`,
        'Confirmações de jogador que não existe mais.'));
    }
    const max = Number(game?.max_players || 0);
    const lineConfirmed = confirmations.filter((c) => c && c.confirmed && String(c.game_key || '') === activeKey
      && !(c.goalkeeper === true || c.segment === 'goalkeeper' || c.presence_role === 'goalkeeper')).length;
    const guests = Array.isArray(game?.guest_players) ? game.guest_players.length : 0;
    if (max > 0 && (lineConfirmed + guests) > max) {
      findings.push(finding('warn', 'Jogo acima do limite de linha',
        `${lineConfirmed} confirmados + ${guests} convidado(s) > ${max} vagas.`));
    }
  }
  if (snapshot.active_game_id && games.length
    && !games.some((g) => String(g.game_key || g.id) === String(snapshot.active_game_id))) {
    findings.push(finding('warn', 'Jogo ativo inconsistente',
      'O jogo marcado como ativo não está na lista de jogos.'));
  }

  const order = { high: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  return {
    findings,
    high: findings.filter((f) => f.level === 'high').length,
    warn: findings.filter((f) => f.level === 'warn').length,
    info: findings.filter((f) => f.level === 'info').length,
  };
}
