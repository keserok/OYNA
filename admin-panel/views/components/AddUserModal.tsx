import React, { useState } from 'react';
import { X, Save, User, Shield, Scale, Star, Trophy, Loader2 } from 'lucide-react';
import { AdminUser, Goalkeeper, Referee, UserRole } from '../../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { createUserAdmin, createGoalkeeperAccountAdmin, createRefereeAccountAdmin, toTurkishAdminError } from '../../services/adminService';

interface AddUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddUser: (user: AdminUser) => void;
    onAddGoalkeeper: (gk: Goalkeeper) => void;
    onAddReferee: (ref: Referee) => void;
    defaultRole: 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER';
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onAddUser, onAddGoalkeeper, onAddReferee, defaultRole }) => {
    const [roleType, setRoleType] = useState(defaultRole);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rating, setRating] = useState('5.0');
    const [userRole, setUserRole] = useState<UserRole>(UserRole.PLAYER);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [gkFee, setGkFee] = useState('200');
    const [refFee, setRefFee] = useState('300');
    const [refLevel, setRefLevel] = useState('TFF İl Hakemi');

    const handleSave = async () => {
        if (!name || !email) return;
        // E-Posta + Geçici Şifre artık üç sekmede de zorunlu (hepsi gerçek hesap açar).
        if (!password || password.length < 6) {
            setError('Şifre en az 6 karakter olmalı');
            return;
        }
        setSaving(true);
        setError(null);

        try {
            const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
            if (roleType === 'KULLANICILAR') {
                const created = await createUserAdmin({ email, password, fullName: name, role: userRole });
                const user: AdminUser = {
                    id: created.userId,
                    name,
                    email: created.email,
                    avatar,
                    role: userRole,
                    rating: Number(rating),
                    isVerified: true,
                    isBanned: false,
                    joinDate: new Date().toISOString(),
                    matchCount: 0,
                    wallet: 0,
                };
                onAddUser(user);
            } else if (roleType === 'KALECİLER') {
                const coordinates = { lat: 40.9839, lng: 37.8764 };
                const stats = { savePercentage: '80', penaltySaveRate: '50', reflexes: 85, diving: 80, positioning: 80, distribution: 75, oneOnOne: 82, aerialReach: 78 };
                const skills = { reflexes: 85, diving: 80, handling: 78, positioning: 80, kicking: 70, speed: 75 };
                const equipment = { gloves: 'Standart', boots: 'Standart', jersey: 'Standart' };
                const account = await createGoalkeeperAccountAdmin({
                    email, password, fullName: name,
                    fee: Number(gkFee), rating: Number(rating),
                    height: '1.85m', age: 25, style: 'PANTER', bio: 'Admin panel kaydı.',
                    avatar, matchCount: 0, preferredZones: ['Ordu'], coordinates,
                    stats, skills, equipment, recentAwards: '',
                });
                const gk: Goalkeeper = {
                    id: account.userId,
                    name,
                    height: '1.85m',
                    age: 25,
                    rating: Number(rating),
                    fee: Number(gkFee),
                    avatar,
                    style: 'PANTER',
                    bio: 'Admin panel kaydı.',
                    matchCount: 0,
                    preferredZones: ['Ordu'],
                    coordinates,
                    stats,
                    recentAwards: '',
                    skills,
                    equipment,
                    reviews: [],
                };
                onAddGoalkeeper(gk);
            } else {
                const coordinates = { lat: 40.9839, lng: 37.8764 };
                const stats = { avgCards: 2.1, avgDistance: '8km', varCallAccuracy: '98', authority: 85, fitness: 80, communication: 90 };
                const account = await createRefereeAccountAdmin({
                    email, password, fullName: name,
                    fee: Number(refFee), rating: Number(rating), level: refLevel,
                    avatar, matchCount: 0, style: 'Otoriter', bio: 'Admin panel kaydı.',
                    preferredZones: ['Ordu'], coordinates, stats,
                });
                const ref: Referee = {
                    id: account.userId,
                    authUid: account.userId,
                    name,
                    level: refLevel,
                    matchCount: 0,
                    fee: Number(refFee),
                    avatar,
                    rating: Number(rating),
                    style: 'Otoriter',
                    bio: 'Admin panel kaydı.',
                    preferredZones: ['Ordu'],
                    coordinates,
                    stats,
                    reviews: [],
                };
                onAddReferee(ref);
            }
            onClose();
            setName(''); setEmail(''); setPassword(''); setRating('5.0'); setUserRole(UserRole.PLAYER);
        } catch (err) {
            setError(toTurkishAdminError(err));
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
                    className="relative bg-[#0D1117] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-[0_0_50px_rgba(56,189,248,0.1)] overflow-hidden"
                >
                    <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r 
                        ${roleType === 'KULLANICILAR' ? 'from-blue-500 to-cyan-400' : 
                          roleType === 'KALECİLER' ? 'from-green-500 to-emerald-400' : 
                          'from-yellow-500 to-amber-400'}`}>
                    </div>

                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                            {roleType === 'KULLANICILAR' && <><User size={18} className="text-blue-400" /> KULLANICI EKLE</>}
                            {roleType === 'KALECİLER' && <><Shield size={18} className="text-green-400" /> KALECİ EKLE</>}
                            {roleType === 'HAKEMLER' && <><Scale size={18} className="text-yellow-400" /> HAKEM EKLE</>}
                        </h2>
                        <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {error && <p className="mb-4 text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg p-2">{error}</p>}

                    <div className="flex gap-2 mb-6 bg-black/40 p-1 rounded-xl border border-white/5">
                        {(['KULLANICILAR', 'KALECİLER', 'HAKEMLER'] as const).map((r) => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => setRoleType(r)}
                                className={`flex-1 py-2 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-all ${
                                    roleType === r ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        <div>
                            <label className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest block mb-1">Ad Soyad *</label>
                            <input value={name} onChange={e => setName(e.target.value)} type="text" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-white/30 transition-colors" placeholder="Örn: Ali Yılmaz" />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest block mb-1">E-Posta *</label>
                                <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-white/30 transition-colors" placeholder="ali@ornek.com" />
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest block mb-1">Rating / Puan</label>
                                <input value={rating} onChange={e => setRating(e.target.value)} type="number" step="0.1" min="0" max="5" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-white/30 transition-colors" placeholder="5.0" />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest block mb-1">Geçici Şifre *</label>
                            <input value={password} onChange={e => setPassword(e.target.value)} type="password" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-white/30 transition-colors" placeholder="min. 6 karakter" />
                        </div>

                        {roleType === 'KULLANICILAR' && (
                            <div>
                                <label className="text-[10px] text-blue-400 font-extrabold uppercase tracking-widest block mb-1">Rol *</label>
                                <select value={userRole} onChange={e => setUserRole(e.target.value as UserRole)} className="w-full bg-black/40 border border-blue-500/30 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-400 transition-colors">
                                    <option value={UserRole.PLAYER}>Oyuncu</option>
                                    <option value={UserRole.OWNER}>Saha Sahibi</option>
                                    <option value={UserRole.GOALKEEPER}>Kaleci</option>
                                    <option value={UserRole.REFEREE}>Hakem</option>
                                </select>
                            </div>
                        )}

                        {roleType === 'KALECİLER' && (
                            <div>
                                <label className="text-[10px] text-green-500 font-extrabold uppercase tracking-widest block mb-1 flex items-center gap-1"><Trophy size={10} /> Maç Başı Ücret (₺) *</label>
                                <input value={gkFee} onChange={e => setGkFee(e.target.value)} type="number" className="w-full bg-black/40 border border-green-500/30 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-green-400 transition-colors" />
                            </div>
                        )}

                        {roleType === 'HAKEMLER' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-yellow-500 font-extrabold uppercase tracking-widest block mb-1 flex items-center gap-1"><Trophy size={10} /> Maç Başı Ücret (₺) *</label>
                                    <input value={refFee} onChange={e => setRefFee(e.target.value)} type="number" className="w-full bg-black/40 border border-yellow-500/30 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-yellow-400 transition-colors" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-yellow-500 font-extrabold uppercase tracking-widest block mb-1">Lisans Seviyesi</label>
                                    <input value={refLevel} onChange={e => setRefLevel(e.target.value)} type="text" className="w-full bg-black/40 border border-yellow-500/30 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-yellow-400 transition-colors" />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-white/5 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white transition-colors">İptal</button>
                        <button 
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={!name || !email || saving}
                            className={`flex items-center gap-2 px-5 py-2 text-black text-xs font-extrabold uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                                ${roleType === 'KULLANICILAR' ? 'bg-blue-400 hover:bg-blue-300' : 
                                  roleType === 'KALECİLER' ? 'bg-green-400 hover:bg-green-300' : 
                                  'bg-yellow-400 hover:bg-yellow-300'}`}
                        >
                            {saving ? <><Loader2 size={14} className="animate-spin" /> Kaydediliyor...</> : <><Save size={14} /> Kaydet</>}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
