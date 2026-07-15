# Vitrin Rozet Yetkisi + Filtre Doğruluk Güvencesi — Uygulama Planı

> Durum: **PLAN** (onay bekliyor) · Dal: `claude/field-venue-map-ui-1ll0er` · Tarih: 2026-07-15
> Kapsam: (1) Kart rozetlerinin ("Öne Çıkan", flash "İndirim", "Bugün X saat müsait")
> admin yetkisine alınması, (2) tüm vitrin filtrelerinin gerçek veriden beslenip doğru
> sonuç verdiğinin uçtan uca güvencesi, (3) onaylanan tasarım iyileştirmeleri.

---

## 0) Mevcut durum tespitleri (kod kanıtlı)

Plan, koddan doğrulanmış şu tespitlere dayanır:

| # | Tespit | Kanıt |
|---|--------|-------|
| T1 | `is_featured` kolonu zaten "Admin kontrollü" olarak TASARLANMIŞ, admin panelde toggle'ı var. | `20260707000001_saha_vitrini_foundation.sql:140` (kolon yorumu), `admin-panel/views/pages/PitchesPage.tsx:61`, `PitchStudio.tsx:345` |
| T2 | **YETKİ AÇIĞI:** RLS "Owners or Admins can update pitches" owner'a kendi satırında UPDATE izni verir; kolon koruma trigger'ı (`protect_pitch_identity_fields`) yalnız ad/konum alanlarını korur — `is_featured` korumasızdır. Owner, UI'da buton olmasa da doğrudan PostgREST çağrısıyla kendini "Öne Çıkan" yapabilir. | `20260531_rls_complete.sql:33`, `20260530000002_owner_pitches.sql:61`, `saha_vitrini_foundation.sql:384-407` |
| T3 | Admin yazma yolu İKİYE bölünmüş: `admin_update_pitch` RPC (is_platform_admin guard + `log_admin_action` audit) VE `pitchContentService.setPitchFeatured` (guard'sız düz `update`, ayrı `pitch_content_audit`). | `20260710000002_admin_pitch_studio_rpcs.sql:60-100`, `services/pitchContentService.ts:99-106` |
| T4 | Flash indirim: owner `pitch_flash_deals`'a doğrudan insert eder (RLS: pitch sahibi ∨ ADMIN; %5-80 DB check). Admin moderasyonu/vetosu YOK; vitrin süresi dolmamış her deal'i gösterir. | `20260607000001_owner_module_complete.sql:311-340`, `services/pitchOwnerService.ts:699-717` |
| T5 | **VERİ DOĞRULUĞU HATASI:** "Bugün X saat müsait" rozeti `pitch_bookings` tablosunu DOĞRUDAN sorgular; RLS "Players view own bookings" (`user_id = auth.uid()`) nedeniyle oyuncu yalnız KENDİ rezervasyonlarını görür → rozet başkalarının dolu saatlerini boş sayar (aşırı iyimser). Detay sayfası ise SECURITY DEFINER `get_pitch_availability` RPC'siyle doğru çalışır. | `views/PitchDiscovery.tsx` `loadTodayAvailability`, `20260613090000_faz1_player_booking_flow.sql:25-45` |
| T6 | Rozet hesabı ayrıca: (a) gün-bazlı çalışma saatlerini ÇÖZMEZ (`generateSlotRanges(p.workingHours)` düz nesne; detay yolundaki `resolveWorkingHoursForDate(workingHoursRaw)` gün-duyarlıdır), (b) owner'ın kapattığı slotları (`pitch_availability_exceptions`) hiç görmez, (c) `h >= nowHour` başlamış saati de sayar, (d) gece sarkması sabit `h < 6` sezgiseline dayanır. | `views/PitchDiscovery.tsx:801-830`, `services/availabilityService.ts:105-151`, `services/pitchOwnerService.ts:363-400` |
| T7 | `get_pitch_availability` RPC'si yalnız `authenticated`'a granted; misafir vitrini tablo fallback'ine düşer (T5 ile aynı sorun). | `20260613090000:46-48` |
| T8 | Filtre zinciri (yeni sheet) gerçek veriden besleniyor; kalan pürüzler: aramada `toLowerCase()` Türkçe İ/ı hatası; featured-first sıralamanın kullanıcının seçtiği sıralamayı HER modda ezmesi; `district ?? city` fallback'i; bölge eşleşmesinde ilçe adının il'den bağımsız eşleşmesi. | `views/PitchDiscovery.tsx` `filteredPitches` memo |
| T9 | Platform-geneli ayar tablosu yok; admin aksiyon audit kalıbı `log_admin_action` olarak mevcut. Test altyapısı: vitest (`tests/unit/showcaseScore.test.ts` kalıbı) + entegrasyon SQL suite (`tests/integration/*.sql`) + Playwright. | migrations grep, `tests/` |

---

## Faz 1 — Rozetlerin admin yetkisine alınması (backend) · **lansman engeli**

Tek migration: `2026xxxx_vitrin_rozet_yetkisi.sql`

1. **Yeni kolonlar** (`pitches`):
   - `show_availability_badge boolean NOT NULL DEFAULT true` — "Bugün X saat müsait" rozetinin görünürlüğü (admin).
   - `flash_deals_enabled boolean NOT NULL DEFAULT true` — flash indirim rozetinin vitrine yansıma izni (admin vetosu).
2. **Kolon koruma trigger'ı** `protect_pitch_admin_flags` (mevcut `protect_pitch_identity_fields` kalıbının eşi):
   `is_admin()` değilse `is_featured`, `show_availability_badge`, `flash_deals_enabled` değişimlerinde
   `ADMIN_ONLY_FIELD` exception. Bu, T2'deki açığı **tüm yazma yolları için** kapatır (RPC, servis, ham PostgREST).
3. **`admin_update_pitch` RPC genişletmesi:** payload'a iki yeni bayrak (`COALESCE` kalıbı, mevcut audit korunur).
4. **Yazma yolu tekilleştirme:** `pitchContentService.setPitchFeatured` düz update yerine `admin_update_pitch`
   RPC'sini çağırır (trigger + `log_admin_action` tek yoldan). Yeni `setPitchShowcaseFlags` aynı RPC'yi kullanır.
5. **Entegrasyon SQL testleri** (`tests/integration/saha_vitrini_content.sql`'e ek blok):
   owner bayrak değiştiremez (exception beklenir) · admin RPC değiştirir · audit satırı yazılır ·
   RLS regresyonu (owner diğer alanlarını hâlâ güncelleyebilir).
6. **Canlı DB doğrulaması (uygulama sırasında, Supabase MCP ile):** `pitch_bookings` üzerinde
   `USING (true)` public-SELECT politikasının kalıntısı var mı denetle (varsa müşteri adı/telefonu
   sızdırır → aynı migration'da düşür; yoksa T5 zaten doğrulanmış olur).

## Faz 2 — Admin panel arayüzü

7. **PitchesPage** liste satırı: mevcut Yayın/Öne Çıkan anahtarlarının yanına "Müsaitlik rozeti" ve
   "Flash izni" anahtarları (aynı optimistic-update kalıbı, RPC üzerinden).
8. **PitchStudio** detayına "Vitrin Rozetleri" kartı: üç anahtar + tek satır açıklamalar
   ("Öne Çıkan: vitrinde üst sıra + sarı rozet", "Flash izni: kapatılırsa kampanyalar vitrine yansımaz",
   "Müsaitlik rozeti: kapatılırsa 'Bugün X saat müsait' gizlenir").

## Faz 3 — Vitrin istemcisinin bayraklara bağlanması

9. `PitchDiscovery` select'ine iki kolon eklenir; `mapDbPitchToUiPitch` → `Pitch` tipine taşınır.
10. Render kuralları:
    - "Öne Çıkan" rozeti: `is_featured` (değişmez, artık gerçekten admin-only).
    - Flash rozet + üstü çizili fiyat + "İndirimli" filtresi + fiyat hesabı: `flash_deals_enabled=false`
      ise deal HİÇ maplenmez (rozet yok, ham fiyat, filtre saymaz — tutarlı tek kural).
    - "Bugün X saat müsait / Bugün dolu" rozeti: yalnız `show_availability_badge=true` iken render.
      **"Bugün müsait" filtresi gerçek müsaitliğe göre çalışmaya devam eder** (rozet sunumdur,
      filtre gerçektir — Karar N2'ye bakınız).

## Faz 4 — "Bugün müsait" verisinin düzeltilmesi · **lansman engeli** (T5-T7)

11. **Yeni RPC** `get_showcase_availability(p_date date)` — SECURITY DEFINER, kişisel veri İÇERMEZ
    (yalnız `pitch_id, court_id, start_time, end_time, status`), yayınlanmış sahalarla sınırlı,
    `anon + authenticated` grant (misafir vitrini de doğru görsün). Aynı çağrıda o günün
    `pitch_availability_exceptions` kapanışları da (sanitize) döner.
12. **`loadTodayAvailability` yeniden yazımı:** tablo sorgusu yerine RPC; slot üretimi detay
    sayfasıyla AYNI kaynaktan: `resolveWorkingHoursForDate(workingHoursRaw, bugün)` (gün-bazlı saatler,
    kapalı gün desteği), exception'lar dolu sayılır, geçmiş slot dakika hassasiyetiyle elenir,
    gece sarkması çalışma penceresi mantığından türetilir (sabit `h<6` kalkar).
13. Bu tek fonksiyon hem kart rozetini hem filtre sayaçlarını beslemeye devam eder (tek kaynak).

## Faz 5 — Filtre doğruluk güvencesi (saflaştırma + test)

14. **Saf modül çıkarımı** `services/pitchFilterService.ts`: `derivePitchFilterOptions(pitches)`
    (bölge/fiyat sınırı/olanak/tip/sayaçlar) + `filterAndSortPitches(pitches, criteria)`.
    Bileşen inceltilir; mantık test edilebilir olur.
15. **Düzeltmeler** (çıkarım sırasında):
    - Arama: `toLocaleLowerCase('tr-TR')` (İ/ı hatası — "IŞIK" ↔ "ışık" eşleşmiyor).
    - Featured-first yalnız `Önerilen` sıralamasında uygulanır; kullanıcının seçtiği
      Fiyat/Puan/Mesafe sıralamaları saf kalır (admin rozetli tesis diğer sıralamaları manipüle edemez).
    - `DISTANCE_ASC` `parseFloat` yerine ham km değeriyle sıralar (koordinatsız → sona).
    - Bölge eşleşmesi: ilçe eşleşmesinde şehir de doğrulanır (`r.district && r.city` birlikte).
16. **Birim test matrisi** (`tests/unit/pitchFilters.test.ts`, vitest, sabit saat mock'u):
    her filtre × kenar durumlar — fiyatı 0 (bilinmeyen) saha asla elenmez · indirimli fiyat sınır
    değerde (maxPrice=₺920, deal'li saha) · puansız saha 3.5+ filtresinde elenir · legacy olanak
    ("Dus"→"Duş") eşleşir · kortsuz saha tip filtreleri · VE-kesişimli olanaklar · bölge il/ilçe
    kombinasyonları · Türkçe arama ("İSTANBUL"/"ışık") · sıralamalar + featured kuralı ·
    `availability` sayacının gün-duyarlı çalışma saatiyle uyumu.
17. **E2E:** mevcut scratchpad Playwright sürüşü `tests/vitrin-filters.spec.ts` olarak resmileşir
    (stub fixture'lı; CI'da koşulabilir). Rozet bayrakları için 3 senaryo eklenir
    (flag kapalı → rozet yok, fiyat ham, filtre etkisi).
18. **Veri bekçisi (entegrasyon SQL):** yayınlanmış sahalarda invariant denetimi —
    `district NOT NULL`, koordinat NULL ise haritada gizlenir (bilinen davranış), aktif tarife
    veya `total_price>0` beklentisi; ihlaller rapor edilir (vitrin skoru zaten kısmen yapıyor).

## Faz 6 — Onaylanan tasarım iyileştirmeleri

**6A — Hızlı (bu dal, Faz 3 ile birlikte):** kart yüksekliği h-52→h-44 + ikinci kartın "peek" etmesi ·
müsaitlik rozetinin görsel üstüne taşınması (mesafenin karşısı) · fotoğrafsız kartta baş harf monogramı ·
favori yıldızında spring ölçek animasyonu (framer-motion) · ilk favoriye tek seferlik "Favorilerin burada"
tooltip'i (localStorage bayrağı) · harita nokta modunda "Bu bölgede N saha" mini etiketi ·
favori sahaların pin/nokta sarı vurgusu.

**6B — Orta (ayrı PR):** filtre sheet'inde fiyat histogramı (12 kova, saf fonksiyon + test) ·
son filtrelerin hatırlanması (localStorage, 7 gün TTL, bölge değişiminde sıfır) ·
harita kümelemesi (>25 pin & zoom<11: grid-tabanlı sayı rozetli küme, dokununca fitBounds).

**6C — Sonra (ayrı iş):** favori sahaya flash-deal push bildirimi (notifications altyapısı +
`pitch_favorites` join'li DB tetikleyicisi — `notifications/PUSH_NOTIFICATION_PLAN.md`'ye bağlanır).

---

## Karar noktaları — KARARLAŞTI ✓ (kullanıcı, 2026-07-15) ve UYGULANDI

- **N1 · Flash modeli:** `flash_deals_enabled` **varsayılan KAPALI**, admin açar (veto değil, opt-in).
  Aynı model üç bayrağın hepsine uygulandı (featured/flash/availability hepsi default false).
- **N2 · "Bugün müsait" filtresi:** **tamamen kaldırıldı.** Rozet (admin-gated) kaldı, verisi
  düzeltildi; ama filtre olarak sunulmuyor.
- **N3 · Sıralama:** "Önerilen" = **konum varsa yakınlık, yoksa alfabetik (tr-TR)**. Featured-first
  global ezme kaldırıldı — Öne Çıkan artık yalnız görsel rozet, sıralamayı etkilemez.
- **N4 · Harita fiyat bandı:** **rakam kaldı** (₺/₺₺ kısaltması yok).

### Uygulanan dosyalar (dal: claude/field-venue-map-ui-1ll0er)
- `supabase/migrations/20260724000000_vitrin_rozet_yetkisi.sql` — iki bayrak + `protect_pitch_admin_flags`
  trigger + `admin_update_pitch` genişletme + `get_showcase_availability` RPC.
- `tests/integration/vitrin_rozet_yetkisi.sql` — owner bayrak değiştiremez / admin RPC değiştirir + audit.
- `services/pitchFilterService.ts` + `tests/unit/pitchFilters.test.ts` (22 test) — saf filtre motoru.
- `services/pitchContentService.ts` (`setPitchShowcaseFlags` → RPC), `services/pitchBookingService.ts`
  (`fetchShowcaseAvailability`), `views/PitchDiscovery.tsx`, `types.ts`,
  `admin-panel/views/pages/PitchesPage.tsx`, `admin-panel/views/components/PitchStudio.tsx`.
- Doğrulama: `tsc` temiz · `vitest` 22/22 · `vite build` başarılı · Playwright sürüşü 22/22.

> **Deploy notu — UYGULANDI ✓ (2026-07-15, prod iikvzgyccvgcybzdfwlv):** Migration canlıya
> `apply_migration` ile uygulandı. Uygulamadan önce canlı `admin_update_pitch` gövdesi okundu ve
> drift tespit edildi (canlıda `require_admin_role('MODERATOR')` + `is_super_admin()` guard'ları vardı,
> repo migration geçmişinde yoktu) → migration bu guard'ları KAYBETMEDEN yalnız iki kolon ekleyecek
> şekilde uyumlulaştırıldı; repo dosyası da aynı gövdeye güncellendi (repo↔prod yakınsadı).
> Doğrulama (canlı): kolonlar/trigger/RPC/grant mevcut · guard'lar korundu · `get_showcase_availability`
> read-only smoke hatasız · trigger davranış kanıtı (rolled-back): bayrak-dışı güncelleme geçer,
> admin-dışı bayrak değişimi engellenir. Prod'a hiçbir kalıcı test verisi yazılmadı.

## Sıra, efor, riskler

| Faz | Efor | Not |
|-----|------|-----|
| 1 Rozet yetkisi (DB) | M | **Lansman engeli** (T2 açığı) |
| 4 Müsaitlik doğruluğu | M | **Lansman engeli** (T5 yanlış veri) — Faz 1 migration'ıyla birlikte çıkabilir |
| 2+3 Admin UI + istemci | S-M | Faz 1'e bağımlı |
| 5 Filtre saflaştırma + testler | M | Bağımsız başlayabilir |
| 6A Tasarım hızlı | S | Bağımsız |
| 6B/6C | M / M | Ayrı PR'lar |

**Riskler:** (a) canlı DB'de migration drift — `docs/master/MIGRATION_DRIFT_POLITIKASI.md` gereği canlı
fonksiyon önce okunur; (b) `pitch_bookings` public-read kalıntısı varsa Faz 1'de kişisel veri temizliği
öne alınır; (c) trigger, owner panelindeki meşru toplu güncellemeleri kırmamalı — entegrasyon testleri
`updatePitchProfile` yolunu da kapsar.

**Kabul kriterleri:** owner hiçbir yoldan üç bayrağı değiştiremez (SQL testi kanıtlı) · admin panelden üç
rozet de yönetilir ve audit'lenir · iki farklı kullanıcının rezervasyonu olan sahada rozet doğru sayar
(misafir dahil) · gün-bazlı çalışma saati olan sahada kapalı gün rozeti "Bugün dolu" gösterir · birim test
matrisi yeşil · Playwright vitrin sürüşü yeşil · `tsc` + build temiz.
