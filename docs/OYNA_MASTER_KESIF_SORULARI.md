# 🎯 OYNA — Master Keşif Soruları (200 Soru)

> **Amaç:** Bu belge, OYNA uygulamasının **nihai prensiplerini, akışlarını, UI/UX mantığını ve sistem mentalitesini** içerecek olan **Master Dokümantasyon**'u oluşturmadan önce, tüm belirsizlikleri gidermek için hazırlanmıştır.
>
> **Nasıl kullanılır:** Her sorunun altındaki `**Cevap:**` satırına yanıtınızı yazın. Kısa cevaplar yeterli (örn. "Evet, lansmanda", "Sonraya", "Sadece İstanbul"). Emin olmadığınız yerlere `?` koyabilirsiniz; birlikte netleştiririz.
>
> **Sonraki adım:** Soruları yanıtladığınızda, cevaplar doğrultusunda `OYNA_MASTER_PRENSIPLER.md` (tüm sistemin nihai hali) yazılacaktır.
>
> **Hedef:** Karışıklıkları gidermek → binlerce kullanıcı, saha sahibi, kaleci ve hakem için sorunsuz → canlıya alma ve store'lara yükleme.

---

## 📋 Analiz Özeti — Tespit Edilen Ana Karışıklıklar

8 alanın derin kod analizi sonucunda öne çıkan sistemik sorunlar (sorular bunları çözmeye yönelik):

