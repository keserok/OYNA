# K1 (Cüzdan İadesi + %5 Kesintili Çekim) — Sözleşme Değişiklikleri ve Hukukçu Onayı Gereken Noktalar

> ⚠️ **Bu metinleri hukukçu olmayan biri hazırladı.** Aşağıdaki değişiklikler ürün
> kararını ve kodun fiilî davranışını sözleşmelere yansıtmak için yapılmıştır;
> **yayına alınmadan önce avukat onayı gerekir.** Özellikle "Onay bekleyen kararlar"
> bölümündeki üç başlık tüketici mevzuatı açısından risk taşıyor.

**Ürün kararı:** İade parası kullanıcının OYNA cüzdanına geçer. Kullanıcı bu parayı
uygulama içinde harcayabilir veya **%5 hizmet bedeliyle** banka hesabına çekebilir.
Karta iade yoktur.

---

## 1. Neden gerekliydi

Sözleşmeler karta iade vaat ediyordu; kod ise ilk günden beri **yalnızca cüzdana**
iade yapıyor. Karta iade yolu kodda hiç yok. Yani metin ile ürün arasında doğrudan
çelişki vardı ve kullanıcı sözleşmeye dayanarak karta iade talep edebilirdi.

Ayrıca cüzdan ve para çekimi rejimi (minimum tutar, kesinti, kimlik, tek talep,
kill-switch) **hiçbir sözleşmede tanımlı değildi** — hepsi kodda uygulanıyordu.
Cüzdana yapılan tek atıf, Topluluk Kuralları'nda "dondurulabilir" ifadesiydi.

---

## 2. Değişen dosyalar

Metin **üç yerde** yaşıyor; üçü de güncellendi (`sozlesmeler/README.md:3` kuralı).

| # | Dosya | Değişiklik |
|---|---|---|
| 1 | `sozlesmeler/oyuncu/05-mesafeli-satis-iptal-iade.md` | "Karta yansıtılır" cümlesi kaldırıldı; yerine "4.1 İade Nereye Yapılır?" bölümü |
| 2 | `sozlesmeler/oyuncu/01-kullanim-sartlari.md` md.6.1 | Kademelere "OYNA cüzdanına" eklendi + "İadenin yapılacağı yer" paragrafı |
| 3 | `sozlesmeler/oyuncu/01-kullanim-sartlari.md` md.6.2 | "İadenin karta yansıma süreci" → cüzdana işlenme + md.6.5 atfı |
| 4 | `sozlesmeler/oyuncu/01-kullanim-sartlari.md` md.6.4 | "Nakit iade" seçeneği kaldırıldı (kodda böyle bir yol yok); cüzdana ödenir |
| 5 | `sozlesmeler/oyuncu/01-kullanim-sartlari.md` **md.6.5 — YENİ** | Cüzdan ve Para Çekimi rejimi sıfırdan yazıldı (7 alt madde) |
| 6 | `sozlesmeler/oyuncu/01-kullanim-sartlari.md` md.12.3 | Mücbir sebep iadesi cüzdana |
| 7 | `sozlesmeler/oyuncu/07-hesap-silme-bilgilendirmesi.md` | "Cüzdanımdaki para ne olur?" bölümü eklendi |
| 8 | `sozlesmeler/kaleci-hakem/01-hizmet-saglayici-sozlesmesi.md` md.9.2 | İadeler cüzdana + **üstünlük hükmü düzeltildi** (aşağıda) |
| 9 | `sozlesmeler/saha-sahibi/01-isletme-b2b-sozlesmesi.md` | İşletme kaynaklı iptalde iade cüzdana |
| 10 | `views/LegalScreen.tsx` | Yukarıdakilerin uygulama içi karşılıkları + md.6.5 özeti |
| 11 | `public/*.html` | `npm run build:legal` ile yeniden üretildi |

### K1'den bağımsız olarak düzeltilen yapısal hata

`kaleci-hakem/01-hizmet-saglayici-sozlesmesi.md` md.9.2 şöyle diyordu:

> "iki metin arasında çelişki olması hâlinde işbu madde 9.2 hükümleri esas alınır"

Yani bir **B2B sözleşmesi, tüketici sözleşmesine üstün tutuluyordu.** Tüketici bu
sözleşmenin tarafı bile değil. Düzeltildi: tüketici ilişkisinde her hâlükârda
Mesafeli Satış Koşulları esas alınır; md.9.2 yalnız OYNA ile hizmet sağlayıcı
arasındaki hakediş/mahsup ilişkisini düzenler.

---

## 3. ONAY BEKLEYEN KARARLAR

### K-1 · Kusurdan doğan iadede çekim ücretsiz olmalı mı? 🔴 EN YÜKSEK RİSK

**Durum:** Metinler şu an **ayrım yapmıyor** — her cüzdan çekiminde %5 alınır.

**Sorun:** Tesis veya OYNA kaynaklı iptalde (md.6.4) ya da mücbir sebepte (md.12.3)
kullanıcının hiçbir kusuru yok. Bu kullanıcı parasını geri almak için %5 ödemek
zorunda kalıyor. Aynı maddeler "herhangi bir kesinti yapılmaksızın iade edilir"
diyor — kullanıcı parayı çekmek isterse bu taahhüt fiilen delinmiş olur.

**Neden şimdilik ayrım yapılmadı:** Kodda böyle bir ayrım yok. Bakiyenin hangi
kısmının kusurlu iadeden geldiğini izleyen bir mekanizma bulunmuyor. Kodun
tutamayacağı bir taahhüdü sözleşmeye yazmak, düzeltmeye çalıştığımız çelişkinin
aynısını yeniden üretirdi.

