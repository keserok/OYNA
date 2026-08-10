-- ════════════════════════════════════════════════════════════════════════════
-- [SEC-1 + DB-4] PSP SIRLARI HERKESE-AÇIK TABLODAN ÇIKARILDI +
--                KULLANICI-AKTİVİTE TABLOLARININ OKUMASI DARALTILDI
-- ----------------------------------------------------------------------------
-- SORUN 1 (SEC-1) — `pitches` tablosundaki ödeme sağlayıcı (PSP) sırları:
--   `pitches_select_anon` / `pitches_select_auth` politikaları YALNIZ SATIR
--   bazlı süzüyor (is_demo). Sütun düzeyinde hiçbir koruma yok; bu yüzden
--   GİRİŞ YAPMAMIŞ bir ziyaretçi bile şunları okuyabiliyordu:
--     param_api_key · param_merchant_id · param_client_id
--   (bkz. 20260810000000_convergence_rls_faz2b.sql:258-259)
--
-- SORUN 2 (DB-4) — kullanıcı-aktivite tabloları `TO public USING (true)`:
--   pitch_slot_holds (:234) · match_registrations (:153) · waitlist (:378)
--   match_participants (:147) · individual_matches (:128)
--   Kim, hangi maça, ne zaman kaydolmuş — tamamı anonim okunabiliyordu.
--
-- ════════════════════════════════════════════════════════════════════════════
-- SEC-1 İÇİN SEÇİLEN YÖNTEM — VE `REVOKE SELECT` NEDEN KULLANILMADI
-- ----------------------------------------------------------------------------
-- İlk plan `matches` için 20260803234421'de uygulanan sütun-izni desenini
-- SELECT'e taşımaktı:
--     REVOKE SELECT ON public.pitches FROM anon, authenticated;
--     GRANT  SELECT (param_* hariç tüm sütunlar) ... TO anon, authenticated;
--
-- Bu ÖLÇÜLDÜ ve UYGULANAMAZ olduğu görüldü. PostgreSQL 16'da yerel bir küme
-- kurulup birebir denendi:
--     grant select (id, name) on pitches to authenticated;  -- param_api_key hariç
--     select * from pitches;         → ERROR: permission denied for table pitches
--     select pitches.* from pitches; → ERROR: permission denied for table pitches
--     select id, name from pitches;  → ÇALIŞIR
-- Yani `*` ayrıştırma anında TÜM sütunlara genişler ve izin denetimi
-- sütun-sütun yapıldığı için sorgunun tamamı reddedilir.
--
-- İstemci `pitches` tablosunu BEŞ yerde `*` ile okuyor — hepsi canlı yol:
--   supabaseMutations.ts:414  fbGetPitches   → store.ts:542 (uygulama İLK AÇILIŞI)
--   supabaseMutations.ts:528  fbGetOwnerPitches
--   views/OwnerPanel.tsx:433 · :495          ('*, courts(*), pitch_tariffs(*)')
--   views/SettingsScreen.tsx:115             (KVKK dışa aktarım)
-- Tablo iznini kaldırmak bu dört yolu da anında kırardı; açılış sorgusu
-- kırıldığında uygulama hiç açılmaz. "Çalışan bir kod yolunu kırma" kuralı
-- gereği bu yol SEÇİLMEDİ. (Yine de istenirse diye hazır SQL dosyanın en
-- altında yorum içinde duruyor — ön koşulu o dört çağrının açık sütun
-- listesine geçirilmesidir; o dosyalar bu görevin kapsamı dışındaydı.)
--
-- SEÇİLEN YÖNTEM — sırrı okunabilir tablodan TAŞI:
--   Sır, herkese açık bir tabloda hiç durmazsa sütun izniyle uğraşmaya gerek
--   kalmaz. Üç değer sahip-only bir tabloya taşınır, `pitches` üzerindeki
--   sütunlar BOŞALTILIR ve bir tetikleyici ile bir daha DOLDURULAMAZ hâle
--   getirilir. Sütunlar DÜŞÜRÜLMEZ (`select('*')` sonucundaki anahtarlar ve
--   supabaseMutations'taki snake_case eşlemeleri kırılmasın diye) — sadece
--   kalıcı olarak NULL kalırlar.
--
--   Ek kanıt: sırlar zaten HİÇBİR ödeme akışında kullanılmıyor —
--   supabase/functions altında `param_api_key` geçen tek satır yok; okuyan/
--   yazan tek yer sahip panelindeki ödeme ayarları ekranıydı.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- BÖLÜM 1 — SEC-1: PSP SIRLARI
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1.1) Sırların yeni evi ──────────────────────────────────────────────────
-- RLS açık ve BİLEREK TEK BİR POLİTİKA YOK: PostgreSQL'de "RLS açık + politika
-- yok" = her rol için sıfır satır. Üstüne tablo izinleri de geri alınıyor.
-- Tabloya erişen tek yol aşağıdaki iki SECURITY DEFINER RPC'dir.
CREATE TABLE IF NOT EXISTS public.pitch_payment_credentials (
  pitch_id          uuid PRIMARY KEY REFERENCES public.pitches(id) ON DELETE CASCADE,
  param_merchant_id text,
  param_client_id   text,
  param_api_key     text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.pitch_payment_credentials IS
  'SEC-1: Tesisin PSP (Param) kimlik bilgileri. pitches herkese okunur olduğu icin sirlar buraya tasindi. RLS acik + POLITIKA YOK; erisim yalniz get_pitch_payment_settings / set_pitch_payment_settings RPC uzerinden.';

ALTER TABLE public.pitch_payment_credentials ENABLE ROW LEVEL SECURITY;

-- Supabase yeni tablolara varsayılan olarak anon/authenticated izni verir;
-- burada tamamı geri alınır (RLS'e ek ikinci kapı).
REVOKE ALL ON TABLE public.pitch_payment_credentials FROM PUBLIC, anon, authenticated;

-- ── 1.2) Mevcut sırları taşı (idempotent) ───────────────────────────────────
INSERT INTO public.pitch_payment_credentials (pitch_id, param_merchant_id, param_client_id, param_api_key)
SELECT p.id, p.param_merchant_id, p.param_client_id, p.param_api_key
FROM public.pitches p
WHERE COALESCE(p.param_merchant_id, p.param_client_id, p.param_api_key) IS NOT NULL
ON CONFLICT (pitch_id) DO NOTHING;

-- ── 1.3) Kaynak sütunları boşalt ────────────────────────────────────────────
-- NOT: pitches üzerindeki BEFORE UPDATE tetikleyicileri (protect_pitch_identity_fields,
-- protect_pitch_admin_flags) yalnız kimlik/bayrak sütunları DEĞİŞİRSE itiraz eder;
-- burada yalnız param_* değiştiği için ikisi de sorunsuz geçer.
UPDATE public.pitches
SET param_merchant_id = NULL,
    param_client_id   = NULL,
    param_api_key     = NULL
