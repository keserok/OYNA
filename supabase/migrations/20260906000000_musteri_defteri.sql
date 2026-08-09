-- ═══════════════════════════════════════════════════════════════════════════
-- MÜŞTERİ (MÜDAVİM) DEFTERİ — tasarım: docs/master/MUSTERI_DEFTERI_TASARIMI.md
-- 8 kurucu kararı (9 Ağustos 2026). Prensip 7.7: migration kendi doğrulamasını
-- taşır — beklenen yapı oluşmadıysa migration hata verir.
--
-- Karar özeti: kayıtlar kendiliğinden düşer (manuel rezervasyon + veresiye +
-- abonman) + elle ekleme; geçmişten bir kerelik doldurma; personel de kullanır;
-- telefonsuz eski kayıtlar "telefonu eksik" olarak girer (telefon = kimlik).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Telefon normalizasyonu — utils/whatsapp.ts (waNumber) ile AYNI kural.
--    11 haneden kısa sonuç "gerçek telefon" sayılmaz (NULL döner) ki çöp
--    girişler yanlışlıkla iki müşteriyi birleştirmesin.
CREATE OR REPLACE FUNCTION public._tr_telefon_norm(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
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
$$;

-- 2) Defter tablosu — tesise özel; RLS personel dahil ekip modeliyle.
CREATE TABLE IF NOT EXISTS public.pitch_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  phone_norm text GENERATED ALWAYS AS (public._tr_telefon_norm(phone)) STORED,
  is_demo boolean NOT NULL DEFAULT false,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_on date
);

-- Telefon = kimlik: aynı tesiste aynı normalize telefon tek kayıttır.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pitch_customers_phone
  ON public.pitch_customers (pitch_id, phone_norm) WHERE phone_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pitch_customers_pitch_name
  ON public.pitch_customers (pitch_id, lower(name));

ALTER TABLE public.pitch_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pc_staff_select ON public.pitch_customers;
CREATE POLICY pc_staff_select ON public.pitch_customers
  FOR SELECT TO authenticated USING (public.can_staff_pitch(pitch_id));
DROP POLICY IF EXISTS pc_staff_insert ON public.pitch_customers;
CREATE POLICY pc_staff_insert ON public.pitch_customers
  FOR INSERT TO authenticated WITH CHECK (public.can_staff_pitch(pitch_id));
DROP POLICY IF EXISTS pc_staff_update ON public.pitch_customers;
CREATE POLICY pc_staff_update ON public.pitch_customers
  FOR UPDATE TO authenticated
  USING (public.can_staff_pitch(pitch_id)) WITH CHECK (public.can_staff_pitch(pitch_id));
DROP POLICY IF EXISTS pc_manage_delete ON public.pitch_customers;
CREATE POLICY pc_manage_delete ON public.pitch_customers
  FOR DELETE TO authenticated USING (public.can_manage_pitch(pitch_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pitch_customers TO authenticated;

-- 3) Upsert çekirdeği — tetikleyiciler ve geçmiş doldurma bunu kullanır.
--    Telefonlu: telefon anahtarıyla birleşir, ad tazelenir (en yeni ad kazanır).
--    Telefonsuz (karar 8): aynı isimli telefonsuz kayıt varsa tazelenir, yoksa açılır.
CREATE OR REPLACE FUNCTION public._musteri_defterine_isle(
  p_pitch_id uuid, p_name text, p_phone text, p_seen_on date DEFAULT NULL
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public', 'pg_temp' AS $$
DECLARE
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_norm text := public._tr_telefon_norm(p_phone);
  v_demo boolean;
BEGIN
  IF p_pitch_id IS NULL OR v_name IS NULL THEN RETURN; END IF;
  -- Genel yer tutucu adlar defteri şişirmesin.
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
END $$;
REVOKE EXECUTE ON FUNCTION public._musteri_defterine_isle(uuid, text, text, date) FROM PUBLIC, anon, authenticated;

-- 4) Tetikleyiciler — kayıtlar kendiliğinden düşer (karar 1).
--    Rezervasyonda yalnız OWNER_MANUAL + SUBSCRIPTION kaynaklı satırlar işlenir:
--    uygulama içi (APP) rezervasyonlar OYNA kullanıcısıdır, telefon defterine girmez.
CREATE OR REPLACE FUNCTION public._trg_musteri_from_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF coalesce(NEW.source, '') IN ('OWNER_MANUAL', 'SUBSCRIPTION') THEN
    PERFORM public._musteri_defterine_isle(NEW.pitch_id, NEW.customer_name, NEW.customer_phone, NEW.booking_date);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_musteri_booking ON public.pitch_bookings;
CREATE TRIGGER trg_musteri_booking AFTER INSERT ON public.pitch_bookings
  FOR EACH ROW EXECUTE FUNCTION public._trg_musteri_from_booking();

CREATE OR REPLACE FUNCTION public._trg_musteri_from_debtor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  PERFORM public._musteri_defterine_isle(NEW.pitch_id, NEW.name, NEW.phone, coalesce(NEW.last_match_date, CURRENT_DATE));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_musteri_debtor ON public.pitch_debtors;
CREATE TRIGGER trg_musteri_debtor AFTER INSERT ON public.pitch_debtors
  FOR EACH ROW EXECUTE FUNCTION public._trg_musteri_from_debtor();

CREATE OR REPLACE FUNCTION public._trg_musteri_from_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  PERFORM public._musteri_defterine_isle(NEW.pitch_id, NEW.customer_name, NEW.customer_phone, coalesce(NEW.start_date, CURRENT_DATE));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_musteri_subscription ON public.pitch_subscriptions;
CREATE TRIGGER trg_musteri_subscription AFTER INSERT ON public.pitch_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._trg_musteri_from_subscription();

-- 5) "Gelmedi" işareti (karar 6) — kart istatistiği için.
--    Geçmişte veresiyeye yazma ile "gelmedi" ayrımı tutulmadığından geriye dönük
--    işaretleme YAPILMAZ (dürüst sayım); bundan sonrası panelin Gelmedi düğmesiyle işlenir.
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS no_show boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.booking_gelmedi_isaretle(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public', 'pg_temp' AS $$
DECLARE v_pitch uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT pitch_id INTO v_pitch FROM public.pitch_bookings WHERE id = p_booking_id;
  IF v_pitch IS NULL OR NOT public.can_staff_pitch(v_pitch) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE public.pitch_bookings SET no_show = true WHERE id = p_booking_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.booking_gelmedi_isaretle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_gelmedi_isaretle(uuid) TO authenticated;

-- 6) Geçmişten doldurma (karar 2 + 8) — eskiden yeniye sırayla işlenir ki
--    en güncel ad kazansın. Ölçek küçük (yüzlerce satır), döngü güvenli.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT b.pitch_id, b.customer_name AS ad, b.customer_phone AS tel, b.booking_date AS seen
    FROM public.pitch_bookings b
    WHERE b.customer_name IS NOT NULL
      AND coalesce(b.source, '') IN ('OWNER_MANUAL', 'SUBSCRIPTION')
      AND b.status <> 'CANCELLED'
    ORDER BY b.booking_date ASC, b.created_at ASC
  LOOP
    PERFORM public._musteri_defterine_isle(r.pitch_id, r.ad, r.tel, r.seen);
  END LOOP;

  FOR r IN
    SELECT d.pitch_id, d.name AS ad, d.phone AS tel,
           coalesce(d.last_match_date, d.created_at::date) AS seen
    FROM public.pitch_debtors d
    ORDER BY d.created_at ASC
  LOOP
    PERFORM public._musteri_defterine_isle(r.pitch_id, r.ad, r.tel, r.seen);
  END LOOP;

  FOR r IN
    SELECT s.pitch_id, s.customer_name AS ad, s.customer_phone AS tel,
           coalesce(s.start_date, CURRENT_DATE) AS seen
    FROM public.pitch_subscriptions s
    WHERE s.customer_name IS NOT NULL
    ORDER BY s.created_at ASC
  LOOP
    PERFORM public._musteri_defterine_isle(r.pitch_id, r.ad, r.tel, r.seen);
  END LOOP;
