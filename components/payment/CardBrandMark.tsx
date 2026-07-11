import React from 'react';

/**
 * Kart marka işareti — dış görsel yüklemeden (CSP/PCI dostu) tanınabilir logolar.
 * Marka adı serbest metin gelebilir (VISA/Visa/MASTERCARD/MC/TROY/AMEX/KART);
 * normalize edilip uygun görsel çizilir.
 */

export type CardBrandKey = 'VISA' | 'MASTERCARD' | 'TROY' | 'AMEX' | 'GENERIC';

export const normalizeBrand = (raw?: string | null): CardBrandKey => {
  const b = (raw ?? '').toUpperCase();
  if (b.includes('VISA')) return 'VISA';
  if (b.includes('MASTER') || b === 'MC') return 'MASTERCARD';
  if (b.includes('TROY')) return 'TROY';
  if (b.includes('AMEX') || b.includes('AMERICAN')) return 'AMEX';
  return 'GENERIC';
};

interface CardBrandMarkProps {
  brand?: string | null;
  /** İşaret yüksekliği (px). Genişlik orana göre. */
  size?: number;
}

const CardBrandMark: React.FC<CardBrandMarkProps> = ({ brand, size = 20 }) => {
  const key = normalizeBrand(brand);

  if (key === 'MASTERCARD') {
    const d = size;
    return (
      <svg width={d * 1.6} height={d} viewBox="0 0 40 25" aria-label="Mastercard">
        <circle cx="15" cy="12.5" r="10" fill="#EB001B" />
        <circle cx="25" cy="12.5" r="10" fill="#F79E1B" />
        <path d="M20 5.2a10 10 0 0 1 0 14.6a10 10 0 0 1 0-14.6z" fill="#FF5F00" />
      </svg>
    );
  }

  if (key === 'VISA') {
    return (
      <span style={{ fontSize: size * 0.72, lineHeight: 1 }}
        className="font-black italic tracking-tight text-white drop-shadow">
        VISA
      </span>
    );
  }

  if (key === 'TROY') {
    return (
      <span style={{ fontSize: size * 0.62, lineHeight: 1 }}
        className="font-black italic tracking-tight text-white drop-shadow">
        troy<span className="text-[#00E0B8]">•</span>
      </span>
    );
  }

  if (key === 'AMEX') {
    return (
      <span style={{ fontSize: size * 0.5, lineHeight: 1 }}
        className="font-black tracking-tight text-white drop-shadow">
        AMEX
      </span>
    );
  }

  // GENERIC — nötr kart işareti (iki daire)
  return (
    <svg width={size * 1.4} height={size} viewBox="0 0 35 25" aria-label="Kart">
      <circle cx="14" cy="12.5" r="9" fill="rgba(255,255,255,0.55)" />
      <circle cx="22" cy="12.5" r="9" fill="rgba(255,255,255,0.28)" />
    </svg>
  );
};

export default CardBrandMark;
