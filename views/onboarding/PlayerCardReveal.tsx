import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Gender, OnboardingPosition, PlayStyle, AgeRange, POSITION_LABEL, PLAY_STYLE_META, trUpper } from './onboardingShared';

interface PlayerCardRevealProps {
  firstName: string;
  lastName: string;
  ageRange: AgeRange | '';
  gender: Gender;
  position: OnboardingPosition;
  playStyle: PlayStyle;
  locationGranted: boolean;
  /** Kayıt (RPC) sürüyor mu? Buton kilitlenir + spinner. */
  busy: boolean;
  /** "Başla" — profili tamamla (completed=true) ve uygulamaya geç. */
  onStart: () => void;
  onBack: () => void;
  /**
   * IP-16 — kayıt hatası KALICI. Eskiden yalnız 4 saniyelik bir bildirim
   * çıkıyordu; bu perde `absolute inset-0 z-20` olduğu için üstteki "Atla"
   * tuşunu da örtüyordu, yani hatada kullanıcının görünür hiçbir çıkışı
   * kalmıyordu.
   */
  error?: string | null;
  /** Hata durumunda perdenin İÇİNDEN çıkış — kurulumu şimdilik geç. */
  onSkip?: () => void;
}

const SPHERE = 'radial-gradient(circle at 32% 28%, #C8FFB0, #4DFF2A 45%, #17B356 72%, #075B2C)';

/**
 * Onboarding final özeti — KARTSIZ ("havada"). Kart çerçevesi/kenarlığı
 * kaldırıldı; küre avatar + isim + bilgi satırları doğrudan koyu zeminde
 * yüzer. "Başla" profili tamamlar (apply_onboarding, completed=true).
 */
const PlayerCardReveal: React.FC<PlayerCardRevealProps> = ({
  firstName, lastName, ageRange, gender, position, playStyle, locationGranted, busy, onStart, onBack, error, onSkip,
}) => {
  const initials = (trUpper(firstName.trim()).charAt(0) || '') + (trUpper(lastName.trim()).charAt(0) || '');
  const fullName = trUpper(`${firstName.trim()} ${lastName.trim()}`.trim());

  const rows: { label: string; value: string; color: string }[] = [];
  if (ageRange) rows.push({ label: 'YAŞ', value: ageRange.replace('-', '–'), color: '#FFFFFF' });
  // IP-09 renk-rol tablosu: cinsiyet/pozisyon birer KATEGORİ etiketidir (bilgi
  // mavisi / nötr mürekkep), "Onaylı" ise onaylanmış DURUMdur (rol 3, birincil).
  if (gender) rows.push({ label: 'CİNSİYET', value: gender === 'kadin' ? '♀ Kadın' : '♂ Erkek', color: '#60A5FA' });
  if (playStyle) rows.push({ label: 'OYUN STİLİ', value: PLAY_STYLE_META[playStyle].label, color: PLAY_STYLE_META[playStyle].color });
  if (locationGranted) rows.push({ label: 'KONUM', value: 'Onaylı', color: '#39FF14' });
  if (position) rows.push({ label: 'POZİSYON', value: POSITION_LABEL[position], color: '#A9B4C0' });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center px-10"
      style={{ background: 'rgba(6,9,14,0.92)', backdropFilter: 'blur(12px)' }}
    >
      <button onClick={onBack} disabled={busy} className="absolute top-6 left-6 w-[38px] h-[38px] rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', cursor: busy ? 'default' : 'pointer' }}>
        <ArrowLeft size={18} color="#fff" />
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', textAlign: 'center', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
        Oyna'ya hoş geldin, {firstName.trim() || 'oyuncu'}!
      </h1>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 30 }}>Oynamaya hazırsın.</p>

      {/* Küre avatar — havada, arkasında yumuşak ışıma */}
      <motion.div
        initial={{ scale: 0.2, y: 24, opacity: 0, filter: 'blur(10px)' }}
        animate={{ scale: 1, y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <div style={{ position: 'absolute', width: 220, height: 220, top: -70, borderRadius: '50%', background: 'radial-gradient(circle, rgba(57,255,20,0.22), transparent 62%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
        <div style={{
          position: 'relative', width: 108, height: 108, borderRadius: '50%', background: SPHERE,
          boxShadow: 'inset -10px -12px 22px rgba(0,0,0,0.35), inset 6px 7px 14px rgba(255,255,255,0.25), 0 0 44px rgba(57,255,20,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 38,
          textShadow: '0 2px 4px rgba(0,0,0,0.4)',
        }}>{initials || '★'}</div>

        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 18, textAlign: 'center', letterSpacing: '-0.01em' }}>{fullName || 'OYUNCU'}</div>
        <div style={{ width: 52, height: 2, background: '#39FF14', borderRadius: 2, margin: '14px 0 0', boxShadow: '0 0 12px rgba(57,255,20,0.6)' }} />
      </motion.div>

      {/* Bilgi satırları — kartsız, havada */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '22px 30px', marginTop: 28, maxWidth: 320 }}
      >
        {rows.map((r) => (
          <div key={r.label} style={{ textAlign: 'center', minWidth: 74 }}>
            <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.42)', marginBottom: 3 }}>{r.label}</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: r.color, whiteSpace: 'nowrap' }}>{r.value}</div>
          </div>
        ))}
      </motion.div>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        onClick={onStart}
        disabled={busy}
        style={{
          marginTop: 38, width: '100%', maxWidth: 300, height: 56, borderRadius: 18, border: 'none',
          cursor: busy ? 'default' : 'pointer',
          background: busy ? 'rgba(57,255,20,0.16)' : '#39FF14', backgroundSize: '220% 100%',
          color: busy ? '#39FF14' : '#06210A', fontSize: 16, fontWeight: 900, letterSpacing: '0.02em',
          boxShadow: busy ? 'none' : '0 0 30px rgba(57,255,20,0.5)', animation: busy ? 'none' : 'obGradMove 3s ease-in-out infinite alternate',
        }}
      >
        {busy ? 'Kaydediliyor…' : error ? 'Tekrar Dene' : 'Başla'}
      </motion.button>

      {error && (
        <>
          <p role="alert" style={{ marginTop: 14, maxWidth: 300, fontSize: 12.5, lineHeight: 1.55, fontWeight: 700, color: '#FCA5A5', textAlign: 'center' }}>
            {error}
          </p>
          {onSkip && (
            <button
              onClick={onSkip}
              disabled={busy}
              style={{
                marginTop: 10, minHeight: 46, padding: '0 18px', background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 700,
                textDecoration: 'underline', cursor: busy ? 'default' : 'pointer',
              }}
            >
              Şimdilik Geç
            </button>
          )}
        </>
      )}
    </motion.div>
  );
};

export default PlayerCardReveal;
