# 04 · SÖZLEŞME DİZİNİ

> 19 yasal belge; hangisi neyi yönetir, kaynağı nerede, kullanıcı nerede görür,
> hangisi hâlâ avukat onayı bekliyor.
>
> **Tüm belgelerin son güncellemesi: 24.08.2026**

---

## Zincir — bir metin nasıl yayına çıkar

```
sozlesmeler/**/*.md          ← KAYNAK. Yalnız burası elle düzenlenir.
        │
        ├─ npm run build:legal
        │      ├→ OYNA/public/*.html          (uygulamanın yasal sayfaları)
        │      └→ shared/legalDocsRol.ts      (rol sözleşmeleri, uygulama içi)
        │
        └─ oyna-site: node scripts/yasal-esitle.mjs
               └→ oyna-site/yasal/*.html      (web sitesi)
```

⚠️ Üretilen dosyaları **elle düzenleme** — bir sonraki üretimde silinir.
Üç istisna elle tutulur: `public/gizlilik.html`, `public/cerez-politikasi.html`,
`public/hesap-silme.html`.

⚠️ `shared/legalDocs.ts` de **elle tutulur** ve kaynak markdown'ların bir
özetini taşır. Bir maddeyi değiştirirken **ikisini birden** güncelle — ayrışırsa
kullanıcı kayıt ekranında bir şey, yasal ekranda başka bir şey okur.

Tarih tek kaynaktan gelir: `shared/legalVersion.ts`. Depodaki hijyen testi,
markdown içindeki «Son güncelleme» tarihiyle bu sabitin ayrışmasını yakalar.

---

## Oyuncu sözleşmeleri — herkese gösterilir

| # | Belge | Neyi yönetir | Durum |
|---|---|---|---|
| 01 | Kullanım Şartları | Hizmetin kuralları, ödeme, sorumluluk | Yayında |
| 02 | Gizlilik Politikası | Hangi veri, ne için, ne kadar süre | Yayında |
| 03 | KVKK Aydınlatma Metni | Kanunun zorunlu kıldığı bilgilendirme | Yayında |
| 04 | KVKK Açık Rıza Metni | Onay alınan işlemler | Yürürlükte |
| 05 | Mesafeli Satış · İptal/İade | İptal kademeleri ve iade | Yayında |
| 06 | Çerez Politikası | Çerez ve benzer teknolojiler | Yayında |
| 07 | Hesap Silme Bilgilendirmesi | Silme nasıl işler, 7 gün | Yayında |
| 08 | Veli Muvafakatnamesi | 13–17 yaş için veli onayı | Yürürlükte |
| 09 | Topluluk Kuralları | Davranış kuralları, yaptırım | Yayında |

**Kayıt ekranında onaylatılan üç belge:** KVKK Aydınlatma · Gizlilik · Kullanım
Şartları. Kutu işaretsiz doğar (opt-in). 25 Ağustos 2026'dan beri onay
sunucuya da yazılıyor (`user_consents`) — sürüm, IP ve tarayıcı bilgisiyle.
KVKK'da **açık rızanın ispat yükü veri sorumlusundadır**; bu kayıt o yükün
karşılığıdır.

## Rol sözleşmeleri — uygulama içinde «örnek» damgasıyla

| Belge | Kim için | Durum |
|---|---|---|
| Kaleci/Hakem Hizmet Sözleşmesi | Sağlayıcılar | **Taslak** — imza öncesi avukat onayı şart |
| İşletme (Tesis) B2B Sözleşmesi | Saha sahipleri | **Taslak** — aynı |

Uygulamada **«⚠️ BU METİN BİLGİ AMAÇLI ÖRNEKTİR — BAĞLAYICI DEĞİLDİR»** damgasıyla
gösterilir. Damga metnin İÇİNE, ilk satıra yazılır: ayrı bir arayüz öğesi olsaydı
belge başka bir yerde gösterildiğinde damga arkada kalırdı.

İçlerinde doldurulmamış alanlar var: `[AD SOYAD]`, `[IBAN]`, `[TİCARET SİCİL NO]`
ve B2B'de komisyon oranlarında `[X]`.

## Kurumsal ve iç belgeler — yayınlanmaz

| Belge | Konu |
|---|---|
| `kurumsal/01-verbis-etbis-uyum-degerlendirmesi.md` | VERBİS ve ETBİS kayıt yükümlülüğü |
| `tedarikci/01-veri-isleyen-envanteri-ve-yurtdisi-aktarim.md` | Veri işleyenler, yurt dışı aktarım |
| `veri-paylasim-protokolu.md` | Taraflar arası veri paylaşımı |
| `guvenlik-notu-anon-veri-gorunurlugu.md` | Anonim kullanıcıya görünen veri |
| `00-k1-cuzdan-iade-hukukcu-notu.md` | Cüzdan/iade hukuk notu |
| `00-yapilacaklar-uyum-yol-haritasi.md` | Uyum yol haritası |
| `ic-notlar/ACIK-KONULAR.md` | Açık hukuki sorular |

⚠️ Bunlar **şirketin kendi notlarıdır ve yayınlanmaz.** Üretim betiği `>` ile
başlayan blokları, öncesinde `<!-- YAYINLA -->` işareti yoksa atar. Ayrıca
"Durum:", "Uygulandığı yer:" gibi iz metinleri çıktıya sızarsa **üretim durur**.

---

## Metnin gerçeği anlatması — 24 Ağustos denetiminde çıkanlar

Yasal metin ile ürünün yaptığı ayrışırsa bu yalnız hukuki risk değil, mağaza
riskidir (Guideline 2.3 — doğru bilgi). Denetimde dördü birden bulundu ve
düzeltildi:

| Metin ne diyordu | Gerçek | Nasıl çözüldü |
|---|---|---|
| «Ödemeler iyzico üzerinden gerçekleştirilir» | Sağlayıcı `SIMULATION` | Ara not: altyapı canlıya alınana kadar TEST modu, tahsilat yok |
| «OYNA cüzdanına iade edilir» | Cüzdan kalıcı kapalı | «Ödemenin yapıldığı karta iade» |
| Bir madde «tamamı iade», diğeri «işlem bedeli düşülür» | `card_fee_pct = 0` | Tek model: **kesinti yok** |
| «Son güncelleme 15.07.2026» | Metinler 17/19/22/24 Ağustos'ta değişti | 24.08.2026 |

**Kural:** bir sözleşme maddesini değiştirmeden önce ürünün o konuda ne yaptığına
bak. Ürünü değiştirdiğinde de sözleşmeye dön. İkisi ayrıştığı gün, hangisinin
yalan söylediği fark etmez — ikisi de sana döner.

---

## Kalan hukuki işler

- Rol sözleşmelerinin **avukat onayı** (imza öncesi zorunlu)
- Köşeli parantezli alanların doldurulması
- **VERBİS** kaydı — `kurumsal/01`'e bak
- **ETBİS** kaydı — aynı belge
- Yurt dışına veri aktarımı: veriler Singapur'da. KVKK m.9 açısından açık rıza
  ya da Kurul'a bildirilen standart sözleşme gerekir. **Frankfurt'a taşımak bu
  yükümlülüğü tek başına kaldırmaz** — her ikisi de "yurt dışı"dır.
