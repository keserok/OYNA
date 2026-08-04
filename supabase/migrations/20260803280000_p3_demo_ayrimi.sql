-- ════════════════════════════════════════════════════════════════════════════
-- [P-3 / K-10.8 / Çakışma-2] DEMO VERİ AYRIMI — para tablolarına demo işareti
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN (canlıda ölçüldü):
--   Demo işareti YALNIZ iki tabloda vardı: matches."isDemo", pitches.is_demo.
--   payment_intents, wallet_transactions, pitch_bookings, profiles,
--   match_participants, notifications tablolarında YOKTU.
--
--   Yani DEMO PARA, GERÇEK PARADAN AYIRT EDİLEMİYORDU:
--     • 20 ödeme kaydı / 15.860 ₺
--     • yalnız 3'ü (2.600 ₺) maç üzerinden demo diye türetilebiliyordu
--     • 10 kayıt (YARISI) hiçbir maça/rezervasyona bağlı değildi → türetilemez
--
--   Çakışma-2'de kurucuya "denetim sorgularına demo hariç filtresi koyacağım"
--   sözü verilmişti. FİLTRELENECEK ALAN YOKTU.
--
--   Somut sonuç: günlük denetimdeki "askıda ödeme var mı" kontrolü demo
--   kaynaklı 900 ₺'lik kaydı sayıp HER GÜN boşuna kırmızı yanacaktı — tam da
--   "sürekli yanan alarm, alarm olmaktan çıkar" endişesi.
--
-- SINIFLANDIRMA KURALI (kanıtlı):
--   supabase/seeds/demo_ekosistem_seed.sql başlığı: "Sadece @oyna.app uzantılı
--   29 demo hesabı ve isDemo = true maçlar etkilenir."
--   Canlı ölçüm bunu BİREBİR doğruladı: @oyna.app = 29 kişi, gerçek = 3,
--   silinmiş = 1. Ayrıca 20'si aynı mikrosaniyede tohumlanmış.
--
--   → Bir kayıt DEMO'dur eğer: sahibi @oyna.app hesabı VEYA bağlı olduğu maç
--     isDemo VEYA bağlı olduğu saha is_demo ise.
--
-- ÇÜRÜME KARŞITI: sütunlar elle doldurulup bırakılmıyor; her tabloya BEFORE
--   INSERT/UPDATE tetikleyicisi konuyor. Yeni kayıt kendiliğinden sınıflanır.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Sütunlar ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles            ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.payment_intents     ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.pitch_bookings      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.match_participants  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications       ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Sütunlar istemciden yazılamaz (kullanıcı kendi kaydını "demo" gösteremesin)
REVOKE UPDATE (is_demo) ON public.profiles            FROM authenticated;
REVOKE UPDATE (is_demo) ON public.payment_intents     FROM authenticated;
REVOKE UPDATE (is_demo) ON public.wallet_transactions FROM authenticated;
REVOKE UPDATE (is_demo) ON public.pitch_bookings      FROM authenticated;
REVOKE UPDATE (is_demo) ON public.match_participants  FROM authenticated;
REVOKE UPDATE (is_demo) ON public.notifications       FROM authenticated;

-- ── 2) Yardımcı: bu kullanıcı demo mu? ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public._kullanici_demo_mu(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT email ILIKE '%@oyna.app' FROM public.profiles WHERE id = p_uid), false);
$function$;

COMMENT ON FUNCTION public._kullanici_demo_mu(uuid) IS
  'P-3: Demo hesap olcutu = @oyna.app e-posta uzantisi. Kaynak: supabase/seeds/demo_ekosistem_seed.sql';

-- ── 3) Geriye dönük doldurma ────────────────────────────────────────────────
UPDATE public.profiles SET is_demo = true WHERE email ILIKE '%@oyna.app' AND is_demo IS DISTINCT FROM true;

UPDATE public.payment_intents pi SET is_demo = true
WHERE pi.is_demo IS DISTINCT FROM true AND (
     EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = pi.user_id AND p.is_demo)
  OR EXISTS (SELECT 1 FROM public.matches  m WHERE m.id = pi.match_id AND m."isDemo")
  OR EXISTS (SELECT 1 FROM public.pitches  s WHERE s.id = pi.pitch_id AND s.is_demo)
);

UPDATE public.wallet_transactions w SET is_demo = true
WHERE w.is_demo IS DISTINCT FROM true AND (
     EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = w.user_id AND p.is_demo)
  OR EXISTS (SELECT 1 FROM public.matches  m WHERE m.id = w.match_id AND m."isDemo")
);

UPDATE public.pitch_bookings b SET is_demo = true
WHERE b.is_demo IS DISTINCT FROM true AND (
     EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = b.user_id AND p.is_demo)
  OR EXISTS (SELECT 1 FROM public.pitches  s WHERE s.id = b.pitch_id AND s.is_demo)
  OR EXISTS (SELECT 1 FROM public.matches  m WHERE m.id = b.match_id AND m."isDemo")
);

UPDATE public.match_participants mp SET is_demo = true
WHERE mp.is_demo IS DISTINCT FROM true AND (
     EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = mp.user_id AND p.is_demo)
  OR EXISTS (SELECT 1 FROM public.matches  m WHERE m.id = mp.match_id AND m."isDemo")
);

