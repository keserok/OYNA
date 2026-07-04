# OYNA — UI/UX Yapılacaklar Listesi

> **Tarih:** 2 Temmuz 2026 · Kod üzerinden yapılan UI/UX denetiminin çıktısı.
> Sıralama kullanıcı etkisine göredir: önce yeni kullanıcıyı/mağaza incelemesini bloklayanlar.

> ## ✅ UYGULAMA DURUMU (aynı gün — bu branch'te)
> - **Yapıldı:** #1 onboarding (3 ekran, ilk açılışta bir kez, `views/OnboardingView.tsx`) · #2 misafir modu (`isGuest` + MATCH_DISCOVERY yönlendirmesi + `SignupGate` değer kapısı; `u1` sahte kullanıcı yazımları kaldırıldı, joinMatch/ödeme oturumsuzken kapıya takılır) · #3 Android geri tuşu (yığında geri, kökte minimize) · #4 zoom serbest · #5+#6 global toast (`components/common/GlobalToast.tsx`, kritik catch'ler bağlandı) · #9 hayalet ROLE_SELECTION fallback'leri role-göre açılışa çevrildi · #10 LOCATION_PROMPT yeni kayıt akışına bağlandı · #12 KVKK kutusu artık opt-in · #13 Apple çifte navigasyon giderildi · #14 ödeme formu (Luhn + SKT + CVV doğrulama, `autoComplete="cc-*"`, inline hatalar) · #15 Dashboard/MatchDiscovery/MatchJoin lazy (ana paket 386KB→57KB) · #17 player_card_photo 439KB→57KB, kopya silindi · #7 kısmi: 600 adet `#FFFF00`→marka sarısı `#FACC15`, bildirim ikonu turuncu→sarı (yeşil `#39FF14` "başarı/aksiyon" semantiği olarak kaldı) · #8 kısmi: yük taşıyan metinler (BottomNav, ödeme notu, OTP sayaç, hata mesajları) 12px'e · #20 kısmi: paylaşılan bileşenlerdeki ikon-butonlar etiketlendi.
> - **Bilinçli ertelenen:** #11 sekme-başına geri yığını (mevcut "sekme değişince sıfırla" davranışı Android'de yaygın kalıp; per-tab stack büyük refactor) · #16 liste sanallaştırma (kart yükseklikleri değişken, görsel regresyon riski — gerçek cihaz testiyle birlikte yapılmalı) · #19 UI kiti birleştirme (kademeli; yeni kod `AnimatedButton` kullanmalı) · #5 kalan ~60 sessiz catch (altyapı hazır: `showToast` import edip bağlanacak, kademeli) · #18 kalan ekranların iskelet standardizasyonu (şablon: MyBookings).

## 🔴 Kritik — yeni kullanıcıyı ve mağaza incelemesini doğrudan etkiler

1. **İlk açılışta uygulama kendini anlatmıyor.** Splash 1,2 saniye sonra doğrudan giriş ekranına atlıyor; uygulamanın ne işe yaradığını anlatan hiçbir tanıtım yok (`views/SplashScreen.tsx:27`, `App.tsx:351-359`). `arsiv/design-prototipler/player-onboarding/` altında (arşivlenmiş) v1 mockup'ları var ama uygulanmamış. → 2-3 ekranlık değer anlatımı (maç bul → saha kirala → kartını geliştir) eklenmelidir.
2. **Misafir modu bozuk.** "ÖNCE MAÇLARA GÖZ AT" butonu maçlara değil Dashboard'a götürüyor; store'da `isGuest` diye bir durum yok, misafir sahte `'u1'` kullanıcısına düşüyor (`views/MatchJoin.tsx:304`, `store.ts:971,1026`). Misafir maça katılmaya çalışınca ya çöp veri yazılır ya RLS hatası alır; hiçbir yerde "kaydol" kapısı çıkmıyor. → `isGuest` state'i + korumalı aksiyonlarda kayıt daveti.
3. **Android donanım geri tuşu çalışmıyor.** `backButton` dinleyicisi hiç yok — geri tuşu uygulamayı kapatır (`App.tsx:313` yalnız `appUrlOpen`). Play incelemesinde sık red nedeni. → `@capacitor/app` `backButton` → `goBack()` bağlantısı (kökteyse çıkış onayı).
4. **Yakınlaştırma ve sistem yazı boyutu kapalı.** `index.html:6` `maximum-scale=1.0, user-scalable=no` — görme zorluğu yaşayanlar metni büyütemez. → kaldırılmalı.

## 🟠 Yüksek — genel his ve geri bildirim eksikleri

