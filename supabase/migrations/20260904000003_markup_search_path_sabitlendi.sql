-- ════════════════════════════════════════════════════════════════════════════
-- `_markup_tutari` fonksiyonuna sabit arama yolu (search_path)
-- ────────────────────────────────────────────────────────────────────────────
-- NEDEN: Supabase güvenlik denetimi (`function_search_path_mutable`) bu
-- fonksiyonu işaretledi. Fonksiyon saf hesap yapar, hiçbir tabloya bakmaz —
-- yani bugün somut bir açık YOK. Ama depodaki diğer TÜM fonksiyonlarda arama
-- yolu sabitlenmiş durumda; tek istisna bırakmak, ileride bu fonksiyona bir
-- tablo/işleç eklendiğinde sessiz bir risk kapısı açar.
--
-- `pg_catalog` yeterli: fonksiyon yalnızca yerleşik `round`/`coalesce` kullanır.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._markup_tutari(
  p_taban numeric, p_markup_pct numeric, p_markup_amount numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN COALESCE(p_markup_amount, 0) > 0 THEN round(p_markup_amount, 2)
    ELSE round(COALESCE(p_taban, 0) * COALESCE(p_markup_pct, 0) / 100.0, 2)
  END;
$function$;
