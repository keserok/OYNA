/** OYNA Owner Panel — tutarlı SaaS tasarım tokenları (Stripe / Square / Linear tarzı) */

export const ownerColors = {
  shell: '#1A1F2C',
  surface: '#161B22',
  surfaceRaised: '#1C2230',
  deep: '#0A0E14',
  border: 'border-white/5',
  borderHover: 'border-white/10',
  accent: '#3B82F6',
  accentMuted: 'rgba(59,130,246,0.15)',
  // FAZ0: neon #39FF14/#FF00FF/#FFFF00 karmaşası yerine tek marka sarısı.
  accentYellow: '#FACC15',
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
  'text-[0.6875rem] font-bold uppercase tracking-widest text-slate-500';
export const ownerModalOverlay =
  'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6';
// FAZ0: 90vh → 90dvh (mobil tarayıcı adres-çubuğu daralımında panel taşmaz).
export const ownerModalPanel =
  'bg-[#161B22] w-full max-w-md rounded-[32px] border border-white/10 p-8 max-h-[90dvh] overflow-y-auto custom-scrollbar';

/**
 * FAZ0: rem-tabanlı tipografi ölçeği — iOS Dynamic Type / Android font-scale /
 * tarayıcı zoom ile ölçeklenir (WCAG 1.4.4 resize-text). Sabit px (`text-[10px]`)
 * yerine bunları kullan. `caption` erişilebilir taban (11px); altına inme.
 */
export const ownerType = {
  caption: 'text-[0.6875rem] leading-tight', // 11px — en küçük taban
  footnote: 'text-xs leading-snug', // 12px
  body: 'text-sm leading-normal', // 14px
  bodyStrong: 'text-sm font-bold leading-normal',
  title: 'text-lg font-black leading-tight',
  display: 'text-3xl font-black tracking-tight leading-none',
  numeric: 'tabular-nums font-numeric',
} as const;

/** Bölüm başlığı etiketi (rem-tabanlı, uppercase). */
export const ownerLabel = ownerSectionLabel;
