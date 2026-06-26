# 🧭 OYNA — Faz Uygulama Rehberi (Yeni Oturumlar İçin)

> **Amaç:** Context sınırı nedeniyle iş küçük oturumlara bölünmeli. Bu belge, **yeni bir oturumda fazları uygularken** izlenecek yöntemi anlatır. Her yeni oturum bu rehberi + 3 ana belgeyi okuyarak başlamalı.
>
> **Kaynak doğrular (source of truth):**
> 1. `docs/OYNA_MASTER_PRENSIPLER.md` — sistemin tüm kuralları (20 bölüm).
> 2. `docs/OYNA_YOL_HARITASI.md` — Faz 0–7 detaylı plan (ne/neden/sonuç).
> 3. `docs/OYNA_MASTER_KESIF_SORULARI.md` — 200 soruluk karar arşivi.

---

## 0. Her oturuma başlarken (ZORUNLU sıra)
1. Yukarıdaki 3 belgeyi **kaynak doğru** kabul et.
2. **En güncel main'den başla:** `git fetch && git checkout main && git pull`.
3. `npx tsc --noEmit` → **baseline temiz mi?** (Temiz olmalı; değilse önce onu çöz.)
4. **Boşluk kontrolü:** Dokunacağın özellik main'de **zaten yapılmış mı?** Varsayma — `grep`/dosya ile bak. *(main paralelde hızlı ilerliyor.)*

## 1. Git disiplini (İHLAL ETME — divergence yaşandı, 72 commit çakışması riski oldu)
- Her iş için main'den **TAZE branch:** `git checkout -b faz-X-kisa-aciklama`.
- Bitince **hızlıca** main'e merge + push; branch'i bekletip bayatlatma.
- **Aynı anda iki koldan main'e yazma.** Bir iş biter, merge edilir, sonra diğeri.
- Push reddedilirse **ASLA force-push'la main'i ezme** → önce `git pull --rebase origin main`, sonra push.
- Commit mesajı sonuna ekle: `Co-Authored-By` + `Claude-Session` satırları (proje kuralı).

## 2. Oturum kapsamı (context limiti için)
- Bir oturumda **BİR faz** (veya fazın net bir parçası). Başta "bu oturum ne zaman bitmiş sayılır?" diye **tek cümlelik hedef** koy.
- Büyük dosyaları (örn. `Studio.tsx`, `OwnerPanel.tsx`, `MatchJoin.tsx`) **parça parça** oku; tek seferde her şeyi okumaya çalışma.
- Analiz gerektiren geniş taramalar için **alt-ajan (Explore)** kullan — ana context'i şişirme.

## 3. Faz sırası & durum takibi
- Sıra: **Faz 0 → 7** (bkz. YOL_HARITASI). Bağımlılık sırası budur; atlamadan git.
- main paralelde ilerlediği için **her faza başlamadan "bu faz ne kadar yapılmış?"** kontrolü yap.
- Faz/görev bitince YOL_HARITASI ve PRENSIPLER'deki ilgili checklist'i **işaretle/güncelle**.

## 4. Kalite kapıları (her oturum SONU)
- ✅ `npx tsc --noEmit` **temiz**.
- ✅ İlgili testler geçer (özellikle **ödeme / maç katılımı / rezervasyon**).
- ✅ `npm run build` sorunsuz.
- ✅ Karar değiştiyse `OYNA_MASTER_PRENSIPLER.md` **güncellenir** (belge ile kod asla ayrışmasın).

## 5. Özel dikkat alanları
- 💰 **Para (iyzico):** Gerçek para. Sandbox'ta test; webhook **imza doğrulaması**; secret'lar yalnız **Supabase secrets**'te; blokaj→tahsil→payout→iade uçtan uca test.
- 🔒 **RLS:** Her yeni tabloya/erişime **mutlaka** erişim kuralı. "Herkese açık" politika bırakma.
- 🧹 **Mock veri:** Prod'da kapalı; demo gerektiğinde **istek-üzerine demo veri üreteci** ile.
- ⚖️ **Kritik kararda** kullanıcıya **sor + öneri ver** (kör ilerleme yok).
- 🗄️ **Tek kaynak (SSOT):** Aynı veri için tek tanım; mükerrer tip/kaynak yaratma.

## 6. Faz 0 (Temizlik) — güncel durum & kalanı
**main'in zaten yaptıkları (tekrar EKLEME):**
- 🗑️ Silinmiş: `PremiumScreen`, `LoyaltyCard`, `MatchLobby`.
- ✨ Eklenmiş: `SocialView`, `TeamPanelView` (= "Sosyal: Takımlar+Arkadaşlar" kararı).

**Hâlâ KONTROL ET — main'de duruyorsa kaldır** (kullanıcı onayladı):
- Kapsam dışı: `TournamentBracket`, `CommunityView/CommunityHub/CommunityAdminDashboard/CommunityApplicationWizard`, `communityService`, `AICoach`, `OynaTv`, `Leaderboards`, `reputationEngine` (ELMAS/KARAT), `ScoutDashboard`, `TransferCenter`, `RookieShowcase`/`RookiePlayerCard`.
- Onaylı kaldırmalar: `OpponentFinder`, `PostMatchReport`, `MotmReveal` + `VotingScreen`.
- İkinci admin paneli: `views/AdminDashboard.tsx` (tek panel = `admin-panel/`).
- SaaS: `ownerAccountService` + `useOwnerEntitlements` → entitlement kilitlerini kaldır, **tüm owner modüllerini aç**.
- Silmeden önce `npx tsc --noEmit` ile kırılan referansları bul, App.tsx route/`AppView` tipi/store/BottomNav'da temizle.

## 7. Yeni oturumda kullanabileceğin başlangıç cümlesi
> "`docs/OYNA_MASTER_PRENSIPLER.md`, `OYNA_YOL_HARITASI.md` ve `OYNA_GELISTIRME_REHBERI.md`'yi oku. Güncel `main`'den taze branch açıp **Faz X**'i uygula. Önce bu fazın main'de ne kadar yapıldığını kontrol et, kritik kararda bana sor, oturum sonunda `tsc`+build temiz olsun."

## 8. Önerilen ilk oturum: "Boşluk Analizi"
Kod yazmadan önce bir oturumu **güncel main ↔ master plan boşluk analizine** ayır:
- Her faz/karar için **yapıldı / yarım / eksik / çelişiyor** tablosu çıkar.
- Sonuca göre YOL_HARITASI'nı güncelle. Böylece sonraki oturumlar **kör değil, hedefli** ilerler.
