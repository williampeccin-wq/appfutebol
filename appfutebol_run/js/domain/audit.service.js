// Auditoria de integridade dos dados (determinística, read-only).
// Roda sobre o snapshot e devolve uma lista de "achados" para o admin revisar.
// NÃO escreve nada. Foco: pegar cedo o que já causou incidentes reais
// (apagão do carnê, contas duplicadas) + higiene geral.

import { isCarneGroupId, CARNE_GROUP_NAME } from './carne.js';

function normName(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function nameById(players, id) {
  if (isCarneGroupId(id)) return CARNE_GROUP_NAME;
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
    // O "Grupo" não é jogador: escalado como par de quem sobra num rodízio
    // ímpar, ele é um id reservado e não conta como dupla órfã nem repetida.
    const idConhecido = (id) => isCarneGroupId(id) || validIds.has(String(id));
    const orphanPairs = pairs.filter((p) =>
      !idConhecido(p?.player1_id) || !idConhecido(p?.player2_id));
    if (orphanPairs.length) {
      findings.push(finding('high', `${orphanPairs.length} dupla(s) do carnê com jogador inexistente`,
        'Há dupla(s) apontando para jogador removido. Edite o rodízio para corrigir.'));
    }
    const seen = new Map();
    for (const p of pairs) {
      for (const id of [p?.player1_id, p?.player2_id]) {
        if (!id || isCarneGroupId(id)) continue;
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

  // 5) Configuração que falha em SILÊNCIO -------------------------------------
  const settings = (snapshot.settings && typeof snapshot.settings === 'object') ? snapshot.settings : {};

  // 5a) Janela de votação de desempenho = 0 → o aviso/modal de desempenho nunca abre.
  const perfHours = Number(settings.ratings_perf_window_hours) || 0;
  if (perfHours <= 0) {
    findings.push(finding('info', 'Votação de desempenho desligada (janela = 0)',
      'Defina a janela em Config → Votação para o aviso e o modal de notas abrirem após o jogo.'));
  }

  // 5b) Comprovantes PIX aguardando revisão do admin.
  const pixReview = players.filter((p) => p && (p.mens_review || p.data?.mens_review));
  if (pixReview.length) {
    findings.push(finding('warn', `${pixReview.length} comprovante(s) PIX aguardando revisão`,
      `Enviados sem ID E2E legível: ${pixReview.map((p) => p.name || `#${p.id}`).slice(0, 8).join(', ')}. Revise o pagamento.`));
  }

  // 5c) PIX em uso, mas sem valor/beneficiário no Config → conciliação falha calada.
  const pixInUse = pixReview.length || players.some((p) => p && (p.mens_payment || p.data?.mens_payment));
  if (pixInUse && (!settings.mens_amount || !String(settings.mens_beneficiary || '').trim())) {
    findings.push(finding('warn', 'PIX sem valor/beneficiário configurado',
      'A conciliação por comprovante não marca como pago sem o valor e o beneficiário definidos no Config.'));
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
