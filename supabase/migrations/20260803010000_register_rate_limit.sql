-- M4 (Lote 2) — rate-limit do register-player por IP.
--
-- CONTEXTO: register-player roda com service_role e é chamado por cliente ANÔNIMO
-- (deploy --no-verify-jwt). Sem throttle, qualquer um com a anon key (pública) cria
-- contas/clubes ilimitadamente (custo/abuso) e pode enumerar telefones pelo retorno
-- `duplicate_phone`. Esta tabela guarda as tentativas por IP para a função contar e
-- barrar quando passar do teto na janela.
--
-- ACESSO: só a Edge Function (service_role, que IGNORA RLS) lê/escreve aqui. RLS
-- LIGADO e SEM policies = anon/authenticated não tocam nesta tabela de jeito nenhum.

create table if not exists public.register_rate_limit (
  id         bigint generated always as identity primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_register_rate_limit_ip_time
  on public.register_rate_limit (ip, created_at desc);

alter table public.register_rate_limit enable row level security;
-- Intencional: nenhuma policy. Só service_role acessa.
