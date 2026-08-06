-- ════════════════════════════════════════════════════════════════════════════
-- [SRE-1 / S-1=a] GECELİK YEDEK — sistemdeki tek geri alınamaz riski kapatır
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: Ücretsiz planda otomatik yedek garantisi yok. Veritabanı 70 MB ve
-- içinde artık GERÇEK PARA kayıtları var. Yanlış bir migration, silinmiş bir
-- tablo ya da bozulmuş veri GERİ DÖNÜLEMEZ olur. Sistemdeki başka her sorun
-- düzeltilebilir; bu düzeltilemez.
--
-- KURUCU KARARI S-1 = (a): gecelik iç kopya. Ücretsiz, bugün kurulabilir.
--
-- ⚠️ NE KAPSAR, NE KAPSAMAZ — dürüst sınır:
--   ✅ Yanlış migration, kazara silme, bozulan veri  → 7 güne kadar geri dönülür
--   ❌ Veritabanının TAMAMEN gitmesi                → kapsamaz (aynı veritabanında)
--   Tam güvence için haftalık DIŞ kopya (S-1=b) veya Pro plan gerekir.
--   Bu sınır bilerek yazıldı: "yedeğim var" sanıp yanılmak, yedeksiz olmaktan kötüdür.
--
-- TASARIM: Her gece kritik tabloların TAM kopyası `yedek` şemasına, tarih
-- damgasıyla yazılır. 7 günlük pencere tutulur, eskisi silinir.
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS yedek;
REVOKE ALL ON SCHEMA yedek FROM anon, authenticated;

-- Hangi tablolar yedeklenir? Yeni kritik tablo eklenirse BURAYA eklenmeli.
CREATE TABLE IF NOT EXISTS yedek.kapsam (
  tablo_adi text PRIMARY KEY,
  aciklama  text NOT NULL
);

INSERT INTO yedek.kapsam (tablo_adi, aciklama) VALUES
  ('payment_intents',     'Ödeme niyetleri — para akışının merkezi'),
  ('wallet_transactions', 'Cüzdan hareketleri — bakiyelerin kaynağı'),
  ('matches',            'Maçlar — kadro ve fiyat bilgisi içinde'),
  ('match_participants', 'Kadro tablosu'),
  ('pitch_bookings',     'Saha rezervasyonları'),
  ('profiles',           'Kullanıcı profilleri — bakiye ve rol bilgisi'),
  ('pitches',            'Saha kataloğu'),
  ('pitch_tariffs',      'Tarifeler — fiyatlandırmanın kaynağı')
ON CONFLICT (tablo_adi) DO NOTHING;

-- ── Yedek alma ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION yedek.gunluk_al()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'yedek', 'pg_temp'
AS $function$
DECLARE
  r          record;
  v_tarih    date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_hedef    text;
  v_satir    bigint;
  v_toplam   bigint := 0;
  v_tablo    int := 0;
  v_hata     text := '';
BEGIN
  FOR r IN SELECT tablo_adi FROM yedek.kapsam ORDER BY tablo_adi LOOP
    BEGIN
      v_hedef := format('%I', r.tablo_adi || '_' || to_char(v_tarih, 'YYYYMMDD'));

      -- Aynı gün ikinci kez çalışırsa üstüne yaz (idempotent).
      EXECUTE format('DROP TABLE IF EXISTS yedek.%s', v_hedef);
      EXECUTE format('CREATE TABLE yedek.%s AS SELECT * FROM public.%I', v_hedef, r.tablo_adi);
      EXECUTE format('SELECT count(*) FROM yedek.%s', v_hedef) INTO v_satir;

      v_toplam := v_toplam + v_satir;
      v_tablo  := v_tablo + 1;
    EXCEPTION WHEN OTHERS THEN
      -- SESSİZ GEÇME YOK: bir tablo alınamazsa diğerleri yine alınır ama
      -- hata kayda geçer ve sonuç KIRMIZI döner.
      v_hata := v_hata || r.tablo_adi || ' (' || SQLERRM || '); ';
    END;
  END LOOP;

  -- 7 günden eski yedekleri temizle.
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'yedek' AND c.relkind = 'r'
      AND c.relname ~ '_[0-9]{8}$'
      AND to_date(right(c.relname, 8), 'YYYYMMDD') < v_tarih - 7
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS yedek.%I', r.relname);
  END LOOP;

  RETURN jsonb_build_object(
    'tarih', v_tarih,
    'tablo_sayisi', v_tablo,
    'toplam_satir', v_toplam,
    'hata', NULLIF(v_hata, ''),
    'durum', CASE WHEN v_hata = '' THEN 'YESIL' ELSE 'KIRMIZI' END
  );
END;
$function$;

REVOKE ALL ON FUNCTION yedek.gunluk_al() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION yedek.gunluk_al() IS
  'SRE-1: Kritik tablolarin gecelik tam kopyasi, 7 gunluk pencere. Bir tablo alinamazsa digerleri yine alinir ama sonuc KIRMIZI doner.';

-- ── Durum sorgusu (Sistem Sağlığı bunu okuyacak) ────────────────────────────
CREATE OR REPLACE FUNCTION public.yedek_durumu()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'yedek', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'son_yedek_tarihi', (
      SELECT max(to_date(right(c.relname, 8), 'YYYYMMDD'))
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'yedek' AND c.relkind = 'r' AND c.relname ~ '_[0-9]{8}$'
    ),
    'beklenen_tablo', (SELECT count(*) FROM yedek.kapsam),
    'son_gun_tablo', (
      SELECT count(*)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'yedek' AND c.relkind = 'r'
        AND c.relname LIKE '%\_' || to_char(
          (SELECT max(to_date(right(c2.relname, 8), 'YYYYMMDD'))
           FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
           WHERE n2.nspname = 'yedek' AND c2.relkind = 'r' AND c2.relname ~ '_[0-9]{8}$'),
          'YYYYMMDD')
    ),
    'saklanan_gun', (
      SELECT count(DISTINCT right(c.relname, 8))
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'yedek' AND c.relkind = 'r' AND c.relname ~ '_[0-9]{8}$'
    ),
    'boyut', (
      SELECT pg_size_pretty(COALESCE(sum(pg_total_relation_size(c.oid)), 0))
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'yedek' AND c.relkind = 'r'
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.yedek_durumu() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yedek_durumu() TO authenticated;

-- ── Gecelik iş: 02:30 UTC = 05:30 İstanbul (denetimden ÖNCE) ───────────────
DO $do$
BEGIN
  PERFORM cron.unschedule('gecelik_yedek')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gecelik_yedek');

  PERFORM cron.schedule('gecelik_yedek', '30 2 * * *', 'SELECT yedek.gunluk_al();');
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ YÜKLEME (bir kaza olursa):
--   -- 1) Önce neyin kaybolduğuna bak:
--   SELECT * FROM yedek.payment_intents_20260804 EXCEPT SELECT * FROM public.payment_intents;
--   -- 2) Eksikleri geri yaz (ÖRNEK — önce mutlaka incele):
--   INSERT INTO public.payment_intents SELECT * FROM yedek.payment_intents_20260804
--     ON CONFLICT (id) DO NOTHING;
--
-- GERİ ALMA (yedek sistemini kaldırmak):
--   SELECT cron.unschedule('gecelik_yedek');
--   DROP SCHEMA yedek CASCADE;
-- ════════════════════════════════════════════════════════════════════════════
