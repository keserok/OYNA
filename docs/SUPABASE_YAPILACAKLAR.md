# OYNA — Supabase Kesin Yapılacaklar Listesi

Karar tarihi: 2026-07-11. Kararlar: **bölge Frankfurt'a taşınacak** (kalıcı tercih),
**Pro sonra alınacak** (alındığı günün planı aşağıda), **PITR şimdilik yok** (yerine
günlük harici yedek katmanı), **ayrı staging projesi kurulacak**, **SMTP + custom
domain lansmana bırakıldı**.

Mevcut durum (2026-07-11): org "keremsplace" ücretsiz planda; proje `iikvzgyccvgcybzdfwlv`
Singapur'da (ap-southeast-1); DB 48MB, 31 kullanıcı, storage ~7MB; canlıda **13 aktif
pg_cron işi** (escrow salımı, maç yaşam döngüsü, hatırlatmalar) — proje uykuya dalarsa
bunlar durur. Migration geçmişi repo ile birebir senkron (241 dosya).

---

## A) ŞİMDİ — para gerektirmez, Pro beklemez

| # | İş | Sahibi | Not |
|---|---|---|---|
| A1 | **Sızdırılmış parola korumasını aç** | Sen (dashboard) | Authentication → Sign In / Providers → Password → "Prevent use of leaked passwords". 30 saniye. Hâlâ açılmadı. |
| A2 | **Staging projesi kur (Frankfurt'ta!)** | Birlikte | Ücretsiz planda 2 proje limiti dolu → INACTIVE "Hadi" projesi silinecek (onayınla). Yerine `oyna-staging` **eu-central-1**'de kurulur; repo'daki 241 migration sırayla uygulanır. Bu aynı zamanda **Frankfurt taşınmasının provasıdır** — migration zinciri boş DB'de sorunsuz koşuyor mu, ilk kez burada görürüz. |
| A3 | **Günlük harici yedek** | Birlikte | GitHub Action: her gece `pg_dump` → özel repo ya da ücretsiz S3-uyumlu depo (Backblaze/R2). PITR'sız senaryonun bel kemiği. Gerekli: DB bağlantı şifresi GitHub Secrets'a. |
| A4 | **Faz-2 SQL temizlikleri** | Ben | (1) ~25 public-rollü politikayı `TO authenticated`'a çek (misafir 42501 hataları), (2) `is_super_admin` çift imzasını birleştir, (3) kalan 16 çakışan permissive politika, (4) `texts_legacy`/`match_tactics_legacy` + `teams` prototip kolonlarını düşür. |
| A5 | **Edge function secret envanteri** | Sen + Ben | 11 fonksiyonun kullandığı anahtarların listesi (iyzico, push, e-posta). Hangileri test anahtarı, hangisi canlı — yazılı envanter. Taşınmada yeniden girilecekler. |
| A6 | **Restore tatbikatı** | Ben | A3'teki dump'tan staging'e geri yükleme denemesi. "Yedeğim var" ile "yedeğimden dönebiliyorum" arasındaki farkı kapatır. |
| A7 | **KVKK notu** | Sen | Aydınlatma metnine verinin yurtdışında (AB/Almanya) barındırıldığı ve açık rıza ifadesi eklensin. (Hukuki danışmanlık değildir; kontrol ettirin.) |

## B) FRANKFURT TAŞINMASI — Pro'dan önce ya da Pro ile aynı gün

Sıralı runbook (pilot küçükken toplam ~1-2 saatlik iş, kullanıcıya kesinti ~15-30 dk):

1. Staging (A2) sorunsuz kurulduysa migration zinciri kanıtlanmıştır.
2. Yeni canlı proje `oyna-prod` **eu-central-1**'de açılır (Pro alınacaksa o gün: önce org Pro'ya yükselt, sonra projeyi aç — proje limiti ve compute kredisi sorunsuz olur).
3. 241 migration + `cron.job` tanımları + storage bucket'ları uygulanır (hepsi repoda/dökümde).
4. Kısa bakım penceresi: eski projede yazma durdurulur → `pg_dump --data-only` + `auth.users` + storage objeleri taşınır.
5. Edge function'lar deploy edilir, secret'lar (A5 envanteri) girilir; iyzico webhook URL'i yeni projeye çevrilir.
6. Uygulama yapılandırması (`.env` / mobil build: SUPABASE_URL + anon key) güncellenir; OAuth (Google) redirect URI'ları yeni URL'e eklenir.
7. Duman testi: kayıt/giriş, rezervasyon, cüzdan, push. Eski proje 1 hafta "salt okunur yedek" olarak bekletilir, sonra kapatılır.

## C) PRO ALINDIĞI GÜN — sıralı kontrol listesi

1. Org → **Pro'ya yükselt** (~25$/ay + kullanım). **Spend cap: AÇIK** tut (sürpriz fatura önleyici; bilinçli aşana kadar).
2. Projenin **uykuya dalma davranışının kalktığını** doğrula (Pro'da proje pause olmaz → cron işleri güvende).
3. **Günlük yedeklerin** aktif olduğunu gör (Pro: 7 gün saklama). A3 harici dump'ı yine de KAPATMA — bağımsız ikinci kopya ucuz sigortadır.
4. Compute: **Micro yeterli** (48MB DB, pilot trafiği). Dashboard'da CPU/RAM grafiklerine bakıp gerekirse Small'a çık — önce ölç, sonra büyüt.
5. Staging projesi Pro org altında ayda ~10$ compute yakar — staging'i ücretsiz ayrı org'da tutmak meşru bir tasarruf; karar o gün verilir.
6. Auth rate limit'lerini gözden geçir (Pro'da özelleştirilebilir): OTP/parola sıfırlama deneme limitleri.
7. E-posta destek kanalını not al (Pro ile gelir) — taşınma günü bir şey ters giderse kullanılır.

## D) LANSMAN ÖNCESİ (kamuya açılmadan)

| # | İş | Tetik |
|---|---|---|
| D1 | **Özel SMTP** (Resend/Postmark): kayıt onayı + parola sıfırlama e-postaları | Lansman kararıyla; pilotta saatte 2-4 e-posta limitine takılırsanız öne çekilir |
| D2 | **Custom domain** (örn. `api.oyna.app`) — OAuth ekranında ve linklerde marka görünür | D1 ile birlikte |
| D3 | **PITR kararını yeniden aç** | iyzico CANLI anahtara geçip düzenli gerçek para aktığında (~100$/ay'dan başlar; RPO 24s → dakikalar) |
| D4 | Danışmanları (security+performance) yeniden koştur, sıfır WARN hedefle | Lansman haftası |
| D5 | Kullanılmayan indeks temizliği (şu an 51 "unused" — gerçek trafik verisiyle karar) | Lansmandan ~1 ay sonra |
| D6 | Auth MFA politikası: admin hesaplarına MFA zorunluluğu | Lansman haftası |

## E) SÜREKLİ DÜZEN (haftalık/aylık ritim)

- **Migration disiplini** (`supabase/README.md`): her şema değişikliği önce staging, sonra canlı; DB'nin verdiği version ile repoya commit. SQL Editor'den kayıt dışı DDL yasak.
- **Aylık**: danışman taraması + `pg_cron` işlerinin son çalışma loglarının kontrolü (`cron.job_run_details`).
- **Üç ayda bir**: yedekten geri dönme tatbikatı (A6'nın tekrarı).
- **Anahtar rotasyonu**: service_role anahtarı yalnız sunucu tarafında; sızma şüphesinde dashboard'dan rotate.
