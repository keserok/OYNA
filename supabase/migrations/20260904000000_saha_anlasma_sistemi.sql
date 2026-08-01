-- ════════════════════════════════════════════════════════════════════════════
-- SAHA ANLAŞMA SİSTEMİ — fiyat, komisyon ve iptal saati artık SAHAYA bağlı
-- ────────────────────────────────────────────────────────────────────────────
-- NEDEN (2026-09 denetimi):
--
--  Depoda bu sistemin İSKELETİ zaten vardı ama BAĞLANTISI KOPUKTU:
--    • `commission_config` saha bazlı anlaşma tutabiliyor (scope='PITCH'),
--      admin panelinde düzenleme ekranı da var — ama hiç kullanılmıyordu.
--    • MODEL_B (OYNA sahayı X'e kiralar, oyuncuya X+markup satar) tanımlıydı
--      ama SEÇİMİ ticari anlaşmaya değil "maçı kim kurdu"ya bakıyordu:
--      yalnız maçı saha sahibinin kendisi kurduysa devreye giriyordu.
--    • Oyuncuya gösterilen fiyattaki %5 KODA GÖMÜLÜYDÜ (`create_match_atomic`
--      içinde `* 1.05`). Yani panelden markup değiştirilse bile oyuncunun
--      ödediği tutar DEĞİŞMİYORDU — ücretlendirme ekranı vardı, etkisi yoktu.
--    • Kaptanın iptal süresi (24 saat) koda gömülüydü; sahaların kendi
--      `refund_full_hours` ayarı varken o okunmuyordu.
--    • `pitches.platform_commission_rate` hiçbir hesapta kullanılmıyordu ama
--      duruyordu — ikinci bir oran varmış izlenimi veriyordu.
--
-- KARARLAR (proje sahibi):
--   1a  Anlaşma SAHAYA bağlanır (commission_config scope='PITCH').
--   2   Markup YÜZDE ya da SABİT TUTAR olabilir (hangisi doluysa o).
--   3a  Gömülü %5 kaldırılır; global MODEL_A markup'ı %5 yapılır →
--       BUGÜNKÜ FİYATLAR BİREBİR KORUNUR, ama artık panelden yönetilir.
--   4a  Anlaşma maç kurulduğu anda MAÇA YAZILIR ve dondurulur; sonradan oran
--       değişse bile o maçın hesabı değişmez.
--   5a  Kaptanın iptal süresi sahanın `refund_full_hours` ayarından okunur.
--   6a  Saha sahibi anlaşmasını GÖRÜR ama değiştiremez — ve YALNIZ SAHİBİ
--       (müdür) görür, personel görmez.
--   8a  `platform_commission_rate` kullanım dışı işaretlenir.
--
-- PARA GÜVENLİĞİ: bu migration hiçbir kaydı silmez, hiçbir bakiyeyi
-- değiştirmez. Yalnız fonksiyon gövdeleri ve iki yeni kolon ekler.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Anlaşma kaydına SABİT TUTAR alanı ────────────────────────────────────
-- Bazı sahalarla yüzde (2000 + %20), bazılarıyla sabit tutar (2000 + 400₺)
-- anlaşılabilir. İkisi aynı satırda tutulur; SABİT TUTAR doluysa o kazanır.

ALTER TABLE public.commission_config
  ADD COLUMN IF NOT EXISTS markup_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.commission_config.markup_amount IS
  'Sabit markup (₺). 0''dan büyükse markup_pct yerine BU kullanılır.';
COMMENT ON COLUMN public.commission_config.markup_pct IS
  'Yüzde markup. markup_amount 0 ise geçerlidir.';

-- Kullanım dışı alan (8a): tek kaynak commission_config'tir.
COMMENT ON COLUMN public.pitches.platform_commission_rate IS
  'KULLANIM DIŞI (2026-09). Komisyonun tek kaynağı public.commission_config''tir '
  '(scope=''PITCH'' kaydı, yoksa GLOBAL). Bu alan hiçbir hesaba girmez.';

-- ── 2) Anlaşmanın maça DONDURULMASI (4a) ────────────────────────────────────
-- Oran sonradan değişse bile kurulmuş maçın hesabı değişmesin.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS commission_rate_pct     numeric,
  ADD COLUMN IF NOT EXISTS commission_markup_pct   numeric,
  ADD COLUMN IF NOT EXISTS commission_markup_amount numeric;

