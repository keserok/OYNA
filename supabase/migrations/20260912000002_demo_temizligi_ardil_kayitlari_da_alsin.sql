-- ════════════════════════════════════════════════════════════════════════════
-- DEMO TEMİZLİĞİ ARDIL KAYITLARI DA ALSIN
-- ----------------------------------------------------------------------------
-- BULUNAN HATA (19 Ağustos 2026): `demo_ekosistem_temizle()` "ürettiği HER
-- ŞEYİ siler" sözü veriyordu ama veremiyordu. Ekosistemi yeniden kurmayı
-- denerken patladı:
--
--   ERROR 23503: update or delete on table "matches" violates foreign key
--   constraint "wallet_transactions_match_id_fkey"
--
-- SEBEBİ, aslında SİSTEMİN ÇALIŞMASI: tohumlanan GEÇMİŞ maçlardan biri
-- `auto_finalize_matches` cron'una yakalandı ve maç kesinleşince saha sahibine
-- MATCH_EARNING defter satırı yazıldı. O satır `_demo_ekosistem` damgası
-- taşımıyor — çünkü onu tohumlayıcı değil, ürünün kendi mantığı yazdı — ama
-- `wallet_transactions.match_id` üzerinden maça bağlı ve FK'sı NO ACTION.
-- Temizlik damgaya baktığı için satırı görmüyor, maçı silmeye kalkınca
-- veritabanı haklı olarak reddediyordu.
--
-- NEDEN ÖNEMLİ: kurucunun planı "en son bu verileri komple sileceğiz". O çağrı
-- da aynı yerde patlardı ve demo verisi canlıda kalırdı.
--
-- ÇÖZÜM: defter satırlarını damgayla DEĞİL, damgalı maçların kimliğiyle sil.
-- Damga yolu da duruyor (maça bağlı olmayan tohum satırları için).
--
-- KAPSAM DAR TUTULDU: `matches`/`pitch_bookings` üzerine kurulu FK'ler tarandı;
-- NO ACTION olan TEK bağımlı `wallet_transactions.match_id`. Diğerleri CASCADE
-- ya da SET NULL, yani kendiliğinden çözülüyor. Bu yüzden tek tablo ekleniyor.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.demo_ekosistem_temizle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rez int; v_niyet int; v_kayit int; v_defter int;
BEGIN
  DELETE FROM public.match_participants WHERE match_id IN (
    SELECT id FROM public.matches WHERE cancel_reason = '_demo_ekosistem');

  -- İKİ YOL: (a) tohumlayıcının kendi yazdığı damgalı satırlar,
  -- (b) ürünün mantığının o maçlar için ÜRETTİĞİ ardıl satırlar (MATCH_EARNING,
  --     ceza, iade kredisi...). (b) damga taşımaz; maç kimliğinden yakalanır.
  DELETE FROM public.wallet_transactions
   WHERE description LIKE '%_demo_ekosistem%'
      OR match_id IN (SELECT id FROM public.matches WHERE cancel_reason = '_demo_ekosistem');
  GET DIAGNOSTICS v_defter = ROW_COUNT;

  DELETE FROM public.payment_intents WHERE raw->>'kaynak' = '_demo_ekosistem';
  GET DIAGNOSTICS v_niyet = ROW_COUNT;
  DELETE FROM public.booking_payments WHERE note = '_demo_ekosistem';
  DELETE FROM public.pitch_bookings WHERE cancellation_reason = '_demo_ekosistem'
     OR match_id IN (SELECT id FROM public.matches WHERE cancel_reason = '_demo_ekosistem');
  GET DIAGNOSTICS v_rez = ROW_COUNT;
  DELETE FROM public.matches WHERE cancel_reason = '_demo_ekosistem';
  GET DIAGNOSTICS v_kayit = ROW_COUNT;

  RETURN jsonb_build_object(
    'mac', v_kayit, 'rezervasyon', v_rez, 'niyet', v_niyet, 'defter', v_defter);
END;
$fn$;

REVOKE ALL ON FUNCTION public.demo_ekosistem_temizle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_ekosistem_temizle() TO service_role;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
-- Hatayı BİREBİR yeniden üret: damgalı bir maça DAMGASIZ bir defter satırı
-- ekle (cron'un yaptığı şey) ve temizliğin artık takılmadan geçtiğini kanıtla.
-- Maç şemasını burada yeniden kurmak yerine var olan damgalı bir maç kullanılır;
-- kolon adlarını tekrar yazmak, bu göçü şemadaki değişikliklere kırılgan yapardı.
DO $dog$
DECLARE
  v_mac uuid; v_kul uuid; v_kalan int;
BEGIN
  SELECT id INTO v_mac FROM public.matches WHERE cancel_reason = '_demo_ekosistem' LIMIT 1;
  SELECT user_id INTO v_kul FROM public.wallet_transactions LIMIT 1;
  IF v_mac IS NULL THEN
    SELECT id INTO v_kul FROM public.profiles LIMIT 1;
    RAISE NOTICE 'DOGRULAMA ATLANDI: damgali demo maci yok — temizlenecek veri yok.';
    RETURN;
  END IF;
  IF v_kul IS NULL THEN SELECT id INTO v_kul FROM public.profiles LIMIT 1; END IF;

  -- Damga TAŞIMAYAN, maça bağlı defter satırı — hatanın tam kaynağı
  -- (auto_finalize_matches'in yazdığı MATCH_EARNING ile aynı biçim).
  INSERT INTO public.wallet_transactions (user_id, match_id, type, amount, description)
  VALUES (v_kul, v_mac, 'MATCH_EARNING', 1, 'dogrulama satiri (damgasiz)');

  PERFORM public.demo_ekosistem_temizle();

  SELECT count(*) INTO v_kalan FROM public.matches WHERE id = v_mac;
  IF v_kalan <> 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: damgali mac silinemedi — temizlik hala eksik';
  END IF;
  SELECT count(*) INTO v_kalan FROM public.wallet_transactions WHERE match_id = v_mac;
  IF v_kalan <> 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: ardil defter satiri geride kaldi';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: ardil defter satirlari da temizleniyor.';

  -- Doğrulama ekosistemi SİLEREK kanıtlıyor; sıfırdan kurulan bir ortam bu
  -- göçten sonra boş bir vitrinle kalmasın diye geri kuruluyor. Kadrosu
  -- olmayan ortamda tohumlanacak bir şey yok — bilinen tek durum yakalanır,
  -- başka her hata olduğu gibi yükselir.
  BEGIN
    PERFORM public.demo_ekosistem_kur();
    RAISE NOTICE 'Ekosistem geri kuruldu.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'DEMO_YOK%' THEN RAISE; END IF;
    RAISE NOTICE 'Demo kadrosu yok — ekosistem geri kurulmadi.';
  END;
END $dog$;
