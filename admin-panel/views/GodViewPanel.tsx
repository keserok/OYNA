import React, { useState, lazy, Suspense, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store';
import { AdminLayout } from './layout/AdminLayout';
import { DeepEditPitchModal, DeepEditUserModal, DeepEditProviderModal, AddPitchModal } from './DeepEditModals';
import { AnimatePresence } from 'framer-motion';
import { PageLoadingSkeleton } from './components/PageLoadingSkeleton';
import type { AdminSession } from '../services/adminService';
import type { Pitch, AdminUser, Goalkeeper, Referee } from '../../types';

type AdminModalState =
  | { type: 'none' }
  | { type: 'addPitch' }
  | { type: 'deepEditPitch'; data: Pitch }
  | { type: 'deepEditUser'; data: AdminUser }
  | { type: 'deepEditProvider'; data: Goalkeeper | Referee; typeParam: 'GK' | 'REF' };
import {
  AdminNavigationProvider,
  useAdminNavigation,
  type AdminNavParams,
} from './context/AdminNavigationContext';
import { AdminPermissionsProvider, useAdminPermissions } from './context/AdminPermissionsContext';
import { useAdminToast } from './context/AdminToastContext';

const OwnerAccountsPage = lazy(() => import('./pages/OwnerAccountsPage').then(m => ({ default: m.OwnerAccountsPage })));

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const CommandCenterPage = lazy(() => import('./pages/CommandCenterPage').then(m => ({ default: m.CommandCenterPage })));
const PitchesPage = lazy(() => import('./pages/PitchesPage').then(m => ({ default: m.PitchesPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const MatchesPage = lazy(() => import('./pages/MatchesPage').then(m => ({ default: m.MatchesPage })));
const CommunitiesPage = lazy(() => import('./pages/CommunitiesPage').then(m => ({ default: m.CommunitiesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const FinancePage = lazy(() => import('./pages/FinancePage').then(m => ({ default: m.FinancePage })));
const DisputesPage = lazy(() => import('./pages/DisputesPage').then(m => ({ default: m.DisputesPage })));
const CampaignsPage = lazy(() => import('./pages/CampaignsPage').then(m => ({ default: m.CampaignsPage })));
const PromoCodesPage = lazy(() => import('./pages/PromoCodesPage').then(m => ({ default: m.PromoCodesPage })));
const ACLPage = lazy(() => import('./pages/ACLPage').then(m => ({ default: m.ACLPage })));
const PendingVerificationsPage = lazy(() => import('./pages/PendingVerificationsPage').then(m => ({ default: m.PendingVerificationsPage })));
const ModerationPage = lazy(() => import('./pages/ModerationPage').then(m => ({ default: m.ModerationPage })));

export type GodViewSubRoute =
  | 'GENEL' | 'CONTROL' | 'SAHALAR' | 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER'
  | 'MATCHES' | 'NOTIFICATIONS' | 'CONTENT' | 'SETTINGS' | 'TOPLULUKLAR'
  | 'TAKIMLAR' | 'TURNUVALAR' | 'PENDING_VERIFICATIONS' | 'MODERATION'
  | 'OWNER_ACCOUNTS' | 'AUDIT_LOG' | 'FINANCE' | 'DISPUTES' | 'PROMO_CODES' | 'ACL' | 'SEGMENTATION';

export type AdminNavigateFn = (route: GodViewSubRoute, params?: AdminNavParams) => void;

interface Props {
    onBack: () => void;
    onNavigate?: (tab: string) => void;
    mode?: 'embedded' | 'standalone';
    adminSession?: AdminSession | null;
    onRefreshData?: () => Promise<void>;
    initialSubRoute?: GodViewSubRoute;
    initialNavParams?: AdminNavParams;
}

const GodViewPanelInner: React.FC<Props> = ({
    onBack,
    onNavigate,
    mode = 'embedded',
    adminSession,
    onRefreshData,
    initialSubRoute,
    initialNavParams,
}) => {
    const deletePitch = useAppStore((s) => s.deletePitch);
    const { setParams } = useAdminNavigation();
    const { canAccess, defaultRoute } = useAdminPermissions();
    const { info } = useAdminToast();
    const [subRoute, setSubRoute] = useState<GodViewSubRoute>(initialSubRoute ?? 'GENEL');
    const [modal, setModal] = useState<AdminModalState>({ type: 'none' });
    const [pendingVerifCount, setPendingVerifCount] = useState(0);

    useEffect(() => {
        if (initialNavParams) setParams(initialNavParams);
    }, [initialNavParams, setParams]);

    useEffect(() => {
        const start = initialSubRoute ?? defaultRoute;
        if (!canAccess(start)) setSubRoute(defaultRoute);
    }, [initialSubRoute, defaultRoute, canAccess]);

    const handleNavigate: AdminNavigateFn = useCallback((route, params) => {
        if (!canAccess(route)) {
            info('Bu sayfaya erişim yetkiniz yok');
            return;
        }
        setSubRoute(route);
        if (params) setParams(params);
        if (onNavigate) onNavigate(route);
    }, [onNavigate, setParams, canAccess, info]);

    const closeModal = () => setModal({ type: 'none' });

    const renderPage = () => {
        if (!canAccess(subRoute)) {
            return (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                    <p className="text-sm font-bold">Bu sayfaya erişim yetkiniz yok.</p>
                    <button onClick={() => setSubRoute(defaultRoute)} className="text-xs text-red-400 hover:text-red-300">Ana sayfaya dön</button>
                </div>
            );
        }
        switch (subRoute) {
            case 'GENEL':
                return <DashboardPage onRefresh={onRefreshData} onNavigate={handleNavigate} />;
            case 'CONTROL':
                return <CommandCenterPage mode={mode} onNavigate={handleNavigate} />;
            case 'FINANCE':
                return <FinancePage onNavigate={handleNavigate} />;
            case 'DISPUTES':
                return <DisputesPage onNavigate={handleNavigate} />;
            case 'PROMO_CODES':
                return <PromoCodesPage onRefresh={onRefreshData} />;
            case 'ACL':
                return <ACLPage />;
            case 'SAHALAR':
                return (
                    <PitchesPage
                        onEditPitch={(pitch) => setModal({ type: 'deepEditPitch', data: pitch })}
                        onDeletePitch={(id) => deletePitch(id)}
                        onRefresh={onRefreshData}
                    />
                );
            case 'KULLANICILAR':
            case 'KALECİLER':
            case 'HAKEMLER':
                return <UsersPage subRoute={subRoute} mode={mode} onRefresh={onRefreshData} />;
            case 'PENDING_VERIFICATIONS':
                return <PendingVerificationsPage onBadgeCount={setPendingVerifCount} />;
            case 'MATCHES':
                return <MatchesPage onRefresh={onRefreshData} onNavigate={handleNavigate} />;
            case 'TOPLULUKLAR':
            case 'TAKIMLAR':
            case 'TURNUVALAR':
                return <CommunitiesPage subRoute={subRoute} onRefresh={onRefreshData} />;
            case 'SETTINGS':
            case 'CONTENT':
                return <SettingsPage subRoute={subRoute} onRefresh={onRefreshData} />;
            case 'NOTIFICATIONS':
                return <CampaignsPage route="NOTIFICATIONS" />;
            case 'SEGMENTATION':
                return <CampaignsPage route="SEGMENTATION" />;
            case 'MODERATION':
                return <ModerationPage />;
            case 'OWNER_ACCOUNTS':
                return <OwnerAccountsPage />;
            case 'AUDIT_LOG':
                return <AuditLogPage onRefresh={onRefreshData} onNavigate={handleNavigate} />;
            default:
                return <DashboardPage onRefresh={onRefreshData} onNavigate={handleNavigate} />;
        }
    };

    return (
        <>
            <AdminLayout
                activeSubRoute={subRoute}
                onNavigate={(r) => handleNavigate(r)}
                onBack={onBack}
                pendingVerifCount={pendingVerifCount}
                mode={mode}
                adminSession={adminSession}
            >
                <Suspense fallback={<PageLoadingSkeleton />}>
                    {renderPage()}
                </Suspense>
            </AdminLayout>

            <AnimatePresence>
                {modal.type === 'deepEditPitch' && (
                    <DeepEditPitchModal pitch={modal.data} onClose={closeModal} />
                )}
                {modal.type === 'deepEditUser' && (
                    <DeepEditUserModal user={modal.data} onClose={closeModal} />
                )}
                {modal.type === 'deepEditProvider' && (
                    <DeepEditProviderModal item={modal.data} typeParam={modal.typeParam} onClose={closeModal} />
                )}
                {modal.type === 'addPitch' && (
                    <AddPitchModal onClose={closeModal} />
                )}
            </AnimatePresence>
        </>
    );
};

export const GodViewPanel: React.FC<Props> = (props) => (
    <AdminNavigationProvider>
        <AdminPermissionsProvider session={props.adminSession}>
            <GodViewPanelInner {...props} />
        </AdminPermissionsProvider>
    </AdminNavigationProvider>
);

export default GodViewPanel;
