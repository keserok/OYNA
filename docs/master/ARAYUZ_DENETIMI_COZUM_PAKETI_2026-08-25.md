# 🔧 Arayüz Denetimi Çözüm Paketi — 25 Ağustos 2026

> **Bu dosya kendi kendine yeten bir iş emridir.** Saha sahibi, kaleci/hakem ve admin
> arayüzlerinin kapsamlı denetiminden çıkan **doğrulanmış** bulguların çözüm reçetesidir.
> Denetim yöntemi: üç arayüz canlı sürüldü (Playwright, hermetik backend), kod 12 paralel
> denetçiyle tarandı, her bulgu bağımsız bir çürütme turundan geçti (37 aday → 35 doğrulandı,
> 2 çürütüldü), iki P0 ayrıca satır satır elle teyit edildi. Admin panelinin çağırdığı
> 157 RPC'nin tamamının canlı veritabanında var olduğu SQL ile doğrulandı.
>
> Satır numaraları **25 Ağustos 2026, `claude/owner-panel-user-guide-06487j` dalı** içindir.
> Dosya değiştiyse numara kaymış olabilir — kanıt satırındaki kod parçasını arayarak bul.

---

## Bu paketi çözen oturum için çalışma kuralları

1. **Fazları sırayla ve ayrı commitlerle çöz:** FAZ 0 → FAZ 1 → FAZ 2 → FAZ 3.
   Bir faz içinde her iş (ya da yakın akraba iş grubu) ayrı commit. Kapsam genişletme yok.
2. **Her fazın sonunda zorunlu:** `npm run lint` temiz + `npm run test:unit` yeşil
   (PRENSİP 8.4). Dokunduğun davranışa birim testi ekle/güncelle.
3. **PARA · KAPILAR · KİMLİK taşlarına dokunan işlerde** (işaretlenmiştir) önce
   `npm run etki` çalıştır; 🔴 KRİTİK çıkarsa durup kurucuya sor (PRENSİP 9.2).
4. **"KARAR" bölümündeki işleri kendiliğinden yapma** — önce kurucuya tek tek sor.
5. **"YANLIŞ ALARM" bölümündeki iki maddeyi düzeltmeye kalkma** — bilinçli olarak
   çürütülmüştür; vakit harcama.
6. Migration gerektiren işler işaretlidir; göç `supabase/migrations/` + `npm run admin:deploy`
   (ya da Supabase MCP `apply_migration`) ile gider. Canlı DB'de değişiklikten önce kurucuya
   sade dille sor (GOREV_SABLONU kuralı).
7. Test etmek için depodaki `.claude/skills/verify/SKILL.md` reçetesi geçerlidir;
   bu paketin sonundaki **Ek A**'da admin paneli için ek reçete var.

---

## Durum özeti

| Küme | Adet | İçerik |
|---|---|---|
| FAZ 0 — P0 | 2 | Veri bozan / hakkı erişilmez kılan |
| FAZ 1 — P1 | 15 | Yanıltan, kaydı bozan, çıkmaza yönlendiren |
| FAZ 2 — P2 | 12 | Küçük ama gerçek düzeltmeler |
| FAZ 3 — Temizlik | 15+ | Ölü/gereksiz parça kaldırma |
| KARAR | 6 | Kurucu kararı gerektirir — kendiliğinden yapılmaz |
| YANLIŞ ALARM | 2 | Düzeltme, çürütüldü |

---

# FAZ 0 — P0: önce bunlar

## P0-1 · Admin'de her maç düzenlemesi maç–kort bağını sessizce koparıyor

- **Dosya:** `shared/matchMapper.ts:209-213` (kullanan akış: `admin-panel/views/pages/MatchesPage.tsx` "Düzenle" → `updateMatchAdmin`)
- **Sorun:** `listingToMatchPayload` içinde `court_id` anahtarı İKİ kez üretiliyor:
  - satır 209: `...(match.courtId !== undefined ? { court_id: match.courtId } : {})` — kısmî-güncelleme koruması (doğru)
  - satır 213: `court_id: match.courtId || null` — **koşulsuz**; JS'te sonraki anahtar kazandığı için korumayı ezer.
  Admin düzenleme formu maçın mevcut kortunu hiç görmediği için (bkz. P1-11) `courtId`
  her zaman `undefined` gelir → **her admin "Düzenle + Kaydet" işlemi `court_id`'yi NULL yazar.**
