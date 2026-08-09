import React, { useMemo, useState, useCallback } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import {
  Shield, Users, Calendar, ChevronRight, GripVertical, Loader2,
  Archive, Check, X, Mail,
} from 'lucide-react';
import { AppView } from '../../types';
import TeamCrest from '../../components/social/TeamCrest';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonList from '../../components/ui/SkeletonList';
import Avatar from '../../components/ui/Avatar';
import {
  MyTeamRow, TeamInviteRow, formatLabel,
  respondTeamInvite, restoreTeam, saveMyTeamOrder, parseTeamError,
} from '../../services/teamSocialService';

// ================================================================
// MyTeamsPanel — "Takımlarım" alt-sekmesi (Spec §3.7 / H43-45)
// Davetlerin şeridi → KAPTANLIKLARIM → ÜYELİKLERİM → Arşiv.
// Kart: sol takım-rengi şeridi + arma + %100 gerçek veri.
// Sıralama: tutamaçla sürükle (bölüm içi), kalıcı (set_my_team_order).
// ================================================================

interface MyTeamsPanelProps {
  teams: MyTeamRow[];
  invites: TeamInviteRow[];
  loading: boolean;
  onRefresh: () => void;
  onOpenTeam: (teamId: string) => void;
  onCreate: () => void;
  onExplore: () => void;
  onToast: (msg: string) => void;
}

const TeamCard: React.FC<{
  team: MyTeamRow;
  draggable: boolean;
  onOpen: () => void;
}> = ({ team, draggable, onOpen }) => {
  const controls = useDragControls();
  const c1 = team.color1 || '#39FF14';
  const nextLine = team.next_match_id
    ? `${team.next_match_date || ''} ${team.next_match_time ? '· ' + team.next_match_time : ''} ${team.next_match_location ? '· ' + team.next_match_location : ''}`.trim()
    : null;

  const inner = (
    <div
      onClick={onOpen}
      className="relative flex items-center gap-3 rounded-2xl bg-white/4 border border-white/6 p-3.5 overflow-hidden active:scale-[0.99] cursor-pointer"
    >
      {/* Takım-rengi kimlik şeridi (H kuralı: yapı sade, kimlik zengin) */}
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: c1 }} />
      <div
        className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center border border-white/8"
        style={{ background: `linear-gradient(135deg, ${c1}22, transparent)` }}
      >
        <TeamCrest config={team.crest_config} color1={team.color1} color2={team.color2} size={40} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[0.9375rem] font-extrabold italic truncate">{team.name}</span>
          <span className="shrink-0 text-[0.6875rem] font-extrabold px-1.5 py-0.5 rounded bg-white/8 text-white/50">
            {formatLabel(team.format)}
          </span>
        </div>
        <div className="text-[0.6875rem] text-ink-4 mt-0.5">
          {team.wins}G {team.draws}B {team.losses}M · {team.member_count} oyuncu
          {team.pending_invites > 0 ? ` · ${team.pending_invites} davet bekliyor` : ''}
        </div>
        <div className="text-[0.6875rem] mt-1 flex items-center gap-1 truncate">
          {nextLine ? (
            <>
              <Calendar size={11} style={{ color: c1 }} />
              <span className="text-white/70 font-semibold truncate">{nextLine}</span>
            </>
          ) : (
            <span className="text-ink-4 flex items-center gap-1">
              Maç planla <ChevronRight size={11} />
            </span>
          )}
        </div>
      </div>
      {draggable && (
        <span
          onPointerDown={e => { e.stopPropagation(); controls.start(e); }}
          onClick={e => e.stopPropagation()}
          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-ink-4 touch-none cursor-grab active:cursor-grabbing"
          aria-label="Sırala"
        >
          <GripVertical size={16} />
        </span>
      )}
    </div>
  );

  if (!draggable) return inner;
  return (
    <Reorder.Item
      value={team.team_id}
      dragListener={false}
      dragControls={controls}
      className="list-none"
    >
      {inner}
    </Reorder.Item>
  );
};

