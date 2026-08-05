-- ════════════════════════════════════════════════════════════════════════════
-- ÖLÇÜM · HUNİ SİSTEMİ — "kullanıcıyı nerede kaybediyoruz?"
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: Prensip 1.6 "Ölçüm zorunludur. Huni ve 'başarılı maç' metriği olmadan
-- ürün kararı verilmez" diyor. Bugün uygulamada TOPLAM 2 ölçüm satırı var
-- (kayıt oldu / açılış yarım kaldı). Maç kuruldu, ödeme başladı, ödeme bitti,
-- maça katılındı — hiçbiri ölçülmüyor. Yani ürünün ana vaadi olan "parayı
-- topla" akışının nerede koptuğu GÖRÜNMÜYOR.
--
-- KURUCU KARARLARI (5 Ağustos 2026):
--   • Dört huni ölçülür: kaptan · oyuncu · saha kiralama · tesis paneli.
--   • "Başarılı maç" = kadro doldu + para toplandı + saati geçti (+ iptal yok).
--   • Kayıtta kullanıcı kimliği TUTULUR (çökme kayıtlarıyla aynı desen).
--   • Panel kırılımları: tarih · ilçe · yeni/eski kullanıcı · telefon türü.
--
-- ÜÇÜNCÜ TARAF YOK: veri dışarı çıkmaz, `istemci_hatalari` ile aynı gerekçe
-- (S-3 kararı). Kendi veritabanımızda durur, yalnız yönetici okur.
--
-- ── P-0: "PEKİ BU KORUMA BOZULURSA KİM SÖYLEYECEK?" ────────────────────────
-- Ölçüm sisteminin kendi sessiz bozulma yolu şudur: uygulama olay yazmayı
-- bırakır, huni bomboş görünür ve bu "kimse kullanmıyor" sanılır. Bu yüzden
-- `olcum_sagligi()` var: son 24 saatte hiç olay yoksa panel KIRMIZI yanar.
-- Ölçümün kendisi de ölçülür.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) KABUL EDİLEN OLAY ADLARI ─────────────────────────────────────────────
-- Beyaz liste. Uygulamadaki `shared/olayKatalogu.ts` ile BİREBİR aynı olmalı;
-- birim testi (tests/unit/olcumKatalogu.test.ts) bu dosyayı okuyup karşılaştırır.
-- Neden beyaz liste: yazım hatası olan bir olay adı sessizce yeni bir "adım"
-- yaratır ve huni yanlış okunur. Tanımsız ad kabul EDİLMEZ.
CREATE TABLE IF NOT EXISTS public.olay_tanimlari (
  olay      text PRIMARY KEY,
  huni      text NOT NULL,
  sira      int  NOT NULL,
  aciklama  text
);

COMMENT ON TABLE public.olay_tanimlari IS
  'Olcum: kabul edilen olay adlari. shared/olayKatalogu.ts ile birebir ayni olmali.';

INSERT INTO public.olay_tanimlari (olay, huni, sira, aciklama) VALUES
  ('kaptan_ekran_acildi',        'kaptan',   0, 'Mac Kur ekranini acti'),
  ('kaptan_saha_secildi',        'kaptan',   1, 'Saha ve saat secti'),
  ('kaptan_kapora_ekrani',       'kaptan',   2, 'Kapora ekranina geldi'),
  ('kaptan_kapora_odendi',       'kaptan',   3, 'Kaporayi odedi'),
  ('kaptan_mac_yayinda',         'kaptan',   4, 'Mac yayina girdi'),
  ('oyuncu_liste_acildi',        'oyuncu',   0, 'Mac listesini acti'),
  ('oyuncu_mac_acildi',          'oyuncu',   1, 'Bir macin detayina girdi'),
  ('oyuncu_katil_secildi',       'oyuncu',   2, 'Katil dedi, yerini secti'),
  ('oyuncu_odeme_ekrani',        'oyuncu',   3, 'Odeme ekranina geldi'),
  ('oyuncu_odedi',               'oyuncu',   4, 'Odemeyi tamamladi'),
  ('kiralama_liste_acildi',      'kiralama', 0, 'Saha listesini acti'),
  ('kiralama_tesis_acildi',      'kiralama', 1, 'Bir tesisi acti'),
  ('kiralama_saat_secildi',      'kiralama', 2, 'Saat secti'),
  ('kiralama_kapora_ekrani',     'kiralama', 3, 'Kapora ekranina geldi'),
  ('kiralama_kapora_odendi',     'kiralama', 4, 'Kaporayi odedi'),
  ('tesis_panel_acildi',         'tesis',    0, 'Paneli acti'),
  ('tesis_takvim_acildi',        'tesis',    1, 'Takvimi acti'),
  ('tesis_rezervasyon_basladi',  'tesis',    2, 'Rezervasyon girmeye basladi'),
  ('tesis_rezervasyon_kaydedildi','tesis',   3, 'Rezervasyonu kaydetti'),
  ('tesis_defter_islendi',       'tesis',    4, 'Deftere kayit isledi')
