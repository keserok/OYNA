-- ═══════════════════════════════════════════════════════════════════════════
-- S2 — BİLDİRİM MODLARI (üç mod) · CEO kararı, 4 Ağustos 2026
--
-- SORUN (kanıtlı): Kullanıcı bildirim ayarlarından bir düğmeyi kapatıyor,
--   kaydediliyor, "kapandı" görünüyor — ama bildirim gelmeye devam ediyor.
--   Bildirim üreten 49 fonksiyondan YALNIZ 1'i tercihi soruyordu.
--   Canlı kanıt: 35 kullanıcının 51 anahtarı kapalı; team_member_invite'ı
--   kapatmış bir kullanıcı o bildirimi yine almış.
--
-- ÇÖZÜM: Üç mod + tek bekçi.
--   Mod 1 "ZORUNLU" → yalnız seviye 1 (para · iptal · davet · güvenlik)
--   Mod 2 "ONEMLI"  → seviye 1 + 2 (maç ve kadro hareketleri)
--   Mod 3 "TUMU"    → hepsi (varsayılan, bugünkü davranış)
--
--   Her bildirim türünün seviyesi notification_templates.mod_seviyesi
--   sütununda durur ve YÖNETİCİ PANELİNDEN değiştirilebilir.
--
-- NEDEN TETİKLEYİCİ (bekçi) — 49 fonksiyonu tek tek düzeltmek yerine:
--   49 canlı fonksiyona dokunmak bu projedeki en büyük regresyon riskidir
--   (CLAUDE.md §4). Bekçi tek noktadır ve 49'unu da anında kapsar.
--
-- BEKÇİ ASLA BİR BİLDİRİMİ KAZA İLE ENGELLEMEZ:
--   • herhangi bir hata olursa bildirim GEÇER (EXCEPTION → RETURN NEW)
--   • şablonu olmayan tür GEÇER (bilinmeyen = zorunlu sayılır)
--   • seviye 1 HER modda GEÇER
--   • kullanıcının modu okunamazsa GEÇER
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Şablonlara seviye sütunu ──────────────────────────────────────────
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS mod_seviyesi smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.notification_templates.mod_seviyesi IS
  '1=zorunlu (her modda gider) · 2=önemli (ONEMLI ve TUMU) · 3=isteğe bağlı (yalnız TUMU). Panelden değiştirilir.';

ALTER TABLE public.notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_mod_seviyesi_chk;
ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_mod_seviyesi_chk
  CHECK (mod_seviyesi BETWEEN 1 AND 3);

-- ─── 2) Seviyeleri doldur ─────────────────────────────────────────────────
-- Kural: BUGÜN "kapatılamaz" (is_mandatory) sayılan her tür seviye 1 kalır.
-- Böylece bu göç hiçbir kullanıcı için bugünkü zorunluluk politikasını
-- gevşetmez. Kalanlar işlevine göre 2 (maç/kadro işleyişi) veya
-- 3 (sosyal/kampanya/özet) olur.

UPDATE public.notification_templates SET mod_seviyesi = 1 WHERE is_mandatory IS TRUE;

UPDATE public.notification_templates SET mod_seviyesi = 2 WHERE type_key IN (
  -- maçın kendi işleyişi: kadro doldu/boşaldı, değerlendirme, 24s hatırlatma
  'match_completed_evaluate','match_invite_declined','match_invite_joined',
  'match_last_call','match_reminder_24h','match_kicked','match_slot_assigned',
  'match_slot_vacated','match_spot_opened',
  -- takım işleyişi
  'team_captain_transferred','team_invite_accepted','team_join_approved',
  'team_join_rejected','team_join_request','team_member_invite','team_member_removed',
  -- saha sahibi işleyişi + doğrudan mesaj
  'owner_cancellation','owner_deposit_paid','NEW_MESSAGE'
);

UPDATE public.notification_templates SET mod_seviyesi = 3 WHERE type_key IN (
  'nearby_match','promo_offers','weekly_summary','owner_daily_summary',
  'friend_request','friend_accepted','referral_joined','team_chat_message',
  'match_tactic_assigned','tactic_approved','tactic_proposed','tactic_rejected'
);

-- ─── 3) Kullanıcının modu ─────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_mode text NOT NULL DEFAULT 'TUMU';

COMMENT ON COLUMN public.profiles.notification_mode IS
  'Bildirim modu: TUMU (hepsi, varsayılan) · ONEMLI (seviye 1+2) · ZORUNLU (yalnız seviye 1).';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_notification_mode_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_notification_mode_chk
  CHECK (notification_mode IN ('TUMU','ONEMLI','ZORUNLU'));

