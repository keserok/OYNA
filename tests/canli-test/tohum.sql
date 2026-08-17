-- ═══════════════════════════════════════════════════════════════════════════
-- OYNA — KAPSAMLI CANLI TEST TOHUMU (16→17 Ağustos 2026 gecesi, kurucu onaylı)
--
-- 5 saha sahibi + 100 oyuncu + 5 saha + 6 kort + 9 tarife.
-- Amaç: her ekranı/sistemi gerçek veriyle sürmek (görev: "5 saha sahibi,
-- 100 kullanıcı olarak uygulamayı kapsamlı bir teste tabi tut").
--
-- GÜVENLİK / AYRIŞMA (prensip 7.10):
--   • Tüm e-postalar @oyna.app → profiles.is_demo tetikleyiciyle TRUE olur;
--     maç/rezervasyon/ödeme satırları da zincirle demo işaretlenir.
--   • Tüm kimlikler 'cafe7e57' önekiyle deterministik → temizlik cerrahidir
--     (tests/canli-test/temizlik.sql tek harf gerçek veriye dokunmaz).
--   • Sahalar yalnız aktif kapsama bölgesinde (Altınordu) — keşifte görünsün.
--   • Şifre (hepsi): Oyna!Denek-2026  (yalnız demo hesap; canlıda gerçek
--     kullanıcı bu şifreyle DOĞMAZ, e-posta alanı @oyna.app'e kilitli).
--
-- Kimlik şeması:
--   sahipler  cafe7e57-0000-4000-8000-000000000101..105  denek-sahibi1..5@oyna.app
--   oyuncular cafe7e57-0000-4000-8000-000000000201..300  denek001..100@oyna.app
--   sahalar   cafe7e57-1111-4111-8111-000000000001..005
--   kortlar   cafe7e57-2222-4222-8222-000000000001..006
--   tarifeler cafe7e57-3333-4333-8333-000000000001..009
--
-- Saha çeşitliliği (bilinçli — her dal test edilsin):
--   S1 Denek Arena        ONLINE_ONLY  sınır 22:00  iade varsayılan (24s/6s/%50)
--   S2 Denek Çim Vadisi   CASH_ONLY    sınır YOK    2 kort
--   S3 Denek Kapalı Saha  HYBRID       sınır 23:00  iade 48s/12s/%30, kapora tarifesiz (%20 motoru)
--   S4 Denek Gece Sahası  ONLINE_ONLY  sınır 00:00  mesai 17:00–02:00 (gece ekseni)
--   S5 Denek Pilot Saha   HYBRID       sınır 02:00  gece yarısı sonrası sınır (+1440 ekseni)
--   Sahip 5'in owner_accounts denemesi BİLEREK süresi geçmiş (o dal da görülsün).
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1) Saha sahipleri: auth.users ──────────────────────────────────────────
WITH sahip(n, ad) AS (
  VALUES (1,'Hasan Bahçevan'),(2,'Kemal Çayırlı'),(3,'Nurten Sahagil'),
         (4,'Orhan Yeşilova'),(5,'Sevim Korkmaz')
), yeni AS (
  SELECT ('cafe7e57-0000-4000-8000-000000000'||(100+n)::text)::uuid AS id,
         'denek-sahibi'||n||'@oyna.app' AS email, ad
  FROM sahip
)
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
SELECT '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, extensions.crypt('Oyna!Denek-2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', ad), now(), now(), '', '', '', ''
FROM yeni
ON CONFLICT (id) DO NOTHING;

-- ── 2) Oyuncular (100): auth.users ─────────────────────────────────────────
WITH adlar AS (
  SELECT ARRAY['Ali','Ayşe','Mehmet','Zeynep','Emre','Elif','Burak','Selin','Canberk','Derya',
               'Mert','Fatma','Oğuzhan','Hale','Kaan','İrem','Tolga','Nurgül','Barış','Ece'] AS ad,
         ARRAY['Yılmaz','Kaya','Demir','Şahin','Çelik','Aydın','Arslan','Doğan','Kılıç','Koçak'] AS soyad
), yeni AS (
  SELECT ('cafe7e57-0000-4000-8000-000000000'||(200+n)::text)::uuid AS id,
         'denek'||lpad(n::text,3,'0')||'@oyna.app' AS email,
         a.ad[1+((n-1)%20)]||' '||a.soyad[1+((n-1)+((n-1)/20))%10] AS ad_soyad
  FROM generate_series(1,100) n, adlar a
)
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
SELECT '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, extensions.crypt('Oyna!Denek-2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', ad_soyad), now(), now(), '', '', '', ''
FROM yeni
ON CONFLICT (id) DO NOTHING;

