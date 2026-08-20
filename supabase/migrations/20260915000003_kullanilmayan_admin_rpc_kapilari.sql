-- ════════════════════════════════════════════════════════════════════════════
-- KULLANILMAYAN ADMİN RPC'LERİ — KAPI HİJYENİ (20 Ağu 2026 çapraz incelemesi)
-- ----------------------------------------------------------------------------
-- İnceleme, panelin/uygulamanın HİÇ çağırmadığı 5 istemci-açık admin RPC'si
-- buldu. Prensip 6.3 (önce PUBLIC'ten al, sonra ihtiyacı olana ver) ve kapı
-- deseni (20260805204225) gereği istemci kapıları kapatılır; fonksiyonlar
-- DROP edilmez (geri dönüş ucuz kalsın), service_role/iç çağrılar etkilenmez:
--   · admin_toggle_user_pro      → yerini Profil Aynası'ndaki is_pro anahtarı
--                                  aldı (admin_update_user_profile üzerinden)
--   · admin_set_match_image      → yerini Maç Stüdyosu görsel alanı aldı
--                                  (admin_update_match üzerinden)
--   · admin_set_player_card      → oyuncu kartı düzenleyicisi üründen söküldü
--   · admin_set_player_card_data → (üstünü iç çağrıyla kullanır; iç çağrı
--                                  SECURITY DEFINER sahibiyle çalışır, revoke
--                                  onu etkilemez)
--   · admin_adjust_wallet_balance→ tüketici cüzdanı KAPALI (6493 kararı) —
--                                  panelden bakiye oynamak artık bir yol değil
--
-- admin_recompute_match_status LİSTEDE DEĞİL: hem __core slot fonksiyonları
-- içeriden çağırıyor hem de bu göçle birlikte Maç Kokpiti'ne düğme bağlandı.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  fn text;
  r  record;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_toggle_user_pro', 'admin_set_match_image',
    'admin_set_player_card', 'admin_set_player_card_data',
    'admin_adjust_wallet_balance'
  ] LOOP
    FOR r IN
      SELECT p.oid, p.oid::regprocedure::text AS imza
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.oid::regprocedure);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.oid::regprocedure);

      -- Gece kapı denetimi canlı durumu bu kayıtla karşılaştırır — kayıt
      -- güncellenmezse denetim "onaylı açıktı, kapanmış" diye alarm üretir.
      INSERT INTO public.kapi_kayitli_durum (fonksiyon, anon_acik, authenticated_acik, onaylandi_at, aciklama)
      VALUES (r.imza, false, false, now(),
              'Capraz inceleme 20 Agu 2026: istemciden hic cagrilmiyor (panel/uygulama taramasi). Istemci kapilari kapatildi; service_role acik.')
      ON CONFLICT (fonksiyon) DO UPDATE
        SET anon_acik = false,
            authenticated_acik = false,
            onaylandi_at = now(),
            aciklama = EXCLUDED.aciklama;
    END LOOP;
  END LOOP;
END $$;

-- ── Kokpite bağlanan fonksiyonun kapısı BİLİNÇLİ açılır ────────────────────
-- admin_recompute_match_status bugüne dek yalnız iç çağrıyla yaşıyordu
-- (authenticated kapısı hiç açılmamış). Maç Kokpiti'ne "durumu yeniden
-- hesapla" düğmesi bağlandığı için kapı şimdi açılır; fonksiyonun ilk satırı
-- zaten is_platform_admin ister, anon dışarıda kalır.
REVOKE ALL ON FUNCTION public.admin_recompute_match_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recompute_match_status(uuid) TO authenticated, service_role;

DO $$
BEGIN
  INSERT INTO public.kapi_kayitli_durum (fonksiyon, anon_acik, authenticated_acik, onaylandi_at, aciklama)
  VALUES ('admin_recompute_match_status(uuid)', false, true, now(),
          'Mac Kokpiti "durumu yeniden hesapla" dugmesi (20 Agu 2026). Ic is_platform_admin kapisi var; anon kapali.')
  ON CONFLICT (fonksiyon) DO UPDATE
    SET anon_acik = false, authenticated_acik = true, onaylandi_at = now(), aciklama = EXCLUDED.aciklama;
END $$;

-- ── Doğrulama (prensip 7.7) ─────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
  r  record;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_toggle_user_pro', 'admin_set_match_image',
    'admin_set_player_card', 'admin_set_player_card_data',
    'admin_adjust_wallet_balance'
  ] LOOP
    FOR r IN
      SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
    LOOP
      IF has_function_privilege('authenticated', r.oid, 'EXECUTE')
         OR has_function_privilege('anon', r.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'DOGRULAMA: % istemci kapisi hala acik', fn;
      END IF;
    END LOOP;
  END LOOP;

  -- Kokpite bağlanan fonksiyonun kapısı AÇIK kalmalı (panel authenticated çağırır).
  IF NOT has_function_privilege('authenticated', 'public.admin_recompute_match_status(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: admin_recompute_match_status panel icin kapali';
  END IF;
END $$;
