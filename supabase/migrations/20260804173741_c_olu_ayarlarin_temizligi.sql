-- ═══════════════════════════════════════════════════════════════════════════
-- C PAKETİ — ÖLÜ AYARLARIN TEMİZLİĞİ · CEO kararı, 4 Ağustos 2026
--
-- SORUN: Panelde duran, değiştirildiğinde HİÇBİR ŞEY olmayan ayarlar.
--   Yanlış beklenti üretiyorlar: "eşiği düşürdüm ama kimse cezalanmıyor".
--
-- SİLİNENLER (hepsinin okuyucu sayısı 0 — veritabanı, uygulama ve edge
-- fonksiyonların tamamı tarandı):
--   • 6 adet fairplay_* → arkasında böyle bir puan sistemi YOK.
--     profiles tablosunda fairplay diye bir sütun bulunmuyor. Gerçekte çalışan
--     puanlar trust_score ve reliability_score; onlara DOKUNULMUYOR.
--   • match_confirm_window_hours, match_min_player_pct → maçın kesinleşme
--     kuralı bunlara bakmıyor. Gerçek kural match_check_threshold içinde:
--     dolan slot >= minimum oyuncu ise maç CONFIRMED olur.
--
-- SİLİNMEYEN (bilerek): fairplay_late_cancel_penalty — adı benziyor ama
--   ÇALIŞIYOR; _leave_match_quote geç iptal cezasını bununla hesaplıyor.
--
-- BOZMA RİSKİ: Çok düşük. Silinen anahtarların hiçbirini hiçbir kod okumuyor.
--   Yine de get_config_* fonksiyonları varsayılan değerle çalışır; bir yerde
--   gözden kaçan okuma olsaydı bile hata değil, varsayılan davranış olurdu.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Silmeden ÖNCE kanıt kaydı ────────────────────────────────────────────
-- Ne sildiğimiz kaybolmasın: geri gerekirse buradan okunur.
CREATE TABLE IF NOT EXISTS public.silinen_ayarlar (
  key         text PRIMARY KEY,
  value       jsonb,
  silinme_ani timestamptz NOT NULL DEFAULT now(),
  sebep       text
);

ALTER TABLE public.silinen_ayarlar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS silinen_ayarlar_admin_okur ON public.silinen_ayarlar;
CREATE POLICY silinen_ayarlar_admin_okur ON public.silinen_ayarlar
  FOR SELECT TO authenticated USING (public.is_platform_admin());

REVOKE ALL ON public.silinen_ayarlar FROM PUBLIC, anon;
GRANT SELECT ON public.silinen_ayarlar TO authenticated;

INSERT INTO public.silinen_ayarlar (key, value, sebep)
SELECT key, value,
       CASE WHEN key LIKE 'fairplay_%'
            THEN 'Arkasinda fair play puan sistemi yok (profiles.fairplay sutunu bulunmuyor).'
            ELSE 'Hicbir kod okumuyor; mac kesinlesme kurali match_check_threshold icinde.'
       END
FROM public.app_config
WHERE key IN (
  'fairplay_bad_review_penalty','fairplay_ban_threshold','fairplay_good_match_bonus',
  'fairplay_noshow_penalty','fairplay_restrict_threshold','fairplay_warn_threshold',
  'match_confirm_window_hours','match_min_player_pct'
)
ON CONFLICT (key) DO NOTHING;

DELETE FROM public.app_config
WHERE key IN (
  'fairplay_bad_review_penalty','fairplay_ban_threshold','fairplay_good_match_bonus',
  'fairplay_noshow_penalty','fairplay_restrict_threshold','fairplay_warn_threshold',
  'match_confirm_window_hours','match_min_player_pct'
);

-- ─── DOĞRULAMA ────────────────────────────────────────────────────────────
DO $$
DECLARE v_kalan int; v_yedek int;
BEGIN
  SELECT count(*) INTO v_kalan FROM public.app_config
   WHERE key IN ('fairplay_bad_review_penalty','fairplay_ban_threshold',
                 'fairplay_good_match_bonus','fairplay_noshow_penalty',
                 'fairplay_restrict_threshold','fairplay_warn_threshold',
                 'match_confirm_window_hours','match_min_player_pct');
  IF v_kalan > 0 THEN RAISE EXCEPTION 'DOGRULAMA: % olu ayar silinemedi.', v_kalan; END IF;

  SELECT count(*) INTO v_yedek FROM public.silinen_ayarlar;
  IF v_yedek < 8 THEN RAISE EXCEPTION 'DOGRULAMA: kanit kaydi eksik (%).', v_yedek; END IF;

  -- ÇALIŞAN ayar silinmemiş olmalı
  IF NOT EXISTS (SELECT 1 FROM public.app_config WHERE key = 'fairplay_late_cancel_penalty') THEN
    RAISE EXCEPTION 'DOGRULAMA: calisan fairplay_late_cancel_penalty yanlislikla silinmis!';
  END IF;

  RAISE NOTICE 'C paketi: 8 olu ayar silindi, calisan ayar korundu.';
END $$;
