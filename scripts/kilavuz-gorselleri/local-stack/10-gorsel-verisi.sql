-- Kılavuz ekran görüntüleri için yerel veri düzenlemesi
--
-- Depo seed'leri kaleci/hakem demo hesaplarını PLAYER olarak bırakıyor; sağlayıcı
-- panellerinin ekran görüntüsünü alabilmek için rolleri burada tamamlıyoruz.
-- Ayrıca boş görünmesin diye birkaç ekrana (cüzdan, bildirimler) örnek veri
-- konuyor. YALNIZ YEREL — üretimde çalıştırılmaz.

-- ─────────────────────────────────────────── sağlayıcı rolleri ──────────────
-- Rol koruması trigger'ını atlat (set_active_role ile aynı bayrak)
SELECT set_config('app.bypass_role_protection', 'true', false);

UPDATE public.profiles p
   SET roles = '["PLAYER","GOALKEEPER"]'::jsonb,
       role  = 'GOALKEEPER'
  FROM auth.users u
 WHERE u.id = p.id AND u.email IN ('kaleci1@oyna.app', 'kaleci2@oyna.app', 'kaleci3@oyna.app');

UPDATE public.profiles p
   SET roles = '["PLAYER","REFEREE"]'::jsonb,
       role  = 'REFEREE'
  FROM auth.users u
 WHERE u.id = p.id AND u.email IN ('hakem1@oyna.app', 'hakem2@oyna.app');

-- Saha sahipleri zaten OWNER; yine de roles dizisi tutarlı olsun
UPDATE public.profiles p
   SET roles = '["PLAYER","OWNER"]'::jsonb
  FROM auth.users u
 WHERE u.id = p.id AND u.email LIKE 'saha%@oyna.app'
   AND NOT (COALESCE(p.roles, '[]'::jsonb) ? 'OWNER');

-- ───────────────────────────────────────────────── admin ekibi ──────────────
INSERT INTO public.admin_team_members (id, user_id, admin_role)
SELECT extensions.gen_random_uuid(), u.id, 'SUPER_ADMIN'
  FROM auth.users u
 WHERE u.email = 'mirackerem@oyna.app'
   AND NOT EXISTS (SELECT 1 FROM public.admin_team_members a WHERE a.user_id = u.id);

-- Panelin giriş kapısı is_platform_admin()'e bakıyor: profiles.is_admin veya
-- role/roles içinde ADMIN. admin_team_members tek başına yetmiyor.
UPDATE public.profiles p
   SET is_admin = true,
       roles = (COALESCE(p.roles, '[]'::jsonb) || '["SUPER_ADMIN"]'::jsonb)
  FROM auth.users u
 WHERE u.id = p.id AND u.email = 'mirackerem@oyna.app';

-- ────────────────────────────────────── ekranlar boş görünmesin ─────────────
-- Cüzdan: oyuncu01 + sağlayıcılar için bakiye
UPDATE public.profiles p
   SET wallet_balance = 450
  FROM auth.users u
 WHERE u.id = p.id
   AND u.email IN ('oyuncu01@oyna.app', 'kaleci1@oyna.app', 'hakem1@oyna.app');

-- Bildirimler: oyuncu01 için birkaç örnek
DELETE FROM public.notifications WHERE user_id = (SELECT id FROM auth.users WHERE email = 'oyuncu01@oyna.app');
INSERT INTO public.notifications (user_id, title, body, type_key, is_read, created_at)
SELECT u.id, v.title, v.body, v.type_key, v.is_read, now() - (v.age || ' hours')::interval
  FROM auth.users u,
       (VALUES
          ('Maçın yaklaşıyor',      'Capo Arena 7v7 maçın 2 saat sonra başlıyor.', 'match_reminder',   false, 1),
          ('Kadroya eklendin',      'Akşam 7v7 maçında yerin onaylandı.',          'match_joined',     false, 5),
          ('Kaleci teklifi geldi',  'Ahmet Çalık maçın için teklif gönderdi.',     'service_offer',    true,  26),
          ('Değerlendirme zamanı',  'Geçen maçtaki arkadaşlarını puanla.',         'match_completed_evaluate', true, 50)
       ) AS v(title, body, type_key, is_read, age)
 WHERE u.email = 'oyuncu01@oyna.app';

SELECT set_config('app.bypass_role_protection', 'false', false);
