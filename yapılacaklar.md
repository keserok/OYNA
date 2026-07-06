# OYNA — Kullanıcı Bağlılığı Yapılacaklar Listesi

> **Tarih:** 6 Temmuz 2026 · Kod tabanı incelemesi sonucu seçilen, mevcut altyapının üzerine
> en az eforla oturacak bağlılık (engagement & retention) özellikleri.
> Amaç: kullanıcının uygulamaya **geri dönmesini** (bildirim, seri), **alışkanlık kurmasını**
> (sohbet, rozet) ve **uygulamayı dışarıya taşımasını** (paylaşılabilir kart) sağlamak.

---

## 1. Maç Hatırlatma + "Kadroda Yer Açıldı" Bildirimleri

**Ne:** İki yaşam döngüsü (lifecycle) push bildirimi:
- Maçtan **24 saat önce** ve **2 saat önce** hatırlatma ("Bu akşam 21:00, Yıldız Halı Saha ⚽").
- Takip edilen maçta/sahada **boş slot açılınca** anlık haber ("Kadroda 1 yer açıldı, kap!").

**Neden:** Uygulamayı "açmayı unuttuğum uygulama"dan "beni sahaya çağıran uygulama"ya çevirir.
`docs/eski/kullanici_analizi.md`'deki Oğuz'un (kaleci) talebi tam olarak buydu:
*"Uygulama beni maçlarla eşleştirmeli, ben maç aramak istemiyorum."*

**Mevcut altyapı:**
- `notifications/` klasöründe plan (`PUSH_NOTIFICATION_PLAN.md`), kurulum rehberi, SQL trigger'ları
  (`triggers.sql`), RLS politikaları ve `pushService.ts` hazır.
- `supabase/functions/send-push/index.ts` edge fonksiyonu mevcut.
- `notifications/notificationPreferences.ts` ile kullanıcı tercihi altyapısı var.

**Yapılacaklar:**
- [ ] Hatırlatma için zamanlanmış görev: Supabase `pg_cron` ile saatlik tarama → 24s/2s penceresine
      giren maçların katılımcılarına `send-push` çağrısı.
- [ ] `match_players` üzerinde slot boşalma trigger'ı → maçı favorileyen / bekleme listesindeki
      kullanıcılara push.
- [ ] Bildirim tercihlerine iki yeni anahtar: `match_reminders`, `slot_alerts` (varsayılan açık).
- [ ] Uygulama içi `views/Notifications.tsx` listesine aynı olayların düşmesi (push kapalıysa bile).

**Efor:** ~1-2 gün (altyapının çoğu hazır, iş çoğunlukla trigger + cron bağlama).

---

## 2. Maç Serisi (Streak)

**Ne:** "3 haftadır üst üste oynuyorsun 🔥" sayacı. Dashboard'da küçük bir seri kartı/rozeti +
seri kopmak üzereyken push ("Bu hafta henüz maçın yok, serin bitmesin 🔥").

**Neden:** Duolingo'nun kanıtlanmış en güçlü geri getirme kancası. Haftalık halı saha ritmiyle
birebir örtüşür; kaybetme korkusu (loss aversion) kullanıcıyı her hafta en az bir maça iter.

**Mevcut altyapı:**
- Maç geçmişi verisi zaten tutuluyor (maç günlüğü, `views/MatchDiaryDetail.tsx`,
  profil istatistikleri).
- Dashboard kart yapısı hazır (`views/Dashboard.tsx`).
- Push tarafı 1. maddeyle birlikte gelir.

**Yapılacaklar:**
- [ ] Seri hesabı: ISO hafta bazlı — bir haftada ≥1 tamamlanmış maç = seri devam.
      Tek SQL fonksiyonu (`get_weekly_streak(user_id)`) veya profile denormalize
      `current_streak` / `best_streak` kolonları.
- [ ] Dashboard'a seri kartı: mevcut haftada maç varsa alevli, yoksa "riskte" görünümü.
- [ ] Profil ekranına "En uzun seri" istatistiği.
- [ ] Cuma günü seri riski push'u (1. maddedeki cron'a tek satır eklenir).

**Efor:** ~1-2 gün.

---

## 3. Paylaşılabilir Maç Sonucu / MOTM Kartı

**Ne:** Maç bitiminde skor + MOTM + mini istatistiklerle tek bir **görsel** üretilir;
tek dokunuşla WhatsApp'a/Instagram'a paylaşılır. MOTM seçilen oyuncu için özel altın çerçeveli
kart varyantı.

**Neden:** Halı saha gruplarının yaşadığı yer WhatsApp'tır. FUT kartı estetiği uygulamanın en
güçlü kozu — onu uygulamanın **dışına** taşımak hem oyuncuya övünme malzemesi hem uygulamaya
sıfır maliyetli organik tanıtım sağlar.

**Mevcut altyapı:**
- `components/PlayerCard.tsx:349` içinde "Kartı Paylaş" butonu zaten var.
- `views/Studio.tsx` içinde çalışan `navigator.share` akışı mevcut (taktik paylaşımı).
- `components/FifaCard.tsx` animasyonlu kart tasarımı ve MOTM kart açılışı hazır.
- `views/PostMatchEval.tsx` maç sonu akışı mevcut — paylaşım butonunun doğal yeri.

**Yapılacaklar:**
- [ ] Kart → görsel dönüşümü: `html-to-image` (veya `dom-to-image-more`) ile FifaCard/skor
      kompozisyonunu PNG'ye çevir; Capacitor tarafında `@capacitor/share` ile dosya paylaş.
