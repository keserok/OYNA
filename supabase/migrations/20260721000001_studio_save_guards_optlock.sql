-- Taktik kayıt kapısı sağlamlaştırma (save_team_tactic)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Payload doğrulama: bozuk/şişkin veri KAPIDA reddedilir (DB çöplenmesini ve
--    tek bozuk kaydın ekranı kırmasını önler). Geçerli taktikler küçük JSON'dur;
--    tavanlar (drawings 200KB, toplam 500KB) gerçek kullanımın çok üstündedir.
-- 2) İyimser kilit (opt-in): istemci p_payload->>'expectedUpdatedAt' gönderirse
--    ve bu değer kayıttaki "updatedAt" ile uyuşmuyorsa CONFLICT verilir — iki
--    yöneticinin aynı taktiği aynı anda düzenleyip birbirinin emeğini SESSİZCE
--    silmesi biter. Alan yoksa davranış AYNEN eskisi gibi (geriye tam uyumlu).
-- 3) Dönüşe 'updated_at' eklenir ki istemci kaydettikten sonra beklenen damgayı
--    tazeleyebilsin (kendi kaydıyla çakışmasın).

CREATE OR REPLACE FUNCTION public.save_team_tactic(p_team_id uuid, p_tactic_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_status   text;
  v_id       uuid;
  v_updated  timestamptz;
  v_name     text := coalesce(p_payload->>'name', 'Taktik');
  v_my_name  text;
  v_team     record;
  v_admin    uuid;
  v_existing record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- (1) Girdi doğrulama — bozuk/şişkin payload kapıda reddedilir
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'BAD_PAYLOAD: Geçersiz taktik verisi.';
  END IF;
  IF jsonb_typeof(coalesce(p_payload->'slots', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_payload->'drawings', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_payload->'subs', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_payload->'opponents', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'BAD_PAYLOAD: Diziliş/çizim verisi hatalı.';
  END IF;
  IF length(coalesce(p_payload->'drawings', '[]'::jsonb)::text) > 200000 THEN
    RAISE EXCEPTION 'TOO_LARGE: Çizimler çok büyük — sadeleştir.';
  END IF;
  IF length(p_payload::text) > 500000 THEN
    RAISE EXCEPTION 'TOO_LARGE: Taktik verisi çok büyük.';
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF NOT public._is_team_member(p_team_id, v_uid) THEN
      RAISE EXCEPTION 'NOT_MEMBER: Bu takımın üyesi değilsin.';
    END IF;
    v_status := CASE WHEN public._is_team_admin(p_team_id, v_uid)
                     THEN 'APPROVED' ELSE 'PENDING_APPROVAL' END;
  ELSE
    v_status := 'APPROVED';
  END IF;

  IF p_tactic_id IS NOT NULL THEN
    SELECT id, "userId", status, "updatedAt" INTO v_existing FROM public.tactics WHERE id = p_tactic_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Taktik bulunamadı.'; END IF;
    IF NOT (v_existing."userId" = v_uid
            OR (v_existing.status = 'APPROVED' AND p_team_id IS NOT NULL
                AND public._is_team_admin(p_team_id, v_uid))) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Bu taktiği düzenleme yetkin yok.';
    END IF;
    -- (2) İyimser kilit (opt-in): beklenen damga uyuşmuyorsa çakışma
    IF p_payload ? 'expectedUpdatedAt'
       AND coalesce(p_payload->>'expectedUpdatedAt', '') <> ''
       AND v_existing."updatedAt" IS DISTINCT FROM (p_payload->>'expectedUpdatedAt')::timestamptz THEN
      RAISE EXCEPTION 'CONFLICT: Taktik sen açtıktan sonra değişti.';
    END IF;
    UPDATE public.tactics SET
      name        = v_name,
      "teamId"    = p_team_id,
      "teamName"  = (SELECT name FROM public.teams WHERE id = p_team_id),
      size        = coalesce(p_payload->>'size', size),
      formation   = coalesce(p_payload->>'formation', formation),
      slots       = coalesce(p_payload->'slots', 'null'::jsonb)::text,
      subs        = coalesce(p_payload->'subs', '[]'::jsonb)::text,
      opponents   = coalesce(p_payload->'opponents', '[]'::jsonb)::text,
      drawings    = coalesce(p_payload->'drawings', '[]'::jsonb)::text,
      "captainId" = p_payload->>'captainId',
      notes       = coalesce(p_payload->>'notes', notes),
      mentality   = coalesce(p_payload->>'mentality', mentality),
      tempo       = coalesce(p_payload->>'tempo', tempo),
      identity    = coalesce(p_payload->>'identity', identity),
      status      = CASE WHEN "teamId" IS NOT DISTINCT FROM p_team_id
                         THEN status ELSE v_status END,
      "updatedAt" = timezone('utc', now())
    WHERE id = p_tactic_id
    RETURNING id, status, "updatedAt" INTO v_id, v_status, v_updated;
  ELSE
    INSERT INTO public.tactics
      ("userId", mode, name, "teamId", "teamName", size, formation,
       slots, subs, opponents, drawings, "captainId", notes,
       mentality, tempo, identity, status, "proposedBy")
    VALUES
      (v_uid, 'FARAZI', v_name, p_team_id,
       (SELECT name FROM public.teams WHERE id = p_team_id),
       p_payload->>'size', p_payload->>'formation',
       coalesce(p_payload->'slots', 'null'::jsonb)::text,
       coalesce(p_payload->'subs', '[]'::jsonb)::text,
       coalesce(p_payload->'opponents', '[]'::jsonb)::text,
       coalesce(p_payload->'drawings', '[]'::jsonb)::text,
       p_payload->>'captainId', p_payload->>'notes',
       p_payload->>'mentality', p_payload->>'tempo', p_payload->>'identity',
       v_status,
       CASE WHEN v_status = 'PENDING_APPROVAL' THEN v_uid ELSE NULL END)
    RETURNING id, "updatedAt" INTO v_id, v_updated;
  END IF;

  IF v_status = 'PENDING_APPROVAL' AND p_team_id IS NOT NULL THEN
    SELECT name INTO v_team FROM public.teams WHERE id = p_team_id;
    SELECT coalesce(full_name, name::text, 'Bir oyuncu') INTO v_my_name
    FROM public.profiles WHERE id = v_uid;
    FOR v_admin IN
      SELECT tm.user_id FROM public.team_members tm
      WHERE tm.team_id = p_team_id AND tm.is_active = true
        AND tm.role IN ('CAPTAIN','ADMIN')
    LOOP
      PERFORM public._notify_team_event(
        v_admin, 'tactic_proposed', v_uid, p_team_id,
        jsonb_build_object('sender_name', v_my_name, 'team_name', v_team.name, 'tactic_name', v_name),
        true, 'oyna://tactic/' || v_id::text);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'tactic_id', v_id, 'status', v_status, 'updated_at', v_updated);
END $function$;

REVOKE EXECUTE ON FUNCTION public.save_team_tactic(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_team_tactic(uuid,uuid,jsonb) TO authenticated;
