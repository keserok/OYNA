# OYNA Admin Paneli — Patronun El Kitabı
### *Kod bilmeden uygulamayı yönetmek için eksiksiz rehber*

---

> **Bu kılavuz hakkında:** Siz koda dokunmadan, sadece admin panelinden Oyna uygulamasını baştan sona yönetebilirsiniz. Bu belge her ekranı, ne işe yaradığını ve bir sorunla karşılaştığınızda ne yapmanız gerektiğini Türkçe olarak anlatır. Saklayın, referans olarak kullanın.

---

## 🗺️ GENEL HARİTA: Admin Panelinde Hangi Ekranlar Var?

Panele giriş yaptığınızda sol menüde şu bölümler görünür:

| Menü Adı | Ne İşe Yarar? | Kullanım Sıklığı |
|---|---|---|
| **Ana Ekran (GENEL)** | Günlük özet, gelir grafiği, son maçlar | Her gün |
| **Kontrol Merkezi** | Bekleyen acil görevler, tüm sistem anlık durum | Sabah açılışı |
| **Sahalar** | Tesis ekleme, düzenleme, onay, vitrin yönetimi | Haftada birkaç kez |
| **Kullanıcılar** | Tüm oyuncular — ban, silme, profil görüntüleme | Şikayet/sorun olduğunda |
| **Kaleciler** | Kaleci başvuruları, profil düzenleme | Haftalık |
| **Hakemler** | Hakem başvuruları, profil düzenleme | Haftalık |
| **Maçlar** | Tüm maçları görüntüle, iptal/düzenle. Kokpitin "Kadro & Slot" sekmesinin tepesindeki **Lobi Aynası** oyuncu lobisiyle birebir aynıdır: başlık, konum, tarih, saat, ücret, zorluk, format, min. puan ve görünürlük (özel kod) öğesine tıklayıp yerinde düzenlenir — kayıt anında yayına geçer ve denetime düşer. Saha da (`shared/MatchPitch`) tüketiciyle aynıdır: slota tıkla → ata/çıkar/taşı. İptal modalında **🚨 Acil İptal**: tek adımda iptal + iade sürecini başlatma + tüm kadroya anlık bildirim. | Sorun olduğunda |
| **Destek Merkezi** | Kullanıcı (Oyuncular) ve tesis (Tesisler) destek talepleri: mesaj dizisi, yanıt yazma (yanıt kullanıcıya uygulama bildirimi olarak düşer), durum yönetimi (Açık→Yanıtlandı→Çözüldü/Kapalı). Kullanıcılar talebi uygulamada Ayarlar → Yardım Merkezi'nden açar. Sidebar rozeti açık talep sayısını canlı gösterir. | Her gün |
| **Doğrulama Merkezi** | Başvuru onay kuyruğu (kaleci, hakem, tesis) | Günlük |
| **Finans** | Cüzdan hareketleri, ödemeler, para çekme talepleri | Günlük |
| **Komisyon** | Platform komisyon oranlarını yönet | Ayda bir gözden geçir |
| **İhtilaflar** | Oyuncular arası anlaşmazlık çözümü | Şikayet geldiğinde |
| **Servis İhtilafları** | Kaleci/hakem ihtilafları | Şikayet geldiğinde |
| **Kampanyalar** | Tüm kullanıcılara push bildirimi gönder | Pazarlama/duyuru zamanı |
| **Promosyon Kodları** | İndirim kodu oluştur, yönet | Kampanya döneminde |
| **Bildirim Şablonları** | Uygulama bildirim metinlerini düzenle | İçerik güncellemelerinde |
| **Topluluklar** | Ligler, turnavalar, topluluklar | Etkinlik dönemlerinde |
| **Denetim Günlüğü** | Kim, ne zaman, ne yaptı? Tam kayıt | Denetim / şüphe durumunda |
| **Sistem Parametreleri** | Maç kuralları, otomatik onay süreleri, eşikler | Ayda bir |
| **Ayarlar** | Bakım modu, komisyon oranı, uygulama metinleri | Kritik müdahale anlarında |

