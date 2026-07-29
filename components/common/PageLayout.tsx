import React from 'react';
import { ChevronLeft } from 'lucide-react';

interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  showSafeBottom?: boolean;
  scrollable?: boolean;
  transparentHeader?: boolean;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  className = '',
  title,
  onBack,
  rightElement,
  showSafeBottom = true,
  scrollable = true,
  transparentHeader = false,
}) => {
  return (
    <div
      className={`flex flex-col w-full min-h-screen bg-[#0A0E14] text-white overflow-hidden max-w-lg mx-auto relative ${className}`}
    >
      {/* Dynamic top safe area header */}
      {(title || onBack || rightElement) && (
        <header
          className={`sticky top-0 z-40 px-4 flex items-center transition-all pt-safe relative ${
            transparentHeader
              ? 'bg-transparent'
              : 'bg-[#0A0E14]/80 backdrop-blur-xl border-b border-white/5'
          }`}
          style={{ height: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
        >
          {/* Left slot — anchors back button, keeps title centered */}
          <div className="w-10 shrink-0 flex items-center">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Geri git"
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 active:scale-95 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
              >
                <ChevronLeft size={20} className="text-white" />
              </button>
            )}
          </div>

          {/* Center — title absolutely centered in header */}
          {title && (
            <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-black tracking-tight select-none pointer-events-none max-w-[60%] truncate text-center">
              {title}
            </h1>
          )}
          {!title && <div className="flex-1" />}

          {/* Right slot — mirrors left width so title stays centered */}
          <div className="w-10 shrink-0 ml-auto flex items-center justify-end">
            {rightElement}
          </div>
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

    </div>
  );
};
