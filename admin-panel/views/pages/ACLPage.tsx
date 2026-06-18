import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../store';
import { DataTable } from '../components/DataTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { useAdminFilter } from '../hooks/useAdminFilter';
import { fetchAdminTeam, revokePlatformRole, setPlatformRole, toTurkishAdminError, type AdminTeamMember } from '../../services/adminService';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';
import { Lock, UserPlus, RefreshCw, UserMinus } from 'lucide-react';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'FINANCE', 'SUPPORT'] as const;

export const ACLPage: React.FC = () => {
  const { adminUsers, adminSession } = useAppStore();
  const [team, setTeam] = useState<AdminTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<typeof ROLES[number]>('MODERATOR');
  const [grantAdmin, setGrantAdmin] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const { success, error: toastError } = useAdminToast();

  const userSearchFn = useCallback((u: (typeof adminUsers)[number], q: string) => {
    const hay = `${u.name} ${u.email || ''}`.toLowerCase();
    return hay.includes(q);
  }, []);
  const { query: userQuery, setQuery: setUserQuery, filtered: filteredUsers } = useAdminFilter(adminUsers, userSearchFn);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTeam(await fetchAdminTeam());
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async () => {
    if (!selectedUserId) return;
    try {
      await setPlatformRole(selectedUserId, selectedRole, grantAdmin);
      setSelectedUserId('');
      setUserQuery('');
      success('Ekip üyesi güncellendi');
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokePlatformRole(revokeTarget.id);
      success('Yetki kaldırıldı');
      setRevokeTarget(null);
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    }
  };

  const pickerUsers = useMemo(() => filteredUsers.slice(0, 20), [filteredUsers]);

  return (
    <PageShell
      route="ACL"
      icon={<Lock size={20} />}
      actions={
        <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      }
    >
      <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5 max-w-2xl space-y-3">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Yeni ekip üyesi</p>
        <AdminSearchBar
          value={userQuery}
          onChange={setUserQuery}
          placeholder="Kullanıcı ara (isim veya e-posta)..."
          resultCount={pickerUsers.length}
          totalCount={adminUsers.length}
        />
        <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 divide-y divide-white/5">
          {pickerUsers.length === 0 ? (
            <p className="text-xs text-gray-600 p-3 text-center">Kullanıcı bulunamadı</p>
          ) : pickerUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedUserId(u.id)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${selectedUserId === u.id ? 'bg-orange-500/15 text-orange-200' : 'hover:bg-white/5 text-gray-300'}`}
            >
              <span className="font-bold">{u.name}</span>
              <span className="text-gray-500 font-mono ml-2">{u.email}</span>
            </button>
          ))}
        </div>
        <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as typeof selectedRole)} className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input type="checkbox" checked={grantAdmin} onChange={(e) => setGrantAdmin(e.target.checked)} />
          Platform admin yetkisi ver (is_admin + role=ADMIN)
        </label>
        <button type="button" onClick={() => void handleAdd()} disabled={!selectedUserId} className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-colors">
          <UserPlus size={14} /> Ekle / Güncelle
        </button>
      </div>

      <DataTable
        columns={[
          { header: 'İsim', render: (r: AdminTeamMember) => <span className="text-white font-semibold text-sm">{r.userName}</span> },
          { header: 'E-posta', render: (r: AdminTeamMember) => <span className="text-[11px] font-mono text-gray-400">{r.userEmail}</span> },
          { header: 'Rol', render: (r: AdminTeamMember) => <span className="text-[11px] font-bold text-orange-400">{r.admin_role}</span> },
          { header: 'Eklenme', render: (r: AdminTeamMember) => <span className="text-[11px] text-gray-500">{new Date(r.created_at).toLocaleDateString('tr-TR')}</span> },
          {
            header: 'Aksiyon',
            render: (r: AdminTeamMember) => (
              r.user_id !== adminSession?.userId ? (
                <button
                  type="button"
                  onClick={() => setRevokeTarget({ id: r.user_id, name: r.userName })}
                  className="flex items-center gap-1 text-[10px] font-bold text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/10"
                >
                  <UserMinus size={10} /> Kaldır
                </button>
              ) : <span className="text-[10px] text-gray-600">Siz</span>
            ),
          },
        ]}
        data={team}
        loading={loading}
        emptyMessage="Henüz ekip üyesi yok"
      />

      <ConfirmDialog
        open={!!revokeTarget}
        title="Platform yetkisini kaldır"
        description={`${revokeTarget?.name || 'Bu kullanıcı'} için tüm platform admin yetkileri kaldırılacak.`}
        confirmLabel="Yetkiyi Kaldır"
        destructive
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setRevokeTarget(null)}
      />
    </PageShell>
  );
};
