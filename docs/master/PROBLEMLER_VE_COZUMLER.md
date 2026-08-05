# 🛠️ OYNA — Problemler ve Çözümler

> Bu dosya, uygulamada tespit edilen problemleri ve her biri için önerilen/onaylanan
> çözümleri kayıt altına alır. Sistem **rol bazlı** (Oyuncu · Kaleci · Hakem · Tesis)
> ilerler. Her problem; veritabanı incelenerek, uygulamanın UI/UX yapısına uygun ve
> gerektiğinde **tam yetkili admin paneline** entegre edilerek çözülür.

**Son güncelleme:** 2026-08-05
**Proje:** OYNA (Supabase ref: `iikvzgyccvgcybzdfwlv`) · React 19 · Vite · Tailwind v4 · Zustand · Capacitor

---

## ⚙️ Çalışma Tercihleri (kararlaştırıldı 2026-06-30)

- **Onay sonrası:** Onaylanan çözüm **hemen kodlanır, commit & push** edilir (`claude/app-problems-solutions-vn4we8`).
- **İletim:** Problemler **tek tek** ele alınır (problem → öneri → onay → uygulama → sonraki).
- **Öneri detayı:** **Dengeli** — ne yapılacak + etkilenen tablolar/ekranlar + UI/UX yaklaşımı + admin entegrasyonu + kısa risk notu.

---

## 📋 Nasıl Çalışıyoruz? (İş Akışı)

Her problem aşağıdaki yaşam döngüsünden geçer:

1. **🆕 Problem Alımı** — Sen problemi basit bir dille anlatırsın (hangi rol olduğunu belirterek).
2. **🔍 İnceleme** — Ben veritabanını (ilgili tablolar/RLS/RPC), ilgili ekranları (views/components) ve mevcut davranışı incelerim.
3. **💡 Çözüm Önerisi** — Sana şunları içeren bir öneri sunarım:
   - **Ne yapılacak** (kısa özet)
   - **Etkilenen katmanlar** (Frontend ekran/bileşen · Veritabanı tablo/migration · Admin paneli)
   - **UI/UX yaklaşımı** (mevcut Neon Cyberpunk temasıyla uyumlu)
   - **Admin entegrasyonu** (gerekiyorsa — admin tam yetkili olur)
   - **Risk/Etki & efor** notu
4. **✅ Onay** — Sen onaylarsın, değiştirirsin veya reddedersin.
5. **🛠️ Uygulama** — Onay sonrası kodlanır, commit & push edilir.
6. **✔️ Kayıt** — Durum bu dosyada güncellenir.

### Durum Etiketleri
| Etiket | Anlamı |
|--------|--------|
| 🆕 Yeni | Problem alındı, henüz incelenmedi |
| 🔍 İnceleniyor | Veritabanı/kod inceleniyor |
| 💡 Çözüm Önerildi | Öneri hazır, onay bekliyor |
| ✅ Onaylandı | Onaylandı, uygulama bekliyor |
| 🛠️ Uygulanıyor | Kodlanıyor |
| ✔️ Tamamlandı | Uygulandı, commit & push edildi |
| ❌ Reddedildi | Uygulanmayacak |
| ⏸️ Ertelendi | Sonraya bırakıldı |

### Problem Kayıt Şablonu
```
### [ROL-XX] Kısa başlık
- **Durum:** 🆕 Yeni
- **Tarih:** YYYY-MM-DD
- **Problem (senin anlatımın):** ...
- **İnceleme bulguları:** ...
- **Önerilen çözüm:** ...
- **Etkilenen katmanlar:** Frontend · Veritabanı · Admin
- **Admin entegrasyonu:** ...
- **Onay:** ⏳ Bekliyor
- **Uygulama notu:** (commit/PR linki)
```

---

## ⚽ Oyuncu (Player) Problemleri

