-- ============================================================================
-- FAZ 12 — Bildirim go-live altyapısı (SİMÜLASYON-uyumlu)
-- ----------------------------------------------------------------------------
-- 1) GERÇEK BUG: admin_broadcast_notification segment CASE'i GOALKEEPER/REFEREE
--    tanımıyordu → ELSE true dalına düşüp "sadece kalecilere" denileni HERKESE
--    gönderiyordu. CASE preview ile hizalandı; ELSE artık false (bilinmeyen
--    segment = kimseye gitmez).
-- 2) broadcast_campaigns: gönderilen her kampanyanın yapılandırılmış geçmişi
--    (kim, segment, alıcı sayısı, simülasyon mu). Şeffaflık + raporlama.
-- 3) app_config BILDIRIM anahtarları: push_live_enabled (tek master simülasyon
--    anahtarı), sessiz saat, kullanıcı başına saatlik limit, günlük broadcast limiti.
--    Bu anahtarlar send-push edge fonksiyonunda + bu RPC'de GERÇEKTEN okunur
--    (ölü config değil).
-- 4) Şablon editörü RPC'leri: admin metinleri koddan bağımsız düzenler.
-- ============================================================================

-- ─── 1) Kampanya geçmiş tablosu ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.broadcast_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      uuid,
  segment         text NOT NULL,
  type_key        text,
  template_id     uuid,
  title           text NOT NULL,
  body            text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'SENT',
  is_simulation   boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_created ON public.broadcast_campaigns(created_at DESC);

ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS broadcast_campaigns_admin_read ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_admin_read ON public.broadcast_campaigns
  FOR SELECT TO authenticated USING (public.is_platform_admin());
GRANT SELECT ON public.broadcast_campaigns TO authenticated;

-- ─── 2) BILDIRIM config anahtarları (idempotent; admin değiştirmişse dokunma) ─
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('push_live_enabled', 'false'::jsonb, 'boolean', 'BILDIRIM',
   'Gerçek Push Bildirimi Aktif',
   'KAPALI iken bildirimler yalnız uygulama içinde görünür, telefona push GİTMEZ (simülasyon). Lansmanda APNs/FCM anahtarları hazır olunca AÇ.',
   false, NULL, NULL),
  ('silent_hours_start', '23'::jsonb, 'number', 'BILDIRIM',
   'Sessiz Saat Başlangıcı',
   'Bu saatten sonra zorunlu olmayan push bildirimleri ertelenir (Europe/Istanbul, 0-23).',
   false, 0, 23),
  ('silent_hours_end', '9'::jsonb, 'number', 'BILDIRIM',
   'Sessiz Saat Bitişi',
   'Bu saate kadar zorunlu olmayan push bildirimleri ertelenir (Europe/Istanbul, 0-23).',
   false, 0, 23),
  ('rate_limit_per_user_per_hour', '6'::jsonb, 'number', 'BILDIRIM',
   'Kullanıcı Başına Saatlik Push Limiti',
   'Bir kullanıcıya 1 saatte gönderilebilecek en fazla zorunlu-olmayan push sayısı (spam koruması).',
   false, 1, 100),
  ('broadcast_max_per_day', '20'::jsonb, 'number', 'BILDIRIM',
   'Günlük Toplu Gönderim Limiti',
   'Aynı gün gönderilebilecek en fazla toplu bildirim (broadcast) sayısı — kazara tekrar gönderime karşı koruma.',
   false, 1, 100)
ON CONFLICT (key) DO NOTHING;

-- ─── 3) Segment bug düzeltmesi + kampanya kaydı (imza DEĞİŞMEDİ) ─────────────
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_title text, p_body text, p_segment text DEFAULT 'ALL'::text, p_type text DEFAULT 'ADMIN_BROADCAST'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count       int := 0;
  v_daily_limit int;
  v_today_count int;
  v_sim         boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- Günlük toplu gönderim limiti (kazara tekrar gönderim koruması)
  v_daily_limit := public.get_config_number('broadcast_max_per_day', 20)::int;
  SELECT COUNT(*) INTO v_today_count FROM public.broadcast_campaigns
    WHERE created_at >= date_trunc('day', now()) AND status = 'SENT';
  IF v_today_count >= v_daily_limit THEN
    RAISE EXCEPTION 'BROADCAST_DAILY_LIMIT: Bugünkü toplu gönderim limitine (%) ulaşıldı. Sistem Parametreleri''nden artırabilirsiniz.', v_daily_limit;
  END IF;

  INSERT INTO notifications (user_id, title, body, type_key)
  SELECT p.id, p_title, p_body, p_type FROM profiles p
  WHERE CASE p_segment
          WHEN 'ALL'        THEN true
          WHEN 'PRO'        THEN p.is_pro = true
          WHEN 'CAPTAIN'    THEN p.role = 'CAPTAIN'    OR COALESCE(p.roles, '[]'::jsonb) ? 'CAPTAIN'
          WHEN 'OWNER'      THEN p.role = 'OWNER'      OR COALESCE(p.roles, '[]'::jsonb) ? 'OWNER'
          WHEN 'GOALKEEPER' THEN p.role = 'GOALKEEPER' OR COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER'
          WHEN 'REFEREE'    THEN p.role = 'REFEREE'    OR COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE'
          WHEN 'NEW_USERS'  THEN p.created_at >= NOW() - INTERVAL '30 days'
          ELSE false  -- bilinmeyen segment kimseye gitmesin (yanlış "herkese gönder" felaketini önle)
        END;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  v_sim := NOT public.get_config_bool('push_live_enabled', false);
  INSERT INTO public.broadcast_campaigns (created_by, segment, type_key, title, body, recipient_count, status, is_simulation)
  VALUES (auth.uid(), p_segment, p_type, p_title, p_body, v_count, 'SENT', v_sim);

  PERFORM log_admin_action('BROADCAST', 'system', NULL, p_segment, NULL,
    jsonb_build_object('title', p_title, 'recipients', v_count, 'simulation', v_sim));
  RETURN v_count;
