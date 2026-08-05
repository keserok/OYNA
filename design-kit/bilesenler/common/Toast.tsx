/* ─────────────────────────────────────────────────────────────────────────
   OYNA TASARIM KİTİ · SALT OKUNUR AYNA — BU DOSYAYI DÜZENLEME.
   Kaynak: components/common/Toast.tsx
   Değişiklik kaynakta yapılır, sonra: npm run tasarim:kit
   ───────────────────────────────────────────────────────────────────────── */
import React from 'react';
import { motion } from 'framer-motion';
import { XCircle, CheckCircle2 } from 'lucide-react';

interface ToastProps {
  message: string;
  variant?: 'error' | 'success';
}

const VARIANT_STYLES = {
  error: {
    container: 'bg-red-950/95 border-red-500/40',
    icon: XCircle,
    iconColor: 'text-red-400',
    text: 'text-red-100',
  },
  success: {
    container: 'bg-[#0A0E14]/95 border-[#39FF14]/40',
    icon: CheckCircle2,
    iconColor: 'text-[#39FF14]',
    text: 'text-white',
  },
};

export const Toast: React.FC<ToastProps> = ({ message, variant = 'error' }) => {
  const { container, icon: Icon, iconColor, text } = VARIANT_STYLES[variant];
  return (
    <motion.div
      // IP-11: toast ekranda görünüyordu ama ekran okuyucuya HİÇ duyurulmuyordu.
      // Hata sözü kesip okunur (assertive); bilgi sıradaki fırsatta (polite).
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] max-w-sm w-[90%] backdrop-blur-xl border rounded-2xl px-5 py-4 shadow-2xl flex items-start gap-3 ${container}`}
    >
      <Icon size={18} className={`${iconColor} mt-0.5 shrink-0`} />
      <p className={`text-xs leading-relaxed flex-1 ${text}`}>{message}</p>
    </motion.div>
  );
};
