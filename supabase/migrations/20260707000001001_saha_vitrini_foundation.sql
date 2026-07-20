-- ============================================================================
-- SAHA VİTRİNİ TEMELİ
-- Vitrin yeniden tasarımı + owner/admin içerik yönetimi altyapısı:
--   1) pitch_staff_members: hesap bağlama + içerik düzenleme izni
--   2) can_manage_pitch_content(): merkezi içerik yetki fonksiyonu
--   3) courts: yüzey (surface) alanı + court_type normalizasyonu + kalite notu onay durumu
--   4) pitches: is_published / is_featured bayrakları
--   5) pitch_content_audit: içerik değişiklik günlüğü
--   6) pitch_media: sıralanabilir, etiketli, moderasyonlu medya tablosu (+ images jsonb senkronu)
--   7) pitch_favorites: kullanıcı favorileri
--   8) pitch_views: vitrin görüntülenme olayları + owner analitik fonksiyonu
--   9) pitch_change_requests: ad/konum değişikliği onay akışı (+ koruma trigger'ı)
--  10) amenity normalizasyonu (backfill)
-- ============================================================================

-- ─── 1) Personel: hesap bağlama + içerik izni (yetki fonksiyonundan ÖNCE) ──
ALTER TABLE public.pitch_staff_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS can_edit_content boolean NOT NULL DEFAULT false;

-- ─── 2) Yardımcılar ────────────────────────────────────────────────────────
-- İçerik yönetim yetkisi: tesis sahibi, admin, demo tesiste OWNER rolü
-- (courts policy'leriyle simetrik) veya can_edit_content izinli hesap bağlı personel.
CREATE OR REPLACE FUNCTION public.can_manage_pitch_content(p_pitch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN p_pitch_id IS NULL THEN false
    ELSE (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM pitches p
        WHERE p.id = p_pitch_id
          AND (p.owner_id = (SELECT auth.uid())
               OR (p.is_demo = true AND has_role('OWNER')))
      )
      OR EXISTS (
        SELECT 1 FROM pitch_staff_members s
        WHERE s.pitch_id = p_pitch_id
          AND s.user_id = (SELECT auth.uid())
          AND s.can_edit_content = true
          AND COALESCE(s.status, 'active') IN ('active', 'ACTIVE')
      )
    )
  END;
$$;

-- storage path'inden güvenli uuid çıkarımı (pitches/{pitch_id}/... için)
CREATE OR REPLACE FUNCTION public.try_uuid(p_text text)
RETURNS uuid
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN p_text::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ─── 3) courts: surface + court_type normalizasyonu + kalite onay durumu ───
ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'TURF';

-- Eski admin formunun yazdığı zemin değerlerini iki alana ayrıştır:
-- court_type artık SADECE konum (OPEN/CLOSED), surface zemin tipi.
UPDATE public.courts SET surface = CASE upper(COALESCE(court_type, ''))
  WHEN 'GRASS'  THEN 'GRASS'
  WHEN 'INDOOR' THEN 'PARQUET'
  WHEN 'TARTAN' THEN 'TARTAN'
  ELSE 'TURF'
END
WHERE upper(COALESCE(court_type, '')) IN ('TURF', 'GRASS', 'INDOOR', 'TARTAN');

UPDATE public.courts SET court_type = CASE
  WHEN upper(COALESCE(court_type, '')) IN ('CLOSED', 'INDOOR', 'KAPALI') THEN 'CLOSED'
  ELSE 'OPEN'
END;

ALTER TABLE public.courts DROP CONSTRAINT IF EXISTS courts_court_type_check;
ALTER TABLE public.courts
  ADD CONSTRAINT courts_court_type_check CHECK (court_type IN ('OPEN', 'CLOSED'));
ALTER TABLE public.courts DROP CONSTRAINT IF EXISTS courts_surface_check;
ALTER TABLE public.courts
  ADD CONSTRAINT courts_surface_check CHECK (surface IN ('TURF', 'GRASS', 'PARQUET', 'TARTAN'));

-- Kalite notları: owner beyan eder (pending), admin onaylar (approved).
ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS grades_status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.courts DROP CONSTRAINT IF EXISTS courts_grades_status_check;
ALTER TABLE public.courts
  ADD CONSTRAINT courts_grades_status_check CHECK (grades_status IN ('none', 'pending', 'approved'));

UPDATE public.courts SET grades_status = 'none'
WHERE lighting_grade IS NULL AND grass_grade IS NULL AND locker_grade IS NULL;

