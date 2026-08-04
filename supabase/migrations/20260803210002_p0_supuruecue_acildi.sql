-- ════════════════════════════════════════════════════════════════════════════
-- [P-0 / M-P0-2] SÜPÜRÜCÜ AÇILDI
-- ────────────────────────────────────────────────────────────────────────────
-- Kurucu onayıyla (3 Ağustos 2026) `sweeper_enabled` açıldı.
--
-- AÇMADAN ÖNCE DOĞRULANANLAR (canlıda, sırayla):
--   1. Uç nokta yetkiyi kabul ediyor        → HTTP 200
--   2. Kapalıyken çalıştırıldı              → {"candidates":0,...} (no-op)
--   3. Kapsam kontrolü: list_stale_payment_intents() AÇIKKEN de 0 satır
--      döndürüyor. Canlıdaki tek askıda kayıt (BLOCKED + WALLET, demo)
--      süpürücünün filtresi dışında: fonksiyon yalnız
--      `status='PENDING' AND provider='IYZICO'` kayıtlara bakıyor.
--   4. Açıldıktan sonra tekrar çalıştırıldı → yine 0 aday, para hareketi YOK
--
-- DAVRANIŞ (K-10.4 kurucu kararı — "alınmadıysa alınmasın, alındıysa alınsın"):
--   çekilmiş   → apply_card_payment ile tamamlanır
--   çekilmemiş → mark_intent_failed
--   belirsiz   → DOKUNULMAZ (kör FAILED yasak)
--
-- ANINDA DURDURMA:
--   UPDATE public.app_config SET value='false'::jsonb WHERE key='sweeper_enabled';
--   Bu tek satır süpürücüyü anında etkisiz hale getirir; cron dönmeye devam
--   eder ama list_stale_payment_intents boş döndüğü için hiçbir şey yapmaz.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE public.app_config
SET value = 'true'::jsonb, updated_at = now()
WHERE key = 'sweeper_enabled' AND value <> 'true'::jsonb;
