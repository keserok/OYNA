/* ─────────────────────────────────────────────────────────────────────────
   OYNA TASARIM KİTİ · SALT OKUNUR AYNA — BU DOSYAYI DÜZENLEME.
   Kaynak: components/common/StatusState.tsx
   Değişiklik kaynakta yapılır, sonra: npm run tasarim:kit
   ───────────────────────────────────────────────────────────────────────── */
import React from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Spinner } from '../ui/Spinner';

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Yükleniyor…',
  size = 'md'
}) => {
  const spinnerSize = { sm: 24, md: 44, lg: 60 }[size];

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center p-8 text-center min-h-[200px]">
      <Spinner size={spinnerSize} className="mb-3" />
      <p className="text-sm font-bold text-gray-400 select-none animate-pulse">
        {message}
      </p>
    </div>
  );
};

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Bir Hata Oluştu',
  message = 'Bilgiler yüklenemedi. Bağlantını kontrol edip tekrar dene.',
  onRetry,
  retryLabel = 'Tekrar Dene'
}) => {
  return (
    <motion.div 
      role="alert"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center p-8 text-center min-h-[250px] bg-red-950/10 border border-red-500/10 rounded-2xl max-w-sm mx-auto my-6"
    >
      <AlertCircle className="text-red-500 mb-3 w-12 h-12" strokeWidth={1.5} />
      <h3 className="text-base font-extrabold text-white mb-1">{title}</h3>
      <p className="text-xs text-gray-400 mb-4 leading-relaxed max-w-[280px]">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/15 hover:bg-red-500/20 active:scale-95 border border-red-500/30 text-red-200 text-xs font-extrabold uppercase rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <RefreshCw size={14} />
          {retryLabel}
        </button>
      )}
    </motion.div>
  );
};

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  /** İlk aksiyon birincil çizilir; ikincisi nötr. */
  variant?: 'primary' | 'secondary';
}

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  /** IP-12 · BULGU-059: boş durum ÇIKMAZ SOKAK olmamalı. Bu prop arayüzde hiç
   *  yoktu, dolayısıyla ekranlar buton koyamıyordu — kullanıcı "maç yok"
   *  yazısına bakıp orada kalıyordu. */
  actions?: EmptyStateAction[];
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Burada Henüz Bir Şey Yok',
  message = 'Görünecek bir kayıt bulunamadı.',
  icon,
  actions,
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center p-8 text-center min-h-[200px]"
    >
      {icon ? (
        <div className="text-ink-4 mb-3">{icon}</div>
      ) : (
        <Inbox className="text-ink-4 mb-3 w-12 h-12" strokeWidth={1.5} />
      )}
      <h3 className="text-sm font-extrabold text-gray-300 mb-1">{title}</h3>
      <p className="text-xs text-ink-4 leading-relaxed max-w-[260px]">
        {message}
      </p>
      {actions && actions.length > 0 && (
        <div className="flex flex-col gap-2 mt-4 w-full max-w-[260px]">
          {actions.map((a, i) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`w-full min-h-[44px] px-4 rounded-2xl text-xs font-extrabold uppercase tracking-wide active:scale-[0.98] transition-transform ${
                (a.variant ?? (i === 0 ? 'primary' : 'secondary')) === 'primary'
                  ? 'bg-primary text-on-primary'
                  : 'border border-white/12 text-white/75 hover:bg-white/5'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
};
