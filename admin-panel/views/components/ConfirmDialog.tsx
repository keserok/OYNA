import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open, title, description, confirmLabel = 'Onayla', cancelLabel = 'İptal',
  destructive = false, onConfirm, onCancel,
}) => (
  <AnimatePresence>
    {open && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onCancel}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-surface-1 border border-white/10 rounded-2xl p-6 shadow-2xl"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className={`p-2 rounded-xl ${destructive ? 'bg-red-500/10' : 'bg-blue-500/10'}`}>
              <AlertTriangle size={18} className={destructive ? 'text-red-400' : 'text-blue-400'} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white">{title}</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={onCancel} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white rounded-xl border border-white/10">
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl text-white ${destructive ? 'bg-red-600 hover:bg-red-500' : 'bg-red-600 hover:bg-red-500'}`}
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
