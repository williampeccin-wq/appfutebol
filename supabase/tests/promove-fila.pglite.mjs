// Testa a migration 20261015180000_promove_fila_no_banco.sql contra um Postgres
// de verdade — o PGlite (Postgres em WebAssembly), já que não há banco local.
//
// Fica FORA de tests/*.regression.mjs de propósito: a suíte da CI não tem
// dependência, e esta precisa do pacote. Para rodar:
//
//   mkdir /tmp/pglite && (cd /tmp/pglite && npm init -y && npm i @electric-sql/pglite@0.2.17)
//   node supabase/tests/promove-fila.pglite.mjs . /tmp/pglite
//
// Cobre: admin remove e o primeiro da fila entra (incidente 14/10), jogador
// cancela, linha apagada, goleiro, convidado de linha, preferência para quem
// está em dia, jogo sem limite, trava recusando a promoção e multi-tenant.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [raiz, pgdir] = process.argv.slice(2);
const { PGlite } = await import(pathToFileURL(path.join(pgdir, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const mig = (nome) => fs.readFileSync(path.join(raiz, 'supabase/migrations', nome), 'utf8');

const JOGO = 'game_2026-10-14_2030';

async function banco({ multi = false } = {}) {
  const db = new PGlite();
  const club = multi ? 'club_id text,' : '';
  await db.exec(`
    create table players (id text primary key, ${club} is_admin boolean default false, data jsonb);
    create table app_meta (key text primary key, data jsonb, updated_at timestamptz);
    create table presence_confirmations (
      game_key text, player_id text, ${club} status text, confirmed_at timestamptz,
      cancelled_at timestamptz, removed_by_admin boolean default false, data jsonb,
      updated_at timestamptz, primary key (game_key, player_id));
  `);
  await db.exec(mig('20260929190000_trava_lotacao_presenca.sql'));
  await db.exec(mig('20261015180000_promove_fila_no_banco.sql'));
  return db;
}

const q = (db, sql, params) => db.query(sql, params).then((r) => r.rows);

async function jogador(db, id, extra = {}, { clubId = null, admin = false } = {}) {
  const data = { id, name: id, position: 'meia', mens_ok: true, ...extra };
  if (clubId) await q(db, 'insert into players (id, club_id, is_admin, data) values ($1,$2,$3,$4)', [id, clubId, admin, data]);
  else await q(db, 'insert into players (id, is_admin, data) values ($1,$2,$3)', [id, admin, data]);
}

async function presenca(db, id, status, { quando = null, clubId = null, jogo = JOGO } = {}) {
  const fila = status === 'waitlist';
  const data = { player_id: id, game_key: jogo, confirmed: status === 'confirmed', status, waitlisted_at: fila ? quando : null, timestamp: quando };
  const linha = fila ? 'cancelled' : status;
  if (clubId) await q(db, 'insert into presence_confirmations (game_key, player_id, club_id, status, data) values ($1,$2,$3,$4,$5)', [jogo, id, clubId, linha, data]);
  else await q(db, 'insert into presence_confirmations (game_key, player_id, status, data) values ($1,$2,$3,$4)', [jogo, id, linha, data]);
}

async function meta(db, game, { key = 'default', settings = {} } = {}) {
  await q(db, 'insert into app_meta (key, data) values ($1,$2)', [key, { games: [{ game_key: JOGO, ...game }], settings }]);
}

const status = async (db, id) => (await q(db, 'select status, data->>\'status\' as ds, data->>\'source\' as fonte from presence_confirmations where player_id=$1', [id]))[0];
const linhaConfirmada = async (db) => Number((await q(db, `select count(*)::int n from presence_confirmations c join players p on p.id=c.player_id
  where c.status='confirmed' and coalesce(lower(p.data->>'position'),'') not in ('gol','goleiro')`))[0].n);
const sair = (db, id, como = 'cancelled') => q(db, `update presence_confirmations set status=$2,
  removed_by_admin = ($2 = 'removed'), data = data || jsonb_build_object('confirmed', false, 'status', $2::text) where player_id=$1`, [id, como]);

// Jogo de 16 vagas de linha, cheio, com um goleiro, e dois na fila.
async function jogoCheio(db, opts = {}) {
  for (let i = 1; i <= 15; i++) { await jogador(db, `p${i}`, {}, opts); await presenca(db, `p${i}`, 'confirmed', opts); }
  await jogador(db, 'caue', {}, opts); await presenca(db, 'caue', 'confirmed', opts);
  await jogador(db, 'goleiro', { position: 'gol' }, opts); await presenca(db, 'goleiro', 'confirmed', opts);
  await jogador(db, 'feijo', {}, opts); await presenca(db, 'feijo', 'waitlist', { ...opts, quando: '2026-10-13T10:00:00.000Z' });
  await jogador(db, 'bignoti', {}, opts); await presenca(db, 'bignoti', 'waitlist', { ...opts, quando: '2026-10-13T11:00:00.000Z' });
}

// ---------------------------------------------------------------- 14/10: admin remove o Caue
{
  const db = await banco();
  await meta(db, { max_players: 16 });
  await jogoCheio(db);
  await sair(db, 'caue', 'removed');
  assert.equal((await status(db, 'feijo')).status, 'confirmed', 'o primeiro da fila entra na hora');
  assert.equal((await status(db, 'feijo')).ds, 'confirmed', 'e o data acompanha (é o que o app lê)');
  assert.equal((await status(db, 'feijo')).fonte, 'banco_promove_fila', 'com a origem marcada');
  assert.equal((await status(db, 'bignoti')).ds, 'waitlist', 'o segundo segue na fila');
  assert.equal(await linhaConfirmada(db), 16, '16 de 16, nem 15 nem 17');

  // Cliente velho grava a promoção que o banco já fez: confirmado -> confirmado, passa.
  await q(db, `update presence_confirmations set status='confirmed' where player_id='feijo'`);
  // Cliente com a fila em outra ordem tenta pôr o Bignoti: a trava barra.
  await assert.rejects(q(db, `update presence_confirmations set status='confirmed' where player_id='bignoti'`), /JOGO_LOTADO/,
    'não há segunda vaga para quem o cliente escolheu errado');
  console.log('ok - admin remove: o primeiro da fila entra na mesma transação');
}

// ---------------------------------------------------------------- jogador comum cancela (o Broca)
{
  const db = await banco();
  await meta(db, { max_players: 16 });
  await jogoCheio(db);
  await sair(db, 'p3');
  assert.equal((await status(db, 'feijo')).status, 'confirmed', 'cancelamento de jogador também promove');
  await q(db, `delete from presence_confirmations where player_id='p4'`);
  assert.equal((await status(db, 'bignoti')).status, 'confirmed', 'linha apagada também abre vaga');
  await sair(db, 'p5');
  assert.equal(await linhaConfirmada(db), 15, 'fila vazia: a vaga fica aberta, sem erro');
  console.log('ok - cancelamento e exclusão promovem; fila vazia não quebra');
}

// ---------------------------------------------------------------- goleiro sai: não abre vaga de linha
{
  const db = await banco();
  await meta(db, { max_players: 16 });
  await jogoCheio(db);
  await sair(db, 'goleiro');
  assert.equal((await status(db, 'feijo')).ds, 'waitlist', 'goleiro não ocupa vaga de linha');
  console.log('ok - saída de goleiro não promove ninguém');
}

// ---------------------------------------------------------------- convidado de linha ocupa vaga
{
  const db = await banco();
  await meta(db, { max_players: 17, guest_players: [{ id: 'g1', name: 'Alex', position: 'meia' }, { id: 'g2', name: 'Chico', position: 'gol' }] });
  await jogoCheio(db); // 16 de linha + 1 convidado de linha = 17/17
  await sair(db, 'p1');
  assert.equal((await status(db, 'feijo')).status, 'confirmed', 'a vaga aberta vai para a fila');
  assert.equal((await status(db, 'bignoti')).ds, 'waitlist', 'e só uma: o convidado de linha conta');
  console.log('ok - convidado de linha conta na vaga; convidado goleiro, não');
}

// ---------------------------------------------------------------- preferência para quem está em dia
for (const [nome, settings, vencimento, esperado] of [
  ['ligada e vencida', { fila_prioriza_em_dia: true }, '2026-01-10', 'bignoti'],
  ['desligada', {}, '2026-01-10', 'feijo'],
  ['ligada, antes do vencimento', { fila_prioriza_em_dia: true }, '2099-01-10', 'feijo'],
]) {
  const db = await banco();
  await meta(db, { max_players: 16, mens_expire_date: vencimento }, { settings });
  await jogoCheio(db);
  await q(db, `update players set data = data || '{"mens_ok": false}' where id='feijo'`); // chegou primeiro, em atraso
  await sair(db, 'p1');
  assert.equal((await status(db, esperado)).status, 'confirmed', `preferência ${nome}: entra ${esperado}`);
}
{
  // Isentos nunca cedem a vez: goleiro não-pagante e quem é do churrasco.
  const db = await banco();
  await meta(db, { max_players: 16, mens_expire_date: '2026-01-10' }, { settings: { fila_prioriza_em_dia: true } });
  await jogoCheio(db);
  await q(db, `update players set data = data || '{"mens_ok": false, "role": "carne"}' where id='feijo'`);
  await sair(db, 'p1');
  assert.equal((await status(db, 'feijo')).status, 'confirmed', 'isento não cede a vez');
  console.log('ok - preferência na fila igual ao app (ligada/desligada/antes do vencimento/isento)');
}

// ---------------------------------------------------------------- jogo sem limite ou desconhecido
{
  const db = await banco();
  await meta(db, {});
  await jogoCheio(db);
  await sair(db, 'p1');
  assert.equal((await status(db, 'feijo')).ds, 'waitlist', 'sem max_players, o banco não inventa limite');
  console.log('ok - jogo sem limite: nada muda');
}

// ---------------------------------------------------------------- a trava recusa: a saída vale mesmo assim
{
  const db = await banco();
  await meta(db, { max_players: 16 });
  await jogoCheio(db);
  await db.exec(`create or replace function public.presence_enforce_line_capacity() returns trigger language plpgsql as $$
    begin if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
      raise exception 'JOGO_LOTADO: teste' using errcode = 'check_violation'; end if; return new; end $$;`);
  await sair(db, 'caue', 'removed');
  assert.equal((await status(db, 'caue')).status, 'removed', 'a saída é gravada mesmo se a promoção for barrada');
  assert.equal((await status(db, 'feijo')).ds, 'waitlist', 'e a promoção barrada volta atrás sozinha');
  console.log('ok - promoção recusada não desfaz a saída');
}

// ---------------------------------------------------------------- multi-tenant (convocados-prod)
{
  const db = await banco({ multi: true });
  const A = 'club-a'; const B = 'club-b';
  await meta(db, { max_players: 16 }, { key: A });
  await meta(db, { max_players: 16 }, { key: B });
  await jogoCheio(db, { clubId: A });
  // Outro clube com o MESMO game_key e alguém na fila: não pode ser promovido.
  await jogador(db, 'outro', {}, { clubId: B });
  await presenca(db, 'outro', 'waitlist', { clubId: B, quando: '2026-10-01T00:00:00.000Z' });
  await sair(db, 'caue', 'removed');
  assert.equal((await status(db, 'feijo')).status, 'confirmed', 'promove dentro do clube');
  assert.equal((await status(db, 'outro')).ds, 'waitlist', 'e não mexe na fila de outro clube');
  console.log('ok - multi-tenant: cada clube com a sua fila');
}

console.log('\nTODOS OS CENÁRIOS PASSARAM');
