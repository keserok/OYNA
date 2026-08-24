-- ════════════════════════════════════════════════════════════════════════════
-- KOMİSYON MODELİ — KURUCU KARARI (24 Ağustos 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ÖNCEKİ DURUM (neden değişiyor): sistemde aynı anda ÜÇ farklı oran açıktı ve
-- hangi maça hangisinin uygulandığı belirsizdi:
--   · GLOBAL/MODEL_A  → %15 kesinti + %5 oyuncuya ekleme
--   · GLOBAL/MODEL_B  → %5  kesinti + %20 oyuncuya ekleme
--   · settings.commissionRate → 10 (yönetici panelinde gösterilen ayrı sayı)
-- Belirsiz komisyon, tesisle ilk anlaşmazlıkta sorun olur; iki kullanıcı aynı
-- sahaya farklı fiyat görebiliyordu.
--
-- YENİ MODEL — tek cümle: tesis %8,5 öder, oyuncu maça katılırken %10 öder.
--
--   1) SAHA KAPORASI (doğrudan rezervasyon) — MODEL_A
--      Kullanıcı ekranda yazan rakamı öder, ÜZERİNE HİÇBİR ŞEY EKLENMEZ
--      (§2.14 "etikette yazan ödenir" · get_card_fee_quote bilerek kapalı).
--      Tesise yatan tutardan %8,5 kesilir. Kırılımı:
--        %5,0 → OYNA payı
--        %3,5 → ödeme altyapısı (iyzico) payı
--      Kurucu kararı: bu %3,5'i TESİS üstlenir, OYNA cebinden ödemez.
--      960 TL kapora örneği: tesise 878,40 · OYNA 48,00 · iyzico 33,60.
--
--   2) MAÇA KATILIM — MODEL_B
--      Kişi başı maç ücretinin ÜZERİNE %10 eklenir ve oyuncu toplamı görür
--      (300 → 330). Tesis tarafındaki %8,5 kesinti aynen sürer; yani OYNA iki
--      taraftan da pay alır — bu bilinçli bir pazaryeri kararıdır, çift
--      tahsilat değildir: biri tesisin cirosundan, öteki oyuncunun ödemesinden.
--
--   3) KALECİ / HAKEM — DEĞİŞMEDİ, %10 kesinti.
--
-- FİYATIN KAYNAĞI DEĞİŞMİYOR: her sahanın her slotu için `pitch_tariffs.slot_price`
-- zaten tek doğru maç ücretidir; kapora da kişi başı ücret de ondan türer.
-- Bu göç yalnız ORANLARI değiştirir, fiyat motorunu değil.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Oranlar ─────────────────────────────────────────────────────────────
-- Saha kaporası: tesisten %8,5 kesinti, oyuncuya ekleme YOK.
UPDATE public.commission_config
   SET rate_pct   = 8.5,
       markup_pct = 0,
       markup_amount = 0,
       notes      = 'Saha kaporası — tesisten %8,5 kesinti (5,0 OYNA + 3,5 iyzico). '
                    'Oyuncuya ekleme YOK (§2.14). Kurucu kararı 24 Ağu 2026.',
       updated_at = now()
 WHERE is_active AND scope = 'GLOBAL' AND model = 'MODEL_A';

-- Maça katılım: tesisten aynı %8,5, oyuncuya +%10.
UPDATE public.commission_config
   SET rate_pct   = 8.5,
       markup_pct = 10.0,
       markup_amount = 0,
       notes      = 'Maça katılım — tesisten %8,5 kesinti + kişi başı ücrete %10 ekleme '
                    '(300 → 330). Kurucu kararı 24 Ağu 2026.',
       updated_at = now()
 WHERE is_active AND scope = 'GLOBAL' AND model = 'MODEL_B';

