// ─── DEPRECATED ─────────────────────────────────────────────────
// Bu dosya geriye uyumluluk için korunuyor.
// Yeni kod store/useAuthStore.ts kullanmalı.
// ─────────────────────────────────────────────────────────────────

import { useAuthStore, auth } from './store/useAuthStore';
import type { AuthUser } from './store/useAuthStore';

export { auth, useAuthStore };
export type { AuthUser };

/** @deprecated useAuthStore().loginWithGoogle() kullanın */
export const loginWithGoogle = () => useAuthStore.getState().loginWithGoogle();

/** @deprecated useAuthStore().logout() kullanın */
export const logout = () => useAuthStore.getState().logout();

/** @deprecated useAuthStore().initAuthListener() kullanın */
export const onAuthStateChanged = (_authObj: any, callback: (user: AuthUser | null) => void) => {
  // 1. Immediately fire with current state
  callback(useAuthStore.getState().currentUser);

  // 2. Subscribe to future changes (Zustand returns unsubscribe fn)
  const unsubscribe = useAuthStore.subscribe(
    (state, prevState) => {
      if (state.currentUser !== prevState.currentUser) {
        callback(state.currentUser);
      }
    }
  );

  return unsubscribe;
};
