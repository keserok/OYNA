import React, { useState } from 'react';
import { ArrowLeft, FileText, Shield, ShieldCheck, Lock, RefreshCw, Cookie, ChevronRight, Users, Scale } from 'lucide-react';

interface LegalScreenProps {
  onBack: () => void;
  initialDoc?: LegalDocKey;
}

type LegalDocKey = 'TERMS' | 'TOPLULUK' | 'PRIVACY' | 'KVKK' | 'RIZA' | 'VELI' | 'CEREZ' | 'SALES';

// NOT: Şirket bilgileri (COMPANY/TAX_INFO/ADDRESS) dolduruldu; avukat
// incelemesi hâlâ önerilir, özellikle KVKK ve mesafeli satış maddeleri için.
// (Son taslak güncellemesi: 12.07.2026)

const COMPANY = 'Miraç Kerem Çürüksulu (OYNA)';
const TAX_INFO = 'Kartal Vergi Dairesi – 2650883645';
const ADDRESS = 'Cevizli Mahallesi, Zuhal Caddesi, Ritim İstanbul A Ticari Blok No:46 Daire:50 (Mükellef Teknoloji A.Ş. bünyesinde), Kartal/İstanbul';
const CONTACT_EMAIL = 'destek@oyna.app';
const UPDATED = '15.07.2026';

