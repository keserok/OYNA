# OYNA — Sosyal Bölüm Yeniden Tasarımı · FOUNDATION SPEC v1.0

> **Bu belge nedir?** Sosyal bölümün (Arkadaşlar + Takımlar + Taktik Stüdyo entegrasyonu)
> yeniden tasarımı için 16 bölümde (A–P) sorulan 100 sorunun **onaylanmış kararlarının**
> tek kanonik kaynağı. Uygulama (kod) bu belgeye göre yazılır; çelişki durumunda bu belge kazanır.
> Kararlar ürün sahibi ile 2026-07 tarihli tasarım oturumunda tek tek onaylanmıştır.
> Tüm bulgular canlı kod ve canlı Supabase şeması üzerinde doğrulanmıştır.

---

## 1. Vizyon & Tasarım Anayasası

**His:** Sade modern sosyal. Listeler temiz ve taranabilir; zenginlik detay ekranlarında.
Keyif renk bombardımanından değil **mikro-etkileşimden** gelir (haptik, yay animasyonları,
iskelet yüklemeler, tatmin edici başarı durumları).

**Beş omurga ilkesi** (her yeni karar bunlarla test edilir):

| # | İlke | Anlamı |
|---|---|---|
| 1 | **Tek makine** | Aynı iş için ikinci sistem yazılmaz (tekil maç daveti = 1 kişilik liste daveti; arama gizlilik kuralları her yerde aynı RPC) |
| 2 | **Bildirim omurgası** | Her sosyal olay sunucuda bildirim üretir; canlılık (refresh) bu kanaldan beslenir |
| 3 | **Açık kimlik** | Ekranlar arası bağlam her zaman açık taşınır (`selectedTeamId`, `studioContext`, `socialTarget`); "listedeki ilk öğe" varsayımı yasak |
| 4 | **Sunucu otoritesi** | Yazımlar SECURITY DEFINER RPC'lerden; status/yetki/limit asla istemcide belirlenmez |
| 5 | **Dürüst veri** | Sahte/uydurma metrik gösterilmez; yanıltıcı gösterge ya düzeltilir ya silinir |

**Renk anayasası:**
- `#39FF14` (neon, `--color-primary`) = **yalnız etkileşim**: birincil buton, aktif durum, kritik vurgu. Cimrice.
- **Takım renkleri** (`color1/color2`) = **kimlik**: arma, kart şeridi, degrade, form noktaları.
- **Nötr koyular** (`#0A0E14` zemin, cam yüzeyler) = yüzey.
- `--color-on-primary: #0A0E14` (neon buton üstünde siyah metin — kontrast).
- Sosyal'deki emerald (`#10B981`) ve `#070B10` zemin **tamamen kaldırılır**.

**Etkileşim kuralları:** Ekran başına görünür **tek birincil buton** · yıkıcı işlemler onay
diyaloğu, geri-alınabilir işlemler onaysız + geri-al toast · min 44px dokunma hedefi ·
`prefers-reduced-motion` desteği · tüm geçişler `components/common/motion.ts` sabitlerinden.

---

## 2. Bilgi Mimarisi & Navigasyon

### 2.1 Yapı

```
Alt-nav "Sosyal" (merkez FAB)
└─ Sosyal
   ├─ [Arkadaşlar]  [Takımlar]        ← üst seviye: altı çizgili sekme
   │   Arkadaşlar: İstekler bloğu → liste çipleri → arkadaş listesi
   └─ Takımlar (VARSAYILAN):
       ╭ Tüm Takımlar │ ● Takımlarım │ + Takım Oluştur ╮   ← hap (segmented) kontrol
       (varsayılan alt-sekme: ortadaki Takımlarım)
```

- **Açılış:** Sosyal'e girişte `Takımlar → Takımlarım`. Oturum içinde son sekme hatırlanır;
  uygulama yeniden açılınca Takımlarım'a sıfırlanır. Alt-nav'a basış navigasyon geçmişini sıfırlar (mevcut davranış korunur).
- **Alt sekme geçişi dokunmayla** (kaydırma yok — form/tahta jestleriyle çakışır).
- Ekran birleştirme: `SocialView` Takımlar sekmesi + `TeamPanelView` + `MyTeam` →
  **Takımlarım listesi + tek birleşik Takım Detayı**. `TeamCreator` rotası silinir.

### 2.2 Navigasyon yükü alanları (store)

| Alan | Tip | Kullanım |
|---|---|---|
| `socialTarget` | `{tab, subTab, entityId?} \| null` | Bildirim/derin bağlantı → doğru Sosyal alt-sekmesi |
| `selectedTeamId` | `string \| null` | Takım Detayı hangi takımı gösterecek (index-0 varsayımı ölür) |
| `studioContext` | `{teamId?, tacticId?} \| null` | Stüdyo'ya takım/taktik bağlamı (`activeStudioTeam` ölür) |

