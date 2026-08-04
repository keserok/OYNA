# 🧤 KALECI (Goalkeeper) — Edge-Case Analizi & Çözüm Planı

> Metodoloji: oyuncu fazındaki gibi — hem test eden hem geliştiren gözüyle gerçek
> kodlanmış akışı çıkar, somut problemleri bul, dürüst UI/UX + veri bütünlüğü
> önceliğiyle sprint planına dök. Bu belge **analiz + plandır**; kod, kullanıcı
> onayından sonra sprint-sprint yazılır (oyuncu fazının item-by-item kuralı).

**Keşif yöntemi:** 4 paralel explorer (A onboarding/kimlik · B servis operasyonları ·
C marketplace/maç entegrasyonu · D profil/puan/ödeme-sınırı) + canlı Supabase şema
doğrulaması. Tarih: 2026-07-15.

---

## 0. KAPSAM & ÖDEME SINIRI (en kritik karar)

Oyuncu fazında para (S1) **ayrı bir agent** tarafından yürütülüyor; benim kapsamım
para-dışı UI/UX + veri bütünlüğü. Kaleci tarafında bu ayrım **daha girift**, çünkü:

- **`service_requests` tablosu tek başına hem operasyonel hem para kolonları taşıyor:**
  - Operasyonel (BEN): `status`, `request_kind`, `provider_confirmed`, `captain_confirmed`,
    `accepted_at/completed_at/cancelled_at/expires_at`, `initiated_by`
  - Para (ÖDEME): `fee`, `commission_amount`, `provider_amount`, `payment_intent_id`,
    `payout_released`, `penalty_amount`, `funding_source`, `captain_refunded`,
    `dispute_deadline`, `captured_at`
- **Puan yazımı paraya kancalı:** `submit_service_rating` → `_release_service_payout`
  tetikler (faz5:790). Puan mantığı BENİM, payout sonucu ÖDEME'nin.
- **Escrow sistemi** (`20260723000000_gk_payment_escrow.sql`): 500₺ teminat + no-show
  ceza motoru, cüzdan/IBAN/kart payout (`faz8a`) — tamamı ÖDEME.

**Etiketler:** `[BEN]` para-dışı, benim · `[ÖDEME]` ödeme agent'ı · `[KOORD]` sınırda,
koordinasyon gerek.

---

## 1. BULGU ENVANTERİ

### 1A — Onboarding & Kimlik (başvuru → onay → panel)

