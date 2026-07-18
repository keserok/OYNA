# 🏆 OYNA — Konsolide Master Doküman (Tek Kaynak)

> **Ne bu belge?** Depodaki **36 markdown dosyasının tamamı** analiz edilerek, **en güncel dokümanlar baz alınıp** tek yerde birleştirilmiş konsolide durum + karar dokümanı.
> **Oluşturulma:** 2026-07-04 · **Öncelik kuralı:** Çelişkide **en yeni tarihli doküman kazanır** (bkz. §15 Doküman Haritası).
> **Ana kaynaklar:** `OYNA_MASTER_PRENSIPLER.md` (03.07) · `UI_UX_YAPILACAKLAR.md` + `STORE_LANSMAN_PLANI.md` (02.07) · `PROBLEMLER_VE_COZUMLER.md` (30.06) · `RUNBOOK.md` + `GO_LIVE_CHECKLIST.md` (28.06) · `OYNA_OPERASYONEL_DURUM.md` + `OYNA_GO_LIVE_IYZICO.md` + `ADMIN_PANEL_KARARLAR.md` + `WAVE_DEPLOY_PLANI.md` (27.06) · `OYNA_YOL_HARITASI.md` (26.06).
> `docs/eski/` klasörü **arşivdir**; buradaki hiçbir bilgi güncel karar sayılmaz.

---

## 0. Hızlı Durum Özeti (TL;DR)

