-- ════════════════════════════════════════════════════════════════════════════
-- [SRE-3 düzeltme] EK BİLGİ temizliği metin üzerinden değil, ALAN ALAN yapılsın
-- ────────────────────────────────────────────────────────────────────────────
-- NEDEN: İlk sürüm ek bilgiyi (jsonb) düz metne çevirip temizliyordu. Test
-- sırasında ortaya çıktı ki bu yanlış: milisaniye cinsinden bir zaman damgası
-- 13 hanelidir ve "kart numarası" desenine takılıyor. Takılınca JSON'un biçimi
-- bozuluyor ve TÜM ek bilgi çöpe gidiyordu. Yani her sıradan hata kaydı ek
-- bilgisini kaybedecekti.
--
-- ÇÖZÜM: JSON'un içinde gezip yalnızca METİN değerleri temizle. Sayılara,
-- true/false'a, null'a dokunma — biçim hiçbir zaman bozulmaz. Ayrıca adı
-- şüpheli olan alanlar (token, sifre, jwt, authorization ...) tümüyle silinir.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hata_temizle_json(p_veri jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sonuc jsonb;
  v_anahtar text;
  v_deger jsonb;
BEGIN
  IF p_veri IS NULL THEN RETURN NULL; END IF;

  CASE jsonb_typeof(p_veri)
    WHEN 'object' THEN
      v_sonuc := '{}'::jsonb;
      FOR v_anahtar, v_deger IN SELECT key, value FROM jsonb_each(p_veri) LOOP
        IF v_anahtar ~* '(token|jwt|auth|secret|sifre|password|apikey|api_key|eposta|email|telefon|phone|iban|kart|card|cvv)' THEN
          -- Adi supheli alan: degerine hic bakmadan sil.
          v_sonuc := v_sonuc || jsonb_build_object(v_anahtar, '[gizlendi]'::jsonb);
        ELSE
          v_sonuc := v_sonuc || jsonb_build_object(v_anahtar, public.hata_temizle_json(v_deger));
        END IF;
      END LOOP;
      RETURN v_sonuc;

    WHEN 'array' THEN
      SELECT COALESCE(jsonb_agg(public.hata_temizle_json(e)), '[]'::jsonb)
        INTO v_sonuc FROM jsonb_array_elements(p_veri) e;
      RETURN v_sonuc;

    WHEN 'string' THEN
      RETURN to_jsonb(public.hata_temizle_metin(p_veri #>> '{}', 500));

    ELSE
      -- sayi / boolean / null: gizli bilgi tasimaz, oldugu gibi kalir.
      RETURN p_veri;
  END CASE;
END;
$function$;

COMMENT ON FUNCTION public.hata_temizle_json(jsonb) IS
  'SRE-3: Ek bilgiyi alan alan temizler. Metin degerler elekten gecer, sayilar korunur, adi supheli alanlar tumuyle silinir. JSON bicimi hicbir zaman bozulmaz.';

-- ── hata_bildir: ek bilgi artık yeni temizleyiciyi kullanır ─────────────────
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

  -- Ek bilgi ALAN ALAN temizlenir; JSON bicimi bozulmaz, sayilar kaybolmaz.
  IF p_ek IS NOT NULL THEN
    v_ek := public.hata_temizle_json(p_ek);
    -- Asiri buyuk ek bilgi tabloyu sisirmesin.
    IF length(v_ek::text) > 4000 THEN
      v_ek := jsonb_build_object('not', 'ek bilgi cok buyuk oldugu icin saklanmadi');
    END IF;
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
