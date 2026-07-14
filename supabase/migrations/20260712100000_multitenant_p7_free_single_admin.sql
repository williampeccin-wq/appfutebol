-- Multi-tenant Fase 1 · PASSO 7 — limite do Free: 1 admin por clube.
--
-- Clube GRÁTIS tem 1 admin; multi-admin é Pro. A promoção a admin é um UPDATE
-- direto em players (não passa por Edge Function), então a autoridade é um trigger
-- BEFORE UPDATE: ao PROMOVER (is_admin false→true), se o clube não é Pro e já
-- existe outro admin, recusa. Não afeta a criação do dono (é INSERT), nem edições
-- do próprio admin (OLD.is_admin já é true). Pro = ilimitado.

create or replace function public.harmonia_guard_free_single_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  club_plan text;
  other_admins int;
begin
  if NEW.is_admin is true and (OLD.is_admin is distinct from true) then
    select plan into club_plan from public.clubs where id = NEW.club_id;
    if coalesce(club_plan, 'free') <> 'pro' then
      select count(*) into other_admins
        from public.players
        where club_id = NEW.club_id and is_admin is true and id <> NEW.id;
      if other_admins >= 1 then
        raise exception 'free_single_admin';
      end if;
    end if;
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_harmonia_free_single_admin on public.players;
create trigger trg_harmonia_free_single_admin
  before update on public.players
  for each row execute function public.harmonia_guard_free_single_admin();
