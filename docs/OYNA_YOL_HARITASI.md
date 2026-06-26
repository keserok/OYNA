# 🗺️ OYNA — Detaylı Geliştirme Yol Haritası

> **Amaç:** `OYNA_MASTER_PRENSIPLER.md`'deki kararları, **adım adım, neyi-neden-hangi sonuçla** yapacağımızı gösteren uygulama planına dönüştürmek.
> **Hedef:** Karışıklıkları gidermek → binlerce kullanıcı, saha sahibi, kaleci, hakem sorunsuz → canlıya + store.
> **Lansman şehri:** Ordu (4 tesis).

## Bu belge nasıl okunur
- Her görev üç bilgiyle gelir: **🔧 Ne** (yapılacak), **🎯 Neden** (sebebi), **✅ Sonuç** (elde edilecek).
- **Efor:** 🟢 küçük · 🟡 orta · 🔴 büyük (mutlak süre ekip büyüklüğüne bağlı; bu sıralama **bağımlılık** önceliğine göre kurulmuştur — yani önceki faz bitmeden sonraki sağlıklı ilerlemez).
- **Sürekli izlekler** (güvenlik, test, tasarım sistemi) tek faza sıkışmaz; her fazda az az ilerler.

---

## 🔭 Genel Akış

```
FAZ 0 Temizlik → FAZ 1 Veri Temeli → FAZ 2 Para Motoru → FAZ 3 Rezervasyon+Maç
   → FAZ 4 Saha Sahibi → FAZ 5 Kaleci/Hakem → FAZ 6 Takım/Taktik
   → FAZ 7 Güvenlik+Bildirim+Store → 🚀 Kapalı Beta → Soft Launch (Ordu) → Genişleme
```

**Neden bu sıra?** Önce **gereksizi atıp** (Faz 0) zemini sadeleştiriyoruz; sonra **sağlam veri temeli** (Faz 1) kuruyoruz; sonra **para motoru** (Faz 2) çünkü gelir ve neredeyse her akış buna bağlı; sonra **çekirdek kullanıcı akışları** (Faz 3); sonra **arz tarafı** (Faz 4 saha sahibi — büyüme stratejisi buna dayanıyor); sonra **kaleci/hakem** (Faz 5) ve **sosyal çekirdek** (Faz 6); en sonda **güvenlik/altyapı/store** ile **yayına** çıkıyoruz.

## 🔁 Sürekli İzlekler (her fazda)
- **🔒 Güvenlik:** Her yeni veri/işlemde erişim kuralı (RLS) ve gizli anahtar disiplini. *Neden:* Sona bırakılırsa açık birikir. *Sonuç:* Baştan güvenli sistem.
- **🧪 Test:** Faz 2'den itibaren kritik akışlar uçtan uca test edilir. *Neden:* Para/maç akışında hata pahalıdır. *Sonuç:* Her faz "çalıştığı kanıtlanmış" biter.
- **🎨 Tasarım Sistemi:** Ortak bileşen kütüphanesi Faz 1'de kurulur, sonraki tüm ekranlar onu kullanır. *Neden:* Tutarlılık + hız. *Sonuç:* Her ekran aynı dilde, hızlı üretilir.

---

# FAZ 0 — Temizlik & Kapsam Daraltma 🧹
**Amaç:** Kapsam dışı her şeyi silerek kod tabanını sadeleştirmek; "karışıklık"ı kaynağında bitirmek.
**Önkoşul:** Yok (ilk adım).

### Görevler
**0.1 — Kapsam dışı modülleri sil** 🔴
- 🔧 **Ne:** Turnuvalar, Topluluklar (+`COMMUNITY_ADMIN`), AI Koç (+Gemini), OYNA TV, Lider Tabloları, ELMAS/KARAT motoru, rozetler/başarımlar, Saha SaaS (entitlement), Oyuncu Premium, Sadakat kartı, Scout/Transfer merkezi, maç-içi grup sohbeti — ilgili ekran/servis/route'lar.
- 🎯 **Neden:** MVP'de yoklar; durdukça hem kafa karıştırıyor hem bakım yükü yaratıyor hem performansı düşürüyorlar.
- ✅ **Sonuç:** Yalnızca lansman kapsamını içeren, %30–40 daha küçük, anlaşılır bir kod tabanı.

