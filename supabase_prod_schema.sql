


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."harmonia_guard_player_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.auth_user_id is null or NEW.auth_user_id <> auth.uid()::text then
    if not public.harmonia_is_admin() then
      raise exception 'player_insert_not_allowed';
    end if;
  end if;

  if NEW.is_admin is true and public.harmonia_has_any_player() and not public.harmonia_is_admin() then
    raise exception 'admin_insert_not_allowed';
  end if;

  NEW.data = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(NEW.data, '{}'::jsonb), '{id}', to_jsonb(NEW.id), true),
      '{auth_user_id}', coalesce(to_jsonb(NEW.auth_user_id), 'null'::jsonb), true
    ),
    '{is_admin}', to_jsonb(NEW.is_admin), true
  );

  return NEW;
end;
$$;


ALTER FUNCTION "public"."harmonia_guard_player_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."harmonia_guard_player_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.harmonia_is_admin() then
    NEW.data = jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(NEW.data, '{}'::jsonb), '{id}', to_jsonb(NEW.id), true),
        '{auth_user_id}', coalesce(to_jsonb(NEW.auth_user_id), 'null'::jsonb), true
      ),
      '{is_admin}', to_jsonb(NEW.is_admin), true
    );
    return NEW;
  end if;

  if OLD.auth_user_id is null or OLD.auth_user_id <> auth.uid()::text then
    raise exception 'player_update_not_allowed';
  end if;

  NEW.id := OLD.id;
  NEW.auth_user_id := OLD.auth_user_id;
  NEW.is_admin := OLD.is_admin;

  if coalesce(NEW.data->>'mens_ok', '') is distinct from coalesce(OLD.data->>'mens_ok', '') then
    raise exception 'mens_ok_is_admin_only';
  end if;

  if coalesce(NEW.data->>'role', '') is distinct from coalesce(OLD.data->>'role', '') then
    raise exception 'role_is_admin_only';
  end if;

  if coalesce(NEW.data->>'plays_football', '') is distinct from coalesce(OLD.data->>'plays_football', '') then
    raise exception 'plays_football_is_admin_only';
  end if;

  if coalesce(NEW.data->>'in_carne_group', '') is distinct from coalesce(OLD.data->>'in_carne_group', '') then
    raise exception 'in_carne_group_is_admin_only';
  end if;


  NEW.data = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(NEW.data, '{}'::jsonb), '{id}', to_jsonb(NEW.id), true),
      '{auth_user_id}', coalesce(to_jsonb(NEW.auth_user_id), 'null'::jsonb), true
    ),
    '{is_admin}', to_jsonb(NEW.is_admin), true
  );

  return NEW;
end;
$$;


ALTER FUNCTION "public"."harmonia_guard_player_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."harmonia_has_any_player"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.players);
$$;


ALTER FUNCTION "public"."harmonia_has_any_player"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."harmonia_is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.players p
    where p.auth_user_id = auth.uid()::text
      and p.is_admin is true
  );
$$;


ALTER FUNCTION "public"."harmonia_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."harmonia_is_own_player_id"("target_player_id" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.players p
    where p.id = target_player_id
      and p.auth_user_id = auth.uid()::text
  );
$$;


