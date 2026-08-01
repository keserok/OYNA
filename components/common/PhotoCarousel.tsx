/**
 * FOTOĞRAF KARUSELİ — tesis/kort galerisi (kullanıcı kararı: "Airbnb kalitesi").
 *
 * NEDEN AYRI BİLEŞEN
 *   Aynı galeri iki yerde çiziliyordu (saha vitrini detayı, Rahat maç lobisi) ve
 *   ikisi de kendi kopyasını taşıyordu. Kopyalardan biri bozuktu: alt noktacıklar
 *   SABİT olarak ilkini yakıyor, kullanıcı fotoğrafları kaydırsa da gösterge hiç
 *   değişmiyordu. Tek bileşen = tek davranış, tek düzeltme yeri.
 *
 * DAVRANIŞ
 *   • Parmakla tek tek geçiş — CSS scroll-snap ile, yani kaydırma tarayıcının
 *     kendi akıcılığında kalır (JS ile sürülen karusellerin takılma hissi olmaz).
 *   • Noktacıklar gerçek konumu izler; 8'den fazla fotoğrafta noktacık yerine
 *     yalnız sayaç gösterilir (30 nokta okunmaz).
 *   • "3 / 8" sayacı.
 *   • Dokununca TAM EKRAN görüntüleyici açılır: orada da kaydırılır, çarpı ya da
 *     geri tuşuyla kapanır ve kapanınca galeri AYNI fotoğrafta kalır.
 *
 * NEDEN scroll-snap-type: x mandatory
 *   Fotoğraf tek tek durmalı, arada asılı kalmamalı. Bu şerit `utils/scrollSystem`
 *   tarafından BİLEREK devralınmaz (snap'li kaydırıcılar hariç tutulur) — devralma
 *   ölçüldüğü üzere kart atlatıyordu.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { SafeImage } from '../pitch-showcase/PitchShowcaseCard';
import { useBackDismiss } from '../../hooks/useBackDismiss';

/** Bu sayıdan çok fotoğrafta noktacıklar okunmaz olur; yalnız sayaç kalır. */
const MAX_DOTS = 8;

interface Props {
  images: string[];
  /** Erişilebilirlik metni — "Yeşil Vadi Halı Saha" gibi. */
  alt: string;
  /** Dış kutunun sınıfı (yükseklik burada verilir). */
  className?: string;
  /** Sağ üstte gösterilecek rozet (ör. kort adı). */
  badge?: React.ReactNode;
  /** Tam ekran görüntüleyici açılabilsin mi (varsayılan: evet). */
  zoomable?: boolean;
}

/** Ortak şerit: yatay, snap'li, gizli çubuk. */
const seritSinifi = 'w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar';

export const PhotoCarousel: React.FC<Props> = ({
  images, alt, className = '', badge, zoomable = true,
}) => {
  const [idx, setIdx] = useState(0);
  const [tamEkran, setTamEkran] = useState(false);
  const seritRef = useRef<HTMLDivElement | null>(null);
  const tamEkranRef = useRef<HTMLDivElement | null>(null);

  const gecerli = images.filter(Boolean);
  const adet = gecerli.length;

  // Fotoğraf listesi değişirse (kort değişimi) başa dön.
  useEffect(() => { setIdx(0); }, [adet, gecerli[0]]);

  const konumdanIndeks = useCallback((el: HTMLElement) => {
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    return Math.max(0, Math.min(adet - 1, i));
  }, [adet]);

  // Tam ekran açılınca AYNI fotoğrafta başla; kapanınca şerit o fotoğrafta kalsın.
  useEffect(() => {
    if (!tamEkran) return;
    const el = tamEkranRef.current;
    if (!el) return;
    el.scrollLeft = idx * el.clientWidth;
  }, [tamEkran]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tamEkran) return;
    const el = seritRef.current;
    if (!el) return;
    const hedef = idx * el.clientWidth;
    if (Math.abs(el.scrollLeft - hedef) > 2) el.scrollLeft = hedef;
  }, [tamEkran]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android geri tuşu ve Esc: önce tam ekranı kapatsın, ekranı değiştirmesin.
  useBackDismiss(tamEkran, () => setTamEkran(false), 'foto-tam-ekran', 10);

  if (adet === 0) return null;

  const sayac = (
    <span className="absolute bottom-5 right-4 z-10 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-[0.6875rem] font-extrabold text-white/90 tabular-nums">
      {idx + 1} / {adet}
    </span>
  );

  return (
    <>
      <div className={`relative ${className}`}>
        <div
          ref={seritRef}
          className={seritSinifi}
          onScroll={(e) => {
            const i = konumdanIndeks(e.currentTarget);
            setIdx((o) => (o === i ? o : i));
          }}
        >
          {gecerli.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              tabIndex={zoomable ? 0 : -1}
              aria-label={zoomable ? `${alt} — fotoğraf ${i + 1}, büyütmek için dokun` : `${alt} — fotoğraf ${i + 1}`}
              onClick={() => { if (zoomable) setTamEkran(true); }}
              className="w-full h-full flex-shrink-0 snap-center relative block"
              style={{ cursor: zoomable ? 'zoom-in' : 'default' }}
            >
              <SafeImage src={src} alt={`${alt} ${i + 1}`} className="w-full h-full object-cover" variant="detail" />
            </button>
          ))}
        </div>

        {badge}

        {adet > 1 && (
          <>
            {adet <= MAX_DOTS && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 pointer-events-none">
                {gecerli.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full backdrop-blur-md transition-all duration-200 ${
                      i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
            {sayac}
          </>
        )}
      </div>

      {/* ── TAM EKRAN GÖRÜNTÜLEYİCİ ──
          Kendi kaydırıcısı var; arkadaki sayfa kaydırılmaz. */}
      {tamEkran && (
        <div className="fixed inset-0 z-[120] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={`${alt} fotoğrafları`}>
          <div
            ref={tamEkranRef}
            className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
            onScroll={(e) => {
              const i = konumdanIndeks(e.currentTarget);
              setIdx((o) => (o === i ? o : i));
            }}
          >
            {gecerli.map((src, i) => (
              <div key={`tam-${src}-${i}`} className="w-full h-full flex-shrink-0 snap-center flex items-center justify-center">
                <SafeImage src={src} alt={`${alt} ${i + 1}`} className="max-w-full max-h-full object-contain" variant="detail" />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setTamEkran(false)}
            aria-label="Kapat"
            className="absolute top-[calc(env(safe-area-inset-top,0px)+14px)] right-4 w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-95 transition-transform"
          >
            <X size={20} />
          </button>

          <div className="shrink-0 pb-safe pt-3 flex items-center justify-center gap-2">
            {adet <= MAX_DOTS && gecerli.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${i === idx ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`}
              />
            ))}
            <span className="ml-2 text-[0.75rem] font-extrabold text-white/80 tabular-nums">{idx + 1} / {adet}</span>
          </div>
        </div>
      )}
    </>
  );
};

export default PhotoCarousel;
