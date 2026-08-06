-- ════════════════════════════════════════════════════════════════════════════
-- TEMİZ KURULUM ONARIMI (2/2): süpürücü parolası yer tutucusu
-- ════════════════════════════════════════════════════════════════════════════
--
-- NASIL BULUNDU: PR önizleme veritabanı sorgulandı —
--     supabase_migrations.schema_migrations → 324 kayıt, son: 20260803210000
-- Yani kurulum tam SIRADAKİ dosyada duruyor:
--     20260803210001_p0_supuruecue_cron_vault.sql
-- Aynı sonuç, 456 migration boş bir PostgreSQL'e sırayla uygulanarak da
-- birebir doğrulandı (#325'te aynı hata).
--
-- HATA:
--     [AYAR-EKSIK] vault.secrets içinde "webhook_secret" YOK —
--     süpürücü cron KURULAMAZ.
--
-- ── NEDEN BU BİR ÇIKMAZ ───────────────────────────────────────────────────
-- O dosya BİLEREK hata fırlatıyor; gerekçesi haklı ve kayıtlı: daha eski bir
-- sürüm aynı durumda sessizce vazgeçiyordu, kimse fark etmedi ve yarım kalan
-- ödemeler bir ay boyunca toplanmadı. "Sessizce vazgeçme" yasağı doğru bir
-- karardır ve bu dosya onu ORTADAN KALDIRMAZ.
--
-- Ama parola bir SIR'dır: Vault'ta durur, migration'a yazılmaz. Bu yüzden
-- sıfırdan kurulan HER veritabanında (her PR'ın önizlemesi dahil) o sır
-- yoktur ve kurulum ORADA ölür. Sonuç: 325'ten sonraki 131 migration hiç
-- denenmiyor; önizleme ortamı, yani hataları canlıya varmadan yakalayan tek
-- ağ, aylardır çalışmıyor.
--
-- ── ASIL MESELE: O DURDURMA CANLIDA ARTIK HİÇBİR ŞEY KORUMUYOR ────────────
-- Canlı veritabanı okundu: sır var, cron kurulu, süpürücü açık, 464 migration
-- kayıtlı. Yani 20260803210001 canlıda ÇOKTAN başarıyla geçti ve bir daha
-- ASLA çalışmayacak. Bugün o RAISE'in tek etkisi temiz kurulumları kırmak.
-- Buna karşılık, yarın biri cron işini silse ya da parolayı yanlış yenilese
-- hiçbir uyarı çıkmaz — koruma sanılan şey aslında kör.
--
-- ── ÇÖZÜM (iki parça, ikisi birlikte anlamlı) ─────────────────────────────
-- 1) BU DOSYA: sır YOKSA tanınabilir bir YER TUTUCU koyar, böylece kurulum
--    devam eder. Sır VARSA (canlıdaki durum) hiçbir şeye dokunmaz.
-- 2) 20260806001500: K-PARA-4 gece kontrolü. Yer tutucu duruyorsa, cron
--    kaybolmuşsa ya da adres boşsa Sistem Sağlığı kartını KIRMIZI yakar.
--
-- Yani "sessizce vazgeçme" yasağı kaldırılmadı, YERİ DEĞİŞTİRİLDİ: kurulum
-- anında bir kez çöken sert durdurmadan, HER GECE bakılan görünür alarma.
-- P-0'ın kendi sorusuyla: "bu koruma bozulursa kim söyleyecek?" — cevap artık
-- "hiç kimse" değil, "Sistem Sağlığı kartı".
--
-- CANLIYA ETKİSİ: YOK. Sır zaten var; aşağıdaki koşul sağlanmaz, çıkılır.
--
-- GERİ ALMA:
--   DELETE FROM vault.secrets
--    WHERE name = 'webhook_secret' AND description LIKE '%YER TUTUCU%';
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- Yer tutucu değeri K-PARA-4 tarafından aranır; DEĞİŞTİRİLİRSE kontrol
  -- de güncellenmeli (20260806001500 dosyasındaki aynı sabit).
  c_yer_tutucu CONSTANT text := 'OYNA-KURULMADI-YER-TUTUCU';
BEGIN
  -- Vault yoksa (saf PostgreSQL, yerel deneme ortamı) yapılacak bir şey yok.
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE NOTICE '[TEMIZ-KURULUM] vault.secrets yok - atlandi.';
    RETURN;
  END IF;

  -- ── CANLI KORUMASI ───────────────────────────────────────────────────────
  -- Gerçek parola varsa buraya hiç girilmez. Var olan sır ASLA ezilmez.
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'webhook_secret') THEN
    RAISE NOTICE '[TEMIZ-KURULUM] webhook_secret zaten var - dokunulmadi.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'vault' AND p.proname = 'create_secret'
  ) THEN
    PERFORM vault.create_secret(
      c_yer_tutucu,
      'webhook_secret',
      'YER TUTUCU - gercek parola Supabase panosundan Vault a girilmeli. '
      || 'K-PARA-4 bu deger durdugu surece KIRMIZI yanar.'
    );
  ELSE
    -- Vault eklentisi olmayan ortam (yerel deneme): düz satır yeter.
    INSERT INTO vault.secrets (name, secret, description)
    VALUES ('webhook_secret', c_yer_tutucu, 'YER TUTUCU - K-PARA-4 kontrol eder.');
  END IF;

  RAISE NOTICE '[TEMIZ-KURULUM] webhook_secret YER TUTUCU ile dolduruldu. '
               'Bu veritabaninda supurucu GERCEKTE CALISMAZ; K-PARA-4 kirmizi yanacak.';
END $$;
