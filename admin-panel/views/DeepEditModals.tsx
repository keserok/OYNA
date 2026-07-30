import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pitch, Goalkeeper, Referee, AdminUser, UserRole } from '../../types';
import { useAppStore } from '../../store';
import { fetchProviderOpsAdmin, updateProviderOpsAdmin } from '../services/adminService';
import * as FB from '../../supabaseMutations';
import { X, Save, Image as ImageIcon, UploadCloud, Loader2, Check, Wallet, Star, Shield, Phone, Mail, AlertTriangle, Plus, Zap, MapPin, Clock } from 'lucide-react';
import { useImageUpload } from '../../hooks/useImageUpload';
import { motion, AnimatePresence } from 'framer-motion';
import { FifaCard } from '../../components/FifaCard';

interface ModalProps { onClose: () => void; }

// ── Shared components ────────────────────────────────────────────────────────
const FI: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <div>
        <label className="block text-[10px] font-extrabold text-gray-400 mb-1.5 uppercase tracking-widest">{label}</label>
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
                        <span className="text-xs font-extrabold text-red-400">% {Math.round(progress)} Yükleniyor...</span>
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
                    className="fixed bottom-6 left-1/2 z-[400] px-5 py-3 bg-green-900/90 border border-green-500/30 rounded-xl text-green-300 text-sm font-extrabold backdrop-blur-sm flex items-center gap-2 shadow-2xl">
                    <Check size={14} /> {msg}
                </motion.div>
            )}
        </AnimatePresence>
    );
    return { showOk, Toast };
};