-- profiles.UPDATE sütun bazında kısıtlı (33 sütun). Yeni sütun açıkça
-- verilmezse kullanıcı kendi modunu değiştiremez.
GRANT UPDATE (notification_mode) ON public.profiles TO authenticated;

-- ─── 4) Karar fonksiyonu ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bildirim_gonderilsin_mi(
  p_user_id  uuid,
  p_type_key text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_seviye smallint;
  v_mod    text;
BEGIN
  -- Kullanıcı yoksa engelleme (bildirimi kaybetme).
  IF p_user_id IS NULL THEN RETURN true; END IF;

  SELECT mod_seviyesi INTO v_seviye
  FROM public.notification_templates WHERE type_key = p_type_key LIMIT 1;

  -- Şablonu olmayan tür = bilinmeyen = zorunlu say, GEÇİR.
  IF v_seviye IS NULL THEN RETURN true; END IF;
  -- Seviye 1 her modda gider.
  IF v_seviye <= 1 THEN RETURN true; END IF;

  SELECT notification_mode INTO v_mod FROM public.profiles WHERE id = p_user_id;
  IF v_mod IS NULL THEN RETURN true; END IF;

  RETURN CASE v_mod
           WHEN 'TUMU'    THEN true
           WHEN 'ONEMLI'  THEN v_seviye <= 2
           WHEN 'ZORUNLU' THEN false      -- seviye 1 zaten yukarıda döndü
           ELSE true
         END;
EXCEPTION WHEN OTHERS THEN
  -- Hangi hata olursa olsun bildirimi kaybetme.
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.bildirim_gonderilsin_mi(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bildirim_gonderilsin_mi(uuid, text) TO authenticated, service_role;

-- ─── 5) Bekçi tetikleyicisi ───────────────────────────────────────────────
-- Adı 'b' ile başlıyor: aynı zamanlı BEFORE tetikleyiciler alfabetik sırayla
-- çalışır; bu, mevcut trg_demo_isareti'nden ÖNCE çalışsın diye böyle.
CREATE OR REPLACE FUNCTION public.bildirim_modu_bekcisi()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Kaçış kapısı: panelin "test gönder" düğmesi moda takılmamalı. Yönetici
  -- kendi modu ne olursa olsun metnin önizlemesini görebilmeli.
  IF COALESCE(current_setting('oyna.bildirim_bekci_atla', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF public.bildirim_gonderilsin_mi(NEW.user_id, NEW.type_key) THEN
    RETURN NEW;
  END IF;
  RETURN NULL;   -- sessizce yazma; çağıran fonksiyon hata almaz
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;    -- bekçi bozulursa bildirim yine de gitsin
END; $$;

DROP TRIGGER IF EXISTS b_bildirim_modu_bekcisi ON public.notifications;
CREATE TRIGGER b_bildirim_modu_bekcisi
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.bildirim_modu_bekcisi();

-- ─── 6) Kullanıcının kendi modunu okuması/değiştirmesi ────────────────────
CREATE OR REPLACE FUNCTION public.bildirim_modum()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT notification_mode FROM public.profiles WHERE id = auth.uid()), 'TUMU');
$$;

