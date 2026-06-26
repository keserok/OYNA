import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, CreditCard, Lock, CheckCircle2, AlertCircle,
  Shield, User, Phone, ChevronRight, Info, X, Clock
} from 'lucide-react';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { parseSlotLabel } from '../services/availabilityService';

interface PaymentScreenProps {
  onBack: () => void;
  onViewTicket: () => void;
  extraFee?: number;
}

type PaymentStep = 'SUMMARY' | 'MINOR_CONSENT' | 'CARD_FORM' | 'PROCESSING' | 'BLOCKED' | 'ERROR';

interface CommissionInfo {
  commission_pct: number;
  commission_amt: number;
  net_amount: number;
  model: string;
}

const PaymentScreen: React.FC<PaymentScreenProps> = ({ onBack, onViewTicket, extraFee = 0 }) => {
  const { bookingPitch, bookingCourt, bookingDate, bookingSlot, bookingPrice, bookingDeposit } = useAppStore();

  const [step, setStep]           = useState<PaymentStep>('SUMMARY');
  const [commission, setCommission] = useState<CommissionInfo | null>(null);
  const [isMinor, setIsMinor]     = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [guardianName, setGuardianName]     = useState('');
  const [guardianPhone, setGuardianPhone]   = useState('');
  const [guardianCardLast4, setGuardianCardLast4] = useState('');
  const [cardNumber, setCardNumber]   = useState('');
  const [cardExpiry, setCardExpiry]   = useState('');
  const [cardCvv, setCardCvv]         = useState('');
  const [cardHolder, setCardHolder]   = useState('');
  const [errorMsg, setErrorMsg]       = useState('');
  const [intentId, setIntentId]       = useState<string | null>(null);

  const PITCH_PRICE   = bookingPrice ?? (bookingCourt?.price ?? (bookingPitch?.totalPrice ?? 2800));
  const DEPOSIT_AMOUNT = bookingDeposit ?? Math.min(1000, PITCH_PRICE);

  useEffect(() => {
    const init = async () => {
      // Minor check: fetch birthdate from profiles
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('birthdate, name')
          .eq('id', user.id)
          .maybeSingle();
        if (profile?.birthdate) {
          const birth = new Date(profile.birthdate as string);
          const age = (Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          setIsMinor(age < 18);
        }
        if ((profile as { name?: string } | null)?.name) {
          setCardHolder(((profile as { name?: string }).name ?? '').toUpperCase());
        }
      }
      // Fetch commission info
      const { data: comm } = await supabase.rpc('calculate_commission', { p_amount: DEPOSIT_AMOUNT });
      if (comm) setCommission(comm as CommissionInfo);
    };
    void init();
  }, [DEPOSIT_AMOUNT]);

  const commissionAmt = commission?.commission_amt ?? Math.round(DEPOSIT_AMOUNT * 0.15);
  const totalCharge   = DEPOSIT_AMOUNT + (extraFee ?? 0);

  const handleContinue = () => {
    if (isMinor) { setStep('MINOR_CONSENT'); return; }
    setStep('CARD_FORM');
  };

  const handleMinorConsentNext = () => {
    if (!consentChecked || !guardianName.trim() || !guardianPhone.trim()) return;
    setStep('CARD_FORM');
  };

  const formatCardNumber = (v: string) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();

  const formatExpiry = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 4);
    return clean.length >= 3 ? `${clean.slice(0, 2)}/${clean.slice(2)}` : clean;
  };

  const handlePaySubmit = async () => {
    if (!bookingPitch || !bookingCourt || !bookingDate || !bookingSlot) {
      setErrorMsg('Rezervasyon bilgileri eksik. Lütfen geri dönüp tekrar deneyin.');
      setStep('ERROR');
      return;
    }
    setStep('PROCESSING');
    try {
      // 1. Create booking in DB
      const { startTime, endTime } = parseSlotLabel(bookingSlot);
      const { data: booking, error: bookingErr } = await supabase.rpc('create_pitch_booking', {
        p_pitch_id:    bookingPitch.id,
        p_court_id:    bookingCourt.id,
        p_booking_date: bookingDate,
        p_start_time:  `${startTime}:00`,
        p_end_time:    `${endTime}:00`,
        p_source:      'APP_BOOKING',
        p_title:       cardHolder || 'Kullanıcı',
      });
      if (bookingErr) throw bookingErr;

      // 2. Create payment intent (pre-auth / blokaj)
      const { data: intent, error: intentErr } = await supabase.rpc('create_payment_intent', {
        p_booking_id: (booking as { id: string }).id,
        p_provider:   'IYZICO',
      });
      if (intentErr) throw intentErr;
      const intentData = intent as { id: string };
      setIntentId(intentData.id);

      // 3. Record minor consent if applicable
      if (isMinor) {
        await supabase.rpc('record_minor_consent', {
          p_payment_intent_id:   intentData.id,
          p_guardian_name:       guardianName,
          p_guardian_phone:      guardianPhone,
          p_guardian_card_last4: guardianCardLast4 || null,
          p_consent_text:        'Velisi olduğum kişinin OYNA üzerinden ödeme yapmasına açıkça onay veriyorum.',
        });
      }

      // In production: call edge function with card data → iyzico → apply_preauth_block
      // For sandbox: simulate BLOCKED state
      setStep('BLOCKED');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.';
      setErrorMsg(msg.replace(/^[A-Z_]+: /,''));
      setStep('ERROR');
    }
  };

  // ─── Views ───────────────────────────────────────────────────────────────────

  const SummaryView = () => (
    <div className="space-y-5 animate-in slide-in-from-bottom-6 duration-400">
      <div className="bg-[#161B22] border border-white/8 rounded-[28px] p-6 space-y-3">
        <p className="text-gray-400 text-[11px] font-black uppercase tracking-widest mb-4">Ödeme Özeti</p>
        <Row label="Saha Kirası" value={`${PITCH_PRICE}₺`} />
        {extraFee > 0 && <Row label="Ekipman & Hizmetler" value={`+${extraFee}₺`} />}
        <Row label={`Hizmet Bedeli (%${commission?.commission_pct ?? 15})`} value={`+${commissionAmt}₺`} dim />
        <div className="h-px bg-white/8 my-1" />
        <div className="flex justify-between items-center">
          <span className="font-black text-white">TOPLAM ÜCRET</span>
          <span className="font-black text-[#FFFF00] text-lg">{PITCH_PRICE + extraFee + commissionAmt}₺</span>
        </div>
      </div>

      <div className="bg-gradient-to-br from-[#1a1f00] to-[#161B22] border border-[#FFFF00]/20 rounded-[28px] p-6 relative overflow-hidden">
        <div className="absolute top-4 right-4 opacity-10"><Lock size={48} /></div>
        <p className="text-[#FFFF00] text-[11px] font-black uppercase tracking-widest mb-1">Bugün Alınacak Blokaj</p>
        <p className="text-4xl font-black text-white">{totalCharge}₺</p>
        <p className="text-xs text-gray-400 mt-2">
          Bu tutar kartınızda <span className="text-white font-bold">bloke</span> edilir.
          Maç T-8s onaylanırsa tahsil edilir; iptal olursa otomatik serbest bırakılır.
        </p>
      </div>

      <div className="bg-[#0f1419] border border-blue-500/20 rounded-2xl p-4 flex gap-3">
        <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          <span className="text-white font-bold">Blokaj sistemi:</span> Para kartınızdan çıkmaz, sadece rezerve edilir.
          Maç dolarsa (min. %70) tahsil edilir. Dolmazsa 1–3 iş gününde iadesiz serbest bırakılır.
        </p>
      </div>

      {isMinor && (
        <div className="bg-orange-900/20 border border-orange-500/30 rounded-2xl p-4 flex gap-3">
          <AlertCircle size={16} className="text-orange-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-orange-300 leading-relaxed">
            <span className="font-bold">18 yaş altı:</span> Ödeme için veli kartı ve onayı gereklidir.
          </p>
        </div>
      )}

      <button
        onClick={handleContinue}
        className="w-full py-4 bg-[#FFFF00] text-black font-black text-base rounded-2xl shadow-[0_0_30px_rgba(255,255,0,0.2)] hover:bg-yellow-300 active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        {isMinor ? 'VELİ ONAYI İLE DEVAM ET' : 'KART BİLGİLERİNİ GİR'} <ChevronRight size={18} />
      </button>
    </div>
  );

  const MinorConsentView = () => (
    <div className="space-y-5 animate-in slide-in-from-right-6 duration-400">
      <div className="bg-orange-900/20 border border-orange-500/30 rounded-[28px] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
            <Shield size={20} className="text-orange-400" />
          </div>
          <div>
            <p className="text-white font-black text-sm">Veli / Vasi Onayı</p>
            <p className="text-orange-400 text-[11px]">18 yaş altı zorunlu adım</p>
          </div>
        </div>
        <p className="text-gray-300 text-[12px] leading-relaxed">
          Kanun gereği 18 yaş altı kullanıcılar yalnızca veli/vasi onayıyla ödeme yapabilir.
          Aşağıdaki bilgileri eksiksiz doldurun.
        </p>
      </div>

      <div className="space-y-4">
        <FormField icon={<User size={16} />} label="Veli / Vasi Adı Soyadı" required>
          <input
            value={guardianName}
            onChange={e => setGuardianName(e.target.value)}
            placeholder="Ad Soyad"
            className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600"
          />
        </FormField>
        <FormField icon={<Phone size={16} />} label="Veli / Vasi Telefonu" required>
          <input
            value={guardianPhone}
            onChange={e => setGuardianPhone(e.target.value)}
            placeholder="05XX XXX XX XX"
            type="tel"
            className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600"
          />
        </FormField>
        <FormField icon={<CreditCard size={16} />} label="Veli Kartı Son 4 Hane (opsiyonel)">
          <input
            value={guardianCardLast4}
            onChange={e => setGuardianCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234"
            className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600"
          />
        </FormField>
      </div>

      <label className="flex gap-3 items-start bg-[#161B22] border border-white/8 rounded-2xl p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={consentChecked}
          onChange={e => setConsentChecked(e.target.checked)}
          className="mt-1 accent-[#FFFF00] w-4 h-4 shrink-0"
        />
        <p className="text-[11px] text-gray-300 leading-relaxed">
          Velisi / vasisi olduğum kişinin OYNA platformu üzerinden gerçekleştireceği ödemeye
          açık rızamı verdiğimi ve ödeme tutarından haberdar olduğumu kabul ediyorum.
          Kişisel verilerimin KVKK kapsamında işleneceğini okudum, anladım.
        </p>
      </label>

      <button
        disabled={!consentChecked || !guardianName.trim() || !guardianPhone.trim()}
        onClick={handleMinorConsentNext}
        className="w-full py-4 bg-orange-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-black text-base rounded-2xl active:scale-95 transition-all"
      >
        ONAYLADIM, DEVAM ET
      </button>
    </div>
  );

  const CardFormView = () => (
    <div className="space-y-5 animate-in slide-in-from-right-6 duration-400">
      <div className="bg-[#161B22] border border-white/8 rounded-[28px] p-6 space-y-5">
        <p className="text-gray-400 text-[11px] font-black uppercase tracking-widest">Kart Bilgileri</p>

        <FormField icon={<User size={16} />} label="Kart Sahibi">
          <input
            value={cardHolder}
            onChange={e => setCardHolder(e.target.value.toUpperCase())}
            placeholder="AD SOYAD"
            className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600 tracking-wider"
          />
        </FormField>

        <FormField icon={<CreditCard size={16} />} label="Kart Numarası">
          <input
            value={cardNumber}
            onChange={e => setCardNumber(formatCardNumber(e.target.value))}
            placeholder="0000 0000 0000 0000"
            inputMode="numeric"
            className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600 tracking-widest"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField icon={<Clock size={16} />} label="Son Kullanma">
            <input
              value={cardExpiry}
              onChange={e => setCardExpiry(formatExpiry(e.target.value))}
              placeholder="AA/YY"
              inputMode="numeric"
              className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600"
            />
          </FormField>
          <FormField icon={<Lock size={16} />} label="CVV">
            <input
              value={cardCvv}
              onChange={e => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="•••"
              inputMode="numeric"
              type="password"
              className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600"
            />
          </FormField>
        </div>
      </div>

      <div className="flex items-center gap-2 px-2">
        <Shield size={14} className="text-green-400" />
        <p className="text-[11px] text-gray-500">SSL/TLS şifreli bağlantı · iyzico güvencesi · Kart verisi saklanmaz</p>
      </div>

      <div className="bg-[#161B22] border border-[#FFFF00]/20 rounded-2xl p-4 flex justify-between items-center">
        <span className="text-gray-400 text-sm">Bloke edilecek tutar</span>
        <span className="text-[#FFFF00] font-black text-xl">{totalCharge}₺</span>
      </div>

      <button
        disabled={!cardNumber || !cardExpiry || !cardCvv || !cardHolder}
        onClick={handlePaySubmit}
        className="w-full py-4 bg-[#FFFF00] disabled:bg-gray-800 disabled:text-gray-500 text-black font-black text-base rounded-2xl shadow-[0_0_30px_rgba(255,255,0,0.2)] hover:bg-yellow-300 active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        <Lock size={18} /> {totalCharge}₺ BLOKE ET (ÖN PROVIZYON)
      </button>
    </div>
  );

  const ProcessingView = () => (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      <div className="w-20 h-20 rounded-full border-4 border-white/10 border-t-[#FFFF00] animate-spin" />
      <div className="text-center">
        <p className="text-white font-black text-lg">Blokaj İşleniyor</p>
        <p className="text-gray-400 text-sm mt-1">iyzico ile güvenli bağlantı...</p>
      </div>
    </div>
  );

  const BlockedView = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-6 animate-in fade-in zoom-in duration-500">
      <div className="w-24 h-24 bg-[#FFFF00]/10 border-2 border-[#FFFF00]/40 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,0,0.2)]">
        <Lock size={40} className="text-[#FFFF00]" />
      </div>
      <div className="text-center">
        <p className="text-[#FFFF00] font-black text-2xl">BLOKAJ BAŞARILI</p>
        <p className="text-white font-bold text-sm mt-1">{totalCharge}₺ kartınızda rezerve edildi</p>
      </div>

      <div className="w-full bg-[#161B22] border border-white/8 rounded-[28px] p-6 space-y-3">
        <InfoRow label="Durum" value="Beklemede (Bloke)" accent="yellow" />
        <InfoRow label="Maç onayı" value="T-8 saatte kontrol edilir" />
        <InfoRow label="Onay koşulu" value="Min. %70 katılım" />
        <InfoRow label="İptal durumu" value="Otomatik serbest bırakılır" />
        {intentId && <InfoRow label="İşlem No" value={intentId.slice(0, 8).toUpperCase()} dim />}
      </div>

      <button
        onClick={onViewTicket}
        className="w-full py-4 bg-[#FFFF00] text-black font-black text-base rounded-2xl active:scale-95 transition-all"
      >
        MAÇ KARTINI GÖRÜNTÜLE
      </button>
      <button onClick={onBack} className="text-gray-500 font-bold text-sm hover:text-white transition-colors">
        ANA SAYFAYA DÖN
      </button>
    </div>
  );

  const ErrorView = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-6 animate-in fade-in duration-400">
      <div className="w-20 h-20 bg-red-500/10 border-2 border-red-500/30 rounded-full flex items-center justify-center">
        <X size={36} className="text-red-400" />
      </div>
      <div className="text-center">
        <p className="text-red-400 font-black text-xl">İŞLEM BAŞARISIZ</p>
        <p className="text-gray-400 text-sm mt-2 max-w-xs">{errorMsg || 'Beklenmeyen bir hata oluştu.'}</p>
      </div>
      <button
        onClick={() => setStep('CARD_FORM')}
        className="w-full py-4 bg-[#161B22] border border-white/10 text-white font-black text-base rounded-2xl active:scale-95 transition-all"
      >
        TEKRAR DENE
      </button>
      <button onClick={onBack} className="text-gray-500 font-bold text-sm hover:text-white transition-colors">
        VAZGEÇ
      </button>
    </div>
  );

  const stepTitle: Record<PaymentStep, string> = {
    SUMMARY:       'ÖDEME ÖZETİ',
    MINOR_CONSENT: 'VELİ ONAYI',
    CARD_FORM:     'KART BİLGİLERİ',
    PROCESSING:    'İŞLENİYOR',
    BLOCKED:       'BLOKAJ ONAYLANDI',
    ERROR:         'HATA',
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
      <header className="px-6 py-5 flex items-center gap-4 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20 border-b border-white/5">
        <button
          onClick={step === 'BLOCKED' ? onBack : () => {
            if (step === 'CARD_FORM' && isMinor) { setStep('MINOR_CONSENT'); return; }
            if (step === 'CARD_FORM') { setStep('SUMMARY'); return; }
            if (step === 'MINOR_CONSENT') { setStep('SUMMARY'); return; }
            if (step === 'ERROR') { setStep('CARD_FORM'); return; }
            onBack();
          }}
          className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-black text-white">{stepTitle[step]}</h1>
          {step === 'SUMMARY' && (
            <p className="text-[10px] text-gray-400 font-bold">
              {bookingPitch?.name} · {bookingDate}
            </p>
          )}
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto pb-24">
        {step === 'SUMMARY'       && <SummaryView />}
        {step === 'MINOR_CONSENT' && <MinorConsentView />}
        {step === 'CARD_FORM'     && <CardFormView />}
        {step === 'PROCESSING'    && <ProcessingView />}
        {step === 'BLOCKED'       && <BlockedView />}
        {step === 'ERROR'         && <ErrorView />}
      </main>
    </div>
  );
};

