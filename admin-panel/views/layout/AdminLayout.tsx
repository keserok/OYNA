import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from '../components/CommandPalette';
import { AdminStatusBar } from '../components/AdminStatusBar';
import { AdminToastProvider } from '../context/AdminToastContext';
import type { GodViewSubRoute } from '../GodViewPanel';
import type { AdminSession } from '../../services/adminService';

interface AdminLayoutProps {
    children: React.ReactNode;
    activeSubRoute: string;
    onNavigate: (route: GodViewSubRoute) => void;
    onBack: () => void;
    pendingVerifCount?: number;
    providerIdentityCount?: number;
    verificationCount?: number;
    mode?: 'embedded' | 'standalone';
    adminSession?: AdminSession | null;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
    children, activeSubRoute, onNavigate, onBack, pendingVerifCount = 0, providerIdentityCount = 0, verificationCount = 0, mode = 'embedded', adminSession,
}) => {
    const [cmdOpen, setCmdOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('oyna_admin_sidebar_collapsed') === '1'; } catch { return false; }
    });
    const toggleCollapse = () => setSidebarCollapsed((c) => {
        const next = !c;
        try { localStorage.setItem('oyna_admin_sidebar_collapsed', next ? '1' : '0'); } catch { /* storage opsiyonel */ }
        return next;
    });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setCmdOpen((open) => !open);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <AdminToastProvider>
        <div className="h-screen bg-[#0D1117] text-white flex flex-col overflow-hidden font-sans">
            {/* Top red glow accent */}
            <div className="h-0.5 w-full bg-gradient-to-r from-red-700 via-red-500 to-orange-500 shrink-0" />

            <div className="flex flex-1 overflow-hidden relative">
                {/* Sidebar — her zaman akışta (içeriği iter), daraltılabilir; içeriği ASLA örtmez */}
                <Sidebar
                    activeSubRoute={activeSubRoute}
                    onNavigate={onNavigate}
                    onBack={onBack}
                    pendingVerifCount={pendingVerifCount}
                    providerIdentityCount={providerIdentityCount}
                    verificationCount={verificationCount}
                    collapsed={sidebarCollapsed}
                    onToggleCollapse={toggleCollapse}
                    mode={mode}
                    adminSession={adminSession}
                />

                <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-black/20">
                    <AdminStatusBar />
                    <TopBar
                        activeSubRoute={activeSubRoute}
                        onOpenCommandPalette={() => setCmdOpen(true)}
                        onToggleMobileMenu={toggleCollapse}
                        onNavigate={(route) => onNavigate(route as GodViewSubRoute)}
                    />

                    {/* Page Content */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative bg-[radial-gradient(ellipse_at_top,_rgba(239,68,68,0.04)_0%,_transparent_50%)]">
                        {children}
                    </div>
                </main>
            </div>

            {/* Command Palette Modal */}
            <CommandPalette 
                isOpen={cmdOpen} 
                onClose={() => setCmdOpen(false)} 
                onNavigate={onNavigate}
            />
        </div>
        </AdminToastProvider>
    );
};
