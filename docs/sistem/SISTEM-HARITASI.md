# OYNA — SİSTEM HARİTASI

> ⚙️ **BU DOSYA ELLE DÜZENLENMEZ.** `docs/sistem/YAPI-TASLARI.json` ve
> `docs/sistem/KONTROLLER.json` dosyalarından üretilir.
> Değişiklik için o dosyaları düzenleyip `npm run sistem:harita` çalıştırın.

> Kayıt sürümü: 1 · Son güncelleme: 2026-08-03 (P-0, P-1, P-2 tamamlandi; CTO 5/5 P0 kapali)

## Bu harita ne işe yarar?

Sistemde bir şey değiştirdiğimizde, o değişikliğin **hangi temel yapı taşlarına**
dokunduğunu görmek için. Şunu yazmanız yeterli:

```
npm run etki
```

Araç, değiştirdiğiniz dosyalara bakar ve size şunları söyler: hangi yapı taşlarına
dokunuldu, o taşlar neyi garanti ediyor, hangi kontrollerin çalıştırılması zorunlu,
ve o taşlarda **zaten açık olan** bulgular neler.

## Risk seviyeleri

| Seviye | Anlamı |
|---|---|
| 🔴 KRİTİK | Yanlış giderse para kaybolur, kimlik ele geçer veya veri sızar. Değişiklik CEO onayı ister. |
| 🟠 YÜKSEK | Yanlış giderse kullanıcı zarar görür ve geri alması zordur. Değişiklik tam doğrulama ister. |
| 🟡 ORTA | Yanlış giderse deneyim bozulur, düzeltilebilir. |
| ⚪ DÜŞÜK | Yanlış giderse yalnız iç araçlar etkilenir. |

## Özet tablo

| # | Yapı taşı | Risk | Ne olduğu |
|---|---|---|---|
| B01 | **PARA** | 🔴 KRİTİK | Kullanıcıdan para almak, cüzdanda tutmak, saha sahibine ve hakem/kaleciye ödemek, iade etmek. Komisyon hesabı da buraya dahil. |
| B02 | **KADRO** | 🟠 YÜKSEK | Bir maçta kimin oynadığı. Slot alma, bırakma, devretme, yedek listesi, takım kadrosu. |
| B03 | **ZAMAN** | 🟠 YÜKSEK | Bir maçın ne zaman olduğu. Saat, tarih, süre, saat dilimi, geri sayım. |
| B04 | **REZERVASYON** | 🟠 YÜKSEK | Sahanın hangi saatinin kime ayrıldığı. Kort, tarife, abonman, saha sahibinin elle kapattığı slotlar. |
| B05 | **KAPILAR** | 🔴 KRİTİK | Kimin neyi görebileceği ve değiştirebileceği. Satır kuralları (RLS), sütun izinleri, fonksiyon yetkileri, koruyucu tetikleyiciler. |
| B06 | **BILDIRIM** | 🟠 YÜKSEK | Kullanıcıya haber vermek. Uygulama içi bildirim, telefon bildirimi (push), e-posta. |
| B07 | **KAPSAMA** | 🟡 ORTA | Nerede hizmet verdiğimiz. İl/ilçe kapsama alanları, harita, mesafe hesabı, yakındaki maç ve saha bulma. |
| B08 | **KIMLIK** | 🔴 KRİTİK | Kim olduğun. Giriş, kayıt, roller, admin yetkisi, hesap silme, veli onayı, KVKK. |
| B09 | **YUK** | 🟡 ORTA | Sistemin kaç kişiyi kaldırabildiği. Sorgu boyutları, canlı abonelikler, önbellek, uygulama paketi boyutu, görseller. |
| B10 | **OTOMASYON** | 🟠 YÜKSEK | Kimse dokunmadan kendi kendine çalışan işler. Zamanlanmış görevler (cron), maç kapanışı, hatırlatmalar, temizlik işleri. |
| B11 | **AYARLAR** | 🔴 KRİTİK | Sistemin davranışını belirleyen anahtarlar. Veritabanı ayarları, ortam değişkenleri, özellik bayrakları, acil durdurma anahtarları. Kod doğru olsa bile bunlardan biri eksikse sistem sessizce çalışmaz. |
| B12 | **DEMO** | ⚪ DÜŞÜK | Tanıtım ve deneme verileri. Boş ekran görünmesin diye duran sahte maçlar, sahalar, hesaplar. |
| B13 | **SAHA-SAHIBI** | 🟠 YÜKSEK | Saha sahibinin paneli. Tesis bilgileri, kortlar, fotoğraflar, personel, takvim, finans raporu, tahsilat, abonman, özel fiyat, kampanya. |
| B14 | **PAZARYERI** | 🟠 YÜKSEK | Kaleci ve hakem kiralama. Başvuru, profil, talep, teklif, teminat, hizmet ödemesi. |
| B15 | **SOSYAL** | 🟡 ORTA | Arkadaşlar, takımlar, sohbet, davetler, taktik tahtası. |

