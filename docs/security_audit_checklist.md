# AI-Üretimli Kodlar İçin Güvenlik Denetim Kontrol Listesi
## (React · TypeScript · Capacitor · Supabase)

Bu kontrol listesi; yapay zeka (AI) tarafından geliştirilen veya düzenlenen kod bloklarının ana dallara (main/master) birleştirilmesinden önce yapılması gereken güvenlik, mimari ve mantık denetimlerini özetler. AI kodlarının "çalışıyor olması" güvenli olduğu anlamına gelmez. Bu kılavuzu kullanarak kod incelemelerinizi (PR) sıkılaştırın.

---

## 1. Derin Bağlantı Yönlendirmeleri (Deep Link Routing)

AI sıklıkla derin bağlantılarla gelen parametreleri doğrudan güvenilir girdi olarak kabul eder ve kimlik doğrulama/yetkilendirme zincirini bypass eden hızlı kodlar yazar.

- [ ] **Kimlik Doğrulama Kapısı (Auth Gate) Kontrolü:** Derin bağlantı tetiklendiğinde, hedeflenen sayfaya (örn. Sohbet, Maç Detayı, Tesis Sayfası) geçilmeden önce kullanıcının aktif oturumunun çözümlenmiş (`authResolved === true` ve `session !== null`) olduğu doğrulanıyor mu?
- [ ] **Rol ve Yetki Kontrolü:** Yönlendirilen sayfa veya işlem (örn. `?ghost=userId` veya `?admin=true`) kullanıcının profili / rolü (`is_admin`, `SUPER_ADMIN`) ile doğrulanıyor mu?
- [ ] **Girdi Temizliği (Sanitization):** Derin bağlantı URL'sinden ayrıştırılan parametreler (UUID, ID, arama sorguları) regex veya tip denetleyiciler (örn. `zod` veya TypeScript tip guardları) ile doğrulanıyor mu? SQL Injection veya XSS riskine karşı parametreler doğrudan HTML veya sorgu içine gömülüyor mu?
- [ ] **Açık Yönlendirme (Open Redirect) Koruması:** Harici bağlantılar (`window.open` veya `Browser.open`) tetiklenirken hedef URL, izin verilen beyaz listedeki domainler ile sınırlandırılmış mı?
- [ ] **URL Parametrelerinin Temizlenmesi:** Derin bağlantı işlendikten sonra hassas parametreler (örn. `code`, `token`, `ghostId`) tarayıcı geçmişinde kalmaması için `window.history.replaceState` ile temizleniyor mu?

---

## 2. Platform Kanalları ve Yerel Köprü Güvenliği (Capacitor Bridge)

Capacitor uygulamalarında webview ile yerel mobil API'ler (kamera, konum, depolama vb.) arasındaki köprü (platform channel), XSS saldırılarının yerel sisteme erişmesine neden olabilecek kritik bir geçittir.

