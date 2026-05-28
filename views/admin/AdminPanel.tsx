import React, { useState } from 'react';
import AdminLogin from './AdminLogin';
import AdminDashboard from '../AdminDashboard';

interface Props { onBack: () => void; }

const AdminPanel: React.FC<Props> = ({ onBack }) => {
    const [unlocked, setUnlocked] = useState(false);

    if (!unlocked) return <AdminLogin onUnlock={() => setUnlocked(true)} onBack={onBack} />;

    return <AdminDashboard onBack={onBack} />;
};

export default AdminPanel;
