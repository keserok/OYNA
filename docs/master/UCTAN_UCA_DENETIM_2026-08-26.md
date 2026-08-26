# 🔬 OYNA — Uçtan Uca Sistem Denetimi

**Tarih:** 26 Ağustos 2026 · **Kapsam:** UI/UX · Frontend mimari · Backend/API · Veritabanı
**Yöntem:** 6 paralel denetim + canlı veritabanı doğrulaması (`iikvzgyccvgcybzdfwlv`, salt-okunur)
**Ölçek:** ~200.000 satır kod · 126 `public` tablosu · 925 fonksiyon · 15 canlı edge function

---

## 0 · Önce ölçek: bu rapor hangi gerçeğe göre önceliklendirildi

Canlı veritabanından ölçüldü:

| Varlık | Toplam | Demo | **Gerçek** |
|---|---|---|---|
| Kullanıcı (`profiles`) | 42 | 33 | **9** |
| Saha (`pitches`) | 6 | 0 | 6 |
| Maç (`matches`) | 90 | 89 | **1** |
| Rezervasyon (`pitch_bookings`) | 107 | — | 107 |
| Ödeme niyeti (`payment_intents`) | 94 | — | 94 (tamamı SIMULATION) |

**Sonuç:** Sistem lansman öncesi. Bu yüzden bu rapor **performans** bulgularını değil,
**geri döndürülemez** olanları öne aldı: güvenlik, para doğruluğu, veri kaybı ve
"gerçek kullanıcı geldiğinde düzeltmesi pahalı olacak" yapısal kusurlar.

`payment_provider = SIMULATION` olduğu için **bugün gerçek para hareketi yok**.
Ödeme mutabakatı bulguları (B-01…B-05) bu yüzden "bugün yanıyor" değil,
**"iyzico canlıya alınmadan önce kapatılmalı"** kategorisindedir.

---

## 1 · Kanıtlanmış SAĞLAM temeller (bunları bozmayın)

Denetimin dürüstlüğü için önce bunlar. Hepsi canlı sistemde tek tek doğrulandı:

| Alan | Kanıt |
|---|---|
| **Çift rezervasyon imkânsız** | `pitch_bookings_no_overlap EXCLUDE USING gist (court_id WITH =, slot_range WITH &&) WHERE status <> 'CANCELLED'` + `court_id NOT NULL` + `slot_range`'i her yazımda yeniden hesaplayan tetikleyici. RLS ile atlatılamaz. `create_pitch_booking` "önce bak sonra yaz" yapmıyor; doğrudan INSERT edip `exclusion_violation` yakalıyor — doğru kalıp. |
| **Para değişmezleri yeşil** | `check_money_invariants()` bugün `ok:true`, 8/8 sıfır — `I1_wallet_mirror_mismatch`, `I2_idempotency_dup`, `I4_negative_bucket` dahil. Her gece 03:40'ta `sistem_saglik_calistir()` içinden koşuyor. |
| **Cüzdan defter mimarisi** | Bakiye mutable kolon değil; `wallet_transactions` defterinden hesaplanıyor. `wallet_spend_balance` harcamadan önce `profiles ... FOR UPDATE` alıyor → çift çekim mümkün değil. Ayna sapması: 0 satır. |
| **RLS her yerde açık** | 126 `public` tablosunun **tamamında** `relrowsecurity = true`. RLS'i kapalı tek tablo yok. |
| **Webhook sahteciliğe kapalı** | `payment-webhook` gelen `token`'ı iyzico'ya **imzalı istekle geri sorup** `paymentStatus === 'SUCCESS'` arıyor. Sahte "ödeme başarılı" POST'u para hareketi yaratamaz. |
| **Ödeme idempotency'si uçtan uca** | İstemci UUID → `create-payment` → `prepare_card_payment(p_idempotency_key)` → kısmi tekil indeks. `apply_card_payment` `FOR UPDATE` + `PAID` ise no-op. Aynı webhook iki kez gelirse **bakiye iki kez yüklenmez**. |
| **Gömülü anahtar `anon`** | `supabaseClient.ts` yedeği çözüldü: `role=anon`. `service_role` sızıntısı **yok**. |
| **Android sertleştirmesi** | `allowBackup="false"` + `data_extraction_rules.xml` ile belirteç buluta/yeni telefona kopyalanmıyor. |
| **Cron sağlığı** | 24 zamanlanmış iş, 3 gündür **sıfır** başarısızlık. Askıda ödeme: 0. Bekleyen karta iade: 0. |
| **Ödeme ekranı referans kalitesinde** | `PaymentScreen`: senkron `payBusyRef` kilidi, idempotency anahtarı, timeout ayrımı, Türkçeleştirilmiş hata, elle kapatılan hata şeridi. Diğer akışların hedefi bu dosya olmalı. |

---

## 2 · UI/UX ve Kullanıcı Akışı

