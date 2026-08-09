# Köprü Paketi (1+2+5) — Saha Sahibi ↔ Ana Uygulama Koordinasyonu

**Tarih:** 9 Ağustos 2026 · **Karar sahibi:** kurucu (4 soru, soru-cevap turu)
**Durum:** ✅ Kod kuruldu — haftalık özet migration'ı canlıya uygulama ONAY bekliyor

## Kurucu kararları
| # | Konu | Karar |
|---|---|---|
| 1 | Vitrin önizleme | **Kart + detay:** Menü → "Vitrin Önizleme" — oyuncunun keşif kartı, dokununca detay sayfası. Veri oyuncuyla AYNI yoldan (PITCH_SHOWCASE_SELECT + mapDbPitchToUiPitch); ekran hafif kopya, veri bire bir |
| 2 | Vitrin kalite skoru | **Standart 5 ölçüt:** foto ≥3 · açıklama · tüm kortlarda tarife · açık saatler · iptal politikası. Tek kaynak `shared/vitrinSkoru.ts`; ana ekrandaki kurulum kartının başlığı "Vitrin puanın: X/5", menü üst kartında hap |
| 5 | Haftalık özet içerik | Rezervasyon + tahsilat · önceki hafta kıyası · en yoğun gün/saat (yeni müşteri sayısı bilinçli DIŞARIDA) |
| 5 | Haftalık özet mimari | **Gece işi + bildirim:** her Pazartesi 06:00 TR, `haftalik_ozet_uret()` → `owner_weekly_summaries` + sahibe bildirim (boş haftada bildirim yok); panel ana ekranda kart |

## Parçalar
- `shared/vitrinSkoru.ts` · `views/owner/menu/OwnerShowcasePreviewModal.tsx` ·
  `views/owner/home/OwnerWeeklySummaryCard.tsx` · panel/menü bağları ·
  `supabase/migrations/20260907000000_haftalik_ozet.sql` (RLS: ekip okur; kendi doğrulaması var).
