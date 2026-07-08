# Saha Sahibi Paneli — Uygulama Planı (Kararlaştırılan Kapsam)

> **Tarih:** 7 Temmuz 2026
> **Kapsam (karar):** A (para/güvenlik) + B (takvim/rezervasyon) + F3-F4 (panel kilidi & ölü SaaS söküm) + G2 (dürüst onboarding). *Kaynak: `SAHA_SAHIBI_PANEL_IYILESTIRME_KATALOGU.md`.*
> **İlk faz (karar):** Takvim & Operasyon.
> **Stil (karar):** Küçük, feature-flag'li, tek tek doğrulanan PR'lar.

---

## Çalışma Yöntemi (her PR için değişmez kurallar)

1. **Feature-flag zorunlu** — her davranış değişikliği `feature_flags`/`app_config` arkasında; bayrak kapalıyken bugünkü davranış **bire bir** korunur. Geri-dönüş = bayrağı kapatmak (deploy gerektirmez).
2. **Migration eklemeli + idempotent** — `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`. Var olan kolon/tablo asla düşürülmez.
3. **Salt-okuma RPC'leri riske girmez** — yeni okuma yolları veriyi değiştirmez; önce onlar iner.
4. **Doğrulama** — her PR sonrası `verify` becerisi ile sandbox'ta canlı Supabase'e karşı Playwright sürüşü + gerektiğinde `execute_sql` sunucu doğrulaması.
5. **Kanıt** — her PR açıklamasında hangi katalog maddesini kapattığı (A1, B3…) + kabul kriteri.

---

## Faz Sırası (kararlaştırılan kapsam)

| Faz | İçerik | Katalog | Neden bu sıra |
|---|---|---|---|
| **1** | Takvim & Operasyon + doğal para yamaları | B1-B6, A1, A2, A5 | Owner'ın en çok dokunduğu ekran; yeni rezervasyon RPC'si para güvenliğini de kapatır |
| **2** | Görünür güven | A3, A6, F3, F4 | "Panelim kilitlenmez, param net" |
| **3** | Para otomatiği & dürüst onboarding | A4, A7, A8, A9, G2 | "Pazartesi param geldi, vaat = gerçek" |

