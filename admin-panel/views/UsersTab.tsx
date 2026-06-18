import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Edit3, Check, X, Shield, Crown, Ban, UserCheck, Star, Wallet, ZapOff, Zap, UploadCloud, Loader2, Phone, Mail, Activity, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import { UserRole, AdminUser } from '../../types';
import { useImageUpload } from '../../hooks/useImageUpload';
import { fbBanUser, fbToggleUserPro } from '../../supabaseMutations';

// ── Helpers ──────────────────────────────────────────────────────────────────
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (p) => (
    <input {...p} className={`w-full h-11 bg-black/50 border border-white/10 rounded-xl px-4 text-sm text-white font-medium focus:outline-none focus:border-red-500/50 transition-all ${p.className || ''}`} />
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

const roleConfig: Record<string, { color: string; bg: string }> = {
    [UserRole.CAPTAIN]: { color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
    [UserRole.GOALKEEPER]: { color: 'text-green-400', bg: 'bg-green-500/20' },
    [UserRole.REFEREE]: { color: 'text-blue-400', bg: 'bg-blue-500/20' },
    [UserRole.PLAYER]: { color: 'text-gray-400', bg: 'bg-gray-500/20' },
    [UserRole.SUPER_ADMIN]: { color: 'text-red-400', bg: 'bg-red-500/20' },
    [UserRole.COMMUNITY_ADMIN]: { color: 'text-purple-400', bg: 'bg-purple-500/20' },
};

// ── Toast ─────────────────────────────────────────────────────────────────────
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

// ── Photo Upload Zone ─────────────────────────────────────────────────────────
const AvatarUpload: React.FC<{ url: string; onChange: (url: string) => void }> = ({ url, onChange }) => {
    const { uploadImage, uploading, progress } = useImageUpload('users');
    return (
        <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-shrink-0">
                {url
                    ? <img src={url} className="w-20 h-20 rounded-2xl object-cover border-2 border-white/10" />
                    : <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-600 to-purple-700 flex items-center justify-center text-white font-black text-2xl">?</div>
                }
                <label className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 hover:opacity-100 transition-all flex flex-col items-center justify-center cursor-pointer">
                    {uploading
                        ? <><Loader2 size={14} className="animate-spin text-white" /><span className="text-[9px] text-white mt-1">%{Math.round(progress)}</span></>
                        : <><UploadCloud size={14} className="text-white" /><span className="text-[9px] text-white mt-1">Yükle</span></>
                    }
                    <input type="file" className="hidden" accept="image/*" disabled={uploading}
                        onChange={async e => { const f = e.target.files?.[0]; if (f) { const u = await uploadImage(f); if (u) onChange(u); } }} />
                </label>
            </div>
            <div className="flex-1">
                <p className="text-[10px] text-gray-500 mb-2 font-bold uppercase tracking-widest">Avatar URL</p>
                <Input value={url} onChange={e => onChange(e.target.value)} placeholder="https://..." />
            </div>
        </div>
    );
};

// ── Toggle Switch ────────────────────────────────────────────────────────────
const Toggle: React.FC<{ value: boolean; onChange: () => void; label: string; desc?: string; danger?: boolean; color?: string }> = ({ value, onChange, label, desc, danger, color = 'green' }) => {
    const colorMap: Record<string, string> = {
        green: 'bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.3)]',
        purple: 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.3)]',
        teal: 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.3)]',
        blue: 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]',
    };
    const activeBg = danger ? 'bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : (colorMap[color] || 'bg-green-500');

    return (
        <motion.div 
            onClick={onChange} 
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all mb-2 gap-4 min-w-0 select-none ${danger ? 'border-red-900/30 bg-red-900/10 hover:bg-red-900/15' : 'border-white/5 bg-black/20 hover:bg-white/5'}`}
        >
            <div className="flex-1 min-w-0 pr-2">
                <p className={`text-sm font-bold truncate ${danger ? 'text-red-400' : 'text-white'}`}>{label}</p>
                {desc && <p className="text-[9px] text-gray-500 mt-0.5 truncate" title={desc}>{desc}</p>}
            </div>
            <div className={`w-11 h-6 rounded-full relative flex items-center transition-colors duration-300 flex-shrink-0 ${value ? activeBg : 'bg-white/10'}`}>
                <motion.div 
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="w-4 h-4 rounded-full bg-white shadow absolute left-1"
                    style={{ transform: value ? 'translateX(20px)' : 'translateX(0px)' }}
                />
            </div>
        </motion.div>
    );
};

// ══════════════════════════════════════════════════════════════════════════════
export const UsersTab: React.FC = () => {
    const { adminUsers, updateUser, banUser, unbanUser, toggleUserPro, verifyUser, addUser } = useAppStore();
    const [search, setSearch] = useState('');
    const [detailModal, setDetailModal] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
    const [editModal, setEditModal] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
    const [addModal, setAddModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const { show: toast, Toast } = useToast();

    const blankNew = () => ({
        name: '', email: '', phone: '', role: UserRole.PLAYER as UserRole,
        wallet: '0', rating: '4.0', matchCount: '0', joinDate: new Date().toLocaleDateString('tr'),
        avatar: '', isPro: false, isVerified: false, isBanned: false
    });
    const [newF, setNewF] = useState(blankNew());
    const [editF, setEditF] = useState<AdminUser | null>(null);

    const filtered = adminUsers.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    const handleAdd = async () => {
        if (!newF.name || !newF.email) return;
        setSaving(true);
        await addUser({
            id: `u-${Date.now()}`, name: newF.name, email: newF.email, phone: newF.phone,
            avatar: newF.avatar || `https://i.pravatar.cc/150?u=${Date.now()}`,
            role: newF.role, rating: +newF.rating || 4.0, isVerified: newF.isVerified,
            isBanned: newF.isBanned, isPro: newF.isPro,
            joinDate: newF.joinDate || new Date().toLocaleDateString('tr'),
            matchCount: +newF.matchCount || 0, wallet: +newF.wallet || 0
        });
        setSaving(false);
        toast(`✅ ${newF.name} eklendi`);
        setAddModal(false);
        setNewF(blankNew());
    };

    const handleSaveEdit = async () => {
        if (!editF) return;
        setSaving(true);
        await updateUser(editF);
        setSaving(false);
        toast(`✅ ${editF.name} güncellendi`);
        setEditModal({ open: false, user: null });
    };

    const handleBan = async (u: AdminUser) => {
        if (u.isBanned) {
            await fbBanUser(u.id, false);
            unbanUser(u.id);
            toast(`✅ ${u.name} yasağı kaldırıldı`);
        } else {
            await fbBanUser(u.id, true);
            banUser(u.id);
            toast(`🚫 ${u.name} banlandı`, false);
        }
    };

    const handlePro = async (u: AdminUser) => {
        await fbToggleUserPro(u.id, !u.isPro);
        toggleUserPro(u.id);
        toast(u.isPro ? `📉 ${u.name} PRO kaldırıldı` : `⭐ ${u.name} PRO yapıldı`);
    };

    const openEdit = (u: AdminUser) => { setEditF({ ...u }); setEditModal({ open: true, user: u }); };

    const ModalFooter = ({ onSave }: { onSave: () => void }) => (
        <div className="flex gap-3 pt-1">
            <button onClick={() => { setAddModal(false); setEditModal({ open: false, user: null }); }} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 border border-white/10 hover:bg-white/5 transition-all">İptal</button>
            <button onClick={onSave} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50">
                {saving ? <><Loader2 size={13} className="animate-spin" />Kaydediliyor...</> : <><Check size={13} />KAYDET & YAYINLA</>}
            </button>
        </div>
    );

    return (
        <div>
            <Toast />
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-black uppercase tracking-tighter">Kullanıcılar <span className="text-red-400 text-sm">({adminUsers.length})</span></h2>
                <button onClick={() => { setNewF(blankNew()); setAddModal(true); }}
                    className="h-10 px-4 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all">
                    <Plus size={14} /> YENİ KULLANICI
                </button>
            </div>

            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="İsim veya e-posta ile ara..."
                className="w-full h-11 bg-black/50 border border-white/10 rounded-xl px-4 text-sm text-white mb-4 focus:outline-none focus:border-red-500/50 transition-all" />

            <div className="space-y-2">
                {filtered.map(u => {
                    const rc = roleConfig[u.role] || roleConfig[UserRole.PLAYER];
                    return (
                        <div key={u.id} className={`bg-[#161B22] border rounded-2xl p-4 transition-all ${u.isBanned ? 'border-red-900/40 opacity-70' : 'border-white/5 hover:border-white/10'}`}>
                            {/* User header */}
                            <div className="flex items-center gap-3">
                                <div className="relative flex-shrink-0">
                                    <img src={u.avatar} className="w-12 h-12 rounded-xl object-cover border border-white/10 bg-gray-800" referrerPolicy="no-referrer" />
                                    {u.isBanned && <div className="absolute inset-0 rounded-xl bg-red-900/70 flex items-center justify-center"><Ban size={14} className="text-red-400" /></div>}
                                    {u.isPro && !u.isBanned && <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center text-[7px] font-black text-white">P</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="text-sm font-black text-white">{u.name}</p>
                                        <span className={`px-1.5 py-0.5 text-[8px] font-black rounded uppercase ${rc.bg} ${rc.color}`}>{u.role}</span>
                                        {u.isPro && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[8px] font-black rounded">PRO</span>}
                                        {u.isVerified && <span className="px-1.5 py-0.5 bg-teal-500/20 text-teal-400 text-[8px] font-black rounded">✓</span>}
                                    </div>
                                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{u.email}</p>
                                </div>
                                {/* Rating + wallet quick view */}
                                <div className="text-right shrink-0">
                                    <div className="flex items-center gap-1 justify-end">
                                        <Star size={10} className="text-yellow-400 fill-yellow-400" />
                                        <span className="text-xs font-black text-white">{u.rating}</span>
                                    </div>
                                    <span className="text-[10px] text-yellow-400 font-mono font-black">₺{(u.wallet ?? 0).toLocaleString('tr')}</span>
                                </div>
                            </div>

                            {/* Stats row */}
                            <div className="grid grid-cols-4 gap-2 mt-3">
                                {[
                                    { label: 'Maç', value: u.matchCount, icon: Activity },
                                    { label: 'Cüzdan', value: `₺${(u.wallet ?? 0).toLocaleString('tr')}`, icon: Wallet, green: true },
                                    { label: 'Katılım', value: u.joinDate, icon: Calendar },
                                    { label: 'Rating', value: u.rating, icon: Star, yellow: true },
                                ].map(s => (
                                    <div key={s.label} className="bg-black/30 rounded-xl p-2 text-center border border-white/5">
                                        <p className="text-[8px] text-gray-600 uppercase mb-0.5">{s.label}</p>
                                        <p className={`text-xs font-black ${s.green ? 'text-yellow-400' : s.yellow ? 'text-yellow-400' : 'text-white'}`}>{s.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-1.5 mt-3 flex-wrap">
                                <button onClick={() => openEdit(u)} className="flex-1 min-w-0 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all">
                                    <Edit3 size={11} /> Düzenle
                                </button>
                                {!u.isVerified && (
                                    <button onClick={() => { verifyUser(u.id); toast(`✅ ${u.name} doğrulandı`); }} className="flex-1 min-w-0 h-8 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all">
                                        <UserCheck size={11} /> Doğrula
                                    </button>
                                )}
                                <button onClick={() => handlePro(u)} className="flex-1 min-w-0 h-8 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all">
                                    {u.isPro ? <><ZapOff size={11} />PRO Kaldır</> : <><Zap size={11} />PRO Yap</>}
                                </button>
                                <button onClick={() => handleBan(u)} className={`flex-1 min-w-0 h-8 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all ${u.isBanned ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}>
                                    {u.isBanned ? <><Check size={11} />Yasağı Kaldır</> : <><Ban size={11} />Banla</>}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── ADD MODAL ── */}
            <AnimatePresence>
                {addModal && (
                    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setAddModal(false)}>
                        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="w-full max-w-xl bg-[#0D1117] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col"
                            onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center px-5 py-4 border-b border-white/5 bg-[#121820] shrink-0">
                                <div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Yeni Kullanıcı Ekle</h3>
                                    <p className="text-[10px] text-gray-500 mt-0.5">Firebase'e direkt kullanıcı ekle</p>
                                </div>
                                <button onClick={() => setAddModal(false)} className="w-8 h-8 rounded-full bg-white/5 text-gray-400 hover:text-white flex items-center justify-center"><X size={15} /></button>
                            </div>
                            <div className="overflow-y-auto p-5 flex-1 custom-scrollbar">
                                <AvatarUpload url={newF.avatar} onChange={url => setNewF(prev => ({ ...prev, avatar: url }))} />
                                <div className="grid grid-cols-2 gap-3">
                                    <F label="İsim Soyisim"><Input value={newF.name} onChange={e => setNewF({ ...newF, name: e.target.value })} placeholder="Tam adı..." /></F>
                                    <F label="Kayıt Tarihi"><Input value={newF.joinDate} onChange={e => setNewF({ ...newF, joinDate: e.target.value })} /></F>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <F label="E-posta"><Input value={newF.email} onChange={e => setNewF({ ...newF, email: e.target.value })} /></F>
                                    <F label="Telefon"><Input value={newF.phone} onChange={e => setNewF({ ...newF, phone: e.target.value })} placeholder="+90 5xx..." /></F>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <F label="Rol">
                                        <Sel value={newF.role} onChange={e => setNewF({ ...newF, role: e.target.value as UserRole })}>
                                            {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                                        </Sel>
                                    </F>
                                    <F label="Cüzdan Bakiyesi (₺)"><Input type="number" value={newF.wallet} onChange={e => setNewF({ ...newF, wallet: e.target.value })} className="text-yellow-400 font-mono" /></F>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <F label="Rating (0-5)" hint="Başlangıç puanı"><Input type="number" step="0.1" min="0" max="5" value={newF.rating} onChange={e => setNewF({ ...newF, rating: e.target.value })} /></F>
                                    <F label="Başlangıç Maç Sayısı"><Input type="number" value={newF.matchCount} onChange={e => setNewF({ ...newF, matchCount: e.target.value })} /></F>
                                </div>
                                <div className="mt-2 space-y-2">
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2">Hesap Özellikleri</p>
                                    <Toggle label="PRO Üyelik" desc="Özel maçlar ve indirimler" value={newF.isPro} onChange={() => setNewF(p => ({ ...p, isPro: !p.isPro }))} color="purple" />
                                    <Toggle label="Doğrulanmış Hesap" desc="Mavi tik rozeti" value={newF.isVerified} onChange={() => setNewF(p => ({ ...p, isVerified: !p.isVerified }))} color="teal" />
                                    <Toggle label="Hesabı Banla" desc="Kullanıcı sisteme giremez" value={newF.isBanned} onChange={() => setNewF(p => ({ ...p, isBanned: !p.isBanned }))} danger />
                                </div>
                            </div>
                            <div className="p-4 border-t border-white/5 bg-[#121820] shrink-0">
                                <ModalFooter onSave={handleAdd} />
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── EDIT MODAL ── */}
            <AnimatePresence>
                {editModal.open && editF && (
                    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setEditModal({ open: false, user: null })}>
                        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="w-full max-w-xl bg-[#0D1117] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col"
                            onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center px-5 py-4 border-b border-white/5 bg-[#121820] shrink-0">
                                <div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Kullanıcı Düzenle</h3>
                                    <p className="text-[10px] text-gray-500 mt-0.5">{editF.name} — ID: {editF.id}</p>
                                </div>
                                <button onClick={() => setEditModal({ open: false, user: null })} className="w-8 h-8 rounded-full bg-white/5 text-gray-400 hover:text-white flex items-center justify-center"><X size={15} /></button>
                            </div>
                            <div className="overflow-y-auto p-5 flex-1 custom-scrollbar">
                                <AvatarUpload url={editF.avatar} onChange={url => setEditF(prev => prev ? { ...prev, avatar: url } : null)} />
                                <div className="grid grid-cols-2 gap-3">
                                    <F label="İsim Soyisim"><Input value={editF.name} onChange={e => setEditF(p => p ? { ...p, name: e.target.value } : null)} /></F>
                                    <F label="Kayıt Tarihi"><Input value={editF.joinDate} onChange={e => setEditF(p => p ? { ...p, joinDate: e.target.value } : null)} /></F>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <F label="E-posta"><Input value={editF.email} onChange={e => setEditF(p => p ? { ...p, email: e.target.value } : null)} /></F>
                                    <F label="Telefon"><Input value={editF.phone} onChange={e => setEditF(p => p ? { ...p, phone: e.target.value } : null)} /></F>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <F label="Rol">
                                        <Sel value={editF.role} onChange={e => setEditF(p => p ? { ...p, role: e.target.value as UserRole } : null)}>
                                            {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                                        </Sel>
                                    </F>
                                    <F label="Rating (0-5)"><Input type="number" step="0.1" min="0" max="5" value={editF.rating} onChange={e => setEditF(p => p ? { ...p, rating: +e.target.value } : null)} /></F>
                                </div>
                                {/* Wallet */}
                                <div className="p-4 bg-black/30 rounded-2xl border border-yellow-500/20 mb-3">
                                    <p className="text-[9px] font-black text-yellow-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Wallet size={11} /> CÜZDAN KONTROLÜ</p>
                                    <div className="grid grid-cols-2 gap-3 items-end">
                                        <F label="Bakiye (₺)" hint="Net tutar">
                                            <Input type="number" value={editF.wallet} onChange={e => setEditF(p => p ? { ...p, wallet: +e.target.value } : null)} className="text-yellow-400 font-mono text-base" />
                                        </F>
                                        <div className="flex gap-1.5 pb-3">
                                            <button onClick={() => setEditF(p => p ? { ...p, wallet: p.wallet + 100 } : null)} className="flex-1 h-11 bg-green-500/15 text-green-400 border border-green-500/20 rounded-xl text-xs font-black hover:bg-green-500/25 transition-all">+₺100</button>
                                            <button onClick={() => setEditF(p => p ? { ...p, wallet: p.wallet + 500 } : null)} className="flex-1 h-11 bg-green-500/15 text-green-400 border border-green-500/20 rounded-xl text-xs font-black hover:bg-green-500/25 transition-all">+₺500</button>
                                            <button onClick={() => setEditF(p => p ? { ...p, wallet: 0 } : null)} className="flex-1 h-11 bg-red-500/15 text-red-400 border border-red-500/20 rounded-xl text-xs font-black hover:bg-red-500/25 transition-all">0</button>
                                        </div>
                                    </div>
                                </div>
                                {/* Match stats */}
                                <F label="Tamamlanan Maç Sayısı" hint="Profilde görüntülenir">
                                    <Input type="number" value={editF.matchCount} onChange={e => setEditF(p => p ? { ...p, matchCount: +e.target.value } : null)} />
                                </F>
                                {/* Status toggles */}
                                <div className="mt-3 space-y-2">
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2">Hesap Durumları</p>
                                    <Toggle label="PRO Üyelik" desc="Özel maçlar ve indirimler" value={editF.isPro} onChange={() => setEditF(p => p ? { ...p, isPro: !p.isPro } : null)} color="purple" />
                                    <Toggle label="Doğrulanmış Hesap" desc="Mavi tik rozeti" value={editF.isVerified} onChange={() => setEditF(p => p ? { ...p, isVerified: !p.isVerified } : null)} color="teal" />
                                    <Toggle label="Hesabı Banla" desc="Kullanıcı sisteme giremez, aktif rezervasyonları iptal edilir" value={editF.isBanned} onChange={() => setEditF(p => p ? { ...p, isBanned: !p.isBanned } : null)} danger />
                                </div>
                            </div>
                            <div className="p-4 border-t border-white/5 bg-[#121820] shrink-0">
                                <ModalFooter onSave={handleSaveEdit} />
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