---

## B01 · PARA  🔴 KRİTİK

Kullanıcıdan para almak, cüzdanda tutmak, saha sahibine ve hakem/kaleciye ödemek, iade etmek. Komisyon hesabı da buraya dahil.

**Bu taşın garanti ettiği:**
- Cüzdan bakiyesi asla eksiye düşmez
- Alınan her kuruşun bir karşılığı vardır (8 para değişmezi)
- Aynı ödeme iki kez tahsil edilmez
- Yarıda kalan ödeme sonsuza dek askıda kalmaz

**Dosyalar:**

```
services/paymentService.ts
services/walletService.ts
services/financeService.ts
services/paymentModeService.ts
components/payment/
views/PaymentScreen.tsx
views/WalletView.tsx
views/owner/finance/
views/owner/calendar/FinancialCalendarView.tsx
views/owner/OwnerBankAccountsModal.tsx
supabase/functions/create-payment/
supabase/functions/capture-payment/
supabase/functions/void-payment/
supabase/functions/refund-payment/
supabase/functions/payment-webhook/
supabase/functions/iyzico-3ds-callback/
supabase/functions/sweep-stale-payments/
utils/formatTRY.ts
utils/iban.ts
```

**Veritabanı nesneleri:** `payment_intents`, `wallet_transactions`, `commission_config`, `apply_card_payment`, `player_buy_slots_v2`, `player_buy_slots_v2__inner`, `record_app_deposit_payment`, `process_tiered_refund`, `match_block_deposit`, `calculate_commission`, `_pitch_agreement`, `_markup_tutari`, `check_money_invariants`, `release_owner_earnings`, `auto_release_service_payouts`, `mark_intent_failed`, `list_stale_payment_intents`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-PARA-1` | Sistemdeki toplam para giriş-çıkışı tutuyor mu, 8 kural birden sınanır. | Para yavaşça kaçıyor ama kimse toplamı kontrol etmiyor | HER_IKISI |
| `K-PARA-2` | Başlayıp bitmemiş ödeme kaç tane ve en eskisi kaç saatlik? | Süpürücü çalışmıyor ama kimse fark etmiyor | GUNLUK |
| `K-PARA-3` | %30 kuralı yalnız telefonda mı duruyor, yoksa veritabanı da reddediyor mu? | Kural yalnız istemcide; sunucu her tutarı kabul ediyor | DEGISIKLIKTE |
| `K-KILIT-1` | İki fonksiyon aynı tabloları ters sırada kilitlerse sistem kilitlenir. Sıra tutarlı mı? | Kilitlenme yalnız yoğun anda oluşur, testte hiç görünmez | HER_IKISI |

> **Not:** CTO'nun 5 P0'inin tamami kapatildi (3 Agustos 2026). CTO-P0-4 DUZELTMESI: 'match_block_deposit keyfi tutarla acik' iddiasi FAZLA IDDIALIYDI - fonksiyonda 'yalniz maci kuran kaptan' kapisi ZATEN vardi. Fiyat oranli taban eklemeyi denedim ama canli veri durdurdu: matches.price SLOT BASINA fiyat, bloke tutarlar fiyatin %285-500'u. Yanlis varsayimla taban koymak akisi bozardi. Tutar zaten kaptanin KENDI cuzdanindan dusuyor ve deposit_status<>'NONE' tekrari engelliyor - gercek bir acik yok.

---

## B02 · KADRO  🟠 YÜKSEK

Bir maçta kimin oynadığı. Slot alma, bırakma, devretme, yedek listesi, takım kadrosu.

**Bu taşın garanti ettiği:**
- Bir slotu aynı anda iki kişi alamaz
- 'Kim bu maçta' sorusunun tek bir doğru cevabı vardır
- Maçtan ayrılan kişi listelerde kalmaz

**Dosyalar:**

```
services/matchService.ts
services/matchLifecycleService.ts
services/rahatMatchService.ts
hooks/useMyMatches.ts
hooks/useMyAgenda.ts
views/MatchJoin.tsx
views/RahatMatchLobby.tsx
components/match/
utils/matchPositions.ts
utils/formations.ts
```

**Veritabanı nesneleri:** `matches.slots`, `matches.awaySlots`, `match_participants`, `player_release_slot`, `player_unassign_slot`, `player_self_assign`, `match_kick_player`, `_match_participant_ids`, `_match_player_counts`, `match_fill_stats`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-KADRO-1` | Maçın içindeki liste ile katılımcı tablosu aynı kişileri mi gösteriyor? (demo hariç) | İki kaynak sessizce ayrışıyor; hangisinin doğru olduğu belirsizleşiyor | HER_IKISI |
| `K-KADRO-2` | Yeni bir fonksiyon yalnız listeye yazıp tabloyu unutmuş mu? | Yeni kod eski sözleşmeyi bilmiyor | DEGISIKLIKTE |