- **Etki:** Maç–kort bağı kopar; kort çakışma kontrolü (`admin_court_slot_check`) ve tesis takvim bağlantısı işlemez olur.
- **Çözüm:** Satır 213'teki koşulsuz `court_id: match.courtId || null` satırını **sil** (209'daki koşullu spread kalsın). `pitch_id` satırını da incele: `pitch_id: match.pitchId || null` aynı koşulsuz desendedir — düzenleme akışında pitchId her zaman dolu geliyorsa dokunma, gelmiyorsa aynı korumaya al.
- **Kabul kriteri:** Kortu değiştirmeden yapılan maç güncellemesi `court_id`'yi DB'de korur. `tests/unit/` altına `listingToMatchPayload` için test: `courtId: undefined` girdisinde payload'da `court_id` anahtarı **hiç olmamalı**.
- **Not:** P1-11 (admin_fetch_matches court_id döndürmüyor) bu işin tamamlayıcısıdır — ikisini birlikte kapat.

## P0-2 · Kalecinin/hakemin 48 saatlik itiraz hakkı fiilen erişilemez

- **Dosya:** `views/ServiceDashboard.tsx:1281` (boş-durum guard'ı); "İtiraz Et" düğmesi ~1362, `noShowRequests` bölümü ~1330, `completedRequests` ~1438
- **Sorun:** "GELEN TALEPLER" bölümünün boş-durum koşulu `(newRequests.length === 0 && activeRequests.length === 0)`. `noShowRequests` ve `completedRequests` bölümleri bu koşulun **ELSE dalının içinde**. Yalnız no-show/itiraz/tamamlanan talebi olan sağlayıcı "Henüz gelen talebin yok." görür; **"İtiraz Et" kartı hiç çizilmez.**
- **Etki:** Ceza kesilen sağlayıcı 48 saatlik itiraz penceresini kullanamaz; sözleşmede vaat edilen hak (`provider_dispute_no_show`) UI'dan erişilemez. Admin'in "Hizmet İtirazları" kuyruğuna hiçbir sağlayıcı itirazı düşemez.
- **Çözüm:** Boş-durum koşulunu tüm listeleri kapsayacak şekilde genişlet:
  `(newRequests.length === 0 && activeRequests.length === 0 && noShowRequests.length === 0 && completedRequests.length === 0)`
  — ya da `noShowRequests` bölümünü boş-durum dalının DIŞINA taşı (no-show her koşulda görünmeli; bu daha güvenli).
- **Kabul kriteri:** Hermetik sürüşte `service_requests` fixture'ı yalnız `status: 'NOSHOW_REPORTED'` bir satır içerirken panelde "No-show Bildirimi" kartı ve "İtiraz Et" düğmesi görünür. Boş-durum metni yalnız dört liste de boşken çıkar.
- **⚠️ PARA taşına komşu:** itiraz akışı ceza/iade zincirine bağlanır — `npm run etki` çalıştır.

---

# FAZ 1 — P1: garanti düzeltilmesi gerekenler

## P1-1 · Takvimden hızlı rezervasyon her zaman 1 saatlik kaydediliyor

- **Dosya:** `views/owner/calendar/FinancialCalendarView.tsx:923-925` (`handleQuickCreate`)
- **Sorun:** `endTime` slotun süresine bakılmaksızın `(hour+1):00`'a yuvarlanıyor:
  `const endTime = \`${((hour + 1) % 24)...}:00\``. Izgara ise `buildSlotGrid`'den 90/120 dk slotlar üretebiliyor (`shared/slotGrid.ts` `ALLOWED_SLOT_MINUTES=[60,90,120]`) ve `startTime` "19.30" olabiliyor.
- **Etki:** 18:00–19:30 slotuna kayıt 18:00–19:00 yazılır; 19:30 başlangıçlı slotta 19:30–20:00 (30 dk) yazılır. Ücret tam slot tarifesinden alındığı için defterde süre/ücret tutarsız; `bookedHours` doluluk hesabı yanlış.
- **Çözüm:** `handleQuickCreate`'e slotun `minutes` değerini geçir; `endTime`'ı `startTime + slot.minutes` olarak hesapla (HH:MM ayrıştır, dakika ekle, gece yarısı taşmasını `% 24` ile yönet — mevcut `%24` deseni korunmalı).
- **Kabul kriteri:** 90 dk slotta hızlı kayıt DB'ye 90 dakikalık `start_time/end_time` yazar. Birim testi: `19:30 + 90dk → 21:00`, `23:00 + 90dk → 00:30`.
- **Not (sunucu):** `create_pitch_booking` `p_end_time`'ı birebir yazıyor, düzeltme istemciden yeterli.

## P1-2 · Gelen talep kartı maç yerine ham UUID gösteriyor ("Maç: ma000000")

- **Dosya:** `views/ServiceDashboard.tsx:1299, 1338, 1380, 1446`; veri: `services/serviceRequestService.ts:363-375` (`getMyServiceRequests`, `select('*')`)
- **Sorun:** Kart `Maç: {req.matchId.slice(0, 8)}` basıyor. Sağlayıcı kabul ederken maçın sahasını/saatini göremiyor — yalnız ücreti görüyor. Aynı ekrandaki teklif kartı ise adı/ilçeyi/saati gösteriyor (`get_my_match_service_offers` join'li dönüyor).
- **Çözüm (önerilen):** `getMyServiceRequests` sorgusuna matches join'i ekle:
  `select('*, matches(title, location, date, time)')` ve karta başlık+yer+saat bas.
  **⚠️ RLS uyarısı:** PENDING talepte sağlayıcı henüz maçın katılımcısı değil — `matches` RLS'i satırı vermeyebilir. Join boş dönerse çözüm sunucuya taşınır: `get_my_match_service_offers` gibi SECURITY DEFINER bir `get_my_service_requests` RPC'si yaz (migration) ve maç başlığı/saati/konumu ile döndür. Önce join'i canlıda dene; boş dönüyorsa RPC yolunu uygula.
- **Kabul kriteri:** Talep kartında maç adı + ilçe + tarih/saat görünür; UUID hiçbir kartta görünmez (4 nokta).

## P1-3 · Pull-to-refresh ölü `service_offers` yolunu çekiyor — escrow'suz kabul yolu canlanabiliyor ⚠️ PARA

- **Dosya:** `views/ServiceDashboard.tsx:443` (`useAsagiCekYenile` → `fetchOffers`), legacy yol: 446-478
- **Sorun:** WALLET dışındaki sekmelerde çekerek-yenileme yalnız `fetchOffers`'ı çağırıyor; `fetchOffers` legacy `service_offers` tablosunu okuyor. Bu tablo/akış terk edilmiş (asıl yollar: `service_requests` + `match_service_offers`); legacy kabul yolu **escrow'suz**.
- **Etki:** Yenileme asıl listeleri (talep/teklif) tazelemiyor; legacy tabloda satır varsa escrow atlanarak kabul edilebilecek bir kart canlanıyor.
- **Çözüm:** Pull-to-refresh'i sekmeye göre gerçek yükleyicilere bağla: HOME → `fetchIncomingRequests` + `fetchMatchOffers`; JOBS → açık maç aboneliği zaten canlı, `fetchMatchOffers` yeter. `fetchOffers` fonksiyonunu ve `service_offers` okuyan bloğu tamamen kaldır (FAZ 3 ile birleşebilir).
- **Kabul kriteri:** Ana sayfada aşağı çekince yeni talep/teklif listeye düşer; kodda `from('service_offers')` referansı kalmaz.
- **Önce `npm run etki`** — PARA taşına dokunuyor.

## P1-4 · Ücreti hiç belirlenmemiş sağlayıcı profil kaydedemiyor (INVALID_FEE kilidi)

- **Dosya:** `views/ServiceProfile.tsx:67` civarı (fee state başlatma) + kaydet akışı
- **Sorun:** `fee` null iken ekran 0'a çeviriyor; KAYDET, sunucudan `INVALID_FEE` alıp **tüm kaydı** düşürüyor. Yeni onaylanan sağlayıcı bio/tarz dahil hiçbir şeyi kaydedemiyor.
- **Çözüm:** `fee`'yi 0'a zorlama; boşsa alanın altında yerinde doğrulama göster ("Maç başı ücretini belirle") ve KAYDET'i ücret girilene dek engelle **ya da** ücreti diğer alanlardan bağımsız gönder (sunucu payload'ında fee anahtarını yalnız doluysa geçir).
- **Kabul kriteri:** fee'siz yeni sağlayıcı bio+tarz kaydedebilir ya da net yerinde hata görür; genel "kaydedilemedi" hatası kalmaz.

## P1-5 · Profil ekranı bio'yu senkronlanmayan `tempBio`'dan yazıyor

- **Dosya:** `views/ServiceProfile.tsx:169` (`handleSave`)
- **Sorun:** `handleSave` bio'yu `bio` state'inden değil `tempBio`'dan yazıyor; `tempBio` profil geç yüklendiğinde senkronlanmıyor. Kullanıcı bio'ya hiç dokunmadan başka alanı kaydederse **mevcut bio silinir**; İPTAL de eski metni geri getirmiyor.
- **Çözüm:** Profil yüklendiğinde `tempBio`'yu `bio` ile senkronla (`useEffect`) ya da `handleSave`'de `tempBio` yerine düzenleme-modu-dışında `bio` kullan. İPTAL, `tempBio`'yu `bio`'ya geri almalı.
- **Kabul kriteri:** Bio'ya dokunmadan ücret değiştirip kaydetmek bio'yu korur (birim/hermetik test).

## P1-6 · Maç Bul başvuru modalında ücret hep "—"

- **Dosya:** `views/ServiceDashboard.tsx:2262` civarı (modal `selectedJob.offeredFee` okuyor)
- **Sorun:** İş kartları `fee` alanıyla kuruluyor (satır ~419: `fee: Number(m.price) > 0 ? Number(m.price) : null`), modal ise `offeredFee` okuyor → maçın ilan ücreti modalda hiç görünmüyor.
- **Çözüm:** Modalda `selectedJob.fee` kullan (veya job nesnesine `offeredFee` adıyla tek isim ver — tek kaynak).
- **Kabul kriteri:** 450₺ ilanlı maçın başvuru modalında 450₺ görünür; ücretsiz ilanda "Standart ücret" düşüşü korunur.

## P1-7 · Çalışma Saatleri editörü trigger aynasının üzerine yazıyor (kayıt sessizce siliniyor)

- **Dosya:** `views/owner/menu/OwnerWorkingHoursModal.tsx:56` → `services/pitchOwnerService.ts:668` (`update({ working_hours: days })`)
- **Sorun:** Migration `20260728163234` sonrası `pitches.working_hours` **tarifelerden türetilen bir aynadır** (`trg_sync_pitch_working_hours` her tarife değişiminde yeniden yazar). Modal hâlâ elle yazıyor; sahibi "kaydedildi" onayı alıyor, ilk tarife değişikliğinde değerler siliniyor. Oyuncu tarafındaki slotlar zaten tarifeden geldiği için modalın vaadi de gerçekleşmiyor.
- **Çözüm (teknik kısmı):** `saveWorkingHours` yazma yolunu kapat; modalı **salt-okunur** hâle getir ("Saatler tarifelerden türetilir — değiştirmek için Sahalarım → saha → tarife") ve Kurulum Sihirbazı'ndaki "Çalışma saatleri" adımını tarife ekranına yönlendir. Anlık "Tesis açık/kapalı" anahtarı modalda kalabilir (o `is_open`, ayrı alan).
- **Ürün kararı gerekirse** (elle saat düzenleme geri istenirse) KARAR-1'e bak; varsayılan davranış yukarıdaki salt-okunur çözümdür.
- **Kabul kriteri:** Modal düzenleme alanları kaldırılmış/salt-okunur; `update({ working_hours })` çağrısı owner akışından çıkmış; tarife değişikliği sonrası saatlerin türetildiği görünüyor.

## P1-8 · "OYNA HAKEMİ ATANDI" rozeti hakem atanmadan basılıyor

- **Dosya:** `views/owner/calendar/FinancialCalendarView.tsx:812-813`
- **Sorun:** Koşul `booking.type === 'APP'` — uygulamadan gelen **her** rezervasyona rozet basılıyor; hakem atanıp atanmadığına bakılmıyor. Tesise "hakem gelecek" izlenimi çoğu zaman yanlış.
- **Çözüm:** Rezervasyon satırında hakem bilgisi yok; en dürüst düzeltme etiketi **"OYNA REZERVASYONU"** (veya "UYGULAMADAN") yapmaktır. Gerçek hakem rozeti isteniyorsa `matches.refereeId` join'i gerekir (kapsam büyür — KARAR-6'ya not düş).
- **Kabul kriteri:** Rozet metni artık hakem vaat etmiyor; kaynak (uygulama/elle) ayrımı korunuyor.