-- ─── 2) Sabit kodlu yedek de düzeltilir ─────────────────────────────────────
-- `_pitch_agreement`, yapılandırma satırı bulunamazsa gövdesine GÖMÜLÜ
-- 15/5 değerlerine düşüyordu. Oranları tabloda değiştirip burayı bırakmak,
-- yapılandırma bir gün silindiğinde ESKİ oranların sessizce geri gelmesi
-- demekti — yani kararın en tehlikeli hâli: kimse fark etmeden yanlış para.
CREATE OR REPLACE FUNCTION public._pitch_agreement(p_pitch_id uuid)
 RETURNS TABLE(model text, rate_pct numeric, markup_pct numeric, markup_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v RECORD;
BEGIN
  IF p_pitch_id IS NOT NULL THEN
    SELECT c.model, c.rate_pct, c.markup_pct, c.markup_amount INTO v
    FROM public.commission_config c
    WHERE c.is_active AND c.scope = 'PITCH' AND c.scope_id = p_pitch_id
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT 1;
    IF FOUND THEN
      model := v.model; rate_pct := v.rate_pct;
      markup_pct := COALESCE(v.markup_pct, 0); markup_amount := COALESCE(v.markup_amount, 0);
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  SELECT c.model, c.rate_pct, c.markup_pct, c.markup_amount INTO v
  FROM public.commission_config c
  WHERE c.is_active AND c.scope = 'GLOBAL' AND c.model = 'MODEL_A'
  LIMIT 1;
  IF FOUND THEN
    model := v.model; rate_pct := v.rate_pct;
    markup_pct := COALESCE(v.markup_pct, 0); markup_amount := COALESCE(v.markup_amount, 0);
    RETURN NEXT; RETURN;
  END IF;

  -- SON ÇARE (24 Ağu 2026: 15/5 → 8,5/0). Yapılandırma hiç yoksa yürürlükteki
  -- karar neyse o dönmeli; eski oran burada saklı kalmamalı.
  model := 'MODEL_A'; rate_pct := 8.5; markup_pct := 0; markup_amount := 0;
  RETURN NEXT;
END; $function$;

-- ─── 3) %8,5'in kırılımı kayda geçer ────────────────────────────────────────
-- Finansal tablolar "OYNA 8,5 aldı" DEMEMELİ: 3,5 puanı iyzico'nun.
-- Tek kaynak burada; rapor ekranları bu değeri okur.
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES (
  'commission_oyna_share_pct', '5.0'::jsonb, 'number', 'PARA',
  'Komisyonun OYNA Payı (%)',
  'Tesisten kesilen toplam %8,5''in OYNA''ya kalan kısmı. Kalanı ödeme altyapısının payıdır. Toplam oran commission_config''te tutulur; bu iki alan yalnız KIRILIMI anlatır.',
  false
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label,
    description = EXCLUDED.description, updated_at = now();

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES (
  'commission_psp_share_pct', '3.5'::jsonb, 'number', 'PARA',
  'Komisyonun Ödeme Altyapısı Payı (%)',
  'Tesisten kesilen toplam %8,5''in iyzico''ya giden kısmı. Kurucu kararı (24 Ağu 2026): bu bedeli TESİS üstlenir, OYNA cebinden ödemez. Finansal tablolar OYNA gelirini hesaplarken bu payı DÜŞMELİDİR.',
  false
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label,
    description = EXCLUDED.description, updated_at = now();

-- ─── 4) Yönetici panelindeki gösterim oranı da hizalanır ────────────────────
-- admin-panel/services/adminService.ts bu alanı okuyup panoda "komisyon oranı"
-- diye gösteriyor. 10'da kalsaydı panel, sistemin uyguladığından farklı bir
-- sayı gösterirdi.
UPDATE public.settings SET "commissionRate" = '8.5', updated_at = now() WHERE id = 'main';

-- ─── 5) Kararların yürürlüğe konması (kurucu onayı, 24 Ağu 2026) ────────────
-- Hesap silme: talep 7 gün sonra KENDİLİĞİNDEN işlensin. Eskiden kapalıydı;
-- kullanıcı "sil" diyor, 7 gün geçiyor, hesap duruyordu. İki mağaza da
-- silmenin gerçekten olmasını şart koşar.
UPDATE public.app_config SET value = 'true'::jsonb WHERE key = 'account_deletion_auto_process';

-- Pro üyelik fiyatı temizlenir: uygulamada satış ekranı yok, 0 üyesi var.
-- Ortada duran bir fiyat, ileride yanlışlıkla bir yerde gösterilebilirdi.
UPDATE public.settings SET "proPrice" = NULL WHERE id = 'main';

-- ─── 6) Kaleci/hakem teminatı: CÜZDAN DEĞİL, KARTTAN BLOKE ──────────────────
-- Canlıdaki sözleşme metni birebir "hesabında en az 500 TL bakiye bulunmalıdır"
-- diyordu. Ama cüzdan 16 Ağustos'ta KALICI olarak kapatıldı (§2.10 — 6493
-- sayılı Kanun, e-para lisansı yok). Yani kalecinin okuduğu şartın sistemde
-- karşılığı yoktu: tutamayacağımız bir söz veriyorduk.
-- Kurucu kararı (24 Ağu 2026): teminat KARTTAN BLOKE ile alınır. Para OYNA'da
-- durmaz, kartta bloke kalır — e-para ihracı sayılmaz.
-- Etiket de gerçeği söylemeli: artık "min bakiye" değil, karttan bloke.
UPDATE public.app_config
   SET label = 'Kaleci/Hakem No-show Teminatı (karttan bloke, TL)',
       description = 'Sağlayıcının kartında bloke tutulan güvence tutarı. OYNA bu parayı TUTMAZ; cüzdan kapalıdır (§2.10).'
 WHERE key = 'gk_min_balance';

