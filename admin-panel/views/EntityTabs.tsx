import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Edit3, Check, X, Star, UploadCloud, Loader2, Wallet, Activity, MapPin, Shield, Award, TrendingUp, Clock, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import { Goalkeeper, Referee, Pitch, UserRole } from '../../types';
import { useImageUpload } from '../../hooks/useImageUpload';

// ── Shared helpers ──────────────────────────────────────────────────
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (p) => (
    <input {...p} className={`w-full h-11 bg-black/50 border border-white/10 rounded-xl px-4 text-sm text-white font-medium focus:outline-none focus:border-red-500/50 transition-all ${p.className || ''}`} />
);
const TA: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (p) => (
    <textarea {...p} className="w-full h-20 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-medium focus:outline-none focus:border-red-500/50 transition-all resize-none" />
);
const F: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <div className="mb-3">
        <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">{label}</label>
        {children}
        {hint && <p className="text-[9px] text-gray-600 mt-1">{hint}</p>}
    </div>
);
const Sel: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }> = ({ children, ...p }) => (
    <select {...p} className="w-full h-11 bg-black/50 border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-red-500/50">{children}</select>
);
const StatRow: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color = 'red' }) => (
    <div className="mb-2">
        <div className="flex justify-between text-[10px] mb-1">
            <span className="text-gray-400 font-bold uppercase tracking-wide">{label}</span>
            <span className={`text-${color}-400 font-black`}>{value}</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full bg-${color}-500 rounded-full`} style={{ width: `${value}%` }} />
        </div>
    </div>
);

// ── Toast ─────────────────────────────────────────────────────────
const useToast = () => {
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const show = useCallback((text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 2300); }, []);
    const Toast = () => (
        <AnimatePresence>
            {msg && (
                <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`fixed top-4 right-4 z-[300] px-4 py-2.5 rounded-xl text-xs font-black shadow-2xl border backdrop-blur-sm flex items-center gap-2 ${msg.ok ? 'bg-green-900/90 border-green-500/30 text-green-300' : 'bg-red-900/90 border-red-500/30 text-red-300'}`}>
                    <Check size={12} />{msg.text}
                </motion.div>
            )}
        </AnimatePresence>
    );
    return { show, Toast };
};

// ── Photo Upload Area ─────────────────────────────────────────────
const PhotoArea: React.FC<{ url: string; onChange: (url: string) => void; folder: string; label?: string }> = ({ url, onChange, folder, label = 'Fotoğraf' }) => {
    const { uploadImage, uploading, progress } = useImageUpload(folder);
    return (
        <F label={label}>
            <div className="flex gap-3 items-center">
                <div className={`w-16 h-16 rounded-2xl border-2 border-dashed flex-shrink-0 overflow-hidden transition-all ${uploading ? 'border-red-500/50 bg-red-900/10' : 'border-white/15 bg-black/30 hover:border-red-500/30'}`}>
                    {url ? <img src={url} className="w-full h-full object-cover" /> :
                        <div className="w-full h-full flex items-center justify-center">
                            <UploadCloud size={18} className="text-gray-600" />
                        </div>}
                </div>
                <div className="flex-1 space-y-2">
                    <label className={`flex items-center justify-center gap-2 h-10 rounded-xl border text-[11px] font-black uppercase cursor-pointer transition-all ${uploading ? 'border-red-500/30 text-red-400 cursor-wait' : 'border-white/10 bg-white/5 text-gray-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'}`}>
                        {uploading ? <><Loader2 size={12} className="animate-spin" />%{Math.round(progress)} Yükleniyor</> : <><UploadCloud size={12} />Cihazdan Seç</>}
                        <input type="file" className="hidden" accept="image/*" disabled={uploading}
                            onChange={async e => { const file = e.target.files?.[0]; if (file) { const u = await uploadImage(file); if (u) onChange(u); } }} />
                    </label>
                    <Input value={url} onChange={e => onChange(e.target.value)} placeholder="veya URL yapıştır..." />
                </div>
            </div>
        </F>
    );
};

// ── Modal Wrapper ──────────────────────────────────────────────────
const M: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; onSave: () => void; saving?: boolean }> = ({ title, subtitle, onClose, children, onSave, saving }) => (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="w-full max-w-xl bg-[#0D1117] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start px-5 py-4 border-b border-white/5 bg-[#121820] shrink-0">
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">{title}</h3>
                    {subtitle && <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>}
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center mt-0.5"><X size={15} /></button>
            </div>
            <div className="overflow-y-auto p-5 flex-1 custom-scrollbar space-y-1">{children}</div>
            <div className="p-4 border-t border-white/5 bg-[#121820] shrink-0 flex gap-3">
                <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 border border-white/10 hover:bg-white/5 transition-all">İptal</button>
                <button onClick={onSave} disabled={!!saving}
                    className="flex-1 h-11 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50">
                    {saving ? <><Loader2 size={13} className="animate-spin" />Kaydediliyor...</> : <><Check size={13} />KAYDET & YAYINLA</>}
                </button>
            </div>
        </motion.div>
    </div>
);

// ── Stat Section Header ────────────────────────────────────────────
const SH: React.FC<{ icon: React.ReactNode; label: string; color?: string }> = ({ icon, label, color = 'gray' }) => (
    <div className={`flex items-center gap-2 text-[10px] font-black text-${color}-400 uppercase tracking-widest mb-3 mt-5 first:mt-0`}>
        {icon}<span>{label}</span>
        <div className="flex-1 h-px bg-white/5" />
    </div>
);

// ══════════════════════════════════════════════════════════
// GOALKEEPER TAB
// ══════════════════════════════════════════════════════════
export const GoalkeeperTab: React.FC = () => {
    const { adminGoalkeepers, addGoalkeeper, updateGoalkeeper, deleteGoalkeeper } = useAppStore();
    const [modal, setModal] = useState<{ show: boolean; gk?: Goalkeeper }>({ show: false });
    const [saving, setSaving] = useState(false);
    const { show: toast, Toast } = useToast();

    const blank = () => ({
        name: '', age: '', fee: '', bio: '', style: 'Shot-Stopper', height: '',
        avatar: '', isElite: false, rating: '4.5', matchCount: '0', totalEarnings: '0',
        cleanSheets: '0', savePercentage: '85', penaltySaveRate: '30',
        reflexes: '80', diving: '80', positioning: '80', distribution: '75', location: 'İstanbul'
    });
    const [f, setF] = useState(blank());

    const openAdd = () => { setF(blank()); setModal({ show: true }); };
    const openEdit = (gk: Goalkeeper) => {
        setF({
            name: gk.name, age: String(gk.age), fee: String(gk.fee), bio: gk.bio,
            style: gk.style, height: gk.height, avatar: gk.avatar, isElite: gk.isElite ?? false,
            rating: String(gk.rating), matchCount: String(gk.matchCount ?? 0),
            totalEarnings: String((gk.matchCount ?? 0) * gk.fee),
            cleanSheets: String(gk.stats?.cleanSheets ?? 0), savePercentage: String(gk.stats?.savePercentage ?? '85'),
            penaltySaveRate: String(gk.stats?.penaltySaveRate ?? '30'),
            reflexes: String(gk.skills?.reflexes ?? 80), diving: String(gk.skills?.diving ?? 80),
            positioning: String(gk.skills?.positioning ?? 80), distribution: String(gk.stats?.distribution ?? 75),
            location: (gk.preferredZones ?? ['İstanbul'])[0] ?? 'İstanbul'
        } as any);
        setModal({ show: true, gk });
    };

    const save = async () => {
        if (!f.name) return;
        setSaving(true);
        const base: Goalkeeper = {
            id: modal.gk?.id || `gk-${Date.now()}`,
            name: f.name, age: +f.age || 0, fee: +f.fee || 0, bio: f.bio,
            style: f.style, height: f.height,
            avatar: f.avatar || `https://i.pravatar.cc/150?u=${Date.now()}`,
            isElite: (f as any).isElite, rating: +f.rating, matchCount: +f.matchCount,
            coordinates: { lat: 41.058, lng: 29.002 },
            preferredZones: [f.location],
            recentAwards: '',
            stats: { savePercentage: f.savePercentage, cleanSheets: +f.cleanSheets, penaltySaveRate: f.penaltySaveRate, reflexes: +f.reflexes, diving: +f.diving, positioning: +f.positioning, distribution: +f.distribution, oneOnOne: 80, aerialReach: 80 },
            skills: { reflexes: +f.reflexes, diving: +f.diving, handling: 80, positioning: +f.positioning, kicking: +f.distribution, speed: 75 },
            equipment: { gloves: '', boots: '', jersey: '' }, reviews: []
        };
        if (modal.gk) await updateGoalkeeper(base);
        else await addGoalkeeper(base);
        setSaving(false);
        toast(`✅ ${f.name} ${modal.gk ? 'güncellendi' : 'eklendi'} ve Firebase\'e kaydedildi`);
        setModal({ show: false });
    };

    return (
        <div>
            <Toast />
            <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-black uppercase tracking-tighter">Kaleciler <span className="text-red-400 text-sm">({adminGoalkeepers.length})</span></h2>
                <button onClick={openAdd} className="h-10 px-4 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all">
                    <Plus size={14} /> YENİ KALECİ
                </button>
            </div>

            <div className="space-y-2">
                {adminGoalkeepers.map(gk => (
                    <div key={gk.id} className="bg-[#161B22] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all">
                        {/* Card header */}
                        <div className="flex gap-3">
                            <div className="relative flex-shrink-0">
                                <img src={gk.avatar} className="w-16 h-16 rounded-xl object-cover border border-white/10 bg-gray-800" referrerPolicy="no-referrer" />
                                {gk.isElite && <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-[8px]">⭐</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <p className="font-black text-white uppercase">{gk.name}</p>
                                    {gk.isElite && <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[8px] font-black rounded">ELITE</span>}
                                </div>
                                <p className="text-[11px] text-gray-500 mb-2">{gk.style} • {gk.age} yaş • {gk.height}</p>
                                {/* Key stats inline */}
                                <div className="flex gap-3 text-[10px]">
                                    <span className="flex items-center gap-1 text-yellow-400"><Star size={9} fill="currentColor" /><span className="font-black">{gk.rating}</span></span>
                                    <span className="flex items-center gap-1 text-green-400"><Wallet size={9} /><span className="font-black">₺{gk.fee}/maç</span></span>
                                    <span className="flex items-center gap-1 text-blue-400"><Activity size={9} /><span className="font-black">{gk.matchCount ?? 0} maç</span></span>
                                    <span className="flex items-center gap-1 text-purple-400"><Shield size={9} /><span className="font-black">%{gk.stats?.savePercentage ?? '-'}</span></span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                                <button onClick={() => openEdit(gk)} className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center hover:bg-blue-500/20"><Edit3 size={13} /></button>
                                <button onClick={() => { deleteGoalkeeper(gk.id); toast(`🗑️ ${gk.name} silindi`); }} className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
                            </div>
                        </div>
                        {/* Earnings summary */}
                        <div className="grid grid-cols-3 gap-2 mt-3">
                            {[
                                { label: 'Toplam Kazanç', value: `₺${((gk.matchCount ?? 0) * gk.fee).toLocaleString('tr')}`, color: 'text-green-400' },
                                { label: 'Gol Yememe', value: `${gk.stats?.cleanSheets ?? 0} maç`, color: 'text-blue-400' },
                                { label: 'Penaltı Kurtarma', value: `%${gk.stats?.penaltySaveRate ?? '-'}`, color: 'text-purple-400' },
                            ].map(s => (
                                <div key={s.label} className="bg-black/30 rounded-xl p-2 text-center border border-white/5">
                                    <p className="text-[8px] text-gray-600 uppercase mb-0.5">{s.label}</p>
                                    <p className={`text-xs font-black ${s.color}`}>{s.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <AnimatePresence>
                {modal.show && (
                    <M title={modal.gk ? `Kaleci Düzenle` : 'Yeni Kaleci Ekle'} subtitle={modal.gk?.name} onClose={() => setModal({ show: false })} onSave={save} saving={saving}>
                        <SH icon={<UploadCloud size={12} />} label="Fotoğraf & Kimlik" color="red" />
                        <PhotoArea url={(f as any).avatar || ''} onChange={url => setF(prev => ({ ...prev, avatar: url }))} folder="goalkeepers" />
                        <div className="grid grid-cols-2 gap-3">
                            <F label="İsim Soyisim"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Tam adı..." /></F>
                            <F label="Boy"><Input value={f.height} onChange={e => setF({ ...f, height: e.target.value })} placeholder="1.90m" /></F>
                            <F label="Yaş"><Input type="number" value={f.age} onChange={e => setF({ ...f, age: e.target.value })} /></F>
                            <F label="Oyun Stili">
                                <Sel value={f.style} onChange={e => setF({ ...f, style: e.target.value })}>
                                    <option>Shot-Stopper</option><option>Sweeper</option><option>Pençe</option><option>Komutan</option><option>Refleks</option>
                                </Sel>
                            </F>
                        </div>
                        <F label="Konum / Çalışma Bölgesi"><Input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} placeholder="İstanbul, Beşiktaş..." /></F>
                        <F label="Biyografi"><TA value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} /></F>

                        <SH icon={<Wallet size={12} />} label="Ücret & İstatistik" color="green" />
                        <div className="grid grid-cols-2 gap-3">
                            <F label="Maç Başı Ücret (₺)" hint="Her maçtan kazanacağı net tutar">
                                <Input type="number" value={f.fee} onChange={e => setF({ ...f, fee: e.target.value })} className="text-green-400 font-mono" />
                            </F>
                            <F label="Rating (0-5)" hint="Kullanıcı değerlendirmesi">
                                <Input type="number" step="0.1" min="0" max="5" value={f.rating} onChange={e => setF({ ...f, rating: e.target.value })} />
                            </F>
                            <F label="Tamamlanan Maç Sayısı">
                                <Input type="number" value={f.matchCount} onChange={e => setF({ ...f, matchCount: e.target.value })} />
                            </F>
                            <F label="Gol Yememe (Maç)">
                                <Input type="number" value={f.cleanSheets} onChange={e => setF({ ...f, cleanSheets: e.target.value })} />
                            </F>
                            <F label="Kurtarma Yüzdesi (%)">
                                <Input value={f.savePercentage} onChange={e => setF({ ...f, savePercentage: e.target.value })} placeholder="85" />
                            </F>
                            <F label="Penaltı Kurtarma (%)">
                                <Input value={f.penaltySaveRate} onChange={e => setF({ ...f, penaltySaveRate: e.target.value })} placeholder="30" />
                            </F>
                        </div>

                        <SH icon={<Target size={12} />} label="Beceri Puanları (0-100)" color="purple" />
                        <div className="bg-black/30 rounded-2xl p-4 border border-white/5 space-y-1">
                            {[
                                { key: 'reflexes', label: 'Refleksler', color: 'yellow' },
                                { key: 'diving', label: 'Dalış', color: 'blue' },
                                { key: 'positioning', label: 'Pozisyon', color: 'green' },
                                { key: 'distribution', label: 'Dağıtım', color: 'purple' },
                            ].map(s => (
                                <div key={s.key} className="flex items-center gap-3">
                                    <span className="text-[10px] text-gray-400 w-28 font-bold uppercase shrink-0">{s.label}</span>
                                    <input type="range" min="0" max="100" value={(f as any)[s.key]}
                                        onChange={e => setF(prev => ({ ...prev, [s.key]: e.target.value }))}
                                        className="flex-1 accent-red-500" />
                                    <span className={`text-xs font-black text-${s.color}-400 w-8 text-right`}>{(f as any)[s.key]}</span>
                                </div>
                            ))}
                        </div>

                        <SH icon={<Award size={12} />} label="Statü" color="yellow" />
                        <div onClick={() => setF(prev => ({ ...prev, isElite: !(prev as any).isElite }))}
                            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${(f as any).isElite ? 'border-yellow-500/40 bg-yellow-500/10' : 'border-white/5 bg-black/20 hover:bg-white/5'}`}>
                            <div>
                                <p className={`text-sm font-black ${(f as any).isElite ? 'text-yellow-400' : 'text-white'}`}>⭐ ELITE Statüsü</p>
                                <p className="text-[9px] text-gray-500 mt-0.5">Altın rozet, listedeki öncelikli sıralama</p>
                            </div>
                            <div className={`w-11 h-6 rounded-full flex items-center transition-all px-1 ${(f as any).isElite ? 'bg-yellow-500' : 'bg-white/10'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white shadow transition-all ${(f as any).isElite ? 'translate-x-5' : ''}`} />
                            </div>
                        </div>
                    </M>
                )}
            </AnimatePresence>
        </div>
    );
};

// ══════════════════════════════════════════════════════════
// REFEREE TAB
// ══════════════════════════════════════════════════════════
export const RefereeTab: React.FC = () => {
    const { adminReferees, addReferee, updateReferee, deleteReferee } = useAppStore();
    const [modal, setModal] = useState<{ show: boolean; ref?: Referee }>({ show: false });
    const [saving, setSaving] = useState(false);
    const { show: toast, Toast } = useToast();

    const blank = () => ({
        name: '', fee: '', bio: '', style: 'Otoriter', level: 'Bölgesel', avatar: '',
        isElite: false, rating: '4.5', matchCount: '0', avgCards: '3.5',
        avgDistance: '10', authority: '85', fitness: '85', communication: '85',
        location: 'İstanbul'
    });
    const [f, setF] = useState(blank());

    const openAdd = () => { setF(blank()); setModal({ show: true }); };
    const openEdit = (ref: Referee) => {
        setF({
            name: ref.name, fee: String(ref.fee), bio: ref.bio, style: ref.style,
            level: ref.level, avatar: ref.avatar, isElite: ref.isElite ?? false,
            rating: String(ref.rating), matchCount: String(ref.matchCount ?? 0),
            avgCards: String(ref.stats?.avgCards ?? 3.5), avgDistance: String((ref.stats?.avgDistance ?? '10km').replace('km', '')),
            authority: String(ref.stats?.authority ?? 85), fitness: String(ref.stats?.fitness ?? 85),
            communication: String(ref.stats?.communication ?? 85),
            location: (ref.preferredZones ?? ['İstanbul'])[0] ?? 'İstanbul'
        } as any);
        setModal({ show: true, ref });
    };

    const save = async () => {
        if (!f.name) return;
        setSaving(true);
        const base: Referee = {
            id: modal.ref?.id || `ref-${Date.now()}`,
            name: f.name, fee: +f.fee || 0, bio: f.bio, style: f.style, level: f.level,
            avatar: f.avatar || `https://i.pravatar.cc/150?u=${Date.now()}`,
            isElite: (f as any).isElite, rating: +f.rating, matchCount: +f.matchCount,
            coordinates: { lat: 41.058, lng: 29.002 }, preferredZones: [f.location],
            stats: { avgCards: +f.avgCards, avgDistance: `${f.avgDistance}km`, authority: +f.authority, fitness: +f.fitness, communication: +f.communication },
            reviews: []
        };
        if (modal.ref) await updateReferee(base);
        else await addReferee(base);
        setSaving(false);
        toast(`✅ ${f.name} ${modal.ref ? 'güncellendi' : 'eklendi'} ve Firebase'e kaydedildi`);
        setModal({ show: false });
    };

    return (
        <div>
            <Toast />
            <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-black uppercase tracking-tighter">Hakemler <span className="text-red-400 text-sm">({adminReferees.length})</span></h2>
                <button onClick={openAdd} className="h-10 px-4 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all">
                    <Plus size={14} /> YENİ HAKEM
                </button>
            </div>

            <div className="space-y-2">
                {adminReferees.map(ref => (
                    <div key={ref.id} className="bg-[#161B22] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all">
                        <div className="flex gap-3">
                            <div className="relative flex-shrink-0">
                                <img src={ref.avatar} className="w-16 h-16 rounded-xl object-cover border border-white/10 bg-gray-800" referrerPolicy="no-referrer" />
                                {ref.isElite && <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-[8px]">⚡</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <p className="font-black text-white uppercase">{ref.name}</p>
                                    {ref.isElite && <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[8px] font-black rounded">ELITE</span>}
                                </div>
                                <p className="text-[11px] text-gray-500 mb-2">{ref.level} • {ref.style}</p>
                                <div className="flex gap-3 text-[10px]">
                                    <span className="flex items-center gap-1 text-yellow-400"><Star size={9} fill="currentColor" /><span className="font-black">{ref.rating}</span></span>
                                    <span className="flex items-center gap-1 text-green-400"><Wallet size={9} /><span className="font-black">₺{ref.fee}/maç</span></span>
                                    <span className="flex items-center gap-1 text-blue-400"><Activity size={9} /><span className="font-black">{ref.matchCount ?? 0} maç</span></span>
                                    <span className="flex items-center gap-1 text-red-400"><MapPin size={9} /><span className="font-black">{(ref.preferredZones ?? ['?'])[0]}</span></span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                                <button onClick={() => openEdit(ref)} className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center hover:bg-blue-500/20"><Edit3 size={13} /></button>
                                <button onClick={() => { deleteReferee(ref.id); toast(`🗑️ ${ref.name} silindi`); }} className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                            {[
                                { label: 'Toplam Kazanç', value: `₺${((ref.matchCount ?? 0) * ref.fee).toLocaleString('tr')}`, color: 'text-green-400' },
                                { label: 'Ort. Kart', value: `${ref.stats?.avgCards ?? '-'}`, color: 'text-yellow-400' },
                                { label: 'Oran. Mesafe', value: `${ref.stats?.avgDistance ?? '-'}`, color: 'text-purple-400' },
                            ].map(s => (
                                <div key={s.label} className="bg-black/30 rounded-xl p-2 text-center border border-white/5">
                                    <p className="text-[8px] text-gray-600 uppercase mb-0.5">{s.label}</p>
                                    <p className={`text-xs font-black ${s.color}`}>{s.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <AnimatePresence>
                {modal.show && (
                    <M title={modal.ref ? 'Hakem Düzenle' : 'Yeni Hakem Ekle'} subtitle={modal.ref?.name} onClose={() => setModal({ show: false })} onSave={save} saving={saving}>
                        <SH icon={<UploadCloud size={12} />} label="Fotoğraf & Kimlik" color="blue" />
                        <PhotoArea url={(f as any).avatar || ''} onChange={url => setF(prev => ({ ...prev, avatar: url }))} folder="referees" />
                        <div className="grid grid-cols-2 gap-3">
                            <F label="İsim Soyisim"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></F>
                            <F label="Kategori/Seviye">
                                <Sel value={f.level} onChange={e => setF({ ...f, level: e.target.value })}>
                                    <option>Başlangıç</option><option>Bölgesel</option><option>Ulusal</option><option>Süper Lig</option><option>FIFA</option>
                                </Sel>
                            </F>
                            <F label="Yönetim Stili">
                                <Sel value={f.style} onChange={e => setF({ ...f, style: e.target.value })}>
                                    <option>Otoriter</option><option>İletişimci</option><option>Sert</option><option>Dengeli</option>
                                </Sel>
                            </F>
                            <F label="Konum / Bölge"><Input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} placeholder="İstanbul..." /></F>
                        </div>
                        <F label="Biyografi"><TA value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} /></F>

                        <SH icon={<Wallet size={12} />} label="Ücret & İstatistik" color="green" />
                        <div className="grid grid-cols-2 gap-3">
                            <F label="Maç Başı Ücret (₺)"><Input type="number" value={f.fee} onChange={e => setF({ ...f, fee: e.target.value })} className="text-green-400 font-mono" /></F>
                            <F label="Rating (0-5)"><Input type="number" step="0.1" min="0" max="5" value={f.rating} onChange={e => setF({ ...f, rating: e.target.value })} /></F>
                            <F label="Tamamlanan Maç"><Input type="number" value={f.matchCount} onChange={e => setF({ ...f, matchCount: e.target.value })} /></F>
                            <F label="Ort. Kart (maç başı)"><Input type="number" step="0.1" value={f.avgCards} onChange={e => setF({ ...f, avgCards: e.target.value })} /></F>
                            <F label="Ort. Mesafe (km)"><Input type="number" value={f.avgDistance} onChange={e => setF({ ...f, avgDistance: e.target.value })} /></F>
                        </div>

                        <SH icon={<TrendingUp size={12} />} label="Performans Puanları (0-100)" color="purple" />
                        <div className="bg-black/30 rounded-2xl p-4 border border-white/5 space-y-1">
                            {[
                                { key: 'authority', label: 'Otorite', color: 'red' },
                                { key: 'fitness', label: 'Kondisyon', color: 'green' },
                                { key: 'communication', label: 'İletişim', color: 'blue' },
                            ].map(s => (
                                <div key={s.key} className="flex items-center gap-3">
                                    <span className="text-[10px] text-gray-400 w-24 font-bold uppercase shrink-0">{s.label}</span>
                                    <input type="range" min="0" max="100" value={(f as any)[s.key]}
                                        onChange={e => setF(prev => ({ ...prev, [s.key]: e.target.value }))}
                                        className="flex-1 accent-red-500" />
                                    <span className={`text-xs font-black text-${s.color}-400 w-8 text-right`}>{(f as any)[s.key]}</span>
                                </div>
                            ))}
                        </div>

                        <SH icon={<Award size={12} />} label="Statü" color="blue" />
                        <div onClick={() => setF(prev => ({ ...prev, isElite: !(prev as any).isElite }))}
                            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${(f as any).isElite ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/5 bg-black/20 hover:bg-white/5'}`}>
                            <div>
                                <p className={`text-sm font-black ${(f as any).isElite ? 'text-blue-400' : 'text-white'}`}>⚡ ELITE Statüsü</p>
                                <p className="text-[9px] text-gray-500 mt-0.5">Mavi rozet, arama önceliği</p>
                            </div>
                            <div className={`w-11 h-6 rounded-full flex items-center transition-all px-1 ${(f as any).isElite ? 'bg-blue-500' : 'bg-white/10'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white shadow transition-all ${(f as any).isElite ? 'translate-x-5' : ''}`} />
                            </div>
                        </div>
                    </M>
                )}
            </AnimatePresence>
        </div>
    );
};

// ══════════════════════════════════════════════════════════
// PITCH TAB (kept with enhancements)
// ══════════════════════════════════════════════════════════
export const PitchTab: React.FC = () => {
    const { adminPitches, addPitch, updatePitch, deletePitch } = useAppStore();
    const [modal, setModal] = useState<{ show: boolean; pitch?: Pitch }>({ show: false });
    const [saving, setSaving] = useState(false);
    const { show: toast, Toast } = useToast();

    const blank = () => ({ name: '', district: '', location: '', pricePerPerson: '', totalPrice: '', image: '', amenities: '', lighting: '80', grassQuality: '80' });
    const [f, setF] = useState(blank());

    const openAdd = () => { setF(blank()); setModal({ show: true }); };
    const openEdit = (p: Pitch) => {
        setF({ name: p.name, district: p.district, location: p.location, pricePerPerson: String(p.pricePerPerson), totalPrice: String(p.totalPrice), image: p.image, amenities: p.amenities.join(', '), lighting: String(p.lighting), grassQuality: String(p.grassQuality) });
        setModal({ show: true, pitch: p });
    };

    const save = async () => {
        if (!f.name) return;
        setSaving(true);
        const id = modal.pitch?.id || `pitch-${Date.now()}`;
        const base: Pitch = { id, name: f.name, district: f.district, location: f.location, pricePerPerson: +f.pricePerPerson || 0, totalPrice: +f.totalPrice || 0, image: f.image || 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1000', images: [], distance: '0 km', rating: 4.5, googleRating: 4.4, googleReviews: 0, amenities: f.amenities.split(',').map(s => s.trim()).filter(Boolean), lighting: +f.lighting || 80, grassQuality: +f.grassQuality || 80, lockerRoomQuality: 80, goalQuality: 80, occupancy: 50, coordinates: { lat: 41.058, lng: 29.002 }, slots: [{ time: '19:00', status: 'available' }, { time: '21:00', status: 'available' }] };
        if (modal.pitch) await updatePitch({ ...modal.pitch, ...base });
        else await addPitch(base);
        setSaving(false);
        toast(`✅ ${f.name} ${modal.pitch ? 'güncellendi' : 'eklendi'}`);
        setModal({ show: false });
    };

    return (
        <div>
            <Toast />
            <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-black uppercase tracking-tighter">Sahalar <span className="text-red-400 text-sm">({adminPitches.length})</span></h2>
                <button onClick={openAdd} className="h-10 px-4 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all">
                    <Plus size={14} /> YENİ SAHA
                </button>
            </div>
            <div className="space-y-2">
                {adminPitches.map(p => (
                    <div key={p.id} className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all">
                        <div className="relative h-20">
                            <img src={p.image} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-r from-black/85 to-transparent flex items-center p-4 gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black text-white uppercase truncate">{p.name}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">{p.district} • ₺{p.pricePerPerson}/kişi • ⭐{p.rating}</p>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[9px] text-green-400">🌿 {p.grassQuality}%</span>
                                        <span className="text-[9px] text-yellow-400">💡 {p.lighting}%</span>
                                    </div>
                                </div>
                                <div className="flex gap-1.5 items-center">
                                    <button 
                                        onClick={async () => {
                                            const isCurrentlyApproved = p.isApproved !== false;
                                            const updated = { ...p, isApproved: !isCurrentlyApproved };
                                            await updatePitch(updated);
                                            toast(`✅ ${p.name} ${!isCurrentlyApproved ? 'onaylandı' : 'askıya alındı'}`);
                                        }}
                                        className={`px-3 h-9 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all backdrop-blur-sm ${
                                            p.isApproved !== false 
                                            ? 'bg-green-500/10 text-green-400 border border-green-500/25 hover:bg-green-500/20 shadow-[0_0_10px_rgba(57,255,20,0.1)]' 
                                            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 hover:bg-yellow-500/20 animate-pulse'
                                        }`}
                                    >
                                        {p.isApproved !== false ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                                        {p.isApproved !== false ? 'ONAYLI' : 'ONAYLA'}
                                    </button>
                                    <button onClick={() => openEdit(p)} className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center hover:bg-blue-500/30 backdrop-blur-sm"><Edit3 size={13} /></button>
                                    <button onClick={() => { deletePitch(p.id); toast(`🗑️ ${p.name} silindi`); }} className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/30 backdrop-blur-sm"><Trash2 size={13} /></button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <AnimatePresence>
                {modal.show && (
                    <M title={modal.pitch ? 'Saha Düzenle' : 'Yeni Saha Ekle'} subtitle={modal.pitch?.name} onClose={() => setModal({ show: false })} onSave={save} saving={saving}>
                        <PhotoArea url={f.image} onChange={url => setF(prev => ({ ...prev, image: url }))} folder="pitches" label="Saha Görseli" />
                        <div className="grid grid-cols-2 gap-3">
                            <F label="Saha Adı"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></F>
                            <F label="İlçe"><Input value={f.district} onChange={e => setF({ ...f, district: e.target.value })} /></F>
                            <F label="Kişi Başı (₺)"><Input type="number" value={f.pricePerPerson} onChange={e => setF({ ...f, pricePerPerson: e.target.value })} /></F>
                            <F label="Toplam (₺)"><Input type="number" value={f.totalPrice} onChange={e => setF({ ...f, totalPrice: e.target.value })} /></F>
                            <F label="Aydınlatma (0-100)"><Input type="number" value={f.lighting} onChange={e => setF({ ...f, lighting: e.target.value })} /></F>
                            <F label="Zemin (0-100)"><Input type="number" value={f.grassQuality} onChange={e => setF({ ...f, grassQuality: e.target.value })} /></F>
                        </div>
                        <F label="Tam Adres"><Input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></F>
                        <F label="Olanaklar (virgülle)"><Input value={f.amenities} onChange={e => setF({ ...f, amenities: e.target.value })} placeholder="Duş, Otopark, Kafe..." /></F>
                    </M>
                )}
            </AnimatePresence>
        </div>
    );
};
