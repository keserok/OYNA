import { useReducedMotion } from 'framer-motion';

/**
 * `true` → dekoratif/sonsuz animasyonlar çizilmez.
 *
 * TEK kaynak: sistemin "hareketi azalt" tercihi (`prefers-reduced-motion`).
 *
 * Cihaz gücüne (RAM/çekirdek) göre OTOMATİK kısma bilerek YAPILMIYOR: eşik
 * ≤4 GB / ≤4 çekirdek, Türkiye'deki Android tabanının büyük kısmını kapsıyor
 * ve uygulamanın kimliği olan animasyonları kullanıcı istemeden kapatırdı.
 * `shared`/`views/studio/perf.ts` içindeki cihaz sınıflandırması Stüdyo'ya
 * özgü kalır — orada kısılan şey animasyon değil, ağır çizim efektleridir.
 *
 * Bilgi TAŞIYAN animasyonlar bu bayrağa BAKMAZ: bekleme spinner'ı, geri sayım
 * nabzı. Onlar durursa kullanıcı uygulamanın donduğunu sanar.
 */
export const useLowMotion = (): boolean => !!useReducedMotion();
