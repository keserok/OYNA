import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Check, X, Loader2, Crown, ShieldCheck, UserPlus, Users, ArrowRightLeft, UserMinus,
} from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import BottomSheet from '../../components/ui/BottomSheet';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonList from '../../components/ui/SkeletonList';
import {
  MyTeamRow, TeamSquadRow, TeamJoinRequestRow, TeamInviteRow,
  getTeamJoinRequests, getTeamOutgoingInvites, respondJoinRequest,
  cancelTeamInvite, setMemberRole, transferCaptaincy, removeTeamMember,
  setJerseyNumber, parseTeamError,
} from '../../services/teamSocialService';

// ================================================================
// TeamSquadTab — Takım Detayı → Kadro sekmesi (Spec §3.8)
// En üstte Bekleyenler (katılma istekleri + giden davetler, yalnız
// yönetici görür) → üye listesi (rol rozeti + forma no) → üye
// aksiyon sayfası (yetki matrisi K67: rol=kaptan, çıkar=yönetici).
// ================================================================

const ROLE_ORDER: Record<string, number> = { CAPTAIN: 0, ADMIN: 1, MEMBER: 2 };

interface TeamSquadTabProps {
  team: MyTeamRow;
  squad: TeamSquadRow[];
  loading: boolean;
  userId: string;
  onRefresh: () => void;
  onOpenInvite: () => void;
  onToast: (msg: string) => void;
}