-- Admin olmayan biri not girer/değiştirirse durum otomatik 'pending' olur;
-- admin değişiklikleri geldiği gibi kalır (onay = admin'in grades_status='approved' yazması).
CREATE OR REPLACE FUNCTION public.enforce_court_grade_review()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.lighting_grade IS NOT NULL OR NEW.grass_grade IS NOT NULL OR NEW.locker_grade IS NOT NULL THEN
      NEW.grades_status := 'pending';
    ELSE
      NEW.grades_status := 'none';
    END IF;
  ELSIF NEW.lighting_grade IS DISTINCT FROM OLD.lighting_grade
     OR NEW.grass_grade   IS DISTINCT FROM OLD.grass_grade
     OR NEW.locker_grade  IS DISTINCT FROM OLD.locker_grade THEN
    IF NEW.lighting_grade IS NULL AND NEW.grass_grade IS NULL AND NEW.locker_grade IS NULL THEN
      NEW.grades_status := 'none';
    ELSE
      NEW.grades_status := 'pending';
    END IF;
  ELSE
    -- Not değişmedi: admin olmayan kullanıcı onay durumunu elle değiştiremez.
    NEW.grades_status := OLD.grades_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_court_grade_review ON public.courts;
CREATE TRIGGER trg_court_grade_review
  BEFORE INSERT OR UPDATE ON public.courts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_court_grade_review();

-- ─── 4) pitches: yayın ve öne çıkarma bayrakları ───────────────────────────
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pitches.is_published IS 'Owner kontrollü vitrin görünürlüğü (tadilat/sezon kapanışı). verification_status''tan bağımsız.';
COMMENT ON COLUMN public.pitches.is_featured IS 'Admin kontrollü "Öne Çıkan" rozeti; vitrin sıralamasında üste taşır.';

-- ─── 5) İçerik değişiklik günlüğü ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pitch_content_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pitch_id uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pitch_content_audit_pitch ON public.pitch_content_audit (pitch_id, created_at DESC);

ALTER TABLE public.pitch_content_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pitch_content_audit_select ON public.pitch_content_audit;
CREATE POLICY pitch_content_audit_select ON public.pitch_content_audit
  FOR SELECT USING (can_manage_pitch_content(pitch_id));

DROP POLICY IF EXISTS pitch_content_audit_insert ON public.pitch_content_audit;
CREATE POLICY pitch_content_audit_insert ON public.pitch_content_audit
  FOR INSERT WITH CHECK (
    can_manage_pitch_content(pitch_id) AND (actor_id IS NULL OR actor_id = (SELECT auth.uid()))
  );

-- ─── 6) pitch_media ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pitch_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  court_id uuid REFERENCES public.courts(id) ON DELETE CASCADE,
  url text NOT NULL,
  storage_path text,
  kind text NOT NULL DEFAULT 'image' CHECK (kind IN ('image')),
  label text CHECK (label IS NULL OR label IN ('saha_ici', 'soyunma', 'kafeterya', 'gece', 'dis_gorunum', 'diger')),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'flagged', 'removed')),
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pitch_media_pitch ON public.pitch_media (pitch_id, sort_order) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pitch_media_court ON public.pitch_media (court_id) WHERE court_id IS NOT NULL;

ALTER TABLE public.pitch_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pitch_media_select ON public.pitch_media;
CREATE POLICY pitch_media_select ON public.pitch_media
  FOR SELECT USING (status = 'active' OR can_manage_pitch_content(pitch_id));

DROP POLICY IF EXISTS pitch_media_insert ON public.pitch_media;
CREATE POLICY pitch_media_insert ON public.pitch_media
  FOR INSERT WITH CHECK (can_manage_pitch_content(pitch_id));

DROP POLICY IF EXISTS pitch_media_update ON public.pitch_media;
CREATE POLICY pitch_media_update ON public.pitch_media
  FOR UPDATE USING (can_manage_pitch_content(pitch_id))
  WITH CHECK (can_manage_pitch_content(pitch_id));

DROP POLICY IF EXISTS pitch_media_delete ON public.pitch_media;
CREATE POLICY pitch_media_delete ON public.pitch_media
  FOR DELETE USING (can_manage_pitch_content(pitch_id));

