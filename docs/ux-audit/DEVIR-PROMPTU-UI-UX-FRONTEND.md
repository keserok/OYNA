# OYNA — UI/UX + FRONTEND KAPANIŞ PAKETİ · DEVİR PROMPTU

> Bu dosyanın **"KOPYALANACAK PROMPT"** başlığından aşağısını olduğu gibi yeni bir
> Claude Code oturumuna yapıştır. Aşağıdaki her dosya:satır çapası 26 Ağustos 2026'da
> kodda tek tek doğrulandı; tahmin yoktur.
>
> Kaynak denetim: `docs/master/UCTAN_UCA_DENETIM_2026-08-26.md`

---

## KOPYALANACAK PROMPT (buradan aşağısı)

OYNA adlı Türkçe halı saha rezervasyon uygulaması üzerinde çalışıyorsun. Görevin,
26 Ağustos 2026 tarihli uçtan uca denetimin **UI/UX ve frontend** bulgularını
kapatmak. Sunucu, veritabanı ve ödeme mutabakatı bulguları bu paketin **dışındadır** —
onlara dokunma.

### Dal ve kimlik kuralları (değişmez)

- Yalnız `claude/ui-ux-frontend-kapanis` dalında geliştir. Dal yoksa `main`'in
  güncel halinden oluştur. Başka dala **push etme**.
- Kullanıcı açıkça istemedikçe **pull request açma**.
- `git push -u origin claude/ui-ux-frontend-kapanis`; ağ hatasında 2s/4s/8s/16s ile
  4 kez yeniden dene.
- Commit mesajlarının sonuna:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- Model kimliğini commit, PR ya da kod yorumlarına **yazma**.

### ÖNCE OKU — bu sırayla

1. `OYNA_PRENSIPLER.md` — bağlayıcı kurallar. Özellikle §8.4 (bitirmeden önce lint +
   test), §9.2 (etki analizi), §10.2 (kurucu kod okumaz — her açıklama sade Türkçe),
   §10.5 (kapsam disiplini), §10.6 (sabit özet biçimi), §11 (bilerek kapalı olanlar).
2. `docs/master/UCTAN_UCA_DENETIM_2026-08-26.md` — bu paketin kaynağı. §2 (arayüz)
   ve §3 (frontend mimari) bölümleri senin işin.
3. `docs/ux-audit/DEVIR-PROMPTU.md` — önceki UX turunun devri. **Kırmızı çizgiler** ve
   **Tuzaklar** bölümleri hâlâ geçerli.
4. `docs/ux-audit/KARAR-DEFTERI.md` — verilmiş kararlar. Bir konuda karar varsa
   yeniden tartışma.

### BAĞLAM — neden bu paket var

Denetim planındaki IP-08 (tipografi/kontrast), IP-10 (dokunma hedefi/erişilebilirlik)
ve IP-12 (hata ve boş durum sistemi) paketleri planda **"tamam"** işaretli. Buna
rağmen kodda 269 kontrast ihlali, 58 etiketsiz ikon buton ve hata durumunda hâlâ
"kayıt yok" gösteren ekranlar var.

Yani bu iş sıfırdan geliştirme değil, **"yapıldı" denen ile kodda duran arasındaki
farkı kapatmak** ve bir daha açılmaması için kilitlemek. Bu yüzden her düzeltmenin
yanına onu koruyan bir test/lint kuralı yazılacak (aşağıda "kalite kapıları").

**Ölçek — önceliklendirmeyi buna göre yap:** canlıda 9 gerçek kullanıcı, 6 saha,
1 gerçek maç var (geri kalanı demo). Ödeme simülasyonda, gerçek para hareketi yok.
Yani performans bugün kimseyi yakmıyor; **veri kaybı ve akış kilitlenmesi yakıyor.**

### KAPSAM

**Dahil:** oyuncu uygulaması · tesis paneli · kaleci/hakem paneli · admin paneli —
dördü de.

