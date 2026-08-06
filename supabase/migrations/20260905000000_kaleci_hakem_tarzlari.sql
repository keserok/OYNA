-- ════════════════════════════════════════════════════════════════════════════
-- KALECİ VE HAKEM TARZLARI  (B14 PAZARYERI)
-- ════════════════════════════════════════════════════════════════════════════
--
-- KURUCU KARARI (2026-08-06):
--   "Kalecilerin arayüzünde sweeper keeper gibi hiçbir yerden ayarlanamayan
--    verilerin olduğu kısmı sil ve kalecilere verilen isimlendirme ve seçim
--    ekranını kalecilerin bilgilerim ekranından ayarlanmasını ve aynı zamanda
--    admin panelinden düzenlenmesini sağla. ... istenirse biri veya ikisi
--    seçilebilir olsun, veritabanı bağlantısını sağlam kur. Aynısını hakemler
--    için de yap."
--
-- NEYİ DEĞİŞTİRİYOR
--
-- ÖNCE: `goalkeepers.style` TEK bir serbest metindi ('Panter', 'Klasik
-- Kaleci'). Yanında `stats`/`skills` JSON'unda altı sayı vardı (diving,
-- reflexes, positioning, distribution, oneOnOne, aerialReach) ve oyuncu
-- arayüzünde çubuk çubuk çiziliyordu. O sayıları KİMSE giremiyordu:
-- kalecinin kendi ekranında alan yoktu, oyuncu oyu onları beslemiyordu; tek
-- kaynak yönetim panelinde elle yazılan tohum veriydi. Ekranda "ölçüm" gibi
-- duran ama arkasında ölçüm olmayan bir yüzeydi.
--
-- SONRA: sonlu, kalecinin/hakemin KENDİ seçtiği bir tarz listesi. En fazla
-- iki tarz. Serbest metin değil — liste veritabanı kısıtıyla kapalı, yani
-- ekranda asla tanınmayan bir etiket belirmez.
--
-- ESKİ `style` KOLONU DURUYOR: silinmedi. Sebep iki tane —
--   1) İçinde bugün gerçek veri var ('Panter' vb.); DROP geri alınamaz.
--   2) Silmek, henüz güncellenmemiş bir okuyucu kalırsa onu çökertir.
-- Uygulama artık ondan OKUMUYOR; yeni `styles` boşsa ve eski metin kanonik
-- listeye uymuyorsa ekranda hiçbir şey çizilmez. Aşağıdaki gece kontrolü
-- (K-TARZ-1) "eski dilde takılı kalmış sağlayıcı" varsa haber verir.
--
-- GERİ ALMA:
--   ALTER TABLE public.goalkeepers DROP COLUMN IF EXISTS styles;
--   ALTER TABLE public.referees    DROP COLUMN IF EXISTS styles;
--   DROP FUNCTION IF EXISTS public.k_tarz_1_eski_tarz_dili();
--   (provider_update_own_profile / admin_update_*__core: styles satirlari cikarilir)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Kolonlar ────────────────────────────────────────────────────────────
-- Varsayılan boş dizi: "tarz seçilmedi" NULL ile değil boş liste ile
-- anlatılır. NULL olsaydı her okuyucunun ayrıca NULL kontrolü yapması
-- gerekirdi ve biri unutunca ekran çökerdi.
ALTER TABLE public.goalkeepers
  ADD COLUMN IF NOT EXISTS styles text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.referees
  ADD COLUMN IF NOT EXISTS styles text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.goalkeepers.styles IS
  'Kalecinin kendi seçtiği tarzlar (en fazla 2). Kanonik liste CHECK ile kapali; uygulama karsiligi shared/providerStyles.ts';
COMMENT ON COLUMN public.referees.styles IS
  'Hakemin kendi sectigi tarzlar (en fazla 2). Kanonik liste CHECK ile kapali; uygulama karsiligi shared/providerStyles.ts';