---

## 📊 1. ANA EKRAN (Dashboard) — Her Sabah Açın

**Ne görürsünüz:**
- Toplam gelir (7 gün / 30 gün / tüm zamanlar seçenekli)
- Ödeme sayısı ve komisyon oranı
- Eksik kadrolu maç sayısı (dikkat: bu sayı yüksekse platform doluluk oranı düşük demektir)
- Gelir trendi grafiği
- Son 5 maçın listesi

**Ne yapabilirsiniz:**
- Tarih aralığı filtresini değiştirebilirsiniz (7 Gün / 30 Gün / Tümü)
- Son maçlara tıklayarak detay çekebilirsiniz
- "Yenile" butonuyla anlık veriyi yenileyebilirsiniz

**⚠️ Dikkat edilmesi gerekenler:**
- Gelir grafiği boş görünüyorsa → veritabanında gelir trendi tablosu henüz veri üretememiş demektir; bu ilk birkaç hafta normaldir.
- Eksik kadrolu maç sayısı sürekli yüksekse → oyuncu sayısının az olduğu şehirlerde saha kapasitesi fazla olabilir; geçici çözüm olarak o şehirlerdeki max oyuncu sayısını azaltabilirsiniz (Sistem Parametreleri → Maç Kuralları).

---

## 🏟️ 2. SAHALAR — Tesisleri Yönetin

**Ne yapabilirsiniz:**
1. **Yeni Tesis Ekle:** "Tesis Ekle" butonuna tıklayın → tesis adı, şehir, ilçe, koordinat, fotoğraflar, fiyat tarifeleri, saha sayısı girin.
2. **Tesis Düzenle:** Listeden tesise tıklayın → kalemi (✏️) seçin → değişiklikleri yapıp kaydedin.
3. **Tesis Onayla / Reddet:** Saha sahibi kayıt yaptırdığında tesis "Onay Bekliyor" durumunda gelir → Siz onaylarsanız platforma girer, reddederseniz sahibine bildirim gider.
4. **Vitrine Al / Çıkar:** Tesisi öne çıkarmak için yıldız (⭐) ikonuna tıklayın. Gizlemek için göz kapatma (👁️) ikonunu kullanın.
5. **Vitrin Aynası (Saha Kurulum Merkezi → Vitrin sekmesi):** Oyuncunun Saha Keşfet'te gördüğü saha kartının CANLI birebir kopyası. Kartın üstünde "vitrinde görünüyor mu?" teşhisi (Onaylı ✓ / Tesis Açık ✓ / Yayında ✓ — biri kırmızıysa saha listelenmiyor demektir), altında ilgili düzenleme sekmelerine köprüler (fotoğraf/kimlik/olanak/kort/tarife). Kaydettiğiniz her değişikliğin oyuncuya nasıl göründüğünü tahmin etmeden görürsünüz.

**Tesis onaylamak için adımlar:**
1. Sol menüden **"Doğrulama Merkezi"** → **"Tesis Onayları"** sekmesine gelin
2. Bekleyen tesisi tıklayın
3. Bilgileri inceleyin (adres, fotoğraf, saha sayısı doğru mu?)
4. **"Onayla"** veya **"Reddet"** butonuna basın
5. Ret nedeni yazın (isteğe bağlı ama önerilir)

---

## 👥 3. KULLANICILAR — Oyuncu Yönetimi

