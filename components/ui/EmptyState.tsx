import React from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon = '📭', title, description, action }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
    className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center"
  >
    <span className="text-5xl">{icon}</span>
    <div className="space-y-1">
      <p className="text-white font-bold text-lg tracking-tight">{title}</p>
      {description && (
        <p className="text-white/50 text-sm">{description}</p>
      )}
    </div>
    {action && (
      <button
        onClick={action.onClick}
        className="mt-2 px-5 py-2 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] text-sm font-bold tracking-wide hover:bg-[#39FF14]/20 transition-colors"
      >
        {action.label}
      </button>
    )}
  </motion.div>
);

export default EmptyState;
