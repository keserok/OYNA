# SON KARARLAR — 52 soru

**Tarih:** 4 Ağustos 2026
**Amaç:** Oturum boyunca açık kalan **her** kararı tek yerde toplamak.
**Nasıl cevaplarsın:** Numarayı ve seçimini yaz. Örnek: `1 evet · 2 a · 3 b · 4 hayır …`
Toplu da yazabilirsin: *"1-8 arası hepsi evet, 9 b, 10 sonra"*

**İşaretler:**
- 🔵 **Ben yaparım** — sen sadece onayla
- 🟡 **Senin elinde** — panelden/telefondan senin yapman gerekiyor
- ⏸️ **Sonraya bırakılabilir** — rafa kaldırmayı engellemez

---

## ✅ 9 Ağustos 2026 — soru-cevap turu kararları

Kurucu, uzaktan bir oturumda bekleyen kararların bir bölümünü cevapladı:

| Konu | Karar | Durum |
|---|---|---|
| Çalışma biçimi | `CLAUDE.md` sıfırdan yazıldı: yalnız **iki onay kapısı** (canlıya yazmak + para kuralları); küçük sorunlar anında düzeltilir, büyükler sorulur; test+lint zorunlu kaldı; sade Türkçe, biçim serbest | ✅ uygulandı (`OYNA_PRENSIPLER` 9.2 · 10.5–10.7) |
| **52** Sıradaki odak | **(c) Saha sahibi paneli** — danışmanın (a) lansman önerisi yerine | 📌 sıradaki iş |
| Demo vitrini (S-2) | İlk gerçek kullanıcıdan hemen önce kapanacak (öneri teyit edildi) | bekliyor (lansman günü 1. maddesi) |
| **B2** Davet kodu ekranı | Kayıt ekranı DEĞİL, **Ayarlar → Hesap → "Davet Kodu"** | ✅ uygulandı (9 Ağu 2026) |
| **33** Ahmet Kuru 2. Saha 0 ₺ | **Bilerek 0 ₺** — tarife doğru, dokunulmayacak | ✅ kapandı |
| **15** Gerçek ad görünürlüğü (SEC-3b) | **(c) Yalnız aynı maçtakiler** görecek | karar alındı · uygulama deneme ortamı (21) bekliyor |
| **16** Sızmış parola koruması (SEC-6) | Lansmandan önce açılacak | bekliyor |
| **18** Panel 2FA | Lansman öncesi kurulacak (önce kurtarma kodları) | bekliyor |
| **20** iyzico güvenlik ayarları | Sonra — lansman gündeme gelince | bekliyor |

Ayrıca bu oturumda iki tespit yapıldı: `CLAUDE.md` 4 Ağustos sonrasında
yanlışlıkla boşalmıştı (yeniden yazıldı) ve `npm run etki` / `sistem:*`
komutlarının script dosyaları (`scripts/sistem/`) depoya **hiç girmemiş** —
komutlar çalışmıyor, yeniden yazılmaları bekleyen iş listesinde.

**Aynı günün devamı — saha sahibi paneli odağı:** WhatsApp rezervasyon
hatırlatması (C2) ve finans→takvim köprüsü + geçmiş günlerin takvimde
görünmesi uygulandı. **Müşteri (müdavim) defteri** için 8 tasarım sorusu
soruldu ve karara bağlandı → `docs/master/MUSTERI_DEFTERI_TASARIMI.md`.

---

## A · RAFA KALDIRMA (bunlar şimdi karar ister)

**1. 🟡 Yedek dosyasını indirecek misin?**
`SELECT public.veri_disari_aktar();` → çıktıyı kaydet, iki ayrı yere koy.
→ **Önerim: EVET, rafa kaldırmadan önce.** Platform dışında tek kopyan bu olacak. Ücretsiz planda başka yolu yok.

**2. 🔵 Günlük "uyanık tutma" işi açık kalsın mı?**
→ **Önerim: EVET.** Ayda ~8 dakika kota; karşılığında proje hiç durmaz ve 90 gün kuralı seni hiç ilgilendirmez.
Alternatif: kapat, proje 7 günde dursun, 90 gün içinde tek tıkla aç.

