import React, { useState } from 'react';
import { useAppStore } from '../../../store';
import { Settings, Type, Database, Save } from 'lucide-react';
import { updateCmsTexts, toTurkishAdminError } from '../../../services/adminService';
import { DemoDataPanel } from '../components/DemoDataPanel';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';

interface SettingsPageProps {
    subRoute: 'SETTINGS' | 'CONTENT';
    onRefresh?: () => Promise<void>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ subRoute, onRefresh }) => {
    const { appSettings, updateAppSettings, globalTexts, setGlobalText } = useAppStore();
    const { success, error: toastError } = useAdminToast();
    const [saving, setSaving] = useState(false);

    const persistText = async (key: string, value: string) => {
        setGlobalText(key as keyof typeof globalTexts, value);
        setSaving(true);
        try {
            await updateCmsTexts({ [key]: value });
            success(`${key} kaydedildi`);
        } catch (err) {
            toastError(toTurkishAdminError(err));
        } finally {
            setSaving(false);
        }
    };

    if (subRoute === 'CONTENT') {
        return (
            <PageShell
                route="CONTENT"
                icon={<Type size={20} />}
                actions={<ModuleCrudBar moduleKey="texts" onRefresh={onRefresh} showDemo />}
            >
                <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
                    <p className="text-xs text-gray-500 mb-6">texts tablosu — uygulama genelinde görünen metinler</p>
                    <div className="space-y-4">
                        {Object.entries(globalTexts).map(([key, value]) => (
                            <div key={key} className="bg-black/30 border border-white/[0.06] rounded-xl p-4">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">{key}</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        defaultValue={value as string}
                                        onBlur={(e) => {
                                            if (e.target.value !== value) void persistText(key, e.target.value);
                                        }}
                                        disabled={saving}
                                        className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-pink-500/40 focus:outline-none transition-colors"
                                    />
                                    <button className="px-3 bg-pink-500/10 text-pink-400 border border-pink-500/20 rounded-lg">
                                        <Save size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </PageShell>
        );
    }

    if (subRoute === 'SETTINGS') {
        return (
            <PageShell route="SETTINGS" icon={<Settings size={20} />}>
                <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-black/30 border border-white/[0.06] rounded-xl p-5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 block">Ödeme Yöntemi (Param)</label>
                            <select 
                                value={appSettings.payoutMode || 'deposit'} 
                                onChange={e => {
                                    void updateAppSettings({ payoutMode: e.target.value as 'cash' | 'online' | 'deposit' }).then(() => success('Ödeme yöntemi güncellendi'));
                                }}
                                className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-blue-500/40 focus:outline-none"
                            >
                                <option value="cash">Sadece Sahada Nakit</option>
                                <option value="online">Tamamı Kredi Kartı</option>
                                <option value="deposit">Kapora Modu (Online + Nakit)</option>
                            </select>
                            <p className="text-[11px] text-gray-500 mt-2">Tüm sahalar için geçerli tahsilat modu.</p>
                        </div>

                        <div className="bg-black/30 border border-white/[0.06] rounded-xl p-5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 block">Sistem Komisyon Oranı (%)</label>
                            <input 
                                type="number" 
                                defaultValue={appSettings.commissionRate || 10} 
                                onBlur={(e) => {
                                    void updateAppSettings({ commissionRate: Number(e.target.value) }).then(() => success('Komisyon oranı güncellendi'));
                                }}
                                className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-blue-500/40 focus:outline-none"
                            />
                            <p className="text-[11px] text-gray-500 mt-2">Platform hizmet bedeli yüzdesi.</p>
                        </div>
                        
                        <div className="bg-black/30 border border-white/[0.06] rounded-xl p-5 md:col-span-2 flex items-center justify-between gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1 block flex items-center gap-2">
                                    <Database size={12} /> Master Bakım Modu
                                </label>
                                <p className="text-[11px] text-gray-500">Uygulamayı tüm kullanıcılara kapatır.</p>
                            </div>
                            <button 
                                onClick={() => {
                                    void updateAppSettings({ maintenanceMode: !appSettings.maintenanceMode }).then(() =>
                                      success(appSettings.maintenanceMode ? 'Sistem aktif edildi' : 'Bakım moduna geçildi')
                                    );
                                }}
                                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                                    appSettings.maintenanceMode 
                                        ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' 
                                        : 'bg-white/10 text-gray-400 hover:bg-white/20'
                                }`}
                            >
                                {appSettings.maintenanceMode ? 'Sistemi Aç' : 'Sistemi Kapat'}
                            </button>
                        </div>
                    </div>
                </div>

                <DemoDataPanel onRefresh={onRefresh} />
            </PageShell>
        );
    }

    return null;
};