WHERE COALESCE(param_merchant_id, param_client_id, param_api_key) IS NOT NULL;

COMMENT ON COLUMN public.pitches.param_merchant_id IS
  'SEC-1 sonrasi KULLANIM DISI — kalici olarak NULL. Gercek deger pitch_payment_credentials tablosunda; trg_pitches_param_bos yeniden doldurulmasini engeller.';
COMMENT ON COLUMN public.pitches.param_client_id IS
  'SEC-1 sonrasi KULLANIM DISI — kalici olarak NULL (bkz. pitch_payment_credentials).';
COMMENT ON COLUMN public.pitches.param_api_key IS
  'SEC-1 sonrasi KULLANIM DISI — kalici olarak NULL (bkz. pitch_payment_credentials).';

-- ── 1.4) Sütunlar bir daha DOLMASIN ─────────────────────────────────────────
-- Neden tetikleyici: sütun düzeyinde UPDATE iznini kaldırmak için önce TABLO
-- düzeyindeki UPDATE iznini kaldırıp tüm zararsız sütunları tek tek geri vermek
-- gerekirdi (20260803234421'in öğrettiği kural). `pitches`e yazan çok sayıda
-- ekran var; eksik bırakılan tek sütun sessiz bir kayıt hatası üretir. Tetikleyici
-- aynı garantiyi sıfır kırılma riskiyle verir: yazma başarılı olur, sır YAPIŞMAZ.
CREATE OR REPLACE FUNCTION public.pitches_param_sutunlari_bos_kalir()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.param_merchant_id := NULL;
  NEW.param_client_id   := NULL;
  NEW.param_api_key     := NULL;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pitches_param_sutunlari_bos_kalir() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pitches_param_bos ON public.pitches;
CREATE TRIGGER trg_pitches_param_bos
  BEFORE INSERT OR UPDATE ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.pitches_param_sutunlari_bos_kalir();

-- ── 1.5) Sahibin kendi sırlarını okuma yolu ─────────────────────────────────
-- Kapı olarak `is_pitch_owner` seçildi (banka hesabı / para çekme ile AYNI
-- sınıf sır). Bu yardımcı OWNER'ı şöyle tanımlar: p.owner_id = auth.uid()
-- VEYA is_admin() VEYA (p.is_demo AND has_role('OWNER')) — yani sahip paneli,
-- yönetici önizlemesi ve demo tesis akışlarının hiçbiri bozulmaz.
-- MANAGER/STAFF bilerek DIŞARIDA: OwnerPanel zaten ödeme ayarlarını yalnız
-- sahip bağlamında (ownerScope) yüklüyor (views/OwnerPanel.tsx:371).
CREATE OR REPLACE FUNCTION public.get_pitch_payment_settings(p_pitch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.pitch_payment_credentials%ROWTYPE;
BEGIN
  IF p_pitch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PITCH';
  END IF;
  -- `IS NOT TRUE` bilerek: üçlü-değer tuzağı (20260727000002001'de yakalanan
  -- NULL boolean sızıntısı). `NOT NULL` → NULL → IF atlanır ve kapı açılırdı.
  IF public.is_pitch_owner(p_pitch_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: bu tesisin odeme ayarlarina erisim yok.';
  END IF;

  SELECT * INTO v_row
  FROM public.pitch_payment_credentials
  WHERE pitch_id = p_pitch_id;

  -- Kayıt yoksa boş dizeler döner; istemci "yapılandırılmamış" olarak yorumlar.
  RETURN jsonb_build_object(
    'param_merchant_id', COALESCE(v_row.param_merchant_id, ''),
    'param_client_id',   COALESCE(v_row.param_client_id, ''),
    'param_api_key',     COALESCE(v_row.param_api_key, '')
  );
END;
$function$;

COMMENT ON FUNCTION public.get_pitch_payment_settings(uuid) IS
  'SEC-1: Tesis sahibinin KENDI PSP kimlik bilgilerini okumasi. Sahip disi cagri UNAUTHORIZED firlatir.';

-- ── 1.6) Sahibin kendi sırlarını yazma yolu ─────────────────────────────────
-- Aynı kapı. Boş dize NULL'a çevrilir (istemcideki `deger || null` davranışıyla
-- birebir aynı) — böylece "temizle" işlemi kayıt bırakmaz.
CREATE OR REPLACE FUNCTION public.set_pitch_payment_settings(
  p_pitch_id    uuid,
  p_merchant_id text,
  p_client_id   text,
  p_api_key     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_pitch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PITCH';
  END IF;
  IF public.is_pitch_owner(p_pitch_id) IS NOT TRUE THEN  -- üçlü-değer tuzağı (bkz. 1.5)
    RAISE EXCEPTION 'UNAUTHORIZED: bu tesisin odeme ayarlarini degistiremezsiniz.';
  END IF;

  INSERT INTO public.pitch_payment_credentials
    (pitch_id, param_merchant_id, param_client_id, param_api_key, updated_at, updated_by)
  VALUES (
    p_pitch_id,
    NULLIF(btrim(COALESCE(p_merchant_id, '')), ''),
    NULLIF(btrim(COALESCE(p_client_id,   '')), ''),
    NULLIF(btrim(COALESCE(p_api_key,     '')), ''),
    now(),
    auth.uid()
  )
  ON CONFLICT (pitch_id) DO UPDATE SET
    param_merchant_id = EXCLUDED.param_merchant_id,
    param_client_id   = EXCLUDED.param_client_id,
    param_api_key     = EXCLUDED.param_api_key,
    updated_at        = now(),
    updated_by        = auth.uid();
END;
$function$;

COMMENT ON FUNCTION public.set_pitch_payment_settings(uuid, text, text, text) IS
  'SEC-1: Tesis sahibinin KENDI PSP kimlik bilgilerini yazmasi. Sahip disi cagri UNAUTHORIZED firlatir.';

-- SECURITY DEFINER şablonu (MIGRATION_PLAYBOOK "AI Ajanları" madde 3).
REVOKE ALL ON FUNCTION public.get_pitch_payment_settings(uuid)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_pitch_payment_settings(uuid, text, text, text)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pitch_payment_settings(uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_pitch_payment_settings(uuid, text, text, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- BÖLÜM 2 — DB-4: AKTİVİTE TABLOLARININ OKUMASI DARALTILDI
-- ----------------------------------------------------------------------------
-- Daraltmadan önce her tablonun GÜNCEL kod tarafından hangi yoldan okunduğu
-- tek tek arandı (grep); aşağıdaki gerekçeler o taramanın sonucudur.
-- Politikalar 20260810000000 dosyasında kuruluyor ve o dosya bundan ÖNCE
-- çalıştığı için sıfırdan replay'de de, canlıda da DROP+CREATE doğru sonucu verir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 2.1) pitch_slot_holds — AKTİF kullanımda, ama DOĞRUDAN okunmuyor ────────
-- İstemcide `pitch_slot_holds` geçen TEK satır yok (grep: 0 sonuç). Müsaitlik
-- ekranı tutmaları `get_pitch_availability` RPC'sinden alıyor; o fonksiyon
-- SECURITY DEFINER (20260831000009:190 civarı, `holds` anahtarı) olduğu için
-- tablo RLS'inden ETKİLENMEZ. Silme/temizleme yolları da DEFINER fonksiyonlar.
-- Dolayısıyla doğrudan SELECT'i daraltmak hiçbir ekranı bozmaz.
DROP POLICY IF EXISTS "Holds are viewable by everyone" ON public.pitch_slot_holds;
DROP POLICY IF EXISTS slot_holds_select_scoped ON public.pitch_slot_holds;
CREATE POLICY slot_holds_select_scoped ON public.pitch_slot_holds
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    held_by = ( SELECT auth.uid() AS uid)
    OR public.can_manage_pitch(pitch_id)
    OR public.is_platform_admin()
  );

-- ── 2.2) match_participants — kadro, YALNIZ maçın içindekilere ──────────────
-- Okuyan tek yer: services/matchService.ts:166 (getMatchLobbyParticipants) →
-- hooks/useMacKadrosu.ts:50 → maç lobisi.
--
-- İKİ yardımcı birlikte kullanılıyor, çünkü tek başına ikisi de EKSİK kalır ve
-- eksik kapı kadroyu meşru sahibinden gizler:
--   * `_is_match_participant` → kurucu, kaptan, `slots.player.id` ve yedekler.
--     `occupant`/`purchasedBy`u GÖRMEZ; kendi slotunu satın alan oyuncu için
--     `player` yazılmıyor (20260707000004001:36 yalnız purchasedBy+occupant
--     yazıyor) — yani tek başına bırakılsa slot satın alan oyuncu dışarıda kalırdı.
--   * `_match_participant_ids` → OTURANLAR ∪ SATIN ALANLAR (P-2a, kurucu kararı
--     K-3.3'ün tek kaynağı; OYNA_PRENSIPLER 3.7). Kurucuyu/kaptanı kapsamaz.
-- Birleşimleri "maçın içinde olan herkes"i verir.
--
-- ÖZYİNELEME YOK: iki yardımcı da yalnız `matches`i okur, BU tabloyu değil
-- (aynı desen 20260706000009:36'da zaten kullanılıyor). İkisi de authenticated'a
-- EXECUTE'lu (20260630000003:89 / 20260706000009:54 — anon'a kapalı).
--
-- DAVRANIŞ NOTU: maça hiç dâhil olmayan bir izleyici artık ad/avatar
-- zenginleştirmesini alamaz; MatchJoin.tsx:151 (enrichSideSlots) bu durumda
-- maçın kendi `slots` JSONB'sindeki ada, o da yoksa "Oyuncu"ya düşer — ekran
-- çalışmaya devam eder.
DROP POLICY IF EXISTS "Users can view match participants" ON public.match_participants;
DROP POLICY IF EXISTS match_participants_select_scoped ON public.match_participants;
CREATE POLICY match_participants_select_scoped ON public.match_participants
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    user_id = ( SELECT auth.uid() AS uid)
    OR public._is_match_participant(match_id, ( SELECT auth.uid() AS uid))
    OR (( SELECT auth.uid() AS uid) = ANY (public._match_participant_ids(match_id)))
    OR public.is_platform_admin()
  );

-- ── 2.3) match_registrations — legacy (plei dönemi), okuyanı yok ────────────
-- Slotlar artık `matches` tablosunun JSONB kolonlarında tutuluyor; store.ts:1178
-- bu tablonun realtime aboneliğinin kaldırıldığını not ediyor. İstemcide tek
-- okuma yok. Yine de tablo duruyor: kendi satırı + yönetici ile sınırlanır.
DROP POLICY IF EXISTS "Registrations are viewable by everyone." ON public.match_registrations;
DROP POLICY IF EXISTS match_registrations_select_own ON public.match_registrations;
CREATE POLICY match_registrations_select_own ON public.match_registrations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)) OR public.is_admin());

