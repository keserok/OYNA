/* ─────────────────────────────────────────────────────────────────────────
   OYNA TASARIM KİTİ · SALT OKUNUR AYNA — BU DOSYAYI DÜZENLEME.
   Kaynak: components/ui/Spinner.tsx
   Değişiklik kaynakta yapılır, sonra: npm run tasarim:kit
   ───────────────────────────────────────────────────────────────────────── */
import React from 'react';

interface SpinnerProps {
  /** Çap (px). Varsayılan 28. */
  size?: number;
  /** Halka rengi. Varsayılan neon yeşil. `currentColor` de geçilebilir. */
  color?: string;
  /** Halka kalınlığı (px). Boş bırakılırsa boyuta göre ölçeklenir. */
  thickness?: number;
  /** Soluk arka halka rengi. */
  track?: string;
  /** Neon parıltıyı kapatmak için false. */
  glow?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Ekran okuyucular için etiket. */
  label?: string;
}

/**
 * OYNA yükleme halkası — pürüzsüz konik degrade "kuyruklu yıldız" spinner.
 * Klasik `border-t rounded-full` (kare içinde sert kenarlı halka) yerine
 * yumuşak sönümlenen kuyruk + hafif neon parıltı verir.
 * Tüm görsel davranış index.css > .oy-spinner içinde tanımlıdır.
 */
export const Spinner: React.FC<SpinnerProps> = ({
  size = 28,
  color = '#39FF14',
  thickness,
  track,
  glow = true,
  className = '',
  style,
  label = 'Yükleniyor',
}) => {
  const t = thickness ?? Math.max(2, Math.round(size * 0.1));
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`oy-spinner${glow ? ' oy-spinner-glow' : ''}${className ? ` ${className}` : ''}`}
      style={{
        '--oy-spinner-size': `${size}px`,
        '--oy-spinner-color': color,
        '--oy-spinner-thickness': `${t}px`,
        ...(track ? { '--oy-spinner-track': track } : {}),
        ...style,
      } as React.CSSProperties}
    />
  );
};

export default Spinner;