CREATE OR REPLACE FUNCTION public.bildirim_modu_ayarla(p_mod text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Giriş gerekli.'; END IF;
  IF p_mod NOT IN ('TUMU','ONEMLI','ZORUNLU') THEN
    RAISE EXCEPTION 'Geçersiz mod: %', p_mod;
  END IF;
  UPDATE public.profiles SET notification_mode = p_mod WHERE id = auth.uid();
  RETURN p_mod;
END; $$;

REVOKE ALL ON FUNCTION public.bildirim_modum()            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bildirim_modu_ayarla(text)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bildirim_modum()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.bildirim_modu_ayarla(text) TO authenticated;

-- ─── 7) Panelden seviye yönetimi ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_bildirim_seviyeleri()
RETURNS TABLE (type_key text, label_tr text, category text, mod_seviyesi smallint,
               is_mandatory boolean, uretiliyor boolean, uretim_adedi bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Yetkisiz.'; END IF;
  RETURN QUERY
  SELECT t.type_key, t.label_tr, t.category, t.mod_seviyesi, t.is_mandatory,
         (c.adet > 0) AS uretiliyor, COALESCE(c.adet, 0) AS uretim_adedi
  FROM public.notification_templates t
  LEFT JOIN (SELECT n.type_key AS tk, count(*) AS adet
               FROM public.notifications n GROUP BY 1) c ON c.tk = t.type_key
  ORDER BY t.mod_seviyesi, t.category, t.type_key;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_bildirim_seviyesi_ayarla(
  p_type_key text, p_seviye smallint
) RETURNS smallint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Yetkisiz.'; END IF;
  IF p_seviye NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Seviye 1-3 arası olmalı.'; END IF;
  UPDATE public.notification_templates SET mod_seviyesi = p_seviye, updated_at = now()
   WHERE type_key = p_type_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bilinmeyen bildirim türü: %', p_type_key; END IF;
  RETURN p_seviye;
END; $$;

REVOKE ALL ON FUNCTION public.admin_bildirim_seviyeleri()                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_bildirim_seviyesi_ayarla(text, smallint)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bildirim_seviyeleri()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bildirim_seviyesi_ayarla(text, smallint) TO authenticated;

-- ─── 7b) Panel "test gönder" bekçiye takılmasın ───────────────────────────
-- Tek değişiklik: kaçış kapısını açan set_config satırı. Gövdenin geri kalanı
-- birebir aynı (yetki kontrolü + notify_from_template + denetim kaydı).
CREATE OR REPLACE FUNCTION public.admin_send_template_test(
  p_type_key text, p_vars jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  -- yalnız bu işlem boyunca geçerli (true = transaction-local)
  PERFORM set_config('oyna.bildirim_bekci_atla', 'on', true);
  v_id := public.notify_from_template(auth.uid(), p_type_key, p_vars, NULL);
  PERFORM set_config('oyna.bildirim_bekci_atla', 'off', true);
  PERFORM public.log_admin_action('NOTIFY_TEMPLATE_TEST', 'notification_template', NULL, p_type_key, NULL, p_vars);
  RETURN v_id;
END; $function$;

-- ─── 8) DOĞRULAMA — yanlışsa tüm göç geri alınır ──────────────────────────
DO $$
DECLARE
  v_uid uuid; v_seviye smallint; v_sonuc boolean; v_once bigint; v_sonra bigint;
BEGIN
  -- (a) Seviye 1 dışı hiçbir zorunlu şablon kalmamalı
  IF EXISTS (SELECT 1 FROM public.notification_templates
              WHERE is_mandatory IS TRUE AND mod_seviyesi <> 1) THEN
    RAISE EXCEPTION 'DOĞRULAMA: zorunlu bir şablon seviye 1 değil.';
  END IF;

  -- (b) Her şablonun geçerli bir seviyesi olmalı
  IF EXISTS (SELECT 1 FROM public.notification_templates
              WHERE mod_seviyesi IS NULL OR mod_seviyesi NOT BETWEEN 1 AND 3) THEN
    RAISE EXCEPTION 'DOĞRULAMA: geçersiz seviye var.';
  END IF;

  -- (c) Bilinmeyen tür GEÇMELİ
  SELECT id INTO v_uid FROM public.profiles LIMIT 1;
  IF v_uid IS NOT NULL THEN
    IF NOT public.bildirim_gonderilsin_mi(v_uid, 'boyle_bir_tur_yok_12345') THEN
      RAISE EXCEPTION 'DOĞRULAMA: bilinmeyen tür engellendi — bekçi fazla katı.';
    END IF;
    -- (d) Seviye 1 her modda GEÇMELİ
    IF NOT public.bildirim_gonderilsin_mi(v_uid, 'match_cancelled') THEN
      RAISE EXCEPTION 'DOĞRULAMA: seviye 1 bildirim engellendi.';
    END IF;
  END IF;

  -- (e) Bekçi gerçekten çalışıyor mu? Geçici bir kullanıcıyı ZORUNLU moda al,
  --     seviye 3 bildirim yazmayı dene, yazılmamalı; sonra geri al.
  IF v_uid IS NOT NULL THEN
    SELECT count(*) INTO v_once FROM public.notifications WHERE user_id = v_uid;
    UPDATE public.profiles SET notification_mode = 'ZORUNLU' WHERE id = v_uid;
    BEGIN
      INSERT INTO public.notifications (user_id, title, body, type_key)
      VALUES (v_uid, 'bekçi testi', 'silinecek', 'promo_offers');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    SELECT count(*) INTO v_sonra FROM public.notifications WHERE user_id = v_uid;
    UPDATE public.profiles SET notification_mode = 'TUMU' WHERE id = v_uid;
    IF v_sonra <> v_once THEN
      DELETE FROM public.notifications WHERE user_id = v_uid AND title = 'bekçi testi';
      RAISE EXCEPTION 'DOĞRULAMA: bekçi seviye 3 bildirimi ZORUNLU modda engellemedi.';
    END IF;
  END IF;

  RAISE NOTICE 'S2 bildirim modları: doğrulama geçti.';
END $$;
