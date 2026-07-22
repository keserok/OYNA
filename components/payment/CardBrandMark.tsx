import React from 'react';

/**
 * Kart marka işareti — DIŞ GÖRSEL YÜKLEMEDEN (CSP/PCI dostu) resmi görünümlü,
 * ölçeklenebilir inline SVG logolar. Marka adı serbest metin gelebilir
 * (VISA/Visa/MASTERCARD/MC/TROY/AMEX/KART); normalize edilip uygun logo çizilir.
 *
 * variant:
 *   • 'onCard'  — koyu kart yüzeyi için yüksek kontrast (varsayılan)
 *   • 'onLight' — açık zemin (beyaz form/sayfa) için renkli/resmi tonlar
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

/**
 * Markaya özel premium kart gradyanı (Tailwind sınıfları). Kart yüzeyi markanın
 * kimliğini yansıtsın diye: Visa lacivert, Mastercard koyu-turuncu, troy turkuaz…
 */
export const brandGradient = (raw?: string | null): string => {
  switch (normalizeBrand(raw)) {
    case 'VISA':       return 'from-[#1A1F71] via-[#13205f] to-[#3b2a86]';
    case 'MASTERCARD': return 'from-[#201a17] via-[#3a2416] to-[#8a3b12]';
    case 'TROY':       return 'from-[#0a3a37] via-[#0d554f] to-[#00867a]';
    case 'AMEX':       return 'from-[#1c4e80] via-[#245f97] to-[#2E77BC]';
    default:           return 'from-[#20293a] via-[#232c3d] to-[#2f3a4f]';
  }
};

interface CardBrandMarkProps {
  brand?: string | null;
  /** İşaret yüksekliği (px). Genişlik orana göre. */
  size?: number;
  /** true iken (büyük gösterim) marka kelime-işareti de eklenir. */
  withWordmark?: boolean;
  variant?: 'onCard' | 'onLight';
  className?: string;
}

/* ── Mastercard — resmi kesişen iki daire (EB001B / F79E1B / FF5F00) ────────── */
const Mastercard: React.FC<{ h: number; wordmark?: boolean; onLight?: boolean }> = ({ h, wordmark, onLight }) => {
  const symbolH = wordmark ? h * 0.72 : h;
  return (
    <span className="inline-flex flex-col items-center leading-none" aria-label="Mastercard">
      <svg width={symbolH * 1.55} height={symbolH} viewBox="0 0 38 24">
        <circle cx="14" cy="12" r="11" fill="#EB001B" />
        <circle cx="24" cy="12" r="11" fill="#F79E1B" />
        {/* kesişim — resmi turuncu blend */}
        <path
          d="M19 3.6a11 11 0 0 1 0 16.8 11 11 0 0 1 0-16.8Z"
          fill="#FF5F00"
        />
      </svg>
      {wordmark && (
        <span
          style={{ fontSize: symbolH * 0.34, marginTop: symbolH * 0.06, letterSpacing: '0.02em' }}
          className={`font-bold lowercase ${onLight ? 'text-[#1a1a1a]' : 'text-white'}`}
        >
          mastercard
        </span>
      )}
    </span>
  );
};

/* ── Visa — resmi kelime-işareti (mavi #1A1F71 / kartta beyaz, altın vurgu) ──── */
const Visa: React.FC<{ h: number; onLight?: boolean }> = ({ h, onLight }) => {
  const color = onLight ? '#1434CB' : '#FFFFFF';
  return (
    <span className="inline-flex flex-col items-end leading-none" aria-label="Visa">
      <span
        style={{
          fontSize: h,
          color,
          fontStyle: 'italic',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          fontFamily: '"Helvetica Neue", Arial, sans-serif',
          lineHeight: 1,
          textShadow: onLight ? 'none' : '0 1px 2px rgba(0,0,0,0.28)',
        }}
      >
        VISA
      </span>
      {/* klasik altın-mavi çizgi vurgusu */}
      <span
        style={{ height: Math.max(1.5, h * 0.09), width: h * 1.55, marginTop: h * 0.06 }}
        className="rounded-full bg-gradient-to-r from-[#F7B600] via-[#F7B600] to-[#1434CB] opacity-90"
      />
    </span>
  );
};

/* ── troy — Türkiye yerli şeması (turkuaz) ──────────────────────────────────── */
const Troy: React.FC<{ h: number; onLight?: boolean }> = ({ h, onLight }) => (
  <span
    style={{ fontSize: h * 0.9, letterSpacing: '-0.02em' }}
    className={`font-black lowercase inline-flex items-baseline leading-none ${onLight ? 'text-[#00B9A9]' : 'text-white'}`}
    aria-label="troy"
  >
    troy
    <span style={{ fontSize: h * 0.55, marginLeft: h * 0.06 }} className="text-[#00E0C6]">●</span>
  </span>
);

/* ── Amex — resmi mavi kutu ─────────────────────────────────────────────────── */
const Amex: React.FC<{ h: number }> = ({ h }) => (
  <span
    style={{ height: h * 1.05, paddingInline: h * 0.28, fontSize: h * 0.42, letterSpacing: '0.02em' }}
    className="inline-flex items-center justify-center rounded-[4px] bg-[#2E77BC] text-white font-black uppercase"
    aria-label="American Express"
  >
    Amex
  </span>
);

const CardBrandMark: React.FC<CardBrandMarkProps> = ({
  brand, size = 20, withWordmark = false, variant = 'onCard', className,
}) => {
  const key = normalizeBrand(brand);
  const onLight = variant === 'onLight';
  const wrap = (node: React.ReactNode) => <span className={className}>{node}</span>;

  if (key === 'MASTERCARD') return wrap(<Mastercard h={size} wordmark={withWordmark} onLight={onLight} />);
  if (key === 'VISA') return wrap(<Visa h={size} onLight={onLight} />);
  if (key === 'TROY') return wrap(<Troy h={size} onLight={onLight} />);
  if (key === 'AMEX') return wrap(<Amex h={size} />);

  // GENERIC — nötr kart işareti (iki daire)
  return wrap(
    <svg width={size * 1.4} height={size} viewBox="0 0 35 25" aria-label="Kart">
      <circle cx="14" cy="12.5" r="9" fill={onLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)'} />
      <circle cx="22" cy="12.5" r="9" fill={onLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.28)'} />
    </svg>,
  );
};

export default CardBrandMark;