| Risk | Katman | Problem Tanımı | Kullanıcıya/Sisteme Olası Etkisi | Somut Çözüm |
|---|---|---|---|---|
| **Kritik** | UI-UX | **Hata durumunda "kayıt yok" gösteriliyor.** `views/MessagesView.tsx:284,416` — `catch` bloğu `setError()` yapıyor ama render dalı yalnız `loading` ve `length`'e bakıyor. Aynı ekranda "Henüz mesaj yok. İlk mesajı sen yaz." **ve** kırmızı hata şeridi birlikte çıkıyor. Gelen kutusunda da aynısı (`:1008`, `InboxList:139`). | Metroda sohbeti açan kullanıcı 200 mesajlık yazışmasının silindiğini sanıyor; karşı tarafın kendisini engellediğini düşünüyor. Gelen kutusunda tüm konuşmaları kaybolmuş görünüp "Arkadaş Bul"a yönlendiriliyor. | Dal sırasını `loading → error → empty` yap; hata varken boş durumu **hiç çizme**. Doğru referans depoda var: `views/Notifications.tsx:425-465`. |
| **Kritik** | UI-UX | **Takım maç geçmişi hatada siliniyor.** `views/social/TeamDetailView.tsx:390` — `catch` yalnız `console.error` + `setHistory([])`. `historyError` diye bir state **yok** (grep: 0 sonuç). | 3 sezondur oynayan takımın kaptanı, geçici bir RLS/ağ hatasında tüm maç geçmişinin ve form grafiğinin silindiğini görüyor; üstelik "Maç Kur" CTA'sı ile yanlış aksiyona itiliyor. Tekrar deneme yolu yok. | `historyError` state'i ekle, `setHistory([])` satırını **kaldır** (eski veriyi göstermek boşaltmaktan iyidir), `ErrorState + onRetry` çiz. |
| **Kritik** | UI-UX | **12 modal donanım geri tuşuna kayıtlı değil.** `views/MatchJoin.tsx` — aralarında "Maçtan ayrıl?", "Maçı iptal et?", "Oyuncuyu çıkar?" yıkıcı onayları var. `useBackDismiss` kullanımı: 0. Altyapı (`hooks/useBackDismiss.ts` + `App.tsx:781` öncelik sırası) hazır ama bağlanmamış. 30+ dosyada aynı boşluk. | Oyuncu "Maçtan Ayrıl" onayını açıp vazgeçiyor, geri tuşuna basıyor → modal kapanmıyor, **maç ekranından tamamen atılıyor**. "İptal mi ettim, ayrıldım mı?" bilmiyor. Saha sahibinin "Slotu Kapat"/"Flaş İndirim" modallarında aynısı para etkili. | Modal başına tek satır: `useBackDismiss(acikMi, kapat, 'ad', 10)`. Kalıcı çözüm: `GlassModal`/`BottomSheet` sarmalayıcılarına geçmek (kaydı kendileri yapıyor). |
| **Kritik** | UI-UX | **Saha formunda uyarısız veri kaybı.** `views/owner/PitchManager.tsx:324` — ~15 alanlı form, geri oku `setEditingPitch(null)` yapıyor; kirlilik kontrolü, onay, taslak **yok**. Depo genelinde `dirty`/`unsaved`/`beforeunload` koruması hiç yok. Editör `navigationStack`'e de girmiyor → donanım geri tuşu tüm ekrandan çıkarıyor. | Saha sahibi 5-10 dakikada sahasını tanımlıyor, fotoğraf yüklüyor; yanlışlıkla geri okuna dokunuyor → her şey uyarısız siliniyor. İkinci kez aynı emeği vermeyen sahip sahayı **hiç yayınlamıyor**. | Snapshot ile `isDirty` hesapla; `useConfirmSheet` (dosyada zaten kurulu) ile "Değişiklikleri bırak?" onayı; `useBackDismiss` ile donanım geri tuşunu da aynı yola düşür. |
| **Yüksek** | UI-UX / Frontend | **Timeout/offline altyapısı yazılmış ama bağlanmamış.** `shared/submitGuard.ts` tam da bu akışlar için yazılmış; tüketici sayıları: `OFFLINE_PUBLISH` 0, `TIMEOUT_PUBLISH` 0, `TIMEOUT_JOIN` 0, `RPC_TIMEOUT_MS` 0. `MatchCreate.tsx:35` yalnız `safeUuid` alıyor. Depoda hiç `AbortController` yok. | Tünelde/otel Wi-Fi'ında `navigator.onLine` `true` kalır, veri akmaz: "Yayınla" sonsuza kadar döner (`finally` hiç çalışmaz), iptal yolu yoktur, ekran kilitlenir. Kullanıcı uygulamayı öldürmek zorunda kalır ve **maçın açılıp açılmadığını bilmez**. Katılmada `optimistikDoldur()` slotu dolu gösterir; oyuncu yerini aldığını sanıp maça gitmez. | Zaten yazılmış olanı bağla: `if (!isOnline()) return showToast(OFFLINE_PUBLISH)`, `await withSubmitTimeout(rpc, RPC_TIMEOUT_MS)`, `SubmitTimeoutError` dalında **idempotency anahtarını sıfırlama** (tekrar deneme aynı anahtarla gitsin). |
| **Yüksek** | UI-UX | **17 dosyada ham İngilizce hata metni.** `views/ServiceDashboard.tsx` (20 nokta), `MessagesView`, `TeamDetailView`, `ServiceProfile`… `err?.message \|\| 'Türkçe yedek'` kalıbı: `message` doluysa yedek **asla** görünmez. Oysa `utils/errorMap.ts` (`toTurkishError`) var ve 76 yerde kullanılıyor. | Kaleci/hakem teklifi kabul ederken `new row violates row-level security policy for table "service_requests"` görüyor. 4 saniyede kaybolduğu için ekran görüntüsü bile alamıyor. Türkçe bir üründe güven kırıcı. | Mekanik: `toTurkishError(err, 'yedek')`. ESLint `no-restricted-syntax` ile `?.message \|\|` kalıbını `views/`+`components/` altında yasakla. Hata toast'ının 4 sn oto-kapanışını kaldır. |
| **Yüksek** | UI-UX | **Sağlayıcı başvuru formunda taslak ve offline kapısı yok.** `views/ServiceApplication.tsx:97-121` — 13 alan + kimlik fotoğrafı, hepsi RAM'de. Kalıcılık yok, `isOnline()` kapısı yok, hata ham. | Aday 5-10 dakikada formu dolduruyor; bildirim/çağrı/geri tuşu ekranı düşürüyor → **her şey siliniyor**. İkinci kez aynı emeği vermeyen aday platforma hiç katılmıyor — doğrudan arz tarafı kaybı. | Debounce'lu `localStorage` taslağı (fotoğraf hariç) + gönderim öncesi `isOnline()` + `toTurkishError`. Referans: `views/social/TeamCreatePanel.tsx:41-58`. |
| **Orta** | UI-UX | **Kontrast kuralı 269 yerde ihlal.** `index.css:262` "`--color-ink-4: #8B949E` — EN SOLUK İZİNLİ, altına inilmez" diyor. Gerçek: `text-gray-500` (**4,00:1**) 219 kullanım, `text-gray-600` (**2,56:1**) 50 kullanım. Yoğunlaştığı yer `views/MatchTicket.tsx`. | Maç bileti sahanın kapısında, **güneş altında** okunuyor. "Giriş QR kodu yalnız ödeme tamamlanınca oluşur." gibi durum açıklayan metin görünmüyor; oyuncu QR'ın neden çıkmadığını anlamayıp görevliyle tartışıyor. | `text-gray-600`/`500` → `text-ink-4` (mekanik). Sonra Tailwind'de bu sınıfları devre dışı bırak ya da ESLint ile yasakla — kural kodda zorunlu olsun. |
| **Orta** | UI-UX | **58 ikon-butonda erişilebilir ad yok** (1019 butonun 209'unda var). Aralarında `WalletScreen:1026` ve `AddCardScreen:129` **geri butonları** da var. | TalkBack/VoiceOver kullanan oyuncu Kart Ekle ekranında "düğme, düğme, düğme" duyuyor; **ekrandan nasıl çıkacağını bulamıyor** → ödeme akışında kilitleniyor. | `aria-label` ekle. Kalıcı: `aria-label`'ı **zorunlu prop** yapan ortak `IconButton` bileşeni. |
| **Orta** | UI-UX | **Yıkıcı aksiyonlarda tutarsızlık.** `FinanceExpenseTab.tsx:226` — sabit gider **şablonu** silme: onay yok, hata `.catch(() => {})` ile yutuluyor, hedef ≈26×26px. Aynı dosyanın `:84`'ünde tek seferlik gider silme **doğru** yapılmış (onay + hata bildirimi). | Daha kalıcı etkisi olan işlem daha az korumalı: kira şablonu onaysız siliniyor, sonraki aylarda gider tablosuna düşmüyor, **kâr sessizce şişiyor**. Sahip ay sonu mutabakatında fark ediyor. | `removeExpense` kalıbını birebir uygula; hedefi `w-11 h-11` yap; `aria-label` ekle; `catch`'i `notify(toTurkishError(err),'error')` ile doldur. |

---

## 3 · Frontend & Mobil Mimari

| Risk | Katman | Problem Tanımı | Kullanıcıya/Sisteme Olası Etkisi | Somut Çözüm |
|---|---|---|---|---|
| **Yüksek** | Frontend | **Push dinleyicileri izin akışında birikiyor.** `notifications/pushService.ts:330-378` dört dinleyici takıyor, hiçbirini sökmüyor. `App.tsx:690` per-uid kapısı var ama izin modali onu **atlıyor**: `App.tsx:622` `pushKurulumRef` → `App.tsx:1068` modal doğrudan çağırıyor. Tek temizlik `clearPushToken` içinde ve **koşullu** (`if (!error)`). | Kullanıcı izin modalini kabul edince dinleyici 4→8 olur. Sonraki her bildirimde çift toast; bildirime tıklayınca `handleDeepLink` **iki kez** navigasyon yapar — ekran "zıplar". | `initPushNotifications` başına `await PushNotifications.removeAllListeners()` (idempotent kurulum); `clearPushToken`'daki temizliği `if (!error)` dışına çıkar. |
| **Yüksek** | Frontend | **Aramada bayat yanıt (stale response).** `views/social/FriendAddView.tsx:215-234` — temizlik yalnız **ateşlenmemiş** zamanlayıcıyı iptal ediyor; uçuştaki `await searchUsers(q)` durdurulamıyor ve sonuç **koşulsuz** `setResults`'a yazılıyor. Aynı dosyanın `:190-211`'i `alive` bayrağını doğru uyguluyor. | "ah" → "ahmet" yazılır; ağ sırası garanti olmadığı için "ah" yanıtı sonra dönüp **"ahmet" sonuçlarının üstüne yazar**. Kullanıcı yazdığından farklı sonuçlar görür. Ekran kapanırsa sökülmüş bileşene setState. | `let alive = true` + `if (!alive) return` + `return () => { alive = false }`. Depoda hiç `AbortController` yok — kalıcı çözüm için eklenmeli. |
| **Yüksek** | Frontend | **Kök bileşen tüm store'a abone.** `App.tsx:150-185` — `useAppStore()` **seçicisiz** (35 alan). `store.ts` içinde 148 `set(` var; herhangi biri (`setUnreadNotificationsCount` dahil) `App`'i render ediyor. Tüm uygulamada yalnız **3** `React.memo` var, `useShallow` kullanımı **0**. Aynı kalıp 34 yerde (`ServiceDashboard` 2.808 satır, `MatchJoin` 3.250 satır…). | Bir bildirim gelip rozet sayısı artınca — ekranda yalnız o sayı değişse de — kök ve altındaki tüm görünüm ağacı yeniden render oluyor. Düşük-orta segment Android'de gözle görülür takılma. | `views/Dashboard.tsx:165-171` zaten doğru yapıyor (7 atomik seçici). `useShallow` ile alan seç; setter'ları ayrı ayrı çek (abonelik gerektirmezler). |
| **Yüksek** | Frontend | **Saha listesi render fırtınası.** `PitchDiscovery.tsx:1384` arama **debounce'suz** → her tuşta `filteredPitches` yeniden hesaplanıyor; `PitchShowcaseCard` `React.memo` **değil** ve `motion.div layout` taşıyor (her render'da FLIP reflow ölçümü); `AnimatePresence mode="popLayout"` tüm listeyi sarıyor; çağrı yerinde satır içi `onClick`; `fetchPitches` **`.limit()` içermiyor**. | N saha için her tuş vuruşu = N kart render + N reflow. İstanbul ölçeğinde N birkaç yüz olur; arama kutusuna yazarken kare düşmesi kaçınılmaz. | `useDebouncedValue` (depoda var, yalnız admin panelinde kullanılıyor) + `useCallback` + `React.memo` + `.limit(100)` + sayfalama. |
| **Orta** | Frontend | **2.808 satırlık panel saniyede bir render oluyor.** `ServiceDashboard.tsx:236-257` — 1 sn'lik `setInterval` (temizliği doğru) yalnızca `:1681`'deki tek bir `<p>` için `timeLeft` güncelliyor. | Tek metin düğümü için dakikada 60 kez tüm ağaç render ediliyor: kaleci/hakem paneli açıkken sürekli CPU ve **pil** tüketimi. | Geri sayımı `React.memo`'lu yaprak bileşene indir. Aynı düzeltme `Dashboard.tsx:209` ve `MatchCreate.tsx:221` için de (60 sn periyot, etkisi düşük). |
| **Orta** | Frontend | **Sanallaştırma yok; yazılmış `VirtualList` ölü.** `components/common/VirtualList.tsx` doğru yazılmış (ResizeObserver + temizlik) ama import sayısı **0**. Cüzdan 100 satır, bildirimler 50 satır (her biri `motion.div`), sahalar **limitsiz** — hepsi tek seferde DOM'a giriyor. | Uzun listelerde bellek ve kaydırma akıcılığı; veri büyüdükçe doğrusal kötüleşir. | Ya `VirtualList`'i bağla (sabit yükseklikli cüzdan/bildirim listeleri birebir uygun) ya da sil. Bağlarsan `:60`'daki `key={originalIndex}` yerine kararlı kimlik geçir. |
| **Orta** | Frontend | **İlk açılış yükü: 835 kB JS + 312 kB render-blocking CSS** (gzip 253 + 37,5 kB). `React.lazy` 30 görünümde **doğru** uygulanmış ve `maplibre-gl` (803 kB) tembel — sorun çekirdekte: `framer-motion` `App.tsx:2`'de statik import edildiği için `ui-vendor` (235 kB) ilk yükte. | Yavaş 4G'de açılış ekranında ölçülebilir bekleme. Splash/Auth için tüm animasyon kütüphanesi indiriliyor. | `framer-motion`'ı splash/auth yolundan çıkar (kimlik sonrası ağaca al veya `lazy` sarmala). Tailwind `content` kapsamını daralt, kritik CSS'i inline edip gerisini ertele. |
| **Düşük** | Frontend | **`RoleSelection.tsx:86-98`** — 35 ms'lik interval olay işleyicisinde kuruluyor, tanıtıcısı ref'te tutulmuyor, `useEffect` temizliğine bağlı değil. Yalnız `p >= 100` olunca kendini temizliyor. | ~200 ms'lik pencerede geri tuşuna basılırsa saniyede ~28 kez sökülmüş bileşene `setProgress` çağrılır ve interval **oturum boyunca** durmaz. | `ivRef`/`toRef` + `useEffect(() => () => { clearInterval; clearTimeout }, [])`. |

