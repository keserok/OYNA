import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Shield, ShieldCheck, Lock, RefreshCw, Cookie, ChevronRight, Users, Scale } from 'lucide-react';
import { trUpper } from '../utils/trUpper';
// IP-15: belge metinleri shared/legalDocs.ts'e taşındı — kayıt ekranındaki
// onay kutusu da AYNI metni gösteriyor (eskiden ayrı bir özet vardı).
import { DOCS, CONTACT_EMAIL, type LegalDocKey } from '../shared/legalDocs';
import { LEGAL_UPDATED_TR } from '../shared/legalVersion';
import { useAppStore } from '../store';
import { switchableRoles } from '../shared/roles';
import { UserRole } from '../types';
import type { RolBelgeAnahtari, ROL_BELGELERI as RolBelgeleriTipi } from '../shared/legalDocsRol';

const UPDATED = LEGAL_UPDATED_TR;

// ─── ROL SÖZLEŞMELERİ — yalnız ilgili role sahip kullanıcıya ────────────────
// Kaleci/hakem ve tesis sözleşmeleri 60 KB. Statik import edilseydi bu paket
// HER kullanıcıya inerdi; oyuncuların neredeyse hiçbiri bu iki belgeyi açmaz.
// Bu yüzden modül YALNIZ ilgili rol varsa ve yasal ekran açıldığında indirilir.
//
// Metinler "bilgi amaçlı örnek, bağlayıcı değildir" damgasıyla üretilir —
// gerekçesi scripts/build-legal-roles.mjs dosya başında.
type RolBelgeleri = typeof RolBelgeleriTipi;

const rolBelgeAnahtarlari = (roller: readonly string[] | null | undefined): RolBelgeAnahtari[] => {
  const r = switchableRoles(roller);
  const liste: RolBelgeAnahtari[] = [];
  if (r.includes(UserRole.GOALKEEPER) || r.includes(UserRole.REFEREE)) liste.push('SAGLAYICI');
  if (r.includes(UserRole.OWNER)) liste.push('ISLETME');
  return liste;
};

interface LegalScreenProps {
  onBack: () => void;
  initialDoc?: LegalDocKey;
}



// HESAP_SILME 24 Ağu 2026'da eklendi: metin repoda ve web'de vardı ama
// uygulama içi yasal ekranda YOKTU. Listenin SONUNDA duruyor — silme, okunacak
// son şeydir; üste konsaydı ilk göze çarpan seçenek "hesabını sil" olurdu.
const ORDER: LegalDocKey[] = ['TERMS', 'TOPLULUK', 'PRIVACY', 'KVKK', 'RIZA', 'VELI', 'CEREZ', 'SALES', 'HESAP_SILME'];

const LegalScreen: React.FC<LegalScreenProps> = ({ onBack, initialDoc }) => {
  const [doc, setDoc] = useState<LegalDocKey | null>(initialDoc ?? null);
  const [rolDoc, setRolDoc] = useState<RolBelgeAnahtari | null>(null);
  const myRoles = useAppStore((st) => st.myRoles);
  const rolAnahtarlari = rolBelgeAnahtarlari(myRoles);
  const [rolBelgeleri, setRolBelgeleri] = useState<RolBelgeleri | null>(null);

  // Modül YALNIZ ilgili rol varsa indirilir. Oyuncu hesabı bu 60 KB'ı hiç almaz.
  useEffect(() => {
    if (!rolAnahtarlari.length || rolBelgeleri) return;
    let iptal = false;
    void import('../shared/legalDocsRol')
      .then((m) => { if (!iptal) setRolBelgeleri(m.ROL_BELGELERI); })
      .catch(() => { /* indirilemedi: liste çizilmez, ekranın geri kalanı çalışır */ });
    return () => { iptal = true; };
  }, [rolAnahtarlari.length, rolBelgeleri]);

  // ─── Rol sözleşmesi görüntüsü ───
  if (rolDoc && rolBelgeleri) {
    const d = rolBelgeleri[rolDoc];
    return (
      <div className="min-h-screen bg-[#0A0E14] text-white font-sans">
        <header className="sticky top-0 z-20 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 px-6 pt-safe-5 pb-5 flex items-center gap-4">
          <button onClick={() => setRolDoc(null)} aria-label="Geri" className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
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

        {/* ─── ROLÜNE ÖZEL SÖZLEŞMELER ───
            Yalnız kaleci/hakem ya da tesis rolü olana görünür. Oyuncunun
            ekranında bu bölüm hiç çizilmez ve modülü hiç indirilmez. */}
        {rolAnahtarlari.length > 0 && rolBelgeleri && (
          <>
            <h2 className="text-[0.625rem] text-gray-400 font-bold uppercase tracking-widest mt-8 mb-3 px-1">
              Rolüne özel
            </h2>
            <div className="flex flex-col">
              {rolAnahtarlari.map((key) => {
                const d = rolBelgeleri[key];
                const Icon = d.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setRolDoc(key)}
                    className="w-full flex items-center justify-between p-4 bg-[#161B22] border border-white/5 first:rounded-t-2xl last:rounded-b-2xl border-b-0 last:border-b hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-gray-400"><Icon size={20} /></div>
                      <div className="text-left">
                        <span className="block text-sm font-bold text-white">{d.title}</span>
                        {/* Damga metnin İÇİNDE de var; burada listede de görünür
                            ki kullanıcı açmadan önce ne olduğunu bilsin. */}
                        <span className="block text-[0.6875rem] text-amber-400/80 font-semibold mt-0.5">
                          Bilgi amaçlı örnek — bağlayıcı değildir
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-ink-4" />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default LegalScreen;