1. **Para akışı tamamen simülasyon** — Ödeme havuzu, kapora, cüzdan (sabit 450₺), premium, Param/iyzico entegrasyonu mock. Gerçek tahsilat/komisyon/iade/payout yok. **(Canlı için #1 bloker)**
2. **Mock vs gerçek veri ikiliği** — `IS_LOCAL_DEV`/`DEV_MODE` her yerde mock besliyor; prod fallback'leri belirsiz.
3. **Mükerrer tipler & çoklu kaynak** — `Team/ITeam`, `Match/IMatch/MatchListing`, `Player/PlayerCard/PlayerCardData`; iki admin paneli; çakışan store slice'ları.
4. **Ölü/yarım modüller** — `MatchLobby` (mock), skor token & itiraz akışı yarım, `RefereeScoreModule` DB'ye yazmıyor, `TransferCenter` amacı belirsiz.
5. **Tutarsız formasyon koordinatları** — Studio / TeamLineupBoard / MatchJoin farklı (tek kaynak yok).
6. **Güvenlik açıkları** — Ghost mode URL ile tetiklenebiliyor; edge function'lar deploy edilmemiş; `admin-create-user` CORS `*`; payment-webhook imza doğrulaması yok; push secrets boş.
7. **Eksik RLS** — friendships, community_members, team_members, tactics, match_disputes, tournaments, promo_codes politikaları belirsiz/eksik.
8. **Rol belirsizliği** — `CAPTAIN`, `COMMUNITY_ADMIN`, `SUPER_ADMIN` kayıt akışında yok; çoklu rol mantığı net değil.
9. **Yasal eksiklik** — KVKK/sözleşme metinleri placeholder; hukukçu onayı gerekli.
10. **Düşük test kapsamı** — ~%5 (sadece admin paneli); ödeme/maç/rezervasyon E2E testi yok.

---

# BÖLÜM 1 — Vizyon, Konumlandırma & Kapsam

**1.** OYNA'nın tek cümlelik değer önerisi nedir ve birincil hedef kitle kim: oyuncular mı, saha sahipleri mi, yoksa eşit ağırlıklı çift taraflı pazar mı?
**Cevap:**

**2.** Lansman (v1) için "olmazsa olmaz" modüller hangileri, hangileri v2/sonraya ertelenebilir? (Maç, saha rezervasyon, kaleci/hakem, taktik stüdyo, turnuva, topluluk, AI koç, OYNA TV…)
**Cevap:**

**3.** İlk lansman hangi şehir/bölgede olacak? Coğrafi bir odak var mı (örn. sadece belirli İstanbul ilçeleri)?
**Cevap:**

**4.** Birincil gelir modeli nedir? (Rezervasyon komisyonu / saha sahibi SaaS aboneliği / oyuncu Premium / kaleci-hakem komisyonu — ana motor hangisi?)
**Cevap:**

**5.** "Gerçek ürün" hangisi: halı saha rezervasyon platformu mu, yoksa oyunlaştırılmış sosyal futbol ağı mı? İkisi çakıştığında öncelik kimde?
**Cevap:**

**6.** Rakipler kimler ve OYNA'nın net farkı nedir?
**Cevap:**

**7.** Lansman başarı metriği ne olacak? (Haftalık aktif maç, tamamlanan rezervasyon, GMV, saha sahibi sayısı…)
**Cevap:**

**8.** Arz mı talep mi önce kurulacak? Lansmanda kaç saha sahibi / kaç saha hedefleniyor?
**Cevap:**

**9.** Oyunlaştırma (kartlar, ELMAS/KARAT) çekirdek değer mi, elde tutma (retention) katmanı mı? Para/ödeme ile bağı olacak mı?
**Cevap:**

**10.** Marka tonu (neon cyberpunk, "EFSANE OL" dili) hedef kitleye uygun mu? Saha sahipleri için daha sade/güvenilir bir B2B tonu gerekli mi?
**Cevap:**

---

# BÖLÜM 2 — Roller, Yetkiler & Çoklu Rol

**11.** 7 rol var (SUPER_ADMIN, COMMUNITY_ADMIN, CAPTAIN, PLAYER, GOALKEEPER, REFEREE, OWNER). Lansmanda hangileri aktif olacak? CAPTAIN ayrı bir rol mü, PLAYER'ın bir durumu mu?
**Cevap:**

**12.** Bir kullanıcı aynı anda birden fazla rol taşıyabilir mi (örn. hem PLAYER hem GOALKEEPER)? `roles[]` dizisi nasıl kullanılacak?
**Cevap:**

**13.** Çoklu rol varsa kullanıcı roller arası nasıl geçiş yapacak (rol değiştirici UI) ve "aktif rol" nasıl belirlenecek?
**Cevap:**

**14.** CAPTAIN yetkisi nasıl kazanılır? Takım kuran herkes kaptan mı olur? Bir takımda birden fazla kaptan olabilir mi?
**Cevap:**

**15.** COMMUNITY_ADMIN nasıl atanır ve yetkileri tam olarak nedir (üye onayı, maç doğrulama, ban)?
**Cevap:**

**16.** SUPER_ADMIN / platform admin nasıl veriliyor (bootstrap)? Admin alt rolleri (MODERATOR, FINANCE, SUPPORT) lansmanda olacak mı?
**Cevap:**

**17.** Kaleci/Hakem aynı zamanda normal oyuncu olarak maça katılabilir / maç oluşturabilir mi?
**Cevap:**

**18.** Saha sahibi (OWNER) kendi sahasında oyuncu olarak oynayabilir / maç oluşturabilir mi?
**Cevap:**

**19.** Rol bazlı ana ekran doğru mu (PLAYER→Dashboard, GK/REF→ServiceDashboard, OWNER→OwnerPanel)? Kaptanın ayrı ana ekranı olacak mı?
**Cevap:**

**20.** Roller arası "terfi" yolları var mı (oyuncu→kaptan, oyuncu→scout) ve nasıl tetiklenir?
**Cevap:**

---

# BÖLÜM 3 — Kimlik Doğrulama & Onboarding

**21.** Lansmanda hangi giriş yöntemleri olacak: E-posta OTP, Telefon (SMS) OTP, Google, Apple, Misafir? Hepsi mi, bir alt küme mi?
**Cevap:**

**22.** SMS OTP için hangi sağlayıcı kullanılacak (Twilio/Netgsm/İletimerkezi)? Maliyet ve rate-limit stratejisi nedir?
**Cevap:**

**23.** "Misafir Girişi" tam olarak ne yapar? Veri kaydeder mi, hesaba dönüştürülebilir mi, yoksa salt-okunur mod mu?
**Cevap:**

**24.** Telefon mu e-posta mı birincil kimlik? İkisi de eklenince çakışma/birleştirme nasıl yönetilir?
**Cevap:**

**25.** Rol seçimi giriş öncesi mi sonrası mı yapılır? Sosyal login ile gelen kullanıcı rolünü nasıl seçer/değiştirir?
**Cevap:**

**26.** Profil fotoğrafı yükleme akışı var mı, onboarding'de zorunlu mu, hangi aşamada (Supabase Storage)?
**Cevap:**

**27.** Konum izni zorunlu mu, atlanabilir mi? Atlanırsa harita/yakındaki maç özellikleri nasıl davranır?
**Cevap:**

**28.** KVKK, Kullanıcı Sözleşmesi, Mesafeli Satış, Gizlilik metinlerinin nihai (hukukçu onaylı) içerikleri hazır mı? Şirket unvanı/iletişim/MERSİS bilgileri nedir?
**Cevap:**

**29.** Hesap silme (KVKK) tam olarak neyi siler/anonimleştirir? Yasal saklama (maç/ödeme kayıtları) ile nasıl dengelenir? Bekleme süresi var mı?
**Cevap:**

**30.** Yaş sınırı var mı (18+ / reşit olmayan)? Reşit olmayanlar için veli onayı gerekiyor mu?
**Cevap:**

---

# BÖLÜM 4 — Doğrulama & Güven (Kaleci/Hakem/Tesis Onayı)

**31.** Kaleci/Hakem başvurusunu kim, hangi kriterlerle, hangi panelden onaylar? Onay SLA'sı nedir ("24 saat" bağlayıcı mı?)
**Cevap:**

**32.** Onay için hangi belgeler isteniyor (hakem lisansı, kimlik, kaleci için video/referans)? Belge yükleme akışı var mı?
**Cevap:**

**33.** Kaleci için boy≥140cm, yaş≥14 kuralları nihai mi? Hakem seviyeleri (İl/Bölgesel/Klasman/FIFA) nasıl doğrulanır?
**Cevap:**

**34.** Tesis doğrulamasında admin neyi kontrol eder (IBAN, işletme belgesi, konum, fotoğraf, vergi no)?
**Cevap:**

**35.** Reddedilen başvuru tekrar başvurabilir mi? Sınır/bekleme süresi var mı? Red gerekçesi nasıl iletilir?
**Cevap:**

**36.** Doğrulama "pending" iken kullanıcı uygulamada ne yapabilir (tamamen kilitli mi, sınırlı erişim mi)?
**Cevap:**

**37.** Onaylanmış bir kaleci/hakem/tesis sonradan askıya alınabilir / doğrulaması iptal edilebilir mi? Hangi durumlarda?
**Cevap:**

**38.** Tesis sahibinin işletme/fatura bilgileri (vergi dairesi, vergi no, şahıs/şirket) toplanıyor mu? Yasal fatura için gerekli mi?
**Cevap:**

**39.** "Doğrulanmış" rozeti dışında ek güven göstergeleri (kimlik/telefon doğrulama) olacak mı?
**Cevap:**

**40.** Sahte hesap / kötüye kullanım önleme stratejisi nedir (aynı telefon/cihazla çoklu hesap, sahte saha ilanı)?
**Cevap:**

---

# BÖLÜM 5 — Maç Oluşturma & Format

**41.** Maçı kimler oluşturabilir? Sadece kaptan mı, her oyuncu mu? Maç oluşturmak takım gerektirir mi?
**Cevap:**

**42.** Desteklenen formatlar net olarak neler (5+1/6+1/7+1)? "3v3–11v11" aralığı tutarlı mı? Lansmanda hangileri?
**Cevap:**

**43.** Saha seçimi zorunlu mu? OYNA'da kayıtlı olmayan ("dışarıda") saha ile maç oluşturulabilir mi?
**Cevap:**

**44.** Pozisyon slot koordinatları için TEK kaynak ne olacak (Studio/MatchJoin/TeamLineupBoard tutarsızlığı)?
**Cevap:**

**45.** "Açık maç" (eksik oyuncu aranan) ile "özel maç" (iki kapalı takım) ayrımı olacak mı? Akışları nasıl farklılaşır?
**Cevap:**

**46.** Maç "DNA" filtreleri (bütçe, mentalite, yaş, cinsiyet) zorunlu mu opsiyonel mi? Eşleştirmeyi mi görünürlüğü mü etkiler?
**Cevap:**

**47.** Maç oluşturulduktan sonra kullanıcı nereye yönlenmeli — keşfe mi, maç lobisine (MatchJoin) mi?
**Cevap:**

**48.** Kaleci/Hakem maç oluştururken mi sonradan mı çağrılır? Zorunlu mu opsiyonel mi?
**Cevap:**

**49.** Maç taslağı (DRAFT) kaydetme olacak mı? DRAFT→ACTIVE geçişi neyi gerektirir (ödeme, saha onayı)?
**Cevap:**

**50.** Maç oluşturulurken saha rezervasyonu eşzamanlı mı yapılır (slot hold)? Saha sahibi onayı beklenir mi, otomatik mi?
**Cevap:**

---

# BÖLÜM 6 — Maç Katılımı, Kadro & Lobi

**51.** Slota katılım anında mı kesinleşir, yoksa kaptan onayı mı gerekir? Aynı slota eşzamanlı katılımda (race) kim kazanır?
**Cevap:**

**52.** Kadroya katılmak ödeme gerektirir mi (katılınca öde), yoksa önce katıl sonra havuzdan öde mi?
**Cevap:**

**53.** Yedek (reserve) sistemi nasıl çalışır? Biri ayrılınca ilk yedek otomatik mi yükselir? Yedeğe ödeme yapılır mı?
**Cevap:**

**54.** Arkadaş davet / misafir ekleme akışı nasıl? Davet edilen kişi kayıtlı değilse ne olur?
**Cevap:**

**55.** Canlı maç lobisi MatchJoin içinde mi olacak (MatchLobby kaldırıldı)? Nihai tek ekran tasarımı nedir?
**Cevap:**

**56.** Kadro ne zaman "kilitlenir" (LOCKED)? Maça X saat kala mı, kaptan elle mi?
**Cevap:**

**57.** Maçtan ayrılma kuralları: oyuncu son ana kadar ayrılabilir mi? Ödeme yaptıysa iade olur mu? Ceza var mı?
**Cevap:**

**58.** Maç sohbeti lansmanda olacak mı? Maç bazlı mı, 1-1 mi, ikisi de mi? Mesajlar nerede/ne kadar saklanır?
**Cevap:**

**59.** Canlı durum takibi (kaleci/hakem YOLDA/TESİSTE) gerçek mi sembolik mi? Kim günceller?
**Cevap:**

**60.** Maça check-in (QR) nasıl çalışır? Tesis mi okutur, oyuncu mu gösterir? Ödeme/katılım ile ilişkisi nedir?
**Cevap:**

---

# BÖLÜM 7 — Maç Günü, Skor, Hakem Otoritesi & İtiraz

**61.** Maç skorunu kim girer — hakem mi, kaptan mı, ikisi de mi? Hakem yoksa skor otoritesi kimde?
**Cevap:**

**62.** Skor onayı akışı nedir: çift kaptan onayı mı, tek taraflı mı? `match_score_tokens` nasıl kullanılacak?
**Cevap:**

**63.** Skor itirazı (dispute) akışı nasıl işler? Kim açar, kim çözer (admin/moderatör), kanıt zorunlu mu?
**Cevap:**

**64.** Skor, kartları/istatistikleri (ELMAS/KARAT) ne zaman ve nasıl etkiler? "Geri alınamaz mühür" nihai mi?
**Cevap:**

**65.** Maç sonrası değerlendirme (fair play, oyuncu puanı, MOTM, hakem/saha puanı) zorunlu mu? Hangi süre içinde?
**Cevap:**

**66.** MOTM nasıl belirlenir (oylama / hakem / istatistik)? MOTM ödülü (%5 kupon) gerçek bir indirim mi, backend'i nasıl olacak?
**Cevap:**

**67.** Maç "tamamlandı" durumuna nasıl geçer (otomatik saat sonrası / skor girilince / check-in)?
**Cevap:**

**68.** %70 dolmazsa 90 dk kala otomatik iptal kuralı nihai mi? Otomatik iptalde ödemeler/iadeler nasıl işler?
**Cevap:**

**69.** Hakem/kaleci no-show (gelmezse) ne olur? Ücret iadesi, ceza, yeniden atama akışı nedir?
**Cevap:**

**70.** Oyuncu puanlaması fair play skorunu nasıl besler? Formül (örn. eski×0.9 + oy ort.×0.1) nihai mi ve nerede hesaplanır?
**Cevap:**

---

# BÖLÜM 8 — Saha Keşfi & Rezervasyon (Oyuncu Tarafı)

**71.** Saha keşfi birincil olarak harita mı liste mi? Airbnb tarzı fiyat pinli harita lansmanda olacak mı?
**Cevap:**

**72.** Yakındaki saha araması (geohash/haversine) gerçek RPC ile mi çalışacak? Binlerce sahada performans hedefi nedir?
**Cevap:**

**73.** Oyuncu bir sahayı doğrudan rezerve edebilir mi (maç oluşturmadan), yoksa rezervasyon hep bir maça mı bağlı?
**Cevap:**

**74.** Rezervasyon kapora ile mi tutulur, tam ödeme mi? Slot hold (10 dk) süresi nihai mi?
**Cevap:**

**75.** Saha müsaitliği oyuncuya gerçek zamanlı mı gösterilir? Tarife + booking + exception nasıl birleştirilir?
**Cevap:**

**76.** Rezervasyon onayı otomatik mi (auto_approve_minutes) saha sahibi onayı mı? Varsayılan 35 dk nihai mi?
**Cevap:**

**77.** Oyuncu iptalinde iade politikası nedir (24h/12h/0h yüzdeleri nihai mi)?
**Cevap:**

**78.** "MyBookings" ekranında oyuncu hangi işlemleri yapabilir (iptal, yön tarifi, bilet, tekrar rezerve)?
**Cevap:**

**79.** Saha detay sayfasında hangi bilgiler gösterilir (fotoğraf, olanaklar, A/B/C kalite notları, Google puanı) ve nereden gelir?
**Cevap:**

**80.** Henüz OYNA'da olmayan sahalar (Google'dan çekilen/cluster) haritada gösterilecek mi? Nasıl işaretlenir?
**Cevap:**

