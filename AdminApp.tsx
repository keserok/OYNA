import React, { useCallback, useEffect, useState } from 'react';
import GodViewPanel from './views/admin/GodViewPanel';
import AdminAuthGate from './views/admin/AdminAuthGate';
import AdminBootShell from './views/admin/AdminBootShell';
import { parseAdminUrlParams } from './views/admin/context/AdminNavigationContext';
import { useAppStore } from './store';
import { signOutAdmin, type AdminSession } from './services/adminService';
import {
  bootstrapAdminPlatform,
  refreshAdminPlatform,
  resolveAdminSession,
  withAdminTimeout,
} from './services/adminBootstrap';

/** Boot shell must never spin longer than this — even if network hangs */
const BOOT_READY_MAX_MS = 5_000;

function getBootstrapDeps() {
  const s = useAppStore.getState();
  return {
    clearAdminMockState: s.clearAdminMockState,
    setAdminInventoryData: s.setAdminInventoryData,
    loadAdminData: s.loadAdminData,
  };
}

const AdminApp: React.FC = () => {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [phase, setPhase] = useState<'boot' | 'ready'>('boot');
  const [dataSyncing, setDataSyncing] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootWarnings, setBootWarnings] = useState<string[]>([]);

  const syncPlatformData = useCallback(async () => {
    setDataSyncing(true);
    try {
      const result = await withAdminTimeout(
        'Platform verileri',
        () => bootstrapAdminPlatform(getBootstrapDeps()),
        25_000,
      );
      setBootWarnings(result.warnings);
      setBootError(null);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Veriler kısmen yüklendi';
      setBootWarnings((prev) => (prev.includes(msg) ? prev : [...prev, msg]));
      console.warn('[Admin] Veri senkronu:', err);
      return null;
    } finally {
      setDataSyncing(false);
    }
  }, []);

  useEffect(() => {
    useAppStore.getState().clearAdminMockState();

    let stale = false;
    const forceReadyTimer = window.setTimeout(() => {
      setPhase('ready');
    }, BOOT_READY_MAX_MS);

    void (async () => {
      try {
        const adminSession = await resolveAdminSession();
        if (stale) return;
        setSession(adminSession);
        useAppStore.getState().setAdminSession(adminSession);
        if (adminSession) {
          void syncPlatformData();
        }
      } catch (err) {
        console.warn('[Admin] Başlangıç oturumu:', err);
        if (!stale) {
          setSession(null);
          useAppStore.getState().setAdminSession(null);
        }
      } finally {
        window.clearTimeout(forceReadyTimer);
        setPhase('ready');
      }
    })();

    return () => {
      stale = true;
      window.clearTimeout(forceReadyTimer);
    };
  }, [syncPlatformData]);

  const handleAuthenticated = async (adminSession: AdminSession) => {
    setSession(adminSession);
    useAppStore.getState().setAdminSession(adminSession);
    setBootError(null);
    setBootWarnings([]);
    await syncPlatformData();
  };

  const handleRetryAfterAuth = async () => {
    if (!session) return;
    setBootError(null);
    await syncPlatformData();
  };

  const handleLogout = async () => {
    await signOutAdmin();
    setSession(null);
    useAppStore.getState().setAdminSession(null);
    setBootError(null);
    setBootWarnings([]);
    useAppStore.getState().clearAdminMockState();
  };

  if (phase === 'boot') {
    return <AdminBootShell mode="loading" />;
  }

  if (!session) {
    return <AdminAuthGate onAuthenticated={handleAuthenticated} bootError={bootError} />;
  }

  if (bootError) {
    return (
      <AdminBootShell
        mode="error"
        message={bootError}
        onRetry={() => void handleRetryAfterAuth()}
      />
    );
  }

  const urlParams = parseAdminUrlParams();

  return (
    <>
      {(dataSyncing || bootWarnings.length > 0) && (
        <div className="fixed top-0 inset-x-0 z-[200] bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-[11px] text-amber-200 text-center backdrop-blur-sm">
          {dataSyncing
            ? 'Veriler arka planda yükleniyor…'
            : bootWarnings[0]}
          {!dataSyncing && bootWarnings.length > 1 ? ` (+${bootWarnings.length - 1} uyarı)` : ''}
        </div>
      )}
      <GodViewPanel
        mode="standalone"
        adminSession={session}
        onBack={handleLogout}
        initialSubRoute={urlParams.route}
        initialNavParams={urlParams.matchId ? { matchId: urlParams.matchId } : undefined}
        onRefreshData={async () => {
          const result = await refreshAdminPlatform(getBootstrapDeps());
          setBootWarnings(result.warnings);
        }}
      />
    </>
  );
};

export default AdminApp;