**Ne yapabilirsiniz:**
- Kullanıcı arama (ad, e-posta, telefon ile)
- Rol filtresi (Oyuncu / Saha Sahibi / Kaleci / Hakem)
- Durum filtresi (Aktif / Banlı)
- **Kullanıcıyı Banla:** Kötüye kullanım durumunda geçici ya da kalıcı ban (+ süre seçilir)
- **Ban Kaldır:** Banlı kullanıcının itirazı kabul edilirse banlı kişiyi seçip ban kaldırılır
- **"360° Görünüm":** Kullanıcının tüm geçmişi (maçlar, ödemeler, ban geçmişi, ihtilaflar) tek ekranda
- **"Profil Aynası" (360 → Profil sekmesi):** Kullanıcının UYGULAMADA gördüğü profil ekranının birebir canlı kopyası — kimlik kartı, premium kart (🎴), güven puanı, kısayollar ve maç geçmişi aynı bileşenlerle çizilir. Fark: her alan admin için düzenlenebilir:
  - **Düzenle** butonu uygulamadaki "Profili Düzenle" alt sayfasının TA KENDİSİNİ açar (pozisyon, doğum tarihi, cinsiyet, oyun stili, tanıtım, fotoğraf) — kayıt audit'li `admin_update_user_profile` RPC'sinden geçer
  - **Yönetici Alanları** (mor bölüm): ad-soyad, güven puanı (0–100), beceri puanı (kart OVR temeli) ve premium kart aç/kapat + tier
  - **Cüzdan kısayolu:** bakiye düzeltmesi artık **ledger'lıdır** — `wallet_transactions`'a ADMIN_ADJUST kaydı düşer, sebep zorunludur, FINANCE yetkisi ister (bakiye elle ezilmez, mutabakat bozulmaz)
- **"Ghost Girişi":** Kullanıcının şikayetini anlamak için onun gözünden uygulamayı görmek (şifre gerekmez, sadece sebep yazılır; her ghost girişi denetim günlüğüne kaydedilir)
- **Kullanıcı Sil (Anonimleştir):** KVKK gereği hesap anonim hale getirilebilir

**Sık karşılaşılan senaryo — Bir oyuncu "paramı iade ettiremedin" diye şikayet ediyor:**
1. Kullanıcıyı bulun, **"360° Görünüm"** açın
2. "Maçlar" sekmesinde ilgili maçı bulun
3. "Ödemeler" sekmesinde ödeme durumuna bakın
4. Sorun varsa **Finans → Ödemeler** ekranından o ödeme kaydını bulup müdahale edin

---

## ✅ 4. DOĞRULAMA MERKEZİ — Başvuru Onay Kuyruğu

Bu ekran **3 ayrı kuyruğu** yönetir:

### a) Kaleci / Hakem Başvuruları
- Yeni başvuranlar "Bekliyor" durumunda görünür
- Başvuruyu açın → kişisel bilgiler, fotoğraf, bölge tercihleri, ücret
- **SLA uyarısı:** Başvuru belirli saatten uzun bekliyorsa sarı/kırmızı badge görünür → acele edin
- "Onayla" → kullanıcı aktif kaleci/hakem olarak piyasaya girer
- "Reddet" → kullanıcıya bildirim gider, başvuru kapanır

### b) Kimlik Doğrulama
- Onaylanan kaleci/hakemler para çekme için TC kimliği yükler
- Kimlik fotoğrafını görüntüleyin → Onayla veya Reddet
- Ret sebebi mutlaka yazın

### c) Tesis Onayları
- Saha sahiplerinin kayıt ettiği tesisler burada bekler
- Tesis bilgilerini inceleyin → Onayla veya Reddet

---

## 💰 5. FİNANS — Para Akışını Takip Edin

Bu ekran **6 sekme** içerir:

| Sekme | Ne Gösterir? |
|---|---|
| **Cüzdan Defteri** | Kullanıcıların cüzdan para giriş/çıkış hareketleri |
| **Rezervasyonlar** | Tüm ödeme kayıtları (tamamlandı, iptal, bekliyor) |
| **Ödeme Niyetleri** | Kritik: takılı kalan ödemeleri burada çözebilirsiniz |
| **Tesis Faturaları** | Saha sahiplerine kesilen fatura/komisyon logları |
| **Para Çekme Talepleri** | Kaleci/hakemler para çekme taleplerini buraya gönderir → siz onaylarsınız |
| **Canlıya Geçiş Paneli** | İyzico entegrasyonu ve canlı ödeme durumu |