COMMENT ON COLUMN public.matches.commission_rate_pct IS
  'Maç kurulurken geçerli olan komisyon oranı — DONDURULMUŞTUR.';
COMMENT ON COLUMN public.matches.commission_markup_pct IS
  'Maç kurulurken geçerli olan yüzde markup — DONDURULMUŞTUR.';
COMMENT ON COLUMN public.matches.commission_markup_amount IS
  'Maç kurulurken geçerli olan sabit markup (₺) — DONDURULMUŞTUR.';


-- ── 3) SAHANIN ANLAŞMASI — tek çözücü ───────────────────────────────────────
-- Sıra: sahaya özel aktif kayıt → o modelin GLOBAL kaydı → sunucu varsayılanı.
-- Model de sahadan gelir: sahaya özel kayıt hangi modeldeyse anlaşma odur.

CREATE OR REPLACE FUNCTION public._pitch_agreement(p_pitch_id uuid)
RETURNS TABLE(model text, rate_pct numeric, markup_pct numeric, markup_amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v RECORD;
BEGIN
  -- 1) Sahaya özel anlaşma (model dâhil buradan gelir).
  IF p_pitch_id IS NOT NULL THEN
    SELECT c.model, c.rate_pct, c.markup_pct, c.markup_amount INTO v
    FROM public.commission_config c
    WHERE c.is_active AND c.scope = 'PITCH' AND c.scope_id = p_pitch_id
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT 1;
    IF FOUND THEN
      model := v.model; rate_pct := v.rate_pct;
      markup_pct := COALESCE(v.markup_pct, 0); markup_amount := COALESCE(v.markup_amount, 0);
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- 2) Sahaya özel yoksa GLOBAL MODEL_A.
  SELECT c.model, c.rate_pct, c.markup_pct, c.markup_amount INTO v
  FROM public.commission_config c
  WHERE c.is_active AND c.scope = 'GLOBAL' AND c.model = 'MODEL_A'
  LIMIT 1;
  IF FOUND THEN
    model := v.model; rate_pct := v.rate_pct;
    markup_pct := COALESCE(v.markup_pct, 0); markup_amount := COALESCE(v.markup_amount, 0);
    RETURN NEXT; RETURN;
  END IF;

  -- 3) Hiç kayıt yoksa sunucu varsayılanı (bugünkü davranış).
  model := 'MODEL_A'; rate_pct := 15.0; markup_pct := 5.0; markup_amount := 0;
  RETURN NEXT;
END; $function$;

REVOKE ALL ON FUNCTION public._pitch_agreement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._pitch_agreement(uuid) TO service_role;


-- ── 4) Markup hesabı — tek yerden ───────────────────────────────────────────
-- Sabit tutar doluysa yüzde YOK SAYILIR. Böylece "2000 + 400₺" ile
-- "2000 + %20" aynı kayıtta, karışmadan tutulur.

CREATE OR REPLACE FUNCTION public._markup_tutari(
  p_taban numeric, p_markup_pct numeric, p_markup_amount numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE
    WHEN COALESCE(p_markup_amount, 0) > 0 THEN round(p_markup_amount, 2)
    ELSE round(COALESCE(p_taban, 0) * COALESCE(p_markup_pct, 0) / 100.0, 2)
  END;
$function$;


-- ── 5) GLOBAL MODEL_A markup'ı %5 (3a) ──────────────────────────────────────
-- Gömülü `* 1.05` kaldırılıyor; aynı sonucu vermesi için global markup %5
-- yapılıyor. FİYATLAR DEĞİŞMEZ — yalnız artık panelden yönetilebilir.

UPDATE public.commission_config
   SET markup_pct = 5.0,
       notes = COALESCE(notes,'') ||
         CASE WHEN COALESCE(notes,'') LIKE '%uygulama payı%' THEN ''
              ELSE ' · %5 uygulama payı (eskiden koda gömülüydü, 2026-09''da buraya taşındı)' END
 WHERE scope = 'GLOBAL' AND model = 'MODEL_A' AND is_active
   AND COALESCE(markup_pct, 0) = 0;


