-- ============================================================================
-- ORDU DEMO SEED — manuel UI testi için tam veri kümesi
-- ----------------------------------------------------------------------------
-- İÇERİK:
--   • 15 oyuncu (gold/silver/bronze) + 1 tesis sahibi (mirackerem → Olimpiyat)
--   • Tüm oyuncular birbiriyle ARKADAŞ (ACCEPTED)
--   • 2 takım: "Ordu Şimşekleri" (7 oyuncu) + "Altınordu United" (8 oyuncu)
--   • 3 maç + katılımcılar (match_participants) — Ordu/Altınordu sahalarında
--   • 2 kaleci + 2 hakem (marketplace ilanı)
--   • Hepsi Ordu/Altınordu konumunda AKTİF (last_location + is_available)
--
-- GİRİŞ: tüm hesaplar  e-posta (@oyna.app) + şifre `password123`
--        dev-mode'da (VITE_DEV_MODE=true) yalnız e-posta ile (OTP'siz) giriş.
--        sahip kısayolu: e-posta alanına "mirackerem" yaz.
--  NOT: @oyna.app kullanıldı çünkü GoTrue MX'siz domain'leri (@oyna-test.com)
--       reddediyor. auth.users'a elle eklerken GoTrue'nun beklediği alanlar:
--       instance_id, boş-string token kolonları ve auth.identities satırı ŞART.
--
-- TÜM kayıtlar is_demo=FALSE'tır (tüketici uygulamasında GÖRÜNÜR olsun diye);
-- ancak sabit UUID önekleriyle işaretli → tek dosyayla silinebilir:
--   oyuncular bb0000xx · sahip bb0000 99 · takımlar dd0000xx
--   maçlar cc0000xx · kaleci ee0000xx · hakem ff0000xx
-- SİLMEK İÇİN: ordu_demo_purge.sql çalıştır.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'a yapıştır ya da psql ile çalıştır.
-- Idempotent: tekrar çalıştırılabilir (ON CONFLICT / DELETE+INSERT).
-- ============================================================================

-- ─── 1) AUTH KULLANICILARI (15 oyuncu + owner) ──────────────────────────────
-- Trigger handle_new_user() profilleri otomatik oluşturur.
-- GoTrue uyumu için: instance_id sabit, token kolonları '' (NULL DEĞİL), confirmed.
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
  ('bb000001-0000-4000-8000-000000000001','mehmet.yilmaz@oyna.app','Mehmet Yılmaz'),
  ('bb000002-0000-4000-8000-000000000002','ali.kaya@oyna.app','Ali Kaya'),
  ('bb000003-0000-4000-8000-000000000003','burak.celik@oyna.app','Burak Çelik'),
  ('bb000004-0000-4000-8000-000000000004','emre.demir@oyna.app','Emre Demir'),
  ('bb000005-0000-4000-8000-000000000005','okan.sahin@oyna.app','Okan Şahin'),
  ('bb000006-0000-4000-8000-000000000006','serkan.ozkan@oyna.app','Serkan Özkan'),
  ('bb000007-0000-4000-8000-000000000007','fatih.arslan@oyna.app','Fatih Arslan'),
  ('bb000008-0000-4000-8000-000000000008','hasan.gunes@oyna.app','Hasan Güneş'),
  ('bb000009-0000-4000-8000-000000000009','murat.aktas@oyna.app','Murat Aktaş'),
  ('bb000010-0000-4000-8000-000000000010','tarik.aydin@oyna.app','Tarık Aydın'),
  ('bb000011-0000-4000-8000-000000000011','kerem.koc@oyna.app','Kerem Koç'),
  ('bb000012-0000-4000-8000-000000000012','berk.yildiz@oyna.app','Berk Yıldız'),
  ('bb000013-0000-4000-8000-000000000013','ugur.turan@oyna.app','Uğur Turan'),
  ('bb000014-0000-4000-8000-000000000014','can.dogan@oyna.app','Can Doğan'),
  ('bb000015-0000-4000-8000-000000000015','ege.kilic@oyna.app','Ege Kılıç'),
  ('bb000099-0000-4000-8000-000000000099','mirackerem@oyna.app','Miraç Kerem — Olimpiyat Sahibi')
) AS v(id, email, full_name)
ON CONFLICT (id) DO NOTHING;

