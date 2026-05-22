import React, { useState, useCallback } from 'react';
import { Pitch, Goalkeeper, Referee, AdminUser } from '../../types';
import { useAppStore } from '../../store';
import * as FB from '../../firebaseMutations';
import { X, Save, Image as ImageIcon, UploadCloud, Loader2, Check, Wallet, Star, Shield, Phone, Mail, AlertTriangle, Plus, Zap } from 'lucide-react';
import { useImageUpload } from '../../hooks/useImageUpload';
import { motion, AnimatePresence } from 'framer-motion';

interface ModalProps { onClose: () => void; }

// ── Shared components ────────────────────────────────────────────────────────
const FI: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <div>
        <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">{label}</label>
        {children}
        {hint && <p className="text-[9px] text-gray-600 mt-1">{hint}</p>}
    </div>
);
const I: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (p) => (
    <input {...p} className={`w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-red-500/40 focus:outline-none transition-all ${p.className || ''}`} />
);
const Sel: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }> = ({ children, ...p }) => (
    <select {...p} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-red-500/40 focus:outline-none transition-all">
        {children}
    </select>
);
const Toggle: React.FC<{ label: string; desc?: string; value: boolean; onChange: () => void; danger?: boolean }> = ({ label, desc, value, onChange, danger }) => (
    <motion.div 
        onClick={onChange} 
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all gap-4 min-w-0 select-none ${danger ? 'border-red-900/30 bg-red-900/10 hover:bg-red-900/15' : 'border-white/5 bg-black/20 hover:bg-white/5'}`}
    >
        <div className="flex-1 min-w-0 pr-2">
            <p className={`text-sm font-bold truncate ${danger ? 'text-red-400' : 'text-white'}`}>{label}</p>
            {desc && <p className="text-[9px] text-gray-500 mt-0.5 truncate" title={desc}>{desc}</p>}
        </div>
        <div className={`w-11 h-6 rounded-full relative flex items-center transition-colors duration-300 flex-shrink-0 ${value ? (danger ? 'bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.3)]') : 'bg-white/10'}`}>
            <motion.div 
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="w-4 h-4 rounded-full bg-white shadow absolute left-1"
                style={{ transform: value ? 'translateX(20px)' : 'translateX(0px)' }}
            />
        </div>
    </motion.div>
);

// ── Photo Upload Zone ─────────────────────────────────────────────────────────
const PhotoUploadZone: React.FC<{ currentUrl: string; onChanged: (url: string) => void; folder: string; round?: boolean }> = ({ currentUrl, onChanged, folder, round }) => {
    const { uploadImage, uploading, progress } = useImageUpload(folder);
    return (
        <div className={`relative group border-2 border-dashed rounded-2xl transition-all overflow-hidden ${uploading ? 'border-red-500/50 bg-red-900/10' : 'border-white/10 bg-black/30 hover:border-white/25 hover:bg-black/50'}`}
            style={{ height: round ? 120 : 140 }}>
            {currentUrl && (
                <img src={currentUrl} className={`absolute inset-0 w-full h-full object-cover transition-opacity ${uploading ? 'opacity-30' : 'opacity-60 group-hover:opacity-80'}`} />
            )}
            <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer z-10">
                {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 size={22} className="text-red-400 animate-spin" />
                        <span className="text-xs font-black text-red-400">% {Math.round(progress)} Yükleniyor...</span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-1 text-center px-4">
                        <UploadCloud size={22} className={`transition-colors ${currentUrl ? 'text-white/60 group-hover:text-white' : 'text-gray-500 group-hover:text-red-400'}`} />
                        <span className={`text-[10px] font-bold transition-colors ${currentUrl ? 'text-white/60 group-hover:text-white' : 'text-gray-500 group-hover:text-gray-300'}`}>
                            {currentUrl ? 'Resmi Değiştir' : 'Fotoğraf Yükle'}
                        </span>
                    </div>
                )}
                <input type="file" className="hidden" accept="image/*" disabled={uploading}
                    onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) { const url = await uploadImage(file); if (url) onChanged(url); }
                    }} />
            </label>
        </div>
    );
};

// ── Success Toast ─────────────────────────────────────────────────────────────
const useToast = () => {
    const [msg, setMsg] = useState<string | null>(null);
    const showOk = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2200); }, []);
    const Toast = () => (
        <AnimatePresence>
            {msg && (
                <motion.div initial={{ opacity: 0, y: 20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0 }}
                    className="fixed bottom-6 left-1/2 z-[400] px-5 py-3 bg-green-900/90 border border-green-500/30 rounded-xl text-green-300 text-sm font-black backdrop-blur-sm flex items-center gap-2 shadow-2xl">
                    <Check size={14} /> {msg}
                </motion.div>
            )}
        </AnimatePresence>
    );
    return { showOk, Toast };
};

// ── Modal Shell ───────────────────────────────────────────────────────────────
const Shell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({ title, onClose, children, footer }) => (
    <motion.div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}>
        <motion.div className="bg-[#0D1117] border border-white/10 w-full max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh]"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#121820] rounded-t-3xl shrink-0">
                <h2 className="text-sm font-black text-white tracking-widest uppercase">{title}</h2>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-all"><X size={15} /></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">{children}</div>
            <div className="p-4 border-t border-white/10 bg-[#121820] rounded-b-3xl shrink-0">{footer}</div>
        </motion.div>
    </motion.div>
);

// ── Grade Picker ─────────────────────────────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
    A: 'bg-green-500/20 text-green-400 border-green-500/50 hover:bg-green-500/30',
    B: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 hover:bg-yellow-500/30',
    C: 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30',
};
const GRADE_ACTIVE: Record<string, string> = {
    A: 'bg-green-500 text-white border-green-400 shadow-[0_0_12px_rgba(34,197,94,0.5)]',
    B: 'bg-yellow-500 text-white border-yellow-400 shadow-[0_0_12px_rgba(234,179,8,0.5)]',
    C: 'bg-red-500 text-white border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.5)]',
};
const GradePicker: React.FC<{ label: string; desc?: string; value?: 'A' | 'B' | 'C'; onChange: (g: 'A' | 'B' | 'C') => void }> = ({ label, desc, value, onChange }) => (
    <div>
        <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">{label}</label>
        {desc && <p className="text-[9px] text-gray-600 mb-2">{desc}</p>}
        <div className="flex gap-2">
            {(['A', 'B', 'C'] as const).map(g => (
                <button key={g} onClick={() => onChange(g)}
                    className={`flex-1 h-10 rounded-xl font-black text-base border-2 transition-all ${
                        value === g ? GRADE_ACTIVE[g] : (GRADE_COLORS[g] + ' border-opacity-30')
                    }`}>
                    {g}
                </button>
            ))}
        </div>
        {value && (
            <p className="text-[9px] mt-1.5 font-mono text-gray-500">
                {value === 'A' ? '✅ Mükemmel' : value === 'B' ? '⚠️ Orta' : '❌ Yetersiz'}
            </p>
        )}
    </div>
);

// ═══════════════════════════════════════════════════════════════
// PITCH DEEP EDIT
// ═══════════════════════════════════════════════════════════════
export const DeepEditPitchModal: React.FC<ModalProps & { pitch: Pitch }> = ({ pitch, onClose }) => {
    const [edit, setEdit] = useState<Pitch>(pitch);
    const [saving, setSaving] = useState(false);
    const { showOk, Toast } = useToast();

    const handleSave = async () => {
        setSaving(true);
        await FB.fbUpdatePitch(edit);
        setSaving(false);
        showOk('✅ Saha Firebase\'e kaydedildi');
        setTimeout(onClose, 1000);
    };

    return (
        <AnimatePresence>
            <Shell title={`Saha Düzenle — ${pitch.name}`} onClose={onClose} footer={
                <div className="flex items-center justify-between">
                    <p className="text-[9px] text-gray-600 font-mono">ID: {pitch.id}</p>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all">İptal</button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-red-600 to-purple-700 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50 hover:opacity-90">
                            {saving ? <><Loader2 size={13} className="animate-spin" /> Kaydediliyor...</> : <><Save size={13} /> DEĞİŞİKLİKLERİ YAYINLA</>}
                        </button>
                    </div>
                </div>
            }>
                <Toast />
                {/* Photo */}
                <FI label="Saha Görseli">
                    <PhotoUploadZone currentUrl={edit.image} onChanged={url => setEdit({ ...edit, image: url })} folder="pitches" />
                    <I className="mt-2" placeholder="veya URL yapıştır..." value={edit.image} onChange={e => setEdit({ ...edit, image: e.target.value })} />
                </FI>

                {/* Identity */}
                <div className="grid grid-cols-2 gap-4">
                    <FI label="Saha Adı"><I value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></FI>
                    <FI label="Bölge / İlçe"><I value={edit.district || ''} onChange={e => setEdit({ ...edit, district: e.target.value })} /></FI>
                </div>
                <FI label="Tam Adres"><I value={edit.location} onChange={e => setEdit({ ...edit, location: e.target.value })} /></FI>

                {/* Pricing */}
                <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Wallet size={11} /> FİYATLANDIRMA</p>
                    <div className="grid grid-cols-2 gap-4">
                        <FI label="Kişi Başı Fiyat (₺)"><I type="number" value={edit.pricePerPerson} onChange={e => setEdit({ ...edit, pricePerPerson: +e.target.value })} className="text-red-400 font-mono" /></FI>
                        <FI label="Toplam Saha Fiyatı (₺)"><I type="number" value={edit.totalPrice} onChange={e => setEdit({ ...edit, totalPrice: +e.target.value })} className="text-red-400 font-mono" /></FI>
                    </div>
                    <button onClick={() => setEdit({ ...edit, totalPrice: edit.pricePerPerson * 14 })}
                        className="mt-2 text-[10px] text-purple-400 hover:text-purple-300 transition-colors font-bold">
                        ↻ Toplam Fiyatı Otomatik Hesapla (×14 oyuncu)
                    </button>
                </div>

                {/* Quality */}
                <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Star size={11} /> SAHA KALİTESİ (SAYISAL)</p>
                    <div className="grid grid-cols-3 gap-4">
                        <FI label="Rating (0-5)" hint="Yıldız puanı"><I type="number" step="0.1" min="0" max="5" value={edit.rating} onChange={e => setEdit({ ...edit, rating: +e.target.value })} /></FI>
                        <FI label="Zemin (0-100)" hint="Çim kalitesi"><I type="number" min="0" max="100" value={edit.grassQuality} onChange={e => setEdit({ ...edit, grassQuality: +e.target.value })} /></FI>
                        <FI label="Işıklandırma (0-100)" hint="Aydınlatma"><I type="number" min="0" max="100" value={edit.lighting} onChange={e => setEdit({ ...edit, lighting: +e.target.value })} /></FI>
                    </div>
                </div>

                {/* A/B/C Grades */}
                <div className="p-4 bg-black/30 rounded-2xl border border-purple-500/20">
                    <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Zap size={11} className="text-purple-400" /> A/B/C PUAN SİSTEMİ</p>
                    <div className="grid grid-cols-3 gap-4">
                        <GradePicker
                            label="Işıklandırma"
                            desc="LED/HID kalitesi ve kapsamı"
                            value={edit.lightingGrade}
                            onChange={g => setEdit({ ...edit, lightingGrade: g })}
                        />
                        <GradePicker
                            label="Zemin"
                            desc="Çim tipi, bakım durumu"
                            value={edit.grassGrade}
                            onChange={g => setEdit({ ...edit, grassGrade: g })}
                        />
                        <GradePicker
                            label="Soyunma Odası"
                            desc="Temizlik, duş, dolap"
                            value={edit.lockerRoomGrade}
                            onChange={g => setEdit({ ...edit, lockerRoomGrade: g })}
                        />
                    </div>
                </div>
            </Shell>
        </AnimatePresence>
    );
};

// ═══════════════════════════════════════════════════════════════
// ADD PITCH MODAL
// ═══════════════════════════════════════════════════════════════
export const AddPitchModal: React.FC<ModalProps> = ({ onClose }) => {
    const { addPitch } = useAppStore();
    const [saving, setSaving] = useState(false);
    const { showOk, Toast } = useToast();
    const [edit, setEdit] = useState<Partial<Pitch> & { name: string; location: string; district: string; totalPrice: number; pricePerPerson: number; rating: number; googleRating: number; googleReviews: number; lighting: number; grassQuality: number; lockerRoomQuality: number; goalQuality: number; occupancy: number; image: string }>(
        {
            name: '', location: '', district: 'Beşiktaş', totalPrice: 3000, pricePerPerson: 215,
            rating: 4.5, googleRating: 4.4, googleReviews: 0,
            lighting: 85, grassQuality: 85, lockerRoomQuality: 80, goalQuality: 82, occupancy: 70,
            image: '', images: [], amenities: [], distance: '1.0 km',
            lightingGrade: 'B', grassGrade: 'B', lockerRoomGrade: 'B',
            coordinates: { lat: 41.0445, lng: 29.005 },
            slots: []
        }
    );

    const handleSave = async () => {
        if (!edit.name || !edit.location) { showOk('⚠️ Saha adı ve adres zorunlu'); return; }
        setSaving(true);
        const newPitch: Pitch = {
            id: `pitch_${Date.now()}`,
            name: edit.name,
            location: edit.location,
            district: edit.district || 'Beşiktaş',
            distance: edit.distance || '1.0 km',
            rating: edit.rating,
            googleRating: edit.googleRating,
            googleReviews: edit.googleReviews,
            pricePerPerson: edit.pricePerPerson,
            totalPrice: edit.totalPrice,
            image: edit.image || 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1000',
            images: edit.images || [],
            amenities: edit.amenities || [],
            lighting: edit.lighting,
            grassQuality: edit.grassQuality,
            lockerRoomQuality: edit.lockerRoomQuality,
            goalQuality: edit.goalQuality,
            occupancy: edit.occupancy,
            lightingGrade: edit.lightingGrade,
            grassGrade: edit.grassGrade,
            lockerRoomGrade: edit.lockerRoomGrade,
            coordinates: edit.coordinates || { lat: 41.0445, lng: 29.005 },
            slots: [
                { time: '19:00', status: 'available' }, { time: '20:00', status: 'available' },
                { time: '21:00', status: 'available' }, { time: '22:00', status: 'available' }
            ]
        };
        addPitch(newPitch);
        setSaving(false);
        showOk('✅ Yeni saha eklendi!');
        setTimeout(onClose, 1200);
    };

    return (
        <AnimatePresence>
            <Shell title="Yeni Saha Ekle" onClose={onClose} footer={
                <div className="flex items-center justify-between">
                    <p className="text-[9px] text-gray-600 font-mono">Saha eklendikten sonra tüm kullanıcılara görünür olur</p>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all">İptal</button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-700 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50 hover:opacity-90">
                            {saving ? <><Loader2 size={13} className="animate-spin" /> Ekleniyor...</> : <><Plus size={13} /> SAHAY EKLE</>}
                        </button>
                    </div>
                </div>
            }>
                <Toast />

                {/* Photo */}
                <FI label="Saha Görseli">
                    <PhotoUploadZone currentUrl={edit.image} onChanged={url => setEdit({ ...edit, image: url })} folder="pitches" />
                    <I className="mt-2" placeholder="veya Unsplash/CDN URL yapıştır..." value={edit.image} onChange={e => setEdit({ ...edit, image: e.target.value })} />
                </FI>

                {/* Identity */}
                <div className="grid grid-cols-2 gap-4">
                    <FI label="Saha Adı *"><I placeholder="örn. Beşiktaş Arena" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></FI>
                    <FI label="İlçe"><I placeholder="örn. Beşiktaş" value={edit.district} onChange={e => setEdit({ ...edit, district: e.target.value })} /></FI>
                </div>
                <FI label="Tam Adres *"><I placeholder="örn. Barbaros Bulvarı, Beşiktaş/İstanbul" value={edit.location} onChange={e => setEdit({ ...edit, location: e.target.value })} /></FI>
                <div className="grid grid-cols-2 gap-4">
                    <FI label="Mesafe"><I placeholder="örn. 1.2 km" value={edit.distance} onChange={e => setEdit({ ...edit, distance: e.target.value })} /></FI>
                    <FI label="Google Değerlendirme Sayısı"><I type="number" value={edit.googleReviews} onChange={e => setEdit({ ...edit, googleReviews: +e.target.value })} /></FI>
                </div>

                {/* Pricing */}
                <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Wallet size={11} /> FİYATLANDIRMA</p>
                    <div className="grid grid-cols-2 gap-4">
                        <FI label="Kişi Başı Fiyat (₺)"><I type="number" value={edit.pricePerPerson} onChange={e => setEdit({ ...edit, pricePerPerson: +e.target.value })} className="text-red-400 font-mono" /></FI>
                        <FI label="Toplam Saha Fiyatı (₺)"><I type="number" value={edit.totalPrice} onChange={e => setEdit({ ...edit, totalPrice: +e.target.value })} className="text-red-400 font-mono" /></FI>
                    </div>
                </div>

                {/* A/B/C Grades */}
                <div className="p-4 bg-black/30 rounded-2xl border border-purple-500/20">
                    <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Zap size={11} className="text-purple-400" /> A/B/C PUAN SİSTEMİ</p>
                    <div className="grid grid-cols-3 gap-4">
                        <GradePicker label="Işıklandırma" desc="LED/HID kalitesi ve kapsamı" value={edit.lightingGrade} onChange={g => setEdit({ ...edit, lightingGrade: g })} />
                        <GradePicker label="Zemin" desc="Çim tipi, bakım durumu" value={edit.grassGrade} onChange={g => setEdit({ ...edit, grassGrade: g })} />
                        <GradePicker label="Soyunma Odası" desc="Temizlik, duş, dolap" value={edit.lockerRoomGrade} onChange={g => setEdit({ ...edit, lockerRoomGrade: g })} />
                    </div>
                </div>

                {/* Numeric quality */}
                <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Star size={11} /> KALİTE PUANLARI (0-100)</p>
                    <div className="grid grid-cols-2 gap-4">
                        <FI label="Işıklandırma"><I type="number" min="0" max="100" value={edit.lighting} onChange={e => setEdit({ ...edit, lighting: +e.target.value })} /></FI>
                        <FI label="Zemin"><I type="number" min="0" max="100" value={edit.grassQuality} onChange={e => setEdit({ ...edit, grassQuality: +e.target.value })} /></FI>
                        <FI label="Soyunma Odası"><I type="number" min="0" max="100" value={edit.lockerRoomQuality} onChange={e => setEdit({ ...edit, lockerRoomQuality: +e.target.value })} /></FI>
                        <FI label="Kale Kalitesi"><I type="number" min="0" max="100" value={edit.goalQuality} onChange={e => setEdit({ ...edit, goalQuality: +e.target.value })} /></FI>
                    </div>
                </div>
            </Shell>
        </AnimatePresence>
    );
};

// ═══════════════════════════════════════════════════════════════
// USER DEEP EDIT
// ═══════════════════════════════════════════════════════════════
export const DeepEditUserModal: React.FC<ModalProps & { user: AdminUser }> = ({ user, onClose }) => {
    const [edit, setEdit] = useState<AdminUser>(user);
    const [saving, setSaving] = useState(false);
    const { showOk, Toast } = useToast();

    const handleSave = async () => {
        setSaving(true);
        await FB.fbUpdateUser(edit);
        setSaving(false);
        showOk('✅ Kullanıcı Firebase\'e kaydedildi');
        setTimeout(onClose, 1000);
    };

    return (
        <AnimatePresence>
            <Shell title={`Kullanıcı Düzenle — ${user.name}`} onClose={onClose} footer={
                <div className="flex items-center justify-between">
                    <p className="text-[9px] text-gray-600 font-mono">ID: {user.id}</p>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all">İptal</button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-red-600 to-purple-700 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50 hover:opacity-90">
                            {saving ? <><Loader2 size={13} className="animate-spin" /> Kaydediliyor...</> : <><Save size={13} /> GÜNCELLE</>}
                        </button>
                    </div>
                </div>
            }>
                <Toast />
                {/* Avatar */}
                <div className="flex gap-4 items-start">
                    <PhotoUploadZone currentUrl={edit.avatar} onChanged={url => setEdit({ ...edit, avatar: url })} folder="users" round />
                    <div className="flex-1 space-y-3">
                        <FI label="Avatar URL">
                            <I value={edit.avatar} onChange={e => setEdit({ ...edit, avatar: e.target.value })} placeholder="https://..." />
                        </FI>
                        <FI label="İsim Soyisim">
                            <I value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
                        </FI>
                    </div>
                </div>

                {/* Contact */}
                <div className="grid grid-cols-2 gap-4">
                    <FI label="E-posta"><I value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} /></FI>
                    <FI label="Telefon"><I value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></FI>
                </div>

                {/* Stats */}
                <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Star size={11} /> OYUNCU İSTATİSTİKLERİ</p>
                    <div className="grid grid-cols-3 gap-4">
                        <FI label="Rating (0-5)"><I type="number" step="0.1" min="0" max="5" value={edit.rating} onChange={e => setEdit({ ...edit, rating: +e.target.value })} /></FI>
                        <FI label="Maç Sayısı"><I type="number" value={edit.matchCount} onChange={e => setEdit({ ...edit, matchCount: +e.target.value })} /></FI>
                        <FI label="Katılım Tarihi"><I value={edit.joinDate} onChange={e => setEdit({ ...edit, joinDate: e.target.value })} /></FI>
                    </div>
                </div>

                {/* Wallet */}
                <div className="p-4 bg-black/30 rounded-2xl border border-yellow-500/20">
                    <p className="text-[9px] font-black text-yellow-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Wallet size={11} /> CÜZDAN KONTROLÜ</p>
                    <div className="grid grid-cols-2 gap-4 items-end">
                        <FI label="Cüzdan Bakiyesi (₺)">
                            <I type="number" value={edit.wallet} onChange={e => setEdit({ ...edit, wallet: +e.target.value })} className="text-yellow-400 font-mono text-lg" />
                        </FI>
                        <div className="flex gap-2">
                            <button onClick={() => setEdit(prev => ({ ...prev, wallet: prev.wallet + 100 }))} className="flex-1 h-11 bg-green-500/15 text-green-400 border border-green-500/20 rounded-xl text-xs font-black hover:bg-green-500/25 transition-all">+₺100</button>
                            <button onClick={() => setEdit(prev => ({ ...prev, wallet: prev.wallet + 500 }))} className="flex-1 h-11 bg-green-500/15 text-green-400 border border-green-500/20 rounded-xl text-xs font-black hover:bg-green-500/25 transition-all">+₺500</button>
                            <button onClick={() => setEdit(prev => ({ ...prev, wallet: 0 }))} className="flex-1 h-11 bg-red-500/15 text-red-400 border border-red-500/20 rounded-xl text-xs font-black hover:bg-red-500/25 transition-all">SIFIRLA</button>
                        </div>
                    </div>
                </div>

                {/* Status toggles */}
                <div className="space-y-2">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Shield size={11} /> HESAP DURUMLARI</p>
                    <Toggle label="PRO Üyelik" desc="Özel maçlar ve indirimler" value={edit.isPro} onChange={() => setEdit(prev => ({ ...prev, isPro: !prev.isPro }))} />
                    <Toggle label="Doğrulanmış Hesap" desc="Mavi tik göster" value={edit.isVerified} onChange={() => setEdit(prev => ({ ...prev, isVerified: !prev.isVerified }))} />
                    <Toggle label="Hesabı Banla" desc="Kullanıcı sisteme giremez, aktif rezervasyonları iptal edilir" value={edit.isBanned} onChange={() => setEdit(prev => ({ ...prev, isBanned: !prev.isBanned }))} danger />
                </div>
            </Shell>
        </AnimatePresence>
    );
};

// ═══════════════════════════════════════════════════════════════
// GOALKEEPER / REFEREE DEEP EDIT
// ═══════════════════════════════════════════════════════════════
export const DeepEditProviderModal: React.FC<ModalProps & { item: Goalkeeper | Referee; typeParam: 'GK' | 'REF' }> = ({ item, typeParam, onClose }) => {
    const [edit, setEdit] = useState<any>(item);
    const [saving, setSaving] = useState(false);
    const { showOk, Toast } = useToast();

    const label = typeParam === 'GK' ? 'KALECİ' : 'HAKEM';

    const handleSave = async () => {
        setSaving(true);
        if (typeParam === 'GK') await FB.fbUpdateGoalkeeper(edit);
        else await FB.fbUpdateReferee(edit);
        setSaving(false);
        showOk(`✅ ${item.name} Firebase'e kaydedildi`);
        setTimeout(onClose, 1000);
    };

    return (
        <AnimatePresence>
            <Shell title={`${label} Düzenle — ${item.name}`} onClose={onClose} footer={
                <div className="flex items-center justify-between">
                    <p className="text-[9px] text-gray-600 font-mono">ID: {item.id} | {label}</p>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all">İptal</button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-red-600 to-purple-700 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50 hover:opacity-90">
                            {saving ? <><Loader2 size={13} className="animate-spin" /> Kaydediliyor...</> : <><Save size={13} /> DEĞİŞİKLİKLERİ YAYINLA</>}
                        </button>
                    </div>
                </div>
            }>
                <Toast />
                {/* Avatar */}
                <div className="flex gap-4 items-start">
                    <PhotoUploadZone currentUrl={edit.avatar} onChanged={url => setEdit({ ...edit, avatar: url })} folder="providers" round />
                    <div className="flex-1 space-y-3">
                        <FI label="Profil Görseli URL">
                            <I value={edit.avatar} onChange={e => setEdit({ ...edit, avatar: e.target.value })} />
                        </FI>
                        <FI label="İsim Soyisim">
                            <I value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
                        </FI>
                    </div>
                </div>

                {/* Pricing & Rating */}
                <div className="p-4 bg-black/30 rounded-2xl border border-green-500/20">
                    <p className="text-[9px] font-black text-green-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Wallet size={11} /> ÜCRET & PERFORMANS</p>
                    <div className="grid grid-cols-2 gap-4">
                        <FI label="Maç Başı Ücret (₺)" hint="Net gelir">
                            <I type="number" value={edit.fee} onChange={e => setEdit({ ...edit, fee: +e.target.value })} className="text-green-400 font-mono" />
                        </FI>
                        <FI label="Rating (0-5)" hint="Kullanıcı değerlendirmesi">
                            <I type="number" step="0.1" min="0" max="5" value={edit.rating} onChange={e => setEdit({ ...edit, rating: +e.target.value })} />
                        </FI>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        {typeParam === 'GK' && (
                            <FI label="Oyun Stili">
                                <Sel value={edit.style || ''} onChange={e => setEdit({ ...edit, style: e.target.value })}>
                                    <option>Sweeper</option>
                                    <option>Shot-Stopper</option>
                                    <option>Pençe</option>
                                    <option>Komutan</option>
                                </Sel>
                            </FI>
                        )}
                        {typeParam === 'REF' && (
                            <FI label="Deneyim Seviyesi">
                                <Sel value={edit.level || ''} onChange={e => setEdit({ ...edit, level: e.target.value })}>
                                    <option>Başlangıç</option>
                                    <option>Orta Seviye</option>
                                    <option>İleri Seviye</option>
                                    <option>Profesyonel</option>
                                </Sel>
                            </FI>
                        )}
                        <FI label="Tamamlanan Maç">
                            <I type="number" value={edit.matchCount || 0} onChange={e => setEdit({ ...edit, matchCount: +e.target.value })} />
                        </FI>
                    </div>
                </div>

                {/* Status */}
                <div className="space-y-2">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">STATÜ</p>
                    <Toggle label="ELITE Statüsü" desc="Altın rozet göster, listedeki sıralamasını yükselt" value={!!edit.isElite} onChange={() => setEdit((prev: any) => ({ ...prev, isElite: !prev.isElite }))} />
                    <Toggle label="Doğrulanmış" desc="Profil doğrulama rozeti" value={!!edit.isVerified} onChange={() => setEdit((prev: any) => ({ ...prev, isVerified: !prev.isVerified }))} />
                    <Toggle label="Müsaitlik Durdur" desc="Bu kişiyi geçici olarak listeden kaldır" value={!!edit.isSuspended} onChange={() => setEdit((prev: any) => ({ ...prev, isSuspended: !prev.isSuspended }))} danger />
                </div>
            </Shell>
        </AnimatePresence>
    );
};
