import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, MapPin, Users, Shield,
  Zap, Activity, X, Lock, Check, CheckCircle2, Swords, Target,
  Feather, Scale, Wallet, Radio, KeyRound,
} from 'lucide-react';
import { AppView } from '../types';
import { PageLayout } from '../components/common/PageLayout';
import { AnimatedButton } from '../components/AnimatedButton';
import SharedPitch from '../components/SharedPitch';
import PitchDiscovery from './PitchDiscovery';
import MatchSquadPicker, { PickedPlayer } from '../components/social/MatchSquadPicker';
import { useMatchCreate, FORMATS } from '../hooks/useMatchCreate';

interface MatchCreateProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

// ─── Sabitler (canlı kullanılan) ────────────────────────────────────────────
const GENDER_OPTIONS = ['Karma', 'Erkek', 'Kadın'];
const AGE_OPTIONS = ['10-14', '14-16', '16-18', '18-22', '23-27', '28-35', '35+', 'Tümü'];
const MENTALITY_OPTIONS = [
  { id: 'ciddi', title: 'Ciddi', subtitle: 'Rekabetçi', icon: Zap, color: '#FF4D4D' },
  { id: 'taktiksel', title: 'Taktiksel', subtitle: 'Sistem', icon: Target, color: '#FACC15' },
  { id: 'rahat', title: 'Rahat', subtitle: 'Eğlence', icon: Feather, color: '#39FF14' },
] as const;
const MENTALITY_META: Record<string, { label: string; color: string }> = {
  ciddi: { label: 'Ciddi', color: '#FF4D4D' },
  taktiksel: { label: 'Taktiksel', color: '#FACC15' },
  rahat: { label: 'Rahat', color: '#39FF14' },
};

// ─── Canlı Maç Kartı bilgi çipi ──────────────────────────────────────────────
const InfoChip: React.FC<{ label: string; value: string; empty?: boolean; accent?: boolean }> = ({ label, value, empty, accent }) => (
  <div className={`flex-1 min-w-0 rounded-2xl border px-3 py-2.5 ${
    empty ? 'border-dashed border-[#FACC15]/45 bg-[#FACC15]/[0.05]' : 'border-white/8 bg-black/30'
  }`}>
    <div className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35">{label}</div>
    <div className={`text-[13px] font-black truncate mt-0.5 ${empty ? 'text-[#FACC15]' : accent ? 'text-[#39FF14]' : 'text-white'}`}>{value}</div>
  </div>
);

// ─── Aksiyon Kartı ───────────────────────────────────────────────────────────
const ActionCard: React.FC<{
  label: string; value: string; sub?: string; icon: React.ReactNode;
  state?: 'ok' | 'need' | 'default'; onClick: () => void;
}> = ({ label, value, sub, icon, state = 'default', onClick }) => (
  <motion.button
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`relative overflow-hidden rounded-2xl border p-3.5 text-left transition-colors min-h-[76px] ${
      state === 'ok'
        ? 'bg-[#39FF14]/[0.05] border-[#39FF14]/30'
        : state === 'need'
          ? 'bg-[#FACC15]/[0.04] border-dashed border-[#FACC15]/35'
          : 'bg-white/[0.03] border-white/10 hover:border-white/20'
    }`}
  >
    <div className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] ${state === 'ok' ? 'text-[#39FF14]' : 'text-white/40'}`}>
      {icon}{label}
    </div>
    <div className={`text-[13px] font-black mt-1.5 leading-tight ${state === 'need' ? 'text-[#FACC15]' : 'text-white'}`}>{value}</div>
    {sub && <div className="text-[10px] text-white/45 mt-0.5 truncate">{sub}</div>}
    <ChevronRight size={14} className="absolute right-3 top-3.5 text-white/25" />
  </motion.button>
);

// ─── Checklist Pill ──────────────────────────────────────────────────────────
const ChecklistPill: React.FC<{ ok: boolean; label: string; soft?: boolean }> = ({ ok, label, soft }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border ${
    ok
      ? 'text-[#39FF14] border-[#39FF14]/35 bg-[#39FF14]/[0.06]'
      : soft
        ? 'text-[#FACC15] border-[#FACC15]/30 bg-[#FACC15]/[0.05]'
        : 'text-white/40 border-white/10 bg-white/[0.02]'
  }`}>
    {ok ? <Check size={10} strokeWidth={3} /> : <Radio size={9} />}{label}
  </span>
);

