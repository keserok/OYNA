import React, { useRef, useState } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg' | 'custom';

type AnimatedButtonProps<T extends React.ElementType> = {
  as?: T;
  children: React.ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  isLoading?: boolean;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent<any>) => void;
} & Omit<React.ComponentPropsWithoutRef<T>, keyof HTMLMotionProps<any>> & HTMLMotionProps<any>;

export const AnimatedButton = <T extends React.ElementType = 'button'>({
  as,
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  disabled = false,
  isLoading = false,
  ariaLabel,
  onClick,
  ...props
}: AnimatedButtonProps<T>) => {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const elementRef = useRef<HTMLElement>(null);

  const Component = as === 'div' ? motion.div : motion.button;

  const handleClick = (e: React.MouseEvent<any>) => {
    if (disabled || isLoading) {
      e.preventDefault();
      return;
    }

    // IP-10: burada eskiden her dokunuşta titreşim tetikleniyordu. Titreşim
    // uygulamadan tamamen kaldırıldı (kullanıcı kararı); geri bildirim yalnız
    // görseldir: whileTap + index.css'teki global :active parlaklık düşüşü.

    // Create ripple bubble
    if (elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now();
      
      setRipples((prev) => [...prev, { x, y, id }]);
      
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 600);
    }

    if (onClick) {
      onClick(e);
    }
  };

  // Base theme classes
  const baseClasses = 'relative overflow-hidden font-extrabold uppercase tracking-wider transition-all duration-200 outline-none flex items-center justify-center select-none';
  
  // Accessibility focus styling
  const focusClasses = 'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

  // Variant design systems
  const variantClasses = {
    primary: 'bg-primary text-on-primary hover:bg-[#70ff56] disabled:bg-gray-800 disabled:text-ink-4 disabled:border-transparent button-neon-glow-green',
    secondary: 'bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 disabled:bg-white/2 disabled:text-ink-4 disabled:border-white/5',
    danger: 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 disabled:bg-red-950/5 disabled:text-red-900 disabled:border-red-950/20',
    ghost: 'bg-transparent text-gray-400 hover:text-white hover:bg-white/5 disabled:bg-transparent disabled:text-ink-4'
  };

  // Safe hitbox sizing (minimum 44px height for touch screens)
  const sizeClasses = {
    // IP-08: buton etiketi okunur metindir → 11px taban (10px yalnız BÜYÜK HARF
    // + harf aralıklı etiketlerde meşru, burada metin serbest geliyor).
    sm: 'px-3 py-2 text-[0.6875rem] rounded-lg min-h-[44px]',
    md: 'px-5 py-3 text-xs rounded-xl min-h-[44px] min-w-[44px]',
    lg: 'px-8 py-4 text-sm rounded-2xl min-h-[52px] min-w-[52px]',
    custom: ''
  };

  // If used as a container (as='div'), we skip standard button-only classes unless needed
  const finalClassName = as === 'div' 
    ? `relative overflow-hidden cursor-pointer select-none ${className}`
    : `${baseClasses} ${focusClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  return (
    <Component
      ref={elementRef as any}
      whileTap={disabled || isLoading ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 18 }}
      className={finalClassName}
      onClick={handleClick}
      disabled={as === 'div' ? undefined : (disabled || isLoading)}
      aria-label={ariaLabel}
      aria-busy={isLoading}
      {...(as === 'div' ? { role: 'button' } : { type: 'button' })}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Yükleniyor</span>
        </span>
      ) : (
        children
      )}

      {/* Ripple effects */}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="ripple"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 20,
            height: 20,
            marginLeft: -10,
            marginTop: -10,
          }}
        />
      ))}
    </Component>
  );
};
