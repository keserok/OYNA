# OYNA Platformu - Detaylı Rol ve Veritabanı Analiz Raporu
## (Problemler ve Çözüm Önerileri)

Bu rapor, Oyna uygulamasının uçtan uca test edilmesi ve kaynak kodlarının (görünümler, servisler, veritabanı şemaları ve RPC fonksiyonları) incelenmesi sonucunda beş ana rol (Oyuncu, Kaleci, Hakem, Saha Sahibi, Sistem Yöneticisi) için tespit edilen problemleri, veritabanı açıkları ile mantıksal hataları ve bunlara yönelik kapsamlı çözüm önerilerini sunmaktadır.

---

## 1. ROL BAZLI YAŞANILAN PROBLEMLER VE ANALİZLER

### 1.1. Oyuncu (Player) Rolü Deneyimi ve Sorunları

*   **Problem A: Harita Odaklama Hatası (Map Centering Fallback)**
    *   **Açıklama:** `views/MatchJoin.tsx` dosyasında bir oyuncu maç lobisine katıldığında, eğer sahanın/maçın koordinat bilgisi tanımsız veya eksik ise, Leaflet haritası otomatik olarak `ORDU_CENTER` (Ordu Merkez) koordinatlarına odaklanmaktadır. 
    *   **Analiz:** Bu durum Ordu dışındaki şehirlerde (örneğin İstanbul, Ankara, İzmir) yaşayan oyuncuların lobide tamamen alakasız bir harita merkezi görmesine ve sahanın konumunu harita üzerinde bulamamasına yol açarak ciddi bir kullanıcı deneyimi (UX) bozukluğu yaratır.
*   **Problem B: Emanet Ödeme (Escrow/Kapora) Sisteminin Tamamen Simülasyon Olması**
    *   **Açıklama:** `supabase/migrations/20260716000001_escrow_match_lifecycle.sql` dosyasında kapora blokaj, tahsilat, serbest bırakma ve iade süreçleri yazılmış görünse de, ödeme sağlayıcısı varsayılan olarak `'SIMULATION'` modunda çalışmaktadır.
    *   **Analiz:** Kod içinde iyzico entegrasyonu için `[IYZICO-TODO]` etiketli birçok eksik API çağrısı bulunmaktadır. Bu durum, canlıya geçildiğinde oyuncunun kartından gerçek ön provizyon alınmasını, maç iptal edildiğinde provizyonun iptal edilmesini (void) veya iade edilmesini engellemektedir.

### 1.2. Kaleci (Goalkeeper) ve Hakem (Referee) Rolü Deneyimi ve Sorunları

*   **Problem A: Demo/Konuk Modu Bakiye ve Cüzdan Çakışması**
    *   **Açıklama:** `views/ServiceDashboard.tsx` dosyasında kaleci ve hakemlerin cüzdan işlemleri, kazanç bakiyeleri ve para çekme talepleri yönetilirken; eğer kullanıcı demo veya misafir modundaysa, oturum UID bilgisi bulunamadığı için sistem varsayılan olarak `'u1'` mock UID değerini kullanmaktadır (satır 230-235).
    *   **Analiz:** Kaleci/Hakem cüzdan ve transfer işlemlerinde UID'nin `'u1'`e sabitlenmesi, test ortamlarında farklı misafir kullanıcıların finansal verilerinin birbirine karışmasına ve cüzdan hareketlerinin yanlış profile yazılmasına yol açmaktadır.
*   **Problem B: TC Kimlik Doğrulama Hashing Bağımlılığı**
    *   **Açıklama:** `submit_provider_identity` veritabanı RPC fonksiyonunda, kaleci veya hakemlerin ilk payout talebini yapabilmeleri için TC Kimlik Numaralarını doğrulamaları gerekmektedir. DB seviyesinde bu numara `extensions.digest` fonksiyonu (SHA-256) kullanılarak hash'lenip saklanır.
    *   **Analiz:** Supabase veritabanında `pgcrypto` eklentisi (extension) aktif edilmemişse ya da `extensions` şeması üzerindeki `execute` izinleri kısıtlanmışsa, doğrulama formu gönderildiği anda fonksiyon hata vererek kaleci/hakem ödeme kapısının kilitlenmesine sebep olur.

