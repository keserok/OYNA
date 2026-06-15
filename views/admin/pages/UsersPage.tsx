import React, { useState } from 'react';
import { useAppStore } from '../../../store';
import { DataTable } from '../components/DataTable';
import { ActionConfirmModal, ActionConfirmOptions } from '../components/ActionConfirmModal';
import { AddUserModal } from '../components/AddUserModal';
import { Users, Shield, Scale, PlayCircle, Trash2, Eye, Edit3 } from 'lucide-react';
import { logImpersonation } from '../../../services/adminService';
import { openGhostInConsumerApp } from '../../../utils/ghostDeepLink';
import { ProviderDetailPanel } from '../components/ProviderDetailPanel';
import { DeepEditProviderModal, DeepEditUserModal } from '../DeepEditModals';
import { Goalkeeper, Referee, AdminUser } from '../../../types';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import type { DemoModuleKey } from '../../../services/adminService';

interface UsersPageProps {
    subRoute: 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER';
    mode?: 'embedded' | 'standalone';
    onRefresh?: () => Promise<void>;
}

const DEMO_MODULE: Record<UsersPageProps['subRoute'], DemoModuleKey | null> = {
    KULLANICILAR: null,
    'KALECİLER': 'goalkeepers',
    HAKEMLER: 'referees',
};

