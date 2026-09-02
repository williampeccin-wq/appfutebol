// LOG DE ATIVIDADE — TEMPORÁRIO (piloto de testadores).
//
// Objetivo: enxergar a movimentação dos testers — quem abre o app, com que
// frequência, e se navega entre as abas. NÃO é auditoria completa nem permanente.
//
// ⚠️ REMOVER ANTES DO GO-LIVE NA LOJA. Ver memória convocados-activity-log-temp.
//   Para remover: apagar este arquivo, as chamadas em app.js e a tabela
//   public.activity_log (DROP no final do SQL de criação).
//
// Regras de arquitetura (deliberadas):
// - Tabela GRANULAR separada (public.activity_log), NUNCA o blob de estado —
//   o blob é único e brigaria com a máquina de concorrência/anti-apagão.
// - Fire-and-forget: qualquer falha é engolida; jamais bloqueia ou quebra a UI.
// - Só loga usuário logado e ações significativas (nada no poll de 6s / render).
// - Throttle no "app_open" (5 min) para não inflar com foreground repetido.
// - Desliga sem redeploy: window.HARMONIA_ACTIVITY_LOG = false no console.

import { getCurrentClubId } from './storage.supabase.js';

const OPEN_THROTTLE_MS = 5 * 60 * 1000;

let lastOpenAt = 0;
let lastTab = null;
let lastPlayer = null;
let lastVersion = null;
let visibilityHooked = false;

// ORIGEM DA SESSÃO. Numa TWA o conteúdo é o mesmo do site, então até aqui o log
// não distinguia "app instalado pela Play" de "aba do Chrome" — e o Google só
// conta o primeiro. O referrer da carga inicial é 'android-app://<pacote>'
// quando a origem é a TWA; guardamos no load porque navegação interna o perde.
const LAUNCH_REFERRER = (() => { try { return String(document.referrer || ''); } catch (_) { return ''; } })();
const IS_TWA = LAUNCH_REFERRER.startsWith('android-app://');

// VERSÃO DO APP ANDROID INSTALADO. getInstalledRelatedApps() só responde com
// related_applications declarado no manifest e assetlinks válido; existe apenas
// no Chromium. Resolve uma vez e fica em cache — se vier vazio, seguimos com o
// IS_TWA, que já responde a pergunta principal.
let androidVersion = null;
const androidVersionReady = (async () => {
  try {
    if (!navigator.getInstalledRelatedApps) return;
    const apps = await navigator.getInstalledRelatedApps();
    const play = (apps || []).find((a) => a && a.platform === 'play');
    if (play) androidVersion = String(play.version || 'instalado');
  } catch (_) {}
})();

function enabled() {
  return window.HARMONIA_ACTIVITY_LOG !== false; // default LIGADO
}

function getSupabase() {
  const cfg = window.HARMONIA_SUPABASE || {};
  return { url: String(cfg.url || '').replace(/\/+$/, ''), anonKey: cfg.anonKey || '' };
}

function getToken() {
  try {
    return JSON.parse(localStorage.getItem('harmonia_auth_session') || 'null')?.access_token || null;
  } catch (_) {
    return null;
  }
}

function post(action, player, detail) {
  try {
    if (!enabled()) return;
    const { url, anonKey } = getSupabase();
    if (!url || !anonKey) return;
    const token = getToken();
    if (!token) return; // só usuário logado
    const body = {
      club_id: getCurrentClubId() || null,
      player_id: player ? String(player.id) : null,
      name: player ? (player.name || null) : null,
      action: String(action || '').slice(0, 40),
      detail: detail || null,
    };
    fetch(`${url}/rest/v1/activity_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      keepalive: true, // sobrevive ao fechar a aba
    }).catch(() => {});
  } catch (_) {
    // nunca quebra a UI
  }
}

// Instala uma vez o listener de foreground (PWA reaberto sem recarregar a página).
function hookVisibility() {
  if (visibilityHooked) return;
  visibilityHooked = true;
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastOpenAt < OPEN_THROTTLE_MS) return;
      lastOpenAt = now;
      post('app_open', lastPlayer, { source: 'foreground', v: lastVersion, twa: IS_TWA, av: androidVersion });
    });
  } catch (_) {}
}

// "Abriu o app" — carga inicial e cada retorno ao foreground (throttle 5 min).
export async function logAppOpen(player, version) {
  if (player) lastPlayer = player;
  if (version) lastVersion = String(version).replace(/^v/, '').split('-')[0]; // "1.170.0"
  hookVisibility();
  const now = Date.now();
  if (now - lastOpenAt < OPEN_THROTTLE_MS) return;
  lastOpenAt = now;
  // Espera a consulta da versão instalada antes de gravar: sem isso o primeiro
  // app_open do dia sairia sem o dado, que é justamente o que interessa.
  await androidVersionReady;
  post('app_open', player, { source: 'load', v: lastVersion, twa: IS_TWA, av: androidVersion });
}

// Troca de aba (só quando muda de fato).
export function logTab(player, tab) {
  if (player) lastPlayer = player;
  if (!tab || tab === lastTab) return;
  lastTab = tab;
  post('tab', player, { tab });
}

// Ações dos roteiros de teste fechado.
export function logPresenceConfirmed(player) { post('presence_confirmed', player, null); }
export function logPresenceCancelled(player) { post('presence_cancelled', player, null); }
export function logTeamDraw(player, detail)  { post('team_draw',          player, detail || null); }
export function logPlayerAdded(player, detail){ post('player_added',       player, detail || null); }
export function logPaymentToggled(player, detail){ post('payment_toggled', player, detail || null); }
export function logPlayerDeleted(player, detail){ post('player_deleted',   player, detail || null); }

// Ativação de notificações. O push_subscriptions só guarda quem ACEITOU; estes
// eventos guardam também quem recusou/desistiu e quem desligou depois — que é
// justamente quem precisa de ajuda.
export function logPushEnabled(player, detail)  { post('push_enabled',  player, detail || null); }
export function logPushDenied(player, detail)   { post('push_denied',   player, detail || null); }
export function logPushDisabled(player, detail) { post('push_disabled', player, detail || null); }

// Duração REAL da sessão, em segundos com o app em foco, mais o número de
// interações. É o que separa quem usou de quem abriu e fechou.
export function logSession(player, detail) { post('session', player, detail || null); }