**0.2 — Ölü/çift kodu temizle** 🟡
- 🔧 **Ne:** Mock `MatchLobby`'yi, ikinci admin panelini (`views/AdminDashboard`), kullanılmayan eski dosyaları (`arsiv/` zaten ayrı) ve atıl route'ları kaldır.
- 🎯 **Neden:** Çift/ölü kod, "hangisi doğru?" karmaşası ve hata kaynağı.
- ✅ **Sonuç:** Tek doğru panel (`admin-panel/`), tek maç ekranı; belirsizlik biter.

**0.3 — Alt navigasyonu sadeleştir** 🟢
- 🔧 **Ne:** 5 sekme: Ana Sayfa · Top Oyna · **Sosyal (Takımlar+Arkadaşlar)** · Harita/Sahalar · Profil. Eski "Topluluk" içeriği kalkar, "Sosyal" yeniden hedeflenir.
- 🎯 **Neden:** Topluluk gidince navigasyonun ortası boş kalır; kullanıcı kaybolmamalı.
- ✅ **Sonuç:** Net, lansman kapsamına uygun ana menü.

**📦 Faz Sonu Çıktısı:** Uygulama çalışıyor, yalnızca MVP modülleri var, kod sade. **Risk:** Silinen modüle gizli bağımlılık → derleme hatası; dikkatli sökme + derleme kontrolü.

---

# FAZ 1 — Veri Temeli & Gerçek Veri 🧱
**Amaç:** Tek tutarlı veri modeli + gerçek veritabanı; sahte veri bağımlılığını bitirmek.
**Önkoşul:** Faz 0.

### Görevler
**1.1 — Tek kanonik veri modeli (SSOT)** 🔴
- 🔧 **Ne:** Aynı şey için çoklu tanımları birleştir: `Team/ITeam`→tek `Team`; `Match/IMatch/MatchListing`→tek `Match`; `Player/PlayerCard/PlayerCardData`→net ayrım (sahadaki oyuncu ≠ profil kartı).
- 🎯 **Neden:** Çoklu tanım = bir yeri güncelleyince diğeri eski kalır → "bir ekranda 5, diğerinde 6 kişi" hataları (gidermek istediğiniz karışıklığın özü).
- ✅ **Sonuç:** Her veri için tek doğru tanım; tutarlı ekranlar.

**1.2 — Tutarlı isimlendirme + tek formasyon kaynağı** 🟡
- 🔧 **Ne:** Her yerde `snake_case` standardı (örn. `tactics."userId"`→düzelt); tek `FORMATIONS` kaynağı (harita/maç/stüdyo aynı koordinatları kullansın).
- 🎯 **Neden:** Tutarsız isim = "sessiz hata" (bilgi kaydolmaz/gelmez); tutarsız koordinat = oyuncuların ekrandan ekrana kayması.
- ✅ **Sonuç:** Sessiz hatalar biter; diziliş her ekranda aynı görünür.

**1.3 — Mock veriyi tamamen kaldır + boş durum ekranları** 🟡
- 🔧 **Ne:** `DEV_MODE`/`IS_LOCAL_DEV` sahte beslemeyi sök; veri yoksa nazik "henüz yok" ekranı; (ayrı) "ben oluştur deyince" çalışan **istek-üzerine demo veri üreteci** (yalnız admin/dev).
- 🎯 **Neden:** Canlıda sahte veri = gerçek olmayan saha/maç + ödeme çalışmaması; boş ekran yoksa uygulama çöker.
- ✅ **Sonuç:** Her şey gerçek veriden; veri azken bile güzel görünüm; demo veri istendiğinde üretilebilir.

