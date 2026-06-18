import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppStore } from '../../../store';
import { DataTable } from '../components/DataTable';
import { ActionConfirmModal, ActionConfirmOptions } from '../components/ActionConfirmModal';
import { AddUserModal } from '../components/AddUserModal';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { AdminFilterChips } from '../components/AdminFilterChips';
import { useAdminFilter } from '../hooks/useAdminFilter';
import { Users, Shield, Scale, PlayCircle, Trash2, Eye, Edit3, Ban, ShieldCheck, Star, BadgeCheck } from 'lucide-react';
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
        adminUsers, adminGoalkeepers, adminReferees, adminSession,
        addUser, deleteUser, banUser, unbanUser, toggleUserPro, verifyUser, addGoalkeeper, deleteGoalkeeper, addReferee, deleteReferee,
        setImpersonatedUser, setOriginalRole, setRole, setView, role, addAdminLog, loadServices
    } = useAppStore();

    const { success, error: toastError } = useAdminToast();
    const [confirmModal, setConfirmModal] = useState<ActionConfirmOptions | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [detailProvider, setDetailProvider] = useState<{ item: Goalkeeper | Referee; type: 'GK' | 'REF' } | null>(null);
    const [editProvider, setEditProvider] = useState<{ item: Goalkeeper | Referee; type: 'GK' | 'REF' } | null>(null);
    const [editUser, setEditUser] = useState<AdminUser | null>(null);
    const [page, setPage] = useState(0);
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned' | 'pro'>('all');
    const PAGE_SIZE = 50;

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
                            adminId: adminSession?.userId || 'system',
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
                    adminId: adminSession?.userId || 'system',
                });
                notify(`🕵️ Ghost Mode: ${targetUser.name} taklit ediliyor!`);
                setConfirmModal(null);
            }
        });
    };

    const handleBanToggle = (u: AdminUser) => {
        setConfirmModal({
            title: u.isBanned ? 'Banı Kaldır' : 'Kullanıcıyı Banla',
            description: u.isBanned
                ? `"${u.name}" tekrar sisteme giriş yapabilecek.`
                : `"${u.name}" sisteme giremeyecek. İşlem denetim kaydına yazılır.`,
            impactText: 'admin_ban_user RPC üzerinden uygulanır.',
            actionType: 'BAN_USER',
            targetId: u.id,
            targetName: u.name,
            onCancel: () => setConfirmModal(null),
            onConfirm: async () => {
                try {
                    if (u.isBanned) await unbanUser(u.id);
                    else await banUser(u.id);
                    notify(u.isBanned ? 'Ban kaldırıldı' : 'Kullanıcı banlandı');
                } catch (err) {
                    toastError(err instanceof Error ? err.message : 'Ban işlemi başarısız');
                }
                setConfirmModal(null);
            },
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
            onConfirm: async () => {
                try {
                    if (subRoute === 'KALECİLER') {
                        await deleteGoalkeeper(u.id);
                    } else if (subRoute === 'HAKEMLER') {
                        await deleteReferee(u.id);
                    } else {
                        await deleteUser(u.id);
                    }
                    notify(`🗑️ ${u.name} silindi`);
                } catch (err) {
                    toastError(err instanceof Error ? err.message : 'Silme başarısız');
                }
                setConfirmModal(null);
            }
        });
    };

    let icon = <Users size={18} />;
    let sourceData: any[] = adminUsers;
    if (subRoute === 'KALECİLER') {
        icon = <Shield size={18} />;
        sourceData = adminGoalkeepers;
    } else if (subRoute === 'HAKEMLER') {
        icon = <Scale size={18} />;
        sourceData = adminReferees;
    }

    const searchFn = useCallback((u: any, q: string) => {
        const hay = [u.name, u.email, u.role, u.style, u.level].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
    }, []);

    const { query, setQuery, filtered: searched } = useAdminFilter(sourceData, searchFn);

    const statusFiltered = useMemo(() => {
        if (subRoute !== 'KULLANICILAR' || statusFilter === 'all') return searched;
        if (statusFilter === 'active') return searched.filter((u) => !u.isBanned);
        if (statusFilter === 'banned') return searched.filter((u) => u.isBanned);
        return searched.filter((u) => u.isPro);
    }, [searched, statusFilter, subRoute]);

    useEffect(() => { setPage(0); }, [query, statusFilter, subRoute]);

    const totalUsers = statusFiltered.length;
    let data = statusFiltered;
    if (subRoute === 'KULLANICILAR') {
        data = statusFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    }

    const statusChips = useMemo(() => {
        if (subRoute !== 'KULLANICILAR') return [];
        const base = searched;
        return [
            { id: 'all', label: 'Tümü', count: base.length },
            { id: 'active', label: 'Aktif', count: base.filter((u) => !u.isBanned).length },
            { id: 'banned', label: 'Banlı', count: base.filter((u) => u.isBanned).length },
            { id: 'pro', label: 'Pro', count: base.filter((u) => u.isPro).length },
        ];
    }, [searched, subRoute]);

    let buttonIconColor = 'text-blue-400';
    let rowIconColor = 'text-blue-400';
    
    if (subRoute === 'KALECİLER') {
        buttonIconColor = 'text-green-400';
        rowIconColor = 'text-green-400';
    } else if (subRoute === 'HAKEMLER') {
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
                        <>
                        <button
                            onClick={() => setEditUser(u)}
                            title="Düzenle"
                            className="flex items-center gap-1 px-2.5 py-1 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-lg border border-purple-500/20 text-[9px] font-black uppercase"
                        >
                            <Edit3 size={12} /> Düzenle
                        </button>
                        <button
                            onClick={() => handleBanToggle(u)}
                            title={u.isBanned ? 'Banı kaldır' : 'Banla'}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase ${u.isBanned ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}
                        >
                            {u.isBanned ? <ShieldCheck size={12} /> : <Ban size={12} />}
                            {u.isBanned ? 'UNBAN' : 'BAN'}
                        </button>
                        <button
                            type="button"
                            title={u.isPro ? 'PRO kaldır' : 'PRO ver'}
                            onClick={async () => { try { await toggleUserPro(u.id); success(u.isPro ? 'PRO kaldırıldı' : 'PRO verildi'); } catch (err) { toastError(err instanceof Error ? err.message : 'İşlem başarısız'); } }}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-black ${u.isPro ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-white/5 text-gray-400 border-white/10'}`}
                        >
                            <Star size={11} /> PRO
                        </button>
                        {!u.isVerified && (
                            <button
                                type="button"
                                title="Doğrula"
                                onClick={async () => { try { await verifyUser(u.id); success('Hesap doğrulandı'); } catch (err) { toastError(err instanceof Error ? err.message : 'İşlem başarısız'); } }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-black bg-blue-500/10 text-blue-400 border-blue-500/30"
                            >
                                <BadgeCheck size={11} /> DOĞRULA
                            </button>
                        )}
                        </>
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
            <div className="space-y-4 mb-4">
                <AdminSearchBar
                    value={query}
                    onChange={setQuery}
                    placeholder={subRoute === 'KULLANICILAR' ? 'İsim, e-posta veya rol ara...' : 'İsim veya seviye ara...'}
                    resultCount={statusFiltered.length}
                    totalCount={sourceData.length}
                />
                {statusChips.length > 0 && (
                    <AdminFilterChips chips={statusChips} active={statusFilter} onChange={(id) => setStatusFilter(id as typeof statusFilter)} />
                )}
            </div>

            <DataTable columns={columns} data={data} emptyDescription={query ? 'Arama kriterlerine uygun kayıt yok.' : 'Yeni kayıt ekleyin veya demo verileri yükleyin.'} />

            {subRoute === 'KULLANICILAR' && totalUsers > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                    <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalUsers)} / {totalUsers}</span>
                    <div className="flex gap-2">
                        <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg border border-white/10 disabled:opacity-40">Önceki</button>
                        <button type="button" disabled={(page + 1) * PAGE_SIZE >= totalUsers} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg border border-white/10 disabled:opacity-40">Sonraki</button>
                    </div>
                </div>
            )}
            
            <ActionConfirmModal isOpen={!!confirmModal} options={confirmModal} />

            <AddUserModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                defaultRole={subRoute}
                onAddUser={async (u) => {
                    if (onRefresh) await onRefresh();
                    else useAppStore.setState({ adminUsers: [u, ...useAppStore.getState().adminUsers] });
                    notify(`✅ ${u.name} eklendi`);
                }}
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
