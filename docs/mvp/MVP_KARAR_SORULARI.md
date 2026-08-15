# MVP Karar Soruları ve Keşif Özeti

> Tarih: 15 Ağustos 2026 · Amaç: Mevcut uygulamadan cüzdansız, kart-ödemeli, admin-atamalı bir MVP'yi
> yeni Supabase + yeni GitHub reposu + yeni Vercel üzerinde en temiz şekilde canlandırmak.
> Bu doküman, karar gerektiren soruları önerilerle birlikte listeler. Cevaplar alındıkça
> her sorunun altına **Karar:** satırı işlenecektir.

## 0) Keşiften çıkan ve soruları şekillendiren ana bulgular

1. **Kart ödemesi kodda tam, canlıda hiç çalışmadı.** iyzico entegrasyonu eksiksiz (3DS, kart saklama,
   capture/void/refund, mutabakat süpürücüsü) ama hem edge `PAYMENT_PROVIDER` hem `app_config.payment_provider`
   SIMULATION; canlıda `payment_mode_global=CASH_ONLY` ve 0 gerçek işlem var.
2. **"Cüzdan yok" kararının iki kırılma noktası var:** (a) TÜM iadeler cüzdan "iade kredisi"ne döner —
   karta iade kodu hiç yazılmamış; (b) maç kurma kaporası (`match_block_deposit`) %100 cüzdan bakiyesinden bloke edilir.
3. **Bireysel (maçsız) slot satın alma zaten var:** `create_pitch_booking(source=APP_BOOKING)` + "Kaporayı Öde" akışı.
   "Son 2 saat" kuralı ise hiçbir yerde yok — sıfırdan yazılacak tek yeni özellik bu.
4. **Saha sahibinin tek bir "kiralamaya izin" bayrağı yok**; izin fiilen `is_published + is_open + courts.is_active +
   tarife varlığı` kapılarından oluşuyor; admin tarafında `booking_disabled_by_admin` deseni hazır.
5. **Kaleci/hakem admin ataması hazır:** `admin_assign_match_referee`, `admin_assign_match_goalkeeper(_side)` RPC'leri +
   admin panel MatchDetailDrawer UI'si çalışıyor. Oyuncu tarafındaki pazaryeri (Marketplace, ServiceDashboard,
   escrow, no-show zinciri) maç akışını bozmadan sökülebilir (`canPublish` sağlayıcılara bakmıyor).
6. **"Top Oyna" ayrı bir modül değil** — maç keşif ekranının (MatchDiscovery → MatchJoin lobisi) adı.
   Top Oyna kalıyorsa maç sistemi (kurma+katılma+slot+ödeme) kalıyor demektir.
7. **Veritabanı:** repo'da ~470 migration'lık replay edilebilir zincir var ama repo ↔ canlı arasında bilinen
   sapma mevcut (4 tablo / 7 kolon; `goalkeepers` camelCase — canlı doğru, repo yanlış). Konsolide şema dosyası yok.
8. **Gömülü tuzaklar:** `supabaseClient.ts`'te eski prod URL+anon key sabit fallback; `?demo=1` arka kapısı
   (şifre `password123`); `oyna.app` sabit linkler; iyzico'ya gömülü sahte TCKN.
9. **Sözleşmeler cüzdana gömülü:** iade rejimi "yalnız cüzdana" diye yazılmış — cüzdansız MVP'de en az 6 belge +
   LegalScreen + public HTML yeniden yazılmalı. Avukat onayı, ETBİS, Supabase yurtdışı aktarım sözleşmesi hâlâ açık.
10. **Supabase org durumu:** OYNA (aktif, ap-southeast-1/Singapur), Hadi ve oyna-staging (inaktif). Ücretsiz planda
    7 gün inaktivite duraklatması var; keep-alive Action ile ayakta tutuluyor.

---

## A) Kuruluş stratejisi — yeni veritabanı, repo, Vercel

