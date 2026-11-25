#!/usr/bin/env node
// Gera os PNGs das artes do Instagram no tamanho exato que o Instagram pede.
//
//   node marketing/instagram/render.mjs              # todas as peças
//   node marketing/instagram/render.mjs 01-lancamento 02-pix-1
//
// Sai em marketing/instagram/saida/<id>.png (ignorado pelo git — é derivado).
// Usa o Chrome instalado em modo headless; nenhuma dependência de npm.
// Sobrescreva o binário com CHROME=/caminho/para/chrome se precisar.

import { mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PECAS } from './pecas.mjs';

const run = promisify(execFile);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'saida');

const CANDIDATOS = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

async function acharChrome() {
  for (const c of CANDIDATOS) {
    try { await stat(c); return c; } catch { /* próximo */ }
  }
  throw new Error(
    'Não achei o Chrome. Instale o Google Chrome ou aponte com CHROME=/caminho/para/o/binario'
  );
}

// O PNG vem com largura e altura nos bytes 16..24 do cabeçalho IHDR.
async function medirPng(arquivo) {
  const b = await readFile(arquivo);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) throw new Error('não é um PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

const documento = (css, corpo, w, h) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>${css}
html,body{width:${w}px;height:${h}px}</style>
</head><body>${corpo}</body></html>`;

async function main() {
  const pedidas = process.argv.slice(2);
  const fila = pedidas.length ? PECAS.filter((p) => pedidas.includes(p.id)) : PECAS;

  if (!fila.length) {
    console.error(`Nenhuma peça com esse id. Disponíveis:\n  ${PECAS.map((p) => p.id).join('\n  ')}`);
    process.exit(1);
  }

  const chrome = await acharChrome();
  const css = await readFile(path.join(AQUI, 'artes.css'), 'utf8');
  await mkdir(SAIDA, { recursive: true });
  const trabalho = path.join(tmpdir(), `convocados-artes-${process.pid}`);
  await mkdir(trabalho, { recursive: true });

  let falhas = 0;
  for (const p of fila) {
    const html = path.join(trabalho, `${p.id}.html`);
    const png = path.join(SAIDA, `${p.id}.png`);
    await writeFile(html, documento(css, p.html, p.w, p.h), 'utf8');

    try {
      await run(chrome, [
        '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--virtual-time-budget=8000',   // dá tempo das fontes do Google carregarem
        `--window-size=${p.w},${p.h}`,
        `--screenshot=${png}`,
        `file://${html}`,
      ], { timeout: 60_000 });
    } catch (e) {
      // o Chrome escreve o PNG e ainda assim devolve ruído no stderr; só falha de verdade
      // se o arquivo não apareceu.
      try { await stat(png); } catch {
        console.error(`✗ ${p.id}: o Chrome não gerou o PNG — ${e.message.split('\n')[0]}`);
        falhas++; continue;
      }
    }

    const m = await medirPng(png);
    const certo = m.w === p.w && m.h === p.h;
    const kb = (m.bytes / 1024).toFixed(0);
    if (!certo) { console.error(`✗ ${p.id}: saiu ${m.w}×${m.h}, esperado ${p.w}×${p.h}`); falhas++; continue; }
    if (m.bytes < 8 * 1024) { console.error(`✗ ${p.id}: ${kb} KB — suspeito de arte em branco`); falhas++; continue; }
    console.log(`✓ ${p.id.padEnd(18)} ${m.w}×${m.h}  ${kb.padStart(4)} KB  ${p.nome}`);
  }

  await rm(trabalho, { recursive: true, force: true });
  console.log(`\n${fila.length - falhas}/${fila.length} em ${path.relative(process.cwd(), SAIDA)}/`);
  if (falhas) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
