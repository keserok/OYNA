# Güvenlik / Mahremiyet Değerlendirme Notu — Anonim Veri Görünürlüğü

> **Durum:** Değerlendirme (öneri) · **Tarih:** 15.07.2026 · **Tür:** İç güvenlik/KVKK ölçülülük değerlendirmesi
> **İlişkili:** [Veri Paylaşım Protokolü](veri-paylasim-protokolu.md) Madde 4.2 ve 4.4.3.
>
> Bu bir **değerlendirme notudur**; içerdiği veritabanı (RLS) değişikliği önerileri üründe davranış değiştireceğinden, **uygulanmadan önce iş/ürün onayı** gerektirir. Bulgular, 15.07.2026 tarihinde canlı üretim veritabanındaki (`pg_policies` + tablo yetkileri) politikalar doğrudan sorgulanarak teyit edilmiştir.

---

## Özet

İki tablo grubu, **giriş yapmamış (anonim) kullanıcılar** dâhil herkese okunabilir durumda kişisel veri içermektedir:

- **(A) Maç kadrosu** — `matches.slots`: maça katılan oyuncuların **adı + avatarı + derecelendirmesi**.
- **(B) Sağlayıcı kataloğu** — `goalkeepers` / `referees`: onaylı kaleci/hakemlerin **adı, görseli, ve yaklaşık konumu (koordinatları)** dâhil ilan profili.

Her ikisi de kazara açık kalmış "delik" değil, ürünün **misafir gezinme** modelinin sonucudur; ancak her ikisinde de **kimlik/konum** ifşasının kapsamı, işlevin gerektirdiğinden geniştir (KVKK m.4 ölçülülük).

---

## Bulgu A — Anonim Maç Kadrosu Görünürlüğü

**Kanıt (canlı):**
- `matches` tablosunda `SELECT` yetkisi hem `{anon}` hem `{authenticated}` rollerine açıktır:
  - `matches_select_anon` (rol `{anon}`): `("isDemo" IS NOT TRUE) OR demo_mode_enabled`
  - `matches_select_auth` (rol `{authenticated}`): `… OR is_platform_admin()`