Her faz bağımsız gemiye biner; fazlar arası bağımlılık yok (Faz 1 modeli Faz 2/3'e temel olur ama onları bloklamaz).

---

## FAZ 1 — Tesis Tek Bakışta + Esnek Rezervasyon (küçük PR zinciri)

### PR 1.0 — Sessiz para/tarih yamaları (DB + saf fonksiyon, UI yok) · *risk: çok düşük*
Bağımsız, UI'a dokunmayan, para-güvenliği hemen artıran eklemeler:
- **A2** `booking_payments.source` kolonu (`'APP'|'OWNER_MANUAL'`, nullable + backfill); `credit_owner_booking_earning` trigger'ı `source='APP' AND method='CARD'` ile daralt → manuel kart self-credit deliği kapanır.
- **A5** `reverse_booking_earnings()` + `owner_cancel_confirmed_booking`'e bağla (PENDING→iptal, COMPLETED→negatif telafi) + SQL assert testi → iade çifte-ödeme kapanır.
- **B6** `pitchOwnerService.todayISO()` → `localDateISO` (TR günü); `getWeeklyRevenue`/`getPendingBookings`/finans ay penceresi düzelir.
- **B4** `computeOverallOccupancy`/`computeCourtDailyStats` gerçek saat-bazlı payda (booking sayısı yerine kapladığı saat, 08:00-24:00 penceresi).
- Kabul: test iadesi → owner cüzdanında negatif telafi netleşir; 00:30'da açılan panel doğru günü sorgular.

### PR 1.1 — Takvim veri modeli (saf, test-edilebilir kütüphane, UI'a bağlı değil) · *risk: sıfır*
- `views/owner/facilityScheduleModel.ts` (yeni, saf): rezervasyon + kapanış + abonman + slot-hold listelerinden gün/hafta ızgarası türetir; **gece-taşan rezervasyon**, **çok-saat span** (B3), CONFLICT türetme, **gerçek doluluk %**.
- Kapsamlı unit test. Henüz hiçbir ekrana bağlanmaz → canlı sıfır risk.

### PR 1.2 — `get_facility_schedule` RPC (eklemeli, salt-okuma) · *risk: düşük*
- Migration: `get_facility_schedule(p_pitch_id, p_from, p_to)` SECURITY DEFINER; owner/staff/admin yetki kapısı; ham varlık listeleri döner (≤31 gün pencere).
- `pitchOwnerService.getFacilitySchedule()` wrapper. Veri değiştirmez.

### PR 1.3 — TESİS görünümü (flag: `owner_facility_schedule`) · *risk: orta, flag korumalı*
- `OwnerFacilityDayGrid` (satır=saat, sütun=kort, renk-kodlu APP/MANUEL/ABONMAN/BEKLEYEN/KAPALI/CONFLICT/BOŞ). **B1**
- Çok-saatlik rezervasyon tüm hücreleri kaplar (model'den). **B3**
- Boş hücreye dokun → hızlı rezervasyon. **B10**
- Flag kapalı: bugünkü GÜN görünümü aynen. Açık: çok-kortlu tesis varsayılan TESİS.

### PR 1.4 — HAFTA görünümü + ısı haritası (aynı flag) · *risk: düşük*
- `OwnerWeekView` (kort×7g) + tesis geneli kort×gün ısı haritası. **B2**
- Tekrarlayan slot kapatma düzgün render. **B11**

### PR 1.5 — Esnek manuel rezervasyon + atomik RPC (flag: `manual_booking_v2`) · *risk: orta, flag korumalı*
- Migration: `owner_create_manual_booking(...)` — **rezervasyon + (opsiyonel) ödeme tek transaction, idempotent `client_request_id`**. Sunucu-fiyatlı çok-saat toplam. **A1**
- Ödeme satırına `source='OWNER_MANUAL'` damgalanır (A2 ile tam kapanış).
- `OwnerQuickBookingSheet`: süre stepper (60-180dk), kapora %25/%50/Tam/Özel, Nakit/Kart/Havale, temiz `customer_phone` (note kirliliği biter), fiyat override (0 ≤ x ≤ 2× tarife). **B5**
- Flag kapalı: bugünkü 1-saat/%25/CASH akışı; ama atomik RPC erken kazanç olarak açılabilir.

### PR 1.6 — Realtime + extraction cila · *risk: düşük*
- Realtime kanal adını benzersizleştir (çift-abonelik çakışması). **B8**
- Auto-approve'u sunucu cron'una taşı; istemci sayacı kaldır (ekran kapalıyken de çalışır, toggle'a uyar). **B7**
- (Opsiyonel) `OwnerCalendarView` extraction — monolit küçülür. **F5**

**Faz 1 genel kabul:** 3 kortlu tesiste 20:00-22:00 doluluk tek ekranda; 2 saatlik rezervasyon iki hücreyi de kaplar; 90dk + özel kaporalı manuel rezervasyon tek RPC ile atomik girilir; senkron ortasında uygulama öldürülüp açılınca çift kayıt yok.

---

## FAZ 2 — Görünür Güven (özet)
- **A3** `get_owner_finance_summary` gerçek komisyon oranı; FinanceView brüt→komisyon→net. `commissionRate: 0` yalanı ölür.
- **A6** 3-kova mutabakat şeridi [💵 nakit] [💳 kartta bekleyen] [✅ çekilebilir].
- **F3** `useOwnerEntitlements`: fatura-tabanlı `isReadOnly` sökülür; yalnız admin `ops_locked`.
- **F4** `OwnerSubscriptionModal`/`OwnerUpgradeGate`/`OwnerBillingSettingsModal`/SaaS banner/plan-yükselt CTA silinir.

## FAZ 3 — Para Otomatiği & Dürüst Onboarding (özet)
- **A4** sahte ₺12.500 mock kaldır. **A7** `owner_payout_accounts` IBAN SSOT.
- **A8** `auto_create_owner_payouts()` Pazartesi cron + HOME "Sıradaki ödeme" widget'ı; bekletme 14→7g.
- **A9** %0 ilk-30-gün intro penceresi gerçekten implemente. **G2** onboarding metinleri gerçeğe hizalanır (**en son**).

---

## Bayrak Envanteri
`owner_facility_schedule` (Faz 1 takvim) · `manual_booking_v2` (Faz 1 esnek rezervasyon) · `owner_finance_transparency` (Faz 2) · `owner_core_never_locks` (Faz 2 kilit söküm) · `owner_auto_payout` (Faz 3).
