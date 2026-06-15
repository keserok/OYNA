import React from 'react';

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple' | 'demo';

const TONES: Record<BadgeTone, string> = {
  success: 'bg-green-500/10 text-green-400 border-green-500/25',
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25',
  danger: 'bg-red-500/10 text-red-400 border-red-500/25',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  neutral: 'bg-white/5 text-gray-400 border-white/10',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
  demo: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
};

export const StatusBadge: React.FC<{ children: React.ReactNode; tone?: BadgeTone }> = ({ children, tone = 'neutral' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${TONES[tone]}`}>
    {children}
  </span>
);
