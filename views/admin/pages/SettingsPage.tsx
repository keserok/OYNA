import React, { useState } from 'react';
import { useAppStore } from '../../../store';
import { Settings, Type, Database, RefreshCw, Save } from 'lucide-react';

interface SettingsPageProps {
    subRoute: 'SETTINGS' | 'CONTENT' | 'NOTIFICATIONS';
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ subRoute }) => {
    const { appSettings, updateAppSettings, globalTexts, setGlobalText } = useAppStore();
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    };

    if (subRoute === 'CONTENT') {
        return (
            <div className="p-6 space-y-6">
                <div className="bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl">
                    <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
                        <Type size={16} className="text-pink-500" /> CMS & Metin Yönetimi
                    </h2>

                    <div className="space-y-4">
                        {Object.entries(globalTexts).map(([key, value]) => (
                            <div key={key} className="bg-black/30 border border-white/5 rounded-xl p-4">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">{key}</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        defaultValue={value as string} 
                                        onBlur={(e) => {
                                            if (e.target.value !== value) {
                                                setGlobalText(key as any, e.target.value);
                                                showToast(`${key} güncellendi ✓`);
                                            }
                                        }}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-pink-500/50 focus:outline-none transition-colors"
                                    />
                                    <button className="px-3 bg-pink-500/10 text-pink-400 border border-pink-500/20 rounded-lg hover:bg-pink-500/20 transition-colors">
                                        <Save size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {toast && <div className="fixed bottom-10 right-10 bg-green-500/10 text-green-400 px-4 py-2 rounded-lg border border-green-500/20 text-xs font-bold animate-pulse z-50">{toast}</div>}
            </div>
        );
    }

    if (subRoute === 'SETTINGS') {
        return (
            <div className="p-6 space-y-6">
                <div className="bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl">
                    <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
                        <Settings size={16} className="text-gray-400" /> Sistem Ayarları
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Payout Mode */}
                        <div className="bg-black/30 border border-white/5 rounded-xl p-5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Ödeme Yöntemi (Param)</label>
                            <select 
                                value={appSettings.payoutMode} 
                                onChange={e => {
                                    updateAppSettings({ payoutMode: e.target.value as any });
                                    showToast('Ödeme yöntemi güncellendi ✓');
                                }}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                            >
                                <option value="cash" className="bg-[#0D1117]">Sadece Sahada Nakit</option>
                                <option value="online" className="bg-[#0D1117]">Tamamı Kredi Kartı</option>
                                <option value="deposit" className="bg-[#0D1117]">Kapora Modu (Online + Nakit)</option>
                            </select>
                            <p className="text-[10px] text-gray-500 mt-2 font-mono">Tüm sahalar için geçerli olan ödeme yöntemi tahsilatını belirler.</p>
                        </div>

                        {/* Commission Rate */}
                        <div className="bg-black/30 border border-white/5 rounded-xl p-5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Sistem Komisyon Oranı (%)</label>
                            <input 
                                type="number" 
                                defaultValue={appSettings.commissionRate || 10} 
                                onBlur={(e) => {
                                    updateAppSettings({ commissionRate: Number(e.target.value) });
                                    showToast('Komisyon oranı güncellendi ✓');
                                }}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                            />
                            <p className="text-[10px] text-gray-500 mt-2 font-mono">İşletmelerden ve oyunculardan alınan platform hizmet bedeli yüzdesi.</p>
                        </div>
                        
                        {/* Maintenance Mode */}
                        <div className="bg-black/30 border border-white/5 rounded-xl p-5 md:col-span-2 flex items-center justify-between">
                            <div>
                                <label className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1 block flex items-center gap-2">
                                    <Database size={12} /> Master Bakım Modu
                                </label>
                                <p className="text-[10px] text-gray-500 font-mono">Uygulamayı tüm kullanıcılara kapatır ve bakım sayfası gösterir.</p>
                            </div>
                            <button 
                                onClick={() => {
                                    updateAppSettings({ maintenanceMode: !appSettings.maintenanceMode });
                                    showToast(appSettings.maintenanceMode ? 'Sistem aktif edildi' : 'Bakım moduna geçildi');
                                }}
                                className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                    appSettings.maintenanceMode 
                                        ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' 
                                        : 'bg-white/10 text-gray-400 hover:bg-white/20'
                                }`}
                            >
                                {appSettings.maintenanceMode ? 'SİSTEMİ AÇ' : 'SİSTEMİ KAPAT'}
                            </button>
                        </div>
                    </div>
                </div>
                {toast && <div className="fixed bottom-10 right-10 bg-green-500/10 text-green-400 px-4 py-2 rounded-lg border border-green-500/20 text-xs font-bold animate-pulse z-50">{toast}</div>}
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center h-full text-gray-500 font-mono text-sm">
            {subRoute} Sayfası Yapım Aşamasında 🚀
        </div>
    );
};
