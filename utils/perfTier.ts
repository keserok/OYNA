// ═══════════════════════════════════════════════════════════════════════════
// OYNA — CİHAZ GÜCÜ SINIFI (uygulama geneli)
// ---------------------------------------------------------------------------
// Zayıf telefonlarda uygulamanın "tutuk" hissettirmesinin en büyük tek sebebi
// `backdrop-filter` (arkasını bulanıklaştıran cam efekti). Bu efekti taşıyan
// HER kutu için tarayıcı ayrı bir çizim katmanı açar, arkasındaki görüntüyü
// kopyalar ve bulandırır — ve bunu her karede yeniden yapar. Uygulamada bu
// efektten 191 yerde var; bir liste kaydırılırken ekrandaki onlarca kart aynı
// anda bu işlemi tetikliyor. Güçlü telefon bunu yutar, giriş seviyesi telefon
// yutamaz: kare hızı düşer, kaydırma takılır.
//
// KARAR TEK YERDE: cihaz sınıfı `views/studio/perf.ts` içindeki (test edilmiş)
// `perfTierFrom` ile belirlenir. Bu dosya o kararı yalnızca uygulama geneline
// TAŞIR — <html> etiketine `oyna-lite` sınıfını ekler, gerisini index.css
// içindeki tek CSS bloğu halleder. Böylece 191 bileşene tek tek dokunmak
// gerekmez ve kural tek yerden geri alınabilir.
//
// İÇERİK HİÇBİR CİHAZDA DEĞİŞMEZ. Kısılan şey yalnız süs efektidir; hangi
// bilgi, hangi buton, hangi metin görünüyorsa aynen görünür. Animasyonlara da
// dokunulmaz — o karar `hooks/useLowMotion.ts` içinde ayrıca verilmiştir ve
// bilinçli olarak yalnız kullanıcının sistem tercihine bağlıdır.
// ═══════════════════════════════════════════════════════════════════════════

import { perfTierFrom, readDeviceSignals, type PerfTier } from '../views/studio/perf';

/** <html> üzerine eklenen sınıf. index.css içindeki `html.oyna-lite` bloğu bunu dinler. */
const LITE_CLASS = 'oyna-lite';

/**
 * Test/destek amaçlı elle geçersiz kılma. Bir telefonda sorunun gerçekten
 * efektlerden mi kaynaklandığını anlamak için, uygulamayı yeniden kurmadan
 * `localStorage['oyna.perfTier'] = 'lite'` yazıp uygulamayı yeniden açmak yeter.
 */
const OVERRIDE_KEY = 'oyna.perfTier';

let tier: PerfTier | null = null;

const readOverride = (): PerfTier | null => {
  try {
    const v = localStorage.getItem(OVERRIDE_KEY);
    return v === 'lite' || v === 'full' ? v : null;
  } catch {
    return null; // özel sekme / depolama kapalı → sessizce yoksay
  }
};

/**
 * Açılışta BİR kez çağrılır (index.tsx). Cihaz sınıfını belirler ve zayıf
 * cihazsa <html> etiketine `oyna-lite` sınıfını ekler.
 *
 * İlk boyamadan ÖNCE çalışması önemlidir: sonradan eklenirse efektler bir kez
 * çizilir, sonra kaldırılır — kullanıcı gözle görülür bir "zıplama" görür.
 */
export const installPerfTier = (): PerfTier => {
  if (typeof document === 'undefined') return 'full';

  const reduceMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  tier = readOverride() ?? perfTierFrom(readDeviceSignals(reduceMotion));
  document.documentElement.classList.toggle(LITE_CLASS, tier === 'lite');
  return tier;
};

/** Kurulmuş cihaz sınıfını okur. Kurulmadıysa güçlü cihaz varsayılır. */
export const getPerfTier = (): PerfTier => tier ?? 'full';
