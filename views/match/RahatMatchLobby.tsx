import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Share2, MapPin, Users, Shirt, Calendar, Clock, Banknote, Footprints,
  Navigation, ChevronRight, Lock, UserPlus, Check, AlertTriangle, Hourglass, Info,
} from 'lucide-react';
import type { MatchListing, PositionSlot } from '../../types';
import { useAppStore } from '../../store';
import { auth } from '../../supabaseAuth';
import { supabase } from '../../supabaseClient';
import { showToast } from '../../components/common/GlobalToast';
import { skillBand } from '../../utils/skillBand';
import { PLAY_STYLE_META } from '../onboarding/onboardingShared';
import { formatMatchDuration } from '../../shared/matchTiming';
// IP-19: para tek kaynaktan yazılır — fiyat bağlamında formatTRYShort
// ("Ücretsiz" karşılığını kendi verir), iade/bakiye bağlamında formatTRYAmount.
import { formatTRYShort, formatTRYAmount } from '../../utils/formatTRY';
import {
  getMatchDetails, subscribeToMatchUpdates, getMatchLobbyParticipants,
  selfAssignSlot, unassignSlot, previewLeaveMatch, leaveMatchSlot, leaveQuoteMessage,
  assignSlotToFriend, type LobbyParticipant, type LeaveMatchQuote,
} from '../../services/matchService';
import {
  moveSlotTeam, makeSlotCode, joinMatchReserve, fetchRahatPitchInfo,
  fetchRahatMatchConfig, quorumDecisionTime,
  type RahatPitchInfo, type RahatMatchConfig,
} from '../../services/rahatMatchService';
import { checkMatchThreshold } from '../../services/matchLifecycleService';
import { getFriends } from '../../services/socialService';
import RahatJoinSheet from '../../components/match/RahatJoinSheet';
import MatchSquadPicker from '../../components/social/MatchSquadPicker';

// ════════════════════════════════════════════════════════════════════════
// E2/E4/E5/E6 · RAHAT MAÇ LOBİSİ — pozisyonsuz katılım yüzeyi
//
// Rahat bir EKRAN değil bir MAÇ ÇEŞİDİ: aynı matches satırı, aynı slot
// makinesi, aynı ödeme/iade zinciri. Bu yüzey saha/diziliş yerine İKİ TAKIM
// KADROSU dilini çizer: slots = BEYAZ, awaySlots = KIRMIZI.
//
// Dallanma App.tsx'te (hook-güvenli): selectedMatch.difficulty === 'Rahat'
// ise MatchJoin yerine bu bileşen mount edilir; Ciddi/Taktiksel akışına
// TEK SATIR dokunulmaz.
//
// VERİ DÜRÜSTLÜĞÜ: koordinat yoksa harita kartı, footwear_rule yoksa ayakkabı
// kartı, duration yoksa süre çipi DOM'a hiç girmez. Onay saati ve iade
// kademesi CANLI konfigden hesaplanır (settings herkese açık SELECT).
// ════════════════════════════════════════════════════════════════════════

const TEAM_WHITE = '#E8EDF4';
const TEAM_RED = '#D93A3A';
const RAHAT = PLAY_STYLE_META.rahat.color; // #10b981 — tek kaynak

const initialsOf = (n: string) =>
  n.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr-TR');

const CARD: React.CSSProperties = {
  background: '#161B22', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20,
};

const SECTION_LABEL: React.CSSProperties = {
  margin: '0 0 12px', fontSize: 11, fontWeight: 900, letterSpacing: '.14em', color: '#6B7280',
};

// ─── Kadro satırı: bir "yer"in beş görsel durumu (tek tanım) ────────────────
type RowKind = 'open' | 'lock' | 'player';
interface RosterRow {
  key: string;
  slot: PositionSlot;
  kind: RowKind;
  lockText?: string;
  name?: string;
  initials?: string;
  avatar?: string;
  selfSkill?: number | null;
  isFriend?: boolean;
  isMe?: boolean;
  isInvited?: boolean;
  /** Benim satın aldığım doldurulmamış yer → ⋮ menüsü. */
  mine?: boolean;
}

function buildRows(
  slots: PositionSlot[] | undefined,
  uid: string | undefined,
  friendIds: Set<string>,
  nameOf: (id: string | undefined) => string | undefined,
): RosterRow[] {
  return (slots || []).map((slot) => {
    const base = { key: slot.id, slot };
    if ((slot.status || 'OPEN') !== 'TAKEN') return { ...base, kind: 'open' as const };
    const occupant = (slot as { occupant?: string }).occupant || slot.player?.id;
    const buyer = (slot as { purchasedBy?: string }).purchasedBy;
    const assign = (slot as { assignmentStatus?: string }).assignmentStatus;
    if (!occupant) {
      // Ödenmiş ama oturansız: REZERVE ya da LINK_PENDING — doluluk sayımında DOLU.
      if (assign === 'LINK_PENDING') {
        return { ...base, kind: 'lock' as const, lockText: 'Davet kodu paylaşıldı', mine: buyer === uid };
      }
      const owner = buyer === uid ? 'sen dolduracaksın' : `${nameOf(buyer) || 'alıcı'} dolduracak`;
      return { ...base, kind: 'lock' as const, lockText: `Rezerve — ${owner}`, mine: buyer === uid };
    }
    const p = slot.player;
    const name = p?.name || nameOf(occupant) || 'Oyuncu';
    return {
      ...base,
      kind: 'player' as const,
      name,
      initials: initialsOf(name),
      avatar: p?.avatar || '',
      selfSkill: p?.selfSkill ?? null,
      isMe: occupant === uid,
      isFriend: occupant !== uid && friendIds.has(occupant),
      isInvited: assign === 'ASSIGNED' && buyer !== occupant,
    };
  });
}

const BandChip: React.FC<{ value?: number | null }> = ({ value }) => {
  const band = skillBand(value);
  if (!band) return null;
  return (
    <span style={{
      flexShrink: 0, fontSize: 10, fontWeight: 900, letterSpacing: '.08em', color: band.color,
      background: `${band.color}1f`, border: `1px solid ${band.color}4d`, borderRadius: 9999, padding: '3px 7px',
    }}>{band.label}</span>
  );
};

// ─── Ana bileşen ────────────────────────────────────────────────────────────

interface Props {
  match: MatchListing;
  onBack: () => void;
}

