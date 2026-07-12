# OYNA Yönetim Panelini Kendi Mac'inde Çalıştırma (Tek Tık)

Bu rehber, paneli **kendi bilgisayarından, sana özel** çalıştırman içindir.
Teknik bilgi gerekmez. Panel canlı veritabanına bağlanır; buradan yaptığın her
işlem (ban, iade, bakiye, destek yanıtı, ayarlar) **anında canlıya** yansır.

> **Neden güvenli?** Panel yalnız senin bilgisayarından açılır (internete kapalı),
> girişte e-posta + 2FA ister ve canlıda **tek admin hesabı sensin**. Panelin açık
> olması/olmaması uygulamanı etkilemez — kullanıcılar hep çalışır.

---

## BİR KERE yapılacaklar (ilk kurulum)

### 1. Node.js kur (paneli çalıştıran motor)
- https://nodejs.org/tr/download → **LTS** sürümünü indir → kur (hep "İleri/Devam").
- Bu bir kerelik. (Başlatıcı zaten Node yoksa bu sayfayı senin için açar.)

### 2. Projeyi bilgisayarına al (tek komut — izinleri korur)
1. **Terminal**'i aç: Spotlight (⌘ + Boşluk) → "Terminal" yaz → Enter.
2. Aşağıdaki satırı **kopyala**, Terminal'e **yapıştır**, **Enter**'a bas:

   ```
   git clone https://github.com/keserok/OYNA.git ~/OYNA
   ```

3. "git" ilk kez çalışıyorsa macOS küçük bir araç kurulumu isteyebilir → **Install/Kur** de, bitince komutu tekrar çalıştır.
4. Bitince Belgeler değil, **Kullanıcı klasöründe `OYNA`** adlı klasör oluşur.

> Neden ZIP değil? "Download ZIP" Mac'te çift-tık iznini bozar ve otomatik
> güncellemeyi engeller. Bu tek komut ikisini de doğru yapar; bir daha
> gerekmez — başlatıcı bundan sonra kendini günceller.

### 3. İlk açılış izni (bir defa)
- `OYNA` klasöründeki **`OYNA-Panel-Baslat.command`** dosyasına **sağ tıkla → Aç**.
- macOS "geliştirici doğrulanamadı" derse **Aç** de. (Yalnız ilk seferde sorulur; sonra hep çift tık.)

---

## HER SEFERİNDE (panel açmak)

1. Klasördeki **`OYNA-Panel-Baslat.command`** dosyasına **çift tıkla**.
2. Siyah bir pencere açılır, birkaç saniye sonra **panel tarayıcında açılır**.
3. Admin e-postan + şifrenle gir.

**İlk girişte (bir kere) 2FA kurulumu:**
- Ekrana bir **QR kod** gelir.
- Telefonunda bir doğrulayıcı uygulama aç (**Google Authenticator**, **Authy**,
  veya iPhone'da **Ayarlar ▸ Şifreler** ile). QR'ı okut.
- Uygulamanın verdiği **6 haneli kodu** panele gir. Bitti.
- Bundan sonra her giriş sadece bu 6 haneli kodu ister.

**Paneli kapatmak:** açılan siyah pencereyi kapat. (Uygulaman etkilenmez.)

---

## Sık takılınan yerler

- **"command dosyası açılmıyor / izin yok":** Dosyaya **sağ tıkla → Aç** (çift tık değil, ilk seferde).
- **Panel açılmadı, siyah pencerede hata var:** İnternet bağlını kontrol et,
  pencereyi kapatıp tekrar çift tıkla. İlk açılış birkaç dakika sürebilir (kurulum).
- **2FA kodunu kaybettim / telefonu değiştirdim:** Panik yok — bize yaz, doğrulayıcıyı
  sıfırlarız ve yeniden kurarsın. (Tek admin sen olduğun için bunu güvenle yapabiliriz.)
- **Başka bilgisayarda çalışır mı?** Evet, aynı adımlarla her Mac'te **tam
  performans** çalışır; ağır iş sunucuda döner, bilgisayar sadece ekranı gösterir.

---

## Güvenlik özeti (senin için ayarlandı)

- Panel **yalnız bu bilgisayardan** erişilir (dışarı/yerel ağa kapalı).
- Canlıda **tek yetkili hesap sensin**; başka admin yok.
- Giriş **2FA zorunlu**.
- Anahtar dosyası (`.env`) içindeki değer **herkese açık** olan güvenli anahtardır;
  gizli/servis anahtarı bilgisayarında **bulunmaz**.