-- Şifre + GoTrue zorunlu alanları (tekrar çalıştırmada da tutarlı olsun)
UPDATE auth.users
SET encrypted_password = crypt('password123', gen_salt('bf')),
    instance_id = '00000000-0000-0000-0000-000000000000',
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    confirmation_token = COALESCE(confirmation_token,''), recovery_token = COALESCE(recovery_token,''),
    email_change_token_new = COALESCE(email_change_token_new,''), email_change = COALESCE(email_change,''),
    email_change_token_current = COALESCE(email_change_token_current,''),
    phone_change = COALESCE(phone_change,''), phone_change_token = COALESCE(phone_change_token,''),
    reauthentication_token = COALESCE(reauthentication_token,''),
    email_change_confirm_status = COALESCE(email_change_confirm_status,0),
    updated_at = now()
WHERE id::text LIKE 'bb0000%';

-- E-posta sağlayıcı kimliği (GoTrue e-posta→kullanıcı çözümü için ŞART)
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.id::text LIKE 'bb0000%'
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider='email');

-- ─── 2) OYUNCU PROFİLLERİ ───────────────────────────────────────────────────
UPDATE public.profiles SET
  position       = v.position,
  card_tier      = v.card_tier,
  card_active    = true,
  rating         = v.rating,
  match_count    = v.match_count,
  total_matches  = v.match_count,
  win_count      = v.win_count,
  bio            = v.bio,
  oyna_id        = v.oyna_id,
  is_verified    = true,
  is_available   = true,
  is_looking_for_team = false,
  wallet_balance = v.wallet_balance,
  wallet         = v.wallet_balance,
  last_active_at = now() - (v.days_ago || ' minutes')::interval,
  last_location  = jsonb_build_object('lat',40.9839,'lng',37.8764,'city','Ordu','district','Altınordu','label','Altınordu, Ordu'),
  skill_rating   = GREATEST(1.0, LEAST(5.0, v.rating/2.0)),
  trust_score    = LEAST(5.0, v.rating/2.0),
  reliability_score = v.reliability,
  role           = 'PLAYER',
  roles          = '["PLAYER"]'::jsonb,
  player_card    = jsonb_build_object(
    'overall', LEAST(99, GREATEST(40, round(v.rating*10)::int)),
    'tier', v.card_tier, 'isStatsVerified', true,
    'diamondValue', GREATEST(0, round((v.rating-5)*4)::int),
    'winCount', v.win_count, 'totalMatches', v.match_count, 'cardImage', null,
    'stats', jsonb_build_object(
      'pace',      jsonb_build_object('value', LEAST(99,GREATEST(40, round(v.rating*10)::int + CASE WHEN v.position IN ('SAG_KANAT','SOL_KANAT') THEN 6 ELSE 3 END)), 'videoUrl', null),
      'shooting',  jsonb_build_object('value', LEAST(99,GREATEST(40, round(v.rating*10)::int + CASE WHEN v.position='STOPER' THEN -6 ELSE 2 END)), 'videoUrl', null),
      'passing',   jsonb_build_object('value', LEAST(99,GREATEST(40, round(v.rating*10)::int + CASE WHEN v.position='ORTA_SAHA' THEN 4 ELSE 0 END)), 'videoUrl', null),
      'dribbling', jsonb_build_object('value', LEAST(99,GREATEST(40, round(v.rating*10)::int + CASE WHEN v.position IN ('SAG_KANAT','SOL_KANAT','ORTA_SAHA') THEN 3 ELSE -2 END)), 'videoUrl', null),
      'defense',   jsonb_build_object('value', LEAST(99,GREATEST(40, round(v.rating*10)::int + CASE WHEN v.position='STOPER' THEN 6 ELSE -7 END)), 'videoUrl', null),
      'physical',  jsonb_build_object('value', LEAST(99,GREATEST(40, round(v.rating*10)::int + CASE WHEN v.position='STOPER' THEN 3 ELSE -1 END)), 'videoUrl', null)
    ))
