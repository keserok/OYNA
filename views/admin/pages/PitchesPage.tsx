import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { ActionConfirmModal, ActionConfirmOptions } from '../components/ActionConfirmModal';
import { AddPitchModal } from '../components/AddPitchModal';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { AdminFilterChips } from '../components/AdminFilterChips';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import { MapPin, TrendingUp, Edit2, Trash2, Zap } from 'lucide-react';
import { fetchPitchesAdmin, toTurkishAdminError } from '../../../services/adminService';
import { mapAdminPitchRowToUi, PITCH_STATUS_FILTERS, type PitchStatusFilter } from '../../../utils/pitchMapper';
import { useAppStore } from '../../../store';
import type { Pitch } from '../../../types';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

interface PitchesPageProps {
    onEditPitch: (pitch: Pitch) => void;
    onDeletePitch: (id: string) => void;
    onRefresh?: () => Promise<void>;
}

const PAGE_SIZE = 50;

export const PitchesPage: React.FC<PitchesPageProps> = ({ onEditPitch, onDeletePitch, onRefresh }) => {
    const { addPitch, updatePitch, deletePitch } = useAppStore();
    const [pitches, setPitches] = useState<Pitch[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedValue(query, 350);
    const [statusFilter, setStatusFilter] = useState<PitchStatusFilter>('ALL');
    const [page, setPage] = useState(0);
    const [multiplier, setMultiplier] = useState(1.0);
    const [selectedPitchIdx, setSelectedPitchIdx] = useState(0);
    const { success, error: toastError } = useAdminToast();
    const [confirmModal, setConfirmModal] = useState<ActionConfirmOptions | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchPitchesAdmin({
                search: debouncedQuery.trim() || undefined,
                status: statusFilter === 'ALL' ? undefined : statusFilter,
                limit: PAGE_SIZE,
                offset: page * PAGE_SIZE,
            });
            const mapped = res.pitches.map(mapAdminPitchRowToUi);
            setPitches(mapped);
            setTotal(res.total);
        } catch (err) {
            toastError(toTurkishAdminError(err));
        } finally {
            setLoading(false);
        }
    }, [debouncedQuery, statusFilter, page, toastError]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { setPage(0); }, [debouncedQuery, statusFilter]);

    const refresh = async () => {
        if (onRefresh) await onRefresh();
        await load();
    };

    const statusChips = useMemo(() => {
        const counts = new Map<string, number>();
        for (const p of pitches) {
            const s = (p as Pitch & { isApproved?: boolean }).isApproved === false ? 'pending' : 'approved';
            counts.set(s, (counts.get(s) || 0) + 1);
        }
        return PITCH_STATUS_FILTERS.map((f) => ({
            id: f.id,
            label: f.label,
            count: f.id === 'ALL' ? total : counts.get(f.id) ?? undefined,
        }));
    }, [pitches, total]);

    const handleApplyPricingRequest = () => {
        const pitch = pitches[selectedPitchIdx];
        if (!pitch) return;
        setConfirmModal({
            title: 'Fiyat Çarpanı Güncellemesi',
            description: `${pitch.name} için fiyatlandırma ${multiplier}x olarak güncellenecek.`,
            impactText: `Yeni K/B: ₺${Math.round(pitch.pricePerPerson * multiplier)} | Toplam: ₺${Math.round(pitch.totalPrice * multiplier)}`,
            actionType: 'PRICE_CHANGE',
            targetId: pitch.id,
            targetName: pitch.name,
            onCancel: () => setConfirmModal(null),
            onConfirm: async () => {
                try {
                    await updatePitch({
                        ...pitch,
                        pricePerPerson: Math.round(pitch.pricePerPerson * multiplier),
                        totalPrice: Math.round(pitch.totalPrice * multiplier),
                    });
                    success(`${pitch.name} fiyatı güncellendi (${multiplier}x)`);
                    await load();
                } catch (err) {
                    toastError(toTurkishAdminError(err));
                }
                setConfirmModal(null);
            },
        });
    };

    const handleDeleteRequest = (p: Pitch) => {
        setConfirmModal({
            title: 'Saha Silme İşlemi',
            description: `"${p.name}" kalıcı olarak silinecek.`,
            impactText: 'admin_delete_pitch RPC ile denetim kaydına yazılır.',
            actionType: 'SETTINGS_CHANGE',
            targetId: p.id,
            targetName: p.name,
            onCancel: () => setConfirmModal(null),
            onConfirm: async () => {
                try {
                    await deletePitch(p.id);
                    onDeletePitch(p.id);
                    success(`${p.name} silindi`);
                    await load();
                } catch (err) {
                    toastError(toTurkishAdminError(err));
                }
                setConfirmModal(null);
            },
        });
    };

    const GradeBadge = ({ g }: { g?: 'A' | 'B' | 'C' }) => {
        if (!g) return <span className="text-gray-600 text-[10px]">—</span>;
        const colors = {
            A: 'bg-green-500/20 text-green-400 border-green-500/30',
            B: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
            C: 'bg-red-500/20 text-red-400 border-red-500/30',
        };
        return <span className={`px-2 py-0.5 rounded border text-[9px] font-black ${colors[g]}`}>{g}</span>;
    };

    const pitchColumns = [
        {
            header: 'GÖRSEL',
            render: (p: Pitch) => <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-white/10" />,
        },
        {
            header: 'SAHA ADI & BÖLGE',
            render: (p: Pitch) => (
                <div>
                    <div className="font-bold text-white text-xs">{p.name}</div>
                    <div className="text-[10px] text-gray-500 font-mono">{p.id.slice(0, 8)}…</div>
                    <div className="text-[10px] text-gray-500">{p.district || '—'}</div>
                </div>
            ),
        },
        {
            header: 'FİYAT',
            render: (p: Pitch) => (
                <div className="font-mono text-[10px]">
                    <span className="text-[#39FF14] font-bold">₺{p.pricePerPerson}</span> / <span className="text-gray-400">₺{p.totalPrice}</span>
                </div>
            ),
        },
        {
            header: 'DURUM',
            render: (p: Pitch) => (
                <StatusBadge tone={(p as Pitch & { isApproved?: boolean }).isApproved === false ? 'warning' : 'success'}>
                    {(p as Pitch & { isApproved?: boolean }).isApproved === false ? 'BEKLEYEN' : 'ONAYLI'}
                </StatusBadge>
            ),
        },
        {
            header: 'KALİTE',
            render: (p: Pitch) => (
                <div className="flex gap-1">
                    <GradeBadge g={p.lightingGrade} />
                    <GradeBadge g={p.grassGrade} />
                </div>
            ),
        },
        {
            header: 'AKSİYONLAR',
            render: (p: Pitch) => (
                <div className="flex gap-2">
                    <button type="button" onClick={() => onEditPitch(p)} className="p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg border border-blue-500/20">
                        <Edit2 size={14} />
                    </button>
                    <button type="button" onClick={() => handleDeleteRequest(p)} className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg border border-red-500/20">
                        <Trash2 size={14} />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <PageShell
            route="SAHALAR"
            icon={<Zap size={20} />}
            actions={
                <ModuleCrudBar moduleKey="pitches" addLabel="Yeni Saha" onAdd={() => setIsAddModalOpen(true)} onRefresh={refresh} />
            }
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <div className="bg-[#161B22]/60 border border-white/5 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-[#FFFF00]" /> HIZLI FİYAT ÇARPANI
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <select value={selectedPitchIdx} onChange={(e) => setSelectedPitchIdx(+e.target.value)} className="h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white">
                            {pitches.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
                        </select>
                        <select value={multiplier} onChange={(e) => setMultiplier(+e.target.value)} className="h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white">
                            <option value={1}>1.0x</option>
                            <option value={1.2}>1.2x</option>
                            <option value={1.5}>1.5x</option>
                            <option value={2}>2.0x</option>
                        </select>
                    </div>
                    <button type="button" onClick={handleApplyPricingRequest} disabled={!pitches.length} className="h-10 w-full bg-[#FFFF00] text-black font-black text-[10px] uppercase rounded-xl disabled:opacity-40">
                        ÇARPANI UYGULA
                    </button>
                </div>
                <div className="bg-[#161B22]/60 border border-white/5 rounded-2xl p-5 flex flex-col items-center justify-center text-center">
                    <MapPin size={32} className="text-[#39FF14] mb-3" />
                    <p className="text-sm font-bold text-white">{total} Tesis</p>
                    <p className="text-[10px] text-gray-500 mt-1">admin_fetch_pitches RPC</p>
                </div>
            </div>

            <div className="space-y-4 mb-4">
                <AdminSearchBar value={query} onChange={setQuery} placeholder="Saha adı, bölge veya ID ara..." resultCount={pitches.length} totalCount={total} />
                <AdminFilterChips chips={statusChips} active={statusFilter} onChange={(id) => setStatusFilter(id as PitchStatusFilter)} />
            </div>

            <DataTable columns={pitchColumns} data={pitches} loading={loading} emptyMessage={query ? 'Arama sonucu yok' : 'Henüz saha kaydı yok'} />

            {total > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                    <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}</span>
                    <div className="flex gap-2">
                        <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg border border-white/10 disabled:opacity-40">Önceki</button>
                        <button type="button" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg border border-white/10 disabled:opacity-40">Sonraki</button>
                    </div>
                </div>
            )}

            <ActionConfirmModal isOpen={!!confirmModal} options={confirmModal} />
            <AddPitchModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onAdd={async (pitch) => {
                    try {
                        await addPitch(pitch);
                        success(`${pitch.name} eklendi`);
                        await load();
                    } catch (err) {
                        toastError(toTurkishAdminError(err));
                        throw err;
                    }
                }}
            />
        </PageShell>
    );
};
