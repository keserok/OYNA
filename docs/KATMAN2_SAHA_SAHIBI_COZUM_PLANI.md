# Katman 2 — Saha Sahibi Problemleri: Kesin Çözüm & Uygulama Planı

> **Tarih:** 4 Temmuz 2026 · **Kaynak:** 6 paralel kod-keşif ajanı + 6 tasarım ajanı (dosya:satır kanıtlı) + sentez.
> **Hedef:** Gerçek bir halı saha sahibinin **kağıt defter + WhatsApp + nakit çekmecesi** üçlüsünü tamamen bırakıp TÜM operasyonunu OYNA'ya taşıması.
> **İlke:** Tüm migration'lar eklemeli + idempotent; riskli davranışlar `app_config`/`feature_flags` arkasında; her şey SIMULATION modunda bugün, iyzico ile yarın aynı çalışır.

---

## 0. Özet Tablo

| # | Problem | Çözüm (tek cümle) | Efor | Sprint |
|---|---|---|---|---|
| P1 | İnternet kesilince rezervasyon kayboluyor | IndexedDB outbox + idempotent RPC'ler + çakışma çözümü + takvim snapshot'ı | 12-14g | S3 |
| P2 | SaaS faturası ön büroyu kilitliyor | CORE/PREMIUM/PROTECTED ayrımı — çekirdek ASLA kilitlenmez + self-servis fatura | 10-12g | S1 |
| P3 | Payout vaadi yalan + komisyon görünmez + nakit/kart karışık | Pazartesi otomatik payout + komisyon SSOT + 3-kova mutabakat + dürüst onboarding | 12-15g | S0+S1+S4 |
| P4 | Takvim 1 kort × 1 gün | TESİS (gün×kort) + HAFTA görünümü, tek RPC, gerçek doluluk % | 8-10g | S2 |
| P5 | Kantin yok, veresiye sığ, fiş yok | Kantin-lite POS + kalem-bazlı veresiye defteri + WhatsApp fişi | 10-12g | S5 |
| P6 | Personel girişi yok, manuel rezervasyon katı, go-live opak | Saha-kapsamlı personel hesapları + esnek rezervasyon + şeffaf onay checklist'i | 14-17g | S2+S4+S6 |

**Toplam:** ~66-80 geliştirici-günü (tek kişi, ~12 hafta) · İlk görünür güven kazanımları **Sprint 0'da (2-3 gün)**.

---

## P1 — OFFLINE-FIRST ÖN BÜRO 🔌

**Problem (kanıt):** Yazma yollarında hiçbir kuyruk/önbellek yok; internet kesikken girilen kapı rezervasyonu hata verip **kaybolur** (`pitchOwnerService.ts`, `OfflineBanner.tsx` yalnız pasif şerit). Ayrıca bugünkü manuel rezervasyon **iki adımlı ve atomik değil** (RPC + ayrı `booking_payments` INSERT) — yarıda kesilirse "CONFIRMED ama ödemesi kayıp" rezervasyon oluşuyor.