> İlgili ekranlar: `views/Dashboard.tsx`, `views/MatchDiscovery.tsx`, `views/MatchJoin.tsx`,
> `views/MyTeam.tsx`, `views/Studio.tsx`, `views/ProfileScreen.tsx`, `components/FifaCard.tsx`
> İlgili tablolar: `profiles`, `teams`, `team_members`, `matches`, `match_participants`,
> `match_registrations`, `player_ratings`, `friendships`, `notifications`, `wallet_transactions`, `tactics`

### [OYUNCU-01] "Bireysel Maç Bul" filtreleri işlevsiz + "10 player aranıyor" metni
- **Durum:** ✔️ Tamamlandı
- **Tarih:** 2026-06-30
- **Problem (kullanıcı anlatımı):** Top Oyna → Bireysel Maç Bul listesinde "10 player aranıyor" yazıyor; "player" → "oyuncu" olmalı. Üstteki FORMAT / MANTALİTE / POZİSYON çipleri ve sağ üstteki Filtre butonunun açtığı ekrandaki filtreler işlevsiz.
- **İnceleme bulguları:**
  - DB `matches.missingPositions` rolleri ham kod: `PLAYER`, `GK`, `REF`. Kart eşlemesinde `PLAYER`/`REF` çevrilmediği için ekranda "10 PLAYER ARANIYOR" çıkıyordu.
  - DB `difficulty` = `Kolay/Orta/Zor`, filtre ise `Ciddi/Taktiksel/Rahat` arıyordu → MANTALİTE filtresi hiç eşleşmiyordu. Kart rozeti de gerçek zorluk yerine `i%3` ile atanıyordu.
  - POZİSYON filtresi yalnızca generic `PLAYER` slotları olduğundan SAV/ORT/HÜC için sonuç döndürmüyordu.
  - `count: 0` pozisyonlar da render ediliyordu ("0 … ARANIYOR").
- **Uygulanan çözüm (`views/MatchDiscovery.tsx`):**
  1. Rol eşlemesine `PLAYER → OYUNCU`, `REF → HAKEM` eklendi (+ büyük/küçük harf güvenli).
  2. Difficulty tek mantalite uzayına normalize edildi (Zor/Ciddi→Ciddi, Orta/Taktiksel→Taktiksel, Kolay/Rahat→Rahat); kart rozeti bu gerçek değerden türetiliyor → MANTALİTE filtresi çalışıyor.
  3. POZİSYON filtresinde generic `OYUNCU` slotu saha pozisyonlarını (SAV/ORT/HÜC), `KL` kaleciyi karşılıyor.
  4. `count ≤ 0` pozisyonlar gizlendi.
  - Üst çipler ve Filtre modalı aynı `dna` + `checkMatchFilters`'i paylaştığı için ikisi de işlevli hale geldi. "Diğer Maçlar" bölümü (mevcut tasarım) korundu.
- **Etkilenen katmanlar:** Frontend (tek dosya). Veritabanı/Admin değişikliği gerekmedi.
- **Onay:** ✅ Onaylandı (2026-06-30) — "Diğer Maçlar kalsın" tercihiyle.
- **Doğrulama:** `tsc --noEmit` temiz.

### [OYUNCU-02] Top Oyna maç kartlarının mobilde iç içe geçmesi
- **Durum:** ✔️ Tamamlandı
- **Tarih:** 2026-06-30
- **Problem (kullanıcı anlatımı):** Top Oyna'daki maç kartları mobilde iç içe geçiyor; mobil uyumlu olmalı.
- **İnceleme bulguları:** `MatchCard` sabit yükseklikli (`h-[400px]`, `overflow-hidden`) bir posterdi ve tüm bloklar **mutlak konumlu**du (eksik pozisyonlar `top-1/2` ortada, alt blok `bottom-0`). Mobilde uzun tesis adı/rozetler büyüyünce alt blok yukarı taşıp ortadaki "ARANIYOR" çipleriyle **çakışıyordu**; sabit yükseklik içeriği kırpıyordu.
- **Uygulanan çözüm (`views/MatchDiscovery.tsx` → `MatchCard`):**
  1. `h-[400px]` → `min-h-[400px]` + kök `flex flex-col`.
  2. İçerik mutlak konumdan **esnek dikey akışa** alındı: üst bar → eksik pozisyonlar → `flex-1` esnek boşluk → alt blok, tek kolonda sırayla.
  3. Responsive tipografi: başlık `text-xl sm:text-2xl` + `break-words` + `leading-tight`; alt blok `min-w-0` ile düzgün sarıyor; üst bar `flex-wrap`.
  4. Poster görseli, neon gradyanlar, çipler, renkler ve animasyonlar **aynen korundu** (yalnız yerleşim akışı değişti).