**Hariç (bu pakette dokunma):**
- Sunucu/edge function, veritabanı, migration, ödeme mutabakatı bulguları.
- Ertelenmiş IP-17 (sosyal davet) ve IP-21 (tesis takvim eksikleri) — kapalı kalacak.
- Telefona push bildirimi göndermek (yeni özellik). Yalnız aşağıdaki dinleyici
  hatası düzeltilecek.
- `views/WalletScreen.tsx` — ekran **erişilemez** (bkz. Tuzaklar). Dokunma.

---

## ÇALIŞMA BİÇİMİ — fazlar ve onay kapıları

İş **beş faza** bölünmüştür. Her fazın sonunda **DUR**, kanıtı sun ve kullanıcının
onayını bekle. Onay gelmeden sonraki faza geçme.

Her faz sonunda sunulacak kanıt:
1. `npm run lint` temiz (çıktıyı göster).
2. `npm run test:unit` yeşil (çıktıyı göster).
3. Etkilenen her ekranın hermetik Playwright ekran görüntüsü, **artifact olarak**
   yayımlanmış tek bir sayfada (öncesi/sonrası yan yana).
4. §10.6 biçiminde özet: Ne değişti · Neden · Nasıl kontrol edersin (tıklama
   adımlarıyla, terminal komutu olmadan) · Riskler & fark ettiklerim.

Her faz kendi commit'ini alır. Faz bitmeden push etme.

---

### FAZ 0 — Kapıyı kur

Küçük ama önce yapılacak; sonraki fazlar buna dayanıyor.

**0.1 · Eksik etki analizi betiği.** `package.json` beş komut tanımlıyor
(`etki`, `sistem:harita`, `sistem:kapsam`, `sistem:surum`, `sistem:zaman-deseni`) ve
hepsi `scripts/sistem/` dizinine işaret ediyor. **Dizin yok ve git geçmişinde hiç var
olmamış.** `npm run etki` bugün `MODULE_NOT_FOUND` veriyor. PRENSİPLER §9.2 bu komutu
kritik taşlara dokunmadan önce zorunlu kılıyor.

Yapılacak: `scripts/sistem/etki.mjs` yaz. Asgari davranış — `git diff --name-only`
ile değişen dosyaları al, `docs/sistem/YAPI-TASLARI.json` içindeki yapı taşlarıyla
eşleştir, 🔴 KRİTİK bir taşa (PARA · KAPILAR · KİMLİK · AYARLAR · KURTARMA)
dokunulduysa uyar ve çıkış kodu 1 döndür. Diğer dört komut bu pakette **kapsam
dışı**; onlara dokunma, ama `etki.mjs`'in var olduğunu doğrula.

**0.2 · `ErrorState` bileşeni.** `components/ui/` altında `EmptyState.tsx`,
`SkeletonList.tsx`, `ConfirmDialog.tsx`, `IconButton.tsx` var ama **`ErrorState` YOK**.
FAZ 1'in yarısı buna dayanıyor. `EmptyState.tsx`'in API'sini örnek al
(`icon`, `title`, `description`, `actions`) ve `onRetry` alan bir `ErrorState` yaz.
Görsel dili EmptyState ile aynı olsun, tonu uyarı olsun.

**Kalite kapısı:** `tests/unit/kalite-kapilari.test.ts` dosyasını oluştur. Bu dosya
sonraki fazlarda büyüyecek; şimdilik `scripts/sistem/etki.mjs` ve
`components/ui/ErrorState.tsx` dosyalarının varlığını doğrulasın.

---

### FAZ 1 — Davranış hataları

Kullanıcının bugün yaşadığı somut arızalar. En yüksek getirili faz.

**1.1 · Hata durumunda "kayıt yok" gösterme — sohbet.**
`views/MessagesView.tsx` — hata state'i `:250`'de tanımlı, `:285`'te doldurulıyor,
ama render dalı yalnız `loading` ve `messages.length`'e bakıyor. Sonuç: aynı ekranda
"Henüz mesaj yok. İlk mesajı sen yaz." **ve** kırmızı hata şeridi birlikte çıkıyor.
Dal sırasını `loading → error → empty` yap; hata varken boş durumu **hiç çizme**.
Doğru referans depoda: `views/Notifications.tsx:425` civarı.