export const UsersPage: React.FC<UsersPageProps> = ({ subRoute, mode = 'embedded', onRefresh }) => {
    const { 
        adminUsers, adminGoalkeepers, adminReferees, 
        addUser, deleteUser, addGoalkeeper, deleteGoalkeeper, addReferee, deleteReferee,
        setImpersonatedUser, setOriginalRole, setRole, setView, role, addAdminLog, loadServices
    } = useAppStore();

    const { success } = useAdminToast();
    const [confirmModal, setConfirmModal] = useState<ActionConfirmOptions | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [detailProvider, setDetailProvider] = useState<{ item: Goalkeeper | Referee; type: 'GK' | 'REF' } | null>(null);
    const [editProvider, setEditProvider] = useState<{ item: Goalkeeper | Referee; type: 'GK' | 'REF' } | null>(null);
    const [editUser, setEditUser] = useState<AdminUser | null>(null);

    const refresh = async () => {
        await loadServices();
        if (onRefresh) await onRefresh();
    };

    const notify = (msg: string) => success(msg);

    const handleImpersonateRequest = (userId: string) => {
        const sourceData = subRoute === 'KALECİLER' ? adminGoalkeepers : subRoute === 'HAKEMLER' ? adminReferees : adminUsers;
        const targetUser = sourceData.find(u => u.id === userId);
        if (!targetUser) return;
        
        setConfirmModal({
            title: 'Ghost Mode Girişi',
            description: `${targetUser.name} adlı kullanıcının profiline giriş yapmak üzeresiniz. Bu işlem sırasında kullanıcının yetkilerine sahip olacaksınız.`,
            impactText: 'Sistemi bu kullanıcının gözünden göreceksiniz. Yaptığınız işlemler veritabanına kaydedilir.',
            actionType: 'GHOST_MODE',
            targetId: targetUser.id,
            targetName: targetUser.name,
            onCancel: () => setConfirmModal(null),
            onConfirm: async () => {
                if (mode === 'standalone') {
                    try {
                        await logImpersonation(targetUser.id);
                        addAdminLog({
                            action: 'GHOST_MODE',
                            targetId: targetUser.id,
                            targetName: targetUser.name,
                            details: 'Standalone deep-link ghost session',
                            adminId: 'ADMIN_CURRENT',
                        });
                        openGhostInConsumerApp(targetUser.id, targetUser.name);
                        notify(`🕵️ ${targetUser.name} — consumer app'te açılıyor`);
                    } catch {
                        notify('Ghost mode kaydı başarısız');
                    }
                    setConfirmModal(null);
                    return;
                }
                setOriginalRole(role);
                setImpersonatedUser(targetUser as any);
                setRole((targetUser as any).role || 'PLAYER');
                if ((targetUser as any).role === 'OWNER') setView('OWNER_PANEL');
                else if (subRoute === 'HAKEMLER' || subRoute === 'KALECİLER') setView('SERVICE_DASHBOARD');
                else setView('DASHBOARD');

                try { await logImpersonation(targetUser.id); } catch { /* audit optional */ }
                addAdminLog({
                    action: 'GHOST_MODE',
                    targetId: targetUser.id,
                    targetName: targetUser.name,
                    details: 'Ghost Mode Session Started',
                    adminId: 'ADMIN_CURRENT',
                });
                notify(`🕵️ Ghost Mode: ${targetUser.name} taklit ediliyor!`);
                setConfirmModal(null);
            }
        });
    };

    const handleDeleteRequest = (u: any) => {
        setConfirmModal({
            title: 'Kayıt Silme İşlemi',
            description: `"${u.name}" adlı profili sistemden tamamen silmek üzeresiniz.`,
            impactText: 'Bu işlem geri alınamaz. Kullanıcının tüm geçmiş verileri ve yetkileri kalıcı olarak silinecektir.',
            actionType: 'BAN_USER',
            targetId: u.id,
            targetName: u.name,
            onCancel: () => setConfirmModal(null),
            onConfirm: () => {
                if (subRoute === 'KALECİLER') {
                    deleteGoalkeeper(u.id);
                } else if (subRoute === 'HAKEMLER') {
                    deleteReferee(u.id);
                } else {
                    deleteUser(u.id);
                }
                notify(`🗑️ ${u.name} silindi`);
                setConfirmModal(null);
            }
        });
    };

    let title = 'Kullanıcı Bilgi Bankası';
    let icon = <Users size={18} />;
    let data: any[] = adminUsers;
    let buttonIconColor = 'text-blue-400';
    let rowIconColor = 'text-blue-400';
    
    if (subRoute === 'KALECİLER') {
        icon = <Shield size={18} />;
        data = adminGoalkeepers;
        buttonIconColor = 'text-green-400';
        rowIconColor = 'text-green-400';
    } else if (subRoute === 'HAKEMLER') {
        icon = <Scale size={18} />;
        data = adminReferees;
        buttonIconColor = 'text-yellow-400';
        rowIconColor = 'text-yellow-400';
    }

    const columns = [
        {
            header: 'AVATAR',
            render: (u: any) => (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg bg-cover bg-center`}
                     style={{ backgroundImage: `url(${u.avatar})`, backgroundColor: '#333' }}>
                    {!u.avatar && ((u.name || '').charAt(0) || 'U')}
                </div>
            )
        },
        {
            header: 'İSİM & ROL / SEVİYE',
            render: (u: any) => (
                <div>
                    <div className="font-bold text-white flex items-center gap-1.5">{u.name} <span className="text-[10px] text-gray-500 font-mono">({u.rating?.toFixed(1) || '5.0'}★)</span></div>
                    <div className={`text-[9px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded inline-block mt-1 font-black ${rowIconColor}`}>
                        {subRoute === 'KULLANICILAR' ? (u.role || 'PLAYER') : 
                         subRoute === 'KALECİLER' ? (u.style || 'KALECİ') : 
                         (u.level || 'HAKEM')}
                    </div>
                </div>
            )
        },
        {
            header: subRoute === 'KULLANICILAR' ? 'İLETİŞİM' : 'MAÇ / ÜCRET',
            render: (u: any) => (
                subRoute === 'KULLANICILAR' ? (
                    <span className="text-gray-400 font-mono text-[10px]">{u.email || 'Bilinmiyor'}</span>
                ) : (
                    <span className="text-gray-300 font-mono text-[10px]">
                        {u.matchCount || 0} Maç / <span className="text-green-400 font-bold">₺{u.fee || 0}</span>
                    </span>
                )
            )
        },
        {
            header: 'STATÜ',
            render: (u: any) => (
                <div className="flex gap-1.5 flex-wrap">
                    {u.isPro && <StatusBadge tone="warning">PRO</StatusBadge>}
                    {(u.isVerified || subRoute !== 'KULLANICILAR') && <StatusBadge tone="info">DOĞRULANMIŞ</StatusBadge>}
                    {u.isBanned 
                        ? <StatusBadge tone="danger">BANNED</StatusBadge>
                        : <StatusBadge tone="success">AKTİF</StatusBadge>}
                    {(u as { isDemo?: boolean }).isDemo && <StatusBadge tone="demo">DEMO</StatusBadge>}
                </div>
            )
        },
        {
            header: 'AKSİYONLAR',
            render: (u: any) => (
                <div className="flex gap-2 flex-wrap">
                    {(subRoute === 'KALECİLER' || subRoute === 'HAKEMLER') && (
                        <>
                            <button
                                onClick={() => setDetailProvider({ item: u, type: subRoute === 'KALECİLER' ? 'GK' : 'REF' })}
                                title="Detay"
                                className="flex items-center gap-1 px-2.5 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg border border-blue-500/20 text-[9px] font-black uppercase"
                            >
                                <Eye size={12} /> Detay
                            </button>
                            <button
                                onClick={() => setEditProvider({ item: u, type: subRoute === 'KALECİLER' ? 'GK' : 'REF' })}
                                title="Düzenle"
                                className="flex items-center gap-1 px-2.5 py-1 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-lg border border-purple-500/20 text-[9px] font-black uppercase"
                            >
                                <Edit3 size={12} /> Düzenle
                            </button>
                        </>
                    )}
                    {subRoute === 'KULLANICILAR' && (
                        <button
                            onClick={() => setEditUser(u)}
                            title="Düzenle"
                            className="flex items-center gap-1 px-2.5 py-1 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-lg border border-purple-500/20 text-[9px] font-black uppercase"
                        >
                            <Edit3 size={12} /> Düzenle
                        </button>
                    )}
                    <button 
                        onClick={() => handleImpersonateRequest(u.id)}
                        title="Ghost Mode (Giriş Yap)" 
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg border border-white/10 transition-all text-[9px] font-black tracking-widest uppercase"
                    >
                        <PlayCircle size={12} className={buttonIconColor} /> GHOST
                    </button>
                    <button onClick={() => handleDeleteRequest(u)} className="p-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg border border-red-500/20 transition-all shadow-[0_0_10px_rgba(239,68,68,0.0)] hover:shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                        <Trash2 size={12} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <PageShell
            route={subRoute}
            icon={icon}
            actions={
                <ModuleCrudBar
                    moduleKey={DEMO_MODULE[subRoute]}
                    addLabel={`Yeni ${subRoute === 'KULLANICILAR' ? 'Kişi' : subRoute === 'KALECİLER' ? 'Kaleci' : 'Hakem'}`}
                    onAdd={() => setIsAddModalOpen(true)}
                    onRefresh={refresh}
                    showDemo={DEMO_MODULE[subRoute] !== null}
                />
            }
        >
            <DataTable columns={columns} data={data} emptyDescription="Yeni kayıt ekleyin veya demo verileri yükleyin." />
            
            <ActionConfirmModal isOpen={!!confirmModal} options={confirmModal} />

            <AddUserModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                defaultRole={subRoute}
                onAddUser={(u) => { addUser(u); notify(`✅ ${u.name} eklendi`); }}
                onAddGoalkeeper={(gk) => { addGoalkeeper(gk); notify(`✅ ${gk.name} eklendi`); }}
                onAddReferee={(ref) => { addReferee(ref); notify(`✅ ${ref.name} eklendi`); }}
            />

            {detailProvider && (
                <ProviderDetailPanel
                    provider={detailProvider.item}
                    type={detailProvider.type}
                    onEdit={() => { setEditProvider(detailProvider); setDetailProvider(null); }}
                    onClose={() => setDetailProvider(null)}
                />
            )}
            {editProvider && (
                <DeepEditProviderModal
                    item={editProvider.item}
                    typeParam={editProvider.type}
                    onClose={() => { setEditProvider(null); void refresh(); }}
                />
            )}
            {editUser && (
                <DeepEditUserModal
                    user={editUser}
                    onClose={() => { setEditUser(null); void refresh(); }}
                />
            )}
        </PageShell>
    );
};