FROM (VALUES
  ('bb000001-0000-4000-8000-000000000001'::uuid,'SAG_KANAT','gold',9.2::numeric,112,78,'Ordu''nun en hızlı kanat oyuncularından. Çapraz vuruş uzmanlığı.','ORDU1001',450.0::numeric,5,95),
  ('bb000002-0000-4000-8000-000000000002'::uuid,'ORTA_SAHA','gold',8.8::numeric,98,63,'Top dağıtımında çok başarılı, maça hakimiyet kurmayı sever.','ORDU1002',320.0::numeric,12,92),
  ('bb000003-0000-4000-8000-000000000003'::uuid,'STOPER','gold',8.6::numeric,105,71,'Hava toplarında güçlü, rakip forvetlerin kabusu.','ORDU1003',280.0::numeric,8,97),
  ('bb000004-0000-4000-8000-000000000004'::uuid,'SOL_KANAT','gold',9.0::numeric,87,60,'Sol ayak uzmanlığı, penaltı ve serbest vuruşta güvenilir.','ORDU1004',510.0::numeric,3,90),
  ('bb000005-0000-4000-8000-000000000005'::uuid,'ORTA_SAHA','gold',8.7::numeric,76,50,'Çift ayaklı oyun stili, pressing konusunda iddialı.','ORDU1005',175.0::numeric,20,88),
  ('bb000006-0000-4000-8000-000000000006'::uuid,'STOPER','silver',7.4::numeric,48,30,'Disiplinli defans anlayışı, bölge savunmasında deneyimli.','ORDU1006',90.0::numeric,35,82),
  ('bb000007-0000-4000-8000-000000000007'::uuid,'SAG_KANAT','silver',7.1::numeric,41,24,'Genç ve enerjik, rakip defansları çabukluğuyla zorluyor.','ORDU1007',60.0::numeric,18,79),
  ('bb000008-0000-4000-8000-000000000008'::uuid,'ORTA_SAHA','silver',7.6::numeric,55,35,'Oyun kurma ve pas açma konusunda güçlü bir profil.','ORDU1008',130.0::numeric,9,85),
  ('bb000009-0000-4000-8000-000000000009'::uuid,'STOPER','silver',7.0::numeric,38,22,'Top kapma ve engelleme yetenekleri öne çıkıyor.','ORDU1009',45.0::numeric,55,80),
  ('bb000010-0000-4000-8000-000000000010'::uuid,'SOL_KANAT','silver',7.3::numeric,44,27,'Hız ve kondisyon ön planda, iyi takım oyuncusu.','ORDU1010',75.0::numeric,28,83),
  ('bb000011-0000-4000-8000-000000000011'::uuid,'ORTA_SAHA','bronze',5.8::numeric,18,9,'Futbola tutkusu yüksek, gelişmeye devam ediyor.','ORDU1011',20.0::numeric,90,70),
  ('bb000012-0000-4000-8000-000000000012'::uuid,'STOPER','bronze',5.5::numeric,14,7,'Fizik gücü iyi, taktik anlayışını geliştiriyor.','ORDU1012',15.0::numeric,120,68),
  ('bb000013-0000-4000-8000-000000000013'::uuid,'SAG_KANAT','bronze',5.9::numeric,20,10,'İyi hız kapasitesi var, daha fazla maç deneyimi arıyor.','ORDU1013',30.0::numeric,40,72),
  ('bb000014-0000-4000-8000-000000000014'::uuid,'ORTA_SAHA','bronze',5.4::numeric,11,5,'Yeni başlayan ama öğrenmeye açık bir oyun anlayışı var.','ORDU1014',10.0::numeric,200,65),
  ('bb000015-0000-4000-8000-000000000015'::uuid,'STOPER','bronze',5.7::numeric,16,8,'Savunma pozisyonunda kendini ispatlıyor.','ORDU1015',25.0::numeric,75,67)
) AS v(id,position,card_tier,rating,match_count,win_count,bio,oyna_id,wallet_balance,days_ago,reliability)
WHERE public.profiles.id = v.id;

-- full_name'i doldur (UI arkadaş/oyuncu listelerinde full_name kullanılıyor)
UPDATE public.profiles SET full_name = name
WHERE id::text LIKE 'bb0000%' AND id::text NOT LIKE 'bb000099%'
  AND (full_name IS NULL OR full_name = '') AND name IS NOT NULL;

-- ─── 3) TESİS SAHİBİ PROFİLİ (mirackerem) ───────────────────────────────────
UPDATE public.profiles SET
  full_name      = 'Miraç Kerem',
  role           = 'OWNER',
  roles          = '["OWNER","PLAYER"]'::jsonb,
  is_verified    = true,
  is_available   = true,
  oyna_id        = 'ORDU0099',
  bio            = 'Olimpiyat Sahası işletmecisi.',
  last_active_at = now(),
  last_location  = jsonb_build_object('lat',40.9839,'lng',37.8764,'city','Ordu','district','Altınordu','label','Altınordu, Ordu')