---

# BÖLÜM 9 — Tesis Sahibi Paneli & İşletme Yönetimi (B2B)

**81.** Saha sahibi için "olmazsa olmaz" lansman modülleri hangileri (Takvim, rezervasyon onay, manuel rezervasyon, fiyat — vs finans, personel, abonelik, flash deal, borçlu, çekim)?
**Cevap:**

**82.** OwnerPanel'in tüm sekmeleri tek tek hangileri ve her birinin lansman durumu (hazır/yarım/sonraya) nedir?
**Cevap:**

**83.** Manuel rezervasyon (telefonla gelen müşteri) akışı nihai mi? Müşteri OYNA kullanıcısı değilken nasıl kaydedilir?
**Cevap:**

**84.** Çok kortlu (court) tesis yönetimi lansmanda mı? Takvim kort×saat matrisi performansı (1000+ rezervasyon) nasıl?
**Cevap:**

**85.** Çalışma saatleri, tatil/istisna (bakım/özel etkinlik) tanımlama akışı nihai mi?
**Cevap:**

**86.** Personel (staff) ve görev (task) modülü lansmanda mı sonraya mı? Personelin kendi girişi olacak mı?
**Cevap:**

**87.** Borçlu/veresiye (debtor) takibi lansmanda mı? Hatırlatma (SMS/push) gönderimi olacak mı?
**Cevap:**

