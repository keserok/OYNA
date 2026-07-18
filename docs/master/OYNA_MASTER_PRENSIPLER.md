# 🏛️ OYNA — Master Prensipler Dokümanı

> **Durum:** TASLAK — canlı geliştiriliyor. Keşif soruları yanıtlandıkça bölüm bölüm dolduruluyor.
> **Kaynak:** `docs/eski/OYNA_MASTER_KESIF_SORULARI.md` (200 soru) + bölüm bölüm Q&A.
> **Son güncelleme:** ✅ **TÜM 20 BÖLÜM TAMAMLANDI + tutarlılık gözden geçirmesi yapıldı** (payout/yasal/iptal/ton tutarsızlıkları düzeltildi).
> **Amaç:** Karışıklıkları gidermek → binlerce kullanıcı, saha sahibi, kaleci, hakem için sorunsuz → canlıya + store.

---

## 1. Vizyon & Konumlandırma
- **Gerçek ürün:** Halı saha **rezervasyon platformu** (sosyal ağ değil).
- **Model:** Çift taraflı pazar (saha sahipleri ↔ oyuncular).
- **Destekleyici çekirdek:** Takım kurma + **takım-içi taktik paylaşımı**.
- **Net fark:** Saha sahibine kolaylık; oyuncuya kolay maç bulma; takım/arkadaşlarla maç.
- **Ton:** Tüketici tarafı **mevcut görsel dil korunur**; saha sahibi paneli **B2B**.

## 2. Kapsam (MVP / Lansman)
**✅ VAR:** Saha keşfi & rezervasyon · Maç oluşturma/katılım (iki taraflı: oyuncu + saha sahibi) · Kaleci/Hakem kiralama · Takımlar + Arkadaşlar + **takım-içi Taktik Stüdyo** · Oyuncu kartları (admin) · Fair-play/güvenilirlik (admin) · Maç sonu değerlendirme · 1-1 mesajlaşma · Admin paneli.

**❌ YOK (silinecek):** Turnuvalar · Topluluklar (+`COMMUNITY_ADMIN`) · AI Koç (+Gemini) · OYNA TV · Oyunlaştırma (ELMAS/KARAT, Lider tabloları, rozetler) · Saha SaaS · Oyuncu Premium · Maç içi grup sohbeti.

## 3. Roller & Yetkiler
- **Lansman rolleri:** `PLAYER`, `GOALKEEPER`, `REFEREE`, `OWNER` + Admin(ler). `CAPTAIN`(global) ve `COMMUNITY_ADMIN` kaldırıldı.
- **Kaptanlık = takım-içi yöneticilik** (global rol değil): Takımı **kuran** otomatik yönetici olur; yönetici, takımdaki **herkese** yönetim yetkisi verebilir (çoklu yönetici mümkün).
  - **Yönetici yetkileri:** Takım arayüzündeki **taktik stüdyo** ile taktik düzenini ayarlama/onaylama; **oyuncu ekleme/çıkarma**.
