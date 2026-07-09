-- ════════════════════════════════════════════════════════════════════════════
-- [TRIGGER-TODO ✔] Sunucu tarafı EŞİK tetikleyicisi
-- ────────────────────────────────────────────────────────────────────────────
-- Amaç: kadro (slots/"awaySlots") her değiştiğinde eşik kontrolünü İSTEMCİYE
--   BAĞIMLI OLMADAN sunucuda otomatik çalıştır. Böylece bir oyuncu katıldığında
--   (nereden gelirse gelsin: uygulama, admin, RPC) maç eşiğe ulaşınca kendisi
--   LIVE olur ve kapora TAHSİL (capture) edilir — istemci match_check_threshold
--   çağrısını unutsa/atlasa bile tutarlılık korunur.
--
--   Tasarım notları:
--   • Sadece kadro kolonları hedeflendiğinde tetiklenir (AFTER UPDATE OF slots,
--     "awaySlots") → status/deposit_status güncelleyen alt çağrılar bu tetikleyiciyi
--     TEKRAR ateşlemez (özyineleme yok; match_check_threshold slots'a dokunmaz).
--   • Yalnız kaporası BLOKE, ACTIVE maçlar eşik kontrolüne girer → escrow dışı
--     normal maçların yaşam döngüsü DEĞİŞMEZ (dar etki alanı).
--   • Bu migration 20260716000001_escrow_match_lifecycle.sql'den SONRA sıralanır;
--     match_check_threshold o dosyada tanımlıdır.
--
--   ⚠️ Bu tetikleyici SIMULATION modunda güvenlidir; capture içindeki gerçek iyzico
--     provizyon-kapatma [IYZICO-TODO] hâlâ edge function'da bağlanmalıdır (bkz.
--     docs/ESCROW_MATCH_LIFECYCLE.md).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._trg_match_threshold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  -- Yalnız escrow kaporası BLOKE olan aktif maçlar otomatik eşik kontrolüne girer.
  -- match_check_threshold kendi içinde de guard'lıdır (idempotent): LIVE ise no-op.
  IF NEW.status = 'ACTIVE' AND NEW.deposit_status = 'BLOCKED' THEN
    PERFORM public.match_check_threshold(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public._trg_match_threshold() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_match_threshold ON public.matches;
CREATE TRIGGER trg_match_threshold
  AFTER UPDATE OF slots, "awaySlots" ON public.matches
  FOR EACH ROW
  WHEN (NEW.slots IS DISTINCT FROM OLD.slots OR NEW."awaySlots" IS DISTINCT FROM OLD."awaySlots")
  EXECUTE FUNCTION public._trg_match_threshold();

COMMENT ON FUNCTION public._trg_match_threshold() IS
  'AFTER UPDATE OF slots/"awaySlots" tetikleyicisi: kaporası BLOKE aktif maçları '
  'eşik dolunca otomatik LIVE + capture yapar (sunucu tarafı, istemciden bağımsız).';
