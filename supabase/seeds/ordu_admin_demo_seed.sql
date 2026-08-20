-- ============================================================================
-- ORDU ADMIN DEMO SEED — admin panel talebiyle üretilen tam demo kümesi
-- ----------------------------------------------------------------------------
-- İÇERİK:
--   • 20 oyuncu   (d0e51a00…)
--   • 4  saha sahibi (d0e51b00…) → Ordu'daki 4 sahaya (a0000001–a0000004) atanır
--   • 3  kaleci   (d0e51c00…) → gerçek hesap + goalkeepers katalog satırı (authUid)
--   • 2  hakem    (d0e51d00…) → gerçek hesap + referees katalog satırı (authUid)
--   • 5  demo maç (d0e51e00…) → 4 sahada, oyuncular kadrolara yerleştirilmiş,
--        her maça 1 hakem + 1 kaleci atanmış.
--
-- GİRİŞ: tüm hesaplar  e-posta (@oyna.app) + şifre  password123
--        (uygulama girişinde e-posta+şifre; dev-mode'da OTP'siz demo girişi de çalışır)
--
-- İZLENEBİLİRLİK/SİLME: tüm demo kayıtları  id LIKE 'd0e51%'  önekiyle işaretli.
--   Silmek için: supabase/seeds/ordu_admin_demo_purge.sql
--
-- Idempotent: tekrar çalıştırılabilir. auth.users trigger'ı (handle_new_user)
-- profilleri otomatik açar; bu seed sonra rolleri/rating'i UPDATE eder.
-- ============================================================================

BEGIN;

-- ─── 1) AUTH KULLANICILARI (29 hesap) ───────────────────────────────────────
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  email_change_confirm_status
)
SELECT '00000000-0000-0000-0000-000000000000', v.id::uuid, 'authenticated', 'authenticated', v.email,
       crypt('password123', gen_salt('bf')),
       now(), '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', v.full_name, 'avatar_url', NULL),
       now(), now(), false, false,
       '', '', '', '', '', '', '', '', 0
FROM (VALUES
  -- 20 OYUNCU
  ('d0e51a00-0000-4000-8000-000000000001','oyuncu01@oyna.app','Emre Kaya'),
  ('d0e51a00-0000-4000-8000-000000000002','oyuncu02@oyna.app','Burak Demir'),
  ('d0e51a00-0000-4000-8000-000000000003','oyuncu03@oyna.app','Mert Yıldız'),
  ('d0e51a00-0000-4000-8000-000000000004','oyuncu04@oyna.app','Can Aydın'),
  ('d0e51a00-0000-4000-8000-000000000005','oyuncu05@oyna.app','Ozan Şahin'),
  ('d0e51a00-0000-4000-8000-000000000006','oyuncu06@oyna.app','Deniz Arslan'),
  ('d0e51a00-0000-4000-8000-000000000007','oyuncu07@oyna.app','Kaan Çelik'),
  ('d0e51a00-0000-4000-8000-000000000008','oyuncu08@oyna.app','Ali Koç'),
  ('d0e51a00-0000-4000-8000-000000000009','oyuncu09@oyna.app','Efe Doğan'),
  ('d0e51a00-0000-4000-8000-000000000010','oyuncu10@oyna.app','Berk Aksoy'),
  ('d0e51a00-0000-4000-8000-000000000011','oyuncu11@oyna.app','Umut Yılmaz'),
  ('d0e51a00-0000-4000-8000-000000000012','oyuncu12@oyna.app','Serkan Öztürk'),
  ('d0e51a00-0000-4000-8000-000000000013','oyuncu13@oyna.app','Barış Kurt'),
  ('d0e51a00-0000-4000-8000-000000000014','oyuncu14@oyna.app','Tolga Erdem'),
  ('d0e51a00-0000-4000-8000-000000000015','oyuncu15@oyna.app','Onur Taş'),
  ('d0e51a00-0000-4000-8000-000000000016','oyuncu16@oyna.app','Cem Polat'),
  ('d0e51a00-0000-4000-8000-000000000017','oyuncu17@oyna.app','Yusuf Bulut'),
  ('d0e51a00-0000-4000-8000-000000000018','oyuncu18@oyna.app','Furkan Acar'),
  ('d0e51a00-0000-4000-8000-000000000019','oyuncu19@oyna.app','Görkem Ateş'),
  ('d0e51a00-0000-4000-8000-000000000020','oyuncu20@oyna.app','Sinan Yalçın'),
  -- 4 SAHA SAHİBİ
  ('d0e51b00-0000-4000-8000-000000000001','saha1@oyna.app','Hakan Capo'),
  ('d0e51b00-0000-4000-8000-000000000002','saha2@oyna.app','Kemal Olimpiyat'),
  ('d0e51b00-0000-4000-8000-000000000003','saha3@oyna.app','Volkan Vip'),
  ('d0e51b00-0000-4000-8000-000000000004','saha4@oyna.app','Ahmet Kuru'),
  -- 3 KALECİ
  ('d0e51c00-0000-4000-8000-000000000001','kaleci1@oyna.app','Ahmet Çalık'),
  ('d0e51c00-0000-4000-8000-000000000002','kaleci2@oyna.app','Kadir Yücel'),
  ('d0e51c00-0000-4000-8000-000000000003','kaleci3@oyna.app','Selçuk Aslan'),
  -- 2 HAKEM
  ('d0e51d00-0000-4000-8000-000000000001','hakem1@oyna.app','Yusuf Korkmaz'),
  ('d0e51d00-0000-4000-8000-000000000002','hakem2@oyna.app','Selim Erdoğan')
) AS v(id, email, full_name)
ON CONFLICT (id) DO NOTHING;