**3. 🔵 Kayıtlar kapatılsın mı? (raftayken kimse üye olamasın)**
→ **Önerim: EVET.** Kimsenin bakmadığı bir dönemde yeni hesap açılmasının hiçbir faydası yok, riski var.

**4. 🔵 Bakım modu açılsın mı? (uygulama "şu an bakımdayız" desin)**
→ **Önerim: HAYIR.** Kayıtları kapatmak yeterli; bakım modu mevcut demo görüntüsünü de kapatır, geri açmayı unutma riski doğar.

**5. 🟡 Vercel'deki yayın kapatılsın mı?**
→ **Önerim: HAYIR, açık kalsın.** Kapatmak alan adı/dağıtım ayarlarını karıştırabilir; kayıt kapalıyken risk zaten düşük.

**6. 🔵 `demo_mode_enabled` şimdi kapatılsın mı?**
→ **Önerim: HAYIR, açık kalsın.** Rafta kimse bakmayacak. Lansman gününün ilk maddesi olarak `RAF.md`'de duruyor.

**7. 🔵 Zamanlanmış işlerin bir kısmı raftayken durdurulsun mu?**
→ **Önerim: HAYIR.** 24 saatte 2.136 çalışma, **0 hata**. Günlük temizlik kurulduğu için artık şişirmiyorlar. Durdurmak "geri açmayı unutma" riski yaratır.

**8. 🟡 Supabase hesabına iki adımlı doğrulama (2FA) kurulu mu?**
→ **Önerim: EVET, kur.** Aylarca bakılmayacak bir hesapta tek savunma parolan olmamalı. Supabase → Account → Security.

---

## B · GÜVENLİK (ertelenmiş P'ler)

**9. 🔵 `profiles.wallet` sütunu tamamen silinsin mi?**
Yazma yetkisi zaten kapatıldı; sütun duruyor.
→ **Önerim: ŞİMDİ DEĞİL.** Silmek geri dönülemez; deneme ortamı kurulunca yapılmalı. Bugün zararsız.

**10. 🔵 SEC-2: Kuralsız 6 tablonun geniş yetkileri daraltılsın mı?**
(`password_reset_codes`, `studio_events`, `profile_contact_hash`, `guardian_lookup_attempts`, `social_rate_usage`, `_saat_dilimi_duzeltme_yedek`)
→ **Önerim: EVET, şimdi.** Bugün seni RLS koruyor ama **kazara**. Uygulama bu tablolara RPC üzerinden erişiyor, yetkiyi kaldırmak hiçbir ekranı bozmaz.

**11. 🔵 SEC-7: `_saat_dilimi_duzeltme_yedek` geçici tablosu silinsin mi?**
Saat dilimi düzeltmesinden kalma, 6 satır, işlevi bitmiş.
→ **Önerim: EVET.** Ama önce içeriğini yedek şemasına kopyalarım.

**12. 🔵 SEC-4: `pay_public_match_deposit` kaldırılsın mı?**
Uygulama çağırmıyor; tutarı istemciden alıyor; sadece görsel "ÖDENDİ" rozeti veriyor.
→ **Önerim: EVET, kaldır.** Kullanılmayan bir para yolunun durması gereksiz risk.

**13. 🔵 SEC-5: 16 fonksiyonun `anon` çağırma yetkisi geri alınsın mı?**
Hepsi içeriden korumalı (canlıda test edildi) ama gereksiz yüzey.
→ **Önerim: EVET.** Yalnız `hata_bildir` anon'da kalmalı (giriş öncesi çökmeleri yakalıyor).

**14. 🔵 SEC-3: `public_profiles` görünümü `security_invoker` yapılsın mı?**
Şu an altındaki satır kuralları devre dışı; tek koruma bir `WHERE` satırı.
→ **Önerim: ŞİMDİ DEĞİL.** Ekranları boşaltabilir; deneme ortamı şart. Rafa kaldırmayı engellemez.

**15. 🟡 SEC-3b: Gerçek ad soyad (`full_name`) diğer üyelere görünsün mü?**
→ **Önerim: (c) Yalnız aynı maçtakiler görsün.** Halı sahada güven için ad gerekli ama herkese açık olması KVKK açısından savunması zor.
Seçenekler: (a) görünmeye devam · (b) yalnız takma ad · (c) yalnız aynı maçtakiler