ALTER FUNCTION "public"."harmonia_is_own_player_id"("target_player_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_non_admin_player_privilege_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  actor_is_admin boolean;
begin
  select coalesce(p.is_admin, false)
  into actor_is_admin
  from public.players p
  where p.auth_user_id = auth.uid()::text
  limit 1;

  if coalesce(actor_is_admin, false) = true then
    return new;
  end if;

  if old.auth_user_id is distinct from new.auth_user_id then
    raise exception 'Only admins can change auth_user_id';
  end if;

  if old.is_admin is distinct from new.is_admin then
    raise exception 'Only admins can change is_admin';
  end if;

  if coalesce(old.data->>'mens_ok', '') is distinct from coalesce(new.data->>'mens_ok', '') then
    raise exception 'Only admins can change mens_ok';
  end if;

  if coalesce(old.data->>'role', '') is distinct from coalesce(new.data->>'role', '') then
    raise exception 'Only admins can change role';
  end if;

  if coalesce(old.data->>'is_admin', '') is distinct from coalesce(new.data->>'is_admin', '') then
    raise exception 'Only admins can change data.is_admin';
  end if;

  if coalesce(old.data->>'carne_group', '') is distinct from coalesce(new.data->>'carne_group', '') then
    raise exception 'Only admins can change carne_group';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_non_admin_player_privilege_changes"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_meta" (
    "key" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_meta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_state" (
    "key" "text" NOT NULL,
    "state" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."confirmations" (
    "player_id" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."confirmations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_state" (
    "key" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_user_id" "text",
    "is_admin" boolean DEFAULT false
);


ALTER TABLE "public"."players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presence_confirmations" (
    "game_key" "text" DEFAULT 'default'::"text" NOT NULL,
    "player_id" "text" NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "confirmed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "removed_by_admin" boolean DEFAULT false NOT NULL,
    "created_by_auth_user_id" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "presence_confirmations_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'cancelled'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."presence_confirmations" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_meta"
    ADD CONSTRAINT "app_meta_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."app_state"
    ADD CONSTRAINT "app_state_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."confirmations"
    ADD CONSTRAINT "confirmations_pkey" PRIMARY KEY ("player_id");



ALTER TABLE ONLY "public"."game_state"
    ADD CONSTRAINT "game_state_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presence_confirmations"
    ADD CONSTRAINT "presence_confirmations_pkey" PRIMARY KEY ("game_key", "player_id");



CREATE INDEX "idx_players_auth_user_id" ON "public"."players" USING "btree" ("auth_user_id");



CREATE INDEX "idx_players_is_admin" ON "public"."players" USING "btree" ("is_admin");



CREATE INDEX "idx_presence_confirmations_game_status" ON "public"."presence_confirmations" USING "btree" ("game_key", "status");



CREATE INDEX "idx_presence_confirmations_player_id" ON "public"."presence_confirmations" USING "btree" ("player_id");



CREATE OR REPLACE TRIGGER "trg_harmonia_guard_player_insert" BEFORE INSERT ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."harmonia_guard_player_insert"();



CREATE OR REPLACE TRIGGER "trg_harmonia_guard_player_update" BEFORE UPDATE ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."harmonia_guard_player_update"();



CREATE OR REPLACE TRIGGER "trg_prevent_non_admin_player_privilege_changes" BEFORE UPDATE ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_non_admin_player_privilege_changes"();



ALTER TABLE "public"."app_meta" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_meta_read_authenticated" ON "public"."app_meta" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "app_meta_write_admin" ON "public"."app_meta" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true)))));



ALTER TABLE "public"."app_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_state_read_authenticated" ON "public"."app_state" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "app_state_write_admin" ON "public"."app_state" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true)))));



ALTER TABLE "public"."confirmations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "confirmations_read_authenticated" ON "public"."confirmations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "confirmations_write_self_or_admin" ON "public"."confirmations" TO "authenticated" USING ((("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."auth_user_id" = ("auth"."uid"())::"text"))) OR (EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true)))))) WITH CHECK ((("player_id" IN ( SELECT "players"."id"
   FROM "public"."players"
  WHERE ("players"."auth_user_id" = ("auth"."uid"())::"text"))) OR (EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true))))));



ALTER TABLE "public"."game_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_state_read_authenticated" ON "public"."game_state" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "game_state_write_admin" ON "public"."game_state" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true)))));



CREATE POLICY "harmonia_app_state_read_authenticated" ON "public"."app_state" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "harmonia_app_state_write_admin" ON "public"."app_state" TO "authenticated" USING ("public"."harmonia_is_admin"()) WITH CHECK ("public"."harmonia_is_admin"());



CREATE POLICY "harmonia_confirmations_delete_admin_or_self" ON "public"."confirmations" FOR DELETE TO "authenticated" USING (("public"."harmonia_is_admin"() OR "public"."harmonia_is_own_player_id"("player_id")));



CREATE POLICY "harmonia_confirmations_insert_admin_or_self" ON "public"."confirmations" FOR INSERT TO "authenticated" WITH CHECK (("public"."harmonia_is_admin"() OR "public"."harmonia_is_own_player_id"("player_id")));



CREATE POLICY "harmonia_confirmations_read_authenticated" ON "public"."confirmations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "harmonia_confirmations_update_admin_or_self" ON "public"."confirmations" FOR UPDATE TO "authenticated" USING (("public"."harmonia_is_admin"() OR "public"."harmonia_is_own_player_id"("player_id"))) WITH CHECK (("public"."harmonia_is_admin"() OR "public"."harmonia_is_own_player_id"("player_id")));