-- Rerun güvenliği: token kolonlarını '' garanti et (GoTrue NULL'da panikler).
UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE id::text LIKE 'd0e51%';

-- ─── 2) AUTH IDENTITIES (e-posta sağlayıcısı) ───────────────────────────────
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.id::text LIKE 'd0e51%'
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email');

-- ─── 3) OYUNCU PROFİLLERİ (20) ──────────────────────────────────────────────
UPDATE public.profiles p SET
  full_name    = v.full_name,
  name         = v.full_name,
  role         = 'PLAYER',
  roles        = '["PLAYER"]'::jsonb,
  verification_status = 'approved',
  rating       = v.rating,
  skill_rating = GREATEST(1.0, LEAST(5.0, v.rating/2.0)),
  match_count  = v.mc,
  position     = v.pos,
  bio          = 'Ordu demo oyuncusu.',
  is_verified  = true,
  is_available = true,
  card_tier    = v.tier,
  -- Kurucu kararı (20 Ağu 2026): renkli üreteç avatarı YOK — avatar boş kalır,
  -- UserAvatar saydam zemin + opak baş harf yedeğini çizer (tek görsel dil).
  avatar_url   = NULL,
  last_active_at = now(),
  last_location = jsonb_build_object('lat',40.9839,'lng',37.8764,'city','Ordu','district','Altınordu','label','Altınordu, Ordu')