**En önemli sekme: Ödeme Niyetleri (Payment Intents)**
- Bir oyuncunun ödemesi takılıp kaldıysa buraya gelin
- Kaydı bulun → **"Tahsil Et"** (capture), **"Boşalt"** (void) veya **"İade Et"** (refund) seçeneklerinden birini seçin
- Her müdahale otomatik denetim günlüğüne kaydedilir

**Para Çekme Talebi Onaylamak:**
1. **Finans → Para Çekme Talepleri** sekmesine gelin
2. Bekleyen talepleri listede görürsünüz
3. "Onayla" → ödeme yapıldı olarak işaretlenir; gerçek havale bankanızdan manüel yapılır

> 💡 **Not:** Canlı iyzico entegrasyonu kurulana kadar ödemeler simülasyon modunda çalışır. Bu süre zarfında tüm fiili para transferleri manüel yapılmalıdır.

---

## 📐 6. KOMİSYON — Kazancınızı Ayarlayın

**Komisyon nasıl çalışır?**
- Her maç ödemesinden platformun aldığı pay.
- **4 farklı kapsam** tanımlayabilirsiniz:
  - **Global:** Tüm maçlara uygulanan varsayılan oran
  - **Saha Özel:** Belirli bir sahaya özel oran
  - **Kaleci Hizmeti:** Kaleci kiralama işlemlerinden alınan pay
  - **Hakem Hizmeti:** Hakem kiralama işlemlerinden alınan pay

**Komisyon değiştirmek için:**
1. **Komisyon** sayfasına gidin
2. Değiştirmek istediğiniz satırın kalem (✏️) ikonuna tıklayın
3. `Oran %` ve `Biçimlendirme %` değerlerini girin
4. **Kaydet** — değişiklik anında aktif olur

---

## ⚖️ 7. İHTİLAFLAR — Anlaşmazlık Çözümü

Oyuncular bir maç sonrasında birbirini şikayet ettiğinde veya ödeme konusunda anlaşmazlık yaşandığında buraya gelir.

