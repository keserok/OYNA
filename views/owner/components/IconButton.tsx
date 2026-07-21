import React from 'react';

/**
 * FAZ0: Owner paneli için tek dokunma-hedefi primitifi.
 * - `ariaLabel` ZORUNLU (ikon-only butonlarda ekran-okuyucu erişimi garanti).
 * - min 44×44px (Apple HIG / Material) — para hareketi tetikleyen butonlarda kritik.
 * - press-state (active:scale) + focus-visible ring (klavye erişimi).
 */
type Variant = 'ghost' | 'surface' | 'danger' | 'primary';

interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  ariaLabel: string;
  variant?: Variant;
  size?: 'md' | 'lg';
  children: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  ghost: 'bg-white/5 text-white hover:bg-white/10',
  surface: 'bg-[#161B22] text-white border border-white/10 hover:border-white/20',
  danger: 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
  primary: 'bg-blue-600 text-white hover:bg-blue-500',
};

export const IconButton: React.FC<IconButtonProps> = ({
  ariaLabel,
  variant = 'ghost',
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...rest
}) => {
  const dim = size === 'lg' ? 'w-12 h-12' : 'w-11 h-11'; // 48 / 44px
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      className={`${dim} shrink-0 inline-flex items-center justify-center rounded-full transition-all active:scale-[0.94] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E14] disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export default IconButton;