const MyTeamsPanel: React.FC<MyTeamsPanelProps> = ({
  teams, invites, loading, onRefresh, onOpenTeam, onCreate, onExplore, onToast,
}) => {
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [siralamaHatasi, setSiralamaHatasi] = useState(false);
  const [busyRestore, setBusyRestore] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const active = useMemo(() => teams.filter(t => !t.is_archived), [teams]);
  const archived = useMemo(
    () => teams.filter(t => t.is_archived && t.my_role === 'CAPTAIN'),
    [teams],
  );
  const bySort = (a: MyTeamRow, b: MyTeamRow) => a.my_sort_order - b.my_sort_order;
  const captainTeams = useMemo(
    () => active.filter(t => t.my_role === 'CAPTAIN' || t.my_role === 'ADMIN').sort(bySort),
    [active],
  );
  const memberTeams = useMemo(
    () => active.filter(t => t.my_role === 'MEMBER').sort(bySort),
    [active],
  );

  const [captainOrder, setCaptainOrder] = useState<string[] | null>(null);
  const [memberOrder, setMemberOrder] = useState<string[] | null>(null);

  const orderedCaptain = useMemo(() => {
    if (!captainOrder) return captainTeams;
    const byId = new Map(captainTeams.map(t => [t.team_id, t]));
    return captainOrder.map(id => byId.get(id)).filter(Boolean) as MyTeamRow[];
  }, [captainTeams, captainOrder]);
  const orderedMember = useMemo(() => {
    if (!memberOrder) return memberTeams;
    const byId = new Map(memberTeams.map(t => [t.team_id, t]));
    return memberOrder.map(id => byId.get(id)).filter(Boolean) as MyTeamRow[];
  }, [memberTeams, memberOrder]);

  const persistOrder = useCallback(async () => {
    // Kaptanlıklar üstte değişmezi korunur: iki bölüm ardışık indekslenir
    const ids = [
      ...(captainOrder ?? captainTeams.map(t => t.team_id)),
      ...(memberOrder ?? memberTeams.map(t => t.team_id)),
    ];
    // Denetim bulgusu 20: kaydedilemeyen sıralama sessizce yutuluyordu;
    // kullanıcı kaydettim sanıp sonraki açılışta eski sırayı görüyordu.
    try { await saveMyTeamOrder(ids); }
    catch { setSiralamaHatasi(true); setTimeout(() => setSiralamaHatasi(false), 4000); }
  }, [captainOrder, memberOrder, captainTeams, memberTeams]);

  const handleInvite = useCallback(async (inv: TeamInviteRow, accept: boolean) => {
    setBusyInvite(inv.id);
    try {
      await respondTeamInvite(inv.id, accept);
      if (accept) onToast(`${inv.team_name} kadrosuna katıldın 🎉`);
      onRefresh();
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setBusyInvite(null); }
  }, [onRefresh, onToast]);

  const handleRestore = useCallback(async (teamId: string) => {
    setBusyRestore(teamId);
    try { await restoreTeam(teamId); onToast('Takım geri açıldı'); onRefresh(); }
    catch (e) { onToast(parseTeamError(e)); }
    finally { setBusyRestore(null); }
  }, [onRefresh, onToast]);

  if (loading) return <SkeletonList rows={4} />;

  return (
    <div className="pb-safe-nav space-y-5">
      {siralamaHatasi && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5 text-[0.6875rem] font-bold text-amber-300">
          Sıralama kaydedilemedi — internetin gelince tekrar dene.
        </div>
      )}
      {/* Davetlerin şeridi (K69) */}
      {invites.length > 0 && (
        <div className="rounded-2xl bg-[#39FF14]/6 border border-[#39FF14]/20 p-3.5">
          <div className="text-[0.625rem] font-extrabold uppercase tracking-widest text-[#39FF14]/80 mb-2.5 flex items-center gap-1.5">
            <Mail size={11} /> Davetlerin ({invites.length})
          </div>
          <div className="space-y-2">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-2.5">
                <Avatar name={inv.full_name} src={inv.avatar_url} size="sm" />
                <div className="flex-1 min-w-0 text-[0.75rem]">
                  <b>{inv.full_name}</b>
                  <span className="text-white/50"> seni </span>
                  <b>{inv.team_name}</b>
                  <span className="text-white/50"> kadrosuna davet etti</span>
                </div>
                {busyInvite === inv.id ? (
                  <Loader2 size={15} className="animate-spin text-ink-4" />
                ) : (
                  <>
                    <button
                      onClick={() => handleInvite(inv, false)}
                      aria-label="Reddet"
                      className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 active:scale-95"
                    >
                      <X size={14} />
                    </button>
                    <button
                      onClick={() => handleInvite(inv, true)}
                      className="h-9 px-3 rounded-xl bg-[#39FF14] text-[#0A0E14] text-[0.6875rem] font-extrabold flex items-center gap-1 active:scale-95"
                    >
                      <Check size={12} /> Katıl
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {active.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="Henüz bir takımın yok"
          description="Kendi takımını kur ya da şehrindeki takımları keşfet."
          actions={[
            { label: 'Takım Kur', onClick: onCreate, primary: true },
            { label: 'Takımları Keşfet', onClick: onExplore },
          ]}
        />
      ) : (
        <>
          {orderedCaptain.length > 0 && (
            <div>
              <h3 className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 mb-2.5">
                Kaptanlıklarım
              </h3>
              <Reorder.Group
                axis="y"
                values={orderedCaptain.map(t => t.team_id)}
                onReorder={ids => setCaptainOrder(ids as string[])}
                className="space-y-2.5"
                onPointerUp={persistOrder}
              >
                {orderedCaptain.map(t => (
                  <TeamCard key={t.team_id} team={t} draggable onOpen={() => onOpenTeam(t.team_id)} />
                ))}
              </Reorder.Group>
            </div>
          )}

          {orderedMember.length > 0 && (
            <div>
              <h3 className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 mb-2.5">
                Üyeliklerim
              </h3>
              <Reorder.Group
                axis="y"
                values={orderedMember.map(t => t.team_id)}
                onReorder={ids => setMemberOrder(ids as string[])}
                className="space-y-2.5"
                onPointerUp={persistOrder}
              >
                {orderedMember.map(t => (
                  <TeamCard key={t.team_id} team={t} draggable onOpen={() => onOpenTeam(t.team_id)} />
                ))}
              </Reorder.Group>
            </div>
          )}
        </>
      )}

      {/* Arşiv — kaptan 30 gün içinde geri açabilir (K72) */}
      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setArchiveOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-ink-4 min-h-[44px] px-1"
          >
            <Archive size={12} /> Arşiv ({archived.length})
            <ChevronRight size={13} className={`transition-transform ${archiveOpen ? 'rotate-90' : ''}`} />
          </button>
          {archiveOpen && (
            <div className="space-y-2">
              {archived.map(t => (
                <div key={t.team_id} className="flex items-center gap-3 rounded-2xl bg-white/3 border border-white/5 p-3 opacity-70">
                  <TeamCrest config={t.crest_config} color1={t.color1} color2={t.color2} size={32} />
                  <span className="flex-1 text-sm font-bold text-white/60 truncate">{t.name}</span>
                  <button
                    disabled={busyRestore === t.team_id}
                    onClick={() => handleRestore(t.team_id)}
                    className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-[0.6875rem] font-bold text-white/70 active:scale-95"
                  >
                    {busyRestore === t.team_id ? '…' : 'Geri Aç'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MyTeamsPanel;
