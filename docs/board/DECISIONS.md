# OYNA Danışma Kurulu — KARAR DEFTERİ

> **Amaç:** Her rol konuşmadan ÖNCE bu dosyayı okur; önceki rollerin kararlarını ve açık P0'ları bilerek konuşur.
> **Kural:** Buraya yalnız **kanıtlı** maddeler girer. Her satır bir `dosya:satır` veya SQL nesne adı taşır.
> **Durum kodları:** 🔴 AÇIK · 🟡 CEO KARARI BEKLİYOR · 🟢 KAPANDI
>
> **Kaynak ortam:** `main` @ `da54bff` · canlı Supabase projesi `OYNA` (`iikvzgyccvgcybzdfwlv`, ap-southeast-1)
> Tüm canlı doğrulamalar **salt-okunur**dur. Hiçbir veri veya şema değiştirilmedi.

---

## Rol ilerleme durumu

| # | Rol | Durum | Çıktı |
|---|---|---|---|
| 1 | **CPO** | ✅ Tamamlandı (3 Ağu 2026) | `docs/board/01-cpo.md` |
| 2 | CTO | ⏳ Bekliyor | — |
| 3 | Software Architect | ⏳ Bekliyor | — |
| 4 | Principal Engineer | ⏳ Bekliyor | — |
| 5 | SRE & DevOps Lead | ⏳ Bekliyor | — |
| 6 | Security & Financial Infra Lead | ⏳ Bekliyor | — |
| 7 | Strategic Advisor | 🔒 Kilitli (1–6 bitmeden açılmaz) | — |

---

## 1. CPO — P0'lar (canlıya çıkışı bloke eder)

| # | P0 | Kanıt | Durum |
|---|---|---|---|
| CPO-P0-1 | **Vitrindeki maçların %83'ü sahte.** `get_nearby_matches()` `SECURITY DEFINER` ve `isDemo` filtresi yok; `app_config.demo_mode_enabled = true` (varsayılanı `false` olmalı). Canlı çağrı: Ordu merkez 25 km → **6 maç, 5'i demo**. | `get_nearby_matches()` gövdesi · `app_config` · `20260708000001:90` | 🔴 AÇIK |
| CPO-P0-2 | **Nakit modda uygulamadan gelen rezervasyonda platform geliri sıfır.** `credit_owner_booking_earning()` yalnız `payment_method='CARD'` **ve** `source<>'OWNER_MANUAL'` iken kayıt üretiyor; canlı etkin mod `CASH_ONLY`. | `credit_owner_booking_earning()` · `resolve_payment_mode()` canlı çıktı | 🟡 CEO KARARI (S1, S2) |
| CPO-P0-3 | **Kaptan kesinleşmiş maçı iptal edince oyuncuların parası iade edilmiyor.** `match_cancel_by_captain()` yalnız kaptanın kaporasını ve sahibin hakedişini işliyor; katılımcı iade döngüsü yok. Ekran ise iade sözü veriyor. | `match_cancel_by_captain()` gövdesi · `views/MatchJoin.tsx:1482` | 🔴 AÇIK |
| CPO-P0-4 | **Maç iptalinde katılımcılara bildirim gitmiyor.** `notify_match_cancelled()` `status='CONFIRMED'` (büyük harf) arıyor; canlıda büyük harf **0 satır**, küçük harf `confirmed` **40 satır**. | `notify_match_cancelled()` · `match_participants` canlı sayım | 🔴 AÇIK |
| CPO-P0-5 | **Vitrinde uydurma yıldız; bir tesis "★ 0".** Liste kartı koşulsuz `★ {p.rating}` çiziyor. Canlı: 4 tesis 0 değerlendirmeyle 4.5–5.0 puan taşıyor, VIP Arena ★ 0 görünüyor. IP-18 ihlali. | `views/PitchDiscovery.tsx:398` · `pitches` canlı veri | 🔴 AÇIK |
| CPO-P0-6 | **Akşam bandında 0 ₺ aktif tarife.** Ahmet Kuru Tesisleri · 2. Saha · hafta içi 15:00–23:00 · `slot_price = 0`, `deposit_amount = 0`, ikisi de aktif. | `pitch_tariffs` canlı veri | 🔴 AÇIK (veri düzeltmesi **CEO onayı** gerektirir) |
| CPO-P0-7 | **Huni ölçümü yok.** Tüm uygulamada 2 analitik olayı var; kuzey yıldızı "başarılı oynatılan maç" hiçbir yerde hesaplanmıyor; admin panosu yalnız kümülatif sayaç. | `App.tsx:289` · `store.ts:542` · `admin_dashboard_stats()` | 🔴 AÇIK |
| CPO-P0-8 | **Bildirim izni değer gösterilmeden, kayıt anında isteniyor**; ret geri alınamıyor. Canlıda 33 profilin 1'inde push token var. | `App.tsx:524-532` · `notifications/pushService.ts:271-281` | 🔴 AÇIK |
| CPO-P0-9 | **Soğuk başlangıç ekranı hiç tetiklenmiyor.** Saha/tesis sorguları coğrafi filtresiz; maç keşfi 0 sonuçta sessizce ülke geneline düşüyor. Canlıda `pitch_demand_signals` = 0 satır. | `views/PitchDiscovery.tsx:549-553` · `views/MatchDiscovery.tsx:133-134` · `services/matchCreateService.ts:61-67` | 🔴 AÇIK |

