import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Wallet, Zap, CheckCircle2, Settings, CreditCard,
  Plus, Trash2, AlertCircle, ArrowUpRight, Gift, RefreshCw,
  Clock, Lock, Info, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import type { SavedPaymentCard } from '../types';

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

type Tab = 'TXN' | 'PAYOUT';
type CardView = 'MAIN' | 'TOPUP' | 'PAYOUT_FORM' | 'ADD_CARD';

const formatIBAN = (raw: string): string => {
  const clean = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 26);
  return clean.replace(/(.{4})/g, '$1 ').trim();
};

const validateIBAN = (raw: string): boolean => {
  const clean = raw.replace(/\s/g, '');
  return clean.length === 26 && clean.startsWith('TR');
};

const INCOME_TYPES_SET = new Set(['DEPOSIT', 'MATCH_EARNING', 'BOOKING_EARNING', 'SERVICE_EARNING', 'REFERRAL_BONUS']);

const TOPUP_PRESETS = [100, 250, 500, 1000];

const WalletScreen: React.FC<WalletScreenProps> = ({ onBack }) => {
  const { savedCards, addSavedCard, removeSavedCard, walletInitialTab } = useAppStore();

  const [tab, setTab]               = useState<Tab>('TXN');
  const [cardView, setCardView]     = useState<CardView>('MAIN');
  const [menuOpen, setMenuOpen]     = useState(false);
  const [summary, setSummary]       = useState<WalletSummary | null>(null);
  const [txList, setTxList]         = useState<WalletTx[]>([]);
  const [payouts, setPayouts]       = useState<PayoutRequest[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Para yükleme (test modu) state
  const [topupAmount, setTopupAmount] = useState<number>(250);

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

  // Test modu: iyzico Kart Saklama canlıya alınana kadar maskeli demo kart ekler.
  const handleAddCard = () => {
    const brands = ['Visa', 'Mastercard', 'Troy'] as const;
    const colors = ['from-purple-600 to-blue-600', 'from-emerald-500 to-teal-700', 'from-orange-600 to-red-600'];
    const idx = Math.floor(Math.random() * brands.length);
    addSavedCard({
      last4:  Math.floor(1000 + Math.random() * 9000).toString(),
      brand:  brands[idx],
      color:  colors[idx],
      holder: 'OYNA KULLANICI',
      exp:    `0${1 + Math.floor(Math.random() * 9)}/2${6 + Math.floor(Math.random() * 3)}`,
    });
    setCardView('MAIN');
  };

  const balance       = summary?.earnings_balance ?? 0;
  const refundBalance = summary?.refund_credit_balance ?? 0;
  const reserved      = summary?.reserved_balance ?? 0;

  const allTx = txList;

  // ─── Para Yükle (test modu bilgi ekranı) ───────────────────────────────────
  if (cardView === 'TOPUP') {
    return (
      <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
        <header className="px-6 py-5 flex items-center gap-4 border-b border-white/5">
          <button onClick={() => setCardView('MAIN')}
            className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-black text-white">PARA YÜKLE</h1>
        </header>
        <div className="flex-1 p-6 space-y-5">
          <div className="bg-[#161B22] border border-white/8 rounded-[28px] p-5">
            <p className="text-gray-400 text-[11px] font-black uppercase tracking-widest mb-2">Güncel Bakiye</p>
            <p className="text-4xl font-black text-white">{balance.toFixed(2)}₺</p>
          </div>

          <div>
            <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mb-3">Yüklenecek Tutar</p>
            <div className="grid grid-cols-4 gap-2.5">
              {TOPUP_PRESETS.map(a => (
                <button key={a} onClick={() => setTopupAmount(a)}
                  className={`py-3 rounded-2xl text-sm font-black transition-all border ${
                    topupAmount === a
                      ? 'bg-[#FFFF00]/15 border-[#FFFF00]/50 text-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.15)]'
                      : 'bg-[#161B22] border-white/8 text-gray-400'
                  }`}>
                  {a}₺
                </button>
              ))}
            </div>
          </div>

          {/* iyzico test modu bilgisi */}
          <div className="bg-blue-500/8 border border-blue-500/25 rounded-[24px] p-5 space-y-3">
            <div className="flex items-center gap-2 text-blue-300">
              <Info size={16} />
              <p className="text-[12px] font-black uppercase tracking-widest">Ödeme Motoru Test Modunda</p>
            </div>
            <p className="text-[12px] text-gray-400 leading-relaxed">
              Para yükleme <span className="text-blue-300 font-bold">iyzico</span> güvenli ödeme sayfası
              üzerinden yapılır. iyzico entegrasyonu (go-live) tamamlanınca kartınla anında ve güvenle
              bakiye yükleyebileceksin. Kart bilgilerin OYNA'da tutulmaz.
            </p>
          </div>

          <button disabled
            className="w-full py-4 bg-[#FFFF00]/40 text-black/70 font-black text-base rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed">
            <Lock size={18} /> iyzico İLE ÖDE — YAKINDA
          </button>
          <p className="text-[11px] text-gray-600 text-center">
            iyzico sözleşmesi aktive edilince bu ekran gerçek ödemeye bağlanır.
          </p>
        </div>
      </div>
    );
  }

  // ─── Para Çek (IBAN payout) ────────────────────────────────────────────────
  if (cardView === 'PAYOUT_FORM') {
    return (
      <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
        <header className="px-6 py-5 flex items-center gap-4 border-b border-white/5">
          <button onClick={() => { setCardView('MAIN'); setPayoutError(''); }}
            className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-black text-white">PARA ÇEK</h1>
        </header>
        <div className="flex-1 p-6 space-y-5">
          <div className="bg-[#161B22] border border-white/8 rounded-[28px] p-5">
            <p className="text-gray-400 text-[11px] font-black uppercase tracking-widest mb-4">Çekilebilir Bakiye</p>
            <p className="text-4xl font-black text-white">{balance.toFixed(2)}₺</p>
            {reserved > 0 && (
              <p className="text-[11px] text-yellow-400 mt-2 flex items-center gap-1">
                <Clock size={11} /> {reserved.toFixed(2)}₺ bekleyen çekimde rezerve
              </p>
            )}
          </div>

          <div className="space-y-4">
            <InputField label="Talep Tutarı (₺)" required>
              <input value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)}
                type="number" placeholder="0.00"
                className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600" />
            </InputField>
            <InputField label="IBAN" required hint={validateIBAN(payoutIban) ? '✓ Geçerli IBAN' : payoutIban.replace(/\s/g,'').length > 0 ? `${payoutIban.replace(/\s/g,'').length}/26 karakter` : 'TR ile başlamalı, 26 karakter'} hintColor={validateIBAN(payoutIban) ? 'text-[#39FF14]' : 'text-gray-600'}>
              <input
                value={payoutIban}
                onChange={e => setPayoutIban(formatIBAN(e.target.value))}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                inputMode="text"
                autoCapitalize="characters"
                className="w-full bg-transparent text-white font-bold outline-none placeholder:text-gray-600 font-mono text-sm tracking-wider" />
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

          <button disabled={payoutLoading || !validateIBAN(payoutIban)}
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

  // ─── Kart Ekle (kayıtlı kartlar) ───────────────────────────────────────────
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
        <div className="flex-1 p-6 space-y-5 overflow-y-auto">
          {savedCards.map(card => (
            <CreditCardVisual key={card.id} card={card} onRemove={() => removeSavedCard(card.id)} />
          ))}
          {savedCards.length === 0 && (
            <div className="py-14 text-center">
              <CreditCard size={34} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">Kayıtlı kartınız yok.</p>
            </div>
          )}

          {/* iyzico güvenlik notu */}
          <div className="bg-blue-500/8 border border-blue-500/25 rounded-[20px] p-4 flex gap-3">
            <Lock size={16} className="text-blue-300 shrink-0 mt-0.5" />
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Kart bilgilerin <span className="text-blue-300 font-bold">iyzico</span> tarafından güvenli
              saklanır. OYNA yalnızca son 4 haneyi ve markayı görür — kart numarası hiçbir zaman OYNA'da tutulmaz.
            </p>
          </div>
        </div>
        <div className="p-6 border-t border-white/5">
          <button onClick={handleAddCard}
            className="w-full h-14 bg-[#FFFF00] text-black font-black rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all">
            <Plus size={20} /> iyzico İLE KART EKLE
          </button>
        </div>
      </div>
    );
  }

  // ─── Ana görünüm ───────────────────────────────────────────────────────────
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

      <div className="flex-1 overflow-y-auto custom-scrollbar z-10 pb-28">
        {/* Güncel Bakiye (hero) */}
        <div className="p-6 pb-3">
          <div className="relative overflow-hidden rounded-[28px] p-6 bg-gradient-to-br from-[#12351f] via-[#161B22] to-[#161B22] border border-[#39FF14]/25 shadow-[0_0_30px_rgba(57,255,20,0.10)]">
            <div className="absolute -top-12 -right-10 w-40 h-40 bg-[#39FF14]/10 blur-[50px] rounded-full pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-[#39FF14] mb-2">
                <Wallet size={15} />
                <span className="text-[10px] font-black uppercase tracking-[0.15em]">Güncel Bakiye</span>
              </div>
              {loading ? (
                <div className="h-10 w-40 bg-white/5 rounded-xl animate-pulse" />
              ) : (
                <p className="text-4xl font-black text-white leading-none">{balance.toFixed(2)}<span className="text-2xl">₺</span></p>
              )}
              <p className="text-[11px] text-gray-500 mt-2">Uygulamada kullanılabilir · IBAN'a çekilebilir</p>
              {reserved > 0 && (
                <p className="text-[11px] text-yellow-400 mt-1 flex items-center gap-1">
                  <Clock size={11} /> {reserved.toFixed(2)}₺ bekleyen çekimde
                </p>
              )}
            </div>
          </div>

          {/* İade Kredisi (ikincil) */}
          <div className="mt-3 flex items-center justify-between bg-[#161B22] border border-blue-500/20 rounded-2xl px-5 py-3.5">
            <div className="flex items-center gap-2.5 text-blue-400">
              <Gift size={15} />
              <span className="text-[11px] font-black uppercase tracking-wider">İade Kredisi</span>
              <span className="text-[9px] text-gray-600 normal-case tracking-normal">Yalnızca OYNA içi</span>
            </div>
            <p className="text-base font-black text-white">{refundBalance.toFixed(2)}₺</p>
          </div>
        </div>

        {/* Kartlarım önizleme */}
        <div className="px-6 pt-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-black uppercase tracking-widest text-gray-400">Kartlarım</span>
            <button onClick={() => setCardView('ADD_CARD')} className="text-[10px] font-black uppercase tracking-widest text-[#FFFF00]">
              Yönet
            </button>
          </div>
          {savedCards.length === 0 ? (
            <button onClick={() => setCardView('ADD_CARD')}
              className="w-full border border-dashed border-white/15 rounded-2xl py-6 flex flex-col items-center gap-2 text-gray-500 hover:border-[#FFFF00]/40 hover:text-white transition-all">
              <Plus size={20} /> <span className="text-[11px] font-bold uppercase tracking-widest">Kart Ekle</span>
            </button>
          ) : (
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1 snap-x">
              {savedCards.map(card => (
                <div key={card.id} className="snap-start shrink-0 w-[280px]">
                  <CreditCardVisual card={card} compact />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="px-6 mt-5 mb-4">
          <div className="flex bg-[#161B22] p-1 rounded-2xl border border-white/5 gap-1">
            {([['TXN','İşlemler'],['PAYOUT','Ödemeler']] as [Tab, string][]).map(([t, label]) => (
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
            {tab === 'TXN' && (
              allTx.length === 0
                ? <EmptyTx label="Henüz işlem geçmişiniz yok." />
                : allTx.map(tx => <TxRow key={tx.id} tx={tx} />)
            )}
            {tab === 'PAYOUT' && (
              payouts.length === 0
                ? <EmptyTx label="Henüz ödeme talebiniz yok." />
                : payouts.map(p => <PayoutRow key={p.id} payout={p} />)
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dişli menüsü (Para Çek / Kart Ekle) */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="fixed right-6 bottom-28 z-40 w-60 bg-[#12171f] border border-white/10 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.6)] max-w-[calc(100vw-3rem)]">
              <button onClick={() => { setMenuOpen(false); setCardView('PAYOUT_FORM'); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left">
                <span className="w-9 h-9 rounded-xl bg-[#39FF14]/14 border border-[#39FF14]/30 flex items-center justify-center text-[#39FF14]"><ArrowUpRight size={16} /></span>
                <span>
                  <span className="block text-[13px] font-black text-white">Para Çek</span>
                  <span className="block text-[9.5px] text-gray-500">IBAN'a ödeme talebi</span>
                </span>
              </button>
              <div className="h-px bg-white/6 mx-2 my-1" />
              <button onClick={() => { setMenuOpen(false); setCardView('ADD_CARD'); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left">
                <span className="w-9 h-9 rounded-xl bg-[#FFFF00]/14 border border-[#FFFF00]/30 flex items-center justify-center text-[#FFFF00]"><Plus size={16} /></span>
                <span>
                  <span className="block text-[13px] font-black text-white">Kart Ekle</span>
                  <span className="block text-[9.5px] text-gray-500">iyzico ile güvenli</span>
                </span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 z-20 px-6 pb-8 pt-4 bg-gradient-to-t from-[#0A0E14] to-transparent max-w-lg md:max-w-2xl mx-auto">
        <div className="flex gap-3">
          <button onClick={() => setCardView('TOPUP')}
            className="flex-1 py-3.5 bg-[#FFFF00] text-black font-black rounded-2xl text-sm active:scale-95 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,0,0.2)]">
            <Plus size={16} /> PARA YÜKLE
          </button>
          <button onClick={() => setMenuOpen(v => !v)} aria-label="Cüzdan ayarları"
            className={`w-14 h-14 rounded-2xl flex items-center justify-center active:scale-95 transition-all border ${
              menuOpen ? 'bg-[#161B22] border-[#FFFF00]/50 text-[#FFFF00]' : 'bg-[#161B22] border-white/8 text-gray-400 hover:text-white'
            }`}>
            {menuOpen ? <X size={20} /> : <Settings size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Helper components ────────────────────────────────────────────────────────

const CreditCardVisual = ({ card, onRemove, compact }: { card: SavedPaymentCard; onRemove?: () => void; compact?: boolean }) => (
  <div className={`relative overflow-hidden rounded-[22px] p-5 text-white shadow-[0_12px_30px_rgba(0,0,0,0.5)] bg-gradient-to-br ${card.color} ${compact ? 'h-[170px]' : 'h-[200px]'} flex flex-col justify-between`}>
    <div className="absolute -top-1/3 -right-[10%] w-3/5 h-[160%] bg-gradient-to-br from-white/20 to-transparent -skew-x-12 pointer-events-none" />
    <div className="relative z-10 flex justify-between items-start">
      <div className="w-11 h-8 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-600 border border-white/30" />
      <div className="flex items-center gap-2">
        <span className="text-base font-black italic tracking-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">{card.brand}</span>
        {onRemove && (
          <button onClick={onRemove} aria-label="Kartı sil"
            className="p-1.5 rounded-lg bg-black/25 hover:bg-red-500/40 text-white/80 hover:text-white transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
    <div className="relative z-10 font-mono text-lg font-bold tracking-[0.18em] drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
      ••••&nbsp;••••&nbsp;••••&nbsp;{card.last4}
    </div>
    <div className="relative z-10 flex justify-between items-end">
      <div>
        <p className="text-[8px] uppercase tracking-[0.14em] opacity-70 mb-0.5">Kart Sahibi</p>
        <p className="text-xs font-black uppercase tracking-wide">{card.holder}</p>
      </div>
      <div className="text-right">
        <p className="text-[8px] uppercase tracking-[0.14em] opacity-70 mb-0.5">Son Kul.</p>
        <p className="text-xs font-black tracking-wide">{card.exp ?? '••/••'}</p>
      </div>
    </div>
  </div>
);

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

const InputField = ({ label, required, hint, hintColor, children }: { label: string; required?: boolean; hint?: string; hintColor?: string; children: React.ReactNode }) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <label className="text-[11px] text-gray-500 font-bold uppercase tracking-wider flex gap-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {hint && <span className={`text-[10px] font-bold ${hintColor ?? 'text-gray-600'}`}>{hint}</span>}
    </div>
    <div className="bg-[#0A0E14] border border-white/8 rounded-xl px-4 py-3 focus-within:border-[#39FF14]/40 transition-colors">
      {children}
    </div>
  </div>
);

export default WalletScreen;
