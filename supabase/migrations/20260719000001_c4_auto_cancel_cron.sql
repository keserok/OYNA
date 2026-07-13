-- ════════════════════════════════════════════════════════════════════════════
-- [C4] 90 DAKİKALIK OTOMATİK MAÇ İPTALİ — sunucu zamanlaması (pg_cron + pg_net)
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN (C4): views/Dashboard.tsx içindeki scanAndAutoCancel useEffect'i her
--   Dashboard açan İSTEMCİDE çalışıyordu → aynı maçı iptal etmek için yarış
--   (write storm), mükerrer bildirim ve render osilasyonu. Maç iptali bir SUNUCU
--   sorumluluğudur.
--
-- ÇÖZÜM: İptal taraması artık `auto-cancel-matches` edge function'ında (tek
--   otorite). Bu migration onu pg_cron ile ~5 dakikada bir, pg_net (net.http_post)
--   üzerinden Bearer WEBHOOK_SECRET ile çağırır. Edge function para hareketini
--   yeniden icat etmez; test edilmiş process_match_at_deadline RPC'sini kullanır.
--
-- ⚠️ ORTAMA ÖZGÜ DEĞERLER — UYGULAMADAN ÖNCE DOLDURUN:
--   Aşağıdaki cron, fonksiyon URL'sini ve WEBHOOK_SECRET'i Postgres GUC'lerinden
--   okur (canlıya sır GÖMÜLMESİN diye). Uygulamadan önce projede BİR KEZ ayarlayın
--   (Supabase SQL Editor'da, superuser ile):
--
--     ALTER DATABASE postgres
--       SET app.settings.functions_base_url = 'https://YOUR_PROJECT.supabase.co/functions/v1';
--     ALTER DATABASE postgres
--       SET app.settings.webhook_secret = 'AYNI_WEBHOOK_SECRET_DEGERI';
--
--   (send-push ile AYNI WEBHOOK_SECRET. Alternatif olarak Supabase Vault +
--    vault.decrypted_secrets kullanılabilir; bu proje henüz Vault kullanmıyor.)
--
--   GUC'ler ayarlanmadan cron kurulursa net.http_post boş URL'ye POST eder ve
--   sessizce başarısız olur — zarar vermez, ama iptal ÇALIŞMAZ. Bu yüzden
--   aşağıdaki blok GUC'ler DOLU değilse cron'u KURMAZ ve NOTICE ile uyarır.
-- ════════════════════════════════════════════════════════════════════════════

-- pg_cron / pg_net Supabase'de mevcuttur; idempotent ve güvenli oluştur.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_base_url text := current_setting('app.settings.functions_base_url', true);
  v_secret   text := current_setting('app.settings.webhook_secret', true);
BEGIN
  -- GUC'ler dolu değilse: cron'u KURMA, insan için net bir uyarı bırak.
  IF v_base_url IS NULL OR v_base_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RAISE NOTICE '[C4] app.settings.functions_base_url / app.settings.webhook_secret AYARLANMAMIŞ. auto_cancel_matches cron KURULMADI. Yukarıdaki ALTER DATABASE komutlarını çalıştırıp bu migration bloğunu (veya sadece cron.schedule kısmını) tekrar çalıştırın.';
    RETURN;
  END IF;

  -- İdempotent: varsa önce mevcut job'ı kaldır (URL/secret güncellenebilsin).
  PERFORM cron.unschedule('auto_cancel_matches')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_cancel_matches');

  -- Her 5 dakikada bir: auto-cancel-matches edge function'ını çağır.
  -- net.http_post asenkron çalışır; cron sadece isteği kuyruğa alır.
  PERFORM cron.schedule(
    'auto_cancel_matches',
    '*/5 * * * *',
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
      v_base_url || '/auto-cancel-matches',
      v_secret
    )
  );

  RAISE NOTICE '[C4] auto_cancel_matches cron kuruldu (*/5 * * * *) → %/auto-cancel-matches', v_base_url;
END $$;