-- ── 2) Kısıtlar ────────────────────────────────────────────────────────────
-- Liste burada KAPALI. Uygulama tarafındaki karşılığı shared/providerStyles.ts;
-- ikisi ayrışırsa kullanıcı seçtiği tarzı kaydedemez, o yüzden birim testi
-- (tests/unit/saglayiciTarzlari.test.ts) iki listeyi karşılaştırır.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goalkeepers_styles_check') THEN
    ALTER TABLE public.goalkeepers ADD CONSTRAINT goalkeepers_styles_check CHECK (
      cardinality(styles) <= 2
      AND styles <@ ARRAY[
        'Çizgi Kalecisi',
        'Gezici Kaleci',
        'Oyun Kurucu Kaleci',
        'Hava Hakimiyeti Yüksek Kaleci',
        'Birebir Uzmanı',
        'Savunma Komutanı',
        'Soğukkanlı Kaleci'
      ]::text[]
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referees_styles_check') THEN
    ALTER TABLE public.referees ADD CONSTRAINT referees_styles_check CHECK (
      cardinality(styles) <= 2
      AND styles <@ ARRAY[
        'Disiplinci',
        'Oyunu Akıtan',
        'VAR Uzmanı',
        'Kuralcı',
        'İletişimci',
        'Soğukkanlı'
      ]::text[]
    );
  END IF;
END $$;

-- ── 3) Eski serbest metinden aktarım ───────────────────────────────────────
-- Yalnız YENİ listeye BİREBİR uyan eski değerler taşınır. Bugün canlıda
-- 'Panter' ve 'Klasik Kaleci' var; ikisi de yeni listede yok, dolayısıyla
-- hiçbiri taşınmaz — doğrusu budur. Uydurma eşleme yapmıyoruz ("Panter"i
-- "Birebir Uzmanı" saymak veriyi yalanlamak olurdu); o kaleciler tarzını
-- kendi ekranından seçecek.
UPDATE public.goalkeepers
   SET styles = ARRAY[btrim(style)]::text[]
 WHERE cardinality(styles) = 0
   AND style IS NOT NULL
   AND btrim(style) = ANY (ARRAY[
     'Çizgi Kalecisi','Gezici Kaleci','Oyun Kurucu Kaleci',
     'Hava Hakimiyeti Yüksek Kaleci','Birebir Uzmanı','Savunma Komutanı',
     'Soğukkanlı Kaleci'
   ]::text[]);

UPDATE public.referees
   SET styles = ARRAY[btrim(style)]::text[]
 WHERE cardinality(styles) = 0
   AND style IS NOT NULL
   AND btrim(style) = ANY (ARRAY[
     'Disiplinci','Oyunu Akıtan','VAR Uzmanı','Kuralcı','İletişimci','Soğukkanlı'
   ]::text[]);

