// Service worker do Harmonia FC.
// IMPORTANTE: este SW NÃO intercepta fetch nem faz cache de assets — o app
// depende de "no-cache" (Cloudflare _headers) para sempre servir a versão nova.
// Ele existe apenas para PWA + Web Push (receber notificações e tratar o clique).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Recibo de auditoria: avisa o servidor que a mensagem foi entregue/aberta.
// Best-effort — nunca quebra a notificação se a rede falhar. O anon key (público)
// vem no payload porque o gateway do Supabase exige credencial mesmo nesta rota.
function sendPushReceipt(receiptUrl, anonKey, logId, type) {
  if (!receiptUrl || !logId) return Promise.resolve();
  const headers = { 'Content-Type': 'application/json' };
  if (anonKey) {
    headers.apikey = anonKey;
    headers.Authorization = `Bearer ${anonKey}`;
  }
  return fetch(receiptUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ receipt: { logId, type } }),
    keepalive: true,
  }).catch(() => {});
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Harmonia FC';
  const options = {
    body: payload.body || '',
    icon: payload.icon || './assets/harmonia-crest.jpeg',
    badge: './assets/harmonia-crest.jpeg',
    tag: payload.tag || undefined,
    // Carrega referências de auditoria para o clique.
    data: { url: payload.url || './', logId: payload.logId || null, receiptUrl: payload.receiptUrl || null, anonKey: payload.anonKey || null },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      sendPushReceipt(payload.receiptUrl, payload.anonKey, payload.logId, 'delivered'),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  const targetUrl = info.url || './';

  event.waitUntil(
    Promise.all([
      sendPushReceipt(info.receiptUrl, info.anonKey, info.logId, 'opened'),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        return undefined;
      }),
    ])
  );
});