> **Not:** P-2a (3 Agustos 2026): M-P0-4 ESASLI SEKILDE DUZELTILDI. Iddia edilen '12/20 macta kadro sapmasi' ve 'ayrilan kisiye bildirim gidiyor' YANLISTI. Gercek: role sutunu TARAF tutuyor (home/away), status creator/confirmed/LEFT tutuyor (ayrilanlar isaretleniyor), _match_participant_ids TABLOYA DEGIL JSON'a bakiyor. Iki kaynak celismiyor, farkli seyler tutuyor. GERCEK ACIK daha dardi ama ciddiydi: _match_participant_ids slotu SATIN ALMIS ama kimseyi oturtmamis kisiyi dondurmuyordu -> mac iptalinde parayi odeyen kisiye HIC bildirim gitmiyordu (K-3.3 tehdit altindaydi). Duzeltildi: OTURANLAR birlesim SATIN ALANLAR. Ayrica role/status sozluk kisitlari eklendi.

---

## B03 · ZAMAN  🟠 YÜKSEK

Bir maçın ne zaman olduğu. Saat, tarih, süre, saat dilimi, geri sayım.

**Bu taşın garanti ettiği:**
- Ekranda görünen saat ile gerçek saat aynıdır
- Saat dilimi her zaman Europe/Istanbul'dur (K-10.7)
- starts_at tek doğru kaynaktır; metin saat ondan türetilir (K-10.6)

**Dosyalar:**

```
utils/matchDateTime.ts
utils/discoveryDays.ts
hooks/useCountdown.ts
services/availabilityService.ts
services/facilitySchedule.ts
```

**Veritabanı nesneleri:** `matches.starts_at`, `matches.date`, `matches.time`, `matches.duration_minutes`, `player_create_match`, `create_match_atomic`, `trg_matches_sync_time_and_score_status`, `get_facility_schedule`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-ZAMAN-1` | Ekranda yazan saat ile gerçek saat birebir aynı mı? | Saat kayması hata vermez, sadece yanlış sonuç üretir | HER_IKISI |
| `K-ZAMAN-2` | Veritabanını sıfırdan kurunca saatleri kaydıracak eski yazım repoda duruyor mu? | Canlı doğru olduğu için kimse repoyu kontrol etmiyor | HER_IKISI |

> **Not:** P-1'de (3 Agustos 2026) zaman TEK KAYNAK haline getirildi: trg_a_matches_zaman_normalize tetikleyicisi date+time <-> starts_at cift yonlu normalizasyonu Europe/Istanbul ile yapar. Artik HANGI fonksiyon yazarsa yazsin sapma olusamaz. KALINTI: player_create_match, admin_create_match__core ve admin_update_match__core kaynak kodlarinda hala riskli deseni tasiyor (npm run sistem:zaman-deseni ile gorulur) - tetikleyici bunlari etkisiz kildigi icin zarar veremezler, ama ileride temizlenmeli.

---

## B04 · REZERVASYON  🟠 YÜKSEK

Sahanın hangi saatinin kime ayrıldığı. Kort, tarife, abonman, saha sahibinin elle kapattığı slotlar.

**Bu taşın garanti ettiği:**
- Aynı korta aynı saate iki rezervasyon yapılamaz (veritabanı kısıtıyla)
- İptal edilen rezervasyon saati serbest bırakır
- Tarifesi olmayan saat satılamaz

**Dosyalar:**

```
services/pitchBookingService.ts
services/playerBookingService.ts
services/tariffService.ts
services/availabilityService.ts
hooks/usePitchAvailability.ts
views/PitchDiscovery.tsx
```

**Veritabanı nesneleri:** `pitch_bookings`, `pitch_bookings_no_overlap`, `courts`, `pitch_tariffs`, `pitch_slot_holds`, `create_pitch_booking`, `owner_cancel_confirmed_booking`, `auto_approve_bookings`, `get_showcase_availability`, `materialize_subscriptions`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-REZ-1` | Aynı korta aynı saate iki rezervasyonu engelleyen veritabanı kuralı duruyor mu? | Bir migration kısıtı düşürür, kimse fark etmez | HER_IKISI |
| `K-REZ-2` | Saha sahibi rezervasyonu iptal edince maç da iptal oluyor mu? | Rezervasyon iptal, maç ayakta — iki tablo birbirinden habersiz | DEGISIKLIKTE |

**⚠️ Bu taşta şu an açık olan bulgular:** M-10, Y-6

---

## B05 · KAPILAR  🔴 KRİTİK

Kimin neyi görebileceği ve değiştirebileceği. Satır kuralları (RLS), sütun izinleri, fonksiyon yetkileri, koruyucu tetikleyiciler.

