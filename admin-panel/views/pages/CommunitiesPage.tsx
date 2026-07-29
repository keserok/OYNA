import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, Trophy, Users, Check, X, Trash2, Eye } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { PageShell } from '../components/PageShell';
import { CommunityDetailDrawer } from '../components/CommunityDetailDrawer';
import { CommunityFormModal } from '../components/CommunityFormModal';
import {
  fetchCommunitiesAdmin, fetchCommunityCreationRequests, fetchTeamsFromDb, fetchTournaments,
  moderateCommunityCreation, deleteCommunity, createCommunityAdmin, updateCommunityAdmin,
  deleteTeamAdmin, createTeamAdmin, deleteTournament, createTournamentAdmin,
  toTurkishAdminError,
  type CommunityRow, type CommunityCreationRequest, type CommunityAdminInput,
} from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

interface CommunitiesPageProps {
  subRoute: 'TOPLULUKLAR' | 'TAKIMLAR' | 'TURNUVALAR';
  onRefresh?: () => Promise<void>;
  openCommunityId?: string | null;
  onOpenCommunityConsumed?: () => void;
}

export const CommunitiesPage: React.FC<CommunitiesPageProps> = ({
  subRoute, onRefresh, openCommunityId, onOpenCommunityConsumed,
}) => {
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [communityTotal, setCommunityTotal] = useState(0);
  const [requests, setRequests] = useState<CommunityCreationRequest[]>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; captain_id: string | null; created_at: string; is_demo?: boolean }>>([]);
  const [tournaments, setTournaments] = useState<Array<{ id: string; name: string; status: string; max_teams: number; is_demo: boolean; starts_at: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editCommunity, setEditCommunity] = useState<CommunityRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 350);
  const { success, error: toastError } = useAdminToast();

  useEffect(() => {
    if (openCommunityId && subRoute === 'TOPLULUKLAR') {
      setDetailId(openCommunityId);
      onOpenCommunityConsumed?.();
    }
  }, [openCommunityId, subRoute, onOpenCommunityConsumed]);

  const teamSearch = useCallback((t: (typeof teams)[number], q: string) => t.name.toLowerCase().includes(q), []);
  const tourSearch = useCallback((t: (typeof tournaments)[number], q: string) => t.name.toLowerCase().includes(q), []);
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

  const loadCommunities = useCallback(async () => {
    const res = await fetchCommunitiesAdmin({
      search: debouncedQuery.trim() || undefined,
      limit: 100,
    });
    setCommunities(res.communities);
    setCommunityTotal(res.total);
  }, [debouncedQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (subRoute === 'TOPLULUKLAR') {
        const r = await fetchCommunityCreationRequests();
        await loadCommunities();
        setRequests(r);
      } else {
        const [t, tour] = await Promise.all([
          fetchTeamsFromDb(),
          fetchTournaments(),
        ]);
        setTeams(t);
        setTournaments(tour);
      }
    } catch (err) {
      setError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [subRoute, loadCommunities]);

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
      if (subRoute === 'TAKIMLAR') await createTeamAdmin(newName.trim());
      else await createTournamentAdmin({ name: newName.trim() });
      setNewName('');
      setShowAdd(false);
      success('Kayıt eklendi');
      await load();
    } catch (err) {
      setError(toTurkishAdminError(err));
    }
  };

  const handleCommunitySave = async (data: CommunityAdminInput) => {
    if (formMode === 'create') {
      await createCommunityAdmin(data);
      success('Topluluk oluşturuldu');
    } else if (editCommunity) {
      await updateCommunityAdmin(editCommunity.id, data);
      success('Topluluk güncellendi');
    }
    await load();
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
      <ModuleCrudBar
        moduleKey="communities"
        addLabel="Yeni Topluluk"
        onAdd={() => { setFormMode('create'); setEditCommunity(null); setFormOpen(true); }}
        onRefresh={refresh}
      />
    }>
      <AdminSearchBar value={query} onChange={setQuery} placeholder="Topluluk ara..." resultCount={communityTotal} className="mb-4" />
      {error && <p className="text-red-400 text-xs px-1 mb-2">{error}</p>}

      {requests.length > 0 && (
        <section className="space-y-2 mb-6">
          <h3 className="text-[10px] font-extrabold text-yellow-400 uppercase tracking-widest">Oluşturma Talepleri ({requests.length})</h3>
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

      <DataTable
        columns={[
          { header: 'Topluluk', render: (c) => (
            <button type="button" onClick={() => setDetailId(c.id)} className="text-left group">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white group-hover:text-blue-300">{c.name}</span>
                {c.is_verified && <span className="text-[8px] font-extrabold text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">DOĞRULANMIŞ</span>}
                {c.is_demo && <span className="text-[8px] font-extrabold text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">DEMO</span>}
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">{c.type} • {c.member_count} üye</p>
            </button>
          )},
          { header: 'Katılım', render: (c) => <span className="text-[11px] text-gray-400 font-mono">{c.join_mode}</span> },
          { header: 'Sahip', render: (c) => <span className="text-[11px] text-gray-500">{c.owner_name || '—'}</span> },
          { header: 'Tarih', render: (c) => <span className="text-[11px] text-gray-500">{new Date(c.created_at).toLocaleDateString('tr-TR')}</span> },
          { header: '', render: (c) => (
            <div className="flex gap-1">
              <button onClick={() => setDetailId(c.id)} className="p-1.5 text-gray-500 hover:text-blue-400 rounded-lg hover:bg-blue-500/10" title="Detay">
                <Eye size={14} />
              </button>
              <button onClick={() => handleDelete(c.id, c.name)} className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10" title="Sil">
                <Trash2 size={14} />
              </button>
            </div>
          )},
        ]}
        data={communities}
        loading={loading}
      />
    </PageShell>

    <CommunityFormModal
      open={formOpen}
      mode={formMode}
      community={editCommunity}
      onClose={() => setFormOpen(false)}
      onSave={handleCommunitySave}
    />

    {detailId && (
      <CommunityDetailDrawer
        communityId={detailId}
        onClose={() => setDetailId(null)}
        onUpdated={() => void loadCommunities()}
      />
    )}

    {deleteDialog}
    </>
  );
};
