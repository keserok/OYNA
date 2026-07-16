# Veri İşleyen Envanteri ve Yurt Dışı Aktarım (KVKK m.9) Değerlendirmesi

> **Durum:** Taslak (iç değerlendirme) · **Son güncelleme:** 16.07.2026
> **İlişkili belgeler:** [Gizlilik Politikası](../oyuncu/02-gizlilik-politikasi.md) §4; [KVKK Aydınlatma Metni](../oyuncu/03-kvkk-aydinlatma-metni.md) §6; [Veri Paylaşım Protokolü](../veri-paylasim-protokolu.md).
>
> Bu not, OYNA'nın kişisel verileri aktardığı/işlettiği üçüncü taraf hizmet sağlayıcılarının (veri işleyenlerin) **koda ve yapılandırmaya dayalı gerçek envanterini** ve bu aktarımların 6698 sayılı KVKK'nın **7499 sayılı Kanun (yür. 01.06.2024) ile değişik 9. maddesi** kapsamındaki yurt dışı aktarım değerlendirmesini içerir. Hukuki danışmanlık yerine geçmez.

---

## 1. AMAÇ VE KAPSAM

Bu belge; (i) OYNA'nın fiilen kullandığı veri işleyenleri ve her birine giden veri kategorilerini, (ii) bu işleyenlerin bulunduğu ülke/bölgeyi, (iii) yurt dışı aktarımlar için uygulanacak KVKK m.9 mekanizmasını ve (iv) tamamlanması gereken somut adımları ortaya koyar. Envanter, **fiilen aktif** olan ile **kodlu ancak kapalı (dormant)** aktarımları ayrı gösterir; yalnızca aktif olanlar bugün bir yurt dışı aktarım doğurur.

## 2. TARAF SIFATLARI

2.1. **Veri sorumlusu: OYNA** (Miraç Kerem Çürüksulu). Verilerin işlenme amaç ve araçlarını belirler.

2.2. **Veri işleyenler:** OYNA adına ve talimatıyla veri işleyen teknik hizmet sağlayıcılar (ör. Supabase — barındırma/veritabanı; Resend — e-posta gönderimi; Sentry/PostHog — hata/analitik; SMS sağlayıcısı — OTP iletimi). Bu taraflarla **veri işleme sözleşmesi (DPA)** akdedilmesi ve talimatla sınırlı işleme sağlanması esastır.

2.3. **Bağımsız/ayrı veri sorumluları:** Kimlik doğrulama sağlayıcıları (Google, Apple) ve ödeme kuruluşu (iyzico), kendi mevzuatları çerçevesinde kendi işleme faaliyetleri bakımından ayrıca veri sorumlusu sıfatını haiz olabilir.

---

## 3. AKTİF VERİ İŞLEYEN / AKTARIM ENVANTERİ

> Aşağıdakiler bugün fiilen çalışan ve veri aktaran hizmetlerdir.

| # | Hizmet | Rol | Aktarılan veri | Bölge (yurt içi/dışı) | Hukuki durum / yapılacak |
|---|---|---|---|---|---|
| 1 | **Supabase** (veritabanı, kimlik doğrulama, depolama, edge) | Veri işleyen (birincil) | Uygulamadaki tüm PII: e-posta, telefon, ad, konum bölgesi, uygulama içi içerik, push token, cüzdan/ödeme meta verisi, hash'li rehber, yüklenen görseller | **Yurt dışı — AWS Singapur (ap-southeast-1)** | DPA + **Kurul standart sözleşmesi** imzala; 5 iş günü içinde Kurul'a bildir. Supabase DPA/SCC durumu **[TEYİT EDİLECEK]** |
| 2 | **Google** (Google ile giriş) | Ayrı veri sorumlusu | Kimlik (e-posta, ad, Google kimliği) | Yurt dışı (ABD) | Aktarım, kullanıcının kendi hesabıyla girişi sonucu; aydınlatmada belirt; uygun güvence/istisna değerlendir |
| 3 | **Apple** (Apple ile giriş) | Ayrı veri sorumlusu | Apple kimlik jetonu, e-posta/ad | Yurt dışı (ABD) | Aynı — aydınlatmada belirt |
| 4 | **SMS OTP sağlayıcısı** (Supabase panelinde tanımlı) | Veri işleyen | Telefon numarası + OTP kodu | **[TEYİT EDİLECEK]** (sağlayıcı repoda yok; muhtemelen yurt dışı) | Sağlayıcıyı ve bölgesini panelden teyit et; DPA + m.9 mekanizması uygula |
| 5 | **CARTO / OpenFreeMap** (harita karo sunucuları) | Veri işleyen (dolaylı) | Kullanıcı **IP'si** + harita görünüm alanı (yaklaşık konum iması) | Yurt dışı (ABD/AB) | Düşük hassasiyet; aydınlatmada "harita/CDN" olarak belirt |
| 6 | **Cloudflare cdnjs** (statik harita simge dosyaları) | Veri işleyen (dolaylı) | Kullanıcı IP'si | Yurt dışı (global) | Aynı; ileride kendi barındırmaya alınabilir |
| 7 | **DiceBear / ui-avatars / flagcdn** (avatar & bayrak görselleri) | Veri işleyen (dolaylı) | Kullanıcı IP'si + seed/ad-baş harf (URL'de) | Yurt dışı (global) | Düşük hassasiyet; aydınlatmada belirt; ileride kendi barındırmaya alınabilir |
| 8 | **Vercel** (ön-yüz barındırma/CDN) | Veri işleyen | Tüm ön-yüz trafiği (IP, istekler) | Yurt dışı (ABD/global edge) | Barındırma durumunu **[TEYİT EDİLECEK]**; DPA + m.9 mekanizması uygula |