- [ ] **Yerel Köprü Yetki Sınırlandırması:** `capacitor.config.ts` içinde `allowNavigation` ayarında bilinmeyen harici domainlere yetki verilmiş mi? (Varsayılan olarak yalnızca yerel `dist` paketinin çalışması en güvenlisidir).
- [ ] **Hassas Veri Depolama:** Kullanıcı oturum token'ları, API anahtarları veya kişisel veriler (PII) tarayıcının standart `localStorage` alanında mı saklanıyor? (Mevcut durum: Supabase oturum belirteci daima `localStorage`'da kalıcıdır — "Beni Hatırla" anahtarı kaldırıldı. Hassas veriler için `@capacitor/preferences`/secure-storage destekli native adaptör ayrı bir sağlamlaştırma işi olarak planlıdır; standart localStorage XSS saldırılarına karşı tamamen açıktır).
- [ ] **Güvenli HTTPS ve SSL Pinning:** Uygulamanın tüm API çağrıları zorunlu olarak HTTPS üzerinden mi yapılıyor? Kritik işlemler için SSL Pinning (örn. `cordova-plugin-advanced-http` veya Capacitor Http plugin'i) kullanılıyor mu?
- [ ] **Yerel İzinler ve En Az Yetki Prensibi:** `AndroidManifest.xml` ve `Info.plist` dosyalarında, uygulamanın gerçekten kullanmadığı izinler (rehber erişimi, arka plan konumu vb.) isteniyor mu? AI genellikle gereksiz izinleri koda ekleyebilir.

---

## 3. Sentry ve PostHog Kayıtlarında Hassas Veri Sızıntısı (PII Scrubbing)

Hata izleme (Sentry) ve analitik (PostHog) sistemlerine kullanıcıların gizli verilerinin (e-posta, telefon, şifre, JWT token'ı, kredi kartı vb.) gönderilmesi KVKK ve GDPR ihlali oluşturur. AI kod yazarken tüm hata nesnesini veya ağ isteklerini doğrudan Sentry'ye fırlatma eğilimindedir.

- [ ] **Client-Side Sentry Filtreleri (beforeSend/beforeBreadcrumb):** Sentry başlatılırken `beforeSend` ve `beforeBreadcrumb` kancaları kullanılarak hassas veriler maskeleniyor mu?
  - *Örnek maskelenecek alanlar:* `Authorization` ve `apikey` HTTP başlıkları, `email`, `phone`, `password`, `token`, `jwt`, `wallet_balance`.
- [ ] **Konsol Loglarının Sentry'ye Sızması:** Geliştirme aşamasında unutulan `console.log` veya `console.debug` çıktıları Sentry breadcrumb'larına ekleniyor mu? Logların hassas nesneleri (örn. Supabase auth response) doğrudan yazdırmadığı kontrol edildi mi?
- [ ] **Opaque ID Kullanımı:** Kullanıcı tanımlanırken (`identifyUser` / `Sentry.setUser`), kullanıcının açık e-posta adresi yerine veritabanındaki benzersiz UUID'si veya opaque (maskelenmiş) bir ID mi kullanılıyor?
- [ ] **Sunucu Tarafı Veri Filtreleme:** Sentry ve PostHog panellerinde "Data Scrubbing" (Veri Temizleme) kuralları ve regex tanımlamaları aktif mi?

---

## 4. Supabase Güvenliği ve RLS (Row Level Security)

React/TypeScript uygulamalarında supabase istemcisi doğrudan istemci tarafında çalıştığından, veritabanı güvenliği tamamen Supabase RLS politikalarına dayanır. AI genellikle bu politikaları yazmayı unutur veya hatalı yazar.

- [ ] **RLS Etkinleştirme:** Veritabanındaki tüm tablolar için RLS açık mı? (`ALTER TABLE x ENABLE ROW LEVEL SECURITY;` yapılmış mı?)
- [ ] **Politika Sıkılığı:** RLS politikalarında `USING (true)` veya `WITH CHECK (true)` gibi tüm internete okuma/yazma yetkisi veren gevşek tanımlamalar var mı?
- [ ] **Oturum UUID Kontrolü:** Kullanıcı verilerini getiren / güncelleyen politikalarda `auth.uid() = user_id` kontrolü eksiksiz yapılmış mı?
- [ ] **RPC (Remote Procedure Call) Güvenliği:** Özel Postgres fonksiyonları (RPC) yazılırken `SECURITY DEFINER` yetkisiyle çalışan fonksiyonlarda girdi doğrulamaları ve yetki kontrolleri fonksiyon içinde yapılıyor mu? (Fonksiyonu çağıran kullanıcının yetkisi doğrulanmadan `SECURITY DEFINER` kullanılması SQL Injection veya yetki yükseltme açıklarına yol açabilir).

---

## Kontrol Checklist Tablosu

| Bölüm | Kontrol Maddesi | Durum (OK/FAIL) | Notlar |
| :--- | :--- | :---: | :--- |
| **Deep Link** | Oturum kontrolü hedeften önce yapılıyor mu? | | |
| **Deep Link** | Gelen parametreler (UUID vb.) validate ediliyor mu? | | |
| **Deep Link** | Ghost Mode/İdari işlemler admin yetkisi arıyor mu? | | |
| **Bridge** | `allowNavigation` harici siteleri engelliyor mu? | | |
| **Bridge** | Tokenlar/Hassas veriler güvenli depolanıyor mu? | | |
| **Crash Reports**| Sentry `beforeSend` filtresi var mı? | | |
| **Crash Reports**| `Authorization` / `apikey` başlıkları maskeleniyor mu? | | |
| **Supabase** | Tüm tablolarda RLS aktif mi? | | |
| **Supabase** | `auth.uid()` karşılaştırması doğru yapılmış mı? | | |
