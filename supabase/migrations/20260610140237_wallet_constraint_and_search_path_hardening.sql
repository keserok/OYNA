-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- DÜZELTME 5a: Cüzdan bakiyesi asla eksiye düşemez (kasa sigortası)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_wallet_balance_non_negative CHECK (wallet_balance >= 0);

-- DÜZELTME 5b: search_path sabitlenmemiş tüm SECURITY DEFINER fonksiyonları güvene al
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_pitch_booking',
        'submit_match_score',
        'update_booking_paid_amount',
        'get_current_tariff_price',
        'cleanup_expired_holds',
        'get_or_create_match_score_token'
      )
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
  END LOOP;
END $$;