- `anon` rolü `matches` tablosunda `SELECT` yetkisine sahiptir (tablo grant'i doğrulandı).
- `matches.slots` (ve `away_slots`) JSON alanı, katılım anında oyuncuya ait **ad, avatar, derecelendirme, id** bilgisini taşır.

**Sonuç:** Gerçek (demo olmayan) bir maçın kadrosu — oyuncu adı ve avatarı dâhil — **tüm internete** okunabilir.

**Ürün bağlamı:** `components/common/SignupGate.tsx`, misafir yalnızca **yazma** eylemi (maça katılma, rezervasyon) denediğinde devreye girer; **okuma/gezinme serbesttir**. Maçların misafirlere görünmesi kasıtlıdır; ancak kadrodaki oyuncu **kimliğinin (ad+avatar)** kayıtsız kişilere açık olması gezinme işlevi için gerekli değildir.

---

## Bulgu B — Anonim Sağlayıcı (Kaleci/Hakem) Katalog Görünürlüğü

**Kanıt (canlı):**
- `goalkeepers_select_anon` ve `referees_select_anon` (rol `{anon}`): `verification_status = 'approved' AND (("isDemo" IS NOT TRUE) OR demo_mode_enabled)`.
- `anon` rolü her iki tabloda da `SELECT` yetkisine sahiptir (grant doğrulandı).
- Bu tablolar; sağlayıcının **adı, görseli/fotoğrafı, `coordinates {lat,lng}` (konum), yaşı, boyu, biyografisi, puanı, ücreti ve istatistikleri** gibi alanları içerir.

**Sonuç:** Onaylı her kaleci/hakem'in ilan profili — **yaklaşık konumu (koordinatları) dâhil** — tüm internete okunabilir.

**Asimetri (önemli):** `profiles` tablosu KVKK sertleştirmesiyle sahibine/yöneticiye kilitlenmiş ve kamuya yalnızca e-posta/telefon/konum **arındırılmış** bir görünüm (`public_profiles`) sunulmuşken; **aynı sertleştirme `goalkeepers`/`referees` kataloglarına uygulanmamıştır.** Dolayısıyla sağlayıcı konumu, oyuncu profillerinden farklı olarak hâlâ kamuya açıktır. Sağlayıcının onboarding sırasında verdiği KVKK onayı yalnızca *"iletişim ve lisans bilgilerinin doğrulama amacıyla işlenmesi"*ni kapsar; **fotoğraf/konumun kamuya yayımlanmasını açıkça kapsamaz** — bu, sağlayıcı tarafında bir aydınlatma boşluğudur.

---

## KVKK / Mahremiyet Değerlendirmesi

- **Ölçülülük (KVKK m.4):** Her iki bulguda da, hizmeti henüz kullanmayan (kayıtsız) kişilere ve arama motorlarına açık kimlik/konum ifşası, işlevin gerektirdiğinden geniştir.
- **Konum verisi (Bulgu B):** Bir gerçek kişinin (kaleci/hakem) yaklaşık konumunun kamuya açık olması, ad+avatardan daha hassas bir ifşadır ve öncelikli ele alınmalıdır.
- Aydınlatma ile bildirim (bkz. Veri Paylaşım Protokolü m.4.2, m.4.4.3, m.10) bu işlemenin **şeffaflığını** sağlar; ancak ifşanın **kapsamını daraltmaz.**

---

## Seçenekler

| # | Seçenek | Mahremiyet | Ürün etkisi | Uygulama |
|---|---|---|---|---|
| **A** | İlgili tablolarda anon `SELECT`'i tamamen kaldır (yalnızca `authenticated`) | En güçlü | **Misafir gezinmesini bozar** | Basit politika değişikliği; guest-browse modeliyle çelişir |
| **B** *(önerilen)* | Meta veri anon'a açık kalsın; **kimlik/konum anon'a maskelensin** (maç: `slots` ad/avatar; sağlayıcı: `coordinates` ve hassas alanlar); tam veri yalnızca kayıtlı kullanıcıya | Yüksek | Gezinme korunur; yalnızca kimlik/konum gizlenir | Anon'a arındırılmış alan döndüren kamuya açık görünüm (view) veya kolon maskeleme; küçük migration(lar) |
| **C** | Mevcut hâl korunsun; yalnızca Aydınlatma ile ifşa edilsin | En zayıf | Yok | Yok (yalnızca metin) |

---

## Öneri

**Seçenek B** (her iki bulgu için). Misafir gezinme deneyimi korunurken oyuncu kimliği ve sağlayıcı konumu kayıtsız kişilere/dizinlere kapatılır; bu, KVKK ölçülülük ilkesiyle en uyumlu ve ürün açısından en az sürtünmeli çözümdür. Somut uygulama:

1. **Bulgu B (öncelikli — konum):** `goalkeepers`/`referees` için `public_profiles` benzeri, `coordinates` ve diğer hassas alanları **anon'a vermeyen** kamuya açık bir görünüm; ham katalog satırının `SELECT`'ini `authenticated`'a bırakmak. (İstemcinin "X km yakında" hesabı, kaba/yuvarlanmış mesafe döndüren bir sunucu fonksiyonuyla korunabilir.)
2. **Bulgu A (kadro):** Anon'a `slots` içindeki ad/avatarı vermeyen; yalnızca doluluk sayısı + maç meta verisi döndüren kamuya açık görünüm.

Her iki adım da bir **migration** ve kısa doğrulama gerektirir; üründe davranış değiştireceğinden **uygulanması iş/ürün onayına bağlıdır.** Onay verilirse OYNA ekibi tarafından ayrı bir teknik iş kalemi olarak ele alınabilir.

---

## Kapsam Notu

- Kayıtlı kullanıcılar arasında maç kadrosunun ve sağlayıcı ilanının görünür olması ürünün doğal işlevidir ve bu notun konusu değildir; not yalnızca **anonim (kayıtsız)** görünürlüğü ele alır.
- `pitch_ratings` tablosu da kamuya açıktır; ancak yalnızca kullanıcı kimliği (UUID) + puan/yorum içerir (ad/avatar içermez), bu nedenle burada ayrıca ele alınmamıştır — istenirse benzer bir değerlendirme yapılabilir.