### 2.3 Derin bağlantı şeması (kanonik)

```
oyna://match/{id}            → maç lobisi (mevcut)
oyna://team/{id}             → Takım Detayı (id artık taşınır — mevcut id-düşürme hatası düzelir)
oyna://team/{id}/chat        → takım sohbeti
oyna://team/{id}/members     → Kadro → Bekleyenler
oyna://tactic/{id}           → Stüdyo, studioContext ile hidrate
oyna://social/{tab}/{subTab} → socialTarget ile doğru sekme
Web: oyna.app/davet/{referral_code} · oyna.app/takim/{invite_token} · oyna.app/t/{share_token}
```

---

## 3. Ekran Spesifikasyonları

### 3.1 Arkadaşlar sekmesi

```
Arkadaşlar (başlık)                                  [+]   ← tek aksiyon: Arkadaş Ekle sayfası
┌ İSTEKLER · 3 ─────────────────────────┐   (istek yoksa blok tamamen gizli)
│ [Gelen (2)] [Gönderilen (1)]          │
│ Gelen:  [✕ Reddet]   [Kabul Et ●neon] │   5+ istekte "Tümünü Kabul Et" kısayolu
│ Gönderilen:            [Geri Çek]      │
└────────────────────────────────────────┘
[Tümü][★ Favoriler][⚽ Halı Saha][İş]…[+ Yeni]        ← kullanıcı listeleri (çip)
   (liste çipi seçiliyken altta bağlamsal bar: [⚽ Listeyi Maça Çağır])
┌ arkadaş kartı ─────────────────────────┐
│ 🧑● Ahmet Kara ★              [💬]     │   ● çevrimiçi noktası · ★ favori · TEK buton
│    KL · 3 maç birlikte                  │   tek bilgi satırı
└─────────────────────────────────────────┘
Sıralama sabit: çevrimiçi → favori → son etkileşim. Tek atış yükleme (≤500).
```

- Üstteki küçük arama yalnız **mevcut arkadaşlarda** filtreler; yeni kişi arama `+` sayfasında.
- Liste çipine **uzun bas** → Yeniden adlandır · Üyeleri düzenle · Sil.

### 3.2 Arkadaş Ekle sayfası (tam ekran, `+`'dan)

```
‹ Geri            Arkadaş Ekle
╔ 🔍 OYNA-ID veya isimle ara… ╗      ← KAHRAMAN: büyük arama, otomatik odak
Senin ID'in: @keser  [Kopyala][Paylaş]
— yazınca: sonuçlar (durum-farkındalı buton: Ekle / Gönderildi ✓→Geri Al / Arkadaşsınız / Kabul Et)
— boşken:
  [📇 Rehberini Bağla]  [⬛ QR Tara / Göster]     ← 2 büyük kart
  BİRLİKTE OYNADIKLARIN  (maç geçmişinden, satır başına [+ Ekle])
  · Tanıyor olabilirsin (7) ›                      ← KÜÇÜK satır (öne çıkmaz)
```

- Sonuç kartı: avatar · isim · @id · pozisyon rozeti · "N ortak arkadaş / N maç birlikte". Sayfalı (20).
- **Rehber senkronu:** cihazda E.164 normalize + **düz SHA-256** (pepper iddiası yok — dürüst model),
  500'lük partiler, delta senkron. `match_contacts` eşleşenleri döndürür (eşleşmeyen hash **saklanmaz**).
  OYNA'da olmayanlar → **cihazın kendi SMS/paylaşım sayfasıyla** `oyna.app/davet/{code}` daveti
  (ham numara sunucuya **asla** gitmez). Kayıtta atıf → davet edene bildirim + öneri.
- **Karşılıklı istek = otomatik arkadaşlık** (A→B beklerken B→A atarsa kabul sayılır).
- Bağlamsal ekleme: oyuncunun göründüğü her yerde `UserPreviewSheet` → tek buton.

### 3.3 Arkadaş Profili (bottom sheet — karta dokununca)

```
🧑 Ahmet Kara @ahmetk ● Şimdi aktif     (FIFA-lite: pozisyon+OVR rozeti)
[ %68 Galibiyet | 24 Maç | 3 Birlikte ]  Form: ●●○●●  Ortak arkadaş: 5
▸ Birlikte oynadığınız maçlar (3)
⚽ "Perş 21:00 · Yıldız HS maçında" [Sen de Katıl]   ← herkese açık yaklaşan maçı varsa
[⚽ MAÇA ÇAĞIR ●neon birincil]
[💬 Mesaj] [★ Favori] [👥 Listelere ekle]        [⋯] → Çıkar · Engelle · Şikâyet et
```

- **Maça Çağır:** yaklaşan boş-slotlu maç seçici → `send_match_invite` (mevcut RPC). Maç yoksa → [Maç Kur] ön-tohumlu.
- Çıkar/Engelle → onay diyaloğu; Favori/Liste → geri-al toast.
- Oyuncu-vs-oyuncu H2H: **v2**.

