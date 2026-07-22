import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  /** Eşik aşılıp bırakılınca çağrılır. Promise dönerse spinner çözülene dek döner. */
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  /** Kaydırma kabına uygulanacak sınıflar (padding, flex-1, pb-32 vb.). */
  className?: string;
  /** Devre dışıysa normal kaydırma kabı gibi davranır. */
  disabled?: boolean;
  /** Tetikleme eşiği (px). */
  threshold?: number;
  /** Azami çekme mesafesi (px). */
  maxPull?: number;
}

/**
 * Mobil-öncelikli aşağı-çekip-yenile kabı. Native non-passive touch dinleyicileriyle
 * çalışır: yalnız kap EN ÜSTTEYKEN (scrollTop 0) ve parmak AŞAĞI çekerken devreye
 * girer; bu sırada native kaydırma/rubber-band durdurulur (preventDefault). Dokunmatik
 * olmayan ortamda hiçbir olay tetiklenmez → sıradan kaydırma kabı gibi çalışır.
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  className = '',
  disabled = false,
  threshold = 72,
  maxPull = 96,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const draggingRef = useRef(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  // Bu jest için GERÇEK kaydıran ata (kendisi veya bir üst ata olabilir).
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || disabled) return;

    // Dokunulan noktadan yukarı yürüyüp GERÇEKTEN kaydıran ilk atayı bul. Bu panel
    // mimarisinde asıl kaydırıcı bazen App seviyesindeki dış kap; kendi scrollTop'una
    // bakmak "en üstteyim" yanılgısı yaratıp yukarı kaydırmayı bloke ediyordu.
    const findScroller = (start: EventTarget | null): HTMLElement => {
      let node = start instanceof HTMLElement ? start : el;
      while (node && node !== document.body) {
        const oy = getComputedStyle(node).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
          return node;
        }
        node = node.parentElement as HTMLElement;
      }
      return (document.scrollingElement as HTMLElement) ?? el;
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) {
        activeRef.current = false;
        return;
      }
      const scroller = findScroller(e.target);
      scrollerRef.current = scroller;
      // Yalnız gerçek kaydırıcı EN ÜSTTEYKEN çekme jesti başlayabilir.
      if (scroller.scrollTop > 0) {
        activeRef.current = false;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      activeRef.current = true;
      draggingRef.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!activeRef.current || refreshingRef.current || startYRef.current == null) return;
      const scroller = scrollerRef.current ?? el;
      // Gerçek kaydırıcı en üstte değilse (kullanıcı yukarı kaydırıyor) çekmeyi bırak.
      if (scroller.scrollTop > 0) {
        activeRef.current = false;
        draggingRef.current = false;
        setPull(0);
        return;
      }
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {
        if (draggingRef.current) setPull(0);
        draggingRef.current = false;
        return;
      }
      // Aşağı çekiliyor: native kaydırmayı durdur, sönümlü mesafe uygula.
      draggingRef.current = true;
      if (e.cancelable) e.preventDefault();
      setPull(Math.min(maxPull, dy * 0.5));
    };

    const onEnd = () => {
      if (!activeRef.current || refreshingRef.current) return;
      activeRef.current = false;
      const wasDragging = draggingRef.current;
      draggingRef.current = false;
      startYRef.current = null;
      setPull((cur) => {
        if (wasDragging && cur >= threshold) {
          setRefreshing(true);
          Promise.resolve(onRefreshRef.current())
            .catch(() => { /* yenileme hatası kabın sorunu değil — çağıran bildirir */ })
            .finally(() => {
              setRefreshing(false);
              setPull(0);
            });
          return threshold; // yenilenirken göstergeyi eşikte tut
        }
        return 0;
      });
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled, maxPull, threshold]);

  const offset = refreshing ? threshold : pull;
  const progress = Math.min(1, pull / threshold);

  return (
    <div
      ref={scrollRef}
      className={`relative overflow-y-auto overscroll-y-contain ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* Gösterge: içerik aşağı ötelenince açılan üst boşlukta belirir. */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 flex items-end justify-center overflow-hidden"
        style={{ height: offset, opacity: offset > 4 ? 1 : 0 }}
        aria-hidden={offset <= 4}
      >
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-gray-400">
          <RefreshCw
            size={16}
            className={refreshing ? 'animate-spin text-blue-400' : ''}
            style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
          />
          {refreshing ? 'Yenileniyor…' : progress >= 1 ? 'Bırak, yenilensin' : 'Yenilemek için çek'}
        </div>
      </div>

      <div
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          transition: draggingRef.current ? 'none' : 'transform 0.25s ease',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