- [ ] Maç sonu ekranına "Sonucu Paylaş" CTA'sı; MOTM seçilen oyuncuya kart açılış animasyonu
      sonrasında "Kartını Paylaş" CTA'sı.
- [ ] Görsele köşede OYNA logosu + davet linki/QR (organik edinim döngüsü).

**Efor:** ~3-4 gün (görsel kompozisyon + iOS/Android paylaşım testi).

---

## 4. Maça Bağlı Otomatik Grup Sohbeti

**Ne:** Bir maça katılan herkesin **otomatik** düştüğü, maçla ömürdeş grup sohbeti.
Buluşma yeri/saati, forma rengi, son dakika değişiklikleri burada konuşulur.
Maç kartından tek dokunuşla açılır.

**Neden:** `kullanici_analizi.md`'deki Ali'nin (yeni şehre taşınan oyuncu) kopma noktası:
*"Maça katıldım ama kimseyi tanımıyorum, nereye gideceğimi bile bilmiyorum."*
Yeni kullanıcının ilk maçtan kopmamasını sağlayan en kritik sosyal tutkal budur; sohbeti olan
maç, iptali/no-show'u azaltır.

**Mevcut altyapı:**
- `views/MessagesView.tsx` sohbet ekranı ve `services/messageService.ts` mevcut.
- Supabase Realtime zaten kullanılıyor.
- Maç katılım olayları (`joinMatch`) store'da tek noktadan geçiyor (`store.ts`).

**Yapılacaklar:**
- [ ] Maç oluşturulunca otomatik `conversation` kaydı (tip: `MATCH`); `joinMatch` → üyelik ekle,
      ayrılınca çıkar.
- [ ] Maç kartı ve maç detayına "Maç Sohbeti" girişi; katılım sonrası otomatik sistem mesajı
      ("Ali maça katıldı 👋").
- [ ] Maç saati/saha değişikliğinde sohbete otomatik sistem mesajı (mevcut güncelleme akışına ek).
- [ ] Maçtan 48 saat sonra sohbeti salt-okunur arşive al.
- [ ] Sohbet mesajlarında 1. maddedeki push kanalını kullan (sessize alma tercihiyle).

**Efor:** ~3-5 gün.

---

## 5. Rozet / Başarım Sistemi

**Ne:** 10-15 adet basit, FUT temasıyla uyumlu rozet: "İlk Maç", "İlk MOTM", "5 Galibiyet",
"Hat-trick", "10 Farklı Sahada Oynadı", "Seri Ustası (8 haftalık seri)", "Demir Adam
(hiç maç iptal etmedi)" vb. Profil ekranında rozet vitrini + kazanınca kart açılışı tarzı
kutlama animasyonu.

**Neden:** Oyunculara kısa/orta/uzun vadeli hedefler verir; her rozet bir sonraki maç için sebep
üretir. Kod tarafında "rozet" şu an yalnız admin panelde ELITE etiketi olarak geçiyor
(`admin-panel/views/DeepEditModals.tsx:612`) — oyuncu tarafında hiç yok, alan tamamen boş.

**Mevcut altyapı:**
- Maç/galibiyet/MOTM verileri mevcut; 2. maddedeki seri hesabı "Seri Ustası" rozetini besler.
- Kutlama animasyonu için `components/FifaCard.tsx` MOTM kart açılış deseni yeniden kullanılır.
- Profil vitrini için `views/ProfileScreen.tsx` hazır.

**Yapılacaklar:**
- [ ] `badges` (tanım) + `user_badges` (kazanım) tabloları; kazanım kontrolü maç sonuçlanma
      akışına tek fonksiyonla bağlanır (`check_and_award_badges(user_id, match_id)`).
- [ ] Rozet tanımları TS tarafında tek sabit dosyada (ikon, ad, açıklama, koşul anahtarı).
- [ ] Profilde rozet vitrini (kazanılan renkli, kazanılmayan silüet — hedef gösterimi).
- [ ] Rozet kazanınca: uygulama içi kutlama modalı + bildirim; 3. maddeyle birleşip
      "rozeti paylaş" görseli.

**Efor:** ~4-5 gün (tanım seti küçük tutulursa).

---

## Önerilen Uygulama Sırası

| Sıra | Özellik | Efor | Bağımlılık |
|------|---------|------|------------|
| 1 | Bildirimler (madde 1) | 1-2 gün | — (altyapı hazır) |
| 2 | Maç Serisi (madde 2) | 1-2 gün | Push için madde 1 |
| 3 | Maç Sohbeti (madde 4) | 3-5 gün | Push için madde 1 |
| 4 | Paylaşılabilir Kart (madde 3) | 3-4 gün | — |
| 5 | Rozetler (madde 5) | 4-5 gün | Seri rozeti için madde 2, paylaşım için madde 3 |

> **Not:** Bu kancaların işe yaraması için kullanıcının ilk 5 dakikayı sorunsuz atlatması şart —
> `docs/master/UI_UX_YAPILACAKLAR.md`'deki onboarding/misafir modu işleri bu branch'te yapılmış
> durumda; oradaki **bağlamsal konum isteme (#10)** maddesi bu listeyle birlikte ele alınmalı.
> "Yakınındaki maçlar" boş görünen bir kullanıcıyı hiçbir seri geri getiremez.