-- ── 6) Maça anlaşmayı yaz (model + oranlar) ─────────────────────────────────
-- ESKİDEN: yalnız "maçı kuran = saha sahibi" ise MODEL_B seçiliyordu; ticari
-- anlaşma hiç okunmuyordu. ARTIK: model ve oranlar SAHANIN anlaşmasından
-- gelir ve maça yazılıp DONDURULUR.

CREATE OR REPLACE FUNCTION public._set_match_commission_model()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a RECORD;
BEGIN
  IF NEW.pitch_id IS NOT NULL THEN
    SELECT * INTO a FROM public._pitch_agreement(NEW.pitch_id);
    NEW.commission_model          := COALESCE(NEW.commission_model, a.model);
    -- Sahaya özel anlaşma varsa model onu EZER (kayıt "bu sahayla şöyle
    -- anlaştık" demektir; maç kurucusunun kim olduğuyla ilgisi yoktur).
    IF EXISTS (SELECT 1 FROM public.commission_config c
               WHERE c.is_active AND c.scope='PITCH' AND c.scope_id = NEW.pitch_id) THEN
      NEW.commission_model := a.model;
    END IF;
    NEW.commission_rate_pct       := COALESCE(NEW.commission_rate_pct, a.rate_pct);
    NEW.commission_markup_pct     := COALESCE(NEW.commission_markup_pct, a.markup_pct);
    NEW.commission_markup_amount  := COALESCE(NEW.commission_markup_amount, a.markup_amount);
  END IF;
  RETURN NEW;
END; $function$;


-- ── 7) Komisyon hesabı — dondurulmuş oranı kabul eder ───────────────────────
-- Yeni parametreler İSTEĞE BAĞLI: eski çağrılar (rezervasyon hakedişi vb.)
-- birebir aynı davranır.

-- ÖNCE ESKİ İMZAYI DÜŞÜR: parametre sayısı değiştiği için CREATE OR REPLACE
-- yeni bir AŞIRI YÜKLEME yaratır, eskisi de kalırdı. O zaman üç argümanlı
-- çağrılar "hangi fonksiyon?" diye BELİRSİZ hataya düşerdi.
DROP FUNCTION IF EXISTS public.calculate_commission(numeric, text, uuid, text);

CREATE OR REPLACE FUNCTION public.calculate_commission(
  p_amount numeric,
  p_scope text DEFAULT 'GLOBAL',
  p_scope_id uuid DEFAULT NULL,
  p_model text DEFAULT 'MODEL_A',
  p_rate_pct numeric DEFAULT NULL,
  p_markup_pct numeric DEFAULT NULL,
  p_markup_amount numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cfg RECORD; v_rate numeric; v_markup numeric; v_markup_amt_cfg numeric;
  v_rate_amt numeric; v_markup_amt numeric; v_oyna_take numeric;
  v_owner_net numeric; v_player_total numeric;
BEGIN
  SELECT rate_pct, markup_pct, markup_amount INTO v_cfg
  FROM public.commission_config
  WHERE is_active = true AND model = p_model AND scope = p_scope
    AND (scope_id = p_scope_id OR scope_id IS NULL)
  ORDER BY (scope_id = p_scope_id) DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT rate_pct, markup_pct, markup_amount INTO v_cfg
    FROM public.commission_config
    WHERE is_active = true AND model = p_model AND scope = 'GLOBAL' AND scope_id IS NULL
    LIMIT 1;
  END IF;

  -- DONDURULMUŞ oran varsa o kazanır (maçın kurulduğu andaki anlaşma).
  v_rate           := COALESCE(p_rate_pct, v_cfg.rate_pct,
                        CASE WHEN p_model = 'MODEL_B' THEN 5.0 ELSE 15.0 END);
  v_markup         := COALESCE(p_markup_pct, v_cfg.markup_pct,
                        CASE WHEN p_model = 'MODEL_B' THEN 20.0 ELSE 0.0 END);
  v_markup_amt_cfg := COALESCE(p_markup_amount, v_cfg.markup_amount, 0);

  v_rate_amt     := round(p_amount * v_rate / 100.0, 2);
  v_markup_amt   := public._markup_tutari(p_amount, v_markup, v_markup_amt_cfg);
  v_owner_net    := p_amount - v_rate_amt;
  v_oyna_take    := v_rate_amt + v_markup_amt;
  v_player_total := p_amount + v_markup_amt;

  RETURN jsonb_build_object(
    'amount',         p_amount,
    'base',           p_amount,
    'commission_pct', v_rate,
    'markup_pct',     v_markup,
    'markup_amount',  v_markup_amt_cfg,
    'markup_amt',     v_markup_amt,
    'commission_amt', v_oyna_take,
    'net_amount',     v_owner_net,
    'owner_net',      v_owner_net,
    'oyna_take',      v_oyna_take,
    'player_total',   v_player_total,
    'model',          p_model
  );
END; $function$;


-- ── 8) Saha anlaşmasının ÖZETİ (panel ekranları için) ───────────────────────
-- Örnek hesap dâhil: "2000₺'lik saat → sahaya 1900₺, oyunculardan 2400₺".

