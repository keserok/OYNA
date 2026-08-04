-- ════════════════════════════════════════════════════════════════════════════
-- [SRE-3 düzeltme 2] "[gizlendi]" etiketi JSON metni olarak yazılmalı
-- ────────────────────────────────────────────────────────────────────────────
-- HATA: Bir önceki sürümde adı şüpheli alanların değeri `'[gizlendi]'::jsonb`
-- ile değiştiriliyordu. Postgres bunu METİN değil, köşeli parantez yüzünden
-- DİZİ sanıyor ve "geçersiz JSON" hatası veriyordu. Sonuç: ek bilgi taşıyan
-- her hata kaydı sessizce düşüyordu (hata_bildir false dönüyordu).
--
-- Testte yakalandı, canlıya bu hâliyle çıkmadı.
-- DÜZELTME: to_jsonb('[gizlendi]'::text) — metin olarak yazılır.
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
          v_sonuc := v_sonuc || jsonb_build_object(v_anahtar, to_jsonb('[gizlendi]'::text));
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
