import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { Edit2, Search, Trash2, ShieldOff, Shield, Star, StarOff, CheckCircle, XCircle, Wallet } from 'lucide-react';
import { Pitch, Goalkeeper, Referee, AdminUser } from '../../types';
import { fbDeleteGoalkeeper, fbDeleteReferee, fbBanUser, fbToggleUserPro, fbVerifyUser } from '../../supabaseMutations';
import { motion, AnimatePresence } from 'framer-motion';

interface GodViewDataTablesProps {
    activeTab: 'SAHALAR' | 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER';
    onEditPitch: (pitch: Pitch) => void;
    onEditUser: (user: AdminUser) => void;
    onEditGk: (gk: Goalkeeper) => void;
    onEditRef: (ref: Referee) => void;
    onDeletePitch: (id: string) => void;
    onDeleteUser: (id: string) => void;
    onDeleteGk: (id: string) => void;
    onDeleteRef: (id: string) => void;
    onAddPitch?: () => void;
}

// ── Mini In-table Toast ── 
const useToast = () => {
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const show = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 2200); };
    const Toast = () => (
        <AnimatePresence>
            {msg && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`fixed top-4 right-4 z-[300] px-4 py-2.5 rounded-xl text-xs font-black shadow-2xl border ${msg.ok ? 'bg-green-900/90 border-green-500/30 text-green-300' : 'bg-red-900/90 border-red-500/30 text-red-300'}`}>
                    {msg.text}
                </motion.div>
            )}
        </AnimatePresence>
    );
    return { show, Toast };
};