const TeamSquadTab: React.FC<TeamSquadTabProps> = ({
  team, squad, loading, userId, onRefresh, onOpenInvite, onToast,
}) => {
  const isCaptain = team.my_role === 'CAPTAIN';
  const isAdmin = isCaptain || team.my_role === 'ADMIN';

  const [requests, setRequests] = useState<TeamJoinRequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<TeamInviteRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [member, setMember] = useState<TeamSquadRow | null>(null);
  const [jersey, setJersey] = useState('');
  const [confirm, setConfirm] = useState<'REMOVE' | 'TRANSFER' | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  const loadPending = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [reqs, outs] = await Promise.all([
        getTeamJoinRequests(team.team_id),
        getTeamOutgoingInvites(team.team_id),
      ]);
      setRequests(reqs); setOutgoing(outs);
    } catch (e) {
      console.error('[TeamSquad] bekleyenler yüklenemedi', e);
    }
  }, [team.team_id, isAdmin]);

  useEffect(() => { void loadPending(); }, [loadPending]);

  const sorted = useMemo(
    () => [...squad].sort((a, b) =>
      (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3)
      || (a.joined_at || '').localeCompare(b.joined_at || '')),
    [squad],
  );

  const handleRequest = async (req: TeamJoinRequestRow, approve: boolean) => {
    setBusyId(req.id);
    try {
      await respondJoinRequest(req.id, approve);
      setRequests(prev => prev.filter(r => r.id !== req.id));
      if (approve) { onToast(`${req.full_name} kadroya katıldı 🎉`); onRefresh(); }
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setBusyId(null); }
  };

  const handleCancelInvite = async (inv: TeamInviteRow) => {
    setBusyId(inv.id);
    try {
      await cancelTeamInvite(inv.id);
      setOutgoing(prev => prev.filter(i => i.id !== inv.id));
      onRefresh();
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setBusyId(null); }
  };

  const openMember = (m: TeamSquadRow) => {
    // Aksiyon sayfası yalnız yetkisi olana açılır (K67)
    const selfJerseyOnly = isCaptain && m.user_id === userId;
    const canManage = isAdmin && m.user_id !== userId && m.role !== 'CAPTAIN';
    const canTransfer = isCaptain && m.user_id !== userId;
    if (!selfJerseyOnly && !canManage && !canTransfer) return;
    setMember(m);
    setJersey(m.jersey_number != null ? String(m.jersey_number) : '');
  };

  const saveJersey = async () => {
    if (!member) return;
    const n = jersey.trim() === '' ? null : parseInt(jersey, 10);
    if (n !== null && (isNaN(n) || n < 1 || n > 99)) { onToast('Forma numarası 1-99 olmalı.'); return; }
    setSheetBusy(true);
    try {
      await setJerseyNumber(team.team_id, member.user_id, n);
      onToast('Forma numarası güncellendi');
      setMember(null); onRefresh();
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setSheetBusy(false); }
  };

  const toggleRole = async () => {
    if (!member) return;
    const next = member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    setSheetBusy(true);
    try {
      await setMemberRole(team.team_id, member.user_id, next);
      onToast(next === 'ADMIN'
        ? `${member.full_name} artık yönetici`
        : `${member.full_name} yöneticilikten alındı`);
      setMember(null); onRefresh();
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setSheetBusy(false); }
  };

  const doTransfer = async () => {
    if (!member) return;
    setSheetBusy(true);
    try {
      await transferCaptaincy(team.team_id, member.user_id);
      onToast(`Kaptanlık ${member.full_name} oyuncusuna devredildi 👑`);
      setConfirm(null); setMember(null); onRefresh();
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setSheetBusy(false); }
  };

  const doRemove = async () => {
    if (!member) return;
    setSheetBusy(true);
    try {
      await removeTeamMember(team.team_id, member.user_id);
      onToast(`${member.full_name} kadrodan çıkarıldı`);
      setConfirm(null); setMember(null); onRefresh();
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setSheetBusy(false); }
  };

  if (loading) return <SkeletonList rows={5} />;

  const memberIsSelf = member?.user_id === userId;

  return (
    <div className="space-y-5">
      {/* ── Bekleyenler (yalnız yönetici — Spec §3.8 Kadro) ── */}
      {isAdmin && (requests.length > 0 || outgoing.length > 0) && (
        <div className="rounded-2xl bg-[#39FF14]/6 border border-[#39FF14]/20 p-3.5">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#39FF14]/80 mb-2.5">
            Bekleyenler ({requests.length + outgoing.length})
          </div>
          <div className="space-y-2">
            {requests.map(req => (
              <div key={req.id} className="flex items-center gap-2.5">
                <Avatar name={req.full_name} src={req.avatar_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px]">
                    <b>{req.full_name}</b>
                    <span className="text-white/50"> katılmak istiyor</span>
                  </div>
                  {req.message && (
                    <div className="text-[11px] text-white/40 italic truncate">“{req.message}”</div>
                  )}
                </div>
                {busyId === req.id ? (
                  <Loader2 size={15} className="animate-spin text-white/40" />
                ) : (
                  <>
                    <button
                      onClick={() => handleRequest(req, false)}
                      aria-label="Reddet"
                      className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 active:scale-95"
                    >
                      <X size={14} />
                    </button>
                    <button
                      onClick={() => handleRequest(req, true)}
                      className="h-9 px-3 rounded-xl bg-[#39FF14] text-[#0A0E14] text-[11px] font-black flex items-center gap-1 active:scale-95"
                    >
                      <Check size={12} /> Onayla
                    </button>
                  </>
                )}
              </div>
            ))}
            {outgoing.map(inv => (
              <div key={inv.id} className="flex items-center gap-2.5">
                <Avatar name={inv.full_name} src={inv.avatar_url} size="sm" />
                <div className="flex-1 min-w-0 text-[12px]">
                  <b>{inv.full_name}</b>
                  <span className="text-white/50"> davet edildi</span>
                </div>
                <button
                  onClick={() => handleCancelInvite(inv)}
                  disabled={busyId === inv.id}
                  className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-white/60 active:scale-95 disabled:opacity-50"
                >
                  {busyId === inv.id ? '…' : 'Geri Çek'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Kadro listesi ── */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">
            Kadro ({squad.length}/20)
          </h3>
          {isAdmin && (
            <button
              onClick={onOpenInvite}
              className="h-9 px-3 rounded-xl bg-[#39FF14] text-[#0A0E14] text-[11px] font-black flex items-center gap-1.5 active:scale-95"
            >
              <UserPlus size={13} /> Davet Et
            </button>
          )}
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Kadro boş görünüyor"
            description={isAdmin ? 'Arkadaşlarını davet ederek kadronu kur.' : undefined}
            actions={isAdmin ? [{ label: 'Davet Et', onClick: onOpenInvite, primary: true }] : []}
          />
        ) : (
          <div className="space-y-2">
            {sorted.map(m => {
              const self = m.user_id === userId;
              return (
                <button
                  key={m.user_id}
                  onClick={() => openMember(m)}
                  className="w-full flex items-center gap-3 rounded-2xl bg-white/4 border border-white/6 p-3 text-left active:scale-[0.99]"
                >
                  <Avatar name={m.full_name} src={m.avatar_url} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold truncate">
                        {m.full_name}{self ? ' (sen)' : ''}
                      </span>
                      {m.role === 'CAPTAIN' && (
                        <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-[#F2C500]/12 text-[#F2C500] flex items-center gap-0.5">
                          <Crown size={9} /> Kaptan
                        </span>
                      )}
                      {m.role === 'ADMIN' && (
                        <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-white/8 text-white/55 flex items-center gap-0.5">
                          <ShieldCheck size={9} /> Yönetici
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-white/35 truncate">
                      {m.oyna_id ? `@${m.oyna_id}` : ''}
                      {m.pos ? `${m.oyna_id ? ' · ' : ''}${m.pos}` : ''}
                    </div>
                  </div>
                  {m.jersey_number != null && (
                    <span
                      className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black border border-white/10"
                      style={{ backgroundColor: `${team.color1 || '#39FF14'}1f`, color: team.color1 || '#39FF14' }}
                    >
                      {m.jersey_number}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Üye aksiyon sayfası ── */}
      <BottomSheet open={!!member} onClose={() => setMember(null)} ariaLabel="Üye yönetimi">
        {member && (
          <div className="pb-6">
            <div className="flex items-center gap-3">
              <Avatar name={member.full_name} src={member.avatar_url} size="lg" />
              <div className="min-w-0">
                <div className="text-base font-black truncate">{member.full_name}</div>
                <div className="text-[11px] text-white/40">
                  {member.role === 'CAPTAIN' ? 'Kaptan' : member.role === 'ADMIN' ? 'Yönetici' : 'Oyuncu'}
                  {member.oyna_id ? ` · @${member.oyna_id}` : ''}
                </div>
              </div>
            </div>

            {/* Forma no — RLS gereği yalnız kaptan yazar (tm_update_captain) */}
            {isCaptain && (
              <div className="mt-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  Forma Numarası
                </label>
                <div className="flex gap-2 mt-1.5">
                  <input
                    inputMode="numeric"
                    value={jersey}
                    onChange={e => setJersey(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="—"
                    className="w-20 h-11 rounded-xl bg-white/5 border border-white/10 text-center text-base font-black tabular-nums placeholder:text-white/20 focus:outline-none focus:border-[#39FF14]/50"
                  />
                  <button
                    onClick={saveJersey}
                    disabled={sheetBusy}
                    className="h-11 px-4 rounded-xl bg-white/8 border border-white/12 text-xs font-black active:scale-95 disabled:opacity-50"
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            )}

            {!memberIsSelf && (
              <div className="mt-4 space-y-2">
                {isCaptain && member.role !== 'CAPTAIN' && (
                  <button
                    onClick={toggleRole}
                    disabled={sheetBusy}
                    className="w-full min-h-[46px] rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white/80 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                  >
                    <ShieldCheck size={15} className="text-[#39FF14]" />
                    {member.role === 'ADMIN' ? 'Yöneticiliği Al' : 'Yönetici Yap'}
                  </button>
                )}
                {isCaptain && (
                  <button
                    onClick={() => setConfirm('TRANSFER')}
                    disabled={sheetBusy}
                    className="w-full min-h-[46px] rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white/80 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                  >
                    <ArrowRightLeft size={15} className="text-[#F2C500]" /> Kaptanlığı Devret
                  </button>
                )}
                {isAdmin && member.role !== 'CAPTAIN' && (
                  <button
                    onClick={() => setConfirm('REMOVE')}
                    disabled={sheetBusy}
                    className="w-full min-h-[46px] rounded-2xl bg-[#FF4D4D]/8 border border-[#FF4D4D]/25 text-sm font-bold text-[#FF4D4D] flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                  >
                    <UserMinus size={15} /> Kadrodan Çıkar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={confirm === 'TRANSFER'}
        title="Kaptanlığı devret?"
        description={`${member?.full_name || ''} takımın yeni kaptanı olur; sen yönetici olarak kalırsın. Bu işlem geri alınamaz.`}
        confirmLabel="Devret"
        danger={false}
        onConfirm={doTransfer}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'REMOVE'}
        title="Kadrodan çıkar?"
        description={`${member?.full_name || ''} kadrodan çıkarılacak ve nazik bir bilgilendirme alacak.`}
        confirmLabel="Çıkar"
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

export default TeamSquadTab;
