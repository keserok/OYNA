import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { ActionConfirmModal, ActionConfirmOptions } from '../components/ActionConfirmModal';
import { PitchStudio } from '../components/PitchStudio';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { AdminFilterChips } from '../components/AdminFilterChips';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import { MapPin, Edit2, Trash2, Zap, Star, Eye, EyeOff, Percent, Clock } from 'lucide-react';
import { fetchPitchesAdmin, toTurkishAdminError } from '../../services/adminService';
import { setPitchPublished, setPitchShowcaseFlags } from '../../../services/pitchContentService';
import { supabase } from '../../../supabaseClient';
import { mapAdminPitchRowToUi, PITCH_STATUS_FILTERS, type PitchStatusFilter } from '../../utils/pitchMapper';
import { useAppStore } from '../../../store';
import type { Pitch } from '../../../types';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

interface PitchesPageProps {
    onRefresh?: () => Promise<void>;
}

const PAGE_SIZE = 50;

export const PitchesPage: React.FC<PitchesPageProps> = ({ onRefresh }) => {
    const { deletePitch } = useAppStore();
    const [pitches, setPitches] = useState<Pitch[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedValue(query, 350);
    const [statusFilter, setStatusFilter] = useState<PitchStatusFilter>('ALL');
    const [page, setPage] = useState(0);
    const { success, error: toastError } = useAdminToast();
    const [confirmModal, setConfirmModal] = useState<ActionConfirmOptions | null>(null);
    // Saha Kurulum Merkezi: null → kapalı; {pitchId:null} → yeni tesis; {pitchId} → düzenle
    const [studio, setStudio] = useState<{ pitchId: string | null } | null>(null);
    // Vitrin bayrakları (Karar #23, #28 + rozet yetkisi): admin RPC bu kolonları
    // dönmediği için ayrı çekilir. featured/flash/availability admin-only (DB trigger).
    type ShowcaseFlags = { published: boolean; featured: boolean; flash: boolean; availability: boolean };
    const DEFAULT_FLAGS: ShowcaseFlags = { published: true, featured: false, flash: false, availability: false };
    const [showcaseFlags, setShowcaseFlags] = useState<Record<string, ShowcaseFlags>>({});

    const loadShowcaseFlags = useCallback(async (ids: string[]) => {
        if (ids.length === 0) { setShowcaseFlags({}); return; }
        const { data } = await supabase
            .from('pitches')
            .select('id, is_published, is_featured, flash_deals_enabled, show_availability_badge')
            .in('id', ids);
        const map: Record<string, ShowcaseFlags> = {};
        (data ?? []).forEach((r: { id: string; is_published: boolean | null; is_featured: boolean | null; flash_deals_enabled: boolean | null; show_availability_badge: boolean | null }) => {
            map[r.id] = {
                published: r.is_published !== false,
                featured: r.is_featured === true,
                flash: r.flash_deals_enabled === true,
                availability: r.show_availability_badge === true,
            };
        });
        setShowcaseFlags(map);
    }, []);

    const FLAG_LABELS: Record<keyof ShowcaseFlags, [string, string]> = {
        published: ['Tesis vitrinde görünür', 'Tesis vitrinden gizlendi'],
        featured: ['Öne çıkarıldı', 'Öne çıkarma kaldırıldı'],
        flash: ['Flash indirim rozeti açık', 'Flash indirim rozeti kapalı'],
        availability: ['Müsaitlik rozeti açık', 'Müsaitlik rozeti kapalı'],
    };

    const toggleShowcaseFlag = async (pitchId: string, kind: keyof ShowcaseFlags) => {
        const cur = showcaseFlags[pitchId] ?? DEFAULT_FLAGS;
        const next = { ...cur, [kind]: !cur[kind] };
        setShowcaseFlags((prev) => ({ ...prev, [pitchId]: next }));
        try {
            if (kind === 'published') await setPitchPublished(pitchId, next.published);
            else if (kind === 'featured') await setPitchShowcaseFlags(pitchId, { is_featured: next.featured });
            else if (kind === 'flash') await setPitchShowcaseFlags(pitchId, { flash_deals_enabled: next.flash });
            else await setPitchShowcaseFlags(pitchId, { show_availability_badge: next.availability });
            success(next[kind] ? FLAG_LABELS[kind][0] : FLAG_LABELS[kind][1]);
        } catch (err) {
            setShowcaseFlags((prev) => ({ ...prev, [pitchId]: cur }));
            toastError(toTurkishAdminError(err));
        }
    };

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
            void loadShowcaseFlags(mapped.map((p) => p.id));
        } catch (err) {
            toastError(toTurkishAdminError(err));
        } finally {
            setLoading(false);
        }
    }, [debouncedQuery, statusFilter, page, toastError, loadShowcaseFlags]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { setPage(0); }, [debouncedQuery, statusFilter]);

    const refresh = async () => {
        if (onRefresh) await onRefresh();
        await load();
    };

    const statusChips = useMemo(() => {
        const counts = new Map<string, number>();
        for (const p of pitches) {
            const s = (p as Pitch & { isPublished?: boolean }).isPublished === false ? 'hidden' : 'published';
            counts.set(s, (counts.get(s) || 0) + 1);
        }
        return PITCH_STATUS_FILTERS.map((f) => ({
            id: f.id,
            label: f.label,
            count: f.id === 'ALL' ? total : counts.get(f.id) ?? undefined,
        }));
    }, [pitches, total]);

    const handleDeleteRequest = (p: Pitch) => {
        setConfirmModal({
            title: 'Saha Silme İşlemi',
            description: `"${p.name}" kalıcı olarak silinecek.`,
            impactText: 'Tesis vitrinden kalkar; admin_delete_pitch RPC ile denetim kaydına yazılır.',
            actionType: 'SETTINGS_CHANGE',
            targetId: p.id,
            targetName: p.name,
            confirmPhrase: 'SİL',
            onCancel: () => setConfirmModal(null),
            onConfirm: async () => {
                try {
                    await deletePitch(p.id);
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
        return <span className={`px-2 py-0.5 rounded border text-[9px] font-extrabold ${colors[g]}`}>{g}</span>;
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
            // IP-22: tesis onayı kalktı — anlamlı olan tek durum vitrinde görünüp
            // görünmediğidir. Aynı bilgi sağdaki göz düğmesiyle değiştirilebilir.
            header: 'DURUM',
            render: (p: Pitch) => {
                const gorunur = (showcaseFlags[p.id] ?? DEFAULT_FLAGS).published;
                return (
                    <StatusBadge tone={gorunur ? 'success' : 'warning'}>
                        {gorunur ? 'VİTRİNDE' : 'GİZLİ'}
                    </StatusBadge>
                );
            },
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
            header: 'VİTRİN',
            render: (p: Pitch) => {
                const f = showcaseFlags[p.id] ?? DEFAULT_FLAGS;
                return (
                    <div className="flex gap-1.5">
                        <button
                            type="button"
                            onClick={() => void toggleShowcaseFlag(p.id, 'featured')}
                            title={f.featured ? 'Öne Çıkan rozetini kaldır' : 'Öne Çıkan yap'}
                            className={`p-1.5 rounded-lg border ${f.featured ? 'bg-[#FFFF00]/15 text-[#FFFF00] border-[#FFFF00]/40' : 'bg-white/5 text-gray-500 border-white/10'}`}
                        >
                            <Star size={14} className={f.featured ? 'fill-current' : ''} />
                        </button>
                        <button
                            type="button"
                            onClick={() => void toggleShowcaseFlag(p.id, 'flash')}
                            title={f.flash ? 'Flash indirim rozetini kapat' : 'Flash indirim rozetini aç'}
                            className={`p-1.5 rounded-lg border ${f.flash ? 'bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/40' : 'bg-white/5 text-gray-500 border-white/10'}`}
                        >
                            <Percent size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => void toggleShowcaseFlag(p.id, 'availability')}
                            title={f.availability ? 'Müsaitlik rozetini kapat' : 'Müsaitlik rozetini aç'}
                            className={`p-1.5 rounded-lg border ${f.availability ? 'bg-[#39FF14]/15 text-[#39FF14] border-[#39FF14]/40' : 'bg-white/5 text-gray-500 border-white/10'}`}
                        >
                            <Clock size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => void toggleShowcaseFlag(p.id, 'published')}
                            title={f.published ? 'Vitrinden gizle' : 'Vitrinde göster'}
                            className={`p-1.5 rounded-lg border ${f.published ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}
                        >
                            {f.published ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                    </div>
                );
            },
        },
        {
            header: 'AKSİYONLAR',
            render: (p: Pitch) => (
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setStudio({ pitchId: p.id })}
                        title="Kurulum Merkezi'nde düzenle"
                        className="p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg border border-blue-500/20"
                    >
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
                <ModuleCrudBar moduleKey="pitches" addLabel="Yeni Tesis Kur" onAdd={() => setStudio({ pitchId: null })} onRefresh={refresh} />
            }
        >
            <div className="bg-[#161B22]/60 border border-white/5 rounded-2xl p-4 mb-4 flex items-center gap-4">
                <MapPin size={24} className="text-[#39FF14] shrink-0" />
                <div>
                    <p className="text-sm font-bold text-white">{total} Tesis</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                        Kimlik, konum, kort, tarife, fotoğraf ve vitrin — tümü Kurulum Merkezi'nden yönetilir.
                        Fiyatın tek kaynağı tarifelerdir.
                    </p>
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
            {studio && (
                <PitchStudio
                    pitchId={studio.pitchId}
                    onClose={() => { setStudio(null); void load(); }}
                    onSaved={() => void load()}
                />
            )}
        </PageShell>
    );
};