> **Doğrulandı, sorun değil:** 16 Supabase Realtime kanalının **tamamı** `removeChannel` ile kapanıyor. `store.ts:650-706` küresel maç aboneliği ölçümle gerekçelendirilerek kapatılmış (aylık ~6M → ~200K mesaj). `MatchJoin.beginWrite()`, `MatchCreate.publishBusyRef`, `PaymentScreen.payBusyRef` senkron kilitleri doğru. `ThreeDSSheet` üç kaynağı da tek `return`'de temizliyor. Gerçek veri listelerinde `key={index}` **yok** (38 isabetin hepsi iskelet/statik).

---

## 4 · Backend & API Güvenilirliği

| Risk | Katman | Problem Tanımı | Kullanıcıya/Sisteme Olası Etkisi | Somut Çözüm |
|---|---|---|---|---|
| **KRİTİK** | Backend | **Şifre sıfırlama zinciri = kimliksiz → admin ele geçirme.** `password-reset-request` (v6) ve `password-reset-confirm` (v5) canlıda **ACTIVE, `verify_jwt=false`**. (a) Kod `Math.floor(100000 + Math.random()*900000)` — kriptografik değil. (b) Deneme sayacı oku-değiştir-yaz: `password-reset-confirm/index.ts:68` okuyor, `:75` `(row.attempts ?? 0) + 1` yazıyor → eşzamanlı istekler hepsi `0` okur, `MAX_ATTEMPTS=5` **etkisiz**. (c) IP/küresel hız limiti yok (limit yalnız e-posta başına). (d) Başarıda `:90` `admin.auth.admin.updateUserById(profile.id, { password })` — **rol kısıtı yok**. Ve `adminService.ts:304` admin paneli girişi hâlâ `signInWithPassword`. Canlıda **tek** admin hesabı var ve e-postası destek adresiyle aynı (yasal metinlerde yayımlı). `admin_mfa_required = false`. | Kimliksiz bir saldırgan 6 haneli kodu (10 dk pencere, paralel, kırık sayaç) kırıp **herhangi bir hesaba — admin dahil — şifre yazabilir** ve OYNA OS'a tam yetkiyle girebilir: para işlemleri, kullanıcı verisi, yayın. İkinci faktör yok. | **Bu özellik zaten üründe yok** (PRENSİPLER §4.7: "Şifre kavramı YOKTUR"). En temiz düzeltme: iki fonksiyonu da **sil** (`supabase functions delete password-reset-request password-reset-confirm`) + `password_reset_codes` tablosunu düşür. Yaşatılacaksa: `crypto.getRandomValues`, sayacı `FOR UPDATE` + `attempts = attempts + 1` ile atomik tüketen RPC, IP kovası, ve `updateUserById` için rol beyaz listesi. Ayrıca destek adresini admin hesabından ayır. |
| **Kritik** | Backend | **Kapora süpürücüsü iyzico'ya sormadan VOID ediyor.** `20260905000003…sql:1208` — `match_deposit_timeout_min` (30 dk) dolunca `payment_intents` `VOIDED` yapılıyor; yorumu "tahsilat yok — VOID yeterli" diyor ama bu **varsayım, ölçüm değil**. Oysa `sweep-stale-payments/index.ts:14` doktrini yazıyor: "BELİRSİZ → DOKUNMA. KÖR FAILED YASAK." | 29. dakikada 3DS onaylanıp kart **çekilir**, 30. dakikada niyet VOID edilir, 31. dakikada callback `INVALID_STATE` alır. `mark_intent_auth_charged` yalnız `PENDING` günceller → çekim **kanıtı hiç yazılmaz**; `list_stale_payment_intents` yalnız `PENDING` seçer → süpürücü bir daha bakmaz. Para çekilmiş, maç yok, iade kuyruğunda kayıt yok. **Tek sessiz para kaybı yolu.** | VOID'i mutabakata bağla: SQL yalnız aday işaretlesin, kararı `sweep-stale-payments` versin. Ara yama: `match_deposit_timeout_min`'i 3DS ömrünün çok üstüne çek. `mark_intent_auth_charged` `VOIDED`/`FAILED`'dan da kurtarabilsin. |
| **Kritik** | Backend | **İade kuyruğu satırı atomik sahiplenilmiyor.** `refund-payment/index.ts:79` `status='PENDING'` okuyor, iyzico'ya POST atıyor, `DONE`'ı **ancak iş bitince** yazıyor (`:129`). Arada satır hâlâ `PENDING`. `FOR UPDATE SKIP LOCKED` yok, `PROCESSING` geçişi yok, kiralama yok. Cron `*/5`, `iyzicoPost` bu dosyada **timeout'suz**. | İki cron turu üst üste binerse aynı satır iki kez okunur → **iyzico'ya iki ayrı `/payment/refund`** gider. Kullanıcının kartına **çift iade**; farkı platform kaybeder. Fonksiyon yarıda ölürse de satır `PENDING` kalıp yeniden iade edilir. | `claim_card_refunds(p_limit)` RPC'si: `FOR UPDATE SKIP LOCKED` + `PENDING→PROCESSING` + `claimed_at` kiralama + `attempts` claim anında artar. Edge tarafı `select` yerine bu RPC'yi çağırsın. |
| **Yüksek** | Backend | **`apply_booking_payment`'ta durum kapısı yok.** `20260615091000…sql:75-105` — `PAID` ise no-op var (iyi), ama `REFUNDED`/`VOIDED`/`FAILED` **UPDATE dalına düşüyor**. Kardeşi `apply_card_payment` bu kapıyı koyuyor (`INVALID_STATE`), bu koymuyor. Ayrıca `raw = COALESCE(p_raw, raw)` mevcut `raw`'ı **eziyor**. | İade edilmiş bir niyet aynı token'la yeniden `PAID` yapılabiliyor: `paid_amount` şişer, ikinci `booking_payments` satırı açılır, tesise **ikinci kez hakediş** görünür, iade edilmiş para "ödenmiş" sayılır. | Tek satır: `IF i.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE…'`. `raw`'ı `raw \|\| p_raw` ile birleştir. |
| **Yüksek** | Backend | **`MATCH_DEPOSIT` süpürücü kapsamı dışında.** `20260726000000002…sql:96` filtresi `('BOOKING_DEPOSIT','TOP_UP','MATCH_JOIN')`. `MATCH_DEPOSIT` akışı 5 Eylül'de eklendi, filtre hiç güncellenmedi. | Maç kaporası yarıda kalırsa (3DS terk, callback kaybı) **hiçbir mutabakat çalışmaz**. Bu, yukarıdaki kör VOID'i kurtarılamaz kılan ikinci kilittir. | Filtreye `'MATCH_DEPOSIT'` ekle. `sweeper_stale_minutes` (15 dk) ile `match_deposit_timeout_min` (30 dk) sıralamasını gözden geçir: mutabakat, iptalden **önce** çalışmalı. |
| **Yüksek** | Backend | **3DS callback'in başarısızlık yolu doğrulanmıyor.** `iyzico-3ds-callback/index.ts:84-104` — başarı yolu iyzico'ya imzalı istekle doğrulanıyor (**doğru**), ama `mdStatus !== '1'` dalında gövdeden gelen `mdStatus` ve `conversationId` olduğu gibi kabul edilip `service_role` ile `mark_intent_failed` çağrılıyor. Uç kimliksiz. | Kendi niyet UUID'sini bilen biri (yanıtta görüyor), 3DS penceresi bankada açıkken `mdStatus=0` POST'larsa: banka çekimi tamamlanır, gerçek callback `INVALID_STATE` alır, kanıt yazılamaz, süpürücü bakmaz → **para çekilmiş, hizmet yok**. Kasıtlı chargeback üretmek için kullanılabilir. | Başarısızlık yolunda da iyzico'ya sor (`/payment/detail`): çekilmişse `mark_intent_auth_charged`, çekilmemişse `mark_intent_failed`, **belirsizse dokunma**. Ayrıca niyetin `raw`'ına `3ds_initiated_at` damgası koyup yalnız sonraki callback'leri kabul et. |
| **Yüksek** | Backend | **`config.toml` yalnız `send-sms` için `verify_jwt=false` diyor.** Canlıda 15 fonksiyondan **14'ü** `verify_jwt=false` (yalnız `admin-owner-credentials` `true`) — ama bu ayar **panelden elle** yapılmış. Depoda beyan yok; CLI'da beyan edilmeyen fonksiyon `true` varsayılır. | Biri CI'dan veya lokalden `supabase functions deploy` çalıştırdığı an kapı **kod hiç çalışmadan** 401 döner: iyzico callback'i 401 → kart çekilir, rezervasyon yazılmaz; iade cron'u 401 → **iadeler müşterinin kartına hiç gitmez**; süpürücü 401 → askıda ödemeler mutabık kılınmaz. Cron tarafı **sessiz**: `net.http_post` yanıtını kimse okumuyor. | 7 fonksiyon için `[functions.X] verify_jwt = false` bloklarını `config.toml`'a yaz. CI'ya doğrulama adımı ekle: her `supabase/functions/*` için ya blok ya bilinçli beyaz liste zorunlu. |
| **Orta** | Backend | **Üç para fonksiyonunda iyzico çağrısı timeout'suz.** `capture-payment:31`, `void-payment:31`, `refund-payment:42` — `fetch(..., { /* signal YOK */ })`. Oysa `create-payment:48`, `iyzico-3ds-callback:26` ve `sweep-stale-payments:43` `AbortController` + 20 sn kullanıyor ve gerekçesini yazıyor. | iyzico yanıt vermezse fonksiyon duvar-saati sınırına kadar asılı kalır. `refund-payment` için bu doğrudan çift iadeyi tetikler; `capture`/`void` için niyet `BLOCKED` kalır, iyzico'da post-auth geçmiş olabilir → mutabakat kayması. | Ortak `_shared/iyzico.ts` yardımcısı (20 sn timeout). **Retry ekleme** — kör retry çift çekim yapar; timeout'ta satır `PROCESSING` kalıp kiralama dolunca yeniden ele alınsın. |
| **Orta** | Backend | **Üç fonksiyon "panel daraltır" kuralını atlıyor.** `payment-webhook:9`, `capture-payment:14`, `void-payment:14` `Deno.env.get('PAYMENT_PROVIDER')` okuyor; `_shared/paymentProvider.ts` (tek kaynak, `create-payment` ve `refund-payment` kullanıyor) devre dışı. | Panelden `payment_provider=SIMULATION`'a çekmek — dokümante edilmiş **acil durdurma kolu** — bu üçünü etkilemez; secret `IYZICO` kaldığı için gerçek para hareketi uygulanmaya devam eder. "Tek anahtarla parayı durdur" güvencesi eksik. | Üçünde de `resolvePaymentProvider(admin)` kullan; `DISABLED` ise 503. `payment-webhook:100`'deki `SIMULATION_WEBHOOK_ALLOW` dalını sil (aynı işi JWT+RLS ile yapan `confirm-sim` zaten var). |
| **Orta** | Backend | **Ham DB/sağlayıcı hata metinleri istemciye dönüyor.** `create-payment:302,496`, `capture-payment:95`, `admin-create-user:77`, `admin-owner-credentials:69`… Stack trace yok (iyi) ama `duplicate key value violates unique constraint "payment_intents_user_idem_uq"` veya `OVER_REFUND: kuyruktaki 250 + istenen 300, çekilen 400…` gibi metinler dönüyor. | Şema keşfi (tablo/indeks/fonksiyon adları), iç iş kurallarının ve eşiklerin öğrenilmesi, tutar sızıntısı. İstemci arayüzü bunu filtreliyor ama **HTTP yanıtının kendisi** ham. | `_shared/errors.ts`: güvenli kod beyaz listesi + `request_id`. Tam metin **yalnız** logda. |
| **Orta** | Backend | **`adminGuard` tümüyle uykuda ve CORS `*`.** `_shared/adminGuard.ts:12-32` — `ADMIN_ALLOWED_ORIGIN`/`ADMIN_IP_ALLOWLIST` boşsa `return true`; `Origin` başlığı yoksa da geçiyor. Dosyanın kendi başlığı "TAMAMEN DORMANT" diyor. | `admin-create-user` ve `admin-owner-credentials` yalnız `is_platform_admin()` ile korunuyor (bu kapı gerçek ve sunucu tarafında). Ama derinlemesine savunma yok: çalınmış bir admin JWT'si dünyanın her yerinden kullanılabilir. `set_password` aksiyonu **herhangi bir kullanıcının** şifresini değiştirebiliyor. | Secret'ları üretimde set et (kod değişikliği gerekmez). `isOriginAllowed`'ın `if (!origin) return true` dalını allowlist aktifken fail-closed yap. `set_password` için taze-oturum/MFA şartı. |
| **Düşük** | Backend | **`admin-create-user` rolü doğrulamıyor.** `:36` `role = 'PLAYER'` gövdeden geliyor, beyaz liste yok; `profiles_role_check` `SUPER_ADMIN`'e izin veriyor. Denetim kaydı (`log_admin_action`) da **hiç yok**. | Herhangi bir platform admini sınırsız yeni **SUPER_ADMIN** üretebilir — yatay ayrıcalık yayılımı, üstelik izsiz. | Rol beyaz listesi; ADMIN/SUPER_ADMIN yalnız ayrı bir aksiyonla ve SUPER_ADMIN tarafından. `deleteUser` telafisinin dönüş değerini kontrol et. `log_admin_action` çağrısı ekle. |

---

## 5 · Veri Tabanı & Veri Bütünlüğü

| Risk | Katman | Problem Tanımı | Kullanıcıya/Sisteme Olası Etkisi | Somut Çözüm |
|---|---|---|---|---|
| **Kritik** | DB | **Mali kayıt silinebiliyor.** `anon` **ve** `authenticated` rollerinin `pitches`, `courts`, `pitch_bookings`, `booking_payments`, `payment_intents`, `wallet_transactions` üzerinde **DELETE + TRUNCATE** yetkisi var. Tek kapı RLS ve iki politika izin veriyor: `pitches_delete_owner_or_admin` (`auth.uid() = owner_id`), `pitch_bookings_delete` (`can_manage_pitch`). Zincir baştan sona CASCADE: `pitches → courts → pitch_bookings → booking_payments / payment_intents`. `supabaseMutations.ts:562` hâlâ ham `delete()` çağrısı taşıyor. | Tesis sahibi kendi sahasını silince kortlar, rezervasyonlar **ve tahsil edilmiş ödeme kayıtları** birlikte yok oluyor. Kartından kapora çekilmiş oyuncunun elinde banka ekstresi var, sistemde hiçbir iz yok: iade yapılamaz, chargeback kazanılamaz, para değişmezleri referansı bulamaz. VUK/TTK açısından savunulamaz. Tutarsız da: `payment_intents.pitch_id` FK'si `NO ACTION` olduğu için bazı sahalar hata veriyor, bazıları **sessizce siliniyor**. | Mali FK'leri `RESTRICT`e çevir (`booking_payments`, `payment_intents` → `pitch_bookings`; `pitch_bookings` → `pitches`). `REVOKE DELETE, TRUNCATE … FROM anon, authenticated`. Saha silmeyi arşivlemeye çevir. `supabaseMutations.deleteBooking`'i kaldır. |
| **Kritik** | DB | **Gece yedeği geri yüklenemez.** `yedek.gunluk_al()` yalnız `yedek.kapsam`'daki **10** tabloyu kopyalıyor; `public`'te **126** tablo var. Kanıtlanan referans kırıkları: `pitch_bookings.court_id → courts` (CASCADE), `pitch_tariffs.court_id → courts` (CASCADE), `pitch_bookings.subscription_id → pitch_subscriptions` (CASCADE), `matches.court_id → courts`, `profiles.id → auth.users` (CASCADE, `auth` şeması hiç yedeklenmiyor). Yedek **aynı veritabanında**, saklama 7 gün. Ücretsiz planda platform yedeği/PITR yok (§12 PRO-6). Kapsam dışı kalanlar arasında `courts`, `service_requests`, `admin_audit_log`, `notifications` var. | Yedek geri yüklendiğinde **çalışan bir sisteme dönmüyor**: kortu olmayan rezervasyonlar, tarifesiz kortlar, `auth.users` karşılığı olmayan profiller (kullanıcılar giremez). Ve K-YEDEK-1 kontrolü "10 tablo, tam" diyor — çünkü yedeği **kendi kapsam listesine** göre doğruluyor. §7.8 "yedeğin kendisi denetlenir" fiilen sağlanmıyor. | `yedek.kapsam`'ı referans-kapalı hale getir (en az `courts`, `pitch_subscriptions`, `service_requests`, `admin_audit_log`). Yedeği **veritabanı dışına** al (`pg_dump` → nesne depolama). K-YEDEK-1'i kapsam listesine değil, "FK ile bağlı her ebeveyn kapsamda mı" sorusuna göre yaz. Geri alma provası yap (RAF.md'de zaten bekliyor). |
| **Yüksek** | DB | **Nakit tahsilatta kayıp güncelleme.** `staff_record_payment` kritik SELECT'i **kilitsiz** (`FOR UPDATE` yok) ve aşırı ödeme kararını bayat `v_paid` üzerinden veriyor. Ardından `update_booking_paid_amount` tetikleyicisi oku-hesapla-yaz ile sabit değer yazıyor. `paid_amount <= price` CHECK'i yok. | İki personel aynı anda tahsilat girerse: (a) aşırı ödeme kapısı delinir (fiyat 1000, `paid_amount` 2000); (b) klasik lost update — müşteri 1000 ödediği halde sistemde 400 görünür. Kapıda "borcunuz var" tartışması, gün sonu kasa tutmaz. Ortak tablet bu özelliğin **birincil** kullanım ortamı. | `SELECT … FOR UPDATE` (tek satırlık asıl düzeltme) + `CHECK (paid_amount <= price + 0.01) NOT VALID`. |
| **Yüksek** | DB | **Defter işaret hatası → hayalet bakiye.** `_wallet_bucket_balances` "tutar daima pozitif, işareti `type` belirler" sözleşmesine dayanıyor; `ELSE -amount` dalı negatif yazılmış bir satırın işaretini çevirip **borcu alacağa** dönüştürüyor. Şemada engelleyen CHECK yok. Canlıda 12 satır / +2.700 TL — **hepsi demo tohumu** (`meta.seed=demo_ekosistem`), gerçek kullanıcı etkilenmiyor. `check_money_invariants` aynı hatalı ifadeyi kopyaladığı için I4 bunu **yakalayamıyor**. | Bugün üretim etkisi yok. Ama aynı şekli yazan herhangi bir üretim yolu karşılıksız harcanabilir bakiye üretir; bu bakiye maça harcanabilir veya (cüzdan açılırsa) IBAN'a çevrilebilir → doğrudan kasa açığı. Ve gece denetimi kör. | Formülü `abs()` ile işaretten bağımsız yap; aynı düzeltmeyi `check_money_invariants`'a da uygula. `CHECK (balance_type NOT IN ('TOP_UP','REFUND_CREDIT') OR amount >= 0) NOT VALID`. |
| **Yüksek** | DB | **Idempotency anahtarı FAILED'dan sonra kalıcı kilitleniyor.** `payment_intents_idem_uq` indeksi **durum filtresiz** (`WHERE idempotency_key IS NOT NULL`), ama `prepare_card_payment`'ın yeniden kullanım SELECT'i yalnız `PENDING/PAID/CAPTURED/BLOCKED` arıyor. Ayrıca bu SELECT kilitsiz (kontrol-sonra-yaz yarışı; çift çekim olmuyor, ham `23505` dönüyor). Canlıda **8 FAILED + 1 REFUNDED** niyet idempotency anahtarı taşıyor. | Kartı ilk denemede reddedilen kullanıcı "tekrar dene"ye bastığında anlaşılmaz hata alıyor — o anahtar **zehirlenmiş**. İstemci bunu aşmak için yeni anahtar üretirse idempotency'nin tüm koruması kalkar ve **gerçek çift çekim** kapısı açılır. | İndeksi kodun aradığı durum kümesiyle hizala (`AND status IN ('PENDING','BLOCKED','CAPTURED','PAID')`). Kararı SELECT değil `INSERT … ON CONFLICT … DO NOTHING RETURNING` versin; boş dönerse kazananın niyetini oku. |
| **Yüksek** | DB | **Ceza tahsilatı sessizce yutuluyor.** `provider_cancel_assignment` — `BEGIN … EXCEPTION WHEN OTHERS THEN v_charged := false` bloğu bir **alt işlem**: sağlayıcının bakiyesi yetmezse `wallet_spend_balance` hata verir ve alt işlem tümüyle geri alınır — **kaptanın tazminat INSERT'i dahil**. Fonksiyon yine başarı döner. `WHEN OTHERS` deadlock/serialization hatalarını da yutuyor. | Bakiyesi sıfır kaleci maçtan 2 saat önce işi bırakıyor: ceza alınmıyor, kaptan tazminat almıyor, kimseye hata gösterilmiyor. Ceza, **bakiyeyi boşaltmak kadar kolay** atlatılıyor. | Yutmayı kaldır. Bakiye yetmiyorsa borç satırı yaz (`PENALTY_DEBT`), sessizce geçme. **Tazminatı cezanın tahsilinden bağımsız öde.** `WHEN OTHERS` yalnız bildirim gönderimini sarsın. |
| **Orta** | DB | **Slot tutmaları hiçbir şeyi tutmuyor.** `pitch_slot_holds` kısıtı `UNIQUE (pitch_id, court_id, booking_date, start_time)` — **aralık değil, tam eşleşme**. 20:00–21:30 tutmasıyla 20:30 tutması çakışmıyor. `create_pitch_booking` başkalarının tutmalarına hiç bakmıyor, yalnız kendi satırını siliyor. | Ödeme ekranında "saat sizin için ayrıldı" gören iki kullanıcıdan biri, kart bilgisini girip gönderdiği anda `SLOT_TAKEN` yiyor. Para kaybı yok (EXCLUDE koruyor) ama **en pahalı anda**, akışın sonunda yaşanan kayıp. | `hold_range tsrange` + tetikleyici + `EXCLUDE USING gist (court_id WITH =, hold_range WITH &&)`. `cleanup_expired_holds()` (zaten var) dakikalık cron'a bağlansın. `create_pitch_booking` başkasının aktif tutmasında `SLOT_HELD` dönsün. |
| **Orta** | DB | **Maç–kort çakışması yalnız gelenekle korunuyor.** `matches` tablosunda `court_id` + zaman üzerine **hiçbir** EXCLUDE/UNIQUE yok. `admin_court_slot_check` "rezervasyon satırı olmayan maçlar" için ayrı bir dal tutuyor — yani böyle bir durumun mümkün olduğunu varsayıyor. Canlı veri **temiz**: kortu olan 19 aktif maçın rezervasyonsuzu 0, çakışan çift 0. | Bugün açık değil; koruma tamamen "her maç `pitch_bookings` üzerinden geçer" geleneğine bağlı. `matches`'e rezervasyon üretmeden yazan tek bir yol (yeni RPC, toplu içe aktarma, admin ekranı) korumayı sessizce devre dışı bırakır → aynı kortta aynı saatte iki maç. | Değişmezliği veritabanına yazdır: `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` ile "kortu ve saati olan aktif maçın `pitch_bookings` satırı zorunludur". |
| **Orta** | DB | **`balance_type` NULL olabiliyor.** CHECK `NULL = ANY(...)` → NULL geçiyor. `_wallet_bucket_balances` iki kovayı da `=` ile filtrelediği için NULL satırlar **hiçbir kovaya girmiyor**. Canlıda 3 satır / 2.180,90 TL ("karta iade kuyruğunda"). Mantık aslında **doğru** (karta iade cüzdana eklenmemeli) — kusur, bu kritik ayrımın şemada **isimsiz** olması. | Doğrudan para kaybı yok. Ama "üçüncü kova" yazılı olmayan bir sözleşmeye dayanıyor: `balance_type`'ı NULL bırakan yeni bir kod yolu parayı sessizce görünmez kılar ve hiçbir invaryant uyarmaz. | Kovayı adlandır: `CARD_REFUND`. `NOT NULL` yap, CHECK'e ekle, `cancel_app_booking`'deki NULL yazımlarını güncelle. |
| **Orta** | DB | **Okunmamış bildirim sayacı yanlış indeks kullanıyor.** `notifications` (3.808 satır, en büyük tablo) — `EXPLAIN ANALYZE`: Bitmap Heap Scan, 67 heap bloğu, filtre yalnız 3 satır eliyor, **65 ms**. Karşılaştırma: liste sorgusu doğru indeksi kullanıyor, 5,4 ms. | Rozet sayacı her açılışta çalışıyor. Kullanıcı başına ~90 bildirim; tablo en hızlı büyüyen tablo, maliyet doğrusal artacak. | `CREATE INDEX CONCURRENTLY idx_notifications_unread_badge ON notifications (user_id) WHERE is_read = false AND inbox = true;` |
| **Orta** | DB | **4 SECURITY DEFINER view.** `public_profiles`, `public_matches`, `public_goalkeepers`, `public_referees` — `security_invoker` kapalı, taban tablo RLS'i **uygulanmıyor**. Maskeleme (koordinat/geohash `NULL`) doğru yapılmış ve `public_profiles` `anon`'a kapalı (**iyi**). | Satır filtresi tamamen view'ın `WHERE`'ine bağımlı; taban tabloya ileride eklenecek bir RLS politikası bu view'lardan sızmaya devam eder. | Taban tablolarda uygun `anon` SELECT politikası olduğundan emin olup `ALTER VIEW … SET (security_invoker = on)`. |
| **Düşük** | DB | **`matches.date`/`time` TEXT.** Aynı tabloda doğru tipte `starts_at`/`ends_at timestamptz` **zaten var** — iki paralel zaman gerçeği. `date < current_date` karşılaştırması tip hatası veriyor; cast, `idx_matches_date_status`'u aralık sorgularında işlevsiz bırakıyor. | Metin sıralaması `YYYY-MM-DD`'de tesadüfen doğru; tek bir hatalı formatlı satır (`2026-8-5`) sessizce yanlış sıralanır ve aralık sorgularından düşer. PRENSİPLER §7.2 "`starts_at` tek doğru zaman kaynağıdır" diyor. | `date`/`time`'ı emekliye ayırıp `starts_at`/`ends_at`'i tek kaynak yap. |
| **Düşük** | DB | **Kimliksiz telemetri yazımı.** `acilis_olcumu_yaz` PUBLIC'e açık SECURITY DEFINER; aralık doğrulaması var ama hız limiti yok. Benzer: `hata_bildir`, `olay_yaz`. | Ölçüm zehirleme: K-YUK-4 "açılış 7 istek, yarısı 2,7 sn altında" metriği çarpıtılabilir; tablo şişer (`olcum_temizlik` cron'u var, o yüzden sınırsız büyüme yok). | Sunucu tarafı hız limiti (IP/kullanıcı başına saatlik kova). |

---

## 6 · Yanlış alarmlar — düzeltmeye kalkmayın

Denetim sırasında **çürütülen** iddialar. Bunlar rapora "bulgu" olarak girmemeli:

| İddia | Gerçek |
|---|---|
| "`submit_provider_identity` anon'a açık, TC kimlik no topluyor — KRİTİK" | Fonksiyonun **tüm gövdesi** `RAISE EXCEPTION 'IDENTITY_COLLECTION_DISABLED'`. Mezar taşı; hiçbir veri işlemiyor. PUBLIC EXECUTE gereksiz ama zararsız. |
| "Cüzdan para çekme talebinde çift-tık koruması yok — KRİTİK" | `WalletScreen` **erişilemez**: `App.tsx:918` `case 'WALLET'` doğrudan `Dashboard`'a düşüyor ve kodda tek bir `navigateTo('WALLET')` yok. Ayrıca `request_payout` sunucuda 206 karakterlik `PAYOUT_MANUAL` mezar taşı. Kusur gerçek ama **uyuyan**; cüzdan/çekim açılmadan önce düzeltilmeli. |
| "Kayıtlı kart silmede onay yok — KRİTİK" | Aynı ekranda, aynı sebeple **uyuyan**. |
| "8 migration canlıya uygulanmamış" | Yarattıkları 9 fonksiyonun **tamamı canlıda var** ve kod hepsini çağırıyor. Migration'lar uygulanmış, **deftere yazılmamış** (bkz. aşağıdaki gerçek bulgu). |
| "66 rezervasyon / 21.970 TL ciro sahibin defterine işlenmemiş" | 66 kaydın **tamamı demo maçlara** ait (`isDemo = true`), kaynak `APP_MATCH`. Gerçek ciro kaybı **yok**. Yapısal soru (maç kaynaklı rezervasyonlar `booking_payments` üretmediği için `credit_owner_booking_earning` tetiklenmiyor) gerçek ve lansmandan önce netleştirilmeli — ama bir para kaybı olarak raporlanmamalı. |
| "Cüzdan bakiyesinde hayalet para var" | 12 satırın **12'si** demo tohumu. Formül kusuru gerçek, üretim etkisi bugün yok. |

---

## 7 · Mekanizmanın kendisi (P-0 ihlalleri)

Projenin kendi P-0 prensibi: *"Her koruma kurulduğunda, o korumanın kendisi de denetlenir."*
Denetimin en rahatsız edici bulguları burada:

| Risk | Problem | Etki | Çözüm |
|---|---|---|---|
| **Yüksek** | **Mekanizmanın çalıştırıcı yarısı hiç yazılmamış.** `package.json` beş komut tanımlıyor (`etki`, `sistem:harita`, `sistem:kapsam`, `sistem:surum`, `sistem:zaman-deseni`) → hepsi `scripts/sistem/*.mjs`'e işaret ediyor. **Dizin yok** ve git geçmişinde **hiç var olmamış**. `npm run etki` → `MODULE_NOT_FOUND`. `scripts/godview-demo.mjs` de yok. | PRENSİPLER §9.2 "Değişiklikten önce `npm run etki` çalıştırılır; 🔴 KRİTİK taşlara dokunuluyorsa iş durur" — **bağlayıcı bir kapı ve fiilen çalıştırılamıyor**. §9.3 "Harita çürürse denetim durur" da işletilemiyor. Dokümantasyon (17 yapı taşı, 37 kontrol) gerçekle ayrışmış. | Ya beş betiği yaz, ya `package.json`'dan kaldırıp §9'u gerçeğe göre güncelle. **Yarım kurulmuş koruma, kurulmamış korumadan kötüdür** — güven veriyor, iş görmüyor. |
| **Yüksek** | **Tek kırmızı alarm 7 gündür yanıyor ve yanlış.** `sistem_saglik_kayitlari`: K-KAPI-4 KIRMIZI, 20–26 Ağustos, her gece: *"1 fonksiyonun kapısı KENDİLİĞİNDEN AÇILMIŞ: submit_provider_identity"*. O fonksiyon bir mezar taşı (bkz. §6). Alarm e-postası §11'e göre **kapalı** (Resend anahtarı yok), yani uyarı kimsenin okumadığı bir tabloya yazılıyor. | §9.5: *"Sürekli yanan uyarı, görülmeyen uyarıdır."* Operatör kırmızıyı görmezden gelmeye alışıyor; **gerçek** bir kırmızı geldiğinde fark edilmeyecek. Son 7 günde 8 KIRMIZI + 7 SARI kaydın neredeyse tamamı bu ikisi. | Mezar taşı fonksiyonu **düşür** (`DROP FUNCTION`) — §2.15/§4.7 zaten kimlik toplamayı kaldırdı. Alarm kanalını aç ya da paneldeki kırmızıyı görünür yere taşı. |
| **Yüksek** | **Migration defteri gerçeği yansıtmıyor.** Canlıda son kayıtlı göç `20260914000007`; depoda 8 göç daha var ve yarattıkları nesneler **canlıda mevcut** — yani doğrudan SQL ile uygulanmış, deftere yazılmamış. (Aynı alışkanlığı `20260916000000` göçünün kendi başlığı da itiraf ediyor: *"Kapı, deftere yazılmayan doğrudan bir SQL çalıştırmasıyla geri gelmiş."*) Depoda `scripts/regenerate-migrations-from-ledger.mjs` var — sorun daha önce de yaşanmış. | (a) Neyin dağıtıldığı defterden **okunamıyor**; tek doğruluk kaynağı canlıyı incelemek. (b) Bir sonraki `supabase db push` bu 8 göçü **bekliyor sayıp yeniden çalıştırır** — `20260916000000` üç ödeme bayrağını koşulsuz `UPDATE` ediyor, yani platform rastgele bir anda sessizce `CASH_ONLY`'ye düşer. | `supabase migration repair --status applied <version>` ile defteri gerçekle hizala. Doğrudan SQL çalıştırmayı yasakla; her değişiklik göç dosyasıyla (§7.6). CI'ya "depo göçleri = defter" kontrolü ekle. |

---

## 8 · Lansman kapısı: ödeme ekranı gerçekleşmeyen tahsilat vaat ediyor

Bu, denetimdeki en acil **bugün canlı** durum ve ayrı başlığı hak ediyor.

**Canlı yapılandırma** (`app_config`, üçü de `2026-08-24 19:19:59`'da yazılmış):

```
payment_mode_global      = "ONLINE_ONLY"
payment_provider         = "SIMULATION"
simulation_counts_as_live = true
match_deposit_enabled    = true
```

**Kullanıcının gördüğü cümleler** (`views/MatchCreate.tsx:1687`, `:530`, `:1279`):
> "Yayınladığın anda tutar kartından çekilir ve maçın güvencesi olur."
> "Kapora kartından tahsil edilir…"

**Gerçek:** `payment_provider = SIMULATION` olduğu için hiçbir kart çekilmiyor ve
**her kart numarası kabul ediliyor**.

Depoda bunu kapatmak için yazılmış bir göç var: `20260916000000_odeme_kapatildi_ve_incelemeci_kapisi_sokuldu.sql`,
başlığı *"Apple'ın 5.6 reddinden sonraki iki ağır bulguyu kapatır"*. Göçün ilk yarısı
(demo/inceleyici kapısı — `_cagiran_demo_mu`) **canlıda uygulanmış**; ikinci yarısı
(üç ödeme bayrağı) uygulanmamış, üstelik bayraklar göç yazıldıktan **sonra** ters yöne set edilmiş.

| Risk | Etki | Çözüm |
|---|---|---|
| **Kritik** | App Store 5.6 (yanıltıcı davranış) ve 2.3.1; ayrıca **yanlış beyanla kart verisi toplama**. Uygulama bugün mağazada bu haldeyse aynı ret tekrar gelir. Kullanıcı açısından: ödediğini sanıp sahaya gidiyor, tesiste ödeme kaydı yok. | **Tek bayrak yeter ve fail-safe:** `simulation_counts_as_live = false`. Doğrulandı — `resolve_payment_mode` bu değeri `false` varsayılanıyla okuyor ve `provider_live` yanlışsa tüm platformu `CASH_ONLY`'ye (`PROVIDER_NOT_LIVE`) düşürüyor; `PaymentScreen` kart adımını hiç çizmiyor ve kullanıcıya doğru cümleyi gösteriyor. Niyeti açık bırakmak için diğer iki bayrak da göçteki değerlere çekilmeli. iyzico canlıya alınırken sıra: sandbox testi → production anahtarları → bir gerçek işlem + iade → **en son** `ONLINE_ONLY`. |

---

# 🎯 HEMEN UYGULANMASI GEREKEN 3 AKSİYON

### 1. Şifre sıfırlama zincirini kapat — *kimliksiz saldırgandan admin yetkisine giden canlı yol*

İki edge function canlıda **ACTIVE ve `verify_jwt=false`**; zincir tam: tahmin edilebilir 6 haneli kod
(`Math.random`) → kırık deneme sayacı (oku-değiştir-yaz) → IP limiti yok →
`updateUserById(..., { password })` rol kısıtı olmadan → admin paneli girişi hâlâ
`signInWithPassword` → `admin_mfa_required = false`. Canlıda tek admin hesabı var.

**Ve bu özellik üründe zaten yok** (§4.7 "Şifre kavramı YOKTUR"). Silmek bedava:

```bash
supabase functions delete password-reset-request
supabase functions delete password-reset-confirm
```
```sql
DROP TABLE IF EXISTS public.password_reset_codes;
```
Ardından: destek e-postasını admin hesabından ayır; `admin-owner-credentials`'ın
`set_password` aksiyonu için taze-oturum şartı ekle.
**Süre: ~15 dakika. Risk azalması: en yüksek.**

---

### 2. `simulation_counts_as_live = false` — *ödeme ekranı olmayan bir tahsilatı vaat ediyor*

Bugün canlı: `ONLINE_ONLY` + `SIMULATION` + `sayılsın=true` → ekran "kartından çekilecek"
diyor, hiçbir kart çekilmiyor, her kart kabul ediliyor. Apple'ın 5.6 reddinin birebir sebebi;
düzeltme göçü yazılmış ama uygulanmamış.

```sql
UPDATE public.app_config SET value = 'false'::jsonb WHERE key = 'simulation_counts_as_live';
UPDATE public.app_config SET value = 'false'::jsonb WHERE key = 'match_deposit_enabled';
UPDATE public.app_config SET value = '"CASH_ONLY"'::jsonb WHERE key = 'payment_mode_global';
```

Fail-safe doğrulandı: `resolve_payment_mode` tüm platformu `CASH_ONLY`'ye düşürür, kart adımı
hiç çizilmez. Aynı işlemde **migration defterini de hizalayın** (§7) — aksi halde bir sonraki
`db push` bu bayrakları rastgele bir anda kendiliğinden değiştirir.
**Süre: ~10 dakika (+ defter hizalama ~30 dk).**

---

### 3. Geri döndürülemez veri kaybı yüzeyini kapat — *silme yetkileri + geri yüklenemez yedek*

İki kusur birlikte "kaybedersek geri getiremeyiz" anlamına geliyor:

**(a) Mali kayıt silinebiliyor.** `anon` ve `authenticated` rollerinde altı para tablosunda
DELETE + TRUNCATE yetkisi var; saha silme politikası izin veriyor ve zincir baştan sona CASCADE.

```sql
REVOKE DELETE, TRUNCATE ON public.pitches, public.courts, public.pitch_bookings,
       public.booking_payments, public.payment_intents, public.wallet_transactions
  FROM anon, authenticated;

ALTER TABLE public.booking_payments DROP CONSTRAINT booking_payments_booking_id_fkey,
  ADD CONSTRAINT booking_payments_booking_id_fkey FOREIGN KEY (booking_id)
  REFERENCES public.pitch_bookings(id) ON DELETE RESTRICT;

ALTER TABLE public.payment_intents DROP CONSTRAINT payment_intents_booking_id_fkey,
  ADD CONSTRAINT payment_intents_booking_id_fkey FOREIGN KEY (booking_id)
  REFERENCES public.pitch_bookings(id) ON DELETE RESTRICT;
```

**(b) Yedek geri yüklenemez.** 126 tablodan 10'u, aynı veritabanında, 7 gün; ve yedeklenen
tablolar yedeklenmeyen ebeveynlere bağlı (`courts`, `pitch_subscriptions`, `auth.users`).
K-YEDEK-1 bunu göremiyor çünkü yedeği kendi kapsam listesine göre doğruluyor.

→ `yedek.kapsam`'ı referans-kapalı yap, yedeği veritabanı **dışına** çıkar, kontrolü
"her FK ebeveyni kapsamda mı" sorusuna göre yeniden yaz, bir geri alma provası yap.
**Süre: (a) ~1 saat · (b) ~yarım gün.**

---

## Hemen ardından sıradakiler

| Sıra | İş | Neden |
|---|---|---|
| 4 | `apply_booking_payment`'a `INVALID_STATE` kapısı | Tek satır, iade edilmiş parayı "ödenmiş" saymayı engelliyor |
| 5 | `config.toml`'a 7 `verify_jwt=false` bloğu | Tek bir CI deploy'u tüm para yolunu kesebilir |
| 6 | Idempotency indeksini durum kümesiyle hizala | 9 zehirli anahtar bugün var; kullanıcı "tekrar dene"de hata alıyor |
| 7 | Kör VOID + `MATCH_DEPOSIT` süpürücü filtresi + 3DS başarısızlık doğrulaması | iyzico canlıya alınmadan **önce** — gerçek para kaybı yolu |
| 8 | `submitGuard`'ı `MatchCreate`/`MatchJoin`'e bağla | Altyapı yazılmış, birkaç satır; iki kritik akıştaki kilitlenmeyi bitiriyor |
| 9 | `loading → error → empty` sırası (4 ekran) | Kullanıcıya "verin silindi" dedirten en ucuz kusur |
| 10 | `useBackDismiss` kaydı (12+30 modal) | Modal başına tek satır |

---

## Not — bu denetimin sınırları

- Tüm veritabanı erişimi **salt-okunur**du; hiçbir yazma/DDL çalıştırılmadı (§10.3).
- Gerçek cihaz testi yapılmadı: klavye/alt navigasyon çakışması ve iOS'ta
  `visibilitychange` güvenilirliği **DOĞRULANMADI** olarak işaretlendi.
- Saha silme davranışı, veriyi değiştirmemek için gerçek `DELETE` denenmeden
  FK tanımları ve satır sayımları üzerinden çıkarıldı.
- `npm run lint` / `npm run test:unit` bu denetimde çalıştırılmadı — kod değişikliği yapılmadı;
  §8.4 bir sonraki düzeltme paketinde geçerlidir. §8.5 hatırlatması geçerliliğini koruyor.
