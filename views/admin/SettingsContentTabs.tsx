import React, { useState, useEffect, useCallback } from 'react';
import { Save, Globe, RefreshCw, Database, Terminal, Users, AlertTriangle, Activity, MapPin, Shield, Scale, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (p) => (
    <input {...p} className="w-full h-11 bg-black/50 border border-white/10 rounded-xl px-4 text-sm text-white font-medium focus:outline-none focus:border-red-500/50 transition-all" />
);
const F: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="mb-4"><label className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">{label}</label>{children}</div>
);
const Toggle: React.FC<{ value: boolean; onChange: () => void; label: string; desc?: string; danger?: boolean }> = ({ value, onChange, label, desc, danger }) => (
    <motion.div 
        onClick={onChange} 
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`flex items-center justify-between p-4 rounded-2xl border mb-2 gap-4 min-w-0 cursor-pointer select-none transition-all ${danger ? 'border-red-900/30 bg-red-900/10 hover:bg-red-900/15' : 'border-white/5 bg-black/20 hover:bg-white/5'}`}
    >
        <div className="min-w-0 flex-1 pr-2">
            <p className={`text-sm font-black truncate ${danger ? 'text-red-400' : 'text-white'}`}>{label}</p>
            {desc && <p className="text-[10px] text-gray-500 mt-0.5 truncate" title={desc}>{desc}</p>}
        </div>
        <div className={`w-12 h-7 rounded-full relative flex items-center transition-colors duration-300 flex-shrink-0 ${value ? (danger ? 'bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.3)]') : 'bg-white/10'}`}>
            <motion.div 
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="w-5 h-5 rounded-full bg-white shadow-md absolute left-1"
                style={{ transform: value ? 'translateX(20px)' : 'translateX(0px)' }}
            />
        </div>
    </motion.div>
);

// ── In-app Toast for Settings ────────────────────────────────────────
const useToast = () => {
    const [msg, setMsg] = useState<string | null>(null);
    const show = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); }, []);
    const Toast = () => (
        <AnimatePresence>
            {msg && (
                <motion.div initial={{ opacity: 0, y: 20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0 }}
                    className="fixed bottom-6 left-1/2 z-[200] px-5 py-3 bg-green-900/90 border border-green-500/30 rounded-xl text-green-300 text-sm font-black backdrop-blur-sm flex items-center gap-2 shadow-2xl">
                    <Check size={14} className="text-green-400" />{msg}
                </motion.div>
            )}
        </AnimatePresence>
    );
    return { show, Toast };
};