-- ── 3) auth.identities (e-posta girişi için şart) ──────────────────────────
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email,
                     'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
FROM auth.users u
WHERE u.id::text LIKE 'cafe7e57-%'
  AND NOT EXISTS (SELECT 1 FROM auth.identities i
                  WHERE i.provider = 'email' AND i.provider_id = u.id::text);

-- ── 4) Profiller (on_auth_user_created açtı; alanları doldur) ─────────────
UPDATE public.profiles p SET
  name       = u.raw_user_meta_data->>'full_name',
  full_name  = u.raw_user_meta_data->>'full_name',
  has_completed_onboarding = (p.id::text NOT IN
    ('cafe7e57-0000-4000-8000-000000000299','cafe7e57-0000-4000-8000-000000000300')),
  is_searchable = true,
  self_skill = 1 + (('x'||substr(md5(p.id::text),1,4))::bit(16)::int % 5)
FROM auth.users u
WHERE u.id = p.id AND p.id::text LIKE 'cafe7e57-%';

-- Sahipler: rol dizisi OWNER (mevcut demo sahip deseniyle aynı)
UPDATE public.profiles SET roles = '["OWNER","PLAYER"]'::jsonb
WHERE id::text LIKE 'cafe7e57-0000-4000-8000-0000000001%';

-- Kaleci (293–295) ve hakem (296–297) çeşitliliği
UPDATE public.profiles SET role='GOALKEEPER', roles='["GOALKEEPER","PLAYER"]'::jsonb
WHERE id::text IN ('cafe7e57-0000-4000-8000-000000000293',
                   'cafe7e57-0000-4000-8000-000000000294',
                   'cafe7e57-0000-4000-8000-000000000295');
UPDATE public.profiles SET role='REFEREE', roles='["REFEREE","PLAYER"]'::jsonb
WHERE id::text IN ('cafe7e57-0000-4000-8000-000000000296',
                   'cafe7e57-0000-4000-8000-000000000297');

-- ── 5) owner_accounts (sahip paneli yetkileri) ─────────────────────────────
INSERT INTO public.owner_accounts (id, owner_user_id, plan_tier, status, trial_ends_at, entitlements)
SELECT gen_random_uuid(),
       ('cafe7e57-0000-4000-8000-000000000'||(100+n)::text)::uuid,
       'starter', 'trialing',
       CASE WHEN n = 5 THEN now() - interval '2 days'   -- bilerek süresi geçmiş dal
            ELSE now() + interval '30 days' END,
       '{"team":true,"finance":true,"max_staff":10,"max_courts":5,"flash_deals":true,"withdrawals":true,"max_facilities":1}'::jsonb
FROM generate_series(1,5) n
WHERE NOT EXISTS (SELECT 1 FROM public.owner_accounts o
  WHERE o.owner_user_id = ('cafe7e57-0000-4000-8000-000000000'||(100+n)::text)::uuid);

-- ── 6) Sahalar (hepsi Altınordu — tek aktif kapsama bölgesi) ───────────────
-- NOT: canlıdaki bekçi (enforce_court_tariff_before_activate) tarifesiz saha
-- yayınlatmaz — sahalar PASİF doğar, tarifeler girildikten sonra 8b adımında
-- yayına alınır. (Bekçinin çalıştığı bu tohumda BİLEREK kanıtlanmış olur.)
INSERT INTO public.pitches (id, name, owner_id, district, city, address,
  latitude, longitude, is_active, is_published, is_demo, pricing_mode,
  payment_mode, listing_cutoff, refund_full_hours, refund_half_hours, refund_half_pct,
  platform_commission_rate, description, working_hours)
