// Web Push (PWA) — registro do service worker, permissão, inscrição e envio da
// inscrição para o Supabase (tabela push_subscriptions).
//
// iOS: push só funciona com o app "Adicionado à Tela de Início" (instalado como
// PWA). No Safari em aba normal, isPushSupported() pode ser true mas a inscrição
// falha — tratamos o erro e orientamos o usuário na UI.

import { VAPID_PUBLIC_KEY } from '../config/push.config.js';

function getSupabase() {
  const cfg = window.HARMONIA_SUPABASE || {};
  return { url: String(cfg.url || '').replace(/\/+$/, ''), anonKey: cfg.anonKey || '', enabled: !!cfg.enabled };
}

function getAccessToken() {
  try {
    return JSON.parse(localStorage.getItem('harmonia_auth_session') || 'null')?.access_token || null;
  } catch (_) {
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported() {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof window !== 'undefined'
    && 'PushManager' in window
    && 'Notification' in window;
}

// Heurística de iOS fora do modo "instalado" (standalone): push não vai funcionar.
export function isIosNeedsInstall() {
  const ua = String(navigator.userAgent || '');
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
  return isIos && !standalone;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('./service-worker.js');
  } catch (error) {
    console.warn('[push] Falha ao registrar service worker:', error);
    return null;
  }
}

export async function getPushState() {
  if (!isPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false, iosNeedsInstall: isIosNeedsInstall() };
  }
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    subscribed = !!sub;
  } catch (_) {}
  return {
    supported: true,
    permission: Notification.permission,
    subscribed,
    iosNeedsInstall: isIosNeedsInstall(),
  };
}

async function saveSubscriptionToServer(playerId, subscription) {
  const { url, anonKey } = getSupabase();
  if (!url || !anonKey) return { ok: false, reason: 'supabase_not_configured' };
  const token = getAccessToken();
  const json = subscription.toJSON();
  const headers = {
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
  };
  // Grava via Edge Function register-push (service_role): resolve o dono
  // (auth_user_id) e o player_id pelo JWT e faz upsert por endpoint. Assim a
  // troca de usuário no mesmo aparelho recarimba o dono certo — o que o
  // INSERT+PATCH direto não conseguia sob a RLS por dono (PATCH falhava calado).
  try {
    const resp = await fetch(`${url}/functions/v1/register-push`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh || '',
        auth: json.keys?.auth || '',
        user_agent: String(navigator.userAgent || '').slice(0, 300),
      }),
    });
    const out = await resp.json().catch(() => ({}));
    if (resp.ok && out.ok) return { ok: true };
    return { ok: false, reason: out.error || `save_failed_${resp.status}` };
  } catch (error) {
    return { ok: false, reason: 'network' };
  }
}

// Re-salva a inscrição existente do navegador no servidor (idempotente). Chamado
// no boot para curar o caso "inscrito no navegador mas não salvo no banco".
export async function syncExistingPushSubscription(playerId) {
  try {
    if (!isPushSupported() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await saveSubscriptionToServer(playerId, sub);
  } catch (_) {}
}

export async function enablePush(playerId) {
  if (!isPushSupported()) {
    return { ok: false, reason: isIosNeedsInstall() ? 'ios_needs_install' : 'unsupported' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: permission === 'denied' ? 'denied' : 'dismissed' };
  }

  try {
    const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const subscription = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const saved = await saveSubscriptionToServer(playerId, subscription);
    if (!saved.ok) return { ok: false, reason: saved.reason };
    return { ok: true };
  } catch (error) {
    console.warn('[push] Falha ao inscrever para push:', error);
    return { ok: false, reason: isIosNeedsInstall() ? 'ios_needs_install' : 'subscribe_failed' };
  }
}

// Dispara o envio de push pelo servidor (Edge Function send-push). Chamado por
// ações de admin (ex.: abrir inscrições). Best-effort: nunca bloqueia a UI.
export async function triggerServerPush({ target = 'all', title, body, url = './' }) {
  const { url: base, anonKey } = getSupabase();
  if (!base || !anonKey) return { ok: false, reason: 'not_configured' };
  const token = getAccessToken();
  try {
    const response = await fetch(`${base}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${token || anonKey}`,
      },
      body: JSON.stringify({ target, title, body, url }),
    });
    if (!response.ok) return { ok: false, reason: `push_${response.status}` };
    return { ok: true, data: await response.json().catch(() => ({})) };
  } catch (error) {
    console.warn('[push] Falha ao disparar push:', error);
    return { ok: false, reason: 'network' };
  }
}

// Avisa quem entrou no jogo ao sair da fila (Edge Function
// notify-waitlist-promotion). Best-effort: o servidor verifica no banco que a
// pessoa está mesmo confirmada e deduplica por (jogo + jogador), então pode ser
// chamado de qualquer cliente sem risco de push duplicado.
export async function triggerWaitlistPromotion(gameKey, playerIds) {
  const ids = (Array.isArray(playerIds) ? playerIds : [playerIds]).map((id) => String(id || '')).filter(Boolean);
  if (!ids.length) return { ok: false, reason: 'no_players' };
  const { url: base, anonKey } = getSupabase();
  if (!base || !anonKey) return { ok: false, reason: 'not_configured' };
  const token = getAccessToken();
  try {
    const response = await fetch(`${base}/functions/v1/notify-waitlist-promotion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${token || anonKey}`,
      },
      body: JSON.stringify({ game_key: String(gameKey || ''), player_ids: ids }),
    });
    if (!response.ok) return { ok: false, reason: `promotion_${response.status}` };
    return { ok: true, data: await response.json().catch(() => ({})) };
  } catch (error) {
    console.warn('[push] Falha ao avisar promoção da fila:', error);
    return { ok: false, reason: 'network' };
  }
}

// Dispara o lembrete de mensalidade atrasada agora (Edge Function
// send-overdue-reminders). Uso: botão de teste do admin. `force: true` ignora a
// deduplicação do dia, para permitir reenvio durante o teste.
export async function triggerOverdueReminders() {
  const { url: base, anonKey } = getSupabase();
  if (!base || !anonKey) return { ok: false, reason: 'not_configured' };
  const token = getAccessToken();
  try {
    const response = await fetch(`${base}/functions/v1/send-overdue-reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${token || anonKey}`,
      },
      body: JSON.stringify({ force: true }),
    });
    if (!response.ok) return { ok: false, reason: `reminders_${response.status}` };
    return { ok: true, data: await response.json().catch(() => ({})) };
  } catch (error) {
    console.warn('[push] Falha ao disparar lembretes de atraso:', error);
    return { ok: false, reason: 'network' };
  }
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      // Remoção best-effort no servidor.
      const { url, anonKey } = getSupabase();
      const token = getAccessToken();
      if (url && anonKey) {
        fetch(`${url}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
          method: 'DELETE',
          headers: { apikey: anonKey, Authorization: `Bearer ${token || anonKey}` },
        }).catch(() => {});
      }
    }
    return { ok: true };
  } catch (error) {
    console.warn('[push] Falha ao desinscrever:', error);
    return { ok: false };
  }
}
