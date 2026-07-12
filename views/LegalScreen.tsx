import React, { useState } from 'react';
import { ArrowLeft, FileText, Shield, ShieldCheck, Lock, RefreshCw, Cookie, ChevronRight } from 'lucide-react';

interface LegalScreenProps {
  onBack: () => void;
  initialDoc?: LegalDocKey;
}

type LegalDocKey = 'TERMS' | 'PRIVACY' | 'KVKK' | 'RIZA' | 'CEREZ' | 'SALES';

// NOT: Şirket bilgileri (COMPANY/TAX_INFO/ADDRESS) dolduruldu; avukat
// incelemesi hâlâ önerilir, özellikle KVKK ve mesafeli satış maddeleri için.
// (Son taslak güncellemesi: 12.07.2026)

const COMPANY = 'Miraç Kerem Çürüksulu (OYNA)';
const TAX_INFO = 'Kartal Vergi Dairesi – 2650883645';
const ADDRESS = 'Cevizli Mahallesi, Zuhal Caddesi, Ritim İstanbul A Ticari Blok No:46 Daire:50 (Mükellef Teknoloji A.Ş. bünyesinde), Maltepe/İstanbul';
const CONTACT_EMAIL = 'destek@oyna.app';
const UPDATED = '12.07.2026';

const DOCS: Record<LegalDocKey, { title: string; icon: React.ElementType; body: string }> = {
  TERMS: {
    title: 'Kullanım Şartları',
    icon: FileText,
    body: `Son güncelleme: ${UPDATED}

1. TARAFLAR VE KAPSAM
Bu Kullanım Şartları, ${COMPANY} ("OYNA", "Platform") tarafından sunulan mobil ve web uygulamasını kullanan tüm kullanıcılar için geçerlidir. Uygulamayı kullanarak bu şartları kabul etmiş sayılırsınız.

2. HİZMET TANIMI
OYNA; oyuncuların halı saha rezervasyonu yapmasını, maç ve takım oluşturmasını, kaleci/hakem gibi hizmet sağlayıcılarla buluşmasını sağlayan bir aracı platformdur. Saha kiralama hizmeti tesis sahipleri tarafından sunulur; OYNA bu işlemde aracı konumundadır.

3. HESAP VE GÜVENLİK
Kullanıcı, hesap bilgilerinin gizliliğinden kendisi sorumludur. 18 yaşından küçük kullanıcılar veli/vasi onayı ile kullanmalıdır.

4. REZERVASYON VE KAPORA
Saha rezervasyonlarında, tesis tarafından belirlenen kapora tutarı uygulama üzerinden tahsil edilebilir. Rezervasyon onayı, tesisin belirlediği otomatik/manuel onay kurallarına tabidir.

5. İPTAL VE İADE
Rezervasyon/maç saatine 24 saatten fazla süre kala yapılan iptallerde ödenen tutarın tamamına yakını (yalnızca ödeme altyapısı sağlayıcısının kestiği işlem bedeli hariç) iade edilir; 6-24 saat kala yapılan iptallerde %50'si iade edilir; 6 saatten az kala iade yapılmaz. Ayrıntılar için Mesafeli Satış ve İptal/İade Koşulları'na bakınız.

6. KULLANICI YÜKÜMLÜLÜKLERI
Kullanıcı; yanlış bilgi vermemeyi, başkalarının haklarını ihlal etmemeyi, platformu hukuka aykırı amaçlarla kullanmamayı kabul eder.

7. SORUMLULUĞUN SINIRLANDIRILMASI
OYNA, tesis ile oyuncu arasındaki hizmetin ifasından doğrudan sorumlu değildir; aracı platform olarak makul özeni gösterir.

8. DEĞİŞİKLİKLER
OYNA bu şartları güncelleyebilir. Önemli değişiklikler uygulama üzerinden duyurulur.

9. İLETİŞİM
Sorularınız için: ${CONTACT_EMAIL}`,
  },
  PRIVACY: {
    title: 'Gizlilik Politikası',
    icon: Lock,
    body: `Son güncelleme: ${UPDATED}

1. TOPLANAN VERİLER
- Kimlik/iletişim: ad, e-posta, telefon
- Konum: yakındaki sahaları göstermek için, yalnızca uygulamayı kullanırken ve izninizle
- Rehber eşleştirme: açık izninizle, arkadaş bulma amacıyla; numaralar cihazda şifrelenir (hash), sunucuya yalnızca şifreli hâli gider — Ayarlar'dan kapatılabilir
- Kullanım: rezervasyon, maç ve uygulama içi etkinlik verileri
- Cihaz: bildirim için cihaz token'ı
- Ödeme: kart bilgileri OYNA sunucularında saklanmaz, doğrudan ödeme kuruluşunda işlenir

2. VERİLERİN KULLANIM AMACI
Hizmetin sunulması, rezervasyon ve ödeme süreçleri, bildirimler, güvenlik ve dolandırıcılık önleme, hizmet iyileştirme.

3. VERİLERİN PAYLAŞIMI
Verileriniz; rezervasyon yaptığınız tesis ile (gerekli ölçüde), ödeme kuruluşu ile (ödeme işlemleri için), teknoloji/altyapı tedarikçilerimiz ile ve yasal yükümlülükler kapsamında yetkili mercilerle paylaşılabilir. Verileriniz pazarlama amacıyla üçüncü taraflara satılmaz.

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
Kimlik, iletişim, konum, rehber eşleştirme (yalnızca izninizle), işlem, kullanım ve (izin verirseniz) cihaz/fotoğraf verileri.

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

6. AKTARIM
Verileriniz; ödeme kuruluşları, rezervasyon yaptığınız tesisler, teknoloji/altyapı tedarikçilerimiz (gerekirse yurt dışında yerleşik) ve yetkili kamu kurumlarına mevzuata uygun olarak aktarılabilir.

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
  CEREZ: {
    title: 'Çerez Politikası',
    icon: Cookie,
    body: `Son güncelleme: ${UPDATED}

Bu politika, OYNA'nın web yüzeylerinde (oyna.app ve alt sayfaları, web uygulaması) kullanılan çerezleri ve tarayıcı depolama teknolojilerini açıklar. Mobil uygulamada çerez kullanılmaz; cihaz izinleri Gizlilik Politikası'nda ayrıca açıklanmıştır.

1. ZORUNLU ÇEREZLER / DEPOLAMA
Oturumunuzu açık tutmak ve güvenliğinizi sağlamak için gereklidir; devre dışı bırakılamaz ve rıza gerektirmez. (Supabase oturum belirteci — "Beni Hatırla" açıksa kalıcı, kapalıysa oturum sonuna kadar localStorage/sessionStorage'da tutulur.)

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
- İade, ödemenin yapıldığı karta yansıtılır; bankanıza yansıma süresi bankanızın işlem sürelerine tabidir.

5. CAYMA HAKKI İSTİSNASI
Belirli bir tarih/saat için yapılan rezervasyonlar, Mesafeli Sözleşmeler Yönetmeliği m.15/1-ğ kapsamında "boş zamanın değerlendirilmesine ilişkin hizmetler" istisnasına tabidir; bu nedenle 14 günlük cayma hakkı uygulanmaz, iptal koşulları yukarıdaki kurallara tabidir.

6. UYUŞMAZLIK
Şikayetlerinizde ${CONTACT_EMAIL} ile iletişime geçebilir, çözülemeyen uyuşmazlıklarda Tüketici Hakem Heyetleri'ne başvurabilirsiniz.`,
  },
};

const ORDER: LegalDocKey[] = ['TERMS', 'PRIVACY', 'KVKK', 'RIZA', 'CEREZ', 'SALES'];

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
          <h1 className="text-lg font-black italic tracking-tight">{d.title.toUpperCase()}</h1>
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
          <h1 className="text-xl font-black italic tracking-tight">YASAL</h1>
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