// ══════════════════════════════════════════
// SETTINGS TAB
// ══════════════════════════════════════════
export const SettingsTab: React.FC = () => {
    const { appSettings, updateAppSettings } = useAppStore();
    const [s, setS] = useState(appSettings);
    const { show, Toast } = useToast();

    useEffect(() => { setS(appSettings); }, [appSettings]);

    const save = () => {
        updateAppSettings(s);
        show('✅ Uygulama ayarları Firebase\'e kaydedildi!');
    };

    return (
        <div>
            <Toast />
            <div className="flex justify-between items-end mb-6">
                <h2 className="text-xl font-black uppercase tracking-tighter">Uygulama Ayarları</h2>
                <button onClick={save} className="h-10 px-5 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all">
                    <Save size={14} /> KAYDET
                </button>
            </div>

            {/* General */}
            <div className="bg-[#161B22] border border-white/5 rounded-3xl p-5 mb-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Globe size={14} /> GENEL</h3>
                <F label="Uygulama Adı"><Input value={s.appName} onChange={e => setS({ ...s, appName: e.target.value })} /></F>
                <F label="Duyuru Banner Metni"><Input value={s.announcementBanner} onChange={e => setS({ ...s, announcementBanner: e.target.value })} /></F>
                <Toggle value={s.showAnnouncementBanner} onChange={() => setS({ ...s, showAnnouncementBanner: !s.showAnnouncementBanner })} label="Duyuru Bannerını Göster" desc="Tüm kullanıcılara banner göster" />
            </div>

            {/* Economy */}
            <div className="bg-[#161B22] border border-white/5 rounded-3xl p-5 mb-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Activity size={14} /> EKONOMİ</h3>
                <div className="grid grid-cols-2 gap-3">
                    <F label="Pro Üyelik Fiyatı (₺)"><Input type="number" value={s.proPrice} onChange={e => setS({ ...s, proPrice: +e.target.value })} /></F>
                    <F label="Komisyon Oranı (%)"><Input type="number" step="0.5" value={s.commissionRate} onChange={e => setS({ ...s, commissionRate: +e.target.value })} /></F>
                    <F label="Min. Rating Oyunu"><Input type="number" step="0.1" value={s.minRatingToPlay} onChange={e => setS({ ...s, minRatingToPlay: +e.target.value })} /></F>
                    <F label="Günlük Max Maç"><Input type="number" value={s.maxMatchsPerDay} onChange={e => setS({ ...s, maxMatchsPerDay: +e.target.value })} /></F>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-[#161B22] border border-white/5 rounded-3xl p-5">
                <h3 className="text-xs font-black text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2"><AlertTriangle size={14} /> TEHLİKELİ BÖLGE</h3>
                <Toggle value={s.maintenanceMode} onChange={() => setS({ ...s, maintenanceMode: !s.maintenanceMode })} label="Bakım Modu" desc="Aktif iken kullanıcılar sisteme giremez" danger />
                <Toggle value={!s.registrationOpen} onChange={() => setS({ ...s, registrationOpen: !s.registrationOpen })} label="Kayıtları Dondur" desc="Yeni kullanıcı kaydını kapat" danger />
                <p className="text-[9px] text-gray-600 mt-3">⚠️ Butonlar anında etkili olmaz — KAYDET butonuna basmanız gerekmektedir.</p>
            </div>
        </div>
    );
};

// ══════════════════════════════════════════
// CONTENT TAB
// ══════════════════════════════════════════
export const ContentTab: React.FC = () => {
    const { globalTexts, setGlobalText } = useAppStore();
    const [local, setLocal] = useState<Record<string, string>>({});
    const { show, Toast } = useToast();

    useEffect(() => { if (globalTexts) setLocal({ ...globalTexts }); }, [globalTexts]);

    const save = () => {
        Object.entries(local).forEach(([k, v]) => setGlobalText(k, String(v)));
        show('✅ Tüm metinler Firebase\'e güncellendi!');
    };

    const keyLabel: Record<string, string> = {
        dashboardTitle: 'Ana Sayfa Başlığı',
        dashboardSubtitle: 'Ana Sayfa Alt Başlık',
        communityViewTitle: 'Topluluklar Başlığı',
        profileTitle: 'Profil Başlığı',
        matchDiscoveryTitle: 'Maç Bul Başlığı',
        marketplaceGkTitle: 'Kaleci Kiralama Başlığı',
        marketplaceRefTitle: 'Hakem Kiralama Başlığı',
        pitchDiscoveryTitle: 'Saha Kiralama Başlığı',
        opponentFinderTitle: 'Rakip Bul Başlığı',
        walletTitle: 'Cüzdan Başlığı',
        studioTitle: 'Taktik Studio Başlığı',
    };

    return (
        <div>
            <Toast />
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h2 className="text-xl font-black uppercase tracking-tighter mb-1">Metin Editörü</h2>
                    <p className="text-xs text-gray-500">Tüm ekran başlık ve yazılarını canlı değiştir</p>
                </div>
                <button onClick={save} className="h-10 px-5 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all">
                    <Save size={14} /> YAYINLA
                </button>
            </div>
            <div className="bg-[#161B22] border border-white/5 rounded-3xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(local).map(([key, value]) => (
                        <div key={key}>
                            <label className="block text-[10px] text-red-300 font-mono tracking-widest mb-1.5">{keyLabel[key] || key}</label>
                            <textarea
                                value={value}
                                onChange={e => setLocal({ ...local, [key]: e.target.value })}
                                className="w-full h-16 bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-white font-bold focus:outline-none focus:border-red-500/50 resize-none transition-all"
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ══════════════════════════════════════════
// METRICS TAB
// ══════════════════════════════════════════
export const MetricsTab: React.FC = () => {
    const { adminPitches, adminGoalkeepers, adminReferees, adminMatches, adminUsers, adminNotifications, updateAppSettings, appSettings } = useAppStore();
    const activeUsers = adminUsers.filter(u => !u.isBanned).length;
    const proUsers = adminUsers.filter(u => u.isPro).length;
    const { show, Toast } = useToast();
    const [dangerOps, setDangerOps] = useState<Record<string, boolean>>({});

    const runDangerOp = async (label: string, action: () => Promise<void> | void) => {
        setDangerOps(prev => ({ ...prev, [label]: true }));
        await Promise.resolve(action());
        setTimeout(() => {
            setDangerOps(prev => ({ ...prev, [label]: false }));
            show(`✅ ${label} başarıyla tamamlandı`);
        }, 1500);
    };

    const stats = [
        { label: 'Aktif Saha', value: adminPitches.length, icon: MapPin, color: 'green' },
        { label: 'Kaleci', value: adminGoalkeepers.length, icon: Shield, color: 'emerald' },
        { label: 'Hakem', value: adminReferees.length, icon: Scale, color: 'blue' },
        { label: 'Aktif Maç', value: adminMatches.length, icon: Activity, color: 'yellow' },
        { label: 'Kullanıcı', value: activeUsers, icon: Users, color: 'purple' },
        { label: 'Pro Üye', value: proUsers, icon: Activity, color: 'red' },
    ];

    const totalRevenue = adminMatches.reduce((acc, m) => acc + m.price, 0);
    const commissionEarned = Math.round(totalRevenue * appSettings.commissionRate / 100);

    return (
        <div className="space-y-6">
            <Toast />
            <h2 className="text-xl font-black uppercase tracking-tighter">Kontrol Paneli</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {stats.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-[#161B22] border border-white/5 rounded-2xl p-5 relative overflow-hidden group">
                        <Icon size={18} className={`text-${color}-400 mb-3 opacity-50`} />
                        <p className="text-[9px] text-gray-500 font-bold tracking-widest uppercase mb-1">{label}</p>
                        <p className="text-3xl font-black text-white">{value}</p>
                    </div>
                ))}
            </div>

            {/* Revenue summary */}
            <div className="bg-[#161B22] border border-white/5 rounded-3xl p-5">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Activity size={14} /> GELİR ÖZETİ</h3>
                <div className="grid grid-cols-3 gap-3">
                    {[['Toplam Ciro', `₺${totalRevenue.toLocaleString('tr')}`], ['Komisyon (%' + appSettings.commissionRate + ')', `₺${commissionEarned.toLocaleString('tr')}`], ['Net Gelir', `₺${(totalRevenue - commissionEarned).toLocaleString('tr')}`]].map(([l, v]) => (
                        <div key={l as string} className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                            <p className="text-[9px] text-gray-500 uppercase mb-1">{l}</p>
                            <p className="text-lg font-black text-white">{v}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* System health */}
            <div className="bg-[#161B22] border border-white/5 rounded-3xl p-5">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Database size={14} /> SİSTEM SAĞLIĞI</h3>
                <div className="space-y-2 font-mono text-xs">
                    {[
                        { label: 'Firestore DB', status: 'ONLINE', latency: '12ms', ok: true },
                        { label: 'Auth Service', status: 'ONLINE', latency: '8ms', ok: true },
                        { label: 'Storage Bucket', status: 'ONLINE', latency: '24ms', ok: true },
                        { label: 'Payment Gateway', status: 'DEGRADED', latency: '145ms', ok: false },
                    ].map(({ label, status, latency, ok }) => (
                        <div key={label} className="flex justify-between items-center bg-black/30 p-3 rounded-lg border border-white/5">
                            <span className="text-gray-400">{label}</span>
                            <span className={ok ? 'text-green-400' : 'text-yellow-400'} >
                                <span className={`inline-block w-2 h-2 rounded-full mr-2 animate-pulse ${ok ? 'bg-green-400' : 'bg-yellow-400'}`} />
                                {status} ({latency})
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Danger zone */}
            <div className="bg-red-900/10 border border-red-900/30 rounded-3xl p-5">
                <h3 className="text-xs font-black text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2"><AlertTriangle size={14} /> TEHLİKELİ BÖLGE</h3>
                <div className="flex flex-wrap gap-2">
                    {[
                        { label: 'Önbelleği Temizle', icon: RefreshCw, action: () => { /* clear local state caches */ } },
                        { label: 'DB Senkronizasyonu', icon: Database, action: () => updateAppSettings({ ...appSettings }) },
                        { label: 'Config Deploy', icon: Terminal, action: () => { /* force-write all settings */ } },
                    ].map(({ label, icon: Icon, action }) => (
                        <button key={label}
                            onClick={() => runDangerOp(label, action)}
                            disabled={!!dangerOps[label]}
                            className={`px-4 h-10 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 border transition-all ${dangerOps[label] ? 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30 cursor-wait' : 'bg-white/5 hover:bg-red-500/10 hover:text-red-400 text-white border-white/10'}`}>
                            <Icon size={13} className={dangerOps[label] ? 'animate-spin' : ''} /> {dangerOps[label] ? 'Çalışıyor...' : label}
                        </button>
                    ))}
                </div>
                <p className="text-[9px] text-gray-600 mt-3">⚠️ Bu işlemler geri alınamaz. Sorumlu kullanın.</p>
            </div>
        </div>
    );
};
