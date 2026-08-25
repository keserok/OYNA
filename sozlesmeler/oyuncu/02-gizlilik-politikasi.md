# Gizlilik Politikası

> **Durum:** Yayında · **Son güncelleme:** 24.08.2026 · **PR:** #74
> **Uygulandığı yerler:** `public/gizlilik.html` (herkese açık — https://oyna.app/gizlilik.html) ve `views/LegalScreen.tsx → PRIVACY` (uygulama içi, aynı içeriğin kısaltılmış hâli)
>
> Bu dosya `public/gizlilik.html`'in tam metnidir; bu iki dosya **birlikte** güncellenmelidir.

---

**Son güncelleme: 24.08.2026 · Veri sorumlusu: Miraç Kerem Çürüksulu (OYNA)**

### 1. Toplanan Veriler
- **Kimlik/iletişim:** ad, e-posta, telefon
- **Profil ve oyun tercihleri:** ad-soyad, yaş aralığı, cinsiyet (opsiyonel), mevki/pozisyon ve oyun stili gibi profil bilgileri
- **Veli onayı (yalnızca reşit olmayan kullanıcılar için):** veli ve çocuğa ait ad-soyad, doğum tarihi ve T.C. Kimlik Numarası; T.C. Kimlik numaraları **şifrelenerek (hash) saklanır, açık (düz) biçimde tutulmaz** ve yalnızca veli-çocuk ilişkisinin doğrulanması amacıyla işlenir
- **Konum:** yakındaki sahaları ve maçları gösterebilmek için, yalnızca uygulamayı kullanırken ve izninizle işlenir; hassasiyeti azaltılmış (yaklaşık) olarak saklanır
- **Rehber eşleştirme:** arkadaşlarınızı bulabilmeniz için, açık izninizle cihazınızdaki rehber okunur; numaralar cihazınızda şifrelenip (hash) yalnızca bu şifreli hâli sunucumuza gönderilir — OYNA'yı kullanmayan kişilerin ham telefon numarası cihazınızdan hiçbir şekilde çıkmaz. Bu özelliği Ayarlar'dan istediğiniz zaman kapatabilirsiniz.
- **Kullanım:** rezervasyon, maç, takım ve mesajlaşma gibi uygulama içi etkinlik verileri
- **Cihaz:** push bildirimleri için cihaz token'ı
- **Fotoğraf/kamera:** profil fotoğrafı ve QR bilet taraması için (izninizle)
- **Ödeme:** kart bilgileriniz OYNA sunucularında saklanmaz; ödemeler doğrudan yetkili ödeme kuruluşunun güvenli altyapısında işlenir
- **Hata ve kullanım analitiği:** uygulama kararlılığı ve iyileştirme amacıyla anonimleştirilmiş/takma adlı ölçüm verileri. Bu ölçümler yalnızca olayın adını (ör. bir ekranın açılması ya da bir özelliğin kullanılması) içerir; **taktik içeriği, oyuncu/kişi isimleri, çizimler veya diğer kişisel içerik bu ölçümlere dâhil edilmez.**

### 2. Verilerin Kullanım Amacı
Hizmetin sunulması, rezervasyon ve ödeme süreçleri, maç/takım eşleştirme, bildirimler, güvenlik ve dolandırıcılık önleme, müşteri desteği ve hizmet iyileştirme.

### 3. Verilerin Paylaşımı ve Görünürlüğü
Verileriniz yalnızca aşağıdaki taraflarla, belirtilen amaçla sınırlı olarak paylaşılabilir:
- Rezervasyon yaptığınız **tesis** ile (yalnızca rezervasyonun gerektirdiği asgari ölçüde — bkz. [Veri Paylaşım Protokolü](../veri-paylasim-protokolu.md); olağan rezervasyonda tesise ad-soyad veya telefonunuz aktarılmaz)
- Talep ettiğiniz hizmet kapsamında **kaleci/hakem gibi hizmet sağlayıcılar** ile (yalnızca ilgili hizmetin ifası için gerekli asgari ölçüde; telefon/e-posta/konum aktarılmaz)
- **Ödeme kuruluşu** ile (ödeme işlemlerinin gerçekleştirilmesi için)
- Barındırma, hata izleme ve kullanım analitiği sağlayan **teknoloji tedarikçilerimiz** ile (yalnızca hizmetin işletilmesi için)
- Google/Apple hesabınızla giriş yapmanız hâlinde ilgili **kimlik doğrulama sağlayıcısı** ile
- Yasal yükümlülükler kapsamında **yetkili kamu kurum ve kuruluşları** ile

Bir maça katıldığınızda **adınız ve profil görseliniz** o maçı görüntüleyenlere görünür olur; saha veya hizmet sağlayıcılar hakkında yaptığınız **değerlendirme ve yorumlar** kamuya açık olarak gösterilebilir.

Verileriniz pazarlama amacıyla üçüncü taraflara satılmaz veya kiralanmaz.

### 4. Yurt Dışına Aktarım
Barındırma ve veritabanı başta olmak üzere bazı teknoloji altyapı hizmetlerimizi, sunucuları **yurt dışında** bulunan tedarikçilerden alırız (barındırma/veritabanı hizmetimiz yurt dışı bir veri merkezinde çalışır). Bu hâlde kişisel verileriniz, 6698 sayılı Kanun'un 9. maddesi uyarınca, **Kurul'ca ilan edilen standart sözleşme gibi uygun güvencelere** dayanılarak veya mevzuatın öngördüğü diğer hukuki sebeplerle yurt dışına aktarılır. Ayrıca harita, içerik dağıtım ağı (CDN) ve avatar görselleri gibi hizmetleri görüntülerken IP adresiniz ilgili yurt dışı sağlayıcıya iletilebilir.

### 5. Çerezler ve Benzer Teknolojiler
Oturum yönetimi ve tercihleriniz için gerekli teknolojiler kullanılır. Detaylı bilgi için [Çerez Politikamıza](06-cerez-politikasi.md) bakabilirsiniz.

### 6. Veri Güvenliği
Veriler şifreli bağlantı (HTTPS) üzerinden iletilir; veritabanı seviyesinde satır bazlı erişim yetkilendirmesi (RLS) uygulanır ve güvenlik kontrolleri düzenli olarak gözden geçirilir.

### 7. Haklarınız (6698 sayılı KVKK m.11)
Kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini isteme, mevzuatta öngörülen şartlarda silinmesini/yok edilmesini isteme, bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme, işlenen verilerin münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarınızı kullanmak için mirackeremcuruksulu@gmail.com adresine yazılı olarak başvurabilirsiniz.

### 8. Hesap ve Veri Silme
Hesabınızı uygulama içinden (Ayarlar → Hesabımı Sil) veya [hesap silme sayfamızdaki](07-hesap-silme-bilgilendirmesi.md) adımlarla silebilirsiniz. Silme talebi sonrası hesabınız ve verileriniz 7 gün içinde kalıcı olarak silinir.

### 9. Saklama Süresi
Veriler, hizmetin gerektirdiği ve ilgili mevzuatın öngördüğü süre boyunca saklanır. Ödeme ve faturalandırmaya ilişkin kayıtlar, vergi ve ticaret mevzuatının öngördüğü süre boyunca ayrıca saklanır.

### 10. Veri Sorumlusu ve İletişim
- **Unvan:** Miraç Kerem Çürüksulu (OYNA)
- **Vergi Dairesi / Vergi Kimlik No:** Kartal Vergi Dairesi – 2650883645
- **Adres:** Cevizli Mahallesi, Zuhal Caddesi, Ritim İstanbul A Ticari Blok No:46 Daire:50 (Mükellef Teknoloji A.Ş. bünyesinde), Kartal/İstanbul
- **E-posta:** mirackeremcuruksulu@gmail.com
