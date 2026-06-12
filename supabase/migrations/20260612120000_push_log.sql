-- Log de notificações push, para auditoria (enviada / entregue / aberta).
-- Uma linha por (mensagem enviada a uma inscrição). Só a service role escreve;
-- recibos de entrega/abertura chegam pela Edge Function push-receipt.
create table if not exists public.push_log (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,                 -- ex.: 'mensalidade_atrasada'
  player_id    text,
  endpoint     text,
  title        text,
  body         text,
  status       text not null default 'sent',  -- sent | failed | expired
  error        text,
  sent_at      timestamptz not null default now(),
  delivered_at timestamptz,                    -- recibo do service worker (push event)
  opened_at    timestamptz                     -- recibo do notificationclick
);

create index if not exists idx_push_log_kind_sent on public.push_log (kind, sent_at desc);
create index if not exists idx_push_log_player on public.push_log (player_id);

alter table public.push_log enable row level security;

-- Sem políticas para clientes: apenas a service role (Edge Functions) lê e escreve.
-- Isso impede que um jogador veja/edite o log dos outros.