- **Etkilenen katmanlar:** Frontend (tek bileşen). Veritabanı/Admin gerekmedi.
- **Onay:** ✅ Onaylandı (2026-06-30) — önce/sonra görsel önizleme paylaşıldı.
- **Doğrulama:** `tsc --noEmit` temiz; 390px genişlikte önce/sonra önizleme ile doğrulandı.

### [OYUNCU-03] Bildirimler'deki "OYUNCU BİLDİRİMLERİ" alt rozeti
- **Durum:** ✔️ Tamamlandı
- **Tarih:** 2026-06-30
- **Problem (kullanıcı anlatımı):** Bildirimler'de "oyuncu bildirimleri" yazmana gerek yok, boş kalabilir.
- **İnceleme:** `views/Notifications.tsx:272` — başlık altında `{badgeLabel} BİLDİRİMLERİ` rozeti (oyuncuda "OYUNCU BİLDİRİMLERİ").
- **Uygulanan çözüm:** Rozet bloğu kaldırıldı; kullanılmayan `badgeLabel` değişkeni temizlendi. "Bildirimler" başlığı + okunmamış sayacı kaldı. Ortak ekran olduğundan tüm rollerde tutarlı.
- **Etkilenen katmanlar:** Frontend. **Doğrulama:** `tsc` temiz.

### [OYUNCU-05] Sıfır-Problem Programı S0+S2 (toplu) — kök nedenler + maç akışı bütünlüğü
- **Durum:** ✔️ Tamamlandı (2026-07-14/15) · **Branch:** `claude/player-edge-cases-plan-ggtezh`
- **Kapsam ve tam kayıt:** `OYUNCU_EDGE_CASE_PLANI.md` §6.3 (S0) ve §6.5 (S2) — 59 bulguluk programın uygulanan ilk iki sprinti.
- **S0 özeti:** ortak util'ler (`ratingScale`/`formatTRY`/`matchDateTime`) + rookie kart (OVR "—", sahte gold-100 öldü) + gerçek kimlik (`store.currentUserProfile` — "Oyuncu"/pravatar fallback'i öldü) + bootstrap A2 (geçici hata ≠ yeni kayıt) + `minRating` varsayılanı 0 (K2) + kalıcı smoke (`tests/player-smoke.mjs`). Smoke'un yakaladığı 2 bug düzeltildi (stats-kolon 400'ü, notifications çift-abonelik).
- **S2 özeti:** KN-3 atomik maç yazımı (realtime salt-okur; 7 handler RPC→re-fetch; client kaptan-devri kopyası silindi) + B2 minRating **sunucu** kapısı (canlı migration, `__inner` sarmalayıcı deseni) + B4 kurucu iptali UI + B5 ayrılmada iade metni + B6 sahte otomatik onay öldü + B8/B9/B10/B15 keşif dürüstlüğü + B14 yedek görünürlüğü + MatchCalendar gerçek veri.
- **Kanıt:** canlı `tests/match-concurrency.mjs` 5/5 (eşzamanlı katılımda kayıp yok, tarayıcı 0 yazım) · smoke 4/4 · 260 birim testi · tsc temiz.

