import React, { useCallback, useEffect, useState } from 'react';
import GodViewPanel from './views/admin/GodViewPanel';
import AdminAuthGate from './views/admin/AdminAuthGate';
import { useAppStore } from './store';
import {
  checkPlatformAdmin,
  signOutAdmin,
  type AdminSession,
} from './services/adminService';
import { loadAdminPlatformData, refreshAdminPlatform } from './services/adminBootstrap';

const AdminApp: React.FC = () => {
  const { initApp, loadAdminData, loadServices, isHydrated } = useAppStore();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setBooting(true);
    setBootError(null);
    try {
      await initApp();
      const adminSession = await checkPlatformAdmin();
      if (!adminSession) {
        setSession(null);
        return;
      }
      setSession(adminSession);
      await loadAdminPlatformData({ loadServices, loadAdminData });
    } catch (err) {
      console.error('Admin bootstrap error:', err);
      setBootError(err instanceof Error ? err.message : 'Panel yüklenemedi');
      setSession(null);
    } finally {
      setBooting(false);
    }
  }, [initApp, loadAdminData, loadServices]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const handleAuthenticated = async (adminSession: AdminSession) => {
    setSession(adminSession);
    try {
      await initApp();
      await loadAdminPlatformData({ loadServices, loadAdminData });
    } catch (err) {
      console.error('Admin data load error:', err);
      setBootError(err instanceof Error ? err.message : 'Veriler yüklenemedi');
    }
  };

  const handleLogout = async () => {
    await signOutAdmin();
    setSession(null);
  };

  if (booting || !isHydrated) {
    return (
      <div className="min-h-screen bg-[#050812] flex flex-col items-center justify-center gap-4 text-white">
        <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono font-black tracking-widest uppercase text-gray-500">
          OYNA OS Başlatılıyor...
        </p>
      </div>
    );
  }

  if (!session) {
    return <AdminAuthGate onAuthenticated={handleAuthenticated} bootError={bootError} />;
  }

  return (
    <GodViewPanel
      mode="standalone"
      adminSession={session}
      onBack={handleLogout}
      onRefreshData={async () => {
        await refreshAdminPlatform({ loadServices, loadAdminData });
      }}
    />
  );
};

export default AdminApp;
