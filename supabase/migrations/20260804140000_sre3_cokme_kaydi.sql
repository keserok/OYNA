-- ════════════════════════════════════════════════════════════════════════════
-- [SRE-3 / S-3=güvenli] ÇÖKME KAYDI — kullanıcı yaşadığı hatayı bize söylemek
-- zorunda kalmasın
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: Uygulama bir kullanıcının telefonunda çöktüğünde bunu kimse bilmiyor.
-- `utils/observability.ts` Sentry'ye gönderim için yazılmış ama anahtar yok →
-- her çağrı sessizce hiçbir şey yapmıyor. Yani hatalar hiçbir yere gitmiyor.
--
-- KURUCU KARARI S-3 = "güvenli olsun": üçüncü tarafa (Sentry/PostHog) veri
-- GÖNDERMİYORUZ. Hatalar kendi veritabanımızda kalır:
--   • dışarı hiçbir veri çıkmaz          → KVKK sorusu doğmaz
--   • hesap açmak/ödeme yapmak gerekmez  → bugün çalışır
--   • panelden okunur                    → kurucu kendi görür
--
-- GİZLİLİK: Hem tarayıcı tarafında hem BURADA temizlik yapılır. E-posta,
-- telefon, kart numarası, oturum anahtarı gibi şeyler kayda GİRMEZ — girmeye
-- çalışsa bile aşağıdaki `hata_temizle_metin()` siler. İki kat elek, çünkü
-- tarayıcı tarafındaki eleği bir gün biri atlayabilir.
--
-- SEL BASKINI KORUMASI: Bozuk bir ekran saniyede yüzlerce hata üretebilir.
-- Aynı hata bir saatte en fazla 20 kez, sistem geneli bir saatte en fazla 500
-- kez yazılır. Fazlası sessizce atılır (uygulama yine de çalışmaya devam eder).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Kayıt tablosu ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.istemci_hatalari (
  id           bigserial PRIMARY KEY,
  olustu_at    timestamptz NOT NULL DEFAULT now(),
  kullanici_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  parmak_izi   text NOT NULL,                -- aynı hatayı gruplamak için
  nerede       text,                          -- 'ErrorBoundary' / 'store.retryInitialLoad' ...
  mesaj        text NOT NULL,
  yigin        text,                          -- hatanın izi (stack)
  ekran        text,                          -- hangi sayfadaydı
  surum        text,                          -- uygulama sürümü
  platform     text,                          -- web / ios / android
  ek           jsonb                          -- temizlenmiş ek bilgi
);

CREATE INDEX IF NOT EXISTS istemci_hatalari_zaman_idx
  ON public.istemci_hatalari (olustu_at DESC);
CREATE INDEX IF NOT EXISTS istemci_hatalari_parmak_idx
  ON public.istemci_hatalari (parmak_izi, olustu_at DESC);

COMMENT ON TABLE public.istemci_hatalari IS
  'SRE-3: Uygulamada olusan hatalarin KENDI veritabanimizdaki kaydi. Ucuncu tarafa veri gitmez.';

-- ── Kapılar: kimse doğrudan okuyup yazamaz, sadece RPC üzerinden ────────────
ALTER TABLE public.istemci_hatalari ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.istemci_hatalari FROM anon, authenticated;

DROP POLICY IF EXISTS "hatalari sadece yonetici okur" ON public.istemci_hatalari;
CREATE POLICY "hatalari sadece yonetici okur"
  ON public.istemci_hatalari FOR SELECT TO authenticated
  USING (public.is_admin());

-- ── Metin temizleyici (ikinci elek) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hata_temizle_metin(p_metin text, p_azami int DEFAULT 2000)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(COALESCE(p_metin, ''),
            -- e-posta
            '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[gizlendi]', 'g'),
          -- oturum anahtari / JWT (uc parcali nokta ayrimi)
          '\meyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '[gizlendi]', 'g'),
        -- kart numarasi benzeri 13-19 haneli dizi
        '\m[0-9]{13,19}\M', '[gizlendi]', 'g'),
      -- telefon (+90... veya 05...)
      '(\+?9?0?[ -]?5[0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{2}[ -]?[0-9]{2})', '[gizlendi]', 'g'),
    p_azami);
$function$;

COMMENT ON FUNCTION public.hata_temizle_metin(text,int) IS
  'SRE-3 gizlilik elegi: e-posta, telefon, kart, oturum anahtari benzeri desenleri siler ve metni kisaltir.';