### [OYUNCU-06] Sıfır-Problem Programı S3 (toplu) — profil/takım/mesaj/değerlendirme + kabuk dayanıklılığı
- **Durum:** ✔️ Tamamlandı (2026-07-15) · **Branch:** `claude/player-edge-cases-plan-ggtezh`
- **Kapsam ve tam kayıt:** `OYUNCU_EDGE_CASE_PLANI.md` §6.6 — programın üçüncü sprinti (S3), maç-dışı oyuncu yüzeyleri.
- **S3-1 (takım tutarlılığı):** E2 — arkadaş/üye sayacı tek kaynaktan (`getMyTeams()` arşiv-dışı filtre; `fetchUserTeams` yerine) · E4 — takım kurmada `stats` kolonu 400'ü arkadaş listesini boşaltıyordu; gerçek kolonlara (`skill_rating`/`match_count`) geçildi, rookie dengeleme onarıldı. İP-04'ün gerçek puan verisi (`mapPlayerStats`) tamamlandı.
- **S3-2 (profil sağlamlığı):** D2 — profil yüklenemezse hata + retry (sessiz boş ekran yok); yükleme hatasında "Düzenle" kilitli · D5 — görsel yükleme hataları (`photoError`) yakalanıp düzenleme modalında gösteriliyor.
- **S3-3 (mesajlaşma güvenliği):** F1 — engellenen sohbette besteci kilitli + açıklama · F2 — `blockUserFully` (tam engelleme) · F3 — gerçek `reportUser` şikayet akışı (eskiden no-op).
- **S3-4 (değerlendirme dürüstlüğü):** G1 — sahte sabit 5-3 skor el sıkışması öldü; yalnız gerçek bekleyen öneri varsa gösterilir (`getPendingScoreProposal`→`approveMatchScore`) · G2 — gerçek maçta mock oyuncular yerine gerçek kadro/BOŞ (mock oyuncuyu gerçek RPC'ye puanlama reddi çözüldü) · G3 — organizasyon yorumu artık yakalanıyor (eskiden sessizce yok oluyordu; kalıcı depolama backend follow-up).
- **S3-5 (kabuk dayanıklılığı):** A3 — onay bekleme durumu artık yalnız realtime'a bağlı değil: mount-fetch + 30sn poll + manuel "Durumu Yenile" (kaçan event'te sonsuz bekleme yok) · A5 — görünüm-seviyesi `ErrorBoundary` (bir görünüm çökse de kabuk + alt menü ayakta; beyaz ekran kilidi yok) · E5 — kaptan başka üyeler varken "Ayrıl" sunucuda reddedilip hataya düşüyordu; artık önce "Kaptanlığı Devret" akışına yönlendiriyor.
- **Kapsam sınırı:** Para (S1) ayrı bir agent tarafından yürütülüyor; bu program yalnız maç-dışı oyuncu UI/UX'ini kapsar. GK/hakem `stats` kolonu (`goalkeepers`/`referees` tabloları, `matchService`) bilinçli olarak dokunulmadı — kaleci/hakem fazına ait.
- **Kanıt:** güncel main ile merge sonrası smoke 4/4 · 260 birim testi · tsc temiz.

### [OYUNCU-04] "Önce Maçlara Göz At" (misafir) → Profil aktif + boş haller + işlevli misafir şeridi
- **Durum:** ✔️ Tamamlandı
- **Tarih:** 2026-06-30
- **Problem (kullanıcı anlatımı):** "Maçlara göz at"a (misafir) girince profil kısmı aktifleşsin ve bilgilerin boş halleri görünsün. Üste "Misafir modundasın — Giriş yap / Kaydol" işlevli şeridi eklensin.
- **İnceleme:** Misafirde oturum (`uid`) olmadığından `ProfileScreen` "Oturum bulunamadı" hatası verip profili hiç açmıyordu. Sabit demo değerler (yaş/güven/gol) yalnız `cardActive` dalında; misafirde zaten çıkmıyor.
- **Uygulanan çözüm (`views/ProfileScreen.tsx`):**
  1. `loadProfile` oturum yokken hata yerine boş profil render ediyor (`profile=null`, `matchHistory=[]`); böylece profil aktifleşip boş placeholder'larıyla görünüyor.
  2. `isGuest` bayrağı eklendi; üste temaya uyumlu **işlevli misafir şeridi** kondu (Giriş Yap/Kaydol → `onNavigate('AUTH')` ile mevcut giriş ekranına gider).
