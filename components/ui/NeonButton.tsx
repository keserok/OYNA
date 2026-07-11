import React from 'react';
import { motion } from 'framer-motion';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface NeonButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  fullWidth?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-[#39FF14]/10 border-[#39FF14]/40 text-[#39FF14] hover:bg-[#39FF14]/20 shadow-[0_0_12px_rgba(57,255,20,0.2)]',
  secondary: 'bg-white/5 border-white/10 text-white hover:bg-white/10',
  danger: 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20',
  ghost: 'bg-transparent border-transparent text-white/60 hover:text-white',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

const NeonButton: React.FC<NeonButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
  fullWidth = false,
}) => (
  <motion.button
    type={type}
    onClick={onClick}
    disabled={disabled || loading}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    className={`
      ${variants[variant]} ${sizes[size]}
      border rounded-full font-bold tracking-wide
      transition-colors duration-150
      disabled:opacity-40 disabled:cursor-not-allowed
      ${fullWidth ? 'w-full' : ''}
      ${className}
    `}
  >
    {loading ? (
      <span className="flex items-center justify-center gap-2">
        <Spinner size={15} color="currentColor" glow={false} />
        {children}
      </span>
    ) : children}
  </motion.button>
);

export default NeonButton;