---

## 2. CPO — P1'ler (ilk 30 gün)

| # | P1 | Kanıt |
|---|---|---|
| CPO-P1-1 | Kadro eşiği `toplam−2` sabit, hakediş doluluğa bakmıyor → eşikte zarar. Gerçek örnek: VIP Arena 3. Saha 3.200 ₺ 5v5 → eşikte **−32 ₺**. | `_match_player_counts()` · `_match_confirm_settle()` · `pitch_tariffs` |
| CPO-P1-2 | `app_config.match_min_player_pct = 70` ayarını **hiçbir canlı fonksiyon okumuyor** (ölü düğme). Depoda çelişen ikinci eşik: `auto-cancel-matches/index.ts:41-42`. | canlı `pg_proc` taraması |
| CPO-P1-3 | Referans/davet döngüsü kopuk: `redeemReferralCode` çağrısız, `/davet` yolu okunmuyor, `assetlinks.json`/`applinks` yok, ödül yok. Canlıda `referral_attributions` = 0. | `services/socialService.ts:187` · `vercel.json:9` · `AndroidManifest.xml:26-31` |
| CPO-P1-4 | Maç hatırlatması iki sebeple kırık: `type_key` uyumsuz (zorunlu sayılmıyor) + `deep_link`'te `oyna://` yok (tıklanınca hiçbir yere gitmiyor). | `20260707000002000:148` · `pushService.ts:30-31,169-173` |
| CPO-P1-5 | Oyuncu no-show'u için hiçbir mekanizma yok (sağlayıcı tarafında tam mekanizma var). | `20260804000000:606-668` vs oyuncu tarafı yok |
| CPO-P1-6 | Eşleştirme kalitesi yok — "Ciddi maç" sadece etiket; `self_skill` beyan ve kapıda kullanılmıyor. Canlıda 33 profilin 22'sinde seviye boş. | `20260730135953:46-48,104,109` |
| CPO-P1-7 | "Güven Puanı" kartı olmayan mekanizmayı anlatıyor; `trust_score`'a yazan tek şey geç iptal cezası. | `components/profile/TrustScoreCard.tsx:70-75` vs `20260904000001:515-517` |
| CPO-P1-8 | Saha değerlendirmeleri toplanıyor, hiçbir yerde gösterilmiyor. | `views/PostMatchEval.tsx:370-376` · `pitch_ratings` okuyan ekran yok |
| CPO-P1-9 | Arz sığ: 6 tesisin 4'ü yayında, 2'sinde **hiç fotoğraf yok**, 1'i sahipsiz. `Ahmet Kuru` kaydında `city="Altınordu"` (ilçe, şehir alanında). | `pitches`/`pitch_media`/`courts` canlı veri |
| CPO-P1-10 | Komisyon üç kaynakta üç değer: `settings.commissionRate=10` (panonun gösterdiği) · `commission_config` 15+5 (motorun uyguladığı) · `pitches.platform_commission_rate` (ölü). | canlı veri · `20260904000000:49-51` |
| CPO-P1-11 | Maç içi sohbet yok; 14 yabancı iletişim kuramıyor. Takım sohbetinde şikâyet/engelleme de yok. | `views/MatchJoin.tsx` (sohbet bileşeni yok) |
| CPO-P1-12 | Sağlayıcı bekleme odası ölü uç: başvuran oyuncu 48 saate kadar oyuncu tarafına dönemiyor; uygulama tersini vaat ediyor. | `App.tsx:406-411` · `PendingVerificationView.tsx:306-312` vs `FieldRolePage.tsx:88-91` |
| CPO-P1-13 | Cüzdan tek yönlü: `wallet_cashout_enabled=false`, oyuncu için kimlik ekranı yok, bakiye varken hesap silinemiyor. | `app_config` · `20260728114605:832-837,968-973` |
| CPO-P1-14 | İptal kuralı tesise göre değişiyor (Ahmet Kuru 10s, diğerleri 6s) ama yayınlanmış sözleşme tek kural vaat ediyor. | `pitches.refund_half_hours` canlı · `public/mesafeli-satis.html:43` |
| CPO-P1-15 | Toplu bildirim kullanıcı tercihini baypas ediyor; ayrı ticari ileti onayı, İYS kaydı ve opt-out bağlantısı yok; panelde onay adımı yok. | `send-push/index.ts:109-111` · `App.tsx:285` · `CampaignsPage.tsx:145-152` |

---

## 3. CPO — CEO kararı bekleyen açık sorular

> Tam gerekçeler ve "cevaba göre ne değişir" analizi: `docs/board/01-cpo.md` §AŞAMA 2b