const RahatMatchLobby: React.FC<Props> = ({ match: matchProp, onBack }) => {
  const uid = auth.currentUser?.uid || undefined;
  const { applyMatchLocal, navigateTo, setPaymentContext } = useAppStore();
  const selectedMatch = useAppStore(s => s.selectedMatch);
  // Store'daki taze kopya öncelikli (realtime applyMatchLocal buraya yazar).
  const match = (selectedMatch && selectedMatch.id === matchProp.id ? selectedMatch : matchProp);

  const [tab, setTab] = useState<'durum' | 'hakkinda'>('durum');
  const [sheet, setSheet] = useState<'' | 'join' | 'reserve' | 'leave'>('');
  const [busy, setBusy] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [pitch, setPitch] = useState<RahatPitchInfo | null>(null);
  const [config, setConfig] = useState<RahatMatchConfig | null>(null);
  const [leaveQuote, setLeaveQuote] = useState<LeaveMatchQuote | null>(null);
  const [leaveQuoteLoading, setLeaveQuoteLoading] = useState(false);
  const [assignPickerSlotId, setAssignPickerSlotId] = useState<string | null>(null);
  const squadRef = useRef<HTMLDivElement>(null);

  // ── Hidrasyon + realtime (KN-3: salt-okur applyMatchLocal) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fresh = await getMatchDetails(matchProp.id);
      if (!cancelled && fresh) applyMatchLocal(fresh);
    })();
    const unsub = subscribeToMatchUpdates(matchProp.id, (raw) => {
      const r = raw as unknown as Record<string, unknown>;
      applyMatchLocal({
        ...(raw as MatchListing),
        awaySlots: (r.away_slots as PositionSlot[]) || (r.awaySlots as PositionSlot[]) || [],
        creatorId: (r.captain_id as string) || (r.creatorId as string),
        reservePlayers: (r.reserve_players as MatchListing['reservePlayers']) || (r.reservePlayers as MatchListing['reservePlayers']) || [],
        startsAt: (r.starts_at as string) || (r.startsAt as string) || undefined,
        durationMinutes: (r.duration_minutes as number) ?? (r.durationMinutes as number) ?? undefined,
        footwearRule: (r.footwear_rule as MatchListing['footwearRule']) ?? (r.footwearRule as MatchListing['footwearRule']) ?? null,
        pitchId: (r.pitch_id as string) || (r.pitchId as string) || undefined,
      } as MatchListing);
    });
    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchProp.id]);

  // ── Katılımcı kimlikleri (ad/avatar/selfSkill) ──
  const refreshRoster = useCallback(async () => {
    try {
      const parts = await getMatchLobbyParticipants(match.id, match.homeTeamId, match.awayTeamId);
      setParticipants(parts);
    } finally {
      setLoadingRoster(false);
    }
  }, [match.id, match.homeTeamId, match.awayTeamId]);
  useEffect(() => { void refreshRoster(); }, [refreshRoster, match.slots, match.awaySlots]);

  // ── Arkadaş rozetleri ──
  useEffect(() => {
    let cancelled = false;
    getFriends()
      .then(rows => { if (!cancelled) setFriendIds(new Set(rows.map(r => r.friend_id))); })
      .catch(() => { /* rozetler en-iyi-çaba */ });
    return () => { cancelled = true; };
  }, []);

  // ── Tesis + canlı konfig ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = match.pitchId ? await fetchRahatPitchInfo(match.pitchId) : null;
      if (cancelled) return;
      setPitch(p);
      const cfg = await fetchRahatMatchConfig(p);
      if (!cancelled) setConfig(cfg);
    })();
    return () => { cancelled = true; };
  }, [match.pitchId]);

  // ── Türetilmiş durum ──
  const byId = useMemo(() => new Map(participants.map(p => [p.userId, p])), [participants]);
  const nameOf = useCallback((id: string | undefined) => (id ? byId.get(id)?.name : undefined), [byId]);

  // Katılımcı kimliğini slotlara işle (ad/avatar/selfSkill tazelenir).
  const enrich = useCallback((slots: PositionSlot[] | undefined): PositionSlot[] =>
    (slots || []).map(s => {
      if (s?.status !== 'TAKEN') return s;
      const occ = (s as { occupant?: string }).occupant || s.player?.id;
      const prof = occ ? byId.get(occ) : undefined;
      if (!occ || !prof) return s;
      return {
        ...s,
        player: {
          id: occ,
          name: prof.name || s.player?.name || 'Oyuncu',
          avatar: prof.avatarUrl || s.player?.avatar || '',
          selfSkill: prof.selfSkill ?? s.player?.selfSkill ?? null,
          position: 'OYUNCU',
        },
      };
    }), [byId]);

  const whiteSlots = useMemo(() => enrich(match.slots), [enrich, match.slots]);
  const redSlots = useMemo(() => enrich(match.awaySlots), [enrich, match.awaySlots]);

  const whiteRows = useMemo(() => buildRows(whiteSlots, uid, friendIds, nameOf), [whiteSlots, uid, friendIds, nameOf]);
  const redRows = useMemo(() => buildRows(redSlots, uid, friendIds, nameOf), [redSlots, uid, friendIds, nameOf]);

  const cap = whiteSlots.length + redSlots.length;
  const wFilled = whiteSlots.filter(s => s?.status === 'TAKEN').length;
  const rFilled = redSlots.filter(s => s?.status === 'TAKEN').length;
  const filled = wFilled + rFilled;
  const remain = cap - filled;
  const isFull = cap > 0 && remain === 0;
  const price = match.price || 0;

  const status = match.status;
  const isCancelled = status === 'CANCELLED';
  const isConfirmed = status === 'CONFIRMED' || status === 'LIVE';

  // Benim yerlerim (iki taraf birden).
  const mySlot = (s: PositionSlot) => (s as { purchasedBy?: string }).purchasedBy === uid;
  const myWhite = whiteSlots.filter(mySlot);
  const myRed = redSlots.filter(mySlot);
  const myPlaces = [
    ...myWhite.map(s => ({ slot: s, side: 'home' as const })),
    ...myRed.map(s => ({ slot: s, side: 'away' as const })),
  ];
  const occupies = (s: PositionSlot) =>
    ((s as { occupant?: string }).occupant || s.player?.id) === uid;
  const iAmOnField = [...whiteSlots, ...redSlots].some(s => s?.status === 'TAKEN' && occupies(s));
  const isJoined = myPlaces.length > 0 || iAmOnField;
  const myUnfilled = myPlaces.filter(({ slot }) => {
    const occ = (slot as { occupant?: string }).occupant || slot.player?.id;
    return !occ;
  });

  const reserves = (match.reservePlayers || []) as Array<{ id?: string; name?: string }>;
  const myReserveIdx = reserves.findIndex(r => r?.id === uid);
  const onReserveList = myReserveIdx >= 0;

  // Kademe çubuğu (tasarım sözleşmesi birebir).
  const steps = useMemo(() => {
    const mk = (label: string, state: 'done' | 'active' | 'future') => ({ label, state });
    if (isConfirmed) return [mk('YAYINDA', 'done'), mk('ONAYLANDI', 'done'), mk('KADRO TAM', isFull ? 'done' : 'active')];
    if (isFull) return [mk('YAYINDA', 'done'), mk('ONAYLANDI', 'done'), mk('KADRO TAM', 'done')];
    if (filled > 0) return [mk('YAYINDA', 'done'), mk('ONAYLANDI', 'active'), mk('KADRO TAM', 'future')];
    return [mk('YAYINDA', 'done'), mk('ONAYLANDI', 'future'), mk('KADRO TAM', 'future')];
  }, [isConfirmed, isFull, filled]);
  const stepLine = isFull || isConfirmed ? '100%' : filled > 0 ? '50%' : '0%';

  // Onay saati — HESAPLANAN değer; hesaplanamazsa cümle hiç çizilmez.
  const decisionAt = config ? quorumDecisionTime(match.startsAt, config) : null;
  const decisionLabel = decisionAt
    ? decisionAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const durationLabel = formatMatchDuration(match);
  const facilityName = pitch?.name || match.pitchName || (match.location || '').split('·')[0]?.trim() || 'Tesis';
  const courtName = match.courtName || null;
  const summary = [facilityName, courtName, `${match.date} ${match.time}`].filter(Boolean).join(' · ');
  const photos = pitch?.images?.length ? pitch.images : (match.image ? [match.image] : []);

  // ── Aksiyonlar ──────────────────────────────────────────────────────────
  const guard = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const refresh = async () => {
    const fresh = await getMatchDetails(match.id);
    if (fresh) applyMatchLocal(fresh);
    await refreshRoster();
  };

  const handleProceed = (slotIds: string[], total: number) => guard(async () => {
    if (price > 0) {
      const cfg = config;
      setPaymentContext({
        kind: 'MATCH_JOIN',
        badge: `MAÇA KATILIM · ${slotIds.length} YER`,
        title: facilityName,
        subtitle: summary,
        details: [
          { icon: 'pin', text: [facilityName, courtName].filter(Boolean).join(' · ') },
          { icon: 'calendar', text: match.date },
          { icon: 'clock', text: match.time },
        ],
        amount: total,
        amountLabel: 'Ödenecek Tutar',
        isDeposit: false,
        allowBalance: true,
        successTitle: 'Katılımın Onaylandı!',
        successSubtitle: 'Yerin garanti',
        matchId: match.id,
        slotIds,
        pitchId: match.pitchId,
        // İade dili sunucu davranışıyla birebir; kademeler CANLI konfigden.
        infoNote: cfg
          ? `Kadro dolmazsa veya maç iptal olursa ödediğin tutarın tamamı cüzdanına döner. Maçtan kendin ayrılırsan iade kademeye tabidir: maça ${cfg.refundFullHours} saatten fazla varsa tamamı, ${cfg.refundHalfHours}–${cfg.refundFullHours} saat kala %${cfg.refundHalfPct}'i cüzdanına döner; ${cfg.refundHalfHours} saatten az kala iade yapılmaz. Tam iade penceresi kapandıktan sonra ayrılırsan güvenilirlik puanın da düşer.`
          : undefined,
      });
      setSheet('');
      navigateTo('PAYMENT');
      return;
    }
    // Ücretsiz maç: doğrudan satın alma (ödeme ekranı gerekmez).
    const { error } = await supabase.rpc('player_buy_slots_v2', {
      p_match_id: match.id,
      p_slot_ids: slotIds,
      p_use_balance: true,
    });
    if (error) {
      const msg = error.message || '';
      showToast(msg.includes('SLOT_TAKEN') || msg.includes('SLOT_NOT_FOUND')
        ? 'Seçtiğin yer az önce doldu — tekrar dene.'
        : 'Katılım tamamlanamadı. Lütfen tekrar dene.');
      await refresh();
      return;
    }
    try { await checkMatchThreshold(match.id); } catch { /* eşik kontrolü kritik değil */ }
    await refresh();
    setSheet('');
    showToast('Yerin alındı — kendini veya arkadaşlarını ekle.', 'success');
  });

  const handleSelfAssign = (slotId: string) => guard(async () => {
    try {
      await selfAssignSlot(match.id, slotId);
      await refresh();
      showToast('Sahadasın!', 'success');
    } catch (e) {
      showToast((e as Error)?.message?.includes('ALREADY_ON_FIELD')
        ? 'Zaten sahada bir yerin var.' : 'Eklenemedi. Tekrar dene.');
    }
  });

  const handleAssignFriend = (slotId: string, friendId: string) => guard(async () => {
    try {
      await assignSlotToFriend(match.id, slotId, friendId);
      await refresh();
      showToast('Arkadaşın kadroya eklendi.', 'success');
    } catch (e) {
      const m = (e as Error)?.message || '';
      showToast(m.includes('FRIEND_ON_FIELD') ? 'Arkadaşın zaten bu maçta sahada.'
        : m.includes('NOT_FRIENDS') ? 'Yalnız arkadaş listenden atayabilirsin.'
          : 'Atama yapılamadı. Tekrar dene.');
    }
  });

  const handleShareCode = (slotId: string) => guard(async () => {
    try {
      const code = await makeSlotCode(match.id, slotId);
      const text = `OYNA maç davet kodun: ${code}`;
      if (navigator.share) {
        await navigator.share({ title: 'OYNA', text }).catch(() => { /* vazgeçti */ });
      } else {
        await navigator.clipboard?.writeText(code);
      }
      await refresh();
      showToast(`Kod: ${code} — paylaş, arkadaşın bu kodla yerini alsın.`, 'success');
    } catch {
      showToast('Kod üretilemedi. Tekrar dene.');
    }
  });

  const handleMoveTeam = (slotId: string, currentSide: 'home' | 'away') => guard(async () => {
    try {
      const res = await moveSlotTeam(match.id, slotId, currentSide === 'home' ? 'away' : 'home');
      await refresh();
      if (res.moved) showToast('Yerin karşı takıma taşındı.', 'success');
    } catch (e) {
      showToast((e as Error)?.message?.includes('TARGET_FULL')
        ? 'Karşı takımda boş yer yok.' : 'Taşınamadı. Tekrar dene.');
    }
  });

  const handleUnassign = (slotId: string) => guard(async () => {
    try {
      await unassignSlot(match.id, slotId);
      await refresh();
      showToast('Yer rezervine döndü.', 'success');
    } catch {
      showToast('Çıkarılamadı. Tekrar dene.');
    }
  });

  const openLeave = () => {
    setSheet('leave');
    setLeaveQuote(null);
    setLeaveQuoteLoading(true);
    previewLeaveMatch(match.id)
      .then(q => setLeaveQuote(q))
      .catch(() => setLeaveQuote(null))
      .finally(() => setLeaveQuoteLoading(false));
  };

  const handleLeave = () => guard(async () => {
    if (!uid) return;
    try {
      await leaveMatchSlot(match.id, uid);
      setSheet('');
      await refresh();
      showToast('Maçtan ayrıldın.', 'success');
    } catch {
      showToast('Ayrılma tamamlanamadı. Tekrar dene.');
    }
  });

  const handleJoinReserve = () => guard(async () => {
    if (!uid) return;
    try {
      await joinMatchReserve(match.id, uid);
      setSheet('');
      await refresh();
      showToast('Yedek listesindesin — yer açılırsa ilk sana haber vereceğiz.', 'success');
    } catch {
      showToast('Yedek listesine eklenemedi. Tekrar dene.');
    }
  });

  // ── Render yardımcıları ─────────────────────────────────────────────────

  const RosterCard: React.FC<{
    title: string; color: string; rows: RosterRow[]; filledLabel: string;
  }> = ({ title, color, rows, filledLabel }) => (
    <div style={{ ...CARD, padding: '13px 15px 6px', marginBottom: 10, boxShadow: '0 10px 24px rgba(0,0,0,0.30)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Shirt size={15} color={color} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 11, fontWeight: 900, letterSpacing: '.12em', color: title === 'BEYAZ TAKIM' ? TEAM_WHITE : '#FFFFFF' }}>{title}</span>
        <span className="font-numeric" style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF' }}>{filledLabel}</span>
      </div>
      {rows.map(row => (
        <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {row.kind === 'open' && (
            <>
              <span style={{ width: 40, height: 40, borderRadius: '50%', border: '1.5px dashed rgba(255,255,255,0.16)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#4B5563' }}>+ Boş yer</span>
            </>
          )}
          {row.kind === 'lock' && (
            <>
              <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}47`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={15} color="#9CA3AF" />
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#9CA3AF' }}>{row.lockText}</span>
            </>
          )}
          {row.kind === 'player' && (
            <>
              {row.avatar ? (
                <img src={row.avatar} alt={row.name} referrerPolicy="no-referrer"
                  style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', background: '#0d1712', border: `1.5px solid ${color}${title === 'BEYAZ TAKIM' ? '8c' : 'bf'}`, flexShrink: 0 }} />
              ) : (
                <span style={{ width: 40, height: 40, borderRadius: '50%', background: '#0d1712', border: `1.5px solid ${color}${title === 'BEYAZ TAKIM' ? '8c' : 'bf'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, fontStyle: 'italic', color: title === 'BEYAZ TAKIM' ? TEAM_WHITE : '#FFFFFF' }}>
                  {row.initials}
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
              <BandChip value={row.selfSkill} />
              {row.isFriend && (
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 900, letterSpacing: '.06em', color: '#60A5FA' }}>
                  <Users size={10} strokeWidth={2.4} /> ARKADAŞ
                </span>
              )}
              {row.isInvited && (
                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 900, letterSpacing: '.06em', color: '#9CA3AF', background: 'rgba(255,255,255,0.05)', borderRadius: 9999, padding: '3px 7px' }}>DAVETLİ</span>
              )}
              {row.isMe && (
                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 900, letterSpacing: '.08em', color: '#0A0E14', background: '#39FF14', borderRadius: 9999, padding: '3px 8px' }}>SEN</span>
              )}
            </>
          )}
          <span style={{ width: 8, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );

  const InfoTile: React.FC<{ icon: React.ReactNode; label: string; value: string; numeric?: boolean }> = ({ icon, label, value, numeric }) => (
    <div style={{ background: '#0f1419', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '13px 14px' }}>
      {icon}
      <p style={{ margin: '9px 0 3px', fontSize: 10, fontWeight: 900, letterSpacing: '.12em', color: '#6B7280' }}>{label}</p>
      <p className={numeric ? 'font-numeric' : undefined} style={{ margin: 0, fontSize: numeric ? 14 : 13, fontWeight: numeric ? 600 : 700, color: '#FFFFFF' }}>{value}</p>
    </div>
  );

  // ═══ RENDER ═══
  return (
    <div lang="tr" className="fixed inset-0 z-40 flex flex-col" style={{ background: '#0A0E14', color: '#FFFFFF' }}>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar" style={{ paddingBottom: 130 }}>

        {/* ── Foto karuseli / yedek zemin ── */}
        <div style={{ position: 'relative', height: 220, background: 'linear-gradient(160deg, #0d1712 0%, #0A0E14 100%)', overflow: 'hidden' }}>
          {photos.length > 0 ? (
            <div
              style={{ display: 'flex', height: '100%', overflowX: 'auto', scrollSnapType: 'x mandatory' }}
              className="custom-scrollbar"
              onScroll={(e) => {
                const el = e.currentTarget;
                setPhotoIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
              }}
            >
              {photos.map((src, i) => (
                <img key={i} src={src} alt={`${facilityName} ${i + 1}`} referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', flexShrink: 0, scrollSnapAlign: 'start' }} />
              ))}
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 44, fontWeight: 900, fontStyle: 'italic', color: 'rgba(57,255,20,0.35)' }}>{initialsOf(facilityName)}</span>
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,14,20,0.55) 0%, transparent 35%, transparent 60%, rgba(10,14,20,0.9) 100%)', pointerEvents: 'none' }} />

          <button type="button" onClick={onBack} aria-label="Kapat"
            style={{ position: 'absolute', top: 54, left: 16, width: 44, height: 44, borderRadius: '50%', background: 'rgba(10,14,20,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={20} color="#FFFFFF" />
          </button>
          <button type="button" aria-label="Paylaş"
            onClick={() => { if (navigator.share) void navigator.share({ title: 'OYNA', text: `${facilityName} — Rahat maç, katıl!` }).catch(() => {}); }}
            style={{ position: 'absolute', top: 54, right: 16, width: 44, height: 44, borderRadius: '50%', background: 'rgba(10,14,20,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Share2 size={18} color="#FFFFFF" />
          </button>

          {photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              {photos.map((_, i) => (
                <span key={i} style={{ width: i === photoIdx ? 16 : 5, height: 3, borderRadius: 9999, background: i === photoIdx ? '#FFFFFF' : 'rgba(255,255,255,0.32)', transition: 'width .2s ease' }} />
              ))}
            </div>
          )}
        </div>

        {/* ── İptal / Onay şeritleri ── */}
        {isCancelled && (
          <div style={{ margin: '12px 20px 0', display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 14px', borderRadius: 14, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.35)' }}>
            <AlertTriangle size={15} color="#F87171" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, lineHeight: 1.45, color: '#F87171' }}>Maç iptal edildi — ödemen cüzdanına döndü.</p>
          </div>
        )}
        {isConfirmed && !isCancelled && (
          <div style={{ margin: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderRadius: 14, background: 'rgba(57,255,20,0.10)', border: '1px solid rgba(57,255,20,0.35)' }}>
            <Check size={15} color="#39FF14" strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: '#39FF14' }}>MAÇ ONAYLANDI</p>
          </div>
        )}

        {/* ── Tesis kimliği ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 14px' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, background: '#0d1712', border: '1px solid rgba(57,255,20,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 900, fontStyle: 'italic', color: '#39FF14' }}>{initialsOf(facilityName)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{facilityName}</h1>
            {courtName && <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 600, color: '#9CA3AF' }}>@{courtName}</p>}
          </div>
          {isFull ? (
            <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, letterSpacing: '.04em', color: '#39FF14' }}>KADRO TAM</span>
          ) : remain > 0 && remain <= 3 ? (
            <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: '#F87171' }}>{remain} yer kaldı</span>
          ) : null}
        </div>

        {/* ── Sekmeler ── */}
        <div style={{ display: 'flex', gap: 26, padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {(['durum', 'hakkinda'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} style={{ position: 'relative', padding: '0 0 11px', background: 'none', border: 'none', cursor: 'pointer' }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 900, letterSpacing: '.16em', color: tab === t ? '#FFFFFF' : '#6B7280' }}>
                {t === 'durum' ? 'DURUM' : 'HAKKINDA'}
              </span>
              {tab === t && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: '#39FF14', borderRadius: 2 }} />}
            </button>
          ))}
        </div>

        {/* ═══ DURUM ═══ */}
        {tab === 'durum' && (
          <div style={{ padding: '16px 20px 0' }}>
            <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>{match.date} · {match.time}</p>

            {/* Doluluk halkası + bilgi kutusu */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', marginBottom: 24 }}>
              <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
                <svg width="110" height="110" viewBox="0 0 110 110" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
                  <circle cx="55" cy="55" r="48" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                  <circle cx="55" cy="55" r="48" fill="none" stroke="#39FF14" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray="301.6" strokeDashoffset={cap > 0 ? 301.6 - (301.6 * filled) / cap : 301.6} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {isFull ? (
                    <>
                      <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.08em', color: '#39FF14' }}>KADRO</span>
                      <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.08em', color: '#39FF14' }}>TAM</span>
                    </>
                  ) : (
                    <>
                      <span className="font-numeric" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: '#FFFFFF' }}>{filled}/{cap}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#6B7280', marginTop: 1 }}>yer dolu</span>
                    </>
                  )}
                </div>
              </div>
              <div style={{ ...CARD, flex: 1, minWidth: 0, padding: '14px 15px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 11, boxShadow: '0 10px 24px rgba(0,0,0,0.35)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Users size={14} color="#6B7280" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#D1D5DB' }}>{cap} Oyuncu{match.format ? ` (${match.format})` : ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Shirt size={14} color="#6B7280" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em', color: RAHAT, background: `${RAHAT}1f`, border: `1px solid ${RAHAT}59`, borderRadius: 9999, padding: '3px 9px' }}>RAHAT</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <MapPin size={14} color="#6B7280" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#D1D5DB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[facilityName, courtName].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Kademe çubuğu */}
            <p style={SECTION_LABEL}>DURUM</p>
            <div style={{ position: 'relative', padding: '22px 4px 0', marginBottom: 20 }}>
              {filled > 0 && !isFull && !isConfirmed && !isCancelled && (
                <div style={{ position: 'absolute', top: -8, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
                  <span className="font-numeric" style={{ fontSize: 11, fontWeight: 600, color: '#0A0E14', background: '#39FF14', borderRadius: 9999, padding: '4px 10px', boxShadow: '0 0 18px rgba(57,255,20,0.35)' }}>{filled} oyuncu</span>
                </div>
              )}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ position: 'absolute', left: 7, right: 7, top: 7, height: 2, background: 'rgba(255,255,255,0.10)' }} />
                <div style={{ position: 'absolute', left: 7, top: 7, height: 2, background: '#39FF14', width: stepLine }} />
                {steps.map(st => (
                  <div key={st.label} style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 84 }}>
                    {st.state === 'done' && <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#39FF14', boxShadow: '0 0 12px rgba(57,255,20,0.5)' }} />}
                    {st.state === 'active' && <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#0A0E14', border: '3px solid #39FF14', boxShadow: '0 0 14px rgba(57,255,20,0.55)' }} />}
                    {st.state === 'future' && <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />}
                    <span style={{ marginTop: 9, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textAlign: 'center', color: st.state === 'future' ? '#6B7280' : '#39FF14' }}>{st.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Onay cümlesi — yalnız HESAPLANABİLİYORSA */}
            {!isFull && !isConfirmed && !isCancelled && decisionLabel && (
              <p style={{ margin: '0 0 26px', textAlign: 'center', fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: '#D1D5DB' }}>
                Maçın onaylanıp onaylanmadığını{' '}
                <span className="font-numeric" style={{ fontWeight: 700, color: '#FFFFFF', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 5, padding: '1px 6px' }}>{decisionLabel}</span>
                &apos;e kadar bildireceğiz.
              </p>
            )}

            {/* E5 · SENİN YERLERİN */}
            {isJoined && myPlaces.length > 0 && !isCancelled && (
              <div ref={squadRef} style={{ borderRadius: 20, background: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.20)', padding: '15px 15px 13px', marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '.14em', color: '#39FF14' }}>SENİN YERLERİN</p>
                  <span className="font-numeric" style={{ fontSize: 11, fontWeight: 600, color: '#8fe87a' }}>{myPlaces.length} yer</span>
                </div>
                {myPlaces.map(({ slot, side }, idx) => {
                  const occ = (slot as { occupant?: string }).occupant || slot.player?.id;
                  const assigned = !!occ;
                  const targetSlots = side === 'home' ? redSlots : whiteSlots;
                  const targetHasOpen = targetSlots.some(s => (s?.status || 'OPEN') === 'OPEN');
                  const teamLabel = side === 'home' ? 'Beyaz takım' : 'Kırmızı takım';
                  return (
                    <div key={slot.id} style={{ padding: '11px 0', borderTop: '1px solid rgba(57,255,20,0.12)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: assigned ? 0 : 9 }}>
                        {assigned
                          ? <Check size={14} color="#39FF14" strokeWidth={2.4} style={{ flexShrink: 0 }} />
                          : <Lock size={14} color="#8fe87a" style={{ flexShrink: 0 }} />}
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF' }}>
                          {teamLabel} · {idx + 1}. yerin
                          {assigned && <span style={{ color: '#8fe87a', fontWeight: 700 }}> — {occ === uid ? 'sahadasın' : 'arkadaşın sahada'}</span>}
                        </span>
                      </div>
                      {!assigned && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <button type="button" disabled={busy || iAmOnField} onClick={() => void handleSelfAssign(slot.id)}
                            style={{ minHeight: 34, padding: '0 12px', borderRadius: 9999, background: 'rgba(57,255,20,0.12)', border: '1px solid rgba(57,255,20,0.40)', color: '#39FF14', fontSize: 11, fontWeight: 800, cursor: 'pointer', opacity: iAmOnField ? 0.4 : 1 }}>
                            Kendini ekle
                          </button>
                          <button type="button" disabled={busy} onClick={() => setAssignPickerSlotId(slot.id)}
                            style={{ minHeight: 34, padding: '0 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#D1D5DB', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                            Arkadaş ekle
                          </button>
                          <button type="button" disabled={busy} onClick={() => void handleShareCode(slot.id)}
                            style={{ minHeight: 34, padding: '0 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#D1D5DB', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                            Kod paylaş
                          </button>
                        </div>
                      )}
                      {assigned && occ !== uid && (
                        <button type="button" disabled={busy} onClick={() => void handleUnassign(slot.id)}
                          style={{ marginTop: 7, padding: 0, background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: '#9CA3AF', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                          Arkadaşını çıkar
                        </button>
                      )}
                      {!assigned && (
                        targetHasOpen ? (
                          <button type="button" disabled={busy} onClick={() => void handleMoveTeam(slot.id, side)}
                            style={{ marginTop: 9, padding: 0, background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: '#93c5fd', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                            Takımı değiştir
                          </button>
                        ) : (
                          <span title="Karşı takım dolu" style={{ display: 'inline-block', marginTop: 9, fontSize: 11, fontWeight: 700, color: '#4B5563', cursor: 'not-allowed' }}>
                            Takımı değiştir
                          </span>
                        )
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={openLeave}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '9px 0 0', background: 'none', border: 'none', borderTop: '1px solid rgba(57,255,20,0.12)', fontSize: 11, fontWeight: 700, color: '#9CA3AF', cursor: 'pointer' }}>
                  Maçtan ayrıl
                </button>
              </div>
            )}

            {/* KADRO başlığı */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ ...SECTION_LABEL, margin: 0 }}>KADRO</p>
              {!isCancelled && !isFull && !isJoined && (
                <button type="button" onClick={() => setSheet('join')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 12px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer' }}>
                  <UserPlus size={13} color="#39FF14" strokeWidth={2} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#D1D5DB' }}>Arkadaş Davet Et</span>
                </button>
              )}
            </div>

            {loadingRoster && whiteRows.length === 0 && redRows.length === 0 ? (
              <div style={{ ...CARD, padding: '14px 15px' }} aria-label="Kadro yükleniyor">
                <div style={{ height: 12, width: 120, borderRadius: 4, background: 'rgba(255,255,255,0.07)', marginBottom: 14 }} />
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 12, minHeight: 56 }}>
                    <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                    <span style={{ flex: 1, height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
                    <span style={{ width: 44, height: 14, borderRadius: 9999, background: 'rgba(255,255,255,0.05)' }} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <RosterCard title="BEYAZ TAKIM" color={TEAM_WHITE} rows={whiteRows} filledLabel={`${wFilled}/${whiteSlots.length}`} />
                <RosterCard title="KIRMIZI TAKIM" color={TEAM_RED} rows={redRows} filledLabel={`${rFilled}/${redSlots.length}`} />
              </>
            )}

            {/* E6 · Yedek listesi */}
            {reserves.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <p style={{ ...SECTION_LABEL, color: '#FACC15' }}>YEDEK LİSTESİ</p>
                <div style={{ background: '#161B22', border: '1px solid rgba(250,204,21,0.22)', borderRadius: 20, padding: '6px 15px' }}>
                  {reserves.map((r, i) => {
                    const name = r?.id === uid ? 'Sen' : (r?.name || 'Oyuncu');
                    return (
                      <div key={`${r?.id || i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span className="font-numeric" style={{ fontSize: 13, fontWeight: 700, color: '#FACC15', width: 16, flexShrink: 0 }}>{i + 1}.</span>
                        <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#0d1712', border: '1px solid rgba(250,204,21,0.35)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, fontStyle: 'italic', color: '#FACC15' }}>
                          {initialsOf(name)}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: '#D1D5DB' }}>{name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ HAKKINDA ═══ */}
        {tab === 'hakkinda' && (
          <div style={{ padding: '18px 20px 0' }}>
            {/* 2×2 bilgi ızgarası */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <InfoTile icon={<Calendar size={14} color="#6B7280" />} label="TARİH" value={match.date} numeric />
              <InfoTile icon={<Clock size={14} color="#6B7280" />} label="SAAT" value={match.time} numeric />
              <InfoTile icon={<Banknote size={14} color="#6B7280" />} label="ÜCRET" value={price === 0 ? 'ÜCRETSİZ' : `${formatTRYShort(price)} / kişi`} numeric />
              {(pitch?.location || match.location) && (
                <InfoTile icon={<MapPin size={14} color="#6B7280" />} label="ADRES" value={pitch?.district || pitch?.location || match.location} />
              )}
            </div>

            {/* OYUNCU İHTİYACI */}
            {cap > 0 && (
              <div style={{ ...CARD, padding: 15, marginBottom: 12 }}>
                <p style={SECTION_LABEL}>OYUNCU İHTİYACI</p>
                <div style={{ display: 'flex', gap: 22, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF' }}>Min</span>
                    <span className="font-numeric" style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF' }}>{match.minPlayers ?? Math.max(cap - 2, 2)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF' }}>Maks</span>
                    <span className="font-numeric" style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF' }}>{cap}</span>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, lineHeight: 1.5, color: '#6B7280' }}>
                  Kadro {match.minPlayers ?? Math.max(cap - 2, 2)} kişiye ulaşmazsa maç iptal olur ve ödemeler iade edilir.
                </p>
              </div>
            )}

            {/* MAÇ SEVİYESİ */}
            <div style={{ ...CARD, padding: 15, marginBottom: 12 }}>
              <p style={SECTION_LABEL}>MAÇ SEVİYESİ</p>
              <span style={{ display: 'inline-block', fontSize: 13, fontWeight: 900, letterSpacing: '.14em', color: RAHAT, background: `${RAHAT}1f`, border: `1px solid ${RAHAT}66`, borderRadius: 9999, padding: '6px 15px', marginBottom: 12 }}>RAHAT</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {['Keyif odaklı tempo', 'Her seviye oyuncuya açık'].map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: RAHAT, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#D1D5DB' }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* MAÇ TİPİ */}
            <div style={{ ...CARD, padding: 15, marginBottom: 12 }}>
              <p style={SECTION_LABEL}>MAÇ TİPİ</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {[match.gender || 'Karma', match.format, durationLabel].filter(Boolean).map(ch => (
                  <span key={ch as string} style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: '#D1D5DB', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9999, padding: '6px 12px' }}>{ch}</span>
                ))}
              </div>
            </div>

            {/* AYAKKABI — footwear_rule yoksa HİÇ çizilmez */}
            {match.footwearRule && (
              <div style={{ ...CARD, padding: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Footprints size={20} color="#39FF14" strokeWidth={1.8} style={{ flexShrink: 0 }} />
                <div>
                  <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 900, letterSpacing: '.14em', color: '#6B7280' }}>AYAKKABI</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, letterSpacing: '.06em', color: '#FFFFFF' }}>
                    {match.footwearRule === 'CLEATS_OK' ? 'KRAMPON SERBEST' : 'HALI SAHA AYAKKABISI'}
                  </p>
                </div>
              </div>
            )}

            {/* TESİS */}
            {(pitch?.name || pitch?.description || pitch?.amenities?.length) ? (
              <div style={{ ...CARD, padding: 15, marginBottom: 12 }}>
                <p style={SECTION_LABEL}>TESİS</p>
                <p style={{ margin: '0 0 3px', fontSize: 15, fontWeight: 900, color: '#FFFFFF' }}>{pitch?.name || facilityName}</p>
                {pitch?.location && <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#9CA3AF' }}>{pitch.location}</p>}
                {pitch?.description && (
                  <p style={{ margin: '0 0 13px', fontSize: 12, fontWeight: 600, lineHeight: 1.55, color: '#D1D5DB' }}>{pitch.description}</p>
                )}
                {pitch?.amenities && pitch.amenities.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {pitch.amenities.map(am => (
                      <span key={am} style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', background: '#0f1419', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9999, padding: '6px 11px' }}>{am}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* HARİTA — koordinat yoksa kart HİÇ çizilmez */}
            {pitch?.coordinates && (
              <div style={{ ...CARD, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 15px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 900, color: '#FFFFFF' }}>{pitch.name || facilityName}</p>
                    {pitch.location && <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pitch.location}</p>}
                  </div>
                  <ChevronRight size={16} color="#6B7280" style={{ flexShrink: 0 }} />
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${pitch.coordinates.lat},${pitch.coordinates.lng}`}
                  target="_blank" rel="noreferrer"
                  style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '13px 15px', textDecoration: 'none' }}
                >
                  <Navigation size={15} color="#39FF14" style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: '#FFFFFF' }}>Yol Tarifi Al</span>
                  <ChevronRight size={15} color="#6B7280" />
                </a>
                <div style={{ position: 'relative', height: 200, overflow: 'hidden', background: '#0b0f16' }}>
                  {/* Statik koyu karo (CARTO dark) — canlı harita motoru gerekmez. */}
                  <img
                    alt="Konum haritası"
                    src={`https://a.basemaps.cartocdn.com/dark_all/15/${Math.floor(((pitch.coordinates.lng + 180) / 360) * 32768)}/${Math.floor(((1 - Math.log(Math.tan((pitch.coordinates.lat * Math.PI) / 180) + 1 / Math.cos((pitch.coordinates.lat * Math.PI) / 180)) / Math.PI) / 2) * 32768)}.png`}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.85)' }}
                  />
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 32, height: 32, borderRadius: '50%', background: '#39FF14', border: '3px solid #0A0E14', boxShadow: '0 0 20px rgba(57,255,20,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin size={16} color="#0A0E14" strokeWidth={2.6} />
                  </div>
                  <span className="font-numeric" style={{ position: 'absolute', right: 7, bottom: 5, fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>© OpenStreetMap · CARTO</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Sabit alt CTA ═══ */}
      {!isCancelled && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, padding: '14px 20px 30px', background: 'linear-gradient(180deg, rgba(10,14,20,0) 0%, rgba(10,14,20,0.92) 34%, #0A0E14 100%)' }}>
          {isConfirmed ? (
            <div style={{ width: '100%', height: 54, borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.1em', color: '#4B5563' }}>MAÇ ONAYLANDI — KADRO KİLİTLİ</span>
            </div>
          ) : isJoined ? (
            <>
              {myUnfilled.length > 0 ? (
                <button type="button" onClick={() => { setTab('durum'); squadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                  style={{ width: '100%', height: 54, borderRadius: 16, background: 'rgba(57,255,20,0.08)', border: '1.5px solid rgba(57,255,20,0.55)', color: '#39FF14', fontSize: 14, fontWeight: 900, letterSpacing: '.1em', cursor: 'pointer' }}>
                  YERLERİ DOLDUR ({myUnfilled.length})
                </button>
              ) : (
                <div style={{ width: '100%', height: 54, borderRadius: 16, background: 'rgba(57,255,20,0.06)', border: '1.5px solid rgba(57,255,20,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                  <Check size={15} color="#39FF14" strokeWidth={2.2} />
                  <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.08em', color: '#39FF14' }}>KADRODASIN</span>
                </div>
              )}
              <button type="button" onClick={openLeave}
                style={{ display: 'block', width: '100%', marginTop: 11, padding: 0, background: 'none', border: 'none', fontSize: 12, fontWeight: 700, color: '#9CA3AF', cursor: 'pointer' }}>
                Maçtan ayrıl
              </button>
            </>
          ) : onReserveList ? (
            <div style={{ width: '100%', height: 54, borderRadius: 16, background: 'rgba(250,204,21,0.06)', border: '1.5px solid rgba(250,204,21,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
              <Hourglass size={15} color="#FACC15" strokeWidth={2} />
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.08em', color: '#FACC15' }}>YEDEK LİSTESİNDESİN · {myReserveIdx + 1}. SIRA</span>
            </div>
          ) : isFull ? (
            <button type="button" onClick={() => setSheet('reserve')}
              style={{ width: '100%', height: 54, borderRadius: 16, background: 'rgba(250,204,21,0.08)', border: '1.5px solid rgba(250,204,21,0.55)', color: '#FACC15', fontSize: 14, fontWeight: 900, letterSpacing: '.1em', cursor: 'pointer' }}>
              YEDEK LİSTESİNE GİR
            </button>
          ) : (
            <button type="button" onClick={() => setSheet('join')}
              style={{ width: '100%', height: 54, borderRadius: 16, border: 'none', background: '#39FF14', color: '#0A0E14', fontSize: 14, fontWeight: 900, letterSpacing: '.1em', cursor: 'pointer', boxShadow: '0 0 28px rgba(57,255,20,0.26)' }}>
              {price === 0 ? 'KATIL · ÜCRETSİZ' : `KATIL · ${formatTRYShort(price)}`}
            </button>
          )}
        </div>
      )}

      {/* ═══ Sheet'ler ═══ */}
      {config && (
        <RahatJoinSheet
          open={sheet === 'join'}
          match={match}
          summary={summary}
          config={config}
          busy={busy}
          onClose={() => setSheet('')}
          onProceed={(ids, total) => void handleProceed(ids, total)}
        />
      )}

      {/* Yedek onayı — ÖDEME ALINMAZ */}
      {sheet === 'reserve' && (
        <div lang="tr" className="fixed inset-0 z-[55]">
          <div onClick={() => setSheet('')} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(5px)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#161B22', borderTop: '1px solid rgba(255,255,255,0.08)', borderRadius: '28px 28px 0 0', boxShadow: '0 -14px 50px rgba(0,0,0,0.55)', paddingBottom: 30 }}>
            <div style={{ padding: '11px 0 4px', display: 'flex', justifyContent: 'center' }}>
              <span style={{ width: 40, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.20)' }} />
            </div>
            <div style={{ padding: '4px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, letterSpacing: '.16em', color: '#FACC15' }}>YEDEK LİSTESİ</h2>
              <button type="button" onClick={() => setSheet('')} aria-label="Kapat" style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                <X size={15} color="#9CA3AF" />
              </button>
            </div>
            <div style={{ margin: '18px 20px 0', display: 'flex', alignItems: 'center', gap: 11, padding: 13, borderRadius: 16, background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.25)' }}>
              <Hourglass size={18} color="#FACC15" strokeWidth={2} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900, letterSpacing: '.06em', color: '#FACC15' }}>ŞİMDİ ÖDEME ALINMAZ</p>
            </div>
            <p style={{ margin: '14px 20px 0', fontSize: 13, fontWeight: 600, lineHeight: 1.55, color: '#D1D5DB' }}>
              Yer açılırsa ilk sana haber vereceğiz. Yerini almak için o an ödeme yapman gerekir.
            </p>
            <div style={{ padding: '20px 20px 0' }}>
              <button type="button" disabled={busy} onClick={() => void handleJoinReserve()}
                style={{ width: '100%', height: 54, borderRadius: 16, background: 'rgba(250,204,21,0.10)', border: '1.5px solid rgba(250,204,21,0.55)', color: '#FACC15', fontSize: 14, fontWeight: 900, letterSpacing: '.1em', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
                {busy ? 'İŞLENİYOR…' : 'SIRAYA GİR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ayrılma onayı — SUNUCU hesaplı iade */}
      {sheet === 'leave' && (
        <div lang="tr" className="fixed inset-0 z-[55]">
          <div onClick={() => setSheet('')} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(5px)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#161B22', borderTop: '1px solid rgba(255,255,255,0.08)', borderRadius: '28px 28px 0 0', boxShadow: '0 -14px 50px rgba(0,0,0,0.55)', paddingBottom: 30 }}>
            <div style={{ padding: '11px 0 4px', display: 'flex', justifyContent: 'center' }}>
              <span style={{ width: 40, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.20)' }} />
            </div>
            <div style={{ padding: '4px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, letterSpacing: '.16em', color: '#FFFFFF' }}>MAÇTAN AYRIL</h2>
              <button type="button" onClick={() => setSheet('')} aria-label="Kapat" style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                <X size={15} color="#9CA3AF" />
              </button>
            </div>

            {leaveQuoteLoading ? (
              <p style={{ margin: '18px 20px 0', fontSize: 13, fontWeight: 600, color: '#9CA3AF' }}>İade tutarın hesaplanıyor…</p>
            ) : leaveQuote ? (
              <>
                <div style={{ margin: '16px 20px 0', padding: 14, borderRadius: 16, background: '#0f1419', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF' }}>Bırakılacak yer</span>
                    <span className="font-numeric" style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>{Math.max(myUnfilled.length + (iAmOnField ? 1 : 0), 1)} yer</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF' }}>Hesaplanan iade</span>
                    <span className="font-numeric" style={{ fontSize: 20, fontWeight: 700, color: '#39FF14' }}>{formatTRYAmount(leaveQuote.refundable)}</span>
                  </div>
                </div>
                {leaveQuote.late && (
                  <div style={{ margin: '12px 20px 0', display: 'flex', gap: 9, padding: '12px 13px', borderRadius: 14, background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.25)' }}>
                    <AlertTriangle size={15} color="#FACC15" style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, lineHeight: 1.45, color: '#FACC15' }}>
                      Bu saatten sonra ayrılmak güvenilirlik puanını düşürür.
                    </p>
                  </div>
                )}
                <p style={{ margin: '12px 20px 0', fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: '#6B7280' }}>
                  {leaveQuoteMessage(leaveQuote, false, !leaveQuote.inSquad).text}
                </p>
              </>
            ) : (
              <div style={{ margin: '16px 20px 0', display: 'flex', gap: 9, padding: '12px 13px', borderRadius: 14, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.35)' }}>
                <Info size={15} color="#F87171" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, lineHeight: 1.45, color: '#F87171' }}>
                  İade tutarı hesaplanamadı — ayrılma şu an güvenli değil. Lütfen tekrar dene.
                </p>
              </div>
            )}

            <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <button type="button" disabled={busy || leaveQuoteLoading || !leaveQuote} onClick={() => void handleLeave()}
                style={{ width: '100%', height: 50, borderRadius: 16, background: 'rgba(248,113,113,0.10)', border: '1.5px solid rgba(248,113,113,0.50)', color: '#F87171', fontSize: 13, fontWeight: 900, letterSpacing: '.08em', cursor: 'pointer', opacity: busy || leaveQuoteLoading || !leaveQuote ? 0.4 : 1 }}>
                AYRILMAYI ONAYLA
              </button>
              <button type="button" onClick={() => setSheet('')}
                style={{ width: '100%', height: 44, borderRadius: 14, background: 'none', border: 'none', color: '#9CA3AF', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Arkadaş seçici (tek yer için) */}
      {assignPickerSlotId && (
        <MatchSquadPicker
          onClose={() => setAssignPickerSlotId(null)}
          openSlotCount={1}
          onToast={(m) => showToast(m)}
          onPickTeam={() => showToast('Rahat maçta takım ataması yok — arkadaş seç.')}
          onAddFriends={(players) => {
            const first = players[0];
            setAssignPickerSlotId(null);
            if (first && assignPickerSlotId) void handleAssignFriend(assignPickerSlotId, first.id);
          }}
        />
      )}
    </div>
  );
};

export default RahatMatchLobby;