**Adım adım çözüm süreci:**
1. **İhtilaflar** sayfasına gelin → bekleyen ihtilafları listede görürsünüz
2. İlgili ihtilafa tıklayın → tarafların beyanlarını okuyun
3. Maçın detaylarına geçin (maç ID'sine tıklayarak)
4. Kararınızı yazın (not alanı zorunludur)
5. **"Çözüldü"** veya **"Reddedildi"** seçeneğini işaretleyin
6. Taraflar otomatik bildirim alır

---

## 📣 8. KAMPANYALAR — Toplu Bildirim Gönderin

Promosyon, duyuru veya önemli bir güncelleme için tüm kullanıcılara veya belirli gruplara bildirim gönderin.

**Hedef kitle seçenekleri:**
- Tüm Kullanıcılar
- Sadece Saha Sahipleri
- Son 30 Günde Kayıt Olanlar (yeni kullanıcılar)
- Kaleciler
- Hakemler

**Gönderim adımları:**
1. **Kampanyalar** sayfasına gelin
2. Başlık ve mesaj metnini yazın
3. Hedef kitleyi seçin → "Önizle" ile kaç kişiye gideceğini görün
4. **"Gönder"** butonuna tıklayın
5. Gönderim geçmişi altta listelenir

> ⚠️ Bildirim metinlerini daha sonra düzenlemek için **Bildirim Şablonları** sayfasını kullanın. Push bildirimleri canlı iyzico entegrasyonu gibi; gerçek cihaz bildirimi için Expo Push servisi kurulmuş olmalıdır.

---

## 🔧 9. SİSTEM PARAMETRELERİ — Kurallara İnce Ayar

Bu sayfa **kod yazmadan** oyun kurallarını değiştirmenizi sağlar:

| Parametre | Ne Anlama Gelir? | Örnek Değer |
|---|---|---|
| `min_players_pct` | Maçın başlaması için dolu olması gereken minimum oran | 60 (= %60) |
| `match_cancel_window_h` | Maç iptaline kaç saat kalana kadar ücretsiz iptal? | 24 (saat) |
| `auto_approve_hours` | Tesis başvurusu kaç saat içinde otomatik onaylanır? | 72 (saat) |
| `kapora_pct` | Rezervasyon için alınan kapora yüzdesi | 30 (= %30) |
| `fairplay_min_rating` | Güvenilirlik skoru bu altındaysa uyarı gönder | 3.5 |

**Bir değeri değiştirmek için:**
1. **Sistem Parametreleri** sayfasına gidin
2. İlgili parametreyi bulun → kalem ikonuna basın
3. Yeni değeri yazın → Kaydet
4. Değişiklik anında aktif olur ve **denetim günlüğüne** yazılır

---

## 🛡️ 10. DENETİM GÜNLÜĞÜ — Kimin Ne Yaptığını İzleyin

Admin panelindeki her işlem bu günlüğe kaydedilir:
- Kim yaptı (hangi admin)
- Ne zaman yaptı
- Ne değişti (eski değer vs yeni değer)
- Hangi kullanıcıya / tesise uygulandı

**Zincir Doğrulama:** "Zinciri Doğrula" butonuna basarsanız tüm kayıtların kırılmadan geldiğini onaylar. Bu KVKK denetimlerinde önemlidir.

**Şüpheli bir durumda ne yapmalısınız:**
1. **Denetim Günlüğü**ne gelin
2. Admin adına veya tarih/saat aralığına göre filtreleyin
3. İlgili kaydı açın → "Diff" görünümünde eski ve yeni değeri yan yana görürsünüz

---

## ⚙️ 11. AYARLAR — Acil Müdahale Ekranı

### Bakım Modu
Uygulama bir güncelleme geçirirken veya kritik bir sorun çıktığında **tüm kullanıcıları anında dışarı kilitleyebilirsiniz**:

1. **Ayarlar** → "Bakım Modu"nu açın
2. Onay kutusuna `BAKIM` yazın (kasıtlı olarak aktifleştirilir)
3. Uygulama tüm kullanıcılara "Bakımda" ekranı gösterir
4. Sorunu çözdükten sonra tekrar kapayın

> ⚠️ Bakım modu açıkken aktif rezervasyonlar dondurulur. Acil durum dışında kullanmayın.

### Uygulama İçi Metin Düzenleme (CMS)
Uygulamada görünen bazı metinleri (slogan, açıklama, yardım metni gibi) kodlamadan değiştirebilirsiniz:
1. **Ayarlar → İçerik** sekmesine gidin
2. Değiştirmek istediğiniz metin alanını bulun
3. Düzenleyin → otomatik kaydedilir

---

## 🚨 EKSİK ÖZELLIKLER VE ÇÖZÜM ÖNERİLERİ

Admin paneli genel olarak son derece güçlü bir yapıya sahip olsa da, **kod bilmeyen bir patronun tamamen bağımsız çalışabilmesi** için şu eksikliklerin giderilmesi önerilir:

---

### ❌ Eksiklik 1: Gerçek Zamanlı Destek Talebi / Şikayet Gelen Kutusu Yok
**Sorun:** Bir kullanıcı "paramı iade ettir" veya "banlama kaldır" diye şikayette bulunduğunda, bu şikayet doğrudan admin panelinde bir görev olarak görünmez. Şu an sadece e-posta/telefon üzerinden gelir.

**Öneri:** "Destek Talepleri" (support_tickets) modülü eklenmelidir. Kullanıcı uygulama içinden şikayet açar → admin panelde kuyrukta görünür → admin yanıt yazar, durumu kapatır. Bu tek bir veritabanı tablosu ve iki ekranla (kullanıcı ve admin) çözülebilir.

---

### ❌ Eksiklik 2: Saha Sahibi — Admin Direkt İletişim Kanalı Yok
**Sorun:** Saha sahibi tesis bilgilerini güncellemek, soru sormak veya sorun bildirmek istediğinde, bunu yapabileceği panel içi bir mesajlaşma yok.

**Öneri:** Admin paneline "Tesis Sahibi Mesajları" bölümü eklenmelidir. Saha sahibi Owner panelinden mesaj yazar → admin panelde bildirim rozeti görünür → admin cevaplar.

---

### ❌ Eksiklik 3: Finansal Özet Rapor İndirme Yok (Excel/CSV)
**Sorun:** Finans sayfasında verileri görebiliyorsunuz ama muhasebeciye vermek için Excel/CSV indirme seçeneği bazı sekmelerde eksik.

**Öneri:** Tüm finans sekmelerine (özellikle tesis faturaları ve cüzdan defteri) "CSV İndir" butonu eklenmelidir. Teknik olarak çok basit bir özelliktir; `downloadCsv` yardımcı fonksiyonu zaten kod tabanında mevcuttur.

---

### ❌ Eksiklik 4: Bakım Modu Zamanlanmış Açma/Kapama Yok
**Sorun:** Gece 02:00'de bakım modu açmak istiyorsunuz ama o saatte uyanık olmak zorundasınız.

**Öneri:** Bakım moduna "Zamanlanmış başlat ve bitir" seçeneği eklenmelidir. Örneğin "01:00–03:00 arası bakım modu aktif olsun" diyebilmelisiniz.

---

### ✅ Eksiklik 5 (ÇÖZÜLDÜ): Maç İptal Etme Akışı
Maç kokpitindeki iptal modalına **"🚨 Acil İptal"** eklendi: tek adımda iptal + iade sürecini başlatma + tüm kadroya anlık bildirim; sebep zorunlu, denetime yazılır.

---

### ✅ Eksiklik 6 (ÇÖZÜLDÜ): Kullanıcı Bakiye Yönetimi
Kullanıcı 360° → **Profil Aynası → Cüzdan** kısayolu: tutar (±) + zorunlu sebep girilir; işlem `wallet_transactions`'a ADMIN_ADJUST olarak işlenir (ledger bozulmaz), FINANCE yetkisi ister, denetim günlüğüne düşer.

---

## ✅ GENEL DEĞERLENDİRME

| Alan | Mevcut Durum | Patronun Bağımsızlık Puanı |
|---|---|---|
| Tesis yönetimi | ✅ Eksiksiz | 🟢 Tamamen bağımsız |
| Kullanıcı yönetimi | ✅ Güçlü | 🟢 Tamamen bağımsız |
| Kaleci/Hakem onay | ✅ Eksiksiz | 🟢 Tamamen bağımsız |
| Finans takibi | ✅ İyi | 🟡 Bazı senaryolarda geliştirici desteği |
| Ödeme müdahalesi | ✅ Var (ama karmaşık) | 🟡 Öğrenme süreci gerekli |
| Destek talebi yönetimi | ❌ Yok | 🔴 Şu an bağımsız değil |
| İçerik (metin) güncelleme | ✅ Var | 🟢 Tamamen bağımsız |
| Kampanya / bildirim | ✅ Var | 🟢 Tamamen bağımsız |
| Sistem parametre yönetimi | ✅ Mükemmel | 🟢 Tamamen bağımsız |
| Denetim ve şeffaflık | ✅ Sektör standartı | 🟢 Tamamen bağımsız |
| Bakım modu | ✅ Var | 🟢 Tamamen bağımsız |

**Genel Not:** Admin paneli, sektörde eşine az rastlanır bir olgunluktadır. Sistemin %80'ini kod bilmeden yönetebilirsiniz. Yukarıdaki 6 eksikliği ekibinize tamamlattığınızda, tam bağımsız operasyonel bir platform sahibi olacaksınız.
