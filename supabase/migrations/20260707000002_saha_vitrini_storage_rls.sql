-- ============================================================================
-- SAHA VİTRİNİ: STORAGE GÜVENLİĞİ
-- 'images' bucket'ı sıkılaştırması:
--   * pitches/{pitch_id}/... yoluna yalnızca o tesisin içerik yöneticileri yazabilir
--     (önceden: her giriş yapmış kullanıcı HERHANGİ bir yola yazabiliyordu)
--   * Diğer klasörler (avatars/, team-crests/, matches/, courts/, uploads/)
--     eski davranışı korur: authenticated yükleyebilir
--   * DELETE/UPDATE policy'si eklendi (önceden hiç yoktu → yetim dosyalar silinemiyordu)
--   * Bucket'a dosya boyutu (10MB) ve MIME kısıtı eklendi
-- Bağımlılık: 20260707000001 (can_manage_pitch_content, try_uuid)
-- ============================================================================

-- Bucket sınırları: 10MB, yalnızca görsel formatları.
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'
    ]
WHERE id = 'images';

-- INSERT: pitches/* yolu sahiplik ister; diğer klasörler eski davranış.
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
CREATE POLICY "images upload scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND (
      (storage.foldername(name))[1] IS DISTINCT FROM 'pitches'
      OR public.can_manage_pitch_content(public.try_uuid((storage.foldername(name))[2]))
    )
  );

-- UPDATE (upsert/metadata): pitches/* içerik yöneticisi; diğer her yer platform admin.
DROP POLICY IF EXISTS "images update scoped" ON storage.objects;
CREATE POLICY "images update scoped" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'images'
    AND (
      ((storage.foldername(name))[1] = 'pitches'
        AND public.can_manage_pitch_content(public.try_uuid((storage.foldername(name))[2])))
      OR public.is_platform_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'images'
    AND (
      ((storage.foldername(name))[1] = 'pitches'
        AND public.can_manage_pitch_content(public.try_uuid((storage.foldername(name))[2])))
      OR public.is_platform_admin()
    )
  );

-- DELETE: pitches/* içerik yöneticisi; diğer her yer platform admin.
DROP POLICY IF EXISTS "images delete scoped" ON storage.objects;
CREATE POLICY "images delete scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'images'
    AND (
      ((storage.foldername(name))[1] = 'pitches'
        AND public.can_manage_pitch_content(public.try_uuid((storage.foldername(name))[2])))
      OR public.is_platform_admin()
    )
  );