FROM (VALUES
  ('d0e51a00-0000-4000-8000-000000000001'::uuid,'Emre Kaya','SAG_KANAT','gold',9.1::numeric,88),
  ('d0e51a00-0000-4000-8000-000000000002'::uuid,'Burak Demir','ORTA_SAHA','gold',8.7::numeric,74),
  ('d0e51a00-0000-4000-8000-000000000003'::uuid,'Mert Yıldız','STOPER','gold',8.5::numeric,80),
  ('d0e51a00-0000-4000-8000-000000000004'::uuid,'Can Aydın','SOL_KANAT','gold',8.9::numeric,66),
  ('d0e51a00-0000-4000-8000-000000000005'::uuid,'Ozan Şahin','ORTA_SAHA','silver',7.8::numeric,58),
  ('d0e51a00-0000-4000-8000-000000000006'::uuid,'Deniz Arslan','STOPER','silver',7.5::numeric,49),
  ('d0e51a00-0000-4000-8000-000000000007'::uuid,'Kaan Çelik','SAG_KANAT','silver',7.2::numeric,42),
  ('d0e51a00-0000-4000-8000-000000000008'::uuid,'Ali Koç','ORTA_SAHA','silver',7.6::numeric,55),
  ('d0e51a00-0000-4000-8000-000000000009'::uuid,'Efe Doğan','STOPER','silver',7.1::numeric,39),
  ('d0e51a00-0000-4000-8000-000000000010'::uuid,'Berk Aksoy','SOL_KANAT','silver',7.4::numeric,45),
  ('d0e51a00-0000-4000-8000-000000000011'::uuid,'Umut Yılmaz','ORTA_SAHA','bronze',6.2::numeric,24),
  ('d0e51a00-0000-4000-8000-000000000012'::uuid,'Serkan Öztürk','STOPER','bronze',5.9::numeric,19),
  ('d0e51a00-0000-4000-8000-000000000013'::uuid,'Barış Kurt','SAG_KANAT','bronze',6.0::numeric,21),
  ('d0e51a00-0000-4000-8000-000000000014'::uuid,'Tolga Erdem','ORTA_SAHA','bronze',5.6::numeric,14),
  ('d0e51a00-0000-4000-8000-000000000015'::uuid,'Onur Taş','STOPER','bronze',5.8::numeric,17),
  ('d0e51a00-0000-4000-8000-000000000016'::uuid,'Cem Polat','SOL_KANAT','silver',7.0::numeric,36),
  ('d0e51a00-0000-4000-8000-000000000017'::uuid,'Yusuf Bulut','ORTA_SAHA','silver',7.3::numeric,41),
  ('d0e51a00-0000-4000-8000-000000000018'::uuid,'Furkan Acar','SAG_KANAT','bronze',6.1::numeric,22),
  ('d0e51a00-0000-4000-8000-000000000019'::uuid,'Görkem Ateş','STOPER','gold',8.4::numeric,70),
  ('d0e51a00-0000-4000-8000-000000000020'::uuid,'Sinan Yalçın','ORTA_SAHA','gold',8.6::numeric,72)
) AS v(id, full_name, pos, tier, rating, mc)
WHERE p.id = v.id;

-- ─── 4) SAHA SAHİBİ PROFİLLERİ (4) → OWNER rolü owner_accounts'u tetikler ────
UPDATE public.profiles p SET
  full_name    = v.full_name,
  name         = v.full_name,
  role         = 'OWNER',
  roles        = '["OWNER","PLAYER"]'::jsonb,
  verification_status = 'approved',
  is_verified  = true,
  is_available = true,
  bio          = v.bio,
  avatar_url   = 'https://ui-avatars.com/api/?background=1F6FEB&color=fff&name=' || replace(v.full_name,' ','+'),
  last_active_at = now(),
  last_location = jsonb_build_object('lat',40.9839,'lng',37.8764,'city','Ordu','district','Altınordu','label','Altınordu, Ordu')
FROM (VALUES
  ('d0e51b00-0000-4000-8000-000000000001'::uuid,'Hakan Capo','Capo Arena işletmecisi.'),
  ('d0e51b00-0000-4000-8000-000000000002'::uuid,'Kemal Olimpiyat','Olimpiyat Sahası işletmecisi.'),
  ('d0e51b00-0000-4000-8000-000000000003'::uuid,'Volkan Vip','VIP Arena işletmecisi.'),
  ('d0e51b00-0000-4000-8000-000000000004'::uuid,'Ahmet Kuru','Ahmet Kuru Tesisleri işletmecisi.')
) AS v(id, full_name, bio)
WHERE p.id = v.id;

-- owner_accounts (trigger de açar; yine de idempotent garanti)
INSERT INTO public.owner_accounts (owner_user_id, plan_tier, status, billing_email)
SELECT id::uuid, 'pro', 'active', email FROM (VALUES
  ('d0e51b00-0000-4000-8000-000000000001','saha1@oyna.app'),
  ('d0e51b00-0000-4000-8000-000000000002','saha2@oyna.app'),
  ('d0e51b00-0000-4000-8000-000000000003','saha3@oyna.app'),
  ('d0e51b00-0000-4000-8000-000000000004','saha4@oyna.app')
) AS v(id, email)
ON CONFLICT DO NOTHING;

-- SAHA SAHİPLİĞİ ATAMASI (4 saha → 4 sahip)
UPDATE public.pitches SET owner_id = 'd0e51b00-0000-4000-8000-000000000001' WHERE id = 'a0000001-0001-4001-8001-000000000001'; -- Capo Arena
UPDATE public.pitches SET owner_id = 'd0e51b00-0000-4000-8000-000000000002' WHERE id = 'a0000002-0002-4002-8002-000000000002'; -- Olimpiyat
UPDATE public.pitches SET owner_id = 'd0e51b00-0000-4000-8000-000000000003' WHERE id = 'a0000003-0003-4003-8003-000000000003'; -- VIP Arena
UPDATE public.pitches SET owner_id = 'd0e51b00-0000-4000-8000-000000000004' WHERE id = 'a0000004-0004-4004-8004-000000000004'; -- Ahmet Kuru

