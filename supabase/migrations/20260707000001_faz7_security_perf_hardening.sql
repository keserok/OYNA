-- ==============================================================================
-- FAZ 7 — Güvenlik & Performans Sıkılaştırma (7.1 + 7.4 · kod-tarafı kazanımlar)
-- ------------------------------------------------------------------------------
-- 7.2 düzeltme: notifications realtime publication'da değildi → in-app canlı bildirim
-- 7.1 güvenlik: trigger fonksiyonları doğrudan REST/RPC çağrısına açıktı → kapat
-- 7.4 performans: advisor unindexed_foreign_keys → eksik FK index'leri
-- ==============================================================================

-- ── 7.2: notifications realtime yayını (bildirim merkezi canlı güncellensin) ──
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

-- ── 7.1: trigger fonksiyonlarını doğrudan REST/RPC çağrısına kapat ────────────
-- (Trigger mekanizması EXECUTE yetkisinden bağımsız çalışır; bu REVOKE yalnız
--  /rest/v1/rpc ile doğrudan çağrıyı engeller — anon'un para-tetikleyici
--  fonksiyonu çağırması advisor uyarısını giderir.)
REVOKE ALL ON FUNCTION public.credit_owner_booking_earning() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pitch_bookings_set_slot_range()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_booking_paid_amount()     FROM PUBLIC, anon, authenticated;

-- ── 7.4: eksik FK index'leri (sorgu/JOIN performansı + advisor temizliği) ─────
CREATE INDEX IF NOT EXISTS idx_messages_sender          ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_matches_gk               ON public.matches(gk_id) WHERE gk_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_requests_intent  ON public.service_requests(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_tactic_comments_user     ON public.tactic_comments(user_id);
