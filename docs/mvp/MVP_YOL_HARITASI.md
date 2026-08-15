# OYNA MVP — Adım Adım Yol Haritası

> Kaynak kararlar: `docs/mvp/MVP_KARARLAR.md` (K-01…K-40).
> Bu dosya **ne yapacağımızı sırayla** anlatır. Her adımın sonunda net bir "bitti" ölçütü vardır.
> Kurucunun elle yapması gereken adımlar **[SEN]**, benim yapacaklarım **[BEN]** ile işaretlidir.

## Neden bu sıra?

Bir üründen parça çıkarmak, sıfırdan yazmaktan risklidir: kalan parçalar çıkarılanlara sessizce bağlıdır.
Bu yüzden sıra şudur: **önce temiz zemin (veritabanı), sonra temiz kabuk (repo), sonra cerrahi, en sonda yeni özellikler.**
Cerrahiyi yeni özelliklerin önüne koyuyoruz; çünkü yeni özelliği kirli zemine yazarsak iki kez yazarız.

---

## FAZ 0 — Karar ve tasarım kilidi (bu oturum)

| Adım | Kim | Çıktı |
|---|---|---|
| 0.1 | [BEN] | Kod tabanı + canlı DB keşfi — **tamamlandı** |
| 0.2 | [SEN] | Tur 1 sorularının cevapları — **tamamlandı** (`MVP_KARARLAR.md`) |
| 0.3 | [BEN] | Tur 2 soruları: maç modeli, antrenman slotu, fiyat, yaş kapıları, panel kapsamı |
| 0.4 | [SEN] | Tur 2 cevapları |
| 0.5 | [BEN] | **Ekran ekran MVP tanımı** + veritabanı "kalır/çıkar" listesi + kabul ölçütleri |
| 0.6 | [SEN] | Tanımın onayı → kod yazımı başlar |

**Bitti ölçütü:** Hiçbir "acaba nasıl olacak" kalmamış olmalı. Yazarken karar vermeyeceğiz.

---

## FAZ 1 — Yeni veritabanı (temiz zemin)

