-- ==============================================================================
-- Profil Bilgileri: kullanıcı kendi görünen adını (full_name) düzenleyebilsin.
-- ------------------------------------------------------------------------------
-- profiles.name (NOT NULL, legacy) zaten authenticated için UPDATE'e açık; ancak
-- uygulama görünen ad olarak full_name kullanıyor ve o kolon self-edit grant'inde
-- yoktu → Ayarlar → Profil Bilgileri'nde isim güncelleme 42501 ile düşerdi.
-- Satır güvenliği RLS'te (profiles_update: yalnız kendi satırı + yetki-değişmez
-- guard), privilege koruması trigger'da; full_name bir görünen alan olduğundan
-- güvenle açılır (mevcut position/bio/birthdate/avatar_url grant deseniyle aynı).
-- ==============================================================================

GRANT UPDATE (full_name) ON public.profiles TO authenticated;
