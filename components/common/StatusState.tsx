import React from 'react';
import { Loader2, AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingState: React.FC<LoadingStateProps> = ({ 
  message = 'Yükleniyor...', 
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6 border-2',
    md: 'w-12 h-12 border-2',
    lg: 'w-16 h-16 border-3'
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[200px]">
      <Loader2 
        className={`animate-spin text-[#39FF14] mb-3 ${sizeClasses[size]}`} 
        strokeWidth={1.5}
      />
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
  message = 'Veriler yüklenirken teknik bir problem yaşandı. Lütfen tekrar deneyin.',
  onRetry,
  retryLabel = 'Tekrar Dene'
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center p-8 text-center min-h-[250px] bg-red-950/10 border border-red-500/10 rounded-2xl max-w-sm mx-auto my-6"
    >
      <AlertCircle className="text-red-500 mb-3 w-12 h-12" strokeWidth={1.5} />
      <h3 className="text-base font-black text-white mb-1">{title}</h3>
      <p className="text-xs text-gray-400 mb-4 leading-relaxed max-w-[280px]">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/15 hover:bg-red-500/20 active:scale-95 border border-red-500/30 text-red-200 text-xs font-black uppercase rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <RefreshCw size={14} />
          {retryLabel}
        </button>
      )}
    </motion.div>
  );
};

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Sonuç Bulunamadı',
  message = 'Görüntülenecek herhangi bir veri kaydı bulunmuyor.',
  icon
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center p-8 text-center min-h-[200px]"
    >
      {icon ? (
        <div className="text-gray-600 mb-3">{icon}</div>
      ) : (
        <Inbox className="text-gray-500 mb-3 w-12 h-12" strokeWidth={1.5} />
      )}
      <h3 className="text-sm font-black text-gray-300 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed max-w-[260px]">
        {message}
      </p>
    </motion.div>
  );
};
