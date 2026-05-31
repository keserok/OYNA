import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Edit3, Check, X, Bell, Send, ToggleLeft, ToggleRight, UploadCloud, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, AdminNotification } from '../../store';
import { MatchListing } from '../../types';
import { useImageUpload } from '../../hooks/useImageUpload';

const useToast = () => {
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const show = useCallback((text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 2200); }, []);
    const Toast = () => (
        <AnimatePresence>
            {msg && (
                <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`fixed top-4 right-4 z-[300] px-4 py-2.5 rounded-xl text-xs font-black shadow-2xl border backdrop-blur-sm flex items-center gap-2 ${msg.ok ? 'bg-green-900/90 border-green-500/30 text-green-300' : 'bg-red-900/90 border-red-500/30 text-red-300'}`}>
                    <Check size={12} className={msg.ok ? 'text-green-400' : 'text-red-400'} />{msg.text}
                </motion.div>
            )}
        </AnimatePresence>
    );
    return { show, Toast };
};

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (p) => (
    <input {...p} className="w-full h-11 bg-black/50 border border-white/10 rounded-xl px-4 text-sm text-white font-medium focus:outline-none focus:border-red-500/50 transition-all" />
);
const TA: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (p) => (
    <textarea {...p} className="w-full h-20 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-medium focus:outline-none focus:border-red-500/50 transition-all resize-none" />
);
const F: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="mb-3"><label className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">{label}</label>{children}</div>
);
const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }> = ({ children, ...p }) => (
    <select {...p} className="w-full h-11 bg-black/50 border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-red-500/50">{children}</select>
);

