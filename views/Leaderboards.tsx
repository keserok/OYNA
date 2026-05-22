import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, Flame, ShieldCheck, Target, TrendingUp, TrendingDown, Minus, Crown, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LeaderboardsProps {
  onBack: () => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Category = 'TP' | 'FAIRPLAY' | 'GOL';
type Period = 'HAFTA' | 'SEZON';
type EntityTab = 'TEAMS' | 'PLAYERS';

// ─── Mock Data ────────────────────────────────────────────────────────────────
const TEAMS_DATA = [
  { id: 't1', name: 'Boğaziçi FC',    initials: 'BFC', color: '#10B981', wins: 14, losses: 3,  tp: 1280, fp: 96, goals: 68, tpChange: +45, form: ['W','W','W','D','W'] },
  { id: 't2', name: 'Güney SK',       initials: 'GSK', color: '#3B82F6', wins: 10, losses: 6,  tp: 1095, fp: 88, goals: 52, tpChange: +12, form: ['W','L','W','W','L'] },
  { id: 't3', name: 'Hisar SK',       initials: 'HSK', color: '#EF4444', wins:  8, losses: 8,  tp: 1020, fp: 82, goals: 41, tpChange: -8,  form: ['L','W','D','L','W'] },
  { id: 't4', name: 'Kuzey SK',       initials: 'KSK', color: '#F59E0B', wins:  5, losses: 11, tp:  940, fp: 79, goals: 33, tpChange: -22, form: ['L','L','W','L','D'] },
  { id: 't5', name: 'Uçaksavar SK',   initials: 'USK', color: '#8B5CF6', wins:  4, losses: 12, tp:  870, fp: 75, goals: 28, tpChange: -18, form: ['D','L','L','W','L'] },
];

const PLAYERS_DATA = [
  { id: 'p1', name: 'Ahmet Yılmaz', initials: 'AY', pos: 'FV',  color: '#10B981', tp: 1280, fp: 98, goals: 18, tpChange: +55, form: ['W','W','W','D','W'], team: 'Boğaziçi FC' },
  { id: 'p2', name: 'Caner Kaya',   initials: 'CK', pos: 'OS',  color: '#3B82F6', tp: 1140, fp: 91, goals: 12, tpChange: +20, form: ['W','L','W','W','W'], team: 'Güney SK' },
  { id: 'p3', name: 'Emre Demir',   initials: 'ED', pos: 'STP', color: '#EF4444', tp: 1050, fp: 87, goals:  3, tpChange: -5,  form: ['L','W','D','L','W'], team: 'Hisar SK' },
  { id: 'p4', name: 'Burak Şahin',  initials: 'BŞ', pos: 'KL',  color: '#F59E0B', tp:  990, fp: 85, goals:  0, tpChange: -15, form: ['L','L','W','L','D'], team: 'Kuzey SK' },
  { id: 'p5', name: 'Mert Arslan',  initials: 'MA', pos: 'OS',  color: '#8B5CF6', tp:  910, fp: 80, goals:  7, tpChange: +8,  form: ['W','D','L','W','L'], team: 'Hisar SK' },
];

const MY_RANK = { rank: 7, tp: 860, tpChange: +30, name: 'Sen' };

const FORM_COLORS: Record<string, string> = {
  W: 'bg-emerald-500 text-white',
  L: 'bg-rose-500 text-white',
  D: 'bg-gray-600 text-white',
};

const PODIUM_HEIGHTS = ['h-24', 'h-32', 'h-20']; // 2nd, 1st, 3rd
const MEDAL_COLORS = [
  { ring: 'border-gray-300 shadow-[0_0_20px_rgba(203,213,225,0.4)]', text: 'text-gray-300', bg: 'bg-gray-300/20' },
  { ring: 'border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.6)]', text: 'text-amber-400', bg: 'bg-amber-400/20' },
  { ring: 'border-amber-700 shadow-[0_0_15px_rgba(180,83,9,0.3)]',   text: 'text-amber-700', bg: 'bg-amber-700/20' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
const FormStrip: React.FC<{ form: string[] }> = ({ form }) => (
  <div className="flex gap-0.5">
    {form.map((r, i) => (
      <span key={i} className={`w-4 h-4 rounded-md text-[7px] font-black flex items-center justify-center ${FORM_COLORS[r]}`}>{r}</span>
    ))}
  </div>
);

const TrendBadge: React.FC<{ change: number }> = ({ change }) => {
  if (change === 0) return <Minus size={12} className="text-gray-600" />;
  const up = change > 0;
  return (
    <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg ${up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      <span className="text-[9px] font-black">{up ? '+' : ''}{change}</span>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const Leaderboards: React.FC<LeaderboardsProps> = ({ onBack }) => {
  const [entityTab, setEntityTab] = useState<EntityTab>('TEAMS');
  const [category, setCategory] = useState<Category>('TP');
  const [period, setPeriod] = useState<Period>('SEZON');
  const [podiumReady, setPodiumReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPodiumReady(true), 200);
    return () => clearTimeout(t);
  }, [entityTab]);

  const rawData = entityTab === 'TEAMS' ? TEAMS_DATA : PLAYERS_DATA;

  const sorted = [...rawData].sort((a, b) => {
    if (category === 'TP') return b.tp - a.tp;
    if (category === 'FAIRPLAY') return b.fp - a.fp;
    return b.goals - a.goals;
  });

  const getValue = (item: typeof rawData[0]) => {
    if (category === 'TP') return item.tp;
    if (category === 'FAIRPLAY') return item.fp;
    return item.goals;
  };

  const getLabel = () => {
    if (category === 'TP') return 'TP';
    if (category === 'FAIRPLAY') return 'FP';
    return 'Gol';
  };

  const podiumOrder = [sorted[1], sorted[0], sorted[2]]; // 2nd, 1st, 3rd

  const topHot = sorted.reduce((prev, cur) => cur.tpChange > prev.tpChange ? cur : prev, sorted[0]);

  return (
    <div className="min-h-screen bg-[#070B10] text-white font-sans flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="pt-12 pb-4 px-5 bg-gradient-to-b from-amber-900/30 to-[#070B10] border-b border-white/5 sticky top-0 z-20 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors">
            <ArrowLeft size={18} /> <span className="text-xs font-bold">Geri</span>
          </button>

          {/* Period Toggle */}
          <div className="flex bg-white/[0.04] rounded-xl border border-white/5 p-1 gap-1">
            {(['HAFTA', 'SEZON'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${period === p ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-gray-600 hover:text-gray-400'}`}
              >
                {p === 'HAFTA' ? 'Bu Hafta' : 'Bu Sezon'}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="flex items-center gap-3 mb-4">
          <motion.div
            animate={{ boxShadow: ['0 0 15px rgba(251,191,36,0.2)', '0 0 35px rgba(251,191,36,0.5)', '0 0 15px rgba(251,191,36,0.2)'] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-lg"
          >
            <Trophy size={22} className="text-black" />
          </motion.div>
          <div>
            <h1 className="text-xl font-black italic tracking-tight">Liderlik Tablosu</h1>
            <p className="text-[9px] text-amber-400/60 font-black uppercase tracking-widest">Boğaziçi Üniversitesi · {period === 'HAFTA' ? '4. Hafta' : '2024 Sezonu'}</p>
          </div>
        </div>

        {/* Entity Tabs */}
        <div className="flex bg-white/[0.04] p-1 rounded-2xl border border-white/5 gap-1 mb-3">
          {(['TEAMS', 'PLAYERS'] as EntityTab[]).map(tab => (
            <button key={tab} onClick={() => { setEntityTab(tab); setPodiumReady(false); }}
              className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all relative"
            >
              {entityTab === tab && (
                <motion.div layoutId="lbEntityTab"
                  className="absolute inset-0 bg-gradient-to-r from-amber-600/40 to-orange-600/30 border border-amber-500/25 rounded-xl"
                />
              )}
              <span className={`relative z-10 ${entityTab === tab ? 'text-amber-300' : 'text-gray-600'}`}>
                {tab === 'TEAMS' ? '🏟️ Takımlar' : '👤 Oyuncular'}
              </span>
            </button>
          ))}
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2">
          {([
            { key: 'TP',       label: '⚡ TP',       activeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
            { key: 'FAIRPLAY', label: '🛡 Fair Play',  activeColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
            { key: 'GOL',      label: '⚽ Gol Krallığı', activeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
          ] as { key: Category; label: string; activeColor: string }[]).map(({ key, label, activeColor }) => (
            <button key={key} onClick={() => setCategory(key)}
              className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all ${category === key ? activeColor : 'bg-white/[0.03] border-white/5 text-gray-600 hover:text-gray-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-28">
        <AnimatePresence mode="wait">
          <motion.div key={`${entityTab}-${category}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >

            {/* Hottest riser strip */}
            <div className="mx-4 mt-4 mb-1 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-2.5 flex items-center gap-3">
              <Flame size={16} className="text-orange-400 animate-pulse flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-orange-400/70 font-black uppercase tracking-widest">Bu Haftanın Yıldızı</p>
                <p className="text-sm font-black text-white">{topHot.name}
                  <span className="text-emerald-400 text-xs font-black ml-2">▲ +{topHot.tpChange} TP</span>
                </p>
              </div>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm border border-white/10"
                style={{ background: `linear-gradient(135deg, ${topHot.color}40, ${topHot.color}10)`, color: topHot.color }}>
                {topHot.initials.charAt(0)}
              </div>
            </div>

            {/* ─ Podium ─ */}
            <div className="px-4 pt-4 pb-2">
              <div className="flex justify-center items-end gap-2 h-52">
                {podiumOrder.map((item, pIdx) => {
                  if (!item) return <div key={pIdx} className="w-1/3" />;
                  const realRank = pIdx === 1 ? 1 : pIdx === 0 ? 2 : 3;
                  const medal = MEDAL_COLORS[realRank - 1];
                  const podH = PODIUM_HEIGHTS[pIdx];
                  return (
                    <div key={item.id} className="flex flex-col items-center w-1/3">
                      {realRank === 1 && (
                        <motion.div animate={{ y: [-3, 3, -3] }} transition={{ duration: 2, repeat: Infinity }}>
                          <Crown size={20} className="text-amber-400 mb-1" />
                        </motion.div>
                      )}
                      {/* Avatar */}
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: podiumReady ? 1 : 0, opacity: podiumReady ? 1 : 0 }}
                        transition={{ delay: pIdx * 0.12, type: 'spring', stiffness: 300 }}
                        className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-base mb-2 border-2 ${medal.ring}`}
                        style={{ background: `${item.color}25`, color: item.color }}
                      >
                        {item.initials}
                      </motion.div>

                      {/* Podium bar */}
                      <motion.div
                        initial={{ scaleY: 0 }} animate={{ scaleY: podiumReady ? 1 : 0 }}
                        transition={{ delay: pIdx * 0.12 + 0.2, duration: 0.6, ease: 'easeOut' }}
                        className={`w-full ${podH} border-t-2 rounded-t-2xl flex flex-col justify-end pb-2 items-center`}
                        style={{ originY: 1, borderTopColor: item.color + '80', background: `linear-gradient(to top, ${item.color}20, transparent)` }}
                      >
                        <span className="text-[9px] font-bold text-center px-1 truncate w-full text-gray-400">{item.name.split(' ')[0]}</span>
                        <span className={`text-sm font-black ${medal.text}`}>{getValue(item)}</span>
                        <span className="text-[7px] text-gray-600 font-bold">{getLabel()}</span>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ─ Full Rankings List ─ */}
            <div className="px-4 space-y-2.5 mt-2">
              {sorted.map((item, idx) => (
                <motion.div key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`relative overflow-hidden rounded-2xl border p-3.5 flex items-center gap-3 ${idx === 0 ? 'border-amber-500/25 bg-amber-500/5' : 'border-white/5 bg-white/[0.02]'}`}
                >
                  {/* Rank */}
                  <span className={`w-6 text-center font-black text-sm flex-shrink-0 ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-amber-700' : 'text-gray-700'}`}>
                    {idx === 0 ? '👑' : idx + 1}
                  </span>

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border border-white/10 flex-shrink-0"
                    style={{ background: `${item.color}20`, color: item.color }}>
                    {item.initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-xs text-white truncate">{item.name}</p>
                      {item.tpChange === topHot.tpChange && <Flame size={10} className="text-orange-400 flex-shrink-0" />}
                    </div>
                    {'pos' in item && (
                      <p className="text-[9px] text-gray-600 font-bold">{(item as any).pos} · {(item as any).team}</p>
                    )}
                    {'wins' in item && (
                      <p className="text-[9px] text-gray-600 font-bold">{(item as any).wins}G · {(item as any).losses}M</p>
                    )}
                    <div className="mt-1.5">
                      <FormStrip form={item.form} />
                    </div>
                  </div>

                  {/* Score + Trend */}
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                    <span className={`text-base font-black tabular-nums ${idx === 0 ? 'text-amber-400' : 'text-white'}`}>{getValue(item)}</span>
                    <TrendBadge change={item.tpChange} />
                  </div>
                </motion.div>
              ))}
            </div>

          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Sticky My Rank Banner ─────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-[#070B10] via-[#070B10]/95 to-transparent">
        <div className="bg-gradient-to-r from-indigo-900/60 to-[#161B22] border border-indigo-500/25 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center font-black text-indigo-400 text-sm flex-shrink-0">
            Sen
          </div>
          <div className="flex-1">
            <p className="text-[9px] text-indigo-400/60 font-black uppercase tracking-widest">Senin Sıran</p>
            <p className="text-sm font-black text-white">{MY_RANK.rank}. Sıra <span className="text-gray-600 font-bold">·</span> <span className="text-indigo-300">{MY_RANK.tp} TP</span></p>
          </div>
          <TrendBadge change={MY_RANK.tpChange} />
        </div>
      </div>

    </div>
  );
};

export default Leaderboards;
