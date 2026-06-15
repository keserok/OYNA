import React, { useState, useCallback } from 'react';
import { Pitch, Goalkeeper, Referee, AdminUser, UserRole } from '../../types';
import { useAppStore } from '../../store';
import * as FB from '../../supabaseMutations';
import { X, Save, Image as ImageIcon, UploadCloud, Loader2, Check, Wallet, Star, Shield, Phone, Mail, AlertTriangle, Plus, Zap, MapPin, Clock } from 'lucide-react';
import { useImageUpload } from '../../hooks/useImageUpload';
import { motion, AnimatePresence } from 'framer-motion';
import { FifaCard } from '../../components/FifaCard';

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
        <motion.div className="bg-[#0D1117] border border-white/10 w-full max-w-4xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[95vh]"
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
                    className={`flex-1 h-10 rounded-xl font-black text-xs border-2 transition-all ${
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
    const [activeTab, setActiveTab] = useState<'general' | 'amenities' | 'pricing_hours' | 'courts' | 'slots'>('general');
    const { showOk, Toast } = useToast();
    const adminUsers = useAppStore(state => state.adminUsers);
    const owners = adminUsers.filter(u => u.role === UserRole.OWNER);

    const handleSave = async () => {
        setSaving(true);
        try {
            await FB.fbUpdatePitch(edit);
            showOk('✅ Saha başarıyla güncellendi');
            setTimeout(onClose, 1000);
        } catch (e: any) {
            alert('Hata: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const AMENITIES_LIST = ["Duş", "Otopark", "Kafe", "WiFi", "Kamera Kaydı", "Krampon Kiralama", "Büfe", "Mescit"];

    const toggleAmenity = (a: string) => {
        const current = edit.amenities || [];
        if (current.includes(a)) {
            setEdit({ ...edit, amenities: current.filter(x => x !== a) });
        } else {
            setEdit({ ...edit, amenities: [...current, a] });
        }
    };

    const tabs = [
        { id: 'general', label: 'Genel Bilgiler' },
        { id: 'amenities', label: 'Olanaklar' },
        { id: 'pricing_hours', label: 'Saatler & Ücretler' },
        { id: 'courts', label: 'Alt Sahalar' },
        { id: 'slots', label: 'Slot Matrisi' }
    ] as const;

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

                {/* Tabs Header */}
                <div className="flex overflow-x-auto gap-2 border-b border-white/10 pb-2 mb-4 custom-scrollbar">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                                activeTab === t.id 
                                ? 'bg-red-500/20 text-red-400 border border-red-500/50' 
                                : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="space-y-5">
                    {activeTab === 'general' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                            <FI label="Saha Görseli">
                                <PhotoUploadZone currentUrl={edit.image} onChanged={url => setEdit({ ...edit, image: url })} folder="pitches" />
                            </FI>
                            <div className="grid grid-cols-2 gap-4">
                                <FI label="Saha Adı"><I value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></FI>
                                <FI label="Saha Sahibi (Owner)">
                                    <Sel value={edit.ownerId || ''} onChange={e => setEdit({ ...edit, ownerId: e.target.value })}>
                                        <option value="">-- Sahipsiz --</option>
                                        {owners.map(o => (
                                            <option key={o.id} value={o.id}>{o.name} ({o.email})</option>
                                        ))}
                                    </Sel>
                                </FI>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FI label="Tam Adres"><I value={edit.location} onChange={e => setEdit({ ...edit, location: e.target.value })} /></FI>
                                <FI label="Bölge / İlçe"><I value={edit.district || ''} onChange={e => setEdit({ ...edit, district: e.target.value })} /></FI>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FI label="Enlem (Lat)"><I type="number" step="0.000001" value={edit.coordinates?.lat || 41.0} onChange={e => setEdit({ ...edit, coordinates: { lat: +e.target.value, lng: edit.coordinates?.lng || 29.0 } })} /></FI>
                                <FI label="Boylam (Lng)"><I type="number" step="0.000001" value={edit.coordinates?.lng || 29.0} onChange={e => setEdit({ ...edit, coordinates: { lat: edit.coordinates?.lat || 41.0, lng: +e.target.value } })} /></FI>
                            </div>
                            <Toggle label="Saha Aktif mi? (Approved)" value={!!edit.isApproved} onChange={() => setEdit({ ...edit, isApproved: !edit.isApproved })} />
                        </motion.div>
                    )}

                    {activeTab === 'amenities' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {AMENITIES_LIST.map(a => {
                                const active = (edit.amenities || []).includes(a);
                                return (
                                    <div key={a} onClick={() => toggleAmenity(a)} className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${active ? 'bg-green-500/10 border-green-500/50' : 'bg-black/30 border-white/10 hover:bg-white/5'}`}>
                                        <span className={`text-xs font-bold ${active ? 'text-green-400' : 'text-gray-300'}`}>{a}</span>
                                        <div className={`w-4 h-4 rounded-full border ${active ? 'bg-green-400 border-green-400' : 'border-gray-500'}`} />
                                    </div>
                                );
                            })}
                        </motion.div>
                    )}

                    {activeTab === 'pricing_hours' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                            <div className="p-4 bg-black/30 rounded-2xl border border-white/5 space-y-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest"><Clock size={11} className="inline mr-1" /> Çalışma Saatleri</p>
                                <div className="grid grid-cols-3 gap-4">
                                    <FI label="Açılış"><I type="time" value={edit.workingHours?.open || '09:00'} onChange={e => setEdit({ ...edit, workingHours: { ...(edit.workingHours || { close: '00:00', slotDuration: 60 }), open: e.target.value } })} /></FI>
                                    <FI label="Kapanış"><I type="time" value={edit.workingHours?.close || '00:00'} onChange={e => setEdit({ ...edit, workingHours: { ...(edit.workingHours || { open: '09:00', slotDuration: 60 }), close: e.target.value } })} /></FI>
                                    <FI label="Slot Süresi (dk)"><I type="number" step="15" value={edit.workingHours?.slotDuration || 60} onChange={e => setEdit({ ...edit, workingHours: { ...(edit.workingHours || { open: '09:00', close: '00:00' }), slotDuration: +e.target.value } })} /></FI>
                                </div>
                            </div>

                            <div className="p-4 bg-black/30 rounded-2xl border border-white/5 space-y-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest"><Wallet size={11} className="inline mr-1" /> Fiyatlandırma & Ödeme Seçenekleri</p>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <FI label="Kişi Başı (₺)"><I type="number" value={edit.pricePerPerson} onChange={e => setEdit({ ...edit, pricePerPerson: +e.target.value })} /></FI>
                                    <FI label="Toplam Fiyat (₺)"><I type="number" value={edit.totalPrice} onChange={e => setEdit({ ...edit, totalPrice: +e.target.value })} /></FI>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <Toggle label="Online Ödeme" value={!!edit.paymentOptions?.online} onChange={() => setEdit({ ...edit, paymentOptions: { ...(edit.paymentOptions || { deposit: false, cash: true }), online: !edit.paymentOptions?.online } })} />
                                    <Toggle label="Kapora Modu" value={!!edit.paymentOptions?.deposit} onChange={() => setEdit({ ...edit, paymentOptions: { ...(edit.paymentOptions || { online: false, cash: true }), deposit: !edit.paymentOptions?.deposit } })} />
                                    <Toggle label="Nakit (Yerinde)" value={!!edit.paymentOptions?.cash} onChange={() => setEdit({ ...edit, paymentOptions: { ...(edit.paymentOptions || { online: false, deposit: false }), cash: !edit.paymentOptions?.cash } })} />
                                </div>
                            </div>

                            <div className="p-4 bg-blue-900/10 rounded-2xl border border-blue-500/20 space-y-4">
                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Param POS Entegrasyonu</p>
                                <FI label="Merchant ID"><I value={edit.paramMerchantId || ''} onChange={e => setEdit({ ...edit, paramMerchantId: e.target.value })} /></FI>
                                <FI label="API Key"><I type="password" value={edit.paramApiKey || ''} onChange={e => setEdit({ ...edit, paramApiKey: e.target.value })} /></FI>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'courts' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                            <div className="flex justify-between items-center">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tesisin Alt Sahaları</p>
                                <button
                                    onClick={() => {
                                        const newCourt = { id: `court_${Date.now()}`, name: `Saha ${(edit.courts?.length || 0) + 1}`, type: 'OPEN' as const, price: edit.totalPrice || 1000, slots: [] };
                                        setEdit({ ...edit, courts: [...(edit.courts || []), newCourt] });
                                    }}
                                    className="flex items-center gap-1 text-[10px] bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all"
                                >
                                    <Plus size={12} /> Kort Ekle
                                </button>
                            </div>
                            <div className="space-y-3">
                                {!edit.courts || edit.courts.length === 0 ? (
                                    <p className="text-xs text-gray-500 text-center py-6">Bu tesise ait henüz kort eklenmemiş.</p>
                                ) : (
                                    edit.courts.map((court, i) => (
                                        <div key={court.id} className="p-4 bg-black/30 rounded-xl border border-white/5 flex gap-4">
                                            <div className="flex-1 grid grid-cols-2 gap-3">
                                                <FI label="Kort Adı"><I value={court.name} onChange={e => {
                                                    const newCourts = [...edit.courts!];
                                                    newCourts[i] = { ...court, name: e.target.value };
                                                    setEdit({ ...edit, courts: newCourts });
                                                }} /></FI>
                                                <FI label="Tipi">
                                                    <Sel value={court.type} onChange={e => {
                                                        const newCourts = [...edit.courts!];
                                                        newCourts[i] = { ...court, type: e.target.value as 'OPEN'|'CLOSED' };
                                                        setEdit({ ...edit, courts: newCourts });
                                                    }}>
                                                        <option value="OPEN">Açık Saha</option>
                                                        <option value="CLOSED">Kapalı Saha</option>
                                                    </Sel>
                                                </FI>
                                                <FI label="Fiyat (₺)"><I type="number" value={court.price} onChange={e => {
                                                    const newCourts = [...edit.courts!];
                                                    newCourts[i] = { ...court, price: +e.target.value };
                                                    setEdit({ ...edit, courts: newCourts });
                                                }} /></FI>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setEdit({ ...edit, courts: edit.courts!.filter(c => c.id !== court.id) });
                                                }}
                                                className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 mt-5"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'slots' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-[#161B22]/70 rounded-2xl border border-yellow-500/20">
                            <p className="text-[9px] font-black text-yellow-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5"><Clock size={11} /> AKTİF SAAT SLOTU OVERRIDE MATRİSİ</p>
                            <p className="text-[9px] text-gray-500 mb-4">Saha sahibinin doldurmayı unuttuğu saat dilimlerini el ile rezerve (dolu) veya müsait (boş) konumuna getirin.</p>
                            <div className="grid grid-cols-4 gap-2">
                                {['17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'].map(t => {
                                    const slot = edit.slots?.find(s => s.time === t);
                                    const isBooked = slot?.status === 'booked';
                                    return (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => {
                                                const existingSlots = [...(edit.slots || [])];
                                                const idx = existingSlots.findIndex(s => s.time === t);
                                                if (idx >= 0) {
                                                    existingSlots[idx] = { time: t, status: isBooked ? 'available' : 'booked' };
                                                } else {
                                                    existingSlots.push({ time: t, status: 'booked' });
                                                }
                                                setEdit({ ...edit, slots: existingSlots });
                                            }}
                                            className={`py-2 px-1.5 rounded-xl border text-[10px] font-black transition-all flex flex-col items-center justify-center gap-0.5 ${
                                                isBooked 
                                                ? 'bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.05)]' 
                                                : 'bg-green-500/10 border-green-500/30 text-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.05)]'
                                            }`}
                                        >
                                            <span>{t}</span>
                                            <span className="text-[8px] font-bold uppercase">{isBooked ? 'DOLU' : 'BOŞ'}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
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
                            {saving ? <><Loader2 size={13} className="animate-spin" /> Ekleniyor...</> : <><Plus size={13} /> SAHAYI EKLE</>}
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
                
                {/* GPS Coordinates */}
                <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><MapPin size={11} /> GPS KOORDİNATLARI</p>
                    <div className="grid grid-cols-2 gap-4">
                        <FI label="Enlem (Latitude)"><I type="number" step="0.000001" value={edit.coordinates?.lat} onChange={e => setEdit({ ...edit, coordinates: { lat: +e.target.value, lng: edit.coordinates?.lng || 29.005 } })} /></FI>
                        <FI label="Boylam (Longitude)"><I type="number" step="0.000001" value={edit.coordinates?.lng} onChange={e => setEdit({ ...edit, coordinates: { lat: edit.coordinates?.lat || 41.0445, lng: +e.target.value } })} /></FI>
                    </div>
                </div>

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
    const updateUser = useAppStore((s) => s.updateUser);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateUser(edit);
            showOk('✅ Kullanıcı veritabanına kaydedildi');
            setTimeout(onClose, 1000);
        } catch (err) {
            showOk(`❌ Kayıt başarısız: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
        } finally {
            setSaving(false);
        }
    };

    // Sliders for dynamic FifaCard
    const stats = {
        pace: edit.playerCard?.stats?.pace || { value: 75, videoUrl: null },
        shooting: edit.playerCard?.stats?.shooting || { value: 70, videoUrl: null },
        passing: edit.playerCard?.stats?.passing || { value: 75, videoUrl: null },
        dribbling: edit.playerCard?.stats?.dribbling || { value: 75, videoUrl: null },
        defense: edit.playerCard?.stats?.defense || { value: 65, videoUrl: null },
        physical: edit.playerCard?.stats?.physical || { value: 70, videoUrl: null }
    };

    const handleStatChange = (key: string, value: number) => {
        const currentCard = edit.playerCard || {
            overall: 75,
            tier: 'gold',
            isStatsVerified: true,
            diamondValue: 0,
            winCount: edit.matchCount || 0,
            totalMatches: edit.matchCount || 0,
            stats: {
                pace: { value: 75, videoUrl: null },
                shooting: { value: 70, videoUrl: null },
                passing: { value: 75, videoUrl: null },
                dribbling: { value: 75, videoUrl: null },
                defense: { value: 65, videoUrl: null },
                physical: { value: 70, videoUrl: null }
            }
        };
        
        const updatedStats = {
            ...currentCard.stats,
            [key]: { value, videoUrl: null }
        };
        
        const overall = Math.round(
            (updatedStats.pace.value +
             updatedStats.shooting.value +
             updatedStats.passing.value +
             updatedStats.dribbling.value +
             updatedStats.defense.value +
             updatedStats.physical.value) / 6
        );

        setEdit(prev => ({
            ...prev,
            rating: Number((overall / 20).toFixed(1)),
            playerCard: {
                ...currentCard,
                overall,
                stats: updatedStats
            }
        }));
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
                
                {/* 2-Column Grid Layout with Card Preview */}
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Left Column - Form Inputs */}
                    <div className="flex-1 space-y-4">
                        {/* Avatar */}
                        <div className="flex gap-4 items-start bg-black/25 p-4 rounded-2xl border border-white/5">
                            <PhotoUploadZone currentUrl={edit.avatar} onChanged={url => setEdit({ ...edit, avatar: url })} folder="users" round />
                            <div className="flex-1 space-y-3">
                                <FI label="Avatar Görseli"><I value={edit.avatar} onChange={e => setEdit({ ...edit, avatar: e.target.value })} placeholder="https://..." /></FI>
                                <FI label="İsim Soyisim"><I value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></FI>
                            </div>
                        </div>

                        {/* Contact */}
                        <div className="grid grid-cols-2 gap-4">
                            <FI label="E-posta"><I value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} /></FI>
                            <FI label="Telefon"><I value={edit.phone || ''} onChange={e => setEdit({ ...edit, phone: e.target.value })} placeholder="+90 5..." /></FI>
                        </div>

                        {/* Role selection */}
                        <div className="grid grid-cols-2 gap-4">
                            <FI label="Sistem Rolü">
                                <Sel value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value as UserRole })}>
                                    {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                                </Sel>
                            </FI>
                            <FI label="Maç Sayısı"><I type="number" value={edit.matchCount} onChange={e => setEdit({ ...edit, matchCount: +e.target.value })} /></FI>
                        </div>

                        {/* Sliders for FifaCard stats */}
                        <div className="p-4 bg-black/30 rounded-2xl border border-purple-500/20 space-y-3">
                            <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1.5"><Zap size={11} /> TEKNİK KART YETENEK SÜRGÜLERİ (0-100)</p>
                            
                            {[
                                { key: 'pace', label: 'Hız (PAC)', color: 'text-yellow-400' },
                                { key: 'shooting', label: 'Şut (SHO)', color: 'text-red-400' },
                                { key: 'passing', label: 'Pas (PAS)', color: 'text-blue-400' },
                                { key: 'dribbling', label: 'Dripling (DRI)', color: 'text-purple-400' },
                                { key: 'defense', label: 'Defans (DEF)', color: 'text-green-400' },
                                { key: 'physical', label: 'Fizik (PHY)', color: 'text-orange-400' }
                            ].map(item => (
                                <div key={item.key} className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-gray-400 w-24 uppercase">{item.label}</span>
                                    <input 
                                        type="range" 
                                        min="10" 
                                        max="99" 
                                        value={stats[item.key as keyof typeof stats].value}
                                        onChange={e => handleStatChange(item.key, parseInt(e.target.value))}
                                        className="flex-1 accent-red-500 cursor-pointer"
                                    />
                                    <span className={`text-xs font-black w-8 text-right ${item.color}`}>
                                        {stats[item.key as keyof typeof stats].value}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Wallet */}
                        <div className="p-4 bg-black/30 rounded-2xl border border-yellow-500/20">
                            <p className="text-[9px] font-black text-yellow-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Wallet size={11} /> CÜZDAN KONTROLÜ</p>
                            <div className="grid grid-cols-2 gap-4 items-end">
                                <FI label="Cüzdan Bakiyesi (₺)">
                                    <I type="number" value={edit.wallet || 0} onChange={e => setEdit({ ...edit, wallet: +e.target.value })} className="text-yellow-400 font-mono text-lg" />
                                </FI>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setEdit(prev => ({ ...prev, wallet: (prev.wallet || 0) + 100 }))} className="flex-1 h-11 bg-green-500/15 text-green-400 border border-green-500/20 rounded-xl text-xs font-black hover:bg-green-500/25 transition-all">+₺100</button>
                                    <button type="button" onClick={() => setEdit(prev => ({ ...prev, wallet: (prev.wallet || 0) + 500 }))} className="flex-1 h-11 bg-green-500/15 text-green-400 border border-green-500/20 rounded-xl text-xs font-black hover:bg-green-500/25 transition-all">+₺500</button>
                                    <button type="button" onClick={() => setEdit(prev => ({ ...prev, wallet: 0 }))} className="flex-1 h-11 bg-red-500/15 text-red-400 border border-red-500/20 rounded-xl text-xs font-black hover:bg-red-500/25 transition-all">SIFIRLA</button>
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
                    </div>

                    {/* Right Column - FifaCard Interactive Preview */}
                    <div className="w-full lg:w-80 flex flex-col items-center justify-start py-4 bg-[#121820] rounded-3xl border border-white/5 relative overflow-hidden self-start">
                        <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-3">CANLI KART ÖNİZLEMESİ</p>
                        <FifaCard 
                            rating={edit.rating}
                            role={edit.role}
                            name={edit.name}
                            avatar={edit.avatar}
                            isElite={edit.isPro}
                            stats={{
                                label1: 'HIZ', val1: stats.pace.value,
                                label2: 'DRB', val2: stats.dribbling.value,
                                label3: 'ŞUT', val3: stats.shooting.value,
                                label4: 'DEF', val4: stats.defense.value,
                                label5: 'PAS', val5: stats.passing.value,
                                label6: 'FİZ', val6: stats.physical.value
                            }}
                        />
                        <div className="mt-4 px-4 text-center">
                            <span className="text-[10px] text-gray-500 font-mono">
                                Toplam FUT Puanı: <span className="text-white font-bold">{edit.playerCard?.overall || 75}</span> / 99
                            </span>
                        </div>
                    </div>
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
    const { loadServices } = useAppStore();

    const label = typeParam === 'GK' ? 'KALECİ' : 'HAKEM';

    const handleSave = async () => {
        setSaving(true);
        try {
            if (typeParam === 'GK') await FB.fbUpdateGoalkeeper(edit);
            else await FB.fbUpdateReferee(edit);
            await loadServices();
            showOk(`✅ ${item.name} veritabanına kaydedildi`);
            setTimeout(onClose, 1000);
        } catch (err) {
            showOk(`❌ Kayıt başarısız: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
        } finally {
            setSaving(false);
        }
    };

    // GK Specific stats adjustments
    const handleGkStatChange = (key: string, value: number) => {
        const stats = edit.stats || {
            savePercentage: '85',
            cleanSheets: 0,
            penaltySaveRate: '30',
            reflexes: 80,
            diving: 80,
            positioning: 80,
            distribution: 75,
            oneOnOne: 80,
            aerialReach: 80
        };
        const skills = edit.skills || {
            reflexes: 80,
            diving: 80,
            handling: 80,
            positioning: 80,
            kicking: 75,
            speed: 75
        };

        const updatedStats = { ...stats, [key]: value };
        const updatedSkills = { ...skills, [key]: value };

        const avgSkill = Math.round(
            ((updatedStats.reflexes || 80) + 
             (updatedStats.diving || 80) + 
             (updatedStats.positioning || 80) + 
             (updatedStats.distribution || 75) + 
             (updatedStats.oneOnOne || 80) + 
             (updatedStats.aerialReach || 80)) / 6
        );

        setEdit((prev: any) => ({
            ...prev,
            rating: Number((avgSkill / 20).toFixed(1)),
            stats: updatedStats,
            skills: updatedSkills
        }));
    };

    // REF Specific stats adjustments
    const handleRefStatChange = (key: string, value: number) => {
        const stats = edit.stats || {
            avgCards: 3.5,
            avgDistance: '10km',
            authority: 80,
            fitness: 80,
            communication: 80
        };
        const updatedStats = { ...stats, [key]: value };
        
        const avgSkill = Math.round(
            ((updatedStats.authority || 80) + 
             (updatedStats.fitness || 80) + 
             (updatedStats.communication || 80)) / 3
        );

        setEdit((prev: any) => ({
            ...prev,
            rating: Number((avgSkill / 20).toFixed(1)),
            stats: updatedStats
        }));
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

                {/* 2-Column Grid Layout with Card Preview */}
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Left Column - Form Inputs */}
                    <div className="flex-1 space-y-4">
                        {/* Avatar */}
                        <div className="flex gap-4 items-start bg-black/25 p-4 rounded-2xl border border-white/5">
                            <PhotoUploadZone currentUrl={edit.avatar} onChanged={url => setEdit({ ...edit, avatar: url })} folder="providers" round />
                            <div className="flex-1 space-y-3">
                                <FI label="Profil Görseli URL"><I value={edit.avatar} onChange={e => setEdit({ ...edit, avatar: e.target.value })} /></FI>
                                <FI label="İsim Soyisim"><I value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></FI>
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

                        {/* Interactive Sliders for Goalkeeper or Referee */}
                        {typeParam === 'GK' && (
                            <div className="p-4 bg-[#161B22]/80 border border-emerald-500/20 rounded-2xl space-y-3">
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5"><Zap size={11} /> KALECİ YETENEK KONTROLLERİ</p>
                                {[
                                    { key: 'reflexes', label: 'Refleksler (REF)', color: 'text-emerald-400' },
                                    { key: 'diving', label: 'Dalış (DIV)', color: 'text-teal-400' },
                                    { key: 'positioning', label: 'Pozisyon (POS)', color: 'text-cyan-400' },
                                    { key: 'distribution', label: 'Dağıtım (DIS)', color: 'text-blue-400' },
                                    { key: 'oneOnOne', label: 'Bire Bir (1v1)', color: 'text-indigo-400' },
                                    { key: 'aerialReach:80', keyReal: 'aerialReach', label: 'Hava Hakimiyeti', color: 'text-purple-400' }
                                ].map(item => {
                                    const realKey = (item.keyReal || item.key) as any;
                                    const val = edit.stats?.[realKey] || 80;
                                    return (
                                        <div key={item.key} className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-gray-400 w-28 uppercase">{item.label}</span>
                                            <input 
                                                type="range" 
                                                min="10" 
                                                max="99" 
                                                value={val}
                                                onChange={e => handleGkStatChange(realKey, parseInt(e.target.value))}
                                                className="flex-1 accent-emerald-500 cursor-pointer"
                                            />
                                            <span className={`text-xs font-black w-8 text-right ${item.color}`}>{val}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {typeParam === 'REF' && (
                            <div className="p-4 bg-[#161B22]/80 border border-blue-500/20 rounded-2xl space-y-3">
                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1.5"><Zap size={11} /> HAKEM YETENEK KONTROLLERİ</p>
                                {[
                                    { key: 'authority', label: 'Otorite (OTO)', color: 'text-red-400' },
                                    { key: 'fitness', label: 'Kondisyon (KON)', color: 'text-emerald-400' },
                                    { key: 'communication', label: 'İletişim (İLE)', color: 'text-blue-400' }
                                ].map(item => {
                                    const val = edit.stats?.[item.key] || 80;
                                    return (
                                        <div key={item.key} className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-gray-400 w-28 uppercase">{item.label}</span>
                                            <input 
                                                type="range" 
                                                min="10" 
                                                max="99" 
                                                value={val}
                                                onChange={e => handleRefStatChange(item.key, parseInt(e.target.value))}
                                                className="flex-1 accent-blue-500 cursor-pointer"
                                            />
                                            <span className={`text-xs font-black w-8 text-right ${item.color}`}>{val}</span>
                                        </div>
                                    );
                                })}
                                
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    <FI label="Ort. Kart Sayısı">
                                        <I type="number" step="0.1" value={edit.stats?.avgCards || 3.5} onChange={e => setEdit({ ...edit, stats: { ...edit.stats, avgCards: +e.target.value } })} />
                                    </FI>
                                    <FI label="Ort. Koşu Mesafesi">
                                        <I value={edit.stats?.avgDistance || '10km'} onChange={e => setEdit({ ...edit, stats: { ...edit.stats, avgDistance: e.target.value } })} />
                                    </FI>
                                </div>
                            </div>
                        )}

                        {/* Status */}
                        <div className="space-y-2">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">STATÜ</p>
                            <Toggle label="ELITE Statüsü" desc="Altın rozet göster, listedeki sıralamasını yükselt" value={!!edit.isElite} onChange={() => setEdit((prev: any) => ({ ...prev, isElite: !prev.isElite }))} />
                            <Toggle label="Doğrulanmış" desc="Profil doğrulama rozeti" value={!!edit.isVerified} onChange={() => setEdit((prev: any) => ({ ...prev, isVerified: !prev.isVerified }))} />
                            <Toggle label="Müsaitlik Durdur" desc="Bu kişiyi geçici olarak listeden kaldır" value={!!edit.isSuspended} onChange={() => setEdit((prev: any) => ({ ...prev, isSuspended: !prev.isSuspended }))} danger />
                        </div>
                    </div>

                    {/* Right Column - FifaCard Interactive Preview */}
                    <div className="w-full lg:w-80 flex flex-col items-center justify-start py-4 bg-[#121820] rounded-3xl border border-white/5 self-start">
                        <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-3">CANLI KART ÖNİZLEMESİ</p>
                        {typeParam === 'GK' ? (
                            <FifaCard
                                rating={edit.rating}
                                role="GOALKEEPER"
                                name={edit.name}
                                avatar={edit.avatar}
                                isElite={edit.isElite}
                                stats={{
                                    label1: 'REF', val1: edit.stats?.reflexes || 80,
                                    label2: 'DAL', val2: edit.stats?.diving || 80,
                                    label3: 'POZ', val3: edit.stats?.positioning || 80,
                                    label4: 'DAĞ', val4: edit.stats?.distribution || 75,
                                    label5: 'BİR', val5: edit.stats?.oneOnOne || 80,
                                    label6: 'HAY', val6: edit.stats?.aerialReach || 80
                                }}
                            />
                        ) : (
                            <FifaCard
                                rating={edit.rating}
                                role="REFEREE"
                                name={edit.name}
                                avatar={edit.avatar}
                                isElite={edit.isElite}
                                stats={{
                                    label1: 'OTO', val1: edit.stats?.authority || 80,
                                    label2: 'KON', val2: edit.stats?.fitness || 80,
                                    label3: 'İLE', val3: edit.stats?.communication || 80,
                                    label4: 'KRT', val4: Math.round((edit.stats?.avgCards || 3.5) * 10),
                                    label5: 'MES', val5: Math.round(parseFloat(edit.stats?.avgDistance || '10') * 8),
                                    label6: 'DEC', val6: 85
                                }}
                            />
                        )}
                    </div>
                </div>
            </Shell>
        </AnimatePresence>
    );
};
