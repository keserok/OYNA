-- KB-5: Sağlayıcı-başlatan APPLIED başvurular da süresi dolunca EXPIRED olsun.
-- Eskiden expire_service_requests YALNIZ 'PENDING' işliyordu → apply_to_match_as_provider
-- ile açılan APPLIED başvurular expires_at geçse bile sonsuza dek kalıyor, sağlayıcı
-- panelinde "Başvuruldu" hiç düşmüyordu. İkinci döngü eklendi (aynı cron, ek maliyet yok).

CREATE OR REPLACE FUNCTION public.expire_service_requests()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r RECORD; v_count int := 0;
BEGIN
  -- ── Kaptan-başlatan PENDING talepler (mevcut davranış) ──
  FOR r IN
    SELECT sr.*, m.title AS match_title
    FROM public.service_requests sr
    LEFT JOIN public.matches m ON m.id = sr.match_id
    WHERE sr.status = 'PENDING' AND sr.expires_at IS NOT NULL AND sr.expires_at < now()
    FOR UPDATE OF sr SKIP LOCKED
  LOOP
    UPDATE public.service_requests SET status = 'EXPIRED', cancelled_at = now() WHERE id = r.id;
    IF r.payment_intent_id IS NOT NULL THEN
      UPDATE public.payment_intents
      SET status = 'VOIDED', voided_at = now(), void_reason = 'SERVICE_EXPIRED'
      WHERE id = r.payment_intent_id AND status IN ('PENDING','BLOCKED');
    END IF;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (r.requested_by, 'Talep yanıtsız kaldı ⏳',
            COALESCE(r.match_title,'Maçın') || ' için gönderdiğin ' ||
            CASE WHEN r.provider_type = 'GK' THEN 'kaleci' ELSE 'hakem' END ||
            ' talebi süresi doldu. Blokajın iade edildi — sana uygun diğer sağlayıcılara göz at.',
            'service_request_expired', r.match_id, 'oyna://match/' || r.match_id);
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (r.provider_id, 'Bir talebi kaçırdın',
            COALESCE(r.match_title,'Bir maç') || ' için gelen ' || r.fee ||
            '₺ tutarındaki talep yanıtlanmadığı için süresi doldu.',
            'service_request_expired', r.match_id, 'oyna://match/' || r.match_id);
    v_count := v_count + 1;
  END LOOP;

  -- ── KB-5: Sağlayıcı-başlatan APPLIED başvurular ──
  FOR r IN
    SELECT sr.*, m.title AS match_title
    FROM public.service_requests sr
    LEFT JOIN public.matches m ON m.id = sr.match_id
    WHERE sr.status = 'APPLIED' AND sr.expires_at IS NOT NULL AND sr.expires_at < now()
    FOR UPDATE OF sr SKIP LOCKED
  LOOP
    UPDATE public.service_requests SET status = 'EXPIRED', cancelled_at = now() WHERE id = r.id;
    -- APPLIED'de blokaj/fonlama yoktur; yine de intent varsa (defansif) void et.
    IF r.payment_intent_id IS NOT NULL THEN
      UPDATE public.payment_intents
      SET status = 'VOIDED', voided_at = now(), void_reason = 'SERVICE_EXPIRED'
      WHERE id = r.payment_intent_id AND status IN ('PENDING','BLOCKED');
    END IF;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (r.provider_id, 'Başvurun zaman aşımına uğradı ⏳',
            COALESCE(r.match_title,'Bir maç') || ' için gönderdiğin başvuru yanıtsız kaldığı için süresi doldu.',
            'service_request_expired', r.match_id, 'oyna://match/' || r.match_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