**Bu taşın garanti ettiği:**
- Kullanıcı başkasının verisini okuyamaz/yazamaz
- Kullanıcı kendi rolünü, bakiyesini, cezasını değiştiremez
- Her SECURITY DEFINER fonksiyonun görünür bir yetki kontrolü vardır

**Dosyalar:**

```
supabaseAuth.ts
supabaseClient.ts
scripts/generate-rls-policy.ts
```

**Veritabanı nesneleri:** `pg_policies`, `protect_profile_columns`, `protect_profile_sensitive_fields`, `require_admin_role`, `require_admin_write`, `can_staff_pitch`, `notifications_insert_own_sender`, `matches_update`, `matches_select_public`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-KAPI-1` | Kullanıcının çağırabildiği fonksiyonlardan kaçında 'sen kimsin' kontrolü yok? | Fonksiyon çalışıyor ama kimin çağırdığına bakmıyor | HER_IKISI |
| `K-KAPI-2` | Kullanıcı kendi rolünü, bakiyesini veya cezasını değiştirebiliyor mu? | Koruma bir tabloda var, yeni tabloda unutulmuş | HER_IKISI |
| `K-KAPI-3` | Yetkili çalışan fonksiyonlar kandırılmaya açık mı? | Tek bir yeni fonksiyon kuralı bozar | HER_IKISI |

---

## B06 · BILDIRIM  🟠 YÜKSEK

Kullanıcıya haber vermek. Uygulama içi bildirim, telefon bildirimi (push), e-posta.

**Bu taşın garanti ettiği:**
- Gönderilmesi gereken her bildirim gerçekten gider
- Gitmeyen bildirim sessiz kalmaz, sayılır ve raporlanır
- Kullanıcı başkası adına bildirim yollayamaz

**Dosyalar:**

```
notifications/
services/notificationService.ts
supabase/functions/send-push/
supabase/functions/send-email/
supabase/functions/admin-broadcast/
```

**Veritabanı nesneleri:** `notifications`, `notify_send_push_webhook`, `send_match_reminders`, `admin_broadcast_notification`, `net._http_response`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-BILDIRIM-1` | Son 24 saatte gönderilmeye çalışılan bildirimlerin kaçı gerçekten gitti? | Bildirim gitmiyor ama uygulama 'gönderdim' sanıyor | GUNLUK |
| `K-BILDIRIM-2` | Son 24 saatte biten/iptal olan maçların hepsi katılımcılarına haber verdi mi? | Olay oldu, bildirim üretilmedi, hata da yok | GUNLUK |

**⚠️ Bu taşta şu an açık olan bulgular:** M-16

---

## B07 · KAPSAMA  🟡 ORTA

Nerede hizmet verdiğimiz. İl/ilçe kapsama alanları, harita, mesafe hesabı, yakındaki maç ve saha bulma.

**Bu taşın garanti ettiği:**
- Kapsama dışı bir yere maç/saha gösterilmez
- Mesafe hesabı doğrudur ve indeksten yararlanır

**Dosyalar:**

```
services/regionCoverageService.ts
services/locationService.ts
services/geocodingService.ts
components/map/
components/location/
utils/geo.ts
utils/regionResolver.ts
utils/orduData.ts
views/MatchDiscovery.tsx
```

**Veritabanı nesneleri:** `region_coverage`, `pitches_geo_idx`, `get_nearby_matches`, `get_nearby_pitches`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-KAPSAMA-1` | Yakındaki sahaları bulan sorgu tüm tabloyu mu tarıyor? | Küçük veride hızlı, büyük veride çöküyor | DEGISIKLIKTE |

**⚠️ Bu taşta şu an açık olan bulgular:** M-11, M-12, Y-9

---

## B08 · KIMLIK  🔴 KRİTİK

Kim olduğun. Giriş, kayıt, roller, admin yetkisi, hesap silme, veli onayı, KVKK.

**Bu taşın garanti ettiği:**
- Kullanıcı kendi rolünü yükseltemez
- Parası askıda olan kullanıcı hesabını silemez
- Silinen hesabın verisi kurallara uygun temizlenir

**Dosyalar:**

```
supabaseAuth.ts
services/userService.ts
services/consentService.ts
services/guardianService.ts
views/AuthScreen.tsx
views/ProfileScreen.tsx
components/profile/
```

**Veritabanı nesneleri:** `profiles`, `_account_deletion_status`, `admin_process_account_deletion__core`, `process_expired_account_deletions`, `sync_admin_flags_trigger`, `trg_protect_profile_columns`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-KIMLIK-1` | Silme engeli, sistemin gerçekten kullandığı kelimeleri mi arıyor? | Kapı var, çalışıyor görünüyor, hiç tetiklenmiyor | HER_IKISI |
| `K-KAPI-2` | Kullanıcı kendi rolünü, bakiyesini veya cezasını değiştirebiliyor mu? | Koruma bir tabloda var, yeni tabloda unutulmuş | HER_IKISI |

