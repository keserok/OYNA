# OYNA — MAĞAZA GÖNDERİM KILAVUZU (App Store + Play Store)

> **Tarih:** 17 Ağustos 2026 · **Durum:** YÜRÜRLÜKTE
> Kurucu gönderime hazırlanırken bu dosya tek kontrol listesidir.
> Teknik hazırlık (kod tarafı) tamamlandı; kalanlar **kurucu işi** başlığında.

---

## 1 · Kod tarafında KAPATILAN gönderim engelleri

| # | Engel | Ne yapıldı |
|---|---|---|
| 1 | **Demo girişi üretimde AÇIKTI** — `hostname === 'localhost'` kontrolü, Capacitor uygulamayı `https://localhost` (Android) / `capacitor://localhost` (iOS) üzerinden servis ettiği için MAĞAZA paketinde de doğruydu. E-posta alanına `saha1` yazan herkes **şifresiz** olarak gerçek bir **saha sahibi** hesabına girebiliyordu. | `Capacitor.isNativePlatform()` ile native pakette demo girişi ve demo hesap seçici **her durumda kapalı**. 8 test kilitliyor. |
| 2 | **iOS gizlilik manifestosu yoktu** (Apple, Mayıs 2024'ten beri zorunlu tutuyor; eksikse yükleme ITMS-91053 ile reddedilir). | `ios/App/App/PrivacyInfo.xcprivacy` yazıldı: 4 "required reason" API beyanı (UserDefaults CA92.1 · FileTimestamp C617.1 · DiskSpace E174.1 · SystemBootTime 35F9.1) + 10 veri türü. **Xcode projesine de kaydedildi** — kayıtsız dosya pakete girmez ve aynı retle döner. |
| 3 | **Kullanıcı kendi maçını göremiyordu** — açılış yüklemesi kullanıcı giriş yapmadan koşuyor, oturum isteyen `get_my_matches` anon gidip reddediliyor ve bir daha çağrılmıyordu. İncelemeci "maç kur → maç kayboldu" görürdü. | `fbGetMyMatches` önce oturumu çözer; `refreshMyMatches` eylemi giriş anında ve ana sayfa parmakla çekilince çağrılır. |

## 2 · Kurucu kararlarıyla yapılan ürün değişiklikleri (17 Ağu)

- **Ana sayfa maç kutusu**: profil kartı yerinde; yanındaki kutu (cüzdan kalktığı için) kolonun tamamını kaplar ve **her zaman** çizilir — maç varsa "MAÇ YAKLAŞIYOR + gün/saat + geri sayım", yoksa "MAÇ YOK".
- **"Tesisi ara" yönlendirmesi kaldırıldı** (vitrin CTA'sı, ödeme ekranı metni, hata sözlüğü). Nakit rezervasyon kapısı **sunucuda** duruyor.
  *Not:* listeleme sınırı açıklamasındaki "sonraki saatler için tesisi arayabilirsin" **farklı bir durumdur** (§2.11 — saha akşamı elle yönetir) ve korundu; istenirse o da kaldırılır.
- **İade kesintisi tek model**: iade tabanı karttan çekilen toplam, üzerinden tek PSP kesintisi (her akışta aynı).
- **Nakit rezervasyon kaldırıldı** (§2.12): uygulamadan rezervasyon yalnız kartla kapora ile.

## 3 · Zaten hazır olduğu DOĞRULANANLAR

| Şart | Durum |
|---|---|
| Hesap silme, uygulama içinden (App Store 5.1.1(v)) | ✅ `DeleteAccountModal`, Ayarlar'dan erişilir; sunucuda `request_account_deletion` + bekleme süresi + admin kuyruğu |
| Apple ile giriş (4.8 — Google girişi olduğu için zorunlu) | ✅ `loginWithApple` + Capacitor eklentisi |
| Engelleme / şikayet (1.2 — kullanıcı içeriği var) | ✅ Engellenenler yönetimi, kullanıcı şikayeti, saha içeriği bildirimi |
| Android hedef sürüm (Play şartı 35) | ✅ `targetSdk 36` |
| Donanım geri tuşu (Android) | ✅ overlay → yığın → uygulamayı arka plana al; 3DS sırasında kilitli |
| Güvenli alanlar + klavye | ✅ `viewport-fit=cover`, `--safe-*`, `--kb-height` |
| Dikey kilit (iki platform) | ✅ Info.plist + AndroidManifest (Android 16 uyumlu özellik bayrağıyla) |
| İzin gerekçe metinleri (iOS) | ✅ kamera, konum, fotoğraf, rehber |
| Üretim derlemesi | ✅ `npm run build` temiz; kod bölme yerinde |
| Birim testleri | ✅ 1746 test yeşil |

---

## 4 · KURUCU İŞİ — gönderimden önce

### Her iki mağaza
1. **Gizlilik politikası + kullanım şartları PUBLIC URL** (mağaza formları ister).
   Uygulama içi metinler hazır; yayınlanmış bir adres gerekiyor.
2. **İncelemeci hesabı**: demo girişi artık pakette kapalı olduğundan incelemeciye
   **gerçek bir e-posta + şifre** verilmeli (ör. `inceleme@oyna.app`, güçlü şifre).
   Bu hesabın Ordu/Altınordu bölgesinde görebileceği maç ve saha olmalı.
3. **Ekran görüntüleri** (telefon boyutları) ve mağaza metinleri.
4. **Yaş derecelendirmesi** formu (uygulamada reşit olmayan akışı + veli onayı var).

### App Store'a özel
5. **App Review notu** (öneri metni):
   > OYNA, halı saha rezervasyonu ve maç organizasyonu uygulamasıdır. Uygulama
   > içi ödemeler **fiziksel hizmet** bedelidir (saha kiralama kaporası, maç
   > katılım payı); dijital ürün veya abonelik satışı yoktur — Kural 3.1.5(a).
   > Ödeme altyapısı iyzico'dur.
6. **Gizlilik etiketleri**: `PrivacyInfo.xcprivacy` içindeki 10 veri türüyle
   birebir doldurulmalı (dosya kaynak olarak kullanılabilir).
7. Sign in with Apple yapılandırması (Bundle ID eşleşmesi) Apple Developer'da.

### Play Store'a özel
8. **Veri güvenliği (Data Safety) formu** — aynı 10 veri türü.
9. **Hassas izin beyanı**: `READ_CONTACTS` için Play Console'da amaç beyanı
   ("rehberden arkadaş bulma"; numaralar cihazda şifrelenir, rehber olduğu gibi
   sunucuya yüklenmez).
10. **Kapalı test**: kişisel hesapta production öncesi **12 tester × 14 kesintisiz
    gün** (LANSMAN_PLANI Faz C — takvimi bu belirliyor, en erken başlatılmalı).
11. İmzalı AAB için keystore.

### Derleme anında
12. `VITE_DEMO_ACCOUNTS=false` (native'de kod düzeyinde de kapalı ama iki kat emniyet)
    ve `.env` dosyasında **yerel test adresi kalmamalı** (üretimde gömülü canlı
    adrese düşülür; yanlış `.env` ile derleme uygulamayı bozar).

---

## 5 · Ödeme durumu — gönderim ile lansman arasındaki fark

Şu an canlı yapılandırma **bekleme duruşunda**: `payment_mode_global=CASH_ONLY`,
`match_deposit_enabled=false`. Bu, kart günü gelene kadar hiçbir yüzeyin online
tahsilat teklif etmemesi için bilinçli.

**İncelemeci bu durumda ne görür?** Saha detayında saatleri görür, "Kaporayı Öde"
düğmesine basınca "bu tesiste uygulama içi ödeme şu anda kapalı" mesajı alır ve
rezervasyonu tamamlayamaz. Maç kurma, keşif, sosyal, profil akışları tam çalışır.

**Bu, bağımsız denetimde ONAYLANAN TEK gerçek engeldir** (diğer aday engellerin
tamamı doğrulamada yanlış pozitif çıktı ya da bu gece kapatıldı). Apple, kural
2.1'e göre uygulamanın ana işlevinin incelemede **çalışmasını** ister.

**Bilinen durum (17 Ağu, canlıda yoklandı):**
- Ödeme ucu **kapalı değil**: `create-payment` çağrısı `PAYMENTS_DISABLED`
  değil `INVALID_FLOW` döndürüyor → `PAYMENT_PROVIDER` tanımlı (IYZICO).
- Engelleyen tek şey `app_config.payment_mode_global = CASH_ONLY`.

**Çözüm (yeni derleme GEREKTİRMEZ — tek satır sunucu ayarı):**

```sql
UPDATE public.app_config SET value = '"ONLINE_ONLY"'::jsonb
WHERE key = 'payment_mode_global';

-- Doğrula: hepsi true dönmeli
SELECT p.name, public.resolve_payment_mode(p.id)->>'online_allowed'
FROM public.pitches p ORDER BY 1;
```

> **`HYBRID` YAZMA.** Global `HYBRID`'de etkin mod tesisin kendi tercihine
> düşer; sahaların çoğu `CASH_ONLY` olduğu için o sahalar kapalı kalır ve
> incelemeci yine çıkmaz sokağa girer. `ONLINE_ONLY` hepsini açar.

**ÖN ŞART:** bunu açmadan önce iyzico **canlı anahtarlarının** uç fonksiyonlarda
tanımlı ve geçerli olduğu teyit edilmeli. Anahtar yoksa çıkmaz sokak bu kez
"ödeme hatası"na dönüşür — aynı ret, farklı ekran. Sıra: **Faz B (iyzico
sözleşmesi + anahtarlar + küçük tutarlı gerçek kart provası) → sonra bu ayar →
sonra gönderim.**

**Ek:** inceleme notuna demo değil **gerçek** hesap bilgisi ve adım adım akış
yaz ("saha seç → saat seç → kaporayı öde"); ayrıca en az bir tesiste gerçek boş
slot bulunduğundan emin ol.

> **Not:** denetim, "online kapalıyken düğmeyi kilitle" biçiminde bir arayüz
> koruması da önerdi; kurucu kararı gereği o uyarı yüzeyi KALDIRILDI ve geri
> eklenmedi. Doğru çözüm zaten yukarıdaki 1. maddedir — o açıldığında bu durum
> kullanıcıda hiç oluşmaz.
