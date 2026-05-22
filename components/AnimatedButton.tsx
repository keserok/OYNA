import React, { useRef, useState } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

type AnimatedElementProps<T extends React.ElementType> = {
  as?: T;
  children: React.ReactNode;
  className?: string;
  haptic?: boolean;
} & React.ComponentPropsWithoutRef<T> & HTMLMotionProps<any>;

export const AnimatedButton = <T extends React.ElementType = 'button'>({
  as,
  children,
  className = '',
  haptic = true,
  onClick,
  ...props
}: AnimatedElementProps<T>) => {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const elementRef = useRef<HTMLElement>(null);

  const Component = as === 'div' ? motion.div : motion.button;

  const handleClick = (e: any) => {
    // Haptic feedback
    if (haptic && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50); // Light tap
    }

    // Ripple effect
    if (elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now();
      
      setRipples((prev) => [...prev, { x, y, id }]);
      
      // Clean up ripple after animation
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 600);
    }

    if (onClick) {
      onClick(e);
    }
  };

  return (
    <Component
      ref={elementRef}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={`relative overflow-hidden ${className}`}
      onClick={handleClick}
      {...props}
    >
      {children}
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