-- ── 4) Sağlayıcının KENDİ tarzını seçmesi ──────────────────────────────────
-- AYRI BİR RPC AÇILMADI. Sağlayıcının "Bilgilerim" ekranında zaten TEK bir
-- KAYDET düğmesi var ve tek bir kapıdan (`provider_update_own_profile`)
-- geçiyor. Tarz için ikinci bir kapı açmak iki şeyi bozardı:
--   · Kaydet yarım kalabilirdi (ad kaydedildi, tarz kaydedilmedi).
--   · İki kapı zamanla ayrışırdı — deponun tekrar tekrar yaşadığı hata.
-- Bu yüzden mevcut kapı `styles` alanını da kabul edecek şekilde genişletiliyor.
--
-- Aşağıdaki gövde canlıdaki gövdenin BİREBİR aynısıdır; eklenenler:
--   · `styles` doğrulaması (liste + adet),
--   · iki UPDATE'e `styles` satırı.
CREATE OR REPLACE FUNCTION public.provider_update_own_profile(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_is_gk  boolean;
  v_is_ref boolean;
  v_fee    numeric;
  v_styles text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;

  IF p_payload ?| ARRAY['rating','isElite','is_elite','matchCount','match_count','isDemo','verification_status','level'] THEN
    RAISE EXCEPTION 'PROTECTED_FIELD: rating/elite/maç sayısı/seviye alanları bu yoldan güncellenemez.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.goalkeepers WHERE id = v_uid) INTO v_is_gk;
  SELECT EXISTS (SELECT 1 FROM public.referees    WHERE id = v_uid) INTO v_is_ref;
  IF NOT v_is_gk AND NOT v_is_ref THEN
    RAISE EXCEPTION 'NOT_PROVIDER: Sağlayıcı profili bulunamadı.';
  END IF;

  IF p_payload ? 'fee' THEN
    v_fee := (p_payload->>'fee')::numeric;
    IF v_fee IS NULL OR v_fee < 50 OR v_fee > 10000 THEN
      RAISE EXCEPTION 'INVALID_FEE: Ücret 50₺ ile 10.000₺ arasında olmalı.';
    END IF;
  END IF;

  -- ── TARZLAR ──────────────────────────────────────────────────────────────
  -- Alan payload'da yoksa v_styles NULL kalır ve aşağıdaki UPDATE mevcut
  -- değeri korur. Boş dizi gönderilirse "seçimimi kaldır" demektir.
  IF p_payload ? 'styles' THEN
    -- Yinelenenleri ve boşları ele, kullanıcının SEÇİM SIRASINI koru.
    -- (`array_agg(DISTINCT …)` alfabetik sıralardı; önce seçilen tarz ekranda
    --  ikinci sıraya düşerdi.)
    SELECT COALESCE(array_agg(t.deger ORDER BY t.sira), '{}'::text[]) INTO v_styles
      FROM (
        SELECT DISTINCT ON (x.deger) x.deger, x.sira
          FROM jsonb_array_elements_text(p_payload->'styles') WITH ORDINALITY AS x(deger, sira)
         WHERE btrim(COALESCE(x.deger, '')) <> ''
         ORDER BY x.deger, x.sira
      ) AS t;

    IF cardinality(v_styles) > 2 THEN
      RAISE EXCEPTION 'STYLE_LIMIT: En fazla iki tarz secebilirsin.';
    END IF;

    -- CHECK kısıtı listeyi zaten kapatıyor; burada da bakılıyor çünkü ham
    -- kısıt hatası kullanıcıya gösterilemez (Türkçe mesaj gerekiyor).
    IF v_is_gk AND NOT (v_styles <@ ARRAY[
      'Çizgi Kalecisi','Gezici Kaleci','Oyun Kurucu Kaleci',
      'Hava Hakimiyeti Yüksek Kaleci','Birebir Uzmanı','Savunma Komutanı',
      'Soğukkanlı Kaleci']::text[]) THEN
      RAISE EXCEPTION 'STYLE_UNKNOWN: Tanimsiz kaleci tarzi.';
    END IF;

    IF v_is_ref AND NOT (v_styles <@ ARRAY[
      'Disiplinci','Oyunu Akıtan','VAR Uzmanı','Kuralcı','İletişimci',
      'Soğukkanlı']::text[]) THEN
      RAISE EXCEPTION 'STYLE_UNKNOWN: Tanimsiz hakem tarzi.';
    END IF;
  END IF;

  IF v_is_gk THEN
    UPDATE public.goalkeepers SET
      name             = COALESCE(NULLIF(trim(p_payload->>'name'),''), name),
      bio              = CASE WHEN p_payload ? 'bio'   THEN p_payload->>'bio'   ELSE bio   END,
      fee              = COALESCE(v_fee, fee),
      style            = CASE WHEN p_payload ? 'style' THEN p_payload->>'style' ELSE style END,
      styles           = COALESCE(v_styles, styles),
      avatar           = CASE WHEN p_payload ? 'avatar' THEN p_payload->>'avatar' ELSE avatar END,
      height           = CASE WHEN p_payload ? 'height' THEN p_payload->>'height' ELSE height END,
      age              = CASE WHEN p_payload ? 'age' THEN (p_payload->>'age')::int ELSE age END,
      "preferredZones" = CASE WHEN p_payload ? 'preferredZones' THEN p_payload->'preferredZones' ELSE "preferredZones" END,
      coordinates      = CASE WHEN p_payload ? 'coordinates' THEN p_payload->'coordinates' ELSE coordinates END,
      working_hours    = CASE WHEN p_payload ? 'workingHours' THEN p_payload->'workingHours' ELSE working_hours END,
      settings         = CASE WHEN p_payload ? 'settings' THEN p_payload->'settings' ELSE settings END
    WHERE id = v_uid;
  END IF;

  IF v_is_ref THEN
    UPDATE public.referees SET
      name             = COALESCE(NULLIF(trim(p_payload->>'name'),''), name),
      bio              = CASE WHEN p_payload ? 'bio'   THEN p_payload->>'bio'   ELSE bio   END,
      fee              = COALESCE(v_fee, fee),
      style            = CASE WHEN p_payload ? 'style' THEN p_payload->>'style' ELSE style END,
      styles           = COALESCE(v_styles, styles),
      avatar           = CASE WHEN p_payload ? 'avatar' THEN p_payload->>'avatar' ELSE avatar END,
      "preferredZones" = CASE WHEN p_payload ? 'preferredZones' THEN p_payload->'preferredZones' ELSE "preferredZones" END,
      coordinates      = CASE WHEN p_payload ? 'coordinates' THEN p_payload->'coordinates' ELSE coordinates END,
      working_hours    = CASE WHEN p_payload ? 'workingHours' THEN p_payload->'workingHours' ELSE working_hours END,
      settings         = CASE WHEN p_payload ? 'settings' THEN p_payload->'settings' ELSE settings END
    WHERE id = v_uid;
  END IF;

  IF p_payload ? 'isAvailable' THEN
    UPDATE public.profiles SET is_available = (p_payload->>'isAvailable')::boolean WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object('updated', true, 'provider_id', v_uid,
                            'is_gk', v_is_gk, 'is_ref', v_is_ref);
END;
$function$;

-- ── 4b) Misafir görünümleri (maskeli view'ler) tarzları da göstersin ───────
-- `public_goalkeepers` / `public_referees`, oturum AÇMAMIŞ ziyaretçinin gördüğü
-- maskeli görünümlerdir (konum alanları NULL'lanır). Yeni kolonlar view'lere
-- KENDİLİĞİNDEN eklenmez: `CREATE OR REPLACE VIEW` ile listeye yazılmalı.
-- Yazılmazsa misafir kaleci vitrininde tarzlar HİÇ görünmezdi — üstelik hata
-- da vermezdi, alan sessizce yok sayılırdı.
--
-- Tarz gizlilik verisi DEĞİL, pazarlama verisidir: kaleci onu görünsün diye
-- seçiyor. Maskelenmiyor.
--
-- Not: `CREATE OR REPLACE VIEW` yeni kolonu yalnız SONA ekleyebilir; mevcut
-- kolonların adı ve sırası birebir korunmak zorunda. Aşağıdaki listeler
-- canlıdaki view tanımının aynısıdır, sonuna `styles` eklenmiştir.
CREATE OR REPLACE VIEW public.public_goalkeepers AS
SELECT
  g.id, g.name, g.height, g.age, g.rating, g.fee, g."matchCount", g.avatar,
  g."recentAwards", g.style, g.bio, g."preferredZones", g."isElite",
  NULL::jsonb AS coordinates,   -- MASKELİ: konum
  g.stats, g.skills, g.equipment, g.reviews,
  NULL::text  AS geohash,       -- MASKELİ: konum (ikinci biçim)
  g."isDemo",
  NULL::uuid  AS "authUid",     -- MASKELİ: hesap kimliği
  g.created_at, g.verification_status, g.working_hours,
  NULL::jsonb AS settings,      -- MASKELİ: sağlayıcı ayarları
  g.styles                      -- YENİ: seçilen tarzlar
FROM public.goalkeepers g
WHERE g.verification_status = 'approved'
  AND (g."isDemo" IS NOT TRUE OR public.get_config_bool('demo_mode_enabled'));

CREATE OR REPLACE VIEW public.public_referees AS
SELECT
  r.id,
  NULL::uuid AS "authUid",      -- MASKELİ: hesap kimliği
  r.name, r.level, r."matchCount", r.fee, r.avatar, r.rating, r.style, r.bio,
  r."preferredZones", r."isElite",
  NULL::jsonb AS coordinates,   -- MASKELİ: konum
  r.stats, r.reviews,
  NULL::text  AS geohash,       -- MASKELİ: konum (ikinci biçim)
  r."isDemo", r.created_at, r.verification_status, r.working_hours,
  NULL::jsonb AS settings,      -- MASKELİ: sağlayıcı ayarları
  r.styles                      -- YENİ: seçilen tarzlar
FROM public.referees r
WHERE r.verification_status = 'approved'
  AND (r."isDemo" IS NOT TRUE OR public.get_config_bool('demo_mode_enabled'));

GRANT SELECT ON public.public_goalkeepers TO anon, authenticated;
GRANT SELECT ON public.public_referees    TO anon, authenticated;

-- ── 5) Yönetim paneli de düzenleyebilsin ───────────────────────────────────
-- Mevcut çekirdek fonksiyonlara `styles` alanı ekleniyor. Payload'da alan
-- YOKSA mevcut değer korunur (COALESCE) — panelin başka bir alanı kaydeden
-- ekranı tarzları sessizce silmesin.
CREATE OR REPLACE FUNCTION public.admin_update_goalkeeper__core(p_id uuid, p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(g.*) INTO v_old FROM public.goalkeepers g WHERE id = p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Kaleci bulunamadı'; END IF;

  UPDATE public.goalkeepers SET
    name = COALESCE(p_payload->>'name', name),
    height = COALESCE(p_payload->>'height', height),
    age = COALESCE((p_payload->>'age')::int, age),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
    fee = COALESCE((p_payload->>'fee')::int, fee),
    "matchCount" = COALESCE((p_payload->>'match_count')::int, "matchCount"),
    avatar = COALESCE(p_payload->>'avatar', avatar),
    "recentAwards" = COALESCE(p_payload->>'recent_awards', "recentAwards"),
    style = COALESCE(p_payload->>'style', style),
    -- Panelden gelen tarzlar: sıra korunur, yinelenen elenir. Alan payload'da
    -- YOKSA mevcut değer kalır (COALESCE) — başka bir alanı kaydeden ekran
    -- tarzları sessizce silmesin.
    styles = COALESCE(
      (SELECT array_agg(t.deger ORDER BY t.sira)
         FROM (
           SELECT DISTINCT ON (x.deger) x.deger, x.sira
             FROM jsonb_array_elements_text(p_payload->'styles')
                  WITH ORDINALITY AS x(deger, sira)
            ORDER BY x.deger, x.sira
         ) AS t),
      styles),
    bio = COALESCE(p_payload->>'bio', bio),
    "preferredZones" = COALESCE(p_payload->'preferred_zones', "preferredZones"),
    "isElite" = COALESCE((p_payload->>'is_elite')::boolean, "isElite"),
    coordinates = COALESCE(p_payload->'coordinates', coordinates),
    stats = COALESCE(p_payload->'stats', stats),
    skills = COALESCE(p_payload->'skills', skills),
    equipment = COALESCE(p_payload->'equipment', equipment)
  WHERE id = p_id;

  PERFORM public.log_admin_action('GK_UPDATE', 'goalkeeper', p_id, COALESCE(p_payload->>'name', v_old->>'name'), v_old, p_payload);
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_referee__core(p_id uuid, p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(r.*) INTO v_old FROM public.referees r WHERE id = p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Hakem bulunamadı'; END IF;

  UPDATE public.referees SET
    name = COALESCE(p_payload->>'name', name),
    level = COALESCE(p_payload->>'level', level),
    "matchCount" = COALESCE((p_payload->>'match_count')::int, "matchCount"),
    fee = COALESCE((p_payload->>'fee')::int, fee),
    avatar = COALESCE(p_payload->>'avatar', avatar),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
    style = COALESCE(p_payload->>'style', style),
    -- Panelden gelen tarzlar: sıra korunur, yinelenen elenir. Alan payload'da
    -- YOKSA mevcut değer kalır (COALESCE) — başka bir alanı kaydeden ekran
    -- tarzları sessizce silmesin.
    styles = COALESCE(
      (SELECT array_agg(t.deger ORDER BY t.sira)
         FROM (
           SELECT DISTINCT ON (x.deger) x.deger, x.sira
             FROM jsonb_array_elements_text(p_payload->'styles')
                  WITH ORDINALITY AS x(deger, sira)
            ORDER BY x.deger, x.sira
         ) AS t),
      styles),
    bio = COALESCE(p_payload->>'bio', bio),
    "preferredZones" = COALESCE(p_payload->'preferred_zones', "preferredZones"),
    "isElite" = COALESCE((p_payload->>'is_elite')::boolean, "isElite"),
    coordinates = COALESCE(p_payload->'coordinates', coordinates),
    stats = COALESCE(p_payload->'stats', stats)
  WHERE id = p_id;

  PERFORM public.log_admin_action('REF_UPDATE', 'referee', p_id, COALESCE(p_payload->>'name', v_old->>'name'), v_old, p_payload);
  RETURN TRUE;
END;
$function$;

-- ── 6) GECE KONTROLÜ · K-TARZ-1 ────────────────────────────────────────────
-- Deponun P-0 ilkesi: "peki bu koruma bozulursa kim söyleyecek?"
--
-- Burada korunan şey şu: eski serbest metin `style` artık HİÇBİR EKRANDA
-- gösterilmiyor. Eğer bir sağlayıcının eski metni var ama yeni tarzı yoksa,
-- o sağlayıcı vitrinde TARZSIZ görünür — sessiz bir kayıp. Bu kontrol onu
-- her gece sayar ve panelde SARI yakar; kimse fark etmeden kaybolmasın.
CREATE OR REPLACE FUNCTION public.k_tarz_1_eski_tarz_dili()
RETURNS TABLE (kod text, baslik text, durum text, mesaj text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gk  int;
  v_ref int;
BEGIN
  SELECT count(*) INTO v_gk
    FROM public.goalkeepers
   WHERE cardinality(styles) = 0 AND btrim(COALESCE(style, '')) <> '';

  SELECT count(*) INTO v_ref
    FROM public.referees
   WHERE cardinality(styles) = 0 AND btrim(COALESCE(style, '')) <> '';

  kod := 'K-TARZ-1';
  baslik := 'Eski tarz dilinde takili kalan saglayici var mi?';

  IF v_gk = 0 AND v_ref = 0 THEN
    durum := 'YESIL';
    mesaj := 'Butun kaleci ve hakemler yeni tarz listesinde.';
  ELSE
    durum := 'SARI';
    mesaj := format(
      '%s kaleci ve %s hakem eski serbest metin tarzinda kalmis; vitrinde tarzsiz gorunuyorlar. Kendi ekranlarindan ya da panelden yeni tarz secilmeli.',
      v_gk, v_ref);
  END IF;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.k_tarz_1_eski_tarz_dili() FROM PUBLIC, anon, authenticated;

-- Onaylı kapı listesine yazılıyor ki gece denetimi (K-KAPI-4) bu yeni
-- fonksiyonları "bilinmeyen, gözden geçirilmeli" diye SARI yakmasın.
DO $$
BEGIN
  IF to_regclass('public.kapi_kayitli_durum') IS NULL THEN
    RAISE NOTICE '[KAPI] kapi_kayitli_durum yok - kayit atlandi.';
    RETURN;
  END IF;

  DELETE FROM public.kapi_kayitli_durum
   WHERE fonksiyon = 'k_tarz_1_eski_tarz_dili()';

  INSERT INTO public.kapi_kayitli_durum (fonksiyon, anon_acik, authenticated_acik, aciklama)
  VALUES
    ('k_tarz_1_eski_tarz_dili()', false, false,
     'Gece denetimi kontrolu. Yalniz sistem_saglik_calistir cagirir; her iki kapi da KAPALI.');
END $$;

-- ── 7) Gece denetimine bağlanıyor ──────────────────────────────────────────
-- Genişletme noktası (`sistem_saglik_ek_kontroller`) TEK bir gövde olduğu için
-- tamamı yeniden yazılıyor. Aşağıdaki gövde, canlıdaki gövdenin BİREBİR
-- aynısıdır; tek fark sona eklenen K-TARZ-1 bloğu, DECLARE'a eklenen
-- `v_tarz` değişkeni ve silme listesine eklenen 'K-TARZ-1' satırı.
-- (Karşılaştırıldı: canlı gövde md5 e38e6590bf72bda2485144c87d63eb16.)

CREATE OR REPLACE FUNCTION public.sistem_saglik_ek_kontroller()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_calisma timestamptz;
  v_adet    int;
  v_renk    text;
  v_mesaj   text;
  v_eklenen int := 0;
  v_kapi    jsonb;
  v_ortanca numeric;
  v_sure    numeric;
  v_beklenen CONSTANT int := 7;   -- oturum+saha+maç+maçlarım+metin + kaleci+hakem
  -- K-PARA-4 için
  v_adres_var   boolean;
  v_parola_ok   boolean;
  v_cron_var    boolean;
  v_cron_aktif  boolean;
  v_supurucu_acik boolean;
  v_eksik   text[];
  v_yer_tutucu CONSTANT text := 'OYNA-KURULMADI-YER-TUTUCU';
  -- K-TARZ-1 icin
  v_tarz record;
BEGIN
  SELECT max(calisma_at) INTO v_calisma FROM public.sistem_saglik_kayitlari;
  IF v_calisma IS NULL THEN
    RETURN jsonb_build_object('atlandi', 'ana denetim hic calismamis', 'eklenen_kontrol', 0);
  END IF;

  DELETE FROM public.sistem_saglik_kayitlari
   WHERE calisma_at = v_calisma
     AND kontrol_id IN ('K-SUPURUCU-1','K-BILDIRIM-2','K-BILDIRIM-3','K-KAPI-4','K-YUK-4','K-PARA-4',
                          'K-TARZ-1');

  -- K-SUPURUCU-1 - elle bakilmasi gereken mac var mi
  BEGIN
    SELECT count(*) INTO v_adet FROM public.matches WHERE elle_bakilmali;
    IF v_adet = 0 THEN
      v_renk := 'YESIL'; v_mesaj := 'Otomatik is takildigi mac yok';
    ELSE
      v_renk := 'SARI';
      v_mesaj := v_adet||' mac 3 denemede islenemedi - panelden bakilmali';
    END IF;
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-SUPURUCU-1','B10 OTOMASYON',v_renk,v_adet,'0',v_mesaj);
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-SUPURUCU-1','B10 OTOMASYON','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  -- K-BILDIRIM-2 - bildirim modu bekcisi ayakta mi
  BEGIN
    SELECT count(*) INTO v_adet FROM pg_trigger
     WHERE tgrelid = 'public.notifications'::regclass
       AND tgname = 'b_bildirim_modu_bekcisi' AND NOT tgisinternal AND tgenabled <> 'D';
    IF v_adet = 1 THEN
      IF (SELECT count(DISTINCT mod_seviyesi) FROM public.notification_templates) < 2 THEN
        v_renk := 'SARI';
        v_mesaj := 'Bekci ayakta ama tum bildirimler ayni seviyede - modlar ise yaramiyor';
      ELSE
        v_renk := 'YESIL';
        v_mesaj := 'Bildirim modu bekcisi ayakta, seviyeler tanimli';
      END IF;
    ELSE
      v_renk := 'KIRMIZI';
      v_mesaj := 'Bildirim modu bekcisi YOK/DEVRE DISI - kullanici tercihleri uygulanmiyor';
    END IF;
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-BILDIRIM-2','B06 BILDIRIM',v_renk,v_adet,'1',v_mesaj);
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-BILDIRIM-2','B06 BILDIRIM','OLCULEMEDI','1','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  -- K-BILDIRIM-3 - bildirim adresleri gecerli mi
  BEGIN
    SELECT count(*) INTO v_adet FROM public.notifications
     WHERE deep_link IS NOT NULL AND deep_link NOT LIKE 'oyna://%';
    IF v_adet = 0 THEN
      v_renk := 'YESIL'; v_mesaj := 'Tum bildirim adresleri gecerli bicimde';
    ELSE
      v_renk := 'KIRMIZI';
      v_mesaj := v_adet||' bildirimin adresi gecersiz - tiklandiginda hicbir sey olmaz';
    END IF;
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-BILDIRIM-3','B06 BILDIRIM',v_renk,v_adet,'0',v_mesaj);
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-BILDIRIM-3','B06 BILDIRIM','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  -- K-KAPI-4 - veritabani kapilari kendiliginden acildi mi
  BEGIN
    v_kapi := public.kapi_denetimi();
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-KAPI-4','B05 KAPILAR',
            v_kapi->>'durum', (v_kapi->>'olculen')::int, '0', v_kapi->>'mesaj');
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-KAPI-4','B05 KAPILAR','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  -- K-YUK-4 - acilista atilan istek sayisi artti mi
  BEGIN
    SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY istek_sayisi),
           percentile_disc(0.9) WITHIN GROUP (ORDER BY sure_ms),
           count(*)
      INTO v_ortanca, v_sure, v_adet
      FROM public.acilis_olcumu
     WHERE olustu_at > now() - interval '24 hours';

    IF v_adet = 0 THEN
      v_renk := 'SARI';
      v_mesaj := 'Son 24 saatte acilis olcumu gelmedi - uygulama hic acilmamis olabilir';
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-YUK-4','B09 YUK',v_renk,NULL,v_beklenen::text,v_mesaj);
    ELSE
      IF v_ortanca <= v_beklenen THEN
        v_renk := 'YESIL';
        v_mesaj := 'Acilis '||v_ortanca||' istek (beklenen '||v_beklenen||'), yarisi '
                   ||round(v_sure/1000.0,1)||' sn altinda - '||v_adet||' olcum';
      ELSIF v_ortanca <= v_beklenen + 2 THEN
        v_renk := 'SARI';
        v_mesaj := 'Acilis '||v_ortanca||' istege cikti (beklenen '||v_beklenen
                   ||') - yeni bir istek eklenmis olabilir';
      ELSE
        v_renk := 'KIRMIZI';
        v_mesaj := 'Acilis '||v_ortanca||' istek - beklenenin ('||v_beklenen
                   ||') cok ustunde, acilis yolu sismis';
      END IF;
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-YUK-4','B09 YUK',v_renk,v_ortanca,v_beklenen::text,v_mesaj);
    END IF;
    v_eklenen := v_eklenen + 1;

    -- Saklama: olcum operasyon verisidir, 14 gunden eskisi tutulmaz.
    DELETE FROM public.acilis_olcumu WHERE olustu_at < now() - interval '14 days';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-YUK-4','B09 YUK','OLCULEMEDI',v_beklenen::text,'Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  -- ── K-PARA-4 · YENI · supurucu gercekten bagli mi ────────────────────────
  BEGIN
    v_eksik := ARRAY[]::text[];

    -- 1) Adres
    SELECT coalesce(value #>> '{}', '') <> ''
      INTO v_adres_var
      FROM public.app_config WHERE key = 'functions_base_url';
    v_adres_var := coalesce(v_adres_var, false);
    IF NOT v_adres_var THEN v_eksik := array_append(v_eksik, 'adres'); END IF;

    -- 2) Parola - degerin kendisi HICBIR YERE yazilmaz, yalniz yer tutucu mu
    --    diye bakilir.
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM vault.decrypted_secrets
         WHERE name = 'webhook_secret'
           AND coalesce(decrypted_secret,'') <> ''
           AND decrypted_secret <> v_yer_tutucu
      ) INTO v_parola_ok;
    EXCEPTION WHEN OTHERS THEN
      v_parola_ok := NULL;   -- Vault okunamadi: "yok" demek yanlis olur
    END;
    IF v_parola_ok IS FALSE THEN v_eksik := array_append(v_eksik, 'parola'); END IF;

    -- 3) Saat basi is kaydi
    SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep_stale_payments'),
           EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep_stale_payments' AND active)
      INTO v_cron_var, v_cron_aktif;
    IF NOT v_cron_var THEN
      v_eksik := array_append(v_eksik, 'saat basi is');
    ELSIF NOT v_cron_aktif THEN
      v_eksik := array_append(v_eksik, 'is duraklatilmis');
    END IF;

    -- Supurucu acik mi? Acikken eksik olmasi ACIL; kapaliyken degil.
    SELECT coalesce((value #>> '{}') = 'true', false)
      INTO v_supurucu_acik
      FROM public.app_config WHERE key = 'sweeper_enabled';
    v_supurucu_acik := coalesce(v_supurucu_acik, false);

    IF v_parola_ok IS NULL THEN
      v_renk  := 'OLCULEMEDI';
      v_mesaj := 'Supurucu parolasi okunamadi - baglanti dogrulanamadi';
    ELSIF array_length(v_eksik, 1) IS NULL THEN
      v_renk  := 'YESIL';
      v_mesaj := 'Yarim kalan odemeleri toplayan gece iscisi bagli ve calisiyor';
    ELSIF v_supurucu_acik THEN
      v_renk  := 'KIRMIZI';
      v_mesaj := 'Supurucu ACIK ama baglanti eksik ('||array_to_string(v_eksik,', ')
                 ||') - yarim kalan odemeler toplanmiyor, para bloke kaliyor';
    ELSE
      v_renk  := 'SARI';
      v_mesaj := 'Supurucu kapali ve baglanti eksik ('||array_to_string(v_eksik,', ')
                 ||') - acilmadan once tamamlanmali';
    END IF;

    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-PARA-4','B01 PARA',v_renk,
            coalesce(array_length(v_eksik,1),0),'0',v_mesaj);
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-PARA-4','B01 PARA','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  -- ── K-TARZ-1 · YENI · eski tarz dilinde takili kalan saglayici var mi ────
  BEGIN
    SELECT * INTO v_tarz FROM public.k_tarz_1_eski_tarz_dili();
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-TARZ-1','B14 PAZARYERI',v_tarz.durum,NULL,'0',v_tarz.mesaj);
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-TARZ-1','B14 PAZARYERI','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  RETURN jsonb_build_object('calisma_at', v_calisma, 'eklenen_kontrol', v_eklenen);
END; $function$;
