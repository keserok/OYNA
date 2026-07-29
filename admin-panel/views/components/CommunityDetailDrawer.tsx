import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Bell, Trash2, Check, Shield, Edit3 } from 'lucide-react';
import { useAppStore } from '../../../store';
import {
  adminGetCommunity,
  manageCommunityMember,
  moderateJoinRequest,
  notifyCommunityMembers,
  updateCommunityAdmin,
  deleteCommunity,
  toTurkishAdminError,
  type CommunityDetail,
  type CommunityRow,
} from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { CommunityFormModal } from './CommunityFormModal';

type Tab = 'GENEL' | 'UYELER' | 'TALEPLER' | 'AYARLAR';

interface Props {
  communityId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

export const CommunityDetailDrawer: React.FC<Props> = ({ communityId, onClose, onUpdated }) => {
  const adminUsers = useAppStore((s) => s.adminUsers);
  const { success, error: toastError } = useAdminToast();
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('GENEL');
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');

  const load = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      setDetail(await adminGetCommunity(communityId));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [communityId, toastError]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setTab('GENEL'); }, [communityId]);

  const c = detail?.community;

  const toggleVerified = async () => {
    if (!c) return;
    setBusy(true);
    try {
      await updateCommunityAdmin(c.id, { is_verified: !c.is_verified });
      success(c.is_verified ? 'Doğrulama kaldırıldı' : 'Topluluk doğrulandı');
      await load();
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleMemberAction = async (userId: string, action: 'ADD' | 'REMOVE' | 'SET_ROLE', role?: 'MEMBER' | 'ADMIN') => {
    if (!communityId) return;
    setBusy(true);
    try {
      await manageCommunityMember(communityId, userId, action, role);
      success(action === 'REMOVE' ? 'Üye çıkarıldı' : 'Üye güncellendi');
      await load();
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleJoinModerate = async (requestId: string, approved: boolean) => {
    const notes = approved ? undefined : prompt('Red sebebi:') || undefined;
    if (!approved && !notes) return;
    setBusy(true);
    try {
      await moderateJoinRequest(requestId, approved, notes);
      success(approved ? 'Katılma onaylandı' : 'Talep reddedildi');
      await load();
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleNotify = async () => {
    if (!communityId || !notifyTitle.trim() || !notifyBody.trim()) return;
    setBusy(true);
    try {
      const count = await notifyCommunityMembers(communityId, notifyTitle.trim(), notifyBody.trim());
      success(`${count} üyeye bildirim gönderildi`);
      setNotifyTitle('');
      setNotifyBody('');
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!communityId) return;
    setBusy(true);
    try {
      await deleteCommunity(communityId);
      success('Topluluk silindi');
      setDeleteOpen(false);
      onUpdated();
      onClose();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!communityId) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[180] flex justify-end">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full max-w-xl h-full bg-[#0D1117] border-l border-white/10 flex flex-col shadow-2xl"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <div>
              <p className="text-[10px] text-gray-500 font-mono uppercase">Topluluk Kontrol</p>
              <h2 className="text-sm font-extrabold text-white uppercase">{c?.name ?? '…'}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={!c} onClick={() => setEditOpen(true)} className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center">
                <Edit3 size={14} />
              </button>
              <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex gap-1 px-4 pt-3 shrink-0">
            {([
              ['GENEL', 'Genel'],
              ['UYELER', `Üyeler (${detail?.members.length ?? 0})`],
              ['TALEPLER', `Talepler (${detail?.pending_join_requests.length ?? 0})`],
              ['AYARLAR', 'Ayarlar'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border ${tab === id ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'border-white/10 text-gray-500'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
            {loading && !detail ? (
              <p className="text-center text-gray-500 text-sm py-12">Yükleniyor…</p>
            ) : !c ? (
              <p className="text-center text-red-400 text-sm py-12">Topluluk yüklenemedi</p>
            ) : (
              <>
                {tab === 'GENEL' && (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Info label="Tür" value={c.type} />
                      <Info label="Katılım" value={c.join_mode} />
                      <Info label="Üye" value={String(c.member_count)} />
                      <Info label="Aktif Maç" value={String(c.active_matches ?? 0)} />
                      <Info label="Domain" value={c.domain || '—'} />
                      <Info label="Sahip" value={c.owner_name || c.owner_id?.slice(0, 8) || '—'} />
                    </div>
                    {c.description && <p className="text-xs text-gray-400 bg-black/30 rounded-xl p-3 border border-white/5">{c.description}</p>}
                    <div className="flex flex-wrap gap-2">
                      {c.is_verified && <Badge text="DOĞRULANMIŞ" color="blue" />}
                      {c.is_private && <Badge text="GİZLİ" color="amber" />}
                      {c.is_demo && <Badge text="DEMO" color="yellow" />}
                      <Badge text={`KOD: ${c.invite_code || '—'}`} color="gray" />
                    </div>
                    <button type="button" disabled={busy} onClick={() => void toggleVerified()} className="w-full py-2.5 text-xs font-bold rounded-xl border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 flex items-center justify-center gap-2">
                      <Shield size={14} /> {c.is_verified ? 'Doğrulamayı Kaldır' : 'Topluluğu Doğrula'}
                    </button>
                  </>
                )}

                {tab === 'UYELER' && (
                  <>
                    <div className="flex gap-2">
                      <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="flex-1 h-9 bg-black/40 border border-white/10 rounded-lg px-2 text-xs text-white">
                        <option value="">Oyuncu ekle…</option>
                        {adminUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <button type="button" disabled={!addUserId || busy} onClick={() => { void handleMemberAction(addUserId, 'ADD'); setAddUserId(''); }} className="h-9 px-3 text-[10px] font-bold text-green-400 border border-green-500/30 rounded-lg flex items-center gap-1">
                        <UserPlus size={12} /> Ekle
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(detail?.members ?? []).map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 p-3 bg-black/30 rounded-xl border border-white/5 text-xs">
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">{m.user_name || '—'}</p>
                            <p className="text-[10px] text-gray-500 font-mono truncate">{m.user_email}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <select
                              value={m.role}
                              disabled={busy}
                              onChange={(e) => void handleMemberAction(m.user_id, 'SET_ROLE', e.target.value as 'MEMBER' | 'ADMIN')}
                              className="h-7 text-[10px] bg-black border border-white/15 rounded px-1 text-white"
                            >
                              <option value="MEMBER">Üye</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                            <button type="button" disabled={busy} onClick={() => void handleMemberAction(m.user_id, 'REMOVE')} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {(detail?.members.length ?? 0) === 0 && <p className="text-center text-gray-600 text-xs py-6">Henüz üye yok</p>}
                    </div>
                  </>
                )}

                {tab === 'TALEPLER' && (
                  <div className="space-y-2">
                    {(detail?.pending_join_requests ?? []).map((r) => (
                      <div key={r.id} className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl text-xs">
                        <p className="font-bold text-white">{r.user_name || r.user_id.slice(0, 8)}</p>
                        {r.message && <p className="text-gray-500 mt-1">{r.message}</p>}
                        <div className="flex gap-2 mt-2">
                          <button type="button" disabled={busy} onClick={() => void handleJoinModerate(r.id, true)} className="flex items-center gap-1 text-green-400 border border-green-500/30 px-2 py-1 rounded-lg text-[10px] font-bold">
                            <Check size={10} /> Onayla
                          </button>
                          <button type="button" disabled={busy} onClick={() => void handleJoinModerate(r.id, false)} className="flex items-center gap-1 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg text-[10px] font-bold">
                            <X size={10} /> Reddet
                          </button>
                        </div>
                      </div>
                    ))}
                    {(detail?.pending_join_requests.length ?? 0) === 0 && <p className="text-center text-gray-600 text-xs py-6">Bekleyen katılma talebi yok</p>}
                  </div>
                )}

                {tab === 'AYARLAR' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1"><Bell size={12} /> Üyelere Bildirim</p>
                      <input value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} placeholder="Başlık" className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-xs text-white" />
                      <textarea value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} placeholder="Mesaj" className="w-full min-h-[80px] bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white resize-none" />
                      <button type="button" disabled={busy || !notifyTitle.trim() || !notifyBody.trim()} onClick={() => void handleNotify()} className="w-full py-2 text-xs font-bold rounded-xl bg-pink-500/20 border border-pink-500/30 text-pink-300">
                        Bildirim Gönder
                      </button>
                    </div>
                    <button type="button" disabled={busy} onClick={() => setDeleteOpen(true)} className="w-full py-2.5 text-xs font-bold rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 flex items-center justify-center gap-2">
                      <Trash2 size={14} /> Topluluğu Sil
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>

      {c && (
        <CommunityFormModal
          open={editOpen}
          mode="edit"
          community={c as CommunityRow}
          onClose={() => setEditOpen(false)}
          onSave={async (data) => {
            await updateCommunityAdmin(c.id, data);
            success('Topluluk güncellendi');
            setEditOpen(false);
            await load();
            onUpdated();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Topluluğu sil"
        description={`"${c?.name}" ve tüm üyelikleri kalıcı olarak silinecek. Bu işlem denetim kaydına düşer.`}
        confirmLabel="Sil"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </AnimatePresence>
  );
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-black/30 rounded-lg p-2 border border-white/5">
    <p className="text-[9px] text-gray-500 uppercase">{label}</p>
    <p className="font-bold text-white truncate">{value}</p>
  </div>
);

const Badge: React.FC<{ text: string; color: 'blue' | 'amber' | 'yellow' | 'gray' }> = ({ text, color }) => {
  const cls = {
    blue: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
    amber: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
    yellow: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10',
    gray: 'text-gray-400 border-white/10 bg-white/5',
  }[color];
  return <span className={`text-[8px] font-extrabold px-2 py-0.5 rounded border ${cls}`}>{text}</span>;
};
