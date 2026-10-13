// PRESENÇA AUTOMÁTICA — "todo mundo dentro, quem não vai avisa"
//
// Há grupo que funciona ao contrário do Harmonia: o jogo abre e os fixos JÁ
// estão confirmados; quem não vai marca "fora". É o `presence.mode = 'opt_out'`
// do perfil do clube. O padrão continua 'opt_in' (cada um confirma a sua).
//
// A ideia é não inventar um segundo tipo de presença: abrir o jogo GRAVA
// confirmações comuns para quem é fixo. Contagem, fila, promoção da fila,
// sorteio e churrasco seguem funcionando com o que já existe — e "não vou" é o
// cancelamento de sempre.
//
// ESTE ARQUIVO TEM UMA CÓPIA IDÊNTICA em
// `supabase/functions/auto-open-games/presenca-automatica.js`.
// O jogo abre por dois caminhos — o admin, no app, e o cron, no servidor — e os
// dois precisam decidir IGUAL quem entra. Edge Function não importa de fora da
// própria pasta, então o arquivo é copiado e `tests/presenca-automatica.regression.mjs`
// exige que as duas cópias sejam iguais byte a byte. Mexeu aqui: copie para lá.
//
// Por isso este arquivo NÃO IMPORTA NADA. Os predicados abaixo repetem os de
// authz.js, rules.engine.js e confirmations.js, e o mesmo teste exige que
// concordem com os originais, jogador a jogador. Regra de mensalidade em dois
// lugares já divergiu uma vez nesta base ("16/16 → 14/16").