-- Geçiş dönemi uyumluluğu: pitch_media değiştikçe pitches.image/images ve
-- courts.images jsonb alanları otomatik senkron kalır (eski okuyucular bozulmaz).
CREATE OR REPLACE FUNCTION public.sync_pitch_media_arrays()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pitch uuid;
  v_courts uuid[];
  v_court uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_pitch := NEW.pitch_id;
    v_courts := ARRAY[NEW.court_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_pitch := OLD.pitch_id;
    v_courts := ARRAY[OLD.court_id];
  ELSE
    v_pitch := NEW.pitch_id;
    v_courts := ARRAY[NEW.court_id, OLD.court_id];
  END IF;

  UPDATE pitches SET
    images = COALESCE((
      SELECT jsonb_agg(m.url ORDER BY m.sort_order, m.created_at)
      FROM pitch_media m
      WHERE m.pitch_id = v_pitch AND m.court_id IS NULL AND m.status = 'active'
    ), '[]'::jsonb),
    image = (
      SELECT m.url FROM pitch_media m
      WHERE m.pitch_id = v_pitch AND m.court_id IS NULL AND m.status = 'active'
      ORDER BY m.sort_order, m.created_at LIMIT 1
    )
  WHERE id = v_pitch;

  FOR v_court IN
    SELECT DISTINCT c FROM unnest(v_courts) AS c WHERE c IS NOT NULL
  LOOP
    UPDATE courts SET images = COALESCE((
      SELECT jsonb_agg(m.url ORDER BY m.sort_order, m.created_at)
      FROM pitch_media m
      WHERE m.court_id = v_court AND m.status = 'active'
    ), '[]'::jsonb)
    WHERE id = v_court;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pitch_media ON public.pitch_media;
CREATE TRIGGER trg_sync_pitch_media
  AFTER INSERT OR UPDATE OR DELETE ON public.pitch_media
  FOR EACH ROW EXECUTE FUNCTION public.sync_pitch_media_arrays();

-- Backfill: mevcut jsonb dizilerindeki görselleri pitch_media'ya taşı (idempotent).
INSERT INTO public.pitch_media (pitch_id, court_id, url, sort_order, uploaded_by)
SELECT p.id, NULL, img.value, img.ordinality - 1, p.owner_id
FROM public.pitches p, jsonb_array_elements_text(COALESCE(p.images, '[]'::jsonb)) WITH ORDINALITY AS img(value, ordinality)
WHERE img.value IS NOT NULL AND img.value <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.pitch_media m
    WHERE m.pitch_id = p.id AND m.court_id IS NULL AND m.url = img.value
  );

INSERT INTO public.pitch_media (pitch_id, court_id, url, sort_order, uploaded_by)
SELECT c.pitch_id, c.id, img.value, img.ordinality - 1, p.owner_id
FROM public.courts c
JOIN public.pitches p ON p.id = c.pitch_id,
     jsonb_array_elements_text(COALESCE(c.images, '[]'::jsonb)) WITH ORDINALITY AS img(value, ordinality)
WHERE img.value IS NOT NULL AND img.value <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.pitch_media m
    WHERE m.court_id = c.id AND m.url = img.value
  );

-- Kapak fotoğrafı da (pitches.image) images dizisinde yoksa medyaya ekle.
INSERT INTO public.pitch_media (pitch_id, court_id, url, sort_order, uploaded_by)
SELECT p.id, NULL, p.image, -1, p.owner_id
FROM public.pitches p
WHERE p.image IS NOT NULL AND p.image <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.pitch_media m
    WHERE m.pitch_id = p.id AND m.court_id IS NULL AND m.url = p.image
  );

-- ─── 7) pitch_favorites ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pitch_favorites (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pitch_id uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pitch_id)
);

CREATE INDEX IF NOT EXISTS idx_pitch_favorites_pitch ON public.pitch_favorites (pitch_id);