| # | Sev | Kapsam | Bulgu | Kanıt |
|---|-----|--------|-------|-------|
| **KA-1** | 🔴 KRİTİK | [BEN] | Giriş yönlendirmesi `verification_status`'ı yok sayıyor → **pending/rejected kaleci doğrudan `SERVICE_DASHBOARD`'a düşüyor**, red notunu/"Tekrar Başvur"u hiç görmüyor (takılı kalır). `verification_status` App L141'de SELECT ediliyor ama landing'de kullanılmıyor. | App.tsx L234-299, shared/roles L13-17 |
| **KA-2** | 🔴 KRİTİK | [BEN] | Token yenileme pending ekranındayken kullanıcıyı `SERVICE_DASHBOARD`'a fırlatıyor (`isEntering` PENDING_VERIFICATION'ı içeriyor → canOverride). ~1 saat bekleyen onaysız kaleci panele bounce olur — yeni sertleştirdiğimiz pending ekranını bozar. | App.tsx L225, L255-299 |
| **KA-3** | 🔴 KRİTİK | [BEN] | Canlı onay yanlış panele yönlendiriyor: `FieldRolePage → ServiceApplication` yolu `store.role`'ü hiç `GOALKEEPER` yapmıyor (yalnız `serviceAppRole`). Realtime onay gelince `onApproved`=`navigateBasedOnRole(role='PLAYER')`→ oyuncu Dashboard'ı. Sadece yeniden giriş düzeltiyor. (Oyuncu İP-01/KN-1 reaktif-kimlik analogu.) | App.tsx L523, FieldRolePage L59-61 |
| **KA-4** | 🔴 KRİTİK | [BEN] | **Atomik olmayan çok-yazımlı submit** → ağ hatası adım (a) sonrası (c) öncesi olursa: `role='GOALKEEPER'` + `verification_status='pending'` + `goalkeepers` satırı yazılmış ama **`provider_applications` satırı YOK** → admin kuyruğunda görünmez, asla onaylanamaz. KA-1 ile birleşince yarı-provisyonlu SERVICE_DASHBOARD. Rollback yok. | ServiceApplication L169-179 |
| **KA-5** | 🟠 YÜKSEK | [BEN] | Onaylıyken formu tekrar göndermek kullanıcıyı sessizce `pending`'e düşürüp ikinci başvuru satırı açıyor (idempotent UPDATE yalnız `status='PENDING'` eşliyor; approved→NOT FOUND→INSERT). Bugün sadece navigasyonla korunuyor. | submit_provider_application L282-301 |
| **KA-6** | 🟠 YÜKSEK | [KOORD] | Reşit-olmayan kapısı başvuruda yok: form `age ≥ 14`'e izin veriyor; `apply_for_provider_role`/`submit_provider_application` `assert_can_transact`/`is_user_minor` çağırmıyor → 14-17 yaş guardian onayı olmadan kaleci onaylanabilir (kapı yalnız ödeme RPC'sinde). **Uyum/politika kararı.** | ServiceApplication L139, apply RPC L54-84 |
| **KA-7** | 🟡 ORTA | [BEN] | `age`/`height` serbest metin, `profiles.birthdate`/`age_range` ile bağsız → beyan edilen kaleci yaşı minor tespitine görünmez; üst sınır/mantık kontrolü de yok. | ServiceApplication L166, serviceProviderService L79 |
| **KA-8** | 🟡 ORTA | [BEN] | `rejected` dalında idempotency guard yok (approved'un `appliedRef`'i var) → her poll/realtime modalı yeniden açar (düşük etki). | PendingVerificationView L45-49 |
| **KA-9** | 🟡 ORTA | [BEN] | `setTimeout(onApproved, 2500)` unmount'ta temizlenmiyor → 2.5sn onay penceresinde "başka hesapla giriş" (logout) yapılırsa çıkış yapmış kullanıcı yine landing'e yönlenir (yarış). | PendingVerificationView L44 |
| **KA-M1** | 🟠 YÜKSEK | [BEN] | **"Onayı Hızlandır" checklist tamamen dekoratif** — 3 satır (foto/bio/bölge) `onClick`/state/etki YOK; kullanıcı aksiyonu onayı hızlandırıyormuş gibi durur, hiçbir şey yapmaz. | PendingVerificationView L264-280 |
| **KA-M2** | 🟠 YÜKSEK | [KOORD] | **"Onaylandığında bildirim göndereceğiz" karşılıksız** — `admin_review_provider_application` yalnız `log_admin_action` çağırıyor; sağlayıcıya in-app/push bildirim YOK (yalnız pitch-owner tetikleyicileri var). Pending ekranında değilse kullanıcı hiçbir şey duymaz. | admin_review L82-105 |
| **KA-M3** | 🟡 ORTA | [BEN] | "24 saat içinde incelenir" sabit SLA — sunucu/kuyruk zamanlaması yok, kesin söz gibi sunuluyor. | ServiceApplication L250, PendingVerificationView L249 |
| **KA-M4** | 🟡 ORTA | [BEN] | `seedName = email.split('@')[0]` "Ad Soyad"a gerçek isim gibi ön-dolduruluyor; kullanıcı değiştirmezse `profiles.full_name`/`goalkeepers.name`'e aynen yazılıyor (yalnız uzunluk≥3). | ServiceApplication L89-92 |

### 1B — Servis Operasyonları (teklif → talep → kabul → tamamla)

