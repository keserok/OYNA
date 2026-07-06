import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Settings, Swords, UserPlus, ClipboardList, Calendar,
  MapPin, Loader2, Heart, Check, Shield, Link2,
} from 'lucide-react';
import { AppView } from '../../types';
import { auth } from '../../supabaseAuth';
import { useAppStore } from '../../store';
import TeamCrest from '../../components/social/TeamCrest';
import StatPill from '../../components/social/StatPill';
import FormBadge, { FormResult } from '../../components/social/FormBadge';
import SegmentedTabs from '../../components/ui/SegmentedTabs';
import BottomSheet from '../../components/ui/BottomSheet';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonList from '../../components/ui/SkeletonList';
import Avatar from '../../components/ui/Avatar';
import {
  MyTeamRow, TeamSquadRow, getMyTeams, getTeamSquad, formatLabel,
  parseTeamError, inviteToTeam, getTeamOutgoingInvites,
  getTeamInviteLink, setTeamInviteLink, inviteLinkUrl,
} from '../../services/teamSocialService';
import {
  TeamMatchRow, fetchTeamNextMatch, fetchTeamMatchHistory, computeTeamStats,
} from '../../services/teamService';
import {
  TacticShowcaseItem, getTeamTacticsShowcase, setActiveTactic, toggleTacticFavorite,
  MatchTacticInfo, getMatchTactic, assignMatchTactic,
} from '../../services/tacticSocialService';
import {
  ScoreProposal, proposeMatchScore, approveMatchScore, getPendingScoreProposal,
} from '../../services/scoreService';
import { getFriends, FriendRow } from '../../services/socialService';
import TeamSquadTab from './TeamSquadTab';
import TeamSettingsSheet from './TeamSettingsSheet';

// ================================================================
// TeamDetailView — birleşik Takım Detayı (Spec §3.8)
// 4 sekme: Genel · Kadro · Taktik · Maçlar. Kimlik AÇIKÇA taşınır:
// store.selectedTeamId (A4/G42 — "ilk takım" varsayımı yasak).
// TeamPanelView + MyTeam ikilisinin halefi; skor onayı gömülü.
// Başlıktaki 💬 takım sohbeti Küme 4'te eklenir.
// ================================================================

type DetailTab = 'GENEL' | 'KADRO' | 'TAKTIK' | 'MACLAR';

const daysUntil = (dateStr: string): number => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return 0;
  return Math.round((d.getTime() - today.getTime()) / 86400000);
};

const countdownLabel = (dateStr: string): string => {
  const n = daysUntil(dateStr);
  if (n <= 0) return 'Bugün';
  if (n === 1) return 'Yarın';
  return `${n} gün`;
};

const formatDateTR = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00`);
  return isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' });
};

const monthOfTR = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00`);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
};