**16. 🟡 SEC-6: Sızmış parola koruması açılsın mı?**
→ **Önerim: EVET.** Supabase → Authentication → Policies, 5 dakika. Kayıt akışına küçük sürtünme ekler, karşılığında çalınmış parolayla hesap açılmaz.

**17. 🔵 SEC-8: `cube` / `earthdistance` / `btree_gist` uzantıları `public`ten taşınsın mı?**
→ **Önerim: HAYIR (şimdilik).** Taşımak coğrafi arama indeksini bozabilir. Deneme ortamı olmadan yapılmamalı.

**18. 🟡 Panel için 2FA (`admin_mfa_required`) açılsın mı?**
→ **Önerim: HAYIR (şimdilik).** Önce bir SUPER_ADMIN kayıt olup kurtarma kodlarını indirmeli; yoksa telefon kaybı paneli kilitler. Lansman öncesi maddesi.

**19. 🔵 Sızma testi (gerçek saldırı simülasyonu) yapılsın mı?**
→ **Önerim: LANSMAN ÖNCESİ.** Kullanıcı ve para yokken yapılacak sızma testi bilgi vermez.

**20. 🟡 iyzico hesabının kendi güvenlik ayarları gözden geçirilsin mi?**
(IP kısıtı, webhook imzası, alt kullanıcı yetkileri)
→ **Önerim: İLK GERÇEK ÖDEMEDEN ÖNCE.** Ben iyzico paneline giremiyorum; birlikte bakmalıyız.

---

## C · ALTYAPI & OPERASYON

**21. 🟡 SRE-4: Deneme ortamı (`oyna-staging`) kurulsun mu?**
Şu an ACTIVE ama **0 tablo**. Senin ~20 dakikan + 5 komut.
→ **Önerim: EVET — ama rafa kaldırmadan sonra, döndüğünde.** Üç işi birden açıyor (9, 14, 17, 22).

**22. 🔵 SRE-8: Geri alma provası yapılsın mı?**
Her migration'a geri alma adımları yazdım; **hiçbiri denenmedi**.
→ **Önerim: EVET, ama 21'e bağlı.** Deneme ortamı olmadan yapılamaz.

**23. 🟡 SRE-2: Alarm e-postası (Resend) açılsın mı?**
Kod hazır, anahtar yok. Bir şey bozulunca sana ulaşır.
→ **Önerim: LANSMANDAN ÖNCE EVET, şimdi HAYIR.** Raftayken alarma gerek yok; lansmanda şart.

**24. 🟡 S-1(b): Haftalık dış kopya alışkanlığı kurulsun mu?**
→ **Önerim: RAFTAYKEN GEREKSİZ.** Veri değişmeyecek. 1 numaralı yedek yeterli. Lansmandan sonra haftalık yap.

**25. 🟡 Pro plana geçilsin mi?**
→ **Önerim: LANSMANDA.** Bugün ödemenin karşılığı yok (0 kullanıcı). Pro; otomatik yedek, duraklama yok, PRO-1…PRO-5 maddelerini açar.

**26. 🔵 SRE-6: `auto-cancel-matches` dosyası silinsin mi?**
Yayında değil, çağıran yok, işini veritabanı yapıyor. Şu an "KULLANILMIYOR" notu var.
→ **Önerim: EVET, sil.** İki yerde iki kural durmamalı. Veritabanı tarafı test edilmiş ve çalışıyor.

**27. 🔵 `net._http_response` tablosuna da otomatik temizlik kurulsun mu?**
Şu an 13 satır ama zamanla büyür.
→ **Önerim: EVET.** `cron.job_run_details` dersini burada tekrarlamayalım.

**28. 🔵 Yedek kapsamına yeni tablo eklensin mi?**
Şu an 8 kritik tablo yedekleniyor.
→ **Önerim: EVET — `app_config` ve `commission_config` eklensin.** İkisi de yeri doldurulamaz ayar; şu an kapsam dışı.

---

## D · ÜRÜN & LANSMAN

**29. 🔵 STR-1: Panele "Gerçek Durum" kartı eklensin mi?**
Dışarıdan gelen kullanıcı / gerçek maç / işlenen para — demo hiçbirine karışmadan.
→ **Önerim: EVET.** Bugün baktığın üç sayı da yanlış; bu kart olmadan doğru karar veremezsin.

