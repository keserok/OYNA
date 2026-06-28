-- ============================================================================
-- FAZ 7 — KONTROL MERKEZİ TEMELİ (Control Plane Foundation)
-- ----------------------------------------------------------------------------
-- AMAÇ: OYNA'yı YAZILIMCI OLMADAN panelden yönetilebilir kılmak.
--   1) settings tablosunu resmi/sağlam şemaya kavuşturur            (Soru 1)
--   2) app_config: koda gömülü kuralları panelden ayarlanabilir yapar (Soru 4/87)
--   3) feature_flags: modülleri deploy'suz aç/kapa                  (Soru 98; 8/43/47)
--   + admin korumalı, AUDIT'li set RPC'leri ve okuma yardımcıları   (Soru 11/80)
--
-- GÜVENLİK: Tüm değişiklikler EKLEMELİ ve IDEMPOTENT — mevcut veriyi/şemayı
-- bozmaz. DROP COLUMN / DROP TABLE yoktur. Var olan kurulumda kayıp kolonları
-- tamamlar; temiz kurulumda (PITR/yeniden kurulum) sıfırdan oluşturur.
-- ============================================================================

-- ─── 1) settings tablosu — resmi şema (Soru 1) ──────────────────────────────
-- Tablo migration'larda hiç CREATE edilmemişti ("hayalet tablo"). Burada
-- idempotent biçimde resmileştiriyoruz; mevcut camelCase kolon adları korunur
-- (admin_update_settings RPC uyumu bozulmasın).
CREATE TABLE IF NOT EXISTS public.settings (
  id text PRIMARY KEY DEFAULT 'main',
  CONSTRAINT settings_singleton CHECK (id = 'main')
);

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "appName"                text    DEFAULT 'OYNA';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "maintenanceMode"        boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "registrationOpen"       boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "proPrice"               numeric DEFAULT 0;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "commissionRate"         numeric DEFAULT 10;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "minRatingToPlay"        numeric DEFAULT 0;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "maxMatchsPerDay"        integer DEFAULT 0;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "featuredPitchId"        text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "showAnnouncementBanner" boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "announcementBanner"     text    DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "payoutMode"             text    DEFAULT 'AUTO';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at               timestamptz DEFAULT now();

