-- ════════════════════════════════════════════════════════════════════════════
-- [P-0 / M-P0-3] BİLDİRİM KÖPRÜSÜ ONARIMI — Vault tabanlı
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN (3 Ağustos 2026, canlıda ölçüldü):
--   net._http_response → 21 satır, 21'i de HTTP 500 "Server misconfigured".
--   Yani sistem AYLARDIR hiç kimseye push bildirimi gönderemiyor ve bunu
--   hiçbir yere yazmıyor.
--
-- ÜÇ KUSUR BİRDEN (send-push/index.ts:53-61 sözleşmesine göre):
--   1) Edge Function'ın WEBHOOK_SECRET ortam değişkeni boştu  → 500
--      (kurucu tarafından panodan girildi)
--   2) notify_send_push_webhook() Authorization başlığı GÖNDERMİYOR → 401
--   3) Gövde row_to_json(NEW) biçiminde; {type,table,record,schema} bekleniyor
--
--   Bu migration 2 ve 3'ü onarır. 1 zaten panodan girildi.
--
-- NEDEN VAULT?
--   Eski desen `current_setting('app.settings.webhook_secret')` idi. Supabase
--   artık postgres rolüne ALTER DATABASE SET izni VERMİYOR:
--     ERROR 42501: permission denied to set parameter
--   Vault (supabase_vault 0.3.1) bu projede kurulu ve postgres rolü
--   vault.decrypted_secrets üzerinde SELECT yetkisine sahip (doğrulandı).
--   Ayrıca Vault değeri ŞİFRELİ saklar — ayar kutusu düz metin saklardı.
--
-- SESSİZLİK KARŞITI TASARIM (K-8 / EK2):
--   Anahtar bulunamazsa fonksiyon SESSİZCE geçmez; RAISE WARNING ile
--   ayırt edilebilir bir etiket basar ve http çağrısı yapmaz.
--   EXCEPTION KULLANILMAZ: bu bir AFTER INSERT tetikleyicisidir; exception
--   bildirim kaydının kendisini geri alır ve uygulamayı bozardı.
--   Eksiklik ayrıca K-AYAR-1 günlük kontrolüyle yakalanır.
--
-- GERİ ALMA: bu dosyanın altındaki "GERİ ALMA" bloğu çalıştırılır.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Fonksiyon adresi ayarı (GİZLİ DEĞİL — istemci paketinde zaten açık) ──
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES (
  'functions_base_url',
  '"https://iikvzgyccvgcybzdfwlv.supabase.co/functions/v1"'::jsonb,
  'text',            -- app_config_value_type_check: number|boolean|text|json
  'SISTEM',
  'Edge Function adresi',
  'Veritabanının Edge Function çağırırken kullandığı taban adres. Gizli değildir. Bölge göçünde MUTLAKA güncellenir.',
  false
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();

-- ── 2) Köprü fonksiyonu — Vault'tan okur, doğru başlık ve gövde gönderir ────
CREATE OR REPLACE FUNCTION public.notify_send_push_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_secret   text;
  v_base_url text;
  v_request_id bigint;
BEGIN
  -- Paylaşılan parola: Vault'tan (şifreli saklanır)
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'webhook_secret'
  LIMIT 1;

  -- Taban adres: app_config'ten (gizli değil)
  SELECT value #>> '{}' INTO v_base_url
  FROM public.app_config
  WHERE key = 'functions_base_url';

  -- ── SESSİZ GEÇME YOK ──────────────────────────────────────────────────
  -- Eksik ayar bildirim kaydını GERİ ALMAZ (exception değil), ama sessiz de
  -- kalmaz: ayırt edilebilir etiketle uyarır. K-AYAR-1 bunu günlük yakalar.
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING '[AYAR-EKSIK] vault.secrets içinde "webhook_secret" YOK — push gönderilemiyor (notification id=%)', NEW.id;
    RETURN NEW;
  END IF;

  IF v_base_url IS NULL OR v_base_url = '' THEN
    RAISE WARNING '[AYAR-EKSIK] app_config içinde "functions_base_url" YOK — push gönderilemiyor (notification id=%)', NEW.id;
    RETURN NEW;
  END IF;

  -- ── Çağrı: send-push/index.ts:53-70 sözleşmesine BİREBİR uygun ──────────
  SELECT net.http_post(
    url     := v_base_url || '/send-push',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  'notifications',
                 'schema', 'public',
                 'record', to_jsonb(NEW)
               )
  ) INTO v_request_id;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.notify_send_push_webhook() IS
  'P-0/M-P0-3: notifications INSERT → send-push köprüsü. Parolayı Vault''tan, adresi app_config''ten okur. Eksik ayarda sessizce geçmez, [AYAR-EKSIK] etiketiyle uyarır.';

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA (bozulursa bu bloğu çalıştır — köprüyü tamamen susturur):
--
--   CREATE OR REPLACE FUNCTION public.notify_send_push_webhook()
--   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
--   SET search_path TO 'public','pg_temp'
--   AS $$ BEGIN RETURN NEW; END; $$;
--
-- Not: eski (bozuk) hâline dönmenin bir anlamı yoktur — o hâl zaten 500 dönüyordu.
-- Sorun çıkarsa köprüyü susturmak, bildirim kaydını bozmadan durdurur.
-- ════════════════════════════════════════════════════════════════════════════
