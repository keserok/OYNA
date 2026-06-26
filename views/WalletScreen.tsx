import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Wallet, Zap, CheckCircle2, Settings, CreditCard,
  Plus, Trash2, AlertCircle, ArrowUpRight, Gift, RefreshCw,
  TrendingUp, Clock, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';

interface WalletScreenProps {
  onBack: () => void;
}

interface WalletSummary {
  earnings_balance: number;
  reserved_balance?: number;
  refund_credit_balance: number;
}

interface WalletTx {
  id: string;
  amount: number;
  type: string;
  balance_type: 'EARNINGS' | 'REFUND_CREDIT';
  status: string;
  description: string | null;
  created_at: string;
}

interface PayoutRequest {
  id: string;
  amount: number;
  iban: string;
  iban_holder_name: string;
  status: string;
  created_at: string;
}

type Tab = 'EARNINGS' | 'REFUND' | 'PAYOUT';
type CardView = 'MAIN' | 'PAYOUT_FORM' | 'ADD_CARD';

const INCOME_TYPES = new Set(['DEPOSIT', 'MATCH_EARNING', 'REFERRAL_BONUS']);

const WalletScreen: React.FC<WalletScreenProps> = ({ onBack }) => {
  const { savedCards, addSavedCard, removeSavedCard, walletInitialTab } = useAppStore();

  const [tab, setTab]               = useState<Tab>('EARNINGS');
  const [cardView, setCardView]     = useState<CardView>('MAIN');
  const [summary, setSummary]       = useState<WalletSummary | null>(null);
  const [txList, setTxList]         = useState<WalletTx[]>([]);
  const [payouts, setPayouts]       = useState<PayoutRequest[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Payout form state
  const [payoutAmount, setPayoutAmount]   = useState('');
  const [payoutIban, setPayoutIban]       = useState('');
  const [payoutHolder, setPayoutHolder]   = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError]     = useState('');
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [summaryRes, txRes, payoutRes] = await Promise.all([
        supabase.rpc('get_wallet_summary'),
        supabase
          .from('wallet_transactions')
          .select('id,amount,type,balance_type,status,description,created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('payout_requests')
          .select('id,amount,iban,iban_holder_name,status,created_at')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (summaryRes.data) setSummary(summaryRes.data as WalletSummary);
      if (txRes.data) setTxList(txRes.data as WalletTx[]);
      if (payoutRes.data) setPayouts(payoutRes.data as PayoutRequest[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (walletInitialTab === 'CARD_SETTINGS') setCardView('ADD_CARD');
  }, [walletInitialTab]);

  const handleRequestPayout = async () => {
    setPayoutError('');
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) { setPayoutError('Geçerli bir tutar girin.'); return; }
    if (!payoutIban.trim() || payoutIban.length < 10) { setPayoutError('Geçerli bir IBAN girin.'); return; }
    if (!payoutHolder.trim()) { setPayoutError('IBAN sahibi adı zorunludur.'); return; }

    setPayoutLoading(true);
    const { error } = await supabase.rpc('request_payout', {
      p_amount:           amount,
      p_iban:             payoutIban.replace(/\s/g, ''),
      p_iban_holder_name: payoutHolder,
      p_payout_type:      'MANUAL',
    });
    setPayoutLoading(false);

    if (error) {
      setPayoutError(error.message.replace(/^[A-Z_]+: /, ''));
    } else {
      setPayoutSuccess(true);
      fetchData();
      setTimeout(() => { setPayoutSuccess(false); setCardView('MAIN'); }, 2000);
    }
  };

  const handleAddCard = () => {
    const brands = ['Visa', 'Mastercard', 'Troy'] as const;
    const colors = ['from-purple-600 to-blue-600', 'from-emerald-500 to-teal-700', 'from-orange-600 to-red-600'];
    addSavedCard({
      last4:  Math.floor(1000 + Math.random() * 9000).toString(),
      brand:  brands[Math.floor(Math.random() * brands.length)],
      color:  colors[Math.floor(Math.random() * colors.length)],
      holder: 'OYNA KULLANICI',
    });
    setCardView('MAIN');
  };

  const earningsBalance = summary?.earnings_balance ?? 0;
  const refundBalance   = summary?.refund_credit_balance ?? 0;

  const earningsTx  = txList.filter(t => t.balance_type === 'EARNINGS');
  const refundTx    = txList.filter(t => t.balance_type === 'REFUND_CREDIT');

  // ─── Sub-views ────────────────────────────────────────────────────────────

  if (cardView === 'PAYOUT_FORM') {
    return (
      <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
        <header className="px-6 py-5 flex items-center gap-4 border-b border-white/5">
          <button onClick={() => { setCardView('MAIN'); setPayoutError(''); }}
            className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-black text-white">ÖDEME TALEBİ</h1>
        </header>
        <div className="flex-1 p-6 space-y-5">
          <div className="bg-[#161B22] border border-white/8 rounded-[28px] p-5">
            <p className="text-gray-400 text-[11px] font-black uppercase tracking-widest mb-4">Kullanılabilir Kazanç</p>
            <p className="text-4xl font-black text-white">{earningsBalance.toFixed(2)}₺</p>
            {(summary?.reserved_balance ?? 0) > 0 && (
              <p className="text-[11px] text-yellow-400 mt-2 flex items-center gap-1">
                <Clock size={11} /> {(summary?.reserved_balance ?? 0).toFixed(2)}₺ bekleyen çekimde rezerve
              </p>
            )}
          </div>

          <div className="space-y-4">
            <InputField label="Talep Tutarı (₺)" required>
              <input value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)}
                type="number" placeholder="0.00"
                className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600" />
            </InputField>
            <InputField label="IBAN" required>
              <input value={payoutIban} onChange={e => setPayoutIban(e.target.value.toUpperCase())}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600 font-mono text-sm" />
            </InputField>
            <InputField label="IBAN Sahibi Adı" required>
              <input value={payoutHolder} onChange={e => setPayoutHolder(e.target.value.toUpperCase())}
                placeholder="AD SOYAD"
                className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600" />
            </InputField>
          </div>

          {payoutError && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-3 flex gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{payoutError}</p>
            </div>
          )}

          {payoutSuccess && (
            <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-3 flex gap-2">
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              <p className="text-green-300 text-sm">Talep oluşturuldu! İşleme alınacak.</p>
            </div>
          )}

          <button disabled={payoutLoading}
            onClick={handleRequestPayout}
            className="w-full py-4 bg-[#39FF14] text-black font-black text-base rounded-2xl active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {payoutLoading ? <RefreshCw size={18} className="animate-spin" /> : <ArrowUpRight size={18} />}
            {payoutLoading ? 'GÖNDERILIYOR...' : 'ÖDEME TALEP ET'}
          </button>
          <p className="text-[11px] text-gray-600 text-center">
            Talepler 1–2 iş günü içinde işleme alınır. İşlem ücreti yoktur.
          </p>
        </div>
      </div>
    );
  }

  if (cardView === 'ADD_CARD') {
    return (
      <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
        <header className="px-6 py-5 flex items-center gap-4 border-b border-white/5">
          <button onClick={() => setCardView('MAIN')}
            className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-black text-white">KARTLARIM</h1>
        </header>
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {savedCards.map(card => (
            <div key={card.id} className="bg-[#161B22] border border-white/8 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-8 rounded bg-gradient-to-br ${card.color} flex items-center justify-center border border-white/20`}>
                  <span className="text-[8px] font-black text-white">{card.brand}</span>
                </div>
                <div>
                  <p className="text-white font-bold text-sm">•••• {card.last4}</p>
                  <p className="text-gray-500 text-[10px] uppercase">{card.holder}</p>
                </div>
              </div>
              <button onClick={() => removeSavedCard(card.id)}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors">
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          {savedCards.length === 0 && (
            <p className="text-center text-gray-600 py-10 text-sm">Kayıtlı kartınız yok.</p>
          )}
        </div>
        <div className="p-6 border-t border-white/5">
          <button onClick={handleAddCard}
            className="w-full h-14 bg-[#FFFF00] text-black font-black rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all">
            <Plus size={20} /> YENİ KART EKLE
          </button>
        </div>
      </div>
    );
  }

  // ─── Main view ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[30%] bg-[#39FF14]/8 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[30%] bg-[#FFFF00]/8 blur-[120px] rounded-full" />
      </div>

      <header className="px-6 py-5 flex justify-between items-center sticky top-0 z-20 bg-[#0A0E14]/80 backdrop-blur-xl border-b border-white/5">
        <button onClick={onBack}
          className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-black text-white tracking-widest uppercase flex items-center gap-2">
          <Wallet size={18} className="text-[#FFFF00]" /> OYNA CÜZDAN
        </h1>
        <button onClick={() => { setRefreshing(true); fetchData(); }}
          className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
          <RefreshCw size={18} className={refreshing ? 'animate-spin text-[#39FF14]' : ''} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar z-10 pb-24">
        {/* Balance Cards */}
        <div className="p-6 grid grid-cols-2 gap-4">
          <BalanceCard
            label="Kazanç"
            sublabel="IBAN'a çekilebilir"
            balance={earningsBalance}
            icon={<TrendingUp size={16} />}
            color="green"
            loading={loading}
            onAction={() => setCardView('PAYOUT_FORM')}
            actionLabel="Çek"
          />
          <BalanceCard
            label="İade Kredisi"
            sublabel="Yalnızca OYNA içi"
            balance={refundBalance}
            icon={<Gift size={16} />}
            color="blue"
            loading={loading}
          />
        </div>

        {/* Tabs */}
        <div className="px-6 mb-4">
          <div className="flex bg-[#161B22] p-1 rounded-2xl border border-white/5 gap-1">
            {([['EARNINGS','Kazanç'],['REFUND','İade Kredisi'],['PAYOUT','Ödemeler']] as [Tab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all ${
                  tab === t ? 'bg-[#0A0E14] text-white border border-white/10 shadow-lg' : 'text-gray-500'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="px-6 space-y-2">
            {tab === 'EARNINGS' && (
              earningsTx.length === 0
                ? <EmptyTx label="Henüz kazanç işleminiz yok." />
                : earningsTx.map(tx => <TxRow key={tx.id} tx={tx} />)
            )}
            {tab === 'REFUND' && (
              refundTx.length === 0
                ? <EmptyTx label="İade krediniz bulunmuyor." />
                : refundTx.map(tx => <TxRow key={tx.id} tx={tx} />)
            )}
            {tab === 'PAYOUT' && (
              payouts.length === 0
                ? <EmptyTx label="Henüz ödeme talebiniz yok." />
                : payouts.map(p => <PayoutRow key={p.id} payout={p} />)
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 z-20 px-6 pb-8 pt-4 bg-gradient-to-t from-[#0A0E14] to-transparent max-w-lg md:max-w-2xl mx-auto">
        <div className="flex gap-3">
          <button onClick={() => setCardView('PAYOUT_FORM')}
            className="flex-1 py-3.5 bg-[#39FF14] text-black font-black rounded-2xl text-sm active:scale-95 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(57,255,20,0.2)]">
            <ArrowUpRight size={16} /> IBAN'A ÇEK
          </button>
          <button onClick={() => setCardView('ADD_CARD')}
            className="w-14 h-14 bg-[#161B22] border border-white/8 rounded-2xl flex items-center justify-center text-gray-400 hover:text-white active:scale-95 transition-all">
            <Settings size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Helper components ────────────────────────────────────────────────────────

const INCOME_TYPES_SET = new Set(['DEPOSIT', 'MATCH_EARNING', 'REFERRAL_BONUS']);

const BalanceCard = ({ label, sublabel, balance, icon, color, loading, onAction, actionLabel }: {
  label: string; sublabel: string; balance: number; icon: React.ReactNode;
  color: 'green' | 'blue'; loading: boolean; onAction?: () => void; actionLabel?: string;
}) => {
  const colorMap = {
    green: { bg: 'from-green-900/30 to-[#161B22]', border: 'border-green-500/20', text: 'text-[#39FF14]', glow: 'shadow-[0_0_20px_rgba(57,255,20,0.1)]' },
    blue:  { bg: 'from-blue-900/30 to-[#161B22]',  border: 'border-blue-500/20',  text: 'text-blue-400',  glow: '' },
  };
  const c = colorMap[color];
  return (
    <div className={`bg-gradient-to-br ${c.bg} border ${c.border} rounded-[24px] p-4 ${c.glow} flex flex-col gap-2`}>
      <div className={`flex items-center gap-1.5 ${c.text}`}>
        {icon}
        <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 bg-white/5 rounded-lg animate-pulse" />
      ) : (
        <p className="text-2xl font-black text-white leading-none">{balance.toFixed(2)}₺</p>
      )}
      <p className="text-[10px] text-gray-600">{sublabel}</p>
      {onAction && (
        <button onClick={onAction}
          className={`mt-1 text-[10px] font-black uppercase ${c.text} flex items-center gap-1 hover:opacity-80 transition-opacity`}>
          {actionLabel} <ArrowUpRight size={10} />
        </button>
      )}
    </div>
  );
};

const TxRow = ({ tx }: { tx: WalletTx }) => {
  const isIncome = INCOME_TYPES_SET.has(tx.type);
  const isPending = tx.status === 'PENDING';
  const date = new Date(tx.created_at);
  const dateStr = `${date.getDate().toString().padStart(2,'0')}.${(date.getMonth()+1).toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;

  return (
    <div className="bg-[#161B22] border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isIncome ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          {isIncome ? <Zap size={16} className="text-[#39FF14]" /> : <ArrowUpRight size={16} className="text-red-400" />}
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">{tx.description ?? tx.type}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-gray-600 text-[10px]">{dateStr}</p>
            {isPending && (
              <span className="text-[9px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                <Clock size={8} /> Beklemede
              </span>
            )}
          </div>
        </div>
      </div>
      <p className={`font-black text-base shrink-0 ${isIncome ? 'text-[#39FF14]' : 'text-red-400'}`}>
        {isIncome ? '+' : '-'}{Math.abs(tx.amount).toFixed(2)}₺
      </p>
    </div>
  );
};

const PayoutRow = ({ payout }: { payout: PayoutRequest }) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    PENDING:    { label: 'Beklemede', color: 'text-yellow-400 bg-yellow-400/10' },
    PROCESSING: { label: 'İşleniyor', color: 'text-blue-400 bg-blue-400/10' },
    COMPLETED:  { label: 'Tamamlandı', color: 'text-green-400 bg-green-400/10' },
    FAILED:     { label: 'Başarısız', color: 'text-red-400 bg-red-400/10' },
    CANCELLED:  { label: 'İptal', color: 'text-gray-400 bg-gray-400/10' },
  };
  const s = statusMap[payout.status] ?? { label: payout.status, color: 'text-gray-400 bg-gray-400/10' };
  const date = new Date(payout.created_at);
  const dateStr = `${date.getDate().toString().padStart(2,'0')}.${(date.getMonth()+1).toString().padStart(2,'0')}.${date.getFullYear()}`;

  return (
    <div className="bg-[#161B22] border border-white/5 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-white font-black text-base">{payout.amount.toFixed(2)}₺</p>
        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${s.color}`}>{s.label}</span>
      </div>
      <p className="text-gray-500 text-[11px] font-mono">{payout.iban.slice(0, 6)}••••••••••••••{payout.iban.slice(-4)}</p>
      <p className="text-gray-600 text-[10px]">{payout.iban_holder_name} · {dateStr}</p>
    </div>
  );
};

const EmptyTx = ({ label }: { label: string }) => (
  <div className="py-16 text-center">
    <Wallet size={32} className="text-gray-700 mx-auto mb-3" />
    <p className="text-gray-600 text-sm">{label}</p>
  </div>
);

const InputField = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div>
    <label className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mb-2 flex gap-1">
      {label} {required && <span className="text-red-400">*</span>}
    </label>
    <div className="bg-[#0A0E14] border border-white/8 rounded-xl px-4 py-3 focus-within:border-[#39FF14]/40 transition-colors">
      {children}
    </div>
  </div>
);

export default WalletScreen;
