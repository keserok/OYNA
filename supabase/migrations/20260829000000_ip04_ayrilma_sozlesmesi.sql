-- ============================================================================
-- IP-04 — Maçtan ayrılma sözleşmesi
-- İade kademesi, geç ayrılma yaptırımı, kaptana bildirim ve
-- "önizleme = gerçek iade" eşitliği.
--
-- NEDEN (üç ayrı para/dürüstlük kusuru):
--
--  • BULGU-077 — Maçtan ayrılmanın ZAMAN KADEMESİ hiç yoktu. Maça 1 saat kala
--    ayrılan oyuncu da ödediğinin tamamını geri alıyordu. Oysa sözleşme
--    (sozlesmeler/oyuncu/01-kullanim-sartlari.md md.6.1 ve
--    05-mesafeli-satis-iptal-iade.md md.4) kullanıcı kaynaklı iptallerde
--    ÜÇ KADEMELİ bir merdiven taahhüt ediyor. Kod bu taahhüdün tersine, her
--    zaman %100 iade ediyordu; kaptan kadrosunda kapatamayacağı bir delikle
--    kalıyor, geç ayrılanın hiçbir sorumluluğu olmuyordu.
--
--  • BULGU-071 — Kadrodan oyuncu ayrılınca kaptana hiçbir bildirim gitmiyordu.
--    Yalnız arkadaşını slota sokan kişi (slot sahibi) haberdar oluyordu;
--    maçı yöneten kişi kadrosunun eksildiğini ancak lobiye girerse görüyordu.
--
--  • ÖNİZLEME/GERÇEK AYRIŞMASI — preview_leave_match, purchasedBy'sız (legacy)
--    slotta oturan kullanıcıya kalan bakiyeyi "iade edilecek" diye gösteriyor,
--    leave_public_match_slot ise o dalda v_release_count'u hiç artırmadığı için
--    tek kuruş iade yazmıyordu. Modal 150₺ vaat edip cüzdana 0₺ düşüyordu.
--
-- ÇÖZÜM: _leave_match_quote() TEK KAYNAK. Hem önizleme (preview_leave_match)
-- hem gerçek işlem (leave_public_match_slot) aynı fonksiyondan besleniyor;
-- modalda yazan rakamla cüzdana düşen rakam artık matematiksel olarak
-- ayrışamaz.
--
-- KADEME NEREDEN GELİYOR: Yeni bir eşik anahtarı AÇILMADI. Kademe, rezervasyon
-- iptalinin de kullandığı tek kaynaktan okunuyor:
--   public._pitch_refund_tiers(pitch_id) → (full_hours, half_hours, half_pct)
--   (20260729000000_s3_refund_tiers_ssot.sql; canlı varsayılan 24s / 6s / %50,
--    tesis bazında `pitches.refund_*` ile ezilebilir).
-- Böylece "saha kiralama iptali" ile "maçtan ayrılma" aynı merdiveni kullanır;
-- tesis kademesini değiştirdiğinde her iki akış birlikte değişir (K-0.3).
--
-- YAPTIRIM: Tam iade penceresi kapandıktan sonra (hours < full_hours) ayrılan
-- oyuncunun güvenilirlik puanı fairplay_late_cancel_penalty kadar düşer —
-- kaptan iptalindeki 24 saat kuralıyla bilerek aynı eşik. Bu anahtar
-- 20260708000001'den beri tanımlıydı, açıklaması zaten "24 saatten geç
-- iptalde düşülen puan" diyordu ve bugüne dek hiçbir yerde kullanılmıyordu;
-- ilk tüketicisi bu migration.
--
-- PSP KESİNTİSİ YOK: _booking_cancel_quote iadeden ödeme sağlayıcı bedelini
-- düşüyor; maç ayrılmasında bu kesinti UYGULANMADI (mevcut davranış korundu,
-- kullanıcı lehine). Değiştirmek ayrı bir para kararıdır.
--
-- KAPSAM NOTU — YEDEK TERFİSİ GERİ GETİRİLMEDİ: 20260826000002 ödemesiz yedek
-- terfisini kaldırdı (yer açılınca ilk yedeğe satın alma bildirimi gider).
-- Bu migration o kararı korur; terfi mantığı ve match_reserve_promoted
-- bildirimi BİLİNÇLİ olarak eklenmemiştir.
-- ============================================================================

