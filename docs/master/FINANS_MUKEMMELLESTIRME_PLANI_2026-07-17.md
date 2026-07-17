# FİNANS MÜKEMMELLEŞTİRME PLANI — Saha Sahibi Finans Ekranı (FI)
**Tarih:** 17 Temmuz 2026 · **Kapsam:** `views/owner/OwnerFinanceView.tsx` + veri katmanı + admin bağlantısı
**İlke:** İnanılmaz kapsamlı, bir o kadar basit. Ödeme tahsilatı **manuel** (kullanıcı direktifi — online tahsilat otomasyonu YOK). Kantin/POS bu kapsamda **YOK** (kullanıcı kararı).

---

## 0. Kuzey Yıldızı

Saha sahibi Finans'ı açtığında **5 saniyede** üç soruya cevap almalı:

1. **Ne kazandım?** (bu ay tahsilat − gider = net; geçen ayla kıyas)
2. **Kim bana borçlu?** (bekleyen rezervasyon bakiyeleri + veresiye — tek "alacak" kavramı)
3. **Param nerede?** (nakit / kart / havale kırılımı + OYNA cüzdanında çekilebilir tutar)

Basitlik ölçütü: **3 sekme, tek dönem seçici, tek doğruluk kaynağı.** Güç detayda: her rakama dokununca kanıtı (satır listesi) açılır.

---

## 1. MEVCUT DURUM DENETİMİ (17 Tem canlı kod + canlı DB)

### 1.1 Ne var?
- Ekran: `OwnerFinanceView.tsx` (503 satır, tek dosya, modallar inline).
- Hero: "NET KAZANÇ (BU AY)" = `monthCollected − aylık gider` (tıklayınca gizlice DATA sekmesi).
- "OYNA KAZANÇLARIN" kartı: `owner_earnings_summary` RPC (çekilebilir/güvence/brüt→komisyon→net) — **iyi durumda, korunacak**.
- Sekmeler: Akış (ödeme yöntemleri + son işlemler + veresiye) / Giderler / Veriler (haftalık bar + gider dağılımı + abone oranı + yoğunluk).
- DB: `pitch_expenses`, `pitch_debtors`, `booking_payments` — üçü de owner-kapsamlı RLS'li ✓. RPC'ler: `owner_earnings_summary`, `request_payout`, `get_wallet_summary` mevcut ✓.
- **Canlı veri:** 1 ödeme, 0 gider, 0 veresiye → şema değişikliği risksiz.

