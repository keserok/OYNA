import React from 'react';

export const PageLoadingSkeleton: React.FC = () => (
  <div className="p-4 md:p-6 lg:p-8 space-y-6 animate-pulse" aria-busy="true" aria-label="Sayfa yükleniyor">
    <div className="flex items-start gap-4">
      <div className="w-11 h-11 rounded-2xl bg-white/5" />
      <div className="space-y-2 flex-1">
        <div className="h-3 w-24 bg-white/5 rounded" />
        <div className="h-7 w-48 bg-white/5 rounded" />
        <div className="h-4 w-72 max-w-full bg-white/5 rounded" />
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 rounded-2xl bg-white/[0.03] border border-white/5" />
      ))}
    </div>
    <div className="h-10 w-full max-w-md bg-white/5 rounded-xl" />
    <div className="rounded-xl border border-white/5 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 border-b border-white/5 bg-white/[0.02]" />
      ))}
    </div>
  </div>
);