## P1-9 · Müdür menüsünde açılmayan iki satır: "Ödeme Modu" ve "Uygulamada Listeleme Saati"

- **Dosya:** `views/owner/menu/OwnerMenuView.tsx` (satırlar `isManagerLvl` grubunda, ~297-302) ↔ `views/OwnerPanel.tsx:935-940` (`ownerOnlyGuard`)
- **Sorun:** Satırlar müdüre görünüyor; tıklayınca "Bu işlem yalnızca saha sahibine açık" uyarısı geliyor (canlı sürüşte doğrulandı). Banka/para çekme gibi bunlar da menüden gizlenmeliydi.
- **Çözüm:** İki `MenuRow`'u `isOwnerLvl` bloğuna taşı (Banka Hesapları / Para Çekme / OYNA Anlaşmam ile aynı grup).
- **Kabul kriteri:** MANAGER bağlamında menüde bu iki satır hiç görünmez; OWNER'da görünür ve açılır.

## P1-10 · Owner "Para Çekme" ekranı hiçbir koşulda başarıya ulaşamıyor

- **Dosya:** `views/owner/menu/OwnerWithdrawalsModal.tsx:138` (kapalı mesajı) + `services/pitchOwnerService.ts:866` (`cekimUygulamadanAcikMi()` sabit kapalı)
- **Sorun:** Modal, admin anahtarına (`wallet_cashout_enabled`) bakan bir kapı gösteriyor ama servis katmanı isteği **sabit** olarak göndermiyor — anahtar açılsa bile akış ölü. Admin'in payout kuyruğu bu yüzden hep boş.
- **Bağlam:** PRENSİP §11: `wallet_cashout_enabled` **kapalı — cüzdan kararına bağlı**. Yani bugün akışın kapalı olması DOĞRU; sorun iki katmanın çelişmesi ve ekranın yarı-umut vermesi.
- **Çözüm (karar gerektirmeyen kısmı):** Tek kapıya indir: modal, bilgi ekranı olarak kalsın ("Para çekme, güvenli ödeme altyapısı devreye alınınca açılır; kazancınız sahada tahsil ettiğinizde zaten sizde") ve talep formu/IBAN seçimi gibi asla çalışmayacak parçalar kaldırılsın. Servisteki sabit kapı + admin anahtarı tek kaynağa (config) bağlansın ki go-live günü tek yerden açılsın. Go-live'da açma işi KARAR-2'dir.
- **Kabul kriteri:** Ekran net "kapalı + neden + ne zaman" anlatıyor; kodda ölü talep-gönderme yolu kalmıyor; `git grep cekimUygulamadanAcikMi` tek kapı gösteriyor.

