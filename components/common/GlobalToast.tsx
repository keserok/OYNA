import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { create } from 'zustand';
import { Toast } from './Toast';

// ─── Tek global toast kanalı ─────────────────────────────────────────────
// Herhangi bir yerden (view, servis, catch bloğu) kullanıcıya geri bildirim:
//   import { showToast } from '.../components/common/GlobalToast';
//   showToast('Takım oluşturulamadı. Tekrar dene.', 'error');
// Sessiz console.error yerine BUNU kullanın — kullanıcı ne olduğunu görmeli.

interface GlobalToastState {
  message: string | null;
  variant: 'error' | 'success';
  show: (message: string, variant?: 'error' | 'success') => void;
  clear: () => void;
}

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export const useGlobalToast = create<GlobalToastState>((set) => ({
  message: null,
  variant: 'error',
  show: (message, variant = 'error') => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message, variant });
    hideTimer = setTimeout(() => set({ message: null }), 4000);
  },
  clear: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message: null });
  },
}));

export const showToast = (message: string, variant: 'error' | 'success' = 'error') =>
  useGlobalToast.getState().show(message, variant);

export const GlobalToast: React.FC = () => {
  const { message, variant } = useGlobalToast();
  return (
    <AnimatePresence>
      {message && <Toast message={message} variant={variant} />}
    </AnimatePresence>
  );
};
