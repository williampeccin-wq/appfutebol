// Comprovante PIX sem passar pelo seletor de arquivo (v1.204.0).
//
// Dois caminhos novos levam a imagem ao app: o "Compartilhar" do Android
// (share_target no manifest → POST que o service worker intercepta) e o "Colar"
// (área de transferência, que é o que resta no iPhone). Os dois dependem de
// contratos que nenhum import amarra:
//
//   - manifest, service worker e módulo do app precisam concordar na rota, no
//     nome do campo e na chave do Cache Storage. O service worker é script
//     clássico, então as constantes existem duas vezes. Se um lado mudar
//     sozinho, o banco compartilha, o app abre e NADA acontece — sem erro.
//   - o service worker não pode voltar a interceptar o resto: o app depende do
//     "no-cache" do Cloudflare para servir sempre a versão nova.
//   - comprovante compartilhado e não entregue tem validade: não pode ser
//     enviado dias depois, do nada, no próximo login.
//
// Rodar: node tests/comprovante-compartilhado.regression.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

import {
  SHARED_RECEIPT_CACHE, SHARED_RECEIPT_KEY, SHARED_RECEIPT_STAMP_HEADER, SHARED_RECEIPT_PARAM,
  SHARED_RECEIPT_MAX_AGE_MS, isSharedReceiptFresh, pickClipboardImageType, takeSharedReceipt,
} from '../appfutebol_run/js/services/receipt-inbox.js';

const ler = (caminho) => readFileSync(new URL(`../appfutebol_run/${caminho}`, import.meta.url), 'utf8');
const manifest = JSON.parse(ler('manifest.webmanifest'));
const fonteSw = ler('service-worker.js');

// ------------------------------------------------- service worker de verdade
//
// Roda o arquivo que vai para produção num contexto com um Cache Storage de
// mentira, e devolve o listener de 'fetch' que ele registrou.

function criarCaches() {
  const lojas = new Map();
  return {
    lojas,
    async open(nome) {
      if (!lojas.has(nome)) lojas.set(nome, new Map());
      const loja = lojas.get(nome);
      return {
        async put(chave, resposta) { loja.set(chave, resposta); },
        async match(chave) { return loja.get(chave)?.clone(); },
        async delete(chave) { return loja.delete(chave); },
      };
    },
  };
}

function carregarSw() {
  const listeners = {};
  const caches = criarCaches();
  const self = {
    addEventListener: (tipo, fn) => { listeners[tipo] = fn; },
    skipWaiting() {}, clients: { claim() {} }, registration: {},
  };
  // Response.redirect do Node exige URL absoluta; o do navegador resolve a
  // relativa contra o escopo do SW. O dublê só registra para onde foi.
  class RespostaSw extends Response {
    static redirect(url, status) { return { redirecionouPara: url, status }; }
  }
  vm.runInNewContext(fonteSw, { self, caches, Response: RespostaSw, URL, Date, fetch: async () => new Response('') });
  return { fetchListener: listeners.fetch, caches };
}

function evento(request) {
  const ev = { request, resposta: undefined, respondWith(p) { ev.resposta = p; } };
  return ev;
}

function postCompartilhado(campo, arquivo) {
  const form = new FormData();
  form.append(campo, arquivo);
  return new Request(`https://app.exemplo${new URL(manifest.share_target.action, 'https://app.exemplo/').pathname}`, { method: 'POST', body: form });
}

const PRINT = () => new File([new Uint8Array([137, 80, 78, 71])], 'comprovante.png', { type: 'image/png' });

test('manifest: o app se oferece só para imagem, por POST multipart', () => {
  const alvo = manifest.share_target;
  assert.ok(alvo, 'manifest precisa de share_target');
  assert.equal(alvo.method, 'POST');
  assert.equal(alvo.enctype, 'multipart/form-data');
  assert.equal(alvo.params.files.length, 1);
  // O servidor (read-pix-receipt) só lê imagem. Aceitar PDF aqui faria o app
  // aparecer para um arquivo que ele vai recusar.
  assert.deepEqual(alvo.params.files[0].accept, ['image/*']);
  // Sem title/text/url: com eles o app apareceria ao compartilhar um link.
  assert.deepEqual(Object.keys(alvo.params), ['files']);
});

test('as constantes do service worker são as mesmas do módulo do app', () => {
  const noSw = (nome) => new RegExp(`const ${nome} = '([^']+)'`).exec(fonteSw)?.[1];
  assert.equal(noSw('SHARED_RECEIPT_CACHE'), SHARED_RECEIPT_CACHE);
  assert.equal(noSw('SHARED_RECEIPT_KEY'), SHARED_RECEIPT_KEY);
  assert.equal(noSw('SHARED_RECEIPT_STAMP_HEADER'), SHARED_RECEIPT_STAMP_HEADER);
  assert.equal(noSw('SHARE_RECEIPT_FIELD'), manifest.share_target.params.files[0].name);
  assert.equal(`.${noSw('SHARE_RECEIPT_PATH')}`, manifest.share_target.action);
});

