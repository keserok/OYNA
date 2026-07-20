# Saha Sahibi (OWNER) — Güncel Durum Doğrulaması & Edge-Case Planı

> **Tarih:** 16 Temmuz 2026 · **Temel commit:** `dcdbd0a` (main merge sonrası)
> **Yöntem:** 4 paralel kod-doğrulama ajanı + 2 canlı-DB istismar testi (rollback'li).
> **Kaynak analiz:** `SAHA_SAHIBI_PANEL_DENETIM_2026-07.md` (27 bulgu) + `KATMAN2_SAHA_SAHIBI_COZUM_PLANI.md` (P1-P6) + `VITRIN_ROZET_YETKISI_VE_FILTRE_DOGRULUK_PLANI.md`.
> **Amaç:** 7 Temmuz denetimindeki 27 bulgunun BUGÜNKÜ kodda hangisinin açık/kapalı olduğunu kanıtla + vitrin/showcase alanındaki YENİ bulguları ekle + sıralı, kapsam-ayrılmış plan.

---

## 0. Yönetici Özeti

7 Temmuz'dan bu yana araya giren "Sprint 0/1" işi (migration'lar `20260711*`, `20260713*`, `20260715*`, `20260719*`, `20260724*`) owner **para katmanının büyük kısmını zaten kapatmış**. Denetimdeki en ağır P0 para bulguları (kart self-credit, komisyon şeffaflığı, iade→kazanç geri-alma) **düzeltilmiş**. Ayrıca birçok P1/P2 (çok-saat rezervasyon gösterimi, realtime kanal, UTC tarih, borç formatı, çekirdek-asla-kilitlenmez) kapatılmış.

Geriye kalan açıklar üç kümede toplanıyor:
1. **VİTRİN DÜRÜSTLÜK + GÜVENLİK (en kritik, denetimde yoktu):** owner kendi sahasının puanını sahteleyebiliyor (canlı doğrulandı); puansız saha "5.0★" gösteriyor; flash indirim kartta var rezervasyonda yok ("yem-değiştir"); müsaitlik rozeti kapanışları yanlış işliyor.
2. **OPERASYON KISMİLERİ:** servis doluluk paydası hâlâ sabit; istemci auto-approve toggle'ı yok sayıyor; `addDaysISO` UTC bug'ı (haftalık ciro); finans hata yutma; tek-kort takvim.
3. **UX/DÜRÜSTLÜK KALINTILARI:** ölü SaaS kodu, demo ₺12.500 literal, onboarding yalan vaatleri + kullanılmayan IBAN, sabit kapora/süre, telefon çift-alan.

Büyük altyapı kalemleri (offline outbox, çok-kort takvim RPC'si, kantin POS, personel login) **edge-case değil, 2+ haftalık özellikler** — ayrı fazlara bırakılır.

---

## 1. Doğrulanmış Durum Tablosu (7 Tem bulguları → 16 Tem kod)

### P0 — Para / Güvenlik
| Kod | Bulgu | Durum | Kanıt (güncel) |
|---|---|---|---|
| P0-1 | Manuel rezervasyon+ödeme atomik değil | 🔴 AÇIK | `OwnerPanel.tsx:920-936` iki adım (RPC + ayrı `recordBookingPayment`). P0-2 sayesinde para-kaybı değil, **veri-tutarlılığı** riski |
| P0-2 | Kart self-credit deliği | ✅ DÜZELTİLMİŞ | `booking_payments.source` + trigger `method='CARD' AND source<>'OWNER_MANUAL'` (`20260715000001`) |
| P0-3 | Komisyon gizli | ✅ DÜZELTİLMİŞ | `owner_earnings_summary` RPC + FinanceView brüt→komisyon→net (`20260719000001`, `OwnerFinanceView.tsx:212-224`) |
| P0-4 | Sahte ₺12.500 bakiye | ⚠️ KISMEN | Yalnız mock/demo dalında (`OwnerWithdrawalsModal.tsx:29`, `OwnerPanel.tsx:1880`); gerçek owner görmüyor ama literal duruyor |
| P0-5 | İade→kazanç geri-alma | ✅ DÜZELTİLMİŞ | `reverse_booking_earnings` + iptal RPC'lerine bağlı + REVOKE (`20260715000002/03`) |

### P1 — Fonksiyonel
| Kod | Bulgu | Durum | Kanıt |
|---|---|---|---|
| P1-6 | Doluluk formülü | ⚠️ KISMEN | Takvim düzeltilmiş (gerçek saat/pencere); servis+HOME hâlâ sabit `/16` payda (`pitchOwnerService.ts:1013`) |
| P1-7 | Çok-saat rezervasyon tek saatte | ✅ DÜZELTİLMİŞ | `duration: Math.max(1,endH-startH)`; `buildHourlyOccupancyGrid` kapsanan saatlere bakıyor |
| P1-8 | Takvim tek-kort × tek-gün | 🔴 AÇIK | `bookings.filter(b.pitchId===selectedCourtId)`; hafta/çok-kort etkileşimli takvim yok |
| P1-9 | İstemci auto-approve toggle'ı yok sayıyor | ⚠️ KISMEN | Sunucu cron eklendi (toggle'a saygılı); ama istemci `MatchCountdownItem` hâlâ `autoApprove`'a bakmadan onaylıyor (`OwnerPanel.tsx:149-161`) → çelişkili onay riski |
| P1-10 | Realtime kanal çakışması | ✅ DÜZELTİLMİŞ | `channelKey` ile benzersiz kanal |
| P1-11 | Servis UTC tarih kayması | ✅ DÜZELTİLMİŞ | `todayISO`→`localDateISO` |
| P1-12 | approveBooking yalnız flip | ⚠️ KISMEN | Bildirim DB trigger'ına taşınmış; capture + re-check hâlâ yok |