WHERE id = 'bb000099-0000-4000-8000-000000000099';

-- ─── 4) TESİS SAHİPLİĞİ: Olimpiyat → mirackerem ─────────────────────────────
INSERT INTO public.owner_accounts (owner_user_id, plan_tier, status, billing_email)
VALUES ('bb000099-0000-4000-8000-000000000099','pro','active','mirackerem@oyna-test.com')
ON CONFLICT DO NOTHING;

UPDATE public.pitches
SET owner_id = 'bb000099-0000-4000-8000-000000000099'
WHERE id = 'a0000002-0002-4002-8002-000000000002';   -- Olimpiyat

-- ─── 5) KALECİLER & HAKEMLER (sabit id'lerle) ───────────────────────────────
DELETE FROM public.goalkeepers WHERE id::text LIKE 'ee0000%'
   OR name IN ('Ahmet Çalık','Kadir Yücel');
INSERT INTO public.goalkeepers (id, name, height, age, rating, fee, "matchCount", style, bio, "preferredZones", "isElite", stats, skills, "isDemo", created_at) VALUES
('ee000001-0000-4000-8000-000000000001','Ahmet Çalık','188cm',27,8.4,150,62,'Sweeper-Keeper','Ordu''da 5 yıldır aktif deneyimli kaleci. Alan savunmasında güçlü.','["sol_orta","sag_orta"]',true,'{"kurtarish_orani":74,"temiz_kale":28,"gol_yedi":48,"pas_isabeti":81}','{"refleks":8.8,"alan_hakimiyeti":8.2,"uzak_top":7.9,"top_tutma":8.5}',false,now()),
('ee000002-0000-4000-8000-000000000002','Kadir Yücel','184cm',23,7.6,100,35,'Klasik Kaleci','Genç ve gelecek vaadeden kaleci. Çizgi savunmasında etkili.','["merkez","sol_orta"]',false,'{"kurtarish_orani":68,"temiz_kale":14,"gol_yedi":22,"pas_isabeti":72}','{"refleks":7.9,"alan_hakimiyeti":7.0,"uzak_top":7.2,"top_tutma":7.6}',false,now());

DELETE FROM public.referees WHERE id::text LIKE 'ff0000%'
   OR name IN ('Yusuf Korkmaz','Selim Erdoğan');
INSERT INTO public.referees (id, name, level, "matchCount", fee, rating, style, bio, "preferredZones", "isElite", stats, "isDemo", created_at) VALUES
('ff000001-0000-4000-8000-000000000001','Yusuf Korkmaz','UEFA B',88,200,8.9,'Sıkı Disiplinci','Bölgede en çok tercih edilen hakem. Kural uygulamasında tutarlı.','["ordu","giresun"]',true,'{"mac_sayisi":88,"sari_kart_ort":2.1,"kirmizi_kart_ort":0.2,"itiraz_orani":4}',false,now()),
('ff000002-0000-4000-8000-000000000002','Selim Erdoğan','MHK',44,120,7.7,'Oyun Yanlısı','Oyunu aktif tutmayı seven, gereksiz kesmekten kaçınan hakem.','["ordu"]',false,'{"mac_sayisi":44,"sari_kart_ort":1.4,"kirmizi_kart_ort":0.1,"itiraz_orani":8}',false,now());

-- ─── 6) MAÇLAR (Ordu/Altınordu sahaları) ────────────────────────────────────
INSERT INTO public.matches (
  id, title, location, date, time, price, difficulty, "minRating",
  format, duration, gender, "ageGroup", slots, "awaySlots", "missingPositions",
  status, "creatorId", "captain_id", pitch_id, visibility, "isDemo", "is_successful",
  "starts_at", created_at, "chatMessages", "reservePlayers", badges
) VALUES
('cc000001-0000-4000-8000-000000000001','Altınordu Akşam 5v5 — Capo Arena','Capo Arena, Altınordu / Ordu','29.06.2026','19:00',200,'Orta',3.0,'5v5','60dk','Karma','18+',
 '[{"id":"h1","status":"TAKEN","userId":"bb000001-0000-4000-8000-000000000001"},{"id":"h2","status":"TAKEN","userId":"bb000002-0000-4000-8000-000000000002"},{"id":"h3","status":"TAKEN","userId":"bb000003-0000-4000-8000-000000000003"},{"id":"h4","status":"OPEN"},{"id":"h5","status":"OPEN"}]',
 '[{"id":"a1","status":"TAKEN","userId":"bb000006-0000-4000-8000-000000000006"},{"id":"a2","status":"TAKEN","userId":"bb000007-0000-4000-8000-000000000007"},{"id":"a3","status":"OPEN"},{"id":"a4","status":"OPEN"},{"id":"a5","status":"OPEN"}]',
 '[{"role":"PLAYER","count":5},{"role":"GK","count":1}]','OPEN',
 'bb000001-0000-4000-8000-000000000001','bb000001-0000-4000-8000-000000000001','a0000001-0001-4001-8001-000000000001','OPEN',false,false,
 '2026-06-29 16:00:00+00',now(),'[]','[]','["Aktif Maç","Seviye Uyumlu"]'),
