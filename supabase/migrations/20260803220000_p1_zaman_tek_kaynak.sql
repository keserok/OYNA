-- ════════════════════════════════════════════════════════════════════════════
-- [P-1 / M-P0-8 / K-10.6] ZAMAN TEK KAYNAK — saat sapmasını imkânsız kılar
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN (3 Ağustos 2026, K-ZAMAN-2 tarayıcısıyla bulundu):
--
--   Bir maçın saati iki biçimde tutuluyor: metin (date + time) ve mutlak an
--   (starts_at). Metinden mutlak ana çevirirken iki yazım var:
--
--     ❌ (v_date::date + (v_time||':00')::time)::timestamptz
--        → sunucu saat dilimini (UTC) kullanır → İstanbul'a göre 3 SAAT KAYAR
--     ✅ (v_date::date + (v_time||':00')::time) AT TIME ZONE 'Europe/Istanbul'
--
--   Tarayıcı 401 migration / 619 fonksiyon tarayıp SON tanımı riskli olan
--   3 fonksiyon buldu:
--     • player_create_match       (repo riskli · CANLI DOĞRU)
--     • admin_create_match__core  (repo riskli · CANLI DA RİSKLİ 🔴)
--     • admin_update_match__core  (repo riskli · CANLI DA RİSKLİ 🔴)
--
--   ⚠️ MİMAR RAPORUNUN DÜZELTİLMESİ: Rapor "canlı doğru, yalnız repo bozuk"
--   diyordu. Bu YALNIZ player_create_match ve create_match_atomic için
--   doğruydu — kontrol edilen iki fonksiyon onlardı. ADMİN YOLU CANLIDA DA
--   BOZUK. Bugüne dek patlamamasının tek sebebi mevcut 20 maçın admin
--   panelinden oluşturulmamış olması. K-1.5 (concierge onboarding: admin
--   panelden toplu maç açma) devreye girdiği anda HER MAÇ 3 saat kayacaktı.
--
--   trg_matches_sync_time_and_score_status starts_at'e DOKUNMUYOR
--   (yalnız ends_at / duration_minutes / score_status türetiyor) — yani
--   hatayı maskelemiyordu.
--
-- ÇÖZÜM — üç fonksiyonu tek tek düzeltmek YETMEZ:
--   Bugün 3 tane; yarın yeni bir fonksiyon aynı hatayı yapabilir. Bu yüzden
--   K-10.6 gereği ZAMAN TEK KAYNAK haline getiriliyor: normalleştirme
--   veritabanı seviyesine, BEFORE trigger'a taşınıyor. Artık HANGİ fonksiyon
--   yazarsa yazsın, hangi yoldan gelirse gelsin, kayıt diske inmeden önce
--   normalleştirilir. Sapma FİZİKSEL OLARAK İMKÂNSIZ hale gelir.
--
-- YÖN KURALI (iki yönlü tutarlılık):
--   • date/time verilmiş/değişmişse  → starts_at ONLARDAN türetilir (İstanbul)
--   • yalnız starts_at değişmişse    → date/time ONDAN türetilir (İstanbul)
--   • ikisi de yoksa                 → dokunulmaz (NULL kalır)
--
-- GERİ ALMA: dosya sonundaki blok.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.matches_zaman_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_saat        text;
  v_metin_var   boolean;
  v_metin_degis boolean;
  v_anlik_degis boolean;
BEGIN
  -- "20.00" / "9:5" gibi girdileri "HH:MM" biçimine indirger; geçersizse NULL
  v_saat := (regexp_match(replace(COALESCE(NEW."time", ''), '.', ':'), '(\d{1,2}:\d{2})'))[1];
  IF v_saat IS NOT NULL THEN
    v_saat := lpad(split_part(v_saat, ':', 1), 2, '0') || ':' || split_part(v_saat, ':', 2);
  END IF;

  v_metin_var := (NEW.date IS NOT NULL AND NEW.date <> '' AND v_saat IS NOT NULL);

  IF TG_OP = 'INSERT' THEN
    v_metin_degis := v_metin_var;
    v_anlik_degis := (NEW.starts_at IS NOT NULL);
  ELSE
    v_metin_degis := v_metin_var AND
      (NEW.date IS DISTINCT FROM OLD.date OR NEW."time" IS DISTINCT FROM OLD."time");
    v_anlik_degis := (NEW.starts_at IS DISTINCT FROM OLD.starts_at);
  END IF;

  -- ── YÖN 1: metin saat kaynak → mutlak anı türet ────────────────────────
  -- Metin değiştiyse metin kazanır (kullanıcı tarih/saat seçmiştir).
  IF v_metin_degis THEN
    BEGIN
      NEW.starts_at := (NEW.date::date + (v_saat || ':00')::time)
                       AT TIME ZONE 'Europe/Istanbul';
    EXCEPTION WHEN OTHERS THEN
      -- Bozuk tarih metni: sessizce yanlış an yazmaktansa dokunma.
      RAISE WARNING '[ZAMAN] Tarih/saat cozumlenemedi (date=%, time=%) - starts_at degistirilmedi', NEW.date, NEW."time";
    END;

  -- ── YÖN 2: yalnız mutlak an değişti → metin saati ondan türet ──────────
  ELSIF v_anlik_degis AND NEW.starts_at IS NOT NULL THEN
    NEW.date  := to_char(NEW.starts_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD');
    NEW."time" := to_char(NEW.starts_at AT TIME ZONE 'Europe/Istanbul', 'HH24:MI');
  END IF;

  -- ── Her durumda: starts_at varsa metin saat ONUNLA tutarlı olmalı ──────
  -- Bu satır, yukarıdaki iki yolun hangisi çalışırsa çalışsın iki temsilin
  -- birbirini tutmasını garanti eder. K-ZAMAN-1 kontrolü bunu sınar.
  IF NEW.starts_at IS NOT NULL THEN
    NEW.date  := to_char(NEW.starts_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD');
    NEW."time" := to_char(NEW.starts_at AT TIME ZONE 'Europe/Istanbul', 'HH24:MI');
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.matches_zaman_normalize() IS
  'P-1/K-10.6: matches zaman tek kaynak. date+time <-> starts_at cift yonlu normalizasyon, her zaman Europe/Istanbul. Hangi fonksiyon yazarsa yazsin sapma olusamaz.';

-- ── Sıra önemli: bu trigger, ends_at türeten trigger'dan ÖNCE çalışmalı ──
-- PostgreSQL aynı olaydaki BEFORE trigger'ları ADA GÖRE alfabetik çalıştırır.
-- 'trg_a_matches_zaman_normalize' < 'trg_matches_sync_time_and_score_status'
-- olduğu için normalizasyon önce biter, ends_at doğru starts_at'ten türetilir.
DROP TRIGGER IF EXISTS trg_a_matches_zaman_normalize ON public.matches;
CREATE TRIGGER trg_a_matches_zaman_normalize
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.matches_zaman_normalize();

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA:
--   DROP TRIGGER IF EXISTS trg_a_matches_zaman_normalize ON public.matches;
--   DROP FUNCTION IF EXISTS public.matches_zaman_normalize();
-- ════════════════════════════════════════════════════════════════════════════
