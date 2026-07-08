# Saha Sahibi Paneli — Kod Denetimi & Uygulama Planı

> **Tarih:** 7 Temmuz 2026 · **Kapsam:** `views/OwnerPanel.tsx`, `views/owner/**`, `hooks/useOwnerEntitlements.ts`, `services/pitchOwnerService.ts`, `views/PartnerOnboarding.tsx` + ilgili `supabase/migrations/**` RPC/trigger/RLS.
> **Yöntem:** Dosya:satır kanıtlı statik denetim; bugünkü kodun `docs/master/KATMAN2_SAHA_SAHIBI_COZUM_PLANI.md` (P1–P6) ile karşılaştırması.
> **Amaç:** Panelde bugün açık olan HER problemi kanıtla listelemek + neyin zaten yapıldığını ayırmak + sıralı bir düzeltme planı.

---

## 0. Yönetici Özeti

Sprint 0'ın **sessiz güvenlik/para** yamalarının bir kısmı **uygulanmış** (owner self-upgrade RLS deliği kapandı, manuel rezervasyon RPC'si sunucu-yetkili + sunucu-fiyatlı, nakit tahsilat cüzdana yazılmıyor). Ancak KATMAN2'nin görünür güven kalemlerinin **çoğu hâlâ açık**: fatura-tabanlı panel kilidi hâlâ kodda, komisyon istemciye `0` olarak yalan söyleniyor, takvim tek-kort + yanlış doluluk formülü, manuel rezervasyon sabit 1 saat/%25, sahte ₺12.500 bakiye, onboarding "her Pazartesi otomatik" yalanı ve manuel rezervasyon+ödeme atomik değil.

**Şiddet dağılımı:** 5 × P0 (para/güvenlik/veri) · 7 × P1 (fonksiyonel) · 11 × P2 (UX/tutarlılık) · 4 × P3 (kod sağlığı).

---

## 1. Sprint 0 Gerçeklik Tablosu (plan → bugünkü kod)

| KATMAN2 maddesi | Durum | Kanıt |
|---|---|---|
| owner self-upgrade RLS deliği kapatılsın | ✅ YAPILDI | `20260710000001_owner_account_privilege_guard.sql` — `guard_owner_account_update` trigger, plan/status/entitlements'ı authenticated owner'a kilitler |
| manuel rezervasyon sunucu-yetkili + sunucu-fiyatlı | ✅ YAPILDI | `create_pitch_booking` SECURITY DEFINER, `v_is_owner OR v_is_admin` + `get_current_tariff_price` (`20260613090000`) |
| nakit tahsilat cüzdana yazılmasın | ✅ YAPILDI | `credit_owner_booking_earning`: `payment_method IS DISTINCT FROM 'CARD' → RETURN` (`20260706000001`) |
| komisyon SSOT (sunucu) | ✅ KISMEN | trigger `platform_commission_rate` (varsayılan 10) uygular; ama **istemci `commissionRate: 0` alır** (aşağıda P0-3) |
| takvim tarih kayması (UTC) | ⚠️ KISMEN | `ownerCalendarHelpers.localDateISO` panelde düzeltilmiş; **servis katmanı `pitchOwnerService.todayISO()` hâlâ UTC** (P1-11) |
| istemci fatura-kilidi sökümü | ❌ YAPILMADI | `useOwnerEntitlements.isReadOnly` hâlâ `status ∈ {suspended,cancelled}` (P2-17) |
| 3-kova mutabakat / IBAN SSOT / otomatik payout | ❌ YAPILMADI | FinanceView tek "NET KAZANÇ"; `owner_payout_accounts` yok; Pazartesi cron yok |
| çok-kort takvim + gerçek doluluk | ❌ YAPILMADI | tek `selectedCourtId`, `/24` ve `/16` formülleri |
| esnek manuel rezervasyon (süre/kapora/yöntem) | ❌ YAPILMADI | sabit 1 saat / %25 / CASH |
| offline outbox | ❌ YAPILMADI | `services/offline/` yok |
| kantin POS + veresiye v2 + fiş | ❌ YAPILMADI | `pitch_debtors` tek düz tutar |
| personel gerçek login | ❌ YAPILMADI | `pitch_staff_members` yalnız kayıt, `is_pitch_staff` RLS yok |
| onboarding dürüst metin | ❌ YAPILMADI | "her Pazartesi" + "%0 ilk 30 gün" vaadi duruyor |

---

## 2. Bulgular (kanıtlı)

