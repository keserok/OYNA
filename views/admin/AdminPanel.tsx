import React, { useState } from 'react';
import AdminAuthGate from './AdminAuthGate';
import GodViewPanel from './GodViewPanel';
import { useAppStore } from '../../store';
import { loadAdminOperationalData, loadAdminExtendedData, signOutAdmin, type AdminSession } from '../../services/adminService';

interface Props { onBack: () => void; }

const AdminPanel: React.FC<Props> = ({ onBack }) => {
    const { loadAdminData } = useAppStore();
    const [session, setSession] = useState<AdminSession | null>(null);

    const handleAuthenticated = async (adminSession: AdminSession) => {
        setSession(adminSession);
        try {
            const data = await loadAdminOperationalData();
            const extended = await loadAdminExtendedData();
            loadAdminData({ ...data, texts: extended.texts });
        } catch (err) {
            console.error('Embedded admin data load failed:', err);
        }
    };

    const handleLogout = async () => {
        await signOutAdmin();
        setSession(null);
        onBack();
    };

    if (!session) {
        return <AdminAuthGate onAuthenticated={handleAuthenticated} />;
    }

    return (
        <GodViewPanel
            mode="embedded"
            adminSession={session}
            onBack={handleLogout}
            onRefreshData={async () => {
                const data = await loadAdminOperationalData();
                const extended = await loadAdminExtendedData();
                loadAdminData({ ...data, texts: extended.texts });
            }}
        />
    );
};

export default AdminPanel;