**1.4 — Ordu verisini kur** 🟢
- 🔧 **Ne:** Harita merkezi ve ilçe listesini Ordu'ya çevir; 4 tesisi (Capo Arena, Olimpiyat, VIP Arena, Ahmet Kuru) kort/fiyatlarıyla gir.
- 🎯 **Neden:** Lansman Ordu; İstanbul demo verisi yanlış şehir gösterir.
- ✅ **Sonuç:** Açılışta gerçek Ordu sahaları; doğru harita.

**1.5 — Tasarım sistemi iskeleti** 🟡
- 🔧 **Ne:** Ortak bileşenler (buton/kart/form/modal/boş-durum) + tek renk/tipografi kaynağı; tüketici (mevcut dil korunur) + saha sahibi (B2B) iki tema. *(Claude ile fikir alışverişiyle.)*
- 🎯 **Neden:** Sonraki tüm ekranlar bunu kullanacak; baştan kurulmazsa tutarsızlık birikir.
- ✅ **Sonuç:** Tutarlı, hızlı üretilebilen arayüz temeli.

**📦 Faz Sonu Çıktısı:** Uygulama %100 gerçek Supabase verisiyle, tutarlı modelle, Ordu'ya hazır çalışıyor. **Risk:** Tip birleştirme geniş dokunur; adım adım + test ile.

---

# FAZ 2 — Para Akışı & Komisyon Motoru 💰 (EN KRİTİK)
**Amaç:** Gerçek para: tahsilat, blokaj, komisyon, iade, payout.
**Önkoşul:** Faz 1 (sağlam veri).

### Görevler
**2.1 — iyzico pazaryeri entegrasyonu** 🔴
- 🔧 **Ne:** Alt-üye işyeri (sub-merchant) kurulumu; **ön-provizyon (blokaj) → tahsil (capture) → iptal (void)** akışı; güvenli webhook (imza doğrulamalı). Gizli anahtarlar Supabase secrets'te.
- 🎯 **Neden:** Tüm gelir ve "maç tutmazsa kimse ödemez" mantığı buna bağlı; webhook doğrulanmazsa sahte "ödendi" ile bedava rezervasyon riski.
- ✅ **Sonuç:** Gerçek para güvenle akıyor; blokaj/tahsil/iptal çalışıyor.

