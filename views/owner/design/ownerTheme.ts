/** OYNA Owner Panel — tutarlı SaaS tasarım tokenları (Stripe / Square / Linear tarzı) */

export const ownerColors = {
  shell: '#1A1F2C',
  surface: '#161B22',
  deep: '#0A0E14',
  border: 'border-white/5',
  borderHover: 'border-white/10',
  accent: '#3B82F6',
  accentMuted: 'rgba(59,130,246,0.15)',
  success: '#10B981',
  successMuted: 'rgba(16,185,129,0.12)',
  warning: '#F59E0B',
  warningMuted: 'rgba(245,158,11,0.12)',
  danger: '#EF4444',
  dangerMuted: 'rgba(239,68,68,0.12)',
  textPrimary: '#F1F5F9',
  textMuted: '#94A3B8',
  textDim: '#64748B',
} as const;

export const ownerCard = 'bg-[#161B22] border border-white/5 rounded-2xl';
export const ownerCardInteractive =
  'bg-[#161B22] border border-white/5 rounded-2xl hover:border-blue-500/30 transition-all active:scale-[0.98]';
export const ownerSectionLabel =
  'text-[10px] font-bold uppercase tracking-widest text-slate-500';
export const ownerModalOverlay =
  'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6';
export const ownerModalPanel =
  'bg-[#161B22] w-full max-w-md rounded-[32px] border border-white/10 p-8 max-h-[90vh] overflow-y-auto custom-scrollbar';
