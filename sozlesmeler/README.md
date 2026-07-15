# OYNA — Sözleşmeler ve Yasal Belgeler

Bu klasör, OYNA'nın tüm sözleşme ve yasal metinlerinin **okunabilir, kanonik** kopyalarını tutar. Uygulama içinde (`views/LegalScreen.tsx`) ve public web sayfalarında (`public/*.html`) görünen metinler buradaki içerikle **aynı olmalıdır** — biri güncellenince diğeri de güncellenir. Bu klasörün amacı: avukat/mali müşavir incelemesi, kayıt tutma ve gelecekteki değişikliklerin tek yerden takip edilebilmesi.

Her yeni sözleşme/politika hazırlandığında buraya, açık bir dosya adıyla eklenir.

## Durum Tablosu

| # | Belge | Durum | Uygulandığı yer(ler) | PR |
|---|---|---|---|---|
| 1 | [Kullanım Şartları](oyuncu/01-kullanim-sartlari.md) | ✅ Yayında — madde 4 veli-onay akışı kodda **inşa edildi** (onboarding + veli onayı sistemi) | `LegalScreen.tsx → TERMS` | — |
| 2 | [Gizlilik Politikası](oyuncu/02-gizlilik-politikasi.md) | ✅ Yayında | `LegalScreen.tsx → PRIVACY`, `public/gizlilik.html` | #74 |
| 3 | [KVKK Aydınlatma Metni](oyuncu/03-kvkk-aydinlatma-metni.md) | ✅ Yayında | `LegalScreen.tsx → KVKK` | #74 |
| 4 | [KVKK Açık Rıza Metni](oyuncu/04-kvkk-acik-riza-metni.md) | ✅ Yayında | `LegalScreen.tsx → RIZA` | #75 |
| 5 | [Mesafeli Satış ve İptal/İade Koşulları](oyuncu/05-mesafeli-satis-iptal-iade.md) | ✅ Yayında | `LegalScreen.tsx → SALES` | #74 |
| 6 | [Çerez Politikası](oyuncu/06-cerez-politikasi.md) | ✅ Yayında | `LegalScreen.tsx → CEREZ`, `public/cerez-politikasi.html` | #76 |
| 7 | [Hesap Silme Bilgilendirmesi](oyuncu/07-hesap-silme-bilgilendirmesi.md) | ✅ Yayında | `public/hesap-silme.html` | — |
| 8 | [İşletme (Saha Sahibi) B2B Sözleşmesi](saha-sahibi/01-isletme-b2b-sozlesmesi.md) | 📝 Taslak tamamlandı — adversarial hukuki inceleme geçti (henüz onboarding kabul ekranına bağlanmadı) | Onboarding/başvuru süreci (bağlanacak) | — |
| 9 | [Kaleci/Hakem Hizmet Sağlayıcı Sözleşmesi](kaleci-hakem/01-hizmet-saglayici-sozlesmesi.md) | 📝 Taslak tamamlandı — adversarial hukuki inceleme geçti (%15 komisyon oranı iş kararı onayı bekliyor; henüz başvuru kabul ekranına bağlanmadı) | Hizmet sağlayıcı başvuru süreci (bağlanacak) | — |
| 10 | [Veli Muvafakatnamesi](oyuncu/08-veli-muvafakatnamesi.md) | ✅ Yürürlükte — Uygulamada fiilen alınıyor (guardian_consents + veli onayı ekranı) | `GuardianConsentForm.tsx`, `LegalScreen.tsx → VELI` | — |
| 11 | [Topluluk Kuralları ve Kullanıcı Davranış Kuralları](oyuncu/09-topluluk-kurallari.md) | ✅ Yayında — 6 temel kural + hukuki derinleştirilmiş metin (ToS md.7 eki) | `LegalScreen.tsx → TOPLULUK` | — |

Henüz hazırlanmamış belgeler (tedarikçi sözleşmeleri, kurumsal belgeler vb.) için bkz. [uyum takip paneli](https://claude.ai/code/artifact/9b1e3654-7871-4bc1-b6b8-6d83c5ad0982) — hazırlandıkça ilgili alt klasörle birlikte buraya eklenecekler.

## Sıradaki teknik adımlar

1. **Madde 4 "sınırlı mod" / veli onayı akışı (Kullanım Şartları):** ✅ **Tamamlandı** — onboarding'de yaş aralığı, sınırlı mod, çocuğun Veli Bağlantı Kodu, velinin kendi hesabından kod + kimlik + muvafakat onayı, T.C. hash, 18 yaşında otomatik açılma ve `payment_intents` ödeme kapısı inşa edildi.
2. **B2B sözleşme kabul ekranları:** Saha Sahibi ve Kaleci/Hakem sözleşmeleri, ilgili onboarding/başvuru akışlarında (`PartnerOnboarding.tsx` ve hizmet sağlayıcı başvuru ekranı) bir kabul adımına henüz bağlanmadı.
3. **Kaleci/Hakem komisyon oranı (%15):** Sözleşme taslağında iş kararı olarak işaretlenmiştir; şirket tarafından onaylanmalı veya değiştirilmelidir.

## Klasör Planı

```
sozlesmeler/
  README.md                      — bu dosya, durum tablosu
  oyuncu/                        — oyuncuya yönelik belgeler (hazır)
  saha-sahibi/                   — işletme/saha sahibi sözleşmesi (taslak tamamlandı)
  kaleci-hakem/                  — hizmet sağlayıcı sözleşmesi (taslak tamamlandı)
  tedarikci/                     — iyzico, Supabase, Sentry/PostHog vb. (sırada)
  kurumsal/                      — şirket/marka ile ilgili belgeler (sırada)
```

## Veri Sorumlusu / Sözleşme Tarafı

**Miraç Kerem Çürüksulu (OYNA)** — şahıs şirketi
Kartal Vergi Dairesi – 2650883645
Cevizli Mahallesi, Zuhal Caddesi, Ritim İstanbul A Ticari Blok No:46 Daire:50 (Mükellef Teknoloji A.Ş. bünyesinde), Kartal/İstanbul
destek@oyna.app

> Bu belgeler bir yapay zekâ tarafından koda dayanarak hazırlanmıştır; hukuki danışmanlık yerine geçmez. Yayına almadan önce KVKK/vergi/şirketler hukuku kalemlerinde lisanslı bir avukat/mali müşavir onayı alınmalıdır.
