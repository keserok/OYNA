-- ==============================================================================
-- OYNA: Chat (Player↔Captain + Captain↔ServiceProvider) + Player Seek Ads
-- ==============================================================================
-- Bu migration iki şeyi birden yapar:
--   1. Player Seek Ads sistemini in-memory'den Supabase'e taşır.
--   2. İki sınırlı sohbet türünü uçtan uca hayata geçirir:
--      (a) Kaptan ↔ Oyuncu  — "Top Oyna / Takıma Katıl" başvurusu kabul edilince
--      (b) Kaptan ↔ Servis Sağlayıcı — Kaleci/Hakem teklifi kabul edilince
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PLAYER SEEK ADS (Kaptanın oyuncu arama ilanı)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_seek_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creator_name VARCHAR(120) NOT NULL,
    creator_avatar TEXT,
    pitch_id UUID REFERENCES public.pitches(id) ON DELETE SET NULL,
    pitch_name VARCHAR(200) NOT NULL,
    match_date DATE,
    match_time TIME,
    positions_needed TEXT[] NOT NULL DEFAULT '{}',
    difficulty VARCHAR(20) NOT NULL DEFAULT 'Rahat' CHECK (difficulty IN ('Rahat','Ciddi','Taktiksel')),
    format VARCHAR(10) NOT NULL DEFAULT '7v7',
    duration VARCHAR(30) DEFAULT '60 Dakika',
    gender VARCHAR(20) DEFAULT 'Karma',
    age_group VARCHAR(20) DEFAULT 'Tümü',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED','EXPIRED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_player_seek_ads_status_expires ON public.player_seek_ads (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_player_seek_ads_creator ON public.player_seek_ads (creator_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PLAYER SEEK APPLICATIONS (Oyuncu başvuruları)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_seek_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id UUID NOT NULL REFERENCES public.player_seek_ads(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    applicant_name VARCHAR(120),
    applicant_avatar TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN')),
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    CONSTRAINT unique_application_per_user_ad UNIQUE (ad_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_psa_apps_ad_status ON public.player_seek_applications (ad_id, status);
CREATE INDEX IF NOT EXISTS idx_psa_apps_applicant ON public.player_seek_applications (applicant_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CONVERSATIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('PLAYER_SEEK','SERVICE_OFFER')),
    context_id UUID NOT NULL, -- player_seek_application.id veya service_offer.id
    captain_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    other_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    captain_name VARCHAR(120),
    captain_avatar TEXT,
    other_name VARCHAR(120),
    other_avatar TEXT,
    other_role VARCHAR(30) DEFAULT 'Oyuncu', -- "Oyuncu", "Kaleci", "Hakem"
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_preview VARCHAR(200),
    last_message_sender_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_conv_context UNIQUE (type, context_id),
    CONSTRAINT chk_participants_different CHECK (captain_id <> other_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_captain_last ON public.conversations (captain_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_other_last ON public.conversations (other_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_last_message_at ON public.conversations (last_message_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CONVERSATION PARTICIPANTS STATE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_participants_state (
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    unread_count INT NOT NULL DEFAULT 0,
    cleared_at TIMESTAMPTZ, -- bu zamandan önceki mesajları bu kullanıcıya gösterme
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cps_user ON public.conversation_participants_state (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. MESSAGES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
    body_masked TEXT NOT NULL,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages (sender_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. USER BLOCKS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_blocks (
    blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT chk_not_self_block CHECK (blocker_id <> blocked_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. MESSAGE REPORTS (Moderasyon)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('SPAM','HARASSMENT','HATE','PROFANITY','SCAM','OTHER')),
    details TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','ACTION_TAKEN','DISMISSED')),
    admin_note TEXT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.message_reports (status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. PROFANITY WORDS (Türkçe küfür / hakaret listesi)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profanity_words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word VARCHAR(80) UNIQUE NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'MODERATE' CHECK (severity IN ('MILD','MODERATE','SEVERE')),
    auto_block BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Başlangıç listesi (yumuşatılmış, genel hakaret/küfür)
INSERT INTO public.profanity_words (word, severity, auto_block) VALUES
    ('amk','SEVERE',true),('aq','SEVERE',true),('siktir','SEVERE',true),('orospu','SEVERE',true),
    ('piç','SEVERE',true),('yarrak','SEVERE',true),('amcık','SEVERE',true),('amına','SEVERE',true),
    ('sik','MODERATE',true),('göt','MODERATE',true),('götveren','SEVERE',true),
    ('ibne','SEVERE',true),('gerizekalı','MODERATE',false),('salak','MILD',false),
    ('aptal','MILD',false),('mal','MILD',false),('puşt','SEVERE',true),
    ('kahpe','SEVERE',true),('pezevenk','SEVERE',true),('şerefsiz','MODERATE',false)
ON CONFLICT (word) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. USER PRESENCE (Online/Offline + Son Görülme)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_presence (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    is_online BOOLEAN NOT NULL DEFAULT false,
    last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═════════════════════════════════════════════════════════════════════════════
-- HELPERS & FUNCTIONS
-- ═════════════════════════════════════════════════════════════════════════════

-- 10. Telefon ve link maskeleme (Lead leakage koruması)
CREATE OR REPLACE FUNCTION public.mask_pii(p_text TEXT) RETURNS TEXT AS $$
DECLARE
    v TEXT := p_text;
BEGIN
    -- Telefon: 10-11 haneli ardışık sayılar veya +90/0(5xx) tarzı formatlar
    v := regexp_replace(v, '(\+?9?0?\s*\(?5\d{2}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})', '[telefon gizlendi]', 'gi');
    v := regexp_replace(v, '(\d{10,11})', '[telefon gizlendi]', 'g');
    -- URL (http, https, www, .com/.net/.org/.app/.io vs)
    v := regexp_replace(v, '((https?://|www\.)\S+)', '[bağlantı gizlendi]', 'gi');
    v := regexp_replace(v, '(\S+\.(com|net|org|app|io|tr|co|me))', '[bağlantı gizlendi]', 'gi');
    -- WhatsApp / Telegram / Instagram username
    v := regexp_replace(v, '(@[a-zA-Z0-9_\.]{3,30})', '[kullanıcı adı gizlendi]', 'g');
    v := regexp_replace(v, '(wa\.me/\S+|t\.me/\S+|instagram\.com/\S+)', '[bağlantı gizlendi]', 'gi');
    RETURN v;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 11. Küfür filtreleme: auto_block=true bir kelime varsa hata fırlat
CREATE OR REPLACE FUNCTION public.check_profanity(p_text TEXT) RETURNS VOID AS $$
DECLARE
    v_lower TEXT := lower(p_text);
    v_word RECORD;
BEGIN
    FOR v_word IN
        SELECT word FROM public.profanity_words WHERE auto_block = true
    LOOP
        IF v_lower ~* ('\m' || v_word.word || '\M') THEN
            RAISE EXCEPTION 'PROFANITY_BLOCKED: Mesajınız uygunsuz içerik nedeniyle gönderilemedi.';
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- 12. Rate limit kontrolü: son 10 saniyede 10'dan fazla mesaj
CREATE OR REPLACE FUNCTION public.check_message_rate_limit(p_user_id UUID) RETURNS VOID AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.messages
    WHERE sender_id = p_user_id
      AND created_at > NOW() - INTERVAL '10 seconds';
    IF v_count >= 10 THEN
        RAISE EXCEPTION 'RATE_LIMITED: Çok hızlı mesaj atıyorsunuz. Lütfen birkaç saniye bekleyin.';
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- 13. Engelleme kontrolü
CREATE OR REPLACE FUNCTION public.are_users_blocked(p_a UUID, p_b UUID) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_blocks
        WHERE (blocker_id = p_a AND blocked_id = p_b)
           OR (blocker_id = p_b AND blocked_id = p_a)
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ═════════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═════════════════════════════════════════════════════════════════════════════

-- 14. Mesaj göndermeden önce: rate limit + profanity + masking + participant kontrol
CREATE OR REPLACE FUNCTION public.before_insert_message()
RETURNS TRIGGER AS $$
DECLARE
    v_conv RECORD;
BEGIN
    -- 14.1 Konuşma var mı + gönderen katılımcı mı?
    SELECT * INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;
    IF v_conv IS NULL THEN
        RAISE EXCEPTION 'CONVERSATION_NOT_FOUND';
    END IF;

    IF NEW.sender_id <> v_conv.captain_id AND NEW.sender_id <> v_conv.other_id THEN
        RAISE EXCEPTION 'NOT_A_PARTICIPANT';
    END IF;

    -- 14.2 Karşılıklı engelleme kontrolü
    IF public.are_users_blocked(v_conv.captain_id, v_conv.other_id) THEN
        RAISE EXCEPTION 'BLOCKED: Bu kullanıcıyla mesajlaşamazsınız.';
    END IF;

    -- 14.3 Rate limit (sistem mesajlarında atla)
    IF NOT COALESCE(NEW.is_system, false) THEN
        PERFORM public.check_message_rate_limit(NEW.sender_id);
        PERFORM public.check_profanity(NEW.body);
    END IF;

    -- 14.4 Body maskeleme
    NEW.body_masked := public.mask_pii(NEW.body);
    NEW.delivered_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_before_insert_message ON public.messages;
CREATE TRIGGER trg_before_insert_message
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.before_insert_message();

-- 15. Mesaj eklendikten sonra: conversation güncelle + unread sayacı + bildirim
CREATE OR REPLACE FUNCTION public.after_insert_message()
RETURNS TRIGGER AS $$
DECLARE
    v_conv RECORD;
    v_other_user_id UUID;
BEGIN
    SELECT * INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;

    -- 15.1 Last message özeti
    UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.body_masked, 180),
        last_message_sender_id = NEW.sender_id
    WHERE id = NEW.conversation_id;

    -- 15.2 Diğer katılımcının unread sayacını artır (gönderen kendiyse atla)
    v_other_user_id := CASE WHEN NEW.sender_id = v_conv.captain_id THEN v_conv.other_id ELSE v_conv.captain_id END;

    INSERT INTO public.conversation_participants_state (conversation_id, user_id, unread_count, last_read_at)
    VALUES (NEW.conversation_id, v_other_user_id, 1, NULL)
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET
        unread_count = public.conversation_participants_state.unread_count + 1;

    -- 15.3 Gönderenin kendi state'inde unread=0
    INSERT INTO public.conversation_participants_state (conversation_id, user_id, unread_count, last_read_at)
    VALUES (NEW.conversation_id, NEW.sender_id, 0, NEW.created_at)
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET
        last_read_at = NEW.created_at,
        unread_count = 0;

    -- 15.4 Diğer katılımcıya push bildirim için notifications satırı
    IF NOT COALESCE(NEW.is_system, false) THEN
        INSERT INTO public.notifications (user_id, title, body, type_key, action_required, payload)
        VALUES (
            v_other_user_id,
            COALESCE((SELECT name FROM public.profiles WHERE id = NEW.sender_id), 'Yeni Mesaj'),
            LEFT(NEW.body_masked, 120),
            'chat_message',
            false,
            jsonb_build_object(
                'conversation_id', NEW.conversation_id,
                'message_id', NEW.id,
                'sender_id', NEW.sender_id,
                'deep_link', 'oyna://chat/' || NEW.conversation_id::text
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_after_insert_message ON public.messages;
CREATE TRIGGER trg_after_insert_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.after_insert_message();

-- 16. Player Seek Application kabul edilince → conversation oluştur + bildirim
CREATE OR REPLACE FUNCTION public.on_player_seek_application_decided()
RETURNS TRIGGER AS $$
DECLARE
    v_ad RECORD;
    v_conv_id UUID;
    v_applicant RECORD;
BEGIN
    IF NEW.status = 'ACCEPTED' AND (OLD.status IS NULL OR OLD.status <> 'ACCEPTED') THEN
        SELECT * INTO v_ad FROM public.player_seek_ads WHERE id = NEW.ad_id;
        SELECT id, name, avatar_url INTO v_applicant FROM public.profiles WHERE id = NEW.applicant_id;
        NEW.decided_at := NOW();

        -- Conversation aç (varsa hata vermesin)
        INSERT INTO public.conversations (
            type, context_id, captain_id, other_id,
            captain_name, captain_avatar, other_name, other_avatar, other_role,
            last_message_preview, last_message_at
        ) VALUES (
            'PLAYER_SEEK', NEW.id, v_ad.creator_id, NEW.applicant_id,
            v_ad.creator_name, v_ad.creator_avatar,
            COALESCE(v_applicant.name, NEW.applicant_name),
            COALESCE(v_applicant.avatar_url, NEW.applicant_avatar),
            'Oyuncu',
            'Talebin kabul edildi! Maç detayları için mesajlaşabilirsiniz.',
            NOW()
        )
        ON CONFLICT (type, context_id) DO NOTHING
        RETURNING id INTO v_conv_id;

        -- INSERT'in conflict olmadığı durumda v_conv_id null olabilir, çekelim
        IF v_conv_id IS NULL THEN
            SELECT id INTO v_conv_id FROM public.conversations WHERE type='PLAYER_SEEK' AND context_id=NEW.id;
        END IF;

        -- Sistem mesajı
        INSERT INTO public.messages (conversation_id, sender_id, body, body_masked, is_system)
        VALUES (
            v_conv_id, v_ad.creator_id,
            'Talebin kabul edildi. Maç detaylarını burada konuşabilirsiniz.',
            'Talebin kabul edildi. Maç detaylarını burada konuşabilirsiniz.',
            true
        );

        -- Oyuncuya zorunlu bildirim
        INSERT INTO public.notifications (user_id, title, body, type_key, action_required, payload)
        VALUES (
            NEW.applicant_id,
            'Kaptan Talebini Kabul Etti! ⚽',
            v_ad.creator_name || ' seni maçına aldı. Şimdi mesajlaşabilirsin.',
            'chat_unlocked_player',
            true,
            jsonb_build_object('conversation_id', v_conv_id, 'deep_link', 'oyna://chat/' || v_conv_id::text)
        );

        -- Kaptana bilgilendirme
        INSERT INTO public.notifications (user_id, title, body, type_key, action_required, payload)
        VALUES (
            v_ad.creator_id,
            'Yeni Oyuncu Kadronda 👥',
            COALESCE(v_applicant.name, 'Oyuncu') || ' artık maçında. Mesajlaşmak için profilindeki gelen kutusunu kontrol et.',
            'chat_unlocked_captain',
            false,
            jsonb_build_object('conversation_id', v_conv_id, 'deep_link', 'oyna://chat/' || v_conv_id::text)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_psa_decided ON public.player_seek_applications;
CREATE TRIGGER trg_psa_decided
BEFORE UPDATE ON public.player_seek_applications
FOR EACH ROW EXECUTE FUNCTION public.on_player_seek_application_decided();

-- 17. Service Offer kabul edilince → conversation oluştur
CREATE OR REPLACE FUNCTION public.on_service_offer_accepted()
RETURNS TRIGGER AS $$
DECLARE
    v_conv_id UUID;
    v_captain RECORD;
    v_provider_name TEXT;
    v_provider_avatar TEXT;
    v_provider_role TEXT;
BEGIN
    IF NEW.status = 'ACCEPTED' AND (OLD.status IS NULL OR OLD.status <> 'ACCEPTED') THEN
        SELECT id, name, avatar_url INTO v_captain FROM public.profiles WHERE id = NEW.offered_by;

        IF NEW.provider_type = 'GK' THEN
            SELECT name, avatar INTO v_provider_name, v_provider_avatar FROM public.goalkeepers WHERE id = NEW.provider_id;
            v_provider_role := 'Kaleci';
        ELSE
            SELECT name, avatar INTO v_provider_name, v_provider_avatar FROM public.referees WHERE id = NEW.provider_id;
            v_provider_role := 'Hakem';
        END IF;

        INSERT INTO public.conversations (
            type, context_id, captain_id, other_id,
            captain_name, captain_avatar, other_name, other_avatar, other_role,
            last_message_preview, last_message_at
        ) VALUES (
            'SERVICE_OFFER', NEW.id, NEW.offered_by, NEW.provider_id,
            v_captain.name, v_captain.avatar_url,
            v_provider_name, v_provider_avatar, v_provider_role,
            'Anlaşma sağlandı! Buluşma detayları için mesajlaşabilirsiniz.',
            NOW()
        )
        ON CONFLICT (type, context_id) DO NOTHING
        RETURNING id INTO v_conv_id;

        IF v_conv_id IS NULL THEN
            SELECT id INTO v_conv_id FROM public.conversations WHERE type='SERVICE_OFFER' AND context_id=NEW.id;
        END IF;

        -- Sistem mesajı
        INSERT INTO public.messages (conversation_id, sender_id, body, body_masked, is_system)
        VALUES (
            v_conv_id, NEW.offered_by,
            'Anlaşma sağlandı! Buluşma ve maç detaylarını burada konuşabilirsiniz.',
            'Anlaşma sağlandı! Buluşma ve maç detaylarını burada konuşabilirsiniz.',
            true
        );

        -- Her iki tarafa zorunlu bildirim
        INSERT INTO public.notifications (user_id, title, body, type_key, action_required, payload) VALUES
            (NEW.provider_id,
             v_provider_role || ' Olarak Kiralandın! 💰',
             v_captain.name || ' teklifini kabul etti. Mesajlaşmaya başla.',
             'chat_unlocked_provider', true,
             jsonb_build_object('conversation_id', v_conv_id, 'deep_link', 'oyna://chat/' || v_conv_id::text)),
            (NEW.offered_by,
             v_provider_role || ' Teklifin Onaylandı 🤝',
             v_provider_name || ' teklifini kabul etti. Buluşma detayları için mesajlaş.',
             'chat_unlocked_captain', false,
             jsonb_build_object('conversation_id', v_conv_id, 'deep_link', 'oyna://chat/' || v_conv_id::text));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_service_offer_accepted ON public.service_offers;
CREATE TRIGGER trg_service_offer_accepted
BEFORE UPDATE ON public.service_offers
FOR EACH ROW EXECUTE FUNCTION public.on_service_offer_accepted();

-- 18. notifications tablosuna eksik kolonları ekle (chat akışı için)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type_key VARCHAR(50);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_sent BOOLEAN DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_error TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS deep_link TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS match_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS team_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS payload JSONB;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS (Client tarafı kolaylaştırıcılar)
-- ═════════════════════════════════════════════════════════════════════════════

-- 19. Mesajları okundu olarak işaretle
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID) RETURNS VOID AS $$
BEGIN
    -- Sadece bu konuşmanın katılımcısı çağırabilir
    IF NOT EXISTS (
        SELECT 1 FROM public.conversations
        WHERE id = p_conversation_id
          AND (captain_id = auth.uid() OR other_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'NOT_A_PARTICIPANT';
    END IF;

    INSERT INTO public.conversation_participants_state (conversation_id, user_id, unread_count, last_read_at)
    VALUES (p_conversation_id, auth.uid(), 0, NOW())
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET
        unread_count = 0,
        last_read_at = NOW();

    -- Karşı taraf da read_at güncellensin (okundu rozeti için)
    UPDATE public.messages
    SET read_at = NOW()
    WHERE conversation_id = p_conversation_id
      AND sender_id <> auth.uid()
      AND read_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 20. Kullanıcı kendi sohbet geçmişini temizler (mesajlar fiziksel silinmez,
-- sadece bu kullanıcı için cleared_at sonrası mesajları görür)
CREATE OR REPLACE FUNCTION public.clear_my_chat_history(p_conversation_id UUID) RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.conversations
        WHERE id = p_conversation_id
          AND (captain_id = auth.uid() OR other_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'NOT_A_PARTICIPANT';
    END IF;

    INSERT INTO public.conversation_participants_state (conversation_id, user_id, cleared_at, unread_count)
    VALUES (p_conversation_id, auth.uid(), NOW(), 0)
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET
        cleared_at = NOW(),
        unread_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 21. Engelle / Engeli kaldır
CREATE OR REPLACE FUNCTION public.block_user(p_blocked_id UUID, p_reason TEXT DEFAULT NULL) RETURNS VOID AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
    IF auth.uid() = p_blocked_id THEN RAISE EXCEPTION 'CANT_BLOCK_SELF'; END IF;
    INSERT INTO public.user_blocks (blocker_id, blocked_id, reason)
    VALUES (auth.uid(), p_blocked_id, p_reason)
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.unblock_user(p_blocked_id UUID) RETURNS VOID AS $$
BEGIN
    DELETE FROM public.user_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_blocked_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 22. Mesaj şikayet et
CREATE OR REPLACE FUNCTION public.report_message(
    p_message_id UUID,
    p_reason VARCHAR,
    p_details TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_conv_id UUID;
    v_report_id UUID;
BEGIN
    SELECT conversation_id INTO v_conv_id FROM public.messages WHERE id = p_message_id;
    IF v_conv_id IS NULL THEN RAISE EXCEPTION 'MESSAGE_NOT_FOUND'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.conversations
        WHERE id = v_conv_id AND (captain_id = auth.uid() OR other_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'NOT_A_PARTICIPANT';
    END IF;

    INSERT INTO public.message_reports (reporter_id, message_id, conversation_id, reason, details)
    VALUES (auth.uid(), p_message_id, v_conv_id, p_reason, p_details)
    RETURNING id INTO v_report_id;

    RETURN v_report_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 23. KVKK: Kullanıcı kendi tüm sohbet datasını export edebilir
CREATE OR REPLACE FUNCTION public.export_my_chat_data() RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

    SELECT jsonb_build_object(
        'exported_at', NOW(),
        'user_id', auth.uid(),
        'conversations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', c.id,
                'type', c.type,
                'other_user', CASE WHEN c.captain_id = auth.uid() THEN c.other_name ELSE c.captain_name END,
                'created_at', c.created_at,
                'messages', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'sender_id', m.sender_id,
                        'is_mine', m.sender_id = auth.uid(),
                        'body', m.body,
                        'created_at', m.created_at,
                        'read_at', m.read_at
                    ) ORDER BY m.created_at)
                    FROM public.messages m
                    WHERE m.conversation_id = c.id
                ), '[]'::jsonb)
            ))
            FROM public.conversations c
            WHERE c.captain_id = auth.uid() OR c.other_id = auth.uid()
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 24. Gelen kutusu (Inbox) view-style RPC
CREATE OR REPLACE FUNCTION public.get_my_inbox() RETURNS TABLE (
    conversation_id UUID,
    type VARCHAR,
    other_user_id UUID,
    other_name VARCHAR,
    other_avatar TEXT,
    other_role VARCHAR,
    last_message_preview VARCHAR,
    last_message_at TIMESTAMPTZ,
    unread_count INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.type,
        CASE WHEN c.captain_id = auth.uid() THEN c.other_id ELSE c.captain_id END,
        CASE WHEN c.captain_id = auth.uid() THEN c.other_name ELSE c.captain_name END,
        CASE WHEN c.captain_id = auth.uid() THEN c.other_avatar ELSE c.captain_avatar END,
        c.other_role,
        c.last_message_preview,
        c.last_message_at,
        COALESCE(cps.unread_count, 0)
    FROM public.conversations c
    LEFT JOIN public.conversation_participants_state cps
      ON cps.conversation_id = c.id AND cps.user_id = auth.uid()
    WHERE (c.captain_id = auth.uid() OR c.other_id = auth.uid())
      AND (cps.cleared_at IS NULL OR c.last_message_at > cps.cleared_at)
    ORDER BY c.last_message_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 25. Bir sohbetin mesajlarını çek (cleared_at'i dikkate al)
CREATE OR REPLACE FUNCTION public.get_conversation_messages(
    p_conversation_id UUID,
    p_limit INT DEFAULT 50,
    p_before TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
    id UUID,
    sender_id UUID,
    body TEXT,
    body_masked TEXT,
    is_system BOOLEAN,
    created_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ
) AS $$
DECLARE
    v_cleared_at TIMESTAMPTZ;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.conversations
        WHERE id = p_conversation_id
          AND (captain_id = auth.uid() OR other_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'NOT_A_PARTICIPANT';
    END IF;

    SELECT cps.cleared_at INTO v_cleared_at
    FROM public.conversation_participants_state cps
    WHERE cps.conversation_id = p_conversation_id AND cps.user_id = auth.uid();

    RETURN QUERY
    SELECT m.id, m.sender_id, m.body, m.body_masked, m.is_system,
           m.created_at, m.delivered_at, m.read_at
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND (v_cleared_at IS NULL OR m.created_at > v_cleared_at)
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.player_seek_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_seek_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profanity_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- 26. PLAYER_SEEK_ADS
DROP POLICY IF EXISTS "Active ads viewable by all" ON public.player_seek_ads;
CREATE POLICY "Active ads viewable by all" ON public.player_seek_ads
FOR SELECT USING (status = 'ACTIVE' OR creator_id = auth.uid());

DROP POLICY IF EXISTS "Captains create their ads" ON public.player_seek_ads;
CREATE POLICY "Captains create their ads" ON public.player_seek_ads
FOR INSERT WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Owners update their ads" ON public.player_seek_ads;
CREATE POLICY "Owners update their ads" ON public.player_seek_ads
FOR UPDATE USING (creator_id = auth.uid());

DROP POLICY IF EXISTS "Owners delete their ads" ON public.player_seek_ads;
CREATE POLICY "Owners delete their ads" ON public.player_seek_ads
FOR DELETE USING (creator_id = auth.uid());

-- 27. PLAYER_SEEK_APPLICATIONS
DROP POLICY IF EXISTS "Parties can view applications" ON public.player_seek_applications;
CREATE POLICY "Parties can view applications" ON public.player_seek_applications
FOR SELECT USING (
    applicant_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.player_seek_ads WHERE id = ad_id AND creator_id = auth.uid())
);

DROP POLICY IF EXISTS "Users apply to ads" ON public.player_seek_applications;
CREATE POLICY "Users apply to ads" ON public.player_seek_applications
FOR INSERT WITH CHECK (
    applicant_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.player_seek_ads WHERE id = ad_id AND status = 'ACTIVE' AND creator_id <> auth.uid())
);

DROP POLICY IF EXISTS "Captain decides or applicant withdraws" ON public.player_seek_applications;
CREATE POLICY "Captain decides or applicant withdraws" ON public.player_seek_applications
FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.player_seek_ads WHERE id = ad_id AND creator_id = auth.uid())
    OR applicant_id = auth.uid()
);

-- 28. CONVERSATIONS
DROP POLICY IF EXISTS "Participants view conversations" ON public.conversations;
CREATE POLICY "Participants view conversations" ON public.conversations
FOR SELECT USING (captain_id = auth.uid() OR other_id = auth.uid());

-- Conversations sadece trigger (SECURITY DEFINER) tarafından INSERT edilebilir, doğrudan INSERT yok.

-- 29. CONVERSATION_PARTICIPANTS_STATE
DROP POLICY IF EXISTS "User reads own state" ON public.conversation_participants_state;
CREATE POLICY "User reads own state" ON public.conversation_participants_state
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "User writes own state" ON public.conversation_participants_state;
CREATE POLICY "User writes own state" ON public.conversation_participants_state
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 30. MESSAGES
DROP POLICY IF EXISTS "Participants read messages" ON public.messages;
CREATE POLICY "Participants read messages" ON public.messages
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND (c.captain_id = auth.uid() OR c.other_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Participants insert their own messages" ON public.messages;
CREATE POLICY "Participants insert their own messages" ON public.messages
FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND is_system = false
    AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND (c.captain_id = auth.uid() OR c.other_id = auth.uid())
    )
);

-- Mesaj UPDATE/DELETE: kullanıcılar mesaj silemez/düzenleyemez (admin hariç)
DROP POLICY IF EXISTS "Admins moderate messages" ON public.messages;
CREATE POLICY "Admins moderate messages" ON public.messages
FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

-- 31. USER_BLOCKS
DROP POLICY IF EXISTS "User manages own blocks" ON public.user_blocks;
CREATE POLICY "User manages own blocks" ON public.user_blocks
FOR ALL USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Admin sees all blocks" ON public.user_blocks;
CREATE POLICY "Admin sees all blocks" ON public.user_blocks
FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

-- 32. MESSAGE_REPORTS
DROP POLICY IF EXISTS "Reporter sees own reports" ON public.message_reports;
CREATE POLICY "Reporter sees own reports" ON public.message_reports
FOR SELECT USING (reporter_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

DROP POLICY IF EXISTS "Authenticated can create reports" ON public.message_reports;
CREATE POLICY "Authenticated can create reports" ON public.message_reports
FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admin updates reports" ON public.message_reports;
CREATE POLICY "Admin updates reports" ON public.message_reports
FOR UPDATE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

-- 33. PROFANITY_WORDS — sadece admin
DROP POLICY IF EXISTS "Admin manages profanity" ON public.profanity_words;
CREATE POLICY "Admin manages profanity" ON public.profanity_words
FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

-- 34. USER_PRESENCE
DROP POLICY IF EXISTS "Presence readable by all auth" ON public.user_presence;
CREATE POLICY "Presence readable by all auth" ON public.user_presence
FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "User updates own presence" ON public.user_presence;
CREATE POLICY "User updates own presence" ON public.user_presence
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- 35. CRON JOBS — Otomatik temizlik
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Son mesajdan 24 saat sonra konuşmaları sil (cascade messages siler)
    PERFORM cron.unschedule('delete_stale_conversations')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete_stale_conversations');
    PERFORM cron.schedule(
        'delete_stale_conversations',
        '15 * * * *',  -- Her saatin 15. dakikasında
        $cron$DELETE FROM public.conversations WHERE last_message_at < NOW() - INTERVAL '24 hours'$cron$
    );

    -- Süresi dolmuş ilanları kapat
    PERFORM cron.unschedule('expire_player_seek_ads')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_player_seek_ads');
    PERFORM cron.schedule(
        'expire_player_seek_ads',
        '30 * * * *',  -- Her saatin 30. dakikasında
        $cron$UPDATE public.player_seek_ads SET status='EXPIRED' WHERE status='ACTIVE' AND expires_at < NOW()$cron$
    );

    -- 30 günden eski offline kullanıcıların presence'ını temizle
    PERFORM cron.unschedule('cleanup_stale_presence')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_stale_presence');
    PERFORM cron.schedule(
        'cleanup_stale_presence',
        '0 3 * * *',
        $cron$DELETE FROM public.user_presence WHERE last_seen_at < NOW() - INTERVAL '30 days'$cron$
    );
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 36. REALTIME PUBLICATION
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Eğer supabase_realtime publication varsa tabloları ekle
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants_state;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.player_seek_ads;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.player_seek_applications;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- Zaten eklenmişse görmezden gel
  NULL;
END $$;

-- ==============================================================================
-- MIGRATION TAMAMLANDI
-- Sonraki adım:
--   1. supabase/functions/send-push deploy (mevcut, type_key=chat_message için hazır)
--   2. Frontend chatService.ts'i ekle
--   3. ChatScreen.tsx'i gerçek datayla bağla
--   4. MatchDiscovery'de player_seek mock akışını gerçek RPC'lere çevir
-- ==============================================================================
