import React, { useState } from 'react';
import { ArrowLeft, Plus, Image as ImageIcon, Trash2, Edit3, Save, X, ImagePlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { PitchCourt } from '../../types';
import { upsertCourt, deleteCourt, toTurkishError } from '../../services/pitchOwnerService';
import { useImageUpload } from '../../hooks/useImageUpload';

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
    const { uploadImage, uploading } = useImageUpload('courts');
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleEdit = (pitch: PitchCourt) => {
        if (readOnly) return;
        setEditingPitch({ ...pitch });
        setSaveError(null);
    };

    const handleAddNew = () => {
        if (readOnly) return;
        if (pitches.length >= maxCourts) {
            setSaveError(`Mevcut planınız en fazla ${maxCourts} saha destekliyor.`);
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
            price: null,
            capacity: 14,
            images: [],
            description: '',
            lighting_grade: null,
            grass_grade: null,
            locker_grade: null,
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
                    price: editingPitch.price,
                    capacity: editingPitch.capacity,
                    images: editingPitch.images,
                    description: editingPitch.description,
                    lighting_grade: editingPitch.lighting_grade,
                    grass_grade: editingPitch.grass_grade,
                    locker_grade: editingPitch.locker_grade,
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
            setSaveError(toTurkishError(err));
        }
    };

    const handleAddImageClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !editingPitch) return;
        const files = Array.from(e.target.files);
        let updatedImages = [...(editingPitch.images || [])];
        
        for (const file of files) {
            if (isRealFacility) {
                try {
                    const url = await uploadImage(file);
                    updatedImages.push(url);
                } catch (err) {
                    setSaveError('Yükleme hatası: ' + (err instanceof Error ? err.message : String(err)));
                }
            } else {
                const reader = new FileReader();
                const dataUrlPromise = new Promise<string>((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                });
                reader.readAsDataURL(file);
                const dataUrl = await dataUrlPromise;
                updatedImages.push(dataUrl);
            }
        }
        setEditingPitch({ ...editingPitch, images: updatedImages });
    };

    const removeImage = (index: number) => {
        if (!editingPitch) return;
        const updatedImages = (editingPitch.images || []).filter((_, i) => i !== index);
        setEditingPitch({ ...editingPitch, images: updatedImages });
    };

    const moveImage = (index: number, direction: 'left' | 'right') => {
        if (!editingPitch || !editingPitch.images) return;
        const newIndex = direction === 'left' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= editingPitch.images.length) return;
        
        const newArray = [...editingPitch.images];
        const temp = newArray[index];
        newArray[index] = newArray[newIndex];
        newArray[newIndex] = temp;
        setEditingPitch({ ...editingPitch, images: newArray });
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
                        disabled={isSaving || !editingPitch.name.trim() || uploading}
                        className="p-2 px-5 rounded-xl bg-[#FFFF00] text-black font-black text-xs flex items-center gap-2 hover:bg-yellow-300 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(255,255,0,0.3)]"
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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Saatlik Ücret (₺)</label>
                                <input
                                    type="number"
                                    value={editingPitch.price || ''}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, price: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors"
                                    placeholder="Örn: 2000"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Kapasite (Oyuncu Sayısı)</label>
                                <input
                                    type="number"
                                    value={editingPitch.capacity || ''}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, capacity: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors"
                                    placeholder="Örn: 14"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Açıklama</label>
                            <textarea
                                value={editingPitch.description || ''}
                                onChange={(e) => setEditingPitch({ ...editingPitch, description: e.target.value })}
                                className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors h-24 resize-none"
                                placeholder="Sahanın özellikleri, kuralları veya ek detayları..."
                            />
                        </div>
                    </div>

                    <div className="bg-[#161B22] p-6 rounded-[24px] border border-white/5 space-y-4 shadow-sm">
                        <h3 className="text-sm font-black text-white italic uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Kalite Standartları</h3>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Işıklandırma</label>
                                <select
                                    value={editingPitch.lighting_grade || ''}
                                    onChange={(e) => setEditingPitch({ ...editingPitch, lighting_grade: e.target.value || null })}
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors appearance-none"
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
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors appearance-none"
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
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors appearance-none"
                                >
                                    <option value="">Seçiniz</option>
                                    <option value="A+">A+ Çok İyi</option>
                                    <option value="A">A İyi</option>
                                    <option value="B">B Standart</option>
                                    <option value="C">C Zayıf</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#161B22] p-6 rounded-[24px] border border-white/5 space-y-4 shadow-sm">
                        <h3 className="text-sm font-black text-white italic uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Saha Fotoğrafları</h3>
                        
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            className="hidden" 
                            accept="image/*"
                            multiple
                        />

                        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
                            <button 
                                type="button"
                                onClick={handleAddImageClick}
                                disabled={uploading}
                                className="shrink-0 w-32 h-40 bg-[#0A0D14] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-white hover:border-white/30 transition-all snap-start"
                            >
                                <ImagePlus size={24} />
                                <span className="text-[10px] font-bold">{uploading ? 'YÜKLENİYOR...' : 'FOTOĞRAF EKLE'}</span>
                            </button>

                            {(editingPitch.images || []).map((img, idx) => (
                                <div 
                                    key={idx} 
                                    className="shrink-0 w-64 h-40 relative rounded-2xl overflow-hidden group snap-center border border-white/5"
                                >
                                    <img src={img} className="w-full h-full object-cover" alt={`Saha Görseli ${idx}`} />
                                    
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                                        <div className="flex justify-between w-full">
                                            <div className="flex gap-1">
                                                {idx > 0 && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => moveImage(idx, 'left')}
                                                        className="p-1.5 bg-black/50 hover:bg-black/80 rounded-lg text-white transition-colors"
                                                    >
                                                        <ChevronLeft size={16} />
                                                    </button>
                                                )}
                                                {idx < (editingPitch.images?.length || 0) - 1 && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => moveImage(idx, 'right')}
                                                        className="p-1.5 bg-black/50 hover:bg-black/80 rounded-lg text-white transition-colors"
                                                    >
                                                        <ChevronRight size={16} />
                                                    </button>
                                                )}
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => removeImage(idx)}
                                                className="p-1.5 bg-red-500/20 hover:bg-red-500 rounded-lg text-red-400 hover:text-white transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
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
                                <div className="h-32 relative bg-black/20">
                                    {pitch.images && pitch.images.length > 0 ? (
                                        <img src={pitch.images[0]} className="w-full h-full object-cover animate-in fade-in duration-300" alt={pitch.name} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-black/30 text-gray-600">
                                            <ImageIcon size={40} />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] via-[#161B22]/60 to-transparent"></div>
                                    <div className="absolute bottom-4 left-4 right-4">
                                        <h3 className="text-xl font-black text-white italic drop-shadow-md">{pitch.name}</h3>
                                        <p className="text-xs text-gray-300 font-medium">
                                            {pitch.size || 'Boyut belirtilmedi'} • {pitch.court_type || 'TURF'}
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
            </div>
        </div>
    );
};
