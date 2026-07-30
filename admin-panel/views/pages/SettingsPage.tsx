import React, { useState } from 'react';
import { useAppStore } from '../../../store';
import { Settings, Type, Database, Save } from 'lucide-react';
import { updateCmsTexts, toTurkishAdminError } from '../../services/adminService';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { PageShell } from '../components/PageShell';
import { ActionConfirmModal, type ActionConfirmOptions } from '../components/ActionConfirmModal';
import { useAdminToast } from '../context/AdminToastContext';

interface SettingsPageProps {
    subRoute: 'SETTINGS' | 'CONTENT';
    onRefresh?: () => Promise<void>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ subRoute, onRefresh }) => {
    const { appSettings, updateAppSettings, globalTexts, setGlobalText } = useAppStore();
    const { success, error: toastError } = useAdminToast();
    const [saving, setSaving] = useState(false);
    const [confirmOptions, setConfirmOptions] = useState<ActionConfirmOptions | null>(null);

    const requestMaintenanceToggle = () => {
        const enabling = !appSettings.maintenanceMode;
        setConfirmOptions({
            title: enabling ? 'Bakım Moduna Geç' : 'Bakım Modundan Çık',
            description: enabling
                ? 'Uygulama TÜM kullanıcılara kapatılacak; oyuncular, saha sahipleri ve hizmet sağlayıcılar giriş yapamaz.'
                : 'Uygulama tüm kullanıcılara yeniden açılacak.',
            impactText: enabling
                ? 'Aktif rezervasyon/maç akışları kesintiye uğrar. Yalnızca planlı bakım için kullanın.'
                : undefined,
            actionType: 'SETTINGS_CHANGE',
            targetId: 'maintenance_mode',
            targetName: 'Master Bakım Modu',
            confirmPhrase: enabling ? 'BAKIM' : undefined,
            onConfirm: () => {
                setConfirmOptions(null);
                void updateAppSettings({ maintenanceMode: enabling })
                    .then(() => success(enabling ? 'Bakım moduna geçildi' : 'Sistem yeniden açıldı'))
                    .catch((err) => toastError(toTurkishAdminError(err)));
            },
            onCancel: () => setConfirmOptions(null),
        });
    };

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
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            const input = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement);
                                            if (input && input.value !== value) void persistText(key, input.value);
                                        }}
                                        disabled={saving}
                                        className="px-3 bg-pink-500/10 text-pink-400 border border-pink-500/20 rounded-lg hover:bg-pink-500/20 disabled:opacity-40"
                                        title="Kaydet"
                                    >
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

                        <div className="bg-black/30 border border-amber-500/20 rounded-xl p-5">
                            <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2 block">Komisyon Oranları</label>
                            <p className="text-[12px] text-gray-300 leading-relaxed">
                                Komisyon oranları artık <b>tek kaynaktan</b> — sol menüdeki <b>Komisyon</b> sayfasından —
                                yönetilir (global/saha/hizmet/maç bazında). Buradaki eski alan kaldırıldı; böylece
                                "değiştirdim ama değişmedi" karışıklığı önlenir.
                            </p>
                        </div>
                        

                        {/* "Min. Oyun Puanı" alanı söküldü: puan barajı sistemden kalktı
                            (20260831000000) — beyan (self_skill) barajda kullanılmaz. */}

                        <div className="bg-black/30 border border-white/[0.06] rounded-xl p-5 flex items-center justify-between gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Kayıt Açık</label>
                                <p className="text-[11px] text-gray-500">Yeni kullanıcı kaydına izin ver</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    void updateAppSettings({ registrationOpen: !appSettings.registrationOpen }).then(() =>
                                      success(appSettings.registrationOpen ? 'Kayıt kapatıldı' : 'Kayıt açıldı')
                                    );
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-extrabold ${appSettings.registrationOpen !== false ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'}`}
                            >
                                {appSettings.registrationOpen !== false ? 'AÇIK' : 'KAPALI'}
                            </button>
                        </div>

                        <div className="bg-black/30 border border-white/[0.06] rounded-xl p-5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 block">Uygulama Adı</label>
                            <input
                                type="text"
                                defaultValue={appSettings.appName ?? 'OYNA'}
                                onBlur={(e) => {
                                    void updateAppSettings({ appName: e.target.value }).then(() => success('Uygulama adı güncellendi'));
                                }}
                                className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-blue-500/40 focus:outline-none"
                            />
                        </div>

                        <div className="bg-black/30 border border-white/[0.06] rounded-xl p-5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 block">Günlük Maç Limiti</label>
                            <input
                                type="number"
                                defaultValue={appSettings.maxMatchsPerDay ?? 3}
                                onBlur={(e) => {
                                    void updateAppSettings({ maxMatchsPerDay: Number(e.target.value) }).then(() => success('Maç limiti güncellendi'));
                                }}
                                className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-blue-500/40 focus:outline-none"
                            />
                        </div>

                        <div className="bg-black/30 border border-white/[0.06] rounded-xl p-5 md:col-span-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 block">Duyuru Bandı Metni</label>
                            <input
                                type="text"
                                defaultValue={appSettings.announcementBanner ?? ''}
                                onBlur={(e) => {
                                    void updateAppSettings({ announcementBanner: e.target.value }).then(() => success('Duyuru metni güncellendi'));
                                }}
                                className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-blue-500/40 focus:outline-none"
                            />
                            <div className="flex items-center justify-between mt-3">
                                <p className="text-[11px] text-gray-500">Duyuru bandını uygulamada göster</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void updateAppSettings({ showAnnouncementBanner: !appSettings.showAnnouncementBanner }).then(() =>
                                          success(appSettings.showAnnouncementBanner ? 'Duyuru bandı gizlendi' : 'Duyuru bandı açıldı')
                                        );
                                    }}
                                    className={`px-4 py-2 rounded-xl text-xs font-extrabold ${appSettings.showAnnouncementBanner !== false ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'}`}
                                >
                                    {appSettings.showAnnouncementBanner !== false ? 'GÖSTERİLİYOR' : 'GİZLİ'}
                                </button>
                            </div>
                        </div>

                        <div className={`bg-black/30 border rounded-xl p-5 md:col-span-2 flex items-center justify-between gap-4 ${appSettings.maintenanceMode ? 'border-red-500/40' : 'border-white/[0.06]'}`}>
                            <div>
                                <label className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1 block flex items-center gap-2">
                                    <Database size={12} /> Master Bakım Modu
                                    {appSettings.maintenanceMode && (
                                        <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[9px]">AKTİF</span>
                                    )}
                                </label>
                                <p className="text-[11px] text-gray-500">
                                    Uygulamayı tüm kullanıcılara kapatır. Açmak için yaz-onayla gerekir; işlem audit&apos;e kaydedilir.
                                </p>
                            </div>
                            <button
                                onClick={requestMaintenanceToggle}
                                className={`px-6 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all shrink-0 ${
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
                <ActionConfirmModal isOpen={!!confirmOptions} options={confirmOptions} />
            </PageShell>
        );
    }

    return null;
};
