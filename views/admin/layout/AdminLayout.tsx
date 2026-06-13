import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from '../components/CommandPalette';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminLayoutProps {
    children: React.ReactNode;
    activeSubRoute: string;
    onNavigate: (route: 'GENEL' | 'CONTROL' | 'SAHALAR' | 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER' | 'MATCHES' | 'NOTIFICATIONS' | 'CONTENT' | 'SETTINGS' | 'TOPLULUKLAR' | 'TAKIMLAR' | 'TURNUVALAR' | 'PENDING_VERIFICATIONS' | 'MODERATION') => void;
    onBack: () => void;
    pendingVerifCount?: number;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children, activeSubRoute, onNavigate, onBack, pendingVerifCount = 0 }) => {
    const [cmdOpen, setCmdOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string, id: number } | null>(null);
    const [toastCounter, setToastCounter] = useState(0);

    const showToast = (text: string) => {
        const id = toastCounter + 1;
        setToastCounter(id);
        setToastMsg({ text, id });
        setTimeout(() => {
            setToastMsg((current) => current?.id === id ? null : current);
        }, 2500);
    };

    return (
        <div className="h-screen bg-[#0D1117] text-white flex flex-col overflow-hidden font-sans">
            {/* Top red glow accent */}
            <div className="h-0.5 w-full bg-gradient-to-r from-red-700 via-red-500 to-orange-500 shrink-0" />

            <div className="flex flex-1 overflow-hidden relative">
                {/* Mobile overlay */}
                {isMobileMenuOpen && (
                    <div 
                        className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" 
                        onClick={() => setIsMobileMenuOpen(false)}
                    />
                )}
                
                <div className={`fixed inset-y-0 left-0 z-50 md:relative md:flex transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                    <Sidebar
                        activeSubRoute={activeSubRoute}
                        onNavigate={(route) => {
                            onNavigate(route);
                            setIsMobileMenuOpen(false);
                        }}
                        onBack={onBack}
                        onShowToast={showToast}
                        onShowRevenue={() => showToast('Gelir Modülü Yakında')}
                        pendingVerifCount={pendingVerifCount}
                    />
                </div>

                <main className="flex-1 flex flex-col overflow-hidden w-full bg-black/20">
                    <TopBar 
                        activeSubRoute={activeSubRoute}
                        onOpenCommandPalette={() => setCmdOpen(true)}
                        onShowToast={showToast}
                        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    />

                    {/* Page Content area with scroll */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative">
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

            {/* Global Toast */}
            <AnimatePresence>
                {toastMsg && (
                    <motion.div
                        key={toastMsg.id}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        className="fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl bg-[#161B22]/95 border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center gap-3 backdrop-blur-md"
                    >
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs font-bold tracking-wide text-white">{toastMsg.text}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
