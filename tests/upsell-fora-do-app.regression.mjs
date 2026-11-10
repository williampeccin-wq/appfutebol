// Dentro do app do Google Play, o upsell do Pro não pode ter link que leve a
// pagar fora. A política de pagamentos proíbe "buttons, links, messaging (...)
// or other calls to action" que levem a outro meio de pagamento; o FAQ permite
// "additional information about purchasing options WITHOUT direct links".
//
// Fora do app — convocados.app.br numa aba de navegador — o link é permitido e
// é por onde a venda acontece. O mesmo código serve os dois, então quem decide
// é linkExternoPermitido(), em tempo de execução.
//
// O risco que estes testes guardam é a DÚVIDA: se a detecção não souber onde
// está, tem de responder "não pode". Um falso positivo vira link do WhatsApp
// dentro do app do Play, que é exatamente o que reprova.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import { linkExternoPermitido } from '../appfutebol_run/js/domain/gating.js';

// Janela de mentira: só o que a função olha.
function janela({ referrer = '', standalone = undefined, displayMode = 'browser', semMatchMedia = false, explode = false } = {}) {
  return {
    document: { referrer },
    navigator: standalone === undefined ? {} : { standalone },
    matchMedia: semMatchMedia ? undefined : (query) => {
      if (explode) throw new Error('matchMedia indisponível');
      return { matches: query === `(display-mode: ${displayMode})` };
    },
  };
}

// ------------------------------------------------------- pode mostrar o link

assert.equal(
  linkExternoPermitido(janela({ displayMode: 'browser' })),
  true,
  'aba de navegador comum: o link do WhatsApp é permitido',
);

// ------------------------------------------------------ NÃO pode mostrar

assert.equal(
  linkExternoPermitido(janela({ referrer: 'android-app://br.app.convocados.android/', displayMode: 'browser' })),
  false,
  'TWA do Play: referrer android-app:// manda, mesmo com display-mode browser',
);

assert.equal(
  linkExternoPermitido(janela({ displayMode: 'standalone' })),
  false,
  'PWA instalada (standalone): sem link',
);

assert.equal(
  linkExternoPermitido(janela({ displayMode: 'fullscreen' })),
  false,
  'display-mode que não é browser: sem link',
);

assert.equal(
  linkExternoPermitido(janela({ standalone: true, displayMode: 'browser' })),
  false,
  'PWA no iOS (navigator.standalone): sem link',
);

// --------------------------------------------------- na dúvida, não mostra

assert.equal(
  linkExternoPermitido(janela({ semMatchMedia: true })),
  false,
  'sem matchMedia não dá para afirmar nada: sem link',
);

assert.equal(
  linkExternoPermitido(janela({ explode: true })),
  false,
  'matchMedia que estoura: sem link',
);

assert.equal(linkExternoPermitido(null), false, 'sem window: sem link');
assert.equal(linkExternoPermitido(undefined), false, 'window indefinida: sem link');
assert.equal(linkExternoPermitido({}), false, 'objeto vazio: sem link');

console.log('ok — upsell-fora-do-app');
