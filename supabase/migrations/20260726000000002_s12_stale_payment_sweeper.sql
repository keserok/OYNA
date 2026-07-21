-- ════════════════════════════════════════════════════════════════════════════
-- [S1.2 / C6 / S19] ASKIDA ÖDEME SÜPÜRÜCÜSÜ — DB katmanı
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: Kullanıcı 3DS banka penceresini yarıda bırakırsa (sekmeyi kapatır,
--   telefonu kilitler, ağ kopar) payment_intents satırı PENDING'te sonsuza dek
--   asılı kalır. İki risk: (1) iyzico'da tahsilat GERÇEKLEŞTİYSE ama bizim DB
--   apply_card_payment'ı yazamadıysa (iyzico-3ds-callback APPLY_ERROR dalı) →
--   para çekildi ama kullanıcının bileti/bakiyesi YOK (para kaybı). (2) hiç
--   çekilmediyse → satır çöp olarak birikir, raporları/mutabakatı kirletir.
--
-- ÇÖZÜM (3 katman, hepsi MEVCUT TEST EDİLMİŞ RPC'leri kullanır — para hareketi
--   YENİDEN İCAT EDİLMEZ, auto-cancel-matches felsefesi):
--   • DB (bu dosya): kill-switch config + `list_stale_payment_intents` (stale-
--     GÜVENLİ aday listesi — SQL değişmezi). Heal = apply_card_payment (zaten
--     idempotent), Fail = mark_intent_failed (zaten yalnız PENDING→FAILED).
--   • Edge (sweep-stale-payments): her aday için iyzico'ya "bu para çekildi mi?"
--     diye sorar (mutabakat). Çekildiyse apply_card_payment (heal → PAID),
--     KESİN çekilmediyse mark_intent_failed, BELİRSİZSE DOKUNMAZ (sonraki tur).
--   • Cron (ayrı migration): saatlik tetik.
--
-- ⚠️ PARA DEĞİŞMEZLERİ (bu tasarımın neden güvenli olduğu):
--   • prepare_card_payment YAN ETKİ YARATMAZ (slot kilitlemez, booking yazmaz;
--     yalnız doğrular + PENDING intent açar). Bütün yan etkiler apply_card_payment
--     ONAY anındadır. Dolayısıyla stale bir PENDING intent ARKASINDA YETİM KAYIT
--     BIRAKMAZ — süpürücünün "serbest bırakacağı" kilit/rezervasyon YOKTUR.
--     Süpürücü yalnız intent'in KENDİ durumunu (PENDING→PAID|FAILED) düzeltir.
--   • KÖR FAILED YASAK: FAILED yazma kararı edge'de, YALNIZ iyzico "çekilmedi"
--     dediğinde verilir. Bu SQL katmanı asla FAILED yazmaz; yalnız aday listeler.
--   • ESCROW/BLOCKED'A DOKUNMAZ: cüzdan-öncelikli maç kaporası provider='WALLET'
--     + status='BLOCKED' ile durur; liste yalnız provider='IYZICO' + status=
--     'PENDING' getirir. BLOCKED asla listeye girmez.
--   • ÜÇ ZAMAN PENCERESİ: ödeme ekranı 3dk < 3DS banka penceresi 5dk < süpürücü
--     eşiği ≥15dk. 15dk tabanı FONKSİYONDA ZORLANIR (GREATEST): yanlış config
--     bile eşiği 15dk'nın altına indiremez → aktif bir 3DS'e asla çarpmaz.
--   • KILL-SWITCH: 'sweeper_enabled' KAPALI doğar. Ters bir şey görülürse tek
--     anahtarla durur; veri bozulmaz (idempotent RPC'ler).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Kill-switch + eşik config anahtarları (app_config kontrol düzlemi) ────
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('sweeper_enabled', 'false'::jsonb, 'boolean', 'ODEME',
   'Askıda Ödeme Süpürücüsü',
   'AÇIK iken saatlik cron, ≥15 dk''dır PENDING kalmış kart ödemelerini iyzico ile MUTABIK KALARAK kapatır (çekildiyse tamamlar, çekilmediyse başarısız yazar, belirsizse dokunmaz). KAPALI doğar; güvenle test edildikten sonra açın. Ters bir durumda tek anahtarla durdurur.',
   false, NULL, NULL),
  ('sweeper_stale_minutes', '15'::jsonb, 'number', 'ODEME',
   'Süpürücü Eşiği (dakika)',
   'Bir PENDING kart ödemesinin süpürülebilir sayılması için geçmesi gereken süre. TABAN 15 dakikadır (3DS banka penceresi 5 dk''dan güvenli marjla büyük); fonksiyon 15''in altını KABUL ETMEZ.',
   false, 15, 1440)
ON CONFLICT (key) DO NOTHING;

-- ─── 2) list_stale_payment_intents — stale-GÜVENLİ aday listesi (SQL değişmezi)
-- Bu fonksiyon KARAR VERMEZ (FAILED/PAID yazmaz); yalnız edge'in iyzico ile
-- mutabakat yapacağı ADAYLARI döndürür. Kill-switch'i BURADA da kontrol eder
-- (savunma katmanı: cron yanlışlıkla tetiklense bile kapalıyken boş döner).
CREATE OR REPLACE FUNCTION public.list_stale_payment_intents(p_older_than_minutes int DEFAULT NULL)
RETURNS TABLE (
  intent_id       uuid,
  user_id         uuid,
  amount          numeric,
  flow            text,
  created_at      timestamptz,
  age_minutes     int,
  -- KURŞUNGEÇİRMEZ HEAL İŞARETİ: iyzico-3ds-callback, 3DS auth 'success' aldıktan
  -- (yani para KESİN çekildikten) sonra apply_card_payment hata verirse (APPLY_ERROR)
  -- bu iki alanı raw'a yazar. Doluysa süpürücü iyzico'ya SORMADAN heal edebilir —
  -- çünkü çekim iyzico'nun kendi auth 'success' yanıtıyla zaten kanıtlanmıştır.
  auth_charged    boolean,
  auth_payment_id text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled boolean := public.get_config_bool('sweeper_enabled', false);
  v_cfg_min numeric := public.get_config_number('sweeper_stale_minutes', 15);
  -- 15 dk TABAN zorlanır: yanlış config bile aktif 3DS penceresine (5dk) giremez.
  v_min     int     := GREATEST(15, COALESCE(p_older_than_minutes, v_cfg_min, 15))::int;
BEGIN
  -- Kill-switch kapalıysa: hiçbir aday yok (cron tetiklense bile no-op).
  IF NOT v_enabled THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pi.id,
    pi.user_id,
    pi.amount,
    (pi.raw->>'flow')::text,
    pi.created_at,
    (EXTRACT(EPOCH FROM (now() - pi.created_at)) / 60)::int,
    COALESCE((pi.raw->>'auth_charged')::boolean, false),
    (pi.raw->>'auth_payment_id')::text
  FROM public.payment_intents pi
  WHERE pi.status = 'PENDING'                        -- yalnız askıda (BLOCKED/PAID hariç)
    AND COALESCE(pi.provider, '') = 'IYZICO'         -- kart yolu (escrow=WALLET hariç)
    -- YALNIZ uygulama-içi 3DS akışı (bu süpürücünün anladığı ve apply_card_payment'ın
    -- heal edebildiği evren). raw=NULL/flow'suz ESKİ pre-auth/checkout intent'leri
    -- BİLİNÇLİ KAPSAM DIŞI — farklı yaşam döngüsü, bu fonksiyon onlara dokunmaz.
    AND (pi.raw->>'flow') IN ('BOOKING_DEPOSIT', 'TOP_UP', 'MATCH_JOIN')
    AND pi.created_at < now() - make_interval(mins => v_min)
  ORDER BY pi.created_at ASC
  LIMIT 200;                                         -- bir turda üst sınır (güvenlik)
END;
$$;

REVOKE ALL ON FUNCTION public.list_stale_payment_intents(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_stale_payment_intents(int) TO service_role;

-- Edge (service_role) süpürücü durumunu loglayabilsin diye config okumaları da açık.
-- (Salt-okunur; PUBLIC'ten revoke edilmiş — yalnız service_role eklenir.)
GRANT EXECUTE ON FUNCTION public.get_config_bool(text, boolean)  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_config_number(text, numeric) TO service_role;

-- ─── 3) mark_intent_auth_charged — KURŞUNGEÇİRMEZ HEAL İŞARETİ ────────────────
-- iyzico-3ds-callback, 3DS auth 'success' aldıktan (para KESİN çekildi) sonra
-- apply_card_payment hata verirse bu RPC'yi çağırır: intent'in raw'ına çekimin
-- KANITINI (auth_payment_id) işler. Süpürücü bunu görünce iyzico'ya sormadan
-- güvenle heal eder. raw jsonb MERGE ile yazılır (mevcut alanlar ezilmez).
-- Yalnız status='PENDING' iken yazar (PAID/FAILED'e dokunmaz — idempotent).
CREATE OR REPLACE FUNCTION public.mark_intent_auth_charged(p_intent_id uuid, p_payment_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.payment_intents
  SET raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object(
              'auth_charged', true,
              'auth_payment_id', p_payment_id,
              'apply_error_at', now()
            )
  WHERE id = p_intent_id AND status = 'PENDING';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_intent_auth_charged(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_intent_auth_charged(uuid, text) TO service_role;

-- ─── 4) NOT: heal/fail için YENİ RPC YAZILMAZ ────────────────────────────────
-- Heal (iyzico'da çekilmiş → tamamla):  public.apply_card_payment(intent, ref, raw)
--   — zaten idempotent (PAID ise no-op), tüm yan etkileri (bilet/bakiye/slot)
--     ONAY mantığıyla doğru uygular, arada slot dolduysa iade kredisine çevirir.
-- Fail (iyzico'da çekilmemiş → kapat):  public.mark_intent_failed(intent, reason)
--   — zaten yalnız status='PENDING' iken FAILED yazar (idempotent).
-- Süpürücü edge bu ikisini çağırır; muhasebe satırı ne silinir ne güncellenir.
