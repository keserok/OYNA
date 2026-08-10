import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pitch, Goalkeeper, Referee, AdminUser, UserRole } from '../../types';
import { useAppStore } from '../../store';
import { fetchProviderOpsAdmin, updateProviderOpsAdmin } from '../services/adminService';
import * as FB from '../../supabaseMutations';
import { X, Save, Image as ImageIcon, UploadCloud, Loader2, Check, Wallet, Star, Shield, Phone, Mail, AlertTriangle, Plus, Zap, MapPin, Clock } from 'lucide-react';
import { useImageUpload } from '../../hooks/useImageUpload';
import { motion, AnimatePresence } from 'framer-motion';
import { MarketplaceCard } from '../../components/Marketplace/MarketplaceCard';
import { GK_STYLES, REF_STYLES, MAX_PROVIDER_STYLES, providerStyles, type ProviderKind } from '../../shared/providerStyles';

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
        <div className={`w-11 h-6 rounded-full relative flex items-center transition-colors duration-300 flex-shrink-0 ${value ? (danger ? 'bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-primary shadow-[0_0_10px_rgba(57,255,20,0.3)]') : 'bg-white/10'}`}>
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
// USER DEEP EDIT — KALDIRILDI (kullanıcı kararı: "üç düzenleme yeri tek yerde
// birleşsin"). Kullanıcı düzenleme artık TEK yerde: Kullanıcılar → 360 →
// Profil (Uygulama Aynası). Oradaki DÜZENLE uygulamanın kendi ekranını açar,
// "Yönetici Alanları" ise bu pencerede duran alanların tamamını (telefon, rol,
// maç sayısı, doğrulanmış, yasak) ve fazlasını taşır.
// Sağlayıcı (kaleci/hakem) derin düzenlemesi aşağıda DURUYOR.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// GOALKEEPER / REFEREE DEEP EDIT
// ═══════════════════════════════════════════════════════════════
/**
 * SAĞLAYICI TARZ SEÇİCİ (panel) — kaleci/hakem tarzlarını yönetimden düzenler.
 *
 * Kurucu kararı (2026-08-06): tarz hem sağlayıcının kendi "Bilgilerim"
 * ekranından hem de yönetim panelinden ayarlanabilmeli. İki yüzey de AYNI
 * listeden beslenir (shared/providerStyles.ts) ve aynı kuralı uygular:
 * en fazla iki tarz.
 *
 * Üçüncüye basılınca en eski seçim düşer — sağlayıcı ekranındaki davranışın
 * aynısı. Panel ile uygulamanın farklı davranması, "panelde oluyor uygulamada
 * olmuyor" şikâyetlerinin kaynağıdır.
 */