-- ── Hata bildirme (uygulamanın çağırdığı tek kapı) ──────────────────────────
CREATE OR REPLACE FUNCTION public.hata_bildir(
  p_mesaj    text,
  p_nerede   text DEFAULT NULL,
  p_yigin    text DEFAULT NULL,
  p_ekran    text DEFAULT NULL,
  p_surum    text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_ek       jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
DECLARE
  v_mesaj  text;
  v_yigin  text;
  v_parmak text;
  v_ayni   int;
  v_toplam int;
  v_ek     jsonb;
BEGIN
  -- Bos mesaj kayda deger degil.
  v_mesaj := public.hata_temizle_metin(p_mesaj, 500);
  IF v_mesaj IS NULL OR btrim(v_mesaj) = '' THEN
    RETURN false;
  END IF;

  v_yigin  := public.hata_temizle_metin(p_yigin, 4000);
  -- Parmak izi: nerede + mesajin ilk satiri. Ayni hata tek grup olur.
  v_parmak := left(md5(COALESCE(p_nerede, '') || '|' || split_part(v_mesaj, E'\n', 1)), 16);

  -- Sel baskini korumasi 1: ayni hata son 1 saatte 20'den fazlaysa yazma.
  SELECT count(*) INTO v_ayni FROM public.istemci_hatalari
  WHERE parmak_izi = v_parmak AND olustu_at > now() - interval '1 hour';
  IF v_ayni >= 20 THEN RETURN false; END IF;

  -- Sel baskini korumasi 2: sistem geneli son 1 saatte 500'den fazlaysa yazma.
  SELECT count(*) INTO v_toplam FROM public.istemci_hatalari
  WHERE olustu_at > now() - interval '1 hour';
  IF v_toplam >= 500 THEN RETURN false; END IF;

  -- Ek bilgi temizlenirken JSON bicimi bozulabilir (orn. uzun bir sayi kart
  -- numarasi sanilip degistirilirse). O zaman ek bilgiden vazgeceriz — ASIL
  -- hata kaydini kaybetmeyiz.
  IF p_ek IS NOT NULL THEN
    BEGIN
      v_ek := public.hata_temizle_metin(p_ek::text, 2000)::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_ek := jsonb_build_object('not', 'ek bilgi temizlenirken bicimi bozuldu, atlandi');
    END;
  END IF;

  INSERT INTO public.istemci_hatalari
    (kullanici_id, parmak_izi, nerede, mesaj, yigin, ekran, surum, platform, ek)
  VALUES (
    auth.uid(),
    v_parmak,
    left(p_nerede, 120),
    v_mesaj,
    v_yigin,
    left(p_ekran, 200),
    left(p_surum, 60),
    left(p_platform, 20),
    v_ek
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  -- Hata kaydetmeye calisirken hata olusursa UYGULAMA ETKILENMEZ.
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.hata_bildir(text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hata_bildir(text,text,text,text,text,text,jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.hata_bildir(text,text,text,text,text,text,jsonb) IS
  'SRE-3: Uygulamadan gelen hata bildirimi. Metinleri temizler, sel baskinina karsi sinirlar, asla hata firlatmaz.';

-- ── Panel özeti (yalnızca yönetici) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hata_ozeti(p_saat int DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pencere interval := make_interval(hours => GREATEST(1, LEAST(COALESCE(p_saat, 24), 720)));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'pencere_saat', EXTRACT(epoch FROM v_pencere) / 3600,
    'toplam', (SELECT count(*) FROM public.istemci_hatalari WHERE olustu_at > now() - v_pencere),
    'farkli_hata', (SELECT count(DISTINCT parmak_izi) FROM public.istemci_hatalari WHERE olustu_at > now() - v_pencere),
    'etkilenen_kisi', (SELECT count(DISTINCT kullanici_id) FROM public.istemci_hatalari
                       WHERE olustu_at > now() - v_pencere AND kullanici_id IS NOT NULL),
    'gruplar', COALESCE((
      SELECT jsonb_agg(g ORDER BY (g->>'adet')::int DESC)
      FROM (
        SELECT jsonb_build_object(
                 'parmak_izi', parmak_izi,
                 'nerede',     min(nerede),
                 'mesaj',      min(mesaj),
                 'ekran',      min(ekran),
                 'adet',       count(*),
                 'kisi',       count(DISTINCT kullanici_id),
                 'son',        max(olustu_at)
               ) AS g
        FROM public.istemci_hatalari
        WHERE olustu_at > now() - v_pencere
        GROUP BY parmak_izi
        ORDER BY count(*) DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hata_ozeti(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hata_ozeti(int) TO authenticated;

-- ── Temizlik: 30 günden eski hata kaydı tutulmaz ────────────────────────────
CREATE OR REPLACE FUNCTION public.hata_kayitlarini_temizle()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_silinen int;
BEGIN
  DELETE FROM public.istemci_hatalari WHERE olustu_at < now() - interval '30 days';
  GET DIAGNOSTICS v_silinen = ROW_COUNT;
  RETURN v_silinen;
END;
$function$;

REVOKE ALL ON FUNCTION public.hata_kayitlarini_temizle() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  PERFORM cron.unschedule('hata_kayit_temizligi')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hata_kayit_temizligi');

  PERFORM cron.schedule('hata_kayit_temizligi', '50 3 * * *',
                        'SELECT public.hata_kayitlarini_temizle();');
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA:
--   SELECT cron.unschedule('hata_kayit_temizligi');
--   DROP FUNCTION IF EXISTS public.hata_ozeti(int);
--   DROP FUNCTION IF EXISTS public.hata_bildir(text,text,text,text,text,text,jsonb);
--   DROP FUNCTION IF EXISTS public.hata_kayitlarini_temizle();
--   DROP FUNCTION IF EXISTS public.hata_temizle_metin(text,int);
--   DROP TABLE IF EXISTS public.istemci_hatalari;
-- ════════════════════════════════════════════════════════════════════════════
