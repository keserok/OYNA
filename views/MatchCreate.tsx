import React, { useMemo, useState, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, MapPin, Users, Shield,
  Zap, Activity, X, Lock, CheckCircle2, Swords, Target,
  Feather, Wallet, KeyRound, ShieldCheck, Undo2, Clock,
} from 'lucide-react';
import { AppView } from '../types';
import { useAppStore } from '../store';
import { PageLayout } from '../components/common/PageLayout';
import { AnimatedButton } from '../components/AnimatedButton';
import { Spinner } from '../components/ui/Spinner';
import SharedPitch from '../components/SharedPitch';
import PitchDiscovery from './PitchDiscovery';
import MatchSquadPicker, { PickedPlayer } from '../components/social/MatchSquadPicker';
import ProviderOfferPicker from '../components/social/ProviderOfferPicker';
import { useMatchCreate, FORMATS } from '../hooks/useMatchCreate';
import { PLAY_STYLE_META } from './onboarding/onboardingShared';

// Cüzdan yükleme overlay'i — maç kurulum formu kaybolmadan bakiye tamamlanır.
const WalletScreen = lazy(() => import('./WalletScreen'));

interface MatchCreateProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

// ─── Sabitler (canlı kullanılan) ────────────────────────────────────────────
const GENDER_OPTIONS = ['Karma', 'Erkek', 'Kadın'];
const AGE_OPTIONS = ['10-14', '14-16', '16-18', '18-22', '23-27', '28-35', '35+', 'Tümü'];
// Renkler TEK kaynaktan (PLAY_STYLE_META — kanonik K/S/Y paleti): profil ve
// onboarding'deki "Oyun Stili" ile maçtaki "Sertlik" aynı kimlik renklerini taşır.
const MENTALITY_OPTIONS = [
  { id: 'ciddi', title: 'Ciddi', subtitle: 'Rekabetçi', icon: Zap, color: PLAY_STYLE_META.ciddi.color },
  { id: 'taktiksel', title: 'Taktiksel', subtitle: 'Sistem', icon: Target, color: PLAY_STYLE_META.taktiksel.color },
  { id: 'rahat', title: 'Rahat', subtitle: 'Eğlence', icon: Feather, color: PLAY_STYLE_META.rahat.color },
] as const;
const MENTALITY_META: Record<string, { label: string; color: string }> = {
  ciddi: { label: 'Ciddi', color: PLAY_STYLE_META.ciddi.color },
  taktiksel: { label: 'Taktiksel', color: PLAY_STYLE_META.taktiksel.color },
  rahat: { label: 'Rahat', color: PLAY_STYLE_META.rahat.color },
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

// ─── İade kuralı satırı (Kapora & İade Kuralları sayfası) ────────────────────
const RuleRow: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="flex gap-3.5 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
    <div className="w-9 h-9 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/25 text-[#39FF14] flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[13px] font-black text-white leading-tight">{title}</p>
      <p className="text-[11px] text-white/55 leading-relaxed mt-1">{children}</p>
    </div>
  </div>
);