**2.2 — Komisyon motoru (çok seviyeli, admin ayarlı)** 🔴
- 🔧 **Ne:** Global/saha/hizmet/maç bazında ayarlanabilir oran; **Model A** (kaporanın %15'i) + **Model B** (saha %95 + değişken markup) + **kaleci/hakem %10**.
- 🎯 **Neden:** Gelir modeliniz bu; saha sahibi değiştiremez, admin esnek ayarlar.
- ✅ **Sonuç:** Her senaryoda doğru komisyon; admin panelinden anında oran değişimi.

**2.3 — OYNA bakiyesi + payout + iade** 🔴
- 🔧 **Ne:** İki tür bakiye (kazanç → IBAN'a payout / iade kredisi → yalnız OYNA-içi); **saha sahibi 2 haftalık** otomatik payout, **kaleci/hakem anında**; kademeli iade motoru (kesintiler hesaplanır).
- 🎯 **Neden:** Para herkese doğru zamanda, doğru tutarda ulaşmalı; iade kuralları net olmalı.
- ✅ **Sonuç:** Kazanç/iade/payout uçtan uca; herkes parasını öngörülebilir alır.

**2.4 — 18 yaş altı ödeme (veli onayı)** 🟡
- 🔧 **Ne:** 18 altı kullanıcı ödeme adımında **yetişkin kartı + açık onay** girer; kayıt anında KVKK veli onayı.
- 🎯 **Neden:** Yasal zorunluluk (reşit olmayan kart sahibi olamaz; çocuk verisi korunur).
- ✅ **Sonuç:** Gençler yasal şekilde, yetişkin onayıyla ödeyebilir.

**📦 Faz Sonu Çıktısı:** Sandbox'ta gerçek ödeme uçtan uca çalışıyor (blokaj→tahsil→komisyon→payout→iade). **Risk:** Sağlayıcı/lisans gereksinimleri; hukukçu+iyzico teyidi paralel yürür.

---

# FAZ 3 — Rezervasyon & Maç Çekirdeği ⚽
**Amaç:** İki ana kullanıcı akışını gerçek ve ödemeye bağlı kurmak.
**Önkoşul:** Faz 2 (para motoru).

### Görevler
**3.1 — Doğrudan saha rezervasyonu** 🟡
- 🔧 **Ne:** "Sahayı Kirala" akışı; tek kişi kaporayı öder, saha müsaitse anında rezerve; müsaitlik = tarife+rezervasyon+abonelik+istisna birleşik; "Rezervasyonlarım" (iptal/yol tarifi/tekrar rezerve/maça çevir).
- 🎯 **Neden:** Halı saha kullanımının en temel hâli; müsaitlik birleşik değilse çifte rezervasyon olur.
- ✅ **Sonuç:** Oyuncu gerçekten saha kiralayabilir; çakışma olmaz.

**3.2 — Maç yaşam döngüsü (Plei-uyarlı)** 🔴
- 🔧 **Ne:** Maç oluştur→hemen yayınla→katılım **blokajla**→**T-8s onayda** (min %70) tahsil+kesin rezerve / tutmazsa otomatik iptal+serbest; yedek otomatik terfi; "Maçlarım" tek yönetim ekranı (eski MatchLobby silinir).
- 🎯 **Neden:** "Boş maç yayınlama / oynamayan maça para alma" sorununu çözer; herkesten zamanında, adilce tahsil.
- ✅ **Sonuç:** Maçlar güvenle dolar, onaylanır, oynanır; kimse boşa ödemez.

**3.3 — Maç oluşturma & format & keşif** 🟡
- 🔧 **Ne:** 2v2–11v11 kaydırılabilir format; açık/özel maç (özel kod); pozisyon etiketi; harita+liste+filtre (tarih/saat dahil) keşif; kaleci/hakem ekleme (bireysel/oylama).
- 🎯 **Neden:** Kullanıcı maçı kolayca kurup bulmalı; keşif "mükemmel" olmalı.
- ✅ **Sonuç:** Maç kurma ve bulma akıcı; "Top Oyna" canlı.

**3.4 — Maç sonu: skor, değerlendirme, başarılı-maç sinyali** 🟡
- 🔧 **Ne:** Opsiyonel skor (oyuncu/hakem/saha sahibi); 2-sayfa hızlı değerlendirme (fair-play + kaleci/hakem 1–10); **otomatik "başarılı maç"** işareti (ödendi+oynandı+iptal yok); fair-play güncelleme.
- 🎯 **Neden:** Ana başarı metriğiniz "başarılı oynatılan maç" — bunun güvenilir sinyali şart.
- ✅ **Sonuç:** Admin paneli gerçek "başarılı maç" sayısını gösterir; fair-play işler.

**📦 Faz Sonu Çıktısı:** Bir oyuncu sahayı bulur → rezerve/maç açar → öder → oynar → sistem "başarılı maç" sayar. **Risk:** Eşzamanlı katılım yarışı; atomik kilit + test.

---

# FAZ 4 — Saha Sahibi B2B Paneli 🏟️
**Amaç:** Saha sahibinin her şeyi sorunsuz yönettiği SaaS-kalitesinde panel.
**Önkoşul:** Faz 1–3 (veri, para, rezervasyon).

### Görevler
**4.1 — Tesis kurulumu (2 yol) + onboarding** 🟡
- 🔧 **Ne:** Admin panelinden tesis direkt kurulup yayınlanır (her şehir); saha sahibi arayüzünde "Başvuru Yap" formu (numara+talep) → admin.
- 🎯 **Neden:** Owner-led büyüme: önce sahalarla anlaşıp sisteme alıyoruz; saha sahibi tek başına canlı yayın yapmaz (kalite kontrol).
- ✅ **Sonuç:** Sahalar hızlı ve kontrollü eklenir; oyuncular görür.

**4.2 — Takvim + rezervasyon yönetimi** 🔴
- 🔧 **Ne:** Kort×saat matrisi (renk kodlu, tüm kaynaklar birleşik); manuel rezervasyon (kendi defteri); app-booking onay/red (otomatik onay süresi ayarlı, varsayılan 15dk).
- 🎯 **Neden:** Halı saha işinin kalbi takvim; telefonla gelen müşteri de girilebilmeli.
- ✅ **Sonuç:** Saha sahibi tüm doluluğu tek ekrandan yönetir.

**4.3 — Tarife, abonelik, flash indirim, istisna** 🟡
- 🔧 **Ne:** Zaman bazlı tarifeler + kapora; owner-yönetimli abonelik (otomatik haftalık üretim); flash indirim; kapalı saat/bakım/tatil.
- 🎯 **Neden:** Gerçek işletme ihtiyaçları (sabit takım saatleri, boş saat doldurma).
- ✅ **Sonuç:** Esnek fiyatlama + abonelik + doluluk optimizasyonu.

**4.4 — Finans, payout, veresiye, personel** 🟡
- 🔧 **Ne:** Gelir (komisyon sonrası) + 2 haftalık payout görünümü + işlem geçmişi; veresiye (kendi offline defteri); personel/görev.
- 🎯 **Neden:** Saha sahibi parasını ve işletmesini şeffaf görmeli (güven).
- ✅ **Sonuç:** İkna edici, "her şey burada" B2B deneyimi.

**📦 Faz Sonu Çıktısı:** Saha sahibi tesisini, takvimini, fiyatını, parasını sorunsuz yönetir. **Risk:** Çok modül; SaaS kalite çıtası yüksek → öncelik takvim+rezervasyon+finans.

---

# FAZ 5 — Kaleci & Hakem 🧤
**Amaç:** Kaleci/hakem kiralamayı gerçek hâle getirmek (3. gelir akışı).
**Önkoşul:** Faz 2–3 (para, maç).

### Görevler
**5.1 — Başvuru, doğrulama, profil** 🟡
- 🔧 **Ne:** Aynı hesaba rol başvurusu + admin OPERASYON onayı (hakem: lisans belgesi); ServiceDashboard (müsaitlik, talepler, kazanç, puan).
- 🎯 **Neden:** Güvenli, doğrulanmış hizmet sağlayıcı havuzu.
- ✅ **Sonuç:** Onaylı kaleci/hakemler sistemde.

**5.2 — Tek "talep" modeli + eşleştirme + ödeme** 🟡
- 🔧 **Ne:** Karışık JobListing/DirectOffer/IncomingBid → tek talep akışı; çakışma kontrolü (PENDING dahil); sistem müsait+yakın+yüksek puanlıyı önerir; sabit ücret + %10 komisyon; **maç sonu değerlendirme sonrası anında** kazanç.
- 🎯 **Neden:** Basit, net süreç; kaleci/hakem emeğinin karşılığını hızlı almalı.
- ✅ **Sonuç:** Kaleci/hakem kiralanır, oynar, puanlanır, anında ödenir.

**📦 Faz Sonu Çıktısı:** Maçlara kaleci/hakem eklenip ödenebiliyor; hakem skoru resmî kayıt. **Risk:** Eşleştirme adaleti; basit kurallarla başla.

> **✅ Uygulandı** (`20260706000001_faz5_service_engine.sql` + servis/UI): Tek `service_requests` talep modeli (JobListing/DirectOffer/IncomingBid birleşti) · `find_providers_for_match` sıralı öneri (kaptan seçer) · sabit ücret + %10 komisyon · maç onayında otomatik tahsil → maç sonu **1-10** değerlendirme ile **anında** payout · onboarding (kimlik foto + tel + niyet mektubu, admin onaylı) · ilk payout öncesi **TC kimlik** kapısı. **Bireysel ödeme** yolu kuruldu; **kadro oylaması (%50+1)** hızlı takip olarak işaretlendi. **Kalan:** gerçek iyzico blokaj/capture (proje geneli #1/#2) + uçtan uca test (#15).

---

# FAZ 6 — Takım & Taktik (Sosyal Çekirdek) 🧠
**Amaç:** "Gerçek ürünün" sosyal çekirdeği: takım kur, taktik paylaş.
**Önkoşul:** Faz 1, 3 (veri, maç).

### Görevler
**6.1 — Takımlar + Arkadaşlar** 🟡
- 🔧 **Ne:** Takım kur (max 5) / üyelik sınırsız; çoklu yönetici, devir/arşiv; takım sayfası (kart yok, W/L onaylı skorlardan); takım vs takım (özel kod); arkadaş ekle/engelle/gizlilik; 1-1 mesaj.
- 🎯 **Neden:** Kullanıcılar takım/arkadaşlarıyla oynamak istiyor — elde tutmanın anahtarı.
- ✅ **Sonuç:** Sosyal ağ canlı; takımlar maç yapar, geçmiş tutar.

**6.2 — Taktik Stüdyo + "muazzam" taktik akışı** 🔴
- 🔧 **Ne:** 233KB'lik stüdyoyu modüllere böl; formasyon+yerleştirme+çizim+**animasyon** (akademi yok); takım içinde "En İyi Taktikler" vitrini + **% oylama/yorum/favori** + "aktif taktik" + "kopyala&öner".
- 🎯 **Neden:** Sizin asıl hayaliniz; akış muhteşem olmalı, ağır dosya performansı düşürmemeli.
- ✅ **Sonuç:** Takım içi taktik paylaşımı keyifli ve akıcı; düşük telefonlarda bile akıcı.

**📦 Faz Sonu Çıktısı:** Takım kur, taktik çiz/paylaş/oyla, arkadaşınla mesajlaş, takım maçı yap. **Risk:** Stüdyo karmaşıklığı; önce çekirdek (formasyon+çizim), sonra animasyon.

---

# FAZ 7 — Güvenlik, Bildirim, Altyapı & Store 🔒🚀
**Amaç:** Üretime ve store'a hazır: güvenli, ölçeklenir, onaylanabilir.
**Önkoşul:** Faz 0–6 (çekirdek hazır).

### Görevler
**7.1 — Güvenlik tamamlama** 🔴
- 🔧 **Ne:** Tüm tablolarda erişim kuralı (RLS); kodun çağırdığı tüm sunucu işlemleri (RPC) envanterlenip eksikler yazılır ve **deploy+test**; sunucu uçları (edge function) güvenli; gizli anahtarlar kasada.
- 🎯 **Neden:** Açık erişim = veri sızıntısı/KVKK; eksik işlem = özelliğin çalışmaması; açık uç = para riski.
- ✅ **Sonuç:** Güvenli, eksiksiz çalışan sistem.

**7.2 — Bildirim sistemi** 🟡
- 🔧 **Ne:** Supabase realtime bildirim merkezi + push (APNs/FCM yalnız iletim) + e-posta (makbuz/payout); şablonlar; deep link; admin hedefli broadcast; tercihler+sessiz saatler.
- 🎯 **Neden:** Maç onayı/iptal/davet/ödeme bildirimleri kritik; kullanıcı bağlı kalır.
- ✅ **Sonuç:** Doğru anda doğru bildirim; admin duyuru yapabilir.

**7.3 — Admin GodView tamamlama** 🟡
- 🔧 **Ne:** `admin-panel/` tek panel; 2FA; **detaylı Maç Kontrol Paneli** (slot/oyuncu/ödeme müdahalesi, force-confirm/iptal/iade, skor override, payout tetik); tek audit; ghost-mode güvenliği.
- 🎯 **Neden:** "Herhangi bir problem panelden çözülebilir" ilkesi; operasyonun kalbi.
- ✅ **Sonuç:** Tam yetkili, her sorunu çözebilen kontrol merkezi.

**7.4 — Ölçeklenme, yedekleme, izleme** 🟡
- 🔧 **Ne:** Kritik tablolarda index; eşzamanlı katılım atomik; yük testi (pik ~300–500 eşzamanlı); otomatik yedek + geçmişe dönüş; hata izleme + analytics.
- 🎯 **Neden:** Binlerce kullanıcıda donma/çifte rezervasyon olmamalı; felakette geri dönülmeli.
- ✅ **Sonuç:** Sistem kalabalığı kaldırır, izlenir, kurtarılabilir.

**7.5 — Mobil & Store hazırlık** 🔴
- 🔧 **Ne:** iOS (Sign in with Apple, gizlilik etiketleri, izin metinleri, yaş derecesi) + Android (keystore, izinler, hedef SDK, veri güvenliği formu); çoklu-rol re-login; marka kiti (logo/ikon/splash/ekran görüntüleri).
- 🎯 **Neden:** Bunlar olmadan App Store/Play onayı alınamaz.
- ✅ **Sonuç:** Store'a yüklenmeye hazır iki platform.

**📦 Faz Sonu Çıktısı:** Güvenli, ölçeklenir, izlenen, store-uyumlu uygulama. **Risk:** Apple/Google onay süreçleri; erken başvuru + checklist.

---

# 🚀 LANSMAN AŞAMASI
**L.1 — Kapalı Beta (Ordu, seçili saha+kullanıcı)** — *Neden:* Gerçek parayı/akışları küçük grupta test edip hataları erken yakalamak. *Sonuç:* Kanıtlanmış çekirdek.
**L.2 — Soft Launch (Ordu geneli)** — *Neden:* Kontrollü gerçek kullanım; saha sahipleri oyuncularını yönlendirir. *Sonuç:* İlk gerçek "başarılı maçlar" + geri bildirim.
**L.3 — Genişleme (diğer şehirler)** — *Neden:* Mimari 100k+'a hazır; admin her şehirden saha ekleyebilir. *Sonuç:* Ölçekli büyüme.

### ✅ Lansman Öncesi Olmazsa-Olmaz (Checklist)
- [ ] Gerçek ödeme uçtan uca (blokaj→tahsil→payout→iade)
- [ ] Tüm RLS + RPC deploy + test; edge function güvenli
- [ ] Push çalışıyor; demo veri temiz; Ordu verisi girili
- [ ] Kritik akış uçtan uca testleri geçiyor
- [ ] Yasal metinler (hukukçu) + iyzico sözleşmesi
- [ ] iOS/Android store gereksinimleri + yedekleme/izleme

---

## 📊 Özet Tablo

| Faz | Başlık | Ana Sonuç | Efor |
|---|---|---|---|
| 0 | Temizlik | Sade, MVP-only kod tabanı | 🔴 |
| 1 | Veri Temeli | Tek model + gerçek veri + Ordu | 🔴 |
| 2 | Para Motoru | Gerçek ödeme/komisyon/payout/iade | 🔴 |
| 3 | Rezervasyon+Maç | Çekirdek akış + "başarılı maç" | 🔴 |
| 4 | Saha Sahibi | SaaS-kalitesinde B2B panel | 🔴 |
| 5 | Kaleci/Hakem | 3. gelir akışı çalışır | 🟡 |
| 6 | Takım/Taktik | Sosyal çekirdek + taktik akışı | 🔴 |
| 7 | Güvenlik+Store | Üretime/store'a hazır | 🔴 |
| 🚀 | Lansman | Beta → Soft Launch → Genişleme | — |

> **İlke:** Her faz, bir öncekinin üstüne sağlam basar; her görev bittiğinde **elle tutulur, test edilmiş bir sonuç** verir. Böylece her an "nerede olduğumuzu" ve "ne kazandığımızı" net görürüz.