**30. 🔵 `K-DEMO-1` denetimi `matches` ↔ `profiles` de karşılaştırsın mı?**
Şu an demo kullanıcının kurduğu "gerçek" maçı yakalamıyor (3 tane var).
→ **Önerim: EVET.** 29 ile aynı pakette yaparım.

**31. 🔵 O 3 yanlış işaretli maç düzeltilsin mi?**
→ **Önerim: EVET, demo olarak işaretlensin.** Kuranları demo kullanıcılar; gerçek sayılmaları hatalı.

**32. 🟡 STR-3: İlk gerçek kart işlemini birlikte yapalım mı?**
Kendi kartın, küçük tutar: ödeme → iade → cüzdan.
→ **Önerim: EVET, ama döndüğünde.** Üç tur bu altyapıyı okudu ve beğendi; hiçbiri **çalıştırmadı**.

**33. 🟡 CPO-P0-6: Ahmet Kuru 2. Saha'nın 0 ₺ tarifesi düzeltilsin mi?**
Hafta içi 15:00–23:00 fiyatı 0 ₺ görünüyor.
→ **Önerim: SEN KARAR VER.** Gerçek fiyatı bilmiyorum; söyle, ben girerim. (Canlı veri değişikliği, onayın şart.)

**34. 🔵 CPO-P0-4: Maç iptalinde bildirim gitmemesi (büyük/küçük harf) düzeltilsin mi?**
→ **Önerim: EVET.** Açık P0. Kadro bildirimi K-3.3'ün temeli.

**35. 🔵 CPO-P0-8: Bildirim izni değer gösterilmeden isteniyor — düzeltilsin mi?**
33 profilin yalnız 1'inde bildirim izni var.
→ **Önerim: EVET ama lansmandan hemen önce.** İzni bir kez reddeden kullanıcıyı geri kazanmak çok zor.

**36. 🟡 Ordu'da ilk 3 saha sahibiyle konuşacak mısın?**
→ **Önerim: EVET — bu, döndüğündeki 1 numaralı iş.** Kod tarafında yapılacak yeni keşif yok.

**37. 🟡 İlk 10 oyuncuyu nasıl bulacaksın?**
→ **Önerim: Kendi çevrenden başla, saha sahibi kanalıyla değil.** Arz tarafı hazır; eksik olan talep.

**38. ⏸️ P-6: Bölge göçü (Singapur → Frankfurt) yapılsın mı?**
Şu an sunucu Singapur'da; Türkiye'ye uzak.
→ **Önerim: LANSMANDAN ÖNCE.** Kesinti gerektirir, senin katılımın şart. Bugün 0 kullanıcıyla acil değil.

---

## E · KOD KALİTESİ & TEKNİK BORÇ

**39. ⏸️ K-15.2: Testlerin tip kontrolü ve katı mod açılsın mı? (65 hata)**
→ **Önerim: LANSMAN SONRASI.** Bugün "1.437 test yeşil" cümlesi tam güvence vermiyor; ama bu 65 hatayı düzeltmek kullanıcı getirmez.

**40. ⏸️ `maplibre-gl` 803 KB'lık parça bölünsün mü?**
Harita kütüphanesi tek başına en büyük parça.
→ **Önerim: LANSMAN ÖNCESİ.** İlk yük 232 KB'a indi; harita yalnız harita ekranında yükleniyor zaten.

**41. ⏸️ Sistem haritası kapsamı %65'ten yükseltilsin mi?**
105 dosya hâlâ hiçbir yapı taşına bağlı değil.
→ **Önerim: KADEMELİ.** Her yeni işte dokunulan dosyalar eklensin; tek seferde 105 dosya bağlamak yapay olur.

**42. ⏸️ `MatchJoin.tsx` bölünmesi sürdürülsün mü? (3.194 satır kaldı)**
→ **Önerim: SONRA.** Üç alan dosyası ayrıldı, tekrar eden 14 çağrı teke indi. Kalanı ürün değişikliğiyle birlikte yapılmalı.