// ══════════════════════════════════════════
// MATCHES TAB
// ══════════════════════════════════════════
export const MatchesTab: React.FC = () => {
    const { adminMatches, addMatch, updateMatch, deleteMatch } = useAppStore();
    const [modal, setModal] = useState<{ show: boolean; type: 'add' | 'edit'; match?: MatchListing }>({ show: false, type: 'add' });
    const [f, setF] = useState({ title: '', location: '', time: '', date: 'Bugün', price: '', difficulty: 'Rahat', minRating: '3.0', image: '' });
    const { uploadImage, uploading, progress } = useImageUpload('matches');
    const { show: toast, Toast } = useToast();

    const difficultyColors: Record<string, string> = { 'Ciddi': 'text-red-400', 'Taktiksel': 'text-yellow-400', 'Rahat': 'text-green-400' };

    const openAdd = () => { setF({ title: '', location: '', time: '20:00', date: 'Bugün', price: '', difficulty: 'Rahat', minRating: '3.0', image: '' }); setModal({ show: true, type: 'add' }); };
    const openEdit = (m: MatchListing) => {
        setF({ title: m.title, location: m.location, time: m.time, date: m.date, price: String(m.price), difficulty: m.difficulty, minRating: String(m.minRating), image: m.image });
        setModal({ show: true, type: 'edit', match: m });
    };
    const save = () => {
        if (!f.title || !f.location) return;
        const base: MatchListing = {
            id: modal.match?.id || `ml-${Date.now()}`, title: f.title, location: f.location, time: f.time, date: f.date,
            price: +f.price || 200, difficulty: f.difficulty as any, minRating: +f.minRating || 3.0,
            image: f.image || 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&q=80&w=600',
            badges: [f.difficulty], missingPositions: [{ role: 'GK', count: 1 }, { role: 'DEF', count: 1 }],
            slots: [
                { id: 's1', role: 'GK', x: 50, y: 90, status: 'OPEN' }, { id: 's2', role: 'DEF', x: 30, y: 70, status: 'OPEN' },
                { id: 's3', role: 'MID', x: 50, y: 50, status: 'TAKEN' }, { id: 's4', role: 'FW', x: 50, y: 20, status: 'TAKEN' },
            ]
        };
        if (modal.type === 'add') { addMatch(base); toast('✅ Maç eklendi ve Firebase’e kaydedildi'); }
        else { updateMatch({ ...modal.match!, ...base }); toast('✅ Maç güncellendi'); }
        setModal({ show: false, type: 'add' });
    };

    return (
        <div>
            <Toast />
            <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-black uppercase tracking-tighter">Maçlar <span className="text-red-400 text-sm">({adminMatches.length})</span></h2>
                <button onClick={openAdd} className="h-10 px-4 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center gap-2"><Plus size={14} /> YENİ MAÇ</button>
            </div>
            <div className="space-y-2">
                {adminMatches.map(m => (
                    <div key={m.id} className="bg-[#161B22] border border-white/5 rounded-2xl p-4 flex gap-3 hover:border-white/10 transition-all">
                        <img src={m.image} className="w-16 h-14 rounded-xl object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-black text-white uppercase truncate">{m.title}</p>
                                <span className={`text-[9px] font-black uppercase ${difficultyColors[m.difficulty] || 'text-gray-400'}`}>{m.difficulty}</span>
                            </div>
                            <p className="text-[10px] text-gray-500">{m.location} • {m.date} {m.time} • ₺{m.price}</p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                                {m.missingPositions.map(pos => (
                                    <span key={pos.role} className="px-1.5 py-0.5 bg-white/5 text-gray-400 text-[8px] font-black rounded border border-white/5">{pos.role} ×{pos.count}</span>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                            <button onClick={() => openEdit(m)} className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center hover:bg-blue-500/20"><Edit3 size={13} /></button>
                            <button onClick={() => { if (confirm(`"${m.title}" silinsin mi?`)) deleteMatch(m.id); }} className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
                        </div>
                    </div>
                ))}
            </div>
            <AnimatePresence>{modal.show && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setModal({ show: false, type: 'add' })}>
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        className="w-full max-w-md bg-[#161B22] border border-white/10 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base font-black text-white uppercase">{modal.type === 'add' ? 'Yeni Maç' : 'Maç Düzenle'}</h3>
                            <button onClick={() => setModal({ show: false, type: 'add' })} className="w-8 h-8 rounded-full bg-white/5 text-gray-400 flex items-center justify-center"><X size={16} /></button>
                        </div>
                        <F label="Başlık"><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Akşam Maçı..." /></F>
                        <F label="Konum"><Input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} placeholder="Arena Beşiktaş" /></F>
                        <div className="grid grid-cols-2 gap-2">
                            <F label="Tarih"><Select value={f.date} onChange={e => setF({ ...f, date: e.target.value })}><option>Bugün</option><option>Yarın</option><option>Cuma</option><option>Cumartesi</option><option>Pazar</option></Select></F>
                            <F label="Saat"><Input value={f.time} onChange={e => setF({ ...f, time: e.target.value })} placeholder="20:00" /></F>
                            <F label="Katılım (₺)"><Input type="number" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></F>
                            <F label="Min. Rating"><Input type="number" step="0.1" value={f.minRating} onChange={e => setF({ ...f, minRating: e.target.value })} /></F>
                        </div>
                        <F label="Zorluk"><Select value={f.difficulty} onChange={e => setF({ ...f, difficulty: e.target.value })}><option value="Rahat">Rahat</option><option value="Taktiksel">Taktiksel</option><option value="Ciddi">Ciddi</option></Select></F>

                        <F label="Kapak Görseli">
                            <div className="relative group">
                                <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer transition-all ${uploading ? 'border-red-500/50 bg-red-500/10 cursor-not-allowed' : 'border-white/10 bg-black/50 hover:bg-black/80 hover:border-white/20'}`}>
                                    {uploading ? (
                                        <div className="flex flex-col items-center">
                                            <Loader2 size={24} className="text-red-400 animate-spin mb-2" />
                                            <span className="text-xs text-red-500 font-bold">% {progress.toFixed(0)} Yükleniyor...</span>
                                        </div>
                                    ) : f.image ? (
                                        <div className="relative w-full h-full p-1">
                                            <img src={f.image} className="w-full h-full object-cover rounded-lg" />
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                                <span className="text-white text-xs font-bold flex items-center gap-1"><UploadCloud size={14} /> Resmi Değiştir</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center">
                                            <UploadCloud size={24} className="text-gray-500 mb-2 group-hover:text-red-400 transition-colors" />
                                            <span className="text-xs text-gray-500 font-medium group-hover:text-gray-300">Tıklayıp Cihazdan Seç</span>
                                        </div>
                                    )}
                                    <input type="file" className="hidden" accept="image/*" disabled={uploading}
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const url = await uploadImage(file);
                                                if (url) setF(prev => ({ ...prev, image: url }));
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                        </F>
                        <button onClick={save} className="w-full h-12 mt-2 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black uppercase tracking-widest flex items-center justify-center gap-2"><Check size={16} /> KAYDET</button>
                    </motion.div>
                </div>
            )}</AnimatePresence>
        </div>
    );
};

// ══════════════════════════════════════════
// NOTIFICATIONS TAB
// ══════════════════════════════════════════
export const NotificationsTab: React.FC = () => {
    const { adminNotifications, addNotification, deleteNotification, toggleNotification } = useAppStore();
    const [showForm, setShowForm] = useState(false);
    const [f, setF] = useState({ title: '', body: '', type: 'INFO', targetAudience: 'ALL' });

    const typeColor: Record<string, string> = { INFO: 'text-blue-400 bg-blue-500/10', WARNING: 'text-yellow-400 bg-yellow-500/10', PROMO: 'text-purple-400 bg-purple-500/10', SYSTEM: 'text-red-400 bg-red-500/10' };

    const send = () => {
        if (!f.title || !f.body) return;
        addNotification({ id: `n-${Date.now()}`, title: f.title, body: f.body, type: f.type as any, targetAudience: f.targetAudience as any, sentAt: new Date().toLocaleString('tr'), isActive: true });
        setShowForm(false);
        setF({ title: '', body: '', type: 'INFO', targetAudience: 'ALL' });
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-black uppercase tracking-tighter">Bildirimler</h2>
                <button onClick={() => setShowForm(!showForm)} className="h-10 px-4 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center gap-2"><Bell size={14} /> YENİ BİLDİRİM</button>
            </div>

            <AnimatePresence>{showForm && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-[#161B22] border border-white/10 rounded-2xl p-5 mb-4 overflow-hidden">
                    <h3 className="text-sm font-black text-white uppercase mb-4">Bildirim Oluştur & Gönder</h3>
                    <F label="Başlık"><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="🎉 Haftalık İndirim!" /></F>
                    <F label="İçerik"><TA value={f.body} onChange={e => setF({ ...f, body: e.target.value })} placeholder="Bildirim metni..." /></F>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <F label="Tür"><Select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="INFO">ℹ️ Bilgi</option><option value="PROMO">🎁 Promosyon</option><option value="WARNING">⚠️ Uyarı</option><option value="SYSTEM">🔧 Sistem</option></Select></F>
                        <F label="Hedef Kitle"><Select value={f.targetAudience} onChange={e => setF({ ...f, targetAudience: e.target.value })}><option value="ALL">Herkes</option><option value="PRO">Pro Üyeler</option><option value="CAPTAIN">Kaptanlar</option><option value="GK">Kaleciler</option><option value="REFEREE">Hakemler</option></Select></F>
                    </div>
                    <button onClick={send} className="w-full h-12 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black uppercase tracking-widest flex items-center justify-center gap-2"><Send size={16} /> GÖNDER</button>
                </motion.div>
            )}</AnimatePresence>

            <div className="space-y-2">
                {adminNotifications.map(n => (
                    <div key={n.id} className={`bg-[#161B22] border rounded-2xl p-4 transition-all ${n.isActive ? 'border-white/5' : 'border-white/5 opacity-50'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className={`px-2 py-0.5 text-[8px] font-black rounded uppercase ${typeColor[n.type] || 'text-gray-400 bg-gray-500/10'}`}>{n.type}</span>
                                    <span className="text-[8px] text-gray-600 font-bold uppercase">→ {n.targetAudience}</span>
                                    {!n.isActive && <span className="text-[8px] text-gray-600 font-bold uppercase border border-white/10 px-1.5 rounded">PASİF</span>}
                                </div>
                                <p className="text-sm font-black text-white">{n.title}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                                <p className="text-[9px] text-gray-600 mt-1">{n.sentAt}</p>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <button onClick={() => toggleNotification(n.id)} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${n.isActive ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-gray-500/10 text-gray-600 hover:bg-gray-500/20'}`}>
                                    {n.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                </button>
                                <button onClick={() => { if (confirm('Bildirim silinsin mi?')) deleteNotification(n.id); }} className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 size={13} /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
