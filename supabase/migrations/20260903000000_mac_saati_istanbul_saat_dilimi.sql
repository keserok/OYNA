-- ════════════════════════════════════════════════════════════════════════════
-- MAÇ BAŞLANGIÇ SAATİ — SAAT DİLİMİ DÜZELTMESİ
-- ════════════════════════════════════════════════════════════════════════════
--
-- SORUN
-- Maç saati kullanıcıdan İSTANBUL duvar saati olarak alınıyor ("21:00"), ama
-- `matches.starts_at`e yazılırken `::timestamptz` dönüşümü kullanılıyordu.
-- Bu dönüşüm sunucunun saat dilimini uygular; Supabase sunucusu UTC olduğu için
-- 21:00 → '21:00+00' oluyordu. Oysa doğrusu '21:00+03' (= 18:00 UTC).
-- Yani kayıtlı an GERÇEK andan 3 saat İLERİDEYDİ.
--
-- ETKİLENEN ALTI YER (hepsi starts_at okur):
--   1. refund-payment           → iade penceresi 3 saat geç açılıyordu
--   2. auto-cancel-matches      → otomatik iptal taraması 3 saat kayıyordu
--   3. hatırlatma bildirimleri  → 24s/1s hatırlatmaları 3 saat geç
--   4. get_nearby_matches       → biten maç vitrinde 3 saat fazla kalıyordu
--   5. skor girme kapısı        → "maç bitti" 3 saat geç açılıyordu
--   6. kaleci/hakem eşleştirme  → EN AĞIRI: `starts_at AT TIME ZONE
--      'Europe/Istanbul'` yapıldığı için 21:00 maçı 00:00'a kayıyor, YANLIŞ
--      GÜN ve YANLIŞ SAAT için müsait görevli aranıyordu.
--
-- ÇÖZÜM
-- Duvar saati artık açıkça İstanbul olarak yorumlanır:
--   (tarih + saat) AT TIME ZONE 'Europe/Istanbul'
-- Sabit "+3 saat" YAZILMAZ; bölge adı kullanılır ki Türkiye ileride yeniden
-- yaz saatine geçerse kayıtlar kendiliğinden doğru kalsın.
--
-- NOT (gelecekteki geliştirici için): `player_create_match` ve
-- `create_match_atomic` yeniden tanımlanırsa bu düzeltme SİLİNİR. O
-- fonksiyonlara dokunurken starts_at türetmesinde `AT TIME ZONE
-- 'Europe/Istanbul'` ifadesinin durduğundan emin ol. En alttaki doğrulama
-- bloğu, düzeltme kaybolursa migration'ı kırar.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. FONKSİYONLARDAKİ TÜRETMEYİ DÜZELT ────────────────────────────────────
--
-- Fonksiyon gövdeleri 6–10 KB; tamamını buraya kopyalamak yerine YALNIZ ilgili
-- ifade değiştirilir. Her iki fonksiyonda da tam BİR adet `::timestamptz`
-- dönüşümü var ve o da starts_at türetmesidir — hedef belirsiz değildir.
-- Beklenen kalıp bulunamazsa migration SESSİZCE GEÇMEZ, hata verir.

DO $mig$
DECLARE
  v_def  text;
  v_yeni text;
  v_fn   text;
  v_eski_kalip text;
  v_yeni_kalip text;
BEGIN
  FOR v_fn, v_eski_kalip, v_yeni_kalip IN
    SELECT * FROM (VALUES
      ('player_create_match',
       '(v_date::date + (v_time_norm||'':00'')::time)::timestamptz',
       '(v_date::date + (v_time_norm||'':00'')::time) AT TIME ZONE ''Europe/Istanbul'''),
      ('create_match_atomic',
       '((p_date + 1) + p_start_time)::timestamptz',
       '((p_date + 1) + p_start_time) AT TIME ZONE ''Europe/Istanbul''')
    ) AS t(fn, eski, yeni)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn
    LIMIT 1;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'MIGRATION: public.% bulunamadı.', v_fn;
    END IF;

    IF position(v_eski_kalip IN v_def) = 0 THEN
      -- Zaten düzeltilmişse sessizce geç; değilse gerçekten bir sorun var.
      IF position('AT TIME ZONE ''Europe/Istanbul''' IN v_def) > 0
         AND position('::timestamptz' IN v_def) = 0 THEN
        RAISE NOTICE 'MIGRATION: public.% zaten düzeltilmiş, atlanıyor.', v_fn;
        CONTINUE;
      END IF;
      RAISE EXCEPTION
        'MIGRATION: public.% içinde beklenen saat türetmesi bulunamadı — fonksiyon değişmiş olabilir. Elle gözden geçir.', v_fn;
    END IF;

    v_yeni := replace(v_def, v_eski_kalip, v_yeni_kalip);
    EXECUTE v_yeni;
    RAISE NOTICE 'MIGRATION: public.% saat dilimi düzeltildi.', v_fn;
  END LOOP;
END
$mig$;

