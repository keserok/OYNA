/* ─────────────────────────────────────────────────────────────────────────
   OYNA TASARIM KİTİ · SALT OKUNUR AYNA — BU DOSYAYI DÜZENLEME.
   Kaynak: components/dashboard/HomePieces.tsx
   Değişiklik kaynakta yapılır, sonra: npm run tasarim:kit
   ───────────────────────────────────────────────────────────────────────── */
// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA · ORTAK PARÇALAR
// ════════════════════════════════════════════════════════════════════════════
//
// Ana sayfada birden çok yerde tekrar eden dört parça. `Dashboard.tsx` zaten
// uzun; burada durmaları onu okunur tutuyor. Hiçbiri başka ekranda
// kullanılmaz — bu yüzden `components/dashboard/` altındalar.
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { WAIT } from '../../ui/labels';
import { resolveImageSource, type StoredVariants } from '../../utils/imageVariants';

// ── BASILABİLİR KAP ─────────────────────────────────────────────────────────

interface TapProps {
  onClick: () => void;
  label: string;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}

/**
 * Kart = tıklanabilir kap.
 *
 * Buton STİLİ istenmiyor (görsel tamamen kartın kendisi), ama DAVRANIŞI tam
 * bir butonun olmalı: klavyeyle odaklanır, Enter/Space ile açılır, ekran
 * okuyucu "düğme" diye duyurur.
 *
 * `data-tap` görsel basma davranışını getirir (index.css): 90ms'de %96,5'e
 * iner, 420ms'de yerine oturur. Odak çerçevesi YOKTUR — bilinçli tasarım
 * kararı; erişilebilirlik `aria-label` + klavye desteğiyle karşılanır.
 *
 * TİTREŞİM YOK: uygulamadan kullanıcı kararıyla kaldırılmıştır ve
 * `tests/unit/touchTargets.test.ts` geri gelmesini engeller.
 */
export const Tap: React.FC<TapProps> = ({ onClick, label, style, className, children }) => (
  <div
    role="button"
    tabIndex={0}
    aria-label={label}
    data-tap=""
    className={className}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    }}
    style={style}
  >
    {children}
  </div>
);

// ── İSKELET ─────────────────────────────────────────────────────────────────

/**
 * YÜKLENİYOR durumunun iskelet çubuğu.
 *
 * Etiketler YERİNDE KALIR, yalnız veri alanı çubuğa döner — kart yüksekliği
 * değişmez, veri gelince hiçbir şey zıplamaz. Genişlik SABİT px: yüzde
 * verilseydi kart genişliğine göre oynar, iki kart yan yana farklı uzunlukta
 * çubuk gösterirdi.
 */
export const Skeleton: React.FC<{ w: number; h: number; light?: boolean }> = ({ w, h, light }) => (
  <div
    role="status"
    aria-live="polite"
    aria-label={WAIT.loading}
    style={{
      width: w,
      height: h,
      borderRadius: h / 2 + 0.5,
      background: light
        ? 'linear-gradient(90deg,rgba(0,0,0,0.10),rgba(0,0,0,0.24),rgba(0,0,0,0.10))'
        : 'linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0.15),rgba(255,255,255,0.05))',
      backgroundSize: '200% 100%',
      animation: 'oyna-shimmer 1.5s linear infinite',
    }}
  />
);

// ── KATEGORİ AKSAN ÇİZGİSİ ──────────────────────────────────────────────────

/**
 * Kartın üstündeki 2px kategori ışığı — kart kimliğinin taşıyıcısı.
 * Aksan rengi YALNIZ burada, ikon halkasında ve bölüm etiketinde kullanılır.
 */
export const Accent: React.FC<{ from: string; to: string; glow: string }> = ({ from, to, glow }) => (
  <div
    aria-hidden
    style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 2,
      background: `linear-gradient(90deg,${from} 0%,${to} 55%,transparent 100%)`,
      boxShadow: `0 0 14px ${glow}`,
    }}
  />
);

// ── ÇOK BOYLU FOTOĞRAF ──────────────────────────────────────────────────────

interface PhotoProps {
  url: string | null | undefined;
  variants?: StoredVariants | null;
  alt: string;
  /** Kapsayıcıyı dolduran mod (maç kartı fotoğraf bandı). */
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Cihaz yoğunluğuna göre boy seçen fotoğraf.
 *
 * Varyant varsa `srcSet` ile @1x/@2x/@3x sunulur ve altta bulanık minyatür
 * (LQIP) durur: fotoğraf inene kadar kullanıcı boş gri kutu değil, doğru
 * rengi görür. Varyant yoksa orijinal tek boy gösterilir — eski görseller
 * kırılmaz.
 *
 * `backdrop-filter` KULLANILMAZ (brifing · madde 7: orta segment Android'de
 * kare düşürüyor). Bulanıklık zaten 16px'lik kaynağın ölçeklenmesinden gelir.
 */
export const Photo: React.FC<PhotoProps> = ({ url, variants, alt, style, className }) => {
  const img = resolveImageSource(url, variants);
  if (!img) return null;
  return (
    <>
      {img.lqip ? (
        <img
          aria-hidden
          src={img.lqip}
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', transform: 'scale(1.04)',
          }}
        />
      ) : null}
      <img
        src={img.src}
        srcSet={img.srcSet}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', ...style,
        }}
      />
    </>
  );
};
