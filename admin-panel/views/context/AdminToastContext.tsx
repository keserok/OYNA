import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

interface AdminToastContextValue {
  toast: (text: string, kind?: ToastKind) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const AdminToastContext = createContext<AdminToastContextValue | null>(null);

export const AdminToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const push = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = ++counterRef.current;
    setItems((prev) => [...prev.slice(-2), { id, text, kind }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const value: AdminToastContextValue = {
    toast: push,
    success: (text) => push(text, 'success'),
    error: (text) => push(text, 'error'),
    info: (text) => push(text, 'info'),
  };

  const iconMap = {
    success: <CheckCircle2 size={16} className="text-green-400 shrink-0" />,
    error: <AlertTriangle size={16} className="text-red-400 shrink-0" />,
    info: <Info size={16} className="text-blue-400 shrink-0" />,
  };

  const borderMap = {
    success: 'border-green-500/25',
    error: 'border-red-500/25',
    info: 'border-blue-500/25',
  };

  return (
    <AdminToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              className={`pointer-events-auto px-4 py-3 rounded-xl bg-surface-1/95 border ${borderMap[item.kind]} shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl flex items-center gap-2.5 max-w-sm`}
            >
              {iconMap[item.kind]}
              <span className="text-xs font-semibold text-white leading-snug">{item.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AdminToastContext.Provider>
  );
};

export function useAdminToast(): AdminToastContextValue {
  const ctx = useContext(AdminToastContext);
  if (!ctx) {
    return {
      toast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return ctx;
}
