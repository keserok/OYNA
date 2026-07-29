import React, { useState } from 'react';
import { ArrowLeft, Check, Plus, Shield, Wifi } from 'lucide-react';
import { detectCardBrand, pickCardGradient, SavedCard, listSavedCards } from '../../services/walletService';
import { registerCardInApp, stripServerErrorPrefix } from '../../services/paymentService';
import CardBrandMark, { brandGradient, normalizeBrand } from './CardBrandMark';

/**
 * YENİ KART EKLE — tam ekran (tasarım: canlı kart önizlemesi + form).
 * %100 OYNA markalı form; iyzico kullanıcıya hiç görünmez.
 *
 * İki mod:
 *   • collectMode (ödeme ekranı): kart verisi YALNIZ bellekte yukarı döner
 *     (onCollect) — ödeme anında edge'e gider, 3DS onayıyla tahsil edilir.
 *     "Kaydet" işaretliyse ödeme onaylanınca kart iyzico deposuna yazılır.
 *   • kayıt modu (cüzdan): edge 'register-card' → iyzico kart deposu →
 *     DB'ye yalnız maskeli meta (marka + son 4 + SKT) yazılır.
 * PAN/CVV hiçbir zaman DB'ye veya log'a yazılmaz.
 */

/** Ödeme anı için toplanan kart — yalnız bellekte yaşar. */
export interface CollectedCard {
  holderName: string;
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  save: boolean;
  // görsel alanlar (karusel kartında gösterim)
  brand: string;
  last4: string;
  gradient: string;
}

interface AddCardScreenProps {
  onBack: () => void;
  /** Kayıt modunda başarılı kayıttan sonra çağrılır. */
  onSaved?: (card: SavedCard | null) => void;
  /** collectMode: form verisini yukarı döndür (ağ çağrısı yok). */
  collectMode?: boolean;
  onCollect?: (card: CollectedCard) => void;
}

const luhnValid = (num: string) => {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 15) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};

const expiryValid = (v: string) => {
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!m) return false;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return false;
  const year = 2000 + Number(m[2]);
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
};

