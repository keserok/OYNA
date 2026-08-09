# CLAUDE.md — OYNA Pusulası

> **Amaç:** Bu dosya Claude'u kısıtlamak için değil, ilk dakikadan güçlü kılmak için var.
> Kurucu yazılımcı değildir; OYNA bu oturumlarla geliştirilir. Claude bu repoda tam
> yetkili geliştirici olarak çalışır: araştırır, önerir, yazar, test eder, bitirir.
> Fren yalnız §2'deki iki yerdedir. *(Kurucu kararı, 9 Ağustos 2026)*

## 1 · Proje tek bakışta

Halı saha rezervasyon platformu; ana vaat **kaptanın para toplama derdini bitirmek**.
React 19 · Vite · TypeScript · Capacitor 8 (iOS/Android) · Supabase (PostgreSQL 17 +
Edge Functions) · Zustand · Vitest + Playwright.

Durum: 🅿️ rafta (4 Ağustos 2026), lansman yapılmadı. Uyandırma kılavuzu: `RAF.md`.
Ürün ve sistem kararlarının tek kaynağı: `OYNA_PRENSIPLER.md`.

## 2 · Yalnız İKİ onay kapısı

Bunların dışında **her şey serbesttir**: kod yazmak, yeniden düzenlemek, migration
DOSYASI hazırlamak, test/doküman eklemek, küçük sorunları anında düzeltmek.
Onay istemek = tek cümlelik sade Türkçe soru; iş o ana kadar hazırlanabilir.

1. **Canlı veritabanına YAZMAK** — migration uygulamak, veri düzeltmek, ayar
   değiştirmek. Canlıda gerçek kişilerin verisi var; yanlış yazma geri alınamayabilir.
   Canlıyı **okumak her zaman serbesttir** (salt-okunur sorgu, tablo listesi, log).
2. **Para kurallarını değiştirmek** — ödeme, komisyon, iade, payout davranışını
   değiştiren kod veya ayar: `supabase/functions/` altındaki payment · capture ·
   void · refund · `payment-webhook` fonksiyonları, komisyon RPC'leri, ödeme modu
   ayarları.

## 3 · Çalışma tarzı

- **Küçükse düzelt, büyükse sor.** Yol üstünde görülen küçük, riski düşük sorunlar
  anında düzeltilir ve özette "bunu da düzelttim" diye bildirilir. Büyük ya da
  rizikolu olanlar önce sade dille sorulur.
- Aynı hata ikinci kez sıfırdan çözülmez: önce `docs/master/PROBLEMLER_VE_COZUMLER.md`.
- Ürün kararı gereken belirsizlikte önce `OYNA_PRENSIPLER.md`; çelişki varsa kurucuya sor.
- Geçerlilik sırası: canlı sistem → `main` kodu → `OYNA_PRENSIPLER.md` → `DECISIONS.md`.
  ⛔ `docs/eski/` arşivdir, bağlayıcı değildir.

## 4 · Kalite çıtası — "bozmadan ilerleme" güvencesi

Kod değişen her işte, bitti demeden önce:

```bash
npm run lint       # tip kontrolü — temiz olmalı
npm run test:unit  # 1.437 birim testi — hepsi yeşil
```

- Dokunulan akışın testi varsa (`tests/`) o da çalıştırılır; kırılan test gizlenmez,
  sade dille bildirilir.
- Uçtan uca kanıt gerekiyorsa `/verify` skill'i uygulamayı canlı Supabase'e karşı
  Playwright ile sürer. Demo hesaplar: `docs/OYNA_DEMO_HESAPLARI.md`.
- Kök dosyalar (`types.ts`, `store.ts`, `supabaseMutations.ts`, `supabaseAuth.ts`,
  `supabaseClient.ts`) geniş etki yaratır — değiştirmeden önce kullanım yerlerine
  bakılır, etkilenen ekranlar özette sayılır.

## 5 · Veritabanı pratiği

- Tablo/kolon/RPC varlığı varsayılmaz; `supabase/migrations/` + canlı okuma ile
  doğrulanır. (Okumak serbest — §2.)
- Şema değişikliği = `supabase/migrations/` altına **yeni** dosya. Uygulanmış
  migration değiştirilmez; depo-canlı mutabakatı bozulur.
  Kurallar: `docs/master/MIGRATION_DRIFT_POLITIKASI.md` ·
  `docs/master/SUPABASE_MIGRATION_RECONCILIATION.md`.
- Yeni tabloya mutlaka RLS (satır bazlı erişim kuralı) yazılır; yetki desenleri:
  `docs/master/RPC_YETKI_ENVANTERI.md`.
- Depo ile canlı arasında fark görülürse sade dille bildirilir.

## 6 · İletişim

- Kurucu kod okumaz: her açıklama **sade Türkçe**, teknik terim ilk geçtiği yerde
  günlük dille açıklanır — ör. "migration (veritabanı yapısını değiştiren kayıtlı
  adım)". Kod ve çıktılar yalnız kanıt olarak gösterilir.
- Biçim serbesttir — sabit şablon zorunlu değildir. Önemli olan: işin sonunda
  **ne değiştiğinin** ve **kurucunun bunu uygulamada nasıl görüp kontrol
  edeceğinin** net anlatılması.

## 7 · Depo haritası

| Ne | Nerede |
|---|---|
| Oyuncu arayüzü | `views/` · `components/` · `shared/` · `ui/` |
| Yönetici paneli | `admin-panel/` |
| İş mantığı | `services/` · `hooks/` · `utils/` |
| Veritabanı şeması (tek doğru kaynak) | `supabase/migrations/` (430+ dosya) |
| Edge Function'lar (ödeme · bildirim · süpürücü) | `supabase/functions/` |
| Testler | `tests/` |
| Yasal metin kaynağı | `sozlesmeler/` → `npm run build:legal` |
| Sistem haritası (yapı taşları, kontroller) | `docs/sistem/` |
| Operasyon / panel soruları | `docs/master/RUNBOOK.md` |

- 🔴 KRİTİK yapı taşları: **PARA · KAPILAR · KİMLİK · AYARLAR · KURTARMA**
  (`docs/sistem/YAPI-TASLARI.json`). Bunlara dokunmak işi durdurmaz; yalnız §2
  kapılarıyla kesişiyorsa onay istenir, kesişmiyorsa özette belirtilir.
- ⚠️ `npm run etki` ve `sistem:*` komutlarının script dosyaları (`scripts/sistem/`)
  depoda hiç olmadı — bu komutlar şu an **çalışmaz**. Harita `docs/sistem/`
  altından elle okunur. Scriptlerin yeniden yazılması ayrı bir görevdir.

## 8 · Git

- `main`'e doğrudan push edilmez; işler kendi dalında yapılır, birleştirme kurucu
  onayıyla olur.
- Commit mesajları Türkçe ve açıklayıcı yazılır.