('cc000002-0000-4000-8000-000000000002','Olimpiyat Sahası — Tüm Seviyeler','Olimpiyat Sahası, Altınordu / Ordu','29.06.2026','20:00',150,'Kolay',0,'5v5','60dk','Erkek','Herkese Açık',
 '[{"id":"h1","status":"TAKEN","userId":"bb000011-0000-4000-8000-000000000011"},{"id":"h2","status":"TAKEN","userId":"bb000013-0000-4000-8000-000000000013"},{"id":"h3","status":"OPEN"},{"id":"h4","status":"OPEN"},{"id":"h5","status":"OPEN"}]',
 '[{"id":"a1","status":"TAKEN","userId":"bb000014-0000-4000-8000-000000000014"},{"id":"a2","status":"OPEN"},{"id":"a3","status":"OPEN"},{"id":"a4","status":"OPEN"},{"id":"a5","status":"OPEN"}]',
 '[{"role":"PLAYER","count":7},{"role":"GK","count":2}]','OPEN',
 'bb000011-0000-4000-8000-000000000011','bb000011-0000-4000-8000-000000000011','a0000002-0002-4002-8002-000000000002','OPEN',false,false,
 '2026-06-29 17:00:00+00',now(),'[]','[]','["Başlangıç Dostu","Eğlenceli"]'),
('cc000003-0000-4000-8000-000000000003','VIP Arena Premium 5v5','VIP Arena, Altınordu / Ordu','30.06.2026','18:00',300,'Zor',4.0,'5v5','90dk','Erkek','18+',
 '[{"id":"h1","status":"TAKEN","userId":"bb000004-0000-4000-8000-000000000004"},{"id":"h2","status":"TAKEN","userId":"bb000005-0000-4000-8000-000000000005"},{"id":"h3","status":"TAKEN","userId":"bb000008-0000-4000-8000-000000000008"},{"id":"h4","status":"TAKEN","userId":"bb000009-0000-4000-8000-000000000009"},{"id":"h5","status":"OPEN"}]',
 '[{"id":"a1","status":"TAKEN","userId":"bb000010-0000-4000-8000-000000000010"},{"id":"a2","status":"TAKEN","userId":"bb000011-0000-4000-8000-000000000011"},{"id":"a3","status":"TAKEN","userId":"bb000012-0000-4000-8000-000000000012"},{"id":"a4","status":"OPEN"},{"id":"a5","status":"OPEN"}]',
 '[{"role":"PLAYER","count":3},{"role":"GK","count":1}]','OPEN',
 'bb000004-0000-4000-8000-000000000004','bb000004-0000-4000-8000-000000000004','a0000003-0003-4003-8003-000000000003','OPEN',false,false,
 '2026-06-30 15:00:00+00',now(),'[]','[]','["Elit","Yüksek Rekabet","Premium Saha"]')
ON CONFLICT (id) DO NOTHING;

-- Demo maçları daima OPEN kalsın (yaşam-döngüsü/iptal tetikleyicileri değiştirmiş olabilir).
-- get_nearby_matches keşfi OPEN+gelecek+koordinatlı saha ister.
UPDATE public.matches SET status='OPEN', cancel_reason=NULL, refund_status=NULL
WHERE id::text LIKE 'cc0000%' AND status <> 'OPEN';