**1.2 · Aynı kusur — gelen kutusu.** `views/MessagesView.tsx` içindeki `loadInbox`
hatayı `listError`'a yazıyor ama `InboxList`'e geçirmiyor; `InboxList` yalnız
`items.length === 0`'a bakıp `:142`'deki "Henüz mesajın yok" + "Arkadaş Bul" CTA'sını
çiziyor. `InboxList`'e `error` prop'u ekle, hata dalını boş daldan önce koy.

**1.3 · Takım maç geçmişi hatada siliniyor.**
`views/social/TeamDetailView.tsx:400` — `catch` bloğu `setHistory([])` yapıyor ve
`historyError` diye bir state yok. `:934`'teki EmptyState "Henüz oynanmış maç yok" +
"Maç Kur" CTA'sı çiziyor. `historyError` ekle, **`setHistory([])` satırını kaldır**
(eski veriyi göstermek boşaltmaktan iyidir), `ErrorState` + tekrar dene çiz.

**1.4 · Modallar donanım geri tuşuna kayıtlı değil.**
`hooks/useBackDismiss.ts:19` imzası: `useBackDismiss(open, onClose, name, priority = 0)`.
`views/MatchJoin.tsx` içindeki 12 tam ekran katmanın hiçbiri kayıtlı değil — aralarında
"Maçtan ayrıl?", "Maçı iptal et?", "Oyuncuyu çıkar?" yıkıcı onayları var. Aynı boşluk
`views/match/RahatMatchLobby.tsx`, `components/match/RahatJoinSheet.tsx` ve 30'dan
fazla dosyada (owner modalleri dahil: `OwnerSpecialPriceModal`, `OwnerCloseSlotModal`,
`OwnerFlashDealModal`, `OwnerSubscriptionModal`, `components/common/DeleteAccountModal`,
`components/location/LocationPickerSheet`, `components/social/MatchSquadPicker`,
`components/social/ProviderOfferPicker`).
Onay diyaloglarına `priority = 10`, sheet'lere `0` ver (`components/ui/ConfirmDialog.tsx`
bu sözleşmeyi zaten uyguluyor).

**1.5 · Saha formunda uyarısız veri kaybı.**
`views/owner/PitchManager.tsx:324` — geri oku `setEditingPitch(null)` yapıyor; kirlilik
kontrolü, onay ve taslak yok. Editör navigasyon yığınına da girmiyor. ~15 alanlı form
(fotoğraf dahil) tek dokunuşla siliniyor.
Snapshot ile `isDirty` hesapla, `useConfirmSheet` (dosyada zaten kurulu) ile
"Değişiklikleri bırak?" onayı koy, `useBackDismiss` ile donanım geri tuşunu da aynı
yola düşür.

**1.6 · Sonsuz spinner — timeout/offline koruması bağlanmamış.**
`shared/submitGuard.ts` bu akışlar için yazılmış ve şunları dışa veriyor:
`isOnline()`, `withSubmitTimeout(p, ms)`, `SubmitTimeoutError`, `RPC_TIMEOUT_MS`
(12.000 ms), `CARD_TIMEOUT_MS` (45.000 ms), `OFFLINE_PUBLISH`, `OFFLINE_JOIN`,
`OFFLINE_FORMATION`, `TIMEOUT_PUBLISH`, `TIMEOUT_JOIN`.
Bugün `views/MatchCreate.tsx` modülden yalnız `safeUuid` alıyor; timeout sabitlerinin
tüketici sayısı **sıfır**. Sonuç: veri akmayan bağlantıda "Yayınla" sonsuza kadar
döner, `finally` hiç çalışmaz, iptal yolu yoktur.
`MatchCreate` yayınlama ve `MatchJoin` slot satın alma akışlarına bağla.
**Timeout dalında idempotency anahtarını sıfırlama** — tekrar deneme aynı anahtarla
gitmeli ki çift maç/çift kayıt oluşmasın (`submitGuard.ts` bunu yorumda şart koşuyor).

