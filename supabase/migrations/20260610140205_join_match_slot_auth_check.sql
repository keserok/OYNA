-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- DÜZELTME 2: join_match_slot
-- İşlemi yapan kişinin kendisi (veya admin/sunucu) olması zorunlu hale getirildi.
-- Fonksiyon imzası değişmedi; uygulama tarafı etkilenmez.

CREATE OR REPLACE FUNCTION public.join_match_slot(p_match_id uuid, p_user_id uuid, p_slot_id character varying, p_slot_role character varying)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_capacity INT;
    v_current_count INT;
    v_status VARCHAR;
    v_is_banned BOOLEAN;
BEGIN
    -- YETKİ KONTROLÜ: yalnızca kişinin kendisi, admin veya sunucu tarafı
    IF auth.uid() IS NOT NULL
       AND auth.uid() <> p_user_id
       AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') NOT IN ('ADMIN','SUPER_ADMIN') THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcı adına maça kayıt yapamazsınız.';
    END IF;

    -- Ban kontrolü
    SELECT is_banned INTO v_is_banned FROM profiles WHERE id = p_user_id;
    IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

    -- Eşzamanlılık kilidi (Pessimistic Lock)
    SELECT status, total_capacity INTO v_status, v_capacity
    FROM individual_matches WHERE id = p_match_id FOR UPDATE;

    IF v_status != 'GATHERING' THEN RAISE EXCEPTION 'Maç aktif değil!'; END IF;

    -- Slot mükerrerlik kontrolü
    IF EXISTS (SELECT 1 FROM match_registrations WHERE match_id = p_match_id AND slot_id = p_slot_id) THEN
        RAISE EXCEPTION 'Slot doldu!';
    END IF;

    -- Kullanıcı mükerrerlik kontrolü
    IF EXISTS (SELECT 1 FROM match_registrations WHERE match_id = p_match_id AND user_id = p_user_id) THEN
        RAISE EXCEPTION 'Zaten maça kayıtlısınız!';
    END IF;

    SELECT COUNT(*) INTO v_current_count FROM match_registrations WHERE match_id = p_match_id;

    IF v_current_count >= v_capacity THEN
        INSERT INTO waitlist (match_id, user_id) VALUES (p_match_id, p_user_id);
    ELSE
        INSERT INTO match_registrations (match_id, user_id, slot_id, slot_role, payment_status)
        VALUES (p_match_id, p_user_id, p_slot_id, p_slot_role, 'HELD');
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.join_match_slot(uuid, uuid, character varying, character varying) FROM anon;