// ─── Ana Bileşen ───────────────────────────────────────────────────────────────
const MatchCreate: React.FC<MatchCreateProps> = ({ onBack, onNavigate }) => {
  const {
    activeSheet, setActiveSheet,
    isPublishing,
    selectedSlotForPicker, setSelectedSlotForPicker,
    format, setFormat,
    dna, setDna,
    setManualBudget,
    matchTitle, setMatchTitle,
    homeTeamName, setHomeTeamName,
    awayTeamName, setAwayTeamName,
    visibility, setVisibility,
    isTeamMatch, setIsTeamMatch,
    homeTeamId,
    setMyPlayers,
    selectedPitch, setSelectedPitch,
    selectedTimeSlot, setSelectedTimeSlot,
    orientation,
    isDraftMode,
    perTeam, isReady,
    handleSlotMove, pitchSlots,
    costPerPerson,
    loadSquadFromTeam, readiness, squadCount,
    publishMatch,
  } = useMatchCreate(onNavigate);

  const assignedIds = useMemo(
    () => pitchSlots.filter(s => s.player).map(s => (s.player as any).id as string),
    [pitchSlots],
  );
  const openSlotCount = Math.max(0, perTeam - squadCount);
  const mentality = MENTALITY_META[dna.mentality] || MENTALITY_META.rahat;
  const dateLabel = selectedTimeSlot ? `${selectedTimeSlot.date} · ${selectedTimeSlot.time}` : null;

  // Seçilen arkadaşları boş slotlara yerleştir (dokunulan slot önceliklidir).
  const addPlayersToSlots = (players: PickedPlayer[]) => {
    setMyPlayers(prev => {
      const next = { ...prev };
      players.forEach(p => { for (const k in next) { if (next[k].id === p.id) delete next[k]; } });
      let empties = pitchSlots.filter(s => !next[s.id]);
      if (selectedSlotForPicker) {
        const target = empties.find(s => s.id === selectedSlotForPicker);
        if (target) empties = [target, ...empties.filter(s => s.id !== selectedSlotForPicker)];
      }
      let i = 0;
      players.forEach(p => {
        if (i < empties.length) {
          next[empties[i].id] = { id: p.id, name: p.name, avatar: p.avatar || '', status: 'PENDING' };
          i++;
        }
      });
      return next;
    });
    setSelectedSlotForPicker(null);
  };

  return (
    <PageLayout title="Maç Oluştur" onBack={onBack} scrollable className="bg-[#06080A]">
      {/* Ambient */}
      <div className="absolute top-10 -right-24 w-72 h-72 bg-[#39FF14]/[0.06] blur-[110px] rounded-full pointer-events-none" />
      <div className="absolute bottom-40 -left-24 w-72 h-72 bg-[#FACC15]/[0.05] blur-[110px] rounded-full pointer-events-none" />

      <div className="relative z-10 px-4 pt-4 pb-[248px] space-y-4">

        {/* ── 1. Canlı Maç Kartı ── */}
        <div className="relative overflow-hidden rounded-3xl border border-[#FACC15]/25 p-4 bg-[linear-gradient(150deg,rgba(250,204,21,0.09),rgba(255,255,255,0.02)_55%,transparent)]">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-[#FACC15] to-transparent opacity-80" />
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black italic text-white tracking-tight">{format.label}</span>
              <span className="text-[11px] font-black text-[#FACC15]">{format.players} OYUNCU</span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest rounded-full px-2.5 py-1 border"
              style={{ color: mentality.color, borderColor: mentality.color + '55', background: mentality.color + '18' }}>
              {mentality.label}
            </span>
          </div>
          <div className="flex gap-2 mt-3">
            <InfoChip label="Ne zaman" value={dateLabel || '+ Ekle'} empty={!dateLabel} />
            <InfoChip label="Saha" value={selectedPitch?.name || '+ Seç'} empty={!selectedPitch} />
            <InfoChip label="Kişi başı" value={costPerPerson > 0 ? `${costPerPerson}₺` : 'Ücretsiz'} accent={costPerPerson > 0} />
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full bg-[#39FF14] transition-all duration-500" style={{ width: `${Math.min(100, (squadCount / perTeam) * 100)}%` }} />
            </div>
            <span className="text-[10px] font-black text-white/60 tabular-nums">{squadCount}/{perTeam}</span>
          </div>
        </div>

        {/* ── 2. Dizilim Sahası ── */}
        <div className="flex flex-col items-center">
          {isDraftMode && (
            <div className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400">
              <Lock size={12} /> Sabit tesis · taslaktan
            </div>
          )}
          <div className={`w-full transition-all ${orientation === 'horizontal' ? 'max-w-[520px]' : 'max-w-[360px]'} drop-shadow-[0_16px_40px_rgba(0,0,0,0.7)]`}>
            <SharedPitch
              mode="edit"
              slots={pitchSlots}
              orientation={orientation}
              onSlotMove={handleSlotMove}
              onSlotClick={(id) => { setSelectedSlotForPicker(id); setActiveSheet('PLAYER_PICKER'); }}
              onDropPlayer={(slotId, player) => {
                setMyPlayers(prev => {
                  const next = { ...prev };
                  for (const k in next) { if (next[k].id === (player as any).id) delete next[k]; }
                  next[slotId] = { ...(player as any), avatar: (player as any).avatar || '', status: 'PENDING' as const };
                  return next;
                });
              }}
            />
          </div>
        </div>

        {/* ── 3. Hızlı Kontrol Rayı ── */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-[54px] shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-white/40">Format</span>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5 flex-1">
              {FORMATS.map(f => (
                <button key={f.v} onClick={() => setFormat(f)} disabled={isDraftMode}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border disabled:opacity-40 ${
                    format.v === f.v ? 'bg-[#39FF14] text-[#0A0E14] border-[#39FF14] shadow-[0_0_14px_rgba(57,255,20,0.3)]' : 'bg-white/[0.03] border-white/10 text-white/70'
                  }`}>{f.v}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[54px] shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-white/40">Görünür</span>
            <div className="flex gap-1.5">
              {(['OPEN', 'PRIVATE'] as const).map(v => (
                <button key={v} onClick={() => setVisibility(v)}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all border ${
                    visibility === v ? (v === 'OPEN' ? 'bg-[#39FF14] text-[#0A0E14] border-[#39FF14]' : 'bg-[#FACC15] text-[#0A0E14] border-[#FACC15]') : 'bg-white/[0.03] border-white/10 text-white/70'
                  }`}>{v === 'OPEN' ? 'Açık' : 'Özel'}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[54px] shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-white/40">Sertlik</span>
            <div className="flex gap-1.5">
              {MENTALITY_OPTIONS.map(m => (
                <button key={m.id} onClick={() => setDna({ ...dna, mentality: m.id })}
                  className="px-3.5 py-1.5 rounded-xl text-[10px] font-black transition-all border"
                  style={dna.mentality === m.id
                    ? { color: '#0A0E14', background: m.color, borderColor: m.color }
                    : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                  {m.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 4. Aksiyon Kartları ── */}
        <div className="grid grid-cols-2 gap-2.5">
          <ActionCard label="Saha & Saat" value={selectedPitch ? selectedPitch.name : 'Saha seç'}
            sub={selectedPitch ? (dateLabel || 'Saat seç') : 'Nerede & ne zaman?'}
            icon={<MapPin size={12} />} state={selectedPitch && selectedTimeSlot ? 'ok' : 'need'}
            onClick={() => { if (!isDraftMode) setActiveSheet('PITCH'); }} />
          <ActionCard label="Kadro" value={`${squadCount} / ${perTeam} dizildi`}
            sub={openSlotCount > 0 ? 'Arkadaş / takım çağır' : 'Kadro tamam ✓'}
            icon={<Users size={12} />} state={squadCount > 0 ? 'ok' : 'default'}
            onClick={() => { setSelectedSlotForPicker(null); setActiveSheet('PLAYER_PICKER'); }} />
          <ActionCard label="Kaleci & Hakem" value="Pro destek çağır" sub="Eksik kaleyi / hakemi doldur"
            icon={<Shield size={12} />} onClick={() => setActiveSheet('SUPPORT')} />
          <ActionCard label="Gelişmiş" value="Yaş · Cinsiyet · Ücret" sub="Rakip daveti · takım adları"
            icon={<Activity size={12} />} onClick={() => setActiveSheet('RULES')} />
        </div>
      </div>

      {/* ── Fırlatma Rampası (sabit alt) ── */}
      <div className="absolute bottom-0 inset-x-0 z-30 px-4 pt-10 pb-6 bg-gradient-to-t from-[#06080A] via-[#06080A]/95 to-transparent pb-safe">
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <ChecklistPill ok={readiness.hasPitch} label="Saha" />
          <ChecklistPill ok={readiness.hasTime} label="Saat" />
          <ChecklistPill ok={squadCount > 0} label={`Kadro ${squadCount}/${perTeam}`} soft />
        </div>
        <AnimatedButton
          onClick={async () => { if (isReady) { await publishMatch(); } else { setActiveSheet('PITCH'); } }}
          isLoading={isPublishing}
          disabled={isPublishing}
          className="w-full h-[58px]"
          style={{
            background: readiness.canPublish ? '#39FF14' : 'rgba(255,255,255,0.05)',
            color: readiness.canPublish ? '#0A0E14' : 'rgba(255,255,255,0.4)',
            boxShadow: readiness.canPublish && !isPublishing ? '0 0 28px rgba(57,255,20,0.3)' : 'none',
          }}
        >
          {readiness.canPublish
            ? (isDraftMode ? 'DAVETLERİ GÖNDER & YAYINLA' : 'YAYINLA & DAVET ET')
            : (readiness.blockReason || 'YAYINLA & DAVET ET').toLocaleUpperCase('tr-TR')}
        </AnimatedButton>
      </div>

      {/* ── ALT SHEET'LER ── */}
      <AnimatePresence>
        {activeSheet === 'PITCH' && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 z-50 bg-[#0A0E14] flex flex-col">
            <PitchDiscovery
              onBack={() => setActiveSheet('NONE')}
              isSelectionMode
              onSelectTime={(pitch: any, _court: any, date: string, time: string) => {
                setSelectedPitch(pitch);
                setSelectedTimeSlot({ date, time });
                setActiveSheet('NONE');
              }}
            />
          </motion.div>
        )}

        {activeSheet === 'PLAYER_PICKER' && (
          <MatchSquadPicker
            onClose={() => setActiveSheet('NONE')}
            assignedIds={assignedIds}
            openSlotCount={openSlotCount}
            onAddFriends={addPlayersToSlots}
            onPickTeam={async (teamId, teamName) => { await loadSquadFromTeam(teamId, teamName); }}
          />
        )}

        {activeSheet === 'SUPPORT' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end" onClick={() => setActiveSheet('NONE')}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} onClick={e => e.stopPropagation()} className="w-full bg-[#0D1117] border-t border-white/10 rounded-t-[32px] p-6 pb-10 pb-safe">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />
              <h2 className="text-lg font-black text-white italic uppercase tracking-tight mb-1">Pro Destek Merkezi</h2>
              <p className="text-xs text-gray-500 mb-6">Maçın için profesyonel kaleci veya hakem çağır.</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <button onClick={() => { setActiveSheet('NONE'); onNavigate('MARKETPLACE_GK'); }} className="p-5 rounded-3xl bg-[#161B22]/80 border border-emerald-500/20 hover:border-emerald-500/50 transition-all flex flex-col items-center text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center"><Shield size={24} /></div>
                  <div><h3 className="text-sm font-black italic uppercase text-white">Kaleci Çağır</h3><p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-wider">Eksik Kaleyi Doldur</p></div>
                </button>
                <button onClick={() => { setActiveSheet('NONE'); onNavigate('MARKETPLACE_REF'); }} className="p-5 rounded-3xl bg-[#161B22]/80 border border-blue-500/20 hover:border-blue-500/50 transition-all flex flex-col items-center text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center"><Scale size={24} /></div>
                  <div><h3 className="text-sm font-black italic uppercase text-white">Hakem Çağır</h3><p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-wider">Profesyonel Yönetim</p></div>
                </button>
              </div>
              <button onClick={() => setActiveSheet('NONE')} className="w-full h-12 bg-white/5 border border-white/10 text-white font-black uppercase text-xs rounded-2xl tracking-widest">Kapat</button>
            </motion.div>
          </motion.div>
        )}

        {activeSheet === 'RULES' && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 z-50 bg-[#0A0E14] flex flex-col pt-safe">
            <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h2 className="text-lg font-black text-white italic tracking-tight uppercase">Gelişmiş Ayarlar</h2>
              <button onClick={() => setActiveSheet('NONE')} className="p-3 bg-white/5 rounded-full text-white hover:bg-white/10 border border-white/5"><X size={18} /></button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar pb-safe">

              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Maç Adı <span className="text-white/25 normal-case font-normal">(opsiyonel)</span></p>
                <input type="text" value={matchTitle} onChange={e => setMatchTitle(e.target.value)} placeholder="Süper Lig Derbisi…" maxLength={40}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-white/20 focus:outline-none focus:border-[#FACC15]/40" />
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Görünürlük</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setVisibility('OPEN')} className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-all ${visibility === 'OPEN' ? 'bg-[#39FF14]/10 border-[#39FF14]/50' : 'bg-white/[0.02] border-white/10'}`}>
                    <span className={`text-xs font-black uppercase ${visibility === 'OPEN' ? 'text-[#39FF14]' : 'text-white'}`}>Açık</span>
                    <span className="text-[9px] text-white/40 font-bold leading-tight">Vitrinde herkes görür</span>
                  </button>
                  <button onClick={() => setVisibility('PRIVATE')} className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-all ${visibility === 'PRIVATE' ? 'bg-[#FACC15]/10 border-[#FACC15]/50' : 'bg-white/[0.02] border-white/10'}`}>
                    <span className={`text-xs font-black uppercase ${visibility === 'PRIVATE' ? 'text-[#FACC15]' : 'text-white'}`}>Özel</span>
                    <span className="text-[9px] text-white/40 font-bold leading-tight">Sadece kodla katılım</span>
                  </button>
                </div>
                {visibility === 'PRIVATE' && (
                  <p className="text-[9px] text-[#FACC15]/70 font-bold leading-relaxed pt-1 flex items-center gap-1.5">
                    <KeyRound size={11} /> Maç oluşturulunca lobide paylaşılabilir bir katılım kodu görünür.
                  </p>
                )}
              </div>

              <button
                onClick={() => { const next = !isTeamMatch; setIsTeamMatch(next); if (next) setVisibility('PRIVATE'); }}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all ${isTeamMatch ? 'bg-red-500/10 border-red-500/50' : 'bg-white/[0.02] border-white/10'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isTeamMatch ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-gray-400'}`}><Swords size={20} /></div>
                  <div className="min-w-0">
                    <p className={`text-sm font-black italic uppercase tracking-tight ${isTeamMatch ? 'text-white' : 'text-gray-300'}`}>Rakip Takım Davet Et</p>
                    <p className="text-[10px] text-gray-500 font-bold leading-tight truncate">{homeTeamId ? `${homeTeamName || 'Takımın'} vs rakip — kodla davet` : 'Takım maçı: kodu rakibe gönder'}</p>
                  </div>
                </div>
                <div className={`w-[52px] h-7 rounded-full p-1 flex items-center shrink-0 transition-colors ${isTeamMatch ? 'bg-red-500' : 'bg-[#0A0E14] border border-white/10'}`}>
                  <motion.div animate={{ x: isTeamMatch ? 24 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} className={`w-5 h-5 rounded-full ${isTeamMatch ? 'bg-white' : 'bg-gray-500'}`} />
                </div>
              </button>

              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Cinsiyet</p>
                  <div className="flex bg-white/[0.02] p-1 rounded-xl border border-white/10">
                    {GENDER_OPTIONS.map(g => (
                      <button key={g} onClick={() => setDna({ ...dna, gender: g })} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${dna.gender === g ? 'bg-white/20 text-white border border-white/30' : 'text-white/70'}`}>{g}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-[1.5] space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Yaş Grubu</p>
                  <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-1">
                    {AGE_OPTIONS.map(a => (
                      <button key={a} onClick={() => setDna(prev => ({ ...prev, age: prev.age.includes(a) ? prev.age.filter(x => x !== a) : [...prev.age, a] }))}
                        className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black transition-all border ${dna.age.includes(a) ? 'bg-[#FACC15]/10 border-[#FACC15]/50 text-[#FACC15]' : 'bg-white/[0.02] border-white/10 text-white/70'}`}>{a}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Oyun Sertliği</p>
                <div className="flex flex-col gap-2">
                  {MENTALITY_OPTIONS.map(m => (
                    <button key={m.id} onClick={() => setDna({ ...dna, mentality: m.id })}
                      className="h-12 w-full rounded-2xl px-4 flex items-center justify-between border transition-all"
                      style={dna.mentality === m.id ? { backgroundColor: `${m.color}18`, borderColor: `${m.color}66` } : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.1)' }}>
                      <div className="flex items-center gap-3">
                        <m.icon size={16} style={{ color: dna.mentality === m.id ? m.color : '#fff' }} />
                        <span className="text-base font-black italic uppercase tracking-tight text-white">{m.title}</span>
                      </div>
                      <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={dna.mentality === m.id ? { backgroundColor: m.color, borderColor: 'transparent' } : { borderColor: 'rgba(255,255,255,0.4)' }}>
                        {dna.mentality === m.id && <CheckCircle2 size={10} className="text-black" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5"><Wallet size={12} /> Ücret (Kişi Başı)</p>
                  <span className="text-sm font-black text-white">{costPerPerson > 0 ? `${costPerPerson} ₺` : 'Ücretsiz'}</span>
                </div>
                <input type="range" min="0" max="500" step="10" value={costPerPerson} onChange={e => setManualBudget(parseInt(e.target.value))} className="w-full accent-[#FACC15]" />
                <div className="flex justify-between text-[9px] text-white/25 font-bold"><span>Ücretsiz</span><span>500 ₺</span></div>
              </div>

              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Takım Adları <span className="text-white/25 normal-case font-normal">(opsiyonel)</span></p>
                <div className="flex gap-3">
                  <input type="text" value={homeTeamName} onChange={e => setHomeTeamName(e.target.value)} placeholder="Ev Sahibi" maxLength={20} className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-white/20 focus:outline-none focus:border-[#39FF14]/40" />
                  <input type="text" value={awayTeamName} onChange={e => setAwayTeamName(e.target.value)} placeholder="Deplasman" maxLength={20} className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-white/20 focus:outline-none focus:border-red-400/40" />
                </div>
              </div>

              <button onClick={() => setActiveSheet('NONE')} className="w-full h-[56px] mt-2 bg-[#FACC15] text-[#0A0E14] font-black italic uppercase text-lg rounded-[20px] active:scale-95 shadow-[0_0_30px_rgba(250,204,21,0.4)]">Onayla</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
};

export default MatchCreate;
