-- ============================================================================
-- FAZ 2c — profiles.roles koruma trigger'ı bypass regresyon testi
-- ----------------------------------------------------------------------------
-- protect_profile_sensitive_fields: `roles` dalı app.bypass_role_protection
-- bayrağını ONURLANDIRMALI (`role` ve `wallet_balance` dallarıyla simetrik).
-- Aksi halde bayrağı kuran SECURITY DEFINER RPC'ler (claim_owner_role,
-- apply_for_provider_role, _sync_role_from_provider_status) profiles.roles yazınca
-- non-admin çağıran için çöker — çift trigger'da 'p…' < 't…' sırası yüzünden
-- sensitive-fields önce RAISE eder, protect_profile_columns'ın yumuşak revert'ine
-- hiç sıra gelmez.
--
-- İzole: BEGIN/ROLLBACK. Kurulum auth.uid() NULL iken koşar (trigger'lar pas geçer),
-- sonra set_config('request.jwt.claims', …, true) ile kimlik taklit edilir.
--
-- > Bu testin varlık nedeni: faz7_security_infra.sql yalnız set_active_role'u sınar
-- > (yalnız `role` yazar), `roles` dalındaki eksik bypass'ı yakalamaz. Aynı trigger'da
-- > iki kardeş hata üretim öncesi zaten giderilmişti: `role` (FAZ 7) ve `wallet_balance`
-- > (FAZ 5 round4). Bu, üçüncü ve son bypass.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  own uuid := 'b2c00000-0000-0000-0000-0000000000f1';  -- non-admin owner adayı
  gk  uuid := 'b2c00000-0000-0000-0000-0000000000f2';  -- non-admin provider adayı
  pit uuid := 'b2c00000-0000-0000-0000-0000000000f3';  -- own'a ait (demo DEĞİL) tesis
  v_roles jsonb; v_role text; v_ret text;
BEGIN
  -- ── setup (auth.uid() NULL → protect trigger'ları pas geçer) ──
  INSERT INTO auth.users(id) VALUES (own),(gk);
  UPDATE public.profiles SET roles='["PLAYER"]'::jsonb, role='PLAYER' WHERE id IN (own, gk);
  INSERT INTO public.pitches(id, name, address, latitude, longitude, owner_id, is_demo)
    VALUES (pit, 'SahaX', 'Kadıköy', 41.0082, 28.9784, own, false);

  -- ── 1) claim_owner_role — bug'ın çökerttiği ana yol (owner onboarding) ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  v_ret := public.claim_owner_role();
  SELECT roles, role INTO v_roles, v_role FROM public.profiles WHERE id = own;
  INSERT INTO _r VALUES ('1_claim_owner_returns_OWNER',   v_ret = 'OWNER',    'ret='||COALESCE(v_ret,'∅'));
  INSERT INTO _r VALUES ('1_claim_owner_roles_has_OWNER', v_roles ? 'OWNER',  v_roles::text);
  INSERT INTO _r VALUES ('1_claim_owner_keeps_PLAYER',    v_roles ? 'PLAYER', v_roles::text);
  INSERT INTO _r VALUES ('1_claim_owner_active_OWNER',    v_role = 'OWNER',   'role='||COALESCE(v_role,'∅'));

  -- ── 2) apply_for_provider_role — player→goalkeeper ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gk, 'role', 'authenticated')::text, true);
  PERFORM public.apply_for_provider_role('GOALKEEPER');
  SELECT roles, role INTO v_roles, v_role FROM public.profiles WHERE id = gk;
  INSERT INTO _r VALUES ('2_apply_roles_has_GOALKEEPER', v_roles ? 'GOALKEEPER', v_roles::text);
  INSERT INTO _r VALUES ('2_apply_keeps_PLAYER',         v_roles ? 'PLAYER',     v_roles::text);
  INSERT INTO _r VALUES ('2_apply_active_GOALKEEPER',    v_role = 'GOALKEEPER',  'role='||COALESCE(v_role,'∅'));

  -- ── 3) NEGATİF (over-open muhafızı): bayrak yokken doğrudan roles yazımı hâlâ bloklu ──
  -- KRİTİK: yukarıdaki RPC'ler bayrağı transaction-local 'true' bıraktı; test tek
  -- transaction olduğundan sızar. Üretimde her PostgREST RPC'si ayrı transaction (sızmaz);
  -- burada elle 'false'a çekiyoruz ki negatif senaryo gerçekten korumasız-yolu sınasın.
  -- Ayrıca bu harness RLS'i baypas eder (service bağlantısı) → bu test yalnız TRIGGER
  -- katmanını doğrular; bu düzeltmenin dokunduğu katman tam da budur.
  PERFORM set_config('app.bypass_role_protection', 'false', true);
  BEGIN
    UPDATE public.profiles SET roles = COALESCE(roles, '[]'::jsonb) || '["ADMIN"]'::jsonb WHERE id = gk;
    INSERT INTO _r VALUES ('3_direct_roles_write_blocked', false, 'izin verdi (OVER-OPEN!)');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('3_direct_roles_write_blocked', position('SECURITY' in SQLERRM) > 0, 'raised: '||SQLERRM);
  END;
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