### P0 — Para / Güvenlik / Veri kaybı

**OP-P0-1 · Manuel rezervasyon + ödeme atomik değil** — `views/OwnerPanel.tsx:867-883`
`createManualBooking` (RPC) başarılı olup ardından ayrı `recordBookingPayment` (booking_payments INSERT) çağrılıyor. İkinci adım ağ/hata ile kesilirse **CONFIRMED rezervasyon var ama tahsilat kaydı yok** (veya tersi) — defter tutmaz. *KATMAN2: P1.*
→ Fix: tek `owner_create_manual_booking` RPC'si (rezervasyon + nakit ödeme aynı transaction, idempotent `client_request_id`).

**OP-P0-2 · Manuel KART ödemesi self-credit açığı** — `services/pitchOwnerService.ts:305-326` + `credit_owner_booking_earning` trigger
Trigger yalnız `payment_method='CARD'`'ı süzer ama **ödemenin kaynağını (APP mı OWNER_MANUAL mı) ayırt etmez**. Owner kapıda kendi fiziki POS'undan aldığı kartı `recordBookingPayment(id, tutar, 'CARD')` ile girerse OYNA cüzdanına net kredi yazılır → owner parayı **iki kez** alır (POS + OYNA payout). Bugün quick-create'te yöntem CASH sabit olduğu için UI ile örtülü; **veri katmanında açık**. *KATMAN2: P3(c).*
→ Fix: `booking_payments.source` ('APP'|'OWNER_MANUAL') kolonu; trigger yalnız `source='APP' AND method='CARD'` kredilendirir.

**OP-P0-3 · Komisyon istemciye gizleniyor / net kazanç şişik** — `services/pitchOwnerService.ts:847` + `views/owner/OwnerFinanceView.tsx:72-74`
`getOwnerBalance` daima `commissionRate: 0` döner. FinanceView "NET KAZANÇ" = `monthCollected − expense` — **OYNA komisyonu düşülmez**. Owner %10'u hiç görmez, eline geçecek parayı olduğundan yüksek sanır. *KATMAN2: P3-L4.*
→ Fix: `get_owner_finance_summary` gerçek oranı döndürsün; FinanceView brüt→komisyon→net kırılımı + 3-kova şerit.

**OP-P0-4 · Sahte ₺12.500 bakiye mock'u** — `views/owner/menu/OwnerWithdrawalsModal.tsx:29` + `views/OwnerPanel.tsx:1816`
Gerçek olmayan/mock tesiste uydurma `12500` bakiye gösterilir; demo owner çekilebilir gerçek para sanabilir. *KATMAN2: P3.*
→ Fix: mock kaldır; gerçek `get_wallet_summary` yoksa `0` + "veri yok" durumu.

**OP-P0-5 · Rezervasyon iadesinde owner kazanç geri-alma (DOĞRULANMALI)** — `services/pitchOwnerService.ts:289-303` (`owner_cancel_confirmed_booking`)
Onaylı rezervasyon iptalinde oyuncuya cüzdan iadesi yapılırken owner'ın BOOKING_EARNING'inin negatif telafi ile geri alındığı **doğrulanamadı** (`faz7_refund_corrections` maç-kazancı içindi). Geri alınmıyorsa çifte-ödeme açığı. *KATMAN2: P3(b).*
→ Fix: `reverse_booking_earnings()` (PENDING→iptal, COMPLETED→negatif telafi) + iptal RPC'sine bağla; migration + SQL assert testi.

### P1 — Fonksiyonel bug

**OP-P1-6 · Doluluk formülü yanlış** — `views/OwnerPanel.tsx:470`, `services/pitchOwnerService.ts:1045,1068`
Takvim başlığındaki doluluk `currentBookings.length / 24` (rezervasyon **sayısı** / 24 **saat**). Servis tarafı sabit `/16` payda + booking sayısı. 2 saatlik rezervasyon 1 sayılır; gece ölü saatler paydada; gerçek doluluğu yansıtmaz. *KATMAN2: P4.*

**OP-P1-7 · Çok-saatlik rezervasyon tek saatte görünür (çifte-satış riski)** — `views/OwnerPanel.tsx:234` (`duration:1`), `services/pitchOwnerService.ts:1020-1024`
`mapDbBookingToCalendar` süreyi 1 sabitler; `buildHourlyOccupancyGrid` yalnız başlangıç saatinin eşitliğine bakar. 20:00-22:00'lik kiralamanın 21:00 hücresi takvimde **"BOŞ"** görünür → telefonla o saate ikinci satış. *KATMAN2: P4.*

