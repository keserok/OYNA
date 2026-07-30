-- ═══════════════════════════════════════════════════════════════════════════
-- OYNA — Dahili yardımcı fonksiyonların REST yüzeyinden kapatılması
--
-- BULGU (güvenlik denetimi): `_` önekli dahili yardımcılar, Postgres'in
-- varsayılan `GRANT EXECUTE TO PUBLIC` davranışı yüzünden PostgREST üzerinden
-- doğrudan çağrılabiliyordu (`/rest/v1/rpc/<fn>`). Bu fonksiyonlar
-- SECURITY DEFINER'dır ve KENDİ İÇLERİNDE auth/sahiplik/durum kontrolü YOKTUR
-- — çünkü tasarımları gereği yalnız korumalı genel sarmalayıcılardan
-- (ör. `cancel_wallet_cashout`, `process_payout`) çağrılırlar. Sarmalayıcıların
-- kapısı doğru kapatılmış (`REVOKE ... FROM PUBLIC, anon`), fakat yardımcının
-- kapısı açık kaldığı için kontroller atlanabiliyordu.
--
-- En kritiği `_wallet_cashout_restore`: `anon` rolüyle, yani hiç oturum
-- açmadan sadece anon anahtarıyla çağrılabiliyordu ve cüzdana bakiye YAZIYOR.
-- Talebin durumunu kontrol etmediği için, para bankaya çıktıktan (COMPLETED)
-- sonra tekrar çağrılıp aynı tutarın cüzdana geri yüklenmesine — yani
-- çift-harcamaya — izin veriyordu.
--
-- BU MIGRATION İKİ KATMAN EKLER:
--   1) Yetki: dahili yardımcılardan PUBLIC/anon/authenticated EXECUTE alınır.
--      İç çağrılar etkilenmez — çağıran sarmalayıcılar SECURITY DEFINER'dır ve
--      sahibi (postgres) yetkisiyle çalışır.
--   2) Derinlik savunması: `_wallet_cashout_restore` artık talebin durumunu
--      kendisi de doğrular; yetki bir gün yeniden sızdırılsa bile geri yükleme
--      yalnız CANCELLED/FAILED talepler için çalışır.
--
-- DOĞRULANDI (uygulama öncesi): bu fonksiyonların hiçbiri RLS politikalarında
-- veya view tanımlarında kullanılmıyor ve istemci hiçbir `_` önekli RPC'yi
-- çağırmıyor — dolayısıyla revoke davranışsal kırılma üretmez.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Derinlik savunması: durum kontrolü fonksiyonun kendi içine ──────────
-- Her iki meşru çağıran da (`cancel_wallet_cashout`, `process_payout`) talebi
-- CANCELLED/FAILED'e ÇEKTİKTEN SONRA bu fonksiyonu çağırır; fonksiyon satırı
-- yeniden okuduğu için yeni durumu görür. Bu yüzden guard meşru akışı bozmaz.
CREATE OR REPLACE FUNCTION public._wallet_cashout_restore(p_payout_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_p public.payout_requests;
  v_refund numeric; v_topup numeric; v_restored numeric := 0;
BEGIN
  SELECT * INTO v_p FROM public.payout_requests WHERE id = p_payout_id;
  IF NOT FOUND OR v_p.payout_type <> 'WALLET_CASHOUT' THEN RETURN 0; END IF;

  -- Geri yükleme YALNIZ sonuçlanmamış/başarısız talep için anlamlıdır. PENDING,
  -- PROCESSING veya COMPLETED bir talep için geri yükleme yapmak, parayı hem
  -- bankaya hem cüzdana vermek olur (çift-harcama).
  IF COALESCE(v_p.status, '') NOT IN ('CANCELLED', 'FAILED') THEN
    RETURN 0;
  END IF;

  v_refund := round(COALESCE(v_p.from_refund_credit_amount, 0), 2);
  v_topup  := round(COALESCE(v_p.from_topup_amount, 0), 2);
  IF v_refund = 0 AND v_topup = 0 THEN v_topup := round(COALESCE(v_p.amount,0), 2); END IF;

  IF v_refund > 0 AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id
      AND type = 'REFUND' AND balance_type = 'REFUND_CREDIT'
  ) THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_p.user_id, v_refund, 'REFUND', 'REFUND_CREDIT', 'COMPLETED', 'PAYOUT', p_payout_id,
            'Çekim talebi sonuçlanmadı — tutar cüzdana geri yüklendi (hizmet bedeli alınmadı)');
    v_restored := v_restored + v_refund;
  END IF;

  IF v_topup > 0 AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id
      AND type = 'TOP_UP' AND balance_type = 'TOP_UP'
  ) THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_p.user_id, v_topup, 'TOP_UP', 'TOP_UP', 'COMPLETED', 'PAYOUT', p_payout_id,
            'Çekim talebi sonuçlanmadı — tutar cüzdana geri yüklendi (hizmet bedeli alınmadı)');
    v_restored := v_restored + v_topup;
  END IF;

  IF v_restored > 0 THEN PERFORM public._sync_wallet_mirror(v_p.user_id); END IF;
  RETURN v_restored;
END;
$function$;

-- ─── 2) Yetki: dahili yardımcılar REST yüzeyinden kaldırılır ────────────────
-- NOT: `CREATE OR REPLACE FUNCTION` yetkileri korur; bu yüzden yukarıdaki
-- yeniden tanımdan SONRA revoke etmek gerekir.
DO $$
DECLARE
  v_fn text;
  v_sig text;
  -- Yalnız "dahili" olduğu doğrulanmış imzalar. Liste bilinçli olarak açıktır:
  -- yeni bir dahili yardımcı eklendiğinde buraya da eklenmelidir.
  v_signatures text[] := ARRAY[
    -- Para hareketi yazanlar (kritik)
    '_wallet_cashout_restore(uuid)',
    '_release_service_payout(uuid,uuid)',
    -- Durum/veri yazanlar (bütünlük)
    '_recompute_pitch_rating(uuid)',
    '_recompute_provider_rating(uuid,text)',
    '_sync_profile_communities(uuid)',
    '_gen_staff_invite_code()',
    -- Başka kullanıcının verisini sızdırabilenler (gizlilik)
    '_wallet_withdrawable(uuid)',
    '_format_allowed_for_pitch(uuid,text)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_signatures LOOP
    v_fn := 'public.' || v_sig;
    -- Fonksiyon yoksa sessizce atla (idempotent replay / kısmi şema).
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE NOTICE 'atlandi (bulunamadi): %', v_fn;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_fn);
    -- service_role ve sahip (postgres) dokunulmaz: Edge Function'lar ve
    -- sarmalayıcı SECURITY DEFINER fonksiyonlar bu yolla çalışmaya devam eder.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;
END $$;