**⚠️ Bu taşta şu an açık olan bulgular:** M-P0-5

---

## B09 · YUK  🟡 ORTA

Sistemin kaç kişiyi kaldırabildiği. Sorgu boyutları, canlı abonelikler, önbellek, uygulama paketi boyutu, görseller.

**Bu taşın garanti ettiği:**
- Açılışta inen veri sınırlıdır ve maç sayısıyla büyümez
- Canlı abonelikler filtrelidir
- Aylık plan kotaları aşılmaz

**Dosyalar:**

```
store.ts
supabaseMutations.ts
vite.config.ts
services/dashboardCountsService.ts
hooks/useDashboardCounts.ts
components/common/VirtualList.tsx
utils/imageCompression.ts
utils/imageTransform.ts
services/pitchMediaService.ts
```

**Veritabanı nesneleri:** `supabase_realtime`, `pg_matviews`, `admin_dashboard_stats`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-YUK-1` | Tablonun tamamını indiren bir sorgu eklenmiş mi? | Az veriyle sorunsuz, çok veriyle kotayı patlatıyor | HER_IKISI |
| `K-YUK-2` | Bir tablonun tüm değişikliklerini herkese gönderen abonelik var mı? | Tek kullanıcıda görünmez, 500 kullanıcıda kotayı 3'e katlar | HER_IKISI |
| `K-YUK-3` | Uygulama ilk açıldığında inen dosya boyutu kabul edilebilir mi? | Her yeni kütüphane biraz ekler, kimse toplamı ölçmez | DEGISIKLIKTE |

**⚠️ Bu taşta şu an açık olan bulgular:** M-P0-6, M-P0-7, M-P0-9, M-17, M-18, M-19, M-20

---

## B10 · OTOMASYON  🟠 YÜKSEK

Kimse dokunmadan kendi kendine çalışan işler. Zamanlanmış görevler (cron), maç kapanışı, hatırlatmalar, temizlik işleri.

**Bu taşın garanti ettiği:**
- Zamanlanmış her iş gerçekten çalışır ve sonucu kaydedilir
- Başarısız iş sonsuza dek tekrarlanmaz; 3 denemeden sonra insana sorar (K-10.5)
- Hata asla sessizce yutulmaz

**Dosyalar:**

```
supabase/functions/auto-cancel-matches/
supabase/functions/sweep-stale-payments/
services/matchLifecycleService.ts
```

**Veritabanı nesneleri:** `cron.job`, `auto_process_matches`, `auto_finalize_matches`, `process_match_at_deadline`, `expire_service_requests`, `expire_stale_waitlists`, `release_owner_earnings`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-OTO-1` | Olması gereken cron işlerinin hepsi canlıda var mı? | Migration 'kuramadım' diye uyarı yazdı, kimse okumadı | HER_IKISI |
| `K-OTO-2` | Defalarca denenip hep başarısız olan maç/iş var mı? | Hata yutuluyor, iş sonsuza dek tekrarlanıyor | GUNLUK |

**⚠️ Bu taşta şu an açık olan bulgular:** M-15, M-16

---

## B11 · AYARLAR  🔴 KRİTİK

Sistemin davranışını belirleyen anahtarlar. Veritabanı ayarları, ortam değişkenleri, özellik bayrakları, acil durdurma anahtarları. Kod doğru olsa bile bunlardan biri eksikse sistem sessizce çalışmaz.

**Bu taşın garanti ettiği:**
- Sistemin ihtiyaç duyduğu her ayarın dolu olduğu sürekli kontrol edilir
- Eksik ayar sessiz kalmaz — kurulum sırasında ve her gün raporlanır
- Panelde görünen her ayarın kodda gerçekten bir karşılığı vardır

**Dosyalar:**

```
supabaseClient.ts
capacitor.config.ts
vercel.json
.env.example
```