-- Singleton satırı garanti et (yoksa oluştur, varsa dokunma)
INSERT INTO public.settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- RLS aç (idempotent) ve admin tam yetki politikası ekle. Mevcut okuma
-- politikaları KORUNUR; bu yalnızca admin yazımını garanti eden EK politikadır.
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settings_admin_all ON public.settings;
CREATE POLICY settings_admin_all ON public.settings
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── 2) app_config — panelden ayarlanabilir operasyonel kurallar (Soru 4/87) ─
-- Bugüne kadar koda gömülü olan kuralları (maç onay süresi, min oyuncu %,
-- fair-play eşikleri, vb.) tek, tipli ve panelden düzenlenebilir bir yere alır.
CREATE TABLE IF NOT EXISTS public.app_config (
  key         text PRIMARY KEY,
  value       jsonb   NOT NULL,
  value_type  text    NOT NULL DEFAULT 'number' CHECK (value_type IN ('number','boolean','text','json')),
  category    text    NOT NULL DEFAULT 'GENEL',
  label       text    NOT NULL,
  description text,
  is_public   boolean NOT NULL DEFAULT true,   -- uygulama (anon/auth) okuyabilir mi
  min_value   numeric,                          -- sayısal değerler için alt sınır
  max_value   numeric,                          -- sayısal değerler için üst sınır
  updated_by  uuid REFERENCES public.profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_config_admin_all ON public.app_config;
CREATE POLICY app_config_admin_all ON public.app_config
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS app_config_public_read ON public.app_config;
CREATE POLICY app_config_public_read ON public.app_config
  FOR SELECT USING (is_public);

-- Varsayılanlar master prensiplerden (yalnız yoksa eklenir; mevcut değeri ezmez)
INSERT INTO public.app_config (key, value, value_type, category, label, description, min_value, max_value) VALUES
  ('match_confirm_window_hours',       '8',    'number', 'MAC',        'Maç onay penceresi (saat)',      'Maç başlamadan kaç saat önce kadro kesinleşir ve ödeme tahsil edilir.', 1, 72),
  ('match_min_player_pct',             '70',   'number', 'MAC',        'Minimum oyuncu yüzdesi (%)',     'Maçın onaylanması için kadronun en az yüzde kaçı dolmalı.', 10, 100),
  ('fairplay_warn_threshold',          '80',   'number', 'FAIRPLAY',   'Fair-play uyarı eşiği',          'Bu puanın altında kullanıcıya uyarı gösterilir.', 0, 100),
  ('fairplay_restrict_threshold',      '60',   'number', 'FAIRPLAY',   'Fair-play kısıt eşiği',          'Bu puanın altında bazı maçlara katılım kısıtlanır.', 0, 100),
  ('fairplay_ban_threshold',           '40',   'number', 'FAIRPLAY',   'Fair-play ban eşiği',            'Bu puanın altında geçici ban uygulanır.', 0, 100),
  ('fairplay_noshow_penalty',          '20',   'number', 'FAIRPLAY',   'Maça gelmeme (no-show) cezası',  'No-show durumunda güvenilirlik puanından düşülen miktar.', 0, 100),
  ('fairplay_late_cancel_penalty',     '10',   'number', 'FAIRPLAY',   'Geç iptal cezası',               '24 saatten geç iptalde düşülen puan.', 0, 100),
  ('fairplay_bad_review_penalty',      '5',    'number', 'FAIRPLAY',   'Kötü değerlendirme cezası',      'Kötü değerlendirmede düşülen puan.', 0, 100),
  ('fairplay_good_match_bonus',        '2',    'number', 'FAIRPLAY',   'Sorunsuz maç ödülü',             'Sorunsuz tamamlanan maçta eklenen puan.', 0, 100),
  ('account_deletion_wait_days',       '7',    'number', 'HESAP',      'Hesap silme bekleme süresi (gün)','Silme talebinden kaç gün sonra hesap kalıcı silinir.', 1, 90),
  ('app_booking_auto_approve_minutes', '15',   'number', 'REZERVASYON','Otomatik onay süresi (dk)',      'Saha sahibi yanıt vermezse kaç dk sonra rezervasyon otomatik onaylanır (0 = anında).', 0, 1440),
  ('direct_booking_deposit_default_pct','30',  'number', 'REZERVASYON','Varsayılan kapora oranı (%)',    'Tarifede kapora yoksa uygulanan varsayılan kapora yüzdesi.', 0, 100),
  ('demo_mode_enabled',                'false','boolean','SISTEM',     'Demo veri üretimi açık',         'Açıksa demo/test verisi üretilebilir. CANLI ortamda KAPALI olmalı.', NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- Okuma yardımcıları — RPC'ler ve uygulama bu fonksiyonlarla kuralları okur.
CREATE OR REPLACE FUNCTION public.get_config(p_key text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT value FROM public.app_config WHERE key = p_key;
$$;

CREATE OR REPLACE FUNCTION public.get_config_number(p_key text, p_default numeric DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::numeric FROM public.app_config WHERE key = p_key), p_default);
$$;

CREATE OR REPLACE FUNCTION public.get_config_bool(p_key text, p_default boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::boolean FROM public.app_config WHERE key = p_key), p_default);
$$;

-- Admin yazma — sınır kontrolü + AUDIT'li.
CREATE OR REPLACE FUNCTION public.admin_set_config(p_key text, p_value jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old jsonb; v_min numeric; v_max numeric; v_type text; v_num numeric;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT value, min_value, max_value, value_type
    INTO v_old, v_min, v_max, v_type
  FROM public.app_config WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONFIG_NOT_FOUND: %', p_key; END IF;

  IF v_type = 'number' THEN
    v_num := (p_value #>> '{}')::numeric;
    IF v_min IS NOT NULL AND v_num < v_min THEN RAISE EXCEPTION 'VALUE_TOO_LOW: % (min %)', v_num, v_min; END IF;
    IF v_max IS NOT NULL AND v_num > v_max THEN RAISE EXCEPTION 'VALUE_TOO_HIGH: % (max %)', v_num, v_max; END IF;
  END IF;

  UPDATE public.app_config
     SET value = p_value, updated_by = auth.uid(), updated_at = now()
   WHERE key = p_key;

  PERFORM public.log_admin_action('CONFIG_UPDATE', 'system', NULL, p_key, v_old, p_value);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_config()
RETURNS SETOF public.app_config LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY SELECT * FROM public.app_config ORDER BY category, key;
END;
$$;

-- ─── 3) feature_flags — modülleri deploy'suz aç/kapa (Soru 98; 8/43/47) ──────
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  label       text    NOT NULL,
  description text,
  category    text    NOT NULL DEFAULT 'GENEL',
  updated_by  uuid REFERENCES public.profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feature_flags_admin_all ON public.feature_flags;
CREATE POLICY feature_flags_admin_all ON public.feature_flags
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS feature_flags_public_read ON public.feature_flags;
CREATE POLICY feature_flags_public_read ON public.feature_flags
  FOR SELECT USING (true);

-- Lansman kapsamı dışı modüller varsayılan KAPALI (master: silinecek/gizlenecek)
INSERT INTO public.feature_flags (key, enabled, label, description, category) VALUES
  ('module_community',     false, 'Topluluklar modülü',    'Lansman kapsamı dışı. Kapalı tutulması önerilir.', 'KAPSAM'),
  ('module_tournaments',   false, 'Turnuvalar modülü',     'Lansman kapsamı dışı.',                            'KAPSAM'),
  ('module_promo_codes',   false, 'İndirim kodları modülü','Lansman kapsamı dışı.',                            'KAPSAM'),
  ('module_loyalty',       false, 'Sadakat/puan modülü',   'Lansman kapsamı dışı.',                            'KAPSAM'),
  ('broadcast_scheduling', false, 'Bildirim zamanlama',    'İleri tarihli bildirim gönderimi (yakında).',      'BILDIRIM')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = p_key), false);