const ProviderStyleSecici: React.FC<{
    kind: ProviderKind;
    edit: any;
    setEdit: React.Dispatch<React.SetStateAction<any>>;
    accent: 'emerald' | 'blue';
}> = ({ kind, edit, setEdit, accent }) => {
    const secili: string[] = providerStyles(kind, edit);
    const liste = kind === 'GK' ? GK_STYLES : REF_STYLES;
    const renk = accent === 'emerald' ? '#34d399' : '#60a5fa';

    const degistir = (tarz: string) => {
        const yeni = secili.includes(tarz)
            ? secili.filter(t => t !== tarz)
            : secili.length < MAX_PROVIDER_STYLES
                ? [...secili, tarz]
                : [...secili.slice(1), tarz];
        setEdit((prev: any) => ({ ...prev, styles: yeni }));
    };

    return (
        <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 mb-1"
               style={{ color: renk }}>
                <Zap size={11} /> {kind === 'GK' ? 'KALECİ TARZI' : 'YÖNETİM TARZI'}
                <span className="ml-auto font-mono text-gray-500">{secili.length}/{MAX_PROVIDER_STYLES}</span>
            </p>
            <p className="text-[9px] text-gray-500 mb-2.5">
                En fazla iki tarz. Sağlayıcı bunları kendi ekranından da değiştirebilir.
            </p>
            <div className="flex flex-wrap gap-1.5">
                {liste.map(tarz => {
                    const aktif = secili.includes(tarz);
                    return (
                        <button
                            key={tarz}
                            type="button"
                            onClick={() => degistir(tarz)}
                            aria-pressed={aktif}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold border transition-all"
                            style={{
                                background: aktif ? renk : 'rgba(255,255,255,0.04)',
                                color: aktif ? '#0A0E14' : '#9ca3af',
                                borderColor: aktif ? renk : 'rgba(255,255,255,0.1)',
                            }}
                        >
                            {tarz}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

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

    // NOT: Buradaki `handleGkStatChange` / `handleRefStatChange` kaldırıldı.
    // Refleks/dalış/otorite gibi 10–99 arası "yetenek" sayılarını yalnız bu
    // ekran üretiyordu; hiçbir ölçümden gelmiyor, oyuncuya ise ölçülmüş
    // performansmış gibi çubuk çubuk gösteriliyorlardı (kurucu kararı,
    // 2026-08-06). Puan (`rating`) artık yalnız kullanıcı değerlendirmesinden
    // gelir ve yukarıdaki alandan elle düzeltilebilir.

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

                        {/* TARZ SEÇİCİ — eski "yetenek slider"larının yerine.
                            Kurucu kararı (2026-08-06): refleks/dalış/pozisyon
                            slider'ları kaldırıldı. O sayıların arkasında ölçüm
                            yoktu; yalnız buradan elle yazılıyor, oyuncuya ise
                            ölçülmüş performansmış gibi gösteriliyordu.
                            Yerine sağlayıcının kendi ekranından da seçebildiği
                            kapalı tarz listesi geldi (shared/providerStyles.ts
                            + veritabanı CHECK kısıtı). */}
                        {typeParam === 'GK' && (
                            <div className="p-4 bg-surface-1/80 border border-emerald-500/20 rounded-2xl space-y-3">
                                <ProviderStyleSecici kind="GK" edit={edit} setEdit={setEdit} accent="emerald" />

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
                            <div className="p-4 bg-surface-1/80 border border-blue-500/20 rounded-2xl space-y-3">
                                <ProviderStyleSecici kind="REF" edit={edit} setEdit={setEdit} accent="blue" />
                                
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

                    {/* Sağ Sütun — OYUNCUNUN GÖRDÜĞÜ ÖNİZLEME
                        Burada eskiden altı sayılı bir "FIFA kartı" duruyordu ve
                        boş alanları `|| 80` ile dolduruyordu: yeni kaydedilmiş,
                        hiç istatistiği olmayan bir kaleci panelde 80/80/80 diye
                        görünüyordu. Yani önizleme, olmayan veriyi varmış gibi
                        gösteriyordu (kurucu kararı, 2026-08-06: uydurma sayı yok).
                        Yerine oyuncunun pazaryerinde GERÇEKTEN gördüğü kart
                        koyuldu — panelde yapılan değişikliğin oyuncuya nasıl
                        yansıdığı birebir görünür. */}
                    <div className="w-full lg:w-80 flex flex-col items-center justify-start py-4 px-3 bg-[#121820] rounded-3xl border border-white/5 self-start gap-3">
                        <p className="text-[9px] font-extrabold text-purple-400 uppercase tracking-widest">OYUNCUNUN GÖRDÜĞÜ</p>
                        <div className="w-full">
                            <MarketplaceCard
                                item={{ ...(item as any), ...edit } as any}
                                type={typeParam}
                                onClick={() => { /* önizleme — tıklanmaz */ }}
                            />
                        </div>
                        <p className="text-[9px] text-gray-500 text-center leading-relaxed px-1">
                            Kaydettiğin ad, ücret, puan ve tarz oyuncuya bu kartta görünür.
                        </p>
                    </div>
                </div>
            </Shell>
        </AnimatePresence>
    );
};