test('service worker: guarda a imagem compartilhada e devolve o app', async () => {
  const { fetchListener, caches } = carregarSw();
  const ev = evento(postCompartilhado(manifest.share_target.params.files[0].name, PRINT()));
  fetchListener(ev);
  assert.ok(ev.resposta, 'o POST do compartilhamento tem que ser respondido pelo SW');
  const resposta = await ev.resposta;
  assert.equal(resposta.status, 303, '303 troca o POST por GET no redirect');
  assert.equal(resposta.redirecionouPara, `./?${SHARED_RECEIPT_PARAM}=compartilhado`);

  const guardado = caches.lojas.get(SHARED_RECEIPT_CACHE)?.get(SHARED_RECEIPT_KEY);
  assert.ok(guardado, 'a imagem tem que estar no cache combinado');
  assert.equal(guardado.headers.get('Content-Type'), 'image/png');
  assert.ok(isSharedReceiptFresh(guardado.headers.get(SHARED_RECEIPT_STAMP_HEADER)));
  assert.equal((await guardado.clone().blob()).size, 4);
});

test('service worker: o que não é imagem não entra na caixa', async () => {
  const { fetchListener, caches } = carregarSw();
  const pdf = new File(['%PDF'], 'comprovante.pdf', { type: 'application/pdf' });
  const ev = evento(postCompartilhado(manifest.share_target.params.files[0].name, pdf));
  fetchListener(ev);
  assert.equal((await ev.resposta).redirecionouPara, `./?${SHARED_RECEIPT_PARAM}=falhou`);
  assert.equal(caches.lojas.get(SHARED_RECEIPT_CACHE)?.size || 0, 0);
});

test('service worker: nada além do compartilhamento é interceptado', () => {
  const { fetchListener } = carregarSw();
  const intactos = [
    new Request('https://app.exemplo/'),
    new Request('https://app.exemplo/js/core/app.js'),
    new Request('https://app.exemplo/receber-comprovante'), // GET na rota: segue para a rede
    new Request('https://xyz.supabase.co/functions/v1/read-pix-receipt', { method: 'POST', body: '{}' }),
  ];
  for (const request of intactos) {
    const ev = evento(request);
    fetchListener(ev);
    assert.equal(ev.resposta, undefined, `${request.method} ${request.url} não pode passar pelo SW`);
  }
});

test('validade: comprovante parado na caixa não é enviado depois', () => {
  const agora = 1_800_000_000_000;
  assert.equal(isSharedReceiptFresh(String(agora - 1000), agora), true);
  assert.equal(isSharedReceiptFresh(String(agora - SHARED_RECEIPT_MAX_AGE_MS - 1), agora), false);
  assert.equal(isSharedReceiptFresh(String(agora + 60_000), agora), false, 'carimbo no futuro não vale');
  assert.equal(isSharedReceiptFresh(null, agora), false);
  assert.equal(isSharedReceiptFresh('abc', agora), false);
});

test('retirada: entrega uma vez só, e descarta o vencido', async (t) => {
  const caches = criarCaches();
  globalThis.caches = caches;
  t.after(() => { delete globalThis.caches; });
  const guardar = async (carimbo) => (await caches.open(SHARED_RECEIPT_CACHE)).put(
    SHARED_RECEIPT_KEY,
    new Response(PRINT(), { headers: { 'Content-Type': 'image/png', [SHARED_RECEIPT_STAMP_HEADER]: String(carimbo) } }),
  );
  const agora = Date.now();

  await guardar(agora);
  const blob = await takeSharedReceipt(agora);
  assert.equal(blob?.size, 4);
  assert.equal(await takeSharedReceipt(agora), null, 'a segunda retirada vem vazia');

  await guardar(agora - SHARED_RECEIPT_MAX_AGE_MS - 1);
  assert.equal(await takeSharedReceipt(agora), null, 'vencido não é entregue');
  assert.equal(caches.lojas.get(SHARED_RECEIPT_CACHE).size, 0, 'e mesmo assim sai da caixa');
});

test('colar: acha a imagem entre os tipos da área de transferência', () => {
  assert.equal(pickClipboardImageType(['text/plain', 'image/png']), 'image/png');
  assert.equal(pickClipboardImageType(['image/jpeg', 'image/png']), 'image/png');
  assert.equal(pickClipboardImageType(['text/html', 'image/jpeg']), 'image/jpeg');
  assert.equal(pickClipboardImageType(['text/plain']), null);
  assert.equal(pickClipboardImageType(undefined), null);
});