### P2 — UX / iş modeli
| Kod | Bulgu | Durum |
|---|---|---|
| P2-13 | Onboarding yalan finans vaadi ("%0", "her Pazartesi") | 🔴 AÇIK |
| P2-14 | Çekimde kayıtlı IBAN yok | 🔴 AÇIK |
| P2-15 | Bakiye kullanıcı-bazlı (by-design belgelenmiş) | 🔴 AÇIK (düşük) |
| P2-16 | Finans hata yutma (`getFinanceDashboard` catch→boş) | 🔴 AÇIK |
| P2-17 | Fatura-tabanlı panel kilidi | ⚠️ KISMEN (çekirdek-asla-kilitlenmez uygulanmış; suspend/cancel hâlâ yazmayı bloke) |
| P2-18 | Ölü SaaS kalıntıları | ⚠️ KISMEN (banner/handlePlanUpgrade silinmiş; `OwnerUpgradeGate`+`OwnerBillingSettingsModal` ulaşılamaz ölü kod) |
| P2-19 | Kapora sabit %25 + CASH | 🔴 AÇIK |
| P2-20 | Manuel rezervasyon sabit 1 saat | 🔴 AÇIK |
| P2-21 | Telefon iki alana yazılıyor | 🔴 AÇIK |
| P2-22 | Borç tutarı formatsız | ✅ DÜZELTİLMİŞ |
| P2-23 | Veresiye sığ | 🔴 AÇIK |

### P3 — Kod sağlığı
| Kod | Bulgu | Durum |
|---|---|---|
| P3-24 | OwnerPanel monolit (2362 satır) | 🔴 AÇIK |
| P3-25 | Ölü `: 2000` fallback | 🔴 AÇIK |
| P3-26 | Offline yazma koruması yok | 🔴 AÇIK |
| P3-27 | Personel gerçek login değil | ⚠️ KISMEN (DB temeli var; `user_id` bağlanmamış) |

---

## 2. YENİ Bulgular (7 Tem denetiminde yoktu)

