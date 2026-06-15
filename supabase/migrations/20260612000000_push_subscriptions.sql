-- Tabela de inscrições de Web Push (uma por endpoint de navegador/dispositivo).
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  player_id  text,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_player on public.push_subscriptions (player_id);

alter table public.push_subscriptions enable row level security;

-- Clientes autenticados podem gravar/atualizar/remover a PRÓPRIA inscrição
-- (upsert por endpoint). Não há SELECT para clientes: só a Edge Function
-- (service role, que ignora RLS) lê para enviar os pushes.
drop policy if exists "push_insert_authenticated" on public.push_subscriptions;
create policy "push_insert_authenticated"
  on public.push_subscriptions for insert to authenticated with check (true);

drop policy if exists "push_update_authenticated" on public.push_subscriptions;
create policy "push_update_authenticated"
  on public.push_subscriptions for update to authenticated using (true) with check (true);

drop policy if exists "push_delete_authenticated" on public.push_subscriptions;
create policy "push_delete_authenticated"
  on public.push_subscriptions for delete to authenticated using (true);