$$;

CREATE OR REPLACE FUNCTION public.admin_set_feature_flag(p_key text, p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_old boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT enabled INTO v_old FROM public.feature_flags WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'FLAG_NOT_FOUND: %', p_key; END IF;
  UPDATE public.feature_flags
     SET enabled = p_enabled, updated_by = auth.uid(), updated_at = now()
   WHERE key = p_key;
  PERFORM public.log_admin_action('FEATURE_FLAG_UPDATE', 'system', NULL, p_key, to_jsonb(v_old), to_jsonb(p_enabled));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_feature_flags()
RETURNS SETOF public.feature_flags LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY SELECT * FROM public.feature_flags ORDER BY category, key;
END;
$$;

-- ─── 4) Yetkiler (en az ayrıcalık) ──────────────────────────────────────────
-- Tablolar: yalnız okuma (yazma SECURITY DEFINER RPC'lerden). RLS yine geçerli.
GRANT SELECT ON public.app_config    TO anon, authenticated;
GRANT SELECT ON public.feature_flags TO anon, authenticated;

-- Okuma yardımcıları herkese (uygulama kuralları okur)
REVOKE ALL ON FUNCTION public.get_config(text)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_config_number(text, numeric)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_config_bool(text, boolean)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_feature_enabled(text)          FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_config(text)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_config_number(text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_config_bool(text, boolean)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(text)         TO anon, authenticated;

-- Admin RPC'leri: yalnız authenticated (içeride is_platform_admin guard'ı var)
REVOKE ALL ON FUNCTION public.admin_set_config(text, jsonb)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_feature_flag(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_fetch_config()                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_fetch_feature_flags()          FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_config(text, jsonb)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_config()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_feature_flags()          TO authenticated;

-- ============================================================================
-- SON. Bu migration uygulandığında: settings sağlam şemaya kavuşur; app_config
-- ve feature_flags panelden (admin RPC'leriyle, AUDIT'li) yönetilebilir hale
-- gelir. Sonraki adımlar: (a) admin panelinde "Sistem Parametreleri" ekranı,
-- (b) maç/rezervasyon RPC'lerinin bu kuralları get_config ile okuması.
-- ============================================================================