-- ── 2.4) waitlist — legacy (plei dönemi), okuyanı yok ───────────────────────
-- store.ts:1178'deki aynı not waitlist'i de kapsıyor.
DROP POLICY IF EXISTS "Waitlist viewable by everyone." ON public.waitlist;
DROP POLICY IF EXISTS waitlist_select_own ON public.waitlist;
CREATE POLICY waitlist_select_own ON public.waitlist
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)) OR public.is_admin());

-- ── 2.5) individual_matches — legacy havuz, kullanıcı sütunu yok ────────────
-- Kişisel veri taşımıyor (maç havuzu satırı) ama misafire açık kalmasının da
-- gerekçesi yok: istemcide okuyan yok. Yalnız `TO public` → `TO authenticated`
-- daraltması yapılır; satır süzgeci için bağlanacak bir kimlik sütunu YOK.
DROP POLICY IF EXISTS "Matches are viewable by everyone." ON public.individual_matches;
DROP POLICY IF EXISTS individual_matches_select_auth ON public.individual_matches;
CREATE POLICY individual_matches_select_auth ON public.individual_matches
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- BÖLÜM 3 — DOĞRULAMA (P-0: "bu koruma bozulursa kim söyleyecek?")
-- ════════════════════════════════════════════════════════════════════════════
DO $do$
DECLARE
  v_sizinti  bigint;
  v_izin     text;
  v_politika text;
