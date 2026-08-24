// ⚠️ ÜRETİLMİŞ DOSYA — ELLE DÜZENLEME.
// Kaynak: sozlesmeler/kaleci-hakem/*.md · sozlesmeler/saha-sahibi/*.md
// Yeniden üret: node scripts/build-legal-roles.mjs
//
// Bu iki sözleşme neden ayrı modülde ve neden "örnek metin" damgalı:
// bkz. scripts/build-legal-roles.mjs dosya başı.
import type React from 'react';
import { Scale, Building2 } from 'lucide-react';

export type RolBelgeAnahtari = 'SAGLAYICI' | 'ISLETME';

export const ROL_BELGELERI: Record<
  RolBelgeAnahtari,
  { title: string; icon: React.ElementType; body: string }
> = {
  SAGLAYICI: {
    title: 'Kaleci / Hakem Hizmet Sözleşmesi',
    icon: Scale,
    body: `⚠️ BU METİN BİLGİ AMAÇLI ÖRNEKTİR — BAĞLAYICI DEĞİLDİR.

Aşağıdaki sözleşme, OYNA ile çalışmaya başladığında imzalayacağın metnin
örneğidir; şartları önceden okuyabilmen için burada duruyor. Henüz
imzalanmış bir sözleşme yerine geçmez ve tek başına taraflar arasında hak
ya da yükümlülük doğurmaz.

İçindeki köşeli parantezli alanlar ([AD SOYAD], [IBAN] gibi) sana özel
bilgilerle doldurulacak yerlerdir. İmzalanacak nihai nüsha, ticari
şartlarıyla birlikte sana ayrıca iletilir.

Soruların için: mirackeremcuruksulu@gmail.com

────────────────────────────────────────────────────────────

OYNA Bağımsız Kaleci / Hakem Hizmet Sağlayıcısı Sözleşmesi

Son güncelleme: 13.07.2026

TARAFLAR

Bir tarafta;

Miraç Kerem Çürüksulu (bundan böyle kısaca "OYNA" olarak anılacaktır; işbu Sözleşme'de zaman zaman kullanılan "Şirket" ifadesi yalnızca OYNA'nın işletmeci/tacir sıfatını ifade etmek amacıyla kullanılmıştır ve ayrı bir tüzel kişiliğe atıf teşkil etmez.)
- Vergi Dairesi/No: Kartal Vergi Dairesi – 2650883645
- Adres: Cevizli Mahallesi, Zuhal Caddesi, Ritim İstanbul A Ticari Blok No:46 Daire:50, Kartal/İstanbul (İşbu adres, OYNA'nın faaliyet gösterdiği ofis biriminin adresidir. Aynı bina içinde üçüncü kişi gerçek/tüzel kişiliklerin (ör. ofis/bina hizmeti sağlayıcıları) bulunması, işbu Sözleşme'nin tarafının münhasıran yukarıda kimliği belirtilen gerçek kişi olduğu hususunu hiçbir şekilde etkilemez ve OYNA ile başka herhangi bir tüzel kişi arasında ortak taraf sıfatı doğurmaz.)
- E-posta: mirackeremcuruksulu@gmail.com

ile diğer tarafta;

[AD SOYAD] (bundan böyle kısaca "Hizmet Sağlayıcı" olarak anılacaktır)
- T.C. Kimlik No: [T.C. KİMLİK NO]
- Vergi No (varsa): [VERGİ NO]
- IBAN: [IBAN]
- İletişim Bilgisi: Platform hesabına kayıtlı e-posta adresi ve telefon numarası

(OYNA ve Hizmet Sağlayıcı birlikte "Taraflar", ayrı ayrı "Taraf" olarak anılacaktır.)

Taraflar aşağıdaki hüküm ve koşullar üzerinde anlaşmışlardır:

────────────────

1. Tanımlar

1.1. Platform: OYNA'ya ait mobil uygulama ve/veya internet sitesi üzerinden sunulan halı saha rezervasyonu, maç eşleştirme ve kaleci/hakem hizmet sağlayıcı pazaryeri hizmetlerinin bütünü.

1.2. Hizmet: Hizmet Sağlayıcı'nın Platform üzerinden kendisine iletilen taleplere istinaden, tamamen kendi serbest iradesiyle kabul ettiği maçlarda sunduğu kalecilik ve/veya hakemlik hizmeti.

1.3. Kullanıcı/Oyuncu: Platform üzerinden saha rezervasyonu yapan, maça katılan ve/veya Platform aracılığıyla Hizmet Sağlayıcı ile eşleşen gerçek kişi.

1.4. Rezervasyon: Belirli bir tarih, saat ve sahada gerçekleştirilecek maç için Platform üzerinden yapılan kayıt.

1.5. Ödeme Altyapısı Sağlayıcısı: OYNA'nın ödeme tahsilat ve aktarım işlemleri için anlaşmalı olduğu iyzico Ödeme Hizmetleri A.Ş.

1.6. KVKK: 6698 sayılı Kişisel Verilerin Korunması Kanunu.

1.7. TBK: 6098 sayılı Türk Borçlar Kanunu.

1.8. TTK: 6102 sayılı Türk Ticaret Kanunu.

1.9. TKHK: 6502 sayılı Tüketicinin Korunması Hakkında Kanun.

1.10. Hizmet Bedeli: Madde 8.1 uyarınca, bir Hizmet karşılığında Kullanıcı/Oyuncu tarafından Platform üzerinden ödenen brüt bedel.

1.11. Hizmet Sağlayıcı Payı: Madde 8.1 ve 8.2 uyarınca, Hizmet Bedeli'nden OYNA'nın madde 8.2'de düzenlenen komisyonunun düşülmesi sonucu kalan ve Hizmet Sağlayıcı'ya ödenecek net tutar.

2. Sözleşmenin Konusu

2.1. İşbu Sözleşme'nin konusu; OYNA'nın işlettiği Platform üzerinden Hizmet Sağlayıcı ile Kullanıcı/Oyuncu'yu bir araya getiren aracılık/eşleştirme hizmeti sunması, bu kapsamda gerçekleşen Hizmet karşılığı ücretin tahsilatı ve Hizmet Sağlayıcı'ya aktarımı için gerekli ödeme altyapısını sağlaması ile bu ilişkiden doğan Tarafların karşılıklı hak ve yükümlülüklerinin belirlenmesidir.

2.2. OYNA, Platform üzerinden yalnızca bir aracılık/eşleştirme ve ödeme tahsilat-aktarım hizmeti sunar. OYNA, hakemlik veya kalecilik hizmetinin bizzat sağlayıcısı değildir; bu hizmet münhasıran Hizmet Sağlayıcı tarafından kendi bilgi, beceri ve sorumluluğu ile ifa edilir.

3. Bağımsız Yüklenici Statüsü

3.1. Taraflar, Hizmet Sağlayıcı'nın OYNA'nın işçisi, çalışanı, temsilcisi, acentesi veya OYNA'ya bağımlı herhangi bir personeli OLMADIĞINI; Hizmet Sağlayıcı'nın işbu Sözleşme kapsamında bağımsız bir hizmet sağlayıcı/yüklenici sıfatıyla hareket ettiğini karşılıklı olarak kabul ve beyan eder.

3.2. Bu kapsamda Hizmet Sağlayıcı:

&nbsp;&nbsp;a) Hangi gün ve saatlerde Platform üzerinden hizmet vereceğine, hangi maç taleplerini kabul veya reddedeceğine tamamen serbestçe ve kendi takdirine göre karar verir; OYNA tarafından belirlenmiş sabit bir çalışma programına, asgari çalışma saatine veya devamlılık zorunluluğuna tabi değildir.

&nbsp;&nbsp;b) Aynı anda başka halı saha/spor organizasyonu platformlarında ve/veya Platform dışında tamamen bağımsız biçimde kalecilik/hakemlik hizmeti sunabilir (madde 7).

&nbsp;&nbsp;c) Hizmetin ifası için gerekli kişisel ekipmanı kendisi temin eder (madde 6).

&nbsp;&nbsp;d) OYNA'dan hizmetin ifa şekline, tekniğine veya sahadaki kararlarına ilişkin doğrudan talimat, denetim veya gözetim almaz. OYNA yalnızca Platform'un işleyişine ilişkin genel kullanım kurallarını (ör. puanlama, şikâyet, ödeme süreçleri) belirleyebilir; bu genel ve herkese eşit uygulanan kurallar bir istihdam/talimat ilişkisi doğurmaz.

&nbsp;&nbsp;e) Hizmet karşılığında elde ettiği gelirin vergisel nitelendirilmesinden ve beyanından bizzat sorumludur (madde 8).

3.3. İşbu madde hükümleri, Taraflar arasında hiçbir şekilde bir hizmet/iş sözleşmesi, ortaklık, temsilcilik veya acentelik ilişkisi kurmaz.

4. Yaş ve Uygunluk

4.1. Hizmet Sağlayıcı, işbu Sözleşme'yi onayladığı tarihte 18 yaşını doldurmuş ve fiil ehliyetine sahip olduğunu beyan eder. 18 yaşından küçük kişiler Platform üzerinden kaleci/hakem hizmet sağlayıcısı olarak kayıt olamaz ve hizmet sunamaz.

4.2. Platform üzerinden hizmet sunabilmek için resmi bir hakemlik/kalecilik lisansı, sertifikası veya federasyon onayı ARANMAZ. Hizmet Sağlayıcı'nın kayıt sırasında beyan ettiği deneyim seviyesi (ör. amatör, orta, deneyimli), doğrulanmış bir yeterlilik belgesi olarak değil, yalnızca Kullanıcı/Oyuncu'ya yönelik bilgilendirici bir güven sinyali olarak Platform üzerinde gösterilebilir. OYNA, bu beyanın doğruluğunu garanti etmez.

5. Doğrulama ve Kimlik Kontrolü

5.1. OYNA, Hizmet Sağlayıcı hakkında resmi adli sicil kaydı veya benzeri özel nitelikli kişisel veri işlenmesini gerektiren bir geçmiş araştırması YAPMAZ.

5.2. Bunun yerine OYNA:

&nbsp;&nbsp;a) Hizmet Sağlayıcı'nın kimlik bilgilerini (T.C. kimlik no, ad-soyad, iletişim bilgisi) genel doğrulama yöntemleriyle teyit eder;

&nbsp;&nbsp;b) Hizmet Sağlayıcı'dan, kaleci/hakem olarak hizmet vermesine engel teşkil edecek şiddet, dolandırıcılık, cinsel dokunulmazlığa karşı suç veya benzeri diskalifiye edici bir sabıka/geçmişinin bulunmadığına dair yazılı beyan alır;

&nbsp;&nbsp;c) Hizmet sürecinde madde 10'da düzenlenen puanlama ve şikâyet sistemine dayalı sonradan (ex-post) izleme uygular.

5.3. Hizmet Sağlayıcı, madde 5.2(b) kapsamındaki beyanının gerçeğe aykırı çıkması hâlinde OYNA'nın madde 12'de tanımlanan derhal fesih hakkını kullanabileceğini kabul eder.

6. Ekipman

6.1. Hizmet ifası için gerekli kişisel ekipman (eldiven, düdük, kart seti, kronometre vb.) Hizmet Sağlayıcı tarafından kendi imkânlarıyla temin edilir. OYNA'nın ekipman sağlama yükümlülüğü bulunmamaktadır.

6.2. OYNA, Hizmet Sağlayıcı'nın Platform üzerinde tanınabilirliğini artırmak amacıyla opsiyonel bir kol bandı, rozet veya benzeri hafif bir marka unsuru sunabilir. Bu unsurun kullanımı tamamen Hizmet Sağlayıcı'nın tercihine bağlıdır; OYNA logolu tip kıyafet veya üniforma giyilmesi ZORUNLU DEĞİLDİR ve OYNA bunu bir şart olarak koşamaz.

7. Münhasırıyet Bulunmaması

7.1. İşbu Sözleşme, Hizmet Sağlayıcı'ya herhangi bir münhasırlık yükümlülüğü getirmez. Hizmet Sağlayıcı, dilediği sayıda başka rezervasyon/eşleştirme platformuna kayıtlı olabilir, bu platformlar üzerinden hizmet verebilir ve/veya Platform dışında tamamen bağımsız olarak kalecilik/hakemlik hizmeti sunmaya devam edebilir. Bu durum işbu Sözleşme'nin ihlali sayılmaz ve OYNA tarafından herhangi bir yaptırıma konu edilemez.

7.2. Dolanma Karşıtı (Non-circumvention) Hüküm: Hizmet Sağlayıcı'nın Platform aracılığıyla tanıştığı bir Kullanıcı/Oyuncu veya takımla ileride Platform dışında doğrudan anlaşarak hizmet sunması, tek başına işbu Sözleşme'nin ihlali sayılmaz. Taraflar yalnızca, Platform'un eşleştirme hizmetine ilişkin bedelini sistematik ve kötüniyetli biçimde bertaraf etmeye yönelik davranışlardan (ör. Platform üzerinden kurulan her eşleşmeyi münhasıran ücret ödememek amacıyla tekrar tekrar Platform dışına taşımak) kaçınmayı iyi niyet çerçevesinde taahhüt eder. Bu fıkra, Hizmet Sağlayıcı'nın mesleki faaliyetini kısıtlayan bir rekabet yasağı olarak yorumlanamaz ve tek başına bir yaptırım/cezai şart doğurmaz.

8. Ücret, Ödeme ve Vergi

8.1. Hizmet Sağlayıcı, sunduğu her Hizmet karşılığında, Platform üzerinde ilan edilen ve Kullanıcı ile mutabık kalınan brüt bedele ("Hizmet Bedeli") hak kazanır. Hizmet Bedeli'nden madde 8.2'de düzenlenen OYNA komisyonunun düşülmesinden sonra kalan net tutar ("Hizmet Sağlayıcı Payı"), madde 8.3 ve 8.4 hükümlerine göre Hizmet Sağlayıcı'ya ödenir.

8.2. OYNA, Platform üzerinden sunduğu aracılık/eşleştirme ve ödeme altyapısı hizmeti karşılığında, her Hizmet Bedeli üzerinden bir komisyon keser. İşbu Sözleşme'nin onaylandığı tarih itibarıyla uygulanan komisyon oranı, Hizmet Bedeli'nin %15'idir (yüzde on beş). Güncel komisyon oranı her zaman Platform üzerinde ve Hizmet Sağlayıcı'nın hesap ayarlarında görüntülenebilir şekilde tutulur. Komisyon oranının Hizmet Sağlayıcı aleyhine artırılması veya Hizmet Sağlayıcı Payı'nı azaltacak şekilde ödeme usulünün değiştirilmesi, madde 19.2(b)'de düzenlenen açık onay mekanizmasına tabidir.

8.3. Ödemeler iyzico altyapısı üzerinden tahsil edilir ve Hizmet Sağlayıcı'nın Platform'a bildirdiği IBAN'a aktarılır. Kart bilgileri OYNA sunucularında saklanmaz.

8.4. OYNA, yürürlükteki vergi mevzuatı uyarınca kesmekle yükümlü olabileceği gelir vergisi stopajı ve/veya sair yasal kesintileri Hizmet Sağlayıcı Payı üzerinden yaptıktan sonra kalan NET tutarı Hizmet Sağlayıcı'ya öder. Yapılan her kesinti, ilgili dönem için Platform üzerinden veya e-posta yoluyla Hizmet Sağlayıcı'ya bildirilir.

8.5. Hizmet Sağlayıcı, OYNA tarafından yapılan herhangi bir stopaj kesintisinden bağımsız olarak, elde ettiği gelire ilişkin kendi beyan (gelir vergisi beyannamesi, arızi kazanç beyanı, esnaf/mükellefiyet yükümlülükleri vb.) ve ödeme yükümlülüklerinden bizzat ve münhasıran sorumludur. OYNA'nın stopaj kesintisi yapmış olması, Hizmet Sağlayıcı'yı kendi vergisel yükümlülüklerinden ibra etmez.

9. No-Show ve İptal

9.1. Hizmet Sağlayıcı'nın Kabul Ettiği Hizmete Gelmemesi (No-Show):

&nbsp;&nbsp;a) İlk ihlalde: Hizmet Sağlayıcı'ya yazılı uyarı yapılır. Ayrıca, ilgili Hizmet için Hizmet Sağlayıcı'nın hak kazanmış olacağı Hizmet Sağlayıcı Payı esas alınarak hesaplanan tutarın %50'si (yüzde elli), OYNA'nın Kullanıcı'ya fiilen bir iade/tazminat ödemesi yapıp yapmadığından bağımsız olarak, Hizmet Sağlayıcı'nın bekleyen/tahakkuk edecek diğer ödemelerinden mahsup edilir. OYNA'nın söz konusu no-show nedeniyle Kullanıcı'ya fiilen ödediği iade/tazminat tutarının, bu şekilde mahsup edilen tutarı aşması hâlinde, aşan kısım da ayrıca Hizmet Sağlayıcı'nın bekleyen/tahakkuk edecek ödemelerinden mahsup edilir.

&nbsp;&nbsp;b) Geriye dönük 90 (doksan) gün içinde ikinci ihlalde: Hizmet Sağlayıcı'nın hesabı geçici olarak askıya alınır. Askıya alma bildirimiyle birlikte Hizmet Sağlayıcı'ya, madde 10.3'te düzenlenen usule uygun olarak 7 (yedi) günlük bir itiraz süresi tanınır; itiraz süreci ve sonuçları (askının kaldırılması veya devamı) madde 10.3 ve 10.4 hükümlerine kıyasen uygulanır. İnceleme, itiraz süresinin bitiminden itibaren azami 5 (beş) iş günü içinde sonuçlandırılır; bu süre içinde ihlalin gerçekleşmediği tespit edilirse hesap derhal yeniden aktif hâle getirilir.

&nbsp;&nbsp;c) Geriye dönük 90 (doksan) gün içinde üçüncü ihlalde: Hizmet Sağlayıcı'nın hesabı kalıcı olarak Platform'dan çıkarılır.

9.2. Kullanıcı/Oyuncu Tarafının Geç İptali: Kullanıcı/Oyuncu'nun rezervasyon/maç saatine ilişkin geç iptal yapması hâlinde, aşağıdaki iade kademeleri uygulanır:

&nbsp;&nbsp;a) Maç/rezervasyon saatine 24 (yirmi dört) saat veya daha fazla kala yapılan iptallerde: Kullanıcı'ya, yalnızca Ödeme Altyapısı Sağlayıcısı'nın tahsil ettiği işlem bedeli hariç olmak üzere, ödemenin tamamı Kullanıcı'nın OYNA cüzdanına iade edilir.

&nbsp;&nbsp;b) Maç/rezervasyon saatine 6 (altı) saatten fazla ancak 24 (yirmi dört) saatten az kala yapılan iptallerde: Ödemenin %50'si (yüzde elli), Kullanıcı'nın OYNA cüzdanına iade edilir.

&nbsp;&nbsp;c) Maç/rezervasyon saatine 6 (altı) saatten az kala yapılan iptallerde: İade yapılmaz.

Bu kademeler, OYNA'nın Mesafeli Satış ve İptal/İade Koşulları'nda düzenlenen iade rejimiyle birebir örtüşür. Kullanıcı (tüketici) ile OYNA arasındaki ilişkide, iki metin arasında çelişki olması hâlinde her hâlükârda Mesafeli Satış ve İptal/İade Koşulları esas alınır; işbu madde 9.2 yalnızca OYNA ile Hizmet Sağlayıcı arasındaki hakediş ve mahsup ilişkisini düzenler. Kullanıcı'ya iade edilmeyen tutarın, madde 8.1'de tanımlanan Hizmet Sağlayıcı Payı'na isabet eden kısmı, ayrılan zaman için hazır bulunma karşılığı olarak Hizmet Sağlayıcı'ya ödenir.

10. Puanlama, Askıya Alma ve Kalıcı Çıkarma

10.1. Kullanıcılar, her Hizmet sonrasında Hizmet Sağlayıcı'yı Platform üzerinden puanlayabilir ve şikâyette bulunabilir.

10.2. Aşağıdaki eşiklerden herhangi birinin gerçekleşmesi hâlinde Hizmet Sağlayıcı'nın hesabı geçici olarak askıya alınır:

&nbsp;&nbsp;a) Son 10 (on) tamamlanmış Hizmet'teki ortalama puanın 5 üzerinden 3,0'ın altında olması. Bu ortalamanın hesaplanmasında, OYNA'nın kötüye kullanım/anormallik tespiti kapsamında sahte veya mükerrer hesaplardan verildiği, ilgili Hizmet'le makul bir ilgisi bulunmayan gerekçelere (ör. ayrımcılık, kişisel husumet, Hizmete konu olmayan sebepler) dayandığı ya da kötü niyetli olduğu tespit edilen puanlar hesaplamaya dâhil edilmez; VEYA

&nbsp;&nbsp;b) Geriye dönük 90 (doksan) gün içinde OYNA tarafından incelenip asılsız/kötü niyetli olmadığı doğrulanmış (onaylanmış) 3 (üç) veya daha fazla şikâyetin bulunması.

10.3. Askıya alma bildirimiyle birlikte Hizmet Sağlayıcı'ya 7 (yedi) günlük bir itiraz süresi tanınır. Hizmet Sağlayıcı bu süre içinde mirackeremcuruksulu@gmail.com adresine itirazını ve varsa destekleyici bilgi/belgelerini iletebilir. İtiraz; ilgili Hizmet'e ait mesajlaşma kayıtları, zaman/konum damgası verileri, varsa çoklu Kullanıcı/Oyuncu beyanları ve benzeri objektif veriler esas alınarak OYNA tarafından değerlendirilir.

10.4. İtiraz süresi sonunda itiraz haksız bulunur veya süresinde itiraz edilmezse, Hizmet Sağlayıcı'nın hesabı kalıcı olarak Platform'dan çıkarılır. İtirazın haklı bulunması hâlinde askı kaldırılır ve hesap yeniden aktif hâle getirilir.

11. Saha İçi Olay Sorumluluğu ve Sorumluluğun Sınırlandırılması

11.1. Hizmet, münhasıran Hizmet Sağlayıcı'nın kendi mesleki bilgi, beceri ve takdiri ile ifa edilir. Sahada verilen her türlü karar (hakem kararları, kalecilik performansı, oyuncularla etkileşim dâhil) yalnızca ve tamamen Hizmet Sağlayıcı'nın sorumluluğundadır.

11.2. OYNA, Hizmet Sağlayıcı'nın sahadaki eylem, ihmal, karar veya davranışlarından kaynaklanan hiçbir zarardan sorumlu değildir. OYNA'nın, Hizmet Sağlayıcı'nın saha içi eylem ve kararlarından kaynaklanan bu tür zararlara ilişkin sorumluluğu — varsa — yalnızca Platform'un madde 5'te düzenlenen asgari kimlik doğrulama yükümlülüğünü hiç yerine getirmeden bir eşleştirmeyi gerçekleştirmiş olması hâliyle ve bu hâlin doğrudan sonucu olan zararla sınırlıdır. Bu fıkra, OYNA'nın işbu Sözleşme'den doğan kendi edim yükümlülüklerinin (ödeme aktarımı ve komisyon uygulaması madde 8; hesabın askıya alınması/çıkarılması usulü madde 9-10; fesih madde 12; kişisel verilerin korunması madde 14 vb.) ihlalinden doğan sorumluluğunu kapsamaz; bu tür ihlallerden doğan sorumluluk madde 11.5 ve genel hükümler (TBK) çerçevesinde ayrıca ve tam olarak değerlendirilir.

11.3. Taraflar, halı saha futbolunun ve hakemlik/kalecilik faaliyetinin doğası gereği fiziksel temas, sakatlanma ve benzeri riskler taşıdığını; bu risklerin sporun olağan ve makul riskleri olduğunu, her iki Tarafça da bilinerek kabul edildiğini beyan eder.

11.4. Hizmet Sağlayıcı'nın bireysel/amatör niteliği dikkate alınarak, işbu Sözleşme kapsamında OYNA tarafından zorunlu bir sorumluluk sigortası şartı ARANMAZ.

11.5. İşbu maddede yer alan sorumluluk sınırlamaları yalnızca hafif kusurdan kaynaklanan ve doğrudan olmayan (dolaylı) zararlar için geçerlidir. OYNA'nın kastı veya ağır kusuru ile sebep olduğu HER TÜR zarar bakımından — ölüm veya bedensel zararla sınırlı olmaksızın, maddi, mali ve diğer doğrudan zararlar dâhil olmak üzere — TBK m. 115 uyarınca sorumluluğu önceden kaldıran veya sınırlayan hiçbir hüküm uygulanmaz; işbu Sözleşme'deki (madde 11.2 dâhil) hiçbir madde, OYNA'yı kendi kastından veya ağır kusurundan doğan sorumluluktan muaf tutacak şekilde yorumlanamaz.

12. Fesih

12.1. Taraflardan her biri, herhangi bir gerekçe göstermeksizin, 7 (yedi) gün önceden yazılı bildirimde bulunmak suretiyle işbu Sözleşme'yi feshedebilir.

12.2. OYNA, aşağıdaki (a), (b) ve (c) bentlerinde sayılan hâllerin varlığı hâlinde, herhangi bir önceden bildirim süresine gerek olmaksızın Sözleşme'yi derhal feshetme ve Hizmet Sağlayıcı'nın hesabını Platform'dan çıkarma hakkına sahiptir. (d) bendinde düzenlenen fesih hakkı ise, ancak madde 10'da öngörülen askı ve itiraz sürecinin tamamlanmasını müteakip, bu sürecin sonunda kalıcı çıkarma kararı verilmesi hâlinde, ayrıca bir bildirim süresi beklenmeksizin uygulanır:

&nbsp;&nbsp;a) Hesap güvenliğinin ihlal edilmesi (ör. hesap paylaşımı, yetkisiz erişim);

&nbsp;&nbsp;b) Somut bulgu, belge veya kayıtlarla desteklenen, doğrulanmış (confirmed) dolandırıcılık;

&nbsp;&nbsp;c) Sahte belge/beyan sunulması (madde 5.2(b) kapsamındaki beyan dâhil);

&nbsp;&nbsp;d) Madde 10 uyarınca yürütülen askı ve itiraz süreci sonunda kalıcı çıkarma kararı verilmiş olması.

12.3. Dolandırıcılık Şüphesi Hâlinde Geçici Askı: OYNA'nın, henüz madde 12.2(b) kapsamında somut bulgu/belge ile doğrulanmamış ancak makul ve objektif emarelere dayanan güçlü bir dolandırıcılık şüphesi tespit etmesi hâlinde, Hizmet Sağlayıcı'nın hesabı derhal ve kalıcı fesih yerine geçici olarak askıya alınır. Askıya alma bildirimiyle birlikte Hizmet Sağlayıcı'ya, madde 10.3'te düzenlenen usule uygun olarak 7 (yedi) günlük bir itiraz/savunma süresi tanınır ve inceleme, itiraz süresinin bitiminden itibaren azami 5 (beş) iş günü içinde sonuçlandırılır. İnceleme sonucunda şüphenin somut bulgu ve belgelerle doğrulanması hâlinde madde 12.2(b) uyarınca derhal ve kalıcı fesih uygulanır; doğrulanamaması hâlinde hesap gecikmeksizin yeniden aktif hâle getirilir.

12.4. Fesih hangi sebeple gerçekleşirse gerçekleşsin (madde 12.2 kapsamındaki derhal fesih ile madde 12.3 uyarınca yürütülen inceleme sonucunda gerçekleşen fesih dâhil), Hizmet Sağlayıcı'nın fesih tarihinden önce TAMAMLANMIŞ Hizmetlere ilişkin bekleyen/tahakkuk etmiş ödemeleri, fesih sebebinden bağımsız olarak, madde 8'de düzenlenen usule göre Hizmet Sağlayıcı'ya ödenir. Bu ödeme hakkı, OYNA'nın madde 9.1(a) kapsamında yapabileceği mahsup hakkını ortadan kaldırmaz.

13. Gizlilik

13.1. Taraflar, işbu Sözleşme kapsamında birbirlerine ait olup kamuya açık olmayan her türlü ticari, mali, teknik bilgi ile Kullanıcı/Oyuncu'lara ait kişisel verileri gizli tutmayı, üçüncü kişilerle paylaşmamayı ve yalnızca işbu Sözleşme'nin ifası amacıyla kullanmayı taahhüt eder.

13.2. Hizmet Sağlayıcı; bir hizmet talebi/teklifi kapsamında Platform üzerinden yalnızca ilgili maç bilgilerine (başlık, konum, tarih, saat, format), talebi oluşturan hesabın sistem içi kimliğine (UUID) ve ücret/komisyon bilgisine erişir; arayüz, talep sahibini "Kaptan" olarak gösterir. Oyuncu'nun telefon numarası, e-posta adresi veya konumu Hizmet Sağlayıcı'ya aktarılmaz ve taraflar arasında doğrudan iletişim bilgisi paylaşılmaz; koordinasyon yalnızca Platform içi bildirimler ve maç bağlantıları üzerinden sağlanır. Hizmet Sağlayıcı, Platform üzerinden eriştiği hiçbir Oyuncu verisini ilgili Hizmetin ifası dışında bir amaçla (Platform dışı ticari amaç dâhil) kullanamaz, saklayamaz veya üçüncü kişilerle paylaşamaz.

13.3. Bu maddede düzenlenen gizlilik yükümlülüğü, Sözleşme'nin sona ermesinden sonra da geçerliliğini korur.

14. Kişisel Verilerin Korunması

14.1. Taraflar, işbu Sözleşme kapsamında işlenen kişisel verilerin KVKK hükümlerine uygun olarak işleneceğini kabul eder.

14.2. Hizmet Sağlayıcı, kendisine ait kişisel verilerin işlenmesine ilişkin KVKK m. 11 kapsamındaki haklarını mirackeremcuruksulu@gmail.com adresine yapacağı başvuru ile kullanabilir. Hesap silme talepleri, talep tarihinden itibaren 7 (yedi) gün içinde kalıcı olarak yerine getirilir.

14.3. Ayrıntılar OYNA'nın güncel Aydınlatma Metni ve Gizlilik Politikası'nda yer alır; bu metinler işbu Sözleşme'nin eki ve tamamlayıcı unsuru niteliğindedir.

14.4. Oyuncu kişisel verilerinin Hizmet Sağlayıcı ile paylaşımının kapsamı, sınırları, saklama süresi ve tarafların KVKK sıfatları (ayrı/bağımsız veri sorumlusu), işbu Sözleşme'nin ayrılmaz eki olan Veri Paylaşım Protokolü ile düzenlenir. Bu belge ile işbu madde arasında bir çelişki hâlinde, Oyuncu lehine en dar (asgari) yorum ve Protokol hükümleri esas alınır.

15. Süre

15.1. İşbu Sözleşme, Hizmet Sağlayıcı'nın Platform üzerinden onay verdiği tarihte yürürlüğe girer ve taraflardan biri madde 12 uyarınca fesih bildiriminde bulunana veya Sözleşme madde 12.2 ya da 12.3 kapsamında derhal feshedilene kadar süresiz olarak yürürlükte kalır.

16. Uyuşmazlıkların Çözümü ve Yetki

16.1. İşbu Sözleşme Türk hukukuna tabidir.

16.2. Hizmet Sağlayıcı, işbu Sözleşme kapsamındaki faaliyetini TTK anlamında ticari/mesleki bir amaçla yürütmeyi kabul eder. Bununla birlikte Taraflar, Hizmet Sağlayıcı'nın somut bir uyuşmazlıkta TKHK anlamında tüketici mi yoksa TTK anlamında tacir/esnaf mı sayılacağının, işbu Sözleşme'deki adlandırmadan bağımsız olarak, ilgili mevzuat ve somut olayın objektif koşullarına göre belirleneceğini kabul eder. Hizmet Sağlayıcı'nın somut olayda TKHK anlamında tüketici sayıldığı hâllerde, TKHK'nin emredici tüketici koruma ve haksız şart hükümleri saklıdır; işbu Sözleşme'nin bu hükümlerle çelişen maddeleri, yalnızca tüketici sayılan Hizmet Sağlayıcı bakımından ve yalnızca çelişen kısım itibarıyla uygulanmaz.

16.3. İşbu Sözleşme'den doğan uyuşmazlıklarda, Hizmet Sağlayıcı'nın HMK m. 17 anlamında tacir veya kamu tüzel kişisi sıfatını haiz olduğu hâllerde İstanbul Anadolu Adliyesi Mahkemeleri ve İcra Daireleri münhasıran yetkilidir. Hizmet Sağlayıcı'nın tacir veya kamu tüzel kişisi sıfatını haiz olmadığı hâllerde, yetkili mahkeme ve icra daireleri HMK'nın genel yetki kurallarına göre (ve Hizmet Sağlayıcı'nın tüketici sıfatını haiz olduğu hâllerde ayrıca TKHK m. 73 ve ilgili mevzuata göre) belirlenir.

17. Tebligat

17.1. Taraflar, işbu Sözleşme'de yer alan iletişim bilgilerini (OYNA için mirackeremcuruksulu@gmail.com; Hizmet Sağlayıcı için Platform'a kayıtlı e-posta adresi/telefon numarası) geçerli tebligat adresleri olarak kabul eder. Bu adreslere yapılan bildirimler, gönderildiği tarihten itibaren 1 (bir) iş günü içinde karşı tarafa ulaşmış sayılır. İlgili tarafın, bildirimin kendisine bu süre içinde fiilen ulaşmadığını teknik kayıtlarla (ör. sunucu hata bildirimi, teslim edilememe kaydı, alan adı/numara değişikliği bildirimi) makul bir sürede ispat etmesi hâlinde, söz konusu bildirime bağlı itiraz, cevap veya savunma süreleri, bildirimin fiilen ulaştığı tarihten itibaren yeniden işlemeye başlar.

17.2. Taraflar, iletişim bilgilerinde değişiklik olması hâlinde bunu derhal karşı tarafa bildirmekle yükümlüdür. Bildirimi yapılmayan değişiklikler nedeniyle eski adrese yapılan tebligatlar, madde 17.1'deki ispat imkânı saklı kalmak kaydıyla geçerli kabul edilir.

18. Bölünebilirlik

18.1. İşbu Sözleşme hükümlerinden herhangi birinin yetkili bir mahkeme veya idari makam tarafından tamamen veya kısmen geçersiz veya uygulanamaz sayılması hâlinde, bu durum Sözleşme'nin geri kalan hükümlerinin geçerliliğini etkilemez. Taraflar, geçersiz sayılan hükmün amacına en yakın şekilde geçerli bir hükümle değiştirilmesi konusunda iyi niyetle müzakere eder.

19. Sözleşmenin Bütünlüğü

19.1. İşbu Sözleşme (ekleri, Platform Kullanım Şartları, Aydınlatma Metni ve Gizlilik Politikası dâhil) Taraflar arasındaki anlaşmanın tamamını oluşturur ve konuyla ilgili önceki tüm sözlü/yazılı görüşme, taahhüt ve anlaşmaların yerine geçer.

19.2. İşbu Sözleşme'de yapılacak değişiklikler OYNA tarafından Platform üzerinden veya e-posta yoluyla bildirilir:

&nbsp;&nbsp;a) Hizmet Sağlayıcı aleyhine esaslı bir değişiklik teşkil etmeyen değişiklikler (ör. yalnızca teknik, idari nitelikteki veya Hizmet Sağlayıcı lehine olan değişiklikler), bildirimde belirtilen tarihten itibaren geçerli olur; Hizmet Sağlayıcı'nın bildirim sonrasında Platform'u kullanmaya devam etmesi, bu tür değişikliklerin kabulü anlamına gelir.

&nbsp;&nbsp;b) Komisyon oranının artırılması (madde 8.2), Hizmet Sağlayıcı'ya yapılacak ödeme usul ve sürelerinin aleyhe değiştirilmesi, madde 11'deki sorumluluk düzenlemelerinin Hizmet Sağlayıcı aleyhine daraltılması veya Hizmet Sağlayıcı'nın işbu Sözleşme'den doğan esaslı haklarını önemli ölçüde azaltan sair değişiklikler ("Esaslı Değişiklik"), yürürlük tarihinden en az 15 (on beş) gün önce Hizmet Sağlayıcı'ya bildirilir ve yalnızca Hizmet Sağlayıcı'nın Platform üzerinden vereceği açık/olumlu onay (yeniden "Kabul Ediyorum" beyanı) ile o Hizmet Sağlayıcı bakımından yürürlüğe girer. Hizmet Sağlayıcı, bildirimden itibaren 15 (on beş) gün içinde onay vermeyerek Esaslı Değişikliği reddedebilir; bu hâlde Sözleşme, madde 12.1'de aranan bildirim süresi ve herhangi bir cayma bedeli aranmaksızın, değişikliğin öngörülen yürürlük tarihi itibarıyla kendiliğinden sona erer ve o tarihe kadar tamamlanmış Hizmetlere ilişkin ödemeler madde 8 ve 12.4 uyarınca yapılır. Hizmet Sağlayıcı'nın bu süre içinde açık onay veya ret beyanında bulunmaması hâlinde, Esaslı Değişiklik o Hizmet Sağlayıcı bakımından yürürlüğe girmez ve Sözleşme, süre sonunda madde 12.1 uyarınca sona ermiş sayılır; taraflar süre bitiminden önce yeni şartlar üzerinde anlaşmaya varabilir.

20. Yürürlük ve Kabul

20.1. Hizmet Sağlayıcı, Platform üzerinden "Kabul Ediyorum" seçeneğini işaretleyerek veya kayıt sürecini tamamlayarak işbu Sözleşme'nin tüm hükümlerini okuduğunu, anladığını ve kabul ettiğini beyan eder.

────────────────

İletişim

İşbu Sözleşme ile ilgili her türlü soru, bildirim ve talep için: mirackeremcuruksulu@gmail.com

────────────────`,
  },
  ISLETME: {
    title: 'İşletme (Tesis) Sözleşmesi',
    icon: Building2,
    body: `⚠️ BU METİN BİLGİ AMAÇLI ÖRNEKTİR — BAĞLAYICI DEĞİLDİR.

Aşağıdaki sözleşme, OYNA ile çalışmaya başladığında imzalayacağın metnin
örneğidir; şartları önceden okuyabilmen için burada duruyor. Henüz
imzalanmış bir sözleşme yerine geçmez ve tek başına taraflar arasında hak
ya da yükümlülük doğurmaz.

İçindeki köşeli parantezli alanlar ([AD SOYAD], [IBAN] gibi) sana özel
bilgilerle doldurulacak yerlerdir. İmzalanacak nihai nüsha, ticari
şartlarıyla birlikte sana ayrıca iletilir.

Soruların için: mirackeremcuruksulu@gmail.com

────────────────────────────────────────────────────────────

OYNA – İşletme (Saha/Tesis Sahibi) Platform Kullanımı ve İşbirliği Sözleşmesi

Son güncelleme: 13.07.2026

────────────────

1. TARAFLAR

1.1. OYNA: Miraç Kerem Çürüksulu (bundan böyle kısaca "OYNA" olarak anılacaktır; OYNA, işbu Sözleşme kapsamındaki faaliyetini şahıs işletmesi olarak, 6102 sayılı Türk Ticaret Kanunu anlamında tacir sıfatıyla yürütmektedir).
- Vergi Dairesi/No: Kartal Vergi Dairesi – 2650883645
- Adres: Cevizli Mahallesi, Zuhal Caddesi, Ritim İstanbul A Ticari Blok No:46 Daire:50, Kartal/İstanbul. (İşbu adres, Mükellef Teknoloji A.Ş. tarafından işletilen paylaşımlı/sanal ofis hizmeti kapsamında kullanılmaktadır; anılan şirket işbu Sözleşme'nin tarafı değildir ve işbu Sözleşme bakımından hiçbir hak ve yükümlülüğe sahip değildir.)
- E-posta: mirackeremcuruksulu@gmail.com

1.2. İşletme: [İŞLETME UNVANI / AD SOYAD] (bundan böyle "İşletme" olarak anılacaktır).
- Vergi Dairesi/No veya T.C. Kimlik No (şahıs işletmesi ise): [VERGİ NO / T.C. KİMLİK NO]
- Ticaret Sicil No (varsa): [TİCARET SİCİL NO]
- Adres: [ADRES]
- Yetkili Kişi (temsile yetkili gerçek kişi): [AD SOYAD]
- İletişim (e-posta/telefon): [E-POSTA / TELEFON]
- Hakediş IBAN'ı: [IBAN]

OYNA ve İşletme bundan böyle ayrı ayrı "Taraf", birlikte "Taraflar" olarak anılacaktır.

────────────────

2. İŞLETMENİN NİTELİĞİ – TACİR/ESNAF BEYANI VE GENEL İŞLEM KOŞULLARI DENETİMİ

2.1. İşletme; işbu Sözleşme kapsamındaki faaliyetini (halı saha/spor tesisi işletmeciliği) 6102 sayılı Türk Ticaret Kanunu ("TTK") anlamında tacir veya esnaf sıfatıyla, mesleki ve ticari amaçla yürüttüğünü; bu nedenle 6502 sayılı Tüketicinin Korunması Hakkında Kanun ("TKHK") anlamında tüketici sıfatını haiz olmadığını kabul ve beyan eder.

2.2. Bu beyan, işbu Sözleşme'nin 18. maddesinde düzenlenen yetkili mahkeme/icra dairesi hükmünün geçerlilik dayanağını oluşturur; ancak bu hüküm, yalnızca İşletme'nin TTK anlamında tacir sıfatını fiilen haiz olduğu hâllerde 6100 sayılı Hukuk Muhakemeleri Kanunu ("HMK") m.17 uyarınca geçerlidir (bkz. madde 2.5 ve madde 18.2). İşletme'nin bu beyanının gerçeğe aykırı çıkması hâlinde doğacak sonuçlardan İşletme sorumludur.

2.3. İşbu Sözleşme, OYNA'nın oyuncu/kullanıcı (tüketici) tarafıyla akdettiği Kullanım Şartları, Mesafeli Satış ve İptal/İade Koşulları ile KVKK metinlerinden bağımsızdır; ancak bu metinlerde tüketiciye tanınan iptal/iade kademeleri ve haklar, İşletme'nin oyuncuyla olan hizmet ilişkisini de dolaylı olarak bağlar (bkz. madde 13, EK-2 madde 2).

2.4. Taraflar; işbu Sözleşme'nin, OYNA tarafından önceden tek taraflı olarak hazırlanıp İşletme'ye münferit müzakere imkânı tanınmaksızın sunulduğunu ve bu nedenle -İşletme'nin tüketici sıfatını haiz olup olmadığından tamamen bağımsız olarak- 6098 sayılı Türk Borçlar Kanunu ("TBK") m.20-25'te düzenlenen Genel İşlem Koşulları rejimine (yürürlük, yorum ve içerik denetimi) tabi olduğunu kabul eder. Bu çerçevede, madde 7.6, 14.2, 14.3 ve 15'te düzenlenen ödemenin askıya alınması, önelsiz fesih ve sorumluluğun sınırlandırılması hükümleri, İşletme'nin onboarding sürecinde ayrı bir bilgilendirme ekranında açıkça işaretlenip onaylanmasına tabidir; bu onay alınmadıkça anılan hükümler İşletme aleyhine ileri sürülemez.

2.5. İşletme'nin TTK anlamında tacir sıfatını haiz olmayıp esnaf ve sanatkâr sıfatıyla faaliyet gösterdiği hâllerde; madde 18.2'de öngörülen münhasır yetki şartı, HMK m.17 uyarınca yalnızca tacirler ve kamu tüzel kişileri arasında geçerli olabileceğinden, İşletme bakımından uygulanmaz; bu hâlde yetkili mahkeme ve icra dairesi HMK'nın genel yetki kurallarına (m.6 vd.) göre belirlenir.

────────────────

3. TANIMLAR

- Platform: OYNA'ya ait mobil uygulama, web sitesi ve ilgili tüm yazılım/altyapı bileşenleri.
- Tesis/Saha: İşletme'nin platformda listelediği halı saha, spor tesisi veya ilgili alan.
- Oyuncu/Kullanıcı: Platform üzerinden rezervasyon yapan gerçek kişi (tüketici).
- Rezervasyon: Oyuncu tarafından platform üzerinden yapılan ve İşletme tarafından onaylanan saha kullanım talebi.
- Komisyon: OYNA'nın işbu Sözleşme ve EK-1 uyarınca her rezervasyon üzerinden tahsil ettiği bedel.
- Hakediş/Payout: Rezervasyon bedelinden komisyon düşüldükten sonra İşletme'ye ödenmesi gereken tutar.
- Model A / Model B: EK-1'de tanımlanan iki alternatif komisyon/ücretlendirme yapısı.
- İş Günü: Cumartesi, Pazar ve resmî tatil günleri hariç olmak üzere, bankaların ve OYNA'nın normal faaliyette bulunduğu gün.
- Mücbir Sebep: Madde 17'de tanımlanan hâller.
- Gizli Bilgi: Madde 16'da tanımlanan bilgiler.

────────────────

4. SÖZLEŞMENİN KONUSU VE KAPSAMI

4.1. İşbu Sözleşme'nin konusu; İşletme'ye ait Tesis/Saha'nın OYNA platformunda listelenmesi, oyunculardan rezervasyon alınması, rezervasyon bedelinin platform üzerinden tahsili ve İşletme'ye aktarımı ile bu süreçte tarafların karşılıklı hak ve yükümlülüklerinin belirlenmesidir.

4.2. OYNA, işbu Sözleşme kapsamında yalnızca aracı platform hizmeti sunar; Tesis/Saha'da verilen halı saha kiralama hizmetinin bizzat sağlayıcısı İşletme'dir. OYNA, oyuncu ile İşletme arasındaki hizmet ilişkisinin tarafı değildir.

────────────────

5. SÖZLEŞMENİN SÜRESİ

5.1. İşbu Sözleşme, İşletme'nin onboarding/başvuru sürecini tamamlayıp OYNA tarafından platforma kabul edildiği tarihte yürürlüğe girer ve belirsiz süreli olarak akdedilmiştir.

5.2. Sözleşme, madde 14'te düzenlenen fesih hükümlerine tabi olarak sona erer.

────────────────

6. KOMİSYON VE ÜCRETLENDİRME

6.1. OYNA, İşletme'ye platform üzerinden sunduğu aracılık hizmeti karşılığında komisyon tahsil eder. Güncel komisyon oranları, hesaplama modelleri (Model A / Model B) ve örnek hesaplamalar, işbu Sözleşme'nin ayrılmaz parçası olan EK-1: Komisyon Tarifesi'nde düzenlenir.

6.2. OYNA, komisyon oranlarını ve/veya EK-1'de düzenlenen ücretlendirme model(ler)ini değiştirme hakkını saklı tutar. Bu değişiklik, yürürlüğe girmesinden en az 30 (otuz) gün önce İşletme'ye yazılı bildirimde (e-posta, platform içi bildirim, KEP) bulunulmak suretiyle yapılır.

6.3. OYNA'nın, EK-1'de ilan edilen mevcut oran aralığının (Model A için hâlihazırda ilan edilen azami oran) üst sınırını aşan bir komisyon artışı yapmak istemesi hâlinde; bu artışın İşletme bakımından geçerli olabilmesi için 6.2'deki bildirim usulü tek başına yeterli olmayıp, İşletme'nin bu artışa platform üzerinden veya yazılı olarak açıkça onay vermesi şarttır. İşletme açık onay vermediği sürece kendisi bakımından önceki oran/model geçerliliğini korur.

6.4. İşletme, bildirilen yeni orana/modele (madde 6.3 kapsamındaki açık onay şartına tabi artışlar hariç) itiraz ediyorsa, yeni oranın yürürlük tarihinden önce yazılı bildirimde bulunarak, madde 14.1'deki 30 günlük önel süresine tabi olmaksızın, yeni oran yürürlüğe girmeden sözleşmeyi feshedebilir. Bu süre içinde fesih bildirimi yapılmazsa, yeni oran/model bildirilen yürürlük tarihinden itibaren İşletme bakımından geçerli olur.

6.5. Komisyon oranları/tutarları KDV hariç/dahil olmak üzere EK-1'de ayrıca belirtilir; İşletme'nin kendi vergi mükellefiyeti kapsamındaki KDV ve diğer vergisel yükümlülükleri madde 8'e tabidir.

────────────────

7. ÖDEME, TAHSİLAT VE HAKEDİŞ (PAYOUT)

7.1. Oyunculardan tahsil edilen rezervasyon bedelleri, iyzico ödeme altyapısı üzerinden tahsil edilir; kart bilgileri OYNA sunucularında saklanmaz.

7.2. Kredi/banka kartı ile yapılan tahsilatlar; dolandırıcılık, itiraz (chargeback) ve iade riskine karşı önlem olarak, ilgili tahsilat tarihinden itibaren azami 14 (ondört) takvim günü bekleme süresine (rolling reserve/hold) tabi tutulabilir.

7.3. Bekleme süresinin sona ermesinin ardından İşletme, hakedişinin kendisine isabet eden kısmının bildirdiği IBAN'a aktarılması için platform üzerinden çekim (payout) talebinde bulunabilir.

7.4. OYNA, İşletme tarafından platform üzerinden iletilen usulüne uygun çekim talebini en geç 3 (üç) iş günü içinde işleme almak ve ilgili tutarı İşletme'nin bildirdiği IBAN'a göndermekle yükümlüdür. Bu süre, çekim talebinin İşletme tarafından platform üzerinden iletildiği andan itibaren işlemeye başlar. Talebin kimlik, tutar ve IBAN uyuşmasına ilişkin otomatik/teknik doğrulaması azami 1 (bir) iş günü içinde tamamlanır ve bu adım 3 iş günlük sürenin bir parçasıdır; doğrulamanın olumsuz sonuçlanması hâlinde OYNA gerekçesini gecikmeksizin İşletme'ye bildirir. Resmî tatiller ile iyzico/bankacılık sistemlerinden kaynaklanan ve OYNA'nın makul kontrolü dışında gelişen kesintilerden doğan gecikmeler, azami 5 (beş) iş günü ile sınırlı olmak kaydıyla bu süreye dâhil edilmez; OYNA bu durumu gecikmeksizin ve gerekçesiyle birlikte İşletme'ye bildirir.

7.5. OYNA'nın 7.4'te belirtilen süreyi (7.4'teki istisnalar uygulandıktan sonra) haklı bir sebep olmaksızın aşması hâlinde:
a) gecikilen tutar üzerinden, ödemenin fiilen yapıldığı tarihe kadar 3095 sayılı Kanuni Faiz ve Temerrüt Faizine İlişkin Kanun uyarınca hesaplanacak yasal temerrüt faizi işletilir; ve
b) 7.4'teki sürenin 5 (beş) iş günü daha aşılması ve OYNA'nın bu durumu, İşletme'nin yazılı ihtarını takip eden 3 (üç) iş günü içinde gidermemesi hâlinde İşletme, işbu Sözleşme'yi herhangi bir önel süresine tabi olmaksızın haklı sebeple derhâl feshedebilir.

7.6. OYNA; somut ve belgelenebilir dolandırıcılık şüphesi, yetkili resmî mercilerden gelen talep, yasal yükümlülük veya iyzico/bankacılık sistemlerinden kaynaklanan zorunluluk hâllerinde, sebebini İşletme'ye yazılı olarak bildirmek kaydıyla, ilgili tutarın aktarımını askıya alabilir. Bu askıya alma en geç 30 (otuz) takvim günü içinde sonuçlandırılır; bu süre içinde şüphenin somut bir resmî soruşturma, yasal talep veya kalıcı bankacılık/iyzico kısıtlamasına dönüştüğü OYNA tarafından belgelenmedikçe, sürenin sonunda ilgili tutar herhangi bir ilave işleme gerek kalmaksızın İşletme'ye aktarılır. Böyle bir belgelendirmenin mevcut olması hâlinde askıya alma, gerekçesi İşletme'ye yazılı olarak bildirilmek kaydıyla azami 30 (otuz) gün daha (toplamda en fazla 60 gün) uzatılabilir; bu ikinci sürenin sonunda da tutar, yalnızca yetkili resmî merci veya mahkeme kararıyla bloke edilmiş olması hâli hariç İşletme'ye aktarılır. İşbu madde kapsamındaki askıya alma, 60 günlük azami süre içinde kaldığı sürece madde 7.5'teki gecikme sonuçlarını (temerrüt faizi ve fesih hakkı) doğurmaz; 60 günlük azami sürenin haklı bir sebep olmaksızın aşılması hâlinde madde 7.5 hükümleri kıyasen uygulanır.

────────────────

8. VERGİ VE FATURALANDIRMA

8.1. Onboarding aşamasında İşletme'den vergi kimlik numarası (tüzel kişi/şahıs işletmesi için vergi no; gerçek kişi işletme sahibi için T.C. kimlik no) alınması, platformda aktif listelenebilmenin zorunlu bir ön koşuludur.

8.2. İşletme; kendi faaliyetine ilişkin her türlü vergi, harç, sosyal güvenlik primi ve benzeri yasal yükümlülüğü zamanında ve eksiksiz yerine getireceğini; oyunculardan/uygulama üzerinden tahsil edilen bedellere ilişkin fatura, e-arşiv fatura veya yazar kasa fişi düzenleme yükümlülüğünün tamamının kendisine ait olduğunu kabul, beyan ve taahhüt eder.

8.3. OYNA, İşletme'ye mali müşavirlik, vergi danışmanlığı veya muhasebe hizmeti sunmamaktadır. İşletme, vergisel yükümlülükleri bakımından kendi mali müşaviri/vergi danışmanından bağımsız olarak destek almakla yükümlüdür; OYNA'nın platform üzerinden sunduğu raporlama araçları bu yükümlülüğü ortadan kaldırmaz.

────────────────

9. SAHA GÜVENLİĞİ, BAKIM VE SİGORTA

9.1. Tesis/Saha'nın ve müştemilatının (soyunma odası, aydınlatma, zemin, çevre güvenliği, elektrik tesisatı, yangın güvenliği vb.) güvenli, bakımlı ve yürürlükteki mevzuata (iş sağlığı ve güvenliği, imar, itfaiye, belediye ruhsatları vb.) uygun tutulmasından birincil olarak İşletme sorumludur.

9.2. OYNA'nın bu kapsamdaki sorumluluğu; kendisine platform üzerinden veya yazılı olarak (e-posta dâhil) bildirilen somut ve belirli bir güvenlik şikâyetini makul bir sürede (kural olarak 5 (beş) iş günü içinde) değerlendirip İşletme'ye iletmekle sınırlıdır. OYNA, tesisin fiziki güvenliğinin sürekli denetimini veya garantisini üstlenmez ve bu konuda İşletme'nin yerine geçmez. OYNA'nın bu fıkradaki süreye haklı bir sebep olmaksızın uymaması hâlinde, buna bağlı olarak doğan zararlar bakımından madde 15'teki sorumluluk esasları uygulanır ve İşletme, OYNA'ya yazılı ihtarda bulunma hakkını haizdir.

9.3. İşletme; tesiste meydana gelebilecek her türlü kaza, yaralanma veya maddi zarara karşı geçerli bir mesuliyet/sorumluluk sigortası (üçüncü şahıs mali mesuliyet sigortası) poliçesi bulundurmayı, bu poliçeyi güncel tutmayı ve OYNA'nın yazılı talebi hâlinde makul süre içinde (kural olarak 10 iş günü) ibraz etmeyi kabul eder. Geçerli bir sigorta poliçesinin bulunması ve talep hâlinde ibraz edilmesi, hem platforma kabul (onboarding) hem de sözleşmenin devamı bakımından bir şarttır. Bu yükümlülüğün ilk ihlalinde EK-2 madde 7'de düzenlenen kademeli yaptırım süreci (uyarı → geçici delisting) uygulanır; OYNA'nın yazılı talebini takip eden 10 (on) iş günü içinde poliçenin ibraz edilmemesinin, verilen uyarıya rağmen tekrarlanması hâlinde OYNA, madde 14.2(d) uyarınca işbu Sözleşme'yi derhâl feshedebilir.

9.4. Bu madde, madde 15'te (sorumluluğun sınırlanması) düzenlenen istisnalar saklı kalmak kaydıyla uygulanır.

────────────────

10. NON-CIRCUMVENTION (PLATFORM DIŞI ANLAŞMA YASAĞI)

10.1. İşbu madde, İşletme'nin OYNA dışında başka platformlarda yer almasını veya kendi doğrudan/bağımsız müşteri portföyüyle çalışmasını hiçbir şekilde kısıtlamaz. İşletme'ye herhangi bir münhasırlık yükümlülüğü getirilmemektedir.

10.2. İşletme; OYNA platformu aracılığıyla ilk kez tanıştığı/temas kurduğu bir oyuncu/müşteri ile, söz konusu müşteriye özgü olarak, platformu bilinçli biçimde atlayıp doğrudan veya nakit yoldan platform-dışı bir anlaşma yaparak OYNA'nın komisyonundan kaçınmayacağını, ilgili müşteriyle ilk temas tarihinden itibaren 12 (oniki) ay süreyle taahhüt eder.

10.3. İhlalin OYNA tarafından makul delillerle (yazışma kaydı, oyuncu beyanı, aynı oyuncuya ait platform üzerindeki rezervasyonun iptal edilip kısa süre içinde aynı saat/saha için platform dışında doğrudan anlaşma yapıldığına dair tekrarlayan desen vb.) ortaya konması hâlinde İşletme, kaçırılan komisyon tutarını -emsal rezervasyon bedeli ve o tarihte yürürlükte olan EK-1 komisyon oranı esas alınarak hesaplanır- OYNA'ya tazmin eder. Bu tazminat, gerçekleşen/kaçırılan işlemle orantılıdır ve ayrıca cezai nitelikte ek bir bedel içermez. İşbu maddede öngörülen tazminat talebi, ihlalin ilk tespitinde dahi ileri sürülebilir. Ancak madde 14.2(d) uyarınca önelsiz derhâl fesih hakkı, yalnızca ihlalin tekrarlayan bir desen oluşturması veya tartışmaya yer bırakmayacak açık kanıtlarla (ör. yazılı ikrar, imzalı platform dışı sözleşme örneği) sabit olması hâlinde doğar.

────────────────

11. MARKA KULLANIMI VE FİKRİ MÜLKİYET

11.1. İşletme; OYNA'ya, yalnızca platformda listeleme, tanıtım ve pazarlama amacıyla sınırlı olmak üzere, işletme adını, logosunu, tesis görsellerini ve tanıtım metinlerini kullanma hakkı (sınırlı, münhasır olmayan lisans) verir. İşletme, bu kullanımın kaldırılmasını/durdurulmasını dilediği zaman OYNA'dan yazılı olarak talep edebilir; OYNA bu talebi makul süre içinde (kural olarak 5 iş günü) yerine getirir. (Tamamlanmış rezervasyonlara ilişkin arşiv kayıtları ve yasal saklama yükümlülükleri bu haktan istisnadır.)

11.2. OYNA, İşletme'ye platformda kullanılmak üzere resmî marka materyalleri (QR kod, afiş, sticker, tanıtım metni vb.) sağlayabilir. İşletme, bu materyalleri yalnızca OYNA tarafından sağlanan hâliyle, değiştirmeksizin kullanabilir.

11.3. İşletme; OYNA ile arasında bir ortaklık, iştirak, temsilcilik, bayilik veya işçi-işveren ilişkisi bulunduğu izlenimini verecek hiçbir beyanda, reklamda veya sunumda bulunamaz. Taraflar arasındaki ilişki, işbu Sözleşme'de düzenlenen bağımsız bir iş ortaklığı ilişkisidir.

11.4. Bu madde kapsamında verilen lisanslar, işbu Sözleşme süresiyle sınırlı, geri alınabilir, münhasır olmayan ve devredilemez niteliktedir; sözleşmenin sona ermesiyle kendiliğinden sona erer.

────────────────

12. KİŞİSEL VERİLERİN PAYLAŞIMI VE KVKK

12.1. İşletme; platform üzerinden kendi Tesis/Saha'sına yapılan rezervasyonlara ilişkin olarak yalnızca kendi sahasına ait kayıtlara erişebilir. Uygulama içi olağan bir rezervasyonda İşletme'ye görünen veriler, rezervasyonun ifası için gerekli asgari kalemlerle sınırlıdır: rezervasyonu yapan hesabın sistem içi kimliği (takma kimlik/UUID), oyuncunun kendisinin girdiği başlık/not (varsa), tarih-saat-süre ve ücret/kapora/ödeme durumu bilgisi. Uygulama içi olağan bir rezervasyonda oyuncunun adı-soyadı, telefon numarası veya e-posta adresi İşletme'ye aktarılmaz; rezervasyon kaydında yer alabilen "müşteri adı/telefonu" alanları yalnızca İşletme'nin kendi elle (walk-in) girdiği müşterilerine ilişkindir. Oyuncunun adı ve profil görseli, yalnızca oyuncunun bir maça katılması hâlinde, Platform'un kamuya açık maç görüntüleme işlevi kapsamında görünür hâle gelir. İşbu paylaşımın kapsamı, sınırları, saklama süresi ve tarafların KVKK sıfatları, işbu Sözleşme'nin ayrılmaz eki olan Veri Paylaşım Protokolü ile ayrıca ve ayrıntılı olarak düzenlenir.

12.2. İşletme; bu verileri yalnızca ilgili rezervasyonun ifası amacıyla kullanacağını; OYNA platformu dışında bağımsız pazarlama, listeleme, üçüncü kişilere aktarma veya başkaca herhangi bir amaçla saklama/işleme faaliyetinde bulunmayacağını; 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") ve ilgili ikincil mevzuata tam uyum içinde hareket edeceğini kabul, beyan ve taahhüt eder.

12.3. Taraflar; İşletme'nin, kendisine aktarılan oyuncu verileri üzerinde münhasıran kendi rezervasyon süreçleri için, kendi belirlediği araç ve yöntemlerle işlem yaptığı ölçüde KVKK uyarınca kendi adına ayrı bir veri sorumlusu sıfatını haiz olduğunu kabul eder. Ancak verinin işlenme amacının ve araçlarının esas itibarıyla OYNA platformu tarafından belirlendiği hâllerde taraflar, ilgili veri işleme faaliyeti bakımından KVKK ve ilgili Kurul kararları çerçevesinde ortak veri sorumlusu sıfatını haiz olabileceklerini kabul eder; bu durumda sorumluluk, tarafların veri işleme sürecindeki fiili karar ve kontrol derecesiyle orantılı olarak paylaşılır. Bu maddenin nihai uygulanma şekli, gerektiğinde işbu Sözleşme'ye ek nitelikte ayrı bir Veri Paylaşım Protokolü ile somutlaştırılabilir. İşletme, kendi veri sorumlusu yükümlülüklerini (aydınlatma, saklama süresi, imha, veri güvenliği vb.) bağımsız olarak yerine getirmekle sorumludur.

12.4. İşletme; kendisine aktarılan oyuncu verileriyle ilgili bir veri ihlali/sızıntı hâlinde, bunu öğrendiği andan itibaren gecikmeksizin (en geç 24 (yirmidört) saat içinde) OYNA'ya ve gerektiğinde ilgili mevzuat uyarınca Kişisel Verileri Koruma Kurumu'na bildirimde bulunmakla yükümlüdür.

────────────────

13. ASGARİ HİZMET STANDARTLARI

İşletme'nin platformda faaliyetini sürdürebilmesi için uyması gereken asgari hizmet standartları, işbu Sözleşme'nin ayrılmaz parçası olan EK-2: Asgari Hizmet Standartları'nda düzenlenmiştir. Bu standartlara aykırılık hâlinde EK-2'de öngörülen kademeli yaptırım süreci (uyarı → geçici delisting → fesih) uygulanır.

────────────────

14. FESİH

14.1. Taraflardan her biri, diğerine 30 (otuz) gün önceden yazılı bildirimde bulunmak suretiyle işbu Sözleşme'yi herhangi bir gerekçe göstermeksizin feshedebilir.

14.2. OYNA, aşağıdaki hâllerde İşletme'ye herhangi bir önel tanımaksızın, derhâl fesih veya İşletme hesabını geçici olarak askıya alma hakkına sahiptir:
a) İşletme'nin dolandırıcılık teşkil eden bir eylemde bulunduğunun makul delillerle tespiti,
b) EK-2'de tanımlanan kademeli yaptırım sürecinin fesih aşamasına ulaşmasına yol açacak şekilde tekrarlanan ve doğrulanmış güvenlik şikâyetleri,
c) Fiyat/müsaitlik bilgisinin bilinçli olarak manipüle edilmesi (ör. platformda müsait görünen bir saatin başka bir kanaldan satılması, gerçek dışı fiyat/kapora bilgisi verilmesi),
d) İşletme'nin madde 10 (non-circumvention) yükümlülüğünü, tekrarlayan bir ihlal deseniyle veya tartışmaya yer bırakmayacak açık kanıtlarla ihlal etmesi; ya da madde 9.3'te düzenlenen sigorta poliçesi ibraz yükümlülüğünün, EK-2 madde 7'deki uyarı aşamasına rağmen tekrarlanan şekilde ihlal edilmesi,
e) İşletme hakkında, işbu Sözleşme konusuyla doğrudan ilgili bir suça ilişkin olarak kesinleşmiş bir mahkûmiyet kararı verildiğinin veya mahkemece kabulüne karar verilmiş bir iddianame düzenlendiğinin OYNA'nın bilgisine gelmesi.

14.3. (c) ve (d) bentlerinde düzenlenen hâllere dayanılarak fesih işlemi yürürlüğe konulmadan önce, OYNA tespit ettiği ihlali dayanaklarıyla birlikte İşletme'ye yazılı olarak bildirir ve İşletme'ye görüş/itirazını sunması için 3 (üç) iş günlük süre tanır; bu süre içinde sunulan itiraz makul surette değerlendirilmeden fesih yürürlüğe konulamaz. Bu ön bildirim yükümlülüğü, (a) bendi kapsamındaki somut ve acil bir zarar riski doğuran dolandırıcılık şüphesi hâllerinde ve yalnızca hesabın ihtiyati tedbir olarak geçici askıya alınmasıyla sınırlı işlemler bakımından aranmaz.

14.4. İşletme hakkında işbu Sözleşme konusuyla doğrudan ilgili bir kolluk/yargı soruşturması başlatıldığının OYNA'nın bilgisine gelmesi, tek başına derhâl fesih sebebi teşkil etmez; masumiyet karinesi gözetilerek bu aşamada OYNA yalnızca İşletme'nin platform listelemesini soruşturma sonuçlanıncaya kadar ihtiyati tedbir olarak geçici askıya alma hakkını haizdir (mevcut onaylı rezervasyonlar bu durumdan etkilenmez). Soruşturmanın takipsizlik veya beraatle sonuçlanması hâlinde askıya alma derhâl kaldırılır ve İşletme'nin bu süreçte doğan zararları madde 15 çerçevesinde değerlendirilir. Nihai fesih hakkı, ancak 14.2(e)'de tanımlanan kesinleşmiş mahkûmiyet kararının veya kabul edilmiş iddianamenin varlığı hâlinde doğar.

14.5. Fesih, tarafların fesih tarihine kadar doğmuş hak ve borçlarını (özellikle hakediş/payout alacaklarını, madde 7'deki bekleme süreleri saklı kalmak kaydıyla) ortadan kaldırmaz.

14.6. Fesihten sonra da madde 10 (non-circumvention, kalan süre boyunca), madde 11.3, madde 12 (KVKK), madde 15 (sorumluluğun sınırlandırılması), madde 16 (gizlilik) ve madde 18 (uyuşmazlık çözümü) hükümleri yürürlükte kalmaya devam eder.

14.7. Sözleşme'nin sona ermesi hâlinde, İşletme'nin platform hesabına erişim -yasal saklama yükümlülükleri ile madde 12 ve 16 kapsamındaki yükümlülükler saklı kalmak kaydıyla- fesih tarihinden itibaren 7 (yedi) gün içinde kapatılır; hesaba ilişkin veriler, vergi, ticari defter ve KVKK mevzuatında öngörülen zorunlu saklama süreleri sona erdiğinde imha edilir veya anonimleştirilir.

────────────────

15. SORUMLULUĞUN SINIRLANDIRILMASI

15.1. Taraflardan her biri, işbu Sözleşme'nin ihlalinden kaynaklanan doğrudan zararlardan kendi kusuru oranında sorumludur.

15.2. OYNA'nın, kendi hafif kusuruna dayalı sözleşme ihlalleri nedeniyle İşletme'ye karşı sorumluluğu; dolaylı zararlar (kâr kaybı, itibar kaybı, veri kaybı vb.) bakımından, ilgili olayın gerçekleştiği tarihten geriye doğru hesaplanan son 6 (altı) aylık dönemde OYNA'nın İşletme'den fiilen tahsil ettiği toplam komisyon tutarının aylık ortalamasının 3 (üç) katı ile sınırlıdır (İşletme'nin platformda 6 aydan kısa süredir faaliyet göstermesi hâlinde, fiilen faaliyette bulunulan süre esas alınır). Aynı esas, İşletme'nin kendi hafif kusuruna dayalı sözleşme ihlalleri nedeniyle OYNA'ya karşı doğabilecek dolaylı zarar sorumluluğu bakımından da karşılıklı olarak uygulanır.

15.3. İşbu madde 15'te yer alan sınırlamalar; TBK m.115 ve ilgili emredici hükümler uyarınca, ağır kusur, kast veya tarafların doğrudan sebebiyet verdiği ölüm veya yaralanma hâllerinde uygulanmaz; bu hâllerde Taraflar genel hükümlere göre tam sorumludur.

15.4. İşbu madde, madde 9'da düzenlenen İşletme'nin saha güvenliğine ilişkin birincil sorumluluğunu hiçbir şekilde ortadan kaldırmaz veya sınırlamaz.

────────────────

16. GİZLİLİK

16.1. Taraflar; işbu Sözleşme kapsamında birbirlerine ilettikleri veya karşılıklı iş ilişkisi sırasında öğrendikleri her türlü ticari, mali ve teknik bilgiyi (komisyon oranları, hakediş tutarları, kullanıcı/oyuncu verileri, iş geliştirme planları, platform teknik altyapı bilgileri vb.) "Gizli Bilgi" olarak kabul eder ve önceden yazılı onay olmaksızın üçüncü kişilerle paylaşmaz.

16.2. Gizlilik yükümlülüğü; (a) kamuya mal olmuş bilgiler, (b) yasal/idari makam talebiyle açıklanması zorunlu bilgiler veya (c) karşı tarafın önceden yazılı onayı ile paylaşılan bilgiler bakımından uygulanmaz.

16.3. Gizlilik yükümlülüğü, işbu Sözleşme'nin sona ermesinden itibaren 2 (iki) yıl süreyle geçerliliğini korur.

────────────────

17. MÜCBİR SEBEP

17.1. Deprem, sel, yangın, salgın hastalık, savaş, terör olayı, genel grev, resmî makam kararları, altyapı sağlayıcı (iyzico, barındırma/veri merkezi hizmeti vb.) kaynaklı uzun süreli ve genel nitelikli kesinti gibi, tarafların makul kontrolü dışında gelişen ve öngörülemeyen hâller "Mücbir Sebep" sayılır.

17.2. Mücbir sebep hâlinde, etkilenen tarafın bu sebepten doğrudan kaynaklanan yükümlülükleri ile bu yükümlülüklerle karşılıklı/bağlantılı olan diğer tarafın yükümlülükleri de, mücbir sebebin devamı süresince askıya alınır; etkilenen taraf durumdan haberdar olduğu andan itibaren makul süre içinde diğer tarafı yazılı olarak bilgilendirir.

17.3. Mücbir sebebin kesintisiz olarak 60 (altmış) günden fazla sürmesi hâlinde, taraflardan her biri karşı tarafa yazılı bildirimde bulunarak işbu Sözleşme'yi feshedebilir. Mücbir sebebin 90 (doksan) günü aşarak devam etmesi hâlinde, taraflardan herhangi biri başkaca bir koşul aranmaksızın sözleşmeyi derhâl feshedebilir.

────────────────

18. UYUŞMAZLIKLARIN ÇÖZÜMÜ VE YETKİLİ MAHKEME

18.1. Taraflar, işbu Sözleşme'den doğabilecek her türlü uyuşmazlıkta öncelikle iyi niyetle doğrudan görüşme yoluyla çözüm arayacaklarını kabul eder. Bu kapsamda İşletme, şikâyet/itirazını yazılı olarak mirackeremcuruksulu@gmail.com adresine iletir; OYNA, bu başvuruyu iç itiraz/inceleme süreci kapsamında en geç 10 (on) iş günü içinde değerlendirip yazılı olarak yanıtlar.

18.2. İç itiraz süreci sonucunda uyuşmazlık çözülemezse:
a) İşletme'nin işbu Sözleşme kapsamında TTK anlamında tacir sıfatıyla hareket ettiği hâllerde; madde 2'de belirtildiği üzere İşletme'nin tüketici sıfatını haiz olmadığı ve HMK m.17 uyarınca yetki sözleşmesi akdedebildiği gözetilerek, İşletme'nin ticari işletmesinin kayıtlı olduğu yer veya OYNA'nın işyeri adresinin bulunduğu yer (İstanbul Anadolu/Kartal) ticaret mahkemeleri ve icra daireleri münhasıran yetkilidir.
b) İşletme'nin madde 2.5 kapsamında esnaf sıfatıyla hareket ettiği hâllerde, işbu yetki şartı HMK m.17 uyarınca uygulanmaz; yetkili mahkeme ve icra dairesi HMK'nın genel yetki kurallarına (m.6 vd.) göre belirlenir.

────────────────

19. BÖLÜNEBİLİRLİK

İşbu Sözleşme'nin herhangi bir hükmünün yetkili bir mahkeme veya makam tarafından geçersiz, hükümsüz veya uygulanamaz sayılması, sözleşmenin geri kalan hükümlerinin geçerliliğini ve yürürlüğünü etkilemez. Taraflar, geçersiz sayılan hükmün amacına en yakın geçerli bir hükümle değiştirilmesi için iyi niyetle görüşür.

────────────────

20. BÜTÜNLÜK (ENTİRE AGREEMENT)

İşbu Sözleşme (ekleri EK-1 ve EK-2 dâhil), taraflar arasındaki konuya ilişkin anlaşmanın tamamını oluşturur ve bu konudaki önceki her türlü sözlü/yazılı anlaşma, teklif ve mutabakatın yerine geçer. Sözleşmede yapılacak her türlü değişiklik, madde 6.2-6.4'te düzenlenen komisyon değişikliği prosedürü saklı kalmak kaydıyla, yazılı şekilde (platform içi bildirim/e-posta dâhil) yapılmadıkça geçerli olmaz.

────────────────

21. DEVİR YASAĞI

İşletme, işbu Sözleşme'den doğan hak ve yükümlülüklerini OYNA'nın önceden yazılı onayı olmaksızın üçüncü bir kişiye devredemez. OYNA, şirket birleşme, devralma veya yeniden yapılanma hâllerinde işbu Sözleşme'yi ilgili halef şirkete devredebilir; bu devir İşletme'nin işbu Sözleşme'den doğan haklarını azaltmaz. OYNA'nın işbu Sözleşme'yi bir halef şirkete devretmesi hâlinde İşletme, devir bildiriminin kendisine ulaşmasından itibaren 30 (otuz) gün içinde, herhangi bir önel süresine tabi olmaksızın işbu Sözleşme'yi feshedebilir.

────────────────

22. TEBLİGAT

22.1. İşbu Sözleşme kapsamında yapılacak tüm bildirimler; İşletme bakımından madde 1.2'de beyan edilen veya platform üzerinde güncellenmiş e-posta adresine, OYNA bakımından mirackeremcuruksulu@gmail.com adresine yapılır.

22.2. E-posta ile yapılan bildirimler, aksi ispat edilmedikçe, gönderim tarihini takip eden ilk iş günü tebliğ edilmiş sayılır.

────────────────

23. İLETİŞİM

İşbu Sözleşme kapsamındaki tüm bildirim, talep ve başvurular için: mirackeremcuruksulu@gmail.com

────────────────
────────────────

EK-1: KOMİSYON TARİFESİ

1. Uygulanacak Model

İşletme'ye uygulanacak model (Model A veya Model B), onboarding sürecinde OYNA tarafından belirlenir/İşletme ile mutabık kalınır ve platform panelinde İşletme'ye açıkça gösterilir. Belirtilmediği sürece Model A esas alınır.

2. Model A – Komisyon Bazlı Model

- OYNA, İşletme üzerinden gerçekleştirilen her onaylı rezervasyon bedeli üzerinden %[10] – %[15] aralığında değişen oranda komisyon tahsil eder.
- Uygulanacak kesin oran, İşletme'nin onboarding sürecinde OYNA tarafından yazılı olarak bildirilir.
- Örnek: Rezervasyon bedeli 1.000 TL, komisyon oranı %[Y] ise: OYNA payı [1.000 × Y/100] TL, İşletme hakedişi [1.000 − (1.000 × Y/100)] TL'dir (örneğin Y=12 ise OYNA payı 120 TL, İşletme hakedişi 880 TL'dir).

3. Model B – Ek Ücret (Servis Bedeli) Modeli

- Rezervasyon bedelinin %[95]'i İşletme'nin hakedişidir (OYNA bu bedel üzerinden ayrıca komisyon kesmez); bu oran da madde 6.2-6.4'teki değişiklik/bildirim prosedürüne tabidir.
- Oyuncuya, rezervasyon bedeli üzerine ayrıca %[20] oranında "hizmet bedeli / ek ücret" yansıtılır; bu ek ücret doğrudan OYNA'ya ait olup İşletme hakedişinden bağımsız olarak hesaplanır ve İşletme hakedişini azaltmaz.
- Örnek (yalnızca hesaplama yöntemini göstermek amacıyla İşletme payının %95 ve ek ücretin %20 olarak belirlendiği varsayılmıştır; nihai oranlar onboarding sürecinde kesinleştirilecektir): Rezervasyon bedeli 1.000 TL ise: İşletme hakedişi 950 TL (1.000 × %95); oyuncudan tahsil edilen toplam tutar 1.000 + (1.000 × %20) = 1.200 TL; OYNA'nın toplam geliri 50 TL (İşletme payı farkı) + 200 TL (ek ücret) = 250 TL'dir.

4. Ortak Hükümler

- Yukarıdaki oranlar KDV [hariç/dahil] olarak belirlenmiştir; İşletme'nin kendi mükellefiyeti kapsamındaki KDV ve diğer vergisel yükümlülükleri madde 8'e tabidir.
- Komisyon/ek ücret, ilgili rezervasyon bedeli tahsil edildiği anda otomatik olarak hesaplanır ve platform panelinde İşletme'ye şeffaf şekilde gösterilir.
- Kampanya/promosyon dönemlerinde geçici, İşletme'nin ayrıca onayına tabi indirimli oranlar uygulanabilir; bu durum madde 6.2'deki 30 günlük bildirim süresi kapsamı dışındadır (yalnızca İşletme lehine, geçici ve isteğe bağlı indirimler bakımından).

────────────────

EK-2: ASGARİ HİZMET STANDARTLARI

1. Doğru Fiyat ve Müsaitlik Beyanı

İşletme, fiyat, kapora ve müsaitlik/takvim bilgisini platformda gerçek zamanlı ve doğru şekilde günceller. Platformda "müsait" görünen bir saat, başka bir kanaldan (telefon, yüz yüze, vb.) satılamaz.

2. Onaylanmış Rezervasyonlara Uyma

Platform üzerinden onaylanan rezervasyonlar, mücbir sebep veya haklı teknik/altyapısal arıza hâlleri hariç, İşletme tarafından tek taraflı olarak iptal edilemez veya değiştirilemez. Zorunlu iptallerde oyuncuya en az 24 (yirmidört) saat önceden haber verilir ve durum OYNA'ya bildirilir. Bu süre, OYNA'nın oyuncularla akdettiği Mesafeli Satış ve İptal/İade Koşulları'nda düzenlenen tam iade eşiğiyle (rezervasyon saatinden en az 24 saat önce) uyumlu olup, madde 2.3'te atıf yapılan iptal/iade kademelerinin İşletme kaynaklı iptallerde de gözetilmesini sağlar; İşletme kaynaklı iptallerde oyuncuya her hâlükârda tam iade yapılır; bu iade oyuncunun OYNA cüzdanına işlenir ve oyuncu bu tutarı Kullanım Şartları madde 6.5'teki koşullarla banka hesabına çekebilir. İade tutarı İşletme hakedişinden mahsup edilir.

3. Temel Güvenlik Ekipmanı

Sahada ilk yardım seti, yeterli aydınlatma, kaygan olmayan/güvenli zemin ve acil durum iletişim bilgisi (en yakın sağlık kuruluşu/112 bilgilendirmesi) bulundurulur.

4. Temizlik ve Hijyen

Saha, soyunma odası ve ortak kullanım alanları her maç öncesi/sonrası temizlenir; temel hijyen kurallarına uyulur.

5. Personel Davranışı

Tesis personeli, oyunculara karşı kötü muamelede bulunamaz, ayrımcılık yapamaz ve OYNA'nın Kullanım Şartları'nda oyunculara tanınan haklara aykırı davranamaz.

6. Sigorta ve Yasal Belgeler

Madde 9.3'te belirtilen sorumluluk sigortası poliçesi ile tesisin faaliyeti için gerekli yasal işletme ruhsatları/izinleri güncel tutulur; bu yükümlülüğün ihlaline ilişkin yaptırım süreci madde 9.3 ve 14.2(d)'de düzenlenmiştir.

7. Kademeli Yaptırım Süreci

- 1. Aşama – Uyarı: İhlalin OYNA tarafından tespiti hâlinde İşletme'ye yazılı uyarı yapılır; düzeltme için makul süre (kural olarak 7 iş günü) tanınır.
- 2. Aşama – Geçici Delisting: Uyarıya rağmen ihlalin devam etmesi veya tekrarı hâlinde, İşletme'nin platform listelemesi ihlal giderilene kadar geçici olarak askıya alınır (yeni rezervasyon alınamaz; mevcut onaylı rezervasyonlar bu durumdan etkilenmez).
- 3. Aşama – Fesih: İhlalin geçici delisting'e rağmen giderilmemesi, aynı ihlalin 3 (üç) kez tekrarlanması veya madde 14.2'de sayılan ağır ihlallerden birine vücut vermesi hâlinde, işbu Sözleşme madde 14.2 uyarınca derhâl feshedilir.

────────────────
────────────────

İMZA

İşbu Sözleşme, 23 madde ve 2 ekten (EK-1, EK-2) oluşmak üzere, taraflarca okunup anlaşılarak, [TARİH] tarihinde elektronik ortamda/ıslak imza ile akdedilmiş ve yürürlüğe girmiştir.

OYNA
Miraç Kerem Çürüksulu
İmza: ______________________

İŞLETME
[İŞLETME UNVANI / AD SOYAD]
Yetkili: [AD SOYAD]
İmza: ______________________

────────────────`,
  },
};