### 1.2 Bulgular — Veri katmanı (FI-D)
| # | Bulgu | Kanıt |
|---|---|---|
| D1 | `getFinanceDashboard` istemcide 5 sorgu birleştiriyor; "son işlemler" son-100-rezervasyonla sınırlı; **ödeme yöntemleri dönem filtresiz** (tüm zamanlar) ama hero "bu ay" — aynı ekranda iki farklı pencere | `pitchOwnerService.ts:1299-1411` |
| D2 | İki doğruluk kaynağı: gelir `pitch_bookings.paid_amount`'tan, yöntem kırılımı `booking_payments`'tan → tutarsızlık görünmez | `1315` vs `1349` |
| D3 | Dönem seçimi yok — hep "bu ay"; geçen ay/kıyas yok | UI tamamı |
| D4 | Abone/Normal oranı **adet** bazlı (tutar değil) → %50 abone ama gelirin %15'i olabilir; yanıltıcı | `1318-1323` |
| D5 | "Haftalık gelir" son-7-gün, hero bu-ay → pencereler tutarsız | `getWeeklyRevenue:1021` |
| D6 | Veresiye v1: tek tutar; **kısmi ödeme yok, hareket geçmişi yok**; `last_reminded_at` kolonu var ama UI hiç kullanmıyor (WhatsApp hatırlatma yok); rezervasyonla bağ yok | tablo + `OwnerFinanceView:359-399` |
| D7 | Gider: **düzenleme/silme yok** (yanlış girildi → kalıcı), tarih seçilemiyor (servis destekliyor, UI vermiyor), kategori sabit 4, tekrarlayan gider (kira/personel) her ay elle | `433-467` |
| D8 | **Bekleyen tahsilat hiçbir yerde yok**: `price − paid_amount > 0` rezervasyonlar listelenmiyor → "kim borçlu kaldı" sorusu cevapsız. Finans'tan tahsilat da kaydedilemiyor (yalnız rezervasyon detayından) | ekran tamamı |
| D9 | Dışa aktarım yok (muhasebeci CSV'si) | — |
| D10 | `recentTransactions` id'si `tx-${i}` (stabil değil), `monthRevenue` hesaplanıp hiç kullanılmıyor | `1363-1371` |

### 1.3 Bulgular — UI/UX (FI-U)
| # | Bulgu |
|---|---|
| U1 | Hero'ya tıklama → DATA sekmesi: keşfedilemez gizli navigasyon |
| U2 | Grafikler etiketsiz: bar'larda değer yok, eksen yok; `EXPENSE_COLORS` tanımlı ama dağılım düz liste (renkler ölü kod); yoğunluk saat etiketi yok |
| U3 | Ödeme yöntemi satırına tıklama `selectedPayment` state'ini değiştiriyor ama **hiçbir etkisi yok** — ölü etkileşim |
| U4 | Sekme adları: "Akış" içinde veresiye (akış değil, alacak); "Veriler" hiçbir şey ifade etmiyor |
| U5 | Tutar girişleri: `parseFloat` NaN/negatif kontrolü yok; klavye `inputMode` yok |
| U6 | readOnly'de Ekle butonları görünür, tıklanınca sessizce hiçbir şey olmuyor (geri bildirim yok) |
| U7 | "Cüzdan → IBAN'a Çek" salt metin — çekim modalı Menü'de gömülü, buradan açılmıyor |
| U8 | Boş durumlar pasif ("Henüz tahsilat kaydı yok") — yönlendirme yok |
| U9 | Para formatı elle `toLocaleString+'₺'` — İP-14'te birleştirilen `utils/formatTRY` **hiç kullanılmıyor** (0 kullanım) |
| U10 | Yoğunluk heatmap'i artık Takvim → HAFTA görünümüyle **mükerrer** (bu oturumda eklendi) |

### 1.4 Bulgular — Mimari (FI-A)
| # | Bulgu |
|---|---|
| A1 | 503 satır tek dosya; 2 modal inline; saf hesap yok → test edilemiyor |
| A2 | Dashboard istemci tarafında birleşiyor → yavaş, tutarsız, admin'e yeniden kullanılamaz |
| A3 | **Admin bağlantısı eksik:** admin FinancePage platform-geneli; bir **tesisin** finans özetini admin göremiyor (destek/denetim körlüğü). OW-E şartı: "admin paneli bağlantısı tam" |

---

## 2. HEDEF BİLGİ MİMARİSİ

```
┌─ FİNANS ─────────────────────────────────────────────┐
│  ‹ Temmuz 2026 ›            [CSV ↓]                  │  ← dönem seçici (ay) + dışa aktar
│  ┌────────────────────────────────────────────┐      │
│  │ NET (dönem)  42.300₺   ▲ geçen aya %12     │      │  ← hero: net + kıyas
│  │ Tahsilat 61.800₺ · Gider 19.500₺           │      │
│  └────────────────────────────────────────────┘      │
│  [OYNA KAZANÇLARIN kartı — korunur + "Çekim" butonu] │
│                                                      │
│  ÖZET      |     TAHSİLAT     |     GİDER            │  ← 3 net sekme
└──────────────────────────────────────────────────────┘
```

**ÖZET** (eski "Veriler", anlamlandırılmış):
- Dönem içi **günlük tahsilat grafiği** (değer etiketli, hero ile aynı pencere — D5 çözümü)
- Yöntem kırılımı (Nakit/Kart/Havale) — dönem filtreli, tıklayınca o yöntemin işlem listesi (U3'ü gerçek özelliğe çevirir)
- Gelir kaynağı: Abone / Normal / Elle — **tutar bazlı** (D4)
- Gider dağılımı: kategorili, renkli, oranlı (EXPENSE_COLORS canlanır)
- Yoğunluk heatmap **kaldırılır** → "Doluluk için Takvim → HAFTA" bağlantısı (U10, mükerrerlik)

**TAHSİLAT** (eski "Akış", tek "alacak" kavramı):
1. **Bekleyen tahsilatlar** (YENİ — D8): `price − paid > 0` rezervasyonlar; satırda müşteri/tarih/bakiye + **"Tahsil Et"** (yöntem seç → mevcut `recordBookingPayment`) + **"Veresiyeye Yaz"** (bakiyeyi deftere devret)
2. **Veresiye Defteri v2**: kişi bazlı bakiye; satıra dokun → hareket geçmişi + **"Ödeme Al"** (kısmi) + **WhatsApp hatırlat** (`wa.me` + `last_reminded_at` günceller — D6)
3. **Son ödemeler**: dönem içi, müşteri+yöntem+saat etiketli (D10 stabil id)

**GİDER**:
- Satır: düzenle/sil (D7) + tarih alanı
- **Sabit gider şablonları**: kira/personel gibi kalemler şablonda; ay başında banner "Bu ayın sabit giderleri: 2/5 yazıldı → kalanları tek dokunuşla ekle". **Cron yok** — kullanıcı kontrolünde, manuel-ilkeyle uyumlu
- Kategori: mevcut 4 + serbest metin (öneri çipleri)

---

## 3. VERİ KATMANI PLANI

### 3.1 Tek RPC: `get_pitch_finance_summary(p_pitch_id uuid, p_month text)` — SECURITY DEFINER
Yetki: **owner-or-admin** (`get_facility_schedule` kalıbı — A3 admin bağlantısını da bu çözer).

Dönen jsonb:
```jsonc
{
  "period":  { "month": "2026-07", "start": "2026-07-01", "end": "2026-07-31" },
  "income": {
    "collected_total": 61800,                       // booking_payments dönem toplamı (TEK doğruluk kaynağı)
    "by_method":  [{ "method": "CASH", "amount": 40000, "count": 31 }],
    "by_source":  [{ "source": "SUBSCRIPTION", "amount": 9000 }],   // tutar bazlı (D4)
    "billed_total": 74300,                          // dönem rezervasyon price toplamı (iptal hariç)
    "pending_total": 12500,                         // Σ max(price − paid, 0)
    "pending_bookings": [ { "id","date","time","court","customer_name","price","paid","balance" } ],
    "daily": [ { "date": "2026-07-01", "collected": 2400 } ],       // dönem içi seri (D5)
    "recent_payments": [ { "id","amount","method","at","customer_name","booking_date" } ],
    "mismatch_count": 0                             // paid_amount ≠ Σpayments olan rezervasyon sayısı (D2 dürüstlük sayacı)
  },
  "expenses": { "total": 19500, "by_category": [{ "category","amount","count" }] },
  "debt":     { "open_total": 3400, "debtor_count": 3 },
  "prev":     { "collected_total": 55100, "expense_total": 21000 }  // geçen ay (hero kıyas)
}
```
Ekran açılışı = **bu RPC + gider satır listesi** (2 istek; bugünkü 5+ istek yerine).

### 3.2 Veresiye v2 şeması (D6)
```sql
CREATE TABLE pitch_debtor_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id uuid NOT NULL REFERENCES pitch_debtors(id) ON DELETE CASCADE,
  pitch_id uuid NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('DEBT','PAYMENT')),
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text,                    -- PAYMENT: CASH/CARD/BANK_TRANSFER
  note text,
  booking_id uuid REFERENCES pitch_bookings(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now()
);
-- Aynı rezervasyon iki kez deftere yazılamaz:
CREATE UNIQUE INDEX ON pitch_debtor_entries(booking_id) WHERE entry_type='DEBT' AND booking_id IS NOT NULL;
```
- **Trigger**: entry değişince `pitch_debtors.amount_owed = Σ(DEBT)−Σ(PAYMENT)`; bakiye 0 → `is_resolved=true`, yeni borç → `false`. (v1 UI'ları kırılmaz — `amount_owed` yaşamaya devam eder.)
- **RPC `debtor_add_payment(p_debtor_id, p_amount, p_method, p_note)`**: atomik; bakiyeden fazla ödemeyi reddeder (net Türkçe hata).
- **RPC `booking_to_debtor(p_booking_id, p_debtor_name, p_debtor_phone)`**: bekleyen bakiyeyi DEBT olarak yazar (varsa telefonla eşleşen açık debtor'a, yoksa yeni kişi); çift yazım unique index'le engelli.
- **Migrasyon**: mevcut açık `pitch_debtors` satırlarına "Açılış bakiyesi" DEBT'i (prod'da 0 kayıt — risksiz).

### 3.3 Sabit gider şablonları (D7)
```sql
CREATE TABLE pitch_expense_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id uuid NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  title text NOT NULL, category text NOT NULL DEFAULT 'Diğer',
  amount numeric NOT NULL CHECK (amount > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pitch_expenses ADD COLUMN template_id uuid REFERENCES pitch_expense_templates(id) ON DELETE SET NULL;
ALTER TABLE pitch_expenses ADD COLUMN expense_month text GENERATED ALWAYS AS (to_char(expense_date,'YYYY-MM')) STORED;
CREATE UNIQUE INDEX ON pitch_expenses(template_id, expense_month) WHERE template_id IS NOT NULL;  -- ayda 1 kez
```
RLS: her iki tablo owner-manage + admin (mevcut kalıp). Gider `UPDATE/DELETE` politikası zaten var → servis + UI eklenecek.

### 3.4 Migrasyon listesi (sıralı, her biri canlı rollback-testli)
1. `fi1_finance_summary_rpc.sql` — `get_pitch_finance_summary` (owner-or-admin)
2. `fi2_debtor_entries.sql` — tablo + trigger + 2 RPC + RLS + v1 açılış migrasyonu
3. `fi3_expense_templates.sql` — şablon tablosu + kolonlar + unique + RLS

---

## 4. FRONTEND PLANI

### 4.1 Dosya yapısı (A1 çözümü)
```
views/owner/finance/
  OwnerFinanceView.tsx        (kabuk: dönem seçici + hero + OYNA kartı + sekmeler; ~150 satır)
  FinanceSummaryTab.tsx       (ÖZET: grafik + kırılımlar)
  FinanceCollectTab.tsx       (TAHSİLAT: bekleyenler + veresiye v2 + son ödemeler)
  FinanceExpenseTab.tsx       (GİDER: liste + şablon banner)
  modals/ExpenseModal.tsx     (ekle/düzenle — tarih + kategori + validasyon)
  modals/DebtorSheet.tsx      (kişi: hareket geçmişi + Ödeme Al + WhatsApp)
  modals/CollectModal.tsx     (bekleyen rezervasyon: yöntem seç → recordBookingPayment)
services/financeService.ts    (RPC sarmalayıcıları + CSV üretimi)
shared/financeModel.ts        (SAF: dönem yardımcıları, kıyas %, dağılım, CSV satırları — unit testli)
tests/unit/financeModel.test.ts
```
Mevcut `OwnerFinanceView.tsx` bu kabuğa dönüşür; `OwnerPanel` import yolu değişmez.

### 4.2 UX sözleşmeleri
- **Para**: her yerde `formatTRYWithSymbol` (U9) — elle format yasak.
- **Tutar girişi**: `inputMode="decimal"`, NaN/negatif/0 reddi, anlamlı Türkçe hata (U5).
- **readOnly**: Ekle/Tahsil/Öde butonları `disabled` + kilit ikonu + tık → "salt okunur" toast (U6).
- **Dönem seçici**: ‹ Ay adı › (yalnız ay; "özel aralık" YOK — basitlik). Gelecek ay ok'u kilitli.
- **Hero kıyası**: geçen ay verisi RPC'den; %Δ rozeti (▲ yeşil / ▼ kırmızı); gizli tıklama kaldırılır (U1).
- **Grafik**: hafif el-yapımı bar (recharts owner paketine SOKULMAZ — yalnız admin kullanıyor; mobil bundle korunur). Her bar'da değer, altta gün etiketi.
- **Boş durumlar**: eylemli ("İlk tahsilatını bekleyenlerden kaydet →" gibi) (U8).
- **OYNA kartı**: "ÇEKİM TALEBİ" butonu → mevcut `OwnerWithdrawalsModal` buradan açılır (U7).
- **CSV**: UTF-8 BOM'lu tek dosya `finans_2026-07.csv` (tip kolonu: ÖDEME/GİDER/VERESİYE) — Excel-TR uyumlu.

---

## 5. ADMİN PANELİ BAĞLANTISI (A3 — OW-E şartı)

`PitchStudio`'ya **"Finans"** sekmesi (Takvim & Doluluk kalıbının aynısı, salt-okuma):
- Aynı `get_pitch_finance_summary` RPC'si (admin yetkisi RPC içinde hazır olacak)
- Özet kartlar: dönem tahsilatı / gider / net / açık alacak / `mismatch_count` (D2 sayacı — admin tutarsızlığı görür)
- Yöntem kırılımı + son ödemeler listesi
- Dönem seçici aynı bileşen. Yazma İŞLEMİ YOK (gözetim).

---

## 6. FAZLAR + ÇIKIŞ KAPILARI

| Faz | İçerik | Çıkış kapısı |
|---|---|---|
| **FI-1 Çekirdek** | RPC-1 + dönem seçici + hero kıyas + ÖZET sekmesi + formatTRY + ölü etkileşim temizliği (U1,U3,U9,U10,D1-D5,D10) | tsc ✓ · yeni model testleri ✓ · RPC canlı impersonation testi (owner ✓ / yabancı ✗ / admin ✓) · Playwright ekran görüntüsü |
| **FI-2 Alacak** | RPC-2/3 + TAHSİLAT sekmesi: bekleyenler + Tahsil Et + Veresiyeye Yaz + veresiye v2 + WhatsApp (D6,D8) | trigger canlı test (kısmi ödeme → bakiye, 0 → resolved) · çift-yazım engeli testi · ekran görüntüsü |
| **FI-3 Gider v2** | düzenle/sil + tarih + şablonlar + ay banner'ı (D7) | ayda-1 unique canlı test · ekran görüntüsü |
| **FI-4 Cila + Admin** | CSV + PitchStudio Finans sekmesi + çekim modal köprüsü + boş durumlar (D9,U7,U8,A3) | admin RPC canlı test · CSV Excel-TR doğrulama · final regresyon (vitest tamamı) |

Her faz ayrı commit + push. Test verisi `ZZTEST-` önekiyle eklenip **her doğrulama sonrası silinir** (bu oturumun kalıbı).

## 7. AÇIK KARARLAR (önerilen varsayılanlarla)

| # | Karar | Önerim |
|---|---|---|
| K1 | Yoğunluk heatmap Finans'tan kalksın mı? | **Kalksın** — Takvim→HAFTA ile mükerrer; yerine bağlantı |
| K2 | Grafik kütüphanesi? | **Hafif el-yapımı** — recharts owner bundle'ına girmesin |
| K3 | Sekme adları | **ÖZET / TAHSİLAT / GİDER** |
| K4 | Tekrarlayan gider | **Şablon + tek dokunuş banner** (cron yok — manuel ilke) |
| K5 | Dönem | **Yalnız ay** (özel aralık yok — basitlik); CSV ay bazlı |

Yapılmayacaklar (bilinçli): kantin/POS (kullanıcı kararı) · online tahsilat otomasyonu (manuel ilke) · fatura/e-arşiv entegrasyonu (faz dışı) · özel tarih aralığı (K5).
