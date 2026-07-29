import React, { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Check, ShieldCheck, Clock, Info } from 'lucide-react';
import {
  getMyGuardianState, getOrCreateGuardianLinkCode, GuardianConsentStatus,
} from '../services/guardianService';

interface GuardianConsentChildProps {
  onBack: () => void;
  onGoVeliForm: () => void;
}

/**
 * Reşit olmayan kullanıcıya gösterilen ekran: hesabın sınırlı olduğunu
 * açıklar, benzersiz Veli Bağlantı Kodunu ve onay durumunu gösterir.
 * Ödeme kapısına takılınca veya Ayarlar'dan açılır.
 */
const GuardianConsentChild: React.FC<GuardianConsentChildProps> = ({ onBack, onGoVeliForm }) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GuardianConsentStatus>('NONE');
  const [isMinor, setIsMinor] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const state = await getMyGuardianState();
        if (state) { setStatus(state.status); setIsMinor(state.isMinor); }
        // Kodu yalnızca reşit olmayan ve onayı aktif olmayan kullanıcı için üret
        if (state && state.isMinor && state.status !== 'ACTIVE') {
          const c = await getOrCreateGuardianLinkCode();
          setCode(c);
        }
      } catch (e) {
        setErr('Durum yüklenemedi. Lütfen tekrar deneyin.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* pano erişimi yoksa yoksay */
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white font-sans">
      <header className="sticky top-0 z-20 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 px-6 py-5 flex items-center gap-4">
        <button onClick={onBack} aria-label="Geri" className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-extrabold italic tracking-tight">VELİ ONAYI</h1>
      </header>

      <main className="p-6 max-w-md mx-auto">
        {loading ? (
          <div className="text-center text-gray-400 py-16">Yükleniyor…</div>
        ) : err ? (
          <div className="text-center text-red-400 py-16">{err}</div>
        ) : status === 'ACTIVE' ? (
          <div className="bg-[#161B22] border border-[#39FF14]/30 rounded-3xl p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#39FF14]/15 flex items-center justify-center mb-4">
              <ShieldCheck size={32} className="text-[#39FF14]" />
            </div>
            <h2 className="text-xl font-extrabold mb-2">Veli onayın tamamlandı</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Artık ödeme yapabilir ve maçlara katılabilirsin. İyi oyunlar!
            </p>
          </div>
        ) : !isMinor ? (
          // Reşit kullanıcı → kendisi için onaya gerek yok; bir çocuğu onaylayabilir.
          <div className="bg-[#161B22] border border-white/5 rounded-3xl p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-4">
              <ShieldCheck size={32} className="text-gray-400" />
            </div>
            <h2 className="text-xl font-extrabold mb-2">Bu hesap için veli onayı gerekmiyor</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              Hesabın reşit görünüyor. 18 yaşından küçük bir çocuğu onaylamak istiyorsanız
              aşağıdan devam edebilirsiniz.
            </p>
            <button onClick={onGoVeliForm} className="px-6 py-3 rounded-xl bg-[#39FF14] text-[#06210A] font-extrabold text-sm active:scale-95 transition">
              Çocuğumu Onayla →
            </button>
          </div>
        ) : (
          <>
            <div className="bg-[#161B22] border border-white/5 rounded-3xl p-6 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  {status === 'REVOKED' ? 'Onay Geri Alındı' : 'Veli Onayı Bekleniyor'}
                </span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                18 yaşından küçük olduğun için hesabın <b className="text-white">sınırlı modda</b>.
                Uygulamada gezinebilir, maç ve saha arayabilirsin; ancak <b className="text-white">ödeme
                yapmak ve maçlara katılmak</b> için bir velinin (anne/baba/vasi) onayı gerekir.
              </p>
            </div>

            {/* Kod */}
            <div className="bg-gradient-to-b from-[#39FF14]/10 to-transparent border border-[#39FF14]/25 rounded-3xl p-6 mb-4 text-center">
              <div className="text-[0.6875rem] font-bold uppercase tracking-widest text-gray-400 mb-2">Veli Bağlantı Kodun</div>
              <div className="text-4xl font-extrabold tracking-[0.25em] text-[#39FF14] mb-4" style={{ textShadow: '0 0 24px rgba(57,255,20,0.4)' }}>
                {code ?? '—'}
              </div>
              <button
                onClick={copy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-bold text-white hover:bg-white/10 active:scale-95 transition-all"
              >
                {copied ? <><Check size={15} className="text-[#39FF14]" /> Kopyalandı</> : <><Copy size={15} /> Kodu Kopyala</>}
              </button>
            </div>

            {/* Adımlar */}
            <div className="bg-[#161B22] border border-white/5 rounded-3xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Info size={16} className="text-gray-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Nasıl Onaylanır?</span>
              </div>
              <ol className="space-y-3">
                {[
                  'Bu kodu velinize verin.',
                  'Veliniz kendi OYNA hesabına girsin (yoksa ücretsiz oluştursun).',
                  'Ayarlar → Veli Onayı bölümüne bu kodu girsin.',
                  'Kimlik bilgilerini doldurup onaylasın — hesabın anında açılır.',
                ].map((s, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-[#39FF14]/15 text-[#39FF14] text-xs font-extrabold flex items-center justify-center">{i + 1}</span>
                    <span className="text-sm text-gray-300 leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </div>

            <button
              onClick={onGoVeliForm}
              className="w-full mt-4 text-center text-sm text-gray-400 hover:text-white transition-colors py-2"
            >
              Veli misiniz? <span className="text-[#39FF14] font-bold">Çocuğunuzu onaylayın →</span>
            </button>
          </>
        )}
      </main>
    </div>
  );
};

export default GuardianConsentChild;
