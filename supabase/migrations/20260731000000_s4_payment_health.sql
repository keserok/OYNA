-- ════════════════════════════════════════════════════════════════════════════
-- [S4] ÖDEME SAĞLIĞI PANELİ — tespit katmanı (admin_payment_health)
-- ────────────────────────────────────────────────────────────────────────────
-- Master plan S4: "Ödeme sağlığı — kendi kendini iyileştiren akış" → TESPİT:
--   son 24s başarı oranı · askıda PENDING · ort. tahsilat süresi · eşik uyarısı.
-- Ek olarak G1 para-değişmezleri (check_money_invariants) ve süpürücü durumu tek
-- ekranda toplanır. SALT-OKUNUR: hiçbir para hareketi yok → kill-switch gerekmez.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_payment_health(p_window_hours integer DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_win integer := GREATEST(1, LEAST(COALESCE(p_window_hours, 24), 720)); -- 1s–30g
  v_since timestamptz := now() - make_interval(hours => v_win);
  v_succeeded int; v_failed int; v_success_rate numeric;
  v_pending_now int; v_blocked_now int; v_stale_pending int;
  v_avg_capture numeric; v_inv jsonb; v_sweeper boolean;
  v_status text; v_alerts jsonb := '[]'::jsonb;
  -- Eşikler (sabit; ileride app_config'e taşınabilir)
  c_min_sample constant int := 5;      -- altında oran hesaplama anlamsız
  c_rate_warn  constant numeric := 90;  -- %90 altı → uyarı
  c_rate_crit  constant numeric := 75;  -- %75 altı → kritik
  c_capture_warn_s constant int := 300; -- ort. tahsilat > 5 dk → uyarı
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- Pencere içi terminal sonuçlar
  SELECT
    COUNT(*) FILTER (WHERE status IN ('CAPTURED','PAID')),
    COUNT(*) FILTER (WHERE status = 'FAILED')
  INTO v_succeeded, v_failed
  FROM public.payment_intents WHERE created_at >= v_since;

  v_success_rate := CASE WHEN (v_succeeded + v_failed) >= c_min_sample
    THEN round(v_succeeded::numeric * 100 / NULLIF(v_succeeded + v_failed, 0), 1)
    ELSE NULL END;

  -- Anlık askıda (tüm zaman) — kullanıcı hâlâ bekliyor olabilir
  SELECT COUNT(*) FILTER (WHERE status = 'PENDING'),
         COUNT(*) FILTER (WHERE status = 'BLOCKED')
  INTO v_pending_now, v_blocked_now FROM public.payment_intents;

  -- 15 dk+ askıda PENDING (süpürücü adayı; kill-switch'ten bağımsız ham sayım)
  SELECT COUNT(*) INTO v_stale_pending
  FROM public.payment_intents
  WHERE status = 'PENDING' AND created_at < now() - interval '15 minutes';

  -- Ort. tahsilat süresi (oluşturma → tahsilat/ödeme), pencere içi başarılılar
  SELECT round(AVG(EXTRACT(EPOCH FROM (COALESCE(captured_at, paid_at) - created_at))))
  INTO v_avg_capture
  FROM public.payment_intents
  WHERE created_at >= v_since AND status IN ('CAPTURED','PAID')
    AND COALESCE(captured_at, paid_at) IS NOT NULL;

  v_inv := public.check_money_invariants();
  v_sweeper := public.get_config_bool('sweeper_enabled', false);

  -- Durum + uyarı üretimi
  v_status := 'OK';
  IF (v_inv->>'ok')::boolean IS DISTINCT FROM true THEN
    v_status := 'CRITICAL';
    v_alerts := v_alerts || jsonb_build_object('level','CRITICAL','key','invariants',
      'message','Para değişmezleri ihlali var — ledger tutarsızlığı denetlenmeli.');
  END IF;
  IF v_success_rate IS NOT NULL AND v_success_rate < c_rate_crit THEN
    v_status := 'CRITICAL';
    v_alerts := v_alerts || jsonb_build_object('level','CRITICAL','key','success_rate',
      'message', format('Başarı oranı %%%s — kritik eşik altında.', v_success_rate));
  ELSIF v_success_rate IS NOT NULL AND v_success_rate < c_rate_warn THEN
    IF v_status <> 'CRITICAL' THEN v_status := 'WARN'; END IF;
    v_alerts := v_alerts || jsonb_build_object('level','WARN','key','success_rate',
      'message', format('Başarı oranı %%%s — uyarı eşiği altında.', v_success_rate));
  END IF;
  IF v_stale_pending > 0 THEN
    IF v_status = 'OK' THEN v_status := 'WARN'; END IF;
    v_alerts := v_alerts || jsonb_build_object('level','WARN','key','stale_pending',
      'message', format('%s ödeme 15 dk+ askıda%s.', v_stale_pending,
        CASE WHEN v_sweeper THEN ' (süpürücü aktif)' ELSE ' — süpürücü KAPALI' END));
  END IF;
  IF v_avg_capture IS NOT NULL AND v_avg_capture > c_capture_warn_s THEN
    IF v_status = 'OK' THEN v_status := 'WARN'; END IF;
    v_alerts := v_alerts || jsonb_build_object('level','WARN','key','avg_capture',
      'message', format('Ortalama tahsilat süresi %s sn — yavaş.', v_avg_capture));
  END IF;

  RETURN jsonb_build_object(
    'window_hours', v_win,
    'succeeded', v_succeeded,
    'failed', v_failed,
    'success_rate', v_success_rate,
    'pending_now', v_pending_now,
    'blocked_now', v_blocked_now,
    'stale_pending', v_stale_pending,
    'avg_capture_seconds', v_avg_capture,
    'sweeper_enabled', v_sweeper,
    'invariants', v_inv,
    'status', v_status,
    'alerts', v_alerts,
    'checked_at', now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_payment_health(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payment_health(integer) TO authenticated;
