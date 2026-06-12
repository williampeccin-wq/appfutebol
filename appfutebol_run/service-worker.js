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
    data: { url: payload.url || './' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
