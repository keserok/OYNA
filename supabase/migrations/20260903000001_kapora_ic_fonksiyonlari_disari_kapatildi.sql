-- ════════════════════════════════════════════════════════════════════════════
-- KAPORA/KARAR İÇ FONKSİYONLARI DIŞARIYA KAPATILDI
-- ────────────────────────────────────────────────────────────────────────────
-- NEDEN (2026-09 çapraz analizi):
--   Supabase'de `public` şemasındaki her fonksiyon, `authenticated` rolüne
--   EXECUTE verilmişse `/rest/v1/rpc/<ad>` adresinden İNTERNETE AÇIKTIR.
--   Denetimde şu dört fonksiyonun bu şekilde açık olduğu görüldü:
--
--     process_match_at_deadline  → maçın kaderini belirler: iptal eder,
--       kaporayı serbest bırakır, slot ödemelerini iade eder. Giriş yapmış
--       HERHANGİ bir kullanıcı BAŞKASININ maç kimliğiyle çağırıp o maçı
--       zorla iptal ettirebilirdi. (Kimlik kontrolü YOK — çünkü tasarım gereği
--       yalnız sunucunun zamanlayıcısı çağırsın diye yazılmış.)
--     match_capture_deposit      → kaporayı tahsil eder.
--     match_fill_stats           → kadro sayımı (bilgi sızıntısı).
--     _match_player_counts       → kadro sayımı (bilgi sızıntısı).
--
--   Kaynak taramasında hiçbiri istemciden ÇAĞRILMIYOR:
--     • `process_match_at_deadline` yalnız `auto_process_matches` (cron) ve
--       `auto-cancel-matches` edge function'ı (service_role) tarafından,
--     • `match_capture_deposit` yalnız `match_check_threshold` ve
--       `process_match_at_deadline` içinden,
--     • sayım fonksiyonları yalnız diğer sunucu fonksiyonlarından.
--
--   İçeriden yapılan çağrılar SECURITY DEFINER zinciriyle çalışır: yetki
--   ÇAĞIRANA değil TANIMLAYANA (postgres) bakılarak kontrol edilir. Bu yüzden
--   dışarıya kapatmak hiçbir akışı bozmaz — sadece dışarıdan çağrılamaz olur.
--
-- GERİ ALMA: gerekirse
--   GRANT EXECUTE ON FUNCTION public.<ad>(...) TO authenticated;
-- ════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.process_match_at_deadline(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_capture_deposit(uuid)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_fill_stats(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._match_player_counts(uuid)      FROM PUBLIC, anon, authenticated;

-- Sunucu tarafı çağrıcıları (cron + edge function) açıkta kalmasın.
GRANT EXECUTE ON FUNCTION public.process_match_at_deadline(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_capture_deposit(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.match_fill_stats(uuid)          TO service_role;
GRANT EXECUTE ON FUNCTION public._match_player_counts(uuid)      TO service_role;
