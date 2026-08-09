# Saha Sahibi Paneli — Menü Cilası Tasarım Kararları

**Tarih:** 9 Ağustos 2026 · **Karar sahibi:** kurucu (8 soru, soru-cevap turu)
**Durum:** ✅ KURULDU (9 Ağu 2026) — 1.740 test yeşil, 7 yeni bekçi testi
**Hedef:** Menü ekranını kusursuz bir B2B SaaS ayar sayfası standardına getirmek.

## Kurucu kararları

| # | Konu | Karar |
|---|---|---|
| 1 | Görsel kimlik | **Sade & kurumsal:** tek renk (monokrom) ikonlar — 36px yumuşak kutuda, oyuncu Ayarlar ekranıyla aynı desen; renk yalnız uyarıda (kırmızı/sarı) |
| 2 | Üst işletme kartı | **Dördü birden:** tesis fotoğrafı geniş kapak + yayın durumu hapı (Yayında/Kapalı) + kurulum eksiği uyarısı (dokununca ilgili ekrana) + bugünün özeti (rezervasyon/doluluk tek satır) |
| 3 | Bölüm düzeni | **İş sıklığına göre:** Operasyon (Müşteri Defteri · Maçlar · Sahalarım) → Kurulum (Tesis Ayarları · Çalışma Saatleri) → Finans → Uygulama |
| 4 | Kilitli satırlar | **Gizleme yerine rozet:** yetkisi olmayana soluk satır + "Yalnız sahip"/"Yalnız yönetim" hapı; dokununca tek cümlelik açıklama. Yetki sistemi (guard'lar) AYNEN kalır — yalnız görünüm değişir |
| 5 | Satır açıklamaları | **Yalnız gerekli olanlarda** ikinci satır (adı kendini anlatan satırlar tek satır kalır) |
| 6 | Rozet biçimi | **Hap:** renkli yumuşak zemin + metin; gidiş okuyla YAN YANA (rozet oku yutmaz) |
| 7 | Alt bölüm | **SaaS düzeni:** Destek → Uygulama bölümüne satır; Çıkış → en altta ince çerçeveli ayrı "Hesap" bloğu ("Çıkış Yap"). Ölü "Dil" satırı kaldırılır |
| 8 | Dokunuş hissi | **Hafif titreşim açık** (Capacitor Haptics) + görsel basılma efekti + 48px dokunma yüksekliği |

## Kurulum notları
- `MenuRow`: ikon kutusu + başlık + opsiyonel açıklama + hap rozet + ok; `disabled`
  yerine `locked` durumu (soluk + rozet + dokununca sade uyarı).
- Bugünün özeti verisi: `OwnerMenuStats`'a bugünkü rezervasyon sayısı eklenir
  (mevcut yükleme yolundan; ekstra sorgu maliyeti küçük).
- Titreşim: `@capacitor/haptics` — tarayıcıda sessizce atlanır.
- Kanıt kapısı: tsc + birim testleri (ayarlarDuzeni benzeri bekçi testi) +
  dar ekran taşma kontrolü.