-- ─── 1) _leave_match_quote — ayrılma sözleşmesinin TEK KAYNAĞI ──────────────
-- Slot bazlı iade hesabı 20260826000002'deki preview_leave_match'ten BİREBİR
-- alındı (slot başına iade + legacy tekli katılım dalı); üzerine sözleşmedeki
-- zaman kademesi ve yaptırım eklendi.
CREATE OR REPLACE FUNCTION public._leave_match_quote(p_match_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_starts_at timestamptz; v_pitch_id uuid;
  v_penalty numeric := public.get_config_number('fairplay_late_cancel_penalty', 10);
  t RECORD;
  v_paid numeric; v_already numeric; v_remaining numeric;
  v_price numeric; v_release_count int; v_base numeric;
  v_occupies boolean; v_hours numeric; v_in_squad boolean;
  v_pct numeric; v_refundable numeric; v_late boolean;
BEGIN
  SELECT starts_at, pitch_id, COALESCE(price, 0)
    INTO v_starts_at, v_pitch_id, v_price
    FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;

  -- İade kademesi: rezervasyon iptaliyle AYNI kaynak (tesis override'ı dâhil).
  SELECT * INTO t FROM public._pitch_refund_tiers(v_pitch_id);

  -- Ödenen / zaten iade edilen → net kalan (iade tavanı)
  SELECT COALESCE(SUM(-amount), 0) INTO v_paid FROM public.wallet_transactions
    WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE';
  SELECT COALESCE(SUM(amount), 0) INTO v_already FROM public.wallet_transactions
    WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
  v_remaining := GREATEST(v_paid - v_already, 0);

  -- Ayrılınca serbest kalacak slotlar: SAHİBİ olduğum ve arkadaşa atanmamış
  -- olanlar. (Arkadaşıma atadığım slot ayrılsam da KALIR — para da kalır.)
  SELECT (SELECT COUNT(*) FROM (
            SELECT s FROM jsonb_array_elements(m.slots) s
            UNION ALL
            SELECT s FROM jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb)) s
          ) q(s)
          WHERE q.s->>'purchasedBy' = p_user_id::text
            AND (COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') IS NULL
                 OR COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') = p_user_id::text))
  INTO v_release_count
  FROM public.matches m WHERE m.id = p_match_id;

  IF v_release_count > 0 THEN
    v_base := LEAST(v_price * v_release_count, v_remaining);
  ELSE
    -- Legacy tekli katılım: sahada oturduğum purchasedBy'sız slot varsa kalan iade.
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.matches m,
        LATERAL (SELECT s FROM jsonb_array_elements(m.slots) s
                 UNION ALL
                 SELECT s FROM jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb)) s) q(s)
      WHERE m.id = p_match_id
        AND COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') = p_user_id::text
        AND COALESCE(q.s->>'purchasedBy','') = ''
    ) THEN v_remaining ELSE 0 END INTO v_base;
  END IF;
  v_base := COALESCE(v_base, 0);

  -- Sahada fiilen oturuyor muyum? (Misafir de sahadadır: para ödemez ama
  -- geç ayrılırsa kadroda aynı deliği açar.)
  SELECT EXISTS (
    SELECT 1 FROM public.matches m,
      LATERAL (SELECT s FROM jsonb_array_elements(m.slots) s
               UNION ALL
               SELECT s FROM jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb)) s) q(s)
    WHERE m.id = p_match_id
      AND COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') = p_user_id::text
  ) INTO v_occupies;

  -- Yedek kulübesindeki oyuncu kadroda değildir: ne kesinti ne cezası olur.
  v_in_squad := v_occupies OR v_release_count > 0;

  -- Zaman hesabı — match_cancel_by_captain (20260716000001:255-257) ile aynı
  -- yöntem. starts_at NULL ise güvenli taraf: tam iade, ceza yok.
  v_hours := CASE WHEN v_starts_at IS NULL THEN 999
                  ELSE EXTRACT(EPOCH FROM (v_starts_at - timezone('utc', now()))) / 3600 END;

  -- Sözleşmedeki üç kademe (_booking_cancel_quote ile BİREBİR aynı ifade).
  -- Kadroda değilse (yedek) kesinti uygulanmaz: zaten ödemesi yok.
  v_pct := CASE WHEN NOT v_in_squad          THEN 100
                WHEN v_hours >= t.full_hours THEN 100
                WHEN v_hours >= t.half_hours THEN t.half_pct
                ELSE 0 END;
  v_refundable := round(v_base * v_pct / 100.0, 2);

  -- Yaptırım: tam iade penceresi kapandıktan sonra ayrılan kadro oyuncusu.
  v_late := v_in_squad AND v_hours < t.full_hours;

  RETURN jsonb_build_object(
    'refundable',       v_refundable,
    'paid',             round(v_paid, 2),
    'already_refunded', (v_already > 0),
    'in_squad',         v_in_squad,
    'hours_to_start',   round(v_hours, 2),
    'refund_pct',       v_pct,
    'full_hours',       t.full_hours,
    'half_hours',       t.half_hours,
    'half_pct',         t.half_pct,
    'late',             v_late,
    'penalty',          CASE WHEN v_late THEN v_penalty ELSE 0 END,
    'forfeited',        round(GREATEST(v_base - v_refundable, 0), 2)
  );
