import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Send, UserPlus, Trash2, Edit3, Bell, Phone, Mail, MapPin, Shield, Ban, AlertTriangle, ChevronRight, Star, Clock } from 'lucide-react';
import { useAppStore } from '../../store';
import { Pitch, MatchListing, AdminUser } from '../../types';

// ── Shell ──────────────────────────────────────────────────────────
export const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <motion.div initial={{ opacity: 0, scale: 0.92, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
            className={`bg-[#161B22] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-white/5 shrink-0">
                <h3 className="text-sm font-black text-white uppercase tracking-widest">{title}</h3>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-all"><X size={15} /></button>
            </div>
            <div className="overflow-y-auto custom-scrollbar flex-1 p-6">{children}</div>
        </motion.div>
    </div>
);

const ActionBtn: React.FC<{ label: string; color?: string; icon?: React.ReactNode; onClick: () => void }> = ({ label, color = 'bg-white/5 text-white border-white/10', icon, onClick }) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all hover:opacity-90 ${color}`}>
        {icon}{label}
    </button>
);

// ── PITCH DETAIL MODAL ─────────────────────────────────────────────
export const PitchModal: React.FC<{ pitch: { name: string; fill: number; total: number; status: string }; onClose: () => void; onNavigate: (tab: string) => void }> = ({ pitch, onClose, onNavigate }) => (
    <ModalShell title="SAHA DETAYI" onClose={onClose}>
        <div className="space-y-4">
            <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                <p className="text-lg font-black text-white uppercase mb-1">{pitch.name}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${pitch.status === 'AKTİF' ? 'bg-green-500/20 text-green-400 border-green-500/30' : pitch.status === 'EKSİK' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>{pitch.status}</span>
                    <span className="font-mono">{pitch.fill}/{pitch.total} oyuncu</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full mt-3 overflow-hidden">
                    <div className={`h-full rounded-full ${pitch.fill / pitch.total >= 0.9 ? 'bg-green-500' : pitch.fill / pitch.total >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${(pitch.fill / pitch.total) * 100}%` }} />
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
                {[['Doluluk', `${Math.round((pitch.fill / pitch.total) * 100)}%`], ['Kalan Yer', String(pitch.total - pitch.fill)], ['Durum', pitch.status]].map(([l, v]) => (
                    <div key={l} className="bg-black/30 rounded-xl p-3 border border-white/5">
                        <p className="text-[8px] text-gray-500 uppercase tracking-widest mb-1">{l}</p>
                        <p className="text-sm font-black text-white">{v}</p>
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
                <ActionBtn label="Sahayı Düzenle" color="bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20" icon={<Edit3 size={12} />} onClick={() => { onNavigate('PITCHES'); onClose(); }} />
                <ActionBtn label="Maça Müdahale" color="bg-yellow-500/10 text-yellow-400 border-yellow-500/20" icon={<AlertTriangle size={12} />} onClick={() => { onNavigate('MATCHES'); onClose(); }} />
                <ActionBtn label="Sahayı Sil" color="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20" icon={<Trash2 size={12} />} onClick={onClose} />
            </div>
        </div>
    </ModalShell>
);

// ── MATCH DETAIL MODAL ─────────────────────────────────────────────
export const MatchModal: React.FC<{ match: { id: string; pitch: string; time: string; fill: number; total: number; status: string; rev: number }; onClose: () => void; onNavigate: (tab: string) => void; onPush: () => void; onAddPlayer: () => void; onDelete: () => void }> = ({ match, onClose, onNavigate, onPush, onAddPlayer, onDelete }) => (
    <ModalShell title={`MAÇ ${match.id}`} onClose={onClose} wide>
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                {[['Saha', match.pitch], ['Başlangıç', match.time], ['Doluluk', `${match.fill}/${match.total}`], ['Gelir', `₺${match.rev.toLocaleString('tr')}`], ['Durum', match.status], ['Min Rating', '3.5']].map(([l, v]) => (
                    <div key={l} className="bg-black/30 rounded-xl p-3 border border-white/5">
                        <p className="text-[8px] text-gray-500 uppercase tracking-widest mb-1">{l}</p>
                        <p className="text-xs font-black text-white">{v}</p>
                    </div>
                ))}
            </div>
            {/* Roster grid */}
            <div>
                <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-2">Kadro</p>
                <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: match.total }).map((_, i) => (
                        <div key={i} className={`h-8 rounded-lg flex items-center justify-center text-[8px] font-black border ${i < match.fill ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/20 border-dashed'}`}>
                            {i < match.fill ? '●' : '+'}
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
                <ActionBtn label="Push Gönder" color="bg-blue-500/10 text-blue-400 border-blue-500/20" icon={<Send size={12} />} onClick={() => { onClose(); onPush(); }} />
                <ActionBtn label="Oyuncu Ekle" color="bg-green-500/10 text-green-400 border-green-500/20" icon={<UserPlus size={12} />} onClick={() => { onClose(); onAddPlayer(); }} />
                <ActionBtn label="Maç Düzenle" color="bg-white/5 text-gray-300 border-white/10" icon={<Edit3 size={12} />} onClick={() => { onNavigate('MATCHES'); onClose(); }} />
                <ActionBtn label="Maçı İptal Et" color="bg-red-500/10 text-red-400 border-red-500/20" icon={<Trash2 size={12} />} onClick={() => { onDelete(); onClose(); }} />
            </div>
        </div>
    </ModalShell>
);

// ── BAN CONFIRM MODAL ──────────────────────────────────────────────
export const BanModal: React.FC<{ userId: string; userName: string; onClose: () => void }> = ({ userId, userName, onClose }) => {
    const { banUser } = useAppStore();
    const [done, setDone] = useState(false);
    const doban = () => { banUser(userId); setDone(true); setTimeout(onClose, 1200); };
    return (
        <ModalShell title="GEÇİCİ BAN" onClose={onClose}>
            <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-red-900/20 rounded-full flex items-center justify-center border border-red-500/30">
                    <Ban size={28} className="text-red-400" />
                </div>
                {done ? (
                    <div className="text-green-400 font-black text-sm">✓ {userName} banlandı</div>
                ) : (
                    <>
                        <p className="text-white font-bold"><span className="text-red-400">"{userName}"</span> adlı kullanıcı geçici olarak banlanacak. Emin misiniz?</p>
                        <p className="text-xs text-gray-500">Kullanıcı sisteme giremez, mevcut rezervasyonları iptal edilir.</p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={onClose} className="h-11 px-6 bg-white/5 border border-white/10 rounded-xl text-gray-400 font-black text-xs uppercase hover:bg-white/10 transition-all">İptal</button>
                            <button onClick={doban} className="h-11 px-6 bg-red-600 rounded-xl text-white font-black text-xs uppercase shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:bg-red-500 transition-all flex items-center gap-2"><Ban size={13} /> BANLA</button>
                        </div>
                    </>
                )}
            </div>
        </ModalShell>
    );
};

// ── PUSH NOTIFICATION MODAL ────────────────────────────────────────
export const PushModal: React.FC<{ target?: string; onClose: () => void }> = ({ target, onClose }) => {
    const { addNotification } = useAppStore();
    const [title, setTitle] = useState(target ? `📢 ${target} Maç Duyurusu` : '');
    const [body, setBody] = useState(target ? `${target} için hızlı hareket et! Sınırlı yer kaldı.` : '');
    const [audience, setAudience] = useState('ALL');
    const [sent, setSent] = useState(false);

    const doSend = () => {
        if (!title || !body) return;
        addNotification({ id: `push-${Date.now()}`, title, body, type: 'INFO', targetAudience: audience as any, sentAt: new Date().toLocaleString('tr'), isActive: true });
        setSent(true);
        setTimeout(onClose, 1400);
    };

    return (
        <ModalShell title="BİLDİRİM GÖNDER" onClose={onClose}>
            {sent ? (
                <div className="text-center py-8">
                    <div className="text-4xl mb-3">📲</div>
                    <p className="text-green-400 font-black text-sm">Bildirim gönderildi!</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <div><label className="text-[9px] text-gray-400 font-black uppercase tracking-widest block mb-1.5">Başlık</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} className="w-full h-11 bg-black/50 border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-red-500/50" /></div>
                    <div><label className="text-[9px] text-gray-400 font-black uppercase tracking-widest block mb-1.5">Mesaj</label>
                        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50 resize-none" /></div>
                    <div><label className="text-[9px] text-gray-400 font-black uppercase tracking-widest block mb-1.5">Hedef Kitle</label>
                        <select value={audience} onChange={e => setAudience(e.target.value)} className="w-full h-11 bg-black/50 border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none">
                            <option value="ALL">Herkes</option><option value="CAPTAIN">Kaptanlar</option><option value="GK">Kaleciler</option><option value="REFEREE">Hakemler</option><option value="PRO">Pro Üyeler</option>
                        </select></div>
                    <button onClick={doSend} className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl text-white font-black uppercase tracking-widest flex items-center justify-center gap-2 mt-2 hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all">
                        <Send size={14} /> GÖNDER
                    </button>
                </div>
            )}
        </ModalShell>
    );
};

// ── ADD PLAYER MODAL ───────────────────────────────────────────────
export const AddPlayerModal: React.FC<{ matchId: string; onClose: () => void }> = ({ matchId, onClose }) => {
    const { adminUsers } = useAppStore();
    const [search, setSearch] = useState('');
    const [added, setAdded] = useState<string | null>(null);
    const available = adminUsers.filter(u => !u.isBanned && (u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())));

    const doAdd = (user: typeof adminUsers[0]) => {
        setAdded(user.name);
        setTimeout(onClose, 1400);
    };

    return (
        <ModalShell title={`OYUNCU EKLE — ${matchId}`} onClose={onClose} wide>
            {added ? (
                <div className="text-center py-8"><div className="text-4xl mb-3">✅</div><p className="text-green-400 font-black">{added} maça eklendi</p></div>
            ) : (
                <div className="space-y-3">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Oyuncu ara..." className="w-full h-11 bg-black/50 border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-red-500/50" />
                    <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                        {available.map(u => (
                            <div key={u.id} className="flex items-center gap-3 p-3 bg-black/30 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                                <img src={u.avatar} className="w-10 h-10 rounded-full border border-white/10 bg-gray-800 object-cover" referrerPolicy="no-referrer" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black text-white truncate">{u.name}</p>
                                    <div className="flex items-center gap-1"><Star size={9} className="text-yellow-400 fill-yellow-400" /><span className="text-[10px] text-gray-400">{u.rating} • {u.matchCount} maç</span></div>
                                </div>
                                <button onClick={() => doAdd(u)} className="h-9 px-4 bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1">
                                    <UserPlus size={11} /> Ekle
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </ModalShell>
    );
};

// ── CONTACT MODAL ──────────────────────────────────────────────────
export const ContactModal: React.FC<{ pitchName: string; onClose: () => void }> = ({ pitchName, onClose }) => (
    <ModalShell title="SAHAYA ULAŞ" onClose={onClose}>
        <div className="space-y-3">
            <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                <p className="text-sm font-black text-white mb-3 flex items-center gap-2"><MapPin size={14} className="text-red-400" />{pitchName}</p>
                {[{ icon: Phone, label: 'Telefon', value: '+90 532 123 45 67' }, { icon: Mail, label: 'Email', value: 'arena@oyna.app' }, { icon: Clock, label: 'Çalışma Saatleri', value: '08:00 — 24:00' }].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                        <Icon size={14} className="text-gray-500 shrink-0" />
                        <div><p className="text-[9px] text-gray-500 uppercase tracking-widest">{label}</p><p className="text-xs font-bold text-white">{value}</p></div>
                    </div>
                ))}
            </div>
            <button onClick={onClose} className="w-full h-11 bg-red-600/20 text-red-400 border border-red-500/30 rounded-xl font-black text-xs uppercase hover:bg-red-600/30 transition-all">Kapat</button>
        </div>
    </ModalShell>
);

// ── ACTIVITY LOG MODAL ─────────────────────────────────────────────
export const LogModal: React.FC<{ userId?: string; onClose: () => void }> = ({ userId, onClose }) => {
    const LOG_ENTRIES = [
        { time: '19:42', action: 'Sisteme giriş', type: 'info' }, { time: '19:35', action: 'Maç rezervasyonu yapıldı (#4821)', type: 'success' },
        { time: '18:20', action: 'Ödeme girişimi başarısız', type: 'error' }, { time: '17:55', action: 'Profil güncellendi', type: 'info' },
        { time: '16:30', action: 'Kaleci teklifi gönderildi', type: 'info' }, { time: '15:10', action: 'Maç iptal edildi (#4799)', type: 'warning' },
        { time: '14:00', action: 'Min. rating ihlali denemesi tespit edildi', type: 'error' },
    ];
    const colors: Record<string, string> = { info: 'text-gray-400', success: 'text-green-400', error: 'text-red-400', warning: 'text-yellow-400' };
    return (
        <ModalShell title="AKTİVİTE LOGU" onClose={onClose}>
            <div className="space-y-1">
                {LOG_ENTRIES.map((e, i) => (
                    <div key={i} className="flex gap-3 items-start py-2 border-b border-white/5 last:border-0">
                        <span className="text-[9px] font-mono text-gray-600 w-10 shrink-0 pt-0.5">{e.time}</span>
                        <span className={`text-xs font-medium ${colors[e.type]}`}>{e.action}</span>
                    </div>
                ))}
            </div>
        </ModalShell>
    );
};

// ── REVENUE MODAL ──────────────────────────────────────────────────
export const RevenueModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { adminMatches, appSettings } = useAppStore();
    const total = adminMatches.reduce((s, m) => s + m.price, 0);
    const commission = Math.round(total * appSettings.commissionRate / 100);
    return (
        <ModalShell title="GELİR ANALİZİ" onClose={onClose} wide>
            <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                    {[['Toplam Ciro', `₺${total.toLocaleString('tr')}`], ['Komisyon (%' + appSettings.commissionRate + ')', `₺${commission.toLocaleString('tr')}`], ['Net Gelir', `₺${(total - commission).toLocaleString('tr')}`]].map(([l, v]) => (
                        <div key={l} className="bg-black/30 rounded-2xl p-4 border border-white/5 text-center">
                            <p className="text-[8px] text-gray-500 uppercase tracking-widest mb-1">{l}</p>
                            <p className="text-xl font-black text-white">{v}</p>
                        </div>
                    ))}
                </div>
                <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-3">Maç Bazında Gelir</p>
                    {adminMatches.slice(0, 5).map(m => (
                        <div key={m.id} className="flex justify-between py-1.5 border-b border-white/5 last:border-0 text-xs">
                            <span className="text-gray-400">{m.title}</span>
                            <span className="font-black text-white">₺{m.price}</span>
                        </div>
                    ))}
                </div>
            </div>
        </ModalShell>
    );
};

// ── MORE MENU ──────────────────────────────────────────────────────
export const MoreMenu: React.FC<{ matchId: string; onClose: () => void; onNavigate: (tab: string) => void; onDelete: () => void; onPush: () => void }> = ({ matchId, onClose, onNavigate, onDelete, onPush }) => (
    <div className="fixed inset-0 z-50" onClick={onClose}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="absolute bg-[#1e2430] border border-white/10 rounded-2xl shadow-2xl w-48 overflow-hidden"
            style={{ right: 80, top: '50%' }}
            onClick={e => e.stopPropagation()}>
            {[
                { label: 'Düzenle', icon: Edit3, action: () => { onNavigate('MATCHES'); onClose(); } },
                { label: 'Bildirim Gönder', icon: Bell, action: () => { onClose(); onPush(); } },
                { label: 'Maçı Sil', icon: Trash2, action: () => { onDelete(); onClose(); }, danger: true },
            ].map(({ label, icon: Icon, action, danger }) => (
                <button key={label} onClick={action} className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-bold hover:bg-white/5 transition-all border-b border-white/5 last:border-0 ${danger ? 'text-red-400 hover:text-red-300' : 'text-gray-300 hover:text-white'}`}>
                    <Icon size={13} />{label}
                </button>
            ))}
        </motion.div>
    </div>
);
