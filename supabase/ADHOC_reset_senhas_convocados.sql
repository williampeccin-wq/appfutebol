-- Reset de senha de TODAS as contas — SOMENTE no projeto convocados-prod.
--
-- ⚠️ Isto desloga e tranca todo mundo que não souber a senha nova. O app não
-- tem "esqueci minha senha", e não pode ter por e-mail: as contas são
-- <telefone>@harmonia.app, domínio que não recebe mensagem. Quem não receber a
-- senha nova por fora só volta se um admin do clube resetar a dele, uma a uma.
--
-- NÃO RODAR NO HARMONIA. O bloco 0 aborta sozinho se você errar o projeto: o
-- Harmonia é single-tenant e não tem a tabela `clubs`.
--
-- Como usar, no SQL Editor de https://supabase.com/dashboard/project/nwsnakzttmvuyejbfzom
--   1. Rode o BLOCO 1 e olhe quem vai ser afetado.
--   2. Troque SENHA_NOVA_AQUI, no BLOCO 2, pela senha escolhida.
--   3. Rode o BLOCO 2.
--   4. Opcional: BLOCO 3, para derrubar quem está com o app aberto.


-- ============================================================ BLOCO 0 — trava
-- Roda junto com os blocos 2 e 3; deixe sempre no começo da seleção.

do $$
begin
  if to_regclass('public.clubs') is null then
    raise exception
      'ABORTADO: este banco nao tem public.clubs — parece ser o Harmonia, nao o Convocados.';
  end if;
end $$;


-- ====================================================== BLOCO 1 — só conferir
-- Nada muda aqui. Olhe o número e a lista antes de seguir.
-- Resultado em 10/11/2026: 24 contas.

select count(*) as contas_afetadas
from auth.users
where encrypted_password is not null;

select
  u.email,
  p.data->>'name'  as jogador,   -- players nao tem coluna `name`: o nome mora no jsonb `data`
  p.is_admin,
  c.name           as clube,
  u.last_sign_in_at
from auth.users u
-- Cast dos dois lados: players.auth_user_id e players.club_id são TEXT, e
-- auth.users.id e clubs.id são UUID. Sem isto o Postgres recusa com
-- "operator does not exist: text = uuid".
left join public.players p on p.auth_user_id::text = u.id::text
left join public.clubs   c on c.id::text = p.club_id::text
where u.encrypted_password is not null
order by u.last_sign_in_at desc nulls last;


-- ============================================== BLOCO 2 — o reset (DESTRUTIVO)
-- Senha escolhida fora do repositório. O mínimo que o Supabase aceita é 6 (o
-- app exige). Vale para TODAS as contas, inclusive a do próprio administrador.
-- Rode junto com o BLOCO 0 acima.
--
-- ⚠️ O site está na internet aberta. Com senha única e óbvia, quem souber o
-- telefone de alguém entra como a pessoa. É aceitável enquanto durar o teste;
-- não deixe assim depois.

-- begin;   -- descomente as duas linhas de transação se quiser conferir antes de gravar

update auth.users
set
  encrypted_password = extensions.crypt('SENHA_NOVA_AQUI', extensions.gen_salt('bf')),
  updated_at         = now()
where encrypted_password is not null;

-- Confira o número antes de confirmar:
-- select count(*) from auth.users where updated_at > now() - interval '1 minute';
-- commit;   -- ou rollback; para desistir


-- ============================ BLOCO 3 — opcional: derrubar as sessões abertas
-- Trocar a senha NÃO invalida quem já está logado: o refresh token continua
-- valendo e o app aberto segue funcionando até expirar. Se a intenção é que
-- todo mundo tenha de entrar de novo com a senha nova, rode também isto.
-- Rode junto com o BLOCO 0 acima.

-- delete from auth.refresh_tokens;
-- delete from auth.sessions;
