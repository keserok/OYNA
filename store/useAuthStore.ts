import { create } from 'zustand';
import { supabase } from '../supabaseClient';

// ─── Auth User Type ──────────────────────────────────────────────
export interface AuthUser {
  uid: string;
  email: string | undefined;
  /** Telefon OTP ile giriş yapan kullanıcılarda dolu (E.164) */
  phone?: string | null;
  displayName: string;
  photoURL: string;
}

interface AuthState {
  /** Current authenticated user (null = logged out) */
  currentUser: AuthUser | null;
  /** True once the initial session check completes */
  isAuthReady: boolean;
  /** True while a login/logout operation is in progress */
  isLoading: boolean;

  // Actions
  setCurrentUser: (user: AuthUser | null) => void;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  /** Call once on app mount to start listening for auth changes */
  initAuthListener: () => () => void;
}

/** Extract our AuthUser shape from a Supabase session user */
function mapSessionUser(user: { id: string; email?: string; phone?: string | null; user_metadata?: Record<string, any> }): AuthUser {
  return {
    uid: user.id,
    email: user.email,
    phone: user.phone ?? null,
    displayName: user.user_metadata?.full_name || user.user_metadata?.name || '',
    photoURL: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isAuthReady: false,
  isLoading: false,

  setCurrentUser: (user) => set({ currentUser: user }),

  loginWithGoogle: async () => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      set({ currentUser: null });
    } finally {
      set({ isLoading: false });
    }
  },

  initAuthListener: () => {
    // 1. Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({
        currentUser: session?.user ? mapSessionUser(session.user) : null,
        isAuthReady: true,
      });
    });

    // 2. Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        currentUser: session?.user ? mapSessionUser(session.user) : null,
        isAuthReady: true,
      });
    });

    return () => subscription.unsubscribe();
  },
}));

// ─── Backward Compatibility ─────────────────────────────────────
// Provides the same API as the old supabaseAuth.ts `auth` object
// so existing code can migrate gradually.
// DEPRECATED: Use useAuthStore() directly instead.
export const auth = {
  get currentUser(): AuthUser | null {
    return useAuthStore.getState().currentUser;
  },
};
