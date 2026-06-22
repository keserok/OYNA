import React, { useCallback, useState } from 'react';
import AdminAuthGate from './AdminAuthGate';
import AdminBootShell from './AdminBootShell';
import GodViewPanel from './GodViewPanel';
import { useAppStore } from '../../store';
import { signOutAdmin, type AdminSession } from '../services/adminService';
import { bootstrapAdminPlatform, refreshAdminStatsOnly, resolveBootFatalError, type AdminBootPhase } from '../services/adminBootstrap';

interface Props { onBack: () => void; }

const AdminPanel: React.FC<Props> = ({ onBack }) => {
    const { loadAdminData, clearAdminMockState, setAdminInventoryData, setAdminSession } = useAppStore();
    const [session, setSession] = useState<AdminSession | null>(null);
    const [bootPhase, setBootPhase] = useState<AdminBootPhase>('session');
    const [booting, setBooting] = useState(false);
    const [bootError, setBootError] = useState<string | null>(null);

    const bootstrapDeps = {
        clearAdminMockState,
        setAdminInventoryData,
        loadAdminData,
    };

    const loadPlatformData = useCallback(async () => {
        const result = await bootstrapAdminPlatform(bootstrapDeps, setBootPhase);
        const state = useAppStore.getState();
        const fatal = resolveBootFatalError(result.warnings, {
            pitches: state.adminPitches.length,
            matches: state.adminMatches.length,
        });
        if (fatal) setBootError(fatal);
        setBootPhase('ready');
        return result;
    }, [clearAdminMockState, setAdminInventoryData, loadAdminData]);

    const handleAuthenticated = async (adminSession: AdminSession) => {
        setSession(adminSession);
        setAdminSession(adminSession);
        setBooting(true);
        setBootError(null);
        setBootPhase('inventory');
        try {
            await loadPlatformData();
        } catch (err) {
            console.error('Embedded admin data load failed:', err);
            setBootError(err instanceof Error ? err.message : 'Veriler yüklenemedi');
        } finally {
            setBooting(false);
        }
    };

    const handleRetry = async () => {
        if (!session) return;
        setBooting(true);
        setBootError(null);
        setBootPhase('inventory');
        try {
            await loadPlatformData();
        } catch (err) {
            setBootError(err instanceof Error ? err.message : 'Veriler yüklenemedi');
        } finally {
            setBooting(false);
        }
    };

    const handleLogout = async () => {
        await signOutAdmin();
        setSession(null);
        setAdminSession(null);
        setBootError(null);
        onBack();
    };

    if (booting) {
        return <AdminBootShell mode="loading" phase={bootPhase} />;
    }

    if (bootError && session) {
        return (
            <AdminBootShell
                mode="error"
                message={bootError}
                onRetry={() => void handleRetry()}
            />
        );
    }

    if (!session) {
        return (
            <AdminAuthGate
                onAuthenticated={handleAuthenticated}
                bootError={bootError}
            />
        );
    }

    return (
        <GodViewPanel
            mode="embedded"
            adminSession={session}
            onBack={handleLogout}
            onRefreshData={async () => {
                await refreshAdminStatsOnly(bootstrapDeps);
            }}
        />
    );
};

export default AdminPanel;
