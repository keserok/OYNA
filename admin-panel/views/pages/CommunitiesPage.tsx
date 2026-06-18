import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, Trophy, Users, Check, X, Trash2 } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { PageShell } from '../components/PageShell';
import {
  fetchCommunities, fetchCommunityCreationRequests, fetchTeamsFromDb, fetchTournaments,
  moderateCommunityCreation, deleteCommunity, createCommunityAdmin,
  deleteTeamAdmin, createTeamAdmin, deleteTournament, createTournamentAdmin,
  toTurkishAdminError,
  type CommunityRow, type CommunityCreationRequest,
} from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface CommunitiesPageProps {
  subRoute: 'TOPLULUKLAR' | 'TAKIMLAR' | 'TURNUVALAR';
  onRefresh?: () => Promise<void>;
}

export const CommunitiesPage: React.FC<CommunitiesPageProps> = ({ subRoute, onRefresh }) => {
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [requests, setRequests] = useState<CommunityCreationRequest[]>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; captain_id: string | null; created_at: string; is_demo?: boolean }>>([]);
  const [tournaments, setTournaments] = useState<Array<{ id: string; name: string; status: string; max_teams: number; is_demo: boolean; starts_at: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState('');
  const { success, error: toastError } = useAdminToast();

  const teamSearch = useCallback((t: (typeof teams)[number], q: string) => t.name.toLowerCase().includes(q), []);
  const tourSearch = useCallback((t: (typeof tournaments)[number], q: string) => t.name.toLowerCase().includes(q), []);
  const commSearch = useCallback((c: CommunityRow, q: string) => [c.name, c.type, c.domain].filter(Boolean).join(' ').toLowerCase().includes(q), []);
  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => teamSearch(t, q));
  }, [teams, query, teamSearch]);
  const filteredTournaments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tournaments;
    return tournaments.filter((t) => tourSearch(t, q));
  }, [tournaments, query, tourSearch]);
  const filteredCommunities = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return communities;
    return communities.filter((c) => commSearch(c, q));
  }, [communities, query, commSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, r, t, tour] = await Promise.all([
        fetchCommunities(),
        fetchCommunityCreationRequests(),
        fetchTeamsFromDb(),
        fetchTournaments(),
      ]);
      setCommunities(c);
      setRequests(r);
      setTeams(t);
      setTournaments(tour);
    } catch (err) {
      setError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    await load();
    if (onRefresh) await onRefresh();
  };

  const handleModerate = async (id: string, approved: boolean) => {
    const notes = approved ? undefined : prompt('Red sebebi:') || undefined;
    if (!approved && !notes) return;
    setActioningId(id);
    try {
      await moderateCommunityCreation(id, approved, notes);
      success(approved ? 'Topluluk onaylandı' : 'Talep reddedildi');
      await load();
    } catch (err) {
      setError(toTurkishAdminError(err));
    } finally {
      setActioningId(null);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      if (subRoute === 'TOPLULUKLAR') await createCommunityAdmin({ name: newName.trim() });
      else if (subRoute === 'TAKIMLAR') await createTeamAdmin(newName.trim());
      else await createTournamentAdmin({ name: newName.trim() });
      setNewName('');
      setShowAdd(false);
      success('Kayıt eklendi');
      await load();
    } catch (err) {
      setError(toTurkishAdminError(err));
    }
  };

  const handleDelete = (id: string, label: string) => setDeleteTarget({ id, label });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (subRoute === 'TOPLULUKLAR') await deleteCommunity(deleteTarget.id);
      else if (subRoute === 'TAKIMLAR') await deleteTeamAdmin(deleteTarget.id);
      else await deleteTournament(deleteTarget.id);
      success('Silindi');
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setDeleteTarget(null);
    }
  };

  const deleteDialog = (
    <ConfirmDialog
      open={!!deleteTarget}
      title="Kaydı sil"
      description={deleteTarget ? `"${deleteTarget.label}" kalıcı olarak silinecek.` : ''}
      confirmLabel="Sil"
      destructive
      onConfirm={() => void confirmDelete()}
      onCancel={() => setDeleteTarget(null)}
    />
  );

  const addForm = showAdd && (
    <div className="flex gap-2 max-w-md p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
      <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ad girin..." className="flex-1 h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-white text-sm focus:outline-none focus:border-white/20" />
      <button onClick={() => void handleAdd()} className="h-9 px-4 bg-white text-black text-xs font-bold rounded-lg">Kaydet</button>
      <button onClick={() => setShowAdd(false)} className="h-9 px-3 text-gray-500 text-xs hover:text-white">İptal</button>
    </div>
  );

  if (subRoute === 'TAKIMLAR') {
    return (
      <>
      <PageShell route="TAKIMLAR" icon={<Users size={20} />} actions={
        <ModuleCrudBar moduleKey="teams" addLabel="Yeni Takım" onAdd={() => setShowAdd(true)} onRefresh={refresh} />
      }>
        {addForm}
        <AdminSearchBar value={query} onChange={setQuery} placeholder="Takım ara..." resultCount={filteredTeams.length} className="mb-4" />
        <DataTable
          columns={[
            { header: 'Takım', render: (t) => (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{t.name}</span>
                {t.is_demo && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">DEMO</span>}
              </div>
            )},
            { header: 'Kaptan', render: (t) => <span className="font-mono text-[11px] text-gray-500">{t.captain_id?.slice(0, 8) ?? '—'}</span> },
            { header: 'Tarih', render: (t) => <span className="text-[11px] text-gray-500">{t.created_at ? new Date(t.created_at).toLocaleDateString('tr-TR') : '—'}</span> },
            { header: '', render: (t) => (
              <button onClick={() => handleDelete(t.id, t.name)} className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10"><Trash2 size={14} /></button>
            )},
          ]}
          data={filteredTeams}
          loading={loading}
        />
      </PageShell>
      {deleteDialog}
      </>
    );
  }

  if (subRoute === 'TURNUVALAR') {
    return (
      <>
      <PageShell route="TURNUVALAR" icon={<Trophy size={20} />} actions={
        <ModuleCrudBar moduleKey="tournaments" addLabel="Yeni Turnuva" onAdd={() => setShowAdd(true)} onRefresh={refresh} />
      }>
        {addForm}
        <AdminSearchBar value={query} onChange={setQuery} placeholder="Turnuva ara..." resultCount={filteredTournaments.length} className="mb-4" />
        <DataTable
          columns={[
            { header: 'Turnuva', render: (t) => (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{t.name}</span>
                {t.is_demo && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">DEMO</span>}
              </div>
            )},
            { header: 'Durum', render: (t) => <span className="text-[11px] text-gray-500">{t.status}</span> },
            { header: 'Kapasite', render: (t) => <span className="text-[11px] text-gray-500">{t.max_teams} takım</span> },
            { header: 'Başlangıç', render: (t) => <span className="text-[11px] text-gray-500">{t.starts_at ? new Date(t.starts_at).toLocaleDateString('tr-TR') : '—'}</span> },
            { header: '', render: (t) => (
              <button onClick={() => handleDelete(t.id, t.name)} className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10"><Trash2 size={14} /></button>
            )},
          ]}
          data={filteredTournaments}
          loading={loading}
        />
      </PageShell>
      {deleteDialog}
      </>
    );
  }

  return (
    <>
    <PageShell route="TOPLULUKLAR" icon={<Globe size={20} />} actions={
      <ModuleCrudBar moduleKey="communities" addLabel="Yeni Topluluk" onAdd={() => setShowAdd(true)} onRefresh={refresh} />
    }>
      {addForm}
      <AdminSearchBar value={query} onChange={setQuery} placeholder="Topluluk ara..." resultCount={filteredCommunities.length} className="mb-4" />
      {error && <p className="text-red-400 text-xs px-1">{error}</p>}

      {requests.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] font-black text-yellow-400 uppercase tracking-widest">Onay Bekleyen Talepler ({requests.length})</h3>
          {requests.map((req) => (
            <div key={req.id} className="bg-[#161B22] border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">{req.name}</p>
                <p className="text-[10px] text-gray-400">{req.type} • {req.requesterName} • {req.location || '—'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void handleModerate(req.id, true)} disabled={actioningId === req.id} className="flex items-center gap-1 text-xs font-bold text-green-400 border border-green-500/30 px-3 py-1.5 rounded-lg">
                  <Check size={12} /> Onayla
                </button>
                <button onClick={() => void handleModerate(req.id, false)} disabled={actioningId === req.id} className="flex items-center gap-1 text-xs font-bold text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg">
                  <X size={12} /> Reddet
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Kayıtlı Topluluklar ({filteredCommunities.length})</h3>
        {filteredCommunities.length === 0 && !loading ? (
          <p className="text-center text-gray-600 text-xs py-8 border border-dashed border-white/5 rounded-xl">Henüz topluluk yok</p>
        ) : (
          filteredCommunities.map((c) => (
            <div key={c.id} className="bg-black/30 border border-white/5 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{c.name}</h3>
                  {c.is_verified && <span className="text-[8px] font-black text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">DOĞRULANMIŞ</span>}
                </div>
                <p className="text-[10px] text-gray-500 font-mono mt-1">{c.type} • {c.member_count} üye • {c.join_mode}</p>
              </div>
              <button onClick={() => handleDelete(c.id, c.name)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg" title="Sil">
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </section>
    </PageShell>
    {deleteDialog}
    </>
  );
};