UPDATE public.app_config
   SET value = to_jsonb($teminat$Bu sözleşmeyi onaylayarak şunları kabul edersin:

1) KATILIM. Kabul ettiğin maça, ilan edilen saatte katılmayı taahhüt edersin.

2) KATILMAMA CEZASI. Mazeret bildirmeden gelmezsen (no-show), o maçın kaleci ücreti kadar tutar teminatından tahsil edilir ve maçın kaptanına tazminat olarak aktarılır.

3) İTİRAZ HAKKIN. Bu tahsilata 48 saat içinde itiraz edebilirsin. İtiraz edersen durumu OYNA yönetimi inceler ve haklı bulursa tahsilat iade edilir.

4) TEMİNAT NASIL ALINIR. Hizmet verebilmek için kartında 500 TL tutarında bir BLOKE bulunur. Bu para OYNA'ya geçmez ve OYNA tarafından tutulmaz; kendi kartında bloke kalır ve yalnızca yukarıdaki cezanın güvencesidir. Hizmet vermeyi bıraktığında bloke çözülür.$teminat$::text)
 WHERE key = 'gk_service_contract';

-- ═══ DOĞRULAMA — iddia edilen şey gerçekten oldu mu? (§7.7) ═════════════════
DO $$
DECLARE
  v_a RECORD; v_b RECORD; v_yedek RECORD; v_ayar RECORD;
BEGIN
  SELECT rate_pct, markup_pct INTO v_a FROM public.commission_config
   WHERE is_active AND scope='GLOBAL' AND model='MODEL_A';
  IF v_a.rate_pct <> 8.5 OR v_a.markup_pct <> 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: kapora orani 8,5/0 olmadi (% / %)', v_a.rate_pct, v_a.markup_pct;
  END IF;

  SELECT rate_pct, markup_pct INTO v_b FROM public.commission_config
   WHERE is_active AND scope='GLOBAL' AND model='MODEL_B';
  IF v_b.rate_pct <> 8.5 OR v_b.markup_pct <> 10 THEN
    RAISE EXCEPTION 'DOGRULAMA: mac orani 8,5/10 olmadi (% / %)', v_b.rate_pct, v_b.markup_pct;
  END IF;

  -- Sabit kodlu yedek gerçekten değişti mi? Var olmayan bir sahayla çağırıp
  -- fonksiyonun SON ÇARE dalına düşmesini sağlayamayız (GLOBAL satır var),
  -- o yüzden gövdeyi okuyoruz: eski oran metinde kalmamalı.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='_pitch_agreement'
       AND pg_get_functiondef(p.oid) LIKE '%rate_pct := 15.0%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: _pitch_agreement icinde eski 15.0 yedegi duruyor';
  END IF;

  -- 960 TL kaporada tesise 878,40 yatmalı, OYNA+PSP 81,60 almalı.
  IF round((public.calculate_commission(960, 'GLOBAL', NULL, 'MODEL_A')->>'owner_net')::numeric, 2) <> 878.40 THEN
    RAISE EXCEPTION 'DOGRULAMA: 960 TL kaporada tesis neti 878,40 degil (%)',
      public.calculate_commission(960, 'GLOBAL', NULL, 'MODEL_A')->>'owner_net';
  END IF;

  -- 300 TL kişi başı ücrette oyuncu 330 ödemeli.
  IF round((public.calculate_commission(300, 'GLOBAL', NULL, 'MODEL_B')->>'player_total')::numeric, 2) <> 330.00 THEN
    RAISE EXCEPTION 'DOGRULAMA: 300 TL ucrette oyuncu toplami 330 degil (%)',
      public.calculate_commission(300, 'GLOBAL', NULL, 'MODEL_B')->>'player_total';
  END IF;

  -- Kararlar yürürlükte mi?
  SELECT (SELECT value FROM public.app_config WHERE key='account_deletion_auto_process') AS silme,
         (SELECT value FROM public.app_config WHERE key='commission_psp_share_pct') AS psp
    INTO v_ayar;
  IF v_ayar.silme::text <> 'true' THEN
    RAISE EXCEPTION 'DOGRULAMA: otomatik hesap silme acilmadi';
  END IF;
  IF v_ayar.psp::text <> '3.5' THEN
    RAISE EXCEPTION 'DOGRULAMA: psp payi kaydedilmedi';
  END IF;

  -- Cüzdan sözü metinden gerçekten kalktı mı?
  IF EXISTS (SELECT 1 FROM public.app_config
              WHERE key='gk_service_contract' AND value::text LIKE '%bakiye bulunmalıdır%') THEN
    RAISE EXCEPTION 'DOGRULAMA: kaleci sozlesmesinde cuzdan bakiyesi sozu duruyor';
  END IF;

  RAISE NOTICE 'DOGRULAMA GECTI: kapora 8,5/0 · mac 8,5/10 · 960->878,40 · 300->330 · silme acik · teminat karttan bloke';
END $$;

COMMIT;