CREATE OR REPLACE FUNCTION public.pitch_agreement_summary(p_pitch_id uuid, p_ornek numeric DEFAULT 2000)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a RECORD; v jsonb; v_ozel boolean;
BEGIN
  SELECT * INTO a FROM public._pitch_agreement(p_pitch_id);
  SELECT EXISTS (SELECT 1 FROM public.commission_config c
                 WHERE c.is_active AND c.scope='PITCH' AND c.scope_id = p_pitch_id)
    INTO v_ozel;
  v := public.calculate_commission(p_ornek, 'PITCH', p_pitch_id, a.model,
                                   a.rate_pct, a.markup_pct, a.markup_amount);
  RETURN jsonb_build_object(
    'pitch_id',       p_pitch_id,
    'model',          a.model,
    'rate_pct',       a.rate_pct,
    'markup_pct',     a.markup_pct,
    'markup_amount',  a.markup_amount,
    'sahaya_ozel',    v_ozel,
    'ornek_taban',    p_ornek,
    'ornek_sahaya',   (v->>'owner_net')::numeric,
    'ornek_oyuncudan',(v->>'player_total')::numeric,
    'ornek_oyna',     (v->>'oyna_take')::numeric
  );
END; $function$;

-- Ham özet dışarıya AÇILMAZ: komisyon oranı ticari bilgidir. Yalnız kimlik
-- kontrolü yapan iki sarmalayıcı (my_pitch_agreement / admin_pitch_agreements)
-- üzerinden okunur.
REVOKE ALL ON FUNCTION public.pitch_agreement_summary(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pitch_agreement_summary(uuid, numeric) TO service_role;


-- ── 9) Saha sahibinin KENDİ anlaşmasını okuması (6a) ────────────────────────
-- YALNIZ SAHİBİ (müdür). Personel/çalışan GÖREMEZ — is_pitch_owner() sadece
-- 'OWNER' seviyesinde true döner, 'MANAGER'/'STAFF' için false.

CREATE OR REPLACE FUNCTION public.my_pitch_agreement(p_pitch_id uuid, p_ornek numeric DEFAULT 2000)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public.is_pitch_owner(p_pitch_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Anlaşma bilgisini yalnız tesis sahibi görebilir.';
  END IF;
  RETURN public.pitch_agreement_summary(p_pitch_id, p_ornek)
         || jsonb_build_object('iptal_saati', (SELECT full_hours FROM public._pitch_refund_tiers(p_pitch_id)));
END; $function$;

GRANT EXECUTE ON FUNCTION public.my_pitch_agreement(uuid, numeric) TO authenticated;


-- ── 10) Adminin saha anlaşmasını yazması ────────────────────────────────────
-- Tek RPC: sahaya özel kaydı oluşturur/günceller. p_model NULL verilirse
-- sahaya özel kayıt SİLİNİR (saha global varsayılana döner).

