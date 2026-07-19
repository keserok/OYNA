-- ═══════════════════════════════════════════════════════════════════════════
-- COLD-START — talep sinyalleri (boş şehir/bölge "beni haberdar et" + "saha öner")
-- ---------------------------------------------------------------------------
-- Amaç: Bir oyuncu, kendi şehrinde/bölgesinde HİÇ onaylı saha olmadığında
-- (cold-start) sadece "sonuç yok" görmemeli. İki gerçek talep sinyali:
--   • NOTIFY  — "burada saha açılınca beni haberdar et"
--   • SUGGEST — "şu sahayı da ekleyin" (arz cold-start'ı için owner-lead)
-- DÜRÜSTLÜK: UI ancak sinyal GERÇEKTEN kalıcı yazıldıysa "haberdar edeceğiz"
-- der. Bu tablo o vaadin arkasındaki kayıttır (yoksa vaporware olurdu).
-- Yazma yalnız RPC üzerinden (SECURITY DEFINER); doğrudan INSERT kapalı.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pitch_demand_signals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signal_type  text NOT NULL CHECK (signal_type IN ('NOTIFY','SUGGEST')),
  city         text,
  district     text,
  pitch_name   text,          -- SUGGEST: önerilen saha adı
  contact      text,          -- opsiyonel: önerilen sahanın iletişimi
  note         text,          -- opsiyonel serbest not
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- NOTIFY kişi başına şehir/ilçe bazında TEK (idempotent "haberdar et").
-- lower(coalesce(...)) → "Ordu" ile "ordu" aynı; NULL şehir '' sayılır.
CREATE UNIQUE INDEX IF NOT EXISTS pitch_demand_notify_uniq
  ON public.pitch_demand_signals (user_id, lower(coalesce(city,'')), lower(coalesce(district,'')))
  WHERE signal_type = 'NOTIFY' AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pitch_demand_created_idx
  ON public.pitch_demand_signals (created_at DESC);

ALTER TABLE public.pitch_demand_signals ENABLE ROW LEVEL SECURITY;

-- Okuma: admin (talep panosu) veya kullanıcının kendi sinyalleri.
DROP POLICY IF EXISTS pitch_demand_read ON public.pitch_demand_signals;
CREATE POLICY pitch_demand_read ON public.pitch_demand_signals
  FOR SELECT USING (
    public.is_admin() OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

-- Doğrudan yazma politikası YOK → yalnız SECURITY DEFINER RPC yazabilir.
GRANT SELECT ON public.pitch_demand_signals TO authenticated;

-- ── RPC: talep sinyali kaydet ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_demand_signal(
  p_type       text,
  p_city       text DEFAULT NULL,
  p_district   text DEFAULT NULL,
  p_pitch_name text DEFAULT NULL,
  p_contact    text DEFAULT NULL,
  p_note       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_type text := upper(btrim(coalesce(p_type, '')));
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: giriş gerekli.' USING ERRCODE = '28000';
  END IF;
  IF v_type NOT IN ('NOTIFY', 'SUGGEST') THEN
    RAISE EXCEPTION 'INVALID_TYPE: geçersiz sinyal türü.';
  END IF;
  IF v_type = 'SUGGEST' AND NULLIF(btrim(coalesce(p_pitch_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'PITCH_NAME_REQUIRED: önerilen saha adı gerekli.';
  END IF;

  INSERT INTO public.pitch_demand_signals(
    user_id, signal_type, city, district, pitch_name, contact, note
  ) VALUES (
    v_uid, v_type,
    NULLIF(btrim(coalesce(p_city, '')), ''),
    NULLIF(btrim(coalesce(p_district, '')), ''),
    NULLIF(btrim(coalesce(p_pitch_name, '')), ''),
    NULLIF(btrim(coalesce(p_contact, '')), ''),
    NULLIF(btrim(coalesce(p_note, '')), '')
  )
  ON CONFLICT DO NOTHING          -- NOTIFY tekilliği: aynı şehir/ilçe → tekrar yazma
  RETURNING id INTO v_id;

  -- v_id NULL ise NOTIFY zaten kayıtlıydı (idempotent) → duplicate=true.
  RETURN jsonb_build_object('ok', true, 'duplicate', (v_id IS NULL), 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_demand_signal(text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_demand_signal(text,text,text,text,text,text) TO authenticated;
