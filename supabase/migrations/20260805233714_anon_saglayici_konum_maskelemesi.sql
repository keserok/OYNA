-- ════════════════════════════════════════════════════════════════════════════
-- ANON VERİ MASKELEMESİ — SAĞLAYICI KONUMU  (yol haritası B2 · Seçenek B)
-- ════════════════════════════════════════════════════════════════════════════
--
-- KAYNAK: sozlesmeler/guvenlik-notu-anon-veri-gorunurlugu.md — "Bulgu B"
--
-- SORUN (canlıda 5 Ağustos 2026'da yeniden doğrulandı):
-- Onaylı her kaleci/hakemin ilan profili, GİRİŞ YAPMAMIŞ herkese — yani tüm
-- internete ve arama motorlarına — açıktı. İçinde `coordinates` (lat/lng) ve
-- `geohash` vardı: yani gerçek bir kişinin YAKLAŞIK EV/ÇALIŞMA KONUMU.
--
-- Not şu asimetriye dikkat çekiyordu: `profiles` tablosu KVKK sertleştirmesiyle
-- kilitlenip kamuya arındırılmış `public_profiles` görünümü verilmişken, aynı
-- sertleştirme sağlayıcı kataloglarına HİÇ uygulanmamıştı. Üstelik sağlayıcının
-- onboarding'de verdiği KVKK onayı yalnızca "iletişim ve lisans bilgilerinin
-- DOĞRULAMA amacıyla işlenmesi"ni kapsıyor — konumun KAMUYA YAYIMLANMASINI
-- kapsamıyor. (KVKK m.4 ölçülülük.)
--
-- ── ÇÖZÜM (Seçenek B: maskele, kapatma) ───────────────────────────────────
-- Misafir gezinmesi ürünün kasıtlı bir özelliği; onu bozmuyoruz. Bunun yerine
-- anon'a AYNI KOLON ADLARINA sahip ama hassas alanları BOŞ dönen bir görünüm
-- verilir. İstemci şekli hiç değişmez (mapFromSnakeCase aynı çalışır), yalnız
-- konum gelmez.
--
-- Maskelenen alanlar ve gerekçeleri:
--   • coordinates → gerçek kişinin yaklaşık konumu (en hassas olan)
--   • geohash     → aynı konumun başka biçimi; maskelenmezse maskeleme anlamsız
--   • authUid     → kişinin auth kimliğine bağ; ilan için gereksiz
--   • settings    → sağlayıcının özel yapılandırması; ilan için gereksiz
--
-- KAYITLI kullanıcı hiçbir şey kaybetmez: ham tabloyu okumaya devam eder,
-- "X km yakında" hesabı bozulmaz. Misafirde mesafe yerine ekranda zaten var
-- olan "Konumunu aç" yazısı görünür (views/Marketplace.tsx).
--
-- GÜVENLİK NOTU: görünümler `security_invoker=false` (varsayılan) ile çalışır;
-- yani anon, altındaki tabloya doğrudan erişmeden yalnız bu süzülmüş satırları
-- görür. Ham tablodaki anon politikası bu migration'da KALDIRILIR.
--
-- GERİ ALMA:
--   DROP VIEW IF EXISTS public.public_goalkeepers, public.public_referees;
--   CREATE POLICY goalkeepers_select_anon ON public.goalkeepers FOR SELECT TO anon
--     USING ((verification_status='approved') AND (("isDemo" IS NOT TRUE) OR get_config_bool('demo_mode_enabled')));
--   CREATE POLICY referees_select_anon ON public.referees FOR SELECT TO anon
--     USING ((verification_status='approved') AND (("isDemo" IS NOT TRUE) OR get_config_bool('demo_mode_enabled')));
--   GRANT SELECT ON public.goalkeepers, public.referees TO anon;
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) MİSAFİRE AÇIK, KONUMSUZ KATALOG GÖRÜNÜMLERİ ────────────────────────
CREATE OR REPLACE VIEW public.public_goalkeepers AS
SELECT
  g.id, g.name, g.height, g.age, g.rating, g.fee, g."matchCount", g.avatar,
  g."recentAwards", g.style, g.bio, g."preferredZones", g."isElite",
  NULL::jsonb AS coordinates,   -- MASKELİ: konum
  g.stats, g.skills, g.equipment, g.reviews,
  NULL::text  AS geohash,       -- MASKELİ: konum (ikinci biçim)
  g."isDemo",
  NULL::uuid  AS "authUid",     -- MASKELİ: kimlik bağı
  g.created_at, g.verification_status, g.working_hours,
  NULL::jsonb AS settings       -- MASKELİ: özel yapılandırma
FROM public.goalkeepers g
WHERE g.verification_status = 'approved'
  AND ((g."isDemo" IS NOT TRUE) OR public.get_config_bool('demo_mode_enabled'));

CREATE OR REPLACE VIEW public.public_referees AS
SELECT
  r.id,
  NULL::uuid  AS "authUid",     -- MASKELİ: kimlik bağı
  r.name, r.level, r."matchCount", r.fee, r.avatar, r.rating, r.style, r.bio,
  r."preferredZones", r."isElite",
  NULL::jsonb AS coordinates,   -- MASKELİ: konum
  r.stats, r.reviews,
  NULL::text  AS geohash,       -- MASKELİ: konum (ikinci biçim)
  r."isDemo", r.created_at, r.verification_status, r.working_hours,
  NULL::jsonb AS settings       -- MASKELİ: özel yapılandırma
FROM public.referees r
WHERE r.verification_status = 'approved'
  AND ((r."isDemo" IS NOT TRUE) OR public.get_config_bool('demo_mode_enabled'));

-- Görünümler YALNIZ OKUNUR olmalı; yazma yolu açılmasın.
REVOKE ALL ON public.public_goalkeepers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.public_referees    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_goalkeepers TO anon, authenticated;
GRANT SELECT ON public.public_referees    TO anon, authenticated;

-- ── 2) HAM KATALOG ANON'A KAPATILIR ───────────────────────────────────────
-- Bundan sonra giriş yapmamış biri konumu HİÇBİR yoldan okuyamaz.
DROP POLICY IF EXISTS goalkeepers_select_anon ON public.goalkeepers;
DROP POLICY IF EXISTS referees_select_anon    ON public.referees;
REVOKE SELECT ON public.goalkeepers FROM anon;
REVOKE SELECT ON public.referees    FROM anon;