-- ─── 5) KALECİ PROFİLLERİ (3) + goalkeepers katalog satırı (authUid) ─────────
UPDATE public.profiles p SET
  full_name    = v.full_name,
  name         = v.full_name,
  role         = 'GOALKEEPER',
  roles        = '["GOALKEEPER","PLAYER"]'::jsonb,
  verification_status = 'approved',
  is_verified  = true,
  is_available = true,
  position     = 'KALECI',
  rating       = v.rating,
  bio          = v.bio,
  avatar_url   = 'https://ui-avatars.com/api/?background=238636&color=fff&name=' || replace(v.full_name,' ','+'),
  last_active_at = now(),
  last_location = jsonb_build_object('lat',40.9839,'lng',37.8764,'city','Ordu','district','Altınordu','label','Altınordu, Ordu')
FROM (VALUES
  ('d0e51c00-0000-4000-8000-000000000001'::uuid,'Ahmet Çalık',8.4::numeric,'Alan hakimiyeti güçlü deneyimli kaleci.'),
  ('d0e51c00-0000-4000-8000-000000000002'::uuid,'Kadir Yücel',7.6::numeric,'Genç, refleksleri hızlı kaleci.'),
  ('d0e51c00-0000-4000-8000-000000000003'::uuid,'Selçuk Aslan',8.0::numeric,'Penaltı uzmanı, çizgi savunmasında etkili.')
) AS v(id, full_name, rating, bio)
WHERE p.id = v.id;

INSERT INTO public.goalkeepers
  (id, "authUid", name, height, age, rating, fee, "matchCount", style, bio, "preferredZones", "isElite", stats, skills, coordinates, "isDemo", created_at)
VALUES
  ('d0e51c00-0000-4000-8000-000000000001','d0e51c00-0000-4000-8000-000000000001','Ahmet Çalık','188cm',27,8.4,150,62,'Sweeper-Keeper',
   'Alan hakimiyeti güçlü deneyimli kaleci.', '["ordu","altinordu"]', true,
   '{"kurtarish_orani":74,"temiz_kale":28,"gol_yedi":48,"pas_isabeti":81}'::jsonb,
   '{"refleks":8.8,"alan_hakimiyeti":8.2,"uzak_top":7.9,"top_tutma":8.5}'::jsonb,
   '{"lat":40.9839,"lng":37.8764}'::jsonb, false, now()),
  ('d0e51c00-0000-4000-8000-000000000002','d0e51c00-0000-4000-8000-000000000002','Kadir Yücel','184cm',23,7.6,100,35,'Klasik Kaleci',
   'Genç, refleksleri hızlı kaleci.', '["ordu"]', false,
   '{"kurtarish_orani":68,"temiz_kale":14,"gol_yedi":22,"pas_isabeti":72}'::jsonb,
   '{"refleks":7.9,"alan_hakimiyeti":7.0,"uzak_top":7.2,"top_tutma":7.6}'::jsonb,
   '{"lat":40.9805,"lng":37.8702}'::jsonb, false, now()),
  ('d0e51c00-0000-4000-8000-000000000003','d0e51c00-0000-4000-8000-000000000003','Selçuk Aslan','190cm',30,8.0,130,50,'Panter',
   'Penaltı uzmanı, çizgi savunmasında etkili.', '["ordu","altinordu"]', false,
   '{"kurtarish_orani":71,"temiz_kale":20,"gol_yedi":30,"pas_isabeti":77}'::jsonb,
   '{"refleks":8.4,"alan_hakimiyeti":7.6,"uzak_top":7.5,"top_tutma":8.1}'::jsonb,
   '{"lat":40.9912,"lng":37.8845}'::jsonb, false, now())
ON CONFLICT (id) DO UPDATE SET
  "authUid" = EXCLUDED."authUid", name = EXCLUDED.name, rating = EXCLUDED.rating, fee = EXCLUDED.fee;

