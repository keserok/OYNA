-- ============================================================
-- OYNA — profiles role/roles kısıtlarını uygulama rol modeliyle hizala
-- ------------------------------------------------------------
-- Canlı veritabanında profiles_role_check yalnızca
-- (PLAYER, GOALKEEPER, REFEREE, ADMIN, SUPER_ADMIN, OWNER) değerlerine izin
-- veriyordu; ancak uygulama CAPTAIN ve COMMUNITY_ADMIN (ve ORGANIZER) rollerini
-- de kullanıyor. Bu uyumsuzluk admin panelinden rol değiştirme ve topluluk
-- yöneticisi atama akışlarını kısıt ihlaliyle kırıyordu.
--
-- Bu migration yalnızca izin verilen değer listesini GENİŞLETİR; mevcut hiçbir
-- satırı veya geçerli yazma işlemini bozmaz, tamamen geri alınabilir.
-- ============================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role::text IN (
    'PLAYER','GOALKEEPER','REFEREE','ADMIN','ORGANIZER',
    'SUPER_ADMIN','COMMUNITY_ADMIN','CAPTAIN','OWNER'
  ));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_roles_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_roles_check
  CHECK (
    roles IS NULL OR (
      jsonb_typeof(roles) = 'array'
      AND roles <@ '["PLAYER","GOALKEEPER","REFEREE","ADMIN","ORGANIZER","SUPER_ADMIN","COMMUNITY_ADMIN","CAPTAIN","OWNER"]'::jsonb
    )
  );