const DOCS: Record<LegalDocKey, { title: string; icon: React.ElementType; body: string }> = {
  TERMS: {
    title: 'Kullanım Şartları',
    icon: FileText,
    body: `OYNA Kullanım Şartları / Üyelik Sözleşmesi (Oyuncu)
Son güncelleme: ${UPDATED}

Bu Kullanım Şartları ("Sözleşme"), aşağıda kimliği belirtilen hizmet sağlayıcı ile OYNA mobil/web uygulamasını ("Uygulama", "Platform") kayıtlı kullanıcı ("Kullanıcı", "Oyuncu") sıfatıyla kullanan gerçek kişi arasında, Uygulamanın kullanımına ilişkin hak ve yükümlülükleri düzenler.

1. TARAFLAR VE TANIMLAR

1.1 Taraflar
(a) Hizmet Sağlayıcı: ${COMPANY} (bundan böyle kısaca "OYNA" veya "Şirket" olarak anılacaktır).
- Vergi Dairesi/No: ${TAX_INFO}
- Adres: ${ADDRESS}
- E-posta: ${CONTACT_EMAIL}
Bu Sözleşmenin devamında, işbu gerçek kişi yalnızca "OYNA" veya "Şirket" kısa adıyla anılacaktır.

(b) Kullanıcı/Oyuncu: OYNA Uygulamasına üye olan, Uygulamayı indirip kullanan veya Uygulama üzerinden herhangi bir işlem (rezervasyon, maça katılım, mesajlaşma, profil oluşturma vb.) gerçekleştiren gerçek kişi.

1.2 Tanımlar
- "Platform" / "Uygulama": OYNA'ya ait mobil uygulama, web sitesi ve bunlara bağlı tüm dijital arayüzler.
- "Tesis" / "Saha Sahibi": Halı saha işletmesini fiilen yürüten, sahanın kiralanmasına ilişkin hizmeti bizzat sunan gerçek/tüzel kişi.
- "Hizmet Sağlayıcı" (dar anlamda): Platform üzerinden kaleci, hakem veya benzeri maç-içi hizmet sunan bağımsız üçüncü kişi.
- "Rezervasyon": Kullanıcının Platform üzerinden bir Tesise ait saha/saatin kiralanması için oluşturduğu talep ve buna bağlı onay süreci.
- "Kapora": Rezervasyonun teyidi amacıyla Platform üzerinden tahsil edilen, toplam saha bedelinin bir kısmını veya tamamını oluşturan ön ödeme.
- "İçerik": Kullanıcı tarafından Platforma yüklenen profil fotoğrafı, kullanıcı adı, maç yorumu, değerlendirme, taktik paylaşımı, mesaj ve benzeri her türlü veri/materyal.

1.3 Kapsam ve Kabul
İşbu Sözleşme, OYNA tarafından sunulan; halı saha rezervasyonu, maç/takım oluşturma ve eşleştirme, kaleci/hakem gibi hizmet sağlayıcılarla buluşma işlevlerini içeren aracı platform hizmetinin kullanımına ilişkin şartları düzenler. Kullanıcı, Uygulamaya üye olarak, Uygulamayı indirerek veya kullanmaya devam ederek işbu Sözleşmeyi okuduğunu, anladığını ve tüm hükümleriyle kabul ettiğini beyan eder. Sözleşmeyi kabul etmeyen kullanıcılar Uygulamayı kullanamaz.

İşbu Sözleşme; Mesafeli Satış ve İptal/İade Koşulları, KVKK Aydınlatma Metni, KVKK Açık Rıza Metni, Gizlilik Politikası, Çerez Politikası, Topluluk Kuralları ve (reşit olmayan kullanıcılar bakımından) Veli Muvafakatnamesi ile birlikte bir bütün oluşturur ve bu belgeler bu Sözleşmenin ayrılmaz ekleridir.

2. SÖZLEŞMENİN KONUSU VE KAPSAMI; OYNA'NIN ARACI PLATFORM NİTELİĞİ

2.1 Hizmetin Tanımı
OYNA; oyuncuların (i) halı saha rezervasyonu yapmasına, (ii) maç ve takım oluşturmasına, diğer oyuncularla eşleşmesine ve (iii) kaleci/hakem gibi bağımsız hizmet sağlayıcılarla bir araya gelmesine imkân tanıyan elektronik bir aracı platformdur.

2.2 Aracı Konum
Saha kiralama hizmeti bizzat ilgili Tesis tarafından sunulur. OYNA, sahanın işletmecisi, kiralayanı veya sahibi değildir; yalnızca Tesis ile Kullanıcı arasındaki rezervasyon sürecini teknik olarak kolaylaştıran ve ödeme tahsilatına aracılık eden platformdur. Kalecilik/hakemlik gibi hizmetler, Platform üzerinde ilan veren bağımsız Hizmet Sağlayıcılar tarafından sunulur. OYNA, bu kişilerin işvereni, temsilcisi veya kefili değildir; yalnızca Kullanıcı ile Hizmet Sağlayıcının bir araya gelmesini sağlayan bir eşleştirme/pazaryeri işlevi görür. Buna göre; sahanın fiziki durumu, zemin/aydınlatma/soyunma odası gibi tesis koşulları, sahada yaşanabilecek kaza/yaralanma olayları ile kaleci/hakemin edimini ifa şekli, bizzat Tesis ve/veya ilgili Hizmet Sağlayıcının sorumluluğundadır. OYNA'nın bu konudaki sorumluluğu, madde 10 (Sorumluluğun Sınırlandırılması) ve madde 9'da (Garanti Reddi) düzenlenen çerçeve ile sınırlıdır.

2.3 Tesis ve Hizmet Sağlayıcılarla İlişki
Tesisler ve Hizmet Sağlayıcılar, OYNA ile ayrı sözleşmesel ilişki içindedir ve tacir/esnaf sıfatıyla hareket eder; bu kişilerle OYNA arasındaki hak ve yükümlülükler ayrı sözleşmelerle (Tesis/İşletme Sözleşmesi, Hizmet Sağlayıcı Sözleşmesi vb.) düzenlenir ve işbu Sözleşmenin tarafı değildir. İşbu Sözleşme yalnızca OYNA ile Kullanıcı (Oyuncu) arasındaki ilişkiyi düzenler.

3. HESAP OLUŞTURMA, KULLANIM VE GÜVENLİK

3.1 Üyelik Şartları
Uygulamaya üye olabilmek için doğru, güncel ve eksiksiz bilgi verilmesi zorunludur. Kullanıcı, kayıt sırasında beyan ettiği ad-soyad, e-posta, telefon numarası ve yaş bilgisinin doğruluğundan sorumludur.

3.2 Hesap Güvenliği
Kullanıcı, hesabına ait kullanıcı adı, şifre ve varsa çok faktörlü doğrulama bilgilerinin gizliliğinden bizzat sorumludur. Hesap üzerinden gerçekleştirilen tüm işlemler, aksi ispat edilmedikçe hesap sahibi tarafından yapılmış sayılır. Kullanıcı, hesabının yetkisiz kişilerce kullanıldığını fark ettiği anda ${CONTACT_EMAIL} üzerinden OYNA'ya derhal bildirimde bulunmakla yükümlüdür. Bildirim yapılana kadar geçen sürede hesap üzerinden gerçekleştirilen yetkisiz işlemlerden Kullanıcının sorumluluğu; OYNA'nın Platformda makul ve sektör standartlarına uygun güvenlik önlemlerini (şifreleme, güvenli oturum yönetimi ve isteğe bağlı çok faktörlü doğrulama imkânı dahil) sunmuş olması ve Kullanıcının kendi ağır kusuru bulunmaması kaydıyla, ilgili bildirim öncesi dönemde gerçekleşen işlem başına, Kullanıcının o işlem için ödediği bedeli aşmayacak şekilde sınırlıdır. Kullanıcının hesap bilgilerini kasten üçüncü kişiyle paylaşması veya ağır ihmali hâlinde bu sınırlama uygulanmaz.

3.3 Hesabın Kişisel Niteliği
Hesap, yalnızca kayıt sahibi Kullanıcı tarafından kullanılabilir; başka bir kişiye devredilemez, satılamaz veya kiralanamaz. Bir kişinin birden fazla hesap açması, yalnızca OYNA'nın önceden yazılı (e-posta ile) onayı ile ve meşru bir amaca dayanması hâlinde mümkündür.

3.4 Yaş Şartı
Uygulamaya üye olabilmek için asgari yaş 13'tür. 13 yaşından küçük çocuklar adına hesap, ancak veli/vasisi tarafından, velinin kendi kimlik ve iletişim bilgileri kullanılarak oluşturulabilir; bu hâlde hesap veli/vasinin gözetimi ve sorumluluğu altında kullanılır. 13-18 yaş arası kullanıcıların hesapları, veli/vasi onayı tamamlanana kadar madde 4'te düzenlenen "sınırlı mod" kapsamında işletilir.

4. REŞİT OLMAYAN KULLANICILAR VE VELİ ONAYI

4.1 Amaç
Bu madde, 18 yaşından küçük kullanıcıların Platformu güvenli ve hukuka uygun şekilde kullanabilmesi; buna karşılık veli/vasinin ödeme ve maça katılım gibi hukuki sonuç doğuran işlemler bakımından etkin ve gerçek bir onay/kontrol mekanizmasına sahip olması amacıyla düzenlenmiştir.

4.2 Sınırlı Mod
Kullanıcı 18 yaşından küçükse hesap otomatik olarak "sınırlı mod"da açılır: (a) gezinme, arama, profil oluşturma, ödeme gerektirmeyen maçlara katılım ve mesajlaşma serbesttir; (b) ödeme gerektiren tüm işlemler (kapora, ücretli maça katılım için slot/pay satın alımı, cüzdana bakiye yükleme dahil) veli onayı tamamlanana kadar kapalıdır — maça katılım yalnızca ödeme gerektirdiği ölçüde bu kapsamdadır; (c) 13 yaş altı, veli tarafından oluşturulan hesaplarda mesajlaşma ve profil görünürlüğü de onay tamamlanana kadar ayrıca kısıtlanabilir.

4.3 Veli/Vasi Onay Süreci
(1) Küçük kullanıcı, velisinin adı-soyadı ve iletişim bilgisini Uygulama üzerinden bildirir. (2) OYNA, veliye bildirilen kanal üzerinden bir onay bağlantısı/kod gönderir. (3) Velinin, bu bağlantı/kod aracılığıyla bizzat ve açıkça onay vermesi gerekir — küçüğün "kabul ediyorum" işaretlemesi, tek başına veli onayı yerine geçmez. (4) OYNA gerekirse ek kimlik doğrulama talep edebilir.

4.4 Onayın Kapsamı ve Süreklilik
Veli onayı bir kez usulüne uygun tamamlandıktan sonra, geri alınmadığı sürece küçüğün olağan rezervasyon, ödeme ve maça katılım işlemlerini kapsar; her işlem için ayrıca onay istenmez. OYNA, olağan dışı yüksek tutarlı işlemler için ek teyit talep edebilir.

4.5 Onayın Geri Alınması
Veli, onayını dilediği zaman ${CONTACT_EMAIL} adresine bildirerek geri alabilir; en geç 48 saat içinde hesap yeniden sınırlı moda alınır. Geri alma, önceki onaylı işlemlerin geçerliliğini etkilemez.

4.6 Velinin Sorumluluğu
Onay veren veli, olağan nitelikteki işlemler bakımından küçük ile birlikte OYNA'ya karşı sorumludur ve bu işlemlerin hukuki/mali sonuçlarını üstlenir. Bu sorumluluk, ek teyit alınmaksızın gerçekleştirilmiş olağan dışı işlemleri kapsamaz ve onayın geri alındığı tarihten sonraki işlemleri kapsamaz.

4.7 Uygulama Notu
Bu maddenin hukuken bağlayıcı olabilmesi için, yukarıda tarif edilen veli doğrulama akışının (sınırlı mod, veli iletişim bilgisi, onay bağlantısı/kodu, velinin bizzat onayı) Uygulamada fiilen ve eksiksiz uygulanması zorunludur. Yalnızca metnin varlığı, veli onayının hukuken alınmış sayılması için yeterli değildir.

5. REZERVASYON, KAPORA VE ÖDEME

5.1 Rezervasyon Süreci
Kullanıcı, bir Tesise ait boş saha/saat seçerek rezervasyon talebinde bulunur. Rezervasyonun kesinleşmesi, Tesisin otomatik/manuel onay kurallarına tabidir; onay verilene kadar rezervasyon "ön talep" niteliğindedir.

5.2 Fiyat ve Kapora
Saha bedeli, kapora tutarı ve ek hizmet bedelleri rezervasyon ekranında, ödeme onayından önce açıkça gösterilir. Kapora, ilgili Tesis tarafından belirlenir ve rezervasyonun teyidi niteliğindedir. Kalan bedelin ödeme şekli Tesise göre değişebilir.

5.3 Ödeme Altyapısı
Ödemeler, lisanslı ödeme kuruluşu iyzico altyapısı üzerinden gerçekleştirilir. Kart bilgileri OYNA sunucularında saklanmaz. OYNA, iyzico'nun ödeme hizmetinin kesintisiz olacağını garanti etmez; bu konudaki sorumluluk madde 12 (Mücbir Sebep) ve madde 10 (Sorumluluğun Sınırlandırılması) çerçevesinde değerlendirilir.

5.4 Fatura/Makbuz
Fatura düzenleme yükümlülüğü, hizmeti fiilen sunan tarafa (Tesis) veya kanunen yükümlü tarafa aittir; OYNA yalnızca ödeme aracılık hizmetine ilişkin belgeleri düzenler.

6. İPTAL VE İADE

6.1 Genel Kurallar (Kullanıcı Kaynaklı İptaller)
- Rezervasyon/maç saatine 24 saat ve üzerinde kala yapılan iptallerde: ödenen tutarın tamamı OYNA cüzdanına iade edilir (yalnızca ödeme altyapısı işlem bedeli hariç).
- 6-24 saat arasında (6. saat dahil, 24. saat hariç) kala yapılan iptallerde: %50 OYNA cüzdanına iade edilir.
- 6 saatten az kala yapılan iptallerde: iade yapılmaz.
İadenin yapılacağı yer: Bu maddedeki tüm iadeler, ödemenin yapıldığı karta değil, Kullanıcının OYNA cüzdanına işlenir. Cüzdandaki tutar Platform içindeki tüm ödemelerde kullanılabilir; para çekimi özelliği açıldığında ayrıca madde 6.5'teki koşullarla banka hesabına çekilebilir.
Bu kademeli yapı yalnızca Kullanıcı kaynaklı iptallere uygulanır.

6.2 Ayrıntılı Düzenleme
İptal/iade süreçlerine ve iade tutarının OYNA cüzdanına işlenmesine ilişkin ayrıntılı hükümler Mesafeli Satış ve İptal/İade Koşulları belgesinde; cüzdanın kullanımı ve cüzdandan para çekimine ilişkin hükümler ise madde 6.5'te düzenlenmiştir. Çelişki hâlinde iptal/iade konusunda Mesafeli Satış ve İptal/İade Koşulları esas alınır.

6.3 Mücbir Sebep ile Bağlantı
Mücbir sebep hâllerinde iptal/iade esasları madde 12.3'e göre uygulanır; mücbir sebep iade yükümlülüğünü ortadan kaldırmaz.

6.4 Tesis veya OYNA Kaynaklı İptal — Simetrik Telafi
Rezervasyonun, Kullanıcıdan kaynaklanmayan bir sebeple ve mücbir sebep dışında Tesis veya OYNA inisiyatifiyle iptal edilmesi hâlinde Kullanıcıya: (a) ödediği bedelin tamamı derhal OYNA cüzdanına iade edilir; VE (b) bildirim anı ile rezervasyon saati arasındaki süreye göre simetrik bir telafi bedeli ayrıca OYNA cüzdanına ödenir — 24 saat öncesinde bildirimde ek telafi aranmaz; 24 saatten az kala %50; 6 saatten az kala veya bildirimsiz gerçekleşen iptalde %100 telafi bedeli.

6.5 Cüzdan ve Para Çekimi
Cüzdan nedir? OYNA cüzdanı, Platform içindeki ödemeleriniz için tutulan bakiyedir ve iki kaynaktan oluşur: kartla yaptığınız para yüklemeleri ve size geri ödenen iade tutarları. Bu iki kaynak size tek bir bakiye olarak gösterilir; aralarında kullanım farkı yoktur.
Nerede kullanılır? Cüzdan bakiyesi OYNA üzerindeki saha kiralama, maç katılım, kapora ve kaleci/hakem hizmet ödemelerinde kullanılabilir. Cüzdan bakiyesi elektronik para veya ödeme aracı niteliğinde değildir; üçüncü kişilere devredilemez ve Platform dışındaki alışverişlerde kullanılamaz. Yüklemelerde bonus, faiz veya ek menfaat sağlanmaz.
Para çekimi: Bu özellik lansman döneminde AÇIK DEĞİLDİR; cüzdan bakiyenizi bu dönemde Platform içi ödemelerde kullanabilirsiniz. Özellik açıldığında size bildirim yapılır ve aşağıdaki koşullar o tarihten itibaren uygulanır. Özellik açıldığında cüzdan bakiyenizi kendi adınıza kayıtlı banka hesabına çekebilirsiniz. Çekilen brüt tutar üzerinden %5 hizmet bedeli kesilir; kalan net tutar hesabınıza gönderilir. Tek seferde en az 100 ₺ çekilebilir; bakiyenizin tamamını çekiyorsanız bu alt sınır aranmaz. Para yalnızca kendi adınıza kayıtlı hesaba gönderilir — IBAN sahibinin adı OYNA hesabınızdaki ad soyadla eşleşmelidir. İlk çekimden önce kimlik doğrulaması istenebilir. Aynı anda yalnızca bir çekim talebi açık olabilir. Çekim talebi oluşturulduğu anda brüt tutar bakiyenizden düşülür ve Platform içi ödemelerde kullanılamaz.
Talebin iptali: Henüz onaylanmamış çekim talebinizi uygulama üzerinden iptal edebilirsiniz. Talebin iptal edilmesi, reddedilmesi veya banka transferinin gerçekleşmemesi hâllerinde brüt tutarın tamamı cüzdanınıza geri yüklenir ve hizmet bedeli alınmaz. Hizmet bedeli yalnızca fiilen tamamlanan çekimlerde doğar.
Kazanç bakiyesi: Kaleci, hakem ve tesis işletmecisi olarak hizmet veren kullanıcıların hakedişleri ayrı bir kazanç bakiyesinde tutulur. Kazanç bakiyesinden yapılan çekimlerde hizmet bedeli alınmaz; komisyon hakediş hesaplanırken zaten düşülmüştür.
Değişiklik: OYNA hizmet bedeli oranını, alt sınırı ve çekim koşullarını ileriye etkili olmak üzere değiştirebilir; değişiklikler madde 15 uyarınca bildirilir. Teknik zorunluluk, mevzuat değişikliği veya suistimal şüphesi hâlinde çekim geçici olarak durdurulabilir; bu hâlde bakiye Platform içi ödemelerde kullanılmaya devam eder.
Hesap kapatma: Cüzdanında bakiye bulunan veya açık çekim talebi olan hesap, bakiye çekilene veya talep sonuçlanana kadar kapatılamaz. Bu, paranızın kaybolmaması için konulmuş bir korumadır.

7. KULLANICI YÜKÜMLÜLÜKLERİ VE PLATFORM KULLANIM KURALLARI
Kullanıcı; kayıt/profil bilgilerinin doğru olduğunu ve başkasını taklit etmeyeceğini; Platformu yasa dışı, dolandırıcılık amaçlı veya üçüncü kişi haklarını ihlal edecek şekilde kullanmayacağını; nefret söylemi, taciz, tehdit veya şiddet içeren içerik paylaşmayacağını; sahada/maçta diğer kullanıcılara, Tesis personeline veya Hizmet Sağlayıcılara karşı şiddet, hakaret veya tehdit içeren davranışta bulunmayacağını; Tesisin kurallarına ve hakem kararlarına uyacağını; Platformu tanımlanan amaçlar dışında (spam, izinsiz tanıtım, scraping, teknik müdahale) kullanmayacağını kabul ve taahhüt eder. İhlalleri ${CONTACT_EMAIL} üzerinden bildirebilir.

8. FİKRİ MÜLKİYET VE KULLANICI İÇERİĞİ
Platformun adı, logosu, arayüzü, yazılımı ve tüm bileşenleri üzerindeki fikri/sınai mülkiyet hakları OYNA'ya aittir. Kullanıcının yüklediği İçerik üzerindeki haklar Kullanıcıda kalır; Kullanıcı, OYNA'ya yalnızca Platform hizmetinin işletilmesi amacıyla münhasır olmayan, geri alınabilir, alt lisans verilemeyen bir kullanım hakkı tanır. Bu lisans, İçeriğin kaldırılması veya hesabın silinmesiyle (yasal saklama süreleri saklı kalmak kaydıyla) sona erer. İçeriğin pazarlama/reklam amacıyla kullanılması, bu sınırlı lisansın kapsamı dışındadır ve ancak ayrı, açık, opt-in bir izinle mümkündür; bu izin başka bir onayla otomatik verilmiş sayılmaz ve her zaman geri alınabilir. Kullanıcı, yüklediği İçeriğin üçüncü kişi haklarını ihlal etmediğini beyan eder.

9. GARANTİ REDDİ VE HİZMET KALİTESİ
Platform "olduğu gibi" ve "mevcut haliyle" sunulur. OYNA; sahanın fiziki durumu ve güvenliği, maçın planlandığı gibi gerçekleşmesi, kaleci/hakem gibi Hizmet Sağlayıcıların performansı ve Platformun kesintisiz/hatasız çalışması konusunda açık veya zımni garanti vermez. Bu garanti reddi, Kullanıcının tüketici sıfatıyla 6502 sayılı TKHK'dan doğan ayıplı hizmet, cayma ve şikâyet haklarını ortadan kaldırmaz.

10. SORUMLULUĞUN SINIRLANDIRILMASI
OYNA'nın aracı platform sorumluluğu, makul özen ve dikkat yükümlülüğü ile sınırlıdır. OYNA'nın hafif kusuruna dayanan sorumluluğu, olayın gerçekleştiği tarihten geriye dönük son 12 ay içinde Kullanıcının fiilen ödediği toplam hizmet bedeli ile sınırlıdır; OYNA kâr kaybı, veri kaybı, itibar kaybı gibi dolaylı zararlardan sorumlu tutulamaz. Ancak bu sınırlamalar; (i) OYNA'nın veya ifa yardımcılarının/tedarikçilerinin ağır kusuru veya kastından kaynaklanan zararlarda ve (ii) OYNA'ya atfedilebilecek fiil/ihmalden kaynaklanan ölüm veya bedensel yaralanma hâllerinde, TBK m.115 uyarınca uygulanmaz — bu hâllerde OYNA herhangi bir üst sınır olmaksızın sorumludur. İşbu maddedeki sınırlamalar, Kullanıcının TKHK'dan doğan emredici haklarını ortadan kaldıracak şekilde yorumlanamaz.

11. TAZMİNAT VE RÜCU
Kullanıcının Platformu kötüye kullanması veya kusurlu fiiliyle başkasına zarar vermesi nedeniyle üçüncü kişilerin OYNA'ya yönelttiği taleplerde, OYNA'nın ödediği tazminat ve makul giderler için Kullanıcıya rücu hakkı saklıdır; bu sorumluluk yalnızca Kullanıcının kendi kusurundan kaynaklanan taleplerle sınırlıdır ve OYNA'nın kendi kusurundan doğan zararları kapsamaz. OYNA, rücu talebinden önce Kullanıcıyı bilgilendirir ve itiraz imkânı tanır.

12. MÜCBİR SEBEP
Doğal afet, yangın, salgın, savaş, terör, genel grev, siber saldırı, bağlayıcı kamu otoritesi kararları ve OYNA'nın makul kontrolü dışında öngörülemez/karşı konulamaz nitelikteki üçüncü taraf altyapı kesintileri mücbir sebep sayılır; ancak bu, OYNA'nın tedarikçi seçiminde özen göstermemesinden veya ağır kusurundan kaynaklanan kesintileri kapsamaz. Mücbir sebep, ağır kusur/kast istisnası ve ölüm/yaralanma istisnası saklı kalmak kaydıyla tazminat sorumluluğunu sınırlar veya ortadan kaldırır; ancak madde 6'daki iade yükümlülüğünü ortadan kaldırmaz — mücbir sebep nedeniyle rezervasyon gerçekleşemezse, Kullanıcının ödediği tutarın tamamı, öğrenilmesinden itibaren en geç 14 gün içinde, kesintisiz olarak OYNA cüzdanına iade edilir; Kullanıcı bu tutarı Platform içinde harcayabilir; para çekimi özelliği açıldığında madde 6.5 uyarınca banka hesabına da çekebilir.

13. İHLALLER, HESABIN ASKIYA ALINMASI VE SONLANDIRILMASI
OYNA; dolandırıcılık şüphesi, platform/kullanıcı güvenliğini tehdit eden davranış, yasa dışı faaliyet, küçüklerin güvenliğini tehlikeye atan davranış veya şiddet tehdidi hâllerinde hesabı bildirimsiz ve derhal, ihtiyati tedbir niteliğinde askıya alabilir; değerlendirme sürecini gecikmeksizin başlatır ve nihai kararını madde 14 uyarınca verir. Diğer ihlallerde Kullanıcıya bildirim yapılır ve en az 7 gün itiraz süresi tanınır. Askı/sonlandırma, önceden onaylanmış rezervasyon/ödeme işlemlerinin geçerliliğini etkilemez. Kullanıcı, dilediği zaman ${CONTACT_EMAIL} üzerinden hesabının silinmesini talep edebilir; hesap ve veriler talep tarihinden itibaren 7 gün içinde kalıcı olarak silinir.

14. YAPTIRIM SKALASI
Ağır ihlal kategorilerine (dolandırıcılık, güvenlik tehdidi, yasa dışı faaliyet, küçüklerin güvenliğine tehdit, şiddet) girmeyen ihlallerde kademeli yaptırım uygulanır: (1) uyarı, (2) 7-30 gün geçici askı, (3) kalıcı hesap kapatma. Yukarıda sayılan ağır ihlallerin nihai olarak tespiti hâlinde OYNA, kademeleri atlayarak doğrudan kalıcı hesap kapatma hakkına sahiptir. Yaptırıma tabi Kullanıcı, kararın bildiriminden itibaren makul sürede itiraz edebilir.

15. UYUŞMAZLIKLARIN ÇÖZÜMÜ VE UYGULANACAK HUKUK
Kullanıcı, şikâyetini dilerse önce ${CONTACT_EMAIL} adresine iletebilir; bu iç süreç isteğe bağlıdır ve yasal başvuru haklarının kullanılması için ön şart değildir. Kullanıcı, tüketici sıfatıyla her zaman ve doğrudan Tüketici Hakem Heyetleri ve/veya Tüketici Mahkemelerine başvurabilir; bu hakkı ortadan kaldıran hiçbir yetki/tahkim şartı bulunmamaktadır. İşbu Sözleşme Türkiye Cumhuriyeti kanunlarına tabidir. Tesis ve Hizmet Sağlayıcı gibi tacir/esnaf taraflarla OYNA arasındaki uyuşmazlıklar, ayrı sözleşmelerdeki yetki hükümlerine tabidir.

16. DEVİR
OYNA; birleşme, devralma veya benzeri yeniden yapılanma hâllerinde, hak ve yükümlülüklerini ve bağlantılı Kullanıcı verilerini KVKK'ya uygun şekilde devretme hakkını saklı tutar; Kullanıcı bu durumda bilgilendirilir. Kullanıcının hesabı ve sözleşmeden doğan hakları kişiye özeldir; üçüncü kişiye devredilemez.

17. BİLDİRİM VE TEBLİGAT
OYNA'nın bildirimleri, kayıtlı e-posta, Uygulama içi bildirim veya SMS/push yoluyla yapılabilir ve geçerli tebligat sayılır. Kullanıcı bildirimlerini ${CONTACT_EMAIL} adresine yazılı yapar ve iletişim bilgilerini güncel tutmakla yükümlüdür.

18. SÖZLEŞMENİN BÜTÜNLÜĞÜ
İşbu Sözleşme; Mesafeli Satış ve İptal/İade Koşulları, KVKK Aydınlatma Metni, KVKK Açık Rıza Metni, Gizlilik Politikası, Çerez Politikası, Topluluk Kuralları ve (reşit olmayan kullanıcılar bakımından) Veli Muvafakatnamesi ile birlikte taraflar arasındaki tam ve nihai anlaşmayı oluşturur.

19. BÖLÜNEBİLİRLİK
Herhangi bir hükmün geçersiz sayılması, Sözleşmenin geri kalanının geçerliliğini etkilemez; taraflar geçersiz hükmün amacına en yakın geçerli bir hükümle değiştirilmesi için iyi niyetle çaba gösterir.

20. YÜRÜRLÜK VE DEĞİŞİKLİK PROSEDÜRÜ
Sözleşme, üyelik veya Uygulamanın kullanılmaya başlanmasıyla yürürlüğe girer. OYNA değişiklik yapma hakkını saklı tutar; önemli değişiklikler önceden duyurulur ve kullanım devamı kabul sayılır. Esaslı bir değişikliği kabul etmeyen Kullanıcı, yürürlük tarihinden önce cezasız hesabını kapatarak feshedebilir. KVKK açık rızası gibi ayrı onay gerektiren hususlar, genel bildirim usulüyle değil ilgili mevzuatın öngördüğü ayrı onay mekanizmasıyla değişir.

21. İLETİŞİM
Sorularınız için: ${CONTACT_EMAIL}`,
  },
  TOPLULUK: {
    title: 'Topluluk Kuralları',
    icon: Scale,
    body: `Son güncelleme: ${UPDATED} · Sürüm: 2026-07-15

OYNA; birlikte oynayan gerçek insanların topluluğudur. Bu kurallar herkesin — hem uygulamada hem sahada — güvende ve saygı içinde olması içindir. Herkes için geçerlidir: oyuncular, kaleci/hakemler ve saha sahipleri.

★ TEMEL KURALLAR (6 KURAL)

1. Saygılı ol. Hakaret, nefret ve ayrımcılığa yer yok - ne mesajlarda ne sahada.
2. Şiddet yok. Sahada ya da yazışmada fiziksel şiddet veya tehdit, hesabının kalıcı olarak kapatılmasına yol açar.
3. Sözünde dur. Katılacağın maça katıl; sürekli gelmemek (no-show) ve son dakika iptalleri yaptırıma yol açar.
4. Adil puanla. Değerlendirmen gerçek deneyimine dayansın; intikam amaçlı, sahte veya anlaşmalı puanlama yasak.
5. Çocukları koru. 18 yaşından küçüklere yönelik her türlü uygunsuz davranışta sıfır tolerans uygulanır.
6. Kötüye kullanma. Spam, dolandırıcılık, başkasının kişisel bilgisini ifşa etme ve kimlik taklidi yasaktır — ihlal görürsen bildir.

Kısa özet ile ayrıntı arasında çelişki olursa ayrıntılı hükümler esas alınır.

1. KAPSAM
Kurallar hem uygulama içi içerik/iletişimi hem de Platform üzerinden organize edilen gerçek maçlardaki davranışı kapsar. Bu, Kullanım Şartları'nın ekidir.

2. YASAK İÇERİK VE DAVRANIŞLAR
Hakaret (TCK m.125), tehdit/şantaj (m.106-107), taciz (m.105), nefret söylemi ve ayrımcılık (m.122, m.216), müstehcenlik (m.226), çocukların istismarı (m.103 vd. — sıfır tolerans), kişisel veri ifşası/doxxing (m.134-136, KVKK), iftira (m.267), dolandırıcılık, kimlik taklidi, spam/izinsiz reklam (6563 s.K.), telif ihlali (FSEK) ve yasa dışı her içerik yasaktır.

3. SAHA İÇİ DAVRANIŞ
Sahada fiziksel şiddet, kavga, rakibe/hakeme/kaleciye/tesis çalışanına saldırı veya tehdit yasaktır ve ağır ihlal sayılır (doğrudan kalıcı kapatma — Kullanım Şartları m.14.2). Tesis kurallarına, hakem kararlarına ve centilmenliğe uyulur.

4. DEĞERLENDİRME BÜTÜNLÜĞÜ
Puanlama gerçek deneyime dayanmalı; intikam/sahte/anlaşmalı puan ve toplu karalama yasaktır. Bir sağlayıcı/tesis hakkında asılsız ağır suçlama iftira (TCK m.267) ve kişilik hakkı ihlali doğurabilir; uyar-kaldır uygulanır, masumiyet karinesi gözetilir.

5. NO-SHOW / GÜVENİLİRLİK
Mazeretsiz gelmeme, tekrarlayan son dakika iptali ve sahte rezervasyon davranış ihlalidir; güvenilirlik puanına yansır ve tekrarında yaptırıma tabidir.

6. ÇOCUKLARIN KORUNMASI
18 yaş altına yönelik uygunsuz iletişim/davranış (istenmeyen mesaj, grooming dahil) sıfır toleransa tabidir; ispatı hâlinde kalıcı kapatma ve gerekirse yetkili mercilere bildirim yapılır.

7. ŞİKÂYET VE UYAR-KALDIR
İhlalleri uygulama içi bildirim/engelleme araçlarıyla veya destek@oyna.app üzerinden bildirebilirsin. OYNA, 5651 s.K. yer sağlayıcı sorumluluğu çerçevesinde haberdar olduğu hukuka aykırı içeriği kaldırmaya gayret gösterir; acil içerik (çocuk güvenliği, şiddet) öncelikli ele alınır; katalog suç içeriği derhal kaldırılıp yetkili mercilere bildirilir.

8. YAPTIRIM VE İTİRAZ
Kademeli yaptırım: uyarı → içerik kaldırma → susturma (mute) → görünürlük kısıtlaması (shadowban) → geçici askı → kalıcı kapatma (Kullanım Şartları m.13-14 ile bütünlük). Kötüye kullanımı önlemek için bazı kısıtlamalar (shadowban) ayrıca bildirilmeksizin uygulanabilir. Karara destek@oyna.app üzerinden itiraz edilebilir. Yaptırım, tamamlanmış işlemleri ve hak edilmiş iadeleri etkilemez.

9. YÜRÜRLÜK
Bu Kurallar Kullanım Şartları'nın ekidir; ayrıca onay gerektirmez. Esaslı değişiklikler önceden duyurulur.`,
  },
  PRIVACY: {
    title: 'Gizlilik Politikası',
    icon: Lock,
    body: `Son güncelleme: ${UPDATED}

1. TOPLANAN VERİLER
- Kimlik/iletişim: ad, e-posta, telefon
- Profil ve oyun tercihleri: ad-soyad, yaş aralığı, cinsiyet (opsiyonel), pozisyon ve oyun stili
- Veli onayı (yalnızca reşit olmayan kullanıcılar): veli ve çocuğa ait ad-soyad, doğum tarihi ve T.C. Kimlik No; T.C. numaraları şifrelenerek (hash) saklanır, açık tutulmaz
- Konum: yakındaki sahaları göstermek için, yalnızca uygulamayı kullanırken ve izninizle
- Rehber eşleştirme: açık izninizle, arkadaş bulma amacıyla; numaralar cihazda şifrelenir (hash), sunucuya yalnızca şifreli hâli gider — Ayarlar'dan kapatılabilir
- Kullanım: rezervasyon, maç ve uygulama içi etkinlik verileri
- Cihaz: bildirim için cihaz token'ı
- Ödeme: kart bilgileri OYNA sunucularında saklanmaz, doğrudan ödeme kuruluşunda işlenir

2. VERİLERİN KULLANIM AMACI
Hizmetin sunulması, rezervasyon ve ödeme süreçleri, bildirimler, güvenlik ve dolandırıcılık önleme, hizmet iyileştirme.

3. VERİLERİN PAYLAŞIMI VE GÖRÜNÜRLÜĞÜ
Verileriniz; rezervasyon yaptığınız tesis ile (gerekli asgari ölçüde — olağan rezervasyonda tesise ad-soyad veya telefonunuz aktarılmaz), kaleci/hakem gibi hizmet sağlayıcılar ile (ifa için gerekli asgari ölçüde; telefon/e-posta/konum aktarılmaz), ödeme kuruluşu ile (ödeme işlemleri için), teknoloji/altyapı tedarikçilerimiz ile ve yasal yükümlülükler kapsamında yetkili mercilerle paylaşılabilir. Bir maça katıldığınızda adınız ve profil görseliniz o maçı görüntüleyenlere görünür olur; saha/hizmet sağlayıcı hakkındaki değerlendirme ve yorumlarınız kamuya açık olarak gösterilebilir. Verileriniz pazarlama amacıyla üçüncü taraflara satılmaz.

4. YURT DIŞINA AKTARIM
Bazı teknoloji tedarikçilerimizin sunucuları yurt dışında olabilir; bu hâlde aktarım, 6698 sayılı Kanun'un 9. maddesi ve ilgili mevzuata uygun güvenceler dahilinde yapılır.

5. ÇEREZLER VE BENZER TEKNOLOJİLER
Oturum yönetimi ve tercihleriniz için gerekli teknolojiler kullanılır.

6. VERİ GÜVENLİĞİ
Veriler şifreli bağlantı (HTTPS) üzerinden iletilir ve erişim yetkilendirmesi (RLS) ile korunur.

7. HAKLARINIZ (KVKK m.11)
Verilerinize erişme, düzeltme, silme ve işlemeye itiraz haklarınız için: ${CONTACT_EMAIL}

8. SAKLAMA SÜRESİ
Veriler, hizmetin gerektirdiği ve mevzuatın öngördüğü süre boyunca saklanır.`,
  },
  KVKK: {
    title: 'KVKK Aydınlatma Metni',
    icon: Shield,
    body: `Son güncelleme: ${UPDATED}

6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, veri sorumlusu sıfatıyla ${COMPANY} tarafından kişisel verileriniz aşağıda açıklanan kapsamda işlenmektedir.

1. VERİ SORUMLUSU
${COMPANY}
Vergi Dairesi/No: ${TAX_INFO}
Adres: ${ADDRESS}

2. İŞLENEN KİŞİSEL VERİLER
Kimlik, iletişim, konum, rehber eşleştirme (yalnızca izninizle), işlem, kullanım ve (izin verirseniz) cihaz/fotoğraf verileri. Reşit olmayan kullanıcılarda veli onayı için veli ve çocuğa ait ad-soyad, doğum tarihi ve T.C. Kimlik No işlenir; T.C. Kimlik numaraları şifrelenerek (hash) saklanır, açık tutulmaz.

3. İŞLEME AMAÇLARI
- Üyelik ve hesap yönetimi
- Saha rezervasyonu ve kapora tahsilatının gerçekleştirilmesi
- Maç/takım eşleştirme ve arkadaş bulma
- Müşteri ilişkileri ve destek
- Yasal yükümlülüklerin yerine getirilmesi

4. HUKUKİ SEBEPLER
Sözleşmenin kurulması/ifası, hukuki yükümlülük, meşru menfaat ve açık rıza (rehber eşleştirme ve konum gibi gerekli hallerde).

5. TOPLAMA YÖNTEMİ
Verileriniz, uygulamayı kullanımınız sırasında elektronik ortamda, doğrudan sizden veya cihazınızdan (izninizle) elde edilir.

6. AKTARIM VE GÖRÜNÜRLÜK
Verileriniz; ödeme kuruluşları, rezervasyon yaptığınız tesisler, kaleci/hakem gibi hizmet sağlayıcılar, teknoloji/altyapı tedarikçilerimiz (gerekirse yurt dışında yerleşik) ve yetkili kamu kurumlarına, ilgili hizmetin ifası için gerekli asgari ölçüde aktarılabilir. Ayrıca bir maça katıldığınızda adınız ve profil görseliniz o maçı görüntüleyenlere görünür olur; değerlendirme ve yorumlarınız kamuya açık olarak yayımlanabilir.

7. HAKLARINIZ
KVKK m.11 kapsamındaki haklarınızı (bilgi talep etme, düzeltme, silme, itiraz ve zararın giderilmesini isteme dahil) ${CONTACT_EMAIL} adresine yazılı başvuruda bulunarak kullanabilirsiniz.`,
  },
  RIZA: {
    title: 'KVKK Açık Rıza Metni',
    icon: ShieldCheck,
    body: `Son güncelleme: ${UPDATED}

6698 sayılı KVKK uyarınca bazı veri işleme faaliyetlerimiz için "açık rızanız" gerekir — yalnızca sizin özgür iradenizle, aşağıdaki bilgilendirmeye dayanarak verdiğiniz onay. Her biri ayrı ayrı verilir ve geri alınabilir; birini reddetmeniz OYNA'nın temel hizmetlerini (saha keşfi, rezervasyon, maç) kullanmanızı engellemez.

1. REHBER EŞLEŞTİRME İZNİ
"Rehberini Bağla" özelliğini kullanmayı seçerseniz: cihazınızdaki rehber okunur, numaralar cihazda şifrelenir (SHA-256) ve yalnızca bu şifreli hâli, OYNA'da arkadaşlarınızı bulmak amacıyla sunucumuza gönderilir. OYNA'da hesabı olmayan kişilerin ham telefon numarası cihazınızdan hiçbir şekilde çıkmaz. Bu izni Ayarlar → Gizlilik'ten istediğiniz zaman geri alabilirsiniz.

2. KONUM VERİSİ İZNİ
Yakınınızdaki sahaları ve maçları gösterebilmemiz için konumunuzu işleriz. Bu izni cihaz ayarlarından istediğiniz zaman kapatabilirsiniz; kapattığınızda yalnızca konum temelli özellikler çalışmaz, diğer tüm özellikler etkilenmez.

3. TİCARİ ELEKTRONİK İLETİ (KAMPANYA/DUYURU) İZNİ — OPSİYONEL
Fırsat, kampanya ve duyuruları e-posta veya push bildirimi yoluyla almak isterseniz ayrıca onayınız istenir. Bu onay olmasa da hesabınızla ilgili işlem ve güvenlik bildirimlerini almaya devam edersiniz. Vazgeçmek için iletideki bağlantıyı kullanabilir veya Ayarlar → Bildirimler'den kapatabilirsiniz.

4. RIZANIN GERİ ALINMASI
Yukarıdaki izinlerin tamamını veya bir kısmını Ayarlar → Gizlilik ekranından ya da ${CONTACT_EMAIL} adresine yazarak istediğiniz an geri alabilirsiniz. Geri alma, geri alma tarihinden önceki işlemlerin hukuka uygunluğunu etkilemez.`,
  },
  VELI: {
    title: 'Veli Muvafakatnamesi',
    icon: Users,
    body: `Son güncelleme: ${UPDATED} · Sürüm: 2026-07-14

Bu muvafakatname, 18 yaşından küçük bir kullanıcının OYNA'yı ödeme ve maça katılım dahil kullanabilmesi için, velisi/vasisi tarafından kendi doğrulanmış OYNA hesabı üzerinden verilen onayı düzenler.

1. NASIL ÇALIŞIR
Küçük kullanıcının hesabında görünen "Veli Bağlantı Kodu"nu, veli kendi OYNA hesabından Ayarlar → Veli Onayı bölümüne girer; kendi ve çocuğun ad-soyad, T.C. Kimlik No ve doğum tarihini beyan edip bu muvafakatnameyi onaylar. Onay velinin kendi oturumundan verilir; küçüğün "kabul ediyorum" işareti tek başına yeterli değildir.

2. ONAYIN KAPSAMI
Veli; çocuğunun OYNA'yı kullanmasına, saha rezervasyonu yapmasına, maçlara katılmasına ve bunlara ilişkin ödemeleri gerçekleştirmesine muvafakat eder.

3. SÜREKLİLİK
Onay, geri alınmadığı sürece çocuğun olağan işlemlerini kapsar; her işlem için ayrıca onay istenmez.

4. 18 YAŞ — OTOMATİK SONA ERME
Beyan edilen doğum tarihine göre çocuk 18 yaşını doldurduğunda sınırlı mod ve veli onayı gerekliliği kendiliğinden sona erer.

5. GERİ ALMA
Veli, onayı Ayarlar → Veli Onayı ekranından veya ${CONTACT_EMAIL} üzerinden dilediği zaman geri alabilir; en geç 48 saat içinde etkili olur.

6. KVKK
Beyan edilen T.C. Kimlik numaraları şifrelenerek (hash) yalnızca doğrulama amacıyla saklanır; açık biçimde tutulmaz. Ayrıntı için KVKK Aydınlatma Metni ve Gizlilik Politikası'na bakınız.

Bu muvafakatname, Kullanım Şartları madde 4'ün ayrılmaz ekidir.`,
  },
  CEREZ: {
    title: 'Çerez Politikası',
    icon: Cookie,
    body: `Son güncelleme: ${UPDATED}

Bu politika, OYNA'nın web yüzeylerinde (oyna.app ve alt sayfaları, web uygulaması) kullanılan çerezleri ve tarayıcı depolama teknolojilerini açıklar. Mobil uygulamada çerez kullanılmaz; cihaz izinleri Gizlilik Politikası'nda ayrıca açıklanmıştır.

1. ZORUNLU ÇEREZLER / DEPOLAMA
Oturumunuzu açık tutmak ve güvenliğinizi sağlamak için gereklidir; devre dışı bırakılamaz ve rıza gerektirmez. (Supabase oturum belirteci — çıkış yapana veya hesabınızı silene kadar localStorage'da kalıcı olarak tutulur.)

2. PERFORMANS VE ANALİTİK ÇEREZLERİ
Yalnızca ilgili ölçüm servisi etkinleştirilmişse kullanılır: PostHog (kullanım analitiği, localStorage + çerez) ve Sentry (hata/çökme takibi, kimliklendirici alanlar temizlenerek). Bu tedarikçilerin sunucuları yurt dışında olabilir; aktarım koşulları Gizlilik Politikası'nın "Yurt Dışına Aktarım" bölümünde açıklanmıştır.

3. YÖNETİM VE TERCİHLERİNİZ
Tarayıcınızın ayarlarından çerezleri ve site verilerini istediğiniz zaman silebilir veya engelleyebilirsiniz; bu, zorunlu çerezler için oturumunuzun sonlanmasına neden olabilir. Analitik amaçlı depolamayı reddetmeniz, hizmeti kullanmanızı engellemez.

4. İLETİŞİM
Sorularınız için: ${CONTACT_EMAIL}`,
  },
  SALES: {
    title: 'Mesafeli Satış ve İptal/İade',
    icon: RefreshCw,
    body: `Son güncelleme: ${UPDATED}

1. SATICI / ARACI
Saha kiralama hizmetinin sağlayıcısı ilgili tesistir. ${COMPANY}, ödeme ve rezervasyon sürecinde aracı hizmet sağlayıcıdır.

2. HİZMETİN KONUSU VE BEDELİ
Hizmet, seçtiğiniz tesis ve saatteki saha kiralamasıdır. Kapora tutarı ve toplam ücret rezervasyon ekranında açıkça gösterilir.

3. ÖDEME
Kapora, uygulama üzerinden güvenli ödeme altyapısı ile tahsil edilir. Kalan tutarın ödeme şekli tesise göre değişebilir.

4. İPTAL VE İADE KOŞULLARI
- Rezervasyon/maç saatine 24 SAATTEN FAZLA süre kala yapılan iptallerde: ödenen tutarın tamamına yakını iade edilir (yalnızca ödeme altyapısı sağlayıcısının kestiği işlem bedeli hariç).
- Rezervasyon/maç saatine 6-24 SAAT kala yapılan iptallerde: ödenen tutarın %50'si iade edilir.
- Rezervasyon/maç saatine 6 SAATTEN AZ kala yapılan iptallerde: iade yapılmaz.

4.1 İADE NEREYE YAPILIR?
- İade, ödemenin yapıldığı karta değil, OYNA cüzdanınıza yapılır. Tutar, iptal işlemi tamamlandığı anda cüzdanınıza geçer.
- Cüzdanınızdaki tutarı OYNA içindeki tüm saha, maç ve kaleci/hakem ödemelerinde harcayabilirsiniz.
- Para çekimi lansman döneminde açık değildir; cüzdanınızdaki tutarı bu dönemde Platform içi ödemelerde kullanabilirsiniz. Özellik açıldığında bildirim yapılır.
- Özellik açıldığında cüzdanınızdaki tutar için para çekme talebi oluşturabilirsiniz. Çekimde %5 hizmet bedeli kesilir; kalan tutar kendi adınıza kayıtlı banka hesabına gönderilir.
- Minimum çekim tutarı 100 ₺'dir. Bakiyenizin tamamını çekiyorsanız bu alt sınır aranmaz.
- Çekim koşullarının tamamı Kullanım Şartları madde 6.5'te ("Cüzdan ve Para Çekimi") düzenlenmiştir.

5. CAYMA HAKKI İSTİSNASI
Belirli bir tarih/saat için yapılan rezervasyonlar, Mesafeli Sözleşmeler Yönetmeliği m.15/1-ğ kapsamında "boş zamanın değerlendirilmesine ilişkin hizmetler" istisnasına tabidir; bu nedenle 14 günlük cayma hakkı uygulanmaz, iptal koşulları yukarıdaki kurallara tabidir.

6. UYUŞMAZLIK
Şikayetlerinizde ${CONTACT_EMAIL} ile iletişime geçebilir, çözülemeyen uyuşmazlıklarda Tüketici Hakem Heyetleri'ne başvurabilirsiniz.`,
  },
};

