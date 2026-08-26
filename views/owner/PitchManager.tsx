import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Image as ImageIcon, Trash2, Edit3, Save, BadgeCheck, Clock, RotateCcw, Camera, AlertCircle, X, Tag } from 'lucide-react';
import { PitchCourt } from '../../types';
import { formatTRYShort } from '../../utils/formatTRY';
import { upsertCourt, deleteCourt, getInactiveCourts, reactivateCourt, getCourtsTariffStatus, toTurkishError } from '../../services/pitchOwnerService';
import { approveCourtGrades } from '../../services/pitchContentService';
import { supabase } from '../../supabaseClient';
import PhotoManager from '../../components/pitch-editor/PhotoManager';
import { COURT_FEATURES, normalizeCourtFeatures } from '../../shared/courtFeatures';
import { SURFACE_LABELS, SURFACE_OPTIONS } from '../../shared/courtSurface';
import { formatCapacityRange } from '../../shared/pitchShowcaseMapper';
import { useConfirmSheet } from '../../views/owner/components/useConfirmSheet';
import { useBackDismiss } from '../../hooks/useBackDismiss';
import { canPublishCourt, COURT_TARIFF_REQUIRED_MESSAGE } from '../../shared/courtTariffGate';
import { OwnerPricingPolicyModal } from '../../views/owner/menu/OwnerPricingPolicyModal';

// Format aralığı: min/max_capacity TAKIM BAŞI oyuncu tutar ("6v6" → 6).
// DB CHECK kuralı 3–11 aralığını zorunlu kılar; rozetler formatCapacityRange ile üretilir.
const FORMAT_RANGE_OPTIONS = Array.from({ length: 9 }, (_, i) => i + 3); // 3v3..11v11