**43. 🔵 `dist/` klasörü depodan çıkarılsın mı?**
Derleme çıktısı git'te duruyor.
→ **Önerim: EVET, `.gitignore`'a eklensin.** Her derlemede gereksiz değişiklik üretiyor.

**44. ⏸️ `deploy_probe_a/b/c` gibi artık migration'lar temizlensin mi?**
→ **Önerim: HAYIR.** Uygulanmış migration'a dokunulmaz (CLAUDE.md §3). Zararsızlar.

---

## F · YASAL & MAĞAZA

**45. 🟡 KVKK / Kullanıcı Sözleşmesi / Mesafeli Satış metinleri hazır mı?**
Master prensiplerde "hukukçu onaylı hazırlanacak" yazıyor.
→ **Önerim: LANSMANIN ÖN ŞARTI.** Para alan bir platformda bunlar olmadan açılmaz. Ben yazamam — hukukçu gerekir.

**46. 🟡 App Store / Google Play hesapları açıldı mı?**
→ **Önerim: LANSMANDAN 1 AY ÖNCE BAŞLA.** Apple onay süreci haftalar sürebilir.

**47. 🟡 Alan adı (oyna.com.tr gibi) alındı mı?**
→ **Önerim: ŞİMDİ AL.** Ucuz, ve iyi alan adları tükeniyor. Rafa kaldırmak bunu engellemiyor.

**48. 🟡 Şirket/şahıs firma ve ödeme sözleşmesi (iyzico) tamam mı?**
→ **Önerim: LANSMAN ÖN ŞARTI.** Gerçek para almadan önce yasal taraf net olmalı.

---

## G · YÖN & ÇALIŞMA BİÇİMİ

**49. 🔵 Tek master prensipler dosyası şimdi yazılsın mı?**
Mevcut dosya "GEÇERSİZ" damgalı; yerine geçecek dosya kurul sürecinin bitmesini bekliyordu — süreç bitti.
→ **Önerim: EVET, şimdi.** Rafa kaldırılan bir projede dağınık karar en tehlikelisi. K-1…K-17'yi tek çelişkisiz dosyada toplarım.

**50. 🔵 `CLAUDE.md` güncellensin mi?**
Yeni mekanizma (17 yapı taşı, 32 kontrol, `npm run etki`) ve master dosya bağlansın.
→ **Önerim: EVET.** Sonraki oturumun ilk okuduğu dosya bu; güncel olmazsa mekanizma kullanılmaz.

**51. 🔵 Bu dal (`claude/oyna-advisory-prompt-8s4x3m`) `main`'e birleştirilsin mi?**
→ **Önerim: EVET, ama sen onaylayınca.** Tüm oturum bu dalda; `main`'de kalırsa rafta yanlış sürüm durur.
Not: PR açmamı istersen söyle — istemeden açmam.

**52. 🟡 Döndüğünde ilk oturumun konusu ne olsun?**
→ **Önerim: (a) Lansman hazırlığı** — demo kapat, ilk gerçek ödeme, ilk 10 kullanıcı.
Seçenekler: (a) lansman · (b) kalan P'leri kapat · (c) saha sahibi paneli

---

## Özet: hemen yapılabilecekler

Sen "evet" dersen **rafa kaldırmadan önce** şunları ben tamamlarım:

| # | İş | Süre |
|---|---|---|
| 3 | Kayıtları kapat | 10 dk |
| 10 | Kuralsız tabloların yetkilerini daralt | 1 sa |
| 11 | Geçici tabloyu sil | 15 dk |
| 12 | Kullanılmayan ödeme yolunu kaldır | 30 dk |
| 13 | Gereksiz `anon` yetkilerini geri al | 45 dk |
| 26 | `auto-cancel-matches` dosyasını sil | 15 dk |
| 27 | `net._http_response` temizliği | 20 dk |
| 28 | Yedek kapsamına 2 tablo ekle | 15 dk |
| 29+30+31 | Gerçek Durum kartı + denetim düzeltmesi | 3 sa |
| 34 | Maç iptali bildirim düzeltmesi | 1 sa |
| 43 | `dist/` git'ten çıkar | 10 dk |
| 49+50 | Master dosya + CLAUDE.md | 3 sa |

**Toplam: ~11 saat.** Hepsi bu oturumda bitebilir.
