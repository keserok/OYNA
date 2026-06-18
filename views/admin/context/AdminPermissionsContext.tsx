import React, { createContext, useContext, useMemo } from 'react';
import type { AdminSession } from '../../../services/adminService';
import type { GodViewSubRoute } from '../GodViewPanel';
import { canAccessRoute, firstAllowedRoute, roleLabel, type AdminRole } from '../auth/adminPermissions';

interface AdminPermissionsContextValue {
  role: AdminRole;
  canAccess: (route: GodViewSubRoute) => boolean;
  defaultRoute: GodViewSubRoute;
  roleLabel: string;
}

const AdminPermissionsContext = createContext<AdminPermissionsContextValue>({
  role: 'ADMIN',
  canAccess: () => true,
  defaultRoute: 'GENEL',
  roleLabel: 'Admin',
});

export const AdminPermissionsProvider: React.FC<{
  session: AdminSession | null | undefined;
  children: React.ReactNode;
}> = ({ session, children }) => {
  const role = (session?.adminRole || 'ADMIN') as AdminRole;
  const value = useMemo<AdminPermissionsContextValue>(() => ({
    role,
    canAccess: (route) => canAccessRoute(role, route),
    defaultRoute: firstAllowedRoute(role),
    roleLabel: roleLabel(role),
  }), [role]);

  return (
    <AdminPermissionsContext.Provider value={value}>
      {children}
    </AdminPermissionsContext.Provider>
  );
};

export function useAdminPermissions(): AdminPermissionsContextValue {
  return useContext(AdminPermissionsContext);
}
