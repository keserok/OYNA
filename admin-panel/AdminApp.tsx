import React, { useCallback, useEffect, useState } from 'react';
import GodViewPanel from './views/GodViewPanel';
import AdminAuthGate from './views/AdminAuthGate';
import AdminBootShell from './views/AdminBootShell';
import { parseAdminUrlParams } from './views/context/AdminNavigationContext';
import { useAppStore } from '../store';
import { signOutAdmin, type AdminSession } from './services/adminService';
import {
  bootstrapAdminPlatform,
  refreshAdminStatsOnly,
  resolveAdminSession,
  resolveBootFatalError,
  withAdminTimeout,
  type AdminBootPhase,
} from './services/adminBootstrap';

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
  const [bootPhase, setBootPhase] = useState<AdminBootPhase>('session');
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [dataSyncing, setDataSyncing] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootWarnings, setBootWarnings] = useState<string[]>([]);
  const [warningsExpanded, setWarningsExpanded] = useState(false);

  const syncPlatformData = useCallback(async () => {
    setDataSyncing(true);
    try {
      const result = await withAdminTimeout(
        'Platform verileri',
        () => bootstrapAdminPlatform(getBootstrapDeps(), setBootPhase),
        25_000,
      );
      setBootWarnings(result.warnings);
      const state = useAppStore.getState();
      setBootError(resolveBootFatalError(result.warnings, {
        pitches: state.adminPitches.length,
        matches: state.adminMatches.length,
      }));
      setBootPhase('ready');
      setInitialLoadDone(true);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Veriler kısmen yüklendi';
      setBootWarnings((prev) => (prev.includes(msg) ? prev : [...prev, msg]));
      console.warn('[Admin] Veri senkronu:', err);
      setBootPhase('ready');
      setInitialLoadDone(true);
      return null;
    } finally {
      setDataSyncing(false);
    }
  }, []);

  useEffect(() => {
    useAppStore.getState().clearAdminMockState();

    let stale = false;
    setBootPhase('session');
    setInitialLoadDone(false);

    void (async () => {
      try {
        const adminSession = await resolveAdminSession();
        if (stale) return;
        setSession(adminSession);
        useAppStore.getState().setAdminSession(adminSession);
        if (adminSession) {
          await syncPlatformData();
        } else {
          setInitialLoadDone(true);
          setBootPhase('ready');
        }
      } catch (err) {
        console.warn('[Admin] Başlangıç oturumu:', err);
        if (!stale) {
          setSession(null);
          useAppStore.getState().setAdminSession(null);
          setInitialLoadDone(true);
          setBootPhase('ready');
        }
      }
    })();

    return () => {
      stale = true;
    };
  }, [syncPlatformData]);

  const handleAuthenticated = async (adminSession: AdminSession) => {
    setSession(adminSession);
    useAppStore.getState().setAdminSession(adminSession);
    setBootError(null);
    setBootWarnings([]);
    setInitialLoadDone(false);
    setBootPhase('inventory');
    await syncPlatformData();
  };

  const handleRetryAfterAuth = async () => {
    if (!session) return;
    setBootError(null);
    setInitialLoadDone(false);
    setBootPhase('inventory');
    await syncPlatformData();
  };

  const handleLogout = async () => {
    await signOutAdmin();
    setSession(null);
    useAppStore.getState().setAdminSession(null);
    setBootError(null);
    setBootWarnings([]);
    setInitialLoadDone(false);
    setBootPhase('session');
    useAppStore.getState().clearAdminMockState();
  };

  const showBootShell = !initialLoadDone || (bootPhase !== 'ready' && !!session);

  if (!session && !initialLoadDone) {
    return <AdminBootShell mode="loading" phase={bootPhase} />;
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

  if (showBootShell) {
    return <AdminBootShell mode="loading" phase={bootPhase} />;
  }

  const urlParams = parseAdminUrlParams();

  return (
    <>
      {(dataSyncing || bootWarnings.length > 0) && (
        <div className="fixed top-0 inset-x-0 z-[200] border-b border-amber-500/30 backdrop-blur-sm">
          <div className="bg-amber-500/15 px-4 py-2 flex items-center gap-2 text-[11px] text-amber-200">
            <span className="flex-1 text-center">
              {dataSyncing
                ? 'Veriler arka planda yükleniyor…'
                : bootWarnings[0]}
            </span>
            {!dataSyncing && bootWarnings.length > 1 && (
              <button
                onClick={() => setWarningsExpanded(e => !e)}
                className="shrink-0 text-amber-400 hover:text-amber-200 font-black"
              >
                {warningsExpanded ? '▲' : `+${bootWarnings.length - 1}`}
              </button>
            )}
            {!dataSyncing && (
              <button
                onClick={() => { setBootWarnings([]); setWarningsExpanded(false); }}
                className="shrink-0 text-amber-400 hover:text-amber-200 font-black"
              >
                ✕
              </button>
            )}
          </div>
          {warningsExpanded && bootWarnings.length > 1 && (
            <div className="bg-amber-950/60 px-4 py-2 flex flex-col gap-1">
              {bootWarnings.slice(1).map((w, i) => (
                <div key={i} className="text-[10px] text-amber-300/80">• {w}</div>
              ))}
            </div>
          )}
        </div>
      )}
      <GodViewPanel
        mode="standalone"
        adminSession={session}
        onBack={handleLogout}
        initialSubRoute={urlParams.route}
        initialNavParams={{
          ...(urlParams.matchId ? { matchId: urlParams.matchId } : {}),
          ...(urlParams.communityId ? { communityId: urlParams.communityId } : {}),
        }}
        onRefreshData={async () => {
          const result = await refreshAdminStatsOnly(getBootstrapDeps());
          setBootWarnings(result.warnings);
        }}
      />
    </>
  );
};

export default AdminApp;
