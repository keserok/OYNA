import React, { useCallback, useRef } from 'react';
import { Info } from 'lucide-react';
import { skillBand, SELF_SKILL_MAX } from '../../utils/skillBand';

// ─── Adım 5 · Seviye öz-değerlendirmesi (E7) ────────────────────────────────
//
// Oyuncu kendine 1–10 arası yıldız verir. Bu, uygulamadaki KAMUSAL seviye
// göstergesinin tek kaynağıdır (profiles.self_skill); kadroda üç banda
// indirgenmiş hâliyle görünür.
//
// ADIM ATLANAMAZ: "Atla" bağlantısı YOK ve seçim yapılmadan CTA pasif kalır.
// Sunucu ikizi apply_onboarding'de: p_completed=true iken self_skill NULL ise
// SELF_SKILL_REQUIRED fırlatır (ad-soyad kapısıyla aynı desen).
//
// Yıldızlar başkasını puanlamak İÇİN DEĞİLDİR — akran puanlaması yalnız maç
// sonu değerlendirme ekranında yaşar ve o puan hiçbir kamusal sayıyı beslemez.

interface StepSkillProps {
  value: number | null;
  onChange: (v: number) => void;
}

const StepSkill: React.FC<StepSkillProps> = ({ value, onChange }) => {
  const band = skillBand(value);
  const stripRef = useRef<HTMLDivElement>(null);

  const pickAt = useCallback((clientX: number) => {
    const el = stripRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const v = Math.max(1, Math.min(SELF_SKILL_MAX,
      Math.ceil(((clientX - r.left) / r.width) * SELF_SKILL_MAX)));
    // Titreşim uygulamadan tamamen kaldırıldı (kullanıcı kararı) — geri
    // bildirim yalnız görsel: yıldız dolar, band çipi ve etiket anında değişir.
    if (v !== value) onChange(v);
  }, [value, onChange]);

  return (
    <div
      lang="tr"
      className="flex-1 flex flex-col justify-center"
      style={{ animation: 'obStepIn 0.55s cubic-bezier(0.22,1,0.36,1) both' }}
    >
      <p style={{ fontSize: 13, lineHeight: '18px', color: 'rgba(255,255,255,0.62)', margin: '0 0 22px', textAlign: 'center' }}>
        Bu, maçlarda seni doğru kadroya yerleştirmemize yardım eder.
        Sonradan profilinden değiştirebilirsin.
      </p>

      {/* ── 10 yıldız şeridi: dokun ya da parmağını sürükle ── */}
      <div
        ref={stripRef}
        role="slider"
        aria-label="Seviyen"
        aria-valuemin={1}
        aria-valuemax={SELF_SKILL_MAX}
        aria-valuenow={value ?? undefined}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          pickAt(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
          pickAt(e.clientX);
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 2,
          // 'pan-y': yıldız şeridinde YANA sürükleme seviye seçer; dikey
          // sürükleme sayfaya bırakılır (adım kaydırılabilir hâle gelirse hazır).
          height: 44, cursor: 'pointer', touchAction: 'pan-y', userSelect: 'none',
        }}
      >
        {Array.from({ length: SELF_SKILL_MAX }).map((_, i) => {
          const filled = value != null && i < value;
          // Dolu yıldız rengi SEÇİLEN BANDA göre değişir — kullanıcı sürüklerken
          // hangi bandın içinde olduğunu renk değişiminden anlar.
          const color = filled ? (band?.color ?? '#FACC15') : 'rgba(255,255,255,0.15)';
          return (
            <div key={i} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden="true"
                   style={filled ? { filter: `drop-shadow(0 0 7px ${color}66)` } : undefined}>
                <path
                  d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
                  fill={filled ? color : 'none'}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          );
        })}
      </div>

      {/* ── Canlı band kartı ── */}
      <div
        style={{
          marginTop: 20, borderRadius: 20, padding: '18px 16px', textAlign: 'center',
          border: `1px solid ${band ? `${band.color}55` : 'rgba(255,255,255,0.08)'}`,
          background: band ? `${band.color}0f` : 'rgba(255,255,255,0.03)',
          transition: 'border-color 0.25s ease, background 0.25s ease',
        }}
      >
        {band ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.01em', color: band.color }}>
                {band.label}
              </span>
              <span style={{ fontFamily: "'Space Grotesk', ui-monospace, monospace", fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.42)' }}>
                {value}/{SELF_SKILL_MAX}
              </span>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: '18px', color: 'rgba(255,255,255,0.72)' }}>
              {band.description}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.42)' }}>
            Yıldızlara dokunarak seviyeni seç
          </p>
        )}
      </div>

      {/* ── Dürüstlük notu ── */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 9, padding: '0 2px' }}>
        <Info size={14} color="#60A5FA" style={{ flex: 'none', marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 11.5, lineHeight: '16px', color: 'rgba(255,255,255,0.5)' }}>
          Dürüst ol — maçlarda kadro dengesi bu beyana göre kuruluyor.
        </p>
      </div>
    </div>
  );
};

export default StepSkill;
