# Çerez Politikası

> **Durum:** Yayında · **Son güncelleme:** 15.07.2026 · **PR:** #76
> **AÇIK KONU:** `public/cerez-politikasi.html` elle tutuluyor ve hâlâ 12.07.2026 diyor — bkz. `sozlesmeler/ic-notlar/ACIK-KONULAR.md` A3.
> **Uygulandığı yerler:** `public/cerez-politikasi.html` (herkese açık — https://oyna.app/cerez-politikasi.html) ve `views/LegalScreen.tsx → CEREZ` (uygulama içi, aynı içerik)
> **Kaynak:** Listelenen depolama teknolojileri kod tabanı taranarak doğrulanmıştır (`utils/observability.ts`, `supabaseClient.ts`).

---

**Son güncelleme: 15.07.2026**

Bu politika, OYNA'nın web yüzeylerinde (oyna.app ve alt sayfaları, web uygulaması) kullanılan çerezleri ve tarayıcı depolama teknolojilerini (localStorage/sessionStorage gibi) açıklar. Mobil uygulamada çerez kullanılmaz; cihaz izinleri ve veri işleme [Gizlilik Politikası'nda](02-gizlilik-politikasi.md) ayrıca açıklanmıştır.

### 1. Zorunlu Çerezler / Depolama
Oturumunuzu açık tutmak ve güvenliğinizi sağlamak için gereklidir; devre dışı bırakılamaz ve rıza gerektirmez.

| Ad / Amaç | Tür | Süre |
|---|---|---|
| Supabase oturum belirteci — girişinizi hatırlar | localStorage | Kalıcı — çıkış yapana veya hesabınızı silene kadar |

### 2. Performans ve Analitik Çerezleri
Yalnızca ilgili ölçüm servisi etkinleştirilmişse (dağıtıma göre değişir) kullanılır; uygulamanın kararlılığını izlemek ve iyileştirmek amacıyladır.

| Tedarikçi / Amaç | Tür |
|---|---|
| PostHog — kullanım analitiği | localStorage + çerez |
| Sentry — hata/çökme takibi | localStorage (kimliklendirici e-posta/telefon gibi alanlar temizlenerek gönderilir) |

Bu tedarikçilerin sunucuları yurt dışında olabilir; aktarım koşulları [Gizlilik Politikası'nın](02-gizlilik-politikasi.md) "Yurt Dışına Aktarım" bölümünde açıklanmıştır.

### 3. Yönetim ve Tercihleriniz
Tarayıcınızın ayarlarından çerezleri ve site verilerini istediğiniz zaman silebilir veya engelleyebilirsiniz; bu, zorunlu çerezler için oturumunuzun sonlanmasına neden olabilir. Analitik amaçlı depolamayı reddetmeniz, hizmeti kullanmanızı engellemez.

### 4. Değişiklikler
Bu politikayı güncelleyebiliriz; önemli değişiklikler bu sayfada yayınlanır. Sorularınız için mirackeremcuruksulu@gmail.com.
