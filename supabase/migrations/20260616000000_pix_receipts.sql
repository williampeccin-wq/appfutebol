-- Comprovantes PIX já conciliados (anti-reuso por E2E ID + log de pagamentos).
--
-- O E2E ID é o identificador fim-a-fim único de cada transação PIX. Guardá-lo
-- como PK impede que o mesmo comprovante seja usado duas vezes (anti-fraude).
-- Só a Edge Function read-pix-receipt (service_role) escreve aqui — RLS fechada
-- para anon/authenticated, então o cliente não lê nem grava.

create table if not exists public.pix_receipts (
  e2e_id text primary key,
  player_id text not null,
  auth_user_id uuid,
  amount numeric,
  paid_date date,
  beneficiary text,
  bank text,
  created_at timestamptz not null default now()
);

alter table public.pix_receipts enable row level security;
-- Sem policies de propósito: nem anon nem authenticated leem/escrevem.
-- A função usa a service_role key, que ignora RLS.
