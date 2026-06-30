# 🛠️ OYNA — Problemler ve Çözümler

> Bu dosya, uygulamada tespit edilen problemleri ve her biri için önerilen/onaylanan
> çözümleri kayıt altına alır. Sistem **rol bazlı** (Oyuncu · Kaleci · Hakem · Tesis)
> ilerler. Her problem; veritabanı incelenerek, uygulamanın UI/UX yapısına uygun ve
> gerektiğinde **tam yetkili admin paneline** entegre edilerek çözülür.

**Son güncelleme:** 2026-06-30
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

_Henüz problem eklenmedi._

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
