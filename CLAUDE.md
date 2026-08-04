# CLAUDE.md — OYNA Oturum Kuralları

> Bu dosya, bu repoda çalışan HER Claude Code oturumunun uyması gereken kuralları tanımlar.
> Proje sahibi (kurucu) yazılımcı DEĞİLDİR ve uygulamayı bu oturumlarla geliştirmektedir.
> Bu yüzden buradaki iletişim ve güvenlik kuralları pazarlık konusu değildir.

## 1. Kullanıcıyla iletişim (en önemli kural)

- Kullanıcının kod geçmişi yok. Her açıklamayı **sade Türkçe** yaz. Teknik terim
  kaçınılmazsa ilk geçtiği yerde parantez içinde günlük dille açıkla —
  ör. "migration (veritabanı yapısını değiştiren kayıtlı adım)".
- Kod, dosya yolu, terminal çıktısı kanıt olarak gösterilebilir; ama anlatım asla
  bunlara dayanmamalı. Kullanıcı kod okumadan ne olduğunu anlayabilmeli.
- Her görevin SONUNDA şu sabit özeti ver:

  **📌 ÖZET**
  - **Ne değişti:** madde madde, sade dille
  - **Neden:** kullanıcının isteğiyle bağını kurarak
  - **Nasıl kontrol edersin:** uygulama içinde tıklama adımlarıyla
    ("şu ekranı aç → şuna bas → şunu görmelisin"). Terminal komutu YAZMA.
  - **Riskler & fark ettiklerim:** varsa; yoksa "yok" yaz
- Kullanıcıya soru sorarken seçenekleri sade dille sun. "RLS policy'yi güncelleyeyim mi?"
  değil; "Bu veriyi kimlerin görebileceği kuralını da güncellemem gerekiyor — onaylıyor musun?" gibi.

## 2. Kapsam disiplini (geçmişte sorun oldu)

- SADECE istenen görevi yap. Görevle ilgisiz dosyaya dokunma; "hazır girmişken"
  düzeltme, yeniden düzenleme (refactor), stil değişikliği yapma.
- Çalışırken başka bir sorun fark edersen: DÜZELTME. Özetin "fark ettiklerim"
  bölümünde sade dille listele; kullanıcı isterse ayrı görev olarak verir.
- Küçük değişiklik her zaman büyük değişikliğe tercih edilir.
- Görev metnindeki "DOKUNULMASIN" satırı kesin sınırdır.

## 3. Veritabanı uyumu (geçmişte sorun oldu — zorunlu adımlar)

- Bir tablonun/kolonun/RPC'nin (veritabanı fonksiyonu) var olduğunu ASLA varsayma.
  Dokunduğun her veri alanı için önce doğrula:
  1. Repoda: `supabase/migrations/` içinde ara.
  2. Canlıda: Supabase MCP araçları bağlıysa canlı şemadan doğrula
     (`list_tables` / salt-okunur sorgu). **Canlıyı OKUMAK her zaman serbesttir.**
- Repo ile canlı veritabanı arasında fark görürsen durumu sade dille bildir;
  `docs/master/MIGRATION_DRIFT_POLITIKASI.md` ve
  `docs/master/SUPABASE_MIGRATION_RECONCILIATION.md` kurallarını uygula.
- Şema değişikliği gerekiyorsa `supabase/migrations/` altına YENİ dosya ekle;
  eski migration dosyalarını asla değiştirme. Yeni tabloya mutlaka RLS
  (satır bazlı erişim kuralı) yaz; yetki desenleri için
  `docs/master/RPC_YETKI_ENVANTERI.md` dosyasına bak.
- **Canlı veritabanında DEĞİŞİKLİK (migration uygulamak, veri düzeltmek) için önce
  kullanıcıdan sade dille onay al. Onaysız canlı değişiklik yasaktır.**
  Kısaca: okumak serbest, yazmak onaya bağlı.

## 4. Regresyon önleme (geçmişte "çalışan yerler bozuldu")

- Ortak dosyalar geniş etki yaratır: `types.ts`, `store.ts`, `supabaseMutations.ts`,
  `services/*`, `components/*`. Bunları değiştirmeden önce kullanım yerlerini ara
  ve etkilenen ekranları belirle; özette say.
- Bitirmeden önce ZORUNLU kontroller:
  1. `npm run lint` (tip kontrolü) temiz olmalı.
  2. `npm run test:unit` yeşil olmalı.
  3. Dokunduğun akışla ilgili test varsa (`tests/` altına bak) onu da çalıştır.