UPDATE public.notifications n SET is_demo = true
WHERE n.is_demo IS DISTINCT FROM true AND (
     EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = n.user_id AND p.is_demo)
  OR EXISTS (SELECT 1 FROM public.matches  m WHERE m.id = n.match_id AND m."isDemo")
);

-- ── 4) Çürüme karşıtı tetikleyiciler ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.demo_isareti_ata()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_demo boolean := false;
  v_uid  uuid;
  v_mid  uuid;
  v_pid  uuid;
BEGIN
  -- Tablodan bağımsız çalışsın diye alanlar dinamik okunur
  BEGIN v_uid := (to_jsonb(NEW)->>'user_id')::uuid;  EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  BEGIN v_mid := (to_jsonb(NEW)->>'match_id')::uuid; EXCEPTION WHEN OTHERS THEN v_mid := NULL; END;
  BEGIN v_pid := (to_jsonb(NEW)->>'pitch_id')::uuid; EXCEPTION WHEN OTHERS THEN v_pid := NULL; END;

  IF v_uid IS NOT NULL AND public._kullanici_demo_mu(v_uid) THEN v_demo := true; END IF;
  IF NOT v_demo AND v_mid IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.matches m WHERE m.id = v_mid AND m."isDemo") THEN v_demo := true; END IF;
  IF NOT v_demo AND v_pid IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.pitches s WHERE s.id = v_pid AND s.is_demo) THEN v_demo := true; END IF;

  NEW.is_demo := v_demo;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_demo_isareti ON public.payment_intents;
CREATE TRIGGER trg_demo_isareti BEFORE INSERT OR UPDATE ON public.payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.demo_isareti_ata();

DROP TRIGGER IF EXISTS trg_demo_isareti ON public.wallet_transactions;
CREATE TRIGGER trg_demo_isareti BEFORE INSERT OR UPDATE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.demo_isareti_ata();

DROP TRIGGER IF EXISTS trg_demo_isareti ON public.pitch_bookings;
CREATE TRIGGER trg_demo_isareti BEFORE INSERT OR UPDATE ON public.pitch_bookings
  FOR EACH ROW EXECUTE FUNCTION public.demo_isareti_ata();

DROP TRIGGER IF EXISTS trg_demo_isareti ON public.match_participants;
CREATE TRIGGER trg_demo_isareti BEFORE INSERT OR UPDATE ON public.match_participants
  FOR EACH ROW EXECUTE FUNCTION public.demo_isareti_ata();

DROP TRIGGER IF EXISTS trg_demo_isareti ON public.notifications;
CREATE TRIGGER trg_demo_isareti BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.demo_isareti_ata();

-- profiles için ayrı kural (e-posta uzantısından)
CREATE OR REPLACE FUNCTION public.demo_isareti_profil()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.is_demo := COALESCE(NEW.email ILIKE '%@oyna.app', false);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_demo_isareti_profil ON public.profiles;
CREATE TRIGGER trg_demo_isareti_profil BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.demo_isareti_profil();

-- ── 5) İndeksler (denetim sorguları hep is_demo filtreleyecek) ──────────────
CREATE INDEX IF NOT EXISTS idx_payment_intents_is_demo     ON public.payment_intents(is_demo) WHERE is_demo = false;
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_is_demo ON public.wallet_transactions(is_demo) WHERE is_demo = false;

-- ── 6) Doğrulama ────────────────────────────────────────────────────────────
DO $do$
DECLARE
  v_profil_demo int; v_odeme_demo int; v_odeme_gercek int; v_siniflanmamis int;
BEGIN
  SELECT count(*) INTO v_profil_demo FROM public.profiles WHERE is_demo;
  IF v_profil_demo <> 29 THEN
    RAISE EXCEPTION '[P-3] Beklenen 29 demo profil, bulunan %.', v_profil_demo;
  END IF;

  SELECT count(*) FILTER (WHERE is_demo), count(*) FILTER (WHERE NOT is_demo)
    INTO v_odeme_demo, v_odeme_gercek FROM public.payment_intents;

  -- Onceden "hicbir kayda bagli degil" denen 10 TOP_UP artik kullanicidan siniflanmali
  SELECT count(*) INTO v_siniflanmamis FROM public.payment_intents pi
  WHERE NOT pi.is_demo AND pi.match_id IS NULL AND pi.booking_id IS NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = pi.user_id AND p.is_demo);
  IF v_siniflanmamis > 0 THEN
    RAISE EXCEPTION '[P-3] % odeme demo kullaniciya ait ama isaretlenmemis.', v_siniflanmamis;
  END IF;

  RAISE NOTICE '[P-3] Demo profil: % | Demo odeme: % | Gercek odeme: %', v_profil_demo, v_odeme_demo, v_odeme_gercek;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA:
--   DROP TRIGGER IF EXISTS trg_demo_isareti ON public.payment_intents;  (vb.)
--   ALTER TABLE public.payment_intents DROP COLUMN IF EXISTS is_demo;   (vb.)
-- ════════════════════════════════════════════════════════════════════════════