**1.7 · Arama sonuçlarında bayat yanıt.**
`views/social/FriendAddView.tsx:216-233` — temizlik yalnız ateşlenmemiş zamanlayıcıyı
iptal ediyor; `:222`'deki uçuştaki istek durdurulamıyor ve sonucu koşulsuz yazılıyor.
"ah" yanıtı geç dönerse "ahmet" sonuçlarının üstüne yazıyor.
`let alive = true` + `if (!alive) return` + temizlikte `alive = false` ekle. Aynı
dosyanın `:190-211` aralığı bu korumayı zaten doğru uyguluyor — onu örnek al.

**1.8 · Sağlayıcı başvuru formunda taslak yok.**
`views/ServiceApplication.tsx:97-121` — 13 alan + kimlik fotoğrafı, hepsi bellekte.
Kalıcılık yok, gönderim öncesi `isOnline()` kapısı yok, hata ham basılıyor.
Metin alanlarını (fotoğraf hariç) debounce'lu yerel taslağa yaz, ekran açılınca geri
yükle, başarılı gönderimde taslağı sil. Referans: `views/social/TeamCreatePanel.tsx:41-58`.

**1.9 · Sabit gider şablonu silmede koruma yok.**
`views/owner/finance/FinanceExpenseTab.tsx:226` — onay yok, hata `.catch(() => {})` ile
yutuluyor, dokunma hedefi ≈26×26px. Aynı dosyanın `:84` satırındaki tek seferlik gider
silme **doğru** yapılmış (onay + hata bildirimi). O kalıbı birebir uygula, hedefi 44px
yap, `aria-label` ekle.

**1.10 · İptal edilen biletin çevrimdışı QR'ı.**
`utils/ticketCache.ts` önbelleği 30 gün yaşıyor ve `views/MatchTicket.tsx` bağlantı
yokken son kopyayı çiziyor — iptal edilmiş rezervasyon kapıda **çalışan bir QR** ile
görünebiliyor. `clearTicketCache` yazılmış ama hiçbir yerden çağrılmıyor.
**Kullanıcı kararı:** önbellek ömrünü 48 saate indir; önbellekten çizilen bilete
açıkça "çevrimdışı kopya — kapıda doğrulanamayabilir, bağlanınca yenile" damgası vur;
iptal/iade akışında `clearTicketCache(bookingId)` çağır.

**1.11 · Çevrimdışı taslak.** **Kullanıcı kararı:** bağlantı yokken maça katılma,
diziliş kaydetme, profil güncelleme **engellenmeye devam edecek** (kuyruğa alınmayacak),
ama girilen veri yerel taslak olarak saklanacak ve ekran yeniden açıldığında geri
yüklenecek. `services/offline/outbox.ts`'i genişletme.

**Kalite kapıları (FAZ 1):**
- Düzeltilen her ekran için React Testing Library testi: **fetch reddedildiğinde boş
  durum metni render edilmemeli, hata + tekrar dene render edilmeli.**
- `kalite-kapilari.test.ts`'e ekle: `views/` ve `components/` altında `catch` bloğu
  içinde liste state'ini boşaltan (`set*([])`) kalıbın sayısı artmamalı.

---

### FAZ 2 — Oturum ve cihaz gizliliği

Ortak cihaz (tesis girişindeki tablet, aile telefonu) senaryosu.