ON CONFLICT (olay) DO UPDATE
  SET huni = EXCLUDED.huni, sira = EXCLUDED.sira, aciklama = EXCLUDED.aciklama;

ALTER TABLE public.olay_tanimlari ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.olay_tanimlari FROM anon, authenticated;

-- ── 2) HAM OLAY KAYDI ───────────────────────────────────────────────────────
-- `oturum_id`: uygulamanın bir açılışı. Aynı kişinin iki ayrı günde iki ayrı
-- denemesi ayrı sayılabilsin diye tutulur (kişi sayısı YANINDA "deneme" sayısı).
-- `uyelik_gun`: kayıt olalı kaç gün olmuş. Yeni/eski kullanıcı kırılımı bundan
-- türetilir — istemciden gelmez, SUNUCUDA hesaplanır (istemciye güvenilmez).
CREATE TABLE IF NOT EXISTS public.urun_olaylari (
  id           bigserial PRIMARY KEY,
  olustu_at    timestamptz NOT NULL DEFAULT now(),
  kullanici_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  oturum_id    text,
  olay         text NOT NULL REFERENCES public.olay_tanimlari(olay),
  huni         text NOT NULL,
  sira         int  NOT NULL,
  sehir        text,
  ilce         text,
  platform     text,          -- web / ios / android
  surum        text,
  uyelik_gun   int,           -- kayit olali kac gun (NULL = misafir)
  ek           jsonb
);

CREATE INDEX IF NOT EXISTS urun_olaylari_zaman_idx
  ON public.urun_olaylari (olustu_at DESC);
CREATE INDEX IF NOT EXISTS urun_olaylari_huni_idx
  ON public.urun_olaylari (huni, olustu_at DESC);
CREATE INDEX IF NOT EXISTS urun_olaylari_ilce_idx
  ON public.urun_olaylari (ilce, olustu_at DESC);

COMMENT ON TABLE public.urun_olaylari IS
  'Olcum: huni olaylarinin ham kaydi. Ucuncu tarafa veri gitmez. 90 gun sonra silinir (gunluk ozet kalir).';

ALTER TABLE public.urun_olaylari ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.urun_olaylari FROM anon, authenticated;

DROP POLICY IF EXISTS "olaylari sadece yonetici okur" ON public.urun_olaylari;
CREATE POLICY "olaylari sadece yonetici okur"
  ON public.urun_olaylari FOR SELECT TO authenticated
  USING (public.is_admin());

-- ── 3) GÜNLÜK ÖZET (SÜRESİZ SAKLANIR) ───────────────────────────────────────
-- Ham kayıt 90 gün sonra silinir; ama "geçen yıl bu ay ne oluyordu?" sorusunun
-- cevabı kaybolmamalı. Özet kişi bazlı DEĞİL sayı bazlıdır — kimliksizdir,
-- bu yüzden süresiz saklanması bir gizlilik sorunu yaratmaz.
-- `ilce`/`platform` boş string olabilir ama NULL OLAMAZ: birincil anahtarda
-- NULL karşılaştırması çalışmaz, aynı gün için mükerrer satırlar birikirdi.
CREATE TABLE IF NOT EXISTS public.urun_olaylari_gunluk (
  gun        date NOT NULL,
  huni       text NOT NULL,
  olay       text NOT NULL,
  ilce       text NOT NULL DEFAULT '',
  platform   text NOT NULL DEFAULT '',
  kisi       int NOT NULL,
  oturum     int NOT NULL,
  toplam     int NOT NULL,
  PRIMARY KEY (gun, huni, olay, ilce, platform)
);

