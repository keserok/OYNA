# SAHA SAHİBİ TAMAMLAMA PLANI — Kalan Yol Haritası + Mobil Mükemmellik
**Tarih:** 17 Temmuz 2026 · **Durum:** OW-A..E(P4) + FI-1..4 bitti; bu belge kalan işi tanımlar.

---

## 0. BİTENLERİN ENVANTERİ (referans)

| Paket | İçerik | Durum |
|---|---|---|
| OW-A/B/C | Vitrin dürüstlük+güvenlik, operasyon, UX temizliği | ✅ |
| OW-D | Atomik+idempotent manuel rezervasyon (manuel ödeme ilkesi) | ✅ |
| OW-E/P4 | Çok-kort takvim: TESİS (gün) + HAFTA (ısı-harita) + admin gözetimi | ✅ |
| FI-1 | Tek RPC finans özeti + ay seçici + ÖZET/TAHSİLAT/GİDER + 17 adversaryal düzeltme | ✅ |
| FI-2 | Bekleyen tahsil (CollectModal) + veresiye defteri v2 (kısmi ödeme, WhatsApp, rezervasyon köprüsü) | ✅ |
| FI-3 | Gider düzenle/sil + tarih + sabit gider şablonları (ayda-1 kilidi) | ✅ |
| FI-4 | Excel-TR CSV + admin PitchStudio Finans sekmesi (aynı RPC) | ✅ |

Test durumu: 334 unit test · tsc temiz · kritik RPC'ler canlı impersonation-testli.

---

## 1. MOB — MOBİL MÜKEMMELLİK (BU OTURUM UYGULANIYOR)

### 1.1 Kod denetiminde bulunan mobil kusurlar
| # | Kusur | Etki |
|---|---|---|
| M1 | `safe-area-pb` sınıfı **hiçbir yerde tanımlı değil** (OwnerBottomNav kullanıyor) | Çentikli iPhone'da alt navigasyon home-çubuğuyla çakışır |
| M2 | Owner üst başlığı (`sticky top-0 py-4`) safe-top'suz | İçerik durum çubuğu/çentiğin altında kalır |
| M3 | CALENDAR özet şeridi (`p-4`, sticky) safe-top'suz | Aynı çakışma Takvim'de |
| M4 | MENÜ görünümü (`p-6`) safe-top'suz | Aynı çakışma Menü'de |
| M5 | App geneli "Bağlantı zayıf" banner'ı (`fixed top-0`) safe-top'suz | Banner çentik altında |
| M6 | BottomSheetModal: max-height yok, alt padding safe'siz | Uzun içerik + klavye → taşma; butonlar home-çubuğu altında |
| M7 | StatTile değerleri sabit `text-xl` (3 sütun ~100px) | Büyük tutarda ("142.500,50₺") taşma |
| M8 | Ay okları 40px (w-10) | 44px dokunma hedefi standardının altında |
| M9 | Hero tutarı sabit `text-4xl` | Çok büyük tutarda dar ekran taşması |

### 1.2 Düzeltme yaklaşımı
- `index.css`'e **gerçek** `@utility` tanımları: `safe-area-pb`, `safe-area-pt-2/4/6` (mevcut `--safe-*` değişkenleri üstüne).
- Sticky/top yüzeylere safe-top; alt navigasyon + bottom-sheet'lere safe-bottom.
- BottomSheetModal: `max-h-[85dvh] overflow-y-auto` + safe alt padding (tüm finans modalları otomatik kazanır).
- StatTile `text-lg sm:text-xl truncate`; hero `text-3xl sm:text-4xl`; ay okları 44px.
- **Doğrulama:** Playwright 360×740 (dar Android) + 390×844 (iPhone) tam tur ekran görüntüsü: Özet · Takvim GÜN/TESİS/HAFTA/AYLIK · Finans ÖZET/TAHSİLAT/GİDER + Tahsil Et modalı · Ekip · Menü. Görülen her taşma bu fazda düzeltilir.
- Kapsam notu: **admin paneli masaüstü aracıdır** — mobil mükemmellik hedefi owner (mobil) uygulamasıdır.

---

## 2. KALAN BÜYÜK PARÇALAR (SONRAKİ FAZLAR — öncelik sırasıyla)

### P-STAFF — Personel Girişi (öncelik 1)
Tesise personel hesabı: kasadaki eleman owner şifresiyle değil kendi hesabıyla girsin.
- **DB:** `pitch_staff_members.user_id` zaten var; `is_pitch_staff(pitch_id)` yardımcı fonksiyonu + owner-RLS'lerine `OR is_pitch_staff(...)` genişletmesi (yalnız operasyonel tablolar: rezervasyon/tahsilat/veresiye/gider — tesis ayarları/banka/çekim HARİÇ).
- **Davet akışı:** owner Ekip'ten telefon/e-posta ile davet → personel mevcut OYNA hesabıyla kabul eder → `user_id` bağlanır.
- **Rol matrisi:** personel = operasyon yazabilir, finans ÖZET görebilir, ayar/çekim göremez. `get_pitch_finance_summary` yetkisine `is_pitch_staff` eklenir (salt-okuma).
- **Kapı:** canlı impersonation testleri (personel ✓ operasyon / ✗ ayar-çekim / yabancı ✗).

### P-OFFLINE — Çevrimdışı Outbox (öncelik 2)
Halı sahada internet kopar; kasa durmamalı.
- `services/offline/outbox.ts`: idempotent yazma RPC'leri (manuel rezervasyon `owner_client_ops` idempotency'si ZATEN hazır; tahsilat/veresiye RPC'lerine `p_client_request_id` eklenir) → localStorage kuyruğu → bağlantı gelince sırayla flush + çakışma toast'u.
- Kapsam: quick-create rezervasyon, tahsilat, veresiye ödeme. Okumalar stale-while-revalidate.
- **Kapı:** uçak-modu simülasyonu (Playwright offline) → kuyruk → online → tek-sefer işlendi kanıtı.

### P-REFACTOR — OwnerPanel Monolit Bölme (öncelik 3)
`views/OwnerPanel.tsx` ~2.4k satır. Finans zaten `views/owner/finance/`'a bölündü (şablon oldu).
- Çıkarılacaklar: `FinancialCalendarView` → `views/owner/calendar/`, HOME kartları → `views/owner/home/`, `applyPitch`/yükleme mantığı → `hooks/useOwnerFacility.ts`.
- Kural: davranış DEĞİŞMEZ (salt taşıma), her adımda tsc + 334 test + smoke ekran görüntüsü.

### P-CILA — Küçük kalanlar (fırsat buldukça)
- `billed_total` görünürlüğü (admin Finans'a "faturalanan" satırı) · gece-yarısı `currentMonth` tazeleme · Finans↔rezervasyon-detayı derin bağlantısı · HAFTA görünümünden güne atlayınca TESİS moduna dönme seçeneği.

## 3. ÇALIŞMA KURALLARI (değişmedi)
Her faz: tsc ✓ · vitest ✓ · canlı RPC/impersonation testi (DB dokunuyorsa) · Playwright ekran görüntüsü · `ZZTEST-` seed → doğrula → sil · commit + push. Ödeme akışları **manuel** kalır (online tahsilat otomasyonu yok — kullanıcı ilkesi).