VALUES
  ('cafe7e57-1111-4111-8111-000000000001','Denek Arena','cafe7e57-0000-4000-8000-000000000101',
   'Altınordu','Ordu','Denek Cad. 1, Altınordu',40.9150,37.8600,false,false,true,'FULL',
   'ONLINE_ONLY','22:00',NULL,NULL,NULL,10,'Test sahası 1 — online ödeme, 22:00 listeleme sınırı',
   '[{"name":"Pazartesi","open":"08:00","close":"02:00","closed":false},{"name":"Salı","open":"08:00","close":"02:00","closed":false},{"name":"Çarşamba","open":"08:00","close":"02:00","closed":false},{"name":"Perşembe","open":"08:00","close":"02:00","closed":false},{"name":"Cuma","open":"08:00","close":"02:00","closed":false},{"name":"Cumartesi","open":"08:00","close":"02:00","closed":false},{"name":"Pazar","open":"08:00","close":"02:00","closed":false}]'::jsonb),
  ('cafe7e57-1111-4111-8111-000000000002','Denek Çim Vadisi','cafe7e57-0000-4000-8000-000000000102',
   'Altınordu','Ordu','Denek Cad. 2, Altınordu',40.9100,37.8700,false,false,true,'FULL',
   'CASH_ONLY',NULL,NULL,NULL,NULL,10,'Test sahası 2 — nakit, sınırsız listeleme, 2 kort',
   '[{"name":"Pazartesi","open":"08:00","close":"02:00","closed":false},{"name":"Salı","open":"08:00","close":"02:00","closed":false},{"name":"Çarşamba","open":"08:00","close":"02:00","closed":false},{"name":"Perşembe","open":"08:00","close":"02:00","closed":false},{"name":"Cuma","open":"08:00","close":"02:00","closed":false},{"name":"Cumartesi","open":"08:00","close":"02:00","closed":false},{"name":"Pazar","open":"08:00","close":"02:00","closed":false}]'::jsonb),
  ('cafe7e57-1111-4111-8111-000000000003','Denek Kapalı Saha','cafe7e57-0000-4000-8000-000000000103',
   'Altınordu','Ordu','Denek Cad. 3, Altınordu',40.9120,37.8650,false,false,true,'FULL',
   'HYBRID','23:00',48,12,30,10,'Test sahası 3 — hibrit ödeme, özel iade kademesi, kapora tarifesiz',
   '[{"name":"Pazartesi","open":"08:00","close":"02:00","closed":false},{"name":"Salı","open":"08:00","close":"02:00","closed":false},{"name":"Çarşamba","open":"08:00","close":"02:00","closed":false},{"name":"Perşembe","open":"08:00","close":"02:00","closed":false},{"name":"Cuma","open":"08:00","close":"02:00","closed":false},{"name":"Cumartesi","open":"08:00","close":"02:00","closed":false},{"name":"Pazar","open":"08:00","close":"02:00","closed":false}]'::jsonb),
  ('cafe7e57-1111-4111-8111-000000000004','Denek Gece Sahası','cafe7e57-0000-4000-8000-000000000104',
   'Altınordu','Ordu','Denek Cad. 4, Altınordu',40.9080,37.8620,false,false,true,'FULL',
   'ONLINE_ONLY','00:00',NULL,NULL,NULL,10,'Test sahası 4 — akşam mesaisi, gece yarısı sınırı',
   '[{"name":"Pazartesi","open":"17:00","close":"02:00","closed":false},{"name":"Salı","open":"17:00","close":"02:00","closed":false},{"name":"Çarşamba","open":"17:00","close":"02:00","closed":false},{"name":"Perşembe","open":"17:00","close":"02:00","closed":false},{"name":"Cuma","open":"17:00","close":"02:00","closed":false},{"name":"Cumartesi","open":"17:00","close":"02:00","closed":false},{"name":"Pazar","open":"17:00","close":"02:00","closed":false}]'::jsonb),
  ('cafe7e57-1111-4111-8111-000000000005','Denek Pilot Saha','cafe7e57-0000-4000-8000-000000000105',
   'Altınordu','Ordu','Denek Cad. 5, Altınordu',40.9180,37.8680,false,false,true,'FULL',
   'HYBRID','02:00',NULL,NULL,NULL,10,'Test sahası 5 — gece yarısı SONRASI sınır (+1440 ekseni)',
   '[{"name":"Pazartesi","open":"08:00","close":"02:00","closed":false},{"name":"Salı","open":"08:00","close":"02:00","closed":false},{"name":"Çarşamba","open":"08:00","close":"02:00","closed":false},{"name":"Perşembe","open":"08:00","close":"02:00","closed":false},{"name":"Cuma","open":"08:00","close":"02:00","closed":false},{"name":"Cumartesi","open":"08:00","close":"02:00","closed":false},{"name":"Pazar","open":"08:00","close":"02:00","closed":false}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── 7) Kortlar ─────────────────────────────────────────────────────────────
-- Bekçi (enforce_court_tariff_before_activate) KORT başına tarife ister:
-- kortlar pasif doğar, kort-bazlı tarifeler girilince 8b'de açılır.
INSERT INTO public.courts (id, pitch_id, name, court_type, size, price, surface,
  capacity, min_capacity, max_capacity, is_active, sort_order, description)
VALUES
  ('cafe7e57-2222-4222-8222-000000000001','cafe7e57-1111-4111-8111-000000000001','Ana Saha','OPEN','30x50',1500,'TURF',7,5,7,false,0,''),
  ('cafe7e57-2222-4222-8222-000000000002','cafe7e57-1111-4111-8111-000000000002','Saha A','OPEN','25x40',1200,'TURF',6,5,6,false,0,''),
  ('cafe7e57-2222-4222-8222-000000000003','cafe7e57-1111-4111-8111-000000000002','Saha B','OPEN','20x35',1000,'TURF',5,4,5,false,1,''),
  ('cafe7e57-2222-4222-8222-000000000004','cafe7e57-1111-4111-8111-000000000003','Kapalı Kort','CLOSED','25x45',1800,'TURF',7,5,7,false,0,''),
  ('cafe7e57-2222-4222-8222-000000000005','cafe7e57-1111-4111-8111-000000000004','Gece Kortu','OPEN','25x40',1400,'TURF',6,5,6,false,0,''),
  ('cafe7e57-2222-4222-8222-000000000006','cafe7e57-1111-4111-8111-000000000005','Pilot Kort','OPEN','30x50',1600,'TURF',8,6,8,false,0,'')
ON CONFLICT (id) DO NOTHING;

-- ── 8) Tarifeler (akşam kalıbı canlıdaki gibi: 17:00 → 00:00) ─────────────
INSERT INTO public.pitch_tariffs (id, pitch_id, court_id, name, tariff_type,
  applies_to_days, start_time, end_time, slot_price, deposit_amount, slot_minutes, is_active, sort_order)