- **Kapsam:** Yalnızca **UI/UX + Frontend** (giriş/kayıt eylemi mevcut Supabase Auth ile çalışıyor; yeni backend/DB yok).
- **Etkilenen katmanlar:** Frontend. **Onay:** ✅ (misafir şeridi dahil). **Doğrulama:** `tsc` temiz + 390px önizleme paylaşıldı.

---

## 🧤 Kaleci (Goalkeeper) Problemleri

> İlgili ekranlar: `views/ServiceApplication.tsx`, `views/ServiceDashboard.tsx`,
> `views/ServiceProfile.tsx`, `views/ServiceSettings.tsx`
> İlgili tablolar: `goalkeepers`, `service_offers`, `service_requests`, `service_ratings`,
> `provider_applications`, `provider_identities`

_Henüz problem eklenmedi._

---

## 🟨 Hakem (Referee) Problemleri

> İlgili ekranlar: `views/ServiceDashboard.tsx`, `components/RefereeScoreModule.tsx`
> İlgili tablolar: `referees`, `service_offers`, `service_requests`, `service_ratings`,
> `provider_applications`, `provider_identities`

_Henüz problem eklenmedi._

---

## 🏟️ Tesis (Facility / Owner) Problemleri

> İlgili ekranlar: `views/OwnerPanel.tsx`, `views/PitchDiscovery.tsx`, `views/MatchTicket.tsx`
> İlgili tablolar: `pitches`, `courts`, `pitch_bookings`, `pitch_tariffs`, `pitch_subscriptions`,
> `pitch_slot_holds`, `booking_payments`, `pitch_expenses`, `pitch_staff_members`, `owner_accounts`,
> `payout_requests`, `owner_withdrawal_requests`

_Henüz problem eklenmedi._

---

## 🧱 Altyapı / Güvenlik Problemleri

### [ALTYAPI-01] Veritabanı fonksiyonlarının çoğu dışarıya gereksiz açıktı
- **Durum:** ✔️ Tamamlandı
- **Tarih:** 2026-08-05
- **Problem:** PostgreSQL'de bir fonksiyon yazıldığında, aksi söylenmedikçe onu giriş
  yapmış **herkes** çağırabilir. Zamanla 642 kendi fonksiyonumuzun 451'i `authenticated`,
  39'u `anon` için açık kalmıştı — çoğunun dışarıdan çağrılabilir olmasının hiçbir karşılığı yoktu.
- **Çözüm:** Uygulamadan / erişim kurallarından / görünümlerden / kolonlardan hiç
  çağrılmayan 71 fonksiyonun yetkisi alındı (`20260805203555`, `20260805203651`,
  `20260805203938`). Yeni fonksiyonlar artık **kapalı doğuyor** ve gece denetimi
  (`K-KAPI-4`, `kapi_denetimi()`) sapmayı panele yazıyor (`20260805204225`).
- **Kalıcı test:** `tests/unit/veritabaniKapilari.test.ts`
- **⚠️ Bundan sonra:** uygulamadan çağrılacak **her yeni fonksiyonun** migration'ında
  açıkça `GRANT EXECUTE ON FUNCTION ... TO authenticated;` yazılmalı. Unutulursa o
  özellik çalışmaz; gece denetimi bunu "yeni fonksiyon eklendi" diye SARI bildirir.