-- ── 2. MEVCUT KAYITLARI DÜZELT ──────────────────────────────────────────────
--
-- Kayıtlı değer "doğru duvar saati, yanlış saat dilimi" biçiminde. Onarım:
--   starts_at'in UTC duvar saatini oku → onu İstanbul saati olarak yeniden etiketle
-- Örnek: '2026-08-01 21:00+00' → duvar saati 21:00 → '2026-08-01 21:00+03'
--
-- Bu yöntem tarih/saat METİN kolonlarına hiç bakmaz; gece maçlarına uygulanan
-- "+1 gün" kaydırması zaten kayıtlı değerin içinde olduğu için korunur.
--
-- GÜVENLİK KİLİDİ: yalnız gerçekten sapmış satırlar düzeltilir — starts_at'in
-- UTC duvar saati, `time` metnindeki saatle aynı olan satırlar. Doğru yazılmış
-- bir kayıt yanlışlıkla ikinci kez kaydırılmaz.

-- Eski değerler geri alınabilsin diye önce kaydedilir.
CREATE TABLE IF NOT EXISTS public._saat_dilimi_duzeltme_yedek (
  match_id      uuid PRIMARY KEY,
  eski_starts_at timestamptz NOT NULL,
  eski_ends_at   timestamptz,
  duzeltildi_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public._saat_dilimi_duzeltme_yedek IS
  'Saat dilimi düzeltmesinden (20260903000000) önceki starts_at/ends_at değerleri. Geri alma dışında kullanılmaz.';
ALTER TABLE public._saat_dilimi_duzeltme_yedek ENABLE ROW LEVEL SECURITY;
-- RLS açık ve HİÇ policy yok → normal kullanıcılar okuyamaz/yazamaz.
-- Yalnız servis anahtarı (bakım) erişir; geri alma işlemi de onunla yapılır.

WITH sapan AS (
  SELECT m.id, m.starts_at, m.ends_at
  FROM public.matches m
  WHERE m.starts_at IS NOT NULL
    AND (regexp_match(replace(COALESCE(m.time, ''), '.', ':'), '\d{1,2}:\d{2}'))[1] IS NOT NULL
    AND (m.starts_at AT TIME ZONE 'UTC')::time
        = ((regexp_match(replace(m.time, '.', ':'), '\d{1,2}:\d{2}'))[1] || ':00')::time
)
INSERT INTO public._saat_dilimi_duzeltme_yedek (match_id, eski_starts_at, eski_ends_at)
SELECT id, starts_at, ends_at FROM sapan
ON CONFLICT (match_id) DO NOTHING;

UPDATE public.matches m
SET starts_at = (m.starts_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul'
WHERE m.id IN (SELECT match_id FROM public._saat_dilimi_duzeltme_yedek);
-- ends_at ayrıca yazılmaz: trg_matches_sync_time_and_score_status tetikleyicisi
-- BEFORE UPDATE çalışıp ends_at'i yeni starts_at + duration_minutes ile
-- kendisi yeniden hesaplar.

-- ── 3. DOĞRULAMA — düzeltme tutmadıysa migration BURADA kırılır ─────────────

DO $dogrula$
DECLARE
  v_kalan int;
  v_ends_bozuk int;
BEGIN
  -- 3a. Hiçbir maçın duvar saati artık UTC'ye eşit olmamalı (hepsi +03 olmalı).
  SELECT count(*) INTO v_kalan
  FROM public.matches m
  WHERE m.starts_at IS NOT NULL
    AND (regexp_match(replace(COALESCE(m.time, ''), '.', ':'), '\d{1,2}:\d{2}'))[1] IS NOT NULL
    AND (m.starts_at AT TIME ZONE 'UTC')::time
        = ((regexp_match(replace(m.time, '.', ':'), '\d{1,2}:\d{2}'))[1] || ':00')::time;
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'MIGRATION DOĞRULAMA: % maçın saati hâlâ sapık.', v_kalan;
  END IF;

  -- 3b. İstanbul duvar saati `time` metniyle birebir uyuşmalı.
  SELECT count(*) INTO v_kalan
  FROM public.matches m
  WHERE m.starts_at IS NOT NULL
    AND (regexp_match(replace(COALESCE(m.time, ''), '.', ':'), '\d{1,2}:\d{2}'))[1] IS NOT NULL
    AND (m.starts_at AT TIME ZONE 'Europe/Istanbul')::time
        <> ((regexp_match(replace(m.time, '.', ':'), '\d{1,2}:\d{2}'))[1] || ':00')::time;
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'MIGRATION DOĞRULAMA: % maçın İstanbul saati `time` ile uyuşmuyor.', v_kalan;
  END IF;

  -- 3c. ends_at tetikleyici tarafından yeniden hesaplanmış olmalı.
  SELECT count(*) INTO v_ends_bozuk
  FROM public.matches m
  WHERE m.starts_at IS NOT NULL AND m.duration_minutes IS NOT NULL
    AND m.ends_at IS DISTINCT FROM (m.starts_at + make_interval(mins => m.duration_minutes));
  IF v_ends_bozuk > 0 THEN
    RAISE EXCEPTION 'MIGRATION DOĞRULAMA: % maçın bitiş saati başlangıçla tutarsız.', v_ends_bozuk;
  END IF;

  RAISE NOTICE 'MIGRATION DOĞRULAMA: tüm maç saatleri İstanbul saat dilimine oturdu.';
END
$dogrula$;