| Adım | Kim | İş |
|---|---|---|
| 1.1 | [SEN] | Yeni Supabase projesi: **eu-central-1**, ad önerisi `oyna-mvp`. Bana project ref'i ver. |
| 1.2 | [SEN] | Mevcut projenin tam yedeği (`veri_disari_aktar()` + Supabase dashboard yedeği) — güvenlik ağı. |
| 1.3 | [BEN] | Canlı şemayı çıkar → MVP-dışı nesneleri ayıkla → **tek `0001_temel_sema` migration**'ı yaz. |
| 1.4 | [BEN] | Eklentiler (btree_gist, pgcrypto, uuid-ossp, pg_cron, pg_net, cube+earthdistance, pg_trgm), RLS matrisi, GRANT'lar. |
| 1.5 | [BEN] | Storage bucket'ları (`images` public, gerekiyorsa `provider-docs`) + politikaları. |
| 1.6 | [BEN] | Cron işleri (MVP'de gereken ~6 tanesi) + gerekiyorsa vault sırları. |
| 1.7 | [SEN] | İlk SUPER_ADMIN hesabını aç (bootstrap SQL'ini ben hazırlayacağım, sen çalıştıracaksın). |
| 1.8 | [BEN] | Edge function'lar: ödeme (iyzico), e-posta, admin — yeni projeye deploy. |
| 1.9 | [SEN] | Secret'lar: iyzico sandbox anahtarları, Resend, admin secret'ları. |
| 1.10 | [BEN] | **Doğrulama:** sıfırdan replay + Bekçi Denetimi + RLS taraması yeşil. |

**Bitti ölçütü:** Boş ama eksiksiz bir veritabanı; tek migration'dan sıfırdan kurulabiliyor; hiçbir MVP-dışı tablo/fonksiyon yok.

---

## FAZ 2 — Yeni repo (temiz kabuk)

| Adım | Kim | İş |
|---|---|---|
| 2.1 | [SEN] | Yeni GitHub reposu aç (ad önerisi: `oyna-mvp` veya `oyna`), bana erişim ver. |
| 2.2 | [BEN] | Mevcut kodu yeni repoya taşı; **MVP-dışı dosyaları hiç getirme** (silmek değil, baştan almamak). |
| 2.3 | [BEN] | Gömülü tuzakları temizle: eski Supabase URL/anon key fallback'i, `?demo=1` arka kapısı, demo hesapları, `oyna.app` sabitleri → env. |
| 2.4 | [BEN] | Kırık script'leri temizle, `package.json` sadeleştir, CLAUDE.md + prensipleri yeniden yaz. |
| 2.5 | [BEN] | Migration disiplinini kur: immutability CI, playbook, Bekçi Denetimi. |
| 2.6 | [SEN] | Yeni Vercel projesi + Supabase GitHub App bağlantısı; env değişkenleri. |
| 2.7 | [BEN] | İlk deploy: boş ama çalışan uygulama yeni DB'ye bağlı, giriş yapılabiliyor. |

**Bitti ölçütü:** Yeni repo → yeni Vercel → yeni Supabase zinciri uçtan uca çalışıyor; kayıt olup giriş yapabiliyoruz.

---

## FAZ 3 — Cerrahi (çıkarma işi)

Sıra önemli: **önce en derin bağımlılık (cüzdan), sonra yüzeyler.**

| Adım | İş | Risk |
|---|---|---|
| 3.1 | Cüzdanı çıkar: ekranlar, kartlar, `allowBalance`, bakiye çağrıları. Ödeme yolunu tam-kart'a sabitle. | Yüksek — iade akışı buna bağlı |
| 3.2 | **Karta iade** entegrasyonunu yaz (iyzico refund) + iade kademelerini sunucuda yeniden kur. | Yüksek — kodda hiç yok |
| 3.3 | Kaleci/hakem pazaryerini çıkar: Marketplace, ServiceDashboard/Application/Profile/Settings, escrow, no-show, teminat. | Orta |
| 3.4 | Oyuncu tarafı maç kurmayı kapat (RPC yetkisi + ekran). | Orta — lobi kaptan mantığı etkilenir |
| 3.5 | Kapsam dışı modülleri hiç getirme: topluluk, turnuva, promosyon, SaaS, ölçüm hunisi, godview demo. | Düşük |
| 3.6 | Ana sayfa + alt bar yeniden düzeni. | Düşük |
| 3.7 | Testleri buda ve yeşile al. | Orta |

**Bitti ölçütü:** Uygulama çıkarılan hiçbir şeye atıfta bulunmuyor; ölü buton, boş ekran, kırık rota yok.

---

## FAZ 4 — Yeni özellikler (ekleme işi)

| Adım | İş |
|---|---|
| 4.1 | **Saha sahibi maç oluşturma**: yeni RPC (yetki: sahip + müdür) + owner panel ekranı. Saha rezervasyonu ve çakışma kilidi dahil. |
| 4.2 | **Saha sahibi başına komisyon/ücret**: admin panelde yönetim + fiyat hesabına katman. |
| 4.3 | **Uygulamadan kiralanabilir saat açma**: sahip panelinde saat açma/kapama + oyuncu tarafında yalnız açık saatlerin görünmesi. |
| 4.4 | **Antrenman slotu**: "Antrenman Oyuncusu Kuralları" (sahip) + oyuncu tarafında satın alma akışı + ortak kullanım onayı. |
| 4.5 | **Yaş kademeleri**: doğum tarihi, veli onayı, 14-16 / 16-18 kuralları ve maç katılım kapıları. |
| 4.6 | **Kaleci/hakem admin ataması + ücretin ödeme ekranında görünmesi.** |
| 4.7 | **Kaleci/hakem başvuru toplama** yüzeyi (aktivasyon sonraya). |

**Bitti ölçütü:** Her yeni özellik hem sunucuda hem arayüzde çalışıyor ve testi var.

---

## FAZ 5 — Kalite, hukuk, lansman

| Adım | Kim | İş |
|---|---|---|
| 5.1 | [BEN] | Uçtan uca duman testi: kayıt → maç bul → slot al → kart öde → bilet → iptal → iade. |
| 5.2 | [BEN] | Saha sahibi ve admin senaryolarının uçtan uca testi. |
| 5.3 | [SEN] | iyzico sandbox → gerçek kart testi → canlı anahtar başvurusu. |
| 5.4 | [SEN+BEN] | Hukuk seti: sözleşmelerin cüzdansız/iade-karta/antrenman-slotu haline göre yeniden yazımı. |
| 5.5 | [SEN] | Mağaza hazırlığı: Apple Developer, Google Play, APNs/FCM, uygulama görselleri. |
| 5.6 | [BEN] | Mobil derleme (Capacitor) + mağaza yüklemesi hazırlığı. |
| 5.7 | [SEN] | Pilot sahalarla anlaşma (İstanbul), saha/kort/tarife girişleri. |
| 5.8 | — | **Lansman.** |

---

## Şu an nerede olduğumuz

**FAZ 0, adım 0.3** — Tur 2 sorularını hazırlıyorum. Cevaplarını alınca 0.5'e (ekran ekran MVP tanımı) geçeceğim.
