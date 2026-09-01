// MEDIDOR DE SESSÃO DO TESTADOR — TEMPORÁRIO (teste fechado).
//
// Faz duas coisas diferentes, e vale não confundir:
//   1) MOSTRA ao testador quanto tempo ele está de fato usando, com meta de
//      4 minutos e um cutucão quando fica parado. É a aposta comportamental.
//   2) REGISTRA a duração real e o número de interações no activity_log. É a
//      auditoria: serve mesmo que a aposta não pague, porque separa quem usou
//      de quem abriu e fechou — independentemente do que a pessoa diga.
//
// Só roda no CLUBE DE TESTE. Usuário real jamais vê instrumento de teste.
// ⚠️ REMOVER junto com o activity-log antes do go-live na loja.

import { logSession } from './activity-log.js';

const CLUBE_TESTE = 'e2af269c-20d0-4739-b7db-80ed93165192';
const META_SECS   = 240;  // 4 minutos
const IDLE_SECS   = 20;   // sem tocar em nada = cutucão
const MIN_LOG     = 5;    // não polui o log com sessões de 2 segundos

let root = null, fill = null, timeEl = null, nudgeEl = null;
let focusSecs = 0;      // segundos com o app EM FOCO (não aba aberta esquecida)
let loggedSecs = 0;     // já registrado no banco — evita contar duas vezes
let acoes = 0;
let lastActionAt = Date.now();
let tickId = null;
let player = null;

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function paint() {
  if (!root) return;
  const pct = Math.min(100, Math.round((focusSecs / META_SECS) * 100));
  fill.style.width = `${pct}%`;
  const bateu = focusSecs >= META_SECS;
  root.classList.toggle('is-done', bateu);
  timeEl.textContent = bateu
    ? `Meta cumprida · ${fmt(focusSecs)}`
    : `${fmt(focusSecs)} de ${fmt(META_SECS)}`;

  const parado = Math.floor((Date.now() - lastActionAt) / 1000);
  const mostrarCutucao = !bateu && parado >= IDLE_SECS;
  nudgeEl.style.display = mostrarCutucao ? '' : 'none';
  if (mostrarCutucao) nudgeEl.textContent = `Parado há ${parado}s — toque em algo para continuar`;
}

function tick() {
  if (document.visibilityState !== 'visible') return;
  focusSecs += 1;
  paint();
}

function markAction() {
  acoes += 1;
  lastActionAt = Date.now();
  paint();
}

// Grava o que ainda não foi gravado. Chamado ao sair do foco e ao fechar.
function flush() {
  const delta = focusSecs - loggedSecs;
  if (delta < MIN_LOG) return;
  loggedSecs = focusSecs;
  logSession(player, { secs: delta, total: focusSecs, acoes, meta: focusSecs >= META_SECS });
}

function mount() {
  root = document.createElement('div');
  root.className = 'tester-meter';
  root.innerHTML = `
    <div class="tester-meter-row">
      <span class="tester-meter-label">Teste</span>
      <span class="tester-meter-time"></span>
    </div>
    <div class="tester-meter-bar"><span class="tester-meter-fill"></span></div>
    <p class="tester-meter-nudge" style="display:none;"></p>
  `;
  document.body.appendChild(root);
  fill   = root.querySelector('.tester-meter-fill');
  timeEl = root.querySelector('.tester-meter-time');
  nudgeEl = root.querySelector('.tester-meter-nudge');
}

export function startTesterMeter(currentPlayer, clubId) {
  if (root) return;                                  // já montado
  if (String(clubId || '') !== CLUBE_TESTE) return;  // só no clube de teste
  player = currentPlayer;

  mount();
  paint();
  tickId = setInterval(tick, 1000);

  // Interação real = toque ou tecla. Scroll não conta: dá para rolar a tela
  // sem usar o app, e é justamente esse tipo de "atividade" que engana.
  ['pointerdown', 'keydown'].forEach((evt) =>
    document.addEventListener(evt, markAction, { passive: true, capture: true }));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { lastActionAt = Date.now(); paint(); }
    else flush();
  });
  window.addEventListener('pagehide', flush);
}
