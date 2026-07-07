-- ════════════════════════════════════════════════════════════════════════
-- Rol geçişi & açılış ekranı düzeltmesi — profiles.roles backfill
-- ------------------------------------------------------------------------
-- Amaç: kaleci/hakem/saha sahibi hesaplarında uygulama-içi "Rol Değiştir"in
-- (set_active_role RPC) çalışması ve girişin doğru panele düşmesi için,
-- profiles.roles dizisinin sahip olunan TÜM (geçilebilir) rolleri içermesini
-- garanti etmek.
--
-- set_active_role yalnız roles[]'te bulunan bir role izin verir (ROLE_NOT_OWNED).
-- Bu backfill olmadan:
--   • Herkeste PLAYER olmayabilir → sağlayıcı "Oyuncu Moduna" geçemez.
--   • Aktif rol (role) roles[]'te olmayabilir → o role geri dönülemez.
--   • Saha sahibi yalnız pitches.owner_id ile izlenip roles'ta 'OWNER' taşımayabilir.
--
-- Güvenlik: protect_profile_sensitive_fields trigger'ı roles UPDATE'ini yalnız
-- `auth.uid() IS NOT NULL` iken engeller. Migration postgres rolüyle koşar
-- (auth.uid() = NULL) → koruma doğal olarak aşılır; kullanıcıya yeni ayrıcalık
-- yükseltme yüzeyi AÇILMAZ (yalnız zaten sahip olunan roller normalize edilir).
-- Idempotent: her adım yalnız eksikse ekler (jsonb `?` guard) — tekrar koşulabilir.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Master prensip: "kayıt olan herkes oyuncu" → herkeste PLAYER bulunmalı.
UPDATE public.profiles
SET roles = COALESCE(roles, '[]'::jsonb) || '["PLAYER"]'::jsonb
WHERE NOT (COALESCE(roles, '[]'::jsonb) ? 'PLAYER');

-- 2) Aktif rol daima sahip olunan roller içinde olmalı (o role geri dönebilmek
--    için). Yalnız geçilebilir roller (PLAYER/GOALKEEPER/REFEREE/OWNER) eklenir;
--    admin/diğer değerler roles'u kirletmesin.
UPDATE public.profiles
SET roles = COALESCE(roles, '[]'::jsonb) || jsonb_build_array(role)
WHERE role IN ('PLAYER', 'GOALKEEPER', 'REFEREE', 'OWNER')
  AND NOT (COALESCE(roles, '[]'::jsonb) ? role);

-- 3) Saha sahibi: en az bir tesise sahip olan herkes 'OWNER' rolünü taşımalı
--    (owner bazı yerlerde yalnız pitches.owner_id ile izlendiğinden).
UPDATE public.profiles p
SET roles = COALESCE(p.roles, '[]'::jsonb) || '["OWNER"]'::jsonb
WHERE EXISTS (SELECT 1 FROM public.pitches pt WHERE pt.owner_id = p.id)
  AND NOT (COALESCE(p.roles, '[]'::jsonb) ? 'OWNER');
