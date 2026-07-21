-- Stüdyo telemetrisi — anonim kullanım sayaçları (KİŞİSEL İÇERİK YAZILMAZ)
-- ─────────────────────────────────────────────────────────────────────────────
-- Yalnız "ne oldu" (olay adı) + kim (user_id) + ne zaman tutulur. Taktik verisi,
-- isimler, çizimler ASLA kaydedilmez. Amaç: hangi özelliğin kullanıldığını görüp
-- kararları veriye dayandırmak. Yazım tek kapıdan (RPC, allowlist) yapılır.

CREATE TABLE IF NOT EXISTS public.studio_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT auth.uid(),
  event      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_studio_events_event_time
  ON public.studio_events (event, created_at DESC);

-- RLS açık, İSTEMCİYE hiçbir doğrudan politika verilmez: tablo yalnız aşağıdaki
-- SECURITY DEFINER RPC üzerinden yazılır; okuma yalnız service_role (analitik).
ALTER TABLE public.studio_events ENABLE ROW LEVEL SECURITY;

-- Allowlist'li tek yazım kapısı — tanınmayan olay adı sessizce yok sayılır.
CREATE OR REPLACE FUNCTION public.log_studio_event(p_event text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF; -- oturum yoksa sessiz geç
  IF p_event NOT IN ('studio_open','tactic_save','tactic_play','sample_load') THEN
    RETURN; -- allowlist dışı → yok say (çöp veri girmez)
  END IF;
  INSERT INTO public.studio_events (user_id, event) VALUES (v_uid, p_event);
END $$;

REVOKE EXECUTE ON FUNCTION public.log_studio_event(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_studio_event(text) TO authenticated;