**88.** Tesis sahibi fotoğraf/olanak/açıklama/kalite notlarını nasıl yönetir? Görsel yükleme limiti nedir?
**Cevap:**

**89.** Demo/sandbox mod (ownerDemoService) ne amaçla var ve canlıda gerçek veriyle nasıl ayrışacak?
**Cevap:**

**90.** Saha sahibine yönelik raporlama/analitik (günlük özet, gelir tahmini) hangi verilerle beslenir ve lansmanda ne kadarı gerçek?
**Cevap:**

---

# BÖLÜM 10 — Tesis Fiyatlandırma, Abonelik & Doluluk

**91.** Fiyatlandırma modeli hangisi: tam saha (FULL) mı, kişi başı (PER_PERSON) mı, ikisi de mi? Varsayılan hangisi?
**Cevap:**

**92.** `price_per_match` / `total_price` / `price_per_person` / `pitch_tariffs` arasında TEK doğru kaynak ne olacak? Tarife yoksa fallback nedir?
**Cevap:**

**93.** Zaman bazlı tarifeler (gündüz/akşam/hafta sonu/tatil) nasıl tanımlanır? Çakışan tarifelerde öncelik nasıl belirlenir?
**Cevap:**

**94.** Kapora oranı sahaya/tarifeye göre mi, platform geneli mi? Min/max sınır var mı?
**Cevap:**

