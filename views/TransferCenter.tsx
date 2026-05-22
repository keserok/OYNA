import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Search, MapPin, Star, Shield, UserPlus, MessageSquare,
  ChevronRight, Clock, Zap, CheckCircle2, SlidersHorizontal, Check,
  Radio, Navigation
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TransferCenterProps {
  onBack: () => void;
}

// ─── Breaking News Ticker ───────────────────────────────────────────────────
const TICKER_ITEMS = [
  '🔴 Ahmet Y. · Boğaziçi FC\'ye transfer oldu · 5 dk',
  '🟡 Caner T. · Galata SK kadro teklifini reddetti · 12 dk',
  '🟢 Burak M. · Kadiköy Bulls için ilan verdi · 18 dk',
  '🔴 Mert A. · Turnuva öncesi forvet aranıyor · 24 dk',
  '🟢 3 yeni oyuncu bölgenize katıldı · 30 dk',
];

// ─── LFP Listings (Takım arıyor oyuncu) ────────────────────────────────────
const LFP_LISTINGS = [
  {
    id: 1,
    team: 'FC Bosphorus',
    initials: 'FCB',
    teamColor: '#10B981',
    role: 'Defans',
    roleBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    level: 'Orta',
    date: 'Bu Akşam 21:00',
    location: 'Beşiktaş',
    distanceKm: 1.2,
    urgency: 'Acil',
    fee: 'Ücretsiz',
    matchType: 'Hazırlık',
    verified: true,
    gradient: 'from-emerald-900/40 to-[#0D1117]',
  },
  {
    id: 2,
    team: 'Kadiköy Bulls',
    initials: 'KBS',
    teamColor: '#3B82F6',
    role: 'Kaleci',
    roleBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    level: 'Pro',
    date: 'Yarın 19:30',
    location: 'Kadıköy',
    distanceKm: 3.5,
    urgency: 'Normal',
    fee: 'Maç Başı 100₺',
    matchType: 'Turnuva',
    verified: true,
    gradient: 'from-blue-900/40 to-[#0D1117]',
  },
  {
    id: 3,
    team: 'Galata SK',
    initials: 'GSK',
    teamColor: '#F59E0B',
    role: 'Orta Saha',
    roleBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    level: 'Başlangıç',
    date: '15 Eki 20:00',
    location: 'Beyoğlu',
    distanceKm: 5.8,
    urgency: 'Normal',
    fee: 'Ücretsiz',
    matchType: 'Hazırlık',
    verified: false,
    gradient: 'from-amber-900/40 to-[#0D1117]',
  },
];

// ─── LFT Listings (Oyuncu arıyor takım) ────────────────────────────────────
const LFT_LISTINGS = [
  {
    id: 1,
    name: 'Caner T.',
    initials: 'CT',
    role: 'Orta Saha',
    roleBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    rating: 4.8,
    location: 'Şişli',
    distanceKm: 0.8,
    note: 'Pas oyununu seven takımlar yazsın.',
    matches: 42,
    mvp: 8,
    fp: 94,
    verified: true,
    cardGradient: 'from-purple-900/50 to-[#0D1117]',
  },
  {
    id: 2,
    name: 'Burak M.',
    initials: 'BM',
    role: 'Forvet',
    roleBg: 'bg-red-500/20 text-red-300 border-red-500/30',
    rating: 4.5,
    location: 'Üsküdar',
    distanceKm: 2.3,
    note: 'Bitiriciliğim iyidir, akşam maçlarına gelebilirim.',
    matches: 28,
    mvp: 3,
    fp: 87,
    verified: false,
    cardGradient: 'from-rose-900/50 to-[#0D1117]',
  },
  {
    id: 3,
    name: 'Ahmet Y.',
    initials: 'AY',
    role: 'Defans',
    roleBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    rating: 4.9,
    location: 'Maltepe',
    distanceKm: 4.1,
    note: 'Sert ve tempolu maçlar tercihim.',
    matches: 85,
    mvp: 12,
    fp: 98,
    verified: true,
    cardGradient: 'from-emerald-900/50 to-[#0D1117]',
  },
];

