-- ═══════════════════════════════════════════════════════════════════════════
-- HAFTALIK İŞLETME ÖZETİ (köprü paketi #5 — kurucu kararları, 9 Ağu 2026)
-- Her Pazartesi 06:00 (TR) gece işi: geçen haftanın rezervasyon sayısı,
-- tahsilatı, önceki hafta kıyası ve en yoğun gün/saat tesis başına hesaplanır,
-- sahibe bildirim düşer. Panel yalnız OKUR. Prensip 7.7: kendi doğrulaması var.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.owner_weekly_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pitch_id, week_start)
);
ALTER TABLE public.owner_weekly_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ows_staff_select ON public.owner_weekly_summaries;
CREATE POLICY ows_staff_select ON public.owner_weekly_summaries
  FOR SELECT TO authenticated USING (public.can_staff_pitch(pitch_id));
GRANT SELECT ON public.owner_weekly_summaries TO authenticated;

CREATE OR REPLACE FUNCTION public.haftalik_ozet_uret()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public', 'pg_temp' AS $$
DECLARE
  p record;
  ws date := (date_trunc('week', (now() AT TIME ZONE 'Europe/Istanbul')))::date - 7;
  v_rez int; v_tah numeric; v_orez int; v_otah numeric;
  v_gun int; v_saat int;
BEGIN
  FOR p IN SELECT id, name, owner_id FROM public.pitches WHERE coalesce(is_demo, false) = false LOOP
    v_gun := NULL; v_saat := NULL;

    SELECT count(*)::int INTO v_rez FROM public.pitch_bookings b
     WHERE b.pitch_id = p.id AND b.status <> 'CANCELLED'
       AND b.booking_date >= ws AND b.booking_date < ws + 7;

    SELECT coalesce(sum(bp.amount), 0) INTO v_tah
      FROM public.booking_payments bp
      JOIN public.pitch_bookings b ON b.id = bp.booking_id
     WHERE b.pitch_id = p.id
       AND (bp.created_at AT TIME ZONE 'Europe/Istanbul')::date >= ws
       AND (bp.created_at AT TIME ZONE 'Europe/Istanbul')::date < ws + 7;

    SELECT count(*)::int INTO v_orez FROM public.pitch_bookings b
     WHERE b.pitch_id = p.id AND b.status <> 'CANCELLED'
       AND b.booking_date >= ws - 7 AND b.booking_date < ws;

    SELECT coalesce(sum(bp.amount), 0) INTO v_otah
      FROM public.booking_payments bp
      JOIN public.pitch_bookings b ON b.id = bp.booking_id
     WHERE b.pitch_id = p.id
       AND (bp.created_at AT TIME ZONE 'Europe/Istanbul')::date >= ws - 7
       AND (bp.created_at AT TIME ZONE 'Europe/Istanbul')::date < ws;

    SELECT (EXTRACT(isodow FROM b.booking_date))::int INTO v_gun
      FROM public.pitch_bookings b
     WHERE b.pitch_id = p.id AND b.status <> 'CANCELLED'
       AND b.booking_date >= ws AND b.booking_date < ws + 7
     GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1;

    SELECT EXTRACT(hour FROM b.start_time)::int INTO v_saat
      FROM public.pitch_bookings b
     WHERE b.pitch_id = p.id AND b.status <> 'CANCELLED'
       AND b.booking_date >= ws AND b.booking_date < ws + 7
     GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1;

    INSERT INTO public.owner_weekly_summaries (pitch_id, week_start, data)
    VALUES (p.id, ws, jsonb_build_object(
      'rezervasyon', v_rez, 'tahsilat', v_tah,
      'onceki_rezervasyon', v_orez, 'onceki_tahsilat', v_otah,
      'yogun_gun', v_gun, 'yogun_saat', v_saat))
    ON CONFLICT (pitch_id, week_start)
    DO UPDATE SET data = EXCLUDED.data, created_at = now();

    -- Boş haftada bildirim SPAM'i yok: yalnız hareket varsa haber verilir.
    IF p.owner_id IS NOT NULL AND (v_rez > 0 OR v_tah > 0) THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, is_read, deep_link)
      VALUES (
        p.owner_id,
        'Haftalık işletme özetin hazır 📊',
        p.name || ': geçen hafta ' || v_rez || ' rezervasyon · ' || round(v_tah)::text || ' ₺ tahsilat. Ayrıntı panelde.',
        'owner_weekly_summary', false, 'oyna://owner'
      );
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.haftalik_ozet_uret() FROM PUBLIC, anon, authenticated;

-- Pazartesi 06:00 TR = 03:00 UTC (TR sabit UTC+3).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'haftalik_ozet') THEN
    PERFORM cron.schedule('haftalik_ozet', '0 3 * * 1', 'SELECT public.haftalik_ozet_uret()');
  END IF;
END $$;

-- İlk doldurma: geçen haftanın özeti hemen üretilir (kart boş doğmasın).
SELECT public.haftalik_ozet_uret();

-- Kendi doğrulaması (prensip 7.7)
DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public.owner_weekly_summaries') IS NULL THEN
    RAISE EXCEPTION 'DOGRULAMA: owner_weekly_summaries olusmadi';
  END IF;
  IF NOT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='owner_weekly_summaries') THEN
    RAISE EXCEPTION 'DOGRULAMA: RLS kapali';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'haftalik_ozet') THEN
    RAISE EXCEPTION 'DOGRULAMA: cron isi kurulmadi';
  END IF;
  SELECT count(*) INTO n FROM public.owner_weekly_summaries;
  RAISE NOTICE 'HAFTALIK OZET kuruldu — % tesis ozeti', n;
END $$;
