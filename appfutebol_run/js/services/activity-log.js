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
let visibilityHooked = false;

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
      post('app_open', lastPlayer, { source: 'foreground' });
    });
  } catch (_) {}
}

// "Abriu o app" — carga inicial e cada retorno ao foreground (throttle 5 min).
export function logAppOpen(player) {
  if (player) lastPlayer = player;
  hookVisibility();
  const now = Date.now();
  if (now - lastOpenAt < OPEN_THROTTLE_MS) return;
  lastOpenAt = now;
  post('app_open', player, { source: 'load' });
}

// Troca de aba (só quando muda de fato).
export function logTab(player, tab) {
  if (player) lastPlayer = player;
  if (!tab || tab === lastTab) return;
  lastTab = tab;
  post('tab', player, { tab });
}
