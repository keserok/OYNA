import React, { useState } from 'react';
import { ArrowLeft, Wallet, Shield, Zap, MapPin, CheckCircle2, Gift, Settings, ChevronRight, Star, Trophy, Sparkles, CreditCard, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Particles } from '../components/Particles';

// --- TİPLER ---
interface WalletScreenProps {
  onBack: () => void;
}

interface Contributor {
  id: number;
  name: string;
  amount: number;
  avatar: string;
  isLeader: boolean;
}

interface Pitch {
  id: number;
  name: string;
  spent: number;
  matches: number;
  image: string;
}

// --- SAHTE VERİLER (MOCK DATA) ---
const INITIAL_TEAM_CONTRIBUTORS: Contributor[] = [
  { id: 2, name: 'Can', amount: 800, avatar: 'https://picsum.photos/seed/can/100/100', isLeader: false },
  { id: 1, name: 'Burak (Sen)', amount: 500, avatar: 'https://picsum.photos/seed/burak/100/100', isLeader: true },
  { id: 3, name: 'Mert', amount: 500, avatar: 'https://picsum.photos/seed/mert/100/100', isLeader: false },
];

const CONQUERED_PITCHES: Pitch[] = [
  { id: 1, name: 'Arena Sport Center', spent: 4500, matches: 12, image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=400&q=80' },
  { id: 2, name: 'Yıldız Tesisleri', spent: 2100, matches: 6, image: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=400&q=80' },
];

const QUICK_AMOUNTS = [100, 250, 500, 1000];
const TEAM_QUICK_AMOUNTS = [50, 100, 250, 500];

const WalletScreen: React.FC<WalletScreenProps> = ({ onBack }) => {
  const [currentView, setCurrentView] = useState<'MAIN' | 'TOP_UP' | 'CARD_SETTINGS' | 'TEAM_TOP_UP'>('MAIN');
  
  const [oynaPara, setOynaPara] = useState(1250);
  const [cashBalance, setCashBalance] = useState(450.00);
  
  // Kartlar State
  const [cards, setCards] = useState([
    { id: 1, last4: '4242', brand: 'Mastercard', color: 'from-orange-600 to-red-600', holder: 'BURAK KAPTAN' },
    { id: 2, last4: '8812', brand: 'Visa', color: 'from-blue-600 to-indigo-700', holder: 'BURAK KAPTAN' },
  ]);
  
  // Yükleme State
  const [selectedCardId, setSelectedCardId] = useState<number | null>(1);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');

  // Animasyon State
  const [paymentState, setPaymentState] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'REWARD'>('IDLE');
  const [rewardAmount, setRewardAmount] = useState(0);

  // Ortak Kasa State
  const [teamContributors, setTeamContributors] = useState(INITIAL_TEAM_CONTRIBUTORS);
  const [currentAmount, setCurrentAmount] = useState(1800);
  const targetAmount = 2500;
  const progress = (currentAmount / targetAmount) * 100;

  const handleTopUpSubmit = () => {
    if (paymentState !== 'IDLE') return;
    const amountToAdd = selectedAmount || parseInt(customAmount) || 0;
    if (amountToAdd <= 0 || !selectedCardId) return;

    setPaymentState('PROCESSING');
    
    // API çağrısı simülasyonu
    setTimeout(() => {
      setPaymentState('SUCCESS');
      setCashBalance(prev => prev + amountToAdd);
      
      // Başarı sonrası ödül tetikleme
      setTimeout(() => {
        const reward = Math.floor(Math.random() * 50) + 10;
        setRewardAmount(reward);
        setPaymentState('REWARD');
        
        // Akışı bitir
        setTimeout(() => {
          setOynaPara(prev => prev + reward);
          setPaymentState('IDLE');
          setCurrentView('MAIN');
          setSelectedAmount(null);
          setCustomAmount('');
        }, 3000);
      }, 2000);
    }, 1500);
  };

  const handleTeamTopUpSubmit = () => {
    if (paymentState !== 'IDLE') return;
    const amountToAdd = selectedAmount || parseInt(customAmount) || 0;
    if (amountToAdd <= 0 || amountToAdd > cashBalance) return;

    setPaymentState('PROCESSING');
    
    // API çağrısı simülasyonu
    setTimeout(() => {
      setPaymentState('SUCCESS');
      setCashBalance(prev => prev - amountToAdd);
      setCurrentAmount(prev => prev + amountToAdd);
      
      setTeamContributors(prev => prev.map(c => 
        c.id === 1 ? { ...c, amount: c.amount + amountToAdd } : c
      ));

      // Başarı sonrası ödül tetikleme
      setTimeout(() => {
        const reward = Math.floor(Math.random() * 30) + 5;
        setRewardAmount(reward);
        setPaymentState('REWARD');
        
        // Akışı bitir
        setTimeout(() => {
          setOynaPara(prev => prev + reward);
          setPaymentState('IDLE');
          setCurrentView('MAIN');
          setSelectedAmount(null);
          setCustomAmount('');
        }, 3000);
      }, 2000);
    }, 1500);
  };

  const handleAddMockCard = () => {
    const newId = Date.now();
    const brands = ['Visa', 'Mastercard', 'Troy'];
    const colors = ['from-purple-600 to-blue-600', 'from-emerald-500 to-teal-700', 'from-pink-500 to-rose-700'];
    const randomBrand = brands[Math.floor(Math.random() * brands.length)];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomLast4 = Math.floor(1000 + Math.random() * 9000).toString();

    setCards([...cards, {
      id: newId,
      last4: randomLast4,
      brand: randomBrand,
      color: randomColor,
      holder: 'BURAK KAPTAN'
    }]);
  };

  const handleRemoveCard = (id: number) => {
    setCards(cards.filter(c => c.id !== id));
    if (selectedCardId === id) {
      setSelectedCardId(cards.find(c => c.id !== id)?.id || null);
    }
  };

  const renderMainView = () => (
    <motion.div 
      key="main"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-32 z-10 space-y-8"
    >
      {/* 1. ANA CÜZDAN KARTI */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative rounded-[32px] p-1 bg-gradient-to-b from-[#FFFF00]/40 via-[#161B22] to-[#0A0E14] shadow-[0_0_40px_rgba(255,255,0,0.15)]"
      >
        <div className="bg-[#0A0E14] rounded-[30px] p-6 relative overflow-hidden h-full">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-gradient-to-b from-[#FFFF00]/10 to-transparent blur-2xl"></div>
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-2">
              <Star size={16} className="text-[#FFFF00] fill-[#FFFF00]" />
              <span className="text-xs font-bold text-[#FFFF00] tracking-widest uppercase">Oyna Para</span>
            </div>
            <h2 className="text-6xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,0,0.5)]">
              {oynaPara.toLocaleString()}
            </h2>
            
            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent my-6"></div>
            
            <div className="flex justify-between w-full items-center px-4">
              <div className="text-left">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Nakit Bakiye</p>
                <p className="text-2xl font-black text-white">{cashBalance.toFixed(2)}₺</p>
              </div>
              <button 
                onClick={() => { setSelectedAmount(null); setCustomAmount(''); setCurrentView('TOP_UP'); }}
                className="bg-[#161B22] border border-white/10 text-white px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-white/5 active:scale-95 transition-all flex items-center gap-2"
              >
                <Zap size={14} className="text-[#39FF14]" /> YÜKLE
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 2. ORTAK KASA */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="relative"
      >
        <div className="flex justify-between items-center mb-4 px-2">
          <h3 className="text-sm font-black text-white flex items-center gap-2 tracking-widest uppercase">
            <Shield size={18} className="text-blue-400" /> Ortak Kasa
          </h3>
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md font-bold border border-blue-500/30">
            KARA KARTALLAR FC
          </span>
        </div>

        <div className="bg-[#161B22] rounded-[24px] border border-white/10 p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full group-hover:bg-blue-500/20 transition-colors"></div>
          
          <div className="flex justify-between items-end mb-4 relative z-10">
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Sıradaki Maç İçin</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white">{currentAmount}₺</span>
                <span className="text-sm font-bold text-gray-500">/ {targetAmount}₺</span>
              </div>
            </div>
            <div className="text-right">
              {targetAmount > currentAmount ? (
                <p className="text-[10px] text-[#FFFF00] font-black uppercase tracking-widest animate-pulse">Eksik: {targetAmount - currentAmount}₺</p>
              ) : (
                <p className="text-[10px] text-[#39FF14] font-black uppercase tracking-widest">HEDEF TAMAMLANDI</p>
              )}
            </div>
          </div>

          <div className="h-3 bg-[#0A0E14] rounded-full overflow-hidden mb-6 relative border border-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:20px_20px] animate-[shimmer_1s_linear_infinite]"></div>
            </motion.div>
          </div>

          <div className="space-y-3 relative z-10">
            {teamContributors.map((user) => (
              <div key={user.id} className="flex items-center justify-between bg-[#0A0E14] p-2.5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img src={user.avatar} className="w-8 h-8 rounded-full object-cover" />
                    {user.isLeader && <div className="absolute -top-1 -right-1 bg-[#FFFF00] text-black rounded-full p-0.5"><Trophy size={8} /></div>}
                  </div>
                  <span className="text-xs font-bold text-white">{user.name}</span>
                </div>
                <span className="text-xs font-black text-blue-400">+{user.amount}₺</span>
              </div>
            ))}
          </div>
          
          <button 
            onClick={() => { setSelectedAmount(null); setCustomAmount(''); setCurrentView('TEAM_TOP_UP'); }}
            className="w-full mt-4 bg-blue-600/20 text-blue-400 border border-blue-500/30 py-3 rounded-xl font-black text-xs tracking-widest uppercase hover:bg-blue-600/30 transition-colors flex items-center justify-center gap-2"
          >
            <Zap size={14} /> Kasaya Ekle
          </button>
        </div>
      </motion.div>

      {/* 3. HARCAMA HARİTASI */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex justify-between items-center mb-4 px-2">
          <h3 className="text-sm font-black text-white flex items-center gap-2 tracking-widest uppercase">
            <MapPin size={18} className="text-red-500" /> En Çok Tercih Edilenler
          </h3>
          <button className="text-[10px] text-gray-400 font-bold flex items-center gap-1 hover:text-white transition-colors">
            Tümünü Gör <ChevronRight size={12} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {CONQUERED_PITCHES.map(pitch => (
            <div key={pitch.id} className="bg-[#161B22] rounded-2xl overflow-hidden border border-white/5 group relative">
              <div className="h-24 relative overflow-hidden">
                <img src={pitch.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] to-transparent"></div>
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md border border-white/10 flex items-center gap-1">
                  <Trophy size={10} className="text-[#FFFF00]" />
                  <span className="text-[10px] font-black text-white">{pitch.matches} Maç</span>
                </div>
              </div>
              <div className="p-3">
                <p className="text-xs font-bold text-white truncate">{pitch.name}</p>
                <p className="text-[10px] text-gray-500 mt-1">Toplam Harcama</p>
                <p className="text-sm font-black text-[#FFFF00]">{pitch.spent}₺</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );

  const renderTopUpView = () => (
    <motion.div 
      key="topup"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col p-6 z-10 overflow-y-auto custom-scrollbar pb-32"
    >
      <div className="mb-8">
        <h2 className="text-2xl font-black text-white tracking-tighter italic mb-2">BAKİYE YÜKLE</h2>
        <p className="text-sm text-gray-400 font-medium">Cüzdanınıza aktarmak istediğiniz tutarı seçin.</p>
      </div>

      {/* Tutar Seçimi */}
      <div className="mb-8">
        <h3 className="text-sm font-bold text-white mb-4 px-1">Yüklenecek Tutar</h3>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {QUICK_AMOUNTS.map(amount => (
            <button
              key={amount}
              onClick={() => { setSelectedAmount(amount); setCustomAmount(''); }}
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
            onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
            placeholder="0.00"
            className="bg-transparent text-white font-bold w-full outline-none"
          />
          <span className="text-white font-black">₺</span>
        </div>
      </div>

      {/* Kart Seçimi */}
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
          {cards.map((card) => (
            <div 
              key={card.id}
              onClick={() => setSelectedCardId(card.id)}
              className={`snap-center shrink-0 w-72 h-44 rounded-2xl bg-gradient-to-br ${card.color} p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 border-2 cursor-pointer ${selectedCardId === card.id ? 'border-white scale-100 shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'border-transparent scale-95 opacity-50'}`}
            >
              <div className="flex justify-between items-start">
                <span className="font-mono text-white/80 text-sm">{card.brand}</span>
                {selectedCardId === card.id && <div className="bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 size={10} /> SEÇİLİ</div>}
              </div>
              <div>
                <p className="text-white font-mono text-lg tracking-widest">•••• •••• •••• {card.last4}</p>
                <p className="text-white/60 text-[10px] font-bold mt-2 uppercase">{card.holder}</p>
              </div>
              <div className="absolute top-6 right-6 w-10 h-8 bg-yellow-400/30 rounded-md border border-yellow-200/40"></div>
            </div>
          ))}
          {cards.length === 0 && (
            <div className="w-full text-center p-6 bg-[#161B22] rounded-2xl border border-white/5 text-gray-500 text-sm">
              Kayıtlı kart bulunamadı. Lütfen kart ekleyin.
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto pt-6 border-t border-white/5">
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
  );

  const renderTeamTopUpView = () => (
    <motion.div 
      key="team_topup"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col p-6 z-10 overflow-y-auto custom-scrollbar pb-32"
    >
      <div className="mb-8">
        <h2 className="text-2xl font-black text-white tracking-tighter italic mb-2">KASAYA EKLE</h2>
        <p className="text-sm text-gray-400 font-medium">Ortak kasaya ne kadar katkıda bulunmak istiyorsunuz?</p>
      </div>

      {/* Tutar Seçimi */}
      <div className="mb-8">
        <h3 className="text-sm font-bold text-white mb-4 px-1">Eklenecek Tutar</h3>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {TEAM_QUICK_AMOUNTS.map(amount => (
            <button
              key={amount}
              onClick={() => { setSelectedAmount(amount); setCustomAmount(''); }}
              className={`py-3 rounded-xl font-black text-sm transition-all border ${
                selectedAmount === amount 
                ? 'bg-blue-500 text-white border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] scale-105' 
                : 'bg-[#161B22] text-gray-400 border-white/5 hover:bg-white/5'
              }`}
            >
              {amount}₺
            </button>
          ))}
        </div>
        <div className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-center gap-2 focus-within:border-blue-500 transition-colors">
          <span className="text-gray-500 font-bold">Diğer:</span>
          <input 
            type="number" 
            value={customAmount}
            onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
            placeholder="0.00"
            className="bg-transparent text-white font-bold w-full outline-none"
          />
          <span className="text-white font-black">₺</span>
        </div>
      </div>

      {/* Ödeme Kaynağı: Nakit Bakiye */}
      <div className="mb-8">
        <h3 className="text-sm font-bold text-white mb-4 px-1">Ödeme Yöntemi</h3>
        <div 
          className={`w-full rounded-2xl bg-gradient-to-br from-[#161B22] to-[#0A0E14] p-6 flex items-center justify-between border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.2)]`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
              <Wallet size={24} />
            </div>
            <div>
              <p className="text-white font-bold">Nakit Bakiye</p>
              <p className="text-gray-400 text-xs mt-1">Mevcut: {cashBalance.toFixed(2)}₺</p>
            </div>
          </div>
          <CheckCircle2 size={24} className="text-blue-500" />
        </div>
      </div>

      <div className="mt-auto pt-6 border-t border-white/5">
        <button 
          onClick={handleTeamTopUpSubmit}
          disabled={(!selectedAmount && !customAmount) || (selectedAmount || parseInt(customAmount) || 0) > cashBalance}
          className={`w-full h-16 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all shadow-lg ${
            (!selectedAmount && !customAmount) || (selectedAmount || parseInt(customAmount) || 0) > cashBalance
            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95 shadow-[0_0_30px_rgba(59,130,246,0.3)]'
          }`}
        >
          <Shield size={20} /> {(selectedAmount || customAmount || 0)}₺ KASAYA EKLE
        </button>
        {((selectedAmount || parseInt(customAmount) || 0) > cashBalance) && (
            <p className="text-red-500 text-xs text-center mt-2 font-bold">Yetersiz bakiye. Lütfen önce cüzdanınıza para yükleyin.</p>
        )}
      </div>
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
      <div className="mb-8">
        <h2 className="text-2xl font-black text-white tracking-tighter italic mb-2">KARTLARIM</h2>
        <p className="text-sm text-gray-400 font-medium">Kayıtlı ödeme yöntemlerinizi yönetin.</p>
      </div>

      <div className="space-y-4 flex-1">
        {cards.map(card => (
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
        {cards.length === 0 && (
          <div className="text-center py-10 text-gray-500 text-sm">
            Kayıtlı kartınız bulunmuyor.
          </div>
        )}
      </div>

      <div className="mt-auto pt-6 border-t border-white/5">
        <button 
          onClick={handleAddMockCard}
          className="w-full h-16 bg-[#161B22] border border-white/10 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-white/5 active:scale-95 transition-all"
        >
          <Plus size={20} /> YENİ KART EKLE
        </button>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans relative overflow-hidden">
      
      {/* Arka Plan Efektleri */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[30%] bg-[#FFFF00]/10 blur-[120px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[30%] bg-[#39FF14]/10 blur-[120px] rounded-full mix-blend-screen"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
      </div>

      {/* Üst Kısım (Header) */}
      <header className="px-6 py-6 flex justify-between items-center sticky top-0 z-20 bg-[#0A0E14]/80 backdrop-blur-xl border-b border-white/5">
          <button 
            onClick={() => currentView === 'MAIN' ? onBack() : setCurrentView('MAIN')} 
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
        {currentView === 'TOP_UP' && renderTopUpView()}
        {currentView === 'TEAM_TOP_UP' && renderTeamTopUpView()}
        {currentView === 'CARD_SETTINGS' && renderCardSettingsView()}
      </AnimatePresence>

      {/* --- MİKRO ETKİLEŞİMLER VE ANİMASYONLAR --- */}
      <AnimatePresence>
        {paymentState !== 'IDLE' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0A0E14]/95 backdrop-blur-xl flex items-center justify-center p-6"
          >
            
            {/* 1. İŞLENİYOR */}
            {paymentState === 'PROCESSING' && (
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="flex flex-col items-center"
              >
                <div className="w-24 h-24 rounded-full border-4 border-white/10 border-t-[#FFFF00] animate-spin mb-6"></div>
                <h2 className="text-xl font-black text-white tracking-widest uppercase animate-pulse">İşlem Onaylanıyor</h2>
              </motion.div>
            )}

            {/* 2. BAŞARILI */}
            {paymentState === 'SUCCESS' && (
              <motion.div 
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                className="flex flex-col items-center relative"
              >
                <Particles count={50} colors={['#39FF14', '#FFFFFF', '#FFFF00']} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#39FF14]/20 blur-[100px] rounded-full"></div>
                
                <div className="w-32 h-32 bg-[#39FF14] rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(57,255,20,0.5)] mb-8 relative z-10">
                  <CheckCircle2 size={64} className="text-black" />
                </div>
                <h2 className="text-4xl font-black text-white tracking-tighter italic drop-shadow-lg relative z-10">ÖDEME BAŞARILI!</h2>
                <p className="text-sm text-[#39FF14] font-bold tracking-widest uppercase mt-2 relative z-10">Bakiye Güncellendi!</p>
              </motion.div>
            )}

            {/* 3. ÖDÜL (Sürpriz Kutu) */}
            {paymentState === 'REWARD' && (
              <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="flex flex-col items-center text-center w-full max-w-sm bg-[#161B22] p-8 rounded-[40px] border border-[#FFFF00]/30 shadow-[0_0_80px_rgba(255,255,0,0.2)] relative overflow-hidden"
              >
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,255,0,0.1)_30deg,transparent_60deg)]"
                ></motion.div>

                <div className="relative z-10">
                  <motion.div 
                    animate={{ y: [0, -20, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="mb-6 inline-block"
                  >
                    <div className="w-24 h-24 bg-gradient-to-br from-[#FFFF00] to-orange-500 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(255,255,0,0.6)] border-2 border-white/50">
                      <Gift size={48} className="text-black" />
                    </div>
                  </motion.div>
                  
                  <h3 className="text-sm font-bold text-gray-400 tracking-widest uppercase mb-2">Sürpriz Kutu Açıldı!</h3>
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Star size={24} className="text-[#FFFF00] fill-[#FFFF00]" />
                    <span className="text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,0,0.5)]">+{rewardAmount}</span>
                  </div>
                  <p className="text-xs font-bold text-[#FFFF00] tracking-widest uppercase bg-[#FFFF00]/10 px-4 py-2 rounded-full inline-block border border-[#FFFF00]/20">Oyna Para Kazandın</p>
                </div>
                
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                    animate={{ 
                      opacity: [0, 1, 0], 
                      scale: [0, 1.5, 0],
                      x: (Math.random() - 0.5) * 200,
                      y: (Math.random() - 0.5) * 200
                    }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: Math.random() }}
                    className="absolute z-20 text-[#FFFF00]"
                  >
                    <Sparkles size={20} />
                  </motion.div>
                ))}
              </motion.div>
            )}

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default WalletScreen;
