-- ════════════════════════════════════════════════════════════════════════════
-- E-POSTA ÖNEKİ ARTIK AD DEĞİLDİR — Apple gizli e-posta düzeltmesi
-- ----------------------------------------------------------------------------
-- 22 Ağustos 2026 · çok yönlü giriş taramasında bulundu ve doğrulandı.
--
-- SORUN: `handle_new_user`, sağlayıcı ad vermediğinde adı e-postanın @
-- öncesinden türetiyordu:
--     split_part(COALESCE(NEW.email, NEW.phone::text, ''), '@', 1)
--
-- Apple ile giriş bu yolun KURALIDIR, istisnası değil:
--   · Apple kimlik jetonu ADI YALNIZ ilk yetkilendirmede verir; sonraki
--     girişlerde hiç göndermez,
--   · kullanıcı "E-postamı Gizle"yi seçerse adres
--     `a1b2c3d4e5@privaterelay.appleid.com` gibi rastgele bir dizedir.
-- Sonuç: kullanıcının adı `a1b2c3d4e5` oluyordu. Dahası `profiles_set_oyna_id`
-- KALICI ve HERKESE AÇIK kimliği `generate_oyna_id(coalesce(full_name, name))`
-- ile ürettiği için o rastgele dize kullanıcının kalıcı kimliğine kazınıyordu.
--
-- Bu delik daha önce bir kez kapatılmıştı (20260728173408_ad_soyad_zorunlu):
-- "handle_new_user, ad gelmediğinde e-postanın @ öncesini isim olarak
-- yazıyordu... kullanıcı soyadsız kalıyordu." Ancak kapatma yalnız uygulama
-- katmanındaydı; tetikleyicinin kendisi eski davranışta kalmış.
--
-- ÇÖZÜM: ad YALNIZ sağlayıcı meta verisinden gelir. Gelmiyorsa nötr bir
-- değer yazılır ve gerçek ad onboarding'de sorulur — `apply_onboarding`
-- zaten geçerli ad olmadan tamamlanmaya izin vermiyor (NAME_REQUIRED).
--
-- `full_name` DE YAZILIR: uygulama profili yalnız `full_name` üzerinden
-- okuyor (App.tsx), tetikleyici ise yalnız eski `name` kolonunu dolduruyordu.
-- Gerçek ad varken kullanıcının "Oyuncu" görünmesinin sebebi buydu.
-- E-posta öneki HİÇBİR kolona yazılmaz — bu göçün bütün amacı odur.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Yalnız sağlayıcının BEYAN ETTİĞİ ad. Yoksa NULL — e-postaya düşülmez.
  v_ad text := NULLIF(btrim(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    ''
  )), '');
BEGIN
  INSERT INTO public.profiles (
    id, name, full_name, email, avatar_url, role, roles, created_at, updated_at
  )
  VALUES (
    NEW.id,
    -- `name` NOT NULL: ad yoksa nötr etiket. Kullanıcının kalıcı kimliği de
    -- bundan türeyeceği için rastgele dize DEĞİL okunur bir kök olmalı
    -- (generate_oyna_id → "oyuncu1234").
    COALESCE(v_ad, 'Oyuncu'),
    v_ad,                       -- uygulamanın okuduğu kolon; ad yoksa NULL kalır
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'PLAYER',
    '["PLAYER"]'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE
  v_def text := pg_get_functiondef('public.handle_new_user()'::regprocedure);
BEGIN
  -- E-posta önekinden ad türetme TAMAMEN kalkmalı.
  IF position('split_part' in v_def) > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: tetikleyici hala e-posta onekinden ad turetiyor';
  END IF;
  -- Uygulamanın okudugu kolon yazilmali.
  IF position('full_name' in v_def) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: full_name kolonu yazilmiyor';
  END IF;
  -- Notr etiket, kalici kimligin okunur bir kokten turemesini saglar.
  IF position('''Oyuncu''' in v_def) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: ad yoksa notr etiket yazilmiyor';
  END IF;
  RAISE NOTICE 'DOGRULAMA TAMAM: ad yalniz saglayici meta verisinden geliyor.';
END $dog$;
