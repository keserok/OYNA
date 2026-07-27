import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Image as ImageIcon, Trash2, Edit3, Save, BadgeCheck, Clock, RotateCcw, Camera, AlertCircle, X } from 'lucide-react';
import { PitchCourt } from '../../types';
import { upsertCourt, deleteCourt, getInactiveCourts, reactivateCourt, toTurkishError } from '../../services/pitchOwnerService';
import { approveCourtGrades } from '../../services/pitchContentService';
import { supabase } from '../../supabaseClient';
import PhotoManager from '../../components/pitch-editor/PhotoManager';
import { COURT_FEATURES, normalizeCourtFeatures } from '../../shared/courtFeatures';
import { SURFACE_LABELS, SURFACE_OPTIONS } from '../../shared/courtSurface';
import { useConfirmSheet } from '../../views/owner/components/useConfirmSheet';

// Format aralığı: takım başına oyuncu (3..11) — kort maç formatı daraltmasını besler.
const FORMAT_RANGE_OPTIONS = Array.from({ length: 9 }, (_, i) => i + 3); // 3v3..11v11

// DB'de mevcut olup PitchCourt tipinde henüz tanımlı olmayan kort format alanları.
type CourtFormatExtras = {
    min_capacity?: number | null;
    max_capacity?: number | null;
    size_label?: string | null;
};

// Kapasite: "5v5" → toplam oyuncu (10). Oyuncu tarafı formatCapacity ile geri çevirir.
const CAPACITY_OPTIONS = [
    { label: '5v5', value: 10 },
    { label: '6v6', value: 12 },
    { label: '7v7', value: 14 },
    { label: '8v8', value: 16 },
    { label: '9v9', value: 18 },
    { label: '11v11', value: 22 },
];

/** "30x50" → {w:'30', l:'50'} (Türkçe 'x'/'X'/'*' ayraçlarını hoş görür). */
function parseSize(size?: string | null): { w: string; l: string } {
    if (!size) return { w: '', l: '' };
    const parts = String(size).split(/[xX*]/).map((s) => s.trim());
    return { w: parts[0] ?? '', l: parts[1] ?? '' };
}
function composeSize(w: string, l: string): string | null {
    const ww = w.trim();
    const ll = l.trim();
    if (!ww && !ll) return null;
    return `${ww || '?'}x${ll || '?'}`;
}

interface PitchManagerProps {
    onBack: () => void;
    facilityId?: string;
    pitches: PitchCourt[];
    onUpdatePitches: (pitches: PitchCourt[]) => void;
    readOnly?: boolean;
    maxCourts?: number;
    /** Liste başlığındaki geri oku. Owner panelinde alt nav dönüşü sağladığı için gizlenir. */
    showBack?: boolean;
}

