-- ================================================================
-- SOSYAL AŞAMA 1.3 — Arkadaş Listeleri & Tercihler (Spec §5 / Bölüm E)
-- Kullanıcı-tanımlı, çoklu-üyelikli listeler + favoriler.
-- Kişiye özel veri: RLS owner-CRUD; çapraz değişmezler trigger'la.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.friend_lists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
  emoji      text CHECK (emoji IS NULL OR char_length(emoji) <= 8),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS friend_lists_owner_name_uidx
  ON public.friend_lists (owner_id, lower(name));
CREATE INDEX IF NOT EXISTS friend_lists_owner_idx ON public.friend_lists (owner_id);

CREATE TABLE IF NOT EXISTS public.friend_list_members (
  list_id   uuid NOT NULL REFERENCES public.friend_lists(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (list_id, member_id)
);
CREATE INDEX IF NOT EXISTS friend_list_members_member_idx
  ON public.friend_list_members (member_id);

CREATE TABLE IF NOT EXISTS public.friend_prefs (
  owner_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_favorite boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (owner_id, friend_id),
  CHECK (owner_id <> friend_id)
);

-- ── RLS: kişiye özel — owner tam CRUD ──
ALTER TABLE public.friend_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fl_owner_all ON public.friend_lists;
CREATE POLICY fl_owner_all ON public.friend_lists
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

ALTER TABLE public.friend_list_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flm_owner_all ON public.friend_list_members;
CREATE POLICY flm_owner_all ON public.friend_list_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.friend_lists l
                 WHERE l.id = list_id AND l.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.friend_lists l
                      WHERE l.id = list_id AND l.owner_id = (SELECT auth.uid())));

ALTER TABLE public.friend_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fp_owner_all ON public.friend_prefs;
CREATE POLICY fp_owner_all ON public.friend_prefs
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

-- ── Değişmez korumaları (trigger) ──

-- 1) Kullanıcı başına liste tavanı (config: friend_lists_max)
CREATE OR REPLACE FUNCTION public.friend_lists_enforce_max()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
BEGIN
  IF (SELECT count(*) FROM public.friend_lists WHERE owner_id = NEW.owner_id)
     >= public._social_config_int('friend_lists_max', 20) THEN
    RAISE EXCEPTION 'LIST_LIMIT: En fazla % liste oluşturabilirsin.',
      public._social_config_int('friend_lists_max', 20);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_friend_lists_max ON public.friend_lists;
CREATE TRIGGER trg_friend_lists_max
  BEFORE INSERT ON public.friend_lists
  FOR EACH ROW EXECUTE FUNCTION public.friend_lists_enforce_max();

-- 2) Listeye yalnız ARKADAŞ eklenebilir; kendini ekleyemezsin
CREATE OR REPLACE FUNCTION public.friend_list_members_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.friend_lists WHERE id = NEW.list_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'LIST_NOT_FOUND';
  END IF;
  IF NEW.member_id = v_owner THEN
    RAISE EXCEPTION 'CANNOT_ADD_SELF: Kendini listeye ekleyemezsin.';
  END IF;
  IF NOT public._are_friends(v_owner, NEW.member_id) THEN
    RAISE EXCEPTION 'NOT_FRIENDS: Yalnız arkadaşlarını listeye ekleyebilirsin.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_friend_list_members_guard ON public.friend_list_members;
CREATE TRIGGER trg_friend_list_members_guard
  BEFORE INSERT ON public.friend_list_members
  FOR EACH ROW EXECUTE FUNCTION public.friend_list_members_guard();

-- 3) Favori yalnız ARKADAŞ için işaretlenebilir
CREATE OR REPLACE FUNCTION public.friend_prefs_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
BEGIN
  IF NOT public._are_friends(NEW.owner_id, NEW.friend_id) THEN
    RAISE EXCEPTION 'NOT_FRIENDS: Yalnız arkadaşların için tercih tutulur.';
  END IF;
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_friend_prefs_guard ON public.friend_prefs;
CREATE TRIGGER trg_friend_prefs_guard
  BEFORE INSERT OR UPDATE ON public.friend_prefs
  FOR EACH ROW EXECUTE FUNCTION public.friend_prefs_guard();