**95.** Abonelik (sabit haftalık saat) lansmanda mı? "Materyalize etme" (otomatik haftalık booking) hangi mekanizmayla (cron/trigger) çalışacak?
**Cevap:**

**96.** Flash indirim lansmanda mı? İndirim aralığı, süre, çakışma (kapalı slot) kuralları nedir?
**Cevap:**

**97.** Doluluk (occupancy) nasıl hesaplanır? PENDING sayılır mı? Hangi slot tabanı kullanılır?
**Cevap:**

**98.** Çift rezervasyon önleme nasıl garanti edilir? Manuel + uygulama + abonelik çakışması nasıl çözülür?
**Cevap:**

**99.** Platform komisyon oranı sahaya özel mi (`platform_commission_rate`) yoksa sabit mi? Saha sahibi görür mü?
**Cevap:**

**100.** Ödeme sağlayıcı entegrasyonu tesis bazlı mı (her sahanın kendi merchant'ı) yoksa platform bazlı mı (OYNA tek merchant + payout)? **(Kritik karar)**
**Cevap:**

---

# BÖLÜM 11 — Kaleci & Hakem Pazaryeri & Teklif Sistemi

**101.** Kaleci/hakem nasıl iş bulur: kaptan mı onları arar (pazaryeri), onlar mı ilanlara başvurur (job board), ikisi de mi?
**Cevap:**

**102.** JobListing / DirectOffer / IncomingBid kavramları nihai modelde nasıl sadeleşecek? Teklif/karşı-teklif (pazarlık) olacak mı?
**Cevap:**

**103.** Ücreti kim belirler — kaleci/hakem sabit ücreti mi, kaptan teklifi mi, pazarlık mı? Komisyon ücretten mi kesilir?
**Cevap:**

**104.** Teklif kabul edilince DB'ye nasıl yazılır (service_offers) ve maça nasıl bağlanır? (Şu an store-only.)
**Cevap:**

**105.** Çakışma kontrolü: kaleci/hakem aynı saate iki iş kabul edemesin — PENDING teklifler de çakışmada sayılacak mı?
**Cevap:**

**106.** Müsaitlik (aktif gün/saat) nasıl tanımlanır ve teklifleri nasıl filtreler?
**Cevap:**

**107.** Hakem skor otoritesi (RefereeScoreModule) maç skoruna nasıl entegre olacak (gerçek DB yazımı + kart motoru)?
**Cevap:**

**108.** Kaleci/hakem kazançları cüzdana mı yazılır, ne zaman "temizlenir" (CLEARED), nasıl çekilir (payout)?
**Cevap:**

**109.** FOMO göstergeleri ("12 kaleci inceliyor", viewers) gerçek veriyle mi beslenecek yoksa kaldırılacak mı?
**Cevap:**

**110.** TransferCenter ve ScoutDashboard'ın gerçek amacı nedir (oyuncu transferi mi, kaleci/hakem mi)? Scout komisyonu nasıl işler?
**Cevap:**

---

# BÖLÜM 12 — PARA AKIŞI: Ödeme, Komisyon, İade, Payout ⚠️ (En Kritik)

**111.** Uçtan uca para akışını netleştirin: Oyuncu öder → para nereye gider (OYNA havuzu / saha IBAN'ı)? → komisyon ne zaman/nasıl kesilir? → saha sahibine/kaleci/hakeme ne zaman ödenir (payout)?
**Cevap:**

**112.** Ödeme sağlayıcısı kesin olarak hangisi: Param mı, iyzico mı, ikisi de mi? Lansman için hangisi?
**Cevap:**

**113.** Komisyon oranları nihai mi (standart %10, Pro %5, saha bazlı override)? Komisyon oyuncudan mı, saha sahibinden mi, ikisinden mi?
**Cevap:**

**114.** Split payment (ödeme havuzu) gerçek para ile mi çalışacak? Her oyuncu kendi payını gerçek kartla mı öder, yoksa kaptan tümünü ödeyip mi toplar?
**Cevap:**

**115.** "Kaptan Garantörü / Safety Net" (T-2 saatte eksik bakiyeyi kaptan kartından çekme) gerçekten uygulanacak mı? Hangi mekanizma (saklı kart token + trigger + edge function)?
**Cevap:**

**116.** Kapora iadesi ne zaman yapılır (maç tamamlanınca mı)? İade kuralları (no-show, iptal, hava durumu) nedir?
**Cevap:**

**117.** Kart bilgileri nasıl saklanır? Tokenizasyon (PCI-DSS) sağlayıcı tarafında mı? Uygulamada asla ham kart/CVV tutulmayacağı garanti mi?
**Cevap:**

**118.** Saha sahibi payout (owner_withdrawal_requests): kim onaylar, ne sıklıkta, hangi sürede hesaba geçer? Min tutar?
**Cevap:**

**119.** Faturalandırma: OYNA komisyon faturasını saha sahibine mi keser? Saha sahibi oyuncuya fatura/fiş verir mi? KDV nasıl ele alınır?
**Cevap:**

**120.** Anlaşmazlık/chargeback (oyuncu parayı geri istedi) sürecinde ne olur? İade kimin bütçesinden?
**Cevap:**

---

# BÖLÜM 13 — Cüzdan & Premium/Pro

**121.** Cüzdan (wallet) lansmanda olacak mı? Bakiye gerçek para mı, OYNA-içi kredi mi? `wallet_balance` kaynağı nedir?
**Cevap:**

**122.** Cüzdana para yükleme gerçek ödeme ile mi olacak? Yüklenen bakiye çekilebilir mi yoksa sadece harcanabilir mi?
**Cevap:**

**123.** Cüzdan hangi işlemlerde kullanılır (maç, kapora, kaleci/hakem ücreti)? Kazançlar cüzdana mı yazılır?
**Cevap:**

**124.** Premium/Pro lansmanda mı? Fiyat (99₺/ay, 899₺/yıl) nihai mi? Ödeme App Store/Google Play içi satın alma mı, kendi sağlayıcımız mı? **(Store politikası açısından kritik)**
**Cevap:**

**125.** Pro avantajları nihai mi (komisyon %5, erken rezervasyon, analiz, TV+)? Hangileri gerçekten uygulanacak?
**Cevap:**

**126.** `isPro` DB'de tutuluyor mu, satın alma sonrası nasıl set edilir, süre (pro_expires_at) / otomatik yenileme nasıl yönetilir?
**Cevap:**

**127.** Pro komisyon indirimi ödeme ekranında gerçekten uygulanacak mı (şu an her zaman %10)?
**Cevap:**

**128.** Sadakat kartı (LoyaltyCard) ve tesis bazlı sadakat (loyaltyScore) lansmanda mı? Nasıl kazanılır/harcanır?
**Cevap:**

**129.** Kupon/promosyon kodu (promo_codes) lansmanda mı? MOTM %5 kuponu bununla mı entegre?
**Cevap:**

**130.** Apple/Google "dijital ürün = uygulama içi satın alma zorunlu" politikası Premium için sorun yaratır mı? Fiziksel hizmet (saha) ödemesi ile dijital ürün ayrımı nasıl yapılacak?
**Cevap:**

---

# BÖLÜM 14 — Oyunlaştırma: Kartlar, Nitelikler, ELMAS/KARAT, Tier

**131.** Oyuncu FUT kartı ne zaman oluşur (ilk maç sonrası otomatik / manuel)? Başlangıç değerleri nedir?
**Cevap:**

**132.** Kart nitelikleri (pace/shooting/passing/dribbling/defense/physical) nasıl belirlenir ve güncellenir (oylama / hakem / otomatik istatistik)?
**Cevap:**

**133.** İki puan ölçeği var: FifaCard 0-5 (×20) ve PlayerCard 1-100. Nihai TEK ölçek ne olacak?
**Cevap:**

**134.** Tier eşikleri (gold/silver/bronze) net olarak hangi değerlerde?
**Cevap:**

**135.** `isStatsVerified` (video kanıtlı istatistik) nasıl true olur? "OYNA AI Vision™" gerçek özellik mi, vaat mi?
**Cevap:**

**136.** ELMAS formülü (`wins² × winRate × 1000`) nihai mi? Küçük örneklemde aşırı oynaklık kabul mü, düzeltilecek mi?
**Cevap:**

**137.** KARAT (takım) formülü (`ortElmas × takımWinRate`) nihai mi? `teamValue` nasıl hesaplanır?
**Cevap:**

**138.** `flatModifier` (admin manuel kart override) yetkisi kimde olacak ve nasıl denetlenir (audit)?
**Cevap:**

**139.** ELMAS/KARAT'ın gerçek işlevi olacak mı (eşleştirme, sıralama, ödül) yoksa kozmetik mi? Para ile bağı olacak mı?
**Cevap:**

**140.** Kart/animasyon yoğunluğu (3D tilt, MOTM reveal) düşük donanımlı telefonlarda performansı nasıl etkiler? Lansman kalite hedefi nedir?
**Cevap:**

---

# BÖLÜM 15 — Takımlar, Taktik Stüdyo & Formasyonlar

**141.** Takım oluşturma (4 adımlı sihirbaz) nihai mi? Bir kullanıcı kaç takım kurabilir/üye olabilir?
**Cevap:**

**142.** Takım kadrosu sadece arkadaşlardan mı kurulur? Takıma katılma/davet/ayrılma akışı nedir?
**Cevap:**

**143.** Taktik Stüdyo (233KB'lik dev dosya) lansman kapsamında mı, v2 mi? Çekirdek değer mi, "nice-to-have" mı?
**Cevap:**

**144.** Studio'da taktik kaydetme (Supabase) gerçekten çalışıyor mu? Taktik onay durumu (APPROVED/PENDING) kim yönetir?
**Cevap:**

**145.** Taktikler maça nasıl bağlanır? Maçta kullanılan diziliş Studio'dan mı gelir, MatchJoin'de mi kurulur?
**Cevap:**

**146.** IQ Akademi (10 taktik dersi) lansmanda mı? İçerik kim üretecek, ödül/itibar verir mi?
**Cevap:**

**147.** Formasyon koordinatları için tek kaynak (shared constants) oluşturulacak mı? Hangi dosya master olacak?
**Cevap:**

**148.** Canlı taktik tahtası (LiveTacticBoard) gerçek zamanlı çok kullanıcılı mı olacak? Lansmanda mı?
**Cevap:**

**149.** Takım istatistikleri (wins/losses/fairPlay) maç sonucundan otomatik mi güncellenir?
**Cevap:**

**150.** AI Koç (AICoach) gerçek Gemini entegrasyonu olacak mı? API anahtarı nasıl güvene alınır (edge function)? Lansmanda mı?
**Cevap:**

---

# BÖLÜM 16 — Fair Play, İtibar, Cezalar & Adalet

**151.** Üç kavram var: `rating` (0-5), `fairPlayScore` (0-100), `reliabilityScore` (0-100). Nasıl sadeleşecek, her biri neyi ölçer?
**Cevap:**

**152.** Fair play / güvenilirlik puanı hangi olaylarla düşer/artar (geç kalma, iptal, no-show, kötü oylama, kart)?
**Cevap:**

**153.** İptal cezası (son 3 saatte -10, skor≤70'te 1 hafta ban) kuralları nihai mi?
**Cevap:**

**154.** Ban türleri (normal ban, shadow ban, mute) lansmanda olacak mı? Her birinin etkisi tam olarak nedir?
**Cevap:**

**155.** Ban süresi (banExpiresAt) otomatik mi kalkar? Kim manuel ban/unban yapabilir?
**Cevap:**

**156.** Maç eşleştirme uygunluğu (calculateMatchSuitability) gerçekten kullanılacak mı? Düşük fair play takımlar eşleşemez mi?
**Cevap:**

**157.** Riskli/düşük puanlı oyuncular (RISKY_PLAYERS) nasıl tespit edilir ve ne yapılır?
**Cevap:**

**158.** Kullanıcı şikayet/raporlama (report) mekanizması olacak mı? Kim inceler?
**Cevap:**

**159.** Fair play puanı düşük kullanıcıya hangi kısıtlamalar uygulanır (maça giremez, premium maç kilitli vb.)?
**Cevap:**

**160.** İtibar sistemi şeffaf mı olacak (kullanıcı puanının neden düştüğünü görür mü)?
**Cevap:**

---

# BÖLÜM 17 — Topluluk, Sosyal & Sohbet

**161.** Topluluk modülü lansmanda mı? Çekirdek değer mi, sonraya bırakılabilir mi?
**Cevap:**

**162.** Topluluk katılım modları (OPEN/REQUEST/INVITE_ONLY) nihai mi? Davet kodu sistemi nasıl çalışır (süre, tek kullanım)?
**Cevap:**

**163.** Topluluk doğrulaması (e-posta domaini @üniversite.edu.tr) nasıl yapılır? Üniversite/şirket/mahalle toplulukları mı hedefleniyor?
**Cevap:**

**164.** Topluluk üyeliğinin maçlarla ilişkisi nedir (topluluk-içi maç, lig, lider tablosu)?
**Cevap:**

**165.** Arkadaşlık (FriendRequest) lansmanda mı? Engelleme (block) olacak mı? Gizlilik (kim arkadaş ekleyebilir)?
**Cevap:**

**166.** Oyuncu arama duyurusu (PlayerSeekAnnouncement) ile açık maç arasındaki fark nedir? Birleşmeli mi?
**Cevap:**

**167.** Sohbet (şu an mock) lansmanda gerçek olacak mı? 1-1, maç, topluluk — hangileri? Mesaj saklama/moderasyon?
**Cevap:**

**168.** Lider tabloları hangi verilerle beslenir (TP/FairPlay/Gol)? Haftalık/sezonluk sıfırlama mantığı nedir?
**Cevap:**

**169.** Turnuvalar (TournamentBracket) lansmanda mı? Kim oluşturur (admin/topluluk/kullanıcı)? Ödül gerçek mi?
**Cevap:**

**170.** OYNA TV lansmanda mı? İçerik nereden gelir (kullanıcı upload, tesis kamera, manuel)? Telif/moderasyon?
**Cevap:**

---

# BÖLÜM 18 — Bildirimler (Push & Uygulama-İçi)

**171.** Push altyapısı (APNs/FCM) lansman için zorunlu mu? Sertifikalar/anahtarlar hazır mı?
**Cevap:**

**172.** Edge function (send-push) ne zaman deploy edilecek? Bildirim trigger'ları hangi olaylarda çalışacak?
**Cevap:**

**173.** Bildirim kategorileri (MATCH/STAFF/REMINDER/DISCOVERY/PROMO/SYSTEM) ve zorunlu olanlar nihai mi? Kategori adı tutarsızlığı (TEAM vs STAFF) düzeltilecek mi?
**Cevap:**

**174.** Hangi olaylar bildirim üretir (katılım, iptal, davet, kaleci/hakem onayı, ödeme, hatırlatma)? Tam liste nedir?
**Cevap:**

**175.** Deep link (bildirime tıklayınca ekrana gitme) nasıl standardize edilecek (oyna://…)? Mevcut parse hatası düzeltilecek mi?
**Cevap:**

**176.** Uygulama-içi bildirimler mock+gerçek karışık; nihai tek kaynak (Supabase) ne olacak?
**Cevap:**

**177.** Bildirim sıklık/spam kontrolü (rate limiting) olacak mı? Sessiz saatler (do-not-disturb)?
**Cevap:**

**178.** SMS bildirimleri olacak mı (saha sahibine rezervasyon, borçluya hatırlatma)? Maliyet?
**Cevap:**

**179.** E-posta bildirimleri olacak mı (makbuz, onay, özet)?
**Cevap:**

**180.** Bildirim tercihlerini kullanıcı nereden yönetir? Zorunlu olanlar kilitli mi gösterilecek?
**Cevap:**

---

# BÖLÜM 19 — Admin / GodView & Moderasyon

**181.** İki admin paneli var (views/AdminDashboard + admin-panel/). Nihai TEK panel hangisi, diğeri kaldırılacak mı?
**Cevap:**

**182.** Admin paneli ayrı bir uygulama/URL (admin.html) mı, ana app içinde mi? Erişim nasıl korunur?
**Cevap:**

**183.** Ghost mode / impersonation güvenliği (URL ile tetikleniyor) nasıl kilitlenecek (yetkili admin, RLS, audit)?
**Cevap:**

**184.** Admin alt rolleri (SUPER_ADMIN/MODERATOR/FINANCE/SUPPORT) lansmanda mı? Yetki matrisi nedir?
**Cevap:**

**185.** Admin hangi kritik işlemleri yapabilir (ban, maç iptal, slot override, cüzdan düzenleme, kaleci/hakem oluşturma)? Hepsi audit'lenir mi?
**Cevap:**

**186.** Çift audit log tablosu (audit_logs + admin_audit_log) hangisi kalacak?
**Cevap:**

**187.** Doğrulama kuyruğu (kaleci/hakem/tesis onayları) admin panelde tek yerden mi yönetilir?
**Cevap:**

**188.** Anlaşmazlık (dispute) çözümü admin panelde nasıl yapılır? İş akışı (OPEN→UNDER_REVIEW→RESOLVED) nedir?
**Cevap:**

**189.** Finans yönetimi (gelir, payout onayı, komisyon raporu) admin panelde lansmanda olacak mı?
**Cevap:**

**190.** Toplu bildirim (broadcast) ve CMS metinleri (texts) yönetimi admin'de olacak mı? Rate limit/yetki?
**Cevap:**

---

# BÖLÜM 20 — Veri Modeli, Güvenlik (RLS), Ölçeklenme & Store Yükleme

**191.** Mükerrer tipler (Team/ITeam, Match/IMatch/MatchListing, Player/PlayerCard/PlayerCardData) nasıl tek kanonik modele indirgenecek?
**Cevap:**

**192.** camelCase/snake_case tutarsızlığı (özellikle `tactics."userId"`) nasıl standardize edilecek?
**Cevap:**

**193.** Mock veriye bağımlılık (IS_LOCAL_DEV/DEV_MODE) canlıda nasıl tamamen kapatılacak? Prod fallback davranışı ne olmalı?
**Cevap:**

**194.** Eksik RLS politikaları (friendships, community_members, team_members, tactics, match_disputes, tournaments, promo_codes) nasıl tamamlanacak?
**Cevap:**

**195.** Tüm RPC'ler production Supabase'e deploy edildi mi? Kodun çağırıp DB'de olmayan RPC var mı (doğrulama gerekli)?
**Cevap:**

**196.** Edge function güvenlik açıkları (admin-create-user CORS `*`, payment-webhook imza yok) nasıl kapatılacak? Edge function'lar ne zaman deploy edilecek?
**Cevap:**

**197.** Secret yönetimi: anon key dışında hiçbir gizli anahtar client'a sızmıyor mu? `.env` gitignore'da mı? Param/Gemini/service-role nerede tutulacak?
**Cevap:**

**198.** Ölçeklenme: eşzamanlı slot katılımı, bildirim fanout, harita sorguları binlerce kullanıcıda test edildi mi? Hedef yük nedir?
**Cevap:**

**199.** Store yükleme gereksinimleri (iOS: gizlilik etiketleri, izin açıklama metinleri, Sign in with Apple; Android: keystore, izinler, hedef SDK) — hangileri hazır, hangileri eksik?
**Cevap:**

**200.** Test kapsamı (şu an ~%5, sadece admin) lansman için nereye çıkmalı? Hangi kritik akışlar (ödeme, maç katılımı, rezervasyon) E2E test edilecek?
**Cevap:**

---

## ✅ Sonraki Adımlar

1. Bu 200 soruyu yanıtlayın (hepsini bir kerede ya da bölüm bölüm — nasıl isterseniz).
2. Yanıtlar doğrultusunda **`OYNA_MASTER_PRENSIPLER.md`** yazılacak: tüm akışlar, UI/UX mantıkları, sistem mentalitesi, durum makineleri, iş kuralları ve veri modeli tek belgede.
3. Bu master belge; karışıklıkları giderme, refactor planı ve canlıya/store'lara çıkış yol haritasının temeli olacak.

> İsterseniz "şu bölümden başlayalım" deyin, o bölümün sorularını sırayla sohbette de işleyebiliriz.