**Veritabanı nesneleri:** `app_config`, `app.settings.functions_base_url`, `app.settings.webhook_secret`, `sweeper_enabled`, `push_live_enabled`, `demo_mode_enabled`, `payment_provider`, `is_feature_enabled`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-AYAR-1` | Sistemin çalışması için gereken ayarlardan boş kalan var mı? (3 Ağustos 2026'daki iki büyük arızanın tek kök nedeni buydu) | Kod kusursuz, ayar boş, sistem sessizce hiçbir şey yapmıyor | HER_IKISI |
| `K-AYAR-2` | Panelden açıp kapattığın bir düğme gerçekten bir şey yapıyor mu? | Düğmeye basıyorsun, hiçbir şey olmuyor, hata da yok | HER_IKISI |
| `K-AYAR-3` | Bir migration 'ayar eksik, kurmadım' deyip devam etmiş mi? | Migration BAŞARILI göründü ama işini yapmadı | HER_IKISI |

**⚠️ Bu taşta şu an açık olan bulgular:** CTO-P1-ozellik-bayraklari

> **Not:** Bu yapı taşı 3 Ağustos 2026'da doğdu: sweeper cron'unun kurulmaması ve 18/18 push hatasının TEK kök nedeni bu kutudaki iki boş ayardı. Hiçbir yapı taşı bu alana sahip çıkmıyordu.

---

## B12 · DEMO  ⚪ DÜŞÜK

Tanıtım ve deneme verileri. Boş ekran görünmesin diye duran sahte maçlar, sahalar, hesaplar.

**Bu taşın garanti ettiği:**
- Demo veri gerçek veriyle karışmaz
- Demo veri denetim raporlarını kirletmez (K-10.8)
- Demo veri gerçek sistemin kurallarına uyar

**Dosyalar:**

```
services/ownerDemoService.ts
scripts/owner-demo.mjs
scripts/seeds/
```

**Veritabanı nesneleri:** `matches.isDemo`, `demo_mode_enabled`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-DEMO-1` | Demo satırları gerçek sistemin kurallarına uyuyor mu, denetimi kirletiyor mu? | Demo veri gerçeği yanlış temsil ediyor, denemeler yanıltıyor | GUNLUK |

**⚠️ Bu taşta şu an açık olan bulgular:** M-P0-4, M-P0-5

---

## B13 · SAHA-SAHIBI  🟠 YÜKSEK

Saha sahibinin paneli. Tesis bilgileri, kortlar, fotoğraflar, personel, takvim, finans raporu, tahsilat, abonman, özel fiyat, kampanya.

**Bu taşın garanti ettiği:**
- Saha sahibi yalnız kendi tesisini yönetebilir
- Elle kapatılan slotun komisyon alacağı kaydedilir (K-2.3)
- Panelde gösterilen her tutar canlı veriyle birebir aynıdır
- İnternet kesildiğinde yapılan işlem kaybolmaz (outbox)

**Dosyalar:**

```
services/pitchOwnerService.ts
services/pitchContentService.ts
services/pitchShowcaseService.ts
services/ownerAccountService.ts
services/staffService.ts
services/demandService.ts
services/pitchFilterService.ts
services/pitchFavoritesService.ts
services/onboardingService.ts
services/offline/
components/pitch-editor/
components/pitch-showcase/
views/OwnerPanel.tsx
views/owner/
hooks/useOwnerEntitlements.ts
supabase/functions/admin-owner-credentials/
```

**Veritabanı nesneleri:** `pitches`, `pitch_staff`, `can_staff_pitch`, `get_facility_schedule`, `owner_cancel_confirmed_booking`, `release_owner_earnings`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-KAPI-1` | Kullanıcının çağırabildiği fonksiyonlardan kaçında 'sen kimsin' kontrolü yok? | Fonksiyon çalışıyor ama kimin çağırdığına bakmıyor | HER_IKISI |
| `K-SAHIBI-1` | Bir saha sahibi, başka bir tesisin takvimini, finansını veya personelini görebiliyor mu? | Tek tesisle test edilir, sorun ancak ikinci tesis gelince görünür | HER_IKISI |
| `K-SAHIBI-2` | Saha sahibinin finans ekranındaki rakamlar ile veritabanındaki gerçek toplamlar birebir tutuyor mu? | Panel bir rakam gösteriyor, gerçek başka — kimse iki tarafı karşılaştırmıyor | GUNLUK |

**⚠️ Bu taşta şu an açık olan bulgular:** Y-7, Y-10

> **Not:** Risk 3 Ağustos 2026'da ORTA'dan YÜKSEK'e çıkarıldı (K-11.2). Kurucu direktifi: saha sahibi ekranları 'inanılmaz bir özeni hak ediyor'. Gerekçe mimari olarak da doğru: bu panel gelirin toplandığı operatör yüzeyidir ve `views/owner/` altında 52 dosya taşır — kod tabanının en büyük tek alt ağacı.

---

## B14 · PAZARYERI  🟠 YÜKSEK

Kaleci ve hakem kiralama. Başvuru, profil, talep, teklif, teminat, hizmet ödemesi.

**Bu taşın garanti ettiği:**
- Hizmet ödemesi maç gerçekleşmeden serbest bırakılmaz
- Teminat kuralları uygulanır (K-5.1)
- Sağlayıcı yalnız kendi talep ve kazançlarını görür
- Süresi geçen talep askıda kalmaz

**Dosyalar:**

```
services/serviceProviderService.ts
services/serviceRequestService.ts
services/serviceOfferService.ts
components/Marketplace/
views/Marketplace.tsx
views/ServiceDashboard.tsx
views/ServiceApplication.tsx
views/ServiceProfile.tsx
views/ServiceSettings.tsx
```

**Veritabanı nesneleri:** `service_requests`, `admin_fetch_goalkeepers`, `admin_fetch_referees`, `expire_service_requests`, `auto_release_service_payouts`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-PARA-2` | Başlayıp bitmemiş ödeme kaç tane ve en eskisi kaç saatlik? | Süpürücü çalışmıyor ama kimse fark etmiyor | GUNLUK |
| `K-KAPI-1` | Kullanıcının çağırabildiği fonksiyonlardan kaçında 'sen kimsin' kontrolü yok? | Fonksiyon çalışıyor ama kimin çağırdığına bakmıyor | HER_IKISI |
| `K-PAZAR-1` | Kaleci/hakem ücreti, maç gerçekleşmeden ödenmiş mi? | Ödeme gitti, hizmet verilmedi — geri almak imkânsız | GUNLUK |