CREATE OR REPLACE FUNCTION public.admin_set_pitch_agreement(
  p_pitch_id uuid,
  p_model text DEFAULT NULL,
  p_rate_pct numeric DEFAULT NULL,
  p_markup_pct numeric DEFAULT NULL,
  p_markup_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_eski jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pitches WHERE id = p_pitch_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: Saha bulunamadı.';
  END IF;

  v_eski := public.pitch_agreement_summary(p_pitch_id);

  IF p_model IS NULL THEN
    DELETE FROM public.commission_config
     WHERE scope = 'PITCH' AND scope_id = p_pitch_id;
    PERFORM public.log_admin_action('PITCH_AGREEMENT_RESET','pitch',p_pitch_id,NULL,
      v_eski, jsonb_build_object('model', null));
    RETURN public.pitch_agreement_summary(p_pitch_id);
  END IF;

  IF p_model NOT IN ('MODEL_A','MODEL_B') THEN
    RAISE EXCEPTION 'INVALID_MODEL: MODEL_A ya da MODEL_B olmalı.';
  END IF;
  IF p_rate_pct IS NULL OR p_rate_pct < 0 OR p_rate_pct > 100 THEN
    RAISE EXCEPTION 'INVALID_RATE: Komisyon oranı 0–100 olmalı.';
  END IF;
  IF COALESCE(p_markup_pct,0) < 0 OR COALESCE(p_markup_pct,0) > 200 THEN
    RAISE EXCEPTION 'INVALID_MARKUP: Yüzde markup 0–200 olmalı.';
  END IF;
  IF COALESCE(p_markup_amount,0) < 0 THEN
    RAISE EXCEPTION 'INVALID_MARKUP_AMOUNT: Sabit markup negatif olamaz.';
  END IF;

  DELETE FROM public.commission_config WHERE scope='PITCH' AND scope_id = p_pitch_id;
  INSERT INTO public.commission_config
    (scope, scope_id, model, rate_pct, markup_pct, markup_amount, is_active, notes, created_by)
  VALUES ('PITCH', p_pitch_id, p_model, p_rate_pct,
          COALESCE(p_markup_pct,0), COALESCE(p_markup_amount,0), true, p_notes, auth.uid());

  PERFORM public.log_admin_action('PITCH_AGREEMENT_SET','pitch',p_pitch_id,NULL,
    v_eski, public.pitch_agreement_summary(p_pitch_id));

  RETURN public.pitch_agreement_summary(p_pitch_id);
END; $function$;

GRANT EXECUTE ON FUNCTION public.admin_set_pitch_agreement(uuid, text, numeric, numeric, numeric, text) TO authenticated;


-- ── 11) Adminin sahanın İPTAL/İADE saatlerini yazması (5a) ──────────────────
-- Saha sahibi zaten `owner_set_pitch_refund_policy` ile ayarlayabiliyor
-- (o fonksiyon platform adminine de izin veriyor). Admin panelinin tek
-- çağrıyla hem yazıp hem doğrulanmış özet alabilmesi için ince sarmalayıcı.

CREATE OR REPLACE FUNCTION public.admin_set_pitch_cancel_policy(
  p_pitch_id uuid, p_full_hours numeric, p_half_hours numeric, p_half_pct numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_eski jsonb; v_yeni jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(t) INTO v_eski FROM public._pitch_refund_tiers(p_pitch_id) t;
  PERFORM public.owner_set_pitch_refund_policy(p_pitch_id, p_full_hours, p_half_hours, p_half_pct);
  SELECT to_jsonb(t) INTO v_yeni FROM public._pitch_refund_tiers(p_pitch_id) t;
  PERFORM public.log_admin_action('PITCH_CANCEL_POLICY_SET','pitch',p_pitch_id,NULL, v_eski, v_yeni);
  RETURN v_yeni;
END; $function$;

GRANT EXECUTE ON FUNCTION public.admin_set_pitch_cancel_policy(uuid, numeric, numeric, numeric) TO authenticated;


-- ── 12) Admin listesi: tüm sahalar + anlaşmaları tek ekranda (7a) ───────────

CREATE OR REPLACE FUNCTION public.admin_pitch_agreements()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'pitch_name')
    FROM (
      SELECT public.pitch_agreement_summary(p.id)
             || jsonb_build_object(
                  'pitch_name', p.name,
                  'district',   p.district,
                  'city',       p.city,
                  'owner_id',   p.owner_id,
                  'is_published', COALESCE(p.is_published, false),
                  'iptal_saati', (SELECT full_hours FROM public._pitch_refund_tiers(p.id)),
                  'yarim_saat',  (SELECT half_hours FROM public._pitch_refund_tiers(p.id)),
                  'yarim_yuzde', (SELECT half_pct   FROM public._pitch_refund_tiers(p.id))
                ) AS x
      FROM public.pitches p
    ) q
  ), '[]'::jsonb);
END; $function$;

GRANT EXECUTE ON FUNCTION public.admin_pitch_agreements() TO authenticated;