export const GodViewDataTables: React.FC<GodViewDataTablesProps> = ({
    activeTab,
    onEditPitch,
    onEditUser,
    onEditGk,
    onEditRef,
    onDeletePitch,
    onDeleteUser,
    onDeleteGk,
    onDeleteRef,
    onAddPitch,
}) => {
    const { adminPitches, adminUsers, adminGoalkeepers, adminReferees } = useAppStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [gkStyleFilter, setGkStyleFilter] = useState('ALL');
    const [refLevelFilter, setRefLevelFilter] = useState('ALL');
    const [eliteFilter, setEliteFilter] = useState('ALL');
    const { show, Toast } = useToast();

    const handleDeleteGk = async (id: string, name: string) => {
        if (!window.confirm(`"${name}" silinsin mi?`)) return;
        await fbDeleteGoalkeeper(id);
        onDeleteGk(id);
        show(`✅ ${name} silindi`);
    };
    const handleDeleteRef = async (id: string, name: string) => {
        if (!window.confirm(`"${name}" silinsin mi?`)) return;
        await fbDeleteReferee(id);
        onDeleteRef(id);
        show(`✅ ${name} silindi`);
    };
    const handleBanToggle = async (user: AdminUser) => {
        const next = !user.isBanned;
        await fbBanUser(user.id, next);
        show(next ? `🚫 ${user.name} banlandı` : `✅ ${user.name} banı kaldırıldı`, !next);
    };
    const handleProToggle = async (user: AdminUser) => {
        const next = !user.isPro;
        await fbToggleUserPro(user.id, next);
        show(next ? `⭐ ${user.name} PRO yapıldı` : `📉 ${user.name} PRO kaldırıldı`);
    };
    const handleVerify = async (user: AdminUser) => {
        await fbVerifyUser(user.id);
        show(`✅ ${user.name} doğrulandı`);
    };

    // ─── PITCHES TABLE ─────────────────────────────────────────────
    const GradeBadge = ({ g }: { g?: 'A' | 'B' | 'C' }) => {
        if (!g) return <span className="text-gray-600 text-[10px]">—</span>;
        const colors = { A: 'bg-green-500/20 text-green-400 border-green-500/30', B: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', C: 'bg-red-500/20 text-red-400 border-red-500/30' };
        return <span className={`px-2 py-0.5 rounded-lg font-black text-[11px] border ${colors[g]}`}>{g}</span>;
    };
    const renderPitches = () => {
        const data = adminPitches.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
        return (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-[10px] uppercase bg-[#1A1F26] text-gray-400 sticky top-0">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Görsel</th>
                            <th className="px-4 py-3 font-semibold">Saha Adı</th>
                            <th className="px-4 py-3 font-semibold">Bölge</th>
                            <th className="px-4 py-3 font-semibold">Kişi Başı ₺</th>
                            <th className="px-4 py-3 font-semibold">Toplam ₺</th>
                            <th className="px-4 py-3 font-semibold">Rating</th>
                            <th className="px-4 py-3 font-semibold text-center">Işık</th>
                            <th className="px-4 py-3 font-semibold text-center">Zemin</th>
                            <th className="px-4 py-3 font-semibold text-center">Soyunma</th>
                            <th className="px-4 py-3 font-semibold text-right">Aksiyonlar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(pitch => (
                            <tr key={pitch.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3">
                                    <img src={pitch.image} alt={pitch.name} className="w-10 h-10 rounded object-cover border border-white/10" />
                                </td>
                                <td className="px-4 py-3 font-medium text-white">{pitch.name}</td>
                                <td className="px-4 py-3">{pitch.district || pitch.location.split(',')[0]}</td>
                                <td className="px-4 py-3 text-red-400 font-mono">₺{pitch.pricePerPerson}</td>
                                <td className="px-4 py-3 text-red-400 font-mono">₺{pitch.totalPrice}</td>
                                <td className="px-4 py-3 flex items-center gap-1 mt-2">⭐ {pitch.rating}</td>
                                <td className="px-4 py-3 text-center"><GradeBadge g={pitch.lightingGrade} /></td>
                                <td className="px-4 py-3 text-center"><GradeBadge g={pitch.grassGrade} /></td>
                                <td className="px-4 py-3 text-center"><GradeBadge g={pitch.lockerRoomGrade} /></td>
                                <td className="px-4 py-3 text-right">
                                    <button onClick={() => onEditPitch(pitch)} title="Düzenle" className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded mr-2 transition-colors"><Edit2 size={14} /></button>
                                    <button onClick={() => { if (window.confirm(`"${pitch.name}" silinsin mi?`)) { onDeletePitch(pitch.id); show(`🗑️ ${pitch.name} silindi`); } }} title="Sil" className="p-1.5 text-red-500 hover:bg-red-500/20 rounded transition-colors"><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // ─── USERS TABLE ───────────────────────────────────────────────
    const renderUsers = () => {
        let data = adminUsers.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()));
        if (roleFilter !== 'ALL') {
            data = data.filter(u => u.role === roleFilter);
        }
        if (statusFilter !== 'ALL') {
            if (statusFilter === 'ACTIVE') data = data.filter(u => !u.isBanned);
            else if (statusFilter === 'BANNED') data = data.filter(u => u.isBanned);
            else if (statusFilter === 'VERIFIED') data = data.filter(u => u.isVerified);
            else if (statusFilter === 'PRO') data = data.filter(u => u.isPro);
        }
        return (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-[10px] uppercase bg-[#1A1F26] text-gray-400 sticky top-0">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Avatar</th>
                            <th className="px-4 py-3 font-semibold">İsim & Roller</th>
                            <th className="px-4 py-3 font-semibold">Email</th>
                            <th className="px-4 py-3 font-semibold">Cüzdan</th>
                            <th className="px-4 py-3 font-semibold">Statü</th>
                            <th className="px-4 py-3 font-semibold text-right">Aksiyonlar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(user => (
                            <tr key={user.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${user.isBanned ? 'opacity-60' : ''}`}>
                                <td className="px-4 py-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-600 to-orange-500 flex items-center justify-center text-white font-bold text-xs shadow-lg">
                                        {(user.name || '').charAt(0) || 'U'}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="font-medium text-white">{user.name}</div>
                                    <div className="text-[10px] flex gap-1 mt-1">
                                        <span className="bg-white/10 px-1 py-0.5 rounded text-gray-400">{user.role}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">{user.email}</td>
                                <td className="px-4 py-3">
                                    <span className="flex items-center gap-1 text-yellow-400 font-mono text-xs">
                                        <Wallet size={11} /> ₺{(user.wallet ?? 0).toLocaleString('tr')}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex gap-1.5 flex-wrap">
                                        {user.isPro && <span className="text-yellow-500 bg-yellow-500/10 px-2 rounded text-[10px] font-bold border border-yellow-500/20">PRO</span>}
                                        {user.isVerified && <span className="text-blue-400 bg-blue-500/10 px-2 rounded text-[10px] font-bold border border-blue-500/20">✓ DOĞRULANMIŞ</span>}
                                        {user.isBanned
                                            ? <span className="text-red-500 bg-red-500/10 px-2 rounded text-[10px] font-bold border border-red-500/20">BANNED</span>
                                            : <span className="text-green-500 bg-green-500/10 px-2 rounded text-[10px] font-bold border border-green-500/20">AKTİF</span>}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => onEditUser(user)} title="Düzenle" className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"><Edit2 size={14} /></button>
                                        <button onClick={() => handleBanToggle(user)} title={user.isBanned ? 'Banı Kaldır' : 'Banla'} className={`p-1.5 rounded transition-colors ${user.isBanned ? 'text-green-400 hover:bg-green-500/20' : 'text-red-400 hover:bg-red-500/20'}`}>
                                            {user.isBanned ? <Shield size={14} /> : <ShieldOff size={14} />}
                                        </button>
                                        <button onClick={() => handleProToggle(user)} title={user.isPro ? 'PRO Kaldır' : 'PRO Yap'} className={`p-1.5 rounded transition-colors ${user.isPro ? 'text-gray-400 hover:bg-gray-500/20' : 'text-yellow-400 hover:bg-yellow-500/20'}`}>
                                            {user.isPro ? <StarOff size={14} /> : <Star size={14} />}
                                        </button>
                                        {!user.isVerified && (
                                            <button onClick={() => handleVerify(user)} title="Doğrula" className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"><CheckCircle size={14} /></button>
                                        )}
                                        <button onClick={() => { if (window.confirm(`"${user.name}" silinsin mi?`)) { onDeleteUser(user.id); show(`🗑️ ${user.name} silindi`); } }} title="Sil" className="p-1.5 text-red-500 hover:bg-red-500/20 rounded transition-colors"><Trash2 size={14} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // ─── GOALKEEPERS & REFEREES TABLE ──────────────────────────────
    const renderServiceProviders = (type: 'GK' | 'REF') => {
        const rawData = type === 'GK' ? adminGoalkeepers : adminReferees;
        let data = rawData.filter((item: any) => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

        if (type === 'GK') {
            if (gkStyleFilter !== 'ALL') {
                data = data.filter((item: any) => item.style === gkStyleFilter);
            }
        } else {
            if (refLevelFilter !== 'ALL') {
                data = data.filter((item: any) => item.level === refLevelFilter);
            }
        }

        if (eliteFilter !== 'ALL') {
            data = data.filter((item: any) => eliteFilter === 'ELITE' ? item.isElite : !item.isElite);
        }

        return (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-[10px] uppercase bg-[#1A1F26] text-gray-400 sticky top-0">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Avatar</th>
                            <th className="px-4 py-3 font-semibold">İsim</th>
                            <th className="px-4 py-3 font-semibold">Stil & Seviye</th>
                            <th className="px-4 py-3 font-semibold">Maç Ücreti</th>
                            <th className="px-4 py-3 font-semibold">Rating</th>
                            <th className="px-4 py-3 font-semibold text-right">Aksiyonlar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item: any) => (
                            <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3">
                                    <img src={item.avatar} alt={item.name} className="w-9 h-9 rounded-full object-cover border border-white/10" />
                                </td>
                                <td className="px-4 py-3 font-medium text-white">
                                    <div className="flex items-center gap-2">
                                        {item.name}
                                        {item.isElite && <span className="text-yellow-500 text-[10px] bg-yellow-500/20 px-1.5 py-0.5 rounded border border-yellow-500/20">ELITE</span>}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="text-xs text-gray-400">{type === 'GK' ? item.style : item.level}</div>
                                </td>
                                <td className="px-4 py-3 text-green-400 font-mono">₺{item.fee}</td>
                                <td className="px-4 py-3">⭐ {item.rating}</td>
                                <td className="px-4 py-3 text-right">
                                    <button onClick={() => type === 'GK' ? onEditGk(item) : onEditRef(item)} title="Düzenle" className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded mr-2 transition-colors"><Edit2 size={14} /></button>
                                    <button
                                        onClick={() => type === 'GK' ? handleDeleteGk(item.id, item.name) : handleDeleteRef(item.id, item.name)}
                                        title="Sil"
                                        className="p-1.5 text-red-500 hover:bg-red-500/20 rounded transition-colors">
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-[#0D1117] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
            <Toast />
            {/* Header & Toolbar */}
            <div className="px-6 py-4 border-b border-white/10 bg-[#121820] flex items-center justify-between shrink-0">
                <h2 className="text-lg font-bold text-white tracking-wide">
                    <span className="text-red-500 mr-2">VERİTABANI:</span>
                    {activeTab} ({
                        activeTab === 'SAHALAR' ? adminPitches.length :
                            activeTab === 'KULLANICILAR' ? adminUsers.length :
                                activeTab === 'KALECİLER' ? adminGoalkeepers.length :
                                    adminReferees.length
                    })
                </h2>

                <div className="flex items-center gap-3">
                    {activeTab === 'SAHALAR' && onAddPitch && (
                        <button onClick={onAddPitch}
                            className="flex items-center gap-1.5 px-4 h-8 bg-gradient-to-r from-green-600 to-emerald-700 rounded-lg text-[10px] font-black text-white uppercase tracking-widest hover:opacity-90 transition-all shadow-[0_0_12px_rgba(34,197,94,0.3)]">
                            <span className="text-lg leading-none">+</span> YENİ SAHA
                        </button>
                    )}

                    {/* Dynamic Filters depending on activeTab */}
                    {activeTab === 'KULLANICILAR' && (
                        <>
                            <select
                                value={roleFilter}
                                onChange={e => setRoleFilter(e.target.value)}
                                className="h-8 bg-black/40 border border-white/10 rounded-lg px-2 text-[11px] font-bold text-gray-300 focus:outline-none"
                            >
                                <option value="ALL">TÜM ROLLER</option>
                                <option value="SUPER_ADMIN">SUPER ADMIN</option>
                                <option value="CAPTAIN">KAPTAN</option>
                                <option value="PLAYER">OYUNCU</option>
                                <option value="GOALKEEPER">KALECİ</option>
                                <option value="REFEREE">HAKEM</option>
                            </select>
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="h-8 bg-black/40 border border-white/10 rounded-lg px-2 text-[11px] font-bold text-gray-300 focus:outline-none"
                            >
                                <option value="ALL">TÜM DURUMLAR</option>
                                <option value="ACTIVE">AKTİF</option>
                                <option value="BANNED">BANLI</option>
                                <option value="VERIFIED">ONAYLI</option>
                                <option value="PRO">PRO</option>
                            </select>
                        </>
                    )}

                    {activeTab === 'KALECİLER' && (
                        <>
                            <select
                                value={gkStyleFilter}
                                onChange={e => setGkStyleFilter(e.target.value)}
                                className="h-8 bg-black/40 border border-white/10 rounded-lg px-2 text-[11px] font-bold text-gray-300 focus:outline-none"
                            >
                                <option value="ALL">TÜM STİLLER</option>
                                <option value="PANTER">PANTER</option>
                                <option value="DUVAR">DUVAR</option>
                                <option value="LİBERO">LİBERO</option>
                            </select>
                            <select
                                value={eliteFilter}
                                onChange={e => setEliteFilter(e.target.value)}
                                className="h-8 bg-black/40 border border-white/10 rounded-lg px-2 text-[11px] font-bold text-gray-300 focus:outline-none"
                            >
                                <option value="ALL">TÜMÜ</option>
                                <option value="ELITE">ELITE KALECİLER</option>
                                <option value="NORMAL">NORMAL KALECİLER</option>
                            </select>
                        </>
                    )}

                    {activeTab === 'HAKEMLER' && (
                        <>
                            <select
                                value={refLevelFilter}
                                onChange={e => setRefLevelFilter(e.target.value)}
                                className="h-8 bg-black/40 border border-white/10 rounded-lg px-2 text-[11px] font-bold text-gray-300 focus:outline-none"
                            >
                                <option value="ALL">TÜM SEVİYELER</option>
                                <option value="ELITE">ELITE HAKEM</option>
                                <option value="LİSANSLI">LİSANSLI HAKEM</option>
                                <option value="ADAY">ADAY HAKEM</option>
                            </select>
                            <select
                                value={eliteFilter}
                                onChange={e => setEliteFilter(e.target.value)}
                                className="h-8 bg-black/40 border border-white/10 rounded-lg px-2 text-[11px] font-bold text-gray-300 focus:outline-none"
                            >
                                <option value="ALL">TÜMÜ</option>
                                <option value="ELITE">ELITE HAKEMLER</option>
                                <option value="NORMAL">NORMAL HAKEMLER</option>
                            </select>
                        </>
                    )}

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <input
                            type="text"
                            placeholder="İsim ile ara..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-1.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-red-500/50 w-48 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Table Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0A0D12]">
                {activeTab === 'SAHALAR' && renderPitches()}
                {activeTab === 'KULLANICILAR' && renderUsers()}
                {activeTab === 'KALECİLER' && renderServiceProviders('GK')}
                {activeTab === 'HAKEMLER' && renderServiceProviders('REF')}
            </div>
        </div>
    );
};
