import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = '/private/tmp/claude-501/-Users-williampeccin-Dev-appFutebol/3c18657b-0788-4c91-b4d1-da1a8752397b/scratchpad';
const OUT = `${BASE}/shots`;
mkdirSync(OUT, { recursive: true });

const PERFIL = `${BASE}/chrome-captura`;
spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=9222', `--user-data-dir=${PERFIL}`,
   '--hide-scrollbars', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

const sono = (ms) => new Promise((r) => setTimeout(r, ms));
let alvos = null;
for (let i = 0; i < 20; i++) { await sono(1000); try { alvos = await (await fetch('http://127.0.0.1:9222/json')).json(); break; } catch {} }
if (!alvos) { console.error('Chrome nao abriu a porta'); process.exit(1); }

const ws = new WebSocket(alvos.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Page.javascriptDialogOpening') {
    console.log('  dialogo:', m.params.type, m.params.message);
    ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
  }
};
const cdp = (method, params = {}) => new Promise((res) => {
  const n = ++id;
  const t = setTimeout(() => { if (pend.has(n)) { pend.delete(n); res({ __timeout: true }); } }, 15000);
  pend.set(n, (r) => { clearTimeout(t); res(r); });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const ev = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.__timeout) return '<<TIMEOUT>>';
  return r.result?.result?.value;
};

await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 3, mobile: true });
await cdp('Page.navigate', { url: 'https://convocados.app.br/' });
await sono(8000);

await ev(`(() => {
  const s = (el, v) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); };
  s(document.getElementById('login-phone'), ${JSON.stringify(process.env.CONV_TEL)});
  s(document.getElementById('login-password'), ${JSON.stringify(process.env.CONV_PWD)});
  setTimeout(() => document.getElementById('login-form').requestSubmit(), 50);
  return 'ok';
})()`);
await sono(12000);
console.log('entrou?', await ev('!!document.querySelector(".bnav-btn")'));

const NOMES = { home: '1-home', weekly_game: '2-sorteio', carne: '3-churrasco',
  championship: '4-campeonato', players: '5-jogadores', finance: '6-financeiro' };
const pedidas = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(NOMES);
const telas = pedidas.map((a) => [a, NOMES[a] || a]);
for (const [aba, nome] of telas) {
  await ev(`(() => { const b = document.querySelector('.bnav-btn[data-tab="${aba}"]'); if (b) b.click(); return !!b; })()`);
  await sono(3500);
  await ev('window.scrollTo(0,0)');
  await sono(600);
  const t = await cdp('Page.captureScreenshot', { format: 'png' });
  if (t.result?.data) { writeFileSync(`${OUT}/${nome}.png`, Buffer.from(t.result.data, 'base64')); console.log('capturado', nome); }
  else console.log('FALHOU', nome);
}
process.exit(0);
