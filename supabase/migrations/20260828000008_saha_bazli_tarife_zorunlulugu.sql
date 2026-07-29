-- ════════════════════════════════════════════════════════════════════════════
-- SAHA (KORT) BAZLI TARİFE ZORUNLULUĞU
-- ----------------------------------------------------------------------------
-- Ürün kararı: genel (tesis geneli) fiyatlandırma ekranı kapanıyor; fiyat ve
-- süre politikası artık HER SAHA (kort) için ayrı giriliyor (E1a: tarife
-- satırında; E5a: aynı tesiste farklı kortlar farklı süre alabilir; E12a: tek
-- veri, üç panel).
--
-- Bu dosyanın kapattığı DOĞRULANMIŞ boşluklar (canlıda 2026-07-29 sondajı):
--   A) pitches.is_open false→true  → `enforce_tariff_before_open` ÇALIŞIYOR ✅
--   B) courts.is_active false→true → HİÇBİR KAPI YOK ❌  (tarifesiz saha yayına
--      alınabiliyordu)
--   C) Kendi tarifesi olmayan kort yayına alınabiliyordu ❌
--   D) Açık tesisin TÜM tarifeleri silinince tesis AÇIK kalıyordu ❌
--   E) `create_pitch_booking` yayında olmayan (pasif) kort için rezervasyon
--      almayı engellemiyordu ❌
--
-- GERİYE DÖNÜK UYUM (K-0.2): hiçbir mevcut satır silinmez/değiştirilmez.
-- Kapılar YALNIZ geçişte (INSERT / false→true) çalışır; bugün yayında olan
-- 15 kortun hiçbiri kapanmaz. Tarifesiz olduğu tespit edilen 2 kort
-- (Cumhuriet Gençlik/"Cumhuriyet", Orduspor/"Açık") olduğu gibi kalır; bunlar
-- yeniden yayına alınmak istendiğinde tarife istenir.
--
-- Playbook Altın Kural 4: dosya idempotent (CREATE OR REPLACE / DROP IF EXISTS).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) KORT YAYIN KAPISI — tarifesi olmayan saha yayına alınamaz
-- ────────────────────────────────────────────────────────────────────────────
-- Yalnız GEÇİŞTE çalışır: INSERT (is_active=true) veya UPDATE false→true.
-- Zaten yayında olan bir kortun düzenlenmesi (upsertCourt her kayıtta is_active
-- gönderir) kapıyı TETİKLEMEZ — mevcut sahalar kapanmaz.
CREATE OR REPLACE FUNCTION public.enforce_court_tariff_before_activate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(NEW.is_active, true) = true
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_active, false) IS DISTINCT FROM true)
  THEN
    -- Aktiflik ölçütü fiyat çözümleyicisiyle (get_current_tariff_price) AYNI:
    -- COALESCE(is_active, true). Fiyat üreten bir satır "tarife yok" sayılamaz.
    IF NOT EXISTS (
      SELECT 1 FROM public.pitch_tariffs t
      WHERE t.court_id = NEW.id
        AND COALESCE(t.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'NO_COURT_TARIFF: Bu saha icin once fiyat politikasi girilmelidir. Tarifesiz saha yayina alinamaz.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_court_tariff_before_activate ON public.courts;
CREATE TRIGGER trg_enforce_court_tariff_before_activate
  BEFORE INSERT OR UPDATE OF is_active ON public.courts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_court_tariff_before_activate();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) TESİS YAYIN KAPISI — INSERT boşluğu kapatıldı
-- ────────────────────────────────────────────────────────────────────────────
-- Eski sürüm YALNIZ `BEFORE UPDATE OF is_open` idi; `pitches.is_open` varsayılanı
-- true olduğu için INSERT'te hiç denetlenmiyordu. Canlıda 2 tesis bu yoldan
-- 0 tarifeyle AÇIK kalmıştı.
--
-- INSERT'te HATA VERİLMEZ: tarife satırı FK gereği tesis satırından sonra
-- gelebilir, exception atmak tesis oluşturmayı imkânsız kılardı. Bunun yerine
-- yeni tesis sessizce KAPALI başlar; tarife girilince sahip/admin açar.
-- UPDATE davranışı (false→true'da NO_TARIFF) AYNEN korundu.
CREATE OR REPLACE FUNCTION public.enforce_tariff_before_open()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_open, true) = true AND NOT EXISTS (
      SELECT 1 FROM public.pitch_tariffs t
      WHERE t.pitch_id = NEW.id AND COALESCE(t.is_active, true) = true
    ) THEN
      NEW.is_open := false;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_open = true AND COALESCE(OLD.is_open, false) = false THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pitch_tariffs t
      WHERE t.pitch_id = NEW.id AND COALESCE(t.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'NO_TARIFF: Saha yayina alinmadan once en az bir aktif tarife girilmelidir (0 TL olabilir).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tariff_before_open ON public.pitches;
CREATE TRIGGER trg_enforce_tariff_before_open
  BEFORE INSERT OR UPDATE OF is_open ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tariff_before_open();

-- ────────────────────────────────────────────────────────────────────────────
-- 3) YAYINDAKİ TESİS TARİFESİZ BIRAKILAMAZ (boşluk D)
-- ────────────────────────────────────────────────────────────────────────────
-- DEFERRABLE INITIALLY DEFERRED şart: tarife kaydı DELETE + INSERT şeklinde
-- yapılıyor (owner_replace_tariffs / owner_replace_court_tariffs). Anlık bir
-- trigger DELETE adımında yanlışlıkla patlardı; ertelenmiş kontrol işlemin
-- SONUNDAKİ duruma bakar.
--
-- Yalnız DEĞİŞEN satırların tesisi denetlenir → bugün 0 tarifeyle açık duran
-- 2 tesis (hiç tarife satırı olmadığı için trigger hiç çalışmaz) etkilenmez.
CREATE OR REPLACE FUNCTION public.enforce_open_pitch_keeps_tariff()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_pitch uuid;
BEGIN
  v_pitch := COALESCE(NEW.pitch_id, OLD.pitch_id);
  IF v_pitch IS NULL THEN RETURN NULL; END IF;

  -- Tesis satırı yoksa (cascade silme) denetlenecek bir şey yok.
  IF NOT EXISTS (
    SELECT 1 FROM public.pitches p WHERE p.id = v_pitch AND COALESCE(p.is_open, false) = true
  ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pitch_tariffs t
    WHERE t.pitch_id = v_pitch AND COALESCE(t.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'NO_TARIFF: Yayindaki tesis tarifesiz birakilamaz. Once tesisi kapat, sonra tarifeleri kaldir.';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_open_pitch_keeps_tariff ON public.pitch_tariffs;
CREATE CONSTRAINT TRIGGER trg_open_pitch_keeps_tariff
  AFTER INSERT OR UPDATE OR DELETE ON public.pitch_tariffs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_pitch_keeps_tariff();

-- ────────────────────────────────────────────────────────────────────────────
-- 4) YAYINDA OLMAYAN KORTA UYGULAMA REZERVASYONU ALINMAZ (boşluk E)
-- ────────────────────────────────────────────────────────────────────────────
-- `create_pitch_booking` CREATE OR REPLACE edilmedi (Playbook AI kuralı 2:
-- gereksiz yere büyük fonksiyonu yeniden yazma). Kural additive bir trigger
-- olarak eklendi. OWNER_MANUAL kasıtlı olarak DIŞARIDA: sahip taslak sahaya
-- nakit/defter kaydı girebilmeli.
CREATE OR REPLACE FUNCTION public.enforce_active_court_for_app_booking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.source IN ('APP_BOOKING', 'APP_MATCH') AND NEW.court_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.courts c
      WHERE c.id = NEW.court_id AND COALESCE(c.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'COURT_NOT_PUBLISHED: Bu saha su an yayinda degil; rezervasyon alinamaz.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_active_court_for_app_booking ON public.pitch_bookings;
CREATE TRIGGER trg_enforce_active_court_for_app_booking
  BEFORE INSERT ON public.pitch_bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_active_court_for_app_booking();

-- ────────────────────────────────────────────────────────────────────────────
-- 5) KORT KAPSAMLI TARİFE KAYDI — owner_replace_court_tariffs
-- ────────────────────────────────────────────────────────────────────────────
-- Neden yeni RPC: `owner_replace_tariffs` TESİSİN TÜM tarifelerini siler
-- (full-replace). Saha bazlı ekrandan çağrılsaydı, bir sahanın fiyatını
-- kaydeden sahip diğer sahaların ve tesis geneli (legacy) tarifelerin hepsini
-- silerdi. Bu fonksiyon YALNIZ p_court_id'ye ait satırları değiştirir.
--
-- Yetki: can_manage_pitch → SAHİP + MÜDÜR (E14a). Personel giremez.
-- Kilit: E4a/A2a — rezervasyon bulunan gün/saatin slot süresi değiştirilemez;
-- o saatin tarifesi tamamen kaldırılamaz. Admin için kaçış yolu YOKTUR.
CREATE OR REPLACE FUNCTION public.owner_replace_court_tariffs(
  p_court_id uuid,
  p_tariffs  jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pitch    uuid;
  v_count    integer;
  v_conflict RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;

  SELECT c.pitch_id INTO v_pitch FROM public.courts c WHERE c.id = p_court_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'COURT_NOT_FOUND: Saha bulunamadi.'; END IF;
  IF NOT public.can_manage_pitch(v_pitch) THEN RAISE EXCEPTION 'UNAUTHORIZED: yetki yok.'; END IF;

  -- ── E4a/A2a KİLİDİ ──────────────────────────────────────────────────────
  -- "yeni_kume" = kaydettikten SONRA geçerli olacak tarife kümesi:
  --   gelen kort satırları  ∪  bu tesisin bu korta AİT OLMAYAN mevcut satırları
  -- (tesis geneli legacy satırlar dâhil). Böylece kilit gerçek son duruma bakar.
  WITH hedef AS (
    SELECT b.id, b.booking_date, b.start_time
    FROM public.pitch_bookings b
    WHERE b.court_id = p_court_id
      AND b.status IN ('PENDING', 'CONFIRMED')
      AND b.booking_date >= CURRENT_DATE
  ),
  yeni_kume AS (
    SELECT
      COALESCE(x->>'tariff_type', 'WEEKDAY') AS tariff_type,
      COALESCE((SELECT array_agg(d::int) FROM jsonb_array_elements_text(x->'applies_to_days') AS d),
               ARRAY[1,2,3,4,5]) AS applies_to_days,
      (x->>'start_time')::time AS start_time,
      (x->>'end_time')::time   AS end_time,
      CASE WHEN COALESCE((x->>'slot_minutes')::int, 60) IN (60,90,120)
           THEN (x->>'slot_minutes')::int ELSE 60 END AS slot_minutes,
      p_court_id AS court_id,
      NULLIF(x->>'valid_on', '')::date AS valid_on,
      COALESCE((x->>'is_active')::boolean, true) AS is_active,
      NULL::uuid AS id
    FROM jsonb_array_elements(COALESCE(p_tariffs, '[]'::jsonb)) AS x
    UNION ALL
    SELECT t.tariff_type, t.applies_to_days, t.start_time, t.end_time, t.slot_minutes,
           t.court_id, t.valid_on, COALESCE(t.is_active, true), t.id
    FROM public.pitch_tariffs t
    WHERE t.pitch_id = v_pitch AND t.court_id IS DISTINCT FROM p_court_id
  )
  SELECT h.booking_date, h.start_time, eski.slot_minutes AS eski, yeni.dk AS yeni
  INTO v_conflict
  FROM hedef h
  JOIN LATERAL (
    SELECT t.slot_minutes
    FROM public.get_current_tariff_price(v_pitch, h.booking_date, h.start_time, p_court_id) t
  ) eski ON true
  LEFT JOIN LATERAL (
    SELECT k.slot_minutes AS dk
    FROM yeni_kume k
    WHERE k.is_active
      AND EXTRACT(ISODOW FROM h.booking_date)::int = ANY(k.applies_to_days)
      AND h.start_time >= k.start_time
      AND (h.start_time < k.end_time OR k.end_time = TIME '00:00')
      AND (k.court_id IS NULL OR k.court_id = p_court_id)
      AND (k.valid_on IS NULL OR k.valid_on = h.booking_date)
    ORDER BY
      CASE WHEN k.valid_on IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN k.court_id IS NOT NULL AND k.court_id = p_court_id THEN 0 ELSE 1 END,
      CASE k.tariff_type WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2 WHEN 'WEEKDAY' THEN 3 ELSE 4 END,
      k.id
    LIMIT 1
  ) yeni ON true
  WHERE eski.slot_minutes IS DISTINCT FROM yeni.dk
  LIMIT 1;

  IF FOUND THEN
    IF v_conflict.yeni IS NULL THEN
      RAISE EXCEPTION 'TARIFF_REQUIRED_FOR_BOOKING: % tarihinde %:% saatinde rezervasyon var; o saati tarifesiz birakamazsin. Once rezervasyonu iptal et ya da o saati kapsayan bir tarife birak.',
        to_char(v_conflict.booking_date, 'DD.MM.YYYY'),
        to_char(v_conflict.start_time, 'HH24'), to_char(v_conflict.start_time, 'MI');
    ELSE
      RAISE EXCEPTION 'SLOT_MINUTES_LOCKED: % tarihinde %:% saatinde rezervasyon var; o saatin slot süresi (% dk) değiştirilemez. Önce rezervasyonu iptal et ya da o saat aralığının süresini olduğu gibi bırak.',
        to_char(v_conflict.booking_date, 'DD.MM.YYYY'),
        to_char(v_conflict.start_time, 'HH24'), to_char(v_conflict.start_time, 'MI'),
        v_conflict.eski;
    END IF;
  END IF;

  -- ── Atomik değişim: YALNIZ bu kortun satırları ──────────────────────────
  DELETE FROM public.pitch_tariffs
  WHERE pitch_id = v_pitch AND court_id = p_court_id;

  INSERT INTO public.pitch_tariffs (
    pitch_id, name, tariff_type, applies_to_days, start_time, end_time,
    slot_price, slot_minutes, deposit_amount, sort_order, is_active, court_id, valid_on
  )
  SELECT
    v_pitch,
    COALESCE(NULLIF(t->>'name', ''), 'Saha Tarifesi'),
    COALESCE(t->>'tariff_type', 'WEEKDAY'),
    COALESCE((SELECT array_agg(x::int) FROM jsonb_array_elements_text(t->'applies_to_days') AS x),
             ARRAY[1,2,3,4,5]),
    (t->>'start_time')::time,
    (t->>'end_time')::time,
    COALESCE((t->>'slot_price')::numeric, (t->>'price_per_hour')::numeric, 0),
    CASE WHEN COALESCE((t->>'slot_minutes')::int, 60) IN (60,90,120)
         THEN (t->>'slot_minutes')::int ELSE 60 END,
    COALESCE((t->>'deposit_amount')::numeric, 0),
    COALESCE((t->>'sort_order')::int, 0),
    COALESCE((t->>'is_active')::boolean, true),
    p_court_id,  -- kort kimliği SUNUCUDA sabitlenir; istemci başka kort yazamaz
    NULLIF(t->>'valid_on', '')::date
  FROM jsonb_array_elements(COALESCE(p_tariffs, '[]'::jsonb)) AS t;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_replace_court_tariffs(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_replace_court_tariffs(uuid, jsonb) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) TARİFESİZ SAHA RAPORU — arayüzün "önce fiyat politikası gir" çağrısı
-- ────────────────────────────────────────────────────────────────────────────
-- Sahip/müdür paneli ve admin paneli aynı kaynaktan okur (K-0.3: tek veri).
CREATE OR REPLACE FUNCTION public.courts_tariff_status(p_pitch_id uuid)
RETURNS TABLE(court_id uuid, court_name text, is_active boolean, own_tariff_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.name, COALESCE(c.is_active, true),
         (SELECT COUNT(*)::int FROM public.pitch_tariffs t
          WHERE t.court_id = c.id AND COALESCE(t.is_active, true) = true)
  FROM public.courts c
  WHERE c.pitch_id = p_pitch_id
    AND public.can_staff_pitch(p_pitch_id)
  ORDER BY c.sort_order, c.name;
$$;

REVOKE ALL ON FUNCTION public.courts_tariff_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courts_tariff_status(uuid) TO authenticated;
