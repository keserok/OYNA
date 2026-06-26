import React, { useState } from 'react';
import { X, Save, Image, MapPin, DollarSign, Star, Zap } from 'lucide-react';
import { Pitch } from '../../../types';
import { motion, AnimatePresence } from 'framer-motion';

interface AddPitchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (pitch: Pitch) => void | Promise<void>;
}

export const AddPitchModal: React.FC<AddPitchModalProps> = ({ isOpen, onClose, onAdd }) => {
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [district, setDistrict] = useState('');
    const [location, setLocation] = useState('');
    const [pricePerPerson, setPricePerPerson] = useState('');
    const [totalPrice, setTotalPrice] = useState('');
    const [image, setImage] = useState('');
    const [lightingGrade, setLightingGrade] = useState<'A'|'B'|'C'>('B');
    const [grassGrade, setGrassGrade] = useState<'A'|'B'|'C'>('B');
    const [lockerRoomGrade, setLockerRoomGrade] = useState<'A'|'B'|'C'>('B');

    const handleSave = async () => {
        if (!name || !pricePerPerson || !totalPrice || saving) return;
        setSaving(true);
        const newPitch: Pitch = {
            id: crypto.randomUUID(),
            name,
            district: district || 'Bilinmiyor',
            location: location || 'Bilinmiyor',
            distance: '0 km',
            rating: 5.0,
            googleRating: 5.0,
            googleReviews: 0,
            pricePerPerson: Number(pricePerPerson),
            totalPrice: Number(totalPrice),
            image: image || 'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=800&q=80',
            images: [image || 'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=800&q=80'],
            amenities: ['Otopark', 'Kantin'],
            lighting: 100,
            grassQuality: 100,
            lockerRoomQuality: 100,
            goalQuality: 100,
            occupancy: 0,
            lightingGrade,
            grassGrade,
            lockerRoomGrade,
            coordinates: { lat: 40.9839, lng: 37.8764 },
            slots: []
        };

        try {
            await onAdd(newPitch);
            onClose();
            setName(''); setDistrict(''); setLocation(''); setPricePerPerson(''); setTotalPrice(''); setImage('');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                    onClick={onClose} 
                />
                
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="relative bg-[#0D1117] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-[0_0_50px_rgba(57,255,20,0.1)] overflow-hidden"
                >
                    {/* Glowing effect */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#39FF14] to-cyan-500"></div>

                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Zap size={18} className="text-[#39FF14]" /> YENİ SAHA EKLE
                        </h2>
                        <button onClick={onClose} className="p-1 text-gray-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-1">Saha Adı *</label>
                                <input value={name} onChange={e => setName(e.target.value)} type="text" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#39FF14]/50 transition-colors" placeholder="Örn: Aslantepe Tesisleri" />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-1">İlçe</label>
                                    <input value={district} onChange={e => setDistrict(e.target.value)} type="text" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#39FF14]/50 transition-colors" placeholder="Örn: Beşiktaş" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-1">Kişi Başı Fiyat *</label>
                                    <input value={pricePerPerson} onChange={e => setPricePerPerson(e.target.value)} type="number" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#39FF14]/50 transition-colors" placeholder="₺" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-1">Toplam Fiyat *</label>
                                <input value={totalPrice} onChange={e => setTotalPrice(e.target.value)} type="number" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#39FF14]/50 transition-colors" placeholder="₺" />
                            </div>

                            <div>
                                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-1">Görsel URL</label>
                                <input value={image} onChange={e => setImage(e.target.value)} type="text" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#39FF14]/50 transition-colors" placeholder="https://..." />
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-1">Zemin Sınıfı</label>
                                    <select value={grassGrade} onChange={e => setGrassGrade(e.target.value as any)} className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white focus:outline-none focus:border-[#39FF14]/50">
                                        <option value="A">A - Premium</option>
                                        <option value="B">B - Standart</option>
                                        <option value="C">C - Temel</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-1">Işıklandırma</label>
                                    <select value={lightingGrade} onChange={e => setLightingGrade(e.target.value as any)} className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white focus:outline-none focus:border-[#39FF14]/50">
                                        <option value="A">A - Premium</option>
                                        <option value="B">B - Standart</option>
                                        <option value="C">C - Temel</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-1">Soyunma Od.</label>
                                    <select value={lockerRoomGrade} onChange={e => setLockerRoomGrade(e.target.value as any)} className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white focus:outline-none focus:border-[#39FF14]/50">
                                        <option value="A">A - Premium</option>
                                        <option value="B">B - Standart</option>
                                        <option value="C">C - Temel</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-white/5 flex justify-end gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white transition-colors">İptal</button>
                        <button 
                            onClick={() => void handleSave()}
                            disabled={!name || !pricePerPerson || !totalPrice || saving}
                            className="flex items-center gap-2 px-5 py-2 bg-[#39FF14] text-black text-xs font-black uppercase tracking-widest rounded-xl hover:bg-[#39FF14]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(57,255,20,0.3)]"
                        >
                            <Save size={14} /> Kaydet
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