**2.1 · Çıkışta belirtecin telefon kopyası silinmiyor.**
`supabaseClient.ts:156-173` — `removeItem` senkron dönüyor ve `Preferences.remove`
ateşle-unut çağrılıyor. `supabaseAuth.ts:690` civarındaki acil temizlik yolu
(`oturumuZorlaSil`) `Preferences`'a **hiç dokunmuyor**. Okuma tarafı ise tarayıcı
deposu boşsa telefon kopyasından kasten geri yüklüyor — yani silinmiş sanılan oturum
bir sonraki açılışta diriliyor.
`removeItem`'ı asenkron yap ve `Preferences.remove`'u bekle; acil temizlik yoluna da
`Preferences.remove` ekle.

**2.2 · Başarısız jeton yenilemesi zorla çıkış sayılıyor.**
`App.tsx:569-582` — `SIGNED_OUT` olayı tartışmasız "kullanıcı çıkış tuşuna bastı"
kabul ediliyor ve `resetNavigation('AUTH')` **navigasyon yığınını siliyor**. Oysa
kütüphane, yenileme jetonu geçersizleştiğinde de bu olayı yayıyor. Kullanıcı form
doldururken uyarısız giriş ekranında uyanıyor.
Çıkışın istemli olup olmadığını `supabaseAuth.logout()` içinde işaretle; istemsiz
düşüşte yığını **koru**, kullanıcıya "oturumun yenilenemedi, tekrar giriş yapınca
kaldığın yerden devam edeceksin" de.