**S1. Yeni Supabase şeması nasıl kurulsun?**
(a) ~470 migration zincirini yeni projeye aynen replay etmek · (b) CANLI veritabanından `pg_dump` ile şema alıp,
MVP-dışı nesneleri bilinçli bir listeyle çıkarıp tek temiz `0001_baseline` migration'ı yapmak · (c) şemayı elden yeniden yazmak.
**Önerim: (b).** Zincir MVP-dışı her şeyi de (godview, SaaS, ölçüm hunisi, Ordu seed, demo grant'ları) kurar ve
repo↔canlı sapması nedeniyle canlıyla birebir sonuç vermez; canlı = doğru kaynak. Baseline sonrası
MIGRATION_PLAYBOOK disiplini yeni zincirde aynen devam eder.

**S2. Hangi veriler taşınsın?**
Referans/config verisi (app_config, feature_flags, commission_config, region_coverage, notification_templates, texts,
home_banners) · gerçek saha envanteri (tesis/kort/tarife) · kullanıcılar (36 profil; stratejik rapora göre çoğu demo;
auth.users şifre taşıma ayrı prosedür) · maç/rezervasyon/cüzdan/bildirim geçmişi.
**Önerim:** Referans/config + gerçek saha envanteri taşınsın; kullanıcı ve işlem geçmişi taşınmasın (temiz başlangıç,
gerçek kullanıcılar yeniden kayıt olur). Demo hesap/verisi hiç taşınmasın.

**S3. Supabase bölgesi ve plan?**
Mevcut proje Singapur'da (TR için yüksek gecikme). Yeni proje: (a) eu-central-1 Frankfurt · (b) aynı bölge.
Lansmanda Pro plana geçilecek mi (ücretsizde 7 gün duraklatma + sınırlı realtime/yedek)?
**Önerim:** eu-central-1 + canlıya çıkarken Pro (pg_cron, vault, gecelik yedek zaten kritik altyapı).

**S4. Domain ne olacak?**
`oyna.app` koda gömülü (takım davet/taktik paylaşım linkleri) ve iyzico callback + OAuth redirect'leri domain'e bağlı.
(a) oyna.app'i yeni Vercel'e bağla · (b) mvp.oyna.app · (c) yeni domain.
**Önerim: (a)** — eski uygulama rafta olduğundan çakışma yok; koddaki sabitler tek yerden env'e alınır.

**S5. Mobil kapsam?**
(a) MVP yalnız web (PWA) — Capacitor kabuğu repoda kalır ama mağaza/push fazı sonraya · (b) iOS/Android mağaza dahil
(APNs, FCM, Apple Sign-In, mağaza hesapları yeniden kurulum ister).
**Önerim: (a).** Kart-only akış webde uçtan uca doğrulanmadan mağaza süreci başlatılmasın.

**S6. Eski proje ve repo'nun kaderi?**
**Önerim:** MVP stabil olana dek eski Supabase dondurulmuş dursun; `veri_disari_aktar()` ile tam yedek alınsın,
keep-alive Action MVP oturunca kapatılsın, eski repo arşivlensin. (İtiraz var mı?)

## B) Ödeme — kart-only kararının ayrıntıları

**S7. iyzico hesabı ne durumda?**
Üye işyeri sözleşmesi/canlı anahtarlar var mı? Kod sahte TCKN ile sandbox'a göre duruyor.
**Önerim:** Önce sandbox'ta uçtan uca (3DS + iade + süpürücü) doğrulama, sonra canlı anahtar; buyer kimlik
bilgisi gerçek veriye bağlanır. Sandbox kurulum dokümanı repoda hazır (docs/IYZICO_SANDBOX_SETUP.md).

**S8. İadeler nereye dönecek? (kart-only'nin en kritik sorusu)**
(a) iyzico karta-iade entegrasyonu yazılır — iade karta döner · (b) kullanıcıya "cüzdan" olarak görünmeyen bir
"iade kredisi" bakiyesi tutulur · (c) otomatik iade yok, admin manuel çözer.
**Önerim: (a).** "Cüzdan yok" kararıyla tek tutarlı yol; dolu-slot/kapanan-rezervasyon yarış durumları da karta
iadeyle çözülür, sözleşmeler buna göre yazılır.

**S9. Cüzdan sökümünün derinliği?**
(a) UI ve kullanıcı akışlarından tamamen kaldır; `wallet_transactions` iç muhasebe/hakediş defteri olarak şemada kalsın
(hakediş, finans raporları, quorum mutabakatı bunu okuyor) · (b) şemadan tamamen çıkar.
**Önerim: (a)** — playbook'un önerdiği yol; kullanıcı "cüzdan" kelimesini hiçbir yerde görmez, para defteri bozulmaz.

**S10. Maç kurma kaporası ne olacak?** (bugün %100 cüzdandan bloke)
(a) Kapora tamamen kalksın — maç yayınlamak ücretsiz, her oyuncu kendi slotunu kartla alır · (b) kapora karttan
ön-provizyon (iyzico pre-auth capture/void zinciri canlıda hiç test edilmedi).
**Önerim: (a).** En az kod, en az risk; boş maç açma suistimali app_config limitleriyle frenlenir.

**S11. Bireysel saha kiralamada tahsilat modeli?**
(a) Mevcut model: kapora online (kartla), kalan tesiste elden · (b) tam tutar online.
**Önerim: (a)** — kod hazır, saha sahibi alışkanlığına uygun; tam tutar seçeneği v2.

**S12. Kart işlem bedeli (%2,5) kullanıcıya yansıtılsın mı?**
**Önerim:** Lansmanda 0 (sadelik+güven); tek config (`app_config.card_fee_pct`) ile sonradan açılabilir.

**S13. Saha sahibi hakedişi ve para çıkışı?**
(a) Mevcut admin-manuel payout süreci (payout_requests) MVP'de kalsın · (b) MVP'de platform para tutmasın —
kapora bilgilendirme amaçlı, mutabakat elden · (c) iyzico alt üye işyeri modeli.
**Önerim: (a)** düşük hacimde yönetilebilir; (c) ölçek fazına.

**S14. 18 yaş altı / veli onayı akışı kalsın mı?**
**Önerim:** Kalsın — hukuken gerekli, kod hazır (`minor_payment_consents` + guardian akışı).

## C) Saha kiralama izni ve "son 2 saat" özelliği

**S15. Saha sahibi izni nasıl modellensin?**
**Önerim:** `pitches` tablosuna yeni bir owner bayrağı (`individual_booking_enabled` gibi, `booking_disabled_by_admin`
deseniyle) + Owner panelde tek anahtar; **varsayılan KAPALI** (şartın birebir karşılığı). Mevcut kapılar
(is_published, is_open, kort, tarife) aynen korunur. Varsayılan açık mı kapalı mı — onayını istiyorum.

**S16. "Son 2 saat" kuralının kesin tanımı nedir?**
(a) Bireysel antrenman slotu YALNIZCA başlangıca ≤2 saat kala hâlâ boşsa satın alınabilir (daha erken alınamaz) ·
(b) her zaman alınabilir; son 2 saat yalnız indirim penceresi. Fiyat: normal tarife mi, indirimli mi; indirimi kim belirler?
**Önerim: (a)** + fiyat tarifeden (owner indirim yüzdesi v2'ye). Kural hem sunucuda (`create_pitch_booking`,
`get_pitch_slots`) hem FE ikizinde (`shared/slotGrid.ts`) birlikte uygulanmalı — SSOT ikizliği bozulmamalı.

**S17. Antrenman rezervasyonunun işleyişi ve iadesi?**
(a) Satın alan TÜM sahayı kiralar, arkadaşlarını kendisi getirir (tek ödeme) · (b) kişi başı yer satışı.
İade: son-2-saat satışında iade olmasın mı?
**Önerim: (a)** + iade yok (mevcut kademe zaten <6 saat iadesiz; mesafeli satış m.15/1-ğ cayma istisnası sözleşmeye işlenir).

**S18. Antrenman rezervasyonu maç objesi OLMASIN, saf rezervasyon kalsın — onaylıyor musun?**
**Önerim:** Evet — `APP_BOOKING` olarak kalır; Top Oyna listesine/lobisine girmez, bilet ekranıyla yaşar.

## D) Kaleci / hakem

**S19. Sağlayıcı havuzu nasıl oluşacak?**
(a) Admin panelden elle hesap+profil oluşturma (admin-create-user edge'i hazır); oyuncu uygulamasından TÜM sağlayıcı
yüzeyleri (Marketplace, ServiceDashboard/Application/Profile/Settings, GK/REF rol başvurusu) çıkar ·
(b) uygulama içi başvuru formu kalsın + admin onayı.
**Önerim: (a)** — MVP tanımıyla birebir; ~6.000 satır sağlayıcı-pazarı UI'si sökülür.

**S20. Kaleci/hakem ücreti MVP'de nasıl tahsil edilecek?**
(a) Platform dışı (elden); atama bilgi amaçlı — escrow/no-show/teminat zinciri MVP'ye taşınmaz ·
(b) escrow zinciri kalsın.
**Önerim: (a);** `service_collection_enabled=false` kill-switch'i bu kararın hazır anahtarı.

**S21. Atanan görevlinin görünürlüğü?**
Bugün: hakem herkese, kiralık kaleci yalnız kendi takımının üyelerine görünür.
**Önerim:** MVP'de sadeleştir — atanan kaleci ve hakem lobide herkese görünsün.

**S22. Atanan kalecinin/hakemin kendi deneyimi?**
(a) GK/REF gerçek kullanıcı hesabıdır; admin rol verir, landing normal Dashboard olur, atandığı maçlar
"Maçlarım"da görünür (get_my_matches destekliyor) · (b) GK/REF yalnız admin kaydıdır, uygulama hesabı şart değil.
**Önerim: (a)** — mevcut veri modeliyle uyumlu; ServiceDashboard taşınmaz.

## E) Kapsam — kalan özellikler

**S23. Maçları kim kurabilecek?**
(a) Oyuncular (kaporasız) + gerekirse admin · (b) yalnız admin.
**Önerim: (a)** — Top Oyna'nın içeriği kullanıcıdan gelir; yalnız-admin modeli vitrini boş bırakır.

**S24. Mesajlaşma MVP'de var mı?**
(a) 1:1 + takım sohbeti ikisi de kalsın · (b) yalnız takım sohbeti · (c) ikisi de MVP dışı.
**Önerim: (a)** — ikisi de RPC-tabanlı, hazır ve bağımsız makineler; arkadaşlık/takım deneyimini tamamlıyor.

**S25. "Rahat maç" modu kalsın mı?**
Aynı maç makinesinin bir çeşidi (ayrı lobi ekranı var).
**Önerim:** Kalsın — sökümü ayrı iş üretir; tek maç tipi istersen söküm listesine ekleriz.

**S26. Ana sayfa (Dashboard) yeni düzeni?**
CÜZDANIM + KALECİ BUL + HAKEM BUL kartları kalkıyor.
**Önerim:** Top Oyna kahraman kartı + yakın maç şeridi + MAÇ KUR + SAHA KİRALA + Taktik Stüdyo şeridi + Profil;
`useDashboardHome`'dan cüzdan/sağlayıcı çağrıları temizlenir. Farklı bir hayalin varsa şimdi söyle.

**S27. Saha sahibi panelinin MVP kapsamı?**
(a) Minimum: takvim + tarife + kapatma + manuel rezervasyon + rezervasyon listesi + bireysel kiralama izin anahtarı ·
(b) bugünkü geniş panel (veresiye, gider, personel, abonelik, finans raporları dahil).
**Önerim: (a);** finans yan modülleri v2 (tablolar şemada kalabilir, UI taşınmaz).

**S28. Bildirim kanalları?**
(a) In-app bildirim + e-posta (Resend) — push mobil fazına · (b) push da MVP'de (APNs/FCM kurulumları gerekir).
**Önerim: (a).**

**S29. Onboarding + konum akışı aynen kalsın mı?**
**Önerim:** Aynen kalsın; yalnız GK/REF rol başvurusu adımı çıkar (S19'a bağlı).

## F) Yasal, operasyon, kalite

**S30. Yasal set ne zaman ve kimde?**
Cüzdansız iade + son-2-saat cayma istisnası en az 6 belgeyi + LegalScreen + public HTML'leri değiştirir;
avukat onayı, ETBİS kaydı, Supabase yurtdışı aktarım sözleşmesi hâlâ açık.
**Önerim:** Yazılımla paralel yürüsün; **kart tahsilatı ancak hukuk seti bitince açılır** — o güne kadar MVP
`payment_mode_global=CASH_ONLY` ile bile yayına çıkabilir (sistem buna hazır). Bu sıralamayı onaylıyor musun?

**S31. Demo yüzeyi MVP'ye hiç taşınmasın — onay?**
`?demo=1` arka kapısı, `@oyna.app` hesapları, `seed_godview_demo`/`seed_module_demo` RPC'leri, owner demo seed'i.
**Önerim:** Evet — hiçbiri taşınmaz; `VITE_DEMO_ACCOUNTS=false` + demo kod yolları söküm listesine girer.

**S32. Test stratejisi?**
1.437 birim test + SQL entegrasyon + Playwright mevcut kapsamla iç içe; budama yüzlercesini kırar.
**Önerim:** Kapsam-dışı test dosyaları silinir; çekirdek (para/slot/sosyal/admin atama) testleri yeşil tutulur;
görsel baseline'lar yeniden üretilir; yeni Supabase'e karşı uçtan uca duman test listesi MVP tanımına yazılır.

**S33. Pilot bölge Ordu mu?**
Migration zincirinde 58KB Ordu bölge seed'i var; bölge kapsama sistemi il/ilçe bazlı.
**Önerim:** Ordu ise seed baseline'a alınır; değilse hangi il(ler) ile başlıyoruz?

**S34. Uygulama sırası ve hedef tarih?**
Önerilen fazlar: **(0)** canlıdan şema dump + "çıkarılacaklar" listesinin seninle onayı → **(1)** yeni Supabase
(bölge+plan) + baseline + secrets/cron/storage/realtime kurulumu → **(2)** yeni repo + kabuk temizliği (gömülü URL,
demo, ölü ekranlar, kırık scriptler) → **(3)** MVP cerrahisi (cüzdan sökümü, karta iade, owner izin bayrağı,
son-2-saat kuralı, sağlayıcı pazarı sökümü, Dashboard) → **(4)** test + yasal + Vercel/domain + lansman.
**Önerim:** Bu sıra; hedef lansman tarihini sen koy.

---

## Karar gerektirmeyen ama atlanırsa MVP'yi vuran teknik yapılacaklar

1. `supabaseClient.ts:13-15` gömülü eski prod URL+anon key fallback'i kaldırılacak/yeni projeye çevrilecek —
   env unutulursa uygulama sessizce ESKİ veritabanına bağlanır.
2. Çifte sağlayıcı anahtarı (`PAYMENT_PROVIDER` edge env + `app_config.payment_provider`) tek kaynağa indirilecek
   veya kurulum kontrol listesine yazılacak; ikisi çelişirse sistem fail-safe CASH_ONLY'ye düşer.
3. Yeni Supabase'de: pg_cron job'ları + vault secret'ları + storage bucket'ları (provider-docs, saha vitrini) +
   realtime publication'lar elle kurulacak; super admin bootstrap'ı (`bootstrap_super_admin.sql.example`) elle çalıştırılacak.
4. OAuth (Google/Apple) redirect URL'leri (`oyna://auth-callback` + yeni domain) yeni projede yeniden tanımlanacak.
5. iyzico panelinde webhook/3DS callback URL'leri yeni domain'e göre güncellenecek; gömülü sahte TCKN kaldırılacak.
6. `data/demoAccounts.ts`'in `docs/OYNA_DEMO_HESAPLARI.md`'yi import ettiği unutulmamalı — docs kısmen kod girdisi;
   `sozlesmeler/*.md` → `npm run build:legal` zinciri de öyle.
7. Yeni repoda migration-immutability CI bekçisi + MIGRATION_PLAYBOOK + Bekçi Denetimi sorgusu gün 1'de kurulacak.
8. `package.json`'daki kırık scriptler (logo:kaynak, godview:demo:*, sistem:*) temizlenecek.
9. OYNA_PRENSIPLER.md §14 gereği yeni kararlar (cüzdansız, admin-atamalı — prensip 5.1 ile çelişiyor) önce
   prensipler dosyasına işlenecek; MVP repo'suna güncel bir CLAUDE.md yazılacak (mevcut dosya boş).