> **Not:** Risk 3 Ağustos 2026'da ORTA'dan YÜKSEK'e çıkarıldı (K-11.2). Gerekçe mimari olarak da doğru: K-5.1 gereği burada teminat ve online ödeme var — yani bu taş gerçek para taşıyor.

---

## B15 · SOSYAL  🟡 ORTA

Arkadaşlar, takımlar, sohbet, davetler, taktik tahtası.

**Bu taşın garanti ettiği:**
- Kullanıcı yalnız kendi sohbetlerini görür
- Süresi geçen davetler temizlenir

**Dosyalar:**

```
services/socialService.ts
services/friendService.ts
services/teamService.ts
services/teamChatService.ts
services/teamAdminService.ts
services/teamSocialService.ts
services/tacticSocialService.ts
services/messageService.ts
services/contactsService.ts
components/social/
views/SocialView.tsx
views/MessagesView.tsx
views/Studio.tsx
```

**Veritabanı nesneleri:** `friendships`, `teams`, `team_invites`, `match_list_invites`, `get_friends`

**Bu taşı koruyan kontroller:**

| Kontrol | Ne sorar | Yakaladığı sessizlik | Ne zaman |
|---|---|---|---|
| `K-KAPI-1` | Kullanıcının çağırabildiği fonksiyonlardan kaçında 'sen kimsin' kontrolü yok? | Fonksiyon çalışıyor ama kimin çağırdığına bakmıyor | HER_IKISI |

**⚠️ Bu taşta şu an açık olan bulgular:** M-21

---

## Kontrol kataloğu (tümü)