const ORDER: LegalDocKey[] = ['TERMS', 'TOPLULUK', 'PRIVACY', 'KVKK', 'RIZA', 'VELI', 'CEREZ', 'SALES'];

const LegalScreen: React.FC<LegalScreenProps> = ({ onBack, initialDoc }) => {
  const [doc, setDoc] = useState<LegalDocKey | null>(initialDoc ?? null);

  if (doc) {
    const d = DOCS[doc];
    return (
      <div className="min-h-screen bg-[#0A0E14] text-white font-sans">
        <header className="sticky top-0 z-20 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 px-6 py-5 flex items-center gap-4">
          <button onClick={() => setDoc(null)} className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-extrabold italic tracking-tight">{d.title.toUpperCase()}</h1>
        </header>
        <main className="p-6 max-w-2xl mx-auto">
          <div className="bg-[#161B22] border border-white/5 rounded-3xl p-6">
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300 leading-relaxed">{d.body}</pre>
          </div>
          <p className="text-[10px] text-gray-600 text-center mt-6 leading-relaxed">
            Bu belgeler hakkında sorularınız için {CONTACT_EMAIL} adresinden bize ulaşabilirsiniz.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white font-sans">
      <header className="sticky top-0 z-20 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 px-6 py-5 flex items-center gap-4">
        <button onClick={onBack} className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold italic tracking-tight">YASAL</h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Sözleşmeler ve politikalar</p>
        </div>
      </header>
      <main className="p-6 max-w-2xl mx-auto">
        <div className="flex flex-col">
          {ORDER.map((key) => {
            const d = DOCS[key];
            const Icon = d.icon;
            return (
              <button
                key={key}
                onClick={() => setDoc(key)}
                className="w-full flex items-center justify-between p-4 bg-[#161B22] border border-white/5 first:rounded-t-2xl last:rounded-b-2xl border-b-0 last:border-b hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="text-gray-400"><Icon size={20} /></div>
                  <span className="text-sm font-bold text-white">{d.title}</span>
                </div>
                <ChevronRight size={16} className="text-gray-600" />
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default LegalScreen;
