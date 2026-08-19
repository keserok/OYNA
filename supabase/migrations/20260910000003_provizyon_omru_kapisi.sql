-- ════════════════════════════════════════════════════════════════════════════
-- PROVİZYON ÖMRÜ KAPISI — "bloke ettiğimiz para maç gününe kadar durmayabilir"
-- ----------------------------------------------------------------------------
-- BULGU (19 Ağu 2026 — para kaçağı denetimi): maç kaporası KARTTA BLOKE olarak
-- tutulur (`match_block_deposit` → AWAITING_PAYMENT → BLOCKED) ve maç
-- onaylandığında `match_capture_deposit` ile çekilir. Ama BLOKENİN BİR ÖMRÜ
-- VARDIR: bankalar provizyonu belirli bir süre sonra kendiliğinden çözer.
-- Kodun hiçbir yerinde bu süreyi gözeten bir sınır yoktu; maç takvimi ise
-- bugün + 90 gün açık.
--
-- SESSİZ SONUÇ: 60 gün sonrasına kurulan bir maçta kapora bugün bloke edilir,
-- banka blokeyi ~1 ay içinde çözer, maç günü `match_capture_deposit` çalıştığında
-- çekilecek bir şey KALMAZ. Kaptan parasını hiç ödememiş olur, saha saati
-- boşuna tutulmuştur, komisyon doğmaz. Üstelik hata maç GÜNÜ ortaya çıkar —
-- düzeltmek için çok geç olan an.
--
-- KARAR: kapora süreci, provizyonun güvenle durabileceği pencereden UZAK bir
-- maç için hiç başlatılmaz. Kullanıcı bunu maçı kurarken, sade bir cümleyle
-- öğrenir; maç günü sürprizle karşılaşmaz.
--
-- SÜRE NEREDEN GELİYOR: `preauth_max_days` ayarı (yönetici panelinden
-- yönetilir). Varsayılan 20 gün — bankaların yaygın uyguladığı ~1 aylık
-- pencerenin güvenli tarafında durur. Sağlayıcıyla yapılan anlaşma farklıysa
-- ayar panelden değiştirilir, koda dokunulmaz. 0 yazılırsa kapı KAPANIR
-- (sınır yok) — sürenin sınırsız olduğu bir anlaşma yapılırsa diye.
--
-- KAPSAM (bilinçli dar): yalnız kapora sürecinin BAŞLATILMASI kısıtlanır.
-- Maç kurmak, uzak tarihe rezervasyon yapmak, kartla doğrudan tahsilat —
-- hiçbiri etkilenmez. Blokeye dayanmayan yollar bu riski taşımıyor.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value)
VALUES (
  'preauth_max_days', '20'::jsonb, 'number', 'ODEME', 'Provizyon Ömrü (gün)',
  'Karttaki blokenin (provizyon) güvenle durabileceği en uzun süre. Maça bu günden daha fazla varsa kapora süreci başlatılmaz — çünkü banka blokeyi maç gününden önce çözebilir ve tahsilat başarısız olur. 0 = sınır yok.',
  false, 0, 90
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.match_block_deposit(
  p_match_id uuid, p_amount numeric, p_providers jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_counts RECORD;
  v_max_days int := COALESCE(public.get_config_number('preauth_max_days', 20), 20)::int;
  v_gun numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Kapora tutarı pozitif olmalı.'; END IF;

  SELECT id, "creatorId", captain_id, deposit_status, starts_at
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maçı kuran kaptan kapora sürecini başlatabilir.';
  END IF;
  IF v_match.deposit_status <> 'NONE' THEN
    RAISE EXCEPTION 'ALREADY_BLOCKED: Bu maçın kaporası zaten işlenmiş (%).', v_match.deposit_status;
  END IF;

  -- ── PROVİZYON ÖMRÜ KAPISI ────────────────────────────────────────────────
  -- Mesaj kullanıcıya SEBEBİ ve ÇIKIŞI birlikte söyler: neden olmadığını
  -- bilmeyen kaptan, uygulamanın bozuk olduğunu düşünür.
  IF v_max_days > 0 AND v_match.starts_at IS NOT NULL THEN
    v_gun := EXTRACT(EPOCH FROM (v_match.starts_at - now())) / 86400.0;
    IF v_gun > v_max_days THEN
      RAISE EXCEPTION
        'PREAUTH_TOO_FAR: Kapora, karttaki bloke ile tutuluyor ve banka bu blokeyi en fazla % gün saklıyor. Maça % gün var; kaporayı maça % günden az kala başlatabilirsin.',
        v_max_days, ceil(v_gun)::int, v_max_days;
    END IF;
  END IF;

  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  -- KART DÖNEMİ: cüzdan yok (20260905000001) — burada para hareketi OLMAZ.
  -- Tutar ve sağlayıcı istekleri maça yazılır; tahsilat kartla yapılır
  -- (prepare_card_payment · MATCH_DEPOSIT) ve onayda BLOCKED'a geçer.
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
$$;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $$
DECLARE
  v_gecti boolean := false;
BEGIN
  IF COALESCE(public.get_config_number('preauth_max_days', 0), 0) <= 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: preauth_max_days ayari kurulmadi';
  END IF;
  -- Kapı fonksiyon gövdesinde gerçekten duruyor mu?
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'match_block_deposit'
      AND p.prosrc LIKE '%PREAUTH_TOO_FAR%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: provizyon omru kapisi match_block_deposit icinde yok';
  END IF;
  RAISE NOTICE 'DOGRULAMA TAMAM: provizyon omru kapisi kuruldu (% gun).',
    public.get_config_number('preauth_max_days', 20);
END $$;