-- ─── 7) MAÇ KATILIMCILARI ───────────────────────────────────────────────────
DELETE FROM public.match_participants WHERE match_id::text LIKE 'cc0000%';
INSERT INTO public.match_participants (match_id, user_id, role, status, joined_at) VALUES
-- Maç 1 (Capo Arena)
('cc000001-0000-4000-8000-000000000001','bb000001-0000-4000-8000-000000000001','home','confirmed',now()-interval '2 hours'),
('cc000001-0000-4000-8000-000000000001','bb000002-0000-4000-8000-000000000002','home','confirmed',now()-interval '1 hour 45 min'),
('cc000001-0000-4000-8000-000000000001','bb000003-0000-4000-8000-000000000003','home','confirmed',now()-interval '1 hour 30 min'),
('cc000001-0000-4000-8000-000000000001','bb000006-0000-4000-8000-000000000006','away','confirmed',now()-interval '1 hour'),
('cc000001-0000-4000-8000-000000000001','bb000007-0000-4000-8000-000000000007','away','confirmed',now()-interval '45 min'),
-- Maç 2 (Olimpiyat)
('cc000002-0000-4000-8000-000000000002','bb000011-0000-4000-8000-000000000011','home','confirmed',now()-interval '50 min'),
('cc000002-0000-4000-8000-000000000002','bb000013-0000-4000-8000-000000000013','home','confirmed',now()-interval '40 min'),
('cc000002-0000-4000-8000-000000000002','bb000014-0000-4000-8000-000000000014','away','confirmed',now()-interval '30 min'),
-- Maç 3 (VIP Arena)
('cc000003-0000-4000-8000-000000000003','bb000004-0000-4000-8000-000000000004','home','confirmed',now()-interval '3 hours'),
('cc000003-0000-4000-8000-000000000003','bb000005-0000-4000-8000-000000000005','home','confirmed',now()-interval '2 hours 50 min'),
('cc000003-0000-4000-8000-000000000003','bb000008-0000-4000-8000-000000000008','home','confirmed',now()-interval '2 hours 30 min'),
('cc000003-0000-4000-8000-000000000003','bb000009-0000-4000-8000-000000000009','home','confirmed',now()-interval '2 hours'),
('cc000003-0000-4000-8000-000000000003','bb000010-0000-4000-8000-000000000010','away','confirmed',now()-interval '1 hour 30 min'),
('cc000003-0000-4000-8000-000000000003','bb000011-0000-4000-8000-000000000011','away','confirmed',now()-interval '1 hour'),
('cc000003-0000-4000-8000-000000000003','bb000012-0000-4000-8000-000000000012','away','confirmed',now()-interval '30 min');

-- ─── 8) ARKADAŞLIKLAR — tüm 15 oyuncu birbiriyle (ACCEPTED) ─────────────────
DELETE FROM public.friendships
WHERE sender_id::text LIKE 'bb0000%' AND receiver_id::text LIKE 'bb0000%';
INSERT INTO public.friendships (sender_id, receiver_id, status, matches_together)
SELECT a.id, b.id, 'ACCEPTED', (abs(hashtext(a.id::text || b.id::text)) % 9)
FROM (SELECT id FROM public.profiles WHERE id::text LIKE 'bb0000%' AND id::text NOT LIKE 'bb000099%') a
JOIN (SELECT id FROM public.profiles WHERE id::text LIKE 'bb0000%' AND id::text NOT LIKE 'bb000099%') b
  ON a.id < b.id;

-- ─── 9) TAKIMLAR — "Ordu Şimşekleri" (7) + "Altınordu United" (8) ───────────
DELETE FROM public.team_members WHERE team_id::text LIKE 'dd0000%';
DELETE FROM public.teams        WHERE id::text      LIKE 'dd0000%';

