import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote, Calendar, CreditCard as CardIcon, Coins, Flame, Plus, TrendingUp, Users, X,
} from 'lucide-react';
import { LoadingState } from '../../components/common/StatusState';
import {
  addExpense,
  addDebtor,
  getDebtors,
  getFinanceDashboard,
  getOwnerExpenses,
  resolveDebtor,
  toTurkishError,
  type FinanceDashboardData,
} from '../../services/pitchOwnerService';
import { getOwnerEarningsSummary, type EarningsSummary } from '../../services/walletService';
import { useOwnerToast } from './components/useOwnerToast';
import { OwnerDemoDataBar } from './components/OwnerDemoDataBar';
import { localDateISO } from './ownerCalendarHelpers';

const EXPENSE_COLORS: Record<string, string> = {
  Fatura: '#00F5FF',
  Personel: '#FF00FF',
  Bakım: '#FACC15',
  Diğer: '#00FF00',
};

interface OwnerFinanceViewProps {
  pitchId: string;
  isDemoMode?: boolean;
  readOnly?: boolean;
}

export const OwnerFinanceView: React.FC<OwnerFinanceViewProps> = ({ pitchId, isDemoMode, readOnly = false }) => {
  const notify = useOwnerToast();
  const [financeTab, setFinanceTab] = useState<'INCOME' | 'EXPENSE' | 'DATA'>('INCOME');
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<FinanceDashboardData | null>(null);
  const [oynaEarn, setOynaEarn] = useState<EarningsSummary | null>(null);
  const [expenses, setExpenses] = useState<Awaited<ReturnType<typeof getOwnerExpenses>>>([]);
  const [debtors, setDebtors] = useState<Awaited<ReturnType<typeof getDebtors>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [isAddDebtorModalOpen, setIsAddDebtorModalOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({ title: '', amount: '', category: 'Diğer' });
  const [newDebtor, setNewDebtor] = useState({ name: '', phone: '', amount: '' });

  // B6: UTC yerine yerel ay anahtarı — TR gecesinde (00:00-03:00) ayın 1'inde
  // gider listesi yanlış ayı göstermesin.
  const monthKey = useMemo(() => localDateISO().slice(0, 7), []);

  const load = React.useCallback(async () => {
    if (!pitchId || pitchId.startsWith('mock-')) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [dash, exp, deb, earn] = await Promise.all([
        getFinanceDashboard(pitchId),
        getOwnerExpenses(pitchId, monthKey),
        getDebtors(pitchId),
        getOwnerEarningsSummary().catch(() => null),
      ]);
      setDashboard(dash);
      setExpenses(exp);
      setDebtors(deb);
      setOynaEarn(earn);
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [pitchId, monthKey, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const totalIncome = dashboard?.monthCollected ?? 0;
  const totalExpense = expenses.reduce((acc, e) => acc + (e.amount ?? 0), 0);
  const netProfit = totalIncome - totalExpense;

  const expenseDistribution = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => {
      const cat = e.category || 'Diğer';
      map.set(cat, (map.get(cat) ?? 0) + (e.amount ?? 0));
    });
    if (map.size === 0) {
      return [{ name: 'Gider yok', value: 1, color: '#333' }];
    }
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value,
      color: EXPENSE_COLORS[name] ?? '#888',
    }));
  }, [expenses]);

  const handleAddExpense = async () => {
    if (readOnly) return;
    if (!newExpense.title || !newExpense.amount || !pitchId) return;
    try {
      await addExpense(pitchId, {
        title: newExpense.title,
        amount: parseFloat(newExpense.amount),
        category: newExpense.category,
      });
      setNewExpense({ title: '', amount: '', category: 'Diğer' });
      setIsAddExpenseModalOpen(false);
      await load();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    }
  };

  const handleAddDebtor = async () => {
    if (readOnly) return;
    if (!newDebtor.name || !newDebtor.amount || !pitchId) return;
    try {
      await addDebtor(pitchId, {
        name: newDebtor.name,
        phone: newDebtor.phone || undefined,
        amount_owed: parseFloat(newDebtor.amount),
      });
      setNewDebtor({ name: '', phone: '', amount: '' });
      setIsAddDebtorModalOpen(false);
      await load();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    }
  };

  const hasDemoData = expenses.some((e) => e.is_demo) || debtors.some((d) => d.is_demo);
  const weeklyData = dashboard?.weeklyRevenue ?? [];
  const maxWeekVal = Math.max(...weeklyData.map((d) => d.collected), 1);
  const paymentMethods = dashboard?.paymentMethods ?? [];
  const recentTx = dashboard?.recentTransactions ?? [];
  const subRatio = dashboard?.subscriptionRatio ?? { subscription: 0, regular: 0 };
  const heatmap = dashboard?.hourlyIntensity ?? [];

  if (isLoading) {
    return <div className="p-6 pb-32"><LoadingState message="Finans verileri yükleniyor…" /></div>;
  }

  if (!pitchId || pitchId.startsWith('mock-')) {
    return (
      <div className="p-6 pb-32 text-center text-gray-500">
        <p className="text-sm">Finans modülü için tesisinizi oluşturun veya demo modunu başlatın.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-32 overflow-y-auto custom-scrollbar bg-[#0A0E14]">
      <div className="max-w-5xl mx-auto w-full">
      <OwnerDemoDataBar pitchId={pitchId} onChanged={load} hasDemo={hasDemoData} />
      {isDemoMode && (
        <div className="mb-4 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold text-center">
          DEMO MODU — Finans verileri demo tesise aittir
        </div>
      )}
      {readOnly && (
        <div className="mb-4 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-bold text-center">
          Salt okunur mod — finans kayıtları düzenlenemez
        </div>
      )}

      <div className="relative group cursor-pointer mb-6" onClick={() => setFinanceTab('DATA')}>
        <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600/25 via-blue-600/20 to-transparent rounded-[32px] opacity-40 group-hover:opacity-60 blur transition duration-500" />
        <div className="relative bg-[#161B22] border border-white/10 rounded-[32px] p-6 shadow-2xl overflow-hidden">
          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-1">NET KAZANÇ (BU AY)</p>
          <h2 className={`text-4xl font-black ${netProfit >= 0 ? 'text-white' : 'text-red-400'} tracking-tight`}>
            {netProfit.toLocaleString('tr-TR')}₺
          </h2>
          <div className="grid grid-cols-2 gap-4 mt-8">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-black uppercase mb-1">Toplam Gelir</p>
              <p className="text-xl font-black text-white">{totalIncome.toLocaleString('tr-TR')}₺</p>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-black uppercase mb-1">Toplam Gider</p>
              <p className="text-xl font-black text-white">{totalExpense.toLocaleString('tr-TR')}₺</p>
            </div>
          </div>
        </div>
      </div>

      {/* OYNA üzerinden gelen kazançlar — komisyon şeffaflığı (brüt → komisyon → net) */}
      {oynaEarn && (
        <div className="bg-[#161B22] border border-emerald-500/15 rounded-[32px] p-6 mb-6">
          <h3 className="text-xs font-black text-gray-400 uppercase mb-4 flex items-center gap-2">
            <Coins size={16} className="text-emerald-400" /> OYNA KAZANÇLARIN
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-black uppercase mb-1">Çekilebilir</p>
              <p className="text-xl font-black text-emerald-400">{oynaEarn.available.toLocaleString('tr-TR')}₺</p>
              <p className="text-[10px] text-gray-500 mt-1">Cüzdan → IBAN'a Çek</p>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-black uppercase mb-1">Güvence Beklemesinde</p>
              <p className="text-xl font-black text-blue-300">{oynaEarn.pending.toLocaleString('tr-TR')}₺</p>
              <p className="text-[10px] text-gray-500 mt-1">2 hafta sonra çekilebilir</p>
            </div>
          </div>
          <div className="mt-4 bg-white/[0.03] border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] text-gray-500 font-black uppercase mb-3">
              Bu Ay Uygulama Tahsilatı{oynaEarn.monthCount > 0 ? ` · ${oynaEarn.monthCount} ödeme` : ''}
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Brüt tahsilat</span>
                <span className="text-white font-bold">{oynaEarn.monthGross.toLocaleString('tr-TR')}₺</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">OYNA komisyonu</span>
                <span className="text-red-300 font-bold">−{oynaEarn.monthCommission.toLocaleString('tr-TR')}₺</span>
              </div>
              <div className="h-px bg-white/8 my-1" />
              <div className="flex justify-between">
                <span className="text-gray-300 font-bold">Net kazanç</span>
                <span className="text-emerald-400 font-black">{oynaEarn.monthNet.toLocaleString('tr-TR')}₺</span>
              </div>
            </div>
          </div>
          {oynaEarn.reserved > 0 && (
            <p className="text-[11px] text-yellow-300/90 mt-3">
              {oynaEarn.reserved.toLocaleString('tr-TR')}₺ bekleyen çekim talebinde rezerve.
            </p>
          )}
        </div>
      )}

      <div className="flex bg-[#161B22] p-1.5 rounded-2xl mb-8 border border-white/5">
        {(['INCOME', 'EXPENSE', 'DATA'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFinanceTab(tab)}
            className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${
              financeTab === tab ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'INCOME' ? 'Akış' : tab === 'EXPENSE' ? 'Giderler' : 'Veriler'}
          </button>
        ))}
      </div>

      {financeTab === 'DATA' && (
        <div className="space-y-6">
          <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6 h-80">
            <h3 className="text-xs font-black text-gray-400 uppercase mb-6 flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-400" /> HAFTALIK GELİR
            </h3>
            <div className="h-48 flex items-end justify-between gap-3">
              {weeklyData.map((item) => (
                <div key={item.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <div
                    className="w-full rounded-t-xl bg-gradient-to-t from-emerald-900 to-emerald-400"
                    style={{ height: `${(item.collected / maxWeekVal) * 100}%`, minHeight: item.collected > 0 ? 8 : 0 }}
                  />
                  <span className="text-[10px] font-black text-gray-500">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6">
              <h3 className="text-xs font-black text-gray-400 uppercase mb-4">GİDER DAĞILIMI</h3>
              {expenseDistribution.map((item) => (
                <div key={item.name} className="flex justify-between text-sm py-1">
                  <span className="text-gray-400">{item.name}</span>
                  <span className="text-white font-bold">{item.value.toLocaleString('tr-TR')}₺</span>
                </div>
              ))}
            </div>
            <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6">
              <h3 className="text-xs font-black text-gray-400 uppercase mb-4 flex items-center gap-2">
                <Users size={16} /> ABONE / NORMAL
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span>Abone</span><span className="text-blue-400">%{subRatio.subscription}</span></div>
                <div className="flex justify-between"><span>Normal</span><span className="text-emerald-400">%{subRatio.regular}</span></div>
              </div>
            </div>
          </div>

          {heatmap.length > 0 && (
            <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6">
              <h3 className="text-xs font-black text-gray-400 uppercase mb-4 flex items-center gap-2">
                <Flame size={16} className="text-orange-500" /> YOĞUNLUK (BUGÜN)
              </h3>
              <div className="flex gap-1 h-20 items-end">
                {heatmap.map((item) => (
                  <div
                    key={item.hour}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${item.intensity}%`,
                      backgroundColor: item.intensity > 80 ? '#FF4444' : item.intensity > 50 ? '#FFAA00' : '#44FF44',
                      opacity: 0.4 + (item.intensity / 100) * 0.6,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {financeTab === 'INCOME' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-[10px] font-black text-gray-500 uppercase px-2">ÖDEME YÖNTEMLERİ</h3>
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-gray-500 px-2">Henüz tahsilat kaydı yok.</p>
            ) : paymentMethods.map((method) => (
              <button
                key={method.method}
                onClick={() => setSelectedPayment(selectedPayment === method.method ? null : method.method)}
                className="w-full bg-[#161B22] p-4 rounded-2xl border border-white/5 flex justify-between items-center"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                    {method.method === 'CASH' ? <Banknote size={20} /> : method.method === 'CARD' ? <CardIcon size={20} /> : <Coins size={20} />}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">{method.label}</p>
                    <p className="text-[10px] text-gray-500">{method.count} işlem</p>
                  </div>
                </div>
                <p className="text-lg font-black text-white">{method.amount.toLocaleString('tr-TR')}₺</p>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-[10px] font-black text-gray-500 uppercase px-2">SON İŞLEMLER</h3>
            {(recentTx.length ? recentTx : []).map((tx) => (
              <div key={tx.id} className="bg-[#161B22] p-5 rounded-3xl border border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">{tx.customerName}</p>
                    <p className="text-[10px] text-gray-500">{tx.dateLabel}</p>
                  </div>
                </div>
                <p className="text-base font-black text-emerald-400">+{tx.amount.toLocaleString('tr-TR')}₺</p>
              </div>
            ))}
            {recentTx.length === 0 && (
              <p className="text-sm text-gray-500 px-2">Son işlem bulunamadı.</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-[10px] font-black text-gray-500 uppercase">VERESİYE</h3>
              <button
                type="button"
                onClick={() => { if (!readOnly) setIsAddDebtorModalOpen(true); }}
                className="text-[10px] font-black text-red-400 flex items-center gap-1"
              >
                <Plus size={12} /> Ekle
              </button>
            </div>
            {debtors.length === 0 && (
              <p className="text-sm text-gray-500 px-2">Açık veresiye kaydı yok.</p>
            )}
            {debtors.map((d) => (
              <div key={d.id} className="bg-[#161B22] p-4 rounded-2xl border border-red-500/20 flex justify-between items-center">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="truncate">{d.name}</span>
                    {d.is_demo && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">DEMO</span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-500">{d.phone ?? ''}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-red-400 font-black">{d.amount_owed.toLocaleString('tr-TR')}₺</span>
                  <button
                    onClick={() => {
                      if (readOnly) return;
                      resolveDebtor(d.id).then(load).catch((err) => notify(toTurkishError(err), 'error'));
                    }}
                    disabled={readOnly}
                    className="text-[10px] font-bold text-emerald-400 px-2 py-1 bg-emerald-500/10 rounded-lg disabled:opacity-40"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {financeTab === 'EXPENSE' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black text-gray-400 uppercase">GİDERLER</h3>
            <button onClick={() => { if (!readOnly) setIsAddExpenseModalOpen(true); }} className="p-2 bg-white/5 rounded-xl text-white">
              <Plus size={18} />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
          {expenses.map((e) => (
            <div key={e.id} className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex justify-between items-center gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="truncate">{e.title}</span>
                  {e.is_demo && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">DEMO</span>
                  )}
                </p>
                <p className="text-[10px] text-gray-500">{e.category} • {e.expense_date}</p>
              </div>
              <span className="text-red-400 font-black shrink-0">{e.amount?.toLocaleString('tr-TR')}₺</span>
            </div>
          ))}
          </div>
          {expenses.length === 0 && <p className="text-sm text-gray-500">Bu ay gider kaydı yok.</p>}
        </div>
      )}

      </div>{/* /max-w wrapper */}

      {isAddExpenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center p-4">
          <div className="bg-[#161B22] w-full max-w-md rounded-t-3xl p-6 border border-white/10">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-black text-white">Yeni Gider</h3>
              <button onClick={() => setIsAddExpenseModalOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <input
              className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-3"
              placeholder="Başlık"
              value={newExpense.title}
              onChange={(e) => setNewExpense({ ...newExpense, title: e.target.value })}
            />
            <input
              type="number"
              className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-3"
              placeholder="Tutar"
              value={newExpense.amount}
              onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
            />
            <select
              className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-4"
              value={newExpense.category}
              onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
            >
              {['Fatura', 'Personel', 'Bakım', 'Diğer'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button onClick={handleAddExpense} className="w-full py-4 bg-[#FF00FF] text-white font-black rounded-2xl">
              GİDERİ KAYDET
            </button>
          </div>
        </div>
      )}

      {isAddDebtorModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center p-4">
          <div className="bg-[#161B22] w-full max-w-md rounded-t-3xl p-6 border border-white/10">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-black text-white">Veresiye Ekle</h3>
              <button type="button" onClick={() => setIsAddDebtorModalOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <input
              className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-3"
              placeholder="Müşteri adı"
              value={newDebtor.name}
              onChange={(e) => setNewDebtor({ ...newDebtor, name: e.target.value })}
            />
            <input
              className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-3"
              placeholder="Telefon (opsiyonel)"
              value={newDebtor.phone}
              onChange={(e) => setNewDebtor({ ...newDebtor, phone: e.target.value })}
            />
            <input
              type="number"
              className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-4"
              placeholder="Borç tutarı (₺)"
              value={newDebtor.amount}
              onChange={(e) => setNewDebtor({ ...newDebtor, amount: e.target.value })}
            />
            <button type="button" onClick={handleAddDebtor} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl">
              KAYDET
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
