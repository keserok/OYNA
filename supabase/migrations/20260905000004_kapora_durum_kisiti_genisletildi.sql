-- ═══════════════════════════════════════════════════════════════════════════
-- KAPORA DURUM KISITI GENİŞLETİLDİ (BULGU-1, 17 Ağu 2026 canlı testi)
--
-- NE BOZUKTU: Kart kaporası göçü (20260905000003) maçlara yeni bir yaşam
-- döngüsü durumu ekledi (AWAITING_PAYMENT: "maç yayında, kart tahsilatı
-- bekleniyor") ama matches.deposit_status üzerindeki eski CHECK kısıtı bu
-- değeri TANIMIYORDU. Sonuç: kaporalı sahada maç kurma anında 23514
-- (check violation) — motor doğru hesaplıyor, kısıt kapıda çeviriyordu.
-- Canlı testte ilk maç kurma denemesinde yakalandı.
--
-- NEDEN GÖÇ DOĞRULAMASI YAKALAMADI: 000003'ün doğrulama bloğu fonksiyon
-- tanımlarını ve anahtarları sınıyordu; gerçek bir maç satırı YAZMIYORDU.
-- Bu göçün doğrulaması o dersi uygular: gerçek bir deneme satırı yazar,
-- kısıtı uçtan uca kanıtlar, sonra geri alır.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_deposit_status_chk;
ALTER TABLE public.matches ADD CONSTRAINT matches_deposit_status_chk
  CHECK (deposit_status = ANY (ARRAY[
    'NONE'::text,
    'AWAITING_PAYMENT'::text,  -- kart dönemi: tahsilat bekleniyor (30 dk süpürücü)
    'BLOCKED'::text,
    'CAPTURED'::text,
    'VOIDED'::text,
    'REFUNDED'::text
  ]));

-- ── KENDİNİ DOĞRULAMA ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint WHERE conname = 'matches_deposit_status_chk';

  IF v_def IS NULL OR v_def NOT LIKE '%AWAITING_PAYMENT%' THEN
    RAISE EXCEPTION 'DOĞRULAMA: kısıt AWAITING_PAYMENT içermiyor: %', COALESCE(v_def, 'YOK');
  END IF;

  -- Uçtan uca kanıt: AWAITING_PAYMENT değeriyle gerçek bir satır yazılabiliyor
  -- olmalı (000003'ün doğrulaması satır yazmadığı için bu bug kaçmıştı).
  BEGIN
    UPDATE public.matches SET deposit_status = 'AWAITING_PAYMENT'
    WHERE id = '00000000-0000-0000-0000-000000000000';  -- yok: satır etkilenmez,
    -- ama kısıt ifadesi ayrıştırılır; asıl kanıt aşağıdaki geçici satırda.
  END;

  INSERT INTO public.matches (id, title, location, time, date, price, status,
    captain_id, "creatorId", format, deposit_status, deposit_amount, "isDemo")
  SELECT '00000000-dead-4bee-8f00-000000000001', '_kisit_kaniti', '-', '00:00',
         current_date, 0, 'CANCELLED', p.id, p.id, '7v7', 'AWAITING_PAYMENT', 0, true
  FROM public.profiles p LIMIT 1;

  DELETE FROM public.matches WHERE id = '00000000-dead-4bee-8f00-000000000001';

  RAISE NOTICE 'DOĞRULAMA TAMAM: deposit_status kısıtı kart dönemini tanıyor.';
END $$;
