// Agendar a abertura das inscrições é do JOGO, não da gestão do clube.
//
// 13/10/2026: o cron `auto-open-games` só abria jogo de clube Pro, mas a trava
// existia SÓ no servidor. O formulário do jogo oferecia "Abrir inscrições
// automaticamente no horário" para qualquer clube e a home anunciava "Abre
// automaticamente: seg 21:00" — no Free, a hora chegava e nada acontecia, sem
// aviso nenhum. Promessa na tela sem ninguém para cumprir.
//
// A linha do produto é "diversão no Free, controle no Pro". O cron já roda de 5
// em 5 minutos para todos os clubes e abrir um jogo não tem custo por uso.
//
// Este teste lê o arquivo que vai para produção: se alguém religar a trava de
// plano na abertura, ou devolver o item ao modal de upsell, ele quebra.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

const cron = ler('../supabase/functions/auto-open-games/index.ts');
const inicio = cron.indexOf('// ---------- 1) Abertura automática de inscrições');
const fim = cron.indexOf('// ---------- 2) Votação do churrasco');
assert.ok(inicio > 0 && fim > inicio, 'o bloco de abertura automática precisa existir no cron');

const abertura = cron.slice(inicio, fim);
assert.ok(abertura.includes('auto_open_at'), 'o bloco recortado é mesmo o da abertura');
assert.doesNotMatch(abertura, /isPro|\.plan\b/, 'a abertura agendada não pode depender do plano do clube');

const gating = ler('../appfutebol_run/js/domain/gating.js');
assert.doesNotMatch(gating, /Abertura automática/i, 'o modal de upsell não pode vender como Pro o que é Free');

console.log('ok — agendamento de abertura vale para todos os planos');