COMMENT ON TABLE public.urun_olaylari_gunluk IS
  'Olcum: gunluk ozet. Kimlik icermez, suresiz saklanir.';

ALTER TABLE public.urun_olaylari_gunluk ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.urun_olaylari_gunluk FROM anon, authenticated;

DROP POLICY IF EXISTS "gunluk ozeti sadece yonetici okur" ON public.urun_olaylari_gunluk;
CREATE POLICY "gunluk ozeti sadece yonetici okur"
  ON public.urun_olaylari_gunluk FOR SELECT TO authenticated
  USING (public.is_admin());

-- ── 4) OLAY YAZMA — uygulamanın çağırdığı TEK kapı ──────────────────────────
-- `hata_bildir` ile aynı sözleşme: ASLA hata fırlatmaz. Ölçüm, ölçtüğü şeyi
-- bozamaz — bir kullanıcı ödeme yaparken ölçüm patlarsa ödeme de patlardı.
CREATE OR REPLACE FUNCTION public.olay_yaz(
  p_olay      text,
  p_oturum_id text DEFAULT NULL,
  p_sehir     text DEFAULT NULL,
  p_ilce      text DEFAULT NULL,
  p_platform  text DEFAULT NULL,
  p_surum     text DEFAULT NULL,
  p_ek        jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tanim  public.olay_tanimlari%ROWTYPE;
  v_uid    uuid := auth.uid();
  v_kisi   int;
  v_toplam int;
  v_gun    int;
  v_ek     jsonb;
BEGIN
  -- Tanımsız olay adı KABUL EDİLMEZ. (Yazım hatası sessiz bir adım yaratmasın.)
  SELECT * INTO v_tanim FROM public.olay_tanimlari WHERE olay = p_olay;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Sel baskını 1: tek kullanıcı son 1 saatte 300'den fazla olay yazamaz.
  -- (Bozuk bir döngü tek telefondan saniyede yüzlerce olay üretebilir.)
  IF v_uid IS NOT NULL THEN
    SELECT count(*) INTO v_kisi FROM public.urun_olaylari
    WHERE kullanici_id = v_uid AND olustu_at > now() - interval '1 hour';
    IF v_kisi >= 300 THEN RETURN false; END IF;
  END IF;

  -- Sel baskını 2: sistem geneli son 1 saatte 20.000 olay.
  SELECT count(*) INTO v_toplam FROM public.urun_olaylari
  WHERE olustu_at > now() - interval '1 hour';
  IF v_toplam >= 20000 THEN RETURN false; END IF;

  -- Üyelik yaşı SUNUCUDA hesaplanır — istemci "ben yeniyim" diyemez.
  IF v_uid IS NOT NULL THEN
    SELECT GREATEST(0, (now()::date - created_at::date))::int INTO v_gun
    FROM public.profiles WHERE id = v_uid;
  END IF;

  -- Ek bilgi gizlilik eleğinden geçer (çökme kaydıyla AYNI elek — tek kaynak).
  IF p_ek IS NOT NULL THEN
    BEGIN
      v_ek := public.hata_temizle_metin(p_ek::text, 1000)::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_ek := NULL;
    END;
  END IF;

  INSERT INTO public.urun_olaylari
    (kullanici_id, oturum_id, olay, huni, sira, sehir, ilce, platform, surum, uyelik_gun, ek)
  VALUES (
    v_uid,
    left(p_oturum_id, 40),
    v_tanim.olay,
    v_tanim.huni,
    v_tanim.sira,
    left(p_sehir, 60),
    left(p_ilce, 60),
    left(p_platform, 20),
    left(p_surum, 40),
    v_gun,
    v_ek
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  -- Ölçüm, ölçtüğü akışı ASLA bozmaz.
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.olay_yaz(text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.olay_yaz(text,text,text,text,text,text,jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.olay_yaz(text,text,text,text,text,text,jsonb) IS
  'Olcum: uygulamadan gelen huni olayi. Tanimsiz adi reddeder, sel baskinina karsi sinirlar, asla hata firlatmaz.';

-- ── 5) HUNİ ÖZETİ (yalnızca yönetici) ───────────────────────────────────────
-- Dönen sayı KİŞİ sayısıdır: aynı kişi bir adımı 5 kez yapsa 1 sayılır.
-- Yanında "deneme" (oturum) sayısı da verilir — biri "kaç kişi", diğeri
-- "kaç kez" sorusunu cevaplar; ikisi çok ayrışıyorsa insanlar tekrar tekrar
-- deniyor ve başaramıyor demektir.
CREATE OR REPLACE FUNCTION public.huni_ozeti(
  p_huni       text,
  p_gun        int  DEFAULT 30,
  p_ilce       text DEFAULT NULL,
  p_platform   text DEFAULT NULL,
  p_yenilik    text DEFAULT NULL     -- 'yeni' (<=7 gun) | 'eski' | NULL (hepsi)
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pencere interval := make_interval(days => GREATEST(1, LEAST(COALESCE(p_gun, 30), 365)));
  v_sonuc   jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'huni', p_huni,
    'gun', EXTRACT(epoch FROM v_pencere) / 86400,
    'adimlar', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'sira')::int)
      FROM (
        SELECT jsonb_build_object(
                 'olay',   t.olay,
                 'sira',   t.sira,
                 'ad',     t.aciklama,
                 'kisi',   COALESCE(o.kisi, 0),
                 'deneme', COALESCE(o.deneme, 0)
               ) AS x
        FROM public.olay_tanimlari t
        LEFT JOIN (
          SELECT olay,
                 count(DISTINCT COALESCE(kullanici_id::text, oturum_id)) AS kisi,
                 count(DISTINCT COALESCE(oturum_id, id::text))           AS deneme
          FROM public.urun_olaylari
          WHERE huni = p_huni
            AND olustu_at > now() - v_pencere
            AND (p_ilce     IS NULL OR ilce     = p_ilce)
            AND (p_platform IS NULL OR platform = p_platform)
            AND (p_yenilik  IS NULL
                 OR (p_yenilik = 'yeni' AND uyelik_gun IS NOT NULL AND uyelik_gun <= 7)
                 OR (p_yenilik = 'eski' AND uyelik_gun IS NOT NULL AND uyelik_gun >  7))
          GROUP BY olay
        ) o ON o.olay = t.olay
        WHERE t.huni = p_huni
      ) s
    ), '[]'::jsonb),
    -- Kırılım listeleri panelin açılır menülerini doldurur (elle liste tutulmaz).
    'ilceler', COALESCE((
      SELECT jsonb_agg(DISTINCT ilce) FROM public.urun_olaylari
      WHERE olustu_at > now() - v_pencere AND ilce IS NOT NULL
    ), '[]'::jsonb),
    'platformlar', COALESCE((
      SELECT jsonb_agg(DISTINCT platform) FROM public.urun_olaylari
      WHERE olustu_at > now() - v_pencere AND platform IS NOT NULL
    ), '[]'::jsonb)
  ) INTO v_sonuc;

  RETURN v_sonuc;