const AddCardScreen: React.FC<AddCardScreenProps> = ({ onBack, onSaved, collectMode = false, onCollect }) => {
  const [num, setNum] = useState('');
  const [holder, setHolder] = useState('');
  const [exp, setExp] = useState('');
  const [cvv, setCvv] = useState('');
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const clean = num.replace(/\D/g, '');
  const brand = detectCardBrand(clean);
  const numberOk = luhnValid(num);
  const expOk = expiryValid(exp);
  const cvvOk = /^\d{3,4}$/.test(cvv);
  const holderOk = holder.trim().length >= 3;
  const valid = numberOk && expOk && cvvOk && holderOk;

  const handleSubmit = async () => {
    if (!valid || busy) return;
    setError('');
    const [mm, yy] = exp.split('/');
    const expMonth = Number(mm);
    const expYear = 2000 + Number(yy);

    if (collectMode && onCollect) {
      onCollect({
        holderName: holder.trim(),
        number: clean,
        expMonth, expYear,
        cvc: cvv,
        save,
        brand,
        last4: clean.slice(-4),
        gradient: pickCardGradient(clean.slice(-4)),
      });
      return;
    }

    setBusy(true);
    try {
      await registerCardInApp({
        holderName: holder.trim(),
        number: clean,
        expireMonth: expMonth,
        expireYear: expYear,
        cvc: cvv,
      });
      // Edge maskeli kartı DB'ye yazdı — güncel listeden yeni kartı bul
      const cards = await listSavedCards();
      const created = cards.find(c => c.last4 === clean.slice(-4)) ?? cards[0] ?? null;
      onSaved?.(created);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Kart kaydedilemedi.';
      // Ham metin destek için console'da kalır; kullanıcı sağlayıcı adını görmez.
      console.warn('[card] ham sunucu hatası:', raw);
      setError(stripServerErrorPrefix(raw) || 'Kart kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div lang="tr" className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
      <header className="px-5 pt-safe py-4 flex items-center gap-4 border-b border-white/5 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20">
        <button onClick={onBack}
          className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white active:scale-95 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-[17px] font-black text-white uppercase">Yeni Kart Ekle</h1>
          <p className="text-[11px] text-gray-500 font-semibold">Kart bilgilerini gir</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Canlı kart önizlemesi — markaya özel gradyan + canlı marka logosu */}
        <div
          className={`rounded-[20px] p-5 bg-gradient-to-br ${brandGradient(brand)} border border-white/10 relative overflow-hidden min-h-[168px] flex flex-col justify-between shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)] transition-[background] duration-500`}
        >
          {/* ışık/parlaklık dokunuşları */}
          <div className="absolute -top-8 -right-6 w-40 h-40 bg-white/10 blur-[60px] rounded-full" />
          <div className="absolute -bottom-10 -left-8 w-40 h-40 bg-black/20 blur-[60px] rounded-full" />
          <div className="flex justify-between items-start relative">
            {/* çip + temassız */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-[30px] rounded-[6px] bg-gradient-to-br from-[#f7d774] via-[#e6b34d] to-[#a97b25] shadow-inner relative overflow-hidden">
                <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-[1px] bg-black/25" />
                <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-[1px] bg-black/25" />
              </div>
              <Wifi size={20} className="text-white/55 rotate-90" />
            </div>
            {/* CANLI MARKA — numara yazıldıkça belirir */}
            <div className={`transition-all duration-300 ${normalizeBrand(brand) === 'GENERIC' ? 'opacity-40 scale-90' : 'opacity-100 scale-100'}`}>
              <CardBrandMark brand={brand} size={26} withWordmark variant="onCard" />
            </div>
          </div>
          <div className="relative">
            <p className="text-[20px] font-bold tracking-[0.14em] text-white font-numeric drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
              {num || '•••• •••• •••• ••••'}
            </p>
            <div className="flex justify-between items-end mt-3.5 gap-3">
              <div className="min-w-0">
                <span className="block text-[8px] text-white/50 font-black uppercase tracking-[0.15em]">Kart Sahibi</span>
                <span className="block text-[12px] text-white font-semibold font-numeric truncate uppercase">{holder || 'AD SOYAD'}</span>
              </div>
              <div className="text-right shrink-0">
                <span className="block text-[8px] text-white/50 font-black uppercase tracking-[0.15em]">Son Kul.</span>
                <span className="block text-[12px] text-white font-semibold font-numeric">{exp || 'AA/YY'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider block mb-2">Kart Numarası</label>
            <input
              value={num}
              onChange={e => setNum(e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim())}
              placeholder="1234 5678 9012 3456"
              inputMode="numeric"
              autoComplete="cc-number"
              className="w-full bg-[#161B22] border border-white/8 rounded-xl px-4 py-3.5 text-white font-bold tracking-[0.08em] font-numeric text-[15px] outline-none focus:border-[#39FF14]/40 transition-colors placeholder:text-gray-600"
            />
            {clean.length >= 15 && !numberOk && (
              <p className="text-xs text-red-400 font-bold mt-1.5">Kart numarası geçersiz görünüyor.</p>
            )}
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider block mb-2">Kart Sahibi</label>
            <input
              value={holder}
              onChange={e => setHolder(e.target.value.toLocaleUpperCase('tr-TR'))}
              placeholder="AD SOYAD"
              autoComplete="cc-name"
              className="w-full bg-[#161B22] border border-white/8 rounded-xl px-4 py-3.5 text-white font-bold text-[15px] outline-none focus:border-[#39FF14]/40 transition-colors placeholder:text-gray-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider block mb-2">Son Kullanma</label>
              <input
                value={exp}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setExp(v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v);
                }}
                placeholder="AA/YY"
                inputMode="numeric"
                autoComplete="cc-exp"
                className="w-full bg-[#161B22] border border-white/8 rounded-xl px-4 py-3.5 text-white font-bold font-numeric text-[15px] outline-none focus:border-[#39FF14]/40 transition-colors placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider block mb-2">CVV</label>
              <input
                value={cvv}
                onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="•••"
                inputMode="numeric"
                type="password"
                autoComplete="cc-csc"
                className="w-full bg-[#161B22] border border-white/8 rounded-xl px-4 py-3.5 text-white font-bold font-numeric text-[15px] outline-none focus:border-[#39FF14]/40 transition-colors placeholder:text-gray-600"
              />
            </div>
          </div>
          {exp.length === 5 && !expOk && (
            <p className="text-xs text-red-400 font-bold -mt-2">Son kullanma tarihi geçersiz veya geçmiş.</p>
          )}
        </div>

        {collectMode && (
          <button onClick={() => setSave(s => !s)} className="flex gap-2.5 items-center px-0.5">
            <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border-2 transition-colors ${save ? 'bg-[#39FF14] border-[#39FF14]' : 'border-white/20 bg-transparent'}`}>
              <Check size={13} strokeWidth={3} className={`text-[#0A0E14] ${save ? 'opacity-100' : 'opacity-0'}`} />
            </span>
            <span className="text-xs text-gray-300 font-semibold">Bu kartı sonraki ödemeler için kaydet</span>
          </button>
        )}

        <div className="flex items-center gap-2 px-0.5">
          <Shield size={14} className="text-[#39FF14]" />
          <p className="text-[11px] text-gray-500">
            {collectMode
              ? 'Kart bilgilerin şifreli iletilir; banka doğrulaması (3D Secure) ile tahsil edilir.'
              : 'Kart güvenli ödeme altyapısında saklanır; OYNA yalnız son 4 haneyi görür.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-3">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
      </main>

      <div className="p-5 pb-safe border-t border-white/5">
        <button
          disabled={!valid || busy}
          onClick={handleSubmit}
          className={`w-full py-4 font-black text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            valid && !busy ? 'bg-[#39FF14] text-[#0A0E14]' : 'bg-gray-800 text-gray-500'
          }`}
        >
          <Plus size={18} />
          {busy ? 'KAYDEDİLİYOR...'
            : collectMode ? (save ? 'KULLAN VE KAYDET' : 'BU ÖDEMEDE KULLAN')
            : 'KARTI KAYDET'}
        </button>
      </div>
    </div>
  );
};

export default AddCardScreen;
