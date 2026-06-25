# 🏛️ OYNA — Master Prensipler Dokümanı

> **Durum:** TASLAK — canlı geliştiriliyor. Keşif soruları yanıtlandıkça bölüm bölüm dolduruluyor.
> **Kaynak:** `docs/OYNA_MASTER_KESIF_SORULARI.md` (200 soru) + bölüm bölüm Q&A.
> **Son güncelleme:** Bölüm 1–7 ✅ (… + saha keşfi + harita markalaşması). Sıradaki: Bölüm 8 (Tesis Sahibi Paneli / B2B).
> **Amaç:** Karışıklıkları gidermek → binlerce kullanıcı, saha sahibi, kaleci, hakem için sorunsuz → canlıya + store.

---

## 1. Vizyon & Konumlandırma
- **Gerçek ürün:** Halı saha **rezervasyon platformu** (sosyal ağ değil).
- **Model:** Çift taraflı pazar (saha sahipleri ↔ oyuncular).
- **Destekleyici çekirdek:** Takım kurma + **takım-içi taktik paylaşımı**.
- **Net fark:** Saha sahibine kolaylık; oyuncuya kolay maç bulma; takım/arkadaşlarla maç.
- **Ton:** Tüketici tarafı mevcut dil (sade); saha sahibi paneli **B2B**.

## 2. Kapsam (MVP / Lansman)
**✅ VAR:** Saha keşfi & rezervasyon · Maç oluşturma/katılım (iki taraflı: oyuncu + saha sahibi) · Kaleci/Hakem kiralama · Takımlar + Arkadaşlar + **takım-içi Taktik Stüdyo** · Oyuncu kartları (admin) · Fair-play/güvenilirlik (admin) · Maç sonu değerlendirme · 1-1 mesajlaşma · Admin paneli.

**❌ YOK (silinecek):** Turnuvalar · Topluluklar (+`COMMUNITY_ADMIN`) · AI Koç (+Gemini) · OYNA TV · Oyunlaştırma (ELMAS/KARAT, Lider tabloları, rozetler) · Saha SaaS · Oyuncu Premium · Maç içi grup sohbeti.

## 3. Roller & Yetkiler
- **Lansman rolleri:** `PLAYER`, `GOALKEEPER`, `REFEREE`, `OWNER` + Admin(ler). `CAPTAIN`(global) ve `COMMUNITY_ADMIN` kaldırıldı.
- **Kaptanlık = takım-içi yöneticilik** (global rol değil): Takımı **kuran** otomatik yönetici olur; yönetici, takımdaki **herkese** yönetim yetkisi verebilir (çoklu yönetici mümkün).
  - **Yönetici yetkileri:** Takım arayüzündeki **taktik stüdyo** ile taktik düzenini ayarlama/onaylama; **oyuncu ekleme/çıkarma**.
- **Çoklu rol:** Bir kişi birden çok rol taşıyabilir; **ancak güvenlik için her rol arayüzüne geçişte yeniden giriş/çıkış (re-login) gerekir.** Aktif rol girişte seçilir.
- **Oyuncu → kaleci/hakem:** Aynı hesaba rol başvurusu eklenir; o arayüze re-login ile geçilir.
- **Maç açma:** Hem oyuncu/kaptan hem **saha sahibi** maç açabilir/düzenleyebilir (iki taraflı maç açma & düzenleme sistemi).
- **Açılış ekranı:** PLAYER→Dashboard, GK/REF→ServiceDashboard, OWNER→OwnerPanel; kaptana ayrı ekran yok ("Takımım" Dashboard içinde).
- **Admin rolleri (onaylandı):**
  - `SUPER_ADMIN` — tam yetki.
  - `FİNANS` — komisyon oranları, payout onayı, finansal raporlar, cüzdan görünümü.
  - `OPERASYON` — saha/kaleci/hakem doğrulama, kullanıcı yönetimi (ban/mute), dispute, maç müdahale, kart ayarları.
  - Bootstrap: ilk `SUPER_ADMIN` DB'den; sonra panelden atama. **Tüm kritik işlemler audit log.** (Tek kişilik ekiple yalnız `SUPER_ADMIN` ile başlanabilir.)