## P1-11 · `admin_fetch_matches` court_id döndürmüyor — düzenleme formu kortu göremiyor 🔧 migration

- **Dosya:** `shared/matchMapper.ts:129` (map'te court yok) + sunucu `admin_fetch_matches(p_search,p_status,p_limit,p_offset)`
- **Çözüm:** RPC'ye `court_id` (ve varsa `court_name`) kolonu ekle (migration); `mapAdminMatchRowToListing`'e `courtId` map'le; MatchesPage düzenleme formunda mevcut kortu göster/koru. P0-1 ile birlikte kapat.
- **Kabul kriteri:** Düzenleme formu maçın kortunu seçili gösterir; kaydetmek kortu değiştirmez.

## P1-12 · Admin `verifyUserAdmin` eski tek parametreli overload'u çağırıyor 🔧 dikkat

- **Dosya:** `admin-panel/services/adminService.ts:3299` (`admin_verify_user` çağrısı)
- **Sorun (canlı DB'de doğrulandı):** Sunucuda iki overload var: eski `admin_verify_user(p_user_id uuid)` ve yeni `admin_verify_user(p_target_id uuid, p_status text)`. Panel eskisini çağırıyor; yeni RBAC'li davranış (status seçimi) kullanılmıyor.
- **Çözüm:** Çağrıyı yeni imzaya taşı (`p_target_id` + `p_status: 'approved'` — imzayı `pg_get_function_identity_arguments` ile teyit et); eski overload'u migration ile düşür (yetim overload karışıklık kaynağı).
- **Kabul kriteri:** Panelden doğrulama yeni RPC ile gider; `pg_proc`'ta tek `admin_verify_user` kalır.

## P1-13 · Admin Ayarlar'daki "Ödeme Yöntemi (Param)" seçimi hiçbir şeyi etkilemiyor

- **Dosya:** `admin-panel/views/pages/SettingsPage.tsx:110`
- **Sorun:** Seçici `settings` kaydına yazıyor ama gerçek ödeme modu başka yerden yönetiliyor (`admin_set_pitch_payment_mode` / `payment_mode_global` config). Yanıltıcı ölü kontrol.
- **Çözüm:** Seçiciyi kaldır; yerine FİNANS → Ödeme Kuruluşu / PaymentModePanel'e yönlendiren kısa bir bilgi satırı bırak.
- **Kabul kriteri:** Ayarlar sayfasında işlevsiz ödeme seçici yok.

## P1-14 · Admin "Tesis Aktif" anahtarı (pitches.is_active) hiçbir yerde okunmuyor

- **Dosya:** `admin-panel/views/components/PitchStudio.tsx:932` (anahtar) — tüketici tarafı `views/PitchDiscovery.tsx:580-582` yalnız `is_open`+`is_published` filtreliyor
- **Sorun:** "Pasif tesis rezervasyon alamaz" vaadi boş: `is_active` yazılıyor ama vitrin/rezervasyon hiçbir kapıda okumuyor.
- **Çözüm (öneri):** İki seçenekten biri, kurucuya tek cümleyle sorup uygula (yarı-karar):
  a) **Zorla:** vitrin filtresine ve sunucu rezervasyon kapısına (`create_pitch_booking` içinde pitch aktif mi kontrolü — migration) `is_active` ekle; b) **Kaldır:** anahtar UI'dan çıkar, tek gerçek `is_published`+`booking_disabled_by_admin` kalsın. (a) tavsiye edilir — admin'in "tesisi tamamen kapat" düğmesi işlevli olur.