CREATE POLICY "harmonia_game_read_authenticated" ON "public"."game_state" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "harmonia_game_write_admin" ON "public"."game_state" TO "authenticated" USING ("public"."harmonia_is_admin"()) WITH CHECK ("public"."harmonia_is_admin"());



CREATE POLICY "harmonia_meta_read_authenticated" ON "public"."app_meta" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "harmonia_meta_write_admin" ON "public"."app_meta" TO "authenticated" USING ("public"."harmonia_is_admin"()) WITH CHECK ("public"."harmonia_is_admin"());



CREATE POLICY "harmonia_players_delete_admin" ON "public"."players" FOR DELETE TO "authenticated" USING ("public"."harmonia_is_admin"());



CREATE POLICY "harmonia_players_insert_admin_or_self" ON "public"."players" FOR INSERT TO "authenticated" WITH CHECK (("public"."harmonia_is_admin"() OR (("auth_user_id" = ("auth"."uid"())::"text") AND (("is_admin" IS FALSE) OR ("public"."harmonia_has_any_player"() IS FALSE)))));



CREATE POLICY "harmonia_players_read_authenticated" ON "public"."players" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "harmonia_players_update_admin_or_self" ON "public"."players" FOR UPDATE TO "authenticated" USING (("public"."harmonia_is_admin"() OR ("auth_user_id" = ("auth"."uid"())::"text"))) WITH CHECK (("public"."harmonia_is_admin"() OR ("auth_user_id" = ("auth"."uid"())::"text")));



CREATE POLICY "harmonia_presence_delete_admin_or_self" ON "public"."presence_confirmations" FOR DELETE TO "authenticated" USING (("public"."harmonia_is_admin"() OR "public"."harmonia_is_own_player_id"("player_id")));



CREATE POLICY "harmonia_presence_insert_admin_or_self" ON "public"."presence_confirmations" FOR INSERT TO "authenticated" WITH CHECK (("public"."harmonia_is_admin"() OR "public"."harmonia_is_own_player_id"("player_id")));



CREATE POLICY "harmonia_presence_read_authenticated" ON "public"."presence_confirmations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "harmonia_presence_update_admin_or_self" ON "public"."presence_confirmations" FOR UPDATE TO "authenticated" USING (("public"."harmonia_is_admin"() OR "public"."harmonia_is_own_player_id"("player_id"))) WITH CHECK (("public"."harmonia_is_admin"() OR "public"."harmonia_is_own_player_id"("player_id")));



ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "players_delete_admin" ON "public"."players" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true)))));



CREATE POLICY "players_insert_admin" ON "public"."players" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true)))));



CREATE POLICY "players_read_authenticated" ON "public"."players" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "players_update_self_or_admin" ON "public"."players" FOR UPDATE TO "authenticated" USING ((("auth_user_id" = ("auth"."uid"())::"text") OR (EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true)))))) WITH CHECK ((("auth_user_id" = ("auth"."uid"())::"text") OR (EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."auth_user_id" = ("auth"."uid"())::"text") AND ("p"."is_admin" = true))))));



ALTER TABLE "public"."presence_confirmations" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."harmonia_guard_player_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."harmonia_guard_player_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."harmonia_guard_player_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."harmonia_guard_player_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."harmonia_guard_player_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."harmonia_guard_player_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."harmonia_has_any_player"() TO "anon";
GRANT ALL ON FUNCTION "public"."harmonia_has_any_player"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."harmonia_has_any_player"() TO "service_role";



GRANT ALL ON FUNCTION "public"."harmonia_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."harmonia_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."harmonia_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."harmonia_is_own_player_id"("target_player_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."harmonia_is_own_player_id"("target_player_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."harmonia_is_own_player_id"("target_player_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_non_admin_player_privilege_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_non_admin_player_privilege_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_non_admin_player_privilege_changes"() TO "service_role";



GRANT ALL ON TABLE "public"."app_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."app_meta" TO "service_role";



GRANT ALL ON TABLE "public"."app_state" TO "authenticated";
GRANT ALL ON TABLE "public"."app_state" TO "service_role";



GRANT ALL ON TABLE "public"."confirmations" TO "authenticated";
GRANT ALL ON TABLE "public"."confirmations" TO "service_role";



GRANT ALL ON TABLE "public"."game_state" TO "authenticated";
GRANT ALL ON TABLE "public"."game_state" TO "service_role";



GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON TABLE "public"."presence_confirmations" TO "authenticated";
GRANT ALL ON TABLE "public"."presence_confirmations" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







