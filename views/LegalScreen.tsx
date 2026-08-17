import React, { useState } from 'react';
import { ArrowLeft, FileText, Shield, ShieldCheck, Lock, RefreshCw, Cookie, ChevronRight, Users, Scale } from 'lucide-react';
import { trUpper } from '../utils/trUpper';
// IP-15: belge metinleri shared/legalDocs.ts'e taşındı — kayıt ekranındaki
// onay kutusu da AYNI metni gösteriyor (eskiden ayrı bir özet vardı).
import { DOCS, CONTACT_EMAIL, type LegalDocKey } from '../shared/legalDocs';
import { LEGAL_UPDATED_TR } from '../shared/legalVersion';

const UPDATED = LEGAL_UPDATED_TR;

interface LegalScreenProps {
  onBack: () => void;
  initialDoc?: LegalDocKey;
}



const ORDER: LegalDocKey[] = ['TERMS', 'TOPLULUK', 'PRIVACY', 'KVKK', 'RIZA', 'VELI', 'CEREZ', 'SALES'];

const LegalScreen: React.FC<LegalScreenProps> = ({ onBack, initialDoc }) => {
  const [doc, setDoc] = useState<LegalDocKey | null>(initialDoc ?? null);

  if (doc) {
    const d = DOCS[doc];
    return (
      <div className="min-h-screen bg-[#0A0E14] text-white font-sans">
        {/* `pt-safe-5` satır içi `pt-[calc(var(--safe-top)+1.25rem)]` ile AYNI
            boşluğu verir (5 = 1.25rem). Sınıfa çevrildi çünkü çevrimdışı şeridi
            telafisi (index.css · body.offline-banner-on) yalnız sınıflara
            yazılabiliyor: uçak modunda kırmızı şerit açılınca sözleşme
            ekranından ÇIKIŞ düğmesinin üstü şeridin altında kalıyordu. */}
        <header className="sticky top-0 z-20 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 px-6 pt-safe-5 pb-5 flex items-center gap-4">
          <button onClick={() => setDoc(null)} aria-label="Geri" className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-extrabold italic tracking-tight">{trUpper(d.title)}</h1>
        </header>
        <main className="p-6 max-w-2xl mx-auto">
          <div className="bg-[#161B22] border border-white/5 rounded-3xl p-6">
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300 leading-relaxed">{d.body}</pre>
          </div>
          <p className="text-[0.6875rem] text-ink-4 text-center mt-6 leading-relaxed">
            Bu belgeler hakkında sorularınız için {CONTACT_EMAIL} adresinden bize ulaşabilirsiniz.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white font-sans">
      {/* Aynı gerekçe (bkz. yukarıdaki başlık): sınıf = çevrimdışı şeridi telafisi. */}
      <header className="sticky top-0 z-20 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 px-6 pt-safe-5 pb-5 flex items-center gap-4">
        <button onClick={onBack} aria-label="Geri" className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold italic tracking-tight">YASAL</h1>
          <p className="text-[0.625rem] text-gray-400 font-bold uppercase tracking-widest">Sözleşmeler ve politikalar</p>
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
                <ChevronRight size={16} className="text-ink-4" />
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default LegalScreen;