// ─── Skor sayfası — öner / onayla (Spec L74-76; propose_match_score) ───
const ScoreSheet: React.FC<{
  match: TeamMatchRow | null;
  userId: string;
  teamShort: string;
  onClose: () => void;
  onDone: () => void;
  onToast: (msg: string) => void;
}> = ({ match, userId, teamShort, onClose, onDone, onToast }) => {
  const [proposal, setProposal] = useState<ScoreProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [us, setUs] = useState('');
  const [them, setThem] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!match) return;
    setProposal(null); setUs(''); setThem(''); setLoading(true);
    getPendingScoreProposal(match.id)
      .then(setProposal)
      .finally(() => setLoading(false));
  }, [match]);

  const submit = async () => {
    if (!match) return;
    const u = parseInt(us, 10), t = parseInt(them, 10);
    if (isNaN(u) || isNaN(t) || u < 0 || t < 0 || u > 99 || t > 99) {
      onToast('Geçerli bir skor gir.'); return;
    }
    setBusy(true);
    try {
      const res = await proposeMatchScore(
        match.id,
        match.isHome ? u : t,
        match.isHome ? t : u,
      );
      onToast(res.finalized ? 'Skor kesinleşti 🎉' : `Öneri gönderildi (${res.approvals}/${res.needed} onay)`);
      onDone(); onClose();
    } catch (e) {
      onToast((e as Error)?.message || 'Skor önerilemedi.');
    } finally { setBusy(false); }
  };

  const approve = async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      const res = await approveMatchScore(proposal.id);
      onToast(res.finalized ? 'Skor kesinleşti 🎉' : `Onayın alındı (${res.approvals}/${res.needed})`);
      onDone(); onClose();
    } catch (e) {
      onToast((e as Error)?.message || 'Onaylanamadı.');
    } finally { setBusy(false); }
  };

  const propUs = proposal && match ? (match.isHome ? proposal.homeScore : proposal.awayScore) : 0;
  const propThem = proposal && match ? (match.isHome ? proposal.awayScore : proposal.homeScore) : 0;

  return (
    <BottomSheet open={!!match} onClose={onClose} ariaLabel="Skor girişi">
      {match && (
        <div className="pb-6">
          <h3 className="text-base font-black">Maç Skoru</h3>
          <p className="text-[11px] text-white/45 mt-0.5">
            vs {match.opponentName} · {formatDateTR(match.date)}
          </p>

          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 size={20} className="animate-spin text-white/40" />
            </div>
          ) : proposal ? (
            <div className="mt-4">
              <div className="rounded-2xl bg-white/4 border border-white/8 p-4 text-center">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  Önerilen Skor
                </div>
                <div className="text-3xl font-black mt-1 tabular-nums">{propUs} - {propThem}</div>
                <div className="text-[10px] text-white/35 mt-1">({teamShort} - Rakip)</div>
              </div>
              {proposal.proposedBy === userId ? (
                <p className="text-xs text-white/45 mt-3 text-center">
                  Önerin diğer katılımcıların onayını bekliyor.
                </p>
              ) : (
                <button
                  onClick={approve}
                  disabled={busy}
                  className="w-full mt-3 min-h-[48px] rounded-2xl bg-[#39FF14] text-[#0A0E14] font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Skoru Onayla
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex items-end gap-3">
                {([
                  { label: `Biz (${teamShort})`, value: us, set: setUs },
                  { label: 'Rakip', value: them, set: setThem },
                ] as const).map((f, i) => (
                  <React.Fragment key={f.label}>
                    {i === 1 && <span className="text-xl font-black text-white/30 pb-3">-</span>}
                    <div className="flex-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40">
                        {f.label}
                      </label>
                      <input
                        inputMode="numeric"
                        value={f.value}
                        onChange={e => f.set(e.target.value.replace(/\D/g, '').slice(0, 2))}
                        placeholder="0"
                        className="w-full h-14 mt-1.5 rounded-2xl bg-white/5 border border-white/10 text-center text-2xl font-black tabular-nums placeholder:text-white/20 focus:outline-none focus:border-[#39FF14]/50"
                      />
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <p className="text-[10px] text-white/35 mt-2.5">
                Tüm katılımcılar onaylayınca skor kesinleşir.
              </p>
              <button
                onClick={submit}
                disabled={busy || us === '' || them === ''}
                className="w-full mt-3 min-h-[48px] rounded-2xl bg-[#39FF14] text-[#0A0E14] font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : null} Skor Öner
              </button>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
};

// ─── Davet sayfası — arkadaştan davet + link kısayolu (K68; yalnız yönetici) ───
const InviteSheet: React.FC<{
  open: boolean;
  team: MyTeamRow;
  squad: TeamSquadRow[];
  onClose: () => void;
  onInvited: () => void;
  onToast: (msg: string) => void;
}> = ({ open, team, squad, onClose, onInvited, onToast }) => {
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFriends(null);
    getFriends().then(setFriends).catch(() => setFriends([]));
    getTeamOutgoingInvites(team.team_id)
      .then(rows => setInvitedIds(new Set(rows.map(r => r.invited_id))))
      .catch(() => setInvitedIds(new Set()));
    getTeamInviteLink(team.team_id).then(setLink).catch(() => setLink(null));
  }, [open, team.team_id]);

  const squadIds = useMemo(() => new Set(squad.map(m => m.user_id)), [squad]);
  const candidates = useMemo(
    () => (friends ?? []).filter(f => !squadIds.has(f.friend_id)),
    [friends, squadIds],
  );
  const openSlots = Math.max(0, 20 - team.member_count - invitedIds.size);

  const invite = async (friendId: string) => {
    setBusyId(friendId);
    try {
      await inviteToTeam(team.team_id, friendId);
      setInvitedIds(prev => new Set(prev).add(friendId));
      onInvited();
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setBusyId(null); }
  };

  const shareLink = async () => {
    setLinkBusy(true);
    try {
      // Var olan link korunur; yoksa ilk kez üretilir (yenileme Ayarlar'da)
      const token = link ?? await setTeamInviteLink(team.team_id, true);
      if (!token) throw new Error('NO_TOKEN');
      setLink(token);
      const url = inviteLinkUrl(token);
      if (navigator.share) {
        await navigator.share({ title: team.name, text: `${team.name} kadrosuna katıl!`, url });
      } else {
        await navigator.clipboard.writeText(url);
        onToast('Davet linki kopyalandı');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') onToast(parseTeamError(e));
    } finally { setLinkBusy(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Takıma davet et">
      <div className="pb-6">
        <div className="flex items-baseline justify-between">
          <h3 className="text-base font-black">Kadroya Davet Et</h3>
          <span className="text-[10px] font-bold text-white/40">{openSlots} yer kaldı</span>
        </div>

        {/* Link kısayolu — tam yönetim (yenile/kapat) Ayarlar'da */}
        <button
          onClick={shareLink}
          disabled={linkBusy}
          className="w-full mt-3 min-h-[46px] rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white/80 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
        >
          {linkBusy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} className="text-[#39FF14]" />}
          Davet Linkini Paylaş
        </button>

        <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-4 mb-2">
          Arkadaşların
        </div>
        {friends === null ? (
          <SkeletonList rows={3} />
        ) : candidates.length === 0 ? (
          <p className="text-xs text-white/35 py-4 text-center">
            Davet edilebilecek arkadaşın kalmadı — linki paylaşabilirsin.
          </p>
        ) : (
          <div className="space-y-1.5">
            {candidates.map(f => {
              const sent = invitedIds.has(f.friend_id);
              return (
                <div key={f.friend_id} className="flex items-center gap-2.5 rounded-xl bg-white/4 border border-white/6 p-2.5">
                  <Avatar name={f.full_name} src={f.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold truncate">{f.full_name}</div>
                    {f.oyna_id && <div className="text-[10px] text-white/35">@{f.oyna_id}</div>}
                  </div>
                  {sent ? (
                    <span className="text-[10px] font-bold text-white/40 flex items-center gap-1">
                      <Check size={11} className="text-[#39FF14]" /> Davet edildi
                    </span>
                  ) : (
                    <button
                      onClick={() => invite(f.friend_id)}
                      disabled={busyId === f.friend_id || openSlots === 0}
                      className="h-9 px-3 rounded-xl bg-[#39FF14] text-[#0A0E14] text-[11px] font-black active:scale-95 disabled:opacity-40"
                    >
                      {busyId === f.friend_id ? '…' : 'Davet Et'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};

// ─── Ana görünüm ───────────────────────────────────────────────────
interface TeamDetailViewProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

const TeamDetailView: React.FC<TeamDetailViewProps> = ({ onBack, onNavigate }) => {
  const userId = auth.currentUser?.uid || '';
  const teamId = useAppStore(s => s.selectedTeamId);
  const setStudioContext = useAppStore(s => s.setStudioContext);

  const [team, setTeam] = useState<MyTeamRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>('GENEL');
  const [squad, setSquad] = useState<TeamSquadRow[]>([]);
  const [squadLoading, setSquadLoading] = useState(true);
  const [nextMatch, setNextMatch] = useState<TeamMatchRow | null>(null);
  const [history, setHistory] = useState<TeamMatchRow[] | null>(null);
  const [tactics, setTactics] = useState<TacticShowcaseItem[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [scoreMatch, setScoreMatch] = useState<TeamMatchRow | null>(null);
  const [tacticBusy, setTacticBusy] = useState<string | null>(null);
  // Maça taktik atama (L76) — yaklaşan maçın planı + atama sayfası
  const [assignedPlan, setAssignedPlan] = useState<MatchTacticInfo | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignBusy, setAssignBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const loadTeam = useCallback(async (silent = false) => {
    if (!teamId) return;
    if (!silent) setLoading(true);
    try {
      const teams = await getMyTeams();
      setTeam(teams.find(t => t.team_id === teamId) ?? null);
    } catch (e) {
      console.error('[TeamDetail] takım yüklenemedi', e);
    } finally { setLoading(false); }
  }, [teamId]);

  const loadSquad = useCallback(async (silent = false) => {
    if (!teamId) return;
    if (!silent) setSquadLoading(true);
    try { setSquad(await getTeamSquad(teamId)); }
    catch (e) { console.error('[TeamDetail] kadro yüklenemedi', e); }
    finally { setSquadLoading(false); }
  }, [teamId]);

  const loadMatches = useCallback(async () => {
    if (!teamId) return;
    try {
      const [next, hist] = await Promise.all([
        fetchTeamNextMatch(teamId),
        fetchTeamMatchHistory(teamId, 20),
      ]);
      setNextMatch(next); setHistory(hist);
    } catch (e) {
      console.error('[TeamDetail] maçlar yüklenemedi', e);
      setHistory([]);
    }
  }, [teamId]);

  // onBack bilinçli olarak deps dışında: App her render'da yeni lambda
  // üretir; onu izlemek her üst-render'da yeniden yüklemeye yol açardı.
  useEffect(() => {
    if (!teamId) { onBack(); return; }
    setTab('GENEL'); setTactics(null);
    void loadTeam(); void loadSquad(); void loadMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, loadTeam, loadSquad, loadMatches]);

  // Taktik vitrini tembel yüklenir (sekmeye ilk girişte ya da atama sayfası açılınca)
  useEffect(() => {
    if ((tab !== 'TAKTIK' && !assignOpen) || tactics !== null || !teamId) return;
    getTeamTacticsShowcase(teamId).then(setTactics).catch(() => setTactics([]));
  }, [tab, assignOpen, tactics, teamId]);

  // Yaklaşan maça atanmış plan
  useEffect(() => {
    if (!nextMatch) { setAssignedPlan(null); return; }
    let alive = true;
    getMatchTactic(nextMatch.id)
      .then(p => { if (alive) setAssignedPlan(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [nextMatch]);

  const openStudio = useCallback((tacticId?: string) => {
    if (!teamId) return;
    setStudioContext(tacticId ? { teamId, tacticId } : { teamId });
    onNavigate('STUDIO');
  }, [teamId, setStudioContext, onNavigate]);

  const isAdmin = team?.my_role === 'CAPTAIN' || team?.my_role === 'ADMIN';
  const c1 = team?.color1 || '#39FF14';
  const teamShort = team?.short_name || (team?.name || '').slice(0, 4).toLocaleUpperCase('tr-TR') || 'BİZ';

  const stats = useMemo(
    () => computeTeamStats(history ?? [], team?.wins ?? 0, team?.losses ?? 0),
    [history, team],
  );
  const totalGames = (team?.wins ?? 0) + (team?.draws ?? 0) + (team?.losses ?? 0);
  const winRate = totalGames > 0 ? Math.round(((team?.wins ?? 0) / totalGames) * 100) : 0;
  const form: FormResult[] = useMemo(
    () => (history ?? []).slice(0, 5).reverse()
      .map(m => (m.result === 'G' ? 'W' : m.result === 'B' ? 'D' : 'L')),
    [history],
  );

  const activateTactic = async (t: TacticShowcaseItem) => {
    setTacticBusy(t.id);
    try {
      await setActiveTactic(t.id);
      setTactics(prev => (prev ?? []).map(x => ({ ...x, is_active: x.id === t.id })));
      showToast(`"${t.name || 'Taktik'}" aktif taktik oldu`);
    } catch (e) { showToast((e as Error)?.message || 'Aktif taktik ayarlanamadı.'); }
    finally { setTacticBusy(null); }
  };

  const favTactic = async (t: TacticShowcaseItem) => {
    try {
      const nowFav = await toggleTacticFavorite(t.id);
      setTactics(prev => (prev ?? []).map(x => x.id === t.id
        ? { ...x, i_favorited: nowFav, fav_count: x.fav_count + (nowFav ? 1 : -1) }
        : x));
    } catch (e) { showToast((e as Error)?.message || 'Favori güncellenemedi.'); }
  };

  if (!teamId) return null;

  if (!loading && !team) {
    return (
      <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col font-sans">
        <div className="pt-safe px-5 pt-5">
          <button onClick={onBack} aria-label="Geri" className="w-10 h-10 -ml-2 rounded-xl flex items-center justify-center text-white/70 active:scale-95">
            <ChevronLeft size={22} />
          </button>
        </div>
        <EmptyState
          icon={Shield}
          title="Takım bulunamadı"
          description="Bu takım arşivlenmiş ya da artık üyesi olmayabilirsin."
          actions={[{ label: 'Takımlarıma Dön', onClick: onBack, primary: true }]}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col font-sans">
      {/* ── Başlık — takım-rengi kimlik alanı ── */}
      <div className="pt-safe px-5 pb-3 relative overflow-hidden flex-shrink-0">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(160deg, ${c1}29 0%, transparent 55%)` }}
        />
        <div className="relative z-10 flex items-center gap-2 pt-4">
          <button onClick={onBack} aria-label="Geri" className="w-10 h-10 -ml-2 rounded-xl flex items-center justify-center text-white/70 active:scale-95">
            <ChevronLeft size={22} />
          </button>
          {team ? (
            <>
              <TeamCrest config={team.crest_config} color1={team.color1} color2={team.color2} size={44} />
              <div className="flex-1 min-w-0 ml-1">
                <h1 className="text-xl font-black italic truncate">{team.name}</h1>
                <p className="text-[11px] text-white/45 truncate">
                  {teamShort} · {formatLabel(team.format)}
                  {team.city ? ` · ${team.city}` : ''} · {team.member_count} oyuncu
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Takım ayarları"
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 active:scale-95"
                >
                  <Settings size={17} />
                </button>
              )}
            </>
          ) : (
            <div className="flex-1 h-11 rounded-xl bg-white/5 animate-pulse" />
          )}
        </div>

        <div className="relative z-10 mt-4">
          <SegmentedTabs
            layoutId="teamDetailTabs"
            activeId={tab}
            onChange={id => setTab(id as DetailTab)}
            items={[
              { id: 'GENEL', label: 'Genel' },
              { id: 'KADRO', label: 'Kadro' },
              { id: 'TAKTIK', label: 'Taktik' },
              { id: 'MACLAR', label: 'Maçlar' },
            ]}
          />
        </div>
      </div>

      {/* ── İçerik ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-safe-nav">
        {loading || !team ? (
          <SkeletonList rows={4} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.16 }}
            >
              {/* ═══ GENEL ═══ */}
              {tab === 'GENEL' && (
                <div className="space-y-4">
                  {/* Sıradaki maç kahramanı */}
                  {nextMatch ? (
                    <div
                      className="relative rounded-3xl border border-white/8 p-4 overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${c1}1f, transparent 60%)` }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                          Sıradaki Maç
                        </span>
                        <span className="text-[10px] font-black px-2 py-1 rounded-full bg-[#39FF14]/10 text-[#39FF14]">
                          ⏱ {countdownLabel(nextMatch.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 mt-3">
                        <TeamCrest config={team.crest_config} color1={team.color1} color2={team.color2} size={34} />
                        <span className="text-sm font-black italic">{teamShort}</span>
                        <span className="text-white/30 text-xs font-black px-1">vs</span>
                        <span
                          className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-[10px] border border-white/10"
                          style={{ backgroundColor: `${nextMatch.opponentColor}33` }}
                        >
                          {nextMatch.opponentShort}
                        </span>
                        <span className="text-sm font-bold truncate flex-1">{nextMatch.opponentName}</span>
                      </div>
                      <div className="text-[11px] text-white/50 mt-3 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} style={{ color: c1 }} />
                          {formatDateTR(nextMatch.date)} · {nextMatch.time}
                        </span>
                        {nextMatch.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={11} style={{ color: c1 }} /> {nextMatch.location}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-white/10 p-4 text-center">
                      <p className="text-xs text-white/40">
                        Sıradaki maç yok — takımını sahaya çağır. ⚽
                      </p>
                    </div>
                  )}

                  {/* Mini istatistik + form */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">
                        {team.wins}G · {team.draws}B · {team.losses}M
                      </h3>
                      <FormBadge form={form} winColor={c1} />
                    </div>
                    <div className="flex gap-2">
                      <StatPill value={`%${winRate}`} label="Galibiyet" accent />
                      <StatPill value={totalGames} label="Maç" />
                      <StatPill
                        value={history && history.length > 0
                          ? `${stats.average > 0 ? '+' : ''}${stats.average}`
                          : '—'}
                        label="Averaj"
                      />
                    </div>
                  </div>

                  {/* Hızlı aksiyonlar — davet yalnız yönetici (invite_to_team K68) */}
                  <div className={`grid gap-2 ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {([
                      { label: 'Maç Kur', icon: Swords, onClick: () => onNavigate('MATCH_CREATE'), show: true },
                      { label: 'Davet Et', icon: UserPlus, onClick: () => setInviteOpen(true), show: isAdmin },
                      { label: 'Taktik Stüdyo', icon: ClipboardList, onClick: () => openStudio(), show: true },
                    ] as const).filter(a => a.show).map(a => (
                      <button
                        key={a.label}
                        onClick={a.onClick}
                        className="rounded-2xl bg-white/4 border border-white/8 py-3.5 flex flex-col items-center gap-1.5 active:scale-[0.97]"
                      >
                        <a.icon size={18} className="text-[#39FF14]" />
                        <span className="text-[11px] font-bold text-white/80">{a.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Yeni takım: sıradaki adımlar (Spec §3.8 Genel) */}
                  {team.member_count <= 2 && (history?.length ?? 0) === 0 && (
                    <div className="rounded-2xl bg-white/4 border border-white/8 p-4">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2.5">
                        Sıradaki Adımlar
                      </h3>
                      <div className="space-y-2">
                        {[
                          { done: team.member_count > 1 || team.pending_invites > 0, label: 'Takım arkadaşlarını davet et' },
                          { done: !!nextMatch, label: 'İlk maçını planla' },
                          { done: false, label: 'Stüdyo’da ilk taktiğini kur' },
                        ].map(s => (
                          <div key={s.label} className="flex items-center gap-2.5 text-[13px]">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                              s.done ? 'bg-[#39FF14] border-[#39FF14]' : 'border-white/20'
                            }`}>
                              {s.done && <Check size={11} className="text-[#0A0E14]" />}
                            </span>
                            <span className={s.done ? 'text-white/40 line-through' : 'text-white/80 font-semibold'}>
                              {s.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ KADRO ═══ */}
              {tab === 'KADRO' && (
                <TeamSquadTab
                  team={team}
                  squad={squad}
                  loading={squadLoading}
                  userId={userId}
                  onRefresh={() => { void loadSquad(true); void loadTeam(true); }}
                  onOpenInvite={() => setInviteOpen(true)}
                  onToast={showToast}
                />
              )}

              {/* ═══ TAKTİK — vitrin; tam düzenleme Stüdyo'da (M80) ═══ */}
              {tab === 'TAKTIK' && (
                tactics === null ? (
                  <SkeletonList rows={3} />
                ) : tactics.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="Henüz takım taktiği yok"
                    description="Stüdyo'da ilk taktiğinizi kurun; onaylananlar burada vitrine çıkar."
                    actions={[{ label: "Stüdyo'da Taktik Kur", onClick: () => openStudio(), primary: true }]}
                  />
                ) : (
                  <div className="space-y-2.5">
                    {tactics.map(t => {
                      const pending = !!t.status && t.status.startsWith('PENDING');
                      return (
                        <div key={t.id} className="rounded-2xl bg-white/4 border border-white/6 p-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black truncate flex-1">
                              {t.name || 'Adsız Taktik'}
                            </span>
                            {t.is_active && (
                              <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full bg-[#39FF14]/12 text-[#39FF14]">
                                AKTİF
                              </span>
                            )}
                            {pending && (
                              <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400">
                                Onay bekliyor
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-white/45 mt-1 flex items-center gap-2 flex-wrap">
                            {t.formation && <span className="font-semibold">{t.formation}</span>}
                            {/* Taktik kendi boyunu korur — format rozeti (Spec §3.8) */}
                            {t.size && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/8 text-white/50">
                                {formatLabel(t.size)}
                              </span>
                            )}
                            {t.vote_count > 0 && (
                              <span>%{Math.round(t.avg_vote)} beğeni · {t.vote_count} oy</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-3">
                            <button
                              onClick={() => openStudio(t.id)}
                              className="flex-1 h-10 rounded-xl bg-white/6 border border-white/10 text-xs font-bold text-white/85 active:scale-[0.98]"
                            >
                              Stüdyo'da Aç ›
                            </button>
                            {isAdmin && !t.is_active && !pending && (
                              <button
                                onClick={() => activateTactic(t)}
                                disabled={tacticBusy === t.id}
                                className="h-10 px-3 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/25 text-[#39FF14] text-xs font-black active:scale-95 disabled:opacity-50"
                              >
                                {tacticBusy === t.id ? '…' : 'Aktif Yap'}
                              </button>
                            )}
                            <button
                              onClick={() => favTactic(t)}
                              aria-label="Favori"
                              className={`h-10 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold active:scale-95 ${
                                t.i_favorited
                                  ? 'bg-[#FF4D4D]/10 border-[#FF4D4D]/25 text-[#FF4D4D]'
                                  : 'bg-white/4 border-white/10 text-white/50'
                              }`}
                            >
                              <Heart size={13} fill={t.i_favorited ? 'currentColor' : 'none'} />
                              {t.fav_count}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* ═══ MAÇLAR — zaman akışı + gömülü skor onayı (Spec §3.8) ═══ */}
              {tab === 'MACLAR' && (
                history === null ? (
                  <SkeletonList rows={4} />
                ) : (
                  <div className="space-y-4">
                    {nextMatch && (
                      <div>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
                          Yaklaşan
                        </h3>
                        <div className="rounded-2xl bg-white/4 border border-white/6 p-3">
                          <div className="flex items-center gap-3">
                            <span
                              className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-[10px] border border-white/10 shrink-0"
                              style={{ backgroundColor: `${nextMatch.opponentColor}33` }}
                            >
                              {nextMatch.opponentShort}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-bold truncate">vs {nextMatch.opponentName}</div>
                              <div className="text-[10px] text-white/40">
                                {formatDateTR(nextMatch.date)} · {nextMatch.time}
                                {nextMatch.location ? ` · ${nextMatch.location}` : ''}
                              </div>
                            </div>
                            <span className="text-[10px] font-black px-2 py-1 rounded-full bg-[#39FF14]/10 text-[#39FF14] shrink-0">
                              {countdownLabel(nextMatch.date)}
                            </span>
                          </div>
                          {/* Maç planı — atanmışsa herkes görür; yönetici atar/değiştirir (L76) */}
                          {(assignedPlan || isAdmin) && (
                            <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-white/6">
                              <ClipboardList size={13} className="text-[#39FF14] shrink-0" />
                              {assignedPlan ? (
                                <button
                                  onClick={() => openStudio(assignedPlan.tacticId)}
                                  className="flex-1 min-w-0 text-left text-[12px] font-bold truncate active:opacity-70"
                                >
                                  {assignedPlan.name || 'Taktik'}
                                  <span className="text-white/40 font-semibold">
                                    {assignedPlan.formation ? ` · ${assignedPlan.formation}` : ''}
                                  </span>
                                </button>
                              ) : (
                                <span className="flex-1 text-[11px] text-white/35">Maç planı atanmadı</span>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => setAssignOpen(true)}
                                  className="h-8 px-2.5 rounded-lg bg-white/6 border border-white/10 text-[10px] font-black text-white/70 active:scale-95 shrink-0"
                                >
                                  {assignedPlan ? 'Değiştir' : 'Taktik Ata'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {history.length === 0 ? (
                      <EmptyState
                        icon={Swords}
                        title="Henüz oynanmış maç yok"
                        description="İlk maçını kur; sonuçlar ve form buraya işlenir."
                        actions={[{ label: 'Maç Kur', onClick: () => onNavigate('MATCH_CREATE'), primary: true }]}
                      />
                    ) : (
                      <div>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
                          Geçmiş
                        </h3>
                        <div className="space-y-2">
                          {history.map((m, i) => {
                            const month = monthOfTR(m.date);
                            const showMonth = i === 0 || monthOfTR(history[i - 1].date) !== month;
                            const unscored = m.homeScore === null && m.awayScore === null;
                            return (
                              <React.Fragment key={m.id}>
                                {showMonth && month && (
                                  <div className="text-[10px] font-bold text-white/30 pt-1.5 first:pt-0 capitalize">
                                    {month}
                                  </div>
                                )}
                                <div className="flex items-center gap-3 rounded-2xl bg-white/4 border border-white/6 p-3">
                                  <span
                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
                                    style={
                                      unscored
                                        ? { backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }
                                        : m.result === 'G'
                                          ? { backgroundColor: `${c1}1f`, color: c1 }
                                          : m.result === 'B'
                                            ? { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }
                                            : { backgroundColor: 'rgba(255,77,77,0.12)', color: '#FF4D4D' }
                                    }
                                  >
                                    {unscored ? '?' : m.result}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-bold truncate">vs {m.opponentName}</div>
                                    <div className="text-[10px] text-white/40">
                                      {formatDateTR(m.date)}
                                      {m.location ? ` · ${m.location}` : ''}
                                    </div>
                                  </div>
                                  {unscored ? (
                                    <button
                                      onClick={() => setScoreMatch(m)}
                                      className="h-9 px-3 rounded-xl bg-[#39FF14] text-[#0A0E14] text-[11px] font-black active:scale-95 shrink-0"
                                    >
                                      Skoru Gir
                                    </button>
                                  ) : (
                                    <span className="text-base font-black tabular-nums shrink-0">
                                      {m.myScore} - {m.theirScore}
                                    </span>
                                  )}
                                </div>
                              </React.Fragment>
                            );
                          })}
                        </div>

                        {/* Detaylı istatistik bloğu */}
                        <div className="flex gap-2 mt-4">
                          <StatPill value={stats.goalsScored} label="Gol Attı" />
                          <StatPill value={stats.goalsConceded} label="Gol Yedi" />
                          <StatPill value={`${stats.average > 0 ? '+' : ''}${stats.average}`} label="Averaj" />
                          <StatPill value={stats.cleanSheets} label="Gole Kapalı" />
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* ── Sayfalar ── */}
      {team && (
        <>
          <InviteSheet
            open={inviteOpen}
            team={team}
            squad={squad}
            onClose={() => setInviteOpen(false)}
            onInvited={() => void loadTeam(true)}
            onToast={showToast}
          />
          <ScoreSheet
            match={scoreMatch}
            userId={userId}
            teamShort={teamShort}
            onClose={() => setScoreMatch(null)}
            onDone={() => { void loadMatches(); void loadTeam(true); }}
            onToast={showToast}
          />
          {/* Taktik atama sayfası — yalnız ONAYLI taktikler (sunucu da doğrular) */}
          <BottomSheet open={assignOpen} onClose={() => setAssignOpen(false)} ariaLabel="Maça taktik ata">
            <div className="pb-6">
              <h3 className="text-base font-black">Maç Planını Seç</h3>
              <p className="text-[11px] text-white/45 mt-0.5">
                {nextMatch ? `vs ${nextMatch.opponentName} · ${formatDateTR(nextMatch.date)}` : ''}
              </p>
              <div className="mt-4">
                {tactics === null ? (
                  <SkeletonList rows={3} />
                ) : (
                  (() => {
                    const approved = tactics.filter(t => t.status === 'APPROVED');
                    if (approved.length === 0) {
                      return (
                        <EmptyState
                          icon={ClipboardList}
                          title="Onaylı taktik yok"
                          description="Önce Stüdyo'da bir takım taktiği kur ve onayla."
                          actions={[{ label: "Stüdyo'da Taktik Kur", onClick: () => openStudio(), primary: true }]}
                        />
                      );
                    }
                    return (
                      <div className="space-y-2">
                        {approved.map(t => {
                          const current = assignedPlan?.tacticId === t.id;
                          return (
                            <button
                              key={t.id}
                              disabled={!!assignBusy || !nextMatch}
                              onClick={async () => {
                                if (!nextMatch) return;
                                setAssignBusy(t.id);
                                try {
                                  await assignMatchTactic(nextMatch.id, t.id);
                                  setAssignedPlan({
                                    tacticId: t.id, teamId: teamId!,
                                    name: t.name, formation: t.formation, size: t.size,
                                  });
                                  setAssignOpen(false);
                                  showToast('Maç planı atandı — takım bilgilendirildi 📋');
                                } catch (e) {
                                  showToast((e as Error)?.message || 'Taktik atanamadı.');
                                } finally { setAssignBusy(null); }
                              }}
                              className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left active:scale-[0.99] disabled:opacity-60 ${
                                current ? 'border-[#39FF14]/40 bg-[#39FF14]/6' : 'border-white/8 bg-white/4'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-bold truncate">{t.name || 'Adsız Taktik'}</div>
                                <div className="text-[10px] text-white/40">
                                  {t.formation || ''}{t.size ? ` · ${formatLabel(t.size)}` : ''}
                                  {t.is_active ? ' · Aktif taktik' : ''}
                                </div>
                              </div>
                              {assignBusy === t.id ? (
                                <Loader2 size={14} className="animate-spin text-white/40" />
                              ) : current ? (
                                <Check size={15} className="text-[#39FF14]" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          </BottomSheet>
          <TeamSettingsSheet
            open={settingsOpen}
            team={team}
            squad={squad}
            userId={userId}
            onClose={() => setSettingsOpen(false)}
            onSaved={() => { void loadTeam(true); void loadSquad(true); }}
            onGone={onBack}
            onToast={showToast}
          />
        </>
      )}

      {/* Mini toast */}
      {toast && (
        <div className="fixed bottom-24 inset-x-5 z-[70] flex justify-center pointer-events-none">
          <div className="px-4 py-2.5 rounded-2xl bg-[#161B22] border border-white/10 text-sm font-semibold shadow-xl">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamDetailView;