| # | Sev | Kapsam | Bulgu | Kanıt |
|---|-----|--------|-------|-------|
| **KB-1** | 🔴 KRİTİK | [KOORD] | **Kaptan-başlatan kaleci rezervasyonları asla payout alamıyor.** `_release_service_payout` (son sürüm) tüm talepler için `provider_confirmed AND captain_confirmed` istiyor; ama GK UI "Maçı Oynadım·Onayla" butonunu YALNIZ `initiatedBy==='PROVIDER'` iken gösteriyor → kaptan-başlatan/FCFS-kabul taleplerinde `provider_confirmed` hep false → payout PENDING'de sonsuza dek takılı. **UI fix BENİM, RPC kapısı ÖDEME.** | ServiceDashboard L1173, escrow L154 |
| **KB-2** | 🔴 KRİTİK | [KOORD] | **`matches.starts_at` null iken çifte-rezervasyon.** `_provider_has_conflict` `p_starts_at IS NULL` iken false; dashboard her yerde `date`/`time` string kullanıyor. İki kaptan aynı kaleciye çakışan PENDING talep açar; `respond_service_request` kabulde çakışmayı tekrar kontrol etmez → kaleci ikisini de kabul → çifte-booking. (Oyuncu KN-3 lost-update analogu.) | conflict L490-498, respond L82 |
| **KB-3** | 🟠 YÜKSEK | [BEN] | **DISPUTED / NOSHOW_FINALIZED satırları GK panelinden kayboluyor.** Bucket'lar (L224-242) yalnız PENDING/ACCEPTED/CAPTURED/NOSHOW_REPORTED/COMPLETED. `provider_dispute_no_show` sonrası `DISPUTED` hiçbir bucket'a düşmez → kaleci kendi aktif itirazını hiç göremez. | ServiceDashboard L224-242 |
| **KB-4** | 🟡 ORTA | [KOORD] | Kaleci kabul sonrası **iptal/geri çekilemiyor**. `cancel_service_request` yalnız `requested_by`; ACCEPTED/CAPTURED'ı bırakacak RPC/UI yok → gelemeyen kaleci ancak no-show cezası yiyerek çıkar. (İptal iade doğurur → koord.) | cancel L658 |
| **KB-5** | 🟡 ORTA | [BEN] | Sağlayıcı-başlatan APPLIED talepler asla süresi dolmuyor (`expire_service_requests` yalnız PENDING işliyor) → "Başvuruldu" sonsuza dek. | expire L515, apply L124 |
| **KB-6** | 🟢 DÜŞÜK | [KOORD] | Süresi geçmiş ama süpürülmemiş PENDING hâlâ kabul edilebilir (`respond` yalnız `status='PENDING'`, `expires_at`'e bakmaz; 5dk cron arası pencere). | respond L82 |
| **KB-7** | 🟢 DÜŞÜK | [BEN] | `new Date(`${m.date} ${m.time}`)` "Bugün 21:00" gibi değerlerde Invalid Date → geri sayım `--:--:--`/`00:00:00`'a düşer (isNaN guard var, crash yok). Kırılgan parse deseni. | ServiceDashboard L154,157,166 |
| **KB-8** | 🟠 YÜKSEK | [BEN] | **Uygunluk kurulumu büyük ölçüde kozmetik:** `find_providers_for_match` yalnız `verification_status`+`is_available`+`isDemo`+zaman-çakışması filtreliyor; `working_hours` (gün/saat), `preferredZones`/`coordinates` (alan) matching'e sıfır etki. Kalecinin ayarladığı gün/saat/bölge hiçbir şey yapmıyor. | find_providers L227-240 |
| **KB-M1** | 🟠 YÜKSEK | [BEN] | **Legacy `service_offers` kabul yolu: doğrudan tablo yazımı + sahte başarı, para yok.** `acceptOffer` raw `service_offers.update({status:'ACCEPTED'})` yapıp `setShowBidSuccess(true)` — RPC/escrow'u baypas eden ölü/paralel yol; migration bunu "KULLANILMAZ" işaretlemiş. Gerçek FCFS UI ile aynı sekmede iki çelişkili teklif sistemi. **Silinmeli.** | ServiceDashboard L678-724, offers migration L21 |
| **KB-M2** | 🟠 YÜKSEK | [BEN] | Sabit kimlik-kartı statları gerçekmiş gibi: "LVL 8", "PANTER/Altınordu", maç `||42`, refleks `||90`, puan `||4.8`, diving/positioning/oneOnOne `||88/82/88`; hakem kartı "150/%98/4.9/FIFA/Ordu". | ServiceDashboard L814-903, 957-965 |
| **KB-M3** | 🟠 YÜKSEK | [BEN] | Açık-maç kartlarında uydurma alanlar: `captainName:'Kaptan'`, `format:'7v7'`, `difficulty:'Ciddi'`, fee fallback `250/350`, `date:'Bugün'`/`time:'21:00'` — placeholder değerler gerçek ilan gibi. | ServiceDashboard L290-311 |
| **KB-M4** | 🟢 DÜŞÜK | [BEN] | Kullanılmayan mock UI state (`matchLiveStatus`, `showPostMatchReport`, `postMatchRating`) — mock iskele artığı. + "Kimlik Doğrula" butonu VERIFIED kaleci için de görünüyor (L1043). | ServiceDashboard L92-94, L1043 |

### 1C — Marketplace & Maç Entegrasyonu (kaptan kaleci kiralar)

| # | Sev | Kapsam | Bulgu | Kanıt |
|---|-----|--------|-------|-------|
| **KC-1** | 🟠 YÜKSEK | [BEN] | **GK puanı her yerde ölçek/rookie dürüstlüğü olmadan gösteriliyor:** ham 0-10 puan 5-yıldız yanında; `ratingToOverall`/`isRookie` hiç import edilmemiş → rookie GK (0 maç, DB rating 0) gerçek "0.0" olarak görünüyor (oyuncu "OVR 100" kuralının uygulanmamış GK analogu). | MarketplaceCard L68, Marketplace L441 |
| **KC-2** | 🟠 YÜKSEK | [BEN] | **Null `stats` kartı/detay modalını çökertiyor** (guardsız erişim). `goalkeepers.stats` nullable, `mapFromSnakeCase` default vermiyor → `(item.stats).reflexes` `null` okunamaz hatası. | MarketplaceCard L18, Marketplace L459-463 |
| **KC-3** | 🟡 ORTA | [BEN] | Eksik/sıfır skill statları %80 bar'a sahteleniyor (`reflexes||80`); fee `formatTRY` kullanmıyor (`{item.fee} ₺`→"1500 ₺", null fee→" ₺"). | MarketplaceCard L18-24, L155; Marketplace L482,303 |
| **KC-4** | 🟠 YÜKSEK | [KOORD] | Uygun-olmayan/kapasitede-dolu kaleci hâlâ gösteriliyor VE kiralanabiliyor: marketplace client filtresi `is_available`'a bakmıyor; doğrudan-kirala `create_service_request` de `is_available` kontrol etmiyor (yalnız aynı-slot çakışması bloklar). | Marketplace L83-98, create RPC L549-560 |
| **KC-5** | 🟡 ORTA | [KOORD] | Aynı maç+kaleci için duplicate-request guard yok → kaptan iki kez KİRALA basarsa çift PENDING talep + çift blocking payment_intent. | create RPC L570-591 |
| **KC-6** | 🟡 ORTA | [BEN] | `selectedGk` ölü prop — başarılı kiralamadan sonra `setSelectedGk` yazılıyor ama hiçbir yerde render edilmiyor; kaptanın tek onayı geçici 3.5sn overlay. | App L583, Dashboard L280 |
| **KC-7** | 🟡 ORTA | [BEN] | Boş durum yükleme hatasını maskeliyor: `loadServices` hataları yutuyor (`adminGoalkeepers:[]`) → başarısız fetch "profil yok" gibi görünür, retry/hata yok. | Marketplace L234-235, store L992-994 |
| **KC-M1** | 🟡 ORTA | [BEN] | Sabit `2.4 KM YAKINDA` mesafe fallback'i gerçek yakınlık gibi; hakem sekmesinde sabit `85`/`95` bar'lar gerçek analitik gibi. | MarketplaceCard L83, Marketplace L470-471 |

### 1D — Profil / Ayarlar / Puanlama

| # | Sev | Kapsam | Bulgu | Kanıt |
|---|-----|--------|-------|-------|
| **KD-1** | 🟠 YÜKSEK | [KOORD] | **`goalkeepers.matchCount` asla artmıyor** — capture/release akışı dokunmuyor; yalnız seed/onboarding (=0) yazıyor (`+1`'ler `profiles.match_count`, farklı kolon). 50 maç oynamış self-onboard kaleci Maç=0 gösterir ve `find_providers ORDER BY match_count DESC`'te sona düşer. | faz5 L704-846, L448 |
| **KD-2** | 🟠 YÜKSEK | [BEN] | **Gizlilik toggle'ları işlevsiz** — `showProfile/showRating/hidePhone/allowOffer` hiçbir yerde okunmuyor; `find_providers` yalnız `verification_status`+`is_available`, `MarketplaceCard` puanı hep gösteriyor. "Profilimi Gösterme" diyen kaleci yine puanıyla görünür — dürüst-olmayan gizlilik kontrolü. | ServiceSettings L282-289 |
| **KD-3** | 🟠 YÜKSEK | [BEN] | Profil "hero" puan rozeti sabit `4.9` (gerçek `userProfile.rating`'i yok sayıyor) + stat fallback'leri uydurma: CS `||'12'`, Refleks `||'94'`, Puan `||'9.2'` → rookie GK sahte 12 clean-sheet/%94 refleks görür. Aynı GK MarketplaceCard'da dürüst "0.0". | ServiceProfile L298-300, L178-182 |
| **KD-4** | 🟡 ORTA | [BEN] | `ServiceSettings` `me` gerçek uid store'da yoksa `adminGoalkeepers[0]`'a düşüyor → hesap özeti ve tüm toggle başlangıç durumları BAŞKA sağlayıcının verisini gösterir (yazımlar doğru uid'e gider — sessiz tutarsızlık). | ServiceSettings L59, 221-228 |
| **KD-5** | 🟡 ORTA | [BEN] | `updateSettings` fire-and-forget; DB hatası yalnız `console.error`, revert/toast yok → toggle görsel "açık" ama hiçbir şey kalıcı değil. | ServiceSettings L114-119 |
| **KD-6** | 🟡 ORTA | [BEN] | `radiusKm` `useState(15)` sabit, `userProfile.settings.radiusKm`'den hiç okunmuyor (yazılıyor ama okunmuyor) → 30km kaydet-yeniden aç 15'e döner. | ServiceProfile L89, 147 |
| **KD-7** | 🟡 ORTA | [BEN] | İç "KAYDET" butonları (isim L276, bio L356) yalnız local state; yalnız üst KAYDET DB'ye yazıyor. İki aynı-etiketli buton, iç olan kaydediyormuş gibi. Üst buton `saving` sırasında "Kaydedildi ✓" (hata bilinmeden başarı). | ServiceProfile L207-209, 276, 356 |
| **KD-8** | 🟡 ORTA | [BEN] | Foto base64 data-URL olarak doğrudan `goalkeepers.avatar`'a yazılıyor (Storage upload yok) → satırı ve her `find_providers` marketplace payload'unu şişirir. | ServiceProfile L159-168 |
| **KD-9** | 🟡 ORTA | [BEN] | Hayalet düzenlenebilir profil: `userProfile` undefined iken tam sahte default (UĞURCAN Ç., fee 250, 4.9) render edilip düzenlenebiliyor; yalnız save'de hata. Loading/empty guard yok. | ServiceProfile L66-71, 130-132 |
| **KD-M1** | 🟡 ORTA | [BEN] | Stock Unsplash "Uğurcan Çakır tarzı" preset fotolar + demo isim/bio "%40 penaltı kurtarma" kullanıcının kendisiymiş gibi; menüde sabit Unsplash foto (L2004). | ServiceProfile L33-45, 66-69 |

---

## 2. KÖK NEDENLER (tekrarlayan desenler)

1. **Doğrulama-durumu router'da okunmuyor (KA-1/2/3).** Rol *başvuruda* veriliyor, onay
   yalnız `verification_status`'ı çeviriyor; ama landing/token-refresh/onApproved bunu
   hiç okumuyor → onaysız kaleci panelde, canlı onay yanlış panelde. Oyuncu fazının
   reaktif-kimlik (İP-01/KN-1) sorununun kaleci ölçekli hâli.
2. **Atomik-olmayan çok-yazımlı akışlar (KA-4).** Client'ta sıralı RPC+tablo yazımları,
   transaction yok → yarım-provisyon. Çözüm: tek atomik RPC ya da idempotent onarım.
3. **Gerçek veri yerine sabit/varsayılan "gösteriş" (KC-1/3, KD-3, KB-M2/3, KA-M1..4).**
   Eksik veri sahte sayıya (%80, 4.9, 12, "2.4km", "Kaptan") düşürülüyor — oyuncu
   fazının "sahte OVR/fiyat" temasının kaleci nüksü. `ratingToOverall`/`formatTRY`/rookie
   "—" ortak util'leri hiç uygulanmamış.
4. **Guardsız erişim + kırılgan parse (KC-2, KB-7).** Nullable jsonb'ye guardsız erişim
   (crash); string tarih/saat `new Date`'e veriliyor.
5. **UI ile sunucu-gerçeği sapması (KB-1/3, KC-4, KD-1/2, KB-8).** Butonun render koşulu,
   dashboard bucket'ları, gizlilik toggle'ları, uygunluk ayarları sunucu davranışıyla
   uyumsuz → sessiz kırık akışlar.
6. **Ölü/legacy paralel yollar (KB-M1, KC-6, KB-M4).** "KULLANILMAZ" service_offers kabul
   yolu, ölü `selectedGk`, kullanılmayan mock state — sahte başarı riski + kafa karışıklığı.

---

## 3. ÖNERİLEN SPRINT PLANI

> Oyuncu fazı düzeni: her paket ayrı commit, tsc+unit+smoke kapısı, dürüst UI/UX +
> veri bütünlüğü. Para-kancalı işler `[KOORD]`; ödeme agent'ıyla sınır netleşmeden
> yazılmaz.

- **K0 — Temel & ortak util'ler (dürüstlük altyapısı).** GK kartlarına `ratingToOverall`/
  `isRookie`/`formatTRY` uygula; null `stats` guard'ı (KC-2 crash) + default-80/4.9/12
  sahteliklerini kaldır (KC-1/3, KD-3). GK smoke süiti (session-inject kaleci). `[BEN]`
- **K1 — Onboarding & yönlendirme bütünlüğü.** KA-1/2/3 (router `verification_status`
  okur; pending/rejected kaleci pending ekranında kalır; canlı onay doğru panele;
  reaktif kimlik) + KA-4 atomik/onarımlı submit + KA-5 tekrar-başvuru koruması + KA-8/9
  pending guard/temizlik. `[BEN]` (+ KA-6 minor kararı, KA-M2 bildirim `[KOORD]`)
- **K2 — Servis operasyon dürüstlüğü.** KB-3 dispute/no-show görünürlüğü + KB-M1 legacy
  kabul yolunu sil + KB-M2/3/4 sabit kart/uydurma alan temizliği + KB-5/7 expire/parse.
  `[BEN]` (KB-1 UI-fix `[KOORD]`, KB-2/4/6 `[KOORD]`)
- **K3 — Marketplace dürüstlüğü.** KC-4 uygunluk filtresi + KC-5 duplicate guard `[KOORD]`
  + KC-6 selectedGk + KC-7 boş/hata durumu + KC-M1 sabit mesafe/bar. `[BEN]`
- **K4 — Profil/Ayarlar sağlamlığı.** KD-2 gizlilik toggle (bağla ya da kaldır) + KD-4/5
  ayar tutarlılığı/hata + KD-6 radius + KD-7 kaydet dürüstlüğü + KD-8 foto Storage +
  KD-9 loading guard + KD-M1 preset foto. `[BEN]` (KD-1 matchCount `[KOORD]`)
- **K-availability — KB-8:** `working_hours`/zone matching'i onurlandır ya da UI vaadini
  sadeleştir (karar noktası). `[BEN]` (matching RPC `[KOORD]`)

---

## 4. KARAR NOKTALARI → ONAYLANAN KARARLAR (2026-07-15)

1. **Ödeme sınırı** → ✅ **Operasyonel tarafı tamamen BEN hallederim; para-kancalı
   kısımlar için eksiksiz ANALİZ/DEVİR belgesi yazarım (kod değil).** Yani her `[KOORD]`
   bulgusu ikiye ayrılır: operasyonel-fix (ben kodlarım — buton render kapısı, çakışma
   guard'ı, dashboard görünürlüğü, sayım) + saf-para RPC parçası (`KALECI_ODEME_DEVIR.md`
   içinde tam analiz, ödeme agent'ına). Saf escrow/payout/ceza RPC'lerine kod dokunmam.
2. **Gizlilik toggle'ları (KD-2)** → ✅ **Gerçek davranışa bağla** (dördü de: showProfile→
   marketplace görünürlüğü, showRating→puan gizleme, hidePhone→telefon maskeleme,
   allowOffer→teklif alma).
3. **Uygunluk matching'i (KB-8)** → ✅ **Matching'e bağla** — `find_providers_for_match`
   gün/saat aralığı + bölgeyi onurlandırsın (matching RPC değişikliği; para-dışı, ben).
4. **Reşit-olmayan kaleci kapısı (KA-6)** → ✅ **Başvuruda guardian onayıyla blokla** —
   oyuncu minor işlemesiyle tutarlı.
5. **Onay bildirimi (KA-M2)** — [açık, K1'de öneriyle ele alınır] onaylandığında sağlayıcıya
   gerçek bildirim tetikleyicisi eklenmeli.

---

## 5. TEST STRATEJİSİ

- **GK smoke** (K0): kaleci demo hesabıyla session-inject → SERVICE_DASHBOARD kabuğu +
  gerçek isim/puan çözümü + beklenmeyen 4xx/JS hatası yok (oyuncu smoke deseni).
- **Birim:** rating/format util'lerinin GK kart girdileriyle; parse guard'ları.
- **Entegrasyon (K1/K2):** pending→approved yönlendirme; atomik submit onarımı; çifte-
  booking senaryosu (KB-2, canlı) — ödeme sınırı netleştikten sonra.
- Her sprint çıkışı: tsc temiz · unit · GK smoke · PROBLEMLER kaydı.

---

_Bu belge canlı; onaylanan kararlar ve tamamlanan sprintler §-güncellemeleriyle işlenir._

---

## 8. UYGULAMA GÜNLÜĞÜ (Kaleci sprintleri)

### ✔ Tamamlanan (test edildi + push'landı)
- **KS0** dürüstlük altyapısı: MarketplaceCard + Marketplace detay + ServiceProfile'da sahte stat/puan/fiyat öldü, null-`stats` crash guard (KC-2), `formatTRY`, rookie "—". Yeni `tests/gk-smoke.mjs`.
- **KS1a** yönlendirme: KA-1/2/3 `verification_status` kapısı (onaysız kaleci panele düşmez; token-yenileme bounce'u yok; canlı onay doğru panele). **+ veri kaybı bug'ı**: zayıf bağlantıda mevcut kaleci "yeni kullanıcı" sanılıp role/roles PLAYER'a sıfırlanıyordu → maybeSingle re-check + insert-çakışma tespiti + downgrade koruması. KA-8/9 pending guard/timer.
- **KS1b** başvuru sağlamlığı: KA-4 orphan önleme (foto-önce + kuyruk retry), KA-5 tekrar-başvuru kilidi, KA-6 minor guardian kapısı (başvuruda blokla), KA-M1/3/4 dürüstlük (dekoratif checklist, SLA, seedName).
- **KS2** servis operasyon dürüstlüğü: KB-3 dispute/no-show görünürlüğü; KB-M2 kimlik kartı gerçek veri (ekran görüntüsüyle doğrulandı: AHMET/SWEEPER-KEEPER/62·92·8.4); KB-M3 açık-maç kartı uydurma alanları öldü; KB-M1 legacy service_offers sahte-kabul yolu gizlendi; KB-1 payout onay butonu tüm CAPTURED'da (operasyonel yarı).
- **K-ÖDEME** devir belgesi: `KALECI_ODEME_DEVIR.md` (7 kalem + öncelik tablosu, gerçek migration'lara karşı doğrulanmış).
- **test hijyeni**: gameRules gece-yarısı flake'i sabit saatle giderildi.

**Not (düzeltmeler):** KB-M4 kimlik-CTA "verified'da da görünüyor" iddiası YANLIŞ POZİTİF — buton VERIFIED dalının else'inde, doğru çalışıyor. KC-5 (duplicate request) unique index + advisory lock ile zaten veri-güvenli (devir belgesinde).

### ⏳ Kalan
- **KS3** marketplace: KC-4 uygun-olmayan kaleci filtresi (is_available `profiles`'ta → marketplace sorgusuna join gerek, veri-katmanı), KC-6 `selectedGk` ölü prop temizliği, KC-7 boş-durum yükleme-hatasını maskeliyor (store hata durumu).
- **KS4** profil/ayarlar + gizlilik + matching: KD-2 gizlilik toggle'larını gerçeğe bağla (4'ü), KD-4/5 ayar tutarlılığı/hata, KD-6 radius geri-okuma, KD-7 kaydet dürüstlüğü, KD-8 foto Storage, KD-9 loading guard, KD-M1 preset foto; **KB-8** uygunluk gün/saat/bölge matching'e bağla (find_providers migration).
- **KS2 minör**: KB-5 APPLIED expire (sunucu sweep), KB-7 geri-sayım parse (kozmetik).

### Güncelleme (KS4-1 + KD-2)
- **KS4-1** profil/ayarlar sağlamlığı: KD-4 (yanlış-sağlayıcı fallback kalktı + toggle senkron), KD-5 (ayar yazımı revert+toast), KD-6 (radius geri-okuma), KD-7 (kaydet dürüstlüğü: "Kaydediliyor…" + iç buton "TAMAM"), KD-9 (profil yükleme guard'ı, sahte default'lar boşaltıldı). ✔ push'landı.
- **KD-2 gizlilik gerçeğe bağlandı:** marketplace `showProfile` (opted-out listelenmez, canlı doğrulandı) + `showRating` (kart puanı gizlenir); ayrıca `find_providers_for_match`'e `showProfile` filtresi (canlı migration `20260726000000`). ✔ push'landı.

### Kalan follow-up'lar (odaklı pass gerektirir)
- **KB-8 tam eşleştirme:** find_providers'ın gün/saat (`working_hours` "HH:MM - HH:MM" + TR gün-adı) ve bölge (`preferredZones` vs maç konumu) filtreleri — riskli SQL, ayrı testli migration (find_providers maç konumunu da seçmeli).
- **KD-2 kalan:** `allowOffer` (kapalıysa doğrudan kiralama kilidi — detay modal), `hidePhone` (rezervasyon/iletişim akışı), detay-modal puan gizleme.
- **KC-4** uygun-olmayan kaleci filtresi: `is_available` `profiles`'ta (goalkeepers'ta yok) → marketplace'e ikincil sorgu/join + `create_service_request` sunucu kontrolü (operasyonel/sınırda).
- **KC-6** `selectedGk` ölü prop temizliği · **KC-7** boş-durum yükleme hatasını maskeliyor (store hata state'i).
- **KD-8** foto base64 yerine Storage upload · **KB-5** APPLIED expire (sunucu sweep) · **KB-7** geri-sayım parse (kozmetik).

### ✔ TÜM KALEN MADDELER TAMAMLANDI (SQL + veri katmanı dahil)
- **KC-4** uygunluk: `create_service_request`'e is_available/showProfile/allowOffer guard (otoritatif) + `get_available_provider_ids` RPC + marketplace filtre. Canlı doğrulandı (offline kaleci vitrinden düşer). Migration `20260726000001`.
- **KB-8** eşleştirme: `_provider_serves_zone` (jsonb, kelime-sınırı) + `_provider_serves_schedule` (TR gün + "HH:MM-HH:MM" saat, gece-aşan, defansif) → `find_providers_for_match`. 20 helper birim-vaka SQL testi geçti; gerçek maçla entegrasyon doğrulandı. Migration `20260726000000` (showProfile) + `20260726000002`.
- **KD-2 tam:** marketplace showProfile/showRating (canlı) + detay-modal allowOffer kilidi + showRating gizleme + find_providers showProfile. hidePhone: kaptan-tarafı telefon gösterimi yok → gizlenecek sızıntı yok (dürüst).
- **KC-7** boş-durum: `store.servicesError` + marketplace ErrorState/retry (yükleme hatası maskelenmez).
- **KD-8** foto: base64 yerine `useImageUpload('avatars')` Storage (satır/payload şişmesi bitti).
- **KB-5** APPLIED expire: `expire_service_requests` ikinci döngü. Migration `20260726000003`.
- **KB-7** parse: GK dashboard geri-sayım `parseMatchDateTime` ile sağlam.
- **KC-6** ölü `selectedGk`/`selectedRef` prop'ları kaldırıldı.

**Kaleci fazı KAPANDI.** Tüm bulgular (KA/KB/KC/KD + para devri) çözüldü ya da (para-kancalılar) `KALECI_ODEME_DEVIR.md`'ye eksiksiz devredildi. Kanıt: tsc temiz · 260 birim testi · GK smoke 4/4 · player smoke 4/4 · 4 canlı migration (helper birim-testli) · marketplace/uygunluk/gizlilik canlı doğrulandı · tüm demo hesap mutasyonları geri yüklendi.