// ─── Component ─────────────────────────────────────────────────────────────
const TransferCenter: React.FC<TransferCenterProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'LFP' | 'LFT'>('LFP');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [maxDistance, setMaxDistance] = useState(10);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [invitedIds, setInvitedIds] = useState<number[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rotate ticker
  useEffect(() => {
    const t = setInterval(() => setTickerIdx(i => (i + 1) % TICKER_ITEMS.length), 4000);
    return () => clearInterval(t);
  }, []);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const handleInvite = (id: number, name: string) => {
    setInvitedIds(prev => [...prev, id]);
    showToast(`✅ ${name} için davet gönderildi!`);
  };

  const handleContact = (name: string) => {
    showToast(`✅ ${name} takımına başvuru gönderildi!`);
  };

  // Filter by distance
  const filteredLFP = LFP_LISTINGS.filter(l =>
    l.distanceKm <= maxDistance &&
    (searchQuery === '' || l.team.toLowerCase().includes(searchQuery.toLowerCase()) || l.role.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredLFT = LFT_LISTINGS.filter(l =>
    l.distanceKm <= maxDistance &&
    (searchQuery === '' || l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.role.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-[#070B10] text-white flex flex-col font-sans">

      {/* ── In-App Toast ────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="ttoast"
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] px-5 py-3.5 rounded-2xl shadow-2xl pointer-events-none flex items-center gap-3 max-w-[90vw]"
            style={{
              background: 'linear-gradient(135deg,#1a472a,#14532d)',
              border: '1px solid rgba(74,222,128,0.35)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(22,163,74,0.3)',
            }}
          >
            <p className="text-white text-sm font-bold">{toast}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SON DAKİKA Ticker ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-red-600/10 border-b border-red-500/20 overflow-hidden flex-shrink-0" style={{ paddingTop: '48px' }}>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Radio size={11} className="text-red-400 animate-pulse" />
          <span className="text-[9px] font-black text-red-400 uppercase tracking-widest whitespace-nowrap">SON DAKİKA</span>
        </div>
        <div className="flex-1 h-4 overflow-hidden ml-2">
          <AnimatePresence mode="wait">
            <motion.p
              key={tickerIdx}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-[11px] text-gray-300 font-semibold truncate"
            >
              {TICKER_ITEMS[tickerIdx]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Sticky Header ───────────────────────────────────────────── */}
      <div className="pb-4 px-5 bg-[#070B10]/95 backdrop-blur-xl border-b border-white/5 sticky top-0 z-30">
        <div className="flex items-center justify-between mt-4 mb-4">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-white/5 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-slate-300" />
          </button>
          <div>
            <h1 className="text-lg font-black tracking-tight text-center">Transfer Merkezi</h1>
            <p className="text-[9px] text-emerald-400 font-bold text-center uppercase tracking-widest">
              {activeTab === 'LFP' ? filteredLFP.length : filteredLFT.length} İlan Bulundu
            </p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 -mr-2 rounded-xl transition-colors ${showFilters ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'hover:bg-white/5 text-slate-400'}`}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-slate-500" />
          </div>
          <input
            type="text"
            placeholder={activeTab === 'LFP' ? 'Takım, mevki veya il ara...' : 'Oyuncu, mevki ara...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/8 rounded-2xl py-3 pl-11 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all"
          />
        </div>

        {/* Tabs */}
        <div className="flex bg-white/[0.04] p-1 rounded-2xl border border-white/5 gap-1">
          {(['LFT', 'LFP'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all relative"
            >
              {activeTab === tab && (
                <motion.div layoutId="transferTab"
                  className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-lg shadow-emerald-500/20"
                />
              )}
              <span className={`relative z-10 ${activeTab === tab ? 'text-white' : 'text-slate-600'}`}>
                {tab === 'LFT' ? '⚽ Takım Arıyorum' : '🔍 Oyuncu Arıyorum'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/5 bg-[#0D1117]/80 backdrop-blur-sm"
          >
            <div className="p-5 space-y-5">
              {/* Distance Slider */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Navigation size={13} className="text-emerald-400" />
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Maksimum Mesafe</label>
                  </div>
                  <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl px-3 py-1">
                    <span className="text-sm font-black text-emerald-400">{maxDistance} km</span>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="range"
                    min={1} max={15} step={0.5}
                    value={maxDistance}
                    onChange={(e) => setMaxDistance(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #10B981 0%, #10B981 ${(maxDistance / 15) * 100}%, rgba(255,255,255,0.08) ${(maxDistance / 15) * 100}%, rgba(255,255,255,0.08) 100%)`
                    }}
                  />
                  <div className="flex justify-between text-[9px] text-gray-700 font-bold mt-1">
                    <span>1 km</span><span>5 km</span><span>10 km</span><span>15 km</span>
                  </div>
                </div>
              </div>

              {/* Position Filter */}
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2 block">Mevki</label>
                <div className="flex gap-2 flex-wrap">
                  {['Tümü', 'Kaleci', 'Defans', 'Orta Saha', 'Forvet'].map(pos => (
                    <button key={pos}
                      className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/8 text-xs font-bold text-gray-400 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors"
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 p-4 pb-36 overflow-y-auto space-y-4">
        <AnimatePresence mode="wait">

          {/* LFP — Team looking for players */}
          {activeTab === 'LFP' && (
            <motion.div key="lfp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {filteredLFP.length === 0 ? (
                <div className="text-center py-16 text-gray-600">
                  <Search size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="font-bold text-sm">Bu mesafede ilan bulunamadı</p>
                </div>
              ) : filteredLFP.map((listing, idx) => (
                <motion.div key={listing.id}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.07 }}
                  className={`bg-gradient-to-br ${listing.gradient} border rounded-3xl overflow-hidden relative group`}
                  style={{ borderColor: `${listing.teamColor}30` }}
                >
                  {/* FIFA-style top color bar */}
                  <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${listing.teamColor}, transparent)` }} />

                  <div className="p-5 relative z-10">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <motion.div
                          style={{ background: `linear-gradient(135deg, ${listing.teamColor}40, ${listing.teamColor}10)`, borderColor: `${listing.teamColor}40` }}
                          className="w-14 h-14 rounded-2xl border flex items-center justify-center font-black text-xl shadow-lg"
                          whileHover={{ rotate: 6 }}
                        >
                          <span style={{ color: listing.teamColor }}>{listing.initials.charAt(0)}</span>
                        </motion.div>
                        <div>
                          <h3 className="font-black text-white text-base flex items-center gap-1.5">
                            {listing.team}
                            {listing.verified && <CheckCircle2 size={14} className="text-blue-400" />}
                          </h3>
                          <div className="flex items-center gap-1 text-xs text-gray-500 font-bold mt-0.5">
                            <MapPin size={10} />
                            <span>{listing.location}</span>
                            <span className="text-gray-700">·</span>
                            <Navigation size={10} className="text-emerald-500" />
                            <span className="text-emerald-400">{listing.distanceKm} km</span>
                          </div>
                        </div>
                      </div>
                      {listing.urgency === 'Acil' && (
                        <motion.span
                          animate={{ opacity: [1, 0.6, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                          className="px-2.5 py-1 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[9px] font-black rounded-xl uppercase tracking-wider flex items-center gap-1"
                        >
                          <Zap size={9} /> Acil
                        </motion.span>
                      )}
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-3 gap-2.5 mb-4">
                      <div className="bg-black/20 rounded-xl p-2.5 border border-white/5 text-center">
                        <p className="text-[8px] text-gray-600 font-bold uppercase mb-1">Mevki</p>
                        <span className={`text-[10px] font-black border rounded-full px-2 py-0.5 ${listing.roleBg}`}>{listing.role}</span>
                      </div>
                      <div className="bg-black/20 rounded-xl p-2.5 border border-white/5 text-center">
                        <p className="text-[8px] text-gray-600 font-bold uppercase mb-1">Seviye</p>
                        <p className="text-xs font-black text-white">{listing.level}</p>
                      </div>
                      <div className="bg-black/20 rounded-xl p-2.5 border border-white/5 text-center">
                        <p className="text-[8px] text-gray-600 font-bold uppercase mb-1">Tür</p>
                        <p className="text-xs font-black text-white">{listing.matchType}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mb-4 bg-black/20 rounded-xl px-3 py-2.5 border border-white/5">
                      <Clock size={13} className="text-gray-500 flex-shrink-0" />
                      <span className="text-sm font-black text-white">{listing.date}</span>
                      <span className="text-gray-700 ml-auto text-xs font-bold">{listing.fee}</span>
                    </div>

                    {/* Action */}
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                      onClick={() => handleContact(listing.team)}
                      className="w-full py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all uppercase tracking-widest shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${listing.teamColor}30, ${listing.teamColor}10)`, borderWidth: 1, borderColor: `${listing.teamColor}40`, color: 'white' }}
                    >
                      <Zap size={16} /> BAŞVUR
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* LFT — Player looking for team */}
          {activeTab === 'LFT' && (
            <motion.div key="lft" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {filteredLFT.length === 0 ? (
                <div className="text-center py-16 text-gray-600">
                  <Search size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="font-bold text-sm">Bu mesafede oyuncu bulunamadı</p>
                </div>
              ) : filteredLFT.map((listing, idx) => (
                <motion.div key={listing.id}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.07 }}
                  className={`bg-gradient-to-br ${listing.cardGradient} border border-white/8 rounded-3xl overflow-hidden relative group`}
                >
                  <div className="p-5">
                    {/* Player header row */}
                    <div className="flex items-center gap-4 mb-4">
                      {/* Avatar with rating badge */}
                      <div className="relative flex-shrink-0">
                        <div className="w-[68px] h-[68px] rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center font-black text-2xl text-white shadow-xl">
                          {listing.initials}
                        </div>
                      </div>

                      {/* Name & info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-black text-lg text-white">{listing.name}</h3>
                          {listing.verified && <CheckCircle2 size={14} className="text-blue-400 flex-shrink-0" />}
                        </div>
                        <span className={`text-[10px] font-black border rounded-full px-2 py-0.5 ${listing.roleBg}`}>{listing.role}</span>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-500 font-bold">
                          <MapPin size={9} />
                          <span>{listing.location}</span>
                          <Navigation size={9} className="text-emerald-500" />
                          <span className="text-emerald-400">{listing.distanceKm} km</span>
                        </div>
                      </div>

                      {/* Big rating */}
                      <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl px-3 py-2 text-center flex-shrink-0">
                        <p className="text-2xl font-black text-amber-400 leading-none">{listing.rating}</p>
                        <div className="flex items-center justify-center gap-0.5 mt-1">
                          {[1,2,3,4,5].map(s => (
                            <Star key={s} size={7} className={s <= Math.round(listing.rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-700'} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2.5 mb-4">
                      {[
                        { label: 'Maç', val: listing.matches, color: 'text-white' },
                        { label: 'MVP', val: listing.mvp, color: 'text-amber-400' },
                        { label: 'Fair Play', val: listing.fp, color: 'text-blue-400' },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="bg-black/25 rounded-xl p-2.5 border border-white/5 text-center">
                          <div className={`text-base font-black ${color} tabular-nums`}>{val}</div>
                          <div className="text-[8px] font-bold text-gray-600 uppercase">{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Quote */}
                    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3 mb-4 relative">
                      <span className="absolute -top-2 -left-1 text-2xl text-gray-700 font-serif">"</span>
                      <p className="text-xs text-gray-400 italic leading-relaxed pl-2">{listing.note}</p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2.5">
                      <AnimatePresence mode="wait">
                        {invitedIds.includes(listing.id) ? (
                          <motion.button key="invited"
                            initial={{ scale: 0.85 }} animate={{ scale: 1 }}
                            className="flex-1 py-3 bg-emerald-700/30 border border-emerald-500/30 text-emerald-400 font-black rounded-2xl flex items-center justify-center gap-2 text-xs uppercase tracking-widest cursor-default"
                          >
                            <Check size={14} /> Davet Gönderildi
                          </motion.button>
                        ) : (
                          <motion.button key="invite" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                            onClick={() => handleInvite(listing.id, listing.name)}
                            className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
                          >
                            <UserPlus size={14} /> Davet Et
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FAB */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-[#070B10] via-[#070B10]/90 to-transparent pointer-events-none z-40">
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black rounded-2xl shadow-[0_0_40px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 pointer-events-auto text-sm uppercase tracking-widest"
          onClick={() => showToast('İlan oluşturma ekranı açılıyor...')}
        >
          {activeTab === 'LFP' ? '+ İlan Oluştur' : '+ Kendini Sergile'}
          <ChevronRight size={18} />
        </motion.button>
      </div>
    </div>
  );
};

export default TransferCenter;
