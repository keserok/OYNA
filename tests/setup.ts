import React from 'react';
import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';

// Her testten sonra DOM'u temizle
afterEach(() => {
  cleanup();
});

// Node 22 experimental localStorage global shadow fix for Vitest jsdom
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage || typeof globalThis.localStorage.setItem !== 'function') {
  let store: Record<string, string> = {};
  const localStorageMock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  }
}

// Stüdyo ilk-kullanım turu varsayılan olarak KAPALI (bileşen testlerini örtmesin).
// İlgili test dosyası ilk açılışı simüle etmek için localStorage'ı temizler.
try { localStorage.setItem('oyna_studio_onboarded_v1', '1'); } catch { /* localStorage yok */ }

// Mock window.matchMedia (jsdom'da eksik olabilir)
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// 1. Mock Capacitor APIs
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web'),
  },
}));

// 2. Mock Supabase Client and Auth
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
}));

vi.mock('../supabaseAuth', () => ({
  auth: {
    currentUser: { uid: 'test-user-id', displayName: 'Test User' },
  },
  onAuthStateChanged: vi.fn(() => vi.fn()),
  logout: vi.fn(() => Promise.resolve()),
}));

// 3. Mock Zustand Store (useAppStore)
let mockStoreState = {
  view: 'DASHBOARD',
  role: 'PLAYER',
  isAuthReady: true,
  myRoles: ['PLAYER'],
  isNotificationsOpen: false,
  isRoleSwitcherOpen: false,
  selectedMatch: null,
  selectedDiaryId: null,
  selectedConversationId: null,
  setRole: vi.fn((role: string) => {
    mockStoreState.role = role;
  }),
  setMyRoles: vi.fn((roles: string[]) => {
    mockStoreState.myRoles = roles;
  }),
  setIsRoleSwitcherOpen: vi.fn((isOpen: boolean) => {
    mockStoreState.isRoleSwitcherOpen = isOpen;
  }),
  resetNavigation: vi.fn((view: string) => {
    mockStoreState.view = view;
  }),
  navigateTo: vi.fn((view: string) => {
    mockStoreState.view = view;
  }),
  goBack: vi.fn(),
  // IP-01 — overlay kaydı + ödeme kilidi. hooks/useBackDismiss.ts bunları
  // getState() üzerinden çağırıyor; eksik olurlarsa overlay kullanan HER
  // bileşen testte "pushOverlay is not a function" ile patlar.
  overlayStack: [] as { id: string; priority: number; close: () => void }[],
  paymentLockActive: false,
  pushOverlay: vi.fn((id: string, close: () => void, priority = 0) => {
    mockStoreState.overlayStack = [
      ...mockStoreState.overlayStack.filter((o) => o.id !== id),
      { id, priority, close },
    ];
  }),
  popOverlay: vi.fn((id: string) => {
    mockStoreState.overlayStack = mockStoreState.overlayStack.filter((o) => o.id !== id);
  }),
  closeTopOverlay: vi.fn(() => {
    const stack = mockStoreState.overlayStack;
    if (stack.length === 0) return false;
    let top = stack[0];
    for (const o of stack) if (o.priority >= top.priority) top = o;
    mockStoreState.overlayStack = stack.filter((o) => o.id !== top.id);
    top.close();
    return true;
  }),
  setPaymentLockActive: vi.fn((v: boolean) => {
    mockStoreState.paymentLockActive = v;
  }),
  switchTab: vi.fn((view: string) => {
    mockStoreState.view = view;
  }),
  resetUnderHome: vi.fn((view: string) => {
    mockStoreState.view = view;
  }),
  // 26 Ağu 2026 — çıkış temizliği: App.tsx SIGNED_OUT dalı bunları çağırır;
  // mock'ta olmazlarsa App'e dokunan her test "not a function" ile patlar.
  resetUserScopedState: vi.fn(),
  setPendingIntent: vi.fn(),
  setCurrentUserProfile: vi.fn(),
};

const useAppStoreMock = (selector?: (s: typeof mockStoreState) => any) => {
  if (selector) return selector(mockStoreState);
  return mockStoreState;
};

useAppStoreMock.getState = () => mockStoreState;
useAppStoreMock.setState = (updates: Partial<typeof mockStoreState>) => {
  mockStoreState = { ...mockStoreState, ...updates };
};

vi.mock('../store', () => ({
  useAppStore: useAppStoreMock,
  sameRegion: (a: any, b: any) => a.city === b.city && a.district === b.district,
}));

// 4. Mock userService
vi.mock('../services/userService', () => ({
  setActiveRole: vi.fn(() => Promise.resolve(true)),
}));

// 5. Mock Framer Motion — animasyonları atlayarak sade elementler render et
vi.mock('framer-motion', () => {
  const motionProxy = new Proxy({}, {
    get: (_target, prop: string) => {
      return React.forwardRef(({ children, whileHover, whileTap, transition, initial, animate, exit, layoutId, ...props }: any, ref: any) => {
        return React.createElement(prop, { ...props, ref }, children);
      });
    }
  });
  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: any) => children,
    // FilterDropdown / MyMatchesHub gibi bileşenler bunu çağırır; mock'ta
    // eksikse "No useReducedMotion export is defined" ile HER render patlar.
    useReducedMotion: () => false,
  };
});
