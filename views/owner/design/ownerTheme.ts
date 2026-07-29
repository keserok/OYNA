/** OYNA Owner Panel — tutarlı SaaS tasarım tokenları (Stripe / Square / Linear tarzı) */

import { type_ } from '../../../ui/type';

export const ownerColors = {
  // Bütüncül koyu zemin: kabuk, alt bar ve tüm alt görünümler tek renkte (dikişsiz).
  shell: '#0A0E14',
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
 * Tipografi ölçeği — IP-08'den beri TEK KAYNAK `ui/type.ts`'tir.
 *
 * Bu nesne eskiden kendi ölçeğini tanımlıyordu ama repoda HİÇ tüketicisi yoktu
 * (0 import). İki rakip ölçek tanımı bırakmak K-0.3'e (tek veri, tek sistem)
 * aykırıdır: biri güncellenir, diğeri unutulur. Tanım silindi; adlar korunarak
 * tek kaynağa bağlandı. Tesis panelinin GÖRÜNÜMÜ DEĞİŞMEZ (zaten
 * kullanılmıyordu); ölçek değişirse iki taraf birlikte değişir.
 */
export const ownerType = {
  caption: type_.caption,
  footnote: type_.footnote,
  body: type_.bodyLg,
  bodyStrong: `${type_.bodyLg} font-bold`,
  title: `${type_.titleLg} font-extrabold`,
  display: `${type_.display} font-extrabold`,
  numeric: 'tabular-nums font-numeric',
} as const;

/** Bölüm başlığı etiketi (rem-tabanlı, uppercase). */
export const ownerLabel = ownerSectionLabel;
