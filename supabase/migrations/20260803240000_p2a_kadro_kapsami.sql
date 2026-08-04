-- ════════════════════════════════════════════════════════════════════════════
-- [P-2a / M-P0-4 düzeltilmiş] KADRO KAPSAMI + SÖZLÜK KISITLARI
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ MİMAR RAPORUNUN ESASLI DÜZELTİLMESİ
--
-- Rapor şunu iddia ediyordu:
--   "20 maçın 12'sinde JSON kadrosu ile match_participants uyuşmuyor"
--   "bildirim _match_participant_ids üzerinden gidiyor (TABLOYA bakıyor)
--    → maçtan ayrılmış kişiye hâlâ bildirim gider"
--
-- İKİSİ DE YANLIŞTI. Uygulama sırasında canlıda tek tek doğrulandı:
--
--   1. `match_participants.role` sütunu MEVKİ değil TARAF tutuyor: 'home'/'away'.
--      Yani rapordaki "tabloda takım bilgisi yok" tespiti yanlıştı — bilgi var,
--      sadece sütun adı yanıltıyor.
--   2. `status` sütunu 'creator' / 'confirmed' / 'left' tutuyor. Yani ayrılanlar
--      İŞARETLENİYOR (leave_public_match_slot ve player_kick_slot 'left' yazıyor).
--      İlk ölçümüm 'left' satırlarını da saydığı için sapma abartılı çıktı.
--   3. Doğru filtreyle kalan 3 "sapma"nın 2'si KURUCU (maçı açan ama oynamayan —
--      meşru), 1'i SLOT SATIN ALMIŞ AMA KİMSEYİ OTURTMAMIŞ kişi (o da meşru —
--      parayı o ödemiş). Yani iki kaynak çelişmiyor, FARKLI ŞEYLER tutuyor.
--   4. `_match_participant_ids` TABLOYA DEĞİL, JSON'a bakıyor.
--
-- ANCAK — daha dar ama GERÇEK ve CİDDİ bir açık bulundu:
--
--   `_match_participant_ids` yalnız slotta OTURAN kişileri döndürüyor
--   (slot->'player'->>'id'). Slotu SATIN ALMIŞ ama henüz kimseyi oturtmamış
--   kişiyi DÖNDÜRMÜYOR.
--
--   Canlı kanıt (maç 72d9b604): 3 slot ödenmiş, oturan kimse yok.
--     _match_participant_ids  → NULL (SIFIR kişi)
--     parayı ödeyen           → 1 kişi
--
--   SONUÇ: Bu maç iptal edilse, parayı ödeyen kişiye HİÇBİR BİLDİRİM GİTMEZ.
--   Parası iade edilir ama bundan haberi olmaz. K-3.3 kurucu kararı
--   ("saha/admin iptalinde tüm kullanıcılara paraları eksiksiz döner")
--   doğrudan tehdit altında.
--
-- ÇÖZÜM:
--   1. `_match_participant_ids` = OTURANLAR ∪ SATIN ALANLAR
--   2. match_participants sözlük kısıtları (matches.status ile aynı hastalık:
--      sütunlar korumasızdı; ayrıca varsayılanlar gerçek kullanımla uyuşmuyordu —
--      role varsayılanı 'PLAYER' ama saklanan 'home'/'away')
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Bildirim kapsamı: satın alanlar da katılımcıdır ──────────────────────
CREATE OR REPLACE FUNCTION public._match_participant_ids(p_match_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT pid), '{}')
  FROM (
    -- Slotta OTURAN kişiler
    SELECT (slot->'player'->>'id')::uuid AS pid
    FROM public.matches m
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(m.slots,'[]'::jsonb) || COALESCE(m."awaySlots",'[]'::jsonb)) AS slot
    WHERE m.id = p_match_id
      AND slot->>'status' = 'TAKEN'
      AND (slot->'player'->>'id') IS NOT NULL

    UNION

    -- Slotu SATIN ALAN kişiler (oturmasa da parayı o ödedi — iptal/iade
    -- bildirimini MUTLAKA almalı; K-3.3)
    SELECT (slot->>'purchasedBy')::uuid
    FROM public.matches m
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(m.slots,'[]'::jsonb) || COALESCE(m."awaySlots",'[]'::jsonb)) AS slot
    WHERE m.id = p_match_id
      AND slot->>'status' = 'TAKEN'
      AND (slot->>'purchasedBy') IS NOT NULL
  ) s
  WHERE pid IS NOT NULL;
$function$;

COMMENT ON FUNCTION public._match_participant_ids(uuid) IS
  'P-2a: Macin bildirim alacak kisileri = slotta OTURANLAR birlesim slotu SATIN ALANLAR. Satin alip oturtmayan kisi iptal/iade bildirimini almali (K-3.3).';

-- ── 2) Kadro tablosu sözlük kısıtları ───────────────────────────────────────
-- Gerçek kullanım (canlıda ölçüldü): status = creator|confirmed|left
--                                    role   = home|away
-- Varsayılanlar gerçekle uyuşmuyordu ('PLAYER' / 'CONFIRMED'); hiç kullanılmamış
-- (53 satırın hepsi home/away + creator/confirmed/left). Gerçeğe hizalanıyor.
ALTER TABLE public.match_participants ALTER COLUMN role   SET DEFAULT 'home';
ALTER TABLE public.match_participants ALTER COLUMN status SET DEFAULT 'confirmed';

ALTER TABLE public.match_participants DROP CONSTRAINT IF EXISTS match_participants_role_check;
ALTER TABLE public.match_participants ADD CONSTRAINT match_participants_role_check
  CHECK (role IS NULL OR lower(role) IN ('home','away'));

ALTER TABLE public.match_participants DROP CONSTRAINT IF EXISTS match_participants_status_check;
ALTER TABLE public.match_participants ADD CONSTRAINT match_participants_status_check
  CHECK (status IS NULL OR lower(status) IN ('creator','confirmed','left'));

COMMENT ON CONSTRAINT match_participants_role_check ON public.match_participants IS
  'P-2a: role sutunu TARAF tutar (home/away), mevki DEGIL. Isim yaniltici ama anlam budur.';
COMMENT ON CONSTRAINT match_participants_status_check ON public.match_participants IS
  'P-2a: creator=maci acan, confirmed=kadroda, left=ayrilmis.';

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA:
--   ALTER TABLE public.match_participants DROP CONSTRAINT IF EXISTS match_participants_role_check;
--   ALTER TABLE public.match_participants DROP CONSTRAINT IF EXISTS match_participants_status_check;
--   ALTER TABLE public.match_participants ALTER COLUMN role   SET DEFAULT 'PLAYER';
--   ALTER TABLE public.match_participants ALTER COLUMN status SET DEFAULT 'CONFIRMED';
--   -- _match_participant_ids icin: UNION blogu kaldirilir (ama YAPMAYIN —
--   -- o zaman odeme yapan kisi iade bildirimini alamaz).
-- ════════════════════════════════════════════════════════════════════════════