- **Saha sahibi sınırı (#20 — çözüldü):**
  - **(a) Tanıtım serbest:** Saha sahibi OYNA'yı kendi kanallarıyla tanıtır (afiş/QR/paylaşılabilir saha sayfası); oyuncu **kendisi** kayıt olur. (Owner-led büyüme böyle işler — "davet" değil.)
  - **(b) Yasak:** Saha sahibi bir OYNA oyuncu hesabı adına işlem yapamaz / davet gönderemez.
  - **(c) İzinli:** Manuel rezervasyon = saha sahibinin **kendi takvimine** offline müşteri (ad+telefon, OYNA hesabı yok) kaydı; "oyuncu adına işlem" değildir.
  - **(d) Veresiye/borçlu modülü:** Saha sahibinin **kendi offline defteri** olarak kalır (OYNA para akışına karışmaz). Sistemde OYNA↔kullanıcı borcu yoktur.

## 3.1 Kimlik Doğrulama & Onboarding
- **Giriş yöntemleri:** **Google + Apple (birincil)**, **E-posta (ikincil)**. **SMS/telefon ile giriş YOK** (telefon yalnızca profil/iletişim alanı). → Supabase Auth (OAuth) ↔ `profiles` tam entegre kurulacak.
- **Misafir girişi:** Lansmanda **YOK**; geliştirme sırasında geçici kalabilir, yayından önce kaldırılır.
- **Kimlik esnekliği:** Telefon/hesap tekilliği zorunlu değil (ödeme yapıldığı sürece). *Not: gevşek kimlik → ban/fair-play kaçışını zayıflatır; sistem bunu göz önünde tutmalı.*
- **Rol & giriş akışı:** **Varsayılan rol yok**; her arayüzün kendi rolü var. Akış: **Arayüz/rol seç → Auth (Google/Apple/e-posta) → (yeni hesap) Onboarding sihirbazı → ilgili arayüz.** Başka role geçiş = **re-login**.
- **Onboarding sihirbazı (yeni kullanıcı; sayfa sayfa; hepsi zorunlu):** Ad-soyad → Telefon → Profil fotoğrafı → Konum izni. (Auth ekranından sonra.)
  - **Profil fotoğrafı:** zorunlu (Supabase Storage).
  - **Konum:** zorunlu; OS'ten reddedilirse fallback = manuel şehir/ilçe (Ordu) seçimi.
- **GK/Hakem/Saha sahibi:** o arayüze ilk girişte **ayrı başvuru + doğrulama** akışı.
- **Yasal metinler:** Hazır (KVKK/Sözleşme/Mesafeli Satış/Gizlilik) — yerleştirilecek; onboarding'de onay zorunlu.
- **Hesap silme:** **Aktif rezervasyon varken engellenir.** Sistemde kullanıcı borcu olmayacak.
- **Yaş politikası:** 18+ kendi kredi kartıyla öder (tam self-service). **18 yaş altı** kayıt olup oynayabilir; ancak ödemesini **zorunlu olarak bir yetişkinin kredi kartıyla** yapar → bu, ödemeyi yapan kişinin (veli/vasi) **onayı** sayılır. **Veli onayı sistemi** olarak, yasal düzenlemeye uygun kurgulanacak.
  - *Uygulama/yasal notu:* Onay iki noktada — (1) kayıt anında KVKK gereği 18 altı **veri işleme** için veli onayı, (2) **ödeme anında** yetişkinin açık (kimliklenebilir) onayı. Asgari kayıt yaşı (öneri: 15) netleştirilecek.

## 3.2 Maç Oluşturma & Format
- **Formatlar:** **2v2 → 11v11 (tümü).** Format seçici **kaydırılabilir** (kaydırdıkça bazıları görünür/gizlenir). *(XvX = taraf başına toplam oyuncu, kaleci dahil — netleşecek.)*
- **Saha kaynağı:** Yalnızca **OYNA'daki sahalar** gösterilir/seçilebilir. Sahalar **admin panelinden (her şehir)** eklenebilir; eklenince ödeme + oyuncu görünümü + tüm özellikler **entegre** çalışır. (Ek olarak saha sahibi self-onboarding.)
- **Oyuncu maç açma akışı:** Maç özellikleri → kadro (kendisi + arkadaşlar) → saha seç → **minimum oyuncu belirle** → **Top Oyna**'ya gönder. (Yayın/onay/ödeme için bkz. **3.3 Maç Yaşam Döngüsü**.)
- **Kesinleşme:** Maç **onay anında (T-8s)** kesinleşir; yayın hemen yapılır, ödeme **blokajla** alınır (bkz. 3.3).
- **Saha sahibi maç açma (Model B):** Boş saatini "OYNA maçına aç"; markup oranını **admin** belirler, **varsayılan %20** (ayarlanabilir).
- **Açık / Özel maç:** İkisi de. Arkadaş eklenince kişi **onaylar** (otomatik kadroda değil). Özel maça **süreli özel kod/link** ile takım/oyuncu davet edilir.
- **Katılım birimi:** Boş kontenjan + **opsiyonel pozisyon etiketi**.
- **Kaleci/Hakem ekleme:** Maç kurulduktan sonra **"Maçlarım"**dan. İki yol: (1) bir kişi **tüm ücreti ödeyip** kiralar; (2) kadro **oylar**, **%50+1** onayınca sistem uygun kaleci/hakemi **önerir/atar**; ücret **kadroya bölüşülür** ve paylara **ek blokaj** olarak eklenir (onayda birlikte tahsil; onaydan sonra eklenirse anında tahsil).
- **Keşif:** Liste + harita + filtre (ilçe/tarih/format/saat), Ordu odaklı — yüksek kalite hedefi.
- **Düzenleme/iptal:** Açan kişi **maça 24 saat kala**ya dek; **24 saat kuralı admin'den ayarlanabilir**. İptal/iade detayı Bölüm 12.

## 3.3 Maç Yaşam Döngüsü: Yayın → Onay → İptal (Plei-uyarlı)
- **Yayın:** Maç oluşturulunca **hemen Top Oyna'da** görünür (boş bile olsa). Kurucu "oynamak için **minimum oyuncu**" belirler — **varsayılan %70**, admin ayarlı.
- **Katılım = blokaj (tahsil değil):** Katılan (kurucu dahil) kendi payını karta **bloke** ettirir (Param/iyzico **ön-provizyon**). Model A → kapora payı; Model B → tam pay. Katılım anında kesinleşir; aynı slota eşzamanlı gelende **ilk gelen alır** (atomik).
- **Onay anı = T-8 saat (admin ayarlı):** Min oyuncu ✓ → tüm blokajlar **tahsil**, saha **kesin rezerve**, maç **CONFIRMED** + kadro **kilitlenir**. ✗ → tüm blokajlar **serbest**, maç **otomatik iptal** (kimse ödemez). *(Kapasite dolarsa erken onay opsiyonu.)*
- **Saha slotu:** Hedeflenince **geçici hold**; onayda **kesin booking**; iptal/onaysızlıkta serbest (`pitch_slot_holds`).
- **Yedek:** Dolunca yeni gelen **yedek**; boşalınca **ilk yedek otomatik** girer + bildirim.
- **Onay sonrası iptal/iade (kademeli, admin ayarlı):** T-8s → T-3s: ayrılan, **yerine biri bulunursa kredi**; **<T-3s: iade yok**; **no-show: fair-play ↓** (+opsiyonel ceza).
- **Durum makinesi:** `TOPLANIYOR → (T-8s) CONFIRMED → COMPLETED` veya `→ CANCELLED`.
- **"Maçlarım" yönetim ekranı:** Maç kurulduktan sonra tek ekran (kadro + ödeme/blokaj durumu + kaleci/hakem ekleme + düzenle/iptal + paylaş). *(Eski mock `MatchLobby` silinecek.)*
- **Başarılı maç (Bölüm 1 metriği):** **Otomatik** — maç saati geçti + tahsil edildi + iptal yok → "başarılı" sayılır. (Saha sahibi check-in opsiyonel, zorunlu değil.)
- *Not: Bu timeline, #49'daki bağımsız "24s kapora yanması" kuralının yerini alır — T-8s öncesi zaten tahsil yoktur.*

## 3.4 Maç Günü, Skor & Değerlendirme
- **Skor girişi (opsiyonel, çok kaynaklı):**
  - **Oyuncu:** Skor girebilir; **kayıtlı takım** maçında **tüm takım oyuncuları onaylarsa** → **takım geçmişine** işlenir.
  - **Hakem (hakemli maç):** Hakem skoru girer → resmi kayıt; sonuç **"Takımlar → Hakemli Maçlar"**da görünür. **Yalnız kayıtlı takımlar** bu geçmişi alır; kayıtsız/pickup maçta **otomatik takım oluşturulmaz** (skor kişisel maç geçmişinde). Kayıtlı takımlar **saha sahibine skor bildirerek** de geçmişlerini geliştirebilir.
  - **Saha sahibi:** İki kayıtlı takım talep ederse saha sahibi skoru sisteme girer; sonuç takım arayüzlerinde görünür. *(Tarafsız kayıt; "oyuncu adına işlem" değil.)*
- **Maç sonu değerlendirme sayfası:** Atlanabilir ama **teşvik edilir**; **2 sayfa geçişiyle hızlı/keyifli** UX. İçerik: rakip/takım **fair-play yıldızı** + opsiyonel **oyuncu puanı** + opsiyonel **yorum**; **hizmet alındıysa kaleci/hakem 1–10** puanı. Sadece **fair-play + hizmet puanını** besler (kartları değil).
- **MOTM:** Ödülsüz **kozmetik etiket**; **değerlendirme puanlarından** belirlenir.
- **Fair-play/güvenilirlik:** Başlangıç **100**. no-show (−), geç iptal (−), kötü değerlendirme (−), sorunsuz oynama (+). Eşikler **admin'den**. Düşükse profilde **uyarı**; çok düşükse **katılım kısıtı/ban**. **Admin panelinde görüntülenir.**
- **No-show:** Maçı **oluşturan** isterse gelmeyenleri işaretler. **Kurucu gelmezse:** herhangi bir katılımcının **"Sorun Bildir"**i (tek kişi yeterli) → **admin incelemesi** → doğrulanırsa ban. (Kurucu da Sorun Bildir'le itiraz eder.)
- **Sorun Bildir:** Skor itirazı yok; **no-show / saha sorunu / iade** için "sorun bildir" → admin **OPERASYON**.
- **Maç geçmişi:** Oyuncu kendi maçlarını görür — **tarih, saha, kadro, skor**.

## 3.5 Saha Keşfi & Rezervasyon (Oyuncu)
*(Çoğu altyapı kodda mevcut — `PitchDiscovery.tsx` Leaflet harita+liste+filtre, `geo.ts` haversine. Aşağıdakiler kararlar + kod düzeltmeleri.)*
- **Keşif:** Harita + liste + filtre birlikte; **varsayılan liste** (az sahaya uygun); fiyat pinli harita. Harita merkezi/ilçeler **İstanbul→Ordu**.
- **Yakın saha:** İlçe seçimi + GPS mesafe (haversine). *(İstanbul ilçe koordinatları → Ordu ilçeleri.)*
- **Doğrudan rezervasyon (maçsız):** Ayrı "Sahayı Kirala" akışı (kodda var); tek kişi **kaporayı** öder, saha müsaitse **anında rezerve**. Kapora **tarifedeki `deposit_amount`'tan** (yoksa %30 fallback — koddaki sabit %30 düzeltilecek). Gerçek ödeme Bölüm 12.
- **Müsaitlik:** Gerçek zamanlı takvim = tarife + rezervasyon + **abonelik + istisna (kapalı saat)** birleşik. *(Kodda abonelik/istisna müsaitliğe DAHİL DEĞİL → eklenecek; çifte rezervasyon önlenir.)*
- **Saha detayı:** Foto galeri + olanaklar + kort & fiyat + **çalışma saatleri** + **yol tarifi (harita linki)** + saha puanı. *(Çalışma saati & yol tarifi eklenecek.)*
- **Saha puanı/yorumu:** Yalnızca **rezervasyon/maç tamamlamış** kişi verebilir. *(Kodda puan veriliyor ama yorum ekranı + kısıt YOK → eklenecek.)*
- **"Rezervasyonlarım":** İptal (**24s + kademeli**, admin ayarlı — **koddaki 48s/%90 buna hizalanacak**) + **yol tarifi** + **tekrar rezerve** + **maça çevir**.
- **Filtreler:** İlçe, **tarih, saat**, kort tipi, fiyat. *(Tarih/saat ana listeye eklenecek — kodda yalnız detayda.)*

## 3.6 Harita Markalaşması ("Harita")
- **İsim:** Basitçe **"Harita"** (radar metaforu yalnız bir **animasyon/his** olarak kalır, marka adı değil).
- **Konsept:** OYNA'nın imza keşif yüzeyi; **lansmandan itibaren premium görüntü & işlev ŞART** — saha sahiplerini ikna etmenin önemli aracı (ücretsiz tile aşamasında bile ucuz görünmemeli).
- **Taban harita:** **Açık/sade** tema, ama **OYNA tema diliyle uyumlu** (accent renkler/tipografi tutarlı; uygulamadan kopuk olmasın). Renkli pinler öne çıksın.
- **Tile sağlayıcı:** Kademeli — başlangıç ücretsiz **Carto Positron + OYNA tint**, sonra özel **Mapbox/MapTiler** premium stili.
- **Pin taksonomisi:** Fiyat pini (₺) · müsaitlik renk halkası (yeşil/amber/gri) · **OYNA Onaylı** rozeti · **flash indirim** (pulse %X) · maç pini (top "X kişi aranıyor") · kullanıcı konumu · **cluster**.
- **Animasyon:** açılışta **radar sweep**; pinler stagger bounce; müsait sahalar pulse; pin tap → alttan saha kartı; seçili pin neon glow + büyür.
- **Az saha (Ordu):** radar + "yakındaki sahalar" + boş bölgede "yakında daha fazla saha" → harita yine canlı.
- **Teknik:** Leaflet `DivIcon` (CSS pinler), MarkerCluster, framer-motion; viewport bazlı render (ölçek).

## 4. Gelir Modeli & Para Akışı 💰
OYNA tek merchant; saha ödemeleri **ay sonu payout**. Tüm oranlar admin'den **her seviyede** (global/saha/hizmet/maç) ayarlanabilir.

**Model A — Normal rezervasyon:** OYNA **yalnızca kaporayı** tahsil eder; kaporanın **%15'i** OYNA'da kalır, kalan aylık payout; kalan saha ücreti tesiste. *(Kapora 1000₺ → OYNA 150₺.)*

**Model B — Saha sahibinin açtığı / OYNA-organize maç:** Saha **normal fiyatının %95'ini** alır (OYNA %5 keser); OYNA ayrıca oyunculara **değişken markup** ekler. OYNA = %5 + markup. OYNA parayı oyuncudan toplar, sahaya %95 aktarır. **Tetikleyici:** oyuncu/kaptan açar → Model A; **saha sahibi (boş saat doldurma) açar → Model B.**

**Kaleci/Hakem:** **%10** komisyon (ayarlanabilir).

## 5. Büyüme Stratejisi
- **Önce arz:** Saha sahipleri/sahalarla anlaşılır; saha sahipleri OYNA'yı **kendi kanallarıyla tanıtır**; oyuncular **kendileri kayıt olur ve kendileri işlem yapar** (saha sahibi adlarına işlem yapmaz).

## 6. Başarı Metriği
- **Ana metrik:** Başarılı oynatılan maç sayısı = ödendi → toplanıldı → oynandı → dağıldı → OYNA+saha parasını aldı. Admin paneli buna odaklanır.

## 7. Oyunlaştırma
- **Kaldırılan:** ELMAS/KARAT, lider tabloları, rozetler.
- **Oyuncu kartları:** yalnızca **admin** kontrolünde; kullanıcı etkisi **yok**.
- **Fair-play/güvenilirlik:** sistemsel; admin kontrollü; profilde **uyarı** olarak gösterilebilir.

## 8. Sosyal & Takım / Taktik
- **Kaldırılan:** Topluluklar; maç içi grup sohbeti.
- **Kalan:** Arkadaşlar arası **1-1 mesajlaşma**.
- **Geliştirilecek:** Takımlar + Arkadaşlar.
- **Taktik:** **Takım-içi**; **yüzdelik oylama + yorum + favori**. Stüdyo, **takım arayüzünün içinde**.

## 9. Lansman Şehri & Veri
- **Şehir:** Ordu (tüm demo/seed, harita merkezi, ilçeler titizlikle yeniden kurulacak).
- **Başlangıç sahaları (4 tesis):**
  | Tesis | Kort | Fiyatlar |
  |---|---|---|
  | **Capo Arena** | 3 | 2000₺ · 3200₺ · 3200₺ |
  | **Olimpiyat** | 3 | 3000₺ · 3000₺ · 3000₺ |
  | **VIP Arena** | 3 | 3200₺ · 3200₺ · 3200₺ |
  | **Ahmet Kuru Tesisleri** | 4 | 1200₺ · 2300₺ · 3000₺ · 3200₺ |

## 10. Tasarım Tonu
- Tüketici: mevcut dil (sade). Saha sahibi paneli: **B2B, sade, güven veren**.

---

## 11. Geliştirme Planı (Fazlar)
| Faz | Başlık | Özet |
|---|---|---|
| **0** | Kapsam Daraltma & Temizlik | Kapsam dışını sil; alt navigasyonu yeniden tasarla; ölü kod/mükerrer tip temizliği. |
| **1** | Veri Modeli & Gerçek Veri | Tek kanonik tip; mock→gerçek; DEV_MODE prod kapalı; **Ordu seed (4 tesis)**. |
| **2** | Para Akışı & Komisyon ⚠️ | Model A + Model B; çok seviyeli ayarlanabilir komisyon; aylık payout. |
| **3** | Rezervasyon & Maç Çekirdeği | Uçtan uca gerçek + "başarılı maç" sinyali. |
| **4** | Saha Sahibi B2B | Panel + B2B ton (+ saha sahibi sınırları #20'ye göre). |
| **5** | Kaleci/Hakem | Gerçek teklif/kabul + %10 + payout. |
| **6** | Takım & Taktik | Takım + arkadaşlar + takım-içi taktik (oylama/yorum/favori) + 1-1 mesaj; çoklu yönetici. |
| **7** | Güvenlik, Altyapı & Store | RLS; edge function deploy + güvenlik; çoklu-rol re-login; iOS/Android; test. |

## 12. 📌 Hatırlatma / Backlog
- [ ] Maç sonu oyuncu değerlendirme sayfası (fair-play'i besler).
- [ ] Takımlar + Arkadaşlar geliştir.
- [ ] Takım-içi taktik: oylama/yorum/favori; stüdyo takım arayüzünde.
- [ ] Komisyon motoru: global/saha/hizmet/maç override.
- [ ] Alt navigasyon yeniden tasarımı.
- [ ] Çoklu rol + re-login akışı.
- [ ] İki taraflı (oyuncu + saha sahibi) maç açma/düzenleme sistemi.

## 13. 🔓 Açık Kalemler
- Asgari kayıt yaşı (öneri: 15).
- Format etiketi XvX kaleci dahil mi (taraf başına toplam).
- Bölüm 8–20 yanıtları (owner panel, fiyat/abonelik, kaleci/hakem, para detayları, cüzdan, takım/taktik, fair-play detay, bildirim, admin, altyapı/store).