VALUES
  ('cafe7e57-3333-4333-8333-000000000001','cafe7e57-1111-4111-8111-000000000001','cafe7e57-2222-4222-8222-000000000001','Gündüz','WEEKDAY','{1,2,3,4,5}','08:00','17:00',1000,300,60,true,0),
  ('cafe7e57-3333-4333-8333-000000000002','cafe7e57-1111-4111-8111-000000000001','cafe7e57-2222-4222-8222-000000000001','Akşam','WEEKDAY','{1,2,3,4,5}','17:00','00:00',1500,450,60,true,1),
  ('cafe7e57-3333-4333-8333-000000000003','cafe7e57-1111-4111-8111-000000000001','cafe7e57-2222-4222-8222-000000000001','Hafta Sonu','WEEKEND','{6,7}','08:00','00:00',1500,450,60,true,2),
  ('cafe7e57-3333-4333-8333-000000000004','cafe7e57-1111-4111-8111-000000000002','cafe7e57-2222-4222-8222-000000000002','Tek Tarife','WEEKDAY','{1,2,3,4,5,6,7}','08:00','00:00',1200,360,60,true,0),
  ('cafe7e57-3333-4333-8333-000000000005','cafe7e57-1111-4111-8111-000000000003','cafe7e57-2222-4222-8222-000000000004','Gündüz','WEEKDAY','{1,2,3,4,5,6,7}','08:00','17:00',1400,NULL,60,true,0),
  ('cafe7e57-3333-4333-8333-000000000006','cafe7e57-1111-4111-8111-000000000003','cafe7e57-2222-4222-8222-000000000004','Akşam','WEEKDAY','{1,2,3,4,5,6,7}','17:00','00:00',1800,NULL,60,true,1),
  ('cafe7e57-3333-4333-8333-000000000007','cafe7e57-1111-4111-8111-000000000004','cafe7e57-2222-4222-8222-000000000005','Gece','WEEKDAY','{1,2,3,4,5,6,7}','17:00','00:00',1400,420,60,true,0),
  ('cafe7e57-3333-4333-8333-000000000008','cafe7e57-1111-4111-8111-000000000005','cafe7e57-2222-4222-8222-000000000006','Tüm Gün','WEEKDAY','{1,2,3,4,5,6,7}','08:00','00:00',1600,500,60,true,0),
  ('cafe7e57-3333-4333-8333-000000000009','cafe7e57-1111-4111-8111-000000000002','cafe7e57-2222-4222-8222-000000000003','Saha B Özel','WEEKDAY','{1,2,3,4,5,6,7}','08:00','00:00',1000,300,60,true,1)