### Vitrin / Showcase (P1-P3)
| Kod | Bulgu | Şiddet | Kanıt |
|---|---|---|---|
| V-1 | **Owner kendi puanını sahteleyebiliyor** — RLS owner UPDATE veriyor, hiçbir trigger `rating`/`rating_count`/`google_*`'ı korumuyor. **CANLI TEST: owner 4.8→5.0, review 0→9999 yazdı (AÇIK=t)** | 🔴 P1 GÜVENLİK | trigger listesi (rating yok) + impersonation testi |
| V-2 | **Puansız saha "5.0★"** — `pitches.rating DEFAULT 5.0`, `rating_count=0` iken kart koşulsuz `★5.0` gösteriyor; `minRating` filtresine giriyor (planın kabul kriterini ihlal) | 🔴 P1 | `owner_pitches.sql:16` (DEFAULT 5.0 doğrulandı) + `PitchDiscovery.tsx:145,701` + `pitchFilterService.ts:155` |
| V-3 | **Flash indirim "yem-değiştir"** — kart indirimli fiyat gösterir, rezervasyon TAM tarife alır (indirim booking yolunda hiç yok); ayrıca slot-özel deal tüm sahaya yansıtılıyor, tarih doğrulaması yok | 🟠 P2 | `PitchDiscovery.tsx:116-118,149` vs `:1117-1130` |
| V-4 | **Rozet tüm-gün kapanışı yok sayıyor** — `start_time=null` → `parseInt("null")=NaN` → kapanış atlanıyor → kapalı saha "müsait" (yanlış-pozitif) | 🟠 P2 | `PitchDiscovery.tsx:835`, `pitchBookingService.ts:165` |
| V-5 | **Rozet tek-kort kapanışını tüm sahaya uyguluyor** — `court_id` kontrol edilmiyor → 1 kort bakımdayken saha "dolu" (yanlış-negatif) | 🟠 P2 | `PitchDiscovery.tsx:833-865` |
| V-6 | **Legacy sabit 4.5 Google puanı + Ordu koordinatı** — `adminService.ts:2115` `google_rating ?? 4.5`, `lat/lng ?? Ordu`; `store.ts` create/update yolunda canlı | 🟠 P2 | `adminService.ts:2115-2119` |
| V-7 | Gece-sarkması sabit `h<6` sezgisi (plan "kalkacak" demiş, kod duruyor) | 🟡 P3 | `PitchDiscovery.tsx:862` |
| V-8 | Latent uydurma `occupancy` (rating'den türetiliyor, modele yazılıyor; şu an gösterilmiyor) | 🟡 P3 | `PitchDiscovery.tsx:159-161` |

### Owner panel (ek)
| Kod | Bulgu | Şiddet |
|---|---|---|
| N-1 | `addDaysISO` UTC kayması → haftalık ciro grafiği bir gün geri, bugünkü ciro görünmez | 🟠 P1 fonksiyonel · `pitchOwnerService.ts:168-172` |
| N-2 | Ölü import/state zinciri (`OwnerUpgradeGate`, `OwnerBillingSettingsModal`, `showBilling`) hiç render edilmiyor → silinsin | 🟡 P3 · `OwnerPanel.tsx:28,39,1537` |
| N-3 | Onboarding IBAN'ı (`pitches.iban`) çekimde kullanılmıyor → ölü veri + kötü UX | 🟠 P2 · `PartnerOnboarding.tsx:54,95` vs `OwnerWithdrawalsModal.tsx:129` |
| N-4 | "Kapora" düğmesi tutar sormuyor, %25 sabit varsayıyor (etiket/davranış uyuşmazlığı) | 🟡 P2 |
| N-5 | Demo ₺12.500 iki yerde ayrı sabit (tek kaynak yok) | 🟡 P3 |

**Sağlam bulunan (bilgi):** rozet yetkisi (`protect_pitch_admin_flags` is_featured/flash/availability'yi kilitler), `get_showcase_availability` (PII yok), demo izolasyonu, filtre motoru (puan hariç), görsel dürüstlüğü (stok foto basmaz).

---

## 3. Kapsam Ayrımı (para sınırı — kaleci fazı emsali)

| Sınıf | Kalemler | Yaklaşım |
|---|---|---|
| **A. Güvenle şimdi (dürüstlük/güvenlik/UX/istemci)** | V-1..V-8, N-1..N-5, P0-4, P1-6(payda), P1-9(istemci), P2-16, P2-18(ölü kod), P2-21, P3-25 | **Kodla + canlı test** |
| **B. Para-hareketi/escrow (dikkat / devir belgesi)** | P0-1 atomik+idempotent RPC, P2-13/14 otomatik payout + IBAN SSOT, %0 intro | Escrow-komşu; ya dikkatli RPC ya devir belgesi |
| **C. Büyük özellik (ayrı faz, edge-case değil)** | P1-8/P4 çok-kort takvim, P3-26 offline outbox, P2-23/P5 kantin+veresiye v2, P3-27/P6 personel login, P3-24 monolit refactor | 2+ hafta; ayrı sprint |

---

## 4. Önerilen Sıralı Plan (A sınıfı — bu fazda)

### OW-A · Vitrin dürüstlük + güvenlik (EN ÖNCELİKLİ)
- **OW-A1** Owner-rating-write açığını kapat: `rating`, `rating_count`, `google_rating`, `google_review_count`'ı owner-yazamaz yap (`protect_pitch_admin_flags`'e ekle veya kolon-koruma trigger'ı). Migration + canlı istismar testi (rollback). → **V-1**
- **OW-A2** Sahte 5.0★: `rating_count===0` ise puan gösterme ("Yeni"/"—") + `minRating` filtresinden ele. `ShowcasePreview` ölü fallback'i gerçek yap. → **V-2**
- **OW-A3** Flash indirim dürüstlüğü: indirim ya gerçekten slot fiyatına uygulansın ya kartta "belirli saatlerde geçerli" olarak dürüstçe sunulsun (yem-değiştir'i kaldır). → **V-3**
- **OW-A4** Müsaitlik rozeti doğruluğu: tüm-gün kapanış (`start_time=null`) tüm çalışma saatlerini kapatsın; tek-kort kapanış yalnız o korta uygulansın. → **V-4, V-5**
- **OW-A5** Legacy 4.5 Google + Ordu koordinat default'unu kaldır (null/0 + pin zorunlu). Latent uydurma occupancy'yi kaldır. → **V-6, V-8**
- **OW-A6** Gece-sarkması `h<6` → çalışma penceresinden türet. → **V-7**

### OW-B · Operasyon dürüstlük (kısmi bulguları kapat)
- **OW-B1** `addDaysISO` → `localDateISO` (haftalık ciro TR günü). → **N-1**
- **OW-B2** Servis/HOME doluluk paydası sabit `/16` → gerçek çalışma penceresi (takvimle aynı). → **P1-6**
- **OW-B3** İstemci auto-approve'u kaldır (sunucu cron zaten toggle'a saygılı) → çelişkili onay biter. → **P1-9**
- **OW-B4** `getFinanceDashboard` hata yutmayı kaldır → görünür hata durumu. → **P2-16**

### OW-C · UX / dürüstlük kalıntıları
- **OW-C1** Ölü SaaS kodunu sök (`OwnerUpgradeGate`, `OwnerBillingSettingsModal`, `showBilling`, ilgili import'lar). → **P2-18, N-2**
- **OW-C2** Demo ₺12.500 literal'i tek kaynağa indir / kaldır. → **P0-4, N-5**
- **OW-C3** Onboarding IBAN'ı çekimde prefill (ölü veri biter). → **N-3**
- **OW-C4** Telefon çift-alan → tek `customer_phone`. Ölü `: 2000` fallback sil. → **P2-21, P3-25**
- **OW-C5** Onboarding yalan vaat metinleri ("%0 ilk 30 gün", "her Pazartesi otomatik") → mekanizma yoksa dürüst metne indir (vaat gerçeğin önüne geçmez). → **P2-13** *(kapora/süre esnekliği ve otomatik payout B/C sınıfında)*

### Devir / büyük faz (kod yazılmaz — belge)
- P0-1 atomik+idempotent manuel rezervasyon RPC · otomatik payout + IBAN SSOT · offline outbox · çok-kort takvim RPC'si · kantin POS + veresiye v2 · personel login · OwnerPanel modülerleştirme.

---

## 5. Kabul Kriterleri (A sınıfı)
- Owner ham PostgREST ile `pitches.rating` UPDATE denerse **reddedilir** (OW-A1 canlı test).
- Puansız saha kartta "5.0★" göstermez ve `4.5+` filtresine girmez (OW-A2).
- Kartta gösterilen fiyat = rezervasyonda ödenen fiyat (OW-A3).
- Owner bir günü/kortu tümden kapatınca rozet o günü/kortu doğru yansıtır (OW-A4).
- Haftalık ciro grafiğinde bugünün cirosu doğru barda görünür (OW-B1).
- Panelde ödeme/plan/SaaS ekranı derlemede bile kalmaz (OW-C1).
