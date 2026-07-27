-- ============================================================
-- F1.2 — Hizmet payout'u için 48 saatlik otomatik serbest bırakma
-- ============================================================
-- İki-taraflı onay kapısı (provider_confirmed AND captain_confirmed) doğru,
-- ancak kaptan onaylamazsa sağlayıcının parası SÜRESİZ askıda kalıyordu —
-- hiçbir zamana bağlı serbest bırakma yoktu. Kural (ürün kararı):
-- maç bitişinden (starts_at + 3 saat; ends_at kolonu yok, repo geneli aynı
-- sezgisel — bkz. auto_finalize_matches) + 48 saat sonra itiraz yoksa ve
-- SAĞLAYICI hizmeti verdiğini beyan etmişse kaptan onayı otomatik sayılır.
--
-- Güvenlik şartları:
--  * provider_confirmed = true ŞART — gelmeyen sağlayıcı 48s sonra para alamaz.
--  * reported_at IS NULL ŞART — "Sorun Bildir" açıkken otomatik serbest yok.
--  * status='CAPTURED' + payout_released=false — no-show/itiraz kayıtları
--    (NOSHOW_REPORTED/DISPUTED) bu süpürücüye hiç girmez.
-- Desen: release_owner_earnings (20260706000001) + saatlik pg_cron.
-- İstemci-taraflı süpürme bilinçli olarak YOK (bkz. 20260719000001000 gerekçesi).

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES
  ('service_auto_release_hours', to_jsonb(48), 'number', 'HIZMET',
   'Hizmet Ödemesi Otomatik Serbest Bırakma (saat)',
   'Maç bitişinden sonra kaptan onayı beklenen azami süre; dolunca sağlayıcı onaylıysa payout otomatik serbest kalır.', false),
  ('service_auto_release_enabled', 'true'::jsonb, 'boolean', 'HIZMET',
   'Hizmet Ödemesi Otomatik Serbest Bırakma Aktif',
   'Kapatılırsa payout yalnız kaptan/admin onayıyla serbest kalır (kill-switch).', false)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.auto_release_service_payouts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
  v_hours numeric;
  v_scanned int := 0;
  v_released int := 0;
  v_gk_name text;
BEGIN
  IF NOT COALESCE(public.get_config_bool('service_auto_release_enabled', true), true) THEN
    RETURN jsonb_build_object('enabled', false, 'scanned', 0, 'released', 0);
  END IF;
  v_hours := public.get_config_number('service_auto_release_hours', 48);

  FOR r IN
    SELECT sr.*, m.title AS match_title, m.starts_at
    FROM public.service_requests sr
    JOIN public.matches m ON m.id = sr.match_id
    WHERE sr.status = 'CAPTURED'
      AND sr.payout_released = false
      AND COALESCE(sr.provider_confirmed, false) = true
      AND COALESCE(sr.captain_confirmed, false) = false
      AND sr.reported_at IS NULL
      AND m.starts_at IS NOT NULL
      AND (m.starts_at + interval '3 hours' + make_interval(hours => v_hours::int)) < now()
    FOR UPDATE OF sr SKIP LOCKED
  LOOP
    v_scanned := v_scanned + 1;

    UPDATE public.service_requests SET captain_confirmed = true WHERE id = r.id;
    PERFORM public._release_service_payout(r.match_id, r.provider_id);

    -- serbest kaldıysa bildir (release başarısızsa sessiz geç — sonraki turda yeniden denenir)
    IF EXISTS (SELECT 1 FROM public.service_requests WHERE id = r.id AND payout_released = true) THEN
      v_released := v_released + 1;
      SELECT COALESCE(name, full_name, 'Sağlayıcı') INTO v_gk_name FROM public.profiles WHERE id = r.provider_id;

      INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
      VALUES (r.provider_id, 'Ücretin serbest bırakıldı 💰',
              COALESCE(r.match_title,'Maç') || ' ücretin, itiraz süresi dolduğu için otomatik olarak cüzdanına işlendi.',
              'service_payout_auto_released', r.match_id, 'oyna://match/' || r.match_id);

      INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
      VALUES (r.requested_by, 'Hizmet ödemesi tamamlandı',
              COALESCE(r.match_title,'Maçın') || ' için ' || v_gk_name ||
              ' ücreti, ' || v_hours::int || ' saatlik itiraz süresi içinde sorun bildirilmediği için serbest bırakıldı.',
              'service_payout_auto_released', r.match_id, 'oyna://match/' || r.match_id);
    ELSE
      -- release gerçekleşmediyse bayrağı geri alma: bir sonraki koşuda tekrar denenir;
      -- captain_confirmed=true kalması sorun değil çünkü release kapısı statü+payout_released'a bakıyor.
      NULL;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('enabled', true, 'scanned', v_scanned, 'released', v_released);
END; $function$;

REVOKE ALL ON FUNCTION public.auto_release_service_payouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_release_service_payouts() TO service_role;

-- Saatlik cron (pg_cron yoksa migration patlamasın; job zaten varsa yeniden kurulmasın)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_release_service_payouts') THEN
      PERFORM cron.schedule('auto_release_service_payouts', '0 * * * *',
                            'SELECT public.auto_release_service_payouts()');
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron yok — auto_release_service_payouts cron kurulmadı (elle kurulmalı).';
  END IF;
END
$do$;