### 1.3. Saha Sahibi (Field Owner) Rolü Deneyimi ve Sorunları

*   **Problem A: Tesis Kayıt Bildiriminin Adminlere İletilememesi (Role Mismatch)**
    *   **Açıklama:** Saha sahipleri ilk kayıt aşamasında tesis bilgilerini girip onboard olduklarında (`views/PartnerOnboarding.tsx` satır 131), sistem yöneticilerine onay bildirimi göndermek için şu sorgu çalıştırılır:
        ```typescript
        const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'ADMIN');
        ```
    *   **Analiz:** Veritabanı şemasında ve tip tanımlarında (`types.ts`) platform yöneticilerinin rolü `'SUPER_ADMIN'` olarak tanımlanmıştır ve RLS izinleri için `is_admin = true` kolonu kullanılmaktadır. Sırf bu yüzden `.eq('role', 'ADMIN')` sorgusu boş döner. Tesis sahipleri kayıt oluşturduğunda adminlerin paneline hiçbir zaman "Onay Bekleyen Tesis" bildirimi düşmez.
*   **Problem B: Simüle Edilen Tesis İadeleri**
    *   **Açıklama:** Kaptan tarafından 24 saatten önce iptal edilen rezervasyonlarda kaporanın saha sahibine gitmeyip oyuncuya iade edilmesi gerekir. Ödeme motoru tamamen simülasyon modunda olduğu için bankaya gerçek bir iade talimatı iletilmez. Bu durum veritabanı kayıtları ile gerçek banka hesap hareketleri arasında açıklar yaratır.

### 1.4. Sistem Yöneticisi (Admin) Rolü Deneyimi ve Sorunları

*   **Problem A: SLA Süresi ve Yapılandırma Eksiklikleri**
    *   **Açıklama:** `PendingVerificationsTab.tsx` dosyasında bekleyen başvuruların SLA (Hizmet Seviyesi Taahhüdü) durumları listelenirken `fetchAppConfig()` üzerinden çekilen SLA saat ayarı kullanılır.
    *   **Analiz:** Eğer veritabanı konfigürasyon tablosunda ilgili SLA değeri set edilmemişse veya tablo boş ise, arayüzde SLA durum tespiti yapılamamakta ya da varsayılan değerlere düşülmektedir.

---

## 2. VERİTABANI VE ŞEMA ANALİZLERİ (DATABASE & SECURITY AUDIT)

*   **Sorun 1: `is_platform_admin()` ve `is_admin()` Karışıklığı**
    *   `supabase/migrations/20260630000002_critical_authz_hardening.sql` ve `20260701000003_rls_policy_consolidation.sql` gibi güvenlik sertleştirme dosyalarında birçok bypass kuralı `public.is_admin()` fonksiyonunu çağırmaktadır.
    *   `is_admin()` yardımcı fonksiyonunun `is_platform_admin()` fonksiyonunu tetikleyen bir wrapper olarak `20260621165640_admin_ops_foundation.sql` dosyasında oluşturulmuş olması büyük bir RLS drop cascade riskini engellemiştir. Ancak kod tabanında bazı yerlerde `role = 'ADMIN'` kontrolü yapılırken, bazı yerlerde `is_platform_admin()` ve `is_super_admin()` kontrolleri yapılması, yetki yönetimini karmaşıklaştırmaktadır.
*   **Sorun 2: `profiles` Tablosu RLS Yetkilerindeki Zayıflıklar**
    *   `profiles` tablosunun hassas sütunları (bakiye, ban durumu, rol) her ne kadar trigger (`protect_profile_sensitive_fields`) ile korunsa da, client tarafında doğrudan `profiles` tablosuna yönelik yapılacak kontrolsüz update istekleri RLS'in aşırı permissive (izin verici) yapısı nedeniyle veritabanında gereksiz trigger tetiklenmelerine ve kaynak tüketimine sebep olmaktadır.
