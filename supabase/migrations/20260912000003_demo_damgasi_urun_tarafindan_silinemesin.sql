-- ════════════════════════════════════════════════════════════════════════════
-- DEMO DAMGASI ÜRÜN TARAFINDAN SİLİNEMESİN
-- ----------------------------------------------------------------------------
-- BULUNAN HATA (19 Ağustos 2026): demo ekosistemi kayıtlarını
-- `matches.cancel_reason = '_demo_ekosistem'` ile işaretliyordu. Ama
-- `cancel_reason` ÜRÜNÜN KENDİ YAZDIĞI bir kolon: `auto_process_matches`
-- cron'u dolmayan bir maçı iptal ederken oraya 'QUORUM_NOT_MET' yazıyor ve
-- damgayı EZİYOR.
--
-- Ölçüldü, tahmin değil: tohumlanan 92 maçın 2'si daha ilk 20 dakikada
-- damgasını kaybetmişti. İnceleme 21 gün sürecek; o süre boyunca dolmayan
-- her maç damgasız kalacaktı.
--
-- SONUÇ NE OLURDU: kurucunun "en son bu verileri komple sileceğiz" çağrısı
-- bu satırları GÖREMEZDİ. Demo maçlar canlıda, gerçek kullanıcıların arasında
-- kalırdı — üstelik hangilerinin demo olduğunu artık kimse bilemezdi.
--
-- ── ÇÖZÜM: DAMGAYI ÜRÜNÜN ELİNİN DEĞMEDİĞİ YERE TAŞI ──────────────────────
-- Ayrı bir defter tablosu: `demo_ekosistem_kayit`. Tohumlayıcının ürettiği
-- her maç oraya yazılır ve ürünün hiçbir akışı o tabloya dokunmaz.
--
-- Yazma işi TETİKLEYİCİYE veriliyor, tohumlayıcı fonksiyona değil: damga
-- INSERT anında, yani herhangi bir cron'un kolonu ezmesinden ÖNCE yakalanır.
-- Ayrıca tohumlayıcının gövdesine hiç dokunulmuyor.
--
-- Eski yol (cancel_reason) SİLİNMİYOR, yanına ekleniyor: iki yoldan biri
-- yeterli. Böylece elle damgalanmış bir kayıt da temizlenmeye devam eder.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.demo_ekosistem_kayit (
  match_id   uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_ekosistem_kayit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_ekosistem_kayit FROM PUBLIC, anon, authenticated;
GRANT ALL  ON public.demo_ekosistem_kayit TO service_role;

COMMENT ON TABLE public.demo_ekosistem_kayit IS
  'Demo ekosisteminin ürettiği maçların defteri. matches.cancel_reason ürün '
  'tarafından eziliyor (QUORUM_NOT_MET); silinebilirlik bu tabloya dayanır.';

-- ── Damga INSERT anında yakalanır ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._demo_ekosistem_kaydet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.cancel_reason = '_demo_ekosistem' THEN
    INSERT INTO public.demo_ekosistem_kayit (match_id)
    VALUES (NEW.id)
    ON CONFLICT (match_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public._demo_ekosistem_kaydet() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_demo_ekosistem_kaydet ON public.matches;
CREATE TRIGGER trg_demo_ekosistem_kaydet
AFTER INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public._demo_ekosistem_kaydet();

-- ── Hâlihazırda damgalı olanlar deftere geçiriliyor ─────────────────────────
INSERT INTO public.demo_ekosistem_kayit (match_id)
SELECT id FROM public.matches WHERE cancel_reason = '_demo_ekosistem'
ON CONFLICT (match_id) DO NOTHING;

-- ── Temizlik artık DEFTERE bakıyor ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.demo_ekosistem_temizle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rez int; v_niyet int; v_kayit int; v_defter int;
BEGIN
  -- Hedef küme TEK YERDE tanımlanır: defter ∪ hâlâ damgalı olanlar.
  CREATE TEMP TABLE _demo_hedef ON COMMIT DROP AS
    SELECT id FROM public.matches WHERE cancel_reason = '_demo_ekosistem'
    UNION
    SELECT match_id FROM public.demo_ekosistem_kayit;

  DELETE FROM public.match_participants WHERE match_id IN (SELECT id FROM _demo_hedef);

  -- Damgalı satırlar + ürünün o maçlar için ÜRETTİĞİ ardıl satırlar
  -- (MATCH_EARNING, ceza, iade kredisi...). İkincisi damga taşımaz.
  DELETE FROM public.wallet_transactions
   WHERE description LIKE '%_demo_ekosistem%'
      OR match_id IN (SELECT id FROM _demo_hedef);
  GET DIAGNOSTICS v_defter = ROW_COUNT;

  DELETE FROM public.payment_intents WHERE raw->>'kaynak' = '_demo_ekosistem';
  GET DIAGNOSTICS v_niyet = ROW_COUNT;
  DELETE FROM public.booking_payments WHERE note = '_demo_ekosistem';
  DELETE FROM public.pitch_bookings WHERE cancellation_reason = '_demo_ekosistem'
     OR match_id IN (SELECT id FROM _demo_hedef);
  GET DIAGNOSTICS v_rez = ROW_COUNT;
  DELETE FROM public.matches WHERE id IN (SELECT id FROM _demo_hedef);
  GET DIAGNOSTICS v_kayit = ROW_COUNT;

  DROP TABLE _demo_hedef;

  RETURN jsonb_build_object(
    'mac', v_kayit, 'rezervasyon', v_rez, 'niyet', v_niyet, 'defter', v_defter);
END;
$fn$;

REVOKE ALL ON FUNCTION public.demo_ekosistem_temizle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_ekosistem_temizle() TO service_role;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
-- Hatayı BİREBİR yeniden üret: damgalı bir maç yarat, damgasını ürünün yaptığı
-- gibi EZ, sonra temizliğin onu YİNE de sildiğini kanıtla. Eski kod bu maçı
-- geride bırakırdı; kanıtlanmadan bu göç geçmemeli.
DO $dog$
DECLARE v_kaynak uuid; v_yeni uuid; v_kalan int; v_defterde int;
BEGIN
  SELECT id INTO v_kaynak FROM public.matches WHERE cancel_reason = '_demo_ekosistem' LIMIT 1;
  IF v_kaynak IS NULL THEN
    RAISE NOTICE 'DOGRULAMA ATLANDI: damgali demo maci yok.';
    RETURN;
  END IF;

  -- Var olan bir maçı kopyalayarak yarat: kolon listesini burada yeniden
  -- yazmak, bu göçü şemadaki her değişikliğe kırılgan yapardı. (hstore kurulu
  -- değil; jsonb yolu ek uzantı istemiyor.)
  v_yeni := gen_random_uuid();
  INSERT INTO public.matches
  SELECT (jsonb_populate_record(
            NULL::public.matches,
            to_jsonb(m) || jsonb_build_object('id', v_yeni)
          )).*
  FROM public.matches m WHERE m.id = v_kaynak;

  SELECT count(*) INTO v_defterde FROM public.demo_ekosistem_kayit WHERE match_id = v_yeni;
  IF v_defterde <> 1 THEN
    RAISE EXCEPTION 'DOGRULAMA: tetikleyici damgayi deftere yazmadi';
  END IF;

  -- Ürünün yaptığı şey: iptal sebebini üzerine yaz.
  UPDATE public.matches SET cancel_reason = 'QUORUM_NOT_MET' WHERE id = v_yeni;

  PERFORM public.demo_ekosistem_temizle();

  SELECT count(*) INTO v_kalan FROM public.matches WHERE id = v_yeni;
  IF v_kalan <> 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: damgasi ezilen mac temizlikten kacti — kacak duruyor';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: damgasi ezilse de demo maci temizleniyor.';
END $dog$;
