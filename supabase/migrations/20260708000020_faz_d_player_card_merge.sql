-- FAZ D — Admin'in oyuncu kartı (FIFA stat) düzenlemesini KALICI yap.
-- Sorun: mapUserToDb player_card'ı yazmıyordu → kart düzenlemeleri kayboluyordu.
-- Çözüm: jsonb MERGE (||) ile yaz → tüketicinin kullandığı ek alanlar (position, fp...)
-- KORUNUR, yalnız admin'in düzenlediği alanlar (overall, tier, stats) güncellenir.
-- Ek: p_card_active ile kartı aç/kapa (kart ekleme/çıkarma) opsiyonel yönetilir.
CREATE OR REPLACE FUNCTION public.admin_set_player_card_data(
  p_user_id uuid,
  p_card jsonb,
  p_card_active boolean DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_card IS NULL OR jsonb_typeof(p_card) <> 'object' THEN RAISE EXCEPTION 'INVALID_CARD'; END IF;
  UPDATE public.profiles SET
    player_card = COALESCE(player_card, '{}'::jsonb) || p_card,
    card_tier   = COALESCE(NULLIF(p_card->>'tier',''), card_tier),
    rating      = COALESCE(NULLIF(p_card->>'overall','')::numeric / 20.0, rating),
    card_active = COALESCE(p_card_active, card_active)
  WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;
  PERFORM public.log_admin_action(
    'PLAYER_CARD_DATA_SET', 'user', p_user_id, NULL, NULL,
    p_card || jsonb_build_object('card_active', p_card_active)
  );
END; $function$;

REVOKE ALL ON FUNCTION public.admin_set_player_card_data(uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_player_card_data(uuid, jsonb, boolean) TO authenticated;
