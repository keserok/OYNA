import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Plus, Users, CheckCircle2, Circle, AlertTriangle,
  UserPlus, Copy, Share2, RefreshCw, Crown, KeyRound, Trash2, Check, Clock,
  Shield, MessageCircle,
} from 'lucide-react';
import { LoadingState } from '../../components/common/StatusState';
import { useConfirmSheet } from './components/useConfirmSheet';
import {
  getStaffTasks, upsertStaffTask, toggleStaffTaskStatus, toTurkishError,
} from '../../services/pitchOwnerService';
import {
  getPitchTeam, staffInvite, staffRegenerateInvite, staffSetRole, staffRemove,
  staffSetDuty, staffUpsertRoster, staffDeleteRoster,
  type TeamMember, type AccessLevel, type StaffRole, type InviteResult,
} from '../../services/staffService';
import type { PitchStaffTask } from '../../types';
import { useOwnerToast } from './components/useOwnerToast';
import { OwnerDemoDataBar } from './components/OwnerDemoDataBar';
import { BottomSheetModal } from './finance/BottomSheetModal';
import { expiryText } from '../../shared/staffModel';

interface OwnerTeamViewProps {
  pitchId: string;
  isDemoMode?: boolean;
  readOnly?: boolean;
  maxStaff?: number;
  /** Panelin erişim seviyesi — davet/rol/kaldır yalnız OWNER'a açık. */
  accessLevel?: AccessLevel;
}

const PRIORITY_LABEL: Record<PitchStaffTask['priority'], string> = { LOW: 'Düşük', MEDIUM: 'Orta', HIGH: 'Yüksek' };
const PRIORITY_COLOR: Record<PitchStaffTask['priority'], string> = {
  LOW: 'text-gray-400 border-gray-500/30',
  MEDIUM: 'text-amber-400 border-amber-500/30',
  HIGH: 'text-red-400 border-red-500/30',
};

