// Gating Free × Pro no CLIENTE — cadeados e upsell.
//
// IMPORTANTE: isto é só a UI. A AUTORIDADE é o servidor (as Edge Functions e a
// RLS conferem clubs.plan). Aqui a gente só ESCONDE o que é Pro e CONVIDA a
// assinar — nunca confie nisto pra segurança.

import { getClubInfo } from '../services/storage.supabase.js';

export const PRO_PRICE = 'R$ 39,90/mês';

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
          <span class="pro-lock-price">${PRO_PRICE}</span>
          <button class="btn btn-primary btn-sm" type="button" data-action="pro-upsell" data-feature="${title}">Assinar o Pro</button>
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
      <button class="btn btn-secondary btn-sm" type="button" data-action="pro-upsell" data-feature="${title}">${PRO_PRICE}</button>
    </div>
  `;
}