**2.3 · Çıkışta store sıfırlanmıyor.** Native'de sayfa yeniden yüklenmediği için
(`supabaseAuth.ts:706-710` native'de erken dönüyor) önceki kullanıcının `myMatches`,
`userNotifications`, `unreadNotificationsCount`, `adminSession` alanları bellekte
kalıyor. Store'a açık bir `resetUserScopedState()` ekle ve çıkışta çağır.

**2.4 · Çevrimdışı tahsilat kuyruğu kullanıcıya bağlı değil.**
`services/offline/outbox.ts:19` — anahtar `oyna_owner_outbox_v1`, uid içermiyor,
çıkışta temizlenmiyor ve panel açılınca koşulsuz boşalıyor. Tahsilatçı sunucuda o anki
oturumdan damgalandığı için **personel A'nın aldığı nakit, personel B'nin üzerine
kaydolabiliyor.**
Kuyruğu uid'li anahtara taşı, `OutboxItem`'a `ownerUid` ekle, boşaltmadan önce
mevcut kullanıcıyla eşleşmeyeni gönderme.

**2.5 · Cihazda kalan kullanıcı artıkları.** Çıkış yalnız oturum anahtarını siliyor.
Geride kalanlar: taktik taslakları, panel düzeni, **ham GPS koordinatları**, bilet
anlık görüntüleri (saha/tarih/ücret), ana sayfa önbelleği (ad + bakiye), admin
e-postası. Tek bir `kullaniciVerisiniTemizle(uid)` yardımcısı yaz; `logout()` içinde
`signOut` **öncesi** (uid hâlâ eldeyken) çağır. Hesap silme akışında
(`components/common/DeleteAccountModal.tsx`) aynı yardımcıyı "hepsini sil" modunda
çağır — bugün yalnız tek bir bayrak siliniyor, bu KVKK açısından savunulamaz.

**2.6 · Admin paneli belirteç yalıtımı.**
Panel oyuncu uygulamasının Supabase istemcisini içe aktarıyor ve aynı depo anahtarını
kullanıyor (`admin-panel/services/adminService.ts:431`).
**Kullanıcı kararı:** şimdilik **yalnız ayrı belirteç anahtarı** — panel kendi
istemcisini `storageKey: 'oyna.admin.token'` ile kursun. **CSP başlığı bu pakette
EKLENMEYECEK** (harita/font/Supabase'i kırma riski; ayrı iş olarak açılacak).
Ayrıca `admin-panel/views/hooks/useAdminSessionGuard.ts:41` — hareketsizlik sayacı
yalnız bellekte ve her montajda sıfırlanıyor, yani sekmeyi kapatıp açmak 15 dakikalık
kuralı tamamen atlıyor. Sayacı kalıcılaştır ve montajda geçmişe dönük değerlendir.

**Kalite kapıları (FAZ 2):**
- Birim test: `logout()` sonrası kullanıcıya ait store alanları boş.
- Birim test: outbox depo anahtarı uid içeriyor; farklı uid ile boşaltma yapılmıyor.

---

### FAZ 3 — Mekanik süpürmeler · **görsel onay kapısı burada**

⚠️ **Bu fazda önce ÖNCESİ/SONRASI göster, onay al, sonra uygula.** Kullanıcı kararı
böyle. Kontrast ve dokunma hedefi değişiklikleri uygulamanın görünümünü gözle görülür
şekilde değiştirecek.

**3.1 · Kontrast.** `index.css:262` kuralı yazıyor:
`--color-ink-4: #8B949E` — "EN SOLUK İZİNLİ; altına inilmez". Gerçek kullanım:
`text-gray-500` (4,00:1) **219 yerde**, `text-gray-600` (2,56:1) **50 yerde**.
En yoğun olduğu yer `views/MatchTicket.tsx` — bilet sahanın kapısında, güneş altında
okunuyor. Token'lara taşı.

**3.2 · Etiketsiz ikon butonlar.** `components/ui/IconButton.tsx` **zaten var**,
`label` prop'u TypeScript tarafından zorunlu ve taban boyut 44px. Yeniden yazma —
kalan **58** etiketsiz ikon butonu bu bileşene taşı. Aralarında `WalletScreen:1026` ve
`components/payment/AddCardScreen.tsx:129` gibi **geri butonları** var; ekran okuyucu
kullanan biri kart ekleme ekranından çıkamıyor. (Tesis panelinin kendi kardeşi
`views/owner/components/IconButton.tsx` bilerek ayrıdır — karar E7. Onu birleştirme.)

**3.3 · Ham İngilizce hata metinleri.** 17 dosyada `err?.message || 'Türkçe yedek'`
kalıbı var (`views/ServiceDashboard.tsx` tek başına 20 nokta). Bu kalıpta mesaj doluysa
Türkçe yedek **asla** görünmez.

> ⚠️ **TUZAK — projede iki ayrı hata çevirici var:**
> - `utils/errorMap.ts:196` → `mapError(err, yedek?, ozel?)` — **oyuncu uygulaması**
> - `services/pitchOwnerService.ts:142` → `toTurkishError(error)` — **tesis paneli**
>
> Yanlış olanı import etme. Bu pakette ikisini **birleştirme**; her yüzeyde o yüzeyin
> çeviricisini kullan.

Ayrıca hata mesajının 4 saniyede otomatik kaybolmasını kaldır — kullanıcı kapatana
kadar dursun (`views/PaymentScreen.tsx` bu doğru kalıbı uyguluyor).

**3.4 · Push dinleyicileri birikiyor.**
`notifications/pushService.ts` — `:330`, `:334`, `:365`, `:373`'te dört dinleyici
takılıyor, hiçbiri sökülmüyor. Tek temizlik `:401`'de ve **koşullu** (`if (!error)`
içinde). İzin modali per-uid kapısını atladığı için dinleyici 4'ten 8'e çıkıyor;
sonrasında her bildirimde çift toast ve bildirime tıklayınca iki kez navigasyon oluyor.
`initPushNotifications` başına koşulsuz `await PushNotifications.removeAllListeners()`
koy; `:401`'deki temizliği `if (!error)` dışına çıkar.
**Telefona bildirim gönderme işi bu pakete dahil değil** — yalnız bu hata.

**Kalite kapıları (FAZ 3):**
- `kalite-kapilari.test.ts`'e sayaç testleri ekle ve **tavanı 0 yap**:
  `className` içinde `text-gray-(500|600)`; `views/`+`components/` altında
  `?.message ||` kalıbı. Sayı artarsa test kırmızıya döner.
- Mümkünse ESLint `no-restricted-syntax` ile aynı iki kalıbı yasakla.

---

### FAZ 4 — Ölçülebilir performans darboğazları

**Kullanıcı kararı:** yalnız ölçümle kanıtlanmış darboğazlar. 34 dosyadaki store
aboneliğinin tamamını dönüştürme — riski kazancından büyük. Her madde **öncesi/sonrası
sayı** ile raporlanacak.

**4.1 · Kök bileşen tüm store'a abone.** `App.tsx:150-185` — `useAppStore()` seçicisiz
çağrılıyor (35 alan). `store.ts` içinde 148 `set(` var; herhangi biri kökü render
ediyor. Tüm uygulamada yalnız 3 `React.memo`, sıfır `useShallow`.
`views/Dashboard.tsx:165-171` bunu **zaten doğru** yapıyor (7 atomik seçici) — o kalıba
geç. Setter'lar abonelik gerektirmez, ayrı çekilebilir.
Ölç: bildirim rozeti arttığında render olan bileşen sayısı (öncesi/sonrası).

**4.2 · Saha listesi arama fırtınası.** `views/PitchDiscovery.tsx` — arama debounce'suz
(`:1384`), kart `React.memo` değil ama `layout` animasyonu taşıyor (her render'da
yerleşim ölçümü), liste `popLayout` ile sarılı, çağrı yerinde satır içi `onClick`,
ve `fetchPitches` (`:578`) **`.limit()` içermiyor**.
`useDebouncedValue` depoda zaten var (`admin-panel/views/hooks/`), yalnız admin
panelinde kullanılıyor — oyuncu tarafına taşı. `useCallback` + `React.memo` + `.limit(100)`
ekle. Ölç: tuş vuruşu başına render sayısı.

**4.3 · Panel saniyede bir render oluyor.** `views/ServiceDashboard.tsx:236-257` —
1 sn'lik sayaç, 2.808 satırlık bileşeni dakikada 60 kez render ediyor; `timeLeft`
dosyada **tek bir yerde** kullanılıyor. Geri sayımı `React.memo`'lu yaprak bileşene
indir. (Aynı kalıp `Dashboard.tsx:209` ve `MatchCreate.tsx:221`'de 60 sn periyotla var —
etkisi düşük, isteğe bağlı.)

**4.4 · İlk açılış paketi.** Ölçülen: 835 kB JS + 312 kB render-blocking CSS
(gzip 253 + 37,5 kB). `React.lazy` 30 görünümde doğru uygulanmış ve `maplibre-gl`
(803 kB) tembel — sorun `framer-motion`'ın `App.tsx:2`'de statik import edilmesi
(`ui-vendor` 235 kB ilk yükte). Splash/Auth yolundan çıkar.
Ölç: `npm run build` çıktısındaki ilk yük chunk toplamı (öncesi/sonrası).

**4.5 · Temizlenmeyen interval.** `views/RoleSelection.tsx:86-98` — 35 ms'lik interval
olay işleyicisinde kuruluyor, ref'te tutulmuyor, `useEffect` temizliğine bağlı değil.
Bileşen %100'e varmadan sökülürse interval oturum boyunca çalışmaya devam ediyor.
`ivRef`/`toRef` + unmount temizliği ekle.

**Kalite kapısı (FAZ 4):** `kalite-kapilari.test.ts`'e paket boyutu tavanı ekle —
ilk yük chunk toplamı ölçülen yeni değerin %10 üstünü aşarsa test kırmızıya dönsün.

---

## KAYIT — plana işleme

Bu paketin bulguları **IP-24'ten itibaren** numaralanacak. Her faz bittiğinde:
- `docs/ux-audit/OYNA-COZUM-PLANI.md`'ye yeni IP maddelerini ekle (mevcut biçimi
  taklit et — durum sütunu, dosya:satır, karar).
