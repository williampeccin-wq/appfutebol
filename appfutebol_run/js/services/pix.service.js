// Conciliação de mensalidade por PIX — lado cliente.
//
// O JOGADOR envia o próprio comprovante. O cliente só transporta a imagem para
// a Edge Function read-pix-receipt; TODA a validação e a gravação do mens_ok
// acontecem no servidor (a função é a autoridade — o jogador não pode forjar).

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

// Recebe a imagem como dataURL ("data:image/jpeg;base64,..."). Devolve o
// resultado estruturado da função: { ok, result, reason, extracted } ou
// { ok:false, error, reason }.
export async function submitPixReceipt(dataUrl) {
  const { url: base, anonKey } = getSupabase();
  if (!base || !anonKey) return { ok: false, reason: 'not_configured' };

  const token = getAccessToken();
  if (!token) return { ok: false, reason: 'not_logged_in' };

  const match = /^data:([^;]+);base64,(.*)$/s.exec(String(dataUrl || ''));
  if (!match) return { ok: false, reason: 'bad_image' };
  const mediaType = match[1];
  const imageBase64 = match[2];

  try {
    const response = await fetch(`${base}/functions/v1/read-pix-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ imageBase64, mediaType }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      return { ok: false, reason: data.error || `http_${response.status}` };
    }
    return data; // { ok:true, result:'marked'|'review'|'rejected', reason?, extracted }
  } catch (error) {
    console.warn('[pix] Falha ao enviar comprovante:', error);
    return { ok: false, reason: 'network' };
  }
}
