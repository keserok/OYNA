/* ─────────────────────────────────────────────────────────────────────────
   OYNA TASARIM KİTİ · SALT OKUNUR AYNA — BU DOSYAYI DÜZENLEME.
   Kaynak: components/ui/IconButton.tsx
   Değişiklik kaynakta yapılır, sonra: npm run tasarim:kit
   ───────────────────────────────────────────────────────────────────────── */
import React from 'react';

/**
 * IP-10 — Oyuncu tarafının tek ikon-buton primitifi.
 *
 * Neden var: repoda 1052 buton içinde yalnız 144 `aria-label` vardı; 13 ekranın
 * geri oku dahil, sadece-ikon butonların çoğu ekran okuyucuya isimsiz görünüyordu.
 * Burada `label` TypeScript tarafından ZORUNLU kılınır — etiketsiz ikon buton
 * yazmak artık derlenmez.
 *
 * Boyut: 44px taban (Apple HIG / Material). Ölçülen 24 hedef bunun altındaydı.
 *
 * Titreşim YOK (bilerek): kullanıcı kararı gereği sıradan buton dokunuşu
 * titreşmez — titreşim yalnız sonuç (success/error) ve seçim (select) anlarında.
 * Basma geri bildirimi görseldir: `active:scale-95` + index.css'teki global
 * `:active { filter: brightness(0.78) }`.
 *
 * Kardeşi: `views/owner/components/IconButton.tsx`. Tesis paneli kendi temasını
 * korur (karar E7) — odak halkası orada mavi, burada marka yeşili. Bilerek ayrı.
 */

type IconButtonVariant = 'ghost' | 'surface' | 'primary' | 'danger';
type IconButtonSize = 'md' | 'lg';

interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** ZORUNLU. Ekran okuyucunun okuyacağı Türkçe eylem adı: "Geri", "Kapat", "Paylaş". */
  label: string;
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const variantClasses: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent border border-transparent text-white',
  surface: 'bg-white/5 border border-white/10 text-white hover:bg-white/10',
  primary: 'bg-primary border border-primary text-on-primary',
  // #DC2626 üstünde beyaz 4.83:1 (AA geçer). #EF4444 3.76:1 kaldığı için kullanılmaz.
  danger: 'bg-[#DC2626] border border-[#DC2626] text-white',
};

const sizeClasses: Record<IconButtonSize, string> = {
  md: 'w-11 h-11', // 44px — taban
  lg: 'w-12 h-12', // 48px — harita üstü / yüzen butonlar
};

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  icon,
  variant = 'surface',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={`shrink-0 ${sizeClasses[size]} rounded-full inline-flex items-center justify-center
      transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none
      outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]
      focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E14]
      ${variantClasses[variant]} ${className}`}
    {...rest}
  >
    {icon}
  </button>
);

export default IconButton;