**Çözüm mimarisi:**
1. **Server — idempotency defteri:** `owner_client_ops` tablosu (`client_request_id uuid PK` + saklanmış jsonb sonuç). 4 yeni SECURITY DEFINER RPC: `owner_create_manual_booking`, `owner_record_payment_v2`, `owner_close_slot_v2`, `owner_add_credit_entry`. Aynı `client_request_id` ile ikinci çağrı → **saklanmış sonucu aynen döndürür** (replay asla ikinci rezervasyon/ödeme yaratamaz). `SLOT_TAKEN` exception değil, jsonb `{status:'SLOT_TAKEN'}` olarak döner (deftere yazılabilsin diye). Gerçek çifte-rezervasyon hakemi mevcut GiST EXCLUDE constraint'i kalır. `owner_create_manual_booking` rezervasyon+nakit ödemeyi **tek transaction**'a alır.
2. **Client yazma — outbox:** `services/offline/` (~500 satır el yazması; kütüphane yok, yalnız `@capacitor/network` eklenir çünkü WKWebView'de `navigator.onLine` güvenilmez). Her kayıt `outbox.submit(op)` tek yolundan: online'da anında RPC (yine client_request_id'li → online timeout-retry duplicate'i de çözülür), ağ hatasında IDB'de QUEUED. Sync engine FIFO + exponential backoff; hata sınıflandırması: network→retry · SLOT_TAKEN→**CONFLICT** (bildirim + tek dokunuş yeniden-slotlama) · oturum→PAUSED (kuyruk korunur, farklı kullanıcıda replay edilmez). Takvimde kuyruktalki kayıt kesikli çerçeveli "Kuyrukta" chip'iyle anında görünür.
3. **Client okuma — snapshot:** `calendar_snapshots` IDB store'u; online'dayken bugün+7 gün tek sorguyla prefetch. Offline'da "Çevrimdışı — son güncelleme HH:MM" şeridiyle snapshot render + kuyruk overlay (bugünkü davranış: hata → tüm slotlar yalancı "BOŞ" görünüyordu — bu da düzelir).
4. **Kapsam:** Offline-yetenekli SADECE 4 yazma: manuel rezervasyon(+nakit), nakit tahsilat, slot kapatma, veresiye kaydı. Online-only: app-booking onay/red (oyuncu parası+bildirim yan etkileri), tarife/flash-deal, abonelik, payout.

**DB:** `20260710000001_offline_ops_ledger` · `..02_client_request_id_columns` (pitch_bookings/booking_payments/exceptions'a nullable kolon + partial UNIQUE index — ikinci savunma hattı) · `..03_owner_offline_rpcs` · `..04_pitch_credit_entries` · `..05_reconcile_no_overlap_constraint` (**ROLLOUT ADIM 0:** canlı DB'de `pitch_bookings_no_overlap` DDL'inde `WHERE status <> 'CANCELLED'` predicate'i doğrulanır, repoya reconciled migration olarak işlenir — bu yapılmadan CONFLICT semantiği çalışmaz).

**Kod:** `services/offline/{idb,outboxTypes,outbox,syncEngine,snapshotCache}.ts` (yeni) · `pitchOwnerService.createManualBookingV2` · `store.ts` outbox slice · `OwnerPanel.tsx` KAYDET dallanması · `views/owner/OutboxSheet.tsx` + `SyncStatusChip.tsx` (yeni) · `OwnerCloseSlotModal` · `OfflineBanner` ("{n} işlem kuyrukta") · `App.tsx` syncEngine start/stop.

**Bayraklar:** `offline_outbox_enabled`, `offline_snapshot_enabled`, `manual_booking_v2_enabled` (sonuncusu bayraklar kapaliyken bile atomik+idempotent online yazmayı erken kazanç olarak açar).

**Risk notları (kırmızı takım):** iOS IDB tahliyesi → 7 günü aşan offline kuyruk riski (kuyruk boyutu uyarısı ekle); logout'ta kuyruk silinmez ama başka kullanıcıyla replay edilmez (test şart); CONFLICT'te fiziksel alınmış nakit → "Vazgeç"te otomatik açık-alacak kaydı önerilir (para sessizce kaybolmaz).

**Kabul kriteri:** Uçak modunda rezervasyon gir → anında "Kuyrukta" görünür → bağlantı gelince ≤30sn'de senkron → uygulamayı senkron ortasında öldür → tekrar aç → **çift kayıt yok**.

---

## P2 — ÖN BÜRO ASLA KİLİTLENMEZ + SELF-SERVİS FATURA 🔓

**Problem (kanıt):** `isReadOnly = status ∈ {suspended,cancelled}` tüm paneli kilitler — nakit kapı rezervasyonu dahil (`useOwnerEntitlements.ts`, ~25 guard noktası). Üstelik keşif ajanı **kritik güvenlik açığı** buldu: tüm gating client-only VE `owner_accounts_update` RLS policy'si owner'ın **kendi plan_tier/status/entitlements'ını UPDATE etmesine izin veriyor** (PostgREST ile self-upgrade mümkün!). "SaaS & Fatura" menüsü `false &&` ile ölü kod; plan değişikliği = destek@oyna.app'e mail.

**Çözüm mimarisi — 3 yetki sınıfı:**
- **CORE_OPS (asla kilitlenmez):** manuel rezervasyon, onay/red, abonman, slot kapatma, özel fiyat, gider+veresiye, tesis aç/kapa, çalışma saatleri, banka hesapları, kort CRUD. Fatura durumu ne olursa olsun yazılabilir.
- **PREMIUM (kademeli kilitlenir):** flash indirim, ekip modülü, gelişmiş finans analitiği, çoklu tesis, (rezerve) kantin POS.
- **PROTECTED (faturadan bağımsız):** para çekme — owner'ın kendi rezervasyon geliri SaaS faturasına rehin **tutulamaz**; tek gerçek dondurma = admin'in `ops_locked` istismar kilidi.

**Uygulama:** `guardWrite()` → `guardWrite(capabilityKey)` + statik CAPABILITY_MAP (25 guard noktasının tam sınıflandırması tasarımda hazır). Server tarafı: (1) **önce RLS deliği kapanır** (kolon-koruma trigger'ı; billing_email yazılabilir kalır), (2) `owner_feature_allowed(uid, feature)` fonksiyonu premium RPC'lerin başına + flash-deal/team INSERT policy'lerine WITH CHECK. **Kademeli merdiven:** ödeme başarısız → `past_due` (7 gün, sarı banner, hiçbir kilit) → `suspended` (premium kilit, çekirdek açık, kırmızı banner) → 30 gün sonra `cancelled` (işlevsel olarak aynı). `owner_billing_status_sweep()` pg_cron — iyzico canlıya kadar `enforcement_enabled=false`. **Self-servis:** `owner_plan_catalog` (tier→entitlement haritası nihayet var olur), `OwnerBillingView` (plan karşılaştırma + geçmiş + yükselt/düşür/iptal talebi → admin tek-tık onay kuyruğu).

**DB:** `20260710000001_owner_core_premium_capabilities` (katalog + RLS düzeltmesi + `owner_feature_allowed` + request_payout yaması) · `..02_owner_billing_selfservice` (`owner_billing_requests` + event ledger üreticileri).

**Kod:** `useOwnerEntitlements.ts` (capability map) · `OwnerPanel.tsx` tüm guard noktaları yeniden-anahtarlanır · `OwnerFinanceView`/`OwnerTeamView`/`OwnerBankAccountsModal`/`OwnerWithdrawalsModal` readOnly→opsLocked/analyticsLocked ayrımı · `OwnerMenuView` ölü satır canlanır · `OwnerBillingView.tsx` (yeni) · admin `OwnerAccountsTab` (ops_locked checkbox + katalog-uygulayan plan değişimi).

**Rollout Faz 0 (bayraksız, hemen):** RLS self-upgrade deliğini kapatan migration — saf güvenlik, sıfır görünür değişiklik. **Bu, Sprint 0'ın parçası.**

**Kabul kriteri:** `status='suspended'` bir hesapta nakit kapı rezervasyonu girilir, kaydedilir ve takvimde görünür; flash indirim ekranı kilitli; PostgREST ile `plan_tier` UPDATE denemesi reddedilir.

---

## P3 — PARA GERÇEĞİ: OTOMATİK PAYOUT + KOMİSYON ŞEFFAFLIĞI + MUTABAKAT 💰

**Problem (kanıt):** Onboarding "her Pazartesi otomatik" diyor (`PartnerOnboarding.tsx:331`); gerçek: 14 gün bekletme + manuel talep + admin onayı. `getOwnerBalance` client'a `commissionRate: 0` dönüyor. Keşif ajanı ayrıca **gerçek para bug'ları** buldu: (a) komisyon çifte-kaynak — intent %15 yazarken cüzdan %90 kredilendiriyor (defterler çelişiyor); (b) **rezervasyon iadesinde owner kazancı geri alınmıyor** (çifte ödeme açığı); (c) owner'ın kendi girdiği manuel kart ödemesi kendine kazanç yazabiliyor (self-credit deliği); (d) ölü `admin_process_withdrawal` çifte-ödeme yolu olarak duruyor.

**Çözüm mimarisi — 5 katman:**
- **L1 Defter doğruluğu (ÖNCE):** `credit_owner_booking_earning` → komisyon SSOT `calculate_commission`'a bağlanır; her cüzdan satırına `gross_amount/commission_rate/commission_amount` damgalanır (geçmiş, oran değişse de doğru kalır). `reverse_booking_earnings()` iade geri-alma (PENDING→iptal, COMPLETED→negatif telafi satırı). `booking_payments.source` kolonu ('APP'|'OWNER_MANUAL') — trigger yalnız CARD+APP kredilendirir. Ölü withdrawal RPC'si `RAISE EXCEPTION 'DEPRECATED'` ile etkisizleştirilir.
- **L2 IBAN SSOT:** `owner_payout_accounts` (kullanıcı-seviyesi — cüzdan kullanıcı-başına olduğu için doğru gren; `pitches.iban` + `pitch_bank_accounts`'tan backfill). IBAN değişiminde `iban_changed_at` damgası.
- **L3 Haftalık otomatik payout:** Pazartesi 06:00 TR cron `auto_create_owner_payouts()`: available ≥ **250₺** olan her owner'a otomatik `payout_requests` (tip `OWNER_AUTO`), kullanıcı-başı advisory lock. **Otomatik onay** = hesap doğrulanmış + tutar ≤ **10.000₺** + anomali yok (ilk payout / IBAN <72s önce değişti / hesap <30 gün / iade sıçraması → FINANCE kuyruğuna `anomaly_reason` ile). Banka transferini insan yapar (`admin_process_payout` COMPLETED + dekont ref) — iyzico payout API'si gelene dek SIMULATION/IYZICO'da aynı çalışır. Kill-switch: `owner_auto_payout_enabled`. Bekletme **14→7 gün** (settings tek satır).
- **L4 Şeffaflık UI:** `get_owner_finance_summary` (gerçek oran; commissionRate:0 yalanı ölür) + `get_owner_reconciliation` → FinanceView üstünde 3-kova şerit: **[💵 Nakit — sende] [💳 Kartta bekleyen · çözülme tarihi] [✅ Çekilebilir]**; rezervasyon başına brüt→komisyon→net satırı; aylık komisyon kartı; CSV+PDF "Hesap Ekstresi"; HOME'da **"Sıradaki ödeme: Pzt 14 Tem · ₺3.240 → TR** 1234"** widget'ı.
- **L5 Dürüst onboarding (EN SON gemiye biner):** %0-ilk-30-gün teaser'ı gerçekten implemente edilir (`commission_config`'e `valid_from/valid_until`; partner onayında seed). Metin: *"İlk 30 gün %0, sonrasında %10 komisyon"* + *"Kart kazançları 7 gün sonra çözülür ve her Pazartesi otomatik IBAN'ınıza gönderilir"* — **vaat, gerçeğin önüne asla geçmez.**

**DB:** 7 migration (`owner_payout_accounts` · `commission_unify_and_source` · `booking_earning_reversal` · `auto_payout` · `owner_finance_rpcs` · `intro_commission_window` · `payout_days_admin`).

**Kod:** `pitchOwnerService.getOwnerBalance` yeniden · `OwnerWithdrawalsModal` (sahte ₺12.500 mock'u silinir; elle IBAN formu → birincil hesap kartı) · `OwnerFinanceView` 3-kova + kırılım · `OwnerPanel` HOME widget · `OwnerPayoutAccountsModal` (yeni) · `PartnerOnboarding` metinleri · admin `FinancePage` "Bugün Ödenecekler / İncelemede" sekmeleri.

**Rollout Faz 0 (bayraksız, hemen):** komisyon birleştirme + source kolonu + iade geri-alma + ölü RPC etkisizleştirme — **gerçek para bug'ları, Sprint 0'da.**

**Kabul kriteri:** Test iadesi → owner cüzdanında negatif telafi netleşir; Pazartesi cron'u sandbox'ta ≥250₺ hesaba otomatik payout üretir; FinanceView kovaları `booking_payments` toplamlarıyla kuruşu kuruşuna tutar.

---

## P4 — TESİS TEK BAKIŞTA: ÇOK-KORT TAKVİM 🗓️

**Problem (kanıt):** Takvim 1 kort × 1 gün; "aylık" görünüm aslında sadece abonman listesi. Keşif ajanı ayrıca 4 gerçeklik bug'ı buldu: **UTC tarih kayması** (TR owner'lar 00:00-03:00 arası önceki günü sorguluyor!), çok saatlik rezervasyonun yalnız başlangıç saatinde görünmesi (2 saatlik kiralamada "boş" delik), tekrarlayan kapanışların hiç render edilmemesi, `court_id=NULL` eski kayıtların kaybolması.

**Çözüm mimarisi:** Üç mod — **GÜN** (mevcut, drill-down) · **TESİS** ("Bu Gece": satır=saat, sütun=kort, renk kodu APP/MANUEL/ABONMAN/BEKLEYEN/KAPALI/HOLD/CONFLICT/BOŞ; boş hücreye dokun → hızlı rezervasyon) · **HAFTA** (kort başına 7g×saat + tesis geneli kort×gün ısı haritası). Hepsi **tek RPC** `get_facility_schedule(pitch_id, from, to)` (ham varlık listeleri döner — 5 kortluk hafta için ~50 rezervasyon vs 840 slot objesi; ≤31 gün pencere; owner/staff/admin yetki kapısı). Birleştirme client'ta saf modül `facilityScheduleModel.ts` (unit-testli; gece-yarısı taşan rezervasyon, tekrarlayan kapanış, CONFLICT türetme, **gerçek doluluk %** — uydurma /24 formülü silinir, 08:00-24:00 operasyon penceresi tek payda). `pitch_slot_holds` canlı "Alınıyor" nabzı gösterilir (oyuncu tam alırken telefonla çifte satışı önler). Realtime tek kanala konsolide; takvim OwnerPanel'den `OwnerCalendarView.tsx`'e çıkarılır (P1'in snapshot'ı tam bu payload'ı cache'ler).

**DB:** `20260710000001_owner_facility_schedule` (RPC + recurring index + flag seed) · `..02_backfill_single_court_bookings` (tek-kortlu tesislerde NULL→kort; çok-kortluda "Tesis geneli" banner satırı).

**Kod:** `facilityScheduleModel.ts` + testleri (yeni) · `OwnerCalendarView` + `OwnerFacilityDayGrid` + `OwnerWeekView` + `OwnerQuickBookingSheet` (yeni; OwnerPanel'den ~660 satır çıkar) · `ownerCalendarHelpers.localDateISO` (UTC bug düzeltmesi) · `OwnerBookingDetailModal` (tarih+telefon+süre gösterimi).

**Bayrak:** `owner_facility_schedule` — kapalıyken bugünkü davranış bire bir (tarih düzeltmesi hariç). Çok kortlu tesis varsayılan TESİS moduna açılır.

**Kabul kriteri:** 3 kortlu tesiste akşam 20:00-22:00 tüm doluluk tek ekranda; 2 saatlik rezervasyon iki hücreyi de kaplar; 00:30'da açılan panel doğru günü gösterir.

---

## P5 — KANTİN-LITE POS + GERÇEK VERESİYE + FİŞ 🧾

**Problem (kanıt):** Kantin tablosu yok (yalnız amenity checkbox); `pitch_debtors` kişi başı tek düz tutar — kalem yok, kısmi ödeme yok; nakit müşteriye fiş yok. `pdfkit` bağımlılığı **hiçbir yerde import edilmiyor** (ölü ağırlık).

**Çözüm mimarisi:**
- **Kantin-lite:** `pitch_products` (ad, fiyat, emoji, sıra) + `pitch_sales` + `pitch_sale_items` (fiyat-anlık-görüntülü satırlar); tek atomik RPC `record_pitch_sale` — TAB satışı aynı transaction'da veresiye CHARGE'ını yaratır. **Kantin parası booking_payments/cüzdana ASLA girmez** (OYNA'nın dokunmadığı para; komisyon 0 — yapısal olarak). 3-tık POS bottom sheet (ürün grid → toplam → Nakit/Kart/Veresiye), HOME+TAKVİM'de FAB.
- **Veresiye v2:** `pitch_debtor_entries` append-only defter (CHARGE|PAYMENT; satış/rezervasyon bağlantılı; düzeltme = telafi kaydı, asla UPDATE/DELETE). AFTER INSERT trigger `pitch_debtors.amount_owed`'ı türetilmiş önbellek olarak günceller → **eski UI/index/KVKK export hiç bozulmadan çalışmaya devam eder**. Mevcut bakiyeler açılış CHARGE'ı olarak backfill (idempotent). Borçlu detayı: zaman çizelgesi + kısmi tahsilat + tel: linki. Rezervasyona bağlı PAYMENT aynı RPC'de `booking_payments` satırı da yazar (çifte sayım tek kuralla önlenir).
- **Fiş:** Saf client-side Türkçe **metin fişi** (`receiptService.ts`) → `navigator.share` → wa.me → pano fallback zinciri. Sıfır bağımlılık; `pdfkit` package.json'dan **kaldırılır**. PNG fiş fast-follow.
- **Finans entegrasyonu:** `owner_canteen_daily_summary` view'ı (İstanbul günü) → FinanceView'a KANTİN kovası; TAB cirosu "tahsil edilmemiş" ayrı gösterilir (tahakkuk/nakit karışmaz — P3 kovalarıyla tutarlı).

**DB:** `20260710000001_kantin_lite_pos` · `..02_veresiye_ledger_v2` (sıra kritik: tablo → backfill → trigger).

**Kod:** `OwnerQuickSaleSheet` + `OwnerCanteenProductsModal` + `OwnerDebtorDetailModal` + `receiptService.ts` (yeni) · `OwnerFinanceView` + `OwnerPanel` FAB + `OwnerBookingDetailModal` ("MAKBUZ PAYLAŞ" + "VERESİYEYE YAZ") · `SettingsScreen` KVKK export'una yeni tablolar.

**Bayraklar:** `owner_canteen_enabled`, `owner_veresiye_v2_ui`. POS tüm planlarda ücretsiz; kantin ANALİTİĞİ Pro'da.

**Kabul kriteri:** Backfill sonrası tek SQL assert: her açık borçlu için kayıt-toplamı == amount_owed; cuma akşamı senaryosu: 3 dokunuşta satış + WhatsApp'tan fiş; kısmi tahsilat bakiyeyi doğru düşer.

---

## P6 — PERSONEL GİRİŞİ + ESNEK REZERVASYON + ŞEFFAF GO-LIVE 👥

**Problem (kanıt):** Personel = kayıt, login değil (tek çare şifre paylaşmak). Manuel rezervasyon: sabit 1 saat, sabit %25 kapora, telefon not alanında (`OwnerPanel.tsx:862-897`). Go-live: sessiz admin onayı, "24 saat" vaadi veriye dayanmıyor; üstelik onboarding'in admin bildirimi SUPER_ADMIN'leri atlıyor (bug).

**Çözüm mimarisi:**
- **(A) Personel hesapları — saha-kapsamlı üyelik, YENİ GLOBAL ROL DEĞİL:** `pitch_staff_members.user_id` + `staff_role` ('RESEPSIYON'|'MUDUR') — admin_team_members RBAC şablonunun aynısı; `profiles.role`/RoleSwitcher'a **dokunulmaz**. 3 katman: SECURITY DEFINER yardımcılar (`is_pitch_staff`) → operasyonel tablolara EKLEMELİ RLS policy'leri (rezervasyon okuma, ödeme okuma+yazma, veresiye, görevler) → UI kapsamı (`staffPermissions.ts`). **Para/PII tablolarına staff dalı YOK** (banka, payout, cüzdan, owner_accounts — cüzdan zaten kullanıcı-kapsamlı, personel fiziksel olarak göremez; MÜDÜR finansta cüzdan/payout bileşenleri UNMOUNT edilir, sadece disabled değil). Davet: 8 haneli tek-kullanımlık kod (72s, WhatsApp/sözlü paylaşım — bu işletmelerin gerçek çalışma şekli; SMS/e-posta altyapısı gerekmez) + `oyna://davet/<kod>` deep link. Offboarding: `revoked_at` → RLS anında keser. Denetim: rezervasyonlara `created_by` → "Oluşturan: Ahmet".
- **(B) Esnek manuel rezervasyon:** DB zaten serbest süreyi destekliyor (tsrange) — kısıt client'ta. Süre stepper'ı (60-180dk, 30dk adım; başlangıç saatleri v1'de saat başı), **sunucu-fiyatlı** çok saatlik toplam (Gündüz/Akşam tarife sınırları doğru fiyatlanır), fiyat override (sunucu sınırı: 0 ≤ fiyat ≤ 2× tarife; 0 = "hatır maçı"), kapora %25/%50/Tam/Özel + yöntem (Nakit/Kart/Havale) `booking_payments` satırı olarak, düzgün `customer_phone` alanı, "Müşteriyi kaydet" → `pitch_customers` + telefon/ad autocomplete (müdavimler).
- **(C) Şeffaf go-live:** `OwnerGoLiveChecklist` ekranı + `get_pitch_golive_status` RPC (onay durumu · aktif tarife · fotoğraf · IBAN · çalışma saatleri madde madde) + görünür SLA sayacı (`pitch_review_sla_hours=24`). Adanmış `admin_approve_pitch`/`admin_reject_pitch` RPC'leri (audit + owner'a push + red gerekçesi) + `resubmit_pitch_verification`. `is_open` kapısı DB trigger'ıyla sertleştirilir (`enforce_verified_open` bayrağı, demo muaf). SUPER_ADMIN bildirim bug'ı düzelir.

**DB:** 4 migration (`staff_access_foundation` · `staff_rls_and_rpc_gates` · `flexible_manual_booking` · `golive_transparency`).

**Kod:** `staffPermissions.ts` + `StaffInviteSheet` + `OwnerGoLiveChecklist` (yeni) · `OwnerPanel` viewerRole prop + sekme/menü filtreleri · `OwnerTeamView` davet akışı + durum chip'leri · `OwnerFinanceView` MÜDÜR kapsamı · `ProfileScreen` "Tesis Paneli — Personel" girişi · `App.tsx` staff bootstrap · admin approve/reject.

**Kabul kriteri:** RESEPSİYON hesabı rezervasyon girer/iptal eder ama FINANCE sekmesini hiç göremez; PostgREST ile payout_requests SELECT denemesi 0 satır döner; davet kodu ikinci kez kullanılamaz; iptal edilen personelin oturumu anında yetkisiz kalır.

---

## 7. Sprint Planı (tek geliştirici, bağımlılık-sıralı)

Bağımlılıklar: P4'ün RPC'si → P1'in snapshot'ı bunu cache'ler · P4'ün takvim extraction'ı → P1 overlay + P6-B modal bunun üstüne · P2/P3 Faz-0 güvenlik yamaları her şeyden önce · P6-A `created_by` → P5 satış denetimi kullanır · Onboarding metinleri **en son** (vaat gerçeğin önüne geçmez).

| Sprint | Süre | İçerik | Pilot owner'a kanıtlanan |
|---|---|---|---|
| **S0 — Sessiz Güvenlik & Para Doğruluğu** | 2-3 gün, HEMEN | P2-Faz0 (owner self-upgrade RLS deliği) + P3-L1 (komisyon SSOT, source kolonu, iade geri-alma, ölü withdrawal RPC) + P4 tarih bug düzeltmesi | (görünmez ama parayı ve güvenliği düzeltir) |
| **S1 — Güven Temeli** | 2 hafta | P2 tamamı (kilitlenmez + self-servis fatura) + P3-L2/L4 (IBAN SSOT + 3-kova mutabakat + komisyon şeffaflığı) | "Panelim asla kilitlenmez; param kuruşuna kadar net" |
| **S2 — Tesis Tek Bakışta** | 2 hafta | P4 tamamı (TESİS/HAFTA + RPC + extraction) + P6-B esnek rezervasyonun modal kısmı | "Kağıt haftalık ızgaramdan daha iyi" |
| **S3 — Asla Kaybolmaz** | 2 hafta | P1 tamamı (outbox + idempotent RPC'ler + snapshot + CONFLICT akışı) | "İnternet kesildi, rezervasyon kaybolmadı" |
| **S4 — Para Otomatiği** | 2 hafta | P3-L3/L5 (Pazartesi otomatik payout + anomali kuyruğu + teaser + onboarding metinleri) + P6-C go-live checklist | "Pazartesi param elimi sürmeden geldi" |
| **S5 — Defterin Kalanı** | 2 hafta | P5 tamamı (kantin POS + veresiye v2 + fiş) | "Kağıt defteri çöpe attım" |
| **S6 — Ekip** | 2 hafta | P6-A personel hesapları + kalan cila + uçtan uca cihaz QA | "Kasiyerim kendi hesabıyla çalışıyor" |

Her sprint bağımsız gemiye biner (feature flag); geri dönüş = bayrağı kapatmak.

---

## 8. Sana Kalan Kararlar (önerilerimle — tek geçişte onaylayabilirsin)

| # | Karar | Önerim | Gerekçe |
|---|---|---|---|
| 1 | Payout bekletme 14→**7 gün**? | ✅ Evet | En güçlü tek güven kolu; mekanizma tek satır ayar; 7g + Pazartesi otomatiği = her kart lirası en geç 14 günde, çoğu ~10 günde hesapta |
| 2 | Çekirdek (CORE_OPS) **sonsuza dek ücretsiz**? | ✅ Evet | Stratejik varlık, owner'ın operasyonel verisinin OYNA'da yaşaması; ön büroyu kilitleyebilen araca kimse tam geçmez |
| 3 | SaaS askıdayken **para çekme açık** kalsın? | ✅ Evet | Owner'ın kendi geliri faturaya rehin tutulamaz (güven + TR hukuku gri alanı); istismar için ayrı admin `ops_locked` var |
| 4 | Komisyon birleştirme: saha kaporası **%10** mu %15 mi? | **%10** | Cüzdan zaten fiilen %90 kredilendiriyor; %15'e çıkmak mevcut owner'lara zam olur |
| 5 | %0 ilk-30-gün **gerçekten implemente**? | ✅ Evet | Zaten vaat edilmiş; SSOT üstünde ~1 gün; ilk ay kırılımda "%0 → ₺0 komisyon" satırı güçlü güven anı |
| 6 | Otomatik onay limiti **10.000₺** / min payout **250₺**? | ✅ Kabul | Yoğun hafta sonu 2 kortlu tesis ~₺6-8k net; üstü zaten anomali incelemesine düşer |
| 7 | CONFLICT'te alınmış nakit → vazgeçilirse **otomatik alacak kaydı**? | ✅ Evet | Fiziksel para asla sessizce kaybolmaz |
| 8 | Kantin POS **tüm planlarda ücretsiz**, analitik Pro'da? | ✅ Evet | POS günlük alışkanlık yaratır (defteri öldüren şey); analitik satılabilir katman |
| 9 | RESEPSİYON **onaylı rezervasyonu iptal edebilsin**? | ✅ Evet | Gerçek hayatta aynı-gün iptali masadaki kişi yapar; iade matematiği zaten tamamen sunucuda + created_by denetimi |
| 10 | Fiyat override sınırı **0–2× tarife**, kapora ≤ fiyat? | ✅ Kabul | 0 = hatır maçı serbest; 2× üstü muhtemelen giriş hatası |

---

## 9. Genel Kabul Testi (pilot tesiste, S6 sonunda)

Bir cuma günü, pilot tesiste, OYNA ekibi yanında **hiç dokunmadan**:
1. Sabah kasiyer kendi hesabıyla açar; telefonla gelen müşteriyi 90dk + özel kaporayla girer.
2. Öğlen internet kesilir; 2 kapı rezervasyonu + 3 kantin satışı girilir → bağlantı gelince hepsi senkron, sıfır çift kayıt.
3. Akşam owner TESİS görünümünde 3 kortun gecesini tek bakışta görür; bir müdavimin veresiyesine tost yazılır, WhatsApp'tan fiş gider.
4. Pazartesi sabahı payout otomatik oluşur; owner HOME'da tarihi ve tutarı önceden görmüştür; FinanceView kovaları banka ekstresi + kasadaki nakitle tutar.
5. O hafta hiç kağıda hiçbir şey yazılmamıştır. ✅

> **Bu plan onaylandığında Sprint 0 (2-3 günlük sessiz güvenlik + para doğruluğu yamaları) hemen kodlanabilir — hiçbir dış bağımlılığı yok.**
