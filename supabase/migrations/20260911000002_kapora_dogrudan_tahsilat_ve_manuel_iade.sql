-- ════════════════════════════════════════════════════════════════════════════
-- KAPORA: PROVİZYON YOK, DOĞRUDAN TAHSİLAT — İADE ELLE
-- ----------------------------------------------------------------------------
-- KURUCU KARARI (19 Ağustos 2026):
--   "Maç kurulduğunda, kapora ödendiğinde vs sistemi ön provizyondan çıkarıp
--    direkt ödeme alma olarak ayarlayalım. İptal edilme durumunda admin
--    panelinden maç kapora iptali olarak gözüksün. Ve iadeyi manuel
--    gerçekleştirelim."
--   Ayrıca sorulduğunda: "Provizyon sistemi komple iptal, direkt ödeme alıp
--   parayı kendimiz yöneteceğiz herhangi bir iptal durumunda."
--
-- ÖNEMLİ BULGU — ZATEN PROVİZYON YOKTU. Kod okununca çıktı: kapora
-- `/payment/3dsecure/auth` ile TAHSİL ediliyor (preauth değil); niyet `PAID`
-- oluyor. `deposit_status = 'BLOCKED'` bankadaki bir bloke DEĞİL, OYNA'nın
-- kendi etiketiydi: "kapora alındı, henüz maça mahsup edilmedi". Yani para
-- akışı kurucunun istediği gibi çalışıyordu; adı yanlıştı.
--
-- BUNUN İKİ SONUCU VAR:
--   1. Aynı gün eklenen PROVİZYON ÖMRÜ KAPISI (`preauth_max_days`, maça 20
--      günden fazla varsa kaporayı engelliyordu) GEREKSİZ — çözmeye çalıştığı
--      "banka blokeyi çözer" riski bu akışta yok. Kapı kaldırıldı, ayar silindi.
--      Kalsaydı hiçbir gerekçesi olmadan uzak tarihli maçların kaporasını
--      engelleyecekti.
--   2. Değişmesi gereken tek şey İADE: sistem kendi başına karta iade
--      geçiyordu. Artık geçmiyor.
--
-- YENİ AKIŞ: maç iptal olunca kapora `REFUND_PENDING` durumuna geçer, sebebiyle
-- birlikte yönetici kuyruğuna düşer, kaptana bildirim gider. Parayı YÖNETİCİ
-- `admin_refund_intent` ile elle iade eder. Böylece hangi iadenin neden ve ne
-- zaman yapıldığı insan kararı olarak kayda geçer.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_deposit_status_chk;
ALTER TABLE public.matches ADD CONSTRAINT matches_deposit_status_chk
  CHECK (deposit_status = ANY (ARRAY['NONE','AWAITING_PAYMENT','BLOCKED','CAPTURED',
                                     'VOIDED','REFUNDED','REFUND_PENDING']));

DELETE FROM public.app_config WHERE key = 'preauth_max_days';