-- ─── 6) HAKEM PROFİLLERİ (2) + referees katalog satırı (authUid) ────────────
UPDATE public.profiles p SET
  full_name    = v.full_name,
  name         = v.full_name,
  role         = 'REFEREE',
  roles        = '["REFEREE","PLAYER"]'::jsonb,
  verification_status = 'approved',
  is_verified  = true,
  is_available = true,
  position     = 'HAKEM',
  rating       = v.rating,
  bio          = v.bio,
  avatar_url   = 'https://ui-avatars.com/api/?background=D29922&color=000&name=' || replace(v.full_name,' ','+'),
  last_active_at = now(),
  last_location = jsonb_build_object('lat',40.9839,'lng',37.8764,'city','Ordu','district','Altınordu','label','Altınordu, Ordu')
FROM (VALUES
  ('d0e51d00-0000-4000-8000-000000000001'::uuid,'Yusuf Korkmaz',8.9::numeric,'Kural uygulamasında tutarlı, tercih edilen hakem.'),
  ('d0e51d00-0000-4000-8000-000000000002'::uuid,'Selim Erdoğan',7.7::numeric,'Oyunu aktif tutan, gereksiz kesmeyen hakem.')
) AS v(id, full_name, rating, bio)
WHERE p.id = v.id;

INSERT INTO public.referees
  (id, "authUid", name, level, "matchCount", fee, rating, style, bio, "preferredZones", "isElite", stats, coordinates, "isDemo", created_at)
VALUES
  ('d0e51d00-0000-4000-8000-000000000001','d0e51d00-0000-4000-8000-000000000001','Yusuf Korkmaz','UEFA B',88,200,8.9,'Sıkı Disiplinci',
   'Kural uygulamasında tutarlı, tercih edilen hakem.', '["ordu","giresun"]', true,
   '{"mac_sayisi":88,"sari_kart_ort":2.1,"kirmizi_kart_ort":0.2,"itiraz_orani":4}'::jsonb,
   '{"lat":40.9839,"lng":37.8764}'::jsonb, false, now()),
  ('d0e51d00-0000-4000-8000-000000000002','d0e51d00-0000-4000-8000-000000000002','Selim Erdoğan','MHK',44,120,7.7,'Oyun Yanlısı',
   'Oyunu aktif tutan, gereksiz kesmeyen hakem.', '["ordu"]', false,
   '{"mac_sayisi":44,"sari_kart_ort":1.4,"kirmizi_kart_ort":0.1,"itiraz_orani":8}'::jsonb,
   '{"lat":40.9805,"lng":37.8702}'::jsonb, false, now())
ON CONFLICT (id) DO UPDATE SET
  "authUid" = EXCLUDED."authUid", name = EXCLUDED.name, rating = EXCLUDED.rating, fee = EXCLUDED.fee;

-- ─── 7) 5 DEMO MAÇ (Ordu sahaları) — gelecek tarihli, kadrolar yerleşik ─────
INSERT INTO public.matches (
  id, title, location, date, "time", price, difficulty, "minRating",
  format, duration, gender, "ageGroup", slots, "awaySlots", "missingPositions",
  status, "creatorId", "captain_id", "refereeId", gk_id, pitch_id,
  visibility, "isDemo", "is_successful", "starts_at", created_at, "chatMessages", "reservePlayers", badges
) VALUES
-- M1 · Capo Arena · 07.07.2026 20:00 · 7v7
('d0e51e00-0000-4000-8000-000000000001','Capo Arena Akşam 7v7','Capo Arena, Altınordu / Ordu','07.07.2026','20:00',180,'Orta',3.0,
 '7v7','60dk','Erkek','18+',
 '[{"id":"h1","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000001"},{"id":"h2","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000002"},{"id":"h3","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000003"},{"id":"h4","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000004"},{"id":"h5","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000005"},{"id":"h6","status":"OPEN"},{"id":"h7","status":"OPEN"}]'::jsonb,
 '[{"id":"a1","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000006"},{"id":"a2","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000007"},{"id":"a3","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000008"},{"id":"a4","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000009"},{"id":"a5","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000010"},{"id":"a6","status":"OPEN"},{"id":"a7","status":"OPEN"}]'::jsonb,
 '[{"role":"PLAYER","count":4}]'::jsonb,'OPEN',
 'd0e51a00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000001',
 'd0e51d00-0000-4000-8000-000000000001','d0e51c00-0000-4000-8000-000000000001',
 'a0000001-0001-4001-8001-000000000001','OPEN',false,false,'2026-07-07 17:00:00+00',now(),'[]','[]','["Aktif Maç","Seviye Uyumlu"]'),
