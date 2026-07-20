-- ================================================================
-- "Kullandığın ayak" (preferred_foot) alanını sistemden tamamen kaldır
-- ================================================================
-- Ürün kararı: ayak bilgisi ne profilde gösterilecek ne de sistemde
-- tutulacak. Alan üç yerde geçiyor:
--   1) public_profiles view'ı (SELECT listesi) — kolonu düşürebilmek için
--      view'ı ayaksız yeniden yaratmak gerekir (CREATE OR REPLACE VIEW
--      kolon DÜŞÜREMEZ → DROP + CREATE).
--   2) get_friend_player_card RPC'si (sahadaki oyuncu kartı) — ayaksız
--      yeniden tanımlanır (imza aynı → GRANT'lar korunur).
--   3) profiles.preferred_foot kolonu — yukarıdaki bağımlılık kalkınca düşer.
-- YIKICI: kolon düşünce mevcut ayak verisi kalıcı olarak silinir (onaylı).
-- ================================================================

-- 1) public_profiles view'ını ayaksız yeniden yarat (canlı tanımın aynısı,
--    yalnız preferred_foot çıkarıldı; play_style/gender korunur).
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  id,
  name,
  full_name,
  avatar_url,
  role,
  roles,
  trust_score,
  skill_rating,
  reliability_score,
  ratings_history,
  is_verified,
  join_date,
  rating,
  is_pro,
  match_count,
  win_count,
  total_matches,
  diamonds,
  communities,
  player_card,
  oyna_id,
  is_looking_for_team,
  is_available,
  card_active,
  card_tier,
  position,
  bio,
  play_style,
  gender,
  CASE WHEN show_online_status THEN last_active_at ELSE NULL END AS last_active_at
FROM public.profiles
WHERE is_searchable = true
   OR id = (SELECT auth.uid())
   OR is_admin();

GRANT SELECT ON public.public_profiles TO authenticated;
REVOKE ALL ON public.public_profiles FROM anon, public;

COMMENT ON VIEW public.public_profiles IS
  'Column- and row-filtered public read surface for profiles. Never add email, phone, last_location, wallet_balance, wallet, or iyzico_card_user_key to this view.';

-- 2) get_friend_player_card: ayak alanı SELECT'ten ve JSON çıktısından çıkar.
CREATE OR REPLACE FUNCTION public.get_friend_player_card(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_self boolean;
  v_is_friend boolean;
  v_prof record;
  v_together int;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  if p_user_id is null then raise exception 'NOT_FOUND'; end if;
  v_is_self := (p_user_id = v_uid);

  v_is_friend := v_is_self or exists (
    select 1 from public.friendships f
    where upper(coalesce(f.status,'')) = 'ACCEPTED'
      and (
        (f.sender_id = v_uid and f.receiver_id = p_user_id) or
        (f.sender_id = p_user_id and f.receiver_id = v_uid) or
        (f.requester_id = v_uid and f.addressee_id = p_user_id) or
        (f.requester_id = p_user_id and f.addressee_id = v_uid)
      )
  );

  select p.name, p.birthdate, p.reliability_score, p.match_count
    into v_prof
  from public.profiles p where p.id = p_user_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  if v_is_friend and not v_is_self then
    select count(distinct mp1.match_id) into v_together
    from public.match_participants mp1
    join public.match_participants mp2
      on mp2.match_id = mp1.match_id and mp2.user_id = p_user_id
    join public.matches m on m.id = mp1.match_id
    where mp1.user_id = v_uid
      and upper(coalesce(m.status,'')) in ('COMPLETED','FINISHED','SCORED');
  else
    v_together := null;
  end if;

  return jsonb_build_object(
    'is_friend', v_is_friend,
    'is_self', v_is_self,
    'name', v_prof.name,
    'age', case when v_prof.birthdate is not null
                then date_part('year', age(v_prof.birthdate))::int end,
    'fair_play', v_prof.reliability_score,
    'matches_together', v_together,
    'total_matches', coalesce(v_prof.match_count, 0)
  );
end;
$function$;

-- 3) Bağımlılık kalktı → kolonu düşür (grant'ı da otomatik gider).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS preferred_foot;
