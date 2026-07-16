-- ════════════════════════════════════════════════════════════════════════════
-- [S1.2 / C6 / S19] ASKIDA ÖDEME SÜPÜRÜCÜSÜ — sunucu zamanlaması (pg_cron+pg_net)
-- ────────────────────────────────────────────────────────────────────────────
-- sweep-stale-payments edge function'ını SAATTE BİR çağırır. Edge, ≥15 dk PENDING
-- kalmış kart ödemelerini iyzico ile mutabık kalarak kapatır/tamamlar.
--
-- GÜVENLİ DOĞAR: cron kurulsa bile 'sweeper_enabled' KAPALI olduğu sürece
-- list_stale_payment_intents BOŞ döner → edge no-op. Açma kararı Admin panelden
-- (app_config → 'sweeper_enabled' = true), canlı kanıt alındıktan sonra verilir.
--
-- ⚠️ ORTAMA ÖZGÜ GUC'ler (auto-cancel-matches ile AYNI, bir kez ayarlanır):
--     ALTER DATABASE postgres SET app.settings.functions_base_url = 'https://<proj>.supabase.co/functions/v1';
--     ALTER DATABASE postgres SET app.settings.webhook_secret     = '<send-push ile aynı secret>';
--   GUC'ler boşsa cron KURULMAZ (net.http_post boş URL'ye POST etmesin) ve NOTICE
--   ile uyarılır — zarar vermez, ama süpürücü çalışmaz.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_base_url text := current_setting('app.settings.functions_base_url', true);
  v_secret   text := current_setting('app.settings.webhook_secret', true);
BEGIN
  IF v_base_url IS NULL OR v_base_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RAISE NOTICE '[S1.2] app.settings.functions_base_url / webhook_secret AYARLANMAMIŞ. sweep_stale_payments cron KURULMADI. GUC''leri ayarlayıp bu bloğu tekrar çalıştırın.';
    RETURN;
  END IF;

  -- İdempotent: varsa mevcut job'ı kaldır (URL/secret güncellenebilsin).
  PERFORM cron.unschedule('sweep_stale_payments')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep_stale_payments');

  -- Her saat başı: sweep-stale-payments edge function'ını çağır.
  PERFORM cron.schedule(
    'sweep_stale_payments',
    '0 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || %L
                   ),
        body    := '{}'::jsonb
      );
      $cron$,
      v_base_url || '/sweep-stale-payments',
      v_secret
    )
  );

  RAISE NOTICE '[S1.2] sweep_stale_payments cron kuruldu (0 * * * *) → %/sweep-stale-payments (sweeper_enabled açılana dek no-op)', v_base_url;
END $$;
