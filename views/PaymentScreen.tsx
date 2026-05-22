
import React, { useState, useEffect } from 'react';
import { ArrowLeft, CreditCard, Users, User, Share2, Ticket, CheckCircle2, ShieldCheck, AlertCircle, PieChart, Lock, ChevronRight, Copy, TicketPercent, ToggleLeft, ToggleRight, Crown, X } from 'lucide-react';

interface PaymentScreenProps {
  onBack: () => void;
  extraFee?: number; // Equipment fee
  hasMotmCoupon?: boolean; // New Prop
  onUpgradeRequest?: () => void;
  onViewTicket: () => void; // New Callback
}

type PaymentStep = 'DEPOSIT' | 'POOL' | 'SUCCESS';

const PaymentScreen: React.FC<PaymentScreenProps> = ({ onBack, extraFee = 0, hasMotmCoupon = false, onUpgradeRequest, onViewTicket }) => {
  const [step, setStep] = useState<PaymentStep>('DEPOSIT');
  const [captainGuarantee, setCaptainGuarantee] = useState(false);
  const [payMode, setPayMode] = useState<'MY_SHARE' | 'MULTI' | 'ALL'>('MY_SHARE');
  const [multiCount, setMultiCount] = useState(1);
  const [applyDiscount, setApplyDiscount] = useState(false);

  // FINANCIAL CONSTANTS
  const PITCH_PRICE = 2800;
  const DEPOSIT_AMOUNT = 1000;
  const COMMISSION_RATE = 0.10; 
  const PRO_COMMISSION_RATE = 0.05; 
  
  const TOTAL_AMOUNT_RAW = PITCH_PRICE + extraFee;
  const DISCOUNT_RATE = 0.05; 
  const discountAmount = applyDiscount ? TOTAL_AMOUNT_RAW * DISCOUNT_RATE : 0;
  const standardCommission = Math.floor(TOTAL_AMOUNT_RAW * COMMISSION_RATE);
  const proCommission = Math.floor(TOTAL_AMOUNT_RAW * PRO_COMMISSION_RATE);
  const TOTAL_AMOUNT = Math.floor(TOTAL_AMOUNT_RAW - discountAmount + standardCommission);
  const PLAYER_COUNT = 14;
  const SHARE_PRICE = Math.ceil(TOTAL_AMOUNT / PLAYER_COUNT);

  // Pool State
  const [paidAmount, setPaidAmount] = useState(DEPOSIT_AMOUNT);
  const [paidPlayers, setPaidPlayers] = useState<number>(3); // 3 people paid already
  
  const remainingDebt = TOTAL_AMOUNT - paidAmount;
  const progressPercent = Math.min(100, (paidAmount / TOTAL_AMOUNT) * 100);

  const handleDepositPay = () => {
    if (captainGuarantee) {
      setStep('POOL');
    }
  };

  const handlePoolPay = () => {
    let playersToAdd = 1;
    if (payMode === 'MULTI') playersToAdd = multiCount;
    if (payMode === 'ALL') playersToAdd = PLAYER_COUNT - paidPlayers;

    let amountToPay = 0;
    if (payMode === 'MY_SHARE') amountToPay = SHARE_PRICE;
    if (payMode === 'MULTI') amountToPay = SHARE_PRICE * multiCount;
    if (payMode === 'ALL') amountToPay = remainingDebt;

    setPaidAmount(prev => prev + amountToPay);
    setPaidPlayers(prev => Math.min(PLAYER_COUNT, prev + playersToAdd));
    setStep('SUCCESS');
  };

  // --- SUB-VIEWS ---

  const DepositView = () => (
    <div className="space-y-6 animate-in slide-in-from-bottom-10 duration-500">
        {/* Breakdown Card */}
        <div className="bg-[#161B22]/80 backdrop-blur-md p-6 rounded-[32px] border border-white/5">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4">Ödeme Özeti</h3>
            <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                    <span className="text-white">Saha Kirası (1 Saat)</span>
                    <span className="font-bold text-white">{PITCH_PRICE}₺</span>
                </div>
                {extraFee > 0 && (
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-white">Ekipman & Hizmetler</span>
                        <span className="font-bold text-white">+{extraFee}₺</span>
                    </div>
                )}
                
                <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">Hizmet Bedeli (%10)</span>
                    <span className="font-bold text-gray-400">+{standardCommission}₺</span>
                </div>

                {/* Pro Savings Hint */}
                <button onClick={onUpgradeRequest} className="w-full bg-gradient-to-r from-yellow-900/40 to-transparent border border-[#FFFF00]/30 p-2 rounded-xl flex justify-between items-center group">
                    <div className="flex items-center gap-2">
                        <Crown size={14} className="text-[#FFFF00]" />
                        <span className="text-xs text-[#FFFF00] font-bold">PRO ile {standardCommission - proCommission}₺ Tasarruf Et</span>
                    </div>
                    <ChevronRight size={14} className="text-[#FFFF00] group-hover:translate-x-1 transition-transform" />
                </button>
                
                {applyDiscount && (
                    <div className="flex justify-between items-center text-sm text-[#FFFF00]">
                        <span>Özel İndirim</span>
                        <span className="font-bold">-{Math.floor(discountAmount)}₺</span>
                    </div>
                )}

                <div className="h-px bg-white/10 my-2"></div>
                <div className="flex justify-between items-center text-lg">
                    <span className="font-black text-white">TOPLAM</span>
                    <span className="font-black text-[#FFFF00]">{TOTAL_AMOUNT}₺</span>
                </div>
            </div>
        </div>

        {/* Deposit Highlight */}
        <div className="bg-gradient-to-r from-yellow-900/20 to-[#161B22] p-6 rounded-[32px] border border-yellow-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Lock size={64} /></div>
            <p className="text-yellow-500 text-xs font-bold uppercase mb-1">Başlangıç Kaporası</p>
            <h2 className="text-4xl font-black text-white">{DEPOSIT_AMOUNT}₺</h2>
            <p className="text-xs text-gray-400 mt-2">
                Kalan {TOTAL_AMOUNT - DEPOSIT_AMOUNT}₺ havuz sistemine aktarılacak.
            </p>
        </div>

        {/* Safety Net Agreement */}
        <div className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex gap-4 items-start">
            <div className="pt-1">
                <input 
                    type="checkbox" 
                    checked={captainGuarantee}
                    onChange={(e) => setCaptainGuarantee(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-600 text-[#FFFF00] focus:ring-[#FFFF00] bg-gray-800 accent-[#FFFF00]"
                />
            </div>
            <div>
                <h4 className="font-bold text-white text-sm">Kaptan Garantisi (Safety Net)</h4>
                <p className="text-[10px] text-gray-400 leading-relaxed mt-1">
                    Maç saatine 2 saat kala (T-2) havuzda eksik bakiye kalırsa, kalan tutarın kayıtlı kartımdan çekilmesini onaylıyorum.
                </p>
            </div>
        </div>

        {/* Sticky Action */}
        <button 
            disabled={!captainGuarantee}
            onClick={handleDepositPay}
            className="w-full py-4 bg-[#FFFF00] disabled:bg-gray-800 disabled:text-gray-500 text-black font-black text-lg rounded-2xl shadow-[0_0_30px_rgba(255,255,0,0.2)] hover:bg-yellow-300 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
            KAPORAYI ÖDE & REZERVE ET
        </button>
    </div>
  );

  const PoolView = () => (
    <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
        
        {/* Pool Status Header */}
        <div className="bg-[#161B22]/80 backdrop-blur-xl border border-white/10 p-6 rounded-[32px] sticky top-0 z-10 shadow-2xl">
            <div className="flex justify-between items-end mb-4">
                <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Havuz Durumu</p>
                    <p className="text-2xl font-black text-white">{paidAmount}₺ <span className="text-sm text-gray-500 font-medium">/ {TOTAL_AMOUNT}₺</span></p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-red-400 font-bold uppercase">Kalan</p>
                    <p className="text-xl font-bold text-white">{remainingDebt}₺</p>
                </div>
            </div>
            
            {/* AVATAR SPLIT PROGRESS */}
            <div className="flex justify-between gap-1 mb-2">
                {Array.from({ length: PLAYER_COUNT }).map((_, i) => {
                    const isPaid = i < paidPlayers;
                    return (
                        <div key={i} className="relative flex-1 aspect-square flex items-center justify-center">
                            {isPaid ? (
                                <div className="w-full h-full bg-green-500 rounded-full flex items-center justify-center border border-black animate-in zoom-in duration-300">
                                    <CheckCircle2 size={10} className="text-black" />
                                </div>
                            ) : (
                                <div className="w-full h-full rounded-full border border-white/10 bg-white/5"></div>
                            )}
                        </div>
                    );
                })}
            </div>
            <p className="text-[10px] text-gray-500 text-center mt-2">{paidPlayers}/{PLAYER_COUNT} Oyuncu Ödedi</p>
        </div>

        {/* Payment Options */}
        <section className="bg-[#161B22] border border-white/5 rounded-[32px] p-6">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <CreditCard size={18} className="text-[#FFFF00]" /> Ödeme Yöntemi Seç
            </h3>

            {/* Mode Toggle */}
            <div className="flex bg-[#0A0E14] p-1 rounded-xl mb-6">
                <button 
                    onClick={() => setPayMode('MY_SHARE')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${payMode === 'MY_SHARE' ? 'bg-[#161B22] text-white shadow-lg border border-white/10' : 'text-gray-500'}`}
                >
                    Payım
                </button>
                <button 
                    onClick={() => setPayMode('MULTI')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${payMode === 'MULTI' ? 'bg-[#161B22] text-white shadow-lg border border-white/10' : 'text-gray-500'}`}
                >
                    Çoklu
                </button>
                <button 
                    onClick={() => setPayMode('ALL')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${payMode === 'ALL' ? 'bg-[#161B22] text-white shadow-lg border border-white/10' : 'text-gray-500'}`}
                >
                    Tümü
                </button>
            </div>

            {/* Dynamic Content */}
            <div className="bg-[#0A0E14] rounded-2xl p-6 border border-white/5 mb-6 text-center">
                {payMode === 'MY_SHARE' && (
                    <div className="animate-in fade-in zoom-in duration-300">
                        <p className="text-gray-400 text-xs font-bold uppercase">Kişi Başı Düşen Pay</p>
                        <p className="text-4xl font-black text-white mt-1">{SHARE_PRICE}₺</p>
                        <p className="text-[10px] text-gray-600 mt-2">14 Oyuncu Üzerinden</p>
                    </div>
                )}

                {payMode === 'MULTI' && (
                    <div className="animate-in fade-in zoom-in duration-300">
                        <p className="text-gray-400 text-xs font-bold uppercase mb-3">Kaç Kişi İçin Ödeyeceksin?</p>
                        <div className="flex items-center justify-center gap-4 mb-4">
                            <button onClick={() => setMultiCount(Math.max(1, multiCount - 1))} className="w-10 h-10 rounded-full bg-[#161B22] text-white font-black hover:bg-gray-700">-</button>
                            <span className="text-3xl font-black text-white w-8">{multiCount}</span>
                            <button onClick={() => setMultiCount(multiCount + 1)} className="w-10 h-10 rounded-full bg-[#161B22] text-white font-black hover:bg-gray-700">+</button>
                        </div>
                        <p className="text-2xl font-black text-[#FFFF00]">{SHARE_PRICE * multiCount}₺</p>
                    </div>
                )}

                {payMode === 'ALL' && (
                    <div className="animate-in fade-in zoom-in duration-300">
                        <p className="text-gray-400 text-xs font-bold uppercase">Kalan Tüm Borç</p>
                        <p className="text-4xl font-black text-red-400 mt-1">{remainingDebt}₺</p>
                        <p className="text-[10px] text-gray-600 mt-2">Havuzu anında kapatır.</p>
                    </div>
                )}
            </div>

            <button 
                onClick={handlePoolPay}
                className="w-full py-4 bg-[#1B4332] text-white border border-green-500/30 font-black text-lg rounded-2xl shadow-lg hover:bg-green-900 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
                ÖDEMEYİ TAMAMLA
            </button>
        </section>

        {/* Share Link */}
        <button className="w-full py-3 bg-[#161B22] border border-white/10 rounded-2xl text-gray-400 font-bold text-xs flex items-center justify-center gap-2 hover:text-white transition-colors">
            <Share2 size={16} /> ÖDEME LİNKİNİ PAYLAŞ
        </button>
    </div>
  );

  const SuccessView = () => (
      <div className="flex flex-col items-center justify-center h-full animate-in fade-in zoom-in duration-500 py-10">
        <div className="bg-green-500 w-24 h-24 rounded-full flex items-center justify-center mb-8 shadow-[0_0_50px_rgba(34,197,94,0.4)] animate-bounce-slow">
           <CheckCircle2 size={48} className="text-white" />
        </div>
        <h2 className="text-3xl font-black mb-2 text-white">HARİKA!</h2>
        <p className="text-gray-400 text-center mb-12">Ödemen havuza eklendi. Maç keyfi seni bekliyor.</p>
        
        <button 
          onClick={onViewTicket}
          className="w-full max-w-sm py-4 bg-[#FFFF00] text-black rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-transform hover:scale-105 shadow-lg shadow-yellow-900/20"
        >
          <Ticket size={20} /> MAÇ KARTINI GÖRÜNTÜLE
        </button>

        <button 
          onClick={onBack}
          className="mt-4 text-gray-500 font-bold text-sm hover:text-white"
        >
          ANA SAYFAYA DÖN
        </button>
      </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
      
      {/* Smart Header */}
      <header className="p-6 flex items-center gap-4 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20 border-b border-white/5">
        {step === 'SUCCESS' ? (
             <button onClick={onBack} className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-gray-400 hover:text-white transition-all">
                 <X size={20} />
             </button>
        ) : (
             <button 
                onClick={onBack} 
                className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all"
            >
                <ArrowLeft size={20} />
            </button>
        )}
        
        <div>
            <h1 className="text-xl font-black text-white">
                {step === 'DEPOSIT' ? 'KAPORA & ONAY' : step === 'POOL' ? 'MAÇ HAVUZU' : 'BİLETİNİZ'}
            </h1>
            {step === 'DEPOSIT' && <p className="text-[10px] text-gray-400 font-bold">1. Aşama</p>}
            {step === 'POOL' && <p className="text-[10px] text-[#FFFF00] font-bold">2. Aşama (Bölüşüm)</p>}
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto custom-scrollbar">
          {step === 'DEPOSIT' && <DepositView />}
          {step === 'POOL' && <PoolView />}
          {step === 'SUCCESS' && <SuccessView />}
      </main>
    </div>
  );
};

export default PaymentScreen;
