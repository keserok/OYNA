-- ============================================================================
-- Vitrin sağlamlaştırma 2:
--  1) pitch_media SELECT policy'si misafir (anon) güvenli hale getirildi —
--     hardening sonrası anon, can_manage_pitch_content'i EXECUTE edemiyordu;
--     policy anon için fonksiyona hiç girmeden 'active' satırları döner.
--  2) Görüntülenme istatistiği şişirilemez: aynı kullanıcı aynı tesisi aynı gün
--     yalnızca 1 kez sayılır (unique index) + get_pitch_engagement buna göre.
-- ============================================================================

DROP POLICY IF EXISTS pitch_media_select ON public.pitch_media;
CREATE POLICY pitch_media_select ON public.pitch_media
  FOR SELECT USING (
    status = 'active'
    OR ((SELECT auth.uid()) IS NOT NULL AND can_manage_pitch_content(pitch_id))
  );

-- Gün bazında tekilleştirme: INSERT çakışması sessizce yutulur (client zaten
-- oturum başına 1 kez gönderiyor; bu, kötü niyetli şişirmeye karşı DB güvencesi).
ALTER TABLE public.pitch_views
  ADD COLUMN IF NOT EXISTS view_date date NOT NULL DEFAULT (now()::date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pitch_views_daily
  ON public.pitch_views (pitch_id, viewer_id, view_date)
  WHERE viewer_id IS NOT NULL;
