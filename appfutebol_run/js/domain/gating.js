// Gating Free × Pro no CLIENTE — cadeados e upsell.
//
// IMPORTANTE: isto é só a UI. A AUTORIDADE é o servidor (as Edge Functions e a
// RLS conferem clubs.plan). Aqui a gente só ESCONDE o que é Pro e CONVIDA a
// assinar — nunca confie nisto pra segurança.

import { getClubInfo } from '../services/storage.supabase.js';

export const PRO_PRICE = 'R$ 39,90/mês';

// Número de WhatsApp para contato comercial (formato internacional, sem +).
const WHATSAPP_NUMBER = '5548991520230';

const PRO_FEATURES = [
  '🤖 PIX automático com IA — zero conferência manual',
  '📊 Financeiro completo — demonstrativo e relatórios',
  '🏆 Campeonato, Rei da Quadra e histórico completo',
  '🎯 Sorteio inteligente equilibrado pelas notas dos jogadores',
  '🔔 Lembrete automático de mensalidade em atraso',
  '👥 Membros ilimitados e múltiplos administradores',
];

// O app do Google Play pode MOSTRAR que o Pro existe, mas não pode levar
// ninguém para pagar fora do Play. A política de pagamentos proíbe
// "in-app webviews, buttons, links, messaging (...) or other calls to action"
// que levem a outro meio de pagamento, e o FAQ dela abre a exceção que a gente
// usa: app "consumption-only" pode dar "additional information about purchasing
// options WITHOUT DIRECT LINKS" — o exemplo do próprio Google é "Go to our
// website to upgrade your subscription to Premium".
//
// Fora do app a regra não vale ("Outside of your app, you are free to
// communicate with your users about alternative purchase options"), e o
// convocados.app.br aberto no navegador é fora do app. Como o MESMO código
// serve os dois, a decisão é em tempo de execução.
//
// FALHA PARA O LADO SEGURO: só devolve true quando dá para afirmar que é aba de
// navegador. Na dúvida — matchMedia ausente, exceção, display-mode que não
// conheço — não mostra link.
export function linkExternoPermitido(win = (typeof window !== 'undefined' ? window : null)) {
  try {
    if (!win) return false;
    // TWA do Play: a página é aberta pelo app Android e o referrer entrega isso.
    if (String(win.document?.referrer || '').startsWith('android-app://')) return false;
    // PWA instalada no iOS.
    if (win.navigator?.standalone === true) return false;
    if (typeof win.matchMedia !== 'function') return false;
    return win.matchMedia('(display-mode: browser)').matches === true;
  } catch (_) {
    return false;
  }
}

export function showProUpsellModal() {
  if (document.querySelector('.pro-upsell-overlay')) return;

  const msg = encodeURIComponent('Olá, quero contratar o Plano Pro do Convocados para o meu clube 🏆');
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
  const podeLinkar = linkExternoPermitido();
  const chamada = podeLinkar
    ? `<a class="btn btn-primary pro-upsell-whatsapp" href="${waUrl}" target="_blank" rel="noopener noreferrer">
        💬 Falar no WhatsApp para contratar
      </a>`
    : `<p class="pro-upsell-fora">O Plano Pro é contratado fora do app, no site
        <strong>convocados.app.br</strong>.</p>`;

  const overlay = document.createElement('div');
  overlay.className = 'confirm-modal-overlay pro-upsell-overlay';
  overlay.innerHTML = `
    <div class="confirm-modal pro-upsell-modal" role="dialog" aria-modal="true" aria-label="Plano Pro">
      <div class="pro-upsell-header">
        <div class="pro-lock-badge">⭐ Plano Pro</div>
        <button type="button" class="pro-upsell-close" aria-label="Fechar">✕</button>
      </div>
      <div class="pro-upsell-price">${PRO_PRICE} <span class="pro-upsell-sub">por clube</span></div>
      <ul class="pro-upsell-features">
        ${PRO_FEATURES.map(f => `<li>${f}</li>`).join('')}
      </ul>
      ${chamada}
      <button type="button" class="btn btn-secondary pro-upsell-dismiss">${podeLinkar ? 'Agora não' : 'Fechar'}</button>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
    if (e.target.closest('.pro-upsell-close, .pro-upsell-dismiss')) close();
  });

  document.body.appendChild(overlay);
  overlay.querySelector('.pro-upsell-close').focus();
}

// Plano Pro? Desconhecido (info do clube ainda carregando) => NÃO trava, pra não
// piscar cadeado; o servidor barra de qualquer forma. Só trava quando é 'free'.
export function isPro() {
  const info = getClubInfo();
  if (!info || !info.plan) return true;
  return String(info.plan) === 'pro';
}

// Cartão de upsell reutilizável (HTML), mostrado no lugar do recurso Pro travado.
export function renderProLock({ title, benefit }) {
  return `
    <section class="section-stack">
      <section class="card pro-lock">
        <div class="pro-lock-badge">🔒 Recurso Pro</div>
        <div class="card-title">${title}</div>
        <p class="footer-note pro-lock-benefit">${benefit}</p>
        <div class="pro-lock-cta">
          <button class="btn btn-primary btn-sm" type="button" data-action="pro-upsell" data-feature="${title}">Saiba mais</button>
        </div>
      </section>
    </section>
  `;
}

// Faixa/cadeado inline menor, pra encaixar dentro de uma tela já existente
// (ex.: um botão Pro no meio do Config), sem tomar a tela inteira.
export function renderProLockInline({ title, benefit }) {
  return `
    <div class="pro-lock pro-lock-inline">
      <div class="pro-lock-badge">🔒 Pro</div>
      <div>
        <div class="row-title">${title}</div>
        <div class="row-subtitle">${benefit}</div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" data-action="pro-upsell" data-feature="${title}">Saiba mais</button>
    </div>
  `;
}