---

## 4. KODLU ANCAK KAPALI (DORMANT) / PLANLI AKTARIMLAR

> Aşağıdaki entegrasyonlar kodda mevcuttur ancak ilgili ortam değişkeni/bayrak açılmadıkça **çalışmaz ve veri aktarmaz.** Devreye alınmadan önce ilgili DPA ve m.9 mekanizması tamamlanmalı, bu envanter ve aydınlatma güncellenmelidir.

| Hizmet | Amaç | Açılış koşulu | Devreye girince aktarılan veri | Bölge | Not |
|---|---|---|---|---|---|
| **iyzico** | Ödeme (PSP) | `PAYMENT_PROVIDER=IYZICO` | Ad, e-posta, telefon, kart PAN/SKT/CVC (geçici) | **Yurt içi (Türkiye)** | Bugün `SIMULATION`. **Önemli:** kodda TC ve IP **sabit placeholder** — gerçek TC/IP iyzico'ya gitmiyor; canlıya geçişte bu davranış tekrar kontrol edilmeli. Yurt içi olduğu için m.9 sorunu doğurmaz. |
| **Sentry** | Hata izleme | `VITE_SENTRY_DSN` ayarlıysa | İstisna kayıtları, kullanıcı kimliği (PII maskeli) | Yurt dışı (ABD) | Açılış planı **[BELİRSİZ]**. PII maskeleyici mevcut (`sendDefaultPii:false`). |
| **PostHog** | Ürün analitiği | `VITE_POSTHOG_KEY` set | Otomatik olay/sayfa, kullanıcı kimliği+rol, IP, çerez | Varsayılan **ABD** (AB seçeneği var) | Açılış planı **[BELİRSİZ]**. Açılırsa **açık rıza** gerekebilir (analitik/çerez); AB bölgesi tercih edilebilir. |
| **Resend** | E-posta gönderimi | `RESEND_API_KEY` set | Alıcı e-posta, ad, konu/gövde, sıfırlama kodu | Yurt dışı (ABD) | Açılış planı **[BELİRSİZ]**. DPA + m.9 mekanizması gerekli. |
| **Apple APNs / Google FCM** | Push bildirimi | `push_live_enabled` + anahtarlar | Cihaz token'ı + bildirim başlık/gövde | Yurt dışı (ABD/global) | Devreye alınınca aydınlatmada belirt. |

> Not: Dormant servisler devreye alınmadan önce prod build ortam değişkenleri (ör. `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`) ve Supabase Edge secret'ları (`RESEND_API_KEY`, `APNS_*`, `GOOGLE_*`) kontrol edilmelidir.

---

## 5. YURT DIŞI AKTARIM DEĞERLENDİRMESİ (KVKK m.9 / 7499 s. Kanun)