-- M2 · Olimpiyat · 08.07.2026 21:00 · 7v7
('d0e51e00-0000-4000-8000-000000000002','Olimpiyat Gece Maçı 7v7','Olimpiyat, Altınordu / Ordu','08.07.2026','21:00',160,'Kolay',0,
 '7v7','60dk','Karma','Herkese Açık',
 '[{"id":"h1","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000011"},{"id":"h2","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000012"},{"id":"h3","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000013"},{"id":"h4","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000014"},{"id":"h5","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000015"},{"id":"h6","status":"OPEN"},{"id":"h7","status":"OPEN"}]'::jsonb,
 '[{"id":"a1","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000016"},{"id":"a2","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000017"},{"id":"a3","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000018"},{"id":"a4","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000019"},{"id":"a5","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000020"},{"id":"a6","status":"OPEN"},{"id":"a7","status":"OPEN"}]'::jsonb,
 '[{"role":"PLAYER","count":4}]'::jsonb,'OPEN',
 'd0e51a00-0000-4000-8000-000000000011','d0e51a00-0000-4000-8000-000000000011',
 'd0e51d00-0000-4000-8000-000000000002','d0e51c00-0000-4000-8000-000000000002',
 'a0000002-0002-4002-8002-000000000002','OPEN',false,false,'2026-07-08 18:00:00+00',now(),'[]','[]','["Başlangıç Dostu","Eğlenceli"]'),
-- M3 · VIP Arena · 09.07.2026 19:00 · 8v8
('d0e51e00-0000-4000-8000-000000000003','VIP Arena Premium 8v8','VIP Arena, Altınordu / Ordu','09.07.2026','19:00',280,'Zor',4.0,
 '8v8','90dk','Erkek','18+',
 '[{"id":"h1","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000001"},{"id":"h2","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000003"},{"id":"h3","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000005"},{"id":"h4","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000007"},{"id":"h5","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000009"},{"id":"h6","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000011"},{"id":"h7","status":"OPEN"},{"id":"h8","status":"OPEN"}]'::jsonb,
 '[{"id":"a1","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000002"},{"id":"a2","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000004"},{"id":"a3","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000006"},{"id":"a4","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000008"},{"id":"a5","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000010"},{"id":"a6","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000012"},{"id":"a7","status":"OPEN"},{"id":"a8","status":"OPEN"}]'::jsonb,
 '[{"role":"PLAYER","count":4}]'::jsonb,'OPEN',
 'd0e51a00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000001',
 'd0e51d00-0000-4000-8000-000000000001','d0e51c00-0000-4000-8000-000000000003',
 'a0000003-0003-4003-8003-000000000003','OPEN',false,false,'2026-07-09 16:00:00+00',now(),'[]','[]','["Elit","Yüksek Rekabet","Premium Saha"]'),
-- M4 · Ahmet Kuru Tesisleri · 10.07.2026 22:00 · 5v5
('d0e51e00-0000-4000-8000-000000000004','Ahmet Kuru 5v5 Halı Saha','Ahmet Kuru Tesisleri, Altınordu / Ordu','10.07.2026','22:00',150,'Orta',2.5,
 '5v5','60dk','Erkek','Herkese Açık',
 '[{"id":"h1","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000013"},{"id":"h2","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000014"},{"id":"h3","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000015"},{"id":"h4","status":"OPEN"},{"id":"h5","status":"OPEN"}]'::jsonb,
 '[{"id":"a1","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000016"},{"id":"a2","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000017"},{"id":"a3","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000018"},{"id":"a4","status":"OPEN"},{"id":"a5","status":"OPEN"}]'::jsonb,
 '[{"role":"PLAYER","count":4}]'::jsonb,'OPEN',
 'd0e51a00-0000-4000-8000-000000000013','d0e51a00-0000-4000-8000-000000000013',
 'd0e51d00-0000-4000-8000-000000000002','d0e51c00-0000-4000-8000-000000000001',
 'a0000004-0004-4004-8004-000000000004','OPEN',false,false,'2026-07-10 19:00:00+00',now(),'[]','[]','["Aktif Maç"]'),
