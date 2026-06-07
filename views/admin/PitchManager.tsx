import React, { useState, useRef } from 'react';
import { ArrowLeft, Plus, Image as ImageIcon, Trash2, CheckCircle2, ChevronRight, Edit3, Settings, AlertCircle, Save, Camera, X } from 'lucide-react';
import { Pitch } from '../../types';

interface PitchManagerProps {
    onBack: () => void;
    facilityId?: string;
    pitches: Pitch[];
    onUpdatePitches: (pitches: Pitch[]) => void;
}

export const PitchManager: React.FC<PitchManagerProps> = ({ onBack, facilityId, pitches, onUpdatePitches }) => {
    const [editingPitch, setEditingPitch] = useState<Pitch | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleEdit = (pitch: Pitch) => {
        setEditingPitch({ ...pitch });
    };

    const handleAddNew = () => {
        const newPitch: Pitch = {
            id: Date.now().toString(),
            name: `Saha ${pitches.length + 1}`,
            district: '',
            location: '',
            distance: '',
            rating: 5,
            googleRating: 5,
            googleReviews: 0,
            pricePerPerson: 0,
            totalPrice: 0,
            image: '',
            images: [],
            description: '',
            amenities: [],
            lighting: 100,
            grassQuality: 100,
            lockerRoomQuality: 100,
            goalQuality: 100,
            occupancy: 0,
            coordinates: { lat: 0, lng: 0 },
            slots: [],
            surfaceType: 'SUNİ ÇİM',
            dimensions: '30x50'
        };
        setEditingPitch(newPitch);
    };

    const handleSave = () => {
        if (!editingPitch) return;
        setIsSaving(true);
        setTimeout(() => {
            const exists = pitches.find(p => p.id === editingPitch.id);
            let updated: Pitch[];
            if (exists) {
                updated = pitches.map(p => p.id === editingPitch.id ? editingPitch : p);
            } else {
                updated = [...pitches, editingPitch];
            }
            onUpdatePitches(updated);
            setEditingPitch(null);
            setIsSaving(false);
        }, 1000);
    };

    const handleDelete = (id: string) => {
        if (confirm('Bu sahayı silmek istediğinize emin misiniz?')) {
            onUpdatePitches(pitches.filter(p => p.id !== id));
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && editingPitch) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                setEditingPitch({
                    ...editingPitch,
                    images: [...(editingPitch.images || []), base64String],
                    image: editingPitch.image ? editingPitch.image : base64String // set as cover if first
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const setCoverImage = (imgUrl: string) => {
        if (editingPitch) {
            setEditingPitch({ ...editingPitch, image: imgUrl });
        }
    };

    const removeImage = (index: number) => {
        if (editingPitch) {
            const newImages = [...(editingPitch.images || [])];
            newImages.splice(index, 1);
            setEditingPitch({ 
                ...editingPitch, 
                images: newImages,
                image: editingPitch.image === editingPitch.images[index] ? (newImages[0] || '') : editingPitch.image
            });
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
                        <h2 className="text-white font-bold text-lg">{editingPitch.id.length > 5 ? 'Sahayı Düzenle' : 'Yeni Saha Ekle'}</h2>
                    </div>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="p-2 px-5 rounded-xl bg-[#FFFF00] text-black font-black text-xs flex items-center gap-2 hover:bg-yellow-300 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(255,255,0,0.3)]"
                    >
                        {isSaving ? '...' : <><Save size={16} /> KAYDET</>}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Basic Info */}
                    <div className="bg-[#161B22] p-6 rounded-[24px] border border-white/5 space-y-4 shadow-sm">
                        <h3 className="text-sm font-black text-white italic uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Genel Bilgiler</h3>
                        
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Saha Adı</label>
                            <input 
                                type="text" 
                                value={editingPitch.name}
                                onChange={e => setEditingPitch({...editingPitch, name: e.target.value})}
                                className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors"
                                placeholder="Örn: Saha 1 (Kapalı)"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Zemin Tipi</label>
                                <select 
                                    value={editingPitch.surfaceType || 'SUNİ ÇİM'}
                                    onChange={e => setEditingPitch({...editingPitch, surfaceType: e.target.value as any})}
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors appearance-none"
                                >
                                    <option value="SUNİ ÇİM">Suni Çim</option>
                                    <option value="DOĞAL ÇİM">Doğal Çim</option>
                                    <option value="PARKE">Parke</option>
                                    <option value="TARTAN">Tartan</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Boyutlar</label>
                                <input 
                                    type="text" 
                                    value={editingPitch.dimensions || ''}
                                    onChange={e => setEditingPitch({...editingPitch, dimensions: e.target.value})}
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors"
                                    placeholder="Örn: 30x50"
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Detaylı Açıklama</label>
                            <textarea 
                                value={editingPitch.description || ''}
                                onChange={e => setEditingPitch({...editingPitch, description: e.target.value})}
                                rows={4}
                                className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-medium text-sm focus:border-[#FFFF00]/50 outline-none transition-colors resize-none"
                                placeholder="Sahanın özellikleri, kuralları, sağlanan ekipmanlar vb."
                            />
                        </div>
                    </div>

                    {/* Photos */}
                    <div className="bg-[#161B22] p-6 rounded-[24px] border border-white/5 space-y-4 shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                            <h3 className="text-sm font-black text-white italic uppercase tracking-wider">Fotoğraflar</h3>
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="text-[#FFFF00] text-xs font-bold flex items-center gap-1 hover:text-yellow-300"
                            >
                                <Plus size={14} /> FOTOĞRAF EKLE
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleImageUpload} 
                                accept="image/*" 
                                className="hidden" 
                            />
                        </div>

                        {(!editingPitch.images || editingPitch.images.length === 0) ? (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full h-32 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-3 text-gray-500 hover:text-white hover:border-white/30 transition-colors cursor-pointer bg-black/20"
                            >
                                <Camera size={32} />
                                <span className="text-sm font-bold">İlk fotoğrafı eklemek için tıklayın</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                {editingPitch.images.map((img, idx) => (
                                    <div key={idx} className={`relative rounded-xl overflow-hidden aspect-video border-2 ${editingPitch.image === img ? 'border-[#FFFF00]' : 'border-white/10'} group`}>
                                        <img src={img} className="w-full h-full object-cover" alt={`Pitch ${idx}`} />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                            {editingPitch.image !== img && (
                                                <button 
                                                    onClick={() => setCoverImage(img)}
                                                    className="px-3 py-1.5 bg-[#FFFF00] text-black text-[10px] font-bold rounded-lg hover:bg-yellow-300"
                                                >
                                                    KAPAK YAP
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => removeImage(idx)}
                                                className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        {editingPitch.image === img && (
                                            <div className="absolute top-2 left-2 bg-[#FFFF00] text-black text-[10px] font-black px-2 py-1 rounded-md">
                                                KAPAK
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="text-[10px] text-gray-500 mt-2">
                            Sahanızın en iyi açılarından çekilmiş, aydınlık fotoğraflarını yükleyin. İlk fotoğraf kapak resmi olarak kullanılır.
                        </p>
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
                    className="p-2 px-4 rounded-xl bg-blue-500 text-white font-bold text-xs flex items-center gap-2 hover:bg-blue-400 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)]"
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
                            className="px-6 py-3 rounded-full bg-[#FFFF00] text-black font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,0,0.2)] hover:bg-yellow-300 transition-all"
                        >
                            <Plus size={18} /> YENİ SAHA OLUŞTUR
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pitches.map((pitch) => (
                            <div key={pitch.id} className="bg-[#161B22] rounded-[24px] border border-white/5 overflow-hidden group hover:border-white/20 transition-all shadow-sm">
                                <div className="h-40 relative bg-black/20">
                                    {pitch.image ? (
                                        <img src={pitch.image} alt={pitch.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                                            <ImageIcon size={40} />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] to-transparent"></div>
                                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                                        <div>
                                            <h3 className="text-xl font-black text-white italic drop-shadow-md">{pitch.name}</h3>
                                            <p className="text-xs text-gray-300 font-medium">{pitch.dimensions || 'Bilinmiyor'} • {pitch.surfaceType || 'Bilinmiyor'}</p>
                                        </div>
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