export const PitchManager: React.FC<PitchManagerProps> = ({
    onBack,
    facilityId,
    pitches,
    onUpdatePitches,
    readOnly = false,
    maxCourts = 5,
    showBack = true,
}) => {
    const [editingPitch, setEditingPitch] = useState<PitchCourt | null>(null);
    // Format aralığı + rozet — kort seçilen maçlarda format listesini daraltır.
    const [editCaps, setEditCaps] = useState<{ min: number; max: number; sizeLabel: string }>({ min: 5, max: 7, sizeLabel: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const { confirm, confirmElement } = useConfirmSheet();
    const [inactiveCourts, setInactiveCourts] = useState<PitchCourt[]>([]);

    const isRealFacility = !!facilityId && !facilityId.startsWith('mock-');

    // Pasif (soft-delete) sahalar — "Geri Aç" için (Karar #5).
    const loadInactive = React.useCallback(() => {
        if (!isRealFacility || !facilityId) { setInactiveCourts([]); return; }
        getInactiveCourts(facilityId).then(setInactiveCourts).catch(() => setInactiveCourts([]));
    }, [isRealFacility, facilityId]);
    useEffect(() => { loadInactive(); }, [loadInactive, pitches.length]);

    const handleReactivate = async (court: PitchCourt) => {
        if (readOnly) return;
        try {
            if (isRealFacility && court.id) await reactivateCourt(court.id);
            setInactiveCourts((prev) => prev.filter((c) => c.id !== court.id));
            onUpdatePitches([...pitches, { ...court, is_active: true }]);
        } catch (err) {
            setSaveError(toTurkishError(err));
        }
    };

    const editSize = useMemo(() => parseSize(editingPitch?.size), [editingPitch?.size]);
    const editFeatures = useMemo(() => normalizeCourtFeatures(editingPitch?.features), [editingPitch?.features]);
    const toggleFeature = (value: string) => {
        if (!editingPitch) return;
        const cur = normalizeCourtFeatures(editingPitch.features);
        const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
        setEditingPitch({ ...editingPitch, features: next });
    };

    // Kalite notu onayı yalnızca platform admin'e açık (Karar #2)
    const [isAdmin, setIsAdmin] = useState(false);
    useEffect(() => {
        supabase.auth.getUser().then(async ({ data }) => {
            if (!data.user) return;
            const { data: profile } = await supabase
                .from('profiles')
                .select('is_admin, role')
                .eq('id', data.user.id)
                .single();
            setIsAdmin(profile?.is_admin === true || profile?.role === 'SUPER_ADMIN');
        });
    }, []);

    const handleApproveGrades = async () => {
        if (!editingPitch?.id) return;
        try {
            await approveCourtGrades(editingPitch.id);
            setEditingPitch({ ...editingPitch, grades_status: 'approved' });
            onUpdatePitches(pitches.map((p) => (p.id === editingPitch.id ? { ...p, grades_status: 'approved' } : p)));
        } catch (err) {
            setSaveError(toTurkishError(err));
        }
    };

    const handleEdit = (pitch: PitchCourt) => {
        if (readOnly) return;
        setEditingPitch({ ...pitch });
        // Mevcut kortun format aralığı + rozetiyle doldur (yoksa varsayılan 5v5–7v7).
        const ext = pitch as PitchCourt & CourtFormatExtras;
        setEditCaps({
            min: ext.min_capacity ?? 5,
            max: ext.max_capacity ?? 7,
            sizeLabel: ext.size_label ?? '',
        });
        setSaveError(null);
    };

    const handleAddNew = () => {
        if (readOnly) return;
        if (pitches.length >= maxCourts) {
            setSaveError(`Mevcut planınız en fazla ${maxCourts} saha destekliyor. Daha fazla saha için Menü → Faturalandırma'dan planınızı yükseltin veya destek ile iletişime geçin.`);
            return;
        }
        const newPitch: PitchCourt = {
            id: '',
            pitch_id: facilityId ?? '',
            name: `Saha ${pitches.length + 1}`,
            court_type: 'OPEN',
            surface: 'TURF',
            size: null,
            is_active: true,
            sort_order: pitches.length,
            price: null,
            capacity: 14,
            min_capacity: null,
            max_capacity: null,
            images: [],
            description: '',
            features: [],
            lighting_grade: null,
            grass_grade: null,
            locker_grade: null,
        };
        setEditingPitch(newPitch);
        setEditCaps({ min: 5, max: 7, sizeLabel: '' }); // yeni kort varsayılanı
        setSaveError(null);
    };

    const handleSave = async () => {
        if (readOnly || !editingPitch || !facilityId) return;
        // Doğrulama: en küçük format en büyük formatı aşamaz.
        if (editCaps.min > editCaps.max) {
            setSaveError('En küçük format, en büyük formattan büyük olamaz. Aralığı kontrol edin.');
            return;
        }
        setIsSaving(true);
        setSaveError(null);
        try {
            if (isRealFacility) {
                const saved = await upsertCourt(facilityId, {
                    id: editingPitch.id || undefined,
                    name: editingPitch.name,
                    court_type: editingPitch.court_type,
                    surface: editingPitch.surface ?? 'TURF',
                    size: editingPitch.size,
                    is_active: editingPitch.is_active,
                    sort_order: editingPitch.sort_order,
                    price: editingPitch.price,
                    // BİRİM: min/max_capacity TAKIM BAŞINA (7 → 7v7); legacy
                    // 'capacity' ise TOPLAM kişidir — eski görünümler onu okur,
                    // bu yüzden en büyük formatın iki katı yazılır (7 → 14).
                    capacity: editCaps.max * 2,
                    min_capacity: editCaps.min,
                    max_capacity: editCaps.max,
                    size_label: editCaps.sizeLabel.trim() || null,
                    images: editingPitch.images,
                    description: editingPitch.description,
                    features: normalizeCourtFeatures(editingPitch.features),
                    // Kalite notları yalnız platform admin tarafından değiştirilir
                    // (owner payload'unda hiç yer almaz; sunucu trigger'ı da korur).
                    ...(isAdmin
                        ? {
                              lighting_grade: editingPitch.lighting_grade,
                              grass_grade: editingPitch.grass_grade,
                              locker_grade: editingPitch.locker_grade,
                          }
                        : {}),
                });
                const exists = pitches.find((p) => p.id === saved.id);
                onUpdatePitches(
                    exists
                        ? pitches.map((p) => (p.id === saved.id ? saved : p))
                        : [...pitches, saved],
                );
            } else {
                const localId = editingPitch.id || Date.now().toString();
                const saved: PitchCourt & CourtFormatExtras = {
                    ...editingPitch,
                    id: localId,
                    min_capacity: editCaps.min,
                    max_capacity: editCaps.max,
                    size_label: editCaps.sizeLabel.trim() || null,
                };
                const exists = pitches.find((p) => p.id === localId);
                onUpdatePitches(
                    exists
                        ? pitches.map((p) => (p.id === localId ? saved : p))
                        : [...pitches, saved],
                );
            }
            setEditingPitch(null);
        } catch (err) {
            setSaveError(toTurkishError(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (readOnly) return;
        const ok = await confirm({
            title: 'Sahayı sil?',
            message: 'Bu saha kaldırılacak. Geçmiş rezervasyon kayıtları korunur ama saha artık kiralanamaz.',
            confirmLabel: 'Sil',
            destructive: true,
        });
        if (!ok) return;
        try {
            if (isRealFacility && id) {
                await deleteCourt(id);
            }
            onUpdatePitches(pitches.filter((p) => p.id !== id));
        } catch (err) {
            setSaveError(toTurkishError(err));
        }
    };

    if (editingPitch) {
        return (
            <div className="flex flex-col h-full bg-[#0A0E14] animate-in slide-in-from-right-8 duration-300">
                <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top shadow-lg z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setEditingPitch(null)} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <h2 className="text-white font-bold text-lg">{editingPitch.id ? 'Sahayı Düzenle' : 'Yeni Saha Ekle'}</h2>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !editingPitch.name.trim()}
                        className="p-2 px-5 rounded-xl bg-[#FACC15] text-black font-black text-xs flex items-center gap-2 hover:bg-yellow-300 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(255,255,0,0.3)]"
                    >
                        {isSaving ? '...' : <><Save size={16} /> KAYDET</>}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {saveError && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-xl">
                            {saveError}
                        </div>
                    )}
                    
                    <div className="bg-[#161B22] p-6 rounded-[24px] border border-white/5 space-y-4 shadow-sm">
                        <h3 className="text-sm font-black text-white italic uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Genel Bilgiler</h3>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Saha Adı</label>
                            <input
                                type="text"
                                value={editingPitch.name}
                                onChange={(e) => setEditingPitch({ ...editingPitch, name: e.target.value })}
                                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors"
                                placeholder="Örn: Saha 1 (Kapalı)"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Saha Tipi</label>
                                <select
                                    value={editingPitch.court_type === 'CLOSED' ? 'CLOSED' : 'OPEN'}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, court_type: e.target.value })}
                                    className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors appearance-none"
                                >
                                    <option value="OPEN">Açık Saha</option>
                                    <option value="CLOSED">Kapalı Saha</option>
                                </select>
                                <p className="text-[10px] text-gray-600">Vitrindeki Kapalı/Açık seçimini belirler.</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Zemin</label>
                                <select
                                    value={editingPitch.surface || 'TURF'}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, surface: e.target.value })}
                                    className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors appearance-none"
                                >
                                    {SURFACE_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Boyutlar (metre)</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    value={editSize.w}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, size: composeSize(e.target.value, editSize.l) })}
                                    className="flex-1 bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors text-center"
                                    placeholder="En (30)"
                                />
                                <span className="text-gray-500 font-black">×</span>
                                <input
                                    type="number"
                                    value={editSize.l}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, size: composeSize(editSize.w, e.target.value) })}
                                    className="flex-1 bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors text-center"
                                    placeholder="Boy (50)"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Saatlik Ücret (₺)</label>
                                <input
                                    type="number"
                                    value={editingPitch.price || ''}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, price: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors"
                                    placeholder="Örn: 2000"
                                />
                                <p className="text-[10px] text-gray-600">Kaba fiyat. Saat/gün bazlı tarife: Fiyatlandırma Politikası.</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Format Aralığı (kaça kaç)</label>
                                {/* Min/Maks oynanabilir format — vitrinde kort satırında aralık
                                    rozeti olur (6v6–8v8) ve maç oluşturma akışı bu aralığı temel
                                    alır. Min > Maks seçilemez: diğer uç otomatik hizalanır. */}
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        value={editingPitch.min_capacity ?? ''}
                                        onChange={(e) => {
                                            const v = e.target.value ? Number(e.target.value) : null;
                                            setEditingPitch({
                                                ...editingPitch,
                                                min_capacity: v,
                                                max_capacity: v !== null && editingPitch.max_capacity != null && editingPitch.max_capacity < v
                                                    ? v : editingPitch.max_capacity,
                                            });
                                        }}
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors appearance-none"
                                    >
                                        <option value="">Min —</option>
                                        {CAPACITY_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>Min {o.label}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={editingPitch.max_capacity ?? ''}
                                        onChange={(e) => {
                                            const v = e.target.value ? Number(e.target.value) : null;
                                            setEditingPitch({
                                                ...editingPitch,
                                                max_capacity: v,
                                                min_capacity: v !== null && editingPitch.min_capacity != null && editingPitch.min_capacity > v
                                                    ? v : editingPitch.min_capacity,
                                            });
                                        }}
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors appearance-none"
                                    >
                                        <option value="">Maks —</option>
                                        {CAPACITY_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>Maks {o.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <p className="text-[10px] text-gray-600">
                                    Örn. Min 6v6 + Maks 8v8 → vitrinde "6v6–8v8". Boş bırakılırsa tek format varsayılır
                                    {editingPitch.capacity ? ` (${editingPitch.capacity / 2}v${editingPitch.capacity / 2})` : ''}.
                                </p>
                            </div>
                        </div>

                        {/* Format aralığı: maç oluştururken kort seçilince format listesi bu aralığa daralır */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">En Küçük Format</label>
                                <select
                                    value={editCaps.min}
                                    onChange={(e) => setEditCaps({ ...editCaps, min: Number(e.target.value) })}
                                    className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors appearance-none"
                                >
                                    {FORMAT_RANGE_OPTIONS.map((n) => (
                                        <option key={n} value={n}>{n}v{n}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">En Büyük Format</label>
                                <select
                                    value={editCaps.max}
                                    onChange={(e) => setEditCaps({ ...editCaps, max: Number(e.target.value) })}
                                    className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors appearance-none"
                                >
                                    {FORMAT_RANGE_OPTIONS.map((n) => (
                                        <option key={n} value={n}>{n}v{n}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Format Rozeti</label>
                                <input
                                    type="text"
                                    maxLength={8}
                                    value={editCaps.sizeLabel}
                                    onChange={(e) => setEditCaps({ ...editCaps, sizeLabel: e.target.value })}
                                    className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors"
                                    placeholder="7v7, Mini..."
                                />
                            </div>
                        </div>
                        {editCaps.min > editCaps.max && (
                            <p className="text-[10px] text-red-400 font-bold">En küçük format, en büyük formattan büyük olamaz.</p>
                        )}

                        {/* Saha bazlı özellikler (Karar #18) — oyuncu kartında rozet */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Saha Özellikleri</label>
                            <div className="flex flex-wrap gap-2">
                                {COURT_FEATURES.map((f) => {
                                    const active = editFeatures.includes(f.value);
                                    return (
                                        <button
                                            key={f.value}
                                            type="button"
                                            onClick={() => toggleFeature(f.value)}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                                active
                                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                                    : 'bg-[#0A0E14] border-white/10 text-gray-400 hover:text-white'
                                            }`}
                                        >
                                            {f.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Açıklama</label>
                            <textarea
                                value={editingPitch.description || ''}
                                onChange={(e) => setEditingPitch({ ...editingPitch, description: e.target.value })}
                                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors h-24 resize-none"
                                placeholder="Sahanın özellikleri, kuralları veya ek detayları..."
                            />
                        </div>
                    </div>

                    <div className="bg-[#161B22] p-6 rounded-[24px] border border-white/5 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-4">
                            <h3 className="text-sm font-black text-white italic uppercase tracking-wider">Kalite Standartları</h3>
                            {editingPitch.grades_status === 'pending' && (
                                isAdmin ? (
                                    <button
                                        type="button"
                                        onClick={handleApproveGrades}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-[10px] font-black uppercase"
                                    >
                                        <BadgeCheck size={13} /> Notları Onayla
                                    </button>
                                ) : (
                                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase">
                                        <Clock size={12} /> Değerlendiriliyor
                                    </span>
                                )
                            )}
                            {editingPitch.grades_status === 'approved' && (editingPitch.lighting_grade || editingPitch.grass_grade) && (
                                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] text-[10px] font-black uppercase">
                                    <BadgeCheck size={12} /> Onaylı
                                </span>
                            )}
                        </div>
                        {isAdmin ? (
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase">Işıklandırma</label>
                                    <select
                                        value={editingPitch.lighting_grade || ''}
                                        onChange={(e) => setEditingPitch({ ...editingPitch, lighting_grade: e.target.value || null })}
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors appearance-none"
                                    >
                                        <option value="">Seçiniz</option>
                                        <option value="A+">A+ Çok İyi</option>
                                        <option value="A">A İyi</option>
                                        <option value="B">B Standart</option>
                                        <option value="C">C Zayıf</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase">Zemin / Çim</label>
                                    <select
                                        value={editingPitch.grass_grade || ''}
                                        onChange={(e) => setEditingPitch({ ...editingPitch, grass_grade: e.target.value || null })}
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors appearance-none"
                                    >
                                        <option value="">Seçiniz</option>
                                        <option value="A+">A+ Çok İyi</option>
                                        <option value="A">A İyi</option>
                                        <option value="B">B Standart</option>
                                        <option value="C">C Zayıf</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase">Soyunma Odası</label>
                                    <select
                                        value={editingPitch.locker_grade || ''}
                                        onChange={(e) => setEditingPitch({ ...editingPitch, locker_grade: e.target.value || null })}
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors appearance-none"
                                    >
                                        <option value="">Seçiniz</option>
                                        <option value="A+">A+ Çok İyi</option>
                                        <option value="A">A İyi</option>
                                        <option value="B">B Standart</option>
                                        <option value="C">C Zayıf</option>
                                    </select>
                                </div>
                            </div>
                        ) : (
                            /* Owner/müdür: notlar SALT-OKUNUR — yalnız OYNA yönetimi belirler. */
                            <>
                                <div className="grid grid-cols-3 gap-4">
                                    {([
                                        ['Işıklandırma', editingPitch.lighting_grade],
                                        ['Zemin / Çim', editingPitch.grass_grade],
                                        ['Soyunma Odası', editingPitch.locker_grade],
                                    ] as const).map(([label, grade]) => (
                                        <div key={label} className="space-y-2">
                                            <span className="text-xs font-bold text-gray-400 uppercase block">{label}</span>
                                            <div className={`w-full rounded-xl p-3 text-center font-black border ${grade ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]' : 'bg-[#0A0E14] border-white/10 text-gray-600'}`}>
                                                {grade || '—'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-gray-500 leading-relaxed">
                                    Kalite notları OYNA ekibi tarafından yerinde değerlendirilir ve yalnızca yönetim panelinden güncellenir. Değişiklik talebi için destek ekibiyle iletişime geçin.
                                </p>
                            </>
                        )}
                    </div>

                    <div className="bg-[#161B22] p-6 rounded-[24px] border border-white/5 space-y-4 shadow-sm">
                        <h3 className="text-sm font-black text-white italic uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Saha Fotoğrafları</h3>

                        {isRealFacility && editingPitch.id ? (
                            /* Kayıtlı kort: pitch_media hattı — sıkıştırma, kapak, etiket, sıralama (Karar #19) */
                            <PhotoManager
                                pitchId={facilityId!}
                                courtId={editingPitch.id}
                                onError={(m) => setSaveError(m)}
                            />
                        ) : isRealFacility ? (
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Fotoğraf eklemek için önce sahayı kaydedin; ardından düzenleyip fotoğraflarını yükleyin.
                            </p>
                        ) : (
                            /* Demo/mock tesiste yükleme yok: tüm fotoğraflar tek boru
                               hattından (pitch_media) geçer; base64 yolu kaldırıldı. */
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Fotoğraf yükleme yalnızca kayıtlı (gerçek) tesislerde kullanılabilir.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0A0E14] animate-in slide-in-from-right-8 duration-300">
            <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top shadow-lg z-10">
                <div className="flex items-center gap-3">
                    {showBack && (
                        <button onClick={onBack} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <h2 className="text-white font-bold text-lg">Sahalarım</h2>
                </div>
                <button
                    onClick={handleAddNew}
                    disabled={!facilityId || readOnly}
                    className="p-2 px-4 rounded-xl bg-blue-500 text-white font-bold text-xs flex items-center gap-2 hover:bg-blue-400 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-40"
                >
                    <Plus size={16} /> SAHA EKLE
                </button>
            </div>

            {/* FAZ1: saveError liste ekranında görünmüyordu — saha limiti/silme/geri-açma
                hataları sessizce yutuluyordu. Artık üstte dismissible banner. */}
            {saveError && (
                <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300 flex items-start justify-between gap-3">
                    <span className="flex items-start gap-2"><AlertCircle size={15} className="shrink-0 mt-0.5" /> {saveError}</span>
                    <button onClick={() => setSaveError(null)} className="text-red-400 shrink-0 p-1 -m-1" aria-label="Hatayı kapat"><X size={14} /></button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
                {pitches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-gray-600 mb-4">
                            <ImageIcon size={40} />
                        </div>
                        <h3 className="text-white font-bold text-lg mb-2">Henüz saha eklemediniz</h3>
                        <p className="text-gray-500 text-sm max-w-[250px] mb-6">Müşterilerinizin rezervasyon yapabilmesi için en az bir saha eklemelisiniz.</p>
                        <button
                            onClick={handleAddNew}
                            disabled={!facilityId || readOnly}
                            className="px-6 py-3 rounded-full bg-[#FACC15] text-black font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,0,0.2)] hover:bg-yellow-300 transition-all disabled:opacity-40"
                        >
                            <Plus size={18} /> YENİ SAHA OLUŞTUR
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pitches.filter((p) => p.is_active !== false).map((pitch) => (
                            <div key={pitch.id} className="bg-[#161B22] rounded-[24px] border border-white/5 overflow-hidden group hover:border-white/20 transition-all shadow-sm">
                                <div className="h-32 relative bg-black/20">
                                    {pitch.images && pitch.images.length > 0 ? (
                                        <img src={pitch.images[0]} className="w-full h-full object-cover animate-in fade-in duration-300" alt={pitch.name} />
                                    ) : (
                                        <button
                                            onClick={() => handleEdit(pitch)}
                                            className="w-full h-full flex flex-col items-center justify-center gap-1 bg-black/30 text-gray-500 hover:text-[#FACC15] transition-colors"
                                        >
                                            <Camera size={28} />
                                            <span className="text-[10px] font-black uppercase tracking-wider">Fotoğraf ekle</span>
                                        </button>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] via-[#161B22]/60 to-transparent"></div>
                                    <div className="absolute bottom-4 left-4 right-4">
                                        <h3 className="text-xl font-black text-white italic drop-shadow-md">{pitch.name}</h3>
                                        <p className="text-xs text-gray-300 font-medium">
                                            {pitch.court_type === 'CLOSED' ? 'Kapalı' : 'Açık'} • {SURFACE_LABELS[pitch.surface ?? 'TURF'] ?? pitch.surface}
                                            {pitch.size ? ` • ${pitch.size}` : ''}
                                            {pitch.price ? ` • ₺${pitch.price}/Saat` : ''}
                                        </p>
                                    </div>
                                </div>
                                <div className="p-4 flex gap-2">
                                    <button
                                        onClick={() => handleEdit(pitch)}
                                        className="flex-1 py-3 bg-white/5 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
                                    >
                                        <Edit3 size={16} /> DÜZENLE
                                    </button>
                                    <button
                                        onClick={() => handleDelete(pitch.id)}
                                        className="p-3 bg-red-500/10 text-red-400 font-bold text-xs rounded-xl flex items-center justify-center hover:bg-red-500/20 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pasif (silinmiş) sahalar — geri açılabilir (Karar #5) */}
                {!readOnly && inactiveCourts.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-3">Pasif Sahalar</h3>
                        <div className="space-y-2">
                            {inactiveCourts.map((court) => (
                                <div key={court.id} className="flex items-center justify-between bg-[#161B22]/60 border border-white/5 rounded-2xl p-4">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-300 truncate">{court.name}</p>
                                        <p className="text-[11px] text-gray-600">
                                            {court.court_type === 'CLOSED' ? 'Kapalı' : 'Açık'} • {SURFACE_LABELS[court.surface ?? 'TURF'] ?? court.surface} • Pasif
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleReactivate(court)}
                                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-black uppercase"
                                    >
                                        <RotateCcw size={13} /> Geri Aç
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {confirmElement}
        </div>
    );
};
