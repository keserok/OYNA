-- ════════════════════════════════════════════════════════════════════════════
-- MÜŞTERİ DEFTERİ — saha sahibinin müşteri kartoteği (canlıdan geri çıkarıldı)
-- ════════════════════════════════════════════════════════════════════════════
--
-- KAYNAK: Bu iş 17 Ağustos 2026 sularında canlıya bant-dışı uygulandı; defter
-- (schema_migrations) yalnız "tam metin depoda" işaretini taşıyor ama dosya
-- hiç commit edilmemişti. Bu dosya, 2026-08-17 veritabanı denetimi sırasında
-- CANLI ŞEMADAN birebir geri çıkarıldı: fonksiyon gövdeleri pg_get_functiondef
-- çıktısıdır (md5 doğrulamalı), tablo/politika/indeks tanımları canlı
-- kataloğundan okunmuştur. Playbook Kural 1 gereği defter sürümüyle aynı adla
-- eklenmiştir; canlıda zaten uygulandığı için oraya tekrar gitmez, sıfırdan
-- kurulumda (preview replay) şemayı birebir üretir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Telefon normalizasyonu (generated kolonun bağımlılığı) ──────────────
CREATE OR REPLACE FUNCTION public._tr_telefon_norm(p_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN length(n.y) >= 11 THEN n.y ELSE NULL END
  FROM (
    SELECT CASE
      WHEN d.x = '' THEN ''
      WHEN d.x LIKE '0%' THEN '90' || substr(d.x, 2)
      WHEN length(d.x) = 10 THEN '90' || d.x
      ELSE d.x
    END AS y
    FROM (SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS x) d
  ) n;
$function$;

-- ── 2 · Tablo ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pitch_customers (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id     uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  name         text NOT NULL,
  phone        text,
  phone_norm   text GENERATED ALWAYS AS (_tr_telefon_norm(phone)) STORED,
  note         text,
  is_demo      boolean NOT NULL DEFAULT false,
  last_seen_on date,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pitch_customers_pitch_name
  ON public.pitch_customers (pitch_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS ux_pitch_customers_phone
  ON public.pitch_customers (pitch_id, phone_norm) WHERE phone_norm IS NOT NULL;

ALTER TABLE public.pitch_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pc_staff_select ON public.pitch_customers;
CREATE POLICY pc_staff_select ON public.pitch_customers
  FOR SELECT TO authenticated USING (can_staff_pitch(pitch_id));
DROP POLICY IF EXISTS pc_staff_insert ON public.pitch_customers;
CREATE POLICY pc_staff_insert ON public.pitch_customers
  FOR INSERT TO authenticated WITH CHECK (can_staff_pitch(pitch_id));
DROP POLICY IF EXISTS pc_staff_update ON public.pitch_customers;
CREATE POLICY pc_staff_update ON public.pitch_customers
  FOR UPDATE TO authenticated USING (can_staff_pitch(pitch_id)) WITH CHECK (can_staff_pitch(pitch_id));
DROP POLICY IF EXISTS pc_manage_delete ON public.pitch_customers;
CREATE POLICY pc_manage_delete ON public.pitch_customers
  FOR DELETE TO authenticated USING (can_manage_pitch(pitch_id));

-- ── 3 · Deftere işleyen çekirdek (service tarafı; API rollerine kapalı) ─────
CREATE OR REPLACE FUNCTION public._musteri_defterine_isle(p_pitch_id uuid, p_name text, p_phone text, p_seen_on date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_norm text := public._tr_telefon_norm(p_phone);
  v_demo boolean;
BEGIN
  IF p_pitch_id IS NULL OR v_name IS NULL THEN RETURN; END IF;
  IF lower(v_name) IN ('misafir', 'müşteri', 'musteri') THEN RETURN; END IF;
  SELECT coalesce(is_demo, false) INTO v_demo FROM public.pitches WHERE id = p_pitch_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_norm IS NOT NULL THEN
    INSERT INTO public.pitch_customers (pitch_id, name, phone, is_demo, last_seen_on)
    VALUES (p_pitch_id, v_name, btrim(p_phone), v_demo, p_seen_on)
    ON CONFLICT (pitch_id, phone_norm) WHERE phone_norm IS NOT NULL
    DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      last_seen_on = CASE
        WHEN EXCLUDED.last_seen_on IS NULL THEN pitch_customers.last_seen_on
        WHEN pitch_customers.last_seen_on IS NULL THEN EXCLUDED.last_seen_on
        ELSE GREATEST(pitch_customers.last_seen_on, EXCLUDED.last_seen_on)
      END,
      updated_at = now();
  ELSE
    UPDATE public.pitch_customers SET
      last_seen_on = CASE
        WHEN p_seen_on IS NULL THEN last_seen_on
        WHEN last_seen_on IS NULL THEN p_seen_on
        ELSE GREATEST(last_seen_on, p_seen_on)
      END,
      updated_at = now()
    WHERE pitch_id = p_pitch_id AND phone_norm IS NULL AND lower(name) = lower(v_name);
    IF NOT FOUND THEN
      INSERT INTO public.pitch_customers (pitch_id, name, is_demo, last_seen_on)
      VALUES (p_pitch_id, v_name, v_demo, p_seen_on);
    END IF;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public._musteri_defterine_isle(uuid, text, text, date)
  FROM PUBLIC, anon, authenticated;

-- ── 4 · Tetikleyici fonksiyonlar + tetikleyiciler ────────────────────────────
CREATE OR REPLACE FUNCTION public._trg_musteri_from_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(NEW.source, '') IN ('OWNER_MANUAL', 'SUBSCRIPTION') THEN
    PERFORM public._musteri_defterine_isle(NEW.pitch_id, NEW.customer_name, NEW.customer_phone, NEW.booking_date);
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public._trg_musteri_from_debtor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._musteri_defterine_isle(NEW.pitch_id, NEW.name, NEW.phone, coalesce(NEW.last_match_date, CURRENT_DATE));
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public._trg_musteri_from_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._musteri_defterine_isle(NEW.pitch_id, NEW.customer_name, NEW.customer_phone, coalesce(NEW.start_date, CURRENT_DATE));
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_musteri_booking ON public.pitch_bookings;
CREATE TRIGGER trg_musteri_booking AFTER INSERT ON public.pitch_bookings
  FOR EACH ROW EXECUTE FUNCTION _trg_musteri_from_booking();
DROP TRIGGER IF EXISTS trg_musteri_debtor ON public.pitch_debtors;
CREATE TRIGGER trg_musteri_debtor AFTER INSERT ON public.pitch_debtors
  FOR EACH ROW EXECUTE FUNCTION _trg_musteri_from_debtor();
DROP TRIGGER IF EXISTS trg_musteri_subscription ON public.pitch_subscriptions;
CREATE TRIGGER trg_musteri_subscription AFTER INSERT ON public.pitch_subscriptions
  FOR EACH ROW EXECUTE FUNCTION _trg_musteri_from_subscription();

-- ── 5 · Müşteri kartı RPC (personel görünümü) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.musteri_karti(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c public.pitch_customers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO c FROM public.pitch_customers WHERE id = p_customer_id;
  IF NOT FOUND OR NOT public.can_staff_pitch(c.pitch_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  RETURN (
    WITH m AS (
      SELECT b.* FROM public.pitch_bookings b
      WHERE b.pitch_id = c.pitch_id AND (
        (c.phone_norm IS NOT NULL AND public._tr_telefon_norm(b.customer_phone) = c.phone_norm)
        OR (c.phone_norm IS NULL AND lower(coalesce(b.customer_name, '')) = lower(c.name))
      )
    )
    SELECT jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'phone', c.phone,
      'phone_missing', c.phone_norm IS NULL,
      'note', c.note,
      'toplam', (SELECT count(*) FROM m WHERE m.status <> 'CANCELLED'),
      'iptal', (SELECT count(*) FROM m WHERE m.status = 'CANCELLED'),
      'gelmedi', (SELECT count(*) FROM m WHERE m.no_show),
      'son_gelis', (SELECT max(m.booking_date) FROM m WHERE m.status <> 'CANCELLED'),
      'veresiye', (
        SELECT coalesce(sum(d.amount_owed), 0) FROM public.pitch_debtors d
        WHERE d.pitch_id = c.pitch_id AND NOT coalesce(d.is_resolved, false) AND (
          (c.phone_norm IS NOT NULL AND public._tr_telefon_norm(d.phone) = c.phone_norm)
          OR (c.phone_norm IS NULL AND lower(d.name) = lower(c.name))
        )
      ),
      'son_rezervasyonlar', (
        SELECT coalesce(jsonb_agg(s.x), '[]'::jsonb) FROM (
          SELECT jsonb_build_object(
            'booking_date', m2.booking_date,
            'start_time', to_char(m2.start_time, 'HH24:MI'),
            'end_time', to_char(m2.end_time, 'HH24:MI'),
            'court_id', m2.court_id,
            'court', (SELECT cc.name FROM public.courts cc WHERE cc.id = m2.court_id),
            'price', m2.price,
            'status', m2.status,
            'no_show', m2.no_show
          ) AS x
          FROM m m2 ORDER BY m2.booking_date DESC, m2.start_time DESC LIMIT 5
        ) s
      )
    )
  );
END $function$;
REVOKE ALL ON FUNCTION public.musteri_karti(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.musteri_karti(uuid) TO authenticated;

-- ── 6 · Doğrulama (7.7: göç kendi kanıtını taşır) ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pitch_customers'
      AND column_name = 'phone_norm' AND is_generated = 'ALWAYS'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: pitch_customers.phone_norm generated kolonu yok';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgname IN ('trg_musteri_booking','trg_musteri_debtor','trg_musteri_subscription')
        AND NOT tgisinternal) <> 3 THEN
    RAISE EXCEPTION 'DOGRULAMA: musteri defteri tetikleyicileri eksik';
  END IF;
END $$;
