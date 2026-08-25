import React from 'react';

// ════════════════════════════════════════════════════════════════════════════
// BENİ HATIRLA — büyük anahtar
// ════════════════════════════════════════════════════════════════════════════
//
// KURUCU İSTEĞİ (24 Ağustos 2026): "beni hatırla butonlarının büyük şekilde
// yer almalarını sağlayalım."
//
// NEDEN KÜÇÜK BİR ONAY KUTUSU DEĞİL: bu anahtar kullanıcıya gerçek bir soru
// soruyor — "şifreni yazdığın bu cihazda oturumun açık kalsın mı?" Ortak bir
// bilgisayarda cevabı HAYIR olmalı. Görülmeyen bir kutu, sorulmamış bir soru
// demektir; giriş ekranındaki eski 10 punto onay kutusunun telefonda çoğu
// zaman görüş alanına hiç girmemesi bunun kanıtıydı.
//
// NE YAPAR (iki kat, bkz. supabaseClient · setBeniHatirla):
//   AÇIK  → oturum localStorage + native aynada; çıkış yapana kadar açık kalır.
//   KAPALI→ oturum yalnız sessionStorage'da; sekme/uygulama kapanınca düşer.
// Ayrıca açıkken e-posta adresi hatırlanır ve alan dolu gelir. ŞİFRE ASLA
// SAKLANMAZ.
// ════════════════════════════════════════════════════════════════════════════

interface Props {
  acik: boolean;
  onChange: (acik: boolean) => void;
  disabled?: boolean;
}

const BeniHatirlaAnahtari: React.FC<Props> = ({ acik, onChange, disabled }) => (
  <button
    id="remember-me-toggle"
    type="button"
    role="switch"
    aria-checked={acik}
    aria-pressed={acik}
    disabled={disabled}
    onClick={() => onChange(!acik)}
    className="au-hatirla"
    style={disabled ? { opacity: 0.55, cursor: 'default' } : undefined}
  >
    <span className="au-switch" aria-hidden="true">
      <span className="au-knob" />
    </span>
    <span style={{ minWidth: 0, flex: 1 }}>
      <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-.01em' }}>
        Beni hatırla
      </span>
      {/* Anahtarın ne yaptığını SÖYLER. "Beni hatırla" tek başına belirsizdir:
          kullanıcı e-postasının mı yoksa oturumunun mu hatırlanacağını bilmez. */}
      <span style={{ display: 'block', marginTop: 3, fontSize: 11.5, lineHeight: 1.5, fontWeight: 600, color: '#8B949E' }}>
        {acik
          ? 'Çıkış yapana kadar bu cihazda açık kalırsın.'
          : 'Uygulamayı kapatınca oturumun kapanır. Ortak cihazlarda bunu seç.'}
      </span>
    </span>
  </button>
);

export default BeniHatirlaAnahtari;