- **Kabul kriteri:** Seçilen yol sonrası anahtarın davranışı belgeyle tutarlı; ölü anahtar kalmadı.

## P1-15 · Komuta Merkezi "Para Çekme" kısayolu yanlış ekrana gidiyor

- **Dosya:** `admin-panel/views/pages/CommandCenterPage.tsx:249`
- **Sorun:** Para çekme kuyruğu kartı MODERATION rotasına yönlendiriyor; talepler FİNANS → Payout/İBAN Talepleri'nde.
- **Çözüm:** Yönlendirmeyi FINANCE rotasına (withdrawals sekmesi parametresiyle) çevir.
- **Kabul kriteri:** Karta tıklayınca payout kuyruğu açılır.

---

# FAZ 2 — P2: küçük ama gerçek

| ID | Dosya | Sorun → Çözüm |
|---|---|---|
| P2-1 | `views/owner/PitchManager.tsx:169` | Saha limiti mesajı var olmayan "Menü → Faturalandırma"ya yönlendiriyor → metni "…için destek ile iletişime geç" yap (plan yükseltme UI'si yok; PRENSİP: owner abonelik ödemez). |
| P2-2 | `views/owner/OwnerFlashDealModal.tsx:47` **ve** `views/owner/OwnerSpecialPriceModal.tsx:107` | İki modal da kaldırılmış "Menü → Tarife Politikası"na gönderiyor → metinleri "Sahalarım → saha → fiyat politikası" yap. |
| P2-3 | `views/owner/calendar/FinancialCalendarView.tsx:809` | PARTIAL rezervasyon kartda "BEKLEYEN" görünüyor → detay modalıyla hizala: `'PARTIAL' → 'KISMİ'` (sarı stil zaten var). |
| P2-4 | `views/owner/OwnerSubscriptionModal.tsx:39,49,57` | Abonman fiyat önerisi `resolveHourlyPrice`'ı **tarihsiz** çağırıyor; gün değişimi fiyatı güncellemiyor; WEEKEND tarifesi hafta içini ezebiliyor → seçili haftanın o güne denk gelen tarihini (`dateISO`) hesapla ve geçir; "Gün" select onChange'inde fiyatı yeniden hesapla. |
| P2-5 | `views/OwnerPanel.tsx:618,637` | `realPitchId.startsWith('mock-')` demo koruması ölü (demo tesis gerçek UUID) → koşulu `isDemoMode` bayrağına çevir; demo modda bakiye rozetini 0 göster (yorumdaki OP-P0-4 amacı). |
| P2-6 | `views/owner/menu/OwnerWorkingHoursModal.tsx` (görsel) | Saat girdileri tr arayüzde "08:00 AM" gösteriyor (hermetik sürüş görüntüsüyle sabit) → `input[type=time]`'a `lang="tr-TR"` ver / özel maskeli giriş kullan; P1-7'nin salt-okunur çözümü uygulanırsa bu madde kendiliğinden düşer. |
| P2-7 | `views/ServiceDashboard.tsx:1316` | Fonlanmamış (AWAITING_PAYMENT) talepte "Kabul Et" aktif; kaleci sözleşmeyi onayladıktan SONRA sunucu hatası görüyor → kartta durumu göster, kabul düğmesini fonlama bekliyorken pasifle ("Kaptanın ödemesi bekleniyor"). |
| P2-8 | `views/ServiceApplication.tsx:33` | Başvuru formundaki tarz çipleri ('Panter','Duvar','Libero'…) kanonik listede yok (`shared/providerStyles.ts` CHECK kısıtı!) → çipleri `GK_STYLES`/`REF_STYLES`'tan besle; eski serbest değerler kaydedilmeye çalışılırsa constraint hatası verir. |
| P2-9 | `views/ServiceSettings.tsx:158` | "Karanlık Mod" toggle'ı kalıcı yazılıyor ama yalnız o ekranda etkili → ya uygulama-geneli temaya bağla ya kaldır (uygulama zaten koyu-tek-tema; kaldırma önerilir → FAZ 3'e alınabilir). |
| P2-10 | `admin-panel/services/adminService.ts:2762` | `AdminPitchRow.isDemo` ↔ RPC `is_demo` eşleşmiyor; demo işaretleri RPC yolunda kayboluyor → map'e `is_demo → isDemo` ekle. |
| P2-11 | `admin-panel/views/pages/PitchesPage.tsx:116` | "Vitrinde/Gizli" çip sayaçları yalnız görünen sayfadan hesaplanıyor → sayaçları RPC `total_count`/ayrı count sorgusundan al ya da etiketi "bu sayfada" diye netleştir. |
| P2-12 | `admin-panel/views/components/PitchAgreementsPanel.tsx:129` + `views/PitchDiscovery.tsx:1307` | (a) Anlaşma paneli her kayıtta iptal politikasını tesise-özel override'a sabitliyor — yalnız değiştirildiyse gönder; (b) `booking_disabled_by_admin` oyuncuya ve admine görünüyor ama OWNER hiçbir yerde görmüyor → owner paneline durum bandı ekle ("Rezervasyon alımı OYNA tarafından durduruldu"). |