- `docs/ux-audit/KARAR-DEFTERI.md`'ye bu promptta yazılı kullanıcı kararlarını işle
  (bilet 48 saat, çevrimdışı taslak, admin ayrı anahtar/CSP yok, cüzdan ekranına
  dokunulmaması, IP-17/IP-21'in kapalı kalması).
- IP-08 / IP-10 / IP-12 satırlarına "kaçaklar IP-24+ ile kapatıldı" notu düş —
  plan gerçeği yansıtsın.

## AÇIK BORÇ — bu pakette YAPILMAYACAK, listeye yazılacak

- `views/WalletScreen.tsx` içindeki iki uyuyan kusur (para çekme talebinde senkron
  çift-tık kilidi yok; kayıtlı kart silmede onay yok, hata `.catch(() => {})` ile
  yutuluyor). **Cüzdan açılmadan önce düzeltilecek** diye borç listesine yaz.
- Admin paneli için CSP başlığı ve ayrı alan adına taşıma.
- Telefona gerçek push bildirimi gönderimi (APNs/FCM anahtarları kurucunun elinde).
- Listelerin sanallaştırılması: `components/common/VirtualList.tsx` yazılmış ve
  doğru çalışıyor ama **import sayısı 0**. Bağlanacaksa `:60`'daki `key={originalIndex}`
  kararlı kimliğe çevrilmeli.

## KIRMIZI ÇİZGİLER

- `main` dalına push yok. PR açma.
- Test silme, atlama (`skip`), karantinaya alma **yasak**. Test kırmızıysa kökü bul.
- Bu paket **saf frontend**. Migration yazma, canlı veritabanına yazma, edge function
  dağıtma. Şema değişikliği gerektiren bir şey bulursan **yapma**, özete yaz.
- PRENSİPLER §11'de bilerek kapalı olan hiçbir bayrağı açma (cüzdan, çekim, push,
  demo modu, ödeme modu).
