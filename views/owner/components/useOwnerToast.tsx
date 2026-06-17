import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type OwnerToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface OwnerToastItem {
  id: string;
  message: string;
  variant: OwnerToastVariant;
}

type NotifyFn = (message: string, variant?: OwnerToastVariant) => void;

const OwnerToastContext = createContext<NotifyFn>(() => {});

export function useOwnerToast(): NotifyFn {
  return useContext(OwnerToastContext);
}

const variantStyles: Record<OwnerToastVariant, { bar: string; icon: React.ReactNode }> = {
  info: {
    bar: 'border-blue-500/30 bg-blue-950/90 text-blue-100',
    icon: <Info size={18} className="text-blue-400 shrink-0" />,
  },
  success: {
    bar: 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100',
    icon: <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />,
  },
  warning: {
    bar: 'border-amber-500/30 bg-amber-950/90 text-amber-100',
    icon: <AlertCircle size={18} className="text-amber-400 shrink-0" />,
  },
  error: {
    bar: 'border-red-500/30 bg-red-950/90 text-red-100',
    icon: <AlertCircle size={18} className="text-red-400 shrink-0" />,
  },
};

export const OwnerToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<OwnerToastItem[]>([]);

  const notify = useCallback<NotifyFn>((message, variant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <OwnerToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 left-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none max-w-lg mx-auto">
        {toasts.map((t) => {
          const style = variantStyles[t.variant];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md animate-in slide-in-from-top-2 fade-in duration-300 ${style.bar}`}
              role="status"
            >
              {style.icon}
              <p className="text-sm font-semibold leading-snug flex-1">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="p-1 rounded-lg opacity-70 hover:opacity-100"
                aria-label="Kapat"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </OwnerToastContext.Provider>
  );
};
