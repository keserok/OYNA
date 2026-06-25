import React, { useState, useEffect } from 'react';
import { ArrowLeft, Wallet, Zap, CheckCircle2, Settings, CreditCard, Plus, Trash2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Particles } from '../components/Particles';
import { useAppStore } from '../store';

interface WalletScreenProps {
  onBack: () => void;
}

const QUICK_AMOUNTS = [100, 250, 500, 1000];

const WalletScreen: React.FC<WalletScreenProps> = ({ onBack }) => {
  const {
    savedCards,
    addSavedCard,
    removeSavedCard,
    walletInitialTab,
    walletPendingDeposit,
    setWalletInitialTab,
    setWalletPendingDeposit,
  } = useAppStore();

  const [currentView, setCurrentView] = useState<'MAIN' | 'CARD_SETTINGS'>(walletInitialTab);
  const [cashBalance, setCashBalance] = useState(450.0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(savedCards[0]?.id ?? null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [paymentState, setPaymentState] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS'>('IDLE');

  useEffect(() => {
    setCurrentView(walletInitialTab);
  }, [walletInitialTab]);

  useEffect(() => {
    if (savedCards.length > 0 && !savedCards.find((c) => c.id === selectedCardId)) {
      setSelectedCardId(savedCards[0].id);
    }
    if (savedCards.length === 0) setSelectedCardId(null);
  }, [savedCards, selectedCardId]);

  const handleTopUpSubmit = () => {
    if (paymentState !== 'IDLE') return;
    const amountToAdd = selectedAmount || parseInt(customAmount) || 0;
    if (amountToAdd <= 0 || !selectedCardId) return;

    setPaymentState('PROCESSING');
    setTimeout(() => {
      setPaymentState('SUCCESS');
      setCashBalance((prev) => prev + amountToAdd);
      setTimeout(() => {
        setPaymentState('IDLE');
        setCurrentView('MAIN');
        setSelectedAmount(null);
        setCustomAmount('');
      }, 2000);
    }, 1500);
  };

  const handleAddCard = () => {
    const brands = ['Visa', 'Mastercard', 'Troy'] as const;
    const colors = [
      'from-purple-600 to-blue-600',
      'from-emerald-500 to-teal-700',
      'from-orange-600 to-red-600',
      'from-pink-500 to-rose-700',
    ];
    const brand = brands[Math.floor(Math.random() * brands.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const last4 = Math.floor(1000 + Math.random() * 9000).toString();

    addSavedCard({
      last4,
      brand,
      color,
      holder: 'OYNA KULLANICI',
    });

    if (walletPendingDeposit) {
      setWalletInitialTab('MAIN');
      onBack();
    }
  };

  const handleRemoveCard = (id: string) => {
    removeSavedCard(id);
  };

  const handleBack = () => {
    if (currentView !== 'MAIN') {
      setCurrentView('MAIN');
      setWalletInitialTab('MAIN');
      return;
    }
    setWalletPendingDeposit(false);
    setWalletInitialTab('MAIN');
    onBack();
  };

  const renderMainView = () => (
    <motion.div
      key="main"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-32 z-10 space-y-8"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative rounded-[32px] p-1 bg-gradient-to-b from-[#FFFF00]/40 via-[#161B22] to-[#0A0E14] shadow-[0_0_40px_rgba(255,255,0,0.15)]"
      >
        <div className="bg-[#0A0E14] rounded-[30px] p-6 relative overflow-hidden h-full">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-gradient-to-b from-[#FFFF00]/10 to-transparent blur-2xl" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-2">
              <Wallet size={16} className="text-[#39FF14]" />
              <span className="text-xs font-bold text-[#39FF14] tracking-widest uppercase">Nakit Bakiye</span>
            </div>
            <h2 className="text-6xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(57,255,20,0.5)]">
              {cashBalance.toFixed(2)}₺
            </h2>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
        <div className="mb-6">
          <h2 className="text-xl font-black text-white tracking-tighter italic mb-1">BAKİYE YÜKLE</h2>
          <p className="text-xs text-gray-400 font-medium">Cüzdanınıza aktarmak istediğiniz tutarı seçin.</p>
        </div>

        <div className="mb-8">
          <h3 className="text-sm font-bold text-white mb-4 px-1">Yüklenecek Tutar</h3>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {QUICK_AMOUNTS.map((amount) => (
              <button
                key={amount}
                onClick={() => {
                  setSelectedAmount(amount);
                  setCustomAmount('');
                }}
                className={`py-3 rounded-xl font-black text-sm transition-all border ${
                  selectedAmount === amount
                    ? 'bg-[#FFFF00] text-black border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.3)] scale-105'
                    : 'bg-[#161B22] text-gray-400 border-white/5 hover:bg-white/5'
                }`}
              >
                {amount}₺
              </button>
            ))}
          </div>
          <div className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-center gap-2 focus-within:border-[#FFFF00] transition-colors">
            <span className="text-gray-500 font-bold">Diğer:</span>
            <input
              type="number"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedAmount(null);
              }}
              placeholder="0.00"
              className="bg-transparent text-white font-bold w-full outline-none"
            />
            <span className="text-white font-black">₺</span>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4 px-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CreditCard size={16} className="text-[#FFFF00]" /> Ödeme Yöntemi
            </h3>
            <button
              onClick={() => setCurrentView('CARD_SETTINGS')}
              className="text-[10px] text-blue-400 font-bold flex items-center gap-1 bg-blue-900/20 px-2 py-1 rounded-lg hover:bg-blue-900/40 transition-colors"
            >
              <Settings size={12} /> Kartları Yönet
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x snap-mandatory">
            {savedCards.map((card) => (
              <div
                key={card.id}
                onClick={() => setSelectedCardId(card.id)}
                className={`snap-center shrink-0 w-72 h-44 rounded-2xl bg-gradient-to-br ${card.color} p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 border-2 cursor-pointer ${selectedCardId === card.id ? 'border-white scale-100 shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'border-transparent scale-95 opacity-50'}`}
              >
                <div className="flex justify-between items-start">
                  <span className="font-mono text-white/80 text-sm">{card.brand}</span>
                  {selectedCardId === card.id && (
                    <div className="bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={10} /> SEÇİLİ
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-white font-mono text-lg tracking-widest">•••• •••• •••• {card.last4}</p>
                  <p className="text-white/60 text-[10px] font-bold mt-2 uppercase">{card.holder}</p>
                </div>
                <div className="absolute top-6 right-6 w-10 h-8 bg-yellow-400/30 rounded-md border border-yellow-200/40" />
              </div>
            ))}
            {savedCards.length === 0 && (
              <button
                onClick={() => setCurrentView('CARD_SETTINGS')}
                className="w-72 shrink-0 text-center p-8 bg-[#161B22] rounded-2xl border border-dashed border-[#FFFF00]/40 text-[#FFFF00] text-sm font-bold hover:bg-[#FFFF00]/5 transition-colors"
              >
                <Plus size={24} className="mx-auto mb-2" />
                Kapora ödemek için kart ekleyin
              </button>
            )}
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={handleTopUpSubmit}
            disabled={(!selectedAmount && !customAmount) || !selectedCardId}
            className={`w-full h-16 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all shadow-lg ${
              (!selectedAmount && !customAmount) || !selectedCardId
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-[#FFFF00] text-black hover:bg-yellow-300 active:scale-95 shadow-[0_0_30px_rgba(255,255,0,0.3)]'
            }`}
          >
            <Zap size={20} /> {(selectedAmount || customAmount || 0)}₺ YÜKLE
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  const renderCardSettingsView = () => (
    <motion.div
      key="settings"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col p-6 z-10 overflow-y-auto custom-scrollbar pb-32"
    >
      {walletPendingDeposit && (
        <div className="mb-6 p-4 rounded-2xl bg-[#FFFF00]/10 border border-[#FFFF00]/30 flex gap-3 items-start">
          <AlertCircle size={20} className="text-[#FFFF00] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black text-white">Kapora için kart gerekli</p>
            <p className="text-xs text-gray-400 mt-1">
              Saha rezervasyonunuzu tamamlamak için bir ödeme kartı ekleyin. Kart ekledikten sonra otomatik olarak sahaya döneceksiniz.
            </p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-black text-white tracking-tighter italic mb-2">KARTLARIM</h2>
        <p className="text-sm text-gray-400 font-medium">Kayıtlı ödeme yöntemlerinizi yönetin.</p>
      </div>

      <div className="space-y-4 flex-1">
        {savedCards.map((card) => (
          <div key={card.id} className="bg-[#161B22] border border-white/10 rounded-2xl p-4 flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-8 rounded bg-gradient-to-br ${card.color} flex items-center justify-center border border-white/20`}>
                <span className="text-[8px] font-black text-white">{card.brand}</span>
              </div>
              <div>
                <p className="text-white font-bold text-sm">•••• {card.last4}</p>
                <p className="text-gray-500 text-[10px] uppercase">{card.holder}</p>
              </div>
            </div>
            <button
              onClick={() => handleRemoveCard(card.id)}
              className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        {savedCards.length === 0 && (
          <div className="text-center py-10 text-gray-500 text-sm">Kayıtlı kartınız bulunmuyor.</div>
        )}
      </div>

      <div className="mt-auto pt-6 border-t border-white/5">
        <button
          onClick={handleAddCard}
          className="w-full h-16 bg-[#FFFF00] text-black rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:brightness-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,0,0.25)]"
        >
          <Plus size={20} /> YENİ KART EKLE
        </button>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[30%] bg-[#FFFF00]/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[30%] bg-[#39FF14]/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <header className="px-6 py-6 flex justify-between items-center sticky top-0 z-20 bg-[#0A0E14]/80 backdrop-blur-xl border-b border-white/5">
        <button
          onClick={handleBack}
          className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-black text-white tracking-widest uppercase flex items-center gap-2">
          <Wallet size={18} className="text-[#FFFF00]" /> OYNA CÜZDAN
        </h1>
        <button
          onClick={() => setCurrentView('CARD_SETTINGS')}
          className={`w-11 h-11 flex items-center justify-center rounded-full border transition-all ${currentView === 'CARD_SETTINGS' ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#161B22] border-white/5 text-white hover:bg-white/10 active:scale-95'}`}
        >
          <Settings size={20} />
        </button>
      </header>

      <AnimatePresence mode="wait">
        {currentView === 'MAIN' && renderMainView()}
        {currentView === 'CARD_SETTINGS' && renderCardSettingsView()}
      </AnimatePresence>

      <AnimatePresence>
        {paymentState !== 'IDLE' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0A0E14]/95 backdrop-blur-xl flex items-center justify-center p-6"
          >
            {paymentState === 'PROCESSING' && (
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full border-4 border-white/10 border-t-[#FFFF00] animate-spin mb-6" />
                <h2 className="text-xl font-black text-white tracking-widest uppercase animate-pulse">İşlem Onaylanıyor</h2>
              </motion.div>
            )}
            {paymentState === 'SUCCESS' && (
              <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} className="flex flex-col items-center relative">
                <Particles count={50} colors={['#39FF14', '#FFFFFF', '#FFFF00']} />
                <div className="w-32 h-32 bg-[#39FF14] rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(57,255,20,0.5)] mb-8 relative z-10">
                  <CheckCircle2 size={64} className="text-black" />
                </div>
                <h2 className="text-4xl font-black text-white tracking-tighter italic relative z-10">ÖDEME BAŞARILI!</h2>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WalletScreen;
