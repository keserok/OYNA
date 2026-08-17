-- ════════════════════════════════════════════════════════════════════════════
-- ÖNİZLEME CRON BEKÇİSİ — kopya ortamlar üretimin uçlarını çağırmasın
-- ════════════════════════════════════════════════════════════════════════════
--
-- 2026-08-17 veritabanı denetimi bulgusu: PR #169'un Supabase önizleme
-- veritabanı, migration replay'inde app_config.functions_base_url'e yazılmış
-- ÜRETİM fonksiyon adresini ve cron kurulumlarını miras aldı; kendi vault
-- secret'ı üretimle uyuşmadığı için üretimdeki refund-payment ucuna her 5
-- dakikada bir 403, sweep-stale-payments ucuna saat başı 401 gönderdi
-- (pg_net user-agent kanıtıyla teşhis edildi).
--
-- BEKÇİ KURALI: migration replay'i bittiğinde bu dosya EN SON çalışır.
-- auth.users boşsa bu bir sıfırdan kurulumdur (önizleme branch'i / yerel CI) —
-- gerçek kullanıcısı olmayan bir ortamın dış dünyaya HTTP atması için hiçbir
-- neden yoktur: fonksiyon çağıran tüm cron işleri kapatılır.
--
-- ÜRETİMDE: auth.users dolu olduğu için dosya hiçbir şey yapmaz.
-- FELAKET KURTARMA NOTU: üretim sıfırdan boş bir kullanıcı tablosuyla geri
-- kurulursa cron işleri de kapalı başlar; kullanıcılar geri yüklendikten sonra
-- ilgili cron kurulum migration'larını yeniden çalıştırmak yeterlidir
-- (20260803204739 süpürücü, 20260905000003 karta iade kuyruğu, ...).
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
  v_users int;
  v_kapatilan int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '[BEKCI] pg_cron yok - kontrol gerekmiyor';
    RETURN;
  END IF;

  SELECT count(*) INTO v_users FROM auth.users;
  IF v_users > 0 THEN
    RAISE NOTICE '[BEKCI] % kullanicili gercek ortam - cron islerine dokunulmadi', v_users;
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid, jobname FROM cron.job
    WHERE command ILIKE '%functions/v1%' OR command ILIKE '%net.http_post%'
  LOOP
    PERFORM cron.unschedule(r.jobid);
    v_kapatilan := v_kapatilan + 1;
    RAISE NOTICE '[BEKCI] kullanicisiz kurulum: "%" cron isi kapatildi (dis dunyaya HTTP atmasin)', r.jobname;
  END LOOP;

  RAISE NOTICE '[BEKCI] toplam % fonksiyon-cagiran cron isi kapatildi', v_kapatilan;
END $$;