END $$;

-- 7) Öneri araması — SECURITY INVOKER: satır erişimini RLS belirler (personel dahil).
CREATE OR REPLACE FUNCTION public.search_pitch_customers(p_pitch_id uuid, p_q text)
RETURNS TABLE (id uuid, name text, phone text, phone_missing boolean, last_seen_on date)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = 'public', 'pg_temp' AS $$
DECLARE
  v_q text := btrim(coalesce(p_q, ''));
  v_qnorm text := regexp_replace(btrim(coalesce(p_q, '')), '\D', '', 'g');
BEGIN
  IF length(v_q) < 2 THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.phone, (c.phone_norm IS NULL) AS phone_missing, c.last_seen_on
  FROM public.pitch_customers c
  WHERE c.pitch_id = p_pitch_id
    AND (
      lower(c.name) LIKE '%' || lower(v_q) || '%'
      OR (length(v_qnorm) >= 3 AND c.phone_norm LIKE '%' || v_qnorm || '%')
    )
  ORDER BY coalesce(c.last_seen_on, '1900-01-01'::date) DESC, lower(c.name) ASC
  LIMIT 8;
END $$;
REVOKE EXECUTE ON FUNCTION public.search_pitch_customers(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_pitch_customers(uuid, text) TO authenticated;

-- 8) Müşteri kartı — rezervasyon geçmişi/istatistik/veresiye tek çağrıda.
--    SECURITY DEFINER: rezervasyon ve veresiye tablolarını okur; yetki başta
--    can_staff_pitch ile denetlenir (personel de görebilir — karar 4).
CREATE OR REPLACE FUNCTION public.musteri_karti(p_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public', 'pg_temp' AS $$
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
END $$;
REVOKE EXECUTE ON FUNCTION public.musteri_karti(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.musteri_karti(uuid) TO authenticated;

-- 9) Kendi doğrulaması (prensip 7.7) — yapı eksikse migration DURUR.
DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pitch_customers') THEN
    RAISE EXCEPTION 'DOGRULAMA: pitch_customers tablosu olusmadi';
  END IF;
  IF NOT (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pitch_customers') THEN
    RAISE EXCEPTION 'DOGRULAMA: pitch_customers RLS kapali';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pitch_customers';
  IF n < 4 THEN RAISE EXCEPTION 'DOGRULAMA: politika eksik (% adet)', n; END IF;
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgname IN ('trg_musteri_booking', 'trg_musteri_debtor', 'trg_musteri_subscription') AND NOT tgisinternal;
  IF n < 3 THEN RAISE EXCEPTION 'DOGRULAMA: tetikleyici eksik (% adet)', n; END IF;
  IF public._tr_telefon_norm('0532 123 45 67') <> '905321234567'
     OR public._tr_telefon_norm('532 123 45 67') <> '905321234567'
     OR public._tr_telefon_norm('abc') IS NOT NULL THEN
    RAISE EXCEPTION 'DOGRULAMA: telefon normalizasyonu hatali';
  END IF;
  SELECT count(*) INTO n FROM public.pitch_customers;
  RAISE NOTICE 'MUSTERI DEFTERI kuruldu — % kayitla basladi', n;
END $$;
