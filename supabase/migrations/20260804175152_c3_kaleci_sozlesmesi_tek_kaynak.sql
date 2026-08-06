-- C3 — KALECİ SÖZLEŞMESİ TEK KAYNAK · CEO kararı, 4 Ağustos 2026
--
-- Sözleşme artık YALNIZ buradan okunuyor (services/gkSozlesmeService.ts).
-- Koddaki ikinci kopya kaldırıldı. Panelden değiştirilen metin, kalecinin
-- gördüğü metindir.
--
-- Metin sadeleştirildi ve Türkçe karakterleri düzeltildi: eski kayıtta
-- "Kabul ettiginiz maca ... katilmayi taahhut edersiniz" yazıyordu.
-- Kaleci parasal yükümlülük altına girdiği için metnin okunur olması şart.
--
-- NOT (5 Ağustos 2026): Bu dosya canlıya uygulandıktan SONRA depoya yazıldı.
-- Canlıdaki kayıt 20260804175152 sürüm numarasıyla duruyor; içerik birebir
-- aynıdır (canlıdaki `supabase_migrations.schema_migrations.statements`
-- alanından geri alındı). Bu boşluk, migration'ın MCP aracıyla uygulanıp
-- dosyasının yazılmasının atlanmasından kaynaklandı — CLAUDE.md §3 gereği
-- her şema değişikliğinin repoda dosyası olmalıdır.

UPDATE public.app_config
   SET value = to_jsonb($sozlesme$Bu sözleşmeyi onaylayarak şunları kabul edersin:

1) KATILIM. Kabul ettiğin maça, ilan edilen saatte katılmayı taahhüt edersin.

2) KATILMAMA CEZASI. Mazeret bildirmeden gelmezsen (no-show), o maçın kaleci ücreti hesabından tahsil edilir ve maçın kaptanına tazminat olarak aktarılır.

3) İTİRAZ HAKKIN. Bu tahsilata 48 saat içinde itiraz edebilirsin. İtiraz edersen durumu OYNA yönetimi inceler ve haklı bulursa tahsilat iade edilir.

4) TEMİNAT. Hizmet verebilmek için hesabında en az 500 TL bakiye bulunmalıdır. Bu para senin kalır; yalnızca yukarıdaki cezanın güvencesidir.$sozlesme$::text)
 WHERE key = 'gk_service_contract';

DO $$
DECLARE v_metin text;
BEGIN
  SELECT value #>> '{}' INTO v_metin FROM public.app_config WHERE key = 'gk_service_contract';
  IF v_metin IS NULL OR length(v_metin) < 200 THEN
    RAISE EXCEPTION 'DOGRULAMA: sozlesme metni yazilamadi (uzunluk %).', COALESCE(length(v_metin), -1);
  END IF;
  IF v_metin NOT LIKE '%500 TL%' THEN
    RAISE EXCEPTION 'DOGRULAMA: teminat tutari metinde yok.';
  END IF;
  IF v_metin NOT LIKE '%48 saat%' THEN
    RAISE EXCEPTION 'DOGRULAMA: itiraz suresi metinde yok.';
  END IF;
  RAISE NOTICE 'C3: kaleci sozlesmesi tek kaynakta, % karakter.', length(v_metin);
END $$;