- Kontroller geçmeden "bitti" deme. Kırılan test varsa gizleme; sade dille bildir.
- Uçtan uca doğrulama gerekiyorsa `/verify` skill'i uygulamayı canlı Supabase'e
  karşı Playwright ile sürebilir (bkz. `.claude/skills/verify`).
  Demo hesaplar: `docs/OYNA_DEMO_HESAPLARI.md`.

## 5. Yüksek riskli bölgeler — dokunmadan önce bildir + onay al

Görevin doğrudan parçası değilse şu alanlara girme; parçasıysa önce
"bu görev şu riskli alana dokunmayı gerektiriyor" diye sade dille bildirip onay al:

- **Para akışı:** ödeme, komisyon, iade, payout
  (`supabase/functions/` altındaki payment/capture/void/refund fonksiyonları,
  komisyon RPC'leri, `payment-webhook`)
- **Kimlik ve giriş:** `supabaseAuth.ts`, MFA, admin yetkileri
- **RLS politikaları** (verinin kimlere görüneceği kuralları)
- **Bildirim gönderimi** (yanlış giden toplu bildirim geri alınamaz)

## 6. Proje pusulası

- **Ürün ve sistem kararlarının tek kaynağı: `OYNA_PRENSIPLER.md`** (kök dizin).
  Karar gerektiren belirsizlikte ÖNCE buraya bak; çelişki varsa kullanıcıya sor.
  - Kanıtlar ve gerekçeler: `docs/board/DECISIONS.md` (K-1…K-17)
  - Ayrıntılı rol raporları: `docs/board/01-cpo.md` … `07-stratejik-danisman.md`
  - Açık kararlar: `docs/board/SON_KARARLAR.md`
  - ⛔ `OYNA_MASTER_PRENSIPLER.md` ve `docs/master/OYNA_MASTER.md` **ARŞİVDİR**,
    bağlayıcı değildir. Geçerlilik sırası: canlı sistem → `main` kodu →
    `OYNA_PRENSIPLER.md` → `DECISIONS.md`.
- Bilinen sorunlar ve çözüm geçmişi: `docs/master/PROBLEMLER_VE_COZUMLER.md` —
  aynı hata ikinci kez sıfırdan çözülmez.
- Operasyon ve panel soruları: `docs/master/RUNBOOK.md`.
- Git: doğrudan `main` dalına push etme; işler kendi dalında yapılır.
  Commit mesajları Türkçe ve açıklayıcı olur.

## 6.5 Mekanizma — değişiklikten ÖNCE çalıştır

Bu repoda kalıcı bir "bağışıklık sistemi" var: **17 yapı taşı, 32 kontrol.**
Sade anlatımı: `docs/sistem/MEKANIZMA.md`

**Kod ya da veritabanı değiştirmeden önce ZORUNLU:**

```
npm run etki          # hangi temel yapı taşlarına dokunuyorsun?
```

- 🔴 **KRİTİK** taşlara dokunuyorsan (PARA · KAPILAR · KİMLİK · AYARLAR · KURTARMA)
  komut **DUR** der. Sade dille bildir ve kullanıcıdan onay al (CLAUDE.md §5).
- Yeni bir dosya eklediysen `docs/sistem/YAPI-TASLARI.json` içinde bir yapı taşına
  bağla; bağlamazsan `npm run sistem:kapsam` seni uyarır.
- Haritada yazan bir dosyayı taşıdıysan/sildiysen **kapsam denetimi hata verir** —
  harita gerçekle bağını kaybetmiş demektir, düzelt.

**Diğer denetimler:**
```
npm run sistem:kapsam   # harita gerçeği yansıtıyor mu?
npm run sistem:surum    # sürüm numarası her yerde aynı mı?
npm run sistem:harita   # SISTEM-HARITASI.md'yi yeniden üret (elle düzenleme!)
```

**Altın kural (P-0):** Yeni bir koruma eklerken sor — *"peki bu koruma bozulursa
kim söyleyecek?"* Cevabı yoksa koruma yarım kurulmuştur.

## 7. Görev şablonu

Kullanıcı görevleri genellikle `GOREV_SABLONU.md` içindeki formatla verir
(GÖREV / NEREDE / ŞU AN NE OLUYOR / OLMASI GEREKEN / DOKUNULMASIN).
Şablonsuz gelen bir görev belirsizse, bu başlıklardaki eksik bilgiyi sade dille sor.
