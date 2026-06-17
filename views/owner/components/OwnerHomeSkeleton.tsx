import React from 'react';

export const OwnerHomeSkeleton: React.FC = () => (
  <main className="flex-1 px-6 pt-6 pb-32 animate-pulse">
    <div className="flex gap-2 mb-5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-7 w-24 rounded-full bg-white/5" />
      ))}
    </div>
    <div className="grid grid-cols-2 gap-3 mb-6">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/5" />
      ))}
    </div>
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="h-32 rounded-3xl bg-blue-600/20" />
      <div className="h-32 rounded-3xl bg-white/5" />
    </div>
    <div className="h-48 rounded-2xl bg-white/5 border border-white/5 mb-6" />
    <div className="h-40 rounded-2xl bg-white/5 border border-white/5" />
  </main>
);