**OP-P1-8 · Takvim tek kort × tek gün** — `views/OwnerPanel.tsx:462`, `FinancialCalendarView` (tek `selectedCourtId`)
`currentBookings = bookings.filter(b.pitchId === selectedCourtId)`. Çok kortlu tesis tek bakışta görülemez; "Aylık" görünüm aslında yalnız abonman listesi (`OwnerPanel.tsx:548-662`). *KATMAN2: P4.*

**OP-P1-9 · İstemci otomatik-onay, toggle'ı yok sayıyor + ekran kapalıysa çalışmıyor** — `views/OwnerPanel.tsx:144-156` (`MatchCountdownItem`)
Sayaç 0'a inince `autoApprove` bayrağına **bakmadan** `onApprove()` çağrılır — owner "Otomatik Onay KAPALI" dese bile HOME widget'ındaki sayaç bitince rezervasyon onaylanır. Üstelik onay yalnız ekran açıkken tetiklenir; owner uygulamayı kapatırsa hiç çalışmaz (sunucu cron'u onaylamıyorsa oyuncu sonsuz bekler). *KATMAN2: YENİ / P6-C komşusu.*
→ Fix: istemci auto-approve'u kaldır; onay/red kararı sunucu cron'una (`auto_approve_enabled` + `auto_approve_minutes`) taşınsın.

**OP-P1-10 · Aynı realtime kanal adı çakışması** — `services/pitchOwnerService.ts:1642` (`owner-bookings-${pitchId}`)
`subscribeToOwnerBookings` hem `FinancialCalendarView` (`OwnerPanel.tsx:379`) hem `OwnerPanelInner` (`OwnerPanel.tsx:1652`) tarafından çağrılır → **aynı topic'e iki abonelik**. Supabase aynı kanal adına ikinci aboneliği güvenilir yürütmez; biri sessizce güncelleme almayabilir. *KATMAN2: YENİ.*
→ Fix: kanal adına benzersiz sonek (çağıran + rastgele) ya da tek merkezi abonelik.

**OP-P1-11 · Servis katmanında UTC tarih kayması** — `services/pitchOwnerService.ts:162` (`todayISO`)
`new Date().toISOString().slice(0,10)` = UTC günü. TR'de 00:00-03:00 arası önceki günü döndürür; `getWeeklyRevenue`, `getPendingBookings`, aylık finans pencereleri bunu kullanır → gece yarısı sonrası yanlış gün. Panel `localDateISO` ile düzeltilmiş ama servis açık. *KATMAN2: P4 (kısmen).*

**OP-P1-12 · approveBooking yalnız status flip** — `services/pitchOwnerService.ts:235-246`
CONFIRMED yapar ama cüzdanla ödenmiş (pre-auth) app rezervasyonunda **capture tetiklemez**, oyuncuya onay bildirimi göndermez, onay anında yeniden çakışma kontrolü yapmaz. *KATMAN2: kısmen; doğrulama gerekli.*

### P2 — UX / tutarlılık / iş modeli kalıntısı

**OP-P2-13 · Onboarding'de yalan finans vaadi** — `views/PartnerOnboarding.tsx:331,233`
"Ödemeler **her Pazartesi** hesabınıza geçer" + "İlk 30 Gün **%0 Komisyon**". Gerçek: 2 hafta bekletme + **manuel talep + admin onayı** (`OwnerWithdrawalsModal.tsx:110`), otomatik Pazartesi payout **yok**, %0 intro penceresi implemente **değil**. Vaat gerçeğin önünde. *KATMAN2: P3-L5.*

**OP-P2-14 · Çekimde kayıtlı IBAN yok** — `views/owner/menu/OwnerWithdrawalsModal.tsx`
Her çekimde IBAN + sahip adı elden yazılır; `owner_payout_accounts` SSOT'u yok. *KATMAN2: P3-L2.*

**OP-P2-15 · Bakiye kullanıcı-bazlı ama tesis modalında** — `services/pitchOwnerService.ts:832` (`_pitchId` yok sayılır)
Çok tesisli owner tüm tesislerin birleşik bakiyesini tek tesis altında görür → yanıltıcı. *KATMAN2: not.*

**OP-P2-16 · Finans hata yutma** — `services/pitchOwnerService.ts:1296` (`getFinanceDashboard` catch → boş obje)
Sorgu hata verse bile owner sıfırlar görür, hatayı bilmez ("param yok mu, sistem mi bozuk?"). *KATMAN2: YENİ.*

**OP-P2-17 · Fatura-tabanlı panel kilidi hâlâ aktif** — `hooks/useOwnerEntitlements.ts:19-22`
`isReadOnly = status ∈ {suspended,cancelled}` ~20 guard noktasını (tab seçimi, quick-create, finance, team, withdrawals — `OwnerPanel.tsx:1460,720,2049,2085` vb.) kilitler. KATMAN2 P2 kararı: **çekirdek ASLA kilitlenmez**, yalnız admin `ops_locked`. *UYGULANMADI.*

**OP-P2-18 · Ölü abonelik/SaaS/plan-yükselt kalıntıları** — `OwnerSubscriptionModal`, `OwnerUpgradeGate` (`OwnerPanel.tsx:2088-2113`), `OwnerBillingSettingsModal`, `handlePlanUpgrade` (`OwnerPanel.tsx:1452`), `statusBanner "SaaS hesabınız…"` (`OwnerPanel.tsx:1697-1703`)
KATMAN2 P2: bu ekran/metinler **sökülmeli** (owner abonelik ödemez). *UYGULANMADI.*

**OP-P2-19 · Kapora sabit %25 + yalnız CASH** — `views/OwnerPanel.tsx:880-882`
Quick-create kaporası her zaman `Math.floor(rate*0.25)` nakit. Kart/havale, esnek oran (%50/tam/özel) yok. *KATMAN2: P6-B.*

**OP-P2-20 · Manuel rezervasyon sabit 1 saat** — `views/OwnerPanel.tsx:866`
`endTime = hour+1`; süre seçici yok. DB tsrange serbest süreyi destekler; kısıt istemcide. *KATMAN2: P6-B.*

**OP-P2-21 · Telefon iki alana yazılıyor** — `views/OwnerPanel.tsx:874-875`
`customer_phone` alanına VE `note: "Tel: …"` içine — tekrar; not alanı kirlenir. *KATMAN2: P6-B.*

**OP-P2-22 · Borç tutarı formatsız** — `views/owner/OwnerFinanceView.tsx:323`
`{d.amount_owed}₺` — diğer tutarlar `toLocaleString('tr-TR')`; tutarsız (ör. `12500₺` vs `12.500₺`).

**OP-P2-23 · Veresiye sığ + kantin/POS + fiş yok** — `services/pitchOwnerService.ts:635-680` (`pitch_debtors` tek düz `amount_owed`)
Kalem/kısmi ödeme/işlem geçmişi yok; kantin satışı ve fiş paylaşımı yok. *KATMAN2: P5.*

### P3 — Kod sağlığı

**OP-P3-24 · 2341 satırlık monolit** — `views/OwnerPanel.tsx`
Takvim + HOME + pending + menü tek dosyada; KATMAN2 `OwnerCalendarView` extraction'ı planlı (P4).

**OP-P3-25 · Ölü/sihirli `: 2000` fallback** — `views/OwnerPanel.tsx:878`
`rateVal = isQuickCreateOpen ? getSlotPrice(...) : 2000` — `isQuickCreateOpen` daima truthy olduğu için 2000 dalı ölü; yine de sihirli sabit, silinsin/sunucu-fiyatına devredilsin.

**OP-P3-26 · Offline yazma koruması yok** — `services/offline/` yok
İnternet kesikse kapı rezervasyonu hata verip kaybolur; `OfflineBanner` yalnız pasif şerit. *KATMAN2: P1.*

**OP-P3-27 · Personel gerçek login değil** — `pitch_staff_members` yalnız kayıt; `is_pitch_staff` RLS yok
Kasiyerin kendi hesabıyla çalışması için şifre paylaşımı tek çare. *KATMAN2: P6-A.*

---

## 3. Uygulama Planı (sıralı, feature-flag'li)

Bağımlılık kuralı: **para/güvenlik yamaları önce → görünür güven → tesis operasyonu → dayanıklılık → defter → ekip.** Her adım geri-dönüşü = bayrağı kapatmak.

### Faz A — Sessiz Para & Güvenlik Tamamlama (2-3 gün, bayraksız)
Sprint 0'ın eksik kalan para/güvenlik parçaları:
- **A1** `booking_payments.source` kolonu + `credit_owner_booking_earning`'i `source='APP'` ile kısıtla → **OP-P0-2** kapanır.
- **A2** `owner_create_manual_booking` RPC'si (rezervasyon + nakit ödeme tek transaction, idempotent) → **OP-P0-1**; `OwnerPanel.tsx` KAYDET tek çağrıya iner (**OP-P3-25** düşer).
- **A3** `reverse_booking_earnings()` + `owner_cancel_confirmed_booking`'e bağla + SQL assert → **OP-P0-5**.
- **A4** `pitchOwnerService.todayISO()` → `localDateISO` (TR günü) → **OP-P1-11**.
- **A5** İstemci auto-approve kaldır; sunucu cron'una devret → **OP-P1-9**.

### Faz B — Güven Temeli: Panel Kilidi & Komisyon Şeffaflığı (2 hafta, `owner_core_never_locks`)
- **B1** `useOwnerEntitlements`: fatura-tabanlı `isReadOnly` **sökülür**, yerine yalnız admin `ops_locked`; `guardWrite(capability)` → **OP-P2-17**.
- **B2** `OwnerSubscriptionModal` / `OwnerUpgradeGate` / `OwnerBillingSettingsModal` / SaaS banner / plan-yükselt CTA **silinir** → **OP-P2-18**.
- **B3** `get_owner_finance_summary` gerçek oran; FinanceView brüt→komisyon→net + 3-kova şerit ([💵 nakit] [💳 kartta bekleyen] [✅ çekilebilir]) → **OP-P0-3**.
- **B4** `owner_payout_accounts` IBAN SSOT; çekim modalı kayıtlı hesap kartı; mock ₺12.500 silinir → **OP-P0-4, OP-P2-14**.
- **B5** Finans hata durumu görünür (yutma kaldır) → **OP-P2-16**; borç tutarı `toLocaleString` → **OP-P2-22**.

### Faz C — Tesis Tek Bakışta + Esnek Rezervasyon (2 hafta, `owner_facility_schedule`)
- **C1** `get_facility_schedule(pitch, from, to)` tek RPC + saf `facilityScheduleModel.ts` (gece-taşan rezervasyon, çok-saat span, gerçek doluluk %) → **OP-P1-6, OP-P1-7, OP-P1-8**.
- **C2** GÜN / TESİS / HAFTA modları; `OwnerCalendarView` extraction → **OP-P3-24**.
- **C3** Esnek manuel rezervasyon: süre stepper (60-180dk), sunucu-fiyatlı çok-saat, kapora %25/%50/Tam/Özel + Nakit/Kart/Havale, temiz `customer_phone` → **OP-P2-19, OP-P2-20, OP-P2-21**.
- **C4** Realtime kanal adı benzersizleştir → **OP-P1-10**. approveBooking capture+bildirim+re-check → **OP-P1-12**.

### Faz D — Para Otomatiği & Dürüst Onboarding (2 hafta, `owner_auto_payout`)
- **D1** `auto_create_owner_payouts()` Pazartesi cron (≥250₺, ≤10.000₺ otomatik onay, anomali kuyruğu); bekletme 14→7g → **OP-P2-13 mekanizması**.
- **D2** %0 ilk-30-gün intro penceresi (`commission_config.valid_from/until`) gerçekten implemente.
- **D3** Onboarding metinleri gerçeğe hizalanır (**en son**) → **OP-P2-13 kapanır**.

### Faz E — Dayanıklılık + Defter + Ekip (3×2 hafta)
- **E1** Offline outbox (`services/offline/*`) + idempotent RPC'ler + snapshot → **OP-P3-26** (KATMAN2 P1).
- **E2** Kantin-lite POS + veresiye v2 (append-only defter, kısmi ödeme) + metin fişi → **OP-P2-23** (P5).
- **E3** Personel saha-kapsamlı login (`is_pitch_staff` RLS + davet kodu) → **OP-P3-27** (P6-A).

---

## 4. Kabul Kriterleri (özet)
- Admin bir hesabı `suspended` yapsa bile nakit kapı rezervasyonu girilir/kaydedilir (B1).
- FinanceView 3-kovası `booking_payments` toplamlarıyla kuruşu kuruşuna tutar; komisyon satırı görünür (B3).
- 3 kortlu tesiste 20:00-22:00 doluluk tek ekranda; 2 saatlik rezervasyon iki hücreyi kaplar (C1).
- Owner kapıda kartla tahsilat girse OYNA cüzdanına kredi yazılmaz (A1).
- Uçak modunda rezervasyon → "Kuyrukta" → bağlantıda senkron, çift kayıt yok (E1).
