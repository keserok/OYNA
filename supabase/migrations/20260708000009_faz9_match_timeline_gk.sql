-- ============================================================================
-- FAZ 9 (genişletme) — Maç zaman çizelgesi (kayıt + görüntüleme) + kaleci atama
-- ----------------------------------------------------------------------------
-- 1) match_events: bundan sonraki olayları (katılım/ayrılma/durum/skor) kaydeden günlük
-- 2) matches AFTER UPDATE trigger: kadro/durum/skor değişimlerini match_events'e yazar
--    (defansif: hata olsa bile maç güncellemesini ASLA bozmaz)
-- 3) admin_assign_match_goalkeeper: kaleciyi hakem gibi doğrudan atar (gk_id) + audit
-- 4) admin_fetch_match_timeline: mevcut TÜM olayları (audit/ödeme/bildirim/hizmet/skor/
--    itiraz) + match_events'i birleştirip tek zaman çizelgesi döndürür
-- ============================================================================

-- ─── 1) match_events günlüğü ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id   uuid,
  actor_name text,
  title      text NOT NULL,
  detail     text,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_events_match ON public.match_events(match_id, created_at DESC);

ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS match_events_admin_read ON public.match_events;
CREATE POLICY match_events_admin_read ON public.match_events
  FOR SELECT TO authenticated USING (public.is_platform_admin());
GRANT SELECT ON public.match_events TO authenticated;