### 3.4 ⚽ Listeyi Maça Çağır (FCFS sistemi)

**Kural: rezervasyon YOK — ödeme anı = katılım anı** (`player_buy_slots`'un `FOR UPDATE` +
OPEN kontrolü + transaction-içi cüzdan tahsilatı ilk-ödeyen-kazanır'ı DB seviyesinde garanti eder).

- **Giriş 1:** Sosyal → liste çipi → [⚽ Listeyi Maça Çağır] → "Hangi maça?" sayfası (yaklaşan maçlar + boş slot sayısı).
- **Giriş 2:** Top Oyna maç lobisi → [👥 Davet Et] → sekmeler: [Arkadaşlar] [Listelerim].
- Onay ekranı: *"Halı Saha Tayfası (12 kişi) davet edilecek · 3 boş slot · ilk ödeyen katılır."*
- Davetli: push → lobi (davet banner'ı) → boş slot → **[Öde ve Katıl · ₺150]**.
- Slot dolduysa: "Bu slot az önce doldu" → kalan slotlar / **[Yedek Kadroya Gir]** (`join_public_match_reserve` mevcut).
- Bakiye yetersiz → yükleme → tekrar dene (bu sırada slot dolabilir — baştan açıkça yazılır).
- Davet eden paneli (lobide): "4 katıldı · 2 ret · 6 bekliyor" (canlı). Katılan başına `match_invite_joined` bildirimi.
- Ret sessizdir (tek tek "reddetti" bildirimi yok, yalnız sayaç). Maç iptali → mevcut iade motoru.
- Koruma: parti başına maks 50 davet, günlük kota, engelli çift asla, `UNIQUE(match_id, invited_id)`.

### 3.5 Takımlar — Tüm Takımlar (keşif)

```
[🔍 Takım ara…]
[📍 Ordu ▾][Format ▾][⚡ Oyuncu Arıyor]
┌▌🛡️ Yıldızlar SK  ORDU · 7v7 · 14/20 · %68 G · ●●○●● · ⚡  [İstek ›]┐
```

- Herkese açık takımlar; **şehir-öncelikli**, aktivite-sıralı, `normalize_tr`+trgm isim araması, keyset sayfalı (20).
- Arşiv/demo **her zaman hariç**. Dolu takım: "Kadro dolu · 20/20" rozeti (istek butonu yok).
- **Katılım her zaman istek → kaptan onayı** (otomatik katılım yok). İstek opsiyonel mesajlı (≤200).
- Meydan okuma (⚔️ Maça Davet Et): **v2** — vitrinde yuvası ayrılır.

### 3.6 Takım Vitrini (üye olmayan görünümü — aynı rota, farklı render)

Arma+renk kahraman alanı · isim/şehir/format · G-B-M + form · üye sayısı (birkaç avatar; **tam kadro gizli**) ·
ev sahası · oyun stili rozeti · "Aranızdaki maçlar: 2G·1B·1M" (varsa) · **[Katılma İsteği Gönder]**.
**Taktikler vitrine asla sızmaz.**

### 3.7 Takımlarım

```
Davetlerin (2) ›                    ← bekleyen üyelik daveti varsa ince şerit
KAPTANLIKLARIM                      ← uzun-bas sürükle-sırala (bölüm içi)
┌▌🛡️ Yıldızlar SK          ●●○●●┐
│▌  12G 3B 5M · 14 oyuncu        │
│▌ ⚽ Perş 21:00 · Yıldız HS ⏱2g │  ← GERÇEK sıradaki maç (yoksa: "Maç planla ›")
└─────────────────────────────────┘
ÜYELİKLERİM ...
▸ Arşiv (1)                         ← kaptan 30 gün içinde geri açabilir
```

- Kart kimliği: sol takım-rengi şeridi + arma degradesi + takım-renkli form noktaları ("yapı sade, kimlik zengin").
- Sıra `team_members.sort_order`'da kalıcı. Boş durum: **[Takım Kur]** (birincil) + **[Takımları Keşfet]**.
- Dokunuş → **Takım Detayı** (`selectedTeamId`).

### 3.8 Takım Detayı (birleşik — 4 sekme; başlıkta 💬 takım sohbeti)

| Sekme | İçerik |
|---|---|
| **Genel** | Gerçek sıradaki-maç kartı (geri sayım) · form şeridi · mini istatistik · hızlı aksiyonlar: `⚽ Maç Kur` `👥 Davet Et` `📋 Taktik Stüdyo` · yeni takımda "Sıradaki adımlar" listesi |
| **Kadro** | En üstte **Bekleyenler** (katılma istekleri + giden davetler) · üye listesi: avatar · isim · forma no · pozisyon · rol rozeti · yönetim aksiyonları (yetki matrisine göre) |
| **Taktik** | Takım taktik vitrini: aktif taktik + onaylılar + öneriler; **salt-okunur mini saha önizlemeleri** + `Stüdyo'da Aç ›` · oylama/yorum/favori (mevcut sosyal RPC'ler) |
| **Maçlar** | Dikey zaman akışı: Yaklaşan (+`📋 Taktik Ata` yönetici aksiyonu) → Geçmiş (ay gruplu) · **skor onayı gömülü**: `Skoru Gir` → öneri → `3/7 onayladı` + `Onayla` · altta detaylı istatistik bloğu |

- `⚽ Maç Kur`: mevcut maç kurma akışı `homeTeamId` + ev sahası + format ön-tohumlu açılır.
- Ayarlar (yönetici): KİMLİK (isim·kısa ad·arma üreteci·renkler) / YAPI (format 3v3–11v11 değiştirilebilir · şehir · ev sahası) /
  GÖRÜNÜRLÜK (Açık/Gizli · ⚡Arıyor · davet linki aç-kapa-yenile) / KİŞİLİK (oyun stili) /
  ⚠️ TEHLİKELİ BÖLGE (kaptanlığı devret · takımı dağıt — yalnız kaptan).
- Format değişiminde taktikler **kendi boyunu korur** (format rozeti); yenileri yeni formatı varsayar.

### 3.9 Takım Oluştur (sekme — 4 adım, taslak kalıcı, canlı kart önizlemesi üstte)

```
① Kimlik    isim* · kısa ad (otomatik) · şehir* (yapısal seçici) · format* (3v3–11v11, "5+1" dilinde)
② Arma&Renk arma üreteci + renkler (aşağıda) · 🎲 Rastgele
③ Kuruluş   görünürlük (vars. PUBLIC) · ⚡arıyor (vars. açık) · kurucu davetler (arkadaş/listelerden)
④ Önizleme  canlı takım kartı → [Takımı Kur]
→ ~1.2sn konfeti + arma açılışı → Detay·Genel + "Sıradaki adımlar"
```

- **Arma üreteci:** ŞEKİL(8: kalkan klasik/modern·yuvarlak·altıgen·rozet·elmas·pankart·daire-yıldız) ×
  DESEN(10: düz·dikey çubuk·yatay şerit·dikey yarım·çapraz kuşak·çeyrek·şevron·ışın·çerçeve·iç daire) ×
  SEMBOL(24+: kartal·aslan·kurt·boğa·at·yıldız·şimşek·alev·taç·kılıç·top·kale·dağ·dalga…) × takım renkleri.
  SVG — her boyutta keskin, depolama = JSON. Görsel yükleme alternatifi kalır.
  `crest` tek model: `{type:'GENERATED', shape, pattern, symbol}` | `{type:'IMAGE', url}` — tek `TeamCrest` bileşeni çizer.
- **Renkler:** ~24 küratörlü forma rengi + hazır uyumlu ikililer şeridi + "Özel" seçici.
  Kanonik yalnız `color1/color2` hex. **Kontrast bekçisi** (yakın renkte uyarı+öneri).
- **Kurucu kadro = gerçek davet:** `create_team` RPC tek transaction'da takım + kaptan üyeliği + davet yayılımı.
  Hayalet-roster JSONB yazımı ölür. Silinen alanlar: takım değeri; oyun stili ayarlara taşınır.
- `format` = takımın özelliği; **dizilim = taktiğin özelliği** (yalnız Stüdyo). `team.format`,
  Stüdyo'nun formasyon sözlüğünü (`utils/formations.ts`) otomatik seçer.

### 3.10 Mesajlar (birleşik gelen kutusu)

- Tek liste: DM'ler + **takım sohbetleri** (takım satırında avatar yerine arma). 1:1 makinesi değişmez.
- Takım sohbeti: grup okundu-çentiği yok; okunmamış sayacı `last_read_at`'ten; **takım-başına Sessize Al**.
- Moderasyon: gönderen kendi mesajını, yöneticiler herkesinkini silebilir; düzenleme yok.
- **DM kapısı:** `_are_friends OR _share_active_team` (engel mutlak — blok her şeyi keser).
- Taktik paylaşımı: takım sohbetine **zengin kart** (dokununca salt-okunur Stüdyo) ·
  `share_token` linki `oyna.app/t/{token}` (yazar açar/kapar/yeniler) · **PNG dışa aktarma**
  (SVG→canvas: takım renkleri+arma+diziliş+OYNA imzası) + Capacitor Share.

### 3.11 Stüdyo entegrasyonu (özet akış)

```
Takım Detayı ─{teamId}──────────► STÜDYO ─ get_team_squad ─► canlı kadro tahtada
Taktik kartı ─{teamId,tacticId}─► STÜDYO ─ tam hidrasyon ──► incele/onayla/düzenle
STÜDYO ─ save_team_tactic ─► status SUNUCUDA ─► bildirim ─► Taktik sekmesi
Maçlar ─ 📋 Taktik Ata ─► match_tactics ─► lobi salt-okunur önizleme (atanan > is_active)
```

- Genel girişte (Dashboard vb.) bağlam boş → kişisel mod + Stüdyo-içi takım seçici.
- Kadro taşarsa → otomatik yedek kulübesi (pozisyon-uyumlu); eksikse → **dürüst boş slot** (+ ile ekle); sahte dolgu yasak.
- Jeton = `user_id` referansı + kayıt-anı isim yedeği; ayrılan üye → gri "ayrıldı" + "yerine ata" önerisi.
- Kayıt hedefleri: **Takıma Kaydet** (rol akışı) / **Kişisel Kütüphanem** (`teamId=null`). Serbest `teamName` alanı ölür.
- Düzenleme hakkı: `PENDING` = yalnız yazar · `APPROVED` = yazar + yöneticiler · Kopyala herkese.
- İnceleme: öneri tam hidrate + Stüdyo-içi şerit "📋 Ahmet'in önerisi [✓ Onayla][✕ Reddet]".
- Ret naziktir: nötr bildirim + taktik yazarın kişisel kütüphanesine otomatik kopyalanır.
- Store'un doğrudan-yazım katmanı (`proposeTactic/approveTactic/rejectTactic/updateTacticSlots`) ve
  MyTeam'in yerel sürükle tahtası **silinir** — tek editör Stüdyo, tek yaşam döngüsü RPC.

### 3.12 Ayarlar → Gizlilik

`Beni aramalarda göster` · `Telefonumla bulunabileyim` · `Çevrimiçi durumumu göster`
(**karşılıklı**: kapatan başkasınınkini de göremez — sunucuda zorlanır) · **Engellenenler** listesi (Engeli Kaldır).

---

## 4. Tasarım Sistemi & Bileşen Kiti

```
components/ui/      Avatar(baş harf+● yuvası+boyutlar) · SegmentedTabs · UnderlineTabs
                    BottomSheet · ConfirmDialog · EmptyState · SkeletonList · Chip
components/social/  TeamCrest (crest jsonb → SVG/IMG, tek çizici) · FormBadge(●●○●●)
                    StatPill · FriendCard · TeamCard · UserPreviewSheet
                    TacticPreview (salt-okunur mini saha) · TacticExportCard (PNG)
```

- Üç kopyalı yardımcılar (`Avatar`/`getInitials`/renk haritaları — SocialView·MessagesView·MyTeam) silinir.
- Üç takım-renk paleti tek kaynağa iner; takım renkleri karta CSS değişkeni akar (`--team-c1/--team-c2`).
- Hareket yalnız `common/motion.ts`'ten; `prefers-reduced-motion` + 44px hedef **kit seviyesinde** zorlanır.

---

## 5. Veri Modeli & Migration Planı

> Strateji: **genişlet → daralt** (expand→contract). Aşama 0-1 kırıcı değil; Aşama 2 ancak kod
> geçişi canlıda doğrulandıktan sonra. Kapanışta Supabase advisors (güvenlik+performans) taraması.
> Not: `friendships` canlıda **boş (0 satır)** — yeniden kurulum sıfır-riskli (doğrulandı).
> `pgcrypto` ve `pg_cron` kurulu; `pg_trgm` + `unaccent` etkinleştirilecek.

### Aşama 0 — Taban kaydı
Canlı şemadan üretilen `CREATE TABLE IF NOT EXISTS` baseline migration'ı (çekirdek tablolar
nihayet repo'da; temiz kurulum = üretim).

### Aşama 1 — Yeni yapılar (özet DDL)

```sql
-- ARKADAŞLIK (yeniden kurulum)
friendships (id PK, requester_id NOT NULL→profiles CASCADE, addressee_id NOT NULL→profiles CASCADE,
  status CHECK(PENDING/ACCEPTED/REJECTED) default PENDING, created_at, updated_at, responded_at,
  CHECK (requester_id<>addressee_id));
UNIQUE INDEX (least(requester_id,addressee_id), greatest(requester_id,addressee_id));  -- kanonik çift
INDEX (addressee_id,status); INDEX (requester_id,status);
-- RLS: SELECT katılımcı; INSERT/UPDATE/DELETE iptal → yalnız RPC.

friend_lists (id PK, owner_id→profiles CASCADE, name, emoji, sort_order, created_at,
  UNIQUE(owner_id, lower(name)));
friend_list_members (list_id→friend_lists CASCADE, member_id→profiles CASCADE, PK(list_id,member_id));
friend_prefs (owner_id, friend_id, is_favorite bool, PK(owner_id,friend_id));

-- REHBER & REFERANS (gizlilik-öncelikli)
profile_contact_hash (user_id PK→profiles CASCADE, phone_sha256 UNIQUE, updated_at);
  -- profiles.phone'dan trigger; RLS deny-all (yalnız RPC okur)
referral_codes (user_id PK→profiles CASCADE, code UNIQUE);
referral_attributions (inviter_id→profiles, invited_id→profiles, created_at);

-- PROFİL EKLERİ
profiles += is_searchable bool default true, discoverable_by_phone bool default true,
            show_online_status bool default true;
-- oyna_id: kayıtta otomatik üretim + mevcut kullanıcılara backfill;
-- UNIQUE(lower(oyna_id)); format ^[a-z0-9_]{3,20}$; normalize_tr(text) fn + pg_trgm GIN indexleri.

-- TAKIM
teams += format text CHECK ('3v3','4v4','5v5','6v6','7v7','8v8','9v9','10v10','11v11'),
         visibility text CHECK('PUBLIC','PRIVATE') default 'PUBLIC',
         is_recruiting bool default true, city text, draws int default 0,
         invite_token uuid NULL, crest jsonb;   -- eski ikon/görsel temsilleri eşlenir
team_members += role text CHECK('CAPTAIN','ADMIN','MEMBER') default 'MEMBER',
         jersey_number int, position text, joined_at, sort_order int;
UNIQUE INDEX (team_id) WHERE role='CAPTAIN';   UNIQUE (team_id, jersey_number);

team_join_requests (id PK, team_id CASCADE, user_id CASCADE, message ≤200,
  status CHECK(PENDING/APPROVED/REJECTED/CANCELLED), created_at, responded_at, responded_by,
  UNIQUE(team_id,user_id) WHERE status='PENDING');
team_invites (id PK, team_id CASCADE, inviter_id, invited_id,
  status CHECK(PENDING/ACCEPTED/DECLINED/CANCELLED/EXPIRED), created_at, responded_at,
  UNIQUE(team_id,invited_id) WHERE status='PENDING');   -- 14 gün ömür (pg_cron)

-- MAÇ-SOSYAL
match_list_invites (id PK, match_id CASCADE, inviter_id, invited_id, list_id→friend_lists SET NULL,
  status CHECK(PENDING/JOINED/DECLINED/EXPIRED), created_at, responded_at, UNIQUE(match_id,invited_id));
match_tactics (match_id PK→matches CASCADE, tactic_id→tactics CASCADE, assigned_by, assigned_at);

-- SOHBET
team_messages (id PK, team_id CASCADE, sender_id, body ≤2000, created_at);  -- RLS: _is_team_member
team_chat_reads (team_id, user_id, last_read_at, muted bool default false, PK(team_id,user_id));

-- TAKTİK
tactics += share_token uuid NULL;
tactics: slots/subs/opponents/drawings TEXT → jsonb (USING ::jsonb + dizi CHECK'leri);

-- ORTAK
config tablosu (limit/kota değerleri — koda gömülmez);
RLS yeniden yazımı: teams SELECT = is_public OR üye OR admin; tek hakem _is_team_admin (role kolonundan);
tactics UPDATE = (PENDING∧yazar) OR (APPROVED∧(yazar∨yönetici)).
Realtime yayınına ek: team_messages. (friendships eklenmez — canlılık bildirim kanalından.)
```

### Aşama 2 — Enkaz temizliği (kod geçişi doğrulandıktan sonra)

`teams`: `captain`, `captains[]`, `captain_id`(→role'e devir), `colors[]`, `value`, `level`,
`roster`, `players`, `logo_url`, `location`(→city), `matchHistory`(geçmiş hep `matches`'ten), `winRate`.
`tactics`: serbest `teamName`, miras `votes` jsonb. `friendships`: taraf-bazlı grup/favori kolonları (yenide yok).
RLS'teki kullanıcı-yolu hard DELETE kapatılır (dağıtma=arşiv; hard delete yalnız admin panel).

### Tip birleşmeleri
`TacticToken { ref?: userId, name, role, rating, jersey?, isCustom?, isOpponent? }` — iki `Player` tipi birleşir,
`as any` köprüleri silinir. `SquadSize` SSOT = `utils/formations.ts` (3v3–11v11).
CamelCase miras kolonlar (`"teamId"` vb.) kalır; **tüm yeni tablolar snake_case**.

---

## 6. RPC Kataloğu (tamamı SECURITY DEFINER, search_path kilitli)

| RPC | Kurallar |
|---|---|
| `send_friend_request(target)` | self/banned/blocked reddi · mevcut çift akıllı (gelen bekleyen→otomatik kabul; REJECTED'ı reddeden başlatıyorsa yön çevrilip PENDING, reddedilene 72s cooldown) · günlük 20 · bekleyen giden ≤50 · `friend_request` bildirimi (tekilleştirilmiş) |
| `respond_friend_request(id, accept)` | yalnız addressee · yalnız PENDING · kabul→`friend_accepted` + matches_together backfill · ret→sessiz |
| `cancel_friend_request(id)` | yalnız requester · satır silinir + alıcıdaki okunmamış bildirim silinir |
| `remove_friend(other)` | yalnız ACCEPTED · satır + prefs + liste üyelikleri temizlenir |
| `get_friends()` | tek atış: profil join + presence (karşılıklı görünürlük kuralı: kapatan göremez) + favori/liste + matches_together |
| `search_users(q, limit)` | normalize_tr · self/banned/blocked/`is_searchable=false` hariç · ilişki durumu işaretli · sayfalı |
| `match_contacts(hashes[])` | hash→profil · blocked/self/`discoverable_by_phone=false` hariç · günlük hash kotası · eşleşmeyen saklanmaz |
| `get_recent_teammates(limit)` | ortak tamamlanmış maçlardan, ilişki durumu işaretli |
| `invite_list_to_match(match_id, list_id)` | çağıran maç katılımcısı/kurucusu · üye/engelli/yasaklı/davetli atlanır · `send_match_invite` döngüsü · ≤50/parti + günlük kota |
| `respond_match_list_invite(id, decline)` | sessiz ret (yalnız sayaç) |
| `player_buy_slots` *(genişletme)* | başarılı katılımda PENDING davet→JOINED + `match_invite_joined` |
| `create_team(payload)` | tek transaction: takım + kaptan `team_members` + kurucu davet yayılımı · limit kontrolleri |
| `list_public_teams(q, city, format, recruiting, cursor)` | PUBLIC + arşiv/demo hariç · şehir-öncelikli · keyset |
| `request_to_join_team(team_id, msg?)` | PUBLIC∧recruiting∧<20 üye · üye/yasaklı/engel kontrol · bekleyen ≤10 · cooldown · yöneticilere bildirim |
| `respond_join_request(id, approve)` | yönetici · onay→üyelik+`team_join_approved` · ret→nazik `team_join_rejected` |
| `invite_to_team / respond_team_invite / join_by_invite_token` | K68 kuralları · kadro tavanı 20 · 14 gün ömür |
| `remove_team_member / set_member_role / transfer_captaincy / leave_team / disband_team / restore_team` | yetki matrisi · kaptan ayrılığında zorunlu halef seçimi (sessiz oto-devir ölür) · dağıtma=arşiv+30g geri-al · çıkarılana nötr bildirim |
| `update_team_settings` *(genişletme)* | + format/city/visibility/is_recruiting/play_style/crest jsonb |
| `get_my_teams()` | takımlar + myRole + sıradaki maç + istatistik özeti tek atışta (N+1 ölür) |
| `get_team_squad(team_id)` | team_members ⋈ profiles (isim·avatar·pozisyon·forma·puan) · üye-korumalı |
| `get_team_public_profile(team_id \| token)` | vitrin alanları + H2H satırı · taktik/kadro sızdırmaz |
| `save_team_tactic(team_id, tactic_id?, payload)` | üyelik doğrulanır · status sunucuda: yönetici→APPROVED, üye→PENDING+bildirim |
| `approve_tactic / reject_tactic` | yönetici · ret→nazik bildirim + yazara kişisel kopya |
| `assign_match_tactic(match_id, tactic_id)` | yönetici · yalnız APPROVED takım taktiği |
| `get_tactic_by_share_token(token)` | salt-okunur · yazar token'ı açar/kapar/yeniler |
| `update_tactic_priorities` | yönetici (store doğrudan yazımı ölür) |
| Mesaj: `get_or_create_conversation` *(genişletme)* | `_are_friends OR _share_active_team` · engel mutlak |
| `send_team_message / mark_team_chat_read / set_team_chat_muted` | üye-korumalı · push mute'a tabi |

**Heartbeat:** istemci ön planda ~2,5 dk'da bir + dönüşte `last_active_at` yazar (arka planda durur). Presence kanalı v2.
**pg_cron işleri:** REJECTED arkadaşlık >90g temizliği · takım davet/maç davet süre dolumu.

---

## 7. Bildirim Taksonomisi

Kutu = **olaylar**; sohbet (DM+takım) = **yalnız push+rozet, kutuya satır yazmaz** (mevcut
`new_message` satır ekleme davranışı kaldırılır). Tek kaynak DB gelen kutusu; store'un paralel
toast listesi + ikinci sayaç silinir (toast = realtime INSERT'te salt gösterim). Kategori çiplerine "Sosyal" eklenir.

| type_key | Alıcı | Aksiyon | deep_link |
|---|---|:-:|---|
| `friend_request` | hedef | ✅ | social/friends/requests |
| `friend_accepted` | istekçi | — | profil |
| `match_invite` *(var)* / `match_invite_joined` | davetli / davet eden | ✅ / — | maç |
| `team_member_invite` / `team_invite_accepted` | davetli / davet eden | ✅ / — | takım |
| `team_join_request` | yöneticiler | ✅ | team/{id}/members |
| `team_join_approved` / `team_join_rejected` | istekçi | — (ret nazik) | takım / — |
| `team_member_removed` / `team_captain_transferred` | ilgili | — (nötr) | — / takım |
| `tactic_proposed` | yöneticiler | ✅ | tactic/{id} |
| `tactic_approved` / `tactic_rejected` | yazar | — | tactic / — |
| `match_tactic_assigned` | takım üyeleri | — | maç |

**Tercihler (push'u susturur, kutu her zaman alır — sosyalde zorunlu kilit yok):**
Arkadaşlık · Takım davet/istek · Taktik · Maç davetleri · Mesajlar (DM) · Takım sohbeti (+takım-başına Sessize Al).

---

## 8. Limitler (config tablosunda — kod değişmeden ayarlanır)

| Limit | Değer |
|---|---|
| Arkadaşlık isteği | 20/gün · bekleyen giden ≤50 · ret cooldown 72s |
| Arkadaş listeleri | ≤20 liste · ad 1–30 · liste-üyelik çoklu |
| Takım | kullanıcı ≤5 üyelik, ≤3 kaptanlık · **kadro tavanı 20 (tüm formatlar)** |
| Takım katılma isteği | bekleyen ≤10 · ret cooldown |
| Davetler | takım daveti 14 gün ömür · liste-maç daveti ≤50/parti |
| Rehber | hash kotası/gün · parti 500 |

---

## 9. Uygulama Sırası

| Küme | Kapsam | Bağımlılık |
|---|---|---|
| **0 — Temel** | Tasarım token hizalama (emerald ölür) · bileşen kiti · navigasyon kabuğu (2 sekme + 3 hap + `socialTarget/selectedTeamId/studioContext`) · Aşama 0-1 migration + config + `oyna_id` backfill | — |
| **1 — Arkadaşlar** | Arkadaşlık RPC'leri + istekler UI · Arkadaş Ekle sayfası (arama/QR/rehber/referans) · profil sheet + Maça Çağır · listeler · engel/şikâyet · heartbeat + bildirim-güdümlü tazeleme | 0 |
| **2 — Takımlar** | store tekleşme + `get_my_teams` · Takımlarım + Takım Detayı birleşik · dizin + görünürlük + katılma istekleri · sihirbaz + arma üreteci · rol migration + davet makinesi · ayarlar · maç akışı + skor yüzeyi · **⚽ liste→maç FCFS** | 0, listeler için 1 |
| **3 — Stüdyo köprüsü** | `studioContext` · `get_team_squad` · `save_team_tactic` + yaşam döngüsü tekleşme · hidrasyon/inceleme · `match_tactics` · yerel editör ölümü | 2 |
| **4 — Mesaj & Bildirim** | takım sohbeti + birleşik kutu · taksonomi + tercihleri · derin bağlantı düzeltmeleri · taktik paylaşımı (kart/link/PNG) | 2, taktik kartı için 3 |
| **Kapanış** | Aşama 2 daraltma migration'ı + advisors taraması | hepsi |

---

## 10. V2 Backlog (bilinçli ertelenenler — kancaları hazır)

Gerçek Presence kanalı & "yazıyor…" & "şu an maçta" durumu · oyuncu-vs-oyuncu H2H ·
takım rating/seviye (Elo-tarzı) + dizin filtresi · başarım rozetleri (veri birikiyor) ·
takıma meydan okuma (⚔️ vitrin yuvası hazır) · maç günü otomatik dizilim (match_tactics + jeton-ref hazır) ·
müsaitlik anketleri · takvim görünümü · kartlı ödeme için kısa slot-hold · uygulama-içi çapraz-takım taktik paylaşımı.

## 11. Silinenler listesi (kod ölümleri)

`TeamCreator` rotası+görünümü · `TeamCreatorWizard` modal kullanımı (sekmeye taşınır) ·
`fetchUserTeams` · store `userTeams` · store ölü `Friend` slice'ı · `activeStudioTeam` ·
store `proposeTactic/approveTactic/rejectTactic/updateTacticSlots` · MyTeam yerel sürükle tahtası ·
`TeamLineupBoard`/`TeamDashboard` (öksüz — sahte dolgu deseni yasak) · sahte "Sıradaki Maç" metni ·
pseudo aktiflik/müsaitlik/forma üretimi · "en golcü" tahmini · sahte paylaş butonu ·
sahte davet modali · sahte şikâyet toast'ı · emerald renk yolu · Aşama 2'deki tüm kolonlar.
Kapsam dışı (dokunulmaz): maç-içi gömülü sohbet (`chatMessages` JSONB — teknik borç notu) · `OwnerTeamView` (saha personeli — ilgisiz).
