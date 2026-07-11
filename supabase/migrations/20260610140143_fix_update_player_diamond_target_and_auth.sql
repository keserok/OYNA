-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- DÜZELTME 1: update_player_diamond
-- a) Olmayan public.users yerine public.profiles tablosuna yazar
-- b) Yalnızca ADMIN/SUPER_ADMIN veya sunucu (service) tetikleyebilir
-- c) anon rolünün çağırma yetkisi kaldırılır

CREATE OR REPLACE FUNCTION public.update_player_diamond(p_user_id uuid, p_is_win boolean, p_flat_modifier integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current_wins INTEGER;
  v_current_total INTEGER;
  v_new_wins INTEGER;
  v_new_total INTEGER;
  v_win_rate NUMERIC;
  v_new_diamond INTEGER;
  v_card JSONB;
BEGIN
  -- YETKİ: yalnızca admin rolleri veya sunucu tarafı
  IF auth.uid() IS NOT NULL
     AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') NOT IN ('ADMIN','SUPER_ADMIN') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Oyuncu istatistikleri yalnızca sistem tarafından güncellenebilir.';
  END IF;

  SELECT win_count, total_matches, player_card
    INTO v_current_wins, v_current_total, v_card
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Kullanıcı profili bulunamadı.';
  END IF;

  v_current_wins  := COALESCE(v_current_wins, 0);
  v_current_total := COALESCE(v_current_total, 0);
  v_card          := COALESCE(v_card, '{}'::jsonb);

  v_new_total := v_current_total + 1;
  IF p_is_win THEN
    v_new_wins := v_current_wins + 1;
  ELSE
    v_new_wins := v_current_wins;
  END IF;

  IF v_new_total > 0 THEN
    v_win_rate := v_new_wins::NUMERIC / v_new_total::NUMERIC;
  ELSE
    v_win_rate := 0;
  END IF;
  v_new_diamond := ROUND(POWER(v_new_wins, 2) * v_win_rate * 1000) + p_flat_modifier;

  IF v_new_diamond < 0 THEN
    v_new_diamond := 0;
  END IF;

  v_card := jsonb_set(v_card, '{diamondValue}', to_jsonb(v_new_diamond));
  v_card := jsonb_set(v_card, '{winCount}', to_jsonb(v_new_wins));
  v_card := jsonb_set(v_card, '{totalMatches}', to_jsonb(v_new_total));
  IF p_flat_modifier <> 0 THEN
    v_card := jsonb_set(v_card, '{flatModifier}', to_jsonb(p_flat_modifier));
  END IF;

  UPDATE public.profiles
  SET win_count     = v_new_wins,
      total_matches = v_new_total,
      diamonds      = v_new_diamond,
      match_count   = v_new_total,
      player_card   = v_card,
      updated_at    = NOW()
  WHERE id = p_user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_player_diamond(uuid, boolean, integer) FROM anon;
