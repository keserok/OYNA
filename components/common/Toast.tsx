import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { XCircle, CheckCircle2, X } from 'lucide-react';

interface ToastProps {
  message: string;
  variant?: 'error' | 'success';
  /** Verilirse balona X kapatma düğmesi çizilir ve mesaj KENDİLİĞİNDEN
   *  KAYBOLMAZ varsayımıyla kullanılır: hata, kullanıcı kapatana kadar durur
   *  (kurucu kararı 26 Ağu 2026 — 4 sn'de kaybolan hata okunamıyordu). */
  onClose?: () => void;
}

/** Cihaz pikseli yuvarlamaları "1px örtülü" yanılsaması yapmasın diye pay (px). */
const OLCUM_TOLERANSI = 4;

/**
 * Klavyenin, EKRANA SABİTLENMİŞ (position: fixed) bir öğeyi ne kadar örttüğü — px.
 * SAF fonksiyon: DOM'a dokunmaz, testten doğrudan çağrılabilir.
 *
 * @param pencereYuk  window.innerHeight — pencerenin tam yüksekliği
 * @param gorunurYuk  visualViewport.height — klavyenin ÜSTÜNDE kalan yükseklik
 * @param gorunurUst  visualViewport.offsetTop — görünür alanın kaymış olduğu miktar
 */
export function sabitOgeKlavyeOrtusu(
  pencereYuk: number,
  gorunurYuk: number,
  gorunurUst: number,
): number {
  const fark = pencereYuk - gorunurYuk - gorunurUst;
  return fark > OLCUM_TOLERANSI ? Math.round(fark) : 0;
}

/**
 * Klavyenin, EKRANA SABİTLENMİŞ (position: fixed) bir öğeyi ne kadar örttüğü.
 *
 * ⚠ TEK KAYNAK: pencereye göre klavye ölçümü UYGULAMADA YALNIZ BURADA yapılır.
 * İkinci bir ölçüm yazma — iki ölçüm zamanla birbirinden ayrılır ve bir ekran
 * doğru, öteki yanlış davranır. Sabit konumlu bir kutu telafi istiyorsa bu
 * kancayı çağırır (bkz. views/AuthScreen.tsx).
 *
 * NEDEN `--kb-height` TEK BAŞINA YETMİYOR: o değişken "web katmanının telafi
 * etmesi gereken miktar"dır ve KABUĞA (document.body) göre ölçülür
 * (services/keyboardManager.ts · ortulenYukseklik). iOS'ta Capacitor
 * `resize: Body` ile çalışıyor — klavye açılınca body kısalır, dolayısıyla
 * --kb-height DOĞRU biçimde 0 olur. Ama `position: fixed` öğeler body'ye değil
 * GÖRÜNTÜ ALANINA (pencereye) göre yerleşir; pencere kısalmadığı için balon
 * yine klavyenin altında kalırdı. Bu yüzden örtüşme burada pencereye göre
 * ayrıca ölçülür; ikisinin BÜYÜĞÜ alınır (index.css · .uyari-balonu ve
 * aşağıdaki `klavyeliAltDolgu`) — hangi platform hangi yolla küçültürse
 * küçültsün doğru sonuç çıkar, ikisi toplanmadığı için de çift telafi olmaz.
 */
export const useKlavyeOrtusu = (): number => {
  const [ortu, setOrtu] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
    // visualViewport yoksa ölçüm yapılmaz; CSS'teki --kb-height yolu yürürlükte
    // kalır (sessizce 0 varsaymak balonu klavyenin altında bırakırdı).
    if (!vv) return;
    const olc = () => setOrtu(sabitOgeKlavyeOrtusu(window.innerHeight, vv.height, vv.offsetTop));
    olc();
    vv.addEventListener('resize', olc);
    vv.addEventListener('scroll', olc);
    return () => {
      vv.removeEventListener('resize', olc);
      vv.removeEventListener('scroll', olc);
    };
  }, []);
  return ortu;
};

/**
 * Satır içi (inline) stille yazılan, SABİT KONUMLU kutuların alt dolgusu.
 *
 * KURAL (index.css · .uyari-balonu ile birebir aynı): iki telafi kaynağının
 * BÜYÜĞÜ alınır, TOPLAMI değil. Toplansaydı `resize: none` durumunda kutu bir
 * klavye boyu fazladan yukarı fırlardı (çift telafi).
 *
 * @param ortu  useKlavyeOrtusu()'nun döndürdüğü, pencereye göre ölçülmüş örtüşme
 * @param ekPx  tasarımın kendi alt nefes payı (değiştirilmez)
 */
export const klavyeliAltDolgu = (ortu: number, ekPx: number): string =>
  `calc(var(--safe-bottom, 0px) + max(var(--kb-height, 0px), ${Math.max(0, Math.round(ortu || 0))}px) + ${ekPx}px)`;

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

export const Toast: React.FC<ToastProps> = ({ message, variant = 'error', onClose }) => {
  const { container, icon: Icon, iconColor, text } = VARIANT_STYLES[variant];
  const klavyeOrtusu = useKlavyeOrtusu();
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
      // B5: `bottom-6` sabitti — uyarı klavyenin ve alt menünün ARKASINDA
      // kalıyordu, kullanıcı "X gerekli" mesajını hiç görmeden düğmeyi bozuk
      // sanıyordu. Konum artık .uyari-balonu ile güvenli alan + klavye telafisi
      // + (varsa) alt menü yüksekliğinden hesaplanıyor (index.css). Ölçülen
      // örtüşme değişken olarak verilir; kural gerisini üstlenir.
      style={{ '--balon-klavye': `${klavyeOrtusu}px` } as React.CSSProperties}
      className={`uyari-balonu fixed left-1/2 -translate-x-1/2 z-[60] max-w-sm w-[90%] backdrop-blur-xl border rounded-2xl px-5 py-4 shadow-2xl flex items-start gap-3 ${container}`}
    >
      <Icon size={18} className={`${iconColor} mt-0.5 shrink-0`} />
      <p className={`text-xs leading-relaxed flex-1 ${text}`}>{message}</p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Mesajı kapat"
          className={`shrink-0 -m-2 p-2 ${text} opacity-70 hover:opacity-100`}
        >
          <X size={16} />
        </button>
      )}
    </motion.div>
  );
};
