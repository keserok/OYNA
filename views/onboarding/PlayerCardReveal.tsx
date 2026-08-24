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
   * Kayıt hatası KALICI. Eskiden yalnız 4 saniyelik bir bildirim çıkıyordu;
   * bu perde `absolute inset-0 z-20` olduğu için altındaki her şeyi örtüyor,
   * yani hatada kullanıcının görünür hiçbir çıkışı kalmıyordu. Çıkışlar
   * artık perdenin İÇİNDE: "Tekrar Dene" düğmesi ve geri oku.
   */
  error?: string | null;
}

/**
 * Onboarding final özeti — KARTSIZ ve SADE (kullanıcı kararı).
 *
 * Baş harf küresi kaldırıldı: kullanıcı adını zaten iki satır yukarıda
 * okuyor, küre aynı bilgiyi üçüncü kez (baş harf olarak) tekrar ediyordu.
 * Bilgi değerleri de tek renkte — beş ayrı vurgu rengi yerine düz beyaz
 * bir sıra. Sakin, premium bir kapanış ekranı.
 */
const PlayerCardReveal: React.FC<PlayerCardRevealProps> = ({
  firstName, lastName, ageRange, gender, position, playStyle, locationGranted, busy, onStart, onBack, error,
}) => {
  const fullName = trUpper(`${firstName.trim()} ${lastName.trim()}`.trim());

  // Değerlerin tamamı beyaz: bu ekran bir gösterge paneli değil, bir kapanış
  // özeti. Ayrım rengi değil, etiket/değer hiyerarşisi taşır.
  const rows: { label: string; value: string }[] = [];
  if (ageRange) rows.push({ label: 'YAŞ', value: ageRange.replace('-', '–') });
  if (gender) rows.push({ label: 'CİNSİYET', value: gender === 'kadin' ? '♀ Kadın' : '♂ Erkek' });
  if (playStyle) rows.push({ label: 'OYUN STİLİ', value: PLAY_STYLE_META[playStyle].label });
  if (locationGranted) rows.push({ label: 'KONUM', value: 'Onaylı' });
  if (position) rows.push({ label: 'POZİSYON', value: POSITION_LABEL[position] });

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

      {/* İsim — ekranın tek kahramanı (küre kaldırıldı) */}
      <motion.div
        initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', textAlign: 'center', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {fullName || 'OYUNCU'}
        </div>
        <div style={{ width: 44, height: 2, background: 'rgba(255,255,255,0.22)', borderRadius: 2, marginTop: 16 }} />
      </motion.div>

      {/* Bilgi satırları — tek renk (beyaz), düz sıra */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '22px 30px', marginTop: 26, maxWidth: 320 }}
      >
        {rows.map((r) => (
          <div key={r.label} style={{ textAlign: 'center', minWidth: 74 }}>
            <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.42)', marginBottom: 3 }}>{r.label}</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#FFFFFF', whiteSpace: 'nowrap' }}>{r.value}</div>
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

      {/* Kayıt hatası: mesaj KALICI kalır. Çıkışlar "Tekrar Dene" (üstteki
          düğme) ve geri okudur. Eskiden burada üçüncü bir bağ vardı ve
          kullanıcıyı profili EKSİK hâlde uygulamaya sokuyordu; kurucu
          kararıyla kaldırıldı (24 Ağu 2026) — kurulum tamamlanmadan giriş yok.
          Kaldırılan bağın metni bilerek yazılmadı: testi bu dosyada o dizeyi
          arıyor ve yorumda geçmesi sahte kırmızı verir. */}
      {error && (
        <p role="alert" style={{ marginTop: 14, maxWidth: 300, fontSize: 12.5, lineHeight: 1.55, fontWeight: 700, color: '#FCA5A5', textAlign: 'center' }}>
          {error}
        </p>
      )}
    </motion.div>
  );
};

export default PlayerCardReveal;
