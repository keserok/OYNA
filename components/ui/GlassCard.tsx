import React from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  glow?: string; // Hex rengi — ör. "#39FF14"
}

const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', onClick, glow }) => {
  const glowStyle = glow ? { boxShadow: `0 0 24px ${glow}22` } : undefined;

  const Component = onClick ? motion.button : motion.div;

  return (
    <Component
      onClick={onClick}
      style={glowStyle}
      whileHover={onClick ? { scale: 1.02 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={`
        bg-[#161B22]/80 backdrop-blur-md
        border border-white/5
        shadow-[0_8px_32px_rgba(0,0,0,0.4)]
        rounded-2xl
        ${onClick ? 'cursor-pointer text-left w-full' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  );
};

export default GlassCard;