// ── Hesap durumu rozetleri ──────────────────────────────────────────────────
const STATUS_META: Record<TeamMember['account_status'], { label: string; cls: string }> = {
  ACTIVE:  { label: 'Aktif',   cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  INVITED: { label: 'Davetli', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
  PASSIVE: { label: 'Pasif',   cls: 'bg-gray-500/15 text-gray-400 border-gray-500/25' },
  ROSTER:  { label: 'Liste',   cls: 'bg-white/5 text-gray-400 border-white/10' },
};

const avatarFor = (m: { name: string; avatar_url?: string | null; staff_role?: StaffRole }) =>
  m.avatar_url ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=${m.staff_role === 'MANAGER' ? '6366f1' : '8b5cf6'}&color=fff`;

export const OwnerTeamView: React.FC<OwnerTeamViewProps> = ({
  pitchId, isDemoMode, readOnly = false, maxStaff = 10, accessLevel = 'OWNER',
}) => {
  const notify = useOwnerToast();
  const [teamTab, setTeamTab] = useState<'STAFF' | 'TASKS'>('STAFF');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<PitchStaffTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modallar
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [codeSheet, setCodeSheet] = useState<InviteResult | null>(null);
  const [memberSheet, setMemberSheet] = useState<TeamMember | null>(null);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const canManageStaff = accessLevel === 'OWNER';                         // davet/rol/erişim-kaldır
  const canManageRoster = accessLevel === 'OWNER' || accessLevel === 'MANAGER'; // roster/nöbet/görev
  const writable = !readOnly && canManageRoster;
  const { confirm, confirmElement } = useConfirmSheet();

  const canUseDb = !!pitchId && !pitchId.startsWith('mock-');

  const load = useCallback(async () => {
    if (!canUseDb) { setTeam([]); setTasks([]); setIsLoading(false); return; }
    setIsLoading(true); setLoadError(null);
    try {
      const [members, taskRows] = await Promise.all([getPitchTeam(pitchId), getStaffTasks(pitchId)]);
      setTeam(members); setTasks(taskRows);
    } catch (err) { setLoadError(toTurkishError(err)); }
    finally { setIsLoading(false); }
  }, [pitchId, canUseDb]);

  useEffect(() => { load(); }, [load]);

  const activeMembers = useMemo(() => team.filter((m) => m.account_status === 'ACTIVE'), [team]);
  const onDuty = useMemo(() => team.filter((m) => m.status === 'ON_DUTY'), [team]);
  const managers = useMemo(() => team.filter((m) => m.staff_role === 'MANAGER' && m.account_status === 'ACTIVE'), [team]);
  const hasDemoData = team.some((m) => m.is_demo) || tasks.some((t) => t.is_demo);

  // ── Eylemler ──────────────────────────────────────────────────────────────
  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { notify('Kod kopyalanamadı, elle girin.', 'warning'); }
  };
  const inviteText = (r: InviteResult) =>
    `OYNA tesis davet kodun: ${r.invite_code}\nUygulamada "Tesise Katıl" bölümüne gir, 72 saat içinde bu kodu yaz.`;
  const shareCode = async (r: InviteResult) => {
    const text = inviteText(r);
    if (navigator.share) { try { await navigator.share({ title: 'OYNA Personel Daveti', text }); } catch { /* iptal */ } }
    else copyCode(r.invite_code);
  };
  // Halı saha ekiplerinin fiili kanalı WhatsApp — tek dokunuşla hazır mesaj.
  const whatsappCode = (r: InviteResult) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteText(r))}`, '_blank', 'noopener');
  };

  const handleToggleDuty = async (m: TeamMember) => {
    if (!writable) return;
    const next = m.status === 'ON_DUTY' ? 'OFF_DUTY' : 'ON_DUTY';
    setTeam((prev) => prev.map((s) => (s.id === m.id ? { ...s, status: next } : s)));
    try { await staffSetDuty(m.id, next); } catch (err) { await load(); notify((err as Error).message, 'error'); }
  };

  const handleSetRole = async (m: TeamMember, role: StaffRole) => {
    if (!canManageStaff) return;
    setIsSaving(true);
    try { await staffSetRole(m.id, role); await load(); setMemberSheet(null);
      notify(role === 'MANAGER' ? 'Müdür olarak atandı.' : 'Personel olarak atandı.', 'success');
    } catch (err) { notify((err as Error).message, 'error'); }
    finally { setIsSaving(false); }
  };

  const handleRemove = async (m: TeamMember) => {
    const isLogin = m.account_status !== 'ROSTER';
    // FAZ3: giriş erişimi kaldırma yalnız SAHİP'e; ROSTER silme MÜDÜR'e de açık (roster yönetimi).
    if (isLogin && !canManageStaff) return;
    const ok = await confirm({
      title: isLogin ? 'Erişimi kaldır?' : 'Listeden sil?',
      message: isLogin
        ? `${m.name} adlı kişinin tesis erişimi kaldırılacak; giriş yetkisi düşer. Bu işlem geri alınamaz.`
        : `${m.name} listeden silinecek.`,
      confirmLabel: isLogin ? 'Erişimi Kaldır' : 'Sil',
      destructive: true,
    });
    if (!ok) return;
    setIsSaving(true);
    try {
      if (isLogin) await staffRemove(m.id); else await staffDeleteRoster(m.id);
      await load(); setMemberSheet(null); notify('Kaldırıldı.', 'success');
    } catch (err) { notify((err as Error).message, 'error'); }
    finally { setIsSaving(false); }
  };

  const handleRegenerate = async (m: TeamMember) => {
    setIsSaving(true);
    try { const r = await staffRegenerateInvite(m.id); await load(); setMemberSheet(null); setCodeSheet(r); }
    catch (err) { notify((err as Error).message, 'error'); }
    finally { setIsSaving(false); }
  };

  const handleGrantLogin = async (m: TeamMember, role: StaffRole) => {
    setIsSaving(true);
    try { const r = await staffInvite(pitchId, { memberId: m.id, staffRole: role }); await load(); setMemberSheet(null); setCodeSheet(r); }
    catch (err) { notify((err as Error).message, 'error'); }
    finally { setIsSaving(false); }
  };

  if (isLoading) return <div className="p-6 pb-40"><LoadingState message="Ekip yükleniyor…" /></div>;

  return (
    <div className="p-4 pb-40 overflow-y-auto custom-scrollbar bg-[#0A0E14]">
      <div className="max-w-5xl mx-auto w-full">
        <OwnerDemoDataBar pitchId={pitchId} onChanged={load} hasDemo={hasDemoData} />
        {isDemoMode && (
          <div className="mb-4 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-300 uppercase tracking-wide">
            Demo tesis — ekip verileri örnek kayıtlardır
          </div>
        )}
        {readOnly && (
          <div className="mb-4 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-300 uppercase tracking-wide text-center">
            Salt okunur mod — ekip kayıtları düzenlenemez
          </div>
        )}
        {loadError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle size={14} /> {loadError}
          </div>
        )}
        {!canUseDb && (
          <div className="mb-6 p-4 rounded-2xl bg-[#161B22] border border-white/5 text-center text-sm text-gray-500">
            Ekip yönetimi için önce tesisinizi oluşturun veya demo modunu açın.
          </div>
        )}

        {/* HERO */}
        <div className="relative group mb-6">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[32px] opacity-20 blur" />
          <div className="relative bg-[#161B22] border border-white/10 rounded-[32px] p-5 shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none"><Users size={120} className="text-indigo-500" /></div>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-5 gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-[0.2em] mb-1">OPERASYON MERKEZİ</p>
                  <h2 className="text-2xl font-extrabold text-white italic tracking-tight">EKİP</h2>
                </div>
                <div className="flex items-center gap-2 bg-green-500/10 px-3 py-1.5 rounded-xl border border-green-500/20 shrink-0">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-extrabold text-green-400 uppercase whitespace-nowrap">{onDuty.length} GÖREVDE</span>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex -space-x-4">
                  {onDuty.slice(0, 4).map((s) => (
                    <div key={s.id} className="relative">
                      <img src={avatarFor(s)} className="w-12 h-12 rounded-2xl border-4 border-[#161B22] object-cover" alt={s.name} />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#161B22]" />
                    </div>
                  ))}
                  {onDuty.length === 0 && <div className="text-xs text-gray-600 py-4">Şu an görevde kimse yok</div>}
                </div>
                <div className="h-10 w-px bg-white/10 hidden" />
                <div className="flex gap-5">
                  <div><p className="text-lg font-extrabold text-white tabular-nums">{activeMembers.length}</p><p className="text-[10px] text-gray-500 font-bold uppercase">Aktif kişi</p></div>
                  <div><p className="text-lg font-extrabold text-white tabular-nums">{managers.length}</p><p className="text-[10px] text-gray-500 font-bold uppercase">Müdür</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SEKME */}
        <div className="flex bg-[#161B22] p-1.5 rounded-2xl mb-6 border border-white/5">
          {(['STAFF', 'TASKS'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTeamTab(t)}
              className={`flex-1 py-3 rounded-xl text-[11px] font-extrabold uppercase tracking-widest flex items-center justify-center gap-2 ${
                teamTab === t ? (t === 'STAFF' ? 'bg-purple-500/10 text-purple-400' : 'bg-indigo-500/10 text-indigo-400') : 'text-gray-500'}`}>
              {t === 'STAFF' ? <Users size={16} /> : <ClipboardList size={16} />} {t === 'STAFF' ? 'Personel' : 'Görevler'}
            </button>
          ))}
        </div>

        {/* ── PERSONEL ── */}
        {teamTab === 'STAFF' && (
          <div className="space-y-3">
            {writable && (
              <button type="button" onClick={() => setIsInviteOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-extrabold text-sm shadow-lg shadow-indigo-500/20 active:scale-[0.99] transition-transform">
                <UserPlus size={18} /> {canManageStaff ? 'Personel / Müdür Ekle' : 'Listeye Kişi Ekle'}
              </button>
            )}

            {team.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Henüz ekip üyesi yok. {writable && 'Yukarıdan ekleyin.'}</p>
            ) : (
              <div className="grid gap-3">
                {team.map((m) => {
                  const st = STATUS_META[m.account_status];
                  // FAZ3: MÜDÜR de kartı açabilir (ACTIVE personelin nöbetini yönetmek için) —
                  // eskiden yalnız SAHİP veya ROSTER açılıyordu = MÜDÜR için dead-end.
                  const tappable = writable;
                  return (
                    <button key={m.id} type="button" disabled={!tappable}
                      onClick={() => tappable && setMemberSheet(m)}
                      className={`text-left bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-center gap-3 ${tappable ? 'hover:border-purple-500/30 active:scale-[0.995]' : ''} transition-all`}>
                      <div className="relative shrink-0">
                        <img src={avatarFor(m)} className="w-12 h-12 rounded-xl object-cover" alt={m.name} />
                        {m.staff_role === 'MANAGER' && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center border-2 border-[#161B22]"><Crown size={10} className="text-white" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-white truncate flex items-center gap-1.5">{m.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-gray-500 font-bold uppercase">{m.staff_role === 'MANAGER' ? 'Müdür' : m.role_title}</span>
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                          {m.is_demo && <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">DEMO</span>}
                        </div>
                        {m.account_status === 'INVITED' && m.invite_code && (
                          <p className="text-[11px] text-amber-300 font-mono font-extrabold tracking-widest mt-1.5">{m.invite_code} <span className="text-gray-600 font-sans font-normal tracking-normal">· {expiryText(m.invite_expires_at)}</span></p>
                        )}
                      </div>
                      {(m.account_status === 'ACTIVE' || m.account_status === 'ROSTER') && (
                        <span onClick={(e) => { e.stopPropagation(); handleToggleDuty(m); }}
                          className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg uppercase shrink-0 ${
                            m.status === 'ON_DUTY' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-500'} ${writable ? 'cursor-pointer' : ''}`}>
                          {m.status === 'ON_DUTY' ? 'Görevde' : 'İzinli'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── GÖREVLER ── */}
        {teamTab === 'TASKS' && (
          <TasksPanel pitchId={pitchId} tasks={tasks} setTasks={setTasks} members={activeMembers}
            writable={writable} onReload={load} isAddOpen={isAddTaskOpen} setAddOpen={setIsAddTaskOpen} notify={notify} />
        )}
      </div>

      {/* DAVET MODALI */}
      {isInviteOpen && (
        <InviteModal pitchId={pitchId} canInviteLogin={canManageStaff} maxStaff={maxStaff} teamCount={team.length}
          onClose={() => setIsInviteOpen(false)}
          onInvited={(r) => { setIsInviteOpen(false); load(); setCodeSheet(r); }}
          onRosterAdded={() => { setIsInviteOpen(false); load(); notify('Kişi listeye eklendi.', 'success'); }}
          notify={notify} />
      )}

      {/* KOD PAYLAŞ SAYFASI */}
      {codeSheet && (
        <BottomSheetModal title="Davet Kodu Hazır" onClose={() => setCodeSheet(null)}>
          <div className="text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-3"><KeyRound size={26} className="text-emerald-400" /></div>
            <p className="text-sm text-gray-400 mb-1">{codeSheet.name} · {codeSheet.staff_role === 'MANAGER' ? 'Müdür' : 'Personel'}</p>
            <div className="my-4 py-4 rounded-2xl bg-[#0A0E14] border border-white/10">
              <p className="text-4xl font-extrabold text-white tracking-[0.3em] tabular-nums font-mono">{codeSheet.invite_code}</p>
              <p className="text-[11px] text-gray-500 mt-2 flex items-center justify-center gap-1"><Clock size={11} /> {expiryText(codeSheet.expires_at)}</p>
            </div>
            <button type="button" onClick={() => whatsappCode(codeSheet)}
              className="w-full py-3.5 rounded-2xl bg-[#25D366] text-black font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
              <MessageCircle size={16} /> WhatsApp ile Gönder
            </button>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => copyCode(codeSheet.invite_code)}
                className="flex-1 py-3.5 rounded-2xl bg-white/5 text-white font-extrabold text-sm flex items-center justify-center gap-2 border border-white/10">
                {copied ? <><Check size={16} className="text-emerald-400" /> Kopyalandı</> : <><Copy size={16} /> Kopyala</>}
              </button>
              <button type="button" onClick={() => shareCode(codeSheet)}
                className="flex-1 py-3.5 rounded-2xl bg-indigo-600 text-white font-extrabold text-sm flex items-center justify-center gap-2">
                <Share2 size={16} /> Paylaş
              </button>
            </div>
            <div className="mt-4 text-left bg-white/[0.03] rounded-2xl p-4 border border-white/5">
              <p className="text-[11px] font-extrabold text-gray-400 uppercase mb-2">Personel nasıl katılır?</p>
              <ol className="text-xs text-gray-400 space-y-1.5 list-decimal list-inside">
                <li>OYNA'ya kendi hesabıyla giriş yapar.</li>
                <li>Menü → <span className="text-white font-bold">Tesise Katıl</span> bölümüne gider.</li>
                <li>Bu 6 haneli kodu yazar (72 saat geçerli).</li>
              </ol>
            </div>
          </div>
        </BottomSheetModal>
      )}

      {/* ÜYE EYLEM SAYFASI */}
      {memberSheet && (
        <MemberSheet m={memberSheet} canManageStaff={canManageStaff} isSaving={isSaving}
          onClose={() => setMemberSheet(null)}
          onToggleDuty={() => handleToggleDuty(memberSheet)}
          onSetRole={(r) => handleSetRole(memberSheet, r)}
          onRemove={() => handleRemove(memberSheet)}
          onRegenerate={() => handleRegenerate(memberSheet)}
          onGrantLogin={(r) => handleGrantLogin(memberSheet, r)}
          onShowCode={() => { if (memberSheet.invite_code) { setCodeSheet({ member_id: memberSheet.id, invite_code: memberSheet.invite_code, expires_at: memberSheet.invite_expires_at ?? '', staff_role: memberSheet.staff_role, name: memberSheet.name }); setMemberSheet(null); } }}
          copyCode={copyCode} copied={copied} />
      )}
      {confirmElement}
    </div>
  );
};

// ═══════════════════ DAVET MODALI ═══════════════════════════════════════════
const InviteModal: React.FC<{
  pitchId: string; canInviteLogin: boolean; maxStaff: number; teamCount: number;
  onClose: () => void; onInvited: (r: InviteResult) => void; onRosterAdded: () => void;
  notify: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void;
}> = ({ pitchId, canInviteLogin, maxStaff, teamCount, onClose, onInvited, onRosterAdded, notify }) => {
  const [mode, setMode] = useState<'LOGIN' | 'ROSTER'>(canInviteLogin ? 'LOGIN' : 'ROSTER');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>('STAFF');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { notify('İsim gerekli.', 'warning'); return; }
    if (mode === 'ROSTER' && teamCount >= maxStaff) { notify(`Planın en fazla ${maxStaff} kayda izin veriyor.`, 'warning'); return; }
    setBusy(true);
    try {
      if (mode === 'LOGIN') {
        const r = await staffInvite(pitchId, { name: name.trim(), phone: phone.trim() || undefined, roleTitle: role === 'MANAGER' ? 'Müdür' : 'Personel', staffRole: role });
        onInvited(r);
      } else {
        await staffUpsertRoster(pitchId, { name: name.trim(), phone: phone.trim() || undefined, roleTitle: role === 'MANAGER' ? 'Müdür' : 'Personel' });
        onRosterAdded();
      }
    } catch (err) { notify((err as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <BottomSheetModal title={canInviteLogin ? 'Ekibe Kişi Ekle' : 'Listeye Kişi Ekle'} onClose={onClose}>
      <div className="space-y-4">
        {canInviteLogin && (
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#0A0E14] rounded-2xl border border-white/5">
            <button type="button" onClick={() => setMode('LOGIN')}
              className={`py-2.5 rounded-xl text-xs font-extrabold ${mode === 'LOGIN' ? 'bg-indigo-500/15 text-indigo-300' : 'text-gray-500'}`}>
              🔑 Giriş yetkili
            </button>
            <button type="button" onClick={() => setMode('ROSTER')}
              className={`py-2.5 rounded-xl text-xs font-extrabold ${mode === 'ROSTER' ? 'bg-purple-500/15 text-purple-300' : 'text-gray-500'}`}>
              📋 Sadece liste
            </button>
          </div>
        )}
        <p className="text-[11px] text-gray-500 -mt-1">
          {mode === 'LOGIN'
            ? 'Kişiye 6 haneli davet kodu üretilir; kabul edince kendi hesabıyla panele girer.'
            : 'Sadece görünüm kartı — giriş yetkisi verilmez (nöbet/gösterim için).'}
        </p>

        <input className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm" placeholder="Ad Soyad" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <input className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm" placeholder="Telefon (opsiyonel)" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />

        <div>
          <p className="text-[10px] font-extrabold text-gray-500 uppercase mb-2">Rol</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRole('STAFF')}
              className={`p-3 rounded-xl border text-left ${role === 'STAFF' ? 'bg-purple-500/10 border-purple-500/40' : 'bg-[#0A0E14] border-white/5'}`}>
              <p className="text-sm font-extrabold text-white flex items-center gap-1.5"><Shield size={14} className="text-purple-400" /> Personel</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Kasa: rezervasyon, tahsilat, veresiye</p>
            </button>
            <button type="button" onClick={() => setRole('MANAGER')} disabled={mode === 'LOGIN' && !canInviteLogin}
              className={`p-3 rounded-xl border text-left ${role === 'MANAGER' ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-[#0A0E14] border-white/5'}`}>
              <p className="text-sm font-extrabold text-white flex items-center gap-1.5"><Crown size={14} className="text-indigo-400" /> Müdür</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Sahip gibi (banka/para-çekme hariç)</p>
            </button>
          </div>
        </div>

        <button type="button" disabled={busy} onClick={submit}
          className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-extrabold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? 'İşleniyor…' : mode === 'LOGIN' ? <><KeyRound size={16} /> Davet Kodu Oluştur</> : <><Plus size={16} /> Listeye Ekle</>}
        </button>
      </div>
    </BottomSheetModal>
  );
};

// ═══════════════════ ÜYE EYLEM SAYFASI ══════════════════════════════════════
const MemberSheet: React.FC<{
  m: TeamMember; canManageStaff: boolean; isSaving: boolean;
  onClose: () => void; onToggleDuty: () => void; onSetRole: (r: StaffRole) => void;
  onRemove: () => void; onRegenerate: () => void; onGrantLogin: (r: StaffRole) => void; onShowCode: () => void;
  copyCode: (c: string) => void; copied: boolean;
}> = ({ m, canManageStaff, isSaving, onClose, onToggleDuty, onSetRole, onRemove, onRegenerate, onGrantLogin, onShowCode, copyCode, copied }) => (
  <BottomSheetModal title={m.name} onClose={onClose}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img src={avatarFor(m)} className="w-14 h-14 rounded-2xl object-cover" alt={m.name} />
        <div className="min-w-0">
          <p className="text-base font-extrabold text-white">{m.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[11px] text-gray-500 font-bold uppercase">{m.staff_role === 'MANAGER' ? 'Müdür' : m.role_title}</span>
            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${STATUS_META[m.account_status].cls}`}>{STATUS_META[m.account_status].label}</span>
          </div>
          {m.phone && <p className="text-xs text-gray-500 mt-0.5">{m.phone}</p>}
        </div>
      </div>

      {/* Davet kodu (INVITED) */}
      {m.account_status === 'INVITED' && m.invite_code && (
        <div className="p-4 rounded-2xl bg-[#0A0E14] border border-amber-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-extrabold text-white tracking-[0.25em] font-mono">{m.invite_code}</p>
              <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1"><Clock size={11} /> {expiryText(m.invite_expires_at)}</p>
            </div>
            <button type="button" onClick={() => copyCode(m.invite_code!)} className="p-2.5 rounded-xl bg-white/5 text-white">{copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}</button>
          </div>
        </div>
      )}

      {/* Nöbet */}
      {(m.account_status === 'ACTIVE' || m.account_status === 'ROSTER') && (
        <button type="button" onClick={onToggleDuty}
          className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
          <span className="text-sm font-bold text-white">Nöbet durumu</span>
          <span className={`text-xs font-extrabold px-3 py-1 rounded-lg ${m.status === 'ON_DUTY' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-400'}`}>{m.status === 'ON_DUTY' ? 'Görevde' : 'İzinli'}</span>
        </button>
      )}

      {/* SAHİP eylemleri */}
      {canManageStaff && (
        <>
          {/* Rol değiştir (aktif login) */}
          {m.account_status === 'ACTIVE' && (
            <div>
              <p className="text-[10px] font-extrabold text-gray-500 uppercase mb-2">Yetki</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={isSaving || m.staff_role === 'STAFF'} onClick={() => onSetRole('STAFF')}
                  className={`p-3 rounded-xl border text-sm font-extrabold flex items-center justify-center gap-1.5 ${m.staff_role === 'STAFF' ? 'bg-purple-500/10 border-purple-500/40 text-purple-300' : 'bg-[#0A0E14] border-white/5 text-gray-400'}`}>
                  <Shield size={14} /> Personel
                </button>
                <button type="button" disabled={isSaving || m.staff_role === 'MANAGER'} onClick={() => onSetRole('MANAGER')}
                  className={`p-3 rounded-xl border text-sm font-extrabold flex items-center justify-center gap-1.5 ${m.staff_role === 'MANAGER' ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300' : 'bg-[#0A0E14] border-white/5 text-gray-400'}`}>
                  <Crown size={14} /> Müdür
                </button>
              </div>
            </div>
          )}

          {/* Davetli → kodu yenile/göster */}
          {m.account_status === 'INVITED' && (
            <button type="button" disabled={isSaving} onClick={onRegenerate}
              className="w-full py-3.5 rounded-2xl bg-white/5 text-white font-extrabold text-sm flex items-center justify-center gap-2 border border-white/10">
              <RefreshCw size={16} /> Yeni Kod Üret
            </button>
          )}

          {/* Roster/Pasif → giriş yetkisi ver */}
          {(m.account_status === 'ROSTER' || m.account_status === 'PASSIVE') && (
            <div>
              <p className="text-[10px] font-extrabold text-gray-500 uppercase mb-2">Giriş yetkisi ver</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={isSaving} onClick={() => onGrantLogin('STAFF')} className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-sm font-extrabold flex items-center justify-center gap-1.5"><KeyRound size={14} /> Personel</button>
                <button type="button" disabled={isSaving} onClick={() => onGrantLogin('MANAGER')} className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-sm font-extrabold flex items-center justify-center gap-1.5"><KeyRound size={14} /> Müdür</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Kaldır — ROSTER silme MÜDÜR'e açık; giriş erişimini kaldırma yalnız SAHİP */}
      {(m.account_status === 'ROSTER' || canManageStaff) && (
        <button type="button" disabled={isSaving} onClick={onRemove}
          className="w-full min-h-[48px] py-3.5 rounded-2xl bg-red-500/10 text-red-300 font-extrabold text-sm flex items-center justify-center gap-2 border border-red-500/20 active:scale-[0.98] transition-transform disabled:opacity-50">
          <Trash2 size={16} /> {m.account_status === 'ROSTER' ? 'Listeden Sil' : 'Erişimi Kaldır'}
        </button>
      )}
    </div>
  </BottomSheetModal>
);

// ═══════════════════ GÖREVLER PANELİ ════════════════════════════════════════
const TasksPanel: React.FC<{
  pitchId: string; tasks: PitchStaffTask[]; setTasks: React.Dispatch<React.SetStateAction<PitchStaffTask[]>>;
  members: TeamMember[]; writable: boolean; onReload: () => Promise<void>;
  isAddOpen: boolean; setAddOpen: (v: boolean) => void;
  notify: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void;
}> = ({ pitchId, tasks, setTasks, members, writable, onReload, isAddOpen, setAddOpen, notify }) => {
  const [newTask, setNewTask] = useState({ title: '', assignedTo: '', priority: 'MEDIUM' as PitchStaffTask['priority'], dueTime: '' });
  const [saving, setSaving] = useState(false);

  const toggle = async (task: PitchStaffTask) => {
    const next = task.status !== 'COMPLETED';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next ? 'COMPLETED' : 'PENDING' } : t)));
    try { await toggleStaffTaskStatus(task.id, next); } catch (err) { await onReload(); notify(toTurkishError(err), 'error'); }
  };
  const create = async () => {
    if (!writable || !newTask.title.trim()) return;
    setSaving(true);
    try {
      const member = members.find((s) => s.id === newTask.assignedTo);
      await upsertStaffTask(pitchId, { title: newTask.title, assigned_to: member?.id ?? null, assigned_name: member?.name ?? null, priority: newTask.priority, due_time: newTask.dueTime || null });
      setNewTask({ title: '', assignedTo: '', priority: 'MEDIUM', dueTime: '' }); setAddOpen(false); await onReload();
    } catch (err) { notify(toTurkishError(err), 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <h3 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-[0.2em]">GÜNLÜK OPERASYON</h3>
        {writable && (
          <button type="button" onClick={() => setAddOpen(true)} className="text-[10px] bg-indigo-500 text-white font-extrabold px-4 py-2 rounded-xl flex items-center gap-2"><Plus size={14} /> YENİ GÖREV</button>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">Henüz görev yok.</p>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <button key={task.id} type="button" onClick={() => toggle(task)}
              className="w-full text-left bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-start gap-4 hover:border-indigo-500/30 transition-all">
              {task.status === 'COMPLETED' ? <CheckCircle2 size={22} className="text-green-500 shrink-0 mt-0.5" /> : <Circle size={22} className="text-gray-600 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${task.status === 'COMPLETED' ? 'text-gray-500 line-through' : 'text-white'}`}>{task.title}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {task.assigned_name && <span className="text-[10px] font-bold text-gray-500 uppercase">{task.assigned_name}</span>}
                  {task.due_time && <span className="text-[10px] font-bold text-indigo-400">{task.due_time}</span>}
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>
                  {task.is_demo && <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">DEMO</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isAddOpen && (
        <BottomSheetModal title="Yeni Görev" onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <input className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm" placeholder="Görev başlığı" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} autoFocus />
            <select className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm" value={newTask.assignedTo} onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}>
              <option value="">Personel seç (opsiyonel)</option>
              {members.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm" placeholder="Saat (örn. 18:00)" value={newTask.dueTime} onChange={(e) => setNewTask({ ...newTask, dueTime: e.target.value })} />
            <button type="button" disabled={saving} onClick={create} className="w-full py-4 bg-indigo-600 text-white font-extrabold rounded-2xl disabled:opacity-50">{saving ? 'Kaydediliyor…' : 'GÖREVİ OLUŞTUR'}</button>
          </div>
        </BottomSheetModal>
      )}
    </div>
  );
};