// ─── Ana Bileşen ───────────────────────────────────────────────────────────────
const MatchCreate: React.FC<MatchCreateProps> = ({ onBack, onNavigate }) => {
  const {
    activeSheet, setActiveSheet,
    isPublishing,
    selectedSlotForPicker, setSelectedSlotForPicker,
    format, setFormat,
    dna, setDna,
    matchTitle, setMatchTitle,
    homeTeamName, setHomeTeamName,
    awayTeamName, setAwayTeamName,
    visibility, setVisibility,
    isTeamMatch, setIsTeamMatch,
    homeTeamId,
    deferredProviders, setDeferredProviders,
    setMyPlayers,
    selectedPitch, setSelectedPitch,
    selectedTimeSlot, setSelectedTimeSlot,
    orientation,
    isDraftMode,
    perTeam, isReady,
    handleSlotMove, pitchSlots,
    costPerPerson, matchDeposit,
    loadSquadFromTeam, readiness, squadCount,
    spendableBalance, missingBalance, refreshWallet,
    publishMatch,
  } = useMatchCreate(onNavigate);

  const setSocialTarget = useAppStore(s => s.setSocialTarget);
  // Mesafeli Satış / İptal-İade tam metni — paket içi statik sayfa, overlay'de
  // açılır (LEGAL ekranına navigasyon formu sıfırlardı; burada form korunur).
  const [showLegalDoc, setShowLegalDoc] = useState(false);

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
            <InfoChip label="Ne zaman" value={dateLabel || '—'} empty={!dateLabel} />
            <InfoChip label="Saha" value={selectedPitch?.name || '—'} empty={!selectedPitch} />
            <InfoChip label="Kişi başı" value={costPerPerson > 0 ? `${costPerPerson}₺` : '—'} accent={costPerPerson > 0} empty={costPerPerson <= 0} />
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
                  }`}>{v === 'OPEN' ? 'Herkese açık' : 'Kod ile'}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[54px] shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-white/40">Sertlik</span>
            <div className="flex gap-1.5">
              {/* Her seçenek DAİMA kendi kimlik renginde: seçili → dolu, değil → tonlu */}
              {MENTALITY_OPTIONS.map(m => (
                <button key={m.id} onClick={() => setDna({ ...dna, mentality: m.id })}
                  className="px-3.5 py-1.5 rounded-xl text-[10px] font-black transition-all border"
                  style={dna.mentality === m.id
                    ? { color: '#0A0E14', background: m.color, borderColor: m.color, boxShadow: `0 0 14px ${m.color}4D` }
                    : { background: `${m.color}14`, borderColor: `${m.color}45`, color: m.color }}>
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
          <ActionCard label="Kaleci & Hakem"
            value={deferredProviders.length > 0 ? `${deferredProviders.length} hizmet · teklif` : 'Pro destek çağır'}
            sub={deferredProviders.length > 0 ? 'Kapora sonrası teklif gider' : 'Kaleci / hakeme teklif gönder'}
            icon={<Shield size={12} />} state={deferredProviders.length > 0 ? 'ok' : 'default'}
            onClick={() => setActiveSheet('SUPPORT')} />
          <ActionCard label="Gelişmiş" value="Yaş · Cinsiyet · Ücret" sub="Rakip daveti · takım adları"
            icon={<Activity size={12} />} onClick={() => setActiveSheet('RULES')} />
        </div>
      </div>

      {/* ── Fırlatma Rampası (sabit alt) — SADE: yalnız Yayınla + İade kuralları
             linki. Kapora tutarı, bakiye durumu ve tüm kurallar dokununca açılan
             "Kapora & İade Kuralları" sayfasında (kural yoğunluğu kararı). ── */}
      <div className="absolute bottom-0 inset-x-0 z-30 px-4 pt-10 pb-6 bg-gradient-to-t from-[#06080A] via-[#06080A]/95 to-transparent pb-safe">
        {/* Yetersiz bakiye — YALNIZ sorun anında görünür (kalıcı bilgi kalabalığı yok) */}
        {readiness.canPublish && missingBalance > 0 && (
          <div className="mb-2.5 flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.08] px-3 py-2">
            <span className="text-[10px] font-bold text-red-300 leading-snug">
              Cüzdan bakiyen yetersiz — kapora için <span className="font-black">{missingBalance}₺</span> eksik.
            </span>
            <button
              onClick={() => { useAppStore.getState().setWalletInitialTab('TOPUP'); setActiveSheet('WALLET'); }}
              className="shrink-0 text-[10px] font-black text-[#0A0E14] bg-[#39FF14] rounded-lg px-2.5 py-1.5 active:scale-95 transition-transform"
            >
              Yükle
            </button>
          </div>
        )}
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
        <button
          onClick={() => { void refreshWallet(); setActiveSheet('REFUND'); }}
          className="w-full mt-2.5 flex items-center justify-center gap-1.5 text-[10px] font-bold text-white/45 hover:text-white/70 transition-colors"
        >
          <Lock size={10} className="text-[#FACC15]" />
          <span className="underline underline-offset-2">
            {matchDeposit > 0 ? `${matchDeposit}₺ kapora · İade kuralları` : 'Kapora & iade kuralları'}
          </span>
        </button>
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
                // Saat, saha vitrininden SLOT ETİKETİ ("20:00 - 21:00") olarak
                // gelir; sistem genelinde maç saati TEK başlangıç saatidir.
                // Normalize etmeden saklamak sunucudaki ::time cast'ini patlatıp
                // "Maç Yayınlanamadı"ya yol açıyordu (SQLSTATE 22009).
                const startTime = (time.replace('.', ':').match(/\d{1,2}:\d{2}/)?.[0]) || time;
                setSelectedTimeSlot({ date, time: startTime });
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
            onGoToTeamCreate={() => { setSocialTarget({ tab: 'TEAMS', subTab: 'CREATE' }); onNavigate('SOCIAL'); }}
          />
        )}

        {activeSheet === 'SUPPORT' && (
          <ProviderOfferPicker
            onClose={() => setActiveSheet('NONE')}
            onConfirm={setDeferredProviders}
            initial={deferredProviders}
          />
        )}

      </AnimatePresence>

        {activeSheet === 'RULES' && createPortal(
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 z-50 bg-[#0A0E14] flex flex-col pt-safe">
            <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h2 className="text-lg font-black text-white italic tracking-tight uppercase">Gelişmiş Ayarlar</h2>
              <button onClick={() => setActiveSheet('NONE')} className="p-3 bg-white/5 rounded-full text-white hover:bg-white/10 border border-white/5"><X size={18} /></button>
            </header>
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 space-y-7 custom-scrollbar pb-safe">

              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Maç Adı <span className="text-white/25 normal-case font-normal">(opsiyonel)</span></p>
                <input type="text" value={matchTitle} onChange={e => setMatchTitle(e.target.value)} placeholder="Süper Lig Derbisi…" maxLength={40}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-white/20 focus:outline-none focus:border-[#FACC15]/40" />
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Görünürlük</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setVisibility('OPEN')} className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-all ${visibility === 'OPEN' ? 'bg-[#39FF14]/10 border-[#39FF14]/50' : 'bg-white/[0.02] border-white/10'}`}>
                    <span className={`text-xs font-black uppercase leading-tight ${visibility === 'OPEN' ? 'text-[#39FF14]' : 'text-white'}`}>Herkese açık maç</span>
                    <span className="text-[9px] text-white/40 font-bold leading-tight">Vitrinde herkes görür ve katılabilir</span>
                  </button>
                  <button onClick={() => setVisibility('PRIVATE')} className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-all ${visibility === 'PRIVATE' ? 'bg-[#FACC15]/10 border-[#FACC15]/50' : 'bg-white/[0.02] border-white/10'}`}>
                    <span className={`text-xs font-black uppercase leading-tight ${visibility === 'PRIVATE' ? 'text-[#FACC15]' : 'text-white'}`}>Kod ile girilen maç</span>
                    <span className="text-[9px] text-white/40 font-bold leading-tight">Sadece paylaşılan kodla katılım</span>
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
                  {/* Kimlik renkleri seçim beklenmeden görünür (seçili → dolgun, değil → tonlu) */}
                  {MENTALITY_OPTIONS.map(m => (
                    <button key={m.id} onClick={() => setDna({ ...dna, mentality: m.id })}
                      className="h-12 w-full rounded-2xl px-4 flex items-center justify-between border transition-all"
                      style={dna.mentality === m.id ? { backgroundColor: `${m.color}18`, borderColor: `${m.color}66` } : { background: `${m.color}0D`, borderColor: `${m.color}30` }}>
                      <div className="flex items-center gap-3">
                        <m.icon size={16} style={{ color: m.color }} />
                        <span className="text-base font-black italic uppercase tracking-tight" style={{ color: dna.mentality === m.id ? '#fff' : m.color }}>{m.title}</span>
                      </div>
                      <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={dna.mentality === m.id ? { backgroundColor: m.color, borderColor: 'transparent' } : { borderColor: `${m.color}66` }}>
                        {dna.mentality === m.id && <CheckCircle2 size={10} className="text-black" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5"><Wallet size={12} /> Kişi Başı Ücret</p>
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 px-4 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-black text-white">{costPerPerson > 0 ? `${costPerPerson} ₺` : '—'}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">Saha ücreti ÷ toplam oyuncu · otomatik</p>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#39FF14] border border-[#39FF14]/30 bg-[#39FF14]/[0.06] rounded-full px-2.5 py-1">Otomatik</span>
                </div>
                <p className="text-[10px] text-white/30 leading-relaxed">Sahanın toplam ücreti iki takımdaki toplam oyuncuya bölünür; kurucu değiştiremez.</p>
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
        , document.body)}

        {/* ── Kapora & İade Kuralları + Cüzdan + Yasal metin: PORTAL ile body'ye
            render edilir. Görünüm geçiş sarmalayıcısındaki transform, `fixed`
            konumlandırmayı viewport yerine kaydırılabilir konteynere bağlıyor
            (ekran kaydırılmışken sheet yarım kaplıyordu). Portal (ProfileScreen
            deseni) bunu kökten çözer: overlay her durumda TÜM ekranı örter. ── */}
        {activeSheet === 'REFUND' && createPortal((() => {
          const totalPlayers = perTeam * 2;
          const threshold = totalPlayers - 2;
          const refundOnFill = Math.max(0, matchDeposit - costPerPerson);
          return (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 z-50 bg-[#0A0E14] flex flex-col pt-safe">
              <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <h2 className="text-lg font-black text-white italic tracking-tight uppercase">Kapora & İade Kuralları</h2>
                <button onClick={() => setActiveSheet('NONE')} className="p-3 bg-white/5 rounded-full text-white hover:bg-white/10 border border-white/5"><X size={18} /></button>
              </header>
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-3 custom-scrollbar pb-safe">

                {/* Özet: kapora tutarı + cüzdan durumu */}
                <div className="rounded-2xl border border-[#FACC15]/25 bg-[#FACC15]/[0.05] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#FACC15]/70">Bu maçın kaporası</p>
                      <p className="text-2xl font-black text-[#FACC15] mt-0.5">{matchDeposit > 0 ? `${matchDeposit}₺` : '—'}</p>
                    </div>
                    {spendableBalance != null && matchDeposit > 0 && (
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/40">Cüzdan bakiyen</p>
                        <p className={`text-lg font-black mt-0.5 ${missingBalance > 0 ? 'text-red-400' : 'text-[#39FF14]'}`}>{Math.floor(spendableBalance)}₺</p>
                        {missingBalance > 0 ? (
                          <button
                            onClick={() => { useAppStore.getState().setWalletInitialTab('TOPUP'); setActiveSheet('WALLET'); }}
                            className="mt-1.5 text-[10px] font-black text-[#0A0E14] bg-[#39FF14] rounded-lg px-2.5 py-1 active:scale-95 transition-transform"
                          >
                            {missingBalance}₺ eksik · Yükle
                          </button>
                        ) : (
                          <p className="text-[9px] font-bold text-[#39FF14]/80 mt-0.5">Yeterli ✓</p>
                        )}
                      </div>
                    )}
                  </div>
                  {matchDeposit <= 0 && (
                    <p className="text-[10px] text-white/45 leading-relaxed mt-1.5">Saha ve saat seçildiğinde kapora tutarı burada görünür.</p>
                  )}
                </div>

                <RuleRow icon={<Lock size={16} />} title="Kapora cüzdanından bloke edilir">
                  Yayınladığın anda kapora cüzdan bakiyenden güvenceye alınır — para çekilmez, saha sana kilitlenir.
                </RuleRow>
                <RuleRow icon={<Users size={16} />} title={`Maç ${threshold} oyuncuda kesinleşir`}>
                  Kural: toplam kadronun 2 eksiği kadar oyuncu katıldığında maç aktifleşir. Bu maç için {totalPlayers} kişilik kadroda {threshold} oyuncuya ulaşılınca maç kesinleşir ve kapora tahsil edilir.
                </RuleRow>
                <RuleRow icon={<Undo2 size={16} />} title="Maç dolunca payın dışındaki tutar sana döner">
                  Maç dolduğunda, kaporayı ödeyen kullanıcıya ödediği tutardan 1 kişilik katılım ücreti düşülerek kalanı cüzdanına iade edilir — kaptan da herkes gibi yalnız kendi payını ödemiş olur.
                  {matchDeposit > 0 && costPerPerson > 0 && (
                    <> Bu maç için: {matchDeposit}₺ − {costPerPerson}₺ = <span className="text-[#39FF14] font-black">{refundOnFill}₺ iade</span>.</>
                  )}
                </RuleRow>
                <RuleRow icon={<ShieldCheck size={16} />} title="Maç dolmazsa tam iade">
                  Kadro eşiğe ulaşmazsa maç iptal olur ve kapora blokajı kesintisiz çözülür — kayıp yok.
                </RuleRow>
                <RuleRow icon={<Clock size={16} />} title="Kaptan iptali — 24 saat kuralı">
                  Maça 24 saatten fazla varken iptal edersen kapora iade edilir (ödeme sağlayıcı komisyonu hariç). 24 saatten az kala iade yapılmaz (no-show) ve güvenilirlik puanın düşer.
                </RuleRow>

                <button
                  onClick={() => setShowLegalDoc(true)}
                  className="w-full flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
                >
                  <span className="text-[11px] font-bold text-white/60">Mesafeli Satış ve İptal-İade koşullarının tam metni</span>
                  <ChevronRight size={15} className="text-white/30 shrink-0" />
                </button>

                <button onClick={() => setActiveSheet('NONE')} className="w-full h-[52px] mt-1 bg-[#FACC15] text-[#0A0E14] font-black italic uppercase text-base rounded-[18px] active:scale-95 transition-transform">Anladım</button>
              </div>
            </motion.div>
          );
        })(), document.body)}

        {/* ── Mesafeli Satış / İptal-İade tam metni — paket içi statik sayfa ── */}
        {showLegalDoc && createPortal(
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[70] bg-[#0A0E14] flex flex-col pt-safe">
            <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h2 className="text-base font-black text-white italic tracking-tight uppercase">Mesafeli Satış · İptal & İade</h2>
              <button onClick={() => setShowLegalDoc(false)} className="p-3 bg-white/5 rounded-full text-white hover:bg-white/10 border border-white/5"><X size={18} /></button>
            </header>
            <iframe src="/mesafeli-satis.html" title="Mesafeli Satış ve İptal-İade koşulları" className="flex-1 w-full border-0 bg-white" />
          </motion.div>,
          document.body,
        )}

        {/* ── Cüzdan yükleme overlay'i — form KAYBOLMADAN bakiye tamamlanır ── */}
        {activeSheet === 'WALLET' && createPortal(
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 z-[60] bg-[#0A0E14] overflow-y-auto overscroll-contain custom-scrollbar">
            <Suspense fallback={<div className="h-full min-h-screen flex items-center justify-center"><Spinner /></div>}>
              <WalletScreen onBack={() => { setActiveSheet('NONE'); void refreshWallet(); }} />
            </Suspense>
          </motion.div>,
          document.body,
        )}
    </PageLayout>
  );
};

export default MatchCreate;
