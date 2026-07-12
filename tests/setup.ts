import React from 'react';
import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';

// Her testten sonra DOM'u temizle
afterEach(() => {
  cleanup();
});

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
  impersonatedUser: null,
  originalRole: null,
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
  };
});
