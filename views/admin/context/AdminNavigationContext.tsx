import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { GodViewSubRoute } from '../GodViewPanel';

export interface AdminNavParams {
  matchId?: string;
  disputeMatchId?: string;
  userId?: string;
}

interface AdminNavigationContextValue {
  params: AdminNavParams;
  setParams: (p: AdminNavParams) => void;
  clearParams: () => void;
  consumeParam: <K extends keyof AdminNavParams>(key: K) => AdminNavParams[K] | undefined;
}

const AdminNavigationContext = createContext<AdminNavigationContextValue | null>(null);

export const AdminNavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [params, setParamsState] = useState<AdminNavParams>({});

  const setParams = useCallback((p: AdminNavParams) => {
    setParamsState((prev) => ({ ...prev, ...p }));
  }, []);

  const clearParams = useCallback(() => setParamsState({}), []);

  const consumeParam = useCallback(<K extends keyof AdminNavParams>(key: K): AdminNavParams[K] | undefined => {
    let value: AdminNavParams[K] | undefined;
    setParamsState((prev) => {
      value = prev[key];
      if (value === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    return value;
  }, []);

  const value = useMemo(
    () => ({ params, setParams, clearParams, consumeParam }),
    [params, setParams, clearParams, consumeParam],
  );

  return (
    <AdminNavigationContext.Provider value={value}>
      {children}
    </AdminNavigationContext.Provider>
  );
};

export function useAdminNavigation() {
  const ctx = useContext(AdminNavigationContext);
  if (!ctx) throw new Error('useAdminNavigation must be used within AdminNavigationProvider');
  return ctx;
}

export function useAdminNavigationOptional() {
  return useContext(AdminNavigationContext);
}

/** Parse ?route=MATCHES&matchId=... from admin entry URL */
export function parseAdminUrlParams(): { route?: GodViewSubRoute; matchId?: string } {
  if (typeof window === 'undefined') return {};
  const sp = new URLSearchParams(window.location.search);
  const route = sp.get('route') as GodViewSubRoute | null;
  const matchId = sp.get('matchId') ?? undefined;
  return { route: route ?? undefined, matchId };
}