END;
$$;
REVOKE ALL ON FUNCTION public._leave_match_quote(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._leave_match_quote(uuid, uuid) TO service_role;

-- ─── 2) preview_leave_match — hesabı yardımcıya devreder ────────────────────
-- Gövdedeki hesap tamamen SİLİNDİ; tahmin ikizi bırakılmadı. Eski üç alan
-- (refundable / paid / already_refunded) adıyla korundu, yenileri eklendi.
CREATE OR REPLACE FUNCTION public.preview_leave_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN public._leave_match_quote(p_match_id, v_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_leave_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_leave_match(uuid) TO authenticated, service_role;

-- ─── 3) leave_public_match_slot — kademe + yaptırım + kaptana bildirim ──────
-- Gövde 20260826000002:702-846'dan BİREBİR kopyalandı. Değişenler yalnız:
--   (a) DECLARE'e sözleşme değişkenleri + v_new_creator YUKARI taşındı
--   (b) FOR UPDATE kilidinden SONRA, slotlar değişmeden önce quote alınır
--   (c) iade bloğu v_refundable'a bağlandı (kademe uygulanır; legacy dal
--       artık gerçekten öder)
--   (d) tam iade penceresi kapandıysa güvenilirlik puanı düşürülür
--   (e) kaptan devri bloğundaki iç DECLARE kaldırıldı (değişken üstte)
--   (f) ayrılma sonrası kaptana match_player_left bildirimi
CREATE OR REPLACE FUNCTION public.leave_public_match_slot(p_match_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_slots JSONB; v_away JSONB; v_reserves JSONB;
    v_creator UUID; v_title text; v_price numeric;
    v_new_slots JSONB := '[]'::jsonb; v_new_away JSONB := '[]'::jsonb;
    v_slot JSONB;
    v_found BOOLEAN := FALSE;
    v_opened BOOLEAN := FALSE;
    v_release_count int := 0;
    v_owner uuid; v_occ uuid;
    v_leaver_name text;
    v_new_reserves JSONB := '[]'::jsonb;
    v_owns_assigned BOOLEAN := FALSE;
    -- (a) IP-04 — ayrılma sözleşmesi
    v_quote jsonb; v_late boolean; v_penalty numeric; v_refundable numeric;
    v_new_creator UUID := NULL;      -- kaptan devri bloğundan YUKARI taşındı
    v_notify_captain uuid; v_open int;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcıyı maçtan çıkaramazsınız.';
    END IF;

    SELECT slots, COALESCE("awaySlots",'[]'::jsonb), "creatorId", COALESCE("reservePlayers",'[]'::jsonb), title, COALESCE(price,0)
    INTO v_slots, v_away, v_creator, v_reserves, v_title, v_price
    FROM public.matches WHERE id = p_match_id FOR UPDATE;

    IF v_slots IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı!'; END IF;

    -- (b) Sözleşme kilitten SONRA, slotlar değişmeden ÖNCE okunur; böylece
    -- kullanıcıya gösterilen önizlemeyle aynı girdiden hesaplanır.
    v_quote      := public._leave_match_quote(p_match_id, p_user_id);
    v_late       := COALESCE((v_quote->>'late')::boolean, false);
    v_penalty    := COALESCE((v_quote->>'penalty')::numeric, 0);
    v_refundable := COALESCE((v_quote->>'refundable')::numeric, 0);

    SELECT COALESCE(name, full_name, 'Oyuncu') INTO v_leaver_name FROM public.profiles WHERE id = p_user_id;

    -- EV SAHİBİ tarafı
    FOR v_slot IN SELECT jsonb_array_elements(v_slots) LOOP
        v_owner := NULLIF(v_slot->>'purchasedBy','')::uuid;
        v_occ   := COALESCE(NULLIF(v_slot->>'occupant','')::uuid, NULLIF(v_slot->'player'->>'id','')::uuid);
        IF v_owner = p_user_id AND v_occ IS NOT NULL AND v_occ <> p_user_id THEN
            v_owns_assigned := TRUE; -- arkadaşı oynuyor: slot KALIR
        ELSIF v_owner = p_user_id THEN
            v_found := TRUE; v_opened := TRUE; v_release_count := v_release_count + 1;
            v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
                      || jsonb_build_object('status','OPEN');
        ELSIF v_occ = p_user_id THEN
            v_found := TRUE;
            IF v_owner IS NOT NULL THEN
                -- Misafir ayrılıyor: slot alıcının rezervine döner.
                v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
                          || jsonb_build_object('status','TAKEN','assignmentStatus','RESERVED');
                PERFORM public._notify_team_event(v_owner, 'match_slot_vacated', p_user_id, NULL,
                  jsonb_build_object('player_name', v_leaver_name, 'match_title', COALESCE(v_title,'Maç')),
                  false, 'oyna://match/' || p_match_id::text);
            ELSE
                v_opened := TRUE;
                v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
                          || jsonb_build_object('status','OPEN');
            END IF;
        END IF;
        v_new_slots := v_new_slots || jsonb_build_array(v_slot);
    END LOOP;

    -- DEPLASMAN tarafı
    FOR v_slot IN SELECT jsonb_array_elements(v_away) LOOP
        v_owner := NULLIF(v_slot->>'purchasedBy','')::uuid;
        v_occ   := COALESCE(NULLIF(v_slot->>'occupant','')::uuid, NULLIF(v_slot->'player'->>'id','')::uuid);
        IF v_owner = p_user_id AND v_occ IS NOT NULL AND v_occ <> p_user_id THEN
            v_owns_assigned := TRUE;
        ELSIF v_owner = p_user_id THEN
            v_found := TRUE; v_opened := TRUE; v_release_count := v_release_count + 1;
            v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
                      || jsonb_build_object('status','OPEN');
        ELSIF v_occ = p_user_id THEN
            v_found := TRUE;
            IF v_owner IS NOT NULL THEN
                v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
                          || jsonb_build_object('status','TAKEN','assignmentStatus','RESERVED');
                PERFORM public._notify_team_event(v_owner, 'match_slot_vacated', p_user_id, NULL,
                  jsonb_build_object('player_name', v_leaver_name, 'match_title', COALESCE(v_title,'Maç')),
                  false, 'oyna://match/' || p_match_id::text);
            ELSE
                v_opened := TRUE;
                v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
                          || jsonb_build_object('status','OPEN');
            END IF;
        END IF;
        v_new_away := v_new_away || jsonb_build_array(v_slot);
    END LOOP;

    -- Sahada bulunamadıysa: yedek listesinden çıkma denemesi.
    -- (Yedek çıkışı burada erken RETURN eder: ne kesinti ne ceza — doğru davranış.)
    IF NOT v_found THEN
        FOR v_slot IN SELECT jsonb_array_elements(v_reserves) LOOP
            IF NULLIF(v_slot->>'id','')::uuid IS DISTINCT FROM p_user_id THEN
                v_new_reserves := v_new_reserves || jsonb_build_array(v_slot);
            ELSE
                v_found := TRUE;
            END IF;
        END LOOP;
        IF v_found THEN
            UPDATE public.matches SET "reservePlayers" = v_new_reserves WHERE id = p_match_id;
            RETURN;
        END IF;
        RAISE EXCEPTION 'Kullanıcı maça kayıtlı değil!';
    END IF;

    -- (c) İade: tutarı ARTIK SÖZLEŞME belirler (zaman kademesi uygulanmış
    -- hâlde). Önizlemede ne yazdıysa cüzdana o düşer.
    -- _match_refund_partial ayrıca (ödenen − iade) tavanını uygular.
    IF v_refundable > 0 THEN
        PERFORM public._match_refund_partial(p_user_id, p_match_id, v_refundable);
    END IF;

    -- (d) Geç ayrılma yaptırımı — kaptan iptaliyle aynı eşik: tam iade
    -- penceresi kapandıysa güvenilirlik puanı düşer.
    -- CHECK (0..100) kısıtı GREATEST ile korunur.
    IF v_late AND v_penalty > 0 THEN
        UPDATE public.profiles
           SET reliability_score = GREATEST(0, COALESCE(reliability_score, 100) - v_penalty::int)
         WHERE id = p_user_id;
    END IF;

    -- (e) Kaptan devri (kalan gerçek oyunculardan en güvenilire).
    IF v_creator = p_user_id THEN
        SELECT p.id INTO v_new_creator
        FROM (
            SELECT COALESCE(NULLIF(s->>'occupant',''), s->'player'->>'id')::UUID AS id
            FROM jsonb_array_elements(v_new_slots) s
            UNION ALL
            SELECT COALESCE(NULLIF(s->>'occupant',''), s->'player'->>'id')::UUID AS id
            FROM jsonb_array_elements(v_new_away) s
        ) active_players
        JOIN public.profiles p ON p.id = active_players.id
        WHERE active_players.id IS NOT NULL AND active_players.id <> p_user_id
        ORDER BY p.reliability_score DESC NULLS LAST, p.created_at ASC
        LIMIT 1;

        IF v_new_creator IS NOT NULL THEN
            UPDATE public.matches SET "creatorId" = v_new_creator WHERE id = p_match_id;
            INSERT INTO public.notifications (user_id, title, body, type_key)
            VALUES (v_new_creator, '👑 Yeni Kaptan Sensin!',
                'Eski kaptan ayrıldığı için yüksek güvenilirlik skorunla bu maçın yeni kaptanı seçildin.',
                'SYSTEM');
        END IF;
    END IF;

    UPDATE public.matches SET slots = v_new_slots, "awaySlots" = v_new_away WHERE id = p_match_id;

    -- Katılımcı indeksi: hâlâ atanmış slot sahibi değilse 'left'.
    IF NOT v_owns_assigned THEN
        UPDATE public.match_participants SET status = 'left'
        WHERE match_id = p_match_id AND user_id = p_user_id;
    END IF;

    -- (f) BULGU-071 — Kaptan kadrosunun eksildiğini bildirimle öğrenir.
    -- Kaptan devri olduysa haber YENİ kaptana gider; ayrılan kişinin kendisine
    -- gitmez. Bildirim asla ana işlemi düşürmez.
    BEGIN
        v_notify_captain := COALESCE(v_new_creator, v_creator);
        IF v_notify_captain IS NOT NULL AND v_notify_captain IS DISTINCT FROM p_user_id THEN
            SELECT count(*) INTO v_open FROM (
                SELECT jsonb_array_elements(v_new_slots) AS s
                UNION ALL
                SELECT jsonb_array_elements(v_new_away) AS s
            ) q WHERE q.s->>'status' = 'OPEN';

            PERFORM public._notify_team_event(
                v_notify_captain, 'match_player_left', p_user_id, NULL,
                jsonb_build_object(
                    'player_name', v_leaver_name,
                    'match_title', COALESCE(v_title, 'Maç'),
                    'open', v_open::text),
                false, 'oyna://match/' || p_match_id::text);
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Yer açıldıysa ilk yedeğe satın alma çağrısı (ödemesiz terfi YOK).
    IF v_opened THEN PERFORM public._notify_first_reserve(p_match_id); END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.leave_public_match_slot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_public_match_slot(uuid, uuid) TO authenticated, service_role;

-- ─── 4) Bildirim şablonu — kaptana "kadrondan oyuncu ayrıldı" ───────────────
-- Kardeşleriyle (match_slot_vacated / match_spot_opened) aynı desende, ama
-- KAPATILAMAZ: kaptanın kadrosundaki deliği öğrenememesi maçın iptaline kadar
-- gidebilir; bu sessiz mağduriyet kabul edilemez.
INSERT INTO public.notification_templates
  (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT 'match_player_left', 'Kadrodan ayrılma', 'Kadrondan bir oyuncu ayrıldı',
       '{player_name}, "{match_title}" maçından ayrıldı. Kadroda {open} boş yer var.',
       'MATCH', true, false, 34
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE type_key = 'match_player_left');
