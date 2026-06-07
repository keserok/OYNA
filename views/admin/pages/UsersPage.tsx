import React, { useState } from 'react';
import { useAppStore } from '../../../store';
import { DataTable } from '../components/DataTable';
import { ActionConfirmModal, ActionConfirmOptions } from '../components/ActionConfirmModal';
import { AddUserModal } from '../components/AddUserModal';
import { Users, Shield, Scale, PlayCircle, PlusCircle, Trash2 } from 'lucide-react';

interface UsersPageProps {
    subRoute: 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER';
}

export const UsersPage: React.FC<UsersPageProps> = ({ subRoute }) => {
    const { 
        adminUsers, adminGoalkeepers, adminReferees, 
        addUser, deleteUser, addGoalkeeper, deleteGoalkeeper, addReferee, deleteReferee,
        setImpersonatedUser, setOriginalRole, setRole, setView, role, addAdminLog 
    } = useAppStore();

    const [toast, setToast] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<ActionConfirmOptions | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    };

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
            onConfirm: () => {
                setOriginalRole(role);
                setImpersonatedUser(targetUser as any);
                setRole((targetUser as any).role || 'PLAYER');
                if ((targetUser as any).role === 'OWNER') setView('OWNER_PANEL');
                else if (subRoute === 'HAKEMLER' || subRoute === 'KALECİLER') setView('SERVICE_DASHBOARD');
                else setView('DASHBOARD');
                
                addAdminLog({
                    action: 'GHOST_MODE',
                    targetId: targetUser.id,
                    targetName: targetUser.name,
                    details: 'Ghost Mode Session Started',
                    adminId: 'ADMIN_CURRENT'
                });
                showToast(`🕵️ Ghost Mode: ${targetUser.name} taklit ediliyor!`);
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
                showToast(`🗑️ ${u.name} silindi`);
                setConfirmModal(null);
            }
        });
    };

    let title = 'Kullanıcı Bilgi Bankası';
    let icon = <Users size={16} className="text-blue-400" />;
    let data: any[] = adminUsers;
    let buttonColor = 'bg-blue-400 hover:bg-blue-300 shadow-[0_0_20px_rgba(96,165,250,0.3)]';
    let buttonIconColor = 'text-blue-400';
    let rowIconColor = 'text-blue-400';
    
    if (subRoute === 'KALECİLER') {
        title = 'Kaleciler Birliği';
        icon = <Shield size={16} className="text-green-400" />;
        data = adminGoalkeepers;
        buttonColor = 'bg-green-400 hover:bg-green-300 shadow-[0_0_20px_rgba(74,222,128,0.3)]';
        buttonIconColor = 'text-green-400';
        rowIconColor = 'text-green-400';
    } else if (subRoute === 'HAKEMLER') {
        title = 'Hakem Komitesi';
        icon = <Scale size={16} className="text-yellow-400" />;
        data = adminReferees;
        buttonColor = 'bg-yellow-400 hover:bg-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.3)]';
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
                    {u.isPro && <span className="text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded text-[9px] font-black border border-yellow-500/20">PRO</span>}
                    {(u.isVerified || subRoute !== 'KULLANICILAR') && <span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded text-[9px] font-black border border-blue-500/20">DOĞRULANMIŞ</span>}
                    {u.isBanned 
                        ? <span className="text-red-500 bg-red-500/10 px-2 py-0.5 rounded text-[9px] font-black border border-red-500/20">BANNED</span>
                        : <span className="text-green-500 bg-green-500/10 px-2 py-0.5 rounded text-[9px] font-black border border-green-500/20">AKTİF</span>}
                </div>
            )
        },
        {
            header: 'AKSİYONLAR',
            render: (u: any) => (
                <div className="flex gap-2">
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
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl">
                <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
                        {icon} {title}
                    </h2>
                    <p className="text-[10px] text-gray-500 mt-1">
                        Sistemdeki tüm kayıtlı {subRoute.toLowerCase()} listelenmektedir. Ghost modu ile profillerini taklit edebilirsiniz.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {toast && <span className="text-[10px] font-black text-[#39FF14] bg-[#39FF14]/10 px-3 py-1.5 rounded-lg border border-[#39FF14]/20 animate-pulse">{toast}</span>}
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className={`flex items-center justify-center gap-2 px-5 py-2.5 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all ${buttonColor}`}
                    >
                        <PlusCircle size={16} /> YENİ {subRoute === 'KULLANICILAR' ? 'KİŞİ' : subRoute === 'KALECİLER' ? 'KALECİ' : 'HAKEM'} EKLE
                    </button>
                </div>
            </div>

            <DataTable columns={columns} data={data} />
            
            <ActionConfirmModal isOpen={!!confirmModal} options={confirmModal} />

            <AddUserModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                defaultRole={subRoute}
                onAddUser={(u) => { addUser(u); showToast(`✅ ${u.name} eklendi`); }}
                onAddGoalkeeper={(gk) => { addGoalkeeper(gk); showToast(`✅ ${gk.name} eklendi`); }}
                onAddReferee={(ref) => { addReferee(ref); showToast(`✅ ${ref.name} eklendi`); }}
            />
        </div>
    );
};
