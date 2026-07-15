-- ════════════════════════════════════════════════════════════════════════
-- VİTRİN ROZET YETKİSİ + MÜSAİTLİK VERİSİ DÜZELTMESİ
-- ------------------------------------------------------------------------
-- Amaç (kullanıcı kararı):
--  1) Vitrin kartındaki üç rozet ADMIN kontrolüne alınır:
--     • is_featured           → "Öne Çıkan" (mevcut kolon; artık gerçekten korumalı)
--     • flash_deals_enabled   → flash "İndirim" rozetinin vitrine yansıması (YENİ)
--     • show_availability_badge → "Bugün X saat müsait" rozeti (YENİ)
--     Üçü de VARSAYILAN KAPALI (admin açar) — kart, admin açmadıkça sade kalır.
--  2) Güvenlik açığı kapatılır: pitches UPDATE RLS'i owner'a kendi satırında
--     izin verir; kimlik-koruma trigger'ı yalnız ad/konum alanlarını korurdu →
--     owner, UI'da buton olmasa bile ham API çağrısıyla is_featured=true
--     yapabilirdi. Yeni protect_pitch_admin_flags trigger'ı bu üç bayrağı
--     admin dışı HER yazma yolu için kilitler.
--  3) Veri doğruluğu: "Bugün X saat müsait" rozeti pitch_bookings'i doğrudan
--     sorguluyordu; SELECT RLS (kendi rezervasyonu/sahibi/admin) yüzünden
--     sıradan oyuncu başkalarının dolu saatlerini boş sayıyordu (aşırı iyimser)
--     ve misafir hiç göremiyordu. Yeni get_showcase_availability RPC'si
--     KİŞİSEL VERİ İÇERMEDEN (ad/telefon yok) tüm yayınlanmış sahaların o
--     günkü doluluğunu + kapanış istisnalarını anon+authenticated'a verir.
-- Referans: docs/master/VITRIN_ROZET_YETKISI_VE_FILTRE_DOGRULUK_PLANI.md
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) Yeni admin bayrakları ──────────────────────────────────────────────
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS flash_deals_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.pitches.flash_deals_enabled IS
  'Admin kontrollü: true ise sahanın flash indirim kampanyaları vitrinde gösterilir. Varsayılan kapalı — admin açar.';

ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS show_availability_badge boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.pitches.show_availability_badge IS
  'Admin kontrollü: true ise vitrin kartında "Bugün X saat müsait" rozeti gösterilir. Varsayılan kapalı — admin açar.';

-- ─── 2) Admin-only bayrak koruma trigger'ı ─────────────────────────────────
-- protect_pitch_identity_fields ile aynı kalıp: admin değilse ve bu üç bayraktan
-- biri değişiyorsa reddet. Böylece RPC, servis düz-update ve ham PostgREST dahil
-- TÜM yollar tek noktadan korunur. (İki trigger da BEFORE UPDATE; sıradan
-- owner güncellemesi diğer alanları etkilemediği sürece ikisi de geçer.)
CREATE OR REPLACE FUNCTION public.protect_pitch_admin_flags()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.is_featured             IS DISTINCT FROM OLD.is_featured
     OR NEW.flash_deals_enabled     IS DISTINCT FROM OLD.flash_deals_enabled
     OR NEW.show_availability_badge IS DISTINCT FROM OLD.show_availability_badge THEN
    RAISE EXCEPTION 'PITCH_ADMIN_FLAG_CHANGE_FORBIDDEN'
      USING HINT = 'Öne Çıkan / flash izni / müsaitlik rozeti yalnız platform yöneticisi tarafından değiştirilebilir.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_pitch_admin_flags ON public.pitches;
CREATE TRIGGER trg_protect_pitch_admin_flags
  BEFORE UPDATE ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.protect_pitch_admin_flags();

