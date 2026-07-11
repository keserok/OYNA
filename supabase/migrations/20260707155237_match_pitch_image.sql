-- ================================================================
-- MAÇ KARTI GÖRSELİ — saha fotoğrafından otomatik + admin geçersiz kılma
--
-- Kural: matches.image boşsa maçın sahasının fotoğrafı (pitches.image,
-- yoksa images[0]) OTOMATİK dolar; saha değişirse otomatik olanlar
-- tazelenir. Admin panelden özel görsel atanabilir (image_auto=false),
-- boş bırakılırsa otomatiğe döner. Her ekleme yolu (oyuncu/admin/seed)
-- tetikleyiciden geçtiği için tek makine.
-- ================================================================

-- ── 1) Saha fotoğrafı çözücü ──
CREATE OR REPLACE FUNCTION public._pitch_image(p_pitch_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT coalesce(nullif(p.image, ''), p.images->>0)
  FROM public.pitches p WHERE p.id = p_pitch_id;
$$;
REVOKE EXECUTE ON FUNCTION public._pitch_image(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2) image_auto bayrağı: görselin kaynağı (otomatik saha / özel) ──
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS image_auto boolean NOT NULL DEFAULT true;

-- ── 3) Otomatik doldurma tetikleyicisi ──
CREATE OR REPLACE FUNCTION public.matches_autofill_image()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.image IS NULL OR NEW.image = '' THEN
      NEW.image := public._pitch_image(NEW.pitch_id);
      NEW.image_auto := true;
    ELSE
      -- açıkça görsel verilmiş → özel kabul et
      NEW.image_auto := false;
    END IF;
  ELSE
    IF NEW.image IS NULL OR NEW.image = '' THEN
      -- görsel temizlendi → otomatiğe dön
      NEW.image := public._pitch_image(NEW.pitch_id);
      NEW.image_auto := true;
    ELSIF NEW.image_auto AND NEW.pitch_id IS DISTINCT FROM OLD.pitch_id THEN
      -- saha değişti, görsel otomatikti → yeni sahanın fotoğrafı
      NEW.image := public._pitch_image(NEW.pitch_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_matches_autofill_image ON public.matches;
CREATE TRIGGER trg_matches_autofill_image
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.matches_autofill_image();

-- ── 4) Geriye doldurma: görselsiz maçlar sahasının fotoğrafını alır ──
UPDATE public.matches
SET image = public._pitch_image(pitch_id), image_auto = true
WHERE (image IS NULL OR image = '') AND pitch_id IS NOT NULL;

-- ── 5) Admin RPC: panelden görseli değiştir / otomatiğe döndür ──
CREATE OR REPLACE FUNCTION public.admin_set_match_image(p_match_id uuid, p_image text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_image text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED: Yalnız platform admini.'; END IF;
  IF p_image IS NULL OR trim(p_image) = '' THEN
    UPDATE public.matches
    SET image = public._pitch_image(pitch_id), image_auto = true
    WHERE id = p_match_id
    RETURNING image INTO v_image;
  ELSE
    UPDATE public.matches
    SET image = trim(p_image), image_auto = false
    WHERE id = p_match_id
    RETURNING image INTO v_image;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  RETURN v_image;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_match_image(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_match_image(uuid,text) TO authenticated;
