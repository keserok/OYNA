-- ════════════════════════════════════════════════════════════════════════════
-- MAÇ KURMA EKRANI: FİYAT VE İPTAL SAATİ ARTIK SAHADAN OKUNUR
-- ────────────────────────────────────────────────────────────────────────────
-- NEDEN:
--   `20260904000001` sunucudaki gömülü %5'i kaldırıp markup'ı sahanın
--   anlaşmasına bağladı. Ama MAÇ KUR ekranı kişi başı tutarı hâlâ KENDİ
--   içinde `* 1.05` ile tahmin ediyordu. Sahayla %20 anlaşılsaydı oyuncu
--   ekranda %5'li fiyatı görüp yayınla dediğinde sunucu %20'li fiyatı
--   yazacaktı — yani ekrandaki rakam ile gerçek rakam ayrışacaktı.
--
--   Aynı ekran iptal/iade saatlerini de metne gömülü (24/6/50) yazıyordu.
--
-- BU MIGRATION: maç kurulmadan ÖNCE, seçilen sahanın fiyat farkını ve iptal
-- kademesini tek çağrıda veren oyuncuya açık bir okuma noktası ekler.
--
-- GİZLİLİK: komisyon oranı (OYNA'nın saha sahibinden aldığı pay) TİCARİ
-- bilgidir ve BURADAN DÖNMEZ. Yalnız oyuncunun zaten fişte göreceği iki şey
-- döner: fiyata eklenen fark ve iptal saatleri.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pitch_price_preview(p_pitch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a RECORD; t RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO a FROM public._pitch_agreement(p_pitch_id);
  SELECT * INTO t FROM public._pitch_refund_tiers(p_pitch_id);
  RETURN jsonb_build_object(
    -- Fiyat farkı: sabit tutar doluysa yüzde yok sayılır (_markup_tutari ile aynı kural).
    'markup_pct',    COALESCE(a.markup_pct, 0),
    'markup_amount', COALESCE(a.markup_amount, 0),
    -- İptal/iade kademesi (oyuncu ekranlarındaki cümleler bundan kurulur).
    'full_hours',    COALESCE(t.full_hours, 24),
    'half_hours',    COALESCE(t.half_hours, 6),
    'half_pct',      COALESCE(t.half_pct, 50)
  );
END; $function$;

GRANT EXECUTE ON FUNCTION public.pitch_price_preview(uuid) TO authenticated;

COMMENT ON FUNCTION public.pitch_price_preview(uuid) IS
  'Maç kurma ekranı için: sahanın fiyat farkı (markup) + iptal/iade saatleri. '
  'Komisyon oranı BİLEREK dönmez — o ticari bilgidir (bkz. my_pitch_agreement).';