END; $function$;

-- segment preview ELSE'ini de false yap (bilinmeyen segment → 0; tutarlılık)
CREATE OR REPLACE FUNCTION public.admin_segment_preview(p_segment text DEFAULT 'ALL'::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN jsonb_build_object('count', (
    SELECT COUNT(*)::int FROM profiles p WHERE CASE p_segment
      WHEN 'ALL'        THEN true
      WHEN 'PRO'        THEN p.is_pro = true
      WHEN 'CAPTAIN'    THEN p.role = 'CAPTAIN'    OR COALESCE(p.roles, '[]'::jsonb) ? 'CAPTAIN'
      WHEN 'OWNER'      THEN p.role = 'OWNER'      OR COALESCE(p.roles, '[]'::jsonb) ? 'OWNER'
      WHEN 'NEW_USERS'  THEN p.created_at >= NOW() - INTERVAL '30 days'
      WHEN 'GOALKEEPER' THEN p.role = 'GOALKEEPER' OR COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER'
      WHEN 'REFEREE'    THEN p.role = 'REFEREE'    OR COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE'
      ELSE false END));
END; $function$;

-- ─── 4) Kampanya geçmişi getir ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_fetch_broadcast_campaigns(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, created_by_name text, segment text, type_key text, title text,
               body text, recipient_count integer, status text, is_simulation boolean, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
    SELECT bc.id, COALESCE(pr.full_name, pr.email, '—') AS created_by_name,
           bc.segment, bc.type_key, bc.title, bc.body, bc.recipient_count,
           bc.status, bc.is_simulation, bc.created_at
    FROM public.broadcast_campaigns bc
    LEFT JOIN public.profiles pr ON pr.id = bc.created_by
    ORDER BY bc.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 200));
END; $function$;

-- ─── 5) Şablon editörü: listele + metin güncelle ────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_fetch_notification_templates()
 RETURNS TABLE(id uuid, type_key text, label_tr text, title_tr text, body_tr text,
               title_en text, body_en text, category text, is_mandatory boolean,
               can_user_disable boolean, sound text, sort_order integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
    SELECT t.id, t.type_key, t.label_tr, t.title_tr, t.body_tr, t.title_en, t.body_en,
           t.category, t.is_mandatory, t.can_user_disable, t.sound, t.sort_order
    FROM public.notification_templates t
    ORDER BY t.category NULLS LAST, t.sort_order, t.label_tr;
END; $function$;

-- Yalnız METİN alanları düzenlenebilir (type_key/category/is_mandatory KİLİTLİ —
-- davranışı yanlışlıkla bozmamak için). Founder kelimeleri değiştirir, davranışı değil.
CREATE OR REPLACE FUNCTION public.admin_update_notification_template(
  p_id uuid, p_label_tr text, p_title_tr text, p_body_tr text,
  p_title_en text DEFAULT NULL, p_body_en text DEFAULT NULL)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_key text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF COALESCE(btrim(p_title_tr),'') = '' OR COALESCE(btrim(p_body_tr),'') = '' THEN
    RAISE EXCEPTION 'Başlık ve içerik (TR) boş olamaz.';
  END IF;
  UPDATE public.notification_templates
     SET label_tr = COALESCE(NULLIF(btrim(p_label_tr),''), label_tr),
         title_tr = p_title_tr, body_tr = p_body_tr,
         title_en = p_title_en, body_en = p_body_en,
         updated_at = now()
   WHERE id = p_id
   RETURNING type_key INTO v_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Şablon bulunamadı'; END IF;
  PERFORM public.log_admin_action('NOTIFY_TEMPLATE_UPDATE', 'notification_template', p_id, v_key, NULL, NULL);
  RETURN TRUE;
END; $function$;

REVOKE ALL ON FUNCTION public.admin_fetch_broadcast_campaigns(integer)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_fetch_notification_templates()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_notification_template(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fetch_broadcast_campaigns(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_notification_templates()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_notification_template(uuid, text, text, text, text, text) TO authenticated;