ALTER TABLE public.pitch_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pitch_favorites_select_own ON public.pitch_favorites;
CREATE POLICY pitch_favorites_select_own ON public.pitch_favorites
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS pitch_favorites_insert_own ON public.pitch_favorites;
CREATE POLICY pitch_favorites_insert_own ON public.pitch_favorites
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS pitch_favorites_delete_own ON public.pitch_favorites;
CREATE POLICY pitch_favorites_delete_own ON public.pitch_favorites
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ─── 8) pitch_views + owner analitiği ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pitch_views (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pitch_id uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pitch_views_pitch_time ON public.pitch_views (pitch_id, created_at DESC);

ALTER TABLE public.pitch_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pitch_views_insert ON public.pitch_views;
CREATE POLICY pitch_views_insert ON public.pitch_views
  FOR INSERT TO authenticated
  WITH CHECK (viewer_id IS NULL OR viewer_id = (SELECT auth.uid()));
-- SELECT policy'si bilinçli olarak yok: okuma yalnızca aşağıdaki fonksiyonla.

CREATE OR REPLACE FUNCTION public.get_pitch_engagement(p_pitch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT can_manage_pitch_content(p_pitch_id) THEN
    RAISE EXCEPTION 'Bu tesisin istatistiklerini görüntüleme yetkiniz yok';
  END IF;
  RETURN jsonb_build_object(
    'views_30d', (SELECT count(*) FROM pitch_views
                  WHERE pitch_id = p_pitch_id AND created_at > now() - interval '30 days'),
    'favorites', (SELECT count(*) FROM pitch_favorites WHERE pitch_id = p_pitch_id),
    'app_bookings_30d', (SELECT count(*) FROM pitch_bookings
                         WHERE pitch_id = p_pitch_id
                           AND user_id IS NOT NULL
                           AND status <> 'CANCELLED'
                           AND created_at > now() - interval '30 days')
  );
END;
$$;

-- ─── 9) Ad/konum değişikliği onay akışı ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pitch_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changes jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pitch_change_requests_status ON public.pitch_change_requests (status, created_at DESC);

ALTER TABLE public.pitch_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pitch_change_requests_select ON public.pitch_change_requests;
CREATE POLICY pitch_change_requests_select ON public.pitch_change_requests
  FOR SELECT USING (can_manage_pitch_content(pitch_id));

DROP POLICY IF EXISTS pitch_change_requests_insert ON public.pitch_change_requests;
CREATE POLICY pitch_change_requests_insert ON public.pitch_change_requests
  FOR INSERT WITH CHECK (
    can_manage_pitch_content(pitch_id) AND (requested_by = (SELECT auth.uid()))
  );

-- Onaylanmış tesiste ad/konum alanları doğrudan değiştirilemez (admin hariç):
-- onboarding (pending/rejected) sırasında serbest, onay sonrası change request şart.
CREATE OR REPLACE FUNCTION public.protect_pitch_identity_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF is_admin() OR OLD.verification_status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF NEW.name      IS DISTINCT FROM OLD.name
     OR NEW.city      IS DISTINCT FROM OLD.city
     OR NEW.district  IS DISTINCT FROM OLD.district
     OR NEW.address   IS DISTINCT FROM OLD.address
     OR NEW.latitude  IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
    RAISE EXCEPTION 'PITCH_IDENTITY_CHANGE_REQUIRES_APPROVAL'
      USING HINT = 'Ad/konum değişikliği için değişiklik talebi oluşturun; admin onayıyla uygulanır.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_pitch_identity ON public.pitches;
CREATE TRIGGER trg_protect_pitch_identity
  BEFORE UPDATE ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.protect_pitch_identity_fields();

-- Admin karar fonksiyonu: onaylanırsa değişiklikler tesise uygulanır.
CREATE OR REPLACE FUNCTION public.review_pitch_change_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req public.pitch_change_requests%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Bu işlem için admin yetkisi gerekli';
  END IF;
  SELECT * INTO v_req FROM pitch_change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Değişiklik talebi bulunamadı';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Talep zaten sonuçlandırılmış';
  END IF;

  IF p_approve THEN
    UPDATE pitches SET
      name      = COALESCE(v_req.changes->>'name', name),
      city      = COALESCE(v_req.changes->>'city', city),
      district  = COALESCE(v_req.changes->>'district', district),
      address   = COALESCE(v_req.changes->>'address', address),
      latitude  = COALESCE((v_req.changes->>'latitude')::double precision, latitude),
      longitude = COALESCE((v_req.changes->>'longitude')::double precision, longitude)
    WHERE id = v_req.pitch_id;
  END IF;

  UPDATE pitch_change_requests SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    review_note = p_note,
    reviewed_by = (SELECT auth.uid()),
    reviewed_at = now()
  WHERE id = p_request_id;

  INSERT INTO pitch_content_audit (pitch_id, actor_id, action, detail)
  VALUES (
    v_req.pitch_id,
    (SELECT auth.uid()),
    CASE WHEN p_approve THEN 'change_request_approved' ELSE 'change_request_rejected' END,
    jsonb_build_object('request_id', p_request_id, 'changes', v_req.changes, 'note', p_note)
  );
END;
$$;

-- ─── 10) Amenity normalizasyonu (standart kataloğa eşleme) ─────────────────
UPDATE public.pitches
SET amenities = (
  SELECT COALESCE(jsonb_agg(DISTINCT mapped.value), '[]'::jsonb)
  FROM (
    SELECT CASE a.value
      WHEN 'Dus' THEN 'Duş'
      WHEN 'Soyunma Odasi' THEN 'Soyunma Odası'
      WHEN 'Wifi' THEN 'WiFi'
      WHEN 'Kafe' THEN 'Kafeterya'
      WHEN 'Büfe' THEN 'Kafeterya'
      WHEN 'Kamera' THEN 'Kamera Kaydı'
      ELSE a.value
    END AS value
    FROM jsonb_array_elements_text(COALESCE(pitches.amenities, '[]'::jsonb)) a(value)
  ) mapped
)
WHERE amenities IS NOT NULL AND amenities <> '[]'::jsonb;