- **Çoklu rol (GÜNCELLENDİ — Faz 7):** Bir kişi birden çok rol taşıyabilir. Aktif rol girişte seçilir; sonradan **uygulama-içi "Rol Değiştir"** ile geçilir. Geçiş yalnızca kullanıcının **zaten sahip olduğu** roller arasındadır (`set_active_role` RPC, `roles[]` dışına çıkamaz → ayrıcalık yükseltme yok) ve bir **onay adımı** ister. *(Önceki "tam re-login zorunlu" kararı, kullanıcı onayıyla uygulama-içi geçişe revize edildi: ADMIN'e yükselme mümkün olmadığından sürtünmesiz geçiş tercih edildi; tam re-auth gerekmiyor.)*
- **Oyuncu → kaleci/hakem:** Aynı hesaba rol başvurusu eklenir; başvuru onaylanınca o role **uygulama-içi geçişle** girilir.
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
- **Rol & giriş akışı:** **Varsayılan rol yok**; her arayüzün kendi rolü var. Akış: **Arayüz/rol seç → Auth (Google/Apple/e-posta) → (yeni hesap) Onboarding sihirbazı → ilgili arayüz.** Sahip olunan roller arası geçiş = **uygulama-içi "Rol Değiştir"** (re-login değil; bkz. §3 Çoklu rol).
- **Onboarding sihirbazı (yeni kullanıcı; sayfa sayfa; hepsi zorunlu):** Ad-soyad → Telefon → Profil fotoğrafı → Konum izni. (Auth ekranından sonra.)
  - **Profil fotoğrafı:** zorunlu (Supabase Storage).
  - **Konum:** zorunlu; OS'ten reddedilirse fallback = manuel şehir/ilçe (Ordu) seçimi.
- **GK/Hakem/Saha sahibi:** o arayüze ilk girişte **ayrı başvuru + doğrulama** akışı.
- **Yasal metinler:** KVKK/Sözleşme/Mesafeli Satış/Gizlilik **hukukçu onaylı hazırlanacak** (bkz. 11.1); onboarding'de onay zorunlu.
- **Hesap silme:** **Aktif rezervasyon varken engellenir.** Sistemde kullanıcı borcu olmayacak.
- **Yaş politikası:** 18+ kendi kredi kartıyla öder (tam self-service). **18 yaş altı** kayıt olup oynayabilir; ancak ödemesini **zorunlu olarak bir yetişkinin kredi kartıyla** yapar → bu, ödemeyi yapan kişinin (veli/vasi) **onayı** sayılır. **Veli onayı sistemi** olarak, yasal düzenlemeye uygun kurgulanacak.
  - *Uygulama/yasal notu:* Onay iki noktada — (1) kayıt anında KVKK gereği 18 altı **veri işleme** için veli onayı, (2) **ödeme anında** yetişkinin açık (kimliklenebilir) onayı. Asgari kayıt yaşı (öneri: 15) netleştirilecek. **18 altı (yetişkin kartı yok) yalnız ücretsiz sahaları görür — bkz. 4.5.**

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
- **Düzenleme/iptal:** Maç için yaşam döngüsü + iade **3.3** geçerlidir (onay/T-8s öncesi serbest; sonrası kademeli). *Doğrudan saha rezervasyonu* iptali ise **24s + kademeli** (admin ayarlı; bkz. 3.5).

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
- **"Maçlarım" (rezervasyon kartları — eski "Rezervasyonlarım" birleşti):** İptal (**24s + kademeli**, admin ayarlı — **koddaki 48s/%90 buna hizalanacak**) + **yol tarifi** + **tekrar rezerve** + **maça çevir**.
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
OYNA tek merchant; saha ödemeleri **iki haftada bir (otomatik) payout**. Tüm oranlar admin'den **her seviyede** (global/saha/hizmet/maç) ayarlanabilir.

**Model A — Normal rezervasyon:** OYNA **yalnızca kaporayı** tahsil eder; kaporanın **%15'i** OYNA'da kalır, kalan **iki haftalık** payout; kalan saha ücreti tesiste. *(Kapora 1000₺ → OYNA 150₺.)*

**Model B — Saha sahibinin açtığı / OYNA-organize maç:** Saha **normal fiyatının %95'ini** alır (OYNA %5 keser); OYNA ayrıca oyunculara **değişken markup** ekler. OYNA = %5 + markup. OYNA parayı oyuncudan toplar, sahaya %95 aktarır. **Tetikleyici:** oyuncu/kaptan açar → Model A; **saha sahibi (boş saat doldurma) açar → Model B.**

**Kaleci/Hakem:** **%10** komisyon (ayarlanabilir).

## 4.1 Tesis Sahibi Paneli (B2B)
- **Kalite:** **Tüm modüller lansmanda, SaaS kalitesinde** (tam işlevsel, cilalı). *(Not: "SaaS kalitesi" = ürün olgunluğu; **ücretli plan/entitlement YOK** — Bölüm 1 kararı korunur.)*
- **Modüller:** Takvim · Manuel rezervasyon · App-booking onay/red · Kort & Tarife · Çalışma saati & İstisna · Abonelik · Flash indirim · Finans & Payout · Veresiye (kendi defteri) · Personel/Görev.
- **Tesis kurulumu (2 yol):**
  - **(a) Admin (birincil):** Admin panelinden tesis **direkt kurulur ve yayına açılır** (her şehir); oyuncular görür.
  - **(b) Saha sahibi başvurusu:** Tesis arayüzünde **"Başvuru Yap"** formu (numara + talep) → admin paneline düşer → admin kurar/yayınlar. *(Owner tek başına canlı tesis yayınlamaz.)*
  - İşletme/vergi bilgisi admin kurulumunda toplanır (fatura için).
- **Takvim:** Kort × saat matrisi; gerçek zamanlı, renk kodlu; tüm kaynaklar (manuel + app + abonelik + flash + istisna) birleşik.
- **Manuel rezervasyon:** müşteri ad+telefon, kort, tarih/saat, ücret, ödeme durumu (ödendi/veresiye), not. (Owner'ın kendi defteri.)
- **App-booking onay:** bildirim → onay/red; **otomatik onay süresi saha sahibi ayarlı** (varsayılan **15 dk**; **0 = anında otomatik**; "hep manuel" seçeneği de var).
- **Tarife & kapora:** zaman bazlı tarifeler (gündüz/akşam/hafta sonu/tatil) + tarifede **kapora tutarı** (oyuncuya yansır).
- **Müsaitlik/istisna:** kapalı saat/bakım/tatil (tekrarlı olabilir) → oyuncu müsaitliği + takvime yansır.
- **Abonelik:** sabit haftalık saat (örn. salı 20:00); **otomatik haftalık materyalize** (Supabase zamanlanmış görev); takvimde ayrı renk.
- **Flash indirim:** boş saatler için süreli indirim; haritada/keşifte rozet.
- **Finans & Payout:** gelir (kapora − komisyon) + **otomatik payout: iki haftada bir**; işlem/çekim geçmişi; gider takibi opsiyonel.
- **Ton:** sade, kurumsal, güven veren, **premium** (saha sahibini ikna).

## 4.2 Fiyatlandırma, Abonelik & Doluluk (detay)
- **Fiyat gösterimi:** Yerine göre **hem tam saha hem kişi başı** gösterilir; kapora ayrıca belirtilir.
- **Tek kaynak (SSOT):** Fiyatın tek kaynağı = **`pitch_tariffs`**; `price_per_match/total_price/price_per_person` tarifeden türetilir/temizlenir. **Genel ilke: tüm sistem tabanları tek kaynağa bağlanır** (mükerrer kaynak yok).
- **Çakışan tarife:** **En son yapılan/güncellenen tarife** geçerli.
- **Abonelik (owner-yönetimli):** Oyuncu saha sahibinden talep eder **veya** saha sahibi doğrudan sisteme işler; saha sahibi **istediği tutarı kapora olarak uygulamadan tahsil** edebilir; otomatik haftalık materyalize.
- **Fiyat/indirim:** Saha sahibi **fiyatını ve indirimini serbestçe** belirler (üst sınır yok).
- **Komisyon:** **OYNA komisyonu saha sahibince DEĞİŞTİRİLEMEZ (sabit)**; yalnız admin ayarlar (saha/hizmet/maç bazında farklı olabilir — FU3). Saha sahibi panelde **kendi oranını + net payout'u görür** (şeffaf).
- **Doluluk:** CONFIRMED + abonelik dolu sayılır; **PENDING de doluluğa katılır** ("geçici" gösterilir; çift rezervasyon önlenir).

## 4.3 Kaleci & Hakem (Hizmet Sağlayıcılar)
- **İş bulma:** Tek yön — maç tarafı (kadro) çağırır/önerilir (Bölüm 5: grup-oylama %50+1 veya bireysel ödeme). Kaleci/hakem **müsaitlik açar**, gelen talebi **kabul/red** eder. *(Koddaki JobListing/DirectOffer/IncomingBid karmaşası → tek "talep" modeli.)*
- **Ücret:** Kaleci/hakem **sabit ücret** koyar; pazarlık yok; OYNA **%10** komisyon.
- **Müsaitlik & çakışma:** aktif gün/saat + bölge; çakışan saatte ikinci iş alınamaz (PENDING dahil).
- **Eşleştirme:** Sistem **müsait + en yakın + en yüksek puanlı**yı önerir; kadro onaylar.
- **Kazanç & payout:** **Maç bitiminde ANINDA** ödeme — **oyuncular değerlendirdikten sonra** (değerlendirme = katılım kanıtı). Değerlendirme yapılmazsa kaleci/hakem **"Sorun Bildir"**le admine ulaşıp katılımını teyit eder → admin serbest bırakır. *(Düşük puan ödemeyi engellemez, yalnız rating'i etkiler.)* **NOT: saha sahibi payout iki haftada bir; kaleci/hakem ANINDA — farklı.**
- **Başvuru & doğrulama:** Aynı hesaba rol başvurusu + admin OPERASYON onayı; Hakem: lisans/seviye belgesi.
- **Panel (ServiceDashboard):** müsaitlik toggle · gelen talepler · yaklaşan maçlar · kazanç/payout · profil & puan. **SaaS kalitesinde.**
- **Hakem skoru:** hakemli maçta skor girer → resmi kayıt (Bölüm 6).
- **Değerlendirme:** maç sonu oyuncular kaleci/hakemi **1–10** puanlar.
- **Canlı durum:** opsiyonel "yoldayım/geldim".
- **Kaldırılan:** TransferCenter, ScoutDashboard (kapsam dışı).

## 4.4 Para Akışı (Teknik)
- **Sağlayıcı:** **iyzico** (alt üye işyeri/marketplace payout + pre-auth). *(Param alternatif; sağlayıcı+hukuk teyidi.)*
- **Model:** OYNA pazaryeri; parayı **sağlayıcının alt-üye işyeri** çözümü tutar/payout yapar (lisans yükü sağlayıcıda). *(Hukukçu teyidi.)*
- **Blokaj (pre-auth):** Join → karta **ön-provizyon**; **T-8s onayda capture**; tutmazsa **void** (serbest).
- **Başarısız capture (T-8s):** O oyuncu düşer (yedek girer); maç min tutuyorsa onaylanır, yoksa iptal; bildirim.
- **İade:** Hem **OYNA kredisi** hem **karta iade** mümkün; **kesintiler hesaplanır** (kademeli iade + alınmış komisyon/markup düşülür).
- **OYNA bakiyesi:** Kazançlar (kaleci/hakem, owner) + iade kredileri burada toplanır; payout buradan IBAN'a.
- **Payout:** Saha sahibi **iki haftada bir** (sabit gün, IBAN doğrulamalı); kaleci/hakem **anında (değerlendirme sonrası)**.
- **Faturalandırma/KDV:** OYNA saha sahibine komisyon faturası; markup hizmet geliri. *(Mali müşavir teyidi.)*
- **18 altı ödeme:** ödeme adımında **yetişkin kartı + açık onay**; çekim yetişkin kartından (Bölüm 3 veli onayı).
- **Akış özeti:** blokaj → T-8s capture → komisyon/markup ayrılır → saha %95/%85 bakiyeye → payout.

## 4.5 Ücretsiz Sahalar & Yaşa Göre Erişim
- **Amaç:** Ödeme yapamayan gençler (18 altı, yetişkin kartı yok) uygulamayı kullanabilsin — **ücretsiz sahalarda** maç açıp arkadaşlarıyla takım kurabilsin. (Erken kullanıcı kazanımı + kapsayıcılık.)
- **Ücretsiz saha:** Admin'in "ücretsiz" işaretlediği sahalar (belediye/okul/park/OYNA sponsorlu); **tarife/kapora yok**, komisyon/payout yok.
- **Görünürlük matrisi:**

  | Segment | Ücretsiz sahalar | Ücretli sahalar |
  |---|---|---|
  | 18 altı — yetişkin kartı **yok** | ✅ | ❌ |
  | 18 altı — yetişkin kartı + ödeme onayı **var** | ✅ | ✅ |
  | 18+ | ❌ | ✅ |

- **Ücretsiz sahada akış:** Maç açma **ödemesiz** (blokaj/onay para mekaniği yok); min-oyuncu organizasyonu uygulanabilir ama tahsil yok; takım/arkadaş serbest. **Fair-play/no-show kuralları yine geçerli.**
- **Geçiş:** 18 altı kullanıcı yetişkin kartı + ödeme onayı eklediğinde ücretli sahalar açılır.
- **⚠️ Suistimal riski & önlem:** Yaş beyana dayalı + kimlik gevşek → yetişkin "18 altı" diyip ücretsiz sahalara erişebilir. Ücretsiz sahalar zaten OYNA'ya gelir getirmeyen halka açık sahalar (doğrudan gelir kaybı düşük); **önlem: admin izleme; ileride yaş doğrulama.**

## 4.6 Cüzdan & Sadakat
- **Cüzdan (OYNA bakiyesi) — iki tür:**
  - **Kazanç bakiyesi** (kaleci/hakem/owner): gerçek para → **IBAN'a payout**.
  - **İade kredisi:** yalnız **OYNA-içi** harcanır (rezervasyon/maç); **karta/IBAN'a çekilemez**; son kullanma yok/uzun.
- **Para yükleme:** Lansmanda **YOK** (ödemeler doğrudan karttan).
- **Sadakat (loyalty):** **Sonraya** (lansmanda yok).
- **Promosyon/kupon kodu:** **Sonraya** (lansmanda yok).
- **Premium/Pro:** **Kaldırıldı** — komisyon herkese aynı (admin ayarlı).

## 5. Büyüme Stratejisi
- **Önce arz:** Saha sahipleri/sahalarla anlaşılır; saha sahipleri OYNA'yı **kendi kanallarıyla tanıtır**; oyuncular **kendileri kayıt olur ve kendileri işlem yapar** (saha sahibi adlarına işlem yapmaz).

## 6. Başarı Metriği
- **Ana metrik:** Başarılı oynatılan maç sayısı = ödendi → toplanıldı → oynandı → dağıldı → OYNA+saha parasını aldı. Admin paneli buna odaklanır.

## 7. Oyunlaştırma
- **Kaldırılan:** ELMAS/KARAT, lider tabloları, rozetler.
- **Oyuncu kartları:** yalnızca **admin** kontrolünde; kullanıcı etkisi **yok**.
- **Fair-play/güvenilirlik:** sistemsel; admin kontrollü. Detay: **7.1**.

## 7.1 Fair-Play / Güvenilirlik & Moderasyon
- **Tek skor:** "Güvenilirlik" (0–100, başlangıç **100**). *(Kodda `rating`/`fairPlayScore`/`reliabilityScore` üçü → tek skora indirgenir.)* Hizmet puanı (kaleci/hakem 1–10) ayrı.
- **Olaylar (varsayılan, admin ayarlı):** no-show **−20**, geç iptal (<24s) **−10**, kötü değerlendirme **−5**, sorunsuz maç **+2**.
- **Eşikler (admin ayarlı):** <80 **uyarı**, <60 **kısıt** (bazı maçlara giremez), <40 **geçici ban**.
- **Toparlanma:** her sorunsuz maç +; zamanla yavaş toparlanma (kalıcı ceza değil).
- **Admin müdahalesi:** Admin **güvenilirlik skorunu manuel ayarlayabilir** (override; audit log).
- **Görünürlük:** Skor **yalnızca kullanıcının kendisi (+admin)** görür; **diğer kullanıcılar GÖRMEZ**. Başkaları sistemin **otomatik kısıt/ban**'ıyla korunur.
- **Ban türleri:** lansmanda **normal ban + uyarı**; shadow ban/mute **sonraya**.
- **Raporlama ("Sorun Bildir"):** kategoriler: no-show · sportmenlik dışı · ödeme/saha sorunu · taciz → admin **OPERASYON** kuyruğu.
- **No-show:** maç sonu değerlendirmede işaretlenir → skor düşer; kurucu no-show → tek bildirim → admin incelemesi (Bölüm 6).

## 8. Sosyal & Takım / Taktik
- **Kaldırılan:** Topluluklar; maç içi grup sohbeti.

### 8.1 Takımlar
- **Kimlik:** ad + arma + 2 renk + kısa ad + kadro.
- **Limit:** kurma **max 5**; üyelik **sınırsız**. *(Önemli karar.)*
- **Üyelik/yönetim:** davet (arkadaş/özel kod) → kişi **onaylar**; **yönetici = kurucu + devredilebilir (çoklu)**; yetki: oyuncu ekle/çıkar + taktik onay. **Kurucu ayrılırsa devreder; son yönetici ayrılırsa takım arşivlenir** (geçmiş korunur).
- **Takım sayfası sekmeleri:** Genel · Kadro · **Taktikler** · Geçmiş. **Oyuncu kartları takım arayüzünde GÖSTERİLMEZ.** W/L = **onaylı skorlardan** (Bölüm 6).
- **Çoklu takım:** Kişi birden çok takımda olabilir; **maç açarken/girerken hangi takım adına oynadığını seçer.**
- **Takım vs takım:** Bir takım özel maç açar, diğerini **özel kodla** davet eder; sonuç iki takımın geçmişine işlenir.

### 8.2 Taktik Stüdyo
- **Kapsam:** formasyon + oyuncu yerleştirme (sürükle) + çizim (ok=koşu, çizgi=pas) + **animasyon/oynatma (top & oyuncu hareketi)**. **IQ Akademi KALDIRILDI.**
- **Tek kaynak:** ortak `FORMATIONS` (SSOT) → harita/maç/stüdyo aynı koordinatlar.
- **Teknik:** 233KB `Studio.tsx` modüllere bölünecek (Board / DrawingTools / PlaybackEngine) → performans.

### 8.3 Takım Taktik Sistemi (UI/UX — "muazzam akış")
- **Taktikler bölümü:** En üstte **"En İyi Taktikler" showcase** (mini formasyon önizlemesi + oy %'si + ❤️ favori + 💬 yorum; **aktif taktik** rozetle öne çıkar). Yanında büyük **"+ Yeni Taktik"** → Stüdyo (2 tıkla erişim).
- **Sıralama:** ortalama **oy %** (min N oy) → sonra favori; **aktif taktik** her zaman en üstte sabit.
- **Filtre:** En iyi · En yeni · Favorilerim · Aktif.
- **Taktik detayı:** animasyonlu tahta + açıklama; **oylama (% slider)** → ortalama % bar; **yorum** thread; **favori** ❤️; yönetici **"Aktif yap"**.
- **Öneri akışı:** üye taktiği **kopyala & öner** → yöneticiye düşer → onaylanınca paylaşıma/aktife girer.
- **Maça bağlama:** yönetici **aktif taktiği** takım maçına iliştirir (opsiyonel).

### 8.4 Arkadaşlar & Mesaj
- **Ekleme:** kullanıcı adı/OYNA-ID arama + **özel kod** (rehber opsiyonel/izinli); **engelleme**; profil görünürlüğü (herkes/arkadaşlar).
- **Sağladıkları:** maça davet · takıma davet · profil görme · 1-1 mesaj.
- **1-1 mesaj:** yalnız arkadaşlar; metin (medya sonraya); şikayet+engelle → admin OPERASYON.

## 8.5 Bildirim Sistemi
- **Tek kaynak:** Tüm bildirimler **Supabase** `notifications` (realtime). **Firebase/Firestore YOK** — backend %100 Supabase.
- **3 kanal:** Uygulama-içi (realtime merkez) · Push (mobil) · E-posta (yalnız **makbuz + payout özeti**). **SMS YOK.**
- **Push taşıma:** iOS **APNs**, Android **FCM** *(yalnız Google'ın zorunlu push taşıma katmanı; veri/backend Supabase'de — Firestore/Firebase backend kullanılmaz)*. Gönderim: DB trigger → **Supabase Edge Function** → APNs/FCM.
- **Şablonlar:** `notification_templates` (TR metin, kategori, zorunlu/kapatılabilir, deep_link) — tek yerden.
- **Olaylar:** katılım/ayrılma · maç onaylandı (T-8s) · iptal · davet · kaleci/hakem talep+kabul/red · rezervasyon onay/red · ödeme/blokaj/iade · payout · hatırlatma (24s & 1s) · yeni mesaj · fair-play uyarısı · sorun bildir.
- **Kategoriler:** MAÇ · KADRO/HİZMET · ÖDEME/FİNANS · SİSTEM (zorunlu) + HATIRLATMA (kapatılabilir).
- **Deep link:** `oyna://<resource>/<id>` → tıkla → ilgili ekran. *(Koddaki parse hatası düzeltilecek.)*
- **Admin broadcast:** admin panelinden **hedefli genel bildirim** (tüm / segment: oyuncu/owner/kaleci-hakem/şehir-ilçe); şablon + önizleme + zamanlama + rate-limit + audit.
- **Tercihler:** Ayarlar'da; zorunlular kilitli; **rate-limit + opsiyonel sessiz saatler** (kritik/zorunlu aşabilir).
- **Okundu/okunmadı + rozet sayacı.**
- *Üretim: APNs sertifikası + FCM anahtarı + edge function deploy gerekli (şu an boş).*

## 8.6 Admin / GodView Paneli — Tam Operasyonel Kontrol
- **İlke:** Admin paneli uygulamaya **tam yetki + tam esneklik**le etki eder. **Herhangi bir problem panelden doğrudan çözülebilir** (god-mode). Her kritik işlem **audit**'lenir. *(Kod/plan bu ilkeye göre kurulur.)*
- **Taban:** `admin-panel/` (**OYNA OS GodView**, `AdminAuthGate`) — `views/AdminDashboard.tsx` **kaldırılır**. Erişim: ayrı `admin.html` + admin rolü + **2FA**.
- **Yetki matrisi:** `SUPER_ADMIN` = **sınırsız**; `FİNANS` = komisyon/payout/withdrawal/finans; `OPERASYON` = doğrulama/kullanıcı/dispute/maç/kart/bildirim.
- **Modüller (her biri tam CRUD + müdahale):**
  - **Kullanıcılar:** ban/unban · güvenilirlik skoru ayarı · kart ayarı · rol değiştir · cüzdan/bakiye düzelt · impersonate (ghost) · sil/anonimleştir.
  - **Maçlar → Maç Kontrol Paneli (cockpit)** — aşağıda.
  - **Sahalar:** ekle/düzenle/yayınla/kaldır/doğrula · **ücretsiz işaretle** · tarife/kort/müsaitlik düzenle · rezervasyon ekle/iptal.
  - **Finans:** tüm işlemler · **force capture/void/refund** · komisyon (global/saha/hizmet/maç) · payout onay/red/tetik · manuel düzeltme.
  - **Doğrulama kuyruğu:** kaleci/hakem/tesis başvuruları + owner "Başvuru Yap" + ücretsiz saha talepleri (tek kuyruk).
  - **Moderasyon:** Sorun Bildir/dispute çözüm.
  - **Bildirim:** hedefli broadcast.
  - **İçerik/Ayarlar:** CMS metinleri · feature flag · tüm "admin ayarlı" parametreler (komisyon/eşik/süre/min-oyuncu/onay-süresi…).
- **Maç Kontrol Paneli (cockpit) — DETAYLI** *(uygulamadaki görünümden çok daha derin):*
  - **Liste:** tüm maçlar; filtre (durum/şehir/saha/tarih/kurucu/format); canlı durum rozetleri (TOPLANIYOR/CONFIRMED/COMPLETED/CANCELLED).
  - **Detay:** saha/kort, tarih/saat, format, kurucu, durum, **T-8s onaya kalan**; **kadro & slotlar** (oyuncu + ödeme/blokaj durumu).
  - **Müdahaleler:** oyuncu **ekle/çıkar/yeniden ata** · slot kilitle/aç · kaleci/hakem ata/değiştir/kaldır · **force-confirm** / **iptal (iadeli)** · saha/saat/format değiştir · **skor override** · **dispute çöz** · **force capture/void/refund** · **payout tetik** · kadroya bildirim.
  - **Log:** maça dair tüm olaylar + admin müdahaleleri (audit).
- **Audit:** **tek** audit tablosu; tüm kritik admin işlemleri (kim/ne/ne zaman/eski-yeni değer).
- **Ana metrik paneli:** **"Başarılı oynatılan maç"** öne çıkan KPI + aktif maç · rezervasyon · GMV · saha/kullanıcı · bekleyen payout.
- **Ghost mode güvenliği:** yalnız yetkili admin · **sunucu-taraf (RLS) kontrol** · her impersonation audit · süreli.

## 9. Lansman Şehri & Veri
- **Şehir:** Ordu (tüm demo/seed, harita merkezi, ilçeler titizlikle yeniden kurulacak).
- **Başlangıç sahaları (4 tesis):**
  | Tesis | Kort | Fiyatlar |
  |---|---|---|
  | **Capo Arena** | 3 | 2000₺ · 3200₺ · 3200₺ |
  | **Olimpiyat** | 3 | 3000₺ · 3000₺ · 3000₺ |
  | **VIP Arena** | 3 | 3200₺ · 3200₺ · 3200₺ |
  | **Ahmet Kuru Tesisleri** | 4 | 1200₺ · 2300₺ · 3000₺ · 3200₺ |

## 9.1 Veri Modeli, Güvenlik & Altyapı
- **Tek kanonik model (SSOT):** **Tüm uygulama genelinde** her varlık (takım/maç/oyuncu…) için **tek tanım**; mükerrerler birleştirilir/silinir.
- **Tutarlı isimlendirme:** Her yerde **tek standart** (snake_case) + tutarlı eşleme.
- **Demo/mock veri:** **ŞİMDİLİK TAMAMEN SİLİNİR.** Gerçek veri + boş durum ekranları (çökme değil). *(Bkz. Backlog: istek-üzerine demo veri üreteci.)*
- **RLS (erişim kuralları):** Her tabloda RLS; eksik politikalar tamamlanır; zayıf "herkese açık" politikalar kaldırılır.
- **RPC bütünlüğü (ÇOK ÖNEMLİ):** Tüm sunucu işlemleri listelenir, eksikler yazılır, **hepsi prod'a deploy + test** — kusursuz çalışmalı.
- **Edge function güvenliği:** CORS kısıtlanır, **webhook imza doğrulama** eklenir, hepsi güvenli deploy.
- **Secret yönetimi:** Client'ta yalnız anon key; **service-role / iyzico / APNs / FCM** anahtarları **Supabase secrets**'te; `.env` gitignore'da; sızıntı yok.
- **Ölçeklenme:** Mimari **100k+ kullanıcıya rahat** ölçeklenecek şekilde kurulur; **lansman (Ordu) gerçekçi hedef:** ~10–20k kayıtlı, pik ~300–500 eşzamanlı, günde ~100 maç. Eşzamanlı katılım/blokaj **atomik** (kim kazandı net); bildirim **batch**; geo sorguları **index + viewport**; pik senaryoda **yük testi**.
- **Yedekleme & kurtarma:** Supabase otomatik yedek + **point-in-time recovery** + düzenli geri-yükleme provası.

## 10. Tasarım Tonu
- Tüketici: **mevcut görsel dil korunur** (büyük yeniden tasarım yok). Saha sahibi paneli: **B2B, sade, güven veren**.

---

## 10.1 Tasarım Sistemi & UI/UX
- **Görsel dil:** Tüketici tarafı **mevcut görsel dil korunur** (büyük yeniden tasarım yok). Saha sahibi paneli **B2B sade/premium** (Bölüm 1).
- **Tasarım sistemi:** Ortak bileşen kütüphanesi (buton/kart/form/modal/boş-durum) + **tek renk/tipografi kaynağı**; uygulamaya uyumlu; **Claude ile fikir alışverişiyle** oluşturulur.
- **Alt navigasyon (5 sekme):** Ana Sayfa · **Top Oyna (Maç)** · **Sosyal (Takımlar + Arkadaşlar)** · Harita/Sahalar · Profil. *(Orta "Sosyal" sekmesi **kalır**; içeriği topluluk değil **Takımlar + Arkadaşlar**'a açılır.)*
- **Erişilebilirlik:** mevcut hal iyi; minimum standartlar (kontrast/font/dokunma hedefi/ekran okuyucu) korunur.
- **Performans:** ağır animasyonlar optimize; **ihtiyaç tespit edilince kullanıcıya "düşük hareket" modu önerilir**.
- **Dil:** lansmanda yalnız **Türkçe**; i18n altyapısı hazır.
- **Durum ekranları:** tutarlı/nazik boş-yükleniyor-hata (Ordu az veri için önemli).
- **Marka kiti:** logo/ikon/splash/ekran görüntüleri **tutarlı** (store için).

## 11. Geliştirme Planı (Fazlar)
| Faz | Başlık | Özet |
|---|---|---|
| **0** | Kapsam Daraltma & Temizlik | Kapsam dışını sil; alt navigasyonu yeniden tasarla; ölü kod/mükerrer tip temizliği. |
| **1** | Veri Modeli & Gerçek Veri | Tek kanonik tip; mock→gerçek; DEV_MODE prod kapalı; **Ordu seed (4 tesis)**. |
| **2** | Para Akışı & Komisyon ⚠️ | Model A + Model B; çok seviyeli ayarlanabilir komisyon; **iki haftalık** payout (kaleci/hakem anında). |
| **3** | Rezervasyon & Maç Çekirdeği | Uçtan uca gerçek + "başarılı maç" sinyali. |
| **4** | Saha Sahibi B2B | Panel + B2B ton (+ saha sahibi sınırları #20'ye göre). |
| **5** | Kaleci/Hakem | Gerçek teklif/kabul + %10 + payout. |
| **6** | Takım & Taktik | Takım + arkadaşlar + takım-içi taktik (oylama/yorum/favori) + 1-1 mesaj; çoklu yönetici. |
| **7** | Güvenlik, Altyapı & Store | RLS; edge function deploy + güvenlik; çoklu-rol uygulama-içi geçiş; iOS/Android; test. |

## 11.1 Lansman, Store & Operasyon
- **İşletme:** Şahıs şirketi — **Miraç Kerem Çürüksulu**. Store hesapları (Apple Developer + Google Play) şirket adına.
- **Uygulama kimliği:** `com.oyna.app`; ad **"OYNA"** (kesin).
- **iOS:** **Sign in with Apple** (Google girişi olduğu için zorunlu) · gizlilik etiketleri (konum/ödeme/iletişim) · izin açıklama metinleri (konum/kamera/bildirim) · yaş derecesi.
- **Android:** imza anahtarı (keystore) · izinler (internet/konum/kamera/bildirim) · güncel hedef SDK · Play "Veri Güvenliği" formu.
- **Yaş derecesi:** ödeme + 18-altı + sosyal içeriğe uygun derece + ebeveyn bilgisi (Bölüm 3 ile uyumlu).
- **Yasal (YAPILACAK):** KVKK/Sözleşme/Mesafeli Satış/Gizlilik metinleri **hukukçu onaylı hazırlanacak** (şirket bilgileriyle); **iyzico sözleşmesi/KYC** yapılacak. *(Şirket kuruldu.)*
- **Aşamalı lansman:** Kapalı beta (Ordu seçili saha+kullanıcı) → soft launch (Ordu) → genişleme.
- **Test:** Kritik akışlar (ödeme, maç katılımı, rezervasyon, payout) **uçtan uca test**; kapsam ~%5'ten yükseltilir; **test fazlara yayılır** (sadece sonda değil).
- **İzleme & Destek:** hata izleme + temel analytics; destek kanalı **e-posta + WhatsApp**; **admin paneli ana kontrol/çözüm noktası** (god-mode).

## 11.2 Lansman Checklist (olmazsa-olmaz)
- [ ] Gerçek ödeme (iyzico) uçtan uca: blokaj → tahsil → payout → iade.
- [ ] Tüm RLS politikaları tam + test.
- [ ] Tüm RPC'ler deploy + test; edge function'lar güvenli deploy.
- [ ] Push (APNs+FCM) çalışıyor; bildirim trigger'ları aktif.
- [ ] Demo/mock veri temizlendi; Ordu gerçek verisi (4 tesis) girildi.
- [ ] Kritik akış uçtan uca testleri geçiyor.
- [ ] Yasal metinler (hukukçu onaylı) + iyzico sözleşmesi.
- [ ] Store gereksinimleri (iOS/Android) tamam.
- [ ] Yedekleme + izleme aktif.

## 12. 📌 Hatırlatma / Backlog
- [ ] Maç sonu oyuncu değerlendirme sayfası (fair-play'i besler).
- [ ] Takımlar + Arkadaşlar geliştir.
- [ ] Takım-içi taktik: oylama/yorum/favori; stüdyo takım arayüzünde.
- [ ] Komisyon motoru: global/saha/hizmet/maç override.
- [ ] Alt navigasyon: "Sosyal" sekmesi **Takımlar + Arkadaşlar**'a açılır (topluluk içeriği yok).
- [ ] Çoklu rol + re-login akışı.
- [ ] İki taraflı (oyuncu + saha sahibi) maç açma/düzenleme sistemi.
- [ ] **İstek-üzerine demo veri üreteci** — "oluştur" komutuyla demo veri yaratır (admin/dev); canlıda kapalı.
- [ ] Tek kanonik veri modeli + tutarlı isimlendirme (tüm uygulama).
- [ ] Tüm RPC'lerin envanteri + eksik tamamlama + deploy/test (kritik).
- [ ] RLS politikalarının tamamlanması + edge function güvenliği.

## 13. 🔓 Açık Kalemler (dış bağımlılıklar)
- **Yasal metinlerin hukukçu onaylı finalizasyonu** + **iyzico sözleşmesi/KYC**.
- Asgari kayıt yaşı (öneri: 15) — son onay.
- Format etiketi XvX kaleci dahil mi (taraf başına toplam) — uygulama detayı.

---

## 14. 📝 Revizyon Notları (02.07.2026 — kod↔doküman hizalaması)

Kod tabanı denetiminde doküman ile uygulamanın sessizce ayrıştığı noktalar tespit edildi.
"Tek kaynak" ilkesi bu doküman için de geçerli olsun diye ayrışmalar burada kayıt altına alındı.

### 14.1 Revize edilen kararlar
- **Misafir girişi (§3.1 revize ÖNERİSİ):** Eski karar "lansmanda YOK" idi. Uygulamada misafir
  modu **değer kapılı** hale getirildi: misafir yalnız gezinir (Top Oyna), yazma aksiyonlarında
  (maça katıl/ödeme) kayıt daveti açılır; sahte kimlikle işlem mümkün değil (`isGuest` +
  `SignupGate`). Ertelenmiş onboarding modeliyle tutarlı olduğundan **lansmanda kalması
  önerilir** — ⚠️ kurucu onayı bekliyor; reddedilirse `AuthScreen`'deki buton kaldırılır.
- **Onboarding (§3.1 revize):** "Sayfa sayfa zorunlu sihirbaz (ad-soyad→telefon→foto→konum)"
  yerine kodda **onaylanmış ertelenmiş model** geçerli: 3 ekran değer anlatımı → Auth →
  bağlamsal konum izni; profil tamamlama ilk maç akışına ertelenir. Zorunlu profil fotoğrafı
  kararı bu modelle birlikte düştü.
- **Hesap silme (§3.1 uygulandı):** "Aktif rezervasyon varken engellenir" kuralı DB'ye işlendi
  (`20260709000001_account_deletion_active_booking_guard.sql`): aktif saha rezervasyonu veya
  bloke/tahsil edilmiş yaklaşan maç katılımı varken silme reddedilir. Bekleme süresi tek
  kaynaktan (`app_config.account_deletion_wait_days`, varsayılan **7 gün**; UI eşitlendi).

### 14.2 Bu temizlikte kapatılan kalıntılar (§2 kapsam dışı)
- Oyuncu Premium/Pro kalıntıları (`isPro`, `proPrice`, admin Pro toggle) kaldırıldı.
- TeamCreator'daki Topluluk prop'u + hardcoded "Boğaziçi Üniversitesi" verisi kaldırıldı.
- Kapsam dışı feature-flag kalıntıları (aiCoach/scoutSystem) ayıklandı.
- Kullanıcıya görünen İstanbul kalıntıları Ordu'ya çevrildi/temizlendi (§9).

### 14.3 Hâlâ açık (bilinçli, sıraya alındı)
- **§7.1 tek skor:** `rating`/`fairPlayScore`/`reliabilityScore` hâlâ ayrı — DB+UI koordineli
  refactor gerektirir; lansman engeli değil.
- **§4.5 ücretsiz sahalar & yaş matrisi:** `is_free` kavramı henüz yok — ayrı faz olarak yapılacak.
- **§8.2 Studio modülerleştirme** ve **§10.1 i18n altyapısı** — lansman sonrası.
