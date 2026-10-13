// Caixa de entrada do comprovante PIX — os dois caminhos pelos quais a imagem
// chega ao app SEM o jogador passar pelo seletor de arquivo:
//
//   1. Compartilhar (Android): o app aparece na folha de compartilhamento do
//      banco (share_target no manifest). O POST cai no service worker, que
//      guarda a imagem no Cache Storage e redireciona para o app. Aqui a gente
//      só retira o que ele guardou.
//   2. Colar (iPhone e o resto): o iOS não deixa PWA entrar na folha de
//      compartilhamento, então o caminho curto lá é "Copiar" no banco e
//      "Colar comprovante" aqui.
//
// Este módulo só ENTREGA a imagem. Validar e gravar continua sendo do servidor
// (read-pix-receipt), pelo mesmo submitPixReceipt de sempre.

// ATENÇÃO: os três valores abaixo existem IGUAIS no service-worker.js, que é
// script clássico e não importa módulo. tests/comprovante-compartilhado
// .regression.mjs quebra se um lado mudar sem o outro.
export const SHARED_RECEIPT_CACHE = 'comprovante-compartilhado-v1';
export const SHARED_RECEIPT_KEY = './__comprovante-compartilhado__';
export const SHARED_RECEIPT_STAMP_HEADER = 'X-Compartilhado-Em';

// Parâmetro que o service worker põe na URL ao redirecionar. Serve só para dar
// retorno a quem compartilhou — a imagem em si viaja pelo Cache Storage.
export const SHARED_RECEIPT_PARAM = 'comprovante';

// Comprovante compartilhado e nunca entregue (a pessoa não entrou na conta, por
// exemplo) não pode ser enviado dias depois, do nada, no próximo login.
export const SHARED_RECEIPT_MAX_AGE_MS = 15 * 60 * 1000;

export function isSharedReceiptFresh(stamp, now = Date.now()) {
  const sharedAt = Number(stamp);
  if (!Number.isFinite(sharedAt) || sharedAt <= 0) return false;
  const age = now - sharedAt;
  return age >= 0 && age <= SHARED_RECEIPT_MAX_AGE_MS;
}

// 'compartilhado' | 'falhou' | null — e limpa a URL, para um F5 não repetir o aviso.
export function readSharedReceiptFlag() {
  try {
    const url = new URL(window.location.href);
    const flag = url.searchParams.get(SHARED_RECEIPT_PARAM);
    if (!flag) return null;
    url.searchParams.delete(SHARED_RECEIPT_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return flag;
  } catch (_) {
    return null;
  }
}

export async function hasSharedReceipt() {
  try {
    if (typeof caches === 'undefined') return false;
    const cache = await caches.open(SHARED_RECEIPT_CACHE);
    return !!(await cache.match(SHARED_RECEIPT_KEY));
  } catch (_) {
    return false;
  }
}

// Retira o comprovante guardado pelo service worker. Devolve o Blob, ou null se
// não havia nada ou se ele já passou da validade. Em qualquer caso a caixa fica
// vazia: o mesmo comprovante nunca é entregue duas vezes.
export async function takeSharedReceipt(now = Date.now()) {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open(SHARED_RECEIPT_CACHE);
    const response = await cache.match(SHARED_RECEIPT_KEY);
    if (!response) return null;
    await cache.delete(SHARED_RECEIPT_KEY);
    if (!isSharedReceiptFresh(response.headers.get(SHARED_RECEIPT_STAMP_HEADER), now)) return null;
    const blob = await response.blob();
    return blob && blob.size > 0 ? blob : null;
  } catch (error) {
    console.warn('[pix] Falha ao retirar o comprovante compartilhado:', error);
    return null;
  }
}

export function isClipboardImageSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';
}

// Primeiro tipo de imagem entre os itens da área de transferência, ou null.
// PNG na frente: é o que os bancos copiam e o que o Safari sempre oferece.
export function pickClipboardImageType(types) {
  const list = Array.from(types || []).map(String);
  if (list.includes('image/png')) return 'image/png';
  return list.find((type) => type.startsWith('image/')) || null;
}

// Lê a imagem copiada. Devolve { ok:true, blob } ou { ok:false, reason } com
// reason em 'unsupported' | 'empty' | 'denied'. Precisa ser chamado dentro do
// toque do usuário — o iPhone mostra o balão "Colar" e só libera depois dele.
export async function readClipboardImage() {
  if (!isClipboardImageSupported()) return { ok: false, reason: 'unsupported' };
  let items;
  try {
    items = await navigator.clipboard.read();
  } catch (error) {
    // NotAllowedError cobre os dois casos: permissão negada e balão "Colar"
    // dispensado. Área de transferência vazia cai aqui em alguns navegadores
    // (DataError / NotFoundError), e aí a instrução certa é outra.
    const name = String(error?.name || '');
    return { ok: false, reason: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'empty' };
  }
  for (const item of items || []) {
    const type = pickClipboardImageType(item.types);
    if (!type) continue;
    try {
      const blob = await item.getType(type);
      if (blob && blob.size > 0) return { ok: true, blob };
    } catch (_) { /* tenta o próximo item */ }
  }
  return { ok: false, reason: 'empty' };
}
