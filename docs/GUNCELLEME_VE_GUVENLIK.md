# OYNA — Güncelleme ve Güvenlik Yol Haritası (Patron Rehberi)

Bu belge, panel + uygulama zaman içinde geliştikçe **nasıl güvenle güncelleyeceğini**
ve **güvenliği nasıl koruyacağını** kod bilmeden anlatır.

---

## 1) En önemli kural: "Önce veritabanı, sonra kod"

İki tür güncelleme vardır ve **her zaman birlikte** düşünülür:

- **Kod güncellemesi** → panelin/uygulamanın görünen kısmı (yeni ekran, düğme, düzeltme).
- **Veritabanı güncellemesi** → arkadaki kurallar/fonksiyonlar (yeni tablo, yeni işlem).

🔑 **Altın kural:** Yeni bir özelliğin kodu, arkadaki veritabanı güncellemesine
ihtiyaç duyar. Bu yüzden sıralama **önce veritabanı, sonra kod** olmalı. Tersi
olursa panel "RPC deploy edilmedi" gibi bir uyarı gösterir (bozulmaz, sadece o
özellik çalışmaz).

> Bu koordinasyonu **sen yapmazsın** — kodu ve veritabanını hazırlayan kişi (ben
> ya da geliştiricin) ikisini sırayla ve test ederek yayınlar. Sana **bitmiş,
> test edilmiş** güncelleme gelir.

---

## 2) Kim ne yapar? (sürdürülebilir model)

| İş | Kim yapar |
|---|---|
| Yeni özellik/düzeltme kodu yazmak | Ben / geliştiricin |
| Veritabanı güncellemesini canlıya uygulamak | Ben / geliştiricin |
| Kod + veritabanını **sıraya koyup test etmek** | Ben / geliştiricin |
| GitHub'a yayınlamak (main'e birleştirmek) | Ben hazırlarım, **sen onaylarsın** |
| Güncellemeyi **alıp** paneli kullanmak | **Sen** |
| Güvenlik kurallarını korumak | **Sen** (Bölüm 5) |

**Sen asla** veritabanına elle dokunmazsın. Canlı veritabanı tüm kullanıcılarla
ortaktır; yanlış bir elle müdahale gerçek uygulamayı bozabilir. Bu yüzden her
değişiklik test edilmiş "migration"larla yapılır, gelişigüzel değil.

---

## 3) Güncellemeyi nasıl alırsın?

Panelin **nerede çalıştığına** göre iki durum var:

### A) Panel kendi bilgisayarında (localhost / Antigravity ile)
1. Ben güncellemeyi GitHub'a koyarım ve sana "hazır" derim.
2. **Antigravity**'de projeyi aç → **Pull / Sync** (GitHub'dan en güncel hâli çek).
   - Alternatif: masaüstündeki **başlatıcıya** çift tıkla — o da açılırken en
     güncel sürümü kendisi çeker.
3. Paneli kapat, tekrar aç. Yeni özellikler gelir.

### B) Panel bir internet adresinde (ör. oynaturkiyepotansiyeli.com)
1. Ben güncellemeyi GitHub main'e birleştiririm (sen onaylarsın).
2. Adres **kendiliğinden** birkaç dakikada güncellenir. Ekstra iş yok.

---

## 4) Her güncelleme sonrası 30 saniyelik kontrol

1. Paneli aç, giriş yap.
2. Birkaç ekranı gez (Kullanıcılar, Finans, Destek Talepleri) — açılıyorlar mı?
3. Bir uyarı görürsen ("RPC deploy edilmedi", "yüklenemedi") → **bana yaz.**
   Bu genelde "veritabanı adımı atlanmış" demektir; ben uygular, düzelir.

> İstersen ben her güncellemede **bağlantı testini** (`admin:verify`) çalıştırıp
> "28/28 yeşil" diye teyit ederim. Sen hiç uğraşmazsın.

---

## 5) Güvenlik — senin koruyacağın kurallar

1. **Tek admin sensin.** Kimseye admin yetkisi verme (gerçekten istemedikçe).
   Ayda bir "admin listemde tek ben varım" diye bana kontrol ettir.
2. **2FA (telefon doğrulama) hep açık kalsın.** Telefonunu değiştirirsen önce
   bana haber ver, doğrulayıcıyı birlikte taşıyalım (kilitlenme olmasın).
3. **Anahtarları paylaşma.** Paneldeki genel anahtar (`anon`) zararsızdır. Ama
   "service_role" denen gizli anahtar **asla** bilgisayarında/e-postada/mesajda
   olmamalı — o yalnız Supabase sunucusunda durur.
4. **Panel adresini herkese açık paylaşma.** Localhost zaten dışarı kapalı (en
   güvenli). İnternete koyduysak Vercel'de **"Deployment Protection"** açık olsun
   → adresi bilen yabancı giriş ekranını bile göremez.
5. **Denetim kaydı (audit log).** Panelde yapılan her işlem değiştirilemez şekilde
   kaydedilir. Ara sıra bak; tuhaf bir şey görürsen bana söyle, birlikte inceleriz.
6. **Yedekler.** Supabase otomatik yedek alır. Büyük bir değişiklik öncesi (ör.
   toplu veri işlemi) bana söyle, ekstra yedek + gerekiyorsa önce **staging**
   (deneme veritabanı) üzerinde test edelim.

---

## 6) Aylık 5 dakikalık güvenlik kontrolü (bana yaptır)

- [ ] Admin listesi: yalnız sen misin?
- [ ] 2FA: hesabında kurulu ve çalışıyor mu?
- [ ] Denetim kaydında beklenmedik bir işlem var mı?
- [ ] Supabase güvenlik taraması (advisors): yeni uyarı var mı?
- [ ] Bekleyen bir veritabanı güncellemesi (deploy edilmemiş RPC) var mı?

Bu beş maddeyi bana "aylık kontrol" diye yazman yeterli; hepsini çalıştırıp
sana tek mesajda özet veririm.

---

## 7) Büyük/riskli değişikliklerde güvenli yol

1. Önce **staging** (deneme veritabanı `oyna-staging`) üzerinde dene.
2. Orada sorunsuzsa canlıya uygula (önce veritabanı, sonra kod).
3. Değişiklikten hemen sonra 30 saniyelik kontrolü (Bölüm 4) yap.
4. Ters giderse: her değişiklik geri alınabilir; panik yok, bana yaz.

---

### Tek cümlelik özet
**Sen:** güncellemeyi al (Pull/çift-tık), kullan, güvenlik kurallarını koru.
**Ben/geliştiricin:** kodu + veritabanını sıralı, test edilmiş şekilde hazırlar
ve yayınlar. Böylece hiçbir şey bozulmadan, güvenle ilerleriz.