BEGIN
  -- 3.1) pitches'te tek bir sır kalmadı mı?
  SELECT count(*) INTO v_sizinti
  FROM public.pitches
  WHERE COALESCE(param_merchant_id, param_client_id, param_api_key) IS NOT NULL;
  IF v_sizinti > 0 THEN
    RAISE EXCEPTION '[SEC-1] pitches.param_* HALA dolu (% satir).', v_sizinti;
  END IF;

  -- 3.2) Yeni tabloda anon/authenticated ayrıcalığı kalmadı mı?
  SELECT string_agg(DISTINCT grantee || ':' || privilege_type, ', ') INTO v_izin
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'pitch_payment_credentials'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF v_izin IS NOT NULL THEN
    RAISE EXCEPTION '[SEC-1] pitch_payment_credentials hala acik: %', v_izin;
  END IF;

  -- 3.3) Beş tabloda "herkese açık + koşulsuz okuma" politikası kalmadı mı?
  --      (roles kümesi public/anon ile kesişiyor VE USING koşulu `true` ise sızıntı)
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_politika
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('pitch_slot_holds','match_participants','match_registrations',
                      'waitlist','individual_matches')
    AND cmd IN ('SELECT', 'ALL')
    AND roles && ARRAY['public','anon']::name[]
    AND COALESCE(qual, 'true') = 'true';
  IF v_politika IS NOT NULL THEN
    RAISE EXCEPTION '[DB-4] Herkese acik okuma politikasi duruyor: %', v_politika;
  END IF;

  RAISE NOTICE '[SEC-1 + DB-4] Dogrulama tamam.';
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- İLERİ ADIM (bu görevin kapsamı dışındaki dosyalar düzeltilince uygulanabilir)
-- ----------------------------------------------------------------------------
-- Sütun düzeyinde SELECT sertleştirmesi de istenirse ÖN KOŞUL: aşağıdaki beş
-- çağrının `*` yerine açık sütun listesi kullanmaya geçirilmesi.
--   supabaseMutations.ts:414 · :528 · views/OwnerPanel.tsx:433 · :495 ·
--   views/SettingsScreen.tsx:115
-- Ön koşul sağlandıktan sonra AYRI bir migration'da (sütun listesi o gün
-- information_schema'dan üretilerek, elle yazılmadan):
--
--   REVOKE SELECT ON public.pitches FROM anon, authenticated;
--   DO $$
--   DECLARE v_kolonlar text;
--   BEGIN
--     SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
--       INTO v_kolonlar
--     FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'pitches'
--       AND column_name NOT LIKE 'param\_%';
--     EXECUTE format('GRANT SELECT (%s) ON public.pitches TO anon, authenticated', v_kolonlar);
--   END $$;
--
-- Migration geçmişinden çıkarılan GÜNCEL pitches sütun listesi (47 sütun;
-- kaynaklar: 20260526000000 CREATE TABLE · 20260530000002 · 20260530096000 ·
-- 20260604000001 · 20260728113509 · 20260805000000; düşürülenler:
-- auto_approve_enabled + auto_approve_minutes [20260831000009],
-- verification_status + verification_notes [20260901000001]):
--   id, name, latitude, longitude, address, is_active, owner_id, district,
--   image, images, description, amenities, price_per_person, total_price,
--   working_hours, settings, rating, is_open, pricing_mode, cancellation_policy,
--   iban, platform_commission_rate, google_rating, google_review_count, city,
--   price_per_match, is_demo, payment_options, param_merchant_id*,
--   param_client_id*, param_api_key*, rating_count, is_published, is_featured,
--   flash_deals_enabled, show_availability_badge, map_label, refund_full_hours,
--   refund_half_hours, refund_half_pct, courts, is_approved, payment_mode,
--   payment_mode_locked_by_admin, payment_mode_updated_at,
--   payment_mode_updated_by, booking_disabled_by_admin        (*= hariç tutulan)
-- Liste elle YAZILMAMALI: canlıda sürüklenmiş bir sütun listeden düşerse o
-- sütunu okuyan ekran sessizce kırılır — bu yüzden üstteki DO bloğu kullanılır.
-- ════════════════════════════════════════════════════════════════════════════
