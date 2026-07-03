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
import { AdminFeatureFlagsProvider, useAdminFeatureFlags } from './context/AdminFeatureFlagsContext';
import { useAdminToast } from './context/AdminToastContext';


const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const CommandCenterPage = lazy(() => import('./pages/CommandCenterPage').then(m => ({ default: m.CommandCenterPage })));
const PitchesPage = lazy(() => import('./pages/PitchesPage').then(m => ({ default: m.PitchesPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const MatchesPage = lazy(() => import('./pages/MatchesPage').then(m => ({ default: m.MatchesPage })));
const CommunitiesPage = lazy(() => import('./pages/CommunitiesPage').then(m => ({ default: m.CommunitiesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const FinancePage = lazy(() => import('./pages/FinancePage').then(m => ({ default: m.FinancePage })));
const CommissionPage = lazy(() => import('./pages/CommissionPage').then(m => ({ default: m.CommissionPage })));
const DisputesPage = lazy(() => import('./pages/DisputesPage').then(m => ({ default: m.DisputesPage })));
const CampaignsPage = lazy(() => import('./pages/CampaignsPage').then(m => ({ default: m.CampaignsPage })));
const PromoCodesPage = lazy(() => import('./pages/PromoCodesPage').then(m => ({ default: m.PromoCodesPage })));
const ACLPage = lazy(() => import('./pages/ACLPage').then(m => ({ default: m.ACLPage })));
const PendingVerificationsPage = lazy(() => import('./pages/PendingVerificationsPage').then(m => ({ default: m.PendingVerificationsPage })));
const ProviderIdentitiesPage = lazy(() => import('./pages/ProviderIdentitiesPage').then(m => ({ default: m.ProviderIdentitiesPage })));
const ServiceDisputesPage = lazy(() => import('./pages/ServiceDisputesPage').then(m => ({ default: m.ServiceDisputesPage })));
const ModerationPage = lazy(() => import('./pages/ModerationPage').then(m => ({ default: m.ModerationPage })));
const SystemParamsPage = lazy(() => import('./pages/SystemParamsPage').then(m => ({ default: m.SystemParamsPage })));
const VerificationCenterPage = lazy(() => import('./pages/VerificationCenterPage').then(m => ({ default: m.VerificationCenterPage })));
const NotificationTemplatesPage = lazy(() => import('./pages/NotificationTemplatesPage').then(m => ({ default: m.NotificationTemplatesPage })));

export type GodViewSubRoute =
  | 'GENEL' | 'CONTROL' | 'SAHALAR' | 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER'
  | 'MATCHES' | 'NOTIFICATIONS' | 'CONTENT' | 'SETTINGS' | 'TOPLULUKLAR'
  | 'TAKIMLAR' | 'TURNUVALAR' | 'PENDING_VERIFICATIONS' | 'PROVIDER_IDENTITIES'
  | 'SERVICE_DISPUTES' | 'MODERATION'
  | 'OWNER_ACCOUNTS' | 'AUDIT_LOG' | 'FINANCE' | 'COMMISSION' | 'DISPUTES' | 'PROMO_CODES' | 'ACL' | 'SEGMENTATION'
  | 'SYSTEM_PARAMS' | 'VERIFICATION' | 'NOTIFICATION_TEMPLATES';

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
    const { setParams, params, consumeParam } = useAdminNavigation();
    const { canAccess, defaultRoute } = useAdminPermissions();
    const { moduleEnabled } = useAdminFeatureFlags();
    const { info } = useAdminToast();
    const [subRoute, setSubRoute] = useState<GodViewSubRoute>(() => {
        const r = initialSubRoute ?? 'GENEL';
        return r === 'SEGMENTATION' ? 'NOTIFICATIONS' : r;
    });
    const [modal, setModal] = useState<AdminModalState>({ type: 'none' });
    const [pendingVerifCount, setPendingVerifCount] = useState(0);
    const [providerIdentityCount, setProviderIdentityCount] = useState(0);
    const [verificationCount, setVerificationCount] = useState(0);

    useEffect(() => {
        if (initialNavParams) setParams(initialNavParams);
    }, [initialNavParams, setParams]);

    useEffect(() => {
        const start = initialSubRoute === 'SEGMENTATION' ? 'NOTIFICATIONS' : (initialSubRoute ?? defaultRoute);
        if (!canAccess(start)) setSubRoute(defaultRoute);
    }, [initialSubRoute, defaultRoute, canAccess]);

    const handleNavigate: AdminNavigateFn = useCallback((route, params) => {
        const effectiveRoute = route === 'SEGMENTATION' ? 'NOTIFICATIONS' : route;
        if (!canAccess(effectiveRoute)) {
            info('Bu sayfaya erişim yetkiniz yok');
            return;
        }
        if (!moduleEnabled(effectiveRoute)) {
            info('Bu modül lansman kapsamı dışı (kapalı). Parametreler ekranından açabilirsiniz.');
            return;
        }
        setSubRoute(effectiveRoute);
        if (params) setParams(params);
        if (onNavigate) onNavigate(effectiveRoute);
        if (mode === 'standalone' && typeof window !== 'undefined') {
            const sp = new URLSearchParams(window.location.search);
            sp.set('route', effectiveRoute);
            if (params?.matchId) sp.set('matchId', params.matchId);
            else sp.delete('matchId');
            if (params?.communityId) sp.set('communityId', params.communityId);
            else sp.delete('communityId');
            const next = `${window.location.pathname}?${sp.toString()}`;
            window.history.replaceState(null, '', next);
        }
    }, [onNavigate, setParams, canAccess, moduleEnabled, info, mode]);

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
        if (!moduleEnabled(subRoute)) {
            return (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                    <p className="text-sm font-bold">Bu modül lansman kapsamı dışı (kapalı).</p>
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
            case 'COMMISSION':
                return <CommissionPage />;
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
            case 'PROVIDER_IDENTITIES':
                return <ProviderIdentitiesPage onBadgeCount={setProviderIdentityCount} />;
            case 'SERVICE_DISPUTES':
                return <ServiceDisputesPage />;
            case 'MATCHES':
                return <MatchesPage onRefresh={onRefreshData} onNavigate={handleNavigate} />;
            case 'TOPLULUKLAR':
            case 'TAKIMLAR':
            case 'TURNUVALAR':
                return (
                  <CommunitiesPage
                    subRoute={subRoute}
                    onRefresh={onRefreshData}
                    openCommunityId={subRoute === 'TOPLULUKLAR' ? (params.communityId ?? null) : null}
                    onOpenCommunityConsumed={() => consumeParam('communityId')}
                  />
                );
            case 'SETTINGS':
            case 'CONTENT':
                return <SettingsPage subRoute={subRoute} onRefresh={onRefreshData} />;
            case 'SYSTEM_PARAMS':
                return <SystemParamsPage />;
            case 'VERIFICATION':
                return <VerificationCenterPage onBadgeCount={setVerificationCount} />;
            case 'NOTIFICATION_TEMPLATES':
                return <NotificationTemplatesPage />;
            case 'NOTIFICATIONS':
            case 'SEGMENTATION':
                return <CampaignsPage route="NOTIFICATIONS" />;
            case 'MODERATION':
                return <ModerationPage />;
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
                providerIdentityCount={providerIdentityCount}
                verificationCount={verificationCount}
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
            <AdminFeatureFlagsProvider>
                <GodViewPanelInner {...props} />
            </AdminFeatureFlagsProvider>
        </AdminPermissionsProvider>
    </AdminNavigationProvider>
);

export default GodViewPanel;
