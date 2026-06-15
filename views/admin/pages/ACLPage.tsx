import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../../store';
import { DataTable } from '../components/DataTable';
import { fetchAdminTeam, setPlatformRole, toTurkishAdminError, type AdminTeamMember } from '../../../services/adminService';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';
import { Lock, UserPlus, RefreshCw } from 'lucide-react';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'FINANCE', 'SUPPORT'] as const;

export const ACLPage: React.FC = () => {
  const { adminUsers } = useAppStore();
  const [team, setTeam] = useState<AdminTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<typeof ROLES[number]>('MODERATOR');
  const [grantAdmin, setGrantAdmin] = useState(false);
  const { success, error: toastError } = useAdminToast();

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
      success('Ekip üyesi güncellendi');
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    }
  };

  return (
    <PageShell
      route="ACL"
      icon={<Lock size={20} />}
      actions={
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      }
    >
      <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5 max-w-2xl space-y-3">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Yeni ekip üyesi</p>
        <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white">
          <option value="">Kullanıcı seç...</option>
          {adminUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
        </select>
        <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as typeof selectedRole)} className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input type="checkbox" checked={grantAdmin} onChange={(e) => setGrantAdmin(e.target.checked)} />
          Platform admin yetkisi ver (is_admin + role=ADMIN)
        </label>
        <button onClick={() => void handleAdd()} className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl transition-colors">
          <UserPlus size={14} /> Ekle / Güncelle
        </button>
      </div>

      <DataTable
        columns={[
          { header: 'İsim', render: (r: AdminTeamMember) => <span className="text-white font-semibold text-sm">{r.userName}</span> },
          { header: 'E-posta', render: (r: AdminTeamMember) => <span className="text-[11px] font-mono text-gray-400">{r.userEmail}</span> },
          { header: 'Rol', render: (r: AdminTeamMember) => <span className="text-[11px] font-bold text-orange-400">{r.admin_role}</span> },
          { header: 'Eklenme', render: (r: AdminTeamMember) => <span className="text-[11px] text-gray-500">{new Date(r.created_at).toLocaleDateString('tr-TR')}</span> },
        ]}
        data={team}
        loading={loading}
        emptyMessage="Henüz ekip üyesi yok"
      />
    </PageShell>
  );
};
