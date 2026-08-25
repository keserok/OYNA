import React from 'react';
import { Info } from 'lucide-react';
import { fetchOrnekIcerikUyarisi } from '../../services/dashboardHomeService';

/**
 * ÖRNEK İÇERİK ŞERİDİ — vitrindeki verinin gerçek olmadığını söyleyen uyarı.
 *
 * ─── NEDEN PAYLAŞILAN BİR BİLEŞEN ───────────────────────────────────────────
 * Uyarı 24 Ağustos 2026'ya kadar YALNIZ ana ekranda çiziliyordu. Oysa
 * incelemecinin (ve kullanıcının) örnek maçları asıl gördüğü yer "Maç Bul" ve
 * "Saha Kirala" listeleridir: canlıda gelecek tarihli 16 maçın 16'sı da
 * örnekti ve o iki ekranda hiçbir uyarı yoktu. Ana ekranı hızla geçen biri
 * dolu kadrolar, gerçekçi isimler ve puanlar görüp bunları gerçek sanıyordu.
 *
 * Apple Guideline 2.1 altında en sık verilen retlerden biri tam olarak budur:
 * vitrini doldurulmuş, içeriği gerçek olmayan uygulama. Savunması tek bir şey:
 * kullanıcıya da incelemeciye de AYNI cümleyi, içeriğin göründüğü HER yerde
 * söylemek.
 *
 * ─── METİN SUNUCUDAN GELİR ──────────────────────────────────────────────────
 * `app_config.ornek_icerik_uyarisi`. Koda gömülü değildir: gerçek tesisler
 * eklendiğinde anahtar boşaltılır ve şerit üç ekrandan birden kendiliğinden
 * kaybolur — yeni paket göndermeye gerek kalmaz.
 */
const OrnekIcerikSeridi: React.FC<{
  /** Şeridin dış boşluğu — çağıran ekranın kendi ızgarasına uysun diye. */
  style?: React.CSSProperties;
}> = ({ style }) => {
  const [uyari, setUyari] = React.useState<string | null>(null);

  React.useEffect(() => {
    let iptal = false;
    void fetchOrnekIcerikUyarisi().then((m) => { if (!iptal) setUyari(m); });
    return () => { iptal = true; };
  }, []);

  if (!uyari) return null;

  return (
    <div
      role="status"
      style={{
        flex: 'none', padding: '9px 12px', borderRadius: 'var(--oy-radius-sm, 10px)',
        background: 'var(--color-info-bg, rgba(255,255,255,0.05))',
        border: '1px solid var(--color-info-line, rgba(255,255,255,0.12))',
        display: 'flex', alignItems: 'flex-start', gap: 9,
        ...style,
      }}
    >
      <Info size={15} color="var(--color-ink-3)" style={{ flex: 'none', marginTop: 1 }} aria-hidden />
      <span style={{ flex: 1, minWidth: 0, fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--color-ink-2)' }}>
        {uyari}
      </span>
    </div>
  );
};

export default OrnekIcerikSeridi;