// PitchCourt tipinde bulunmayan (yalnız DB'de duran) kort rozeti alanı.
type CourtFormatExtras = {
    min_capacity?: number | null;
    max_capacity?: number | null;
    size_label?: string | null;
};

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
    /** Düzenlemeye GİRİŞTEKİ form anlık görüntüsü (editingPitch + editCaps, JSON) —
     *  geri çıkarken kirlilik denetiminin kıyas tabanı. */
    const editSnapshotRef = useRef<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    /** Düzenlenen kortun hiç fotoğrafı yok mu — uyarı bunu okur.
     *  PhotoManager listeyi ilk yüklediğinde de `onChanged` çağırdığı için
     *  değer kendiliğinden doğrulanır; başlangıçta uyarı gösterilmez ki
     *  yükleme sırasında yanıp sönmesin. */
    const [fotografYok, setFotografYok] = useState(false);
    const { confirm, confirmElement } = useConfirmSheet();
    const [inactiveCourts, setInactiveCourts] = useState<PitchCourt[]>([]);
    // SAHA BAZLI FİYAT POLİTİKASI (E1a/E5a/E12a): tesis geneli fiyatlandırma
    // ekranı kaldırıldı; her saha kendi tarifesini burada girer. courtId → o
    // sahanın KENDİ aktif tarife sayısı. Sunucu ikizi: courts_tariff_status.
    const [tariffCounts, setTariffCounts] = useState<Record<string, number>>({});
    const [pricingCourt, setPricingCourt] = useState<PitchCourt | null>(null);

    const isRealFacility = !!facilityId && !facilityId.startsWith('mock-');

    // Pasif (soft-delete) sahalar — "Geri Aç" için (Karar #5).
    const loadInactive = React.useCallback(() => {
        if (!isRealFacility || !facilityId) { setInactiveCourts([]); return; }
        getInactiveCourts(facilityId).then(setInactiveCourts).catch(() => setInactiveCourts([]));
    }, [isRealFacility, facilityId]);
    useEffect(() => { loadInactive(); }, [loadInactive, pitches.length]);

    // Tarife durumu — "bu saha için önce fiyat politikası gir" çağrısının kaynağı.
    const loadTariffCounts = React.useCallback(() => {
        if (!isRealFacility || !facilityId) { setTariffCounts({}); return; }
        getCourtsTariffStatus(facilityId)
            .then((rows) => setTariffCounts(Object.fromEntries(rows.map((r) => [r.courtId, r.ownTariffCount]))))
            .catch(() => setTariffCounts({}));
    }, [isRealFacility, facilityId]);
    useEffect(() => { loadTariffCounts(); }, [loadTariffCounts, pitches.length]);

    /** Bu sahanın KENDİ tarifesi var mı? Yayın kapısının arayüz ikizi. */
    const hasOwnTariff = React.useCallback(
        (courtId?: string | null) => !isRealFacility || (courtId ? (tariffCounts[courtId] ?? 0) > 0 : false),
        [isRealFacility, tariffCounts],
    );

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

    // Sahanın düzenlemeye GİRERKENKİ yayın durumu. Yayın kapısı yalnız
    // GEÇİŞTE (kapalı → yayında) çalışır; zaten yayında olan eski sahalar
    // tarifesi olmasa da kapanmaz (geriye dönük uyum — sunucu tarafı da aynı).
    const [wasActive, setWasActive] = useState(false);

    const handleEdit = (pitch: PitchCourt) => {
        if (readOnly) return;
        setWasActive(pitch.is_active !== false);
        const nextPitch = { ...pitch };
        setEditingPitch(nextPitch);
        // Mevcut kortun format aralığı + rozetiyle doldur (yoksa varsayılan 5v5–7v7).
        const ext = pitch as PitchCourt & CourtFormatExtras;
        const nextCaps = {
            min: ext.min_capacity ?? 5,
            max: ext.max_capacity ?? 7,
            sizeLabel: ext.size_label ?? '',
        };
        setEditCaps(nextCaps);
        editSnapshotRef.current = JSON.stringify({ pitch: nextPitch, caps: nextCaps });
        setSaveError(null);
    };

    const handleAddNew = () => {
        if (readOnly) return;
        if (pitches.length >= maxCourts) {
            setSaveError(`Mevcut planın en fazla ${maxCourts} saha destekliyor. Daha fazla saha için Menü → Faturalandırma'dan planını yükselt ya da destekle iletişime geç.`);
            return;
        }
        const newPitch: PitchCourt = {
            id: '',
            pitch_id: facilityId ?? '',
            name: `Saha ${pitches.length + 1}`,
            court_type: 'OPEN',
            surface: 'TURF',
            size: null,
            // TASLAK olarak açılır: tarife satırı ancak saha kaydedildikten sonra
            // girilebilir (court_id'ye ihtiyaç var). Sunucu da tarifesiz sahayı
            // yayına ALDIRMIYOR (trg_enforce_court_tariff_before_activate), bu
            // yüzden yeni saha doğrudan yayında başlayamaz.
            is_active: false,
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
        setWasActive(false);
        setEditingPitch(newPitch);
        const nextCaps = { min: 5, max: 7, sizeLabel: '' }; // yeni kort varsayılanı
        setEditCaps(nextCaps);
        editSnapshotRef.current = JSON.stringify({ pitch: newPitch, caps: nextCaps });
        setSaveError(null);
    };

    const handleSave = async () => {
        if (readOnly || !editingPitch || !facilityId) return;
        // Doğrulama: en küçük format en büyük formatı aşamaz.
        if (editCaps.min > editCaps.max) {
            setSaveError('En küçük format, en büyük formattan büyük olamaz. Aralığı gözden geçir.');
            return;
        }
        // YAYIN KAPISININ ARAYÜZ İKİZİ (shared/courtTariffGate — sunucu ikizi:
        // trg_enforce_court_tariff_before_activate). Sunucu da reddediyor;
        // burada durdurmak sahibe NE YAPACAĞINI söyler.
        const gate = canPublishCourt({
            wasActive,
            nextActive: editingPitch.is_active !== false,
            hasOwnTariff: hasOwnTariff(editingPitch.id),
        });
        if (!gate.allowed) {
            setSaveError(gate.reason ?? COURT_TARIFF_REQUIRED_MESSAGE);
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

    /** Form girişten beri değişti mi? (JSON kıyası, anlık görüntüye karşı.)
     *  Fotoğraflar bu hesaba GİRMEZ: PhotoManager fotoğrafları anında sunucuya
     *  işler (commit), yani geri çıkınca kaybolacak bir fotoğraf değişikliği olmaz. */
    const editorKirli =
        !!editingPitch &&
        JSON.stringify({ pitch: editingPitch, caps: editCaps }) !== editSnapshotRef.current;

    /** Geri oku + donanım geri tuşu: kirli formda önce "bırak?" onayı ister. */
    const korumaliKapat = async () => {
        if (editorKirli) {
            const ok = await confirm({
                title: 'Değişiklikleri bırak?',
                message: 'Kaydedilmemiş değişiklikler var. Çıkarsan bu değişiklikler kaybolur.',
                confirmLabel: 'Bırak',
                destructive: true,
            });
            if (!ok) return;
        }
        setEditingPitch(null);
    };

    // Editör açıkken donanım geri tuşu + Esc korumalı kapatmadan geçer
    // (async confirm'li kapatma void ile sarılır; hook senkron callback bekler).
    useBackDismiss(!!editingPitch, () => { void korumaliKapat(); }, 'saha-editoru', 0);

    /** Saha bazlı fiyat politikası ekranı — hem düzenleme hem liste görünümünde. */
    const pricingModal = pricingCourt && facilityId ? (
        <OwnerPricingPolicyModal
            facilityId={facilityId}
            courtId={pricingCourt.id}
            courtName={pricingCourt.name}
            readOnly={readOnly}
            onNotify={(message, variant) => {
                // Admin panelinde toast sağlayıcısı yok: hata görünür banner'a düşer.
                if (variant === 'error') setSaveError(message);
            }}
            onClose={() => { setPricingCourt(null); loadTariffCounts(); }}
            onSave={() => { loadTariffCounts(); }}
        />
    ) : null;

    if (editingPitch) {
        return (
            <div className="flex flex-col h-full bg-[#0A0E14] animate-in slide-in-from-right-8 duration-300">
                <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top shadow-lg z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => { void korumaliKapat(); }} aria-label="Geri" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <h2 className="text-white font-bold text-lg">{editingPitch.id ? 'Sahayı Düzenle' : 'Yeni Saha Ekle'}</h2>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !editingPitch.name.trim()}
                        className="p-2 px-5 rounded-xl bg-[#FACC15] text-black font-extrabold text-xs flex items-center gap-2 hover:bg-yellow-300 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(255,255,0,0.3)]"
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
                        <h3 className="text-sm font-extrabold text-white italic uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Genel Bilgiler</h3>

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
                                <span className="text-gray-500 font-extrabold">×</span>
                                <input
                                    type="number"
                                    value={editSize.l}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, size: composeSize(editSize.w, e.target.value) })}
                                    className="flex-1 bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors text-center"
                                    placeholder="Boy (50)"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Saatlik Ücret (₺)</label>
                                <input
                                    type="number"
                                    value={editingPitch.price || ''}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, price: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FACC15]/50 outline-none transition-colors"
                                    placeholder="Örn: 2000"
                                />
                                <p className="text-[10px] text-gray-600">
                                    Yalnız vitrindeki kaba etiket. Gerçek fiyat, süre ve kapora aşağıdaki
                                    <b> Aktif Saatler ve Ücretler</b> bölümünden gelir (tek kaynak).
                                </p>
                            </div>
                        </div>

                        {/* Format aralığı (TEK kaynak): vitrinde kort rozetini (6v6–8v8) üretir ve
                            maç oluştururken kort seçilince format listesi bu aralığa daralır. */}
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
                                    placeholder="7v7, Mini…"
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
                                placeholder="Sahanın özellikleri, kuralları veya ek detayları…"
                            />
                        </div>
                    </div>

                    {/* ── AKTİF SAATLER VE ÜCRETLER (saha bazlı) ───────────────────
                        Tesis geneli fiyatlandırma menüsü kaldırıldı: fiyat ve süre
                        politikası artık HER SAHA için burada tanımlanır (E1a: tarife
                        satırında, E5a: kortlar farklı süre alabilir). Sahip ve admin
                        aynı ekranı kullanır (A1a). */}
                    <div className="bg-[#161B22] p-6 rounded-[24px] border border-white/5 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-4">
                            <h3 className="text-sm font-extrabold text-white italic uppercase tracking-wider">Aktif Saatler ve Ücretler</h3>
                            {isRealFacility && editingPitch.id && (
                                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase border ${
                                    hasOwnTariff(editingPitch.id)
                                        ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]'
                                        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                }`}>
                                    <Tag size={12} />
                                    {hasOwnTariff(editingPitch.id)
                                        ? `${tariffCounts[editingPitch.id] ?? 0} tarife`
                                        : 'Tarife yok'}
                                </span>
                            )}
                        </div>

                        {!editingPitch.id ? (
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Fiyat politikası girmek için önce sahayı kaydedin. Saha kaydedildikten
                                sonra bu bölümden saat aralıklarını, süreyi (60/90/120 dk) ve ücreti
                                tanımlarsın.
                            </p>
                        ) : (
                            <>
                                {!hasOwnTariff(editingPitch.id) && (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                                        <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                        <p className="text-xs text-amber-200 leading-relaxed">
                                            <b>Bu saha için önce fiyat politikası gir.</b> Tarifesi olmayan saha
                                            yayına alınamaz ve uygulamadan rezervasyon kabul etmez.
                                        </p>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setPricingCourt(editingPitch)}
                                    disabled={readOnly || !isRealFacility}
                                    className="w-full py-3 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40"
                                >
                                    <Clock size={16} />
                                    {hasOwnTariff(editingPitch.id) ? 'Fiyat Politikasını Düzenle' : 'Fiyat Politikası Gir'}
                                </button>

                                {/* YAYIN ANAHTARI — tarifesiz sahada kapalı kalır. */}
                                <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/5">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-300">Yayında</p>
                                        <p className="text-[10px] text-gray-500 leading-relaxed">
                                            {editingPitch.is_active !== false
                                                ? 'Bu saha uygulamada görünüyor ve rezervasyon alabiliyor.'
                                                : 'Taslak — uygulamada görünmez, rezervasyon almaz.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={editingPitch.is_active !== false}
                                        aria-label="Sahayı yayına al"
                                        disabled={readOnly}
                                        onClick={() => {
                                            const next = editingPitch.is_active === false;
                                            const d = canPublishCourt({
                                                wasActive,
                                                nextActive: next,
                                                hasOwnTariff: hasOwnTariff(editingPitch.id),
                                            });
                                            if (!d.allowed) {
                                                setSaveError(d.reason ?? COURT_TARIFF_REQUIRED_MESSAGE);
                                                return;
                                            }
                                            setSaveError(null);
                                            setEditingPitch({ ...editingPitch, is_active: next });
                                        }}
                                        className={`shrink-0 w-14 h-8 rounded-full transition-colors relative disabled:opacity-40 ${
                                            editingPitch.is_active !== false ? 'bg-[#10B981]' : 'bg-white/10'
                                        }`}
                                    >
                                        <span
                                            className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${
                                                editingPitch.is_active !== false ? 'left-7' : 'left-1'
                                            }`}
                                        />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="bg-[#161B22] p-6 rounded-[24px] border border-white/5 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-4">
                            <h3 className="text-sm font-extrabold text-white italic uppercase tracking-wider">Kalite Standartları</h3>
                            {editingPitch.grades_status === 'pending' && (
                                isAdmin ? (
                                    <button
                                        type="button"
                                        onClick={handleApproveGrades}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-[10px] font-extrabold uppercase"
                                    >
                                        <BadgeCheck size={13} /> Notları Onayla
                                    </button>
                                ) : (
                                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-extrabold uppercase">
                                        <Clock size={12} /> Değerlendiriliyor
                                    </span>
                                )
                            )}
                            {editingPitch.grades_status === 'approved' && (editingPitch.lighting_grade || editingPitch.grass_grade) && (
                                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] text-[10px] font-extrabold uppercase">
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
                                        <option value="">Seç</option>
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
                                        <option value="">Seç</option>
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
                                        <option value="">Seç</option>
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
                                            <div className={`w-full rounded-xl p-3 text-center font-extrabold border ${grade ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]' : 'bg-[#0A0E14] border-white/10 text-gray-600'}`}>
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
                        <h3 className="text-sm font-extrabold text-white italic uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Saha Fotoğrafları</h3>

                        {isRealFacility && editingPitch.id ? (
                            /* Kayıtlı kort: pitch_media hattı — sıkıştırma, kapak, etiket, sıralama (Karar #19) */
                            <>
                                {/* FOTOĞRAF ZORUNLU (kullanıcı kararı: "fotoğrafsız
                                    tesis mümkün olmasın"). Kural kademeli uygulanır:
                                    kayıt engellenmez ama fotoğrafsız tesis oyuncu
                                    vitrininde LİSTELENMEZ (bkz. migration
                                    20260801135629). Uyarı burada durur ki sahibi
                                    neden görünmediğini tahmin etmek zorunda kalmasın. */}
                                {fotografYok && (
                                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-3.5">
                                        <p className="text-xs font-extrabold text-amber-300">Fotoğraf eksik — vitrinde görünmez</p>
                                        <p className="text-[11px] text-amber-200/70 mt-1 leading-relaxed">
                                            En az bir fotoğraf ekleyin. Fotoğrafsız tesisler oyuncu tarafındaki
                                            saha listesinde gösterilmez; fotoğraf eklediğinizde kendiliğinden geri gelir.
                                        </p>
                                    </div>
                                )}
                                <PhotoManager
                                    pitchId={facilityId!}
                                    courtId={editingPitch.id}
                                    onError={(m) => setSaveError(m)}
                                    onChanged={(urls) => setFotografYok(urls.length === 0)}
                                />
                            </>
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
                {pricingModal}
                {/* Onay sheet'i editör dalında da render edilmeli — yoksa geri
                    okundaki confirm() çağrılır ama sheet görünmez ve Promise
                    hiç çözülmezdi. */}
                {confirmElement}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0A0E14] animate-in slide-in-from-right-8 duration-300">
            <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top shadow-lg z-10">
                <div className="flex items-center gap-3">
                    {showBack && (
                        <button onClick={onBack} aria-label="Geri" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
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
                        <h3 className="text-white font-bold text-lg mb-2">Henüz saha eklemedin</h3>
                        <p className="text-gray-500 text-sm max-w-[250px] mb-6">Müşterilerinin rezervasyon yapabilmesi için en az bir saha eklemelisin.</p>
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
                                            <span className="text-[10px] font-extrabold uppercase tracking-wider">Fotoğraf ekle</span>
                                        </button>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] via-[#161B22]/60 to-transparent"></div>
                                    <div className="absolute bottom-4 left-4 right-4">
                                        <h3 className="text-xl font-extrabold text-white italic drop-shadow-md">{pitch.name}</h3>
                                        <p className="text-xs text-gray-300 font-medium">
                                            {pitch.court_type === 'CLOSED' ? 'Kapalı' : 'Açık'} • {SURFACE_LABELS[pitch.surface ?? 'TURF'] ?? pitch.surface}
                                            {pitch.size ? ` • ${pitch.size}` : ''}
                                            {(() => {
                                                // Format aralığı rozeti — vitrindeki kort satırıyla aynı yardımcı
                                                const r = formatCapacityRange(pitch.min_capacity, pitch.max_capacity, pitch.capacity);
                                                return r ? ` • ${r}` : '';
                                            })()}
                                            {pitch.price ? ` • ${formatTRYShort(pitch.price)}/Saat` : ''}
                                        </p>
                                    </div>
                                </div>
                                {/* Tarifesi olmayan yayındaki saha (eski kayıt): sessizce
                                    geçiştirilmez — sahibe ne yapacağı söylenir. */}
                                {isRealFacility && !hasOwnTariff(pitch.id) && (
                                    <button
                                        type="button"
                                        onClick={() => setPricingCourt(pitch)}
                                        className="w-full px-4 py-2.5 bg-amber-500/10 border-t border-amber-500/25 text-amber-300 text-[11px] font-bold flex items-center gap-2 text-left"
                                    >
                                        <AlertCircle size={14} className="shrink-0" />
                                        Bu saha için fiyat politikası girilmedi — gir
                                    </button>
                                )}
                                <div className="p-4 flex gap-2">
                                    <button
                                        onClick={() => handleEdit(pitch)}
                                        className="flex-1 py-3 bg-white/5 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
                                    >
                                        <Edit3 size={16} /> DÜZENLE
                                    </button>
                                    <button
                                        onClick={() => handleDelete(pitch.id)}
                                        aria-label="Sahayı sil"
                                        className="p-3 bg-red-500/10 text-red-400 font-bold text-xs rounded-xl flex items-center justify-center hover:bg-red-500/20 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Yayında olmayan sahalar: taslak (yeni eklenen, tarifesi henüz
                    girilmemiş) veya pasife alınmış (Karar #5). Tarifesi olmayanın
                    "Geri Aç" düğmesi yoktur — sunucu zaten reddeder; onun yerine
                    doğrudan fiyat politikası ekranına götürülür (sessiz hata YOK). */}
                {!readOnly && inactiveCourts.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Yayında Olmayan Sahalar</h3>
                        <div className="space-y-2">
                            {inactiveCourts.map((court) => {
                                const ready = hasOwnTariff(court.id);
                                return (
                                    <div key={court.id} className="flex items-center justify-between gap-3 bg-[#161B22]/60 border border-white/5 rounded-2xl p-4">
                                        <button
                                            type="button"
                                            onClick={() => handleEdit(court)}
                                            className="min-w-0 text-left flex-1"
                                        >
                                            <p className="text-sm font-bold text-gray-300 truncate">{court.name}</p>
                                            <p className="text-[11px] text-gray-600">
                                                {court.court_type === 'CLOSED' ? 'Kapalı' : 'Açık'} • {SURFACE_LABELS[court.surface ?? 'TURF'] ?? court.surface}
                                                {' • '}{ready ? 'Yayına hazır' : 'Tarife yok'}
                                            </p>
                                        </button>
                                        {ready ? (
                                            <button
                                                onClick={() => handleReactivate(court)}
                                                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-extrabold uppercase"
                                            >
                                                <RotateCcw size={13} /> Yayına Al
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => setPricingCourt(court)}
                                                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-extrabold uppercase"
                                            >
                                                <Tag size={13} /> Fiyat Politikası Gir
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
            {pricingModal}
            {confirmElement}
        </div>
    );
};
