import React from 'react';

// ════════════════════════════════════════════════════════════════════════════
// "YENİLENİYOR" ŞERİDİ — onaylı ana sayfa tasarımından, TEK KAYNAK
// ════════════════════════════════════════════════════════════════════════════
//
// Ölçüler tasarımdan birebir alınmıştır (OYNA · Ana Sayfa · yedi mod →
// "Yenileniyor" modu):
//
//   şerit    : height 64px, ortalanmış, öğeler arası 10px
//   halka    : 20×20, 2px kenarlık, zemin rgba(255,255,255,0.16),
//              üst kenar #00FFA5, 720ms doğrusal sonsuz dönüş
//   yazı     : Montserrat, 800 italik, 12px, harf aralığı 0.06em, #C9D1D9
//
// NEDEN AYRI BİLEŞEN: Aynı şerit ana sayfada, oyuncu ekranlarında ve saha
// sahibi / kaleci / hakem panellerinde görünecek. Her ekranda yeniden yazılırsa
// er geç biri 12px yerine 13px olur ve uygulama "biraz eğri" hissettirir.
//
// İÇERİK YERİNDE KALIR: Şerit içeriğin ÜSTÜNE açılır, onu değiştirmez.
// Yenileme sırasında kullanıcı okuduğu yeri kaybetmez (tasarım kararı).

export interface YenileniyorSeridiProps {
  /** Görünür mü. false iken hiçbir şey çizilmez (yer de kaplamaz). */
  aktif: boolean;
}

export const YenileniyorSeridi: React.FC<YenileniyorSeridiProps> = ({ aktif }) => {
  if (!aktif) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-oyna-yenileniyor=""
      style={{
        height: 64, flex: 'none', display: 'flex',
        alignItems: 'center', justifyContent: 'center', gap: 10,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 20, height: 20, borderRadius: 999,
          border: '2px solid rgba(255,255,255,0.16)',
          borderTopColor: '#00FFA5',
          animation: 'oy-yenile-don 720ms linear infinite',
        }}
      />
      <span
        style={{
          fontFamily: 'Montserrat, Inter, sans-serif',
          fontWeight: 800, fontStyle: 'italic', fontSize: 12,
          letterSpacing: '0.06em', color: '#C9D1D9',
        }}
      >
        YENİLENİYOR
      </span>
    </div>
  );
};

export default YenileniyorSeridi;
