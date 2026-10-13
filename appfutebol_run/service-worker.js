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

// Handler de fetch MÍNIMO (pass-through): NÃO faz cache nem intercepta nada — a
// rede resolve normalmente, preservando o "no-cache" do Cloudflare (sempre a
// versão nova). Existe só porque o Chrome exige um listener de 'fetch' registrado
// para oferecer "Instalar app" (critério de instalabilidade do PWA, sobretudo em
// versões mais antigas do Chrome). Sem event.respondWith(), o navegador faz o
// fetch padrão — comportamento idêntico ao de não ter handler, só que instalável.
//
// A ÚNICA exceção é o comprovante PIX compartilhado (share_target do manifest):
// o app do banco manda a imagem num POST para ./receber-comprovante, rota que
// não existe no servidor. Só esse POST é respondido aqui; todo o resto segue
// sem respondWith().
const SHARE_RECEIPT_PATH = '/receber-comprovante';
const SHARE_RECEIPT_FIELD = 'comprovante';
// ATENÇÃO: os três valores abaixo existem IGUAIS em js/services/receipt-inbox.js
// (este arquivo é script clássico e não importa módulo). O teste
// tests/comprovante-compartilhado.regression.mjs quebra se um lado mudar sozinho.
const SHARED_RECEIPT_CACHE = 'comprovante-compartilhado-v1';
const SHARED_RECEIPT_KEY = './__comprovante-compartilhado__';
const SHARED_RECEIPT_STAMP_HEADER = 'X-Compartilhado-Em';

// Guarda a imagem no Cache Storage e devolve o app. Quem lê, valida a idade e
// envia é o app (receipt-inbox.js) — aqui não há sessão nem regra de negócio.
// O redirect é 303 para o navegador trocar o POST por GET.
async function receiveSharedReceipt(request) {
  let outcome = 'falhou';
  try {
    const form = await request.formData();
    const file = form.getAll(SHARE_RECEIPT_FIELD).find((entry) => entry && typeof entry !== 'string' && entry.size > 0);
    if (file && String(file.type || '').startsWith('image/')) {
      const cache = await caches.open(SHARED_RECEIPT_CACHE);
      await cache.put(SHARED_RECEIPT_KEY, new Response(file, {
        headers: { 'Content-Type': file.type, [SHARED_RECEIPT_STAMP_HEADER]: String(Date.now()) },
      }));
      outcome = 'compartilhado';
    }
  } catch (_) { /* cai no aviso de falha dentro do app */ }
  return Response.redirect(`./?comprovante=${outcome}`, 303);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'POST') return;
  if (!new URL(request.url).pathname.endsWith(SHARE_RECEIPT_PATH)) return;
  event.respondWith(receiveSharedReceipt(request));
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

  const title = payload.title || 'Convocados';
  const options = {
    body: payload.body || '',
    icon: payload.icon || './img/convocados-crest.png',
    badge: './img/convocados-crest.png',
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