**Seçenekler:**
1. **Kusurlu iadelerde çekim ücretsiz olsun** → sözleşme daha savunulabilir olur,
   ama kod işi yapılmalı: iade kaynağını (kusurlu/kusursuz) `wallet_transactions`
   üzerinde işaretlemek ve `_wallet_cashout_quote`'u kova bazında çalıştırmak.
2. **%5 her çekimde uygulansın** → mevcut hâl. Md.6.4 ve md.12.3'teki "kesintisiz
   iade" ifadelerinin, kesintinin iadeye değil **çekim işlemine** ait olduğunu
   açıkça söyleyecek şekilde yeniden yazılması gerekir.

**Tavsiyem:** (1). Tüketicinin satıcı kusurundan doğan iadeyi tahsil etmek için
bedel ödemesi TKHK açısından zayıf bir konum. Ama bu bir iş kararı + kod işi.

### K-2 · Çekim süresi taahhüdü

Metinlerde **süre taahhüdü verilmedi**; yalnız "bankanın işlem sürelerine tabidir"
denildi. Analiz "en geç 5 iş günü" öneriyordu ama kodda böyle bir SLA yok ve
tutulamayacak bir süre yazmak yeni bir çelişki üretir. Operasyon bu süreyi
taahhüt edebilecek durumdaysa metne eklenmeli.

### K-3 · Hizmet bedeli için fatura

%5 hizmet bedeli bir hizmet karşılığıdır. Fatura/e-arşiv düzenlenecek mi, KDV dahil
mi hariç mi, muhasebeleştirme nasıl olacak? Metinde bilinçli olarak yer verilmedi.

---

## 4. Yayına almadan önce

- [ ] Avukat onayı (özellikle md.6.5 ve K-1 kararı)
- [ ] K-1 kararı verilir; (1) seçilirse kod işi yapılır ve metinler güncellenir
- [ ] `sozlesmeler/README.md` belge kayıt tablosuna md.6.5 işlenir
- [ ] Sürüm/yürürlük tarihi güncellenir, kullanıcıya md.15 uyarınca bildirim
- [ ] `npm run build:legal` yeniden çalıştırılır
- [ ] `wallet_cashout_enabled` ancak bundan sonra açılır

> **Not:** `wallet_cashout_enabled` şu an **KAPALI**. Çekim özelliği bu metinler
> yayınlanmadan açılmamalıdır — açılırsa sözleşmede tanımlanmamış bir hizmet
> sunulmuş olur.

---

## 5. S6 KARARI (28.07.2026) — Çekim lansmanda KAPALI

Ürün kararı: **Lansmanda para çekimi açılmayacak; cüzdan yalnızca iade kredisi
olarak çalışacak.** `wallet_cashout_enabled = false` kalır.

Bu karar metinlerle çelişiyordu: sözleşme, var olmayan bir hizmeti mevcut gibi
anlatıyordu. Üç kopyanın tamamına **yürürlük durumu** cümlesi eklendi:

| # | Dosya | Değişiklik |
|---|-------|-----------|
| 1 | `sozlesmeler/oyuncu/01-kullanim-sartlari.md` md.6.5.3 | Başına "Yürürlük durumu" paragrafı; ayrıca md.6.1, 6.4(b) ve 12.3'teki "çekebilir" cümleleri "özellik açıldığında" kaydıyla koşullandırıldı |
| 2 | `sozlesmeler/oyuncu/05-mesafeli-satis-iptal-iade.md` | Çekim maddelerinin başına lansman uyarısı |
| 3 | `views/LegalScreen.tsx` | Uygulama içi karşılıkları (md.6.5 özeti + iptal/iade özeti) |

### ⚠️ HUKUKÇUYA — bu kararın taşıdığı risk

Kullanıcının **kendi ödediği** para, iptal/iade sonucu cüzdana geçtiğinde
nakde dönüştürülemiyor. Bu, tüketicinin iade hakkı bakımından tartışmalıdır:

- İade "kesintisiz ve derhal" yapılmış sayılır mı, yoksa Platform içi harcamaya
  zorlanan bir alacak mı? (TKHK m.11 ve mesafeli satış mevzuatı)
- Özellikle **md.6.4 (tesis/OYNA kaynaklı iptal)** ve **md.12.3 (mücbir sebep)**
  hâllerinde kullanıcının hiçbir kusuru yok; bu tutarın nakde çevrilememesi
  daha yüksek risk taşır.

**Metne konan koruma:** md.6.5.3'e "Kullanıcı bakiyesinin iadesini her hâlde
talep edebilir" cümlesi eklendi ve md.6.5.7 (bakiye tükenmeden hesap kapatılamaz)
korundu. Yani sözleşme, otomatik çekim kanalı olmasa da **talep üzerine iade
yolunu açık bırakıyor.**

**Operasyonel karşılığı yapılmalı:** destek@oyna.app'e gelen "bakiyemi geri
istiyorum" taleplerini elle karşılayacak bir süreç tanımlanmadan lansmana
çıkılmamalı. Aksi hâlde metindeki taahhüt fiilen karşılıksız kalır.

- [ ] Avukat: S6 kararının tüketici mevzuatı bakımından savunulabilirliği
- [ ] Operasyon: elle iade süreci (talep kanalı, süre, kayıt) tanımlansın