// ─── Helper components ────────────────────────────────────────────────────────

const Row = ({ label, value, dim }: { label: string; value: string; dim?: boolean }) => (
  <div className="flex justify-between items-center text-sm">
    <span className={dim ? 'text-gray-500' : 'text-gray-300'}>{label}</span>
    <span className={`font-bold ${dim ? 'text-gray-500' : 'text-white'}`}>{value}</span>
  </div>
);

const InfoRow = ({ label, value, accent, dim }: { label: string; value: string; accent?: string; dim?: boolean }) => (
  <div className="flex justify-between items-center text-sm">
    <span className="text-gray-500">{label}</span>
    <span className={`font-bold ${accent === 'yellow' ? 'text-[#FFFF00]' : dim ? 'text-gray-600 text-[11px] font-mono' : 'text-white'}`}>
      {value}
    </span>
  </div>
);

const FormField = ({ icon, label, required, children }: {
  icon: React.ReactNode; label: string; required?: boolean; children: React.ReactNode;
}) => (
  <div>
    <label className="text-[11px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
      <span className="text-gray-600">{icon}</span>
      {label} {required && <span className="text-red-400">*</span>}
    </label>
    <div className="bg-[#0A0E14] border border-white/8 rounded-xl px-4 py-3 focus-within:border-[#FFFF00]/40 transition-colors">
      {children}
    </div>
  </div>
);

export default PaymentScreen;