5.1. **Hukuki çerçeve.** 01.06.2024'te yürürlüğe giren değişiklikle KVKK m.9 uyarınca yurt dışına aktarım şu sıradüzenle mümkündür:
- **(a) Yeterlilik kararı:** Kurul'un ilgili ülke/sektör için yeterlilik kararı bulunması. *(Bugün itibarıyla ilan edilmiş bir yeterlilik kararı yoktur.)*
- **(b) Uygun güvenceler:** Yeterlilik kararı yokken, aktarımın m.5/m.6'daki bir işleme şartına dayanması **ve** taraflarca uygun güvencelerden birinin sağlanması: **Kurul'ca ilan edilen standart sözleşme**, bağlayıcı şirket kuralları (BCR), yazılı taahhütname + Kurul izni veya uluslararası sözleşme.
- **(c) Arızi hâller (istisnalar):** Yalnızca arızi olmak kaydıyla açık rıza, sözleşmenin ifası, üstün kamu yararı vb.

5.2. **Seçilen mekanizma (onaylandı): uygun güvence — Kurul standart sözleşmesi.** Supabase gibi sürekli ve temel hizmet niteliğindeki aktarımlar arızi olmadığından, açık rızaya dayanmak sağlıksızdır (rıza her an geri alınabilir ve hizmet kesintiye uğrar). Bu nedenle birincil ve düzenli aktarımlar için **standart sözleşme** yolu esas alınır.

5.3. **Standart sözleşme usulü.** Taraflar Kurul'ca ilan edilen standart sözleşmeyi imzalar ve imzadan itibaren **5 (beş) iş günü içinde** Kurul'a bildirir. Sağlayıcının kendi SCC/DPA'sı mevcutsa, bu belge Türkiye standart sözleşmesiyle uyumlu hâle getirilmeli veya ek protokolle desteklenmelidir.

---

## 6. UYGULANACAK ADIMLAR (AKSİYON LİSTESİ)

1. **Supabase:** DPA'yı kabul et/imzala; Türkiye için Kurul standart sözleşmesini uygula; 5 iş günü içinde Kurul'a bildir. *(Supabase mevcut DPA durumu kullanıcı tarafından kontrol edilecek.)*
2. **SMS OTP sağlayıcısı:** Supabase panelinden sağlayıcıyı ve bölgesini teyit et; yurt dışıysa aynı standart sözleşme + bildirim sürecini uygula.
3. **Vercel (veya fiilî barındırıcı):** Barındırma sağlayıcısını teyit et; DPA + m.9 mekanizmasını uygula.
4. **Dormant servisler (Sentry/PostHog/Resend/push):** Her biri **devreye alınmadan önce** DPA + m.9 mekanizması tamamlanmalı; PostHog için AB bölgesi ve analitik açık rızası değerlendirilmeli; bu envanter ve aydınlatma güncellenmeli.
5. **iyzico:** Yurt içi olduğundan m.9 sorunu yok; ancak canlıya (`IYZICO`) geçmeden önce placeholder TC/IP davranışı ve PCI kapsamı gözden geçirilmeli.
6. **Görsel/harita CDN'leri (DiceBear/ui-avatars/flagcdn/CARTO/Cloudflare):** Düşük hassasiyet; aydınlatmada "harita ve görsel CDN'leri" olarak belirtildi; orta vadede kendi barındırmaya alınması IP sızıntısını ortadan kaldırır.

---

## 7. KART VERİSİ / PCI NOTU

Ödeme kartı verisi (PAN/SKT/CVC), ön-yüzde bellekte toplanır ve `create-payment` edge fonksiyonu üzerinden iyzico'ya iletilir; **OYNA tarafında saklanmaz/loglanmaz**, yalnızca maskeli son 4 hane ve iyzico token'ı kalır. Kart verisi geçici olarak **Supabase Edge çalışma zamanından** geçtiğinden, canlı ödeme öncesi PCI-DSS kapsamı ve edge fonksiyon güvenliği ayrıca değerlendirilmelidir.

---

> **Uygulama Notu:** Bu değerlendirme kaynak koduna ve yapılandırmaya dayanılarak hazırlanmıştır. Yurt dışı aktarım mekanizmasının nihai uygulanışı (standart sözleşme metni, Kurul bildirimi, dormant servislerin devreye alınması) ve VERBİS/ETBİS ile ilişkisi için [VERBİS/ETBİS Değerlendirme Notu](../kurumsal/01-verbis-etbis-uyum-degerlendirmesi.md)'na bakınız; yürürlük öncesi lisanslı bir avukat teyidi alınmalıdır.