| # | Soru | Bloke ettiği şey |
|---|---|---|
| S1 | v1'de uygulama içinde para hareketi olacak mı? (Nakit Mod ↔ Cüzdan) | Lansman |
| S2 | Nakit Mod'da rezervasyon başına gelir: hiç mi, tahakkuk mu, sabit bedel mi? | Lansman |
| S3 | Maç kaç kişiyle kesinleşsin? (bugün `toplam−2`, ayar ölü, dokümanla çelişik) | Lansman |
| S4 | Ordu'nun 19 ilçesi açık kalsın mı, yalnız Altınordu mu? | Lansman |
| S5 | İlk 3 ay hedefi — sayıyla? | İlk 30 gün |
| S6 | Eşleştirme kalitesi vaat mi, "ilk gelen alır" mı? | İlk 30 gün |
| S7 | Oyuncu gelmezse ne olsun? | İlk 30 gün |
| S8 | Saha anlaşması tek tip mi, tesise özel mi? | İlk 30 gün |
| S9 | İptal/iade kuralı tek mi, tesise göre mi? | İlk 30 gün |
| S10 | Kaleci/hakem pazaryeri lansmanda açık mı? (tahsilat yok + 500 ₺ teminat çekilemiyor) | İlk 30 gün |
| S11 | Hangi "master prensipler" dosyası bağlayıcı? | Yol haritası |
| S12 | `SAHA_SAHIBI_KARAR_SORULARI.md` kritik 5'i (7·11·27·30·42) | Yol haritası |
| S13 | Taktik Stüdyo lansmanda kalsın mı? (~4.900 satır, ana döngüde zorunlu adımı yok) | Yol haritası |
| S14 | Uygulama içi saha yorumu istiyor musunuz? | Yol haritası |
| S15 | Ekip büyüklüğü ve haftalık kapasite? | Planlama |

---

## 4. CPO — Kayda geçen ÇAKIŞMALAR

| # | Çakışma | Entegre çözüm | CEO kararı? |
|---|---|---|---|
| C-1 | Ürün geliri ↔ Lansman basitliği (gelir kaydı ↔ Nakit Mod) | Nakit Mod'da kal, ama **tahakkuk kaydı** üret: komisyon satırı "tahsil edilmedi" olarak oluşsun | **Evet (S1/S2)** |
| C-2 | Kadro esnekliği ↔ Marj | Eşiği sabit sayı yerine **başabaş formülünden** türet: `CEIL(sahaya_borç / kişi_başı) + 1` | **Evet (S3)** |
| C-3 | Sürtünmesiz onboarding ↔ Eşleştirme kalitesi | Seviyeyi onboarding'de sorma; **ilk maça yazılırken** bağlamla birlikte sor | Hayır |

---

## 5. Sonraki roller için devir notları

**CTO'ya:** İş mantığının ezici çoğunluğu PostgreSQL fonksiyonlarında (840 routine). İstemci fiyat/komisyon hesaplamıyor — bu iyi. Ama üç konuda "aynı gerçeğin iki kaynağı" kalıbı tekrar ediyor: komisyon (3 kaynak), kadro durumu (`matches.slots` JSONB ↔ `match_participants` tablosu), bakiye (`profiles.wallet` ↔ `profiles.wallet_balance` — canlıda **33 profilin 20'sinde bu iki kolon farklı**). Ayrıca migration dosya adları gelecek tarihli: `20260904*` dosyaları 1 Ağustos'ta commit edilmiş.

**Architect'e:** Çifte rezervasyon veritabanı seviyesinde GiST `EXCLUDE` kısıtıyla korunuyor (`20260831000009:13-15`) — bu güçlü. `create_match_atomic` idempotency anahtarı taşıyor. Ancak: maç iptal olunca `pitch_bookings` iptal edilmiyor (hayalet dolu saat), saha rezervasyonu iptal olunca maç ayakta kalıyor. `_match_player_counts` her çağrıda JSONB dizisi tarıyor.

**SRE'ye:** `sweeper_enabled = false` (askıda ödeme süpürücüsü kapalı), `push_live_enabled = false`, Sentry/PostHog anahtarları girilmemiş (cephe env yoksa sessiz no-op). `admin_mfa_required = false`. Bölge `ap-southeast-1` (Singapur) — Türkiye kullanıcısı için hem gecikme hem veri yeri sorusu.

**Security'ye:** RLS 100+ tabloda açık görünüyor. `demo_mode_enabled = true` canlıda ve RLS politikaları buna bağlı. `get_nearby_matches` `SECURITY DEFINER` ve RLS'i baypas ediyor. `admin_broadcast_notification`'ın `p_type` parametresi whitelist'siz. Bölge yurt dışı; cüzdan bakiyesi için 6493 sayılı kanun değerlendirmesi repoda **hiç yok** (hukukçu notu yalnız TKHK açısından bakmış).

---

*Son güncelleme: 3 Ağustos 2026 · CPO turu sonrası*