| Alan | Durum |
|---|---|
| **Ürün çekirdeği (Faz 0–7)** | ✅ Kod tarafı **TAMAM** (main'de). RLS 67/67, admin MFA, bildirim merkezi, komisyon **motoru** SSOT (`commission_config` engine ✅ CANLI; panel `settings` mükerrer alan temizliği Wave 5 bekliyor — §5.1), kademeli iade. |
| **Para motoru** | 🟡 **SIMULATION** modunda tam çalışıyor; gerçek tahsilat için iyzico sözleşmesi + 3 HTTP bağlama kaldı (§5.4). |
| **Push bildirim** | 🟡 Kod üretim kalitesinde; APNs `.p8` + FCM anahtarları bekleniyor (`push_live_enabled` kapalı). |
| **Native mobil (store)** | ✅ Kodla çözülebilen tüm engeller 02.07 itibarıyla giderildi (Android imzalama, iOS bundle/pod/entitlements, ikon/splash, deep link). macOS'ta `pod install` + Xcode 26 derlemesi ve gerçek cihaz QA bekliyor. |
| **Testler** | ✅ `tsc` temiz · production build başarılı · 70/70 birim test · 13 SQL entegrasyon paketi yeşil. |
| **Kritik yol (kod dışı)** | 🔴 iyzico sözleşme/KYC · Apple/Google hesapları (kurumsal) · avukat onaylı yasal metinler + şirket ünvanı · APNs/FCM anahtarları · Ordu 4 saha anlaşması. **Uçtan uca 6–10 hafta** öngörülüyor. |

---

## 1. Ürün Kimliği & Vizyon

- **Gerçek ürün:** Halı saha **rezervasyon platformu** (sosyal ağ değil). Çift taraflı pazar: saha sahipleri ↔ oyuncular.
- **Destekleyici çekirdek:** Takım kurma + **takım-içi taktik paylaşımı** (Taktik Stüdyo).
- **Konumlandırma:** Saha sahibine kolaylık, oyuncuya kolay maç bulma, takım/arkadaşlarla maç.
- **Ton:** Tüketici tarafı **mevcut görsel dil korunur** (Neon Cyberpunk: Deep Navy + Cyber Yellow); saha sahibi paneli **B2B sade/premium**.
- **Lansman şehri:** **Ordu** — 4 tesis: Capo Arena (3 kort) · Olimpiyat (3) · VIP Arena (3) · Ahmet Kuru Tesisleri (4).
- **Ana başarı metriği (kuzey yıldızı):** **Başarılı oynatılan maç** = ödendi → toplanıldı → oynandı → OYNA + saha parasını aldı. Otomatik ölçülür (maç saati geçti + tahsil edildi + iptal yok).
- **İşletme:** Şahıs şirketi — Miraç Kerem Çürüksulu · Uygulama kimliği: `com.oyna.app` · Ad: **"OYNA"** · Sürüm: **3.0.0**.

## 2. Kapsam (Lansman/MVP)

**✅ VAR:** Saha keşfi & rezervasyon · Maç oluşturma/katılım (iki taraflı: oyuncu + saha sahibi) · Kaleci/Hakem kiralama · Takımlar + Arkadaşlar + takım-içi Taktik Stüdyo · Oyuncu kartları (yalnız admin kontrolünde) · Fair-play/güvenilirlik · Maç sonu değerlendirme · 1-1 mesajlaşma · Admin paneli (GodView).

**❌ YOK (kapsam dışı):** Turnuvalar · Topluluklar · AI Koç (Gemini) · OYNA TV · Oyunlaştırma (ELMAS/KARAT, lider tabloları, rozetler) · Saha SaaS ücretli planları · Oyuncu Premium/Pro · Maç içi grup sohbeti · Para yükleme · Sadakat/kupon (sonraya).
> Uygulama kararı: kapsam-dışı modüllerin **kodu silinmez, feature-flag ile menüden gizlenir** (admin paneli tarafı — ADMIN_PANEL_KARARLAR global karar #4). Tüketici tarafındaki Premium/Topluluk **kalıntıları temizlendi** (PRENSIPLER §14.2).

## 3. Roller, Kimlik & Onboarding

### 3.1 Roller
- **Lansman rolleri:** `PLAYER`, `GOALKEEPER`, `REFEREE`, `OWNER` + Adminler. Global `CAPTAIN` ve `COMMUNITY_ADMIN` kaldırıldı.
- **Kaptanlık = takım-içi yöneticilik:** Takımı kuran otomatik yönetici; yönetici herkese yönetim yetkisi verebilir (çoklu yönetici). Yetkiler: taktik onay + oyuncu ekle/çıkar.
- **Çoklu rol:** Uygulama-içi **"Rol Değiştir"** (re-login yok); `set_active_role` RPC yalnız kullanıcının `roles[]` içindeki rollere geçirir (ayrıcalık yükseltme imkânsız) + onay adımı.
- **Admin rolleri:** `SUPER_ADMIN` (sınırsız) · `FİNANS` (komisyon/payout/finans) · `OPERASYON` (doğrulama/kullanıcı/dispute/maç). Tüm kritik işlemler audit'li.
- **Saha sahibi sınırı:** Tanıtım serbest (afiş/QR); **oyuncu hesabı adına işlem/davet yasak**; manuel rezervasyon = kendi offline defteri; veresiye modülü OYNA para akışına karışmaz.

### 3.2 Kimlik & Onboarding (— §14 revizyonlarıyla GÜNCEL hali)
- **Giriş:** Google + Apple (birincil), e-posta OTP (ikincil, şifresiz). **SMS ile giriş YOK.**
- **Onboarding — ertelenmiş model (onaylı):** 3 ekran değer anlatımı → Auth → bağlamsal konum izni; profil tamamlama ilk maç akışına ertelenir. *(Eski "sayfa sayfa zorunlu sihirbaz + zorunlu profil fotoğrafı" kararı düştü.)*
- **Misafir modu — değer kapılı (uygulandı, ⚠️ kurucu onayı bekliyor):** Misafir yalnız gezinir (`isGuest` + `SignupGate`); maça katıl/ödeme gibi yazma aksiyonlarında kayıt daveti açılır. Reddedilirse `AuthScreen` butonu kaldırılır.
- **Hesap silme:** Aktif rezervasyon/bloke edilmiş katılım varken **engellenir** (DB guard'ı uygulandı); bekleme süresi tek kaynak `app_config.account_deletion_wait_days` = **7 gün** (UI eşitlendi).
- **Yaş politikası:** 18+ kendi kartıyla öder. 18 altı kayıt olup oynayabilir; ödeme **zorunlu yetişkin kartı + açık onay** (veli onayı). Yetişkin kartı olmayan 18 altı **yalnız ücretsiz sahaları** görür (§4.6 matrisi). Asgari kayıt yaşı (öneri 15) — açık kalem.
- **KVKK:** Onay kutusu **opt-in** (varsayılan işaretsiz — düzeltildi); kanun no **6698** (düzeltildi); metinler **hukukçu onayı bekliyor**.

## 4. Çekirdek Akışlar

### 4.1 Maç Yaşam Döngüsü (Plei-uyarlı) — sistemin kalbi
```
Oluştur → hemen yayınla (TOPLANIYOR) → katılım = kart BLOKAJI (pre-auth, tahsil değil)
→ T-8 saat ONAY ANI (admin ayarlı):
   min oyuncu (varsayılan %70) ✓ → tümü TAHSİL + saha kesin rezerve + CONFIRMED + kadro kilidi
   ✗ → tüm blokajlar SERBEST + otomatik CANCELLED (kimse ödemez)
→ COMPLETED → otomatik "başarılı maç" sinyali
```
- **Formatlar:** 2v2 → 11v11, kaydırılabilir seçici. Açık/özel maç (süreli özel kod/link). Boş kontenjan + opsiyonel pozisyon etiketi.
- **Saha slotu:** hedeflenince geçici hold (`pitch_slot_holds`); onayda kesin booking. Dolunca **yedek listesi**, boşalınca ilk yedek otomatik girer.
- **Onay sonrası iptal (kademeli, admin ayarlı):** T-8s→T-3s: yerine biri bulunursa kredi · <T-3s: iade yok · no-show: fair-play ↓.
- **Yönetim:** Maç kurulduktan sonra tek ekran **"Maçlarım"** (kadro + ödeme durumu + kaleci/hakem ekleme + düzenle/iptal + paylaş).
- **İki taraflı maç açma:** Oyuncu/kaptan açar → **Model A**; saha sahibi kendi boş saatini açar → **otomatik Model B** (DB trigger'ı canlı).

### 4.2 Doğrudan Saha Rezervasyonu
- "Sahayı Kirala": tek kişi **kaporayı** öder, müsaitse anında rezerve. Kapora kaynağı: tarifedeki `deposit_amount` (yoksa %30 fallback).
- **Müsaitlik = tek birleşik takvim:** tarife + rezervasyon + abonelik + istisna (kapalı saat). PENDING de doluluğa sayılır (çifte rezervasyon önlenir).
- **İptal kademesi (uygulandı, admin ayarlı):** ≥24s %100 · 6–24s %50 · <6s iade yok. Zamanında iptalde komisyon DAHİL tam iade (yalnız PSP kesintisi düşer).
- Maç keşif arama yarıçapı: **5–50 km, 5'er km adım** (04.07 hizalaması).

### 4.3 Kaleci & Hakem (hizmet motoru — Faz 5 uygulandı)
- **Tek "talep" modeli** (eski JobListing/DirectOffer/IncomingBid birleştirildi). Sabit ücret, pazarlık yok, **%10 komisyon** (ayarlanabilir).
- Eşleştirme: sistem **müsait + en yakın + en yüksek puanlı**yı önerir, kaptan seçer. Çakışan saatte ikinci iş alınamaz (PENDING dahil).
- **Payout: maç bitiminde ANINDA** — oyuncular 1–10 değerlendirdikten sonra (değerlendirme = katılım kanıtı). İlk payout öncesi **TC kimlik kapısı**. *(Saha sahibi payout'u iki haftada bir — farklı!)*
- Başvuru: aynı hesaba rol başvurusu + admin OPERASYON onayı (hakem: lisans belgesi). Kadro oylaması (%50+1) ile ortak ödeme: **hızlı takip** (bireysel ödeme yolu kuruldu).

### 4.4 Takımlar, Arkadaşlar & Taktik (Faz 6 uygulandı)
- **Takım:** ad + arma + 2 renk + kısa ad. Kurma **max 5**, üyelik sınırsız. Davet → kişi onaylar. Kaptan devri + çoklu yönetici + son yönetici ayrılınca **arşiv** (geçmiş korunur).
- **Takım vs takım:** özel kodla davet; skor **iki taraf onayı + idempotency** ile W/L geçmişine işlenir.
- **Taktik sosyal motoru:** "En İyi Taktikler" vitrini + **% oylama** + yorum + favori + **aktif taktik** + kopyala&öner (yönetici onaylı). Studio modülerleştirildi; animasyon **lazy-load edilen gelişmiş modül**.
- **1-1 mesajlaşma:** yalnız arkadaşlar, realtime, engelleme var; medya/grup mesajı sonraya.

### 4.5 Maç Sonu, Skor & Fair-Play
- **Skor (opsiyonel, çok kaynaklı):** oyuncu (tüm takım onaylarsa takım geçmişine) · hakem (resmi kayıt) · saha sahibi (iki kayıtlı takım talep ederse). Pickup maçta otomatik takım oluşturulmaz.
- **Değerlendirme:** atlanabilir, 2 sayfalık hızlı akış; fair-play yıldızı + opsiyonel oyuncu puanı + hizmet alındıysa kaleci/hakem 1–10. **MOTM** = kozmetik etiket.
- **Güvenilirlik (tek skor, 0–100, başlangıç 100):** no-show −20 · geç iptal −10 · kötü değerlendirme −5 · sorunsuz maç +2 (admin ayarlı). Eşikler: <80 uyarı · <60 kısıt · <40 geçici ban. Skoru **yalnız kullanıcı + admin görür**.
  - ⚠️ Bilinen borç: kodda `rating`/`fairPlayScore`/`reliabilityScore` hâlâ ayrı — tek skora indirgeme DB+UI koordineli refactor; **lansman engeli değil** (PRENSIPLER §14.3).
- **Sorun Bildir:** no-show · sportmenlik dışı · ödeme/saha sorunu · taciz → admin OPERASYON kuyruğu. Skor itirazı yok.

### 4.6 Ücretsiz Sahalar & Yaş Matrisi (planlı — henüz kodda yok)
| Segment | Ücretsiz saha | Ücretli saha |
|---|---|---|
| 18 altı — yetişkin kartı yok | ✅ | ❌ |
| 18 altı — yetişkin kartı + onay var | ✅ | ✅ |
| 18+ | ❌ | ✅ |

`is_free` kavramı **ayrı faz** olarak yapılacak (PRENSIPLER §14.3). Ücretsiz sahada para mekaniği yok; fair-play kuralları geçerli.

## 5. Gelir Modeli & Para Akışı 💰

### 5.1 Komisyon Modelleri (SSOT: `commission_config`, 4 seviye admin-yönetimli)
| Model | Tetikleyici | OYNA payı | Saha payı |
|---|---|---|---|
| **A — Normal rezervasyon/oyuncu maçı** | Oyuncu/kaptan açar | Kaporanın **%15**'i | Kalan kapora (2 haftalık payout) + saha ücreti tesiste |
| **B — Owner-organize maç** | Saha sahibi kendi sahasında açar (**otomatik trigger**) | **%5 + markup** (varsayılan %20, admin ayarlı; oyuncuya EK yansır) | Normal fiyatın **%95**'i |
| **Kaleci/Hakem hizmeti** | Hizmet talebi | **%10** | — (sağlayıcıya anında payout) |

- Komisyon **saha sahibince değiştirilemez**; yalnız admin (global/saha/hizmet/maç bazında override). **İki ayrı "çift-kaynak" meselesi:** (1) **Ödeme motoru — ✅ KAPATILDI:** eski %10 hardcode bug'ı giderildi, `create_payment_intent`/`calculate_commission` artık yalnız `commission_config`'ten okuyor (engine SSOT ✅ CANLI). (2) **Panel/`settings` — ⏳ AÇIK:** `settings`'teki mükerrer komisyon alanının kaldırılıp panelin yalnız `commission_config`'ten okuması hâlâ **Parti B · Wave 5** bekliyor (ADMIN_PANEL Soru 3 & 77). §0/§8'deki "komisyon tek kaynak · Wave 5" bu ikinci meseleyi kasteder — motor SSOT'u ile karıştırılmamalı.
- Fiyatın tek kaynağı **`pitch_tariffs`**; çakışan tarifede en son güncellenen geçerli.

### 5.2 Ödeme Tekniği
- **Sağlayıcı:** iyzico (alt-üye işyeri/marketplace + pre-auth). Blokaj = ön-provizyon; T-8s'te capture; tutmazsa void. Başarısız capture → oyuncu düşer, yedek girer.
- **İade:** OYNA kredisi veya karta; **PSP kesintisi orantılı düşülür** (`refund_psp_fee_pct/_fixed`, go-live'da iyzico oranı yazılır). Owner çift-ödeme önlemi: iadede bekleyen kazanç per-intent iptal/negatif telafi ile netlenir.
- **Cüzdan (iki tür):** Kazanç bakiyesi (GK/hakem/owner → IBAN payout) · İade kredisi (yalnız OYNA-içi, çekilemez). Para yükleme lansmanda yok.
- **Payout (hedef model):** Saha sahibi **2 haftada bir** (IBAN doğrulamalı) · kaleci/hakem **anında**. ⚠️ **Uygulama durumu:** payout ŞU AN operatör tarafından `FinancePage → processPayout` ile **ELLE** `COMPLETED`/`FAILED` işaretleniyor (`iyzico_payout_ref` manuel giriliyor). Gerçek iyzico submerchant/IBAN transfer API'si + owner 2-haftalık `pg_cron` job'ı + maç-`COMPLETED`'a bağlı anında provider payout tetiği **HENÜZ YOK** (KALAN İŞ — §8 Parti D / §14 GELİŞTİRİCİ #11). §5.4'teki "kalan 3 HTTP bağlama" yalnız tahsilat/iade akışını kapsar, **payout otomasyonunu kapsamaz**.

### 5.3 Acil Durum
**Tek anahtar:** Sistem Parametreleri → Güvenlik → `admin_readonly_mode` = AÇIK → tüm god-mode para işlemleri durur (READ_ONLY_MODE). Kapatmak her zaman mümkün (RUNBOOK §2).

### 5.4 SIMULATION → IYZICO Geçişi (kalan yalnız 3 HTTP bağlama)
Altyapı hazır (cron canlı, RPC'ler + capture/void/refund/send-email edge'leri **deploy edilmiş ACTIVE**); sözleşme + anahtarlar gelince:
1. **Maç katılımı → gerçek pre-auth:** `create-payment` edge'ine maç dalı (`create_match_preauth`: PENDING → iyzico pre-auth → BLOCKED).
2. **T-8s provider capture/void:** `process_match_at_deadline` IYZICO modunda pg_net ile intent başına `capture-payment`/`void-payment` tetikler.
3. **İptal → karta gerçek iade:** iptal yolları `refund-payment` edge'ini çağırır.

⚠️ **Çözülmemiş go-live blokerleri (sözleşme sonrası, sandbox'ta doğrulanmalı):**
- **İade referans netliği:** `refund-payment`, iyzico iadesinde `intent.provider_ref`'i `paymentTransactionId` olarak geçiyor. Bunun `capture-payment` dönüşündeki gerçek kalem-bazlı `paymentTransactionId` olduğu **canlı sandbox'ta bir capture→refund turuyla doğrulanmadan `IYZICO`'ya geçiş BLOKE** (aksi halde iade iyzico'da başarısız olurken panel "tamamlandı" gösterebilir). Gerekirse `payment_intents`'a ayrı `payment_transaction_id` kolonu.
- **Mutabakat (reconciliation):** Canlı para öncesi günlük iyzico raporlama API'sinden çekilen kayıtlar OYNA ledger'ıyla eşleştirilip `reconciliation_report` üretilmeli (delta/eksik-iade/çift-tahsilat işaretleme); Ön-Uçuş'a `reconciliation_clean` kapısı eklenir. *(§14 GELİŞTİRİCİ #12.)*

Anahtar çevirme sırası: edge secrets (`PAYMENT_PROVIDER=IYZICO`, `IYZICO_*`, `PAYMENT_EDGE_SECRET`) → **Finans → Go-Live Ön-Uçuş tüm satırlar yeşil** (`payment_provider`, `no_stuck_intents`, `commission_configured`, `readonly_mode_off` + provider_ref doğrulandı + `reconciliation_clean`) → panel `payment_provider=IYZICO` → küçük gerçek kartla test + iade. Geri dönüş: tek anahtarla `SIMULATION`.

## 6. Teknoloji & Mimari

- **Frontend:** React 19 + TypeScript + Vite 6 + TailwindCSS v4 + Zustand + Framer Motion + Leaflet + Recharts. Router yok — `App.tsx` içinde `view` state switch'i (~40 lazy ekran). ErrorBoundary + Sentry/PostHog (env boşsa no-op). Ana paket 386KB→**57KB** (lazy'leme sonrası).
- **Backend:** Supabase — Auth (OTP/Google/Apple) · PostgreSQL 17 (**126+ migration, ~73 tablo, RLS 67/67 aktif**) · Realtime · Storage · **9 Edge Function** (create/capture/void/refund-payment, payment-webhook, send-push, send-email, admin-broadcast, admin-create-user — legacy `push-notification` silindi). Proje ref: `iikvzgyccvgcybzdfwlv`.
- **Mobil:** Capacitor 8 (10-12 plugin). Android + iOS native katman **02.07'de onarıldı** (bkz. §11).
- **Admin:** Ayrı SPA (`admin-panel/`, `admin.html`), Supabase Auth + **zorunlu MFA (TOTP, AAL2)**. İki mod: OPanel (operasyon) + GodView (platform).
- **SSOT ilkesi:** Her varlık için tek kanonik tanım · snake_case standardı · tek `FORMATIONS` kaynağı · komisyon `commission_config` (motor SSOT canlı; panel/`settings` tek-kaynağa indirme Wave 5) · operasyonel parametreler `app_config` (deploy'suz panel değişikliği) · feature-flag `feature_flags`.
- **Ölçek hedefi:** Mimari 100k+ kullanıcıya; lansman gerçekçi hedef ~10–20k kayıtlı, pik ~300–500 eşzamanlı, ~100 maç/gün. Eşzamanlı katılım atomik (ilk gelen alır).

## 7. Bildirim Sistemi

- **Tek kaynak:** Supabase `notifications` (realtime). **Firebase/Firestore backend YOK** — FCM yalnız Google'ın zorunlu push taşıma katmanı.
- **3 kanal:** Uygulama-içi (realtime merkez) · Push (iOS APNs / Android FCM; DB trigger → `send-push` edge) · E-posta (yalnız makbuz + payout özeti, Resend). **SMS yok.**
- **Şablonlar:** `notification_templates` (TR metin, kategori, zorunlu/kapatılabilir, `deep_link`). Deep link: `oyna://<resource>/<id>` (`@capacitor/app` bağlandı, iOS `CFBundleURLTypes` + Android intent-filter eklendi).
- **Kategoriler:** MAÇ · KADRO/HİZMET · ÖDEME/FİNANS · SİSTEM (zorunlu) + HATIRLATMA (kapatılabilir; 24s & 1s cron canlı). Sessiz saat + saatlik rate-limit ayarlanabilir.
- **Admin broadcast:** hedefli segment (tüm/oyuncu/owner/GK-hakem/şehir) + önizleme + "N kişiye gönderilecek, onayla" + audit.
- **Go-live şartı:** `WEBHOOK_SECRET` + DB webhook `Authorization: Bearer` header'ı (yoksa send-push 401 reddeder) → `push_live_enabled=AÇIK` → gerçek cihaz testi. Kapalıyken uygulama-içi bildirimler yine çalışır.

## 8. Admin Paneli (GodView) — "Her problem panelden çözülür"

- **İlke:** Tam yetki + tam esneklik; audit **append-only** — değiştirilemez/silinemez, SUPER_ADMIN bile kendi izini silemez (KARARLAR Soru 12 ✅). ⚠️ Audit **kapsamı henüz %100 değil:** ~18 admin işlemi ortak `log_admin_action(...)` yardımcısına bağlanana kadar audit yazmıyor (Soru 11 🔧 Wave 4); tamper-evidence hash-zinciri de planlı (Soru 37).
- **Sayfalar:** Dashboard · Users (Kullanıcı 360) · Pitches · Matches (Kokpit) · Finance · Commission · Disputes · Moderation · VerificationCenter · NotificationTemplates/Campaigns · SystemParams · ACL · AuditLog · CommandCenter.
- **Maç Kokpiti:** kadro/slot müdahalesi · skor override (`admin_override_match_score`) · force capture/void/refund (`admin_refund_intent`) · force-confirm/iptal (iadeli) · payout tetik · kadroya bildirim · maça-özel audit timeline. *(RPC'ler hazır; bir kısım butonun UI bağlantısı kalan iş #12.)*
- **Ghost mode:** yalnız yetkili admin, sunucu-taraflı oturum + süre sınırı (30 dk) + varsayılan read-only + zorunlu sebep — sertleştirme Wave 10 kapsamında.
- **100 Soru → Karar süreci:** `ADMIN_PANEL_100_SORU.md`'deki tüm sorular `ADMIN_PANEL_KARARLAR.md`'de karara bağlandı; işler **14 Wave / 5 Parti** halinde uygulanıyor:
  - **Parti A (Güvenli Temel — Wave 1,2,4):** ✅ CANLIDA (`app_config` 13 kural, `feature_flags`, settings şeması, audit **append-only değişmezliği**, RBAC yardımcıları). ⚠️ Wave 4'ün **audit kapsam tamamlaması** (~18 RPC → `log_admin_action`) hâlâ 🔧 kısmi (Soru 11).
  - **Parti B (Kontrolü Bağla — Wave 3,5,6):** kuralları `app_config`'e bağla, komisyon tek kaynak, kapsam-dışı gizle.
  - **Parti C (Güvenlik & İzolasyon — Wave 7,8,10):** demo `is_demo` izolasyonu, sunucu-taraflı alt-rol zorlaması (SUPER_ADMIN her zaman geçer kaçışıyla), ghost/CORS/PII sertleştirme.
  - **Parti D (Para & Operasyon — Wave 9,11,12):** kokpit tamamlama, gerçek payout API, bildirim go-live. **Kurucu onayı + sandbox kanıtı olmadan canlıya alınmaz.**
  - **Parti E (Dayanıklılık & Cila — Wave 13,14):** CI gate, E2E, izleme, UI standartları — Parti D'den önce test/izleme kısmı önerilir.
- **Deploy:** `npm run admin:deploy` (tüm migration'lar idempotent + doğrulama RPC'leri). Her partide: yedek/PITR → branch ortamında test → advisors → sıralı uygulama → smoke → geri-alma hazır (WAVE_DEPLOY_PLANI §3).

## 9. Güvenlik Durumu

**✅ Yapıldı:** RLS 67/67 + art arda hardening migration'ları · admin zorunlu MFA · webhook imza doğrulama (iyzico token yeniden sorgulanır) · `admin-broadcast` **fail-closed** yapıldı · auth'suz legacy `push-notification` fonksiyonu ve bayat kopya **silindi** (Supabase undeploy = kurucu aksiyonu) · `IS_LOCAL_DEV` yalnız `VITE_DEV_MODE=true` ile · secret'lar Supabase secrets'ta, `.gitignore` düzenlendi (keystore/google-services/p8/p12 asla commit'lenmez).

**🔴 Kalan (lansman öncesi, çoğu KURUCU):**
1. **Edge CORS:** `ALLOWED_ORIGIN` / `ADMIN_ALLOWED_ORIGIN` gerçek domainlere (varsayılan `*`).
2. **`ADMIN_EDGE_SECRET` + `WEBHOOK_SECRET` + `PAYMENT_EDGE_SECRET`** set edilmeli.
3. **profiles PII (KVKK riski):** oyuncular birbirinin e-posta/telefon/konumunu okuyabiliyor → `public_profiles` view'ine geçiş **mobil sürümle koordineli** (mağaza sürümü tam fırsat).
4. Canlı `pg_policies` denetimi: 13 dosyadaki `USING (true)` policy'lerinin gerçekten ezildiğini üretimde doğrula.
5. Demo hesapların (`*@oyna.app` / `password123`) üretimde kapalı olduğunu doğrula; `get_advisors` raporunu kapat.
6. Secret rotasyon takvimi: service-role 180g · webhook/payment secret 90g · sızıntıda anında iptal (RUNBOOK §6).
7. **Webhook replay/idempotency (`payment-webhook`):** imza doğrulanıyor ama tekrar-koruması yok → geçerli bir isteğin tekrarı çift cüzdan-kredisi/çift rezervasyona yol açabilir. `processed_webhook_events` tablosuna event_id **UNIQUE** (çakışmada atla) + payload timestamp'ine ±5 dk tolerans (KARARLAR Soru 34, Wave 10).
8. **Admin-auth sertleştirme (Wave 10 — KARARLAR Soru 24–27):**
   - **MFA cihaz-kaybı kurtarma (🔴 kritik):** bugün zorunlu TOTP, cihaz kaybında admin'i tamamen kilitler. Enroll'da 8–10 tek-kullanımlık recovery kodu (hash'li) + SUPER_ADMIN'in çağırdığı audit'li `admin_reset_mfa` (self-reset yasak).
   - **Oturum hijyeni:** 15 dk idle-logout + 8 saat mutlak oturum + kritik işlem öncesi step-up MFA (şu an yalnız AAL2 zorunlu; idle/TTL kodu yok).
   - **Login rate-limit + alarm:** IP+email başına 5 başarısız/15 dk kilit + başarılı login/kilitlenme alarmı + tüm denemeler audit.
   - **Ağ kısıtı (🙋 KURUCU):** `admin.html` Cloudflare Access/Zero Trust arkasına + `admin-*` edge'lerde IP/CIDR allowlist.

**Dayanıklılık:** RPO ≤5 dk (**PITR açılmalı — kurucu**, yoksa ~24 saat) · RTO ≤1 saat · Sentry DSN + uptime izleme bağlanmalı.

## 10. UI/UX Durumu (02.07 denetimi — 20 bulgu)

**✅ Uygulandı:** onboarding (3 ekran, ilk açılışta bir kez) · misafir modu (`isGuest` + `SignupGate`; sahte `u1` yazımları kaldırıldı) · Android geri tuşu · zoom serbest · global toast (`GlobalToast`) + kritik catch'ler · hayalet `ROLE_SELECTION` fallback'leri temizlendi · KVKK opt-in · Apple çifte navigasyon · ödeme formu doğrulama (Luhn + SKT + CVV + `cc-*` autocomplete) · lazy import (386→57KB) · görsel optimizasyonu · 600 adet `#FFFF00`→marka sarısı `#FACC15` · yük taşıyan metinler 12px.

**⏳ Bilinçli ertelenen:** sekme-başına geri yığını (büyük refactor) · liste sanallaştırma (gerçek cihaz testiyle) · UI kiti birleştirme (kademeli; yeni kod `AnimatedButton`) · kalan ~60 sessiz catch (altyapı hazır, kademeli) · iskelet standardizasyonu (şablon: `MyMatchesHub` Skeleton/Error/Empty üçlüsü).

**Tasarım kararları:** Alt navigasyon 5 sekme: Ana Sayfa · Top Oyna · **Sosyal (Takımlar+Arkadaşlar)** · Harita/Sahalar · Profil. Renk semantiği: sarı `#FACC15` marka, yeşil `#39FF14` başarı/aksiyon. Dil: lansmanda yalnız Türkçe (i18n altyapısı lansman sonrası). Rol renkleri: oyuncu sarı / kaleci yeşil / hakem kırmızı / tesis mavi.
> `UI_SONHAL_SORULARI.md`'deki 120 soruluk rol-bazlı cilalama seti **cevap bekliyor** — onaylananlar `feature/ui-*-polish` branch'lerine bölünecek.

## 11. Store Lansman Planı (özet)

**✅ 02.07'de kapatılan kod engelleri:** Android `colors.xml` + izinler + portre kilidi + `versionName 3.0.0` + koşullu release imzalama + bildirim ikonu · iOS bundle `com.oyna.app` + Podfile onarımı (12 pod) + `App.entitlements` (Push + Sign in with Apple) + yalnız iPhone/portre · markalı ikon/splash tüm boyutlara · `/gizlilik` + `/hesap-silme` statik sayfaları · Geliştirici Konsolu kaldırıldı · çevrimdışı uyarı şeridi · `arsiv/` silindi.

**Fazlar:** A native onarım ✅ → B güvenlik (kalanlar §9) → C ürün düzeltmeleri ✅ → **D ödeme go-live (kritik yol)** → E push go-live → **F yasal/KVKK (kritik yol)** → G marka varlıkları/mağaza içerikleri → H hesaplar/formlar (**hemen başla**) → I QA & beta (TestFlight + Play kapalı test) → J yayın (staged rollout %10→%50→%100).

**Kritik bilgiler:**
- **Google Play:** kişisel hesapta **12 tester × 14 gün zorunlu kapalı test** → **kurumsal hesap şiddetle önerilir** ($25). targetSdk 35 ile şimdi çıkılabilir; **31.08.2026'dan itibaren API 36 zorunlu** (ilk güncellemeye planla).
- **App Store:** Xcode 26 / iOS 26 SDK zorunlu (28.04.2026'dan beri). Apple Developer $99/yıl; şirket hesabı için D-U-N-S.
- **IAP muafiyeti (avantaj):** Halı saha = fiziksel hizmet → Apple IAP **zorunlu değil** (Guideline 3.1.5(a)); iyzico serbest — App Review notlarına yazılmalı.
- **Veri güvenliği formları:** konum, e-posta, ad, fotoğraf, ödeme (iyzico'ya), push token, PostHog, Sentry beyan edilecek. Yaş derecesi muhtemelen 12+/Teen.
- **Takvim:** kod 1–2 hafta; kritik yol kod dışı (iyzico + yasal + hesaplar) → **uçtan uca 6–10 hafta**.
- **Karar noktası (açık):** iyzico gecikirse ilk sürüm ödeme akışı feature-flag arkasına gizlenerek çıkılabilir — lansmanı sözleşmeden ayrıştırır.

## 12. Go-Live Anahtarları (panel + secret İKİSİ birlikte)

| Anahtar | Yer | Simülasyon | Gerçek | Ek şart |
|---|---|---|---|---|
| Ödeme sağlayıcısı | Sistem Parametreleri → Ödeme | `SIMULATION` | `IYZICO` | `IYZICO_*` + `PAYMENT_EDGE_SECRET` secrets + Ön-Uçuş yeşil |
| Gerçek push | Sistem Parametreleri → Bildirim | KAPALI | AÇIK | `APNS_*`/`GOOGLE_*` + `WEBHOOK_SECRET` + webhook header |
| Demo modu | Sistem Parametreleri → Sistem | (kapalı) | KAPALI | purge + 0 demo satır doğrulaması |
| Acil durdurma | Sistem Parametreleri → Güvenlik | KAPALI | KAPALI | sorun anında AÇ |

Lansman günü kontrolü: `demo_mode_enabled=KAPALI` · demo purge · Go-Live Ön-Uçuş yeşil (`payment_provider`, `no_stuck_intents`, `commission_configured`, `readonly_mode_off`) · en az bir `provider_identities` VERIFIED.

## 13. Test & Kalite

- **Birim:** 70/70 Vitest yeşil · `tsc --noEmit` temiz · production build 9.9 sn · `cap sync android` temiz.
- **SQL entegrasyon (13 paket, BEGIN…ROLLBACK izole):** komisyon motoru · ödeme motoru · maç yaşam döngüsü · para düzeltmeleri · Faz 5 hizmet motoru (17) · Faz 6 sosyal/taktik (19) · Faz 7 güvenlik/SSOT/iade/para kararları · saha vitrini rezervasyon/kapora (8) + içerik güvenliği. Bu testler **8+ gerçek üretim hatası** yakaladı (quorum onay çökmesi, iade kaybı, çift tahsilat, cüzdan trigger kilidi…) — kanıtlanmış değerli, **her para değişikliğinde koşulmalı**.
- **Eksik:** payout yaşam döngüsü e2e (#15) · Playwright operasyonel E2E + CI required-check gate (Wave 13) · gerçek cihaz matrisi QA (düşük segment Android + çentikli iPhone) · izin-reddi senaryoları.

## 14. Kalan İşler — Konsolide Tablo

### 🔴 KURUCU (kod dışı — kritik yol, hemen başlat)
| # | İş |
|---|---|
| 1 | iyzico sözleşmesi + KYC (pazaryeri + pre-auth) → canlı API anahtarları |
| 2 | Apple Developer ($99, D-U-N-S) + Google Play **kurumsal** hesap ($25) |
| 3 | Avukat onaylı 4 yasal metin + şirket ünvanı/MERSİS doldurma + VERBİS değerlendirmesi |
| 4 | APNs `.p8` + Firebase/FCM anahtarları + `google-services.json` |
| 5 | Edge secrets seti: `ADMIN_EDGE_SECRET`, `WEBHOOK_SECRET`, `PAYMENT_EDGE_SECRET`, CORS origin'leri, `RESEND_API_KEY`, Sentry/PostHog |
| 6 | Ordu 4 saha gerçek fiyat/takvim anlaşması |
| 7 | Supabase PITR aç + uptime izleme + Sentry hesabı |
| 8 | Tasarımcı: nihai logo master'ları + ekran görüntüleri + feature graphic |
| 9 | Misafir modu kararı (değer kapılı model onayı — PRENSIPLER §14.1) |

### 🧱 GELİŞTİRİCİ (kod — çoğu iyzico'yu beklemeden yapılabilir)
| # | İş | Bağımlılık |
|---|---|---|
| 1 | iyzico 3 HTTP bağlama (§5.4) + PaymentScreen gerçek tahsilat | KURUCU #1 |
| 2 | Admin kokpit UI: skor override + force refund butonları (RPC hazır) | — |
| 3 | Kapsam-dışı admin sayfaları feature-flag ile gizleme (Wave 6) | — |
| 4 | Doğum tarihi onboarding alanı (18-yaş/veli onayı) | — |
| 5 | profiles PII → `public_profiles` (mobil sürümle koordineli) | mağaza sürümü |
| 6 | Payout yaşam döngüsü e2e testi + Playwright E2E + CI gate | — |
| 7 | Tek güvenilirlik skoru refactor'u (lansman sonrası olabilir) | — |
| 8 | `is_free` ücretsiz saha fazı (§4.6) | — |
| 9 | targetSdk 36 yükseltmesi (31.08.2026 öncesi ilk güncellemede) | yayın |
| 10 | Wave partileri B → C → D sırasıyla canlıya (E'nin test/izleme kısmı önce) | Parti A ✅ |
| 11 | **Gerçek payout otomasyonu:** `iyzico-payout` edge (submerchant/IBAN transfer) + owner 2-haftalık `pg_cron` + maç-`COMPLETED` anında provider payout tetiği (şu an elle işaretleniyor; manuel yalnız fallback olmalı) | KURUCU #1 |
| 12 | **Mutabakat (reconciliation):** günlük iyzico raporu → `reconciliation_report` + Finans → Mutabakat sekmesi (delta/eksik-iade/çift-tahsilat) + Ön-Uçuş `reconciliation_clean` kapısı; ayrıca `provider_ref==paymentTransactionId` capture→refund doğrulaması | KURUCU #1 |
| 13 | **Persona-türevli UX (kapsam-içi, 5/5):** (a) maç oluştururken arkadaş listesinden doğrudan kadro seçimi (`MatchCreate` adım 3 → `FriendsSelector`; kod/link davetine EK) — Cem/Deniz; (b) bağlamsal "Akıllı Dashboard CTA" (karar felcine karşı kişiselleştirilmiş yönlendirici) — Hakan/Murat, UI_SONHAL ile koordine | — |

## 15. Doküman Haritası & Yetki Sırası

> **Klasör düzeni (04.07 yeniden düzenleme):** Güncel dokümanlar **`docs/master/`**, arşiv **`docs/eski/`**, kök `README.md` + kod-yanı belgeler (`notifications/`, `tests/`) yerinde kalır. Navigasyon için: **`docs/README.md`** (içindekiler).

| Konu | Bağlayıcı kaynak | Not |
|---|---|---|
| Ürün kararları (tümü) | `docs/master/OYNA_MASTER_PRENSIPLER.md` | En üst otorite; §14 revizyonları dahil |
| Faz planı | `docs/master/OYNA_YOL_HARITASI.md` | Faz 0–7 uygulama notlarıyla |
| Operasyonel durum / kalan işler | `docs/master/OYNA_OPERASYONEL_DURUM.md` | "Tek güncel kaynak" etiketi taşır |
| iyzico aktivasyonu | `docs/master/OYNA_GO_LIVE_IYZICO.md` | Para motoru runbook'u |
| Go-live anahtarları | `docs/master/GO_LIVE_CHECKLIST.md` | Panel + secret adımları |
| İşletme/kurtarma | `docs/master/RUNBOOK.md` + `docs/master/runbook/` | Yazılımcısız yönetim + PITR; runbook/ altında INCIDENT_RESPONSE · PITR_RESTORE · SECRET_ROTATION |
| Store süreci | `docs/master/STORE_LANSMAN_PLANI.md` | Faz A–J + engel envanteri |
| Lansman/benimsenme engelleri | `docs/master/LANSMAN_ENGELLERI_VE_ASMA_PLANI.md` | (04.07) STORE planının adoption katmanı |
| Saha sahibi çözüm planı | `docs/master/KATMAN2_SAHA_SAHIBI_COZUM_PLANI.md` | (04.07) owner operasyonunu OYNA'ya taşıma |
| Admin RPC yetki envanteri | `docs/master/RPC_YETKI_ENVANTERI.md` | Wave 8; 46 RPC guard'lı doğrulandı |
| UI/UX borçları | `docs/master/UI_UX_YAPILACAKLAR.md` | 20 bulgu + durum |
| UI/UX rol-bazlı cilalar | `docs/master/UI_SONHAL_SORULARI.md` | 120 soru — **cevap bekliyor** |
| Admin panel kararları | `docs/master/ADMIN_PANEL_KARARLAR.md` | `docs/eski/ADMIN_PANEL_100_SORU.md` soru setini **geçersiz kılar** |
| DB deploy stratejisi | `docs/master/WAVE_DEPLOY_PLANI.md` | 14 wave / 5 parti |
| Problem kayıt süreci | `docs/master/PROBLEMLER_VE_COZUMLER.md` | Rol-bazlı yaşayan kayıt |
| Entegrasyon testleri | `tests/integration/README.md` | 13 SQL paketi (kodla birlikte) |
| Push kurulum detayı | `notifications/KURULUM_REHBERI.md` + `PUSH_NOTIFICATION_PLAN.md` | Teknik kurulum (kodla birlikte); ürün kararları için §7 geçerli |
| Persona/UX araştırması | `docs/eski/kullanici_analizi.md` | Girdi; iki kapsam-içi 5/5 içgörü §14 GELİŞTİRİCİ #13'e işlendi; kalan çözümler kapsam-dışı |
| **Arşiv (karar değeri yok)** | `docs/eski/*` (20 dosya) | Aşılmış soru setleri (ADMIN_PANEL_100_SORU) + Firebase-dönemi planlar + bayat referanslar (DATABASE_README, DOSYALARIN_ISLEVLERI) |

## 16. Tespit Edilen Tutarsızlıklar (bayat dokümanlar)

> **Not (04.07):** Aşağıdaki bayat dosyalardan `DATABASE_README.md` ve `DOSYALARIN_ISLEVLERI.md` yeniden düzenlemede **`docs/eski/`'ye taşındı** — böylece güncel doküman yüzeyinde çıkmıyorlar; içerik güncellemesi opsiyonel (arşiv değeri).

1. **`README.md` (26.06, kökte):** Oyunlaştırmayı (FUT/gamification) çekirdek olarak anlatıyor — oysa oyunlaştırma **kapsam dışı** (§2), oyuncu kartları yalnız admin kontrolünde. "Ek Dökümantasyonlar" bölümü yeniden düzenlemede güncellendi (`docs/master/` + `docs/README.md` index'e yönlendirir).
2. **`docs/eski/DATABASE_README.md` (25.06):** "24 tablo" ve 03.06 tarihli güvenlik raporu ("2 tabloda RLS eksik, 36 permissive policy") **bayat** — güncel gerçek: **~73 tablo, RLS 67/67**, hardening migration'ları uygulanmış. Araç/komut kısmı hâlâ geçerli. *(Arşive taşındı.)*
3. **`docs/eski/DOSYALARIN_ISLEVLERI.md` (25.06):** Silinen `arsiv/` klasörünü mevcutmuş gibi anlatıyor; `file:///Users/kerem/...` linkleri kırık; repoda **artık bulunmayan** kaynak dosyalarını (`components/CommunityApplicationWizard.tsx` — Topluluk kapsam dışı, silinmiş; `firebaseSync.ts`, `services/db.ts/geoService.ts/pitchService.ts`, `constants.ts`) hâlâ güncel mimari bileşenmiş gibi belgeliyor. *(Arşive taşındı.)*
4. **`notifications/PUSH_NOTIFICATION_PLAN.md` + `KURULUM_REHBERI.md` (25.06):** Kurulum adımları geçerli ama şema/trigger detayları Faz 7 sonrası migration'larla kısmen aşıldı (örn. `notifications.type` → `type_key` düzeltmesi); uygulamadan önce güncel migration'lar esas alınmalı.
5. **`docs/eski/` içindeki plan dosyaları — iki farklı gerekçeyle arşivde:**
   - **Firebase/Geofirestore dönemine ait:** `OYNA_MAP_GEOFIRESTORE_PLANI` + backend/mimari arşiv dosyaları (Firebase temelli) → güncel backend **%100 Supabase**, sadece tarihçe.
   - **Tamamlanmış Supabase planları:** `GODVIEW_PLATFORM_PLAN` + `ADMIN_PANEL_MASTER_PLAN` — Firebase içermez, baştan sona Supabase temelli; tüm fazları tamamlanıp kararları `ADMIN_PANEL_KARARLAR.md`'ye işlendiği için arşivde ("Firebase dönemi" değil).

---

> **Bakım kuralı:** Bu doküman bir **anlık görüntü + yönlendirici**dir. Yeni bir karar alındığında önce ilgili bağlayıcı dokümana (§15) işlenir; bu dosyada yalnız özet/harita güncellenir. Çelişki görürsen en yeni tarihli bağlayıcı doküman kazanır.
