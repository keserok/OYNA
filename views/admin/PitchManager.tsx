import React, { useState } from 'react';
import { ArrowLeft, Plus, Image as ImageIcon, Trash2, Edit3, Save, X } from 'lucide-react';
import { PitchCourt } from '../../types';
import { upsertCourt, deleteCourt, toTurkishError } from '../../services/pitchOwnerService';

interface PitchManagerProps {
    onBack: () => void;
    facilityId?: string;
    pitches: PitchCourt[];
    onUpdatePitches: (pitches: PitchCourt[]) => void;
    readOnly?: boolean;
    maxCourts?: number;
}

export const PitchManager: React.FC<PitchManagerProps> = ({
    onBack,
    facilityId,
    pitches,
    onUpdatePitches,
    readOnly = false,
    maxCourts = 5,
}) => {
    const [editingPitch, setEditingPitch] = useState<PitchCourt | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const isRealFacility = !!facilityId && !facilityId.startsWith('mock-');

    const handleEdit = (pitch: PitchCourt) => {
        if (readOnly) return;
        setEditingPitch({ ...pitch });
        setSaveError(null);
    };

    const handleAddNew = () => {
        if (readOnly) return;
        if (pitches.length >= maxCourts) {
            alert(`Mevcut planınız en fazla ${maxCourts} saha destekliyor.`);
            return;
        }
        const newPitch: PitchCourt = {
            id: '',
            pitch_id: facilityId ?? '',
            name: `Saha ${pitches.length + 1}`,
            court_type: 'TURF',
            size: null,
            is_active: true,
            sort_order: pitches.length,
        };
        setEditingPitch(newPitch);
        setSaveError(null);
    };

    const handleSave = async () => {
        if (readOnly || !editingPitch || !facilityId) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            if (isRealFacility) {
                const saved = await upsertCourt(facilityId, {
                    id: editingPitch.id || undefined,
                    name: editingPitch.name,
                    court_type: editingPitch.court_type,
                    size: editingPitch.size,
                    is_active: editingPitch.is_active,
                    sort_order: editingPitch.sort_order,
                });
                const exists = pitches.find((p) => p.id === saved.id);
                onUpdatePitches(
                    exists
                        ? pitches.map((p) => (p.id === saved.id ? saved : p))
                        : [...pitches, saved],
                );
            } else {
                const localId = editingPitch.id || Date.now().toString();
                const saved = { ...editingPitch, id: localId };
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
        if (!confirm('Bu sahayı silmek istediğinize emin misiniz?')) return;
        try {
            if (isRealFacility && id) {
                await deleteCourt(id);
            }
            onUpdatePitches(pitches.filter((p) => p.id !== id));
        } catch (err) {
            alert(toTurkishError(err));
        }
    };

    if (editingPitch) {
        return (
            <div className="flex flex-col h-full bg-[#0A0D14] animate-in slide-in-from-right-8 duration-300">
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
                        className="p-2 px-5 rounded-xl bg-[#FFFF00] text-black font-black text-xs flex items-center gap-2 hover:bg-yellow-300 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(255,255,0,0.3)]"
                    >
                        {isSaving ? '...' : <><Save size={16} /> KAYDET</>}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
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
                                className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors"
                                placeholder="Örn: Saha 1 (Kapalı)"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Zemin Tipi</label>
                                <select
                                    value={editingPitch.court_type || 'TURF'}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, court_type: e.target.value })}
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors appearance-none"
                                >
                                    <option value="TURF">Suni Çim</option>
                                    <option value="GRASS">Doğal Çim</option>
                                    <option value="INDOOR">Kapalı / Parke</option>
                                    <option value="TARTAN">Tartan</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Boyutlar</label>
                                <input
                                    type="text"
                                    value={editingPitch.size || ''}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, size: e.target.value })}
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors"
                                    placeholder="Örn: 30x50"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0A0D14] animate-in slide-in-from-right-8 duration-300">
            <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top shadow-lg z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
                        <ArrowLeft size={20} />
                    </button>
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
                            className="px-6 py-3 rounded-full bg-[#FFFF00] text-black font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,0,0.2)] hover:bg-yellow-300 transition-all disabled:opacity-40"
                        >
                            <Plus size={18} /> YENİ SAHA OLUŞTUR
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pitches.filter((p) => p.is_active !== false).map((pitch) => (
                            <div key={pitch.id} className="bg-[#161B22] rounded-[24px] border border-white/5 overflow-hidden group hover:border-white/20 transition-all shadow-sm">
                                <div className="h-32 relative bg-black/20 flex items-center justify-center">
                                    <ImageIcon size={40} className="text-gray-600" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] to-transparent"></div>
                                    <div className="absolute bottom-4 left-4 right-4">
                                        <h3 className="text-xl font-black text-white italic drop-shadow-md">{pitch.name}</h3>
                                        <p className="text-xs text-gray-300 font-medium">{pitch.size || 'Boyut belirtilmedi'} • {pitch.court_type || 'TURF'}</p>
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
            </div>
        </div>
    );
};
