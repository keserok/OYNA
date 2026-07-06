-- ================================================================
-- SOSYAL AŞAMA 1.4 — Gizlilik anahtarları, rehber hash'i, referans
-- (Spec §B rehber senkronu, §E/F gizlilik). Gizlilik ilkesi: ham
-- telefon numarası hiçbir RPC'ye gelmez; yalnız SHA-256 hash eşleşir;
-- eşleşmeyen hash SAKLANMAZ. profile_contact_hash deny-all RLS'tedir.
-- ================================================================

-- 1) Profil gizlilik anahtarları (Ayarlar → Gizlilik)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_searchable         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discoverable_by_phone boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_online_status    boolean NOT NULL DEFAULT true;

-- 2) Telefon hash tablosu (eşleştirme anahtarı; ham numara YOK)
CREATE TABLE IF NOT EXISTS public.profile_contact_hash (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_sha256 text NOT NULL UNIQUE,
  updated_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.profile_contact_hash ENABLE ROW LEVEL SECURITY;
-- Politika bilinçli olarak YOK (deny-all): yalnız SECURITY DEFINER RPC okur.

-- 3) profiles.phone → hash senkronu (trigger; pgcrypto digest)
CREATE OR REPLACE FUNCTION public.profiles_sync_contact_hash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public','extensions','pg_temp' AS $$
BEGIN
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    DELETE FROM public.profile_contact_hash WHERE user_id = NEW.id;
  ELSE
    INSERT INTO public.profile_contact_hash (user_id, phone_sha256, updated_at)
    VALUES (NEW.id, encode(digest(NEW.phone, 'sha256'), 'hex'), timezone('utc', now()))
    ON CONFLICT (user_id) DO UPDATE
      SET phone_sha256 = EXCLUDED.phone_sha256, updated_at = EXCLUDED.updated_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_sync_contact_hash ON public.profiles;
CREATE TRIGGER trg_profiles_sync_contact_hash
  AFTER INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_contact_hash();

-- Backfill: telefonlu mevcut profiller
INSERT INTO public.profile_contact_hash (user_id, phone_sha256)
SELECT id, encode(extensions.digest(phone, 'sha256'), 'hex')
FROM public.profiles
WHERE phone IS NOT NULL AND phone <> ''
ON CONFLICT (user_id) DO NOTHING;

-- 4) Referans kodları & atıflar (uygulamayı indirme daveti — Spec B)
CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rc_owner_select ON public.referral_codes;
CREATE POLICY rc_owner_select ON public.referral_codes
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- Yazım yalnız RPC'yle.

CREATE TABLE IF NOT EXISTS public.referral_attributions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (inviter_id <> invited_id)
);
CREATE INDEX IF NOT EXISTS referral_attributions_inviter_idx
  ON public.referral_attributions (inviter_id);
ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ra_inviter_select ON public.referral_attributions;
CREATE POLICY ra_inviter_select ON public.referral_attributions
  FOR SELECT TO authenticated USING (inviter_id = (SELECT auth.uid()));

-- 5) RPC: kendi referans kodunu al/oluştur
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT code INTO v_code FROM public.referral_codes WHERE user_id = v_uid;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;
  LOOP
    v_code := left(replace(gen_random_uuid()::text, '-', ''), 8);
    BEGIN
      INSERT INTO public.referral_codes (user_id, code) VALUES (v_uid, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      -- kod çakıştıysa yeniden dene; kullanıcı zaten kod aldıysa onu döndür
      SELECT code INTO v_code FROM public.referral_codes WHERE user_id = v_uid;
      IF v_code IS NOT NULL THEN RETURN v_code; END IF;
    END;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_or_create_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_referral_code() TO authenticated;

-- 6) RPC: kayıt sonrası referans kodunu kullan (atıf + davet edene bildirim)
CREATE OR REPLACE FUNCTION public.redeem_referral_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_inviter uuid;
  v_name    text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT user_id INTO v_inviter FROM public.referral_codes WHERE code = lower(trim(p_code));
  IF v_inviter IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_CODE');
  END IF;
  IF v_inviter = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'SELF_CODE');
  END IF;
  -- Tek atıf: invited_id UNIQUE — ikinci deneme sessizce reddedilir
  BEGIN
    INSERT INTO public.referral_attributions (inviter_id, invited_id) VALUES (v_inviter, v_uid);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ALREADY_ATTRIBUTED');
  END;
  SELECT coalesce(full_name, name::text, 'Bir arkadaşın') INTO v_name
  FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.notifications (user_id, title, body, type_key, sender_id, is_read, deep_link)
  VALUES (
    v_inviter,
    'Davetin karşılık buldu! 🎉',
    v_name || ' senin davetinle OYNA''ya katıldı. Arkadaş ekleyebilirsin.',
    'referral_joined', v_uid, false, 'oyna://social/friends/add'
  );
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.redeem_referral_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral_code(text) TO authenticated;
