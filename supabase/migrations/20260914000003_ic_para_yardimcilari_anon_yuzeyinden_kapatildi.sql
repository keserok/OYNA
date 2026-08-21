-- ════════════════════════════════════════════════════════════════════════════
-- İÇ PARA YARDIMCILARI ANON YÜZEYİNDEN KAPATILDI
-- ----------------------------------------------------------------------------
-- BULGU (21 Ağustos 2026, mağaza gönderimi öncesi güvenlik taraması):
-- Alt çizgiyle başlayan (İÇ) sekiz yardımcı, uygulama rollerine AÇIK kalmıştı.
-- Sebebi yetki verilmesi DEĞİL, verilmemesiydi: PostgreSQL yeni bir fonksiyona
-- varsayılan olarak PUBLIC EXECUTE tanır (ACL `=X/postgres`). Bu fonksiyonlar
-- son dalgalarda (iade modeli, cüzdan kapısı, listeleme sınırı) YENİ
-- oluşturulduğu için deponun "iç yardımcılar kapatılır" disiplininden
-- (20260805203555, 20260730164624, 20260913000000) sonra doğdular ve
-- taramaya yakalanana dek açık kaldılar.
--
-- ── NEDEN CİDDİ ────────────────────────────────────────────────────────────
--   · `_match_refund_exact` / `_match_refund_partial`: SECURITY DEFINER, VOLATILE
--     ve İÇLERİNDE YETKİ KAPISI YOK. Kullanıcı kimliğini parametre olarak alıp
--     `_iade_kullaniciya_mac`'i çağırıyorlar. Yani oturum AÇMAMIŞ bir çağıran,
--     bildiği bir kullanıcı+maç çifti için GERÇEK İADE yazdırabilirdi. Tutar
--     kişinin gerçekten ödediğiyle sınırlı ama para yine de yetkisiz hareket
--     ederdi (tesis hakedişi ve defter bozulur).
--   · `_match_charge_profile`: aynı şekilde kapısız; herhangi biri, herhangi bir
--     kullanıcının bir maçta ne ödediğini okuyabilirdi (finansal veri ifşası).
--   · `_cuzdan_kapisi_*` ve `_listeleme_siniri_bekcisi` TETİKLEYİCİ
--     fonksiyonlarıdır; PostgreSQL doğrudan çağrılmalarını zaten reddeder —
--     yüzeyde durmaları yine de gereksiz (savunma katmanı).
--   · `_listeleme_eksen_dk`, `_tr_telefon_norm`: saf yardımcılar, zararsız ama
--     genel yüzeyde işleri yok.
--
-- ── NEYE DOKUNULMADI (bilerek) ─────────────────────────────────────────────
-- RLS POLİTİKALARININ çağırdığı yardımcılar açık KALMALI: politika ifadesi
-- sorguyu atan rolün haklarıyla değerlendirilir, yetki kapatılırsa o tablo
-- HERKESE kapanır. Bu yüzden `_is_match_participant`, `_is_team_admin`,
-- `_is_team_member`, `_hire_side_for` ve görünümlerin kullandığı
-- `_reserve_anon_maskele`, `_slots_anon_maskele` ile açık yetkisi bilinçli
-- verilmiş `_cagiran_demo_mu` bu göçün DIŞINDADIR.
--
-- ── İÇ ÇAĞIRANLAR NEDEN KIRILMAZ ───────────────────────────────────────────
-- Bu yardımcıları çağıran fonksiyonların hepsi SECURITY DEFINER'dır ve sahibi
-- (postgres) haklarıyla çalışır; `postgres=X` yetkisi korunuyor. Tetikleyiciler
-- de EXECUTE yetkisine bakmaz. Kapatılan tek şey DIŞARIDAN doğrudan çağrıdır.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public._match_refund_exact(p_user_id uuid, p_match_id uuid, p_amount numeric, p_reason text)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._match_refund_partial(p_user_id uuid, p_match_id uuid, p_cap numeric, p_apply_psp boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._match_charge_profile(p_user_id uuid, p_match_id uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cuzdan_kapisi_payment_intents()                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cuzdan_kapisi_wallet_tx()                                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._listeleme_siniri_bekcisi()                                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._listeleme_eksen_dk(p_t time without time zone)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tr_telefon_norm(p_phone text)                              FROM PUBLIC, anon, authenticated;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE
  v_acik text;
BEGIN
  -- 1) Kapatılanlar gerçekten kapandı mı?
  SELECT string_agg(p.proname, ', ') INTO v_acik
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('_match_refund_exact','_match_refund_partial','_match_charge_profile',
                      '_cuzdan_kapisi_payment_intents','_cuzdan_kapisi_wallet_tx',
                      '_listeleme_siniri_bekcisi','_listeleme_eksen_dk','_tr_telefon_norm')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_acik IS NOT NULL THEN
    RAISE EXCEPTION 'DOGRULAMA: su ic yardimcilar hala uygulama rollerine acik: %', v_acik;
  END IF;

  -- 2) RLS/görünüm yardımcıları YANLIŞLIKLA kapatılmadı mı? (kapanırsa o
  --    tablolar herkese kapanır — sessiz ve yaygın bir arıza olurdu)
  SELECT string_agg(p.proname, ', ') INTO v_acik
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('_is_match_participant','_is_team_admin','_is_team_member','_hire_side_for')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_acik IS NOT NULL THEN
    RAISE EXCEPTION 'DOGRULAMA: RLS yardimcilari kapanmis (tablolar erisilemez olur): %', v_acik;
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_acik
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('_reserve_anon_maskele','_slots_anon_maskele')
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_acik IS NOT NULL THEN
    RAISE EXCEPTION 'DOGRULAMA: anon maskeleme yardimcilari kapanmis: %', v_acik;
  END IF;

  -- 3) Fonksiyonların kendileri duruyor (yanlışlıkla düşürülmediler).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('_match_refund_exact','_match_refund_partial')) <> 2 THEN
    RAISE EXCEPTION 'DOGRULAMA: iade yardimcilari kayip';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: 8 ic yardimci kapatildi; RLS/gorunum yardimcilari korundu.';
END $dog$;
