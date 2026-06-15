import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';

interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  showSafeBottom?: boolean;
  scrollable?: boolean;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  className = '',
  title,
  onBack,
  rightElement,
  showSafeBottom = true,
  scrollable = true,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.995 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col w-full min-h-screen bg-[#0A0E14] text-white overflow-hidden max-w-lg md:max-w-2xl mx-auto md:border-x md:border-white/5 md:shadow-2xl relative ${className}`}
    >
      {/* Dynamic top safe area header */}
      {(title || onBack || rightElement) && (
        <header 
          className="sticky top-0 z-40 bg-[#0A0E14]/80 backdrop-blur-xl border-b border-white/5 px-4 flex items-center justify-between transition-all pt-safe"
          style={{ height: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
        >
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Geri git"
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 active:scale-95 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
              >
                <ChevronLeft size={20} className="text-white" />
              </button>
            )}
            {title && (
              <h1 className="text-lg font-black tracking-tight select-none">
                {title}
              </h1>
            )}
          </div>
          
          {rightElement && (
            <div className="flex items-center">
              {rightElement}
            </div>
          )}
        </header>
      )}

      {/* Main body */}
      <main 
        className={`flex-1 ${
          scrollable ? 'overflow-y-auto overflow-x-hidden custom-scrollbar' : 'overflow-hidden'
        } ${showSafeBottom ? 'pb-safe-nav' : 'pb-safe'}`}
      >
        {children}
      </main>

    </motion.div>
  );
};
