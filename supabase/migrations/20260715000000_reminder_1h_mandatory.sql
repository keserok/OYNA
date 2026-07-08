-- ============================================================
-- Maçtan 1 saat önce hatırlatıcısını ZORUNLU kıl.
-- ------------------------------------------------------------
-- Kullanıcı yaklaşan maçının 1 saat önce hatırlatmasını kapatamaz
-- (yanlışlıkla maç kaçırmayı önler). Zorunlu türler send-push'ta
-- sessiz saat + opt-out kapılarından muaftır, yani her zaman iletilir.
-- 24 saat hatırlatıcısı isteğe bağlı kalır (kullanıcı kendi kurar).
-- İdempotent: satır yoksa dokunmaz, varsa is_mandatory'yi true yapar.
-- ============================================================

UPDATE public.notification_templates
SET is_mandatory = true,
    can_user_disable = false
WHERE type_key = 'match_reminder_1h';

-- Mevcut kullanıcıların kayıtlı tercihlerini de düzelt: daha önce 1sa
-- hatırlatıcısını kapatmış olanlar send-push'ta (opt-out kapısı stored pref'e
-- bakıyor) zorunluluktan yararlanamazdı. Bu anahtarı taşıyan tüm profillerde
-- {enabled:true, mandatory:true} olarak geri yaz.
UPDATE public.profiles
SET notification_preferences = jsonb_set(
      notification_preferences,
      '{match_reminder_1h}',
      '{"enabled": true, "mandatory": true}'::jsonb,
      true
    )
WHERE notification_preferences ? 'match_reminder_1h';
