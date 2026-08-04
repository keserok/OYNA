-- ════════════════════════════════════════════════════════════════════════════
-- [P-0 / M-P0-2] ASKIDA ÖDEME SÜPÜRÜCÜSÜ — zamanlama, Vault tabanlı
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN (3 Ağustos 2026, canlıda ölçüldü):
--   cron.job'da 13 iş var, süpürücü YOK. Yani yarıda kalan hiçbir ödeme
--   toplanmıyor: para bankada bloke kalıyor, slot boş kalıyor, kullanıcı
--   ne parasını görüyor ne yerini.
--
-- ÖNEMLİ — ÖNCEKİ BULGUNUN DÜZELTİLMESİ:
--   Mimar raporunda önce "süpürücü hiç kurulmamış" denmişti. YANLIŞTI.
--   supabase/functions/sweep-stale-payments/index.ts (237 satır) TAM YAZILMIŞ
--   ve kurucunun K-10.4 kararının birebir kendisini uyguluyor:
--     çekilmiş  → apply_card_payment ile tamamla
--     çekilmemiş→ mark_intent_failed
--     belirsiz  → DOKUNMA (kör FAILED yasak)
--
--   Kurulmamasının tek sebebi: 20260726000001001 numaralı eski zamanlama
--   dosyası `app.settings.functions_base_url` / `app.settings.webhook_secret`
--   GUC'lerinin dolu olmasını şart koşuyordu. İkisi de boştu. Dosya bunu
--   fark etti, RAISE NOTICE ile uyardı, cron'u kurmadı ve BAŞARILI tamamlandı.
--   Uyarıyı kimse görmedi. → K-8'deki "sessizce yanlış davranan kural"ın
--   canlıdaki en pahalı örneği.
--
--   Ayrıca o GUC deseni ARTIK KURULAMAZ: Supabase postgres rolüne
--   ALTER DATABASE SET izni vermiyor (ERROR 42501). Bu dosya aynı işi
--   Vault + app_config ile yapar.
--
-- GÜVENLİ DOĞAR (eski dosyanın felsefesi korundu):
--   Cron kurulsa bile `sweeper_enabled` KAPALI iken
--   list_stale_payment_intents BOŞ döner → edge no-op. Açma kararı ayrıdır
--   ve kurucunun AYRI onayını gerektirir (P-0 adım 4).
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_base_url text;
  v_secret   text;
BEGIN
  SELECT value #>> '{}' INTO v_base_url
  FROM public.app_config WHERE key = 'functions_base_url';

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'webhook_secret' LIMIT 1;

  -- ── SESSİZ VAZGEÇME YOK ────────────────────────────────────────────────
  -- Eski dosya burada NOTICE basıp sessizce devam ediyordu; ay boyunca
  -- kimse fark etmedi. Bu sefer EXCEPTION fırlatıyoruz: migration'ın
  -- kendisi BAŞARISIZ olsun ki "uygulandı ama işini yapmadı" durumu
  -- bir daha oluşamasın.
  IF v_base_url IS NULL OR v_base_url = '' THEN
    RAISE EXCEPTION '[AYAR-EKSIK] app_config.functions_base_url boş — süpürücü cron KURULAMAZ. Önce 20260803210000 migration çalıştırılmalı.';
  END IF;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION '[AYAR-EKSIK] vault.secrets içinde "webhook_secret" YOK — süpürücü cron KURULAMAZ. Supabase panosundan Vault''a eklenmeli.';
  END IF;

  -- İdempotent: varsa eski işi kaldır (adres/parola güncellenebilsin)
  PERFORM cron.unschedule('sweep_stale_payments')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep_stale_payments');

  PERFORM cron.schedule(
    'sweep_stale_payments',
    '0 * * * *',                                   -- saat başı
    format(
      $cron$
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || (
                       SELECT decrypted_secret FROM vault.decrypted_secrets
                       WHERE name = 'webhook_secret' LIMIT 1
                     )
                   ),
        body    := '{}'::jsonb
      );
      $cron$,
      v_base_url || '/sweep-stale-payments'
    )
  );

  RAISE NOTICE '[P-0] sweep_stale_payments cron KURULDU (0 * * * *). sweeper_enabled açılana dek no-op çalışır.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Not: parola cron komutunun İÇİNE gömülmez; her çalıştırmada Vault'tan
-- okunur. Böylece cron.job tablosunu okuyabilen biri parolayı GÖREMEZ.
--
-- GERİ ALMA:
--   SELECT cron.unschedule('sweep_stale_payments');
--   -- ya da anında durdurmak için (cron kalır, iş yapmaz):
--   UPDATE public.app_config SET value='false'::jsonb WHERE key='sweeper_enabled';
-- ════════════════════════════════════════════════════════════════════════════