*   **Sorun 3: RLS Policy Eksiklikleri ve Permissive Politikalar**
    *   Master kılavuzlarda belirtilen `player_ratings` ve `wallet_transactions` tabloları üzerinde doğrudan `USING true` filtrelerinin bulunması, kullanıcıların kendilerine ait olmayan cüzdan hareketlerini ve finansal verileri izleyebilmesine yol açabilecek potansiyel veri sızıntılarına kapı açmaktadır.

---

## 3. KAPSAMLI ÇÖZÜM ÖNERİLERİ

### Çözüm Önerisi 1: Dinamik Harita Odaklama ve Geolocation Entegrasyonu
*   **Açıklama:** Sahanın koordinat bilgisi null geldiğinde haritayı sabit `ORDU_CENTER` değerine odaklamak yerine:
    1.  Eğer tarayıcı/cihaz konum izni verilmişse, kullanıcının anlık konumuna odaklanılmalıdır.
    2.  Konum izni yoksa, kullanıcının `profiles` tablosundaki `district` ve `city` değerlerine göre belirlenen şehir merkezine (örn. İstanbul Kadıköy koordinatlarına) odaklanılmalıdır.
    3.  Arayüzde haritanın odaklandığı yerin lobi sahasından uzak olduğunu belirten hafif bir uyarı banner'ı gösterilmelidir.

### Çözüm Önerisi 2: Rol Sorgulama ve Onboarding Hatalarının Düzeltilmesi
*   **Açıklama:** `PartnerOnboarding.tsx` dosyasındaki admin sorgusu, platformun gerçek rol yapısıyla uyumlu hale getirilmelidir:
    ```typescript
    // Hatalı sorgu yerine is_admin bayrağına göre adminleri çek
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_admin', true);
    ```
    Böylece yeni tesis onay beklediğinde tüm yetkili yöneticilere push bildirimi ve bildirim kaydı başarıyla iletilir.

### Çözüm Önerisi 3: Gerçek Ödeme ve Escrow Entegrasyonunun Tamamlanması
*   **Açıklama:** `SIMULATION` modundan kurtulmak için Supabase Edge Function (`create-payment`) içindeki `iyzico-node` SDK çağrıları aktif hale getirilmelidir.
    *   `match_block_deposit` tetiklendiğinde iyzico'dan **ön provizyon (pre-auth)** alınmalı.
    *   `match_capture_deposit` tetiklendiğinde ön provizyon **tahsile (capture)** dönüştürülmeli.
    *   Maç iptal edildiğinde (24 saat kuralına göre) provizyon iptal (void) veya iade (refund) edilmeli.
    *   Finans log çakışmalarını önlemek için `payment_provider` parametresi DB config tablosunda güvenli bir şekilde saklanmalıdır.

### Çözüm Önerisi 4: TC Kimlik Hash Güvenliği ve pgcrypto Kontrolü
*   **Açıklama:** Kaleci/Hakem doğrulamasında pgcrypto hatası alınmaması için:
    1.  Veritabanı migration script'inin en başına `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;` komutu eklenmelidir.
    2.  `extensions` şemasının `authenticated` rolüne execute yetkileri (`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO authenticated;`) tanımlanmalıdır.

### Çözüm Önerisi 5: Demo/Misafir Modları İçin UUID Güvenliği
*   **Açıklama:** Dashboard ve cüzdan ekranlarında misafir kullanıcıların verilerinin çakışmaması için:
    *   `auth.currentUser?.uid` bilgisi bulunamadığında mock `'u1'` UID'sine düşmek yerine, client tarafında yerel tarayıcı hafızasında (localStorage) geçici bir test UUID'si oluşturularak (örneğin `guest-uuid-xxxx`) tüm işlemler bu geçici kimlikle izole edilmelidir.