### [ALTYAPI-02] ⛔ Erişim kuralında (RLS) kullanılan fonksiyonun yetkisi ASLA alınmaz
- **Durum:** ✔️ Tamamlandı (kural olarak kayda geçti)
- **Tarih:** 2026-08-05
- **Problem:** Erişim kuralı ifadeleri **sorguyu yapan kullanıcının yetkisiyle** çalışır.
  Kuralın içinde geçen bir fonksiyonun `EXECUTE` yetkisi alınırsa o **tablo tamamen
  okunamaz** hâle gelir — ekran boş gelir, sebebi de görünmez.
- **Canlıda ölçüldü:** `_is_team_member` yetkisi geri alındığında `team_members`
  tablosu `42501 permission denied for function _is_team_member` verdi. (Deney geri alındı.)
- **Dokunulmayacak liste:** `_hire_side_for`, `_is_match_participant`, `_is_team_admin`,
  `_is_team_member`, `is_admin`, `is_platform_admin`, `is_super_admin`, `can_manage_pitch`,
  `can_staff_pitch`, `can_manage_pitch_content`, `get_config_bool`, `has_role`,
  `profile_privileges_unchanged`, `try_uuid`
- **Kalıcı test:** `tests/unit/veritabaniKapilari.test.ts` → "erişim kurallarında
  kullanılan fonksiyonlara DOKUNULMADI"

### [ALTYAPI-03] "Bir kez demo, hep demo" garantisi yarım kuruluydu
- **Durum:** ✔️ Tamamlandı
- **Tarih:** 2026-08-05
- **Problem:** `trg_demo_isareti_mac` tetiği `BEFORE INSERT OR UPDATE **OF captain_id,
  "creatorId"**` olarak kurulmuştu. `isDemo` alanına dokunan bir güncelleme tetiği hiç
  uyandırmıyordu; demo işareti silinebiliyordu. Silinseydi o demo maç "gerçek maç"
  sayılır ve kuzey yıldızı ölçüsünü ("başarılı maç") şişirirdi.
- **Ne kadar tehlikeliydi:** Normal kullanıcı `matches` tablosuna doğrudan yazamıyor
  (canlıda ölçüldü: 42501) — dışarıdan sömürülebilir bir açık değildi; risk kendi
  yönetim işlemlerimizdeydi.
- **Çözüm:** Aynı fonksiyon artık **her** güncellemede koşuyor (`20260805205221`).
- **Kalıcı test:** `tests/unit/olcumHuni.test.ts` → "demo işareti bir kez demo, hep demo"

---

## 🛡️ Admin Paneli Notları (Referans)

Admin paneli (`admin-panel/`) **tam yetkilidir** ve şu sayfaları içerir:
`Dashboard · Users · Pitches · Matches · Communities · OwnerAccounts · Finance · Commission ·
Disputes · ServiceDisputes · Moderation · VerificationCenter · ProviderIdentities · PromoCodes ·
Campaigns · Segmentation · NotificationTemplates · SystemParams · ACL · AuditLog · Settings · CommandCenter`

İki mod: **OPanel** (operasyon) ve **GodView** (üst düzey platform kontrolü). RBAC alt-rol
desteği (`subrole_rbac`), audit log (`admin_audit_log`) ve "admin full authority"
migration'ları mevcut. Bir probleme admin müdahalesi gerekiyorsa, ilgili sayfaya CRUD/aksiyon
olarak eklenir.

---

## 🗺️ Sistem Haritası (Hızlı Referans)

- **Roller:** `SUPER_ADMIN`, `PLAYER`, `GOALKEEPER`, `REFEREE`, `OWNER`
- **Tema:** Neon Cyberpunk — Deep Navy zemin + Cyber Yellow vurgu, framer-motion animasyonlar
- **State:** Zustand (`store.ts`, `store/`)
- **Backend:** Supabase (PostgreSQL 17, RLS aktif tüm tablolarda, Edge Functions, Realtime)
- **Toplam tablo:** 73 · **Edge Functions:** create/capture/void/refund-payment, payment-webhook,
  send-push, send-email, push-notification, admin-broadcast, admin-create-user
