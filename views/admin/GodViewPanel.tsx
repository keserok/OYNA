import React, { useState, lazy, Suspense } from 'react';
import { useAppStore } from '../../store';
import { AdminLayout } from './layout/AdminLayout';

import {
    PitchModal, MatchModal, BanModal, PushModal,
    AddPlayerModal, ContactModal, LogModal, RevenueModal, MoreMenu
} from './GodViewModals';
import { DeepEditPitchModal, DeepEditUserModal, DeepEditProviderModal, AddPitchModal } from './DeepEditModals';
import { AnimatePresence } from 'framer-motion';
import { PendingVerificationsTab } from './PendingVerificationsTab';

// Lazy loaded page components
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const PitchesPage = lazy(() => import('./pages/PitchesPage').then(m => ({ default: m.PitchesPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const MatchesPage = lazy(() => import('./pages/MatchesPage').then(m => ({ default: m.MatchesPage })));
const CommunitiesPage = lazy(() => import('./pages/CommunitiesPage').then(m => ({ default: m.CommunitiesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

interface Props {
    onBack: () => void;
    onNavigate?: (tab: string) => void;
}

export const GodViewPanel: React.FC<Props> = ({ onBack, onNavigate }) => {
    const { deletePitch } = useAppStore();
    const [subRoute, setSubRoute] = useState<'GENEL' | 'CONTROL' | 'SAHALAR' | 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER' | 'MATCHES' | 'NOTIFICATIONS' | 'CONTENT' | 'SETTINGS' | 'TOPLULUKLAR' | 'TAKIMLAR' | 'TURNUVALAR' | 'PENDING_VERIFICATIONS'>('GENEL');
    const [modal, setModal] = useState<any>({ type: 'none' });
    const [pendingVerifCount, setPendingVerifCount] = useState(0);

    const handleNavigate = (route: typeof subRoute) => {
        setSubRoute(route);
        if (onNavigate) onNavigate(route);
    };

    const closeModal = () => setModal({ type: 'none' });

    const renderPage = () => {
        switch (subRoute) {
            case 'GENEL':
            case 'CONTROL':
                return <DashboardPage />;
            case 'SAHALAR':
                return (
                    <PitchesPage
                        onEditPitch={(pitch) => setModal({ type: 'deepEditPitch', data: pitch })}
                        onDeletePitch={(id) => deletePitch(id)}
                    />
                );
            case 'KULLANICILAR':
            case 'KALECİLER':
            case 'HAKEMLER':
                return <UsersPage subRoute={subRoute} />;
            case 'PENDING_VERIFICATIONS':
                return (
                    <div className="p-6">
                        <PendingVerificationsTab onBadgeCount={setPendingVerifCount} />
                    </div>
                );
            case 'MATCHES':
                return <MatchesPage />;
            case 'TOPLULUKLAR':
            case 'TAKIMLAR':
            case 'TURNUVALAR':
                return <CommunitiesPage subRoute={subRoute} />;
            case 'SETTINGS':
            case 'CONTENT':
            case 'NOTIFICATIONS':
                return <SettingsPage subRoute={subRoute} />;
            default:
                return (
                    <div className="flex items-center justify-center h-full text-gray-500 font-mono text-sm">
                        {subRoute} Sayfası Yapım Aşamasında 🚀
                    </div>
                );
        }
    };

    return (
        <>
            <AdminLayout
                activeSubRoute={subRoute}
                onNavigate={handleNavigate}
                onBack={onBack}
                pendingVerifCount={pendingVerifCount}
            >
                <Suspense fallback={
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                        <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs font-mono font-black tracking-widest uppercase">Sayfa Yükleniyor...</span>
                    </div>
                }>
                    {renderPage()}
                </Suspense>
            </AdminLayout>

            {/* Deep-edit modals */}
            <AnimatePresence>
                {modal.type === 'deepEditPitch' && (
                    <DeepEditPitchModal pitch={modal.data} onClose={closeModal} />
                )}
                {modal.type === 'deepEditUser' && (
                    <DeepEditUserModal user={modal.data} onClose={closeModal} />
                )}
                {modal.type === 'deepEditProvider' && (
                    <DeepEditProviderModal data={modal.data} type={modal.typeParam} onClose={closeModal} />
                )}
                {modal.type === 'addPitch' && (
                    <AddPitchModal onClose={closeModal} />
                )}
            </AnimatePresence>
        </>
    );
};

export default GodViewPanel;
