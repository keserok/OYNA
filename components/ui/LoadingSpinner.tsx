import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizes = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' };

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', label }) => (
  <div className="flex flex-col items-center justify-center gap-3">
    <motion.div
      className={`${sizes[size]} rounded-full border-2 border-white/10 border-t-[#39FF14]`}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
    />
    {label && <p className="text-white/50 text-xs tracking-widest uppercase">{label}</p>}
  </div>
);

export default LoadingSpinner;