5. **Hatalar sessizce yutuluyor.** 19 view'da ~70 catch bloğu yalnızca `console.error` yapıyor; kullanıcı hiçbir şey görmüyor (örn. profil oluşturma `App.tsx:176`, takım kurma `App.tsx:519-527`, konum kaydı `LocationPrompt.tsx:33-35`). → tek toast sistemiyle kullanıcıya hata göster.
6. **Üç ayrı toast/geri bildirim sistemi var.** `components/common/Toast.tsx` + owner'a özel + admin'e özel + ~15 view'da elle yazılmış inline toast. → tek paylaşılan Toast'a geçilmeli.
7. **Marka rengi kararsız.** Ana vurgu neon yeşil `#39FF14` (BottomNav, loader), ödeme/giriş akışı sarı `#FFFF00`, bildirim ikonu turuncu `#F97316`. → tek aksan rengi seçilip her yerde kullanılmalı (ikon/splash sarı üretildi — karar netleşmeli).
8. **Aşırı küçük yazılar.** 58 dosyada 952 adet `text-[9-11px]` kullanımı; alt menü etiketleri ve ödeme güvenlik notu dahil. Koyu zeminde `gray-500/600` ile birleşince okunabilirlik/kontrast sınırın altında. → minimum 12px + kontrast taraması.

## 🟡 Orta — navigasyon ve akış doğruluğu

9. **Hayalet `ROLE_SELECTION` ekranı.** Akış artık oradan geçmiyor ama ~8 `goBack` hedefi hâlâ oraya düşebiliyor (`App.tsx:361,380-417`). → fallback'ler DASHBOARD'a çevrilmeli.
10. **`LocationPrompt` hiç açılmıyor.** Kayıt doğrudan Dashboard'a gidiyor; konum izni bağlamsal olarak hiç istenmiyor, "yakındaki sahalar" sessizce boş kalıyor. → ilk saha/maç aramasında bağlamsal konum isteme.
11. **Alt sekme değiştirmek geri yığınını siliyor.** `resetNavigation` stack'i temizliyor (`App.tsx:565`, `store.ts:755`). → sekme başına yığın veya en azından beklenen geri davranışı.
12. **Yasal onay kutusu önceden işaretli.** `AuthScreen.tsx:165` `agreed = true` başlıyor — KVKK onayı opt-in olmalı (hukuki/inceleme riski). → varsayılan `false`.
13. **Apple girişi çifte yönlendirme yapıyor.** `onSuccess()` + auth listener ikisi birden navigasyon tetikliyor (`AuthScreen.tsx:277` vs `App.tsx:208-210`); Google gibi yalnız listener'a bırakılmalı.
14. **Ödeme formunda gerçek doğrulama yok.** Yalnız "boş mu" kontrolü var; kart no/SKT/CVV format doğrulaması ve `autoComplete="cc-*"` (kart otomatik doldurma) eksik (`PaymentScreen.tsx:287-326`).

## 🟢 Orta — performans hissi

15. **Ağır ekranlar açılışta yükleniyor.** Dashboard (68KB), MatchDiscovery (75KB), MatchJoin (156KB) eager import (`App.tsx:16-21`) — düşük segment Android'de ilk açılışı yavaşlatır. → lazy'ye alınmalı (Splash zaten süre tanıyor).
16. **Uzun listeler sanallaştırılmamış.** `VirtualList` bileşeni var ama MatchDiscovery/PitchDiscovery ham `.map()` kullanıyor. → keşif listelerinde VirtualList.
17. **Şişkin görseller.** `public/player_card_photo.png` 439KB; `splash.png` ve `splash-dark.png` birebir aynı 171KB. → WebP'ye çevir / tekilleştir.

## ⚪ Düşük — tutarlılık ve cila

18. **Yükleme stilleri karışık.** Kimi ekran iskelet (skeleton), kimi çıplak spinner, `WalletScreen.tsx:380` tek pulse çubuğu. `MyBookings.tsx:145-149` doğru örnek (Loading/Error/Empty üçlüsü) — diğer listeler onu kopyalamalı.
19. **İki yarım UI kiti.** `NeonButton`/`GlassCard` yalnız ~3 dosyada; fiili standart `AnimatedButton` + bolca ham `<button>`. → tek kit seçilip yayılmalı.
20. **Erişilebilirlik etiketleri seyrek.** BottomNav/PageLayout iyi (aria-label + ≥48px dokunma alanı var) ama ikon-butonların çoğunda aria-label yok (~40 view'da toplam ~15 aria kullanımı).

## Korunması gereken iyi örnekler
- `index.css:45-56` merkezi safe-area değişkenleri ve `.pb-safe-nav` — doğru.
- `MyBookings` ekranının Loading/Error/Empty yapısı — diğer listeler için şablon.
- `PaymentScreen`'in `ProcessingView` yükleme durumu; BottomNav'ın erişilebilir dokunma hedefleri.

## Önerilen sıra (hızlı kazanç → büyük iş)
1. Hızlı düzeltmeler (1-2 gün): #3 geri tuşu, #4 zoom, #12 onay kutusu, #13 Apple çifte navigasyon, #9 hayalet ekran, #17 görseller, #15 lazy import.
2. Geri bildirim altyapısı (2-3 gün): #5+#6 tek toast + catch'lerin kullanıcıya bağlanması, #18 yükleme standardı.
3. Misafir/onboarding akışı (3-5 gün): #2 isGuest + değer kapısı, #1 onboarding (hazır mockup'lardan), #10 bağlamsal konum.
4. Tutarlılık taraması (sürekli): #7 renk kararı, #8 tipografi, #19 UI kiti, #20 aria, #11 sekme yığını, #14 ödeme formu (iyzico entegrasyonuyla birlikte), #16 sanallaştırma.
