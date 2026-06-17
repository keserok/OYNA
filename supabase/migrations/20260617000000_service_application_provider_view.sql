-- ============================================================
-- OYNA — Kaleci/Hakem başvuru akışı için sağlayıcı doğrulama view'ı
-- ------------------------------------------------------------
-- Yeni başvuru formu (ServiceApplication) goalkeepers/referees tablolarına
-- id = profil id ile yazıyor. pending_provider_verifications view'ı şimdiye
-- kadar yalnızca auth_uid üzerinden join yapıyordu; goalkeepers tablosunda bu
-- kolon bulunmadığından kaleci başvuruları view'da bio/ücret olmadan görünüyordu.
--
-- Bu migration:
--   1) goalkeepers tablosuna auth_uid kolonu ekler (idempotent) ve id ile doldurur
--   2) view join'lerini COALESCE(auth_uid, id) ile dayanıklı hale getirir
-- ============================================================

-- 1) goalkeepers.auth_uid (additive)
ALTER TABLE public.goalkeepers
  ADD COLUMN IF NOT EXISTS auth_uid UUID;

UPDATE public.goalkeepers
  SET auth_uid = id
  WHERE auth_uid IS NULL;

-- referees tablosunda auth_uid zaten var; eski kayıtları doldur
UPDATE public.referees
  SET auth_uid = id
  WHERE auth_uid IS NULL;

-- 2) View'ı dayanıklı join'lerle yeniden oluştur
CREATE OR REPLACE VIEW public.pending_provider_verifications AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.avatar_url,
  p.role   AS primary_role,
  p.roles,
  p.verification_status,
  p.created_at,
  g.id     AS gk_profile_id,
  g.bio    AS gk_bio,
  g.fee    AS gk_fee,
  r.id     AS ref_profile_id,
  r.bio    AS ref_bio,
  r.fee    AS ref_fee
FROM public.profiles p
LEFT JOIN public.goalkeepers g ON COALESCE(g.auth_uid, g.id) = p.id
LEFT JOIN public.referees    r ON COALESCE(r.auth_uid, r.id) = p.id
WHERE p.verification_status = 'pending'
  AND (
    p.role = 'GOALKEEPER' OR p.role = 'REFEREE'
    OR 'GOALKEEPER' = ANY(p.roles)
    OR 'REFEREE'    = ANY(p.roles)
  );

-- View RLS'e saygı duysun (önceki sertleştirme ile uyumlu)
ALTER VIEW public.pending_provider_verifications SET (security_invoker = true);

-- İzinler: anon yok, authenticated yalnız SELECT
REVOKE ALL ON public.pending_provider_verifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pending_provider_verifications FROM authenticated;
GRANT SELECT ON public.pending_provider_verifications TO authenticated;
