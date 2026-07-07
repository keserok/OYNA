import React from 'react';

// İskelet yükleme — spinner yerine içerik silüeti (Spec A5: keyif mikro-etkileşimde).

interface SkeletonListProps {
  rows?: number;
  /** 'card' = avatar+iki satır (arkadaş/takım kartı); 'line' = tek satır */
  variant?: 'card' | 'line';
  className?: string;
}

const SkeletonList: React.FC<SkeletonListProps> = ({ rows = 4, variant = 'card', className = '' }) => (
  <div className={`space-y-3 ${className}`} aria-hidden="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="rounded-2xl bg-white/4 border border-white/6 p-4 animate-pulse"
        style={{ animationDelay: `${i * 90}ms` }}
      >
        {variant === 'card' ? (
          <div className="flex items-center gap-3">
            <div className="w-[46px] h-[46px] rounded-2xl bg-white/8" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/5 rounded-full bg-white/8" />
              <div className="h-2.5 w-3/5 rounded-full bg-white/6" />
            </div>
            <div className="w-9 h-9 rounded-xl bg-white/6" />
          </div>
        ) : (
          <div className="h-3 w-3/4 rounded-full bg-white/8" />
        )}
      </div>
    ))}
  </div>
);

export default SkeletonList;
