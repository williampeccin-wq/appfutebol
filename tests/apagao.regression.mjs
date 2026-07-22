// Teste de regressão do APAGÃO — a classe de bug que mais custou caro neste
// projeto (perda do blob de estado, sem backup no plano Free).
//
// Rodar:  node tests/apagao.regression.mjs
// Sai com código 1 se algum invariante quebrar (dá pra usar em pre-push/CI).
//
// POR QUE ele vive fora de `appfutebol_run/`: aquela pasta é o artefato
// publicado no Cloudflare Pages — tudo que entra lá vai para a web.
//
// POR QUE ele COPIA os fontes para um diretório temporário: os módulos do app
// são ESM em arquivos .js e o repo não tem `package.json` com `type: module`.
// Adicionar um dentro de `appfutebol_run/` faria o Pages tratar o diretório
// como projeto Node. Copiar para um temp com o package.json certo resolve sem
// tocar em nada publicado.
//
// O QUE ele protege (o bug real, corrigido em v1.140.0-antiwipe):
// `loadLocalState` chamava `buildMergedData({session, ui})` em vez de passar o
// objeto inteiro. Como cada campo de `buildMergedData` tem a guarda
// `Array.isArray(parsed.X) ? parsed.X : seed.X`, passar só dois campos fazia
// TODAS as guardas caírem no seed: o cache local devolvia tudo vazio — e o
// adapter chegava a PUBLICAR essa semente no servidor quando a leitura remota
// falhava. Se alguém reintroduzir isso, os asserts abaixo acusam.

import { cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'convocados-regressao-'));

try {
  cpSync(join(repoRoot, 'appfutebol_run', 'js'), join(work, 'js'), { recursive: true });
  writeFileSync(join(work, 'package.json'), '{"type":"module"}');

  // Stub mínimo de localStorage — o módulo só usa get/set/removeItem.
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };

  // Estado realista, no formato que o app grava no disco.
  const gravado = {
    session: { playerId: 'p1', authUserId: 'u1' },
    ui: { currentTab: 'finance' },
    players: [
      { id: 'p1', name: 'William', phone: '48991520230' },
      { id: 'p2', name: 'Dick', phone: '48984655905' },
    ],
    game: { game_key: 'game_2026-07-22_2030', game_date: '2026-07-22', open: true },
    confirmations: [
      { game_key: 'game_2026-07-22_2030', player_id: 'p2', status: 'confirmed', confirmed: true },
    ],
    carne: [{ id: 'carne_rotation', type: 'carne_rotation', pairs: [{ player1_id: 'p1', player2_id: 'p2' }] }],
    championship: { id: 'champ-2026-01', ranking: [{ player_id: 'p1', points: 9 }] },
    notifications: [{ id: 'n1' }],
    settings: { mens_amount: 100 },
    games: [{ id: 'game_2026-07-22_2030' }],
    active_game_id: 'game_2026-07-22_2030',
    deleted_player_ids: ['p_excluido_99'],
    deleted_player_phones: ['48900000000'],
  };
  mem.set('harmonia_browser_state', JSON.stringify(gravado));

  const mod = await import(pathToFileURL(join(work, 'js', 'services', 'storage.local.js')).href);
  const lido = mod.loadLocalState();

  const falhas = [];
  const check = (rotulo, condicao, obtido) => {
    if (condicao) {
      console.log(`  ✅ ${rotulo}`);
    } else {
      console.log(`  ❌ ${rotulo}  (obtido: ${JSON.stringify(obtido)})`);
      falhas.push(rotulo);
    }
  };

  console.log('\nRegressão do apagão — loadLocalState preserva o domínio:\n');
  check('players preservados', lido.players?.length === 2, lido.players?.length);
  check('confirmations preservadas', lido.confirmations?.length === 1, lido.confirmations?.length);
  check('game.game_key preservado', lido.game?.game_key === 'game_2026-07-22_2030', lido.game?.game_key);
  check('carne (rodízio) preservada', lido.carne?.length === 1, lido.carne?.length);
  check('championship.ranking preservado', lido.championship?.ranking?.length === 1, lido.championship?.ranking?.length);
  check('notifications preservadas', lido.notifications?.length === 1, lido.notifications?.length);
  check('settings preservado', lido.settings?.mens_amount === 100, lido.settings);
  check('games preservado', lido.games?.length === 1, lido.games?.length);
  check('active_game_id preservado', lido.active_game_id === 'game_2026-07-22_2030', lido.active_game_id);
  check('tombstones (deleted_player_ids) preservados', lido.deleted_player_ids?.length === 1, lido.deleted_player_ids);
  // A sessão some por CASCATA quando players vem vazio (o repair não resolve o
  // playerId e limpa a sessão) — ou seja, o apagão também deslogava o usuário.
  check('sessão preservada', lido.session?.playerId === 'p1', lido.session?.playerId);

  if (falhas.length) {
    console.error(`\n❌ ${falhas.length} invariante(s) quebrado(s). O apagão voltou.\n`);
    process.exit(1);
  }
  console.log('\n✅ Todos os invariantes do estado local preservados.\n');
} finally {
  rmSync(work, { recursive: true, force: true });
}