CREATE OR REPLACE FUNCTION public.match_block_deposit(
  p_match_id uuid, p_amount numeric, p_providers jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_counts RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Kapora tutarı pozitif olmalı.'; END IF;

  SELECT id, "creatorId", captain_id, deposit_status
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maçı kuran kaptan kapora sürecini başlatabilir.';
  END IF;
  IF v_match.deposit_status <> 'NONE' THEN
    RAISE EXCEPTION 'ALREADY_BLOCKED: Bu maçın kaporası zaten işlenmiş (%).', v_match.deposit_status;
  END IF;

  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  UPDATE public.matches SET
    deposit_status     = 'AWAITING_PAYMENT',
    deposit_amount     = p_amount,
    deferred_providers = COALESCE(p_providers, '[]'::jsonb),
    min_players        = v_counts.min_players,
    status             = 'ACTIVE'
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'deposit_status', 'AWAITING_PAYMENT',
    'deposit_amount', p_amount,
    'min_players', v_counts.min_players
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public._match_release_deposit(p_match_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_match RECORD;
BEGIN
  SELECT id, "creatorId", captain_id, deposit_intent_id, deposit_status, deposit_amount, title
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match.deposit_status NOT IN ('BLOCKED', 'AWAITING_PAYMENT') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_BLOCKED',
                              'deposit_status', v_match.deposit_status);
  END IF;

  -- Kapora hiç ödenmediyse: iade edilecek para yok.
  IF v_match.deposit_status = 'AWAITING_PAYMENT' THEN
    UPDATE public.matches SET deposit_status = 'NONE' WHERE id = p_match_id;
    RETURN jsonb_build_object('ok', true, 'deposit_status', 'NONE', 'refunded', false, 'amount', 0);
  END IF;

  -- Para TAHSİL EDİLMİŞ. İadeyi sistem kendi başına yapmaz; iş kuyruğa düşer,
  -- para hareketini yönetici admin_refund_intent ile insan eliyle yapar.
  UPDATE public.matches SET deposit_status = 'REFUND_PENDING' WHERE id = p_match_id;

  UPDATE public.payment_intents
     SET raw = COALESCE(raw, '{}'::jsonb)
               || jsonb_build_object('refund_pending', true,
                                     'refund_reason', COALESCE(p_reason, 'Maç iptali — kapora iadesi'))
   WHERE id = v_match.deposit_intent_id;

  IF COALESCE(v_match."creatorId", v_match.captain_id) IS NOT NULL THEN
    BEGIN
      PERFORM public._notify_deposit(
        COALESCE(v_match."creatorId", v_match.captain_id),
        p_match_id, 'match_deposit_released',
        jsonb_build_object(
          'amount', round(COALESCE(v_match.deposit_amount, 0))::text,
          'match_title', COALESCE(v_match.title, 'Maçın'),
          'reason', COALESCE(p_reason, 'Maç iptal edildi.')
        ));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Kapora iadesi bildirimi gonderilemedi (%): %', p_match_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deposit_status', 'REFUND_PENDING',
                            'refunded', false, 'manual', true,
                            'amount', COALESCE(v_match.deposit_amount, 0));
END;
$fn$;

-- Yöneticinin göreceği kuyruk: hangi maçın kaporası iade bekliyor, ne kadar,
-- kimden, hangi kırılımla.
CREATE OR REPLACE FUNCTION public.admin_bekleyen_kapora_iadeleri(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_out jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT COALESCE(jsonb_agg(x ORDER BY x.iptal_zamani DESC NULLS LAST), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT
      m.id AS mac_id, m.title AS mac_adi, m.starts_at AS mac_saati,
      m.deposit_amount AS kapora, m.deposit_intent_id AS niyet_id,
      i.amount AS cekilen,
      COALESCE(i.card_fee_amount, 0) AS kart_bedeli,
      COALESCE(i.rounding_amount, 0) AS yuvarlama,
      i.status AS niyet_durumu, i.raw->>'refund_reason' AS sebep,
      m.updated_at AS iptal_zamani,
      p.id AS kaptan_id, COALESCE(p.full_name, p.name) AS kaptan,
      pt.name AS tesis
    FROM public.matches m
    LEFT JOIN public.payment_intents i ON i.id = m.deposit_intent_id
    LEFT JOIN public.profiles p ON p.id = COALESCE(m."creatorId", m.captain_id)
    LEFT JOIN public.pitches pt ON pt.id = m.pitch_id
    WHERE m.deposit_status = 'REFUND_PENDING'
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  ) x;
  RETURN v_out;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_bekleyen_kapora_iadeleri(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bekleyen_kapora_iadeleri(integer) TO authenticated, service_role;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_config WHERE key = 'preauth_max_days') THEN
    RAISE EXCEPTION 'DOGRULAMA: provizyon omru ayari hala duruyor';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='match_block_deposit' AND p.prosrc LIKE '%PREAUTH_TOO_FAR%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: provizyon kapisi match_block_deposit icinde duruyor';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='_match_release_deposit' AND p.prosrc LIKE '%REFUND_PENDING%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: kapora iadesi hala otomatik';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='_match_release_deposit' AND p.prosrc LIKE '%_refund_wallet_escrow%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: otomatik iade cagrisi hala govdede';
  END IF;
  RAISE NOTICE 'DOGRULAMA TAMAM: kapora dogrudan tahsilat, iade elle.';
END $dog$;
