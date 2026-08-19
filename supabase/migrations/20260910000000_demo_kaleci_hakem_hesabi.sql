-- ════════════════════════════════════════════════════════════════════════════
-- DEMO HESABI: 500 000 00 00 — kaleci VE hakem arayüzlerinin tek hesapla testi
-- ----------------------------------------------------------------------------
-- KURUCU İSTEĞİ (19 Ağustos 2026): "uygulamaya 50000000 şeklinde bir demo hesap
-- oluştur ve bu demo hesap ile tüm kaleci hakem arayüzlerini test edebiliyor
-- olayım."
--
-- NEDEN YENİ BİR HESAP: mevcut demo kadrosunda kaleci (kaleci1/3) ve hakem
-- (hakem1/2) AYRI hesaplar. İkisini görmek için çıkış-giriş gerekiyordu.
-- Ayrıca o hesaplar E-POSTA + ŞİFRE ile giriliyor; şifre yolu kaldırıldığı için
-- (4.7) üretim paketinde artık kullanılamıyorlar. Bu hesap TELEFONLA girer —
-- yani kurucunun gerçek kullanıcı gibi deneyeceği yolun ta kendisi.
--
-- ÇOKLU ROL: roles = [GOALKEEPER, REFEREE, PLAYER]. Uygulamada birden fazla rol
-- varsa rol değiştirici (components/RoleSwitcher.tsx) açılır; tek hesapla üç
-- panel de gezilir. `role` alanı GOALKEEPER — açılışta kaleci paneline düşer.
--
-- SMS GİTMEZ, PARA YANMAZ: numara Supabase'in "test OTP" haritasına yazılır
-- (supabase/config.toml → [auth.sms.test_otp]). O harita sayesinde Supabase bu
-- numara için SMS ÜRETMEZ, sabit kodu kabul eder. Netgsm kontörü harcanmaz.
--   Numara: +90 500 000 00 00      Kod: 500000
--
-- GÜVENLİ Mİ: numara TC operatörlerinde tahsis edilmeyen bir aralıktadır
-- (500'lü ön ek kullanımda değil), yani gerçek bir kişinin numarasıyla
-- çakışmaz. Hesap `is_demo = true` — demo temizleyicileri ve raporlar onu
-- gerçek kullanıcı saymaz. Şifresi YOKTUR: yalnız sabit kodla girilir ve o kod
-- ancak panelde test haritası açıkken çalışır. Harita kapatıldığı an hesap
-- erişilemez hâle gelir; ek bir temizlik gerekmez.
--
-- İdempotent: tekrar uygulanabilir.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_id    uuid := 'd0e51e00-0000-4000-8000-000000000001';
  v_phone text := '905000000000';
BEGIN
  -- ── 1) Auth kullanıcısı ──────────────────────────────────────────────────
  -- Şifre alanı bilerek NULL: bu hesaba yalnız telefon koduyla girilir.
  INSERT INTO auth.users (
    id, instance_id, aud, role, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  )
  VALUES (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_phone, now(),
    jsonb_build_object('provider', 'phone', 'providers', jsonb_build_array('phone')),
    jsonb_build_object('full_name', 'Demo Kaleci-Hakem'),
    now(), now(), '', '', '', ''
  )
  ON CONFLICT (id) DO UPDATE
    SET phone = EXCLUDED.phone,
        phone_confirmed_at = COALESCE(auth.users.phone_confirmed_at, now()),
        raw_app_meta_data  = EXCLUDED.raw_app_meta_data,
        updated_at = now();

  -- ── 2) Kimlik satırı ─────────────────────────────────────────────────────
  -- Supabase, oturumu bu satır üzerinden kurar; yoksa doğrulama başarılı olsa
  -- bile kullanıcı "identity not found" ile geri döner.
  INSERT INTO auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), v_id, 'phone', v_id::text,
    jsonb_build_object('sub', v_id::text, 'phone', v_phone, 'phone_verified', true),
    now(), now(), now()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE
    SET identity_data = EXCLUDED.identity_data, updated_at = now();

  -- ── 3) Profil ────────────────────────────────────────────────────────────
  INSERT INTO public.profiles (
    id, name, full_name, first_name, last_name, phone, phone_verified,
    role, roles, is_demo, has_completed_onboarding, position,
    created_at, join_date
  )
  VALUES (
    v_id, 'Demo Kaleci-Hakem', 'Demo Kaleci-Hakem', 'Demo', 'Kaleci-Hakem',
    '+' || v_phone, true,
    'GOALKEEPER', '["GOALKEEPER","REFEREE","PLAYER"]'::jsonb, true, true, 'GK',
    now(), now()
  )
  ON CONFLICT (id) DO UPDATE
    SET role  = 'GOALKEEPER',
        roles = '["GOALKEEPER","REFEREE","PLAYER"]'::jsonb,
        phone = EXCLUDED.phone,
        phone_verified = true,
        is_demo = true,
        has_completed_onboarding = true;