| Kontrol | Ne sorar | Başarı ölçütü | Ne zaman |
|---|---|---|---|
| `K-PARA-1` **Para değişmezleri yeşil mi?** | Sistemdeki toplam para giriş-çıkışı tutuyor mu, 8 kural birden sınanır. | ok = true | HER_IKISI |
| `K-PARA-2` **Askıda ödeme var mı?** | Başlayıp bitmemiş ödeme kaç tane ve en eskisi kaç saatlik? | adet = 0 | GUNLUK |
| `K-PARA-3` **Kapora alt sınırı sunucuda zorlanıyor mu?** | %30 kuralı yalnız telefonda mı duruyor, yoksa veritabanı da reddediyor mu? | taban_var = true | DEGISIKLIKTE |
| `K-KILIT-1` **Para fonksiyonları aynı kilit sırasını mı kullanıyor?** | İki fonksiyon aynı tabloları ters sırada kilitlerse sistem kilitlenir. Sıra tutarlı mı? | ters sıralı çift = 0 | HER_IKISI |
| `K-KADRO-1` **Kadronun iki kaynağı uyuşuyor mu?** | Maçın içindeki liste ile katılımcı tablosu aynı kişileri mi gösteriyor? (demo hariç) | sapan maç sayısı = 0 | HER_IKISI |
| `K-KADRO-2` **Kadroya yazan her fonksiyon iki kaynağa da yazıyor mu?** | Yeni bir fonksiyon yalnız listeye yazıp tabloyu unutmuş mu? | tek kaynağa yazan fonksiyon = 0 | DEGISIKLIKTE |
| `K-ZAMAN-1` **Maç saatleri tutarlı mı?** | Ekranda yazan saat ile gerçek saat birebir aynı mı? | sapan maç sayısı = 0 | HER_IKISI |
| `K-ZAMAN-2` **Repoda riskli saat deseni var mı?** | Veritabanını sıfırdan kurunca saatleri kaydıracak eski yazım repoda duruyor mu? | riskli desen = 0 | HER_IKISI |
| `K-REZ-1` **Çifte rezervasyon kısıtı yerinde mi?** | Aynı korta aynı saate iki rezervasyonu engelleyen veritabanı kuralı duruyor mu? | var = 1 | HER_IKISI |
| `K-REZ-2` **İptal edilen rezervasyon maça yansıyor mu?** | Saha sahibi rezervasyonu iptal edince maç da iptal oluyor mu? | kopuk zincir = 0 | DEGISIKLIKTE |
| `K-KAPI-1` **Yetki kontrolü görünmeyen fonksiyon var mı?** | Kullanıcının çağırabildiği fonksiyonlardan kaçında 'sen kimsin' kontrolü yok? | kapısız YAZAN fonksiyon = 0 | HER_IKISI |
| `K-KAPI-2` **Hassas sütunlar korunuyor mu?** | Kullanıcı kendi rolünü, bakiyesini veya cezasını değiştirebiliyor mu? | korumasız hassas sütun = 0 | HER_IKISI |
| `K-KAPI-3` **Her SECURITY DEFINER fonksiyonda search_path sabit mi?** | Yetkili çalışan fonksiyonlar kandırılmaya açık mı? | acik = 0 | HER_IKISI |
| `K-BILDIRIM-1` **Dışarı giden çağrılar başarılı mı?** | Son 24 saatte gönderilmeye çalışılan bildirimlerin kaçı gerçekten gitti? | basarisiz = 0 | GUNLUK |
| `K-BILDIRIM-2` **Bildirim üretilen her olay gerçekten bildirim üretmiş mi?** | Son 24 saatte biten/iptal olan maçların hepsi katılımcılarına haber verdi mi? | bildirimsiz olay = 0 | GUNLUK |
| `K-KAPSAMA-1` **Coğrafi sorgular indeks kullanıyor mu?** | Yakındaki sahaları bulan sorgu tüm tabloyu mu tarıyor? | Seq Scan yok | DEGISIKLIKTE |
| `K-KIMLIK-1` **Hesap silme kapısı gerçek durum sözlüğünü mü kullanıyor?** | Silme engeli, sistemin gerçekten kullandığı kelimeleri mi arıyor? | hayalet kelime = 0 | HER_IKISI |
| `K-YUK-1` **Limitsiz sorgu var mı?** | Tablonun tamamını indiren bir sorgu eklenmiş mi? | limitsiz select = 0 | HER_IKISI |
| `K-YUK-2` **Filtresiz canlı abonelik var mı?** | Bir tablonun tüm değişikliklerini herkese gönderen abonelik var mı? | filtresiz kanal = 0 | HER_IKISI |
| `K-YUK-3` **İlk yük boyutu sınırın altında mı?** | Uygulama ilk açıldığında inen dosya boyutu kabul edilebilir mi? | ilk yük gzip < 350 KB | DEGISIKLIKTE |
| `K-OTO-1` **Beklenen her zamanlanmış iş kurulu mu?** | Olması gereken cron işlerinin hepsi canlıda var mı? | eksik iş = 0 | HER_IKISI |
| `K-OTO-2` **Takılmış (zehirli) iş var mı?** | Defalarca denenip hep başarısız olan maç/iş var mı? | zehirli = 0 | GUNLUK |
| `K-AYAR-1` **Zorunlu ayarların hepsi dolu mu?** | Sistemin çalışması için gereken ayarlardan boş kalan var mı? (3 Ağustos 2026'daki iki büyük arızanın tek kök nedeni buydu) | boş zorunlu ayar = 0 | HER_IKISI |
| `K-AYAR-2` **Panelde görünen her ayarın kodda karşılığı var mı?** | Panelden açıp kapattığın bir düğme gerçekten bir şey yapıyor mu? | ölü ayar = 0 | HER_IKISI |
| `K-AYAR-3` **Migration'lar sessizce vazgeçmiş mi?** | Bir migration 'ayar eksik, kurmadım' deyip devam etmiş mi? | koşullu kurulum + eksik ayar = 0 | HER_IKISI |
| `K-SAHIBI-1` **Saha sahibi yalnız kendi tesisini mi yönetebiliyor?** | Bir saha sahibi, başka bir tesisin takvimini, finansını veya personelini görebiliyor mu? | kapısız tesis fonksiyonu = 0 | HER_IKISI |
| `K-SAHIBI-2` **Panelde gösterilen tutar canlı veriyle aynı mı?** | Saha sahibinin finans ekranındaki rakamlar ile veritabanındaki gerçek toplamlar birebir tutuyor mu? | sapan tesis = 0 | GUNLUK |
| `K-PAZAR-1` **Hizmet ödemesi erken serbest bırakılmış mı?** | Kaleci/hakem ücreti, maç gerçekleşmeden ödenmiş mi? | erken serbest bırakma = 0 | GUNLUK |
| `K-DEMO-1` **Demo veri kurallara uyuyor mu?** | Demo satırları gerçek sistemin kurallarına uyuyor mu, denetimi kirletiyor mu? | kural dışı demo satırı = 0 | GUNLUK |