function ehAdmin(player) {
  const v = player?.is_admin;
  if (v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true') return true;
  const legado = player?.data?.is_admin;
  return legado === true || legado === 1 || legado === '1' || String(legado).toLowerCase() === 'true';
}

// authz.isCarneOnly
export function soChurrasco(player) {
  if (!player) return false;
  if (player.plays_football === false) return true;
  if (ehAdmin(player)) return false;
  return player.role === 'carne' || player?.data?.role === 'carne';
}

// confirmations.isGoalkeeperPlayer
export function ehGoleiro(player) {
  const pos = String(player?.position || '').trim().toLowerCase();
  return pos === 'gol' || pos === 'goleiro';
}

// authz.isMensalidadeExempt
export function isentoDeMensalidade(player) {
  if (soChurrasco(player)) return true;
  return ehGoleiro(player) && player?.gk_pays !== true;
}

// Em atraso de verdade: só DEPOIS do vencimento, só quem é EXPLICITAMENTE
// inadimplente (mens_ok === false) e nunca o isento. É o miolo comum de
// shouldBlockPresenceForFinance e cedeVezNaFilaPorMensalidade.
export function emAtraso(player, settings, hoje) {
  if (!player) return false;
  if (isentoDeMensalidade(player)) return false;
  const vencimento = String(settings?.mens_expire_date || '').slice(0, 10);
  if (!vencimento) return false;
  return player.mens_ok === false && String(hoje) > vencimento;
}

// rules.engine.shouldBlockPresenceForFinance — modo 'partial' e 'total' barram
// a confirmação de quem está em atraso; 'none' nunca barra.
export function bloqueadoPorMensalidade(player, settings, hoje) {
  const modo = String(settings?.mens_enforcement_mode || '').toLowerCase();
  if (modo !== 'partial' && modo !== 'total') return false;
  return emAtraso(player, settings, hoje);
}

// confirmations.isConfirmedEntry
function entradaConfirmada(entry) {
  if (!entry) return false;
  if (entry.confirmed === false) return false;
  const status = String(entry.status || '').trim().toLowerCase();
  if (status) return status === 'confirmed';
  return entry.confirmed === true;
}

// confirmations.isWaitlistEntry
function entradaNaFila(entry) {
  if (!entry) return false;
  const status = String(entry.status || '').trim().toLowerCase();
  return entry.confirmed !== true && (status === 'waitlist' || status === 'waitlisted');
}

function entradaDeGoleiro(entry, player) {
  if (entry?.goalkeeper === true) return true;
  if (entry?.segment === 'goalkeeper') return true;
  if (entry?.presence_role === 'goalkeeper') return true;
  return ehGoleiro(player);
}

function convidadoGoleiro(guest) {
  const pos = String(guest?.position || '').toLowerCase();
  return pos === 'gol' || pos === 'goleiro';
}

/** O clube usa presença automática? Lê o perfil cru (app_meta.data.profile). */
export function presencaAutomaticaLigada(profile) {
  return String(profile?.presence?.mode || '') === 'opt_out';
}

/**
 * Por que este jogador NÃO entra sozinho — ou null se ele é fixo.
 * "Avulso" é quem o admin desmarcou em "Entra automaticamente nos jogos".
 */
export function motivoDeNaoEntrar(player, settings, hoje) {
  if (!player) return 'desconhecido';
  if (player.pending === true) return 'pendente';
  if (player.left_team === true) return 'saiu';
  if (player.deleted === true || player.active === false) return 'inativo';
  if (player.status === 'inactive') return 'inativo';
  if (soChurrasco(player)) return 'nao_joga';
  if (player.auto_presenca === false) return 'avulso';
  if (bloqueadoPorMensalidade(player, settings, hoje)) return 'mensalidade';
  return null;
}

// Ordem de cadastro: não existe "entrou no clube em" no jogador. Vale o
// created_at quando houver; senão o carimbo embutido no id (`p_<ms>`, de quem
// o admin cadastrou); senão vai para o fim. O desempate é nome e id, sem
// localeCompare — servidor e aparelho precisam ordenar igual.
function ordemDeCadastro(player) {
  const criado = Date.parse(String(player?.created_at || ''));
  if (Number.isFinite(criado)) return criado;
  const noId = /^p_(\d{10,})$/.exec(String(player?.id || ''));
  return noId ? Number(noId[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Quem entra, quem vai para a fila e quem fica de fora ao abrir o jogo.
 *
 *  - NUNCA mexe em quem já tem resposta neste jogo (qualquer status): quem
 *    marcou "não vou" não volta, e rodar duas vezes não muda nada.
 *  - Linha entra até `max_players` (contando convidados e quem já estava); o
 *    resto vai para a fila. Sem limite (0), entram todos.
 *  - Quando sobra gente: em dia primeiro (se o clube usa a preferência na fila),
 *    depois o cadastro mais antigo.
 *  - Goleiro tem teto próprio e não tem fila: quem passa do teto fica de fora.
 *
 * `hoje` (YYYY-MM-DD) é injetado: o cron roda em UTC e o clube vive em BRT.
 */
export function planejarPresencaAutomatica({ players, game, settings, confirmations, tetoGoleiros, hoje }) {
  const gameKey = String(game?.game_key || game?.id || '');
  const jogadores = Array.isArray(players) ? players : [];
  const porId = new Map(jogadores.map((p) => [String(p.id), p]));
  const doJogo = (Array.isArray(confirmations) ? confirmations : [])
    .filter((entry) => String(entry?.game_key || '') === gameKey);
  const jaRespondeu = new Set(doJogo.map((entry) => String(entry.player_id)));

  let linhaOcupada = 0;
  let golOcupado = 0;
  let filaAtual = 0;
  for (const entry of doJogo) {
    if (entradaNaFila(entry)) { filaAtual += 1; continue; }
    if (!entradaConfirmada(entry)) continue;
    if (entradaDeGoleiro(entry, porId.get(String(entry.player_id)))) golOcupado += 1;
    else linhaOcupada += 1;
  }
  const convidados = Array.isArray(game?.guest_players) ? game.guest_players : [];
  linhaOcupada += convidados.filter((g) => !convidadoGoleiro(g)).length;
  golOcupado += convidados.filter(convidadoGoleiro).length;
  golOcupado += Array.isArray(game?.rental_goalkeepers) ? game.rental_goalkeepers.length : 0;

  const fora = [];
  const candidatos = [];
  for (const player of jogadores) {
    const id = String(player.id);
    if (jaRespondeu.has(id)) { fora.push({ id, motivo: 'ja_respondeu' }); continue; }
    const motivo = motivoDeNaoEntrar(player, settings, hoje);
    if (motivo) { fora.push({ id, motivo }); continue; }
    candidatos.push(player);
  }

  const prefereEmDia = settings?.fila_prioriza_em_dia === true;
  const chave = (player) => [
    prefereEmDia && emAtraso(player, settings, hoje) ? 1 : 0,
    ordemDeCadastro(player),
    String(player.name || '').toLowerCase(),
    String(player.id),
  ];
  const ordenados = [...candidatos].sort((a, b) => {
    const ka = chave(a);
    const kb = chave(b);
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });

  const max = Number(game?.max_players || 0);
  const semLimite = !(max > 0);
  const teto = Number(tetoGoleiros);
  const semTetoDeGoleiro = !(teto > 0);

  const linha = [];
  const goleiros = [];
  const fila = [];
  for (const player of ordenados) {
    const id = String(player.id);
    if (ehGoleiro(player)) {
      if (semTetoDeGoleiro || golOcupado + goleiros.length < teto) goleiros.push(id);
      else fora.push({ id, motivo: 'teto_goleiros' });
      continue;
    }
    if (semLimite || linhaOcupada + linha.length < max) linha.push(id);
    else fila.push(id);
  }

  return {
    gameKey,
    linha,
    goleiros,
    fila,
    fora,
    filaAnterior: filaAtual,
    fixos: candidatos.length,
    vagas: semLimite ? null : Math.max(max - linhaOcupada, 0),
  };
}

/**
 * As confirmações que o plano gera, no formato do estado do app
 * (`state.confirmations`). `auto: true` marca que ninguém tocou em nada — some
 * quando a pessoa confirma por conta própria.
 */
export function entradasDaPresencaAutomatica(plano, agora) {
  const base = Date.parse(agora);
  const comum = { game_key: plano.gameKey, removed_by_admin: false, auto: true };
  const dentro = (id, goleiro) => ({
    ...comum,
    player_id: id,
    confirmed: true,
    status: 'confirmed',
    confirmed_at: agora,
    cancelled_at: null,
    waitlisted_at: null,
    waitlist_position: null,
    timestamp: agora,
    ...(goleiro ? { goalkeeper: true, segment: 'goalkeeper', presence_role: 'goalkeeper' } : {}),
  });
  // A fila é ordenada por `waitlisted_at`: um milissegundo por posição preserva
  // a ordem do plano e deixa os novos depois de quem já esperava.
  const naFila = (id, i) => {
    const quando = new Date(base + i + 1).toISOString();
    return {
      ...comum,
      player_id: id,
      confirmed: false,
      status: 'waitlist',
      confirmed_at: null,
      cancelled_at: null,
      waitlisted_at: quando,
      waitlist_position: plano.filaAnterior + i + 1,
      timestamp: quando,
    };
  };
  return [
    ...plano.linha.map((id) => dentro(id, false)),
    ...plano.goleiros.map((id) => dentro(id, true)),
    ...plano.fila.map(naFila),
  ];
}

/**
 * A mesma entrada como LINHA de `presence_confirmations` — o que o cron grava.
 * Espelha `presencePayloadFromConfirmation` (storage.supabase.js), inclusive a
 * esquisitice que o leitor espera: fila vai com status 'cancelled' na coluna e
 * 'waitlist' dentro de `data`.
 */
export function linhaDoBanco(entrada, agora, clubId = null) {
  const naFila = entrada.status === 'waitlist';
  return {
    game_key: entrada.game_key,
    player_id: String(entrada.player_id),
    status: naFila ? 'cancelled' : 'confirmed',
    confirmed_at: entrada.confirmed_at,
    cancelled_at: null,
    removed_by_admin: false,
    created_by_auth_user_id: null,
    data: { ...entrada, source: 'presence_confirmations_auto_open', actor_auth_user_id: null },
    updated_at: agora,
    ...(clubId ? { club_id: clubId } : {}),
  };
}

/**
 * Abre o jogo no estado do app: devolve o jogo carimbado e as confirmações com
 * os fixos dentro. O carimbo `auto_confirmed_at` garante uma vez só — fechar e
 * reabrir não põe de volta quem saiu nem puxa quem chegou depois.
 */
export function abrirComPresencaAutomatica({ players, game, settings, confirmations, tetoGoleiros, hoje, agora }) {
  const lista = Array.isArray(confirmations) ? confirmations : [];
  if (game?.auto_confirmed_at) return { game, confirmations: lista, plano: null };
  const plano = planejarPresencaAutomatica({ players, game, settings, confirmations: lista, tetoGoleiros, hoje });
  return {
    game: { ...game, presence_mode: 'opt_out', auto_confirmed_at: agora },
    confirmations: [...lista, ...entradasDaPresencaAutomatica(plano, agora)],
    plano,
  };
}
