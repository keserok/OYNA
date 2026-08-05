/* ─────────────────────────────────────────────────────────────────────────
   OYNA TASARIM KİTİ · SALT OKUNUR AYNA — BU DOSYAYI DÜZENLEME.
   Kaynak: components/ui/EmptyState.tsx
   Değişiklik kaynakta yapılır, sonra: npm run tasarim:kit
   ───────────────────────────────────────────────────────────────────────── */
import React from 'react';
import type { LucideIcon } from 'lucide-react';

// Zengin boş-durum — ikon + başlık + açıklama + en çok 2 CTA (Spec A2).
// Kural: birincil buton neon, ikincil nötr; ekran başına tek birincil.

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon, title, description, actions = [], className = '',
}) => (
  <div className={`flex flex-col items-center text-center py-14 px-6 ${className}`}>
    <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/8 flex items-center justify-center mb-4">
      <Icon size={28} className="text-ink-4" />
    </div>
    <h3 className="text-white font-bold text-base">{title}</h3>
    {description && (
      <p className="text-white/50 text-sm mt-1.5 max-w-[260px] leading-relaxed">{description}</p>
    )}
    {actions.length > 0 && (
      <div className="flex flex-col gap-2 mt-6 w-full max-w-[240px]">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.onClick}
            className={`min-h-[44px] rounded-2xl font-bold text-sm transition-transform active:scale-[0.97] ${
              a.primary
                ? 'bg-[#39FF14] text-[#0A0E14]'
                : 'bg-white/5 border border-white/10 text-white/80'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    )}
  </div>
);

export default EmptyState;
