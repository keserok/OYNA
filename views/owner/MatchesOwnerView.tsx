import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Trophy, Clock, CheckCircle, AlertCircle, ChevronRight,
  Users, MapPin, Calendar, Star, Shield, Loader2
} from 'lucide-react';
import { useAppStore } from '../../store';
import { AppView, MatchListing } from '../../types';
import ScoreEntryDrawer from './ScoreEntryDrawer';

interface MatchesOwnerViewProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

type Tab = 'TODAY' | 'UPCOMING' | 'PAST';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'TODAY', label: 'Bugün', icon: Clock },
  { id: 'UPCOMING', label: 'Yaklaşan', icon: Calendar },
  { id: 'PAST', label: 'Geçmiş', icon: Trophy }
];

const isSameDay = (dateStr: string, target: Date): boolean => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return (
    d.getFullYear() === target.getFullYear() &&
    d.getMonth() === target.getMonth() &&
    d.getDate() === target.getDate()
  );
};

const MatchCard: React.FC<{
  match: MatchListing;
  onEnterScore: () => void;
}> = ({ match, onEnterScore }) => {
  // Skor durumu rozeti
  const hasScore = typeof match.homeScore === 'number' && typeof match.awayScore === 'number';
  const isLocked = (match as any).scoreLockedAt;
  const homeApproved = (match as any).homeCaptainApproved;
  const awayApproved = (match as any).awayCaptainApproved;
  const hasReferee = !!match.refereeId;

  let statusBadge: { label: string; color: string; bg: string } = {
    label: 'BEKLİYOR',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/30'
  };

  if (isLocked) {
    statusBadge = { label: 'ONAYLI', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
  } else if (hasScore) {
    const approvalCount = (homeApproved ? 1 : 0) + (awayApproved ? 1 : 0);
    statusBadge = {
      label: `KAPTAN ONAYI ${approvalCount}/2`,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10 border-yellow-500/30'
    };
  } else if (hasReferee) {
    statusBadge = {
      label: 'HAKEM GİRECEK',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/30'
    };
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#161B22] border border-white/5 rounded-3xl p-5 hover:border-white/10 transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-white italic uppercase tracking-tight truncate">
            {match.title || 'Maç'}
          </h3>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            <span className="flex items-center gap-1">
              <Clock size={10} /> {match.time}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={10} /> {match.location}
            </span>
          </div>
        </div>
        <span
          className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest shrink-0 ${statusBadge.bg} ${statusBadge.color}`}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* Score Display */}
      {hasScore ? (
        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-center">
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1 truncate">
                {(match as any).homeTeamName || 'Ev Sahibi'}
              </p>
              <p className="text-4xl font-black text-white">{match.homeScore}</p>
              {homeApproved && (
                <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-bold mt-1">
                  <CheckCircle size={9} /> ONAYLI
                </span>
              )}
            </div>
            <span className="text-gray-700 font-black text-xl">−</span>
            <div className="flex-1 text-center">
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1 truncate">
                {(match as any).awayTeamName || 'Deplasman'}
              </p>
              <p className="text-4xl font-black text-white">{match.awayScore}</p>
              {awayApproved && (
                <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-bold mt-1">
                  <CheckCircle size={9} /> ONAYLI
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 mb-4 flex items-center justify-center gap-3 text-gray-500">
          <Trophy size={20} className="opacity-30" />
          <span className="text-xs font-bold uppercase tracking-widest">Skor henüz girilmedi</span>
        </div>
      )}

      {/* Action */}
      {!hasScore && !hasReferee && (
        <button
          onClick={onEnterScore}
          className="w-full py-3 bg-[#FFFF00] hover:bg-yellow-300 text-black font-black text-xs uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,0,0.3)] transition-all active:scale-95"
        >
          <Trophy size={14} /> SKORU GİR
        </button>
      )}
      {!hasScore && hasReferee && (
        <div className="w-full py-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 font-bold text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2">
          <Shield size={14} /> Bu maçın hakemi atanmış - skor hakemde
        </div>
      )}
      {hasScore && !isLocked && (
        <div className="w-full py-3 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 font-bold text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2">
          <Clock size={14} /> Kaptanlar onayı bekleniyor ({(homeApproved ? 1 : 0) + (awayApproved ? 1 : 0)}/2)
        </div>
      )}
      {isLocked && (
        <div className="w-full py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2">
          <CheckCircle size={14} /> Skor onaylandı ve mühürlendi
        </div>
      )}
    </motion.div>
  );
};

const MatchesOwnerView: React.FC<MatchesOwnerViewProps> = ({ onBack }) => {
  const { adminMatches } = useAppStore();
  const [tab, setTab] = useState<Tab>('TODAY');
  const [scoreEntryMatch, setScoreEntryMatch] = useState<MatchListing | null>(null);

  const today = useMemo(() => new Date(), []);

  const filteredMatches = useMemo(() => {
    return adminMatches.filter((m: MatchListing) => {
      const matchDate = (m as any).matchDatetime || m.date;
      if (!matchDate) return tab === 'UPCOMING'; // Tarihi yoksa yaklaşana koy
      const d = new Date(matchDate);
      if (tab === 'TODAY') return isSameDay(matchDate, today);
      if (tab === 'UPCOMING') return d > today && !isSameDay(matchDate, today);
      if (tab === 'PAST') return d < today;
      return false;
    });
  }, [adminMatches, tab, today]);

  const pendingScoreCount = useMemo(() => {
    return adminMatches.filter((m: MatchListing) => {
      const matchDate = (m as any).matchDatetime || m.date;
      if (!matchDate) return false;
      const d = new Date(matchDate);
      const hasScore = typeof m.homeScore === 'number';
      // Bugün/geçmiş + skor girilmemiş + hakem yok
      return d <= today && !hasScore && !m.refereeId;
    }).length;
  }, [adminMatches, today]);

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col">
      {/* HEADER */}
      <header className="bg-[#0A0E14]/95 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-20">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-2xl bg-[#161B22] hover:bg-white/10 border border-white/5 flex items-center justify-center"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-lg font-black text-white italic tracking-tight uppercase">Maçlar</h1>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                {pendingScoreCount > 0 ? `${pendingScoreCount} maçta skor bekliyor` : 'Tüm skorlar girildi'}
              </p>
            </div>
          </div>
          {pendingScoreCount > 0 && (
            <div className="px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded-xl flex items-center gap-2">
              <AlertCircle size={14} className="text-orange-400" />
              <span className="text-xs font-black text-orange-400">{pendingScoreCount}</span>
            </div>
          )}
        </div>

        {/* TABS */}
        <div className="flex border-t border-white/5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${
                  isActive
                    ? 'border-[#FFFF00] text-[#FFFF00] bg-[#FFFF00]/5'
                    : 'border-transparent text-gray-500 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 pb-12">
        <AnimatePresence mode="popLayout">
          {filteredMatches.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <Trophy size={64} className="text-gray-700 mx-auto mb-4" />
              <p className="text-white font-bold mb-2">
                {tab === 'TODAY' ? 'Bugün için maç yok' : tab === 'UPCOMING' ? 'Yaklaşan maç yok' : 'Geçmiş maç yok'}
              </p>
              <p className="text-xs text-gray-500">
                {tab === 'TODAY'
                  ? 'Bugün organize edilen bir maç yok'
                  : tab === 'UPCOMING'
                  ? 'Yeni rezervasyonlar burada görünecek'
                  : 'Geçmiş maçlar burada listelenir'}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3 max-w-2xl mx-auto">
              {filteredMatches.map((match: MatchListing) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onEnterScore={() => setScoreEntryMatch(match)}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* SCORE ENTRY DRAWER */}
      <AnimatePresence>
        {scoreEntryMatch && (
          <ScoreEntryDrawer
            matchId={scoreEntryMatch.id}
            matchTitle={scoreEntryMatch.title}
            homeTeamName={(scoreEntryMatch as any).homeTeamName || 'Ev Sahibi'}
            awayTeamName={(scoreEntryMatch as any).awayTeamName || 'Deplasman'}
            enteredByRole="OWNER"
            onClose={() => setScoreEntryMatch(null)}
            onSubmitted={() => setScoreEntryMatch(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default MatchesOwnerView;