ON CONFLICT (id) DO NOTHING;


-- ── 8b) Tarifeler girildi — önce kortları, sonra sahaları yayına al ───────
UPDATE public.courts SET is_active = true WHERE id::text LIKE 'cafe7e57-%';
UPDATE public.pitches SET is_active = true, is_published = true
WHERE id::text LIKE 'cafe7e57-%';

-- ── 9) KENDİNİ DOĞRULAMA (7.7): sayılar tutmazsa hiçbir şey kalmaz ─────────
DO $$
DECLARE
  v_users int; v_idents int; v_profiles int; v_demo int; v_onboard_beklemede int;
  v_owners int; v_accounts int; v_pitches int; v_courts int; v_tariffs int;
BEGIN
  SELECT count(*) INTO v_users    FROM auth.users      WHERE id::text LIKE 'cafe7e57-%';
  SELECT count(*) INTO v_idents   FROM auth.identities WHERE provider='email' AND provider_id LIKE 'cafe7e57-%';
  SELECT count(*) INTO v_profiles FROM public.profiles WHERE id::text LIKE 'cafe7e57-%';
  SELECT count(*) INTO v_demo     FROM public.profiles WHERE id::text LIKE 'cafe7e57-%' AND is_demo;
  SELECT count(*) INTO v_onboard_beklemede FROM public.profiles WHERE id::text LIKE 'cafe7e57-%' AND NOT has_completed_onboarding;
  SELECT count(*) INTO v_owners   FROM public.profiles WHERE id::text LIKE 'cafe7e57-0000-4000-8000-0000000001%' AND roles ? 'OWNER';
  SELECT count(*) INTO v_accounts FROM public.owner_accounts WHERE owner_user_id::text LIKE 'cafe7e57-%';
  SELECT count(*) INTO v_pitches  FROM public.pitches  WHERE id::text LIKE 'cafe7e57-%' AND is_demo AND is_active AND is_published;
  SELECT count(*) INTO v_courts   FROM public.courts   WHERE id::text LIKE 'cafe7e57-%' AND is_active;
  SELECT count(*) INTO v_tariffs  FROM public.pitch_tariffs WHERE id::text LIKE 'cafe7e57-%' AND is_active;

  IF v_users <> 105 OR v_idents <> 105 OR v_profiles <> 105 THEN
    RAISE EXCEPTION 'TOHUM DOĞRULAMA: kullanıcı sayıları tutmadı (users=%, idents=%, profiles=%)', v_users, v_idents, v_profiles;
  END IF;
  IF v_demo <> 105 THEN
    RAISE EXCEPTION 'TOHUM DOĞRULAMA: % profil demo işaretli değil — 7.10 ayrımı çalışmıyor, DUR', 105 - v_demo;
  END IF;
  IF v_onboard_beklemede <> 2 THEN
    RAISE EXCEPTION 'TOHUM DOĞRULAMA: onboarding bekleyen 2 olmalıydı, % bulundu', v_onboard_beklemede;
  END IF;
  IF v_owners <> 5 OR v_accounts <> 5 THEN
    RAISE EXCEPTION 'TOHUM DOĞRULAMA: sahip rolleri/hesapları eksik (roles=%, accounts=%)', v_owners, v_accounts;
  END IF;
  IF v_pitches <> 5 OR v_courts <> 6 OR v_tariffs <> 9 THEN
    RAISE EXCEPTION 'TOHUM DOĞRULAMA: tesis sayıları tutmadı (saha=%, kort=%, tarife=%)', v_pitches, v_courts, v_tariffs;
  END IF;

  RAISE NOTICE 'TOHUM TAMAM: 105 kullanıcı (hepsi demo), 5 sahip, 5 saha, 6 kort, 9 tarife.';
END $$;

COMMIT;