-- Takım 1: 7 oyuncu (bb000001..bb000007), kaptan bb000001, ev sahası Olimpiyat
INSERT INTO public.teams (id, name, "shortName", captain_id, home_pitch_id, level, location, color1, color2, rating, "winRate", is_demo, roster, players, captains)
SELECT 'dd000001-0000-4000-8000-000000000001','Ordu Şimşekleri','ORŞ',
       'bb000001-0000-4000-8000-000000000001','a0000002-0002-4002-8002-000000000002',
       'Rekabetçi','Altınordu, Ordu','#39FF14','#0A0E14',8.4,'%72',false,
       (SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'position',COALESCE(p.position,'OYUNCU'),'avatar',p.avatar_url) ORDER BY p.id)
          FROM public.profiles p WHERE p.id = ANY (ARRAY[
            'bb000001-0000-4000-8000-000000000001','bb000002-0000-4000-8000-000000000002',
            'bb000003-0000-4000-8000-000000000003','bb000004-0000-4000-8000-000000000004',
            'bb000005-0000-4000-8000-000000000005','bb000006-0000-4000-8000-000000000006',
            'bb000007-0000-4000-8000-000000000007']::uuid[])),
       (SELECT jsonb_agg(p.id ORDER BY p.id) FROM public.profiles p WHERE p.id = ANY (ARRAY[
            'bb000001-0000-4000-8000-000000000001','bb000002-0000-4000-8000-000000000002',
            'bb000003-0000-4000-8000-000000000003','bb000004-0000-4000-8000-000000000004',
            'bb000005-0000-4000-8000-000000000005','bb000006-0000-4000-8000-000000000006',
            'bb000007-0000-4000-8000-000000000007']::uuid[])),
       '["bb000001-0000-4000-8000-000000000001"]'::jsonb;

INSERT INTO public.team_members (team_id, user_id, is_active)
SELECT 'dd000001-0000-4000-8000-000000000001', unnest(ARRAY[
  'bb000001-0000-4000-8000-000000000001','bb000002-0000-4000-8000-000000000002',
  'bb000003-0000-4000-8000-000000000003','bb000004-0000-4000-8000-000000000004',
  'bb000005-0000-4000-8000-000000000005','bb000006-0000-4000-8000-000000000006',
  'bb000007-0000-4000-8000-000000000007']::uuid[]), true;

-- Takım 2: 8 oyuncu (bb000008..bb000015), kaptan bb000008
INSERT INTO public.teams (id, name, "shortName", captain_id, home_pitch_id, level, location, color1, color2, rating, "winRate", is_demo, roster, players, captains)
SELECT 'dd000002-0000-4000-8000-000000000002','Altınordu United','ALU',
       'bb000008-0000-4000-8000-000000000008','a0000001-0001-4001-8001-000000000001',
       'Orta','Altınordu, Ordu','#00B0FF','#0A0E14',6.9,'%55',false,
       (SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'position',COALESCE(p.position,'OYUNCU'),'avatar',p.avatar_url) ORDER BY p.id)
          FROM public.profiles p WHERE p.id = ANY (ARRAY[
            'bb000008-0000-4000-8000-000000000008','bb000009-0000-4000-8000-000000000009',
            'bb000010-0000-4000-8000-000000000010','bb000011-0000-4000-8000-000000000011',
            'bb000012-0000-4000-8000-000000000012','bb000013-0000-4000-8000-000000000013',
            'bb000014-0000-4000-8000-000000000014','bb000015-0000-4000-8000-000000000015']::uuid[])),
       (SELECT jsonb_agg(p.id ORDER BY p.id) FROM public.profiles p WHERE p.id = ANY (ARRAY[
            'bb000008-0000-4000-8000-000000000008','bb000009-0000-4000-8000-000000000009',
            'bb000010-0000-4000-8000-000000000010','bb000011-0000-4000-8000-000000000011',
            'bb000012-0000-4000-8000-000000000012','bb000013-0000-4000-8000-000000000013',
            'bb000014-0000-4000-8000-000000000014','bb000015-0000-4000-8000-000000000015']::uuid[])),
       '["bb000008-0000-4000-8000-000000000008"]'::jsonb;

INSERT INTO public.team_members (team_id, user_id, is_active)
SELECT 'dd000002-0000-4000-8000-000000000002', unnest(ARRAY[
  'bb000008-0000-4000-8000-000000000008','bb000009-0000-4000-8000-000000000009',
  'bb000010-0000-4000-8000-000000000010','bb000011-0000-4000-8000-000000000011',
  'bb000012-0000-4000-8000-000000000012','bb000013-0000-4000-8000-000000000013',
  'bb000014-0000-4000-8000-000000000014','bb000015-0000-4000-8000-000000000015']::uuid[]), true;

-- ============================================================================
-- SEED TAMAM. Doğrulama için:
--   SELECT count(*) FROM public.friendships WHERE status='ACCEPTED' AND sender_id::text LIKE 'bb0000%';
--   SELECT name, jsonb_array_length(players) FROM public.teams WHERE id::text LIKE 'dd0000%';
--   SELECT name, owner_id FROM public.pitches WHERE id::text LIKE 'a0000002%';
-- ============================================================================