// ── Modal Shell ───────────────────────────────────────────────────────────────
const Shell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({ title, onClose, children, footer }) => createPortal(
    // Portal → document.body: dönüşümlü (transform) bir üst öğe içindeyken
    // `position:fixed` viewport yerine o öğeye göre konumlanıp modalın üst kısmı
    // ekran dışına taşıyor ve kaydırılamıyordu. Body'ye portal + max-h/scroll ile
    // modal her zaman ekranda ve tamamen kaydırılabilir kalır.
    <motion.div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[240] flex items-end sm:items-center justify-center p-0 sm:p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}>
        <motion.div className="bg-[#0D1117] border border-white/10 w-full max-w-4xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[95vh]"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#121820] rounded-t-3xl shrink-0">
                <h2 className="text-sm font-extrabold text-white tracking-widest uppercase">{title}</h2>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-all"><X size={15} /></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 space-y-5">{children}</div>
            <div className="p-4 border-t border-white/10 bg-[#121820] rounded-b-3xl shrink-0">{footer}</div>
        </motion.div>
    </motion.div>,
    document.body,
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
        <label className="block text-[10px] font-extrabold text-gray-400 mb-2 uppercase tracking-widest">{label}</label>
        {desc && <p className="text-[9px] text-gray-600 mb-2">{desc}</p>}
        <div className="flex gap-2">
            {(['A', 'B', 'C'] as const).map(g => (
                <button key={g} onClick={() => onChange(g)}
                    className={`flex-1 h-10 rounded-xl font-extrabold text-xs border-2 transition-all ${
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


    return (
        <AnimatePresence>
            <Shell title={`Kullanıcı Düzenle — ${user.name}`} onClose={onClose} footer={
                <div className="flex items-center justify-between">
                    <p className="text-[9px] text-gray-600 font-mono">ID: {user.id}</p>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all">İptal</button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-red-600 to-purple-700 text-white rounded-xl text-xs font-extrabold transition-all disabled:opacity-50 hover:opacity-90">
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

                        {/* Contact — PII sunucudan maskeli gelir; maskeli değer yazımını
                            sunucu reddeder. E-posta auth kimliğidir, panelden düzenlenmez. */}
                        <div className="grid grid-cols-2 gap-4">
                            <FI label="E-posta (salt okunur — maskeli)"><I value={edit.email} disabled readOnly className="opacity-60" /></FI>
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

                        {/* Wallet — SALT OKUNUR: bakiyeyi elle ezmek wallet_transactions
                            ledger'ıyla mutabakatı bozuyordu. Düzeltme artık ledger'lı
                            admin_adjust_wallet_balance yolundan: Kullanıcı 360 → Profil
                            Aynası → Cüzdan kısayolu. */}
                        <div className="p-4 bg-black/30 rounded-2xl border border-yellow-500/20">
                            <p className="text-[9px] font-extrabold text-yellow-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Wallet size={11} /> CÜZDAN</p>
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-lg font-extrabold font-mono text-yellow-400">{Number(edit.wallet || 0).toLocaleString('tr-TR')} ₺</p>
                                <p className="text-[10px] text-gray-500 leading-relaxed text-right max-w-[260px]">
                                    Bakiye düzeltmesi ledger'a işlenir: <span className="text-gray-300 font-bold">360 → Profil Aynası → Cüzdan</span> (sebep zorunlu, FINANCE yetkisi).
                                </p>
                            </div>
                        </div>

                        {/* Status toggles */}
                        <div className="space-y-2">
                            <p className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Shield size={11} /> HESAP DURUMLARI</p>
                            <Toggle label="Doğrulanmış Hesap" desc="Mavi tik göster" value={edit.isVerified} onChange={() => setEdit(prev => ({ ...prev, isVerified: !prev.isVerified }))} />
                            <Toggle label="Hesabı Banla" desc="Kullanıcı sisteme giremez, aktif rezervasyonları iptal edilir" value={edit.isBanned} onChange={() => setEdit(prev => ({ ...prev, isBanned: !prev.isBanned }))} danger />
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
    const { loadServices, updateGoalkeeper, updateReferee } = useAppStore();

    // Müsaitlik/doğrulamanın KANONİK kaynağı profiles'tır (is_available +
    // verification_status) — eşleştirme motoru ve vitrin oradan okur. Eski
    // "Doğrulanmış"/"Müsaitlik Durdur" toggle'ları GK/REF tablosuna var olmayan
    // kolon yazmaya çalışan sessiz no-op'tu; artık gerçek ops RPC'sine bağlı.
    const [ops, setOps] = useState<{ isAvailable: boolean; verificationStatus: string | null } | null>(null);
    const [opsDraft, setOpsDraft] = useState<boolean | null>(null); // istenen isAvailable
    const [opsError, setOpsError] = useState<string | null>(null);
    const [opsReloadKey, setOpsReloadKey] = useState(0); // Tekrar Dene sayacı
    useEffect(() => {
        let alive = true;
        setOps(null);
        setOpsDraft(null);
        setOpsError(null);
        fetchProviderOpsAdmin(item.id, typeParam)
            .then((o) => { if (alive) { setOps({ isAvailable: o.isAvailable, verificationStatus: o.verificationStatus }); setOpsDraft(o.isAvailable); } })
            .catch((err) => { if (alive) setOpsError(err instanceof Error ? err.message : 'Müsaitlik bilgisi okunamadı'); });
        return () => { alive = false; };
    }, [item.id, typeParam, opsReloadKey]);

    const label = typeParam === 'GK' ? 'KALECİ' : 'HAKEM';

    const handleSave = async () => {
        setSaving(true);
        try {
            if (typeParam === 'GK') await updateGoalkeeper(edit);
            else await updateReferee(edit);
            // Müsaitlik değiştiyse profiles.is_available'a audit'li ops RPC'siyle yaz
            if (ops && opsDraft !== null && opsDraft !== ops.isAvailable) {
                await updateProviderOpsAdmin(item.id, typeParam, { isAvailable: opsDraft });
            }
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
        // HR-H: eksik statları sahte 80/75 ile TOHUMLAMA. Admin bir slider'ı
        // oynattığında dokunmadığı statlar 80'e çözülüp DB'ye uydurma değer
        // yazılıyordu. Artık yalnız gerçekten girilmiş statlar tutulur; rating
        // sadece MEVCUT sayısal statlardan hesaplanır, hiçbiri yoksa korunur.
        // (#107'nin yeni inputları — GK penaltySaveRate, REF varCallAccuracy —
        //  bu boş obje ile de çalışır; kullanıcı girdikçe edit.stats'a yazılır.)
        const stats = edit.stats || {};
        const skills = edit.skills || {};

        const updatedStats = { ...stats, [key]: value };
        const updatedSkills = { ...skills, [key]: value };

        const basis = ['reflexes', 'diving', 'positioning', 'distribution', 'oneOnOne', 'aerialReach']
            .map((k) => updatedStats[k])
            .filter((v: any): v is number => typeof v === 'number' && Number.isFinite(v));
        const nextRating = basis.length
            ? Number((basis.reduce((a, b) => a + b, 0) / basis.length / 20).toFixed(1))
            : (edit.rating ?? 0);

        setEdit((prev: any) => ({
            ...prev,
            rating: nextRating,
            stats: updatedStats,
            skills: updatedSkills
        }));
    };

    // REF Specific stats adjustments
    const handleRefStatChange = (key: string, value: number) => {
        // HR-H: eksik statları sahte 80 ile TOHUMLAMA (bkz. handleGkStatChange).
        // Rating yalnız gerçekten girilmiş statlardan; hiçbiri yoksa korunur.
        const stats = edit.stats || {};
        const updatedStats = { ...stats, [key]: value };

        const basis = ['authority', 'fitness', 'communication']
            .map((k) => updatedStats[k])
            .filter((v: any): v is number => typeof v === 'number' && Number.isFinite(v));
        const nextRating = basis.length
            ? Number((basis.reduce((a, b) => a + b, 0) / basis.length / 20).toFixed(1))
            : (edit.rating ?? 0);

        setEdit((prev: any) => ({
            ...prev,
            rating: nextRating,
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
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-red-600 to-purple-700 text-white rounded-xl text-xs font-extrabold transition-all disabled:opacity-50 hover:opacity-90">
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
                            <p className="text-[9px] font-extrabold text-green-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Wallet size={11} /> ÜCRET & PERFORMANS</p>
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
                                <p className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5"><Zap size={11} /> KALECİ YETENEK KONTROLLERİ</p>
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
                                            <span className={`text-xs font-extrabold w-8 text-right ${item.color}`}>{val}</span>
                                        </div>
                                    );
                                })}

                                {/* Gerçek maç istatistikleri (Marketplace "Performans" karoları) */}
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    <FI label="Kurtarış Yüzdesi (%)">
                                        <I value={edit.stats?.savePercentage ?? ''} placeholder="85" onChange={e => setEdit({ ...edit, stats: { ...edit.stats, savePercentage: e.target.value } })} />
                                    </FI>
                                    <FI label="Penaltı Kurtarma (%)">
                                        <I value={edit.stats?.penaltySaveRate ?? ''} placeholder="30" onChange={e => setEdit({ ...edit, stats: { ...edit.stats, penaltySaveRate: e.target.value } })} />
                                    </FI>
                                </div>
                            </div>
                        )}

                        {typeParam === 'REF' && (
                            <div className="p-4 bg-[#161B22]/80 border border-blue-500/20 rounded-2xl space-y-3">
                                <p className="text-[10px] font-extrabold text-blue-400 uppercase tracking-widest flex items-center gap-1.5"><Zap size={11} /> HAKEM YETENEK KONTROLLERİ</p>
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
                                            <span className={`text-xs font-extrabold w-8 text-right ${item.color}`}>{val}</span>
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
                                    <FI label="Karar İsabeti (%)">
                                        <I value={edit.stats?.varCallAccuracy ?? ''} placeholder="98" onChange={e => setEdit({ ...edit, stats: { ...edit.stats, varCallAccuracy: e.target.value } })} />
                                    </FI>
                                </div>
                            </div>
                        )}

                        {/* Status */}
                        <div className="space-y-2">
                            <p className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest mb-2">STATÜ</p>
                            <Toggle label="ELITE Statüsü" desc="Altın rozet göster, listedeki sıralamasını yükselt" value={!!edit.isElite} onChange={() => setEdit((prev: any) => ({ ...prev, isElite: !prev.isElite }))} />
                            {/* Doğrulama SALT OKUNUR: kimlik doğrulama Doğrulama Merkezi'nin
                                belge akışından geçer — buradaki eski toggle hiçbir yere yazmıyordu. */}
                            <div className="flex items-center justify-between p-3.5 bg-black/25 border border-white/5 rounded-2xl">
                                <div>
                                    <p className="text-xs font-bold text-white">Doğrulama Durumu</p>
                                    <p className="text-[10px] text-gray-500">Belge onayı: Doğrulama Merkezi → Kimlik Doğrulama</p>
                                </div>
                                <span className={`text-[10px] font-extrabold px-2 py-1 rounded-lg border ${
                                    ops?.verificationStatus === 'approved'
                                        ? 'text-green-300 bg-green-500/10 border-green-500/30'
                                        : ops?.verificationStatus
                                        ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                                        : 'text-gray-500 bg-white/5 border-white/10'
                                }`}>
                                    {ops?.verificationStatus === 'approved' ? 'ONAYLI' : ops?.verificationStatus === 'pending' ? 'BEKLİYOR' : ops?.verificationStatus?.toUpperCase() || '—'}
                                </span>
                            </div>
                            {ops && opsDraft !== null ? (
                                <Toggle
                                    label="Müsaitlik Durdur"
                                    desc="Eşleştirme ve pazardan geçici olarak kaldır (profiles.is_available — kaydedince işlenir)"
                                    value={!opsDraft}
                                    onChange={() => setOpsDraft((v) => (v === null ? v : !v))}
                                    danger
                                />
                            ) : opsError ? (
                                <div className="flex items-center justify-between gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-2xl">
                                    <p className="text-[10px] text-red-400 leading-relaxed min-w-0">Müsaitlik bilgisi okunamadı: {opsError}</p>
                                    <button type="button" onClick={() => setOpsReloadKey((k) => k + 1)} className="shrink-0 text-[10px] font-extrabold uppercase text-gray-300 border border-white/15 rounded-lg px-2.5 py-1.5 hover:text-white">
                                        Tekrar Dene
                                    </button>
                                </div>
                            ) : (
                                <p className="text-[10px] text-gray-600 px-1">Müsaitlik bilgisi yükleniyor…</p>
                            )}
                        </div>
                    </div>

                    {/* Right Column - FifaCard Interactive Preview */}
                    <div className="w-full lg:w-80 flex flex-col items-center justify-start py-4 bg-[#121820] rounded-3xl border border-white/5 self-start">
                        <p className="text-[9px] font-extrabold text-purple-400 uppercase tracking-widest mb-3">CANLI KART ÖNİZLEMESİ</p>
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