-- M5 · Capo Arena · 12.07.2026 20:00 · 7v7
('d0e51e00-0000-4000-8000-000000000005','Capo Arena Hafta Sonu 7v7','Capo Arena, Altınordu / Ordu','12.07.2026','20:00',180,'Orta',3.0,
 '7v7','60dk','Karma','18+',
 '[{"id":"h1","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000019"},{"id":"h2","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000020"},{"id":"h3","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000001"},{"id":"h4","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000002"},{"id":"h5","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000005"},{"id":"h6","status":"OPEN"},{"id":"h7","status":"OPEN"}]'::jsonb,
 '[{"id":"a1","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000010"},{"id":"a2","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000012"},{"id":"a3","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000014"},{"id":"a4","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000016"},{"id":"a5","status":"TAKEN","userId":"d0e51a00-0000-4000-8000-000000000018"},{"id":"a6","status":"OPEN"},{"id":"a7","status":"OPEN"}]'::jsonb,
 '[{"role":"PLAYER","count":4}]'::jsonb,'OPEN',
 'd0e51a00-0000-4000-8000-000000000019','d0e51a00-0000-4000-8000-000000000019',
 'd0e51d00-0000-4000-8000-000000000001','d0e51c00-0000-4000-8000-000000000002',
 'a0000001-0001-4001-8001-000000000001','OPEN',false,false,'2026-07-12 17:00:00+00',now(),'[]','[]','["Aktif Maç","Hafta Sonu"]')
ON CONFLICT (id) DO NOTHING;

-- ─── 8) MAÇ KATILIMCILARI ───────────────────────────────────────────────────
DELETE FROM public.match_participants WHERE match_id::text LIKE 'd0e51e00%';
INSERT INTO public.match_participants (match_id, user_id, role, status, joined_at) VALUES
-- M1
('d0e51e00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000001','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000002','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000003','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000004','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000005','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000006','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000007','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000008','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000009','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000001','d0e51a00-0000-4000-8000-000000000010','away','confirmed',now()),
-- M2
('d0e51e00-0000-4000-8000-000000000002','d0e51a00-0000-4000-8000-000000000011','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000002','d0e51a00-0000-4000-8000-000000000012','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000002','d0e51a00-0000-4000-8000-000000000013','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000002','d0e51a00-0000-4000-8000-000000000014','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000002','d0e51a00-0000-4000-8000-000000000015','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000002','d0e51a00-0000-4000-8000-000000000016','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000002','d0e51a00-0000-4000-8000-000000000017','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000002','d0e51a00-0000-4000-8000-000000000018','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000002','d0e51a00-0000-4000-8000-000000000019','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000002','d0e51a00-0000-4000-8000-000000000020','away','confirmed',now()),
-- M3
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000001','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000003','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000005','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000007','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000009','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000011','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000002','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000004','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000006','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000008','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000010','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000003','d0e51a00-0000-4000-8000-000000000012','away','confirmed',now()),
-- M4
('d0e51e00-0000-4000-8000-000000000004','d0e51a00-0000-4000-8000-000000000013','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000004','d0e51a00-0000-4000-8000-000000000014','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000004','d0e51a00-0000-4000-8000-000000000015','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000004','d0e51a00-0000-4000-8000-000000000016','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000004','d0e51a00-0000-4000-8000-000000000017','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000004','d0e51a00-0000-4000-8000-000000000018','away','confirmed',now()),
-- M5
('d0e51e00-0000-4000-8000-000000000005','d0e51a00-0000-4000-8000-000000000019','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000005','d0e51a00-0000-4000-8000-000000000020','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000005','d0e51a00-0000-4000-8000-000000000001','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000005','d0e51a00-0000-4000-8000-000000000002','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000005','d0e51a00-0000-4000-8000-000000000005','home','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000005','d0e51a00-0000-4000-8000-000000000010','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000005','d0e51a00-0000-4000-8000-000000000012','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000005','d0e51a00-0000-4000-8000-000000000014','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000005','d0e51a00-0000-4000-8000-000000000016','away','confirmed',now()),
('d0e51e00-0000-4000-8000-000000000005','d0e51a00-0000-4000-8000-000000000018','away','confirmed',now());

COMMIT;