- Kurucu kod okumaz (§10.2): her açıklama sade Türkçe, kod yalnız kanıt olarak.
- Kapsam disiplini (§10.5): yol üstünde gördüğün başka sorunu **düzeltme**, özetin
  "fark ettiklerim" bölümünde bildir.

## TUZAKLAR — bunlara düşüldü, tekrarlama

1. **`views/WalletScreen.tsx` erişilemez.** `App.tsx:918`'de `case 'WALLET':` doğrudan
   `Dashboard`'a düşüyor ve kod tabanında tek bir `navigateTo('WALLET')` yok. Oradaki
   kusurları "kritik" sanıp düzeltmeye kalkma — bugün hiçbir kullanıcı o ekrana giremiyor.
2. **İki hata çevirici var** (bkz. 3.3). Yanlış import bütün fazı bozar.
3. **`IconButton` ve `submitGuard` zaten yazılmış.** Yeniden yazma; bağla.
4. **`tests/setup.ts` store'u global mock'luyor** — store seçicilerini değiştirirken
   (FAZ 4.1) testler beklenmedik şekilde kırılabilir; önce setup dosyasını oku.
5. **`grep -h` dosya adını bastırır** — sayım yaparken `-h` kullanma, yanlış sayarsın.
6. **Görsel testler kırmızıya dönerse** `docs/ux-audit/GORSEL-REGRESYON.md` sürecini
   izle; anlık görüntüleri düşünmeden güncelleme.
7. **`npm run lint` aslında `tsc --noEmit`.** PRENSİPLER §8.5: testlerin tip kontrolü
   lansman sonrasına bırakıldı (65 bilinen hata) — bunu "benim kırdığım" sanma, ama
   **yeni** hata da ekleme.

## BAŞLARKEN

1. Dalı oluştur, `npm ci` çalıştır.
2. Yukarıdaki dört belgeyi oku.
3. FAZ 0'ı yap, kanıtı sun, **dur ve onay bekle**.
4. Onay geldikçe sırayla ilerle.

Sorusu olan bir konu çıkarsa — özellikle görünümü değiştiren bir karar — **varsayımla
ilerleme**, kullanıcıya sor. Bu paketteki kararların tamamı yukarıda yazılı; yazılı
olmayan bir karar gerekiyorsa o gerçekten yeni bir karardır.