---

# FAZ 3 — Temizlik: ölü/gereksiz parçalar (davranış değiştirmez)

Tek "temizlik" commit'i (ya da mantıklı 2-3 parça). Her silmeden önce `git grep` ile
referanssızlığı doğrula; testler yeşil kalmalı.

**İstemci — hiç açılmayan/çalışmayan:**
1. `views/owner/menu/OwnerBillingSettingsModal.tsx` — hiçbir yerden render edilmiyor (tek referans `menu/index.ts:16` export'u); `updateOwnerBillingEmail` zinciriyle birlikte kaldır.
2. `views/owner/components/OwnerUpgradeGate.tsx` — hiç import edilmiyor.
3. `views/owner/OwnerFinanceView.tsx:48` — `withdrawalOpen` hiç true olmuyor; içindeki erişilemez Para Çekme modal bağını kaldır (P1-10 ile uyumlu).
4. `views/ServiceDashboard.tsx:727` `handleTransfer` + `showCard...` modalları — hiçbir yerden çağrılmıyor.
5. `views/ServiceDashboard.tsx:151` `isTransferring` — hiç okunmuyor.
6. `views/owner/components/IconButton.tsx` — yönlendirme dosyasını kimse import etmiyor.
7. `views/ServiceDashboard.tsx` legacy `fetchOffers`/`service_offers` bloğu — P1-3'te zaten kalkıyor.
8. `views/ServiceSettings.tsx` "Karanlık Mod" — P2-9 kararına göre.

**Şema/servis kalıntıları:**
9. `types.ts:1306` `pitches.cancellation_policy` jsonb ölü — gerçek politika `refund_full_hours/half_hours/half_pct`; tipten ve okuyan kalıntılardan temizle (DB kolonu düşürme = migration, kurucuya sor).
10. `services/pitchOwnerService.ts:1947` civarı eski personel fonksiyonları — staff modeliyle çelişen ölü yazma yolu; kaldır (gerçek yol `services/staffService.ts`).
11. `shared/adminKopru.ts` üzerinden hiç çağrılmayan kalanlar varsa işaretle (silme kararını kurucuya bırak).

**Sunucu — yetim RPC'ler (migration; kurucu onayıyla):**
12. `admin_set_match_image`, `admin_set_player_card`, `admin_set_player_card_data`, `admin_toggle_user_pro` — hiçbir istemciden çağrılmıyor (kod grep + canlı `pg_proc` diff'iyle doğrulandı).
13. `admin_adjust_wallet_balance` — panelden bilinçli koparıldı (`adminService.ts:3289` yorumu); yorumun kendisi "kaldırılması ayrı göç işi" diyor. Kapalı sistemde açık kapı bırakmamak için düşür.
14. `admin_verify_user(p_user_id)` eski overload — P1-12 ile birlikte.

**Admin sayfa mükerrerliği:**
15. `admin-panel/views/design/adminRoutes.ts:75` — PENDING_VERIFICATIONS ve PROVIDER_IDENTITIES tekil sayfaları, Doğrulama Merkezi segmentlerinin mükerreri; tekil rotaları kaldır ya da merkeze yönlendir.

---

# KARAR — kurucuya sorulmadan YAPILMAZ

| # | Konu | Soru |
|---|---|---|
| K-1 | Çalışma saatleri elle mi tarife-türevi mi? | P1-7'nin salt-okunur çözümü varsayılan. Elle saat düzenleme ürün olarak geri istenirse trigger aynası kaldırılmalı — hangisi? |
| K-2 | Para çekme go-live | Ödeme altyapısı canlıya alınınca P1-10'daki tek-kapı hangi sırayla açılacak? (config → servis → modal → Komuta kısayolu) |
| K-3 | Takvim slot ikonları | 🏷=Flash Deal, 📈=Özel Fiyat eşleşmesi sezgiye ters; ikonlar takas edilsin mi? |
| K-4 | Admin'den sağlayıcı bölge/konum düzenleme | `preferredZones`/`coordinates` sağlayıcı kendisi değiştirebiliyor, admin formunda yok. Eklensin mi? |
| K-5 | Admin'e eksik iki görünürlük | `match_service_offers` adminde hiç görünmüyor; admin bir hizmet talebini iptal edemiyor. Operasyon için gerekli mi? |
| K-6 | Tekil rezervasyon iptali adminden | Bugün tek araç tesis genelini kapatmak (`booking_disabled_by_admin`). Tekil iptal/iade admin yetkisi istenirse ayrı iş açılır. Takvim kartına gerçek hakem rozeti (matches join) de bu pakete girer. |

---

# YANLIŞ ALARM — düzeltmeye kalkma (çürütüldü)

1. ~~"admin_create_pitch, is_active alanını yok sayıyor"~~ — INSERT listesinde yok ama etki senaryosu imkânsız (yeni tesiste anahtar zaten default akışında); P1-14 çözülünce konu kapanır.
2. ~~"fetchPitchesAdmin fallback'i city'ye district yazıyor"~~ — satır var ama o fallback yolu fiilen ulaşılamaz durumda; kullanıcı etkisi yok.

---

# Ek A — Test reçetesi (bu depoda kanıtlanmış)

**Uygulama tarafı:** `.claude/skills/verify/SKILL.md` geçerli. Sandbox'ta `*.supabase.co`
ağ politikasıyla engelliyse: Playwright `page.route('**<proje-ref>.supabase.co/**')` ile
hermetik stub kur — oturum `localStorage['oyna.auth.token']` + `sb-<ref>-auth-token`'a
sahte JWT'li session JSON'u yazılır; REST/RPC çağrıları şemaya birebir uyan fixture'larla
yanıtlanır (enum'lar canlıdan: `payment_status: PAID/PARTIAL/PENDING`,
`source: APP_BOOKING/OWNER_MANUAL/SUBSCRIPTION`, `provider_type: GK/REF`).

**Admin paneli:**
- Dev sunucuda adres: `http://localhost:PORT/admin-panel/admin.html`
  (kök `/admin.html` yönlendirmesi yalnız `ADMIN_DEV=1` iken çalışır; `npm run dev:admin` = 4005).
- Girişi hermetik geçmek için: `profiles` stub'ı `is_admin: true, role: 'SUPER_ADMIN'`;
  `get_config_bool → false` (MFA kapısı atlanır); `admin_get_my_role → 'SUPER_ADMIN'`;
  envanter RPC'leri (`admin_fetch_pitches/matches/goalkeepers/referees/cms_texts/profiles`,
  `admin_dashboard_stats`) makul fixture'larla doldurulur.
- **Tıklama tuzağı:** hem owner menü satırları hem admin kenar çubuğu Playwright `click()`'e
  yanıt vermeyebilir — elementin `__reactProps$…` üzerindeki `onClick`'ini `evaluate` ile
  doğrudan çağır. Türkçe metin eşlemede `toLocaleLowerCase('tr')` kullan (İ/ı tuzağı).
- Sunucu-yan doğrulama: Supabase MCP `execute_sql` (örn. RPC imzaları
  `pg_get_function_identity_arguments`, view tanımları `pg_get_viewdef`).

**Kanıt istenen işler:** P0-1/P0-2 ve P1-1/P1-2/P1-9 için düzeltme sonrası hermetik ekran
görüntüsü al (öncesi/sonrası) ve rapora ekle.

# Ek B — Migration gerektirenler (özet)

| İş | Göç |
|---|---|
| P1-11 | `admin_fetch_matches`'e court_id (+court_name) kolonu |
| P1-12 / Temizlik-14 | Eski `admin_verify_user(p_user_id)` overload'unu düşür |
| P1-14 (a şıkkı seçilirse) | Rezervasyon kapısına `is_active` kontrolü |
| P1-2 (join RLS'e takılırsa) | `get_my_service_requests` SECURITY DEFINER RPC |
| Temizlik-12/13 | Yetim admin RPC'lerini düşür |
| Temizlik-9 (DB kolonu) | `pitches.cancellation_policy` kolonu (yalnız kurucu onayıyla) |

---

_Denetim referansları (kurucunun artifact'ları): "OYNA Arayüz Denetimi" raporu,
"OYNA Tesis Paneli Kılavuzu", "OYNA Saha Görevlisi Kılavuzu" — claude.ai/code/artifacts._
