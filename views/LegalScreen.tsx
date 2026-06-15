import React, { useState } from 'react';
import { ArrowLeft, FileText, Shield, Lock, RefreshCw, ChevronRight } from 'lucide-react';

interface LegalScreenProps {
  onBack: () => void;
  initialDoc?: LegalDocKey;
}

type LegalDocKey = 'TERMS' | 'PRIVACY' | 'KVKK' | 'SALES';

// NOT: Bu metinler lansman için temel/şablon içeriktir. Yayına almadan önce
// bir avukata gözden geçirtilmesi ve şirket/ünvan/iletişim bilgilerinin
// doldurulması GEREKİR. Yer tutucular [KÖŞELİ PARANTEZ] ile işaretlendi.

const COMPANY = '[ŞİRKET ÜNVANI]';
const CONTACT_EMAIL = '[iletisim@oyna.app]';
const UPDATED = '15.06.2026';

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
Oyuncu, rezervasyon saatine 48 saatten fazla varsa rezervasyonunu iptal edebilir ve ödediği kaporanın %90'ı iade edilir. 48 saatten az kalan rezervasyonlar uygulama üzerinden iptal edilemez; tesisle iletişime geçilmelidir. Ayrıntılar için Mesafeli Satış ve İptal/İade Koşulları'na bakınız.

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
- Konum: yakındaki sahaları göstermek için (izninizle)
- Kullanım: rezervasyon, maç ve uygulama içi etkinlik verileri
- Cihaz: bildirim için cihaz token'ı

2. VERİLERİN KULLANIM AMACI
Hizmetin sunulması, rezervasyon ve ödeme süreçleri, bildirimler, güvenlik ve dolandırıcılık önleme, hizmet iyileştirme.

3. VERİLERİN PAYLAŞIMI
Verileriniz; rezervasyon yaptığınız tesis ile (gerekli ölçüde), ödeme kuruluşu ile (ödeme işlemleri için) ve yasal yükümlülükler kapsamında yetkili mercilerle paylaşılabilir. Verileriniz pazarlama amacıyla üçüncü taraflara satılmaz.

4. ÇEREZLER VE BENZER TEKNOLOJİLER
Oturum yönetimi ve tercihleriniz için gerekli teknolojiler kullanılır.

5. VERİ GÜVENLİĞİ
Veriler şifreli bağlantı (HTTPS) üzerinden iletilir ve erişim yetkilendirmesi (RLS) ile korunur.

6. HAKLARINIZ (KVKK m.11)
Verilerinize erişme, düzeltme, silme ve işlemeye itiraz haklarınız için: ${CONTACT_EMAIL}

7. SAKLAMA SÜRESİ
Veriler, hizmetin gerektirdiği ve mevzuatın öngördüğü süre boyunca saklanır.`,
  },
  KVKK: {
    title: 'KVKK Aydınlatma Metni',
    icon: Shield,
    body: `Son güncelleme: ${UPDATED}

6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, veri sorumlusu sıfatıyla ${COMPANY} tarafından kişisel verileriniz aşağıda açıklanan kapsamda işlenmektedir.

1. VERİ SORUMLUSU
${COMPANY}

2. İŞLENEN KİŞİSEL VERİLER
Kimlik, iletişim, konum, işlem ve kullanım verileri.

3. İŞLEME AMAÇLARI
- Üyelik ve hesap yönetimi
- Saha rezervasyonu ve kapora tahsilatının gerçekleştirilmesi
- Müşteri ilişkileri ve destek
- Yasal yükümlülüklerin yerine getirilmesi

4. HUKUKİ SEBEPLER
Sözleşmenin kurulması/ifası, hukuki yükümlülük, meşru menfaat ve açık rıza (gerekli hallerde).

5. AKTARIM
Verileriniz; ödeme kuruluşları, rezervasyon yaptığınız tesisler ve yetkili kamu kurumlarına mevzuata uygun olarak aktarılabilir.

6. HAKLARINIZ
KVKK m.11 kapsamındaki haklarınızı ${CONTACT_EMAIL} adresine başvurarak kullanabilirsiniz.`,
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
- Rezervasyon saatine 48 saatten FAZLA varsa: oyuncu uygulamadan iptal edebilir, ödenen kaporanın %90'ı iade edilir (%10 hizmet/işlem kesintisi).
- Rezervasyon saatine 48 saatten AZ kalmışsa: uygulama üzerinden iptal yapılamaz; tesisle iletişime geçilmelidir.
- İade, ödemenin yapıldığı yönteme banka süreçlerine göre yansıtılır.

5. CAYMA HAKKI İSTİSNASI
Belirli tarih/saat için yapılan rezervasyonlar (boş zamanın değerlendirilmesine ilişkin hizmetler), mevzuat gereği cayma hakkı istisnası kapsamında olabilir; iptal koşulları yukarıdaki kurallara tabidir.

6. UYUŞMAZLIK
Şikayetlerinizde ${CONTACT_EMAIL} ile iletişime geçebilir, çözülemeyen uyuşmazlıklarda Tüketici Hakem Heyetleri'ne başvurabilirsiniz.`,
  },
};

const ORDER: LegalDocKey[] = ['TERMS', 'PRIVACY', 'KVKK', 'SALES'];

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
            Bu metin lansman için hazırlanmış temel şablondur. Yayın öncesi bir hukuk danışmanı tarafından
            gözden geçirilmeli ve şirket bilgileri doldurulmalıdır.
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