END $$;

-- ── 4) Kaleci ve hakem kayıtları ───────────────────────────────────────────
-- Panelin "Maç Bul" / "Kazançlarım" sekmeleri ve pazar yeri vitrinleri bu iki
-- tabloyu okur. Kayıt yoksa panel boş açılır — test edilecek bir şey kalmaz.
-- `verification_status = approved`: onay bekleyen sağlayıcı teklif veremez,
-- yani onaysız bırakılırsa akışın yarısı denenemezdi.
INSERT INTO public.goalkeepers (
  id, "authUid", name, age, bio, fee, height, style, rating, "matchCount",
  "isDemo", "isElite", stats, skills, styles, reviews, "preferredZones",
  coordinates, verification_status
)
VALUES (
  'd0e51e00-0000-4000-8000-000000000001', 'd0e51e00-0000-4000-8000-000000000001',
  'Demo Kaleci-Hakem', 28, 'Demo hesabı — kaleci ve hakem arayüzlerinin testi için.',
  500, '188cm', 'Panter', 8.2, 40, true, false,
  '{"diving":82,"oneOnOne":83,"reflexes":84,"aerialReach":80,"positioning":82,"distribution":78,"savePercentage":"78","penaltySaveRate":"26"}'::jsonb,
  '{"diving":82,"oneOnOne":83,"reflexes":84,"aerialReach":80,"positioning":82,"distribution":78}'::jsonb,
  ARRAY[]::text[], '[]'::jsonb, '["ordu"]'::jsonb,
  '{"lat":40.9839,"lng":37.8764}'::jsonb, 'approved'
)
ON CONFLICT (id) DO UPDATE
  SET verification_status = 'approved', "isDemo" = true, fee = EXCLUDED.fee;

INSERT INTO public.referees (
  id, "authUid", name, bio, fee, level, style, rating, "matchCount",
  "isDemo", "isElite", stats, styles, reviews, "preferredZones",
  coordinates, verification_status
)
VALUES (
  'd0e51e00-0000-4000-8000-000000000001', 'd0e51e00-0000-4000-8000-000000000001',
  'Demo Kaleci-Hakem', 'Demo hesabı — kaleci ve hakem arayüzlerinin testi için.',
  500, 'UEFA B', 'Teknisyen', 8.2, 40, true, false,
  '{"fitness":85,"avgCards":3.0,"authority":86,"avgDistance":"10km","communication":88}'::jsonb,
  ARRAY[]::text[], '[]'::jsonb, '["ordu"]'::jsonb,
  '{"lat":40.9839,"lng":37.8764}'::jsonb, 'approved'
)
ON CONFLICT (id) DO UPDATE
  SET verification_status = 'approved', "isDemo" = true, fee = EXCLUDED.fee;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := 'd0e51e00-0000-4000-8000-000000000001';
  v_roles jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_id AND phone = '905000000000'
                   AND phone_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'DOGRULAMA: demo auth kullanicisi kurulmadi';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_id AND provider = 'phone') THEN
    RAISE EXCEPTION 'DOGRULAMA: demo kimlik satiri yok — oturum acilamaz';
  END IF;
  SELECT roles INTO v_roles FROM public.profiles WHERE id = v_id;
  IF NOT (COALESCE(v_roles, '[]'::jsonb) ?& array['GOALKEEPER','REFEREE']) THEN
    RAISE EXCEPTION 'DOGRULAMA: demo profil iki rolu birden tasimiyor (%)', v_roles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.goalkeepers WHERE id = v_id AND verification_status = 'approved') THEN
    RAISE EXCEPTION 'DOGRULAMA: demo kaleci kaydi yok/onaysiz — kaleci paneli bos acilir';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.referees WHERE id = v_id AND verification_status = 'approved') THEN
    RAISE EXCEPTION 'DOGRULAMA: demo hakem kaydi yok/onaysiz — hakem paneli bos acilir';
  END IF;
  -- Şifresiz olmalı: şifre yolu kaldırıldı, geri sızmasın.
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_id AND encrypted_password IS NOT NULL
               AND encrypted_password <> '') THEN
    RAISE EXCEPTION 'DOGRULAMA: demo hesaba sifre yazilmis — telefon disi yol acik';
  END IF;
  RAISE NOTICE 'DOGRULAMA TAMAM: 500 000 00 00 demo hesabi kaleci+hakem rolleriyle hazir.';
END $$;
