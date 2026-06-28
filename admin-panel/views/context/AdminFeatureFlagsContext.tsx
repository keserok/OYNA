import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchFeatureFlagMap } from '../../services/adminService';
import { SCOPE_GATED_ROUTES } from '../design/adminRoutes';
import type { GodViewSubRoute } from '../GodViewPanel';

interface FeatureFlagsCtx {
  flags: Record<string, boolean>;
  loaded: boolean;
  /** Kapsam-dışı (scope-gated) bir route yalnız bayrağı açıksa görünür; diğerleri her zaman açık. */
  moduleEnabled: (route: GodViewSubRoute) => boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<FeatureFlagsCtx>({
  flags: {},
  loaded: false,
  moduleEnabled: () => true,
  refresh: async () => {},
});

export const useAdminFeatureFlags = () => useContext(Ctx);

export const AdminFeatureFlagsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = async () => {
    try {
      const m = await fetchFeatureFlagMap();
      setFlags(m);
    } catch {
      // Bayraklar okunamazsa kapsam-dışı modüller gizli kalır (güvenli varsayılan).
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    let alive = true;
    fetchFeatureFlagMap()
      .then((m) => {
        if (alive) setFlags(m);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const moduleEnabled = (route: GodViewSubRoute): boolean => {
    const key = SCOPE_GATED_ROUTES[route];
    if (!key) return true; // kapsam-içi modüller her zaman açık
    return flags[key] === true; // kapsam-dışı: yalnız bayrak açıkça true ise görünür
  };

  return <Ctx.Provider value={{ flags, loaded, moduleEnabled, refresh }}>{children}</Ctx.Provider>;
};