-- ─── 2) matches değişim trigger'ı (katılım/ayrılma/durum/skor) ───────────────
CREATE OR REPLACE FUNCTION public.tg_matches_timeline_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.match_events(match_id, event_type, title, detail)
      VALUES (NEW.id, 'STATUS', 'Durum değişti', COALESCE(OLD.status,'?') || ' → ' || COALESCE(NEW.status,'?'));
    END IF;

    IF NEW."scoreEnteredAt" IS DISTINCT FROM OLD."scoreEnteredAt" AND NEW."scoreEnteredAt" IS NOT NULL THEN
      INSERT INTO public.match_events(match_id, event_type, title, detail)
      VALUES (NEW.id, 'SCORE', 'Skor girildi', COALESCE(NEW."homeScore",0)::text || '-' || COALESCE(NEW."awayScore",0)::text);
    END IF;

    IF NEW.slots IS DISTINCT FROM OLD.slots OR NEW."awaySlots" IS DISTINCT FROM OLD."awaySlots" THEN
      -- Katılanlar (NEW'de TAKEN, OLD'da aynı slot+oyuncu yok)
      WITH np AS (
        SELECT s->>'id' AS slot_id, (s->'player'->>'id') AS pid, (s->'player'->>'name') AS pname, COALESCE(s->>'role','') AS role
        FROM jsonb_array_elements(COALESCE(NEW.slots,'[]'::jsonb) || COALESCE(NEW."awaySlots",'[]'::jsonb)) s
        WHERE s->>'status' = 'TAKEN' AND (s->'player'->>'id') IS NOT NULL
      ), op AS (
        SELECT s->>'id' AS slot_id, (s->'player'->>'id') AS pid
        FROM jsonb_array_elements(COALESCE(OLD.slots,'[]'::jsonb) || COALESCE(OLD."awaySlots",'[]'::jsonb)) s
        WHERE s->>'status' = 'TAKEN' AND (s->'player'->>'id') IS NOT NULL
      )
      INSERT INTO public.match_events(match_id, event_type, actor_id, actor_name, title, detail)
      SELECT NEW.id, 'JOIN', np.pid::uuid, np.pname, 'Oyuncu katıldı', np.role
      FROM np WHERE NOT EXISTS (SELECT 1 FROM op WHERE op.slot_id = np.slot_id AND op.pid = np.pid);

      -- Ayrılanlar (OLD'da TAKEN, NEW'de aynı slot+oyuncu yok)
      WITH np AS (
        SELECT s->>'id' AS slot_id, (s->'player'->>'id') AS pid
        FROM jsonb_array_elements(COALESCE(NEW.slots,'[]'::jsonb) || COALESCE(NEW."awaySlots",'[]'::jsonb)) s
        WHERE s->>'status' = 'TAKEN' AND (s->'player'->>'id') IS NOT NULL
      ), op AS (
        SELECT s->>'id' AS slot_id, (s->'player'->>'id') AS pid, (s->'player'->>'name') AS pname
        FROM jsonb_array_elements(COALESCE(OLD.slots,'[]'::jsonb) || COALESCE(OLD."awaySlots",'[]'::jsonb)) s
        WHERE s->>'status' = 'TAKEN' AND (s->'player'->>'id') IS NOT NULL
      )
      INSERT INTO public.match_events(match_id, event_type, actor_id, actor_name, title, detail)
      SELECT NEW.id, 'LEAVE', op.pid::uuid, op.pname, 'Oyuncu ayrıldı', op.slot_id
      FROM op WHERE NOT EXISTS (SELECT 1 FROM np WHERE np.slot_id = op.slot_id AND np.pid = op.pid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- zaman çizelgesi kaydı maç güncellemesini asla bozmaz
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_matches_timeline ON public.matches;
CREATE TRIGGER trg_matches_timeline AFTER UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.tg_matches_timeline_events();

-- ─── 3) Kaleci atama (hakem gibi doğrudan) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_assign_match_goalkeeper(p_match_id uuid, p_goalkeeper_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  UPDATE public.matches SET gk_id = NULLIF(p_goalkeeper_id::text, '')::uuid WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  PERFORM public.log_admin_action('MATCH_ASSIGN_GK', 'match', p_match_id, p_goalkeeper_id::text, NULL, NULL);
  RETURN TRUE;
END;
$function$;

-- ─── 4) Birleşik zaman çizelgesi ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_fetch_match_timeline(p_match_id uuid)
RETURNS TABLE(source text, event_type text, title text, detail text, actor text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT * FROM (
    SELECT 'EVENT'::text AS source, me.event_type AS event_type, me.title AS title,
           me.detail AS detail, me.actor_name AS actor, me.created_at AS created_at
    FROM public.match_events me WHERE me.match_id = p_match_id
    UNION ALL
    SELECT 'ADMIN', al.action, al.action, al.target_identifier, al.admin_name, al.created_at
    FROM public.admin_audit_log al WHERE al.target_id = p_match_id
    UNION ALL
    SELECT 'WALLET', wt.type, COALESCE(wt.description, wt.type),
           wt.amount::text || '₺ (' || COALESCE(wt.status,'-') || ')', NULL, wt.created_at
    FROM public.wallet_transactions wt WHERE wt.match_id = p_match_id
    UNION ALL
    SELECT 'PAYMENT', pi.status, 'Ödeme: ' || pi.status, pi.amount::text || '₺', NULL, pi.created_at
    FROM public.payment_intents pi WHERE pi.match_id = p_match_id
    UNION ALL
    SELECT 'NOTIFY', COALESCE(n.type_key,'NOTIFY'), n.title, n.body, NULL, n.created_at
    FROM public.notifications n WHERE n.match_id = p_match_id
    UNION ALL
    SELECT 'SERVICE', COALESCE(sr.provider_type,'') || ' ' || COALESCE(sr.status,''),
           'Hizmet: ' || COALESCE(sr.provider_type,''),
           COALESCE(sr.fee::text,'') || '₺ ' || COALESCE(sr.status,''), NULL, sr.created_at
    FROM public.service_requests sr WHERE sr.match_id = p_match_id
    UNION ALL
    SELECT 'SCORE', COALESCE(sp.status,'PROPOSED'), 'Skor önerisi',
           sp.home_score::text || '-' || sp.away_score::text, NULL, sp.created_at
    FROM public.match_score_proposals sp WHERE sp.match_id = p_match_id
    UNION ALL
    SELECT 'DISPUTE', COALESCE(d.status,'OPEN'), 'İtiraz: ' || COALESCE(d.status,''),
           COALESCE(d.resolution_notes, ''), NULL, d.created_at
    FROM public.match_disputes d WHERE d.match_id = p_match_id
  ) t
  ORDER BY t.created_at DESC NULLS LAST
  LIMIT 300;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_assign_match_goalkeeper(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_fetch_match_timeline(uuid)          FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_match_goalkeeper(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_match_timeline(uuid)          TO authenticated;