END;
$function$;

REVOKE ALL ON FUNCTION public.huni_ozeti(text,int,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.huni_ozeti(text,int,text,text,text) TO authenticated;

-- ── 6) BAŞARILI MAÇ (kuzey yıldızı) ─────────────────────────────────────────
-- KURUCU TANIMI: kadro doldu + para toplandı + saati geçti + iptal edilmedi.
--
-- NEDEN OLAY KAYDINDAN DEĞİL, GERÇEK VERİDEN: Olay kaydı kaybolabilir (ağ
-- koptu, sel koruması devreye girdi). Maçın gerçekten olup olmadığı ise
-- `matches` + `match_participants` + `payment_intents` tablolarında YAZILI
-- gerçektir. Kuzey yıldızı metriği tahmine dayanamaz.
--
-- NOT: Tablodaki `is_successful` sütunu KULLANILMIYOR. O sütun daha gevşek bir
-- kurala göre doluyor ("skor girildi + iptal yok"); kurucunun tanımı bu değil.
-- Sütuna dokunulmadı — başka yerler onu okuyor.
CREATE OR REPLACE FUNCTION public.basarili_mac_ozeti(
  p_gun  int  DEFAULT 30,
  p_ilce text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pencere interval := make_interval(days => GREATEST(1, LEAST(COALESCE(p_gun, 30), 365)));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH biten AS (
      SELECT m.id,
             m.status,
             m.cancel_reason,
             COALESCE(m.min_players, 0) AS gereken,
             (SELECT count(*) FROM public.match_participants mp
               WHERE mp.match_id = m.id
                 AND COALESCE(mp.status, 'JOINED') <> 'LEFT'
                 AND mp.is_demo IS NOT TRUE)                       AS katilan,
             (SELECT count(*) FROM public.payment_intents pi
               WHERE pi.match_id = m.id
                 AND pi.status IN ('CAPTURED', 'PAID')
                 AND pi.is_demo IS NOT TRUE)                       AS odenmis,
             (SELECT count(*) FROM public.payment_intents pi
               WHERE pi.match_id = m.id
                 AND pi.status IN ('PENDING', 'BLOCKED', 'FAILED')
                 AND pi.is_demo IS NOT TRUE)                       AS bekleyen
      FROM public.matches m
      WHERE m."isDemo" IS NOT TRUE
        AND m.starts_at IS NOT NULL
        AND m.starts_at < now()                      -- saati geçti
        AND m.starts_at > now() - v_pencere
        AND (p_ilce IS NULL OR EXISTS (
              SELECT 1 FROM public.pitches p
              WHERE p.id = m.pitch_id AND p.district = p_ilce))
    ),
    etiketli AS (
      SELECT *,
             (cancel_reason IS NULL
              AND status <> 'CANCELLED'
              AND gereken > 0 AND katilan >= gereken   -- kadro doldu
              AND odenmis > 0 AND bekleyen = 0)        -- para toplandi
             AS basarili
      FROM biten
    )
    SELECT jsonb_build_object(
      'gun',            EXTRACT(epoch FROM v_pencere) / 86400,
      'oynanan',        (SELECT count(*) FROM etiketli),
      'basarili',       (SELECT count(*) FROM etiketli WHERE basarili),
      'iptal',          (SELECT count(*) FROM etiketli WHERE cancel_reason IS NOT NULL OR status = 'CANCELLED'),
      'kadro_dolmadi',  (SELECT count(*) FROM etiketli
                          WHERE NOT basarili AND cancel_reason IS NULL AND status <> 'CANCELLED'
                            AND (gereken = 0 OR katilan < gereken)),
      'para_eksik',     (SELECT count(*) FROM etiketli
                          WHERE NOT basarili AND cancel_reason IS NULL AND status <> 'CANCELLED'
                            AND gereken > 0 AND katilan >= gereken
                            AND (odenmis = 0 OR bekleyen > 0)),
      'oran',           CASE WHEN (SELECT count(*) FROM etiketli) = 0 THEN NULL
                             ELSE round(100.0 * (SELECT count(*) FROM etiketli WHERE basarili)
                                              / (SELECT count(*) FROM etiketli))
                        END
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.basarili_mac_ozeti(int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.basarili_mac_ozeti(int,text) TO authenticated;

-- ── 7) P-0 · ÖLÇÜMÜN KENDİ SAĞLIK KONTROLÜ ──────────────────────────────────
-- Ölçüm sisteminin sessiz bozulma yolu: uygulama olay yazmayı bırakır, huni
-- boş görünür ve bu "kimse kullanmıyor" diye okunur. Aşağıdaki fonksiyon
-- panele "son 24 saatte hiç olay gelmedi" diye KIRMIZI yakar.
CREATE OR REPLACE FUNCTION public.olcum_sagligi()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_son24  int;
  v_son1   int;
  v_sonKayit timestamptz;
  v_huniler int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_son24 FROM public.urun_olaylari WHERE olustu_at > now() - interval '24 hours';
  SELECT count(*) INTO v_son1  FROM public.urun_olaylari WHERE olustu_at > now() - interval '1 hour';
  SELECT max(olustu_at) INTO v_sonKayit FROM public.urun_olaylari;
  SELECT count(DISTINCT huni) INTO v_huniler FROM public.urun_olaylari
   WHERE olustu_at > now() - interval '7 days';

  RETURN jsonb_build_object(
    'son_24_saat',  v_son24,
    'son_1_saat',   v_son1,
    'son_kayit',    v_sonKayit,
    'aktif_huni',   v_huniler,
    'toplam_huni',  (SELECT count(DISTINCT huni) FROM public.olay_tanimlari),
    -- 'saglikli' = son 24 saatte en az bir olay geldi. Hiç gelmediyse ya
    -- uygulama ölçüm yazmayı bıraktı ya da gerçekten kimse girmedi; ikisi de
    -- kurucunun BİLMESİ gereken şey.
    'saglikli',     (v_son24 > 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.olcum_sagligi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.olcum_sagligi() TO authenticated;

-- ── 8) GECELİK ÖZET + TEMİZLİK ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.olcum_gunluk_ozet_uret(p_gun date DEFAULT (now() - interval '1 day')::date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_yazilan int;
BEGIN
  INSERT INTO public.urun_olaylari_gunluk (gun, huni, olay, ilce, platform, kisi, oturum, toplam)
  SELECT p_gun, huni, olay, COALESCE(ilce, ''), COALESCE(platform, ''),
         count(DISTINCT COALESCE(kullanici_id::text, oturum_id)),
         count(DISTINCT COALESCE(oturum_id, id::text)),
         count(*)
  FROM public.urun_olaylari
  WHERE olustu_at >= p_gun AND olustu_at < p_gun + 1
  GROUP BY huni, olay, COALESCE(ilce, ''), COALESCE(platform, '')
  ON CONFLICT (gun, huni, olay, ilce, platform)
  DO UPDATE SET kisi = EXCLUDED.kisi, oturum = EXCLUDED.oturum, toplam = EXCLUDED.toplam;
  GET DIAGNOSTICS v_yazilan = ROW_COUNT;
  RETURN v_yazilan;
END;
$function$;

REVOKE ALL ON FUNCTION public.olcum_gunluk_ozet_uret(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.olcum_kayitlarini_temizle()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_silinen int;
BEGIN
  -- Ham kayıt 90 gün. Günlük özet (kimliksiz) süresiz kalır.
  DELETE FROM public.urun_olaylari WHERE olustu_at < now() - interval '90 days';
  GET DIAGNOSTICS v_silinen = ROW_COUNT;
  RETURN v_silinen;
END;
$function$;

REVOKE ALL ON FUNCTION public.olcum_kayitlarini_temizle() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  PERFORM cron.unschedule('olcum_gunluk_ozet')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'olcum_gunluk_ozet');
  PERFORM cron.schedule('olcum_gunluk_ozet', '20 3 * * *',
                        'SELECT public.olcum_gunluk_ozet_uret();');

  PERFORM cron.unschedule('olcum_temizlik')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'olcum_temizlik');
  PERFORM cron.schedule('olcum_temizlik', '55 3 * * *',
                        'SELECT public.olcum_kayitlarini_temizle();');
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA:
--   SELECT cron.unschedule('olcum_gunluk_ozet');
--   SELECT cron.unschedule('olcum_temizlik');
--   DROP FUNCTION IF EXISTS public.olcum_sagligi();
--   DROP FUNCTION IF EXISTS public.basarili_mac_ozeti(int,text);
--   DROP FUNCTION IF EXISTS public.huni_ozeti(text,int,text,text,text);
--   DROP FUNCTION IF EXISTS public.olay_yaz(text,text,text,text,text,text,jsonb);
--   DROP FUNCTION IF EXISTS public.olcum_gunluk_ozet_uret(date);
--   DROP FUNCTION IF EXISTS public.olcum_kayitlarini_temizle();
--   DROP TABLE IF EXISTS public.urun_olaylari_gunluk;
--   DROP TABLE IF EXISTS public.urun_olaylari;
--   DROP TABLE IF EXISTS public.olay_tanimlari;
-- ════════════════════════════════════════════════════════════════════════════