-- ─── 3) admin_update_pitch: iki yeni bayrağı payload'dan al ─────────────────
-- Not: fonksiyonun canlı gövdesi 20260710000006_admin_rbac_wrappers.sql'den
-- okunarak birebir korundu; yalnız SET listesine iki satır eklendi.
CREATE OR REPLACE FUNCTION public.admin_update_pitch(p_pitch_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  -- Sahiplik devri koruması: owner_id değişiyorsa yalnız SUPER_ADMIN.
  IF (p_payload ? 'owner_id')
     AND NULLIF(p_payload->>'owner_id','')::uuid IS DISTINCT FROM
         (SELECT owner_id FROM public.pitches WHERE id = p_pitch_id)
     AND NOT public.has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Tesis sahipliği devri yalnız SUPER_ADMIN tarafından yapılabilir';
  END IF;
  SELECT to_jsonb(p.*) INTO v_old FROM public.pitches p WHERE id = p_pitch_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Saha bulunamadı'; END IF;
  UPDATE public.pitches SET
    name = COALESCE(p_payload->>'name', name),
    district = COALESCE(p_payload->>'district', district),
    city = COALESCE(p_payload->>'city', city),
    address = COALESCE(p_payload->>'address', address),
    latitude = COALESCE((p_payload->>'latitude')::double precision, latitude),
    longitude = COALESCE((p_payload->>'longitude')::double precision, longitude),
    price_per_match = COALESCE((p_payload->>'price_per_match')::numeric, price_per_match),
    google_rating = COALESCE((p_payload->>'google_rating')::numeric, google_rating),
    google_review_count = COALESCE((p_payload->>'google_review_count')::int, google_review_count),
    verification_status = COALESCE(p_payload->>'verification_status', verification_status),
    image = COALESCE(p_payload->>'image', image),
    description = CASE WHEN p_payload ? 'description' THEN NULLIF(p_payload->>'description', '') ELSE description END,
    amenities = CASE WHEN p_payload ? 'amenities' THEN p_payload->'amenities' ELSE amenities END,
    working_hours = CASE WHEN p_payload ? 'working_hours' THEN p_payload->'working_hours' ELSE working_hours END,
    is_published = COALESCE((p_payload->>'is_published')::boolean, is_published),
    is_featured = COALESCE((p_payload->>'is_featured')::boolean, is_featured),
    flash_deals_enabled = COALESCE((p_payload->>'flash_deals_enabled')::boolean, flash_deals_enabled),
    show_availability_badge = COALESCE((p_payload->>'show_availability_badge')::boolean, show_availability_badge),
    is_active = COALESCE((p_payload->>'is_active')::boolean, is_active),
    owner_id = CASE WHEN p_payload ? 'owner_id' THEN NULLIF(p_payload->>'owner_id', '')::uuid ELSE owner_id END
  WHERE id = p_pitch_id;
  PERFORM public.log_admin_action('PITCH_UPDATE', 'pitch', p_pitch_id, p_payload->>'name', v_old, p_payload);
  RETURN TRUE;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_pitch(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_pitch(uuid, jsonb) TO authenticated;

-- ─── 4) Vitrin müsaitlik RPC'si (kişisel veri içermez) ─────────────────────
-- Tüm yayınlanmış + onaylı + açık sahaların p_date günündeki iptal-olmayan
-- rezervasyonları (court_id, saat, status) VE o güne denk gelen kapanış
-- istisnaları (exception_type='HOLIDAY' vb.) tek çağrıda döner. Müşteri adı/
-- telefonu ASLA dönmez → anon+authenticated'a güvenle GRANT edilir.
-- kind: 'BOOKING' (dolu slot) | 'CLOSURE' (kapatılmış aralık).
DROP FUNCTION IF EXISTS public.get_showcase_availability(date);
CREATE OR REPLACE FUNCTION public.get_showcase_availability(p_date date)
RETURNS TABLE(
  pitch_id uuid,
  court_id uuid,
  kind text,
  start_time time,
  end_time time,
  status text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.pitch_id, b.court_id, 'BOOKING'::text AS kind,
         b.start_time, b.end_time, b.status::text
  FROM public.pitch_bookings b
  JOIN public.pitches p ON p.id = b.pitch_id
  WHERE b.booking_date = p_date
    AND b.status <> 'CANCELLED'
    AND p.is_published = true
    AND p.verification_status = 'approved'
  UNION ALL
  SELECT ex.pitch_id, ex.court_id, 'CLOSURE'::text AS kind,
         ex.start_time, ex.end_time, ex.exception_type::text
  FROM public.pitch_availability_exceptions ex
  JOIN public.pitches p ON p.id = ex.pitch_id
  WHERE p.is_published = true
    AND p.verification_status = 'approved'
    AND (
      ex.exception_date = p_date
      OR (ex.is_recurring = true AND ex.day_of_week = (EXTRACT(ISODOW FROM p_date))::int)
    );
$$;
REVOKE ALL ON FUNCTION public.get_showcase_availability(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_showcase_availability(date) TO anon, authenticated;

COMMENT ON FUNCTION public.get_showcase_availability(date) IS
  'Vitrin "Bugün X saat müsait" rozeti için kişisel-veri-içermeyen doluluk kaynağı. Yayınlanmış+onaylı sahaların o günkü rezervasyon doluluğu ve kapanış istisnaları.';
