import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Scale, User, Smartphone, FileText, MapPin,
  Check, ArrowRight, Banknote, Ruler, Calendar, Award, ChevronDown, Sparkles, XCircle,
} from 'lucide-react';
import { UserRole } from '../types';
import { auth } from '../supabaseAuth';
import { submitServiceApplication, ServiceApplicationData } from '../services/serviceProviderService';
import { PageLayout } from '../components/common/PageLayout';
import { AnimatedButton } from '../components/AnimatedButton';

interface ServiceApplicationProps {
  role: UserRole.GOALKEEPER | UserRole.REFEREE;
  onSubmitted: () => void;
  onBack: () => void;
  /** Önceki başvuru reddedildiyse, admin'in red notu (varsa) */
  rejectionNote?: string | null;
}

const THEME = {
  [UserRole.GOALKEEPER]: {
    color: '#39FF14', glow: 'rgba(57,255,20,0.30)',
    label: 'KALECİ', icon: Shield,
    title: 'KALECİ BAŞVURUSU',
    tagline: 'Eldivenlerini konuştur, maç başı kazan.',
    styles: ['Panter', 'Duvar', 'Libero', 'Atak', 'Dengeli'],
    styleLabel: 'Kaleci Stili',
  },
  [UserRole.REFEREE]: {
    color: '#FF3333', glow: 'rgba(255,51,51,0.30)',
    label: 'HAKEM', icon: Scale,
    title: 'HAKEM BAŞVURUSU',
    tagline: 'Adaleti sağla, yönettiğin maç başına kazan.',
    styles: ['Otoriter', 'Diyalogcu', 'Teknisyen', 'Hızlı Karar'],
    styleLabel: 'Yönetim Tarzı',
  },
} as const;

const REF_LEVELS = ['İl Hakemi', 'Bölgesel', 'Klasman', 'FIFA Kokart'];

const COUNTRY_CODES = [
  { code: '+90', flag: '🇹🇷' },
  { code: '+49', flag: '🇩🇪' },
  { code: '+31', flag: '🇳🇱' },
  { code: '+44', flag: '🇬🇧' },
  { code: '+1', flag: '🇺🇸' },
];

const REGIONS: { city: string; districts: string[] }[] = [
  { city: 'İstanbul', districts: ['Kadıköy', 'Beşiktaş', 'Şişli', 'Ümraniye', 'Maltepe', 'Üsküdar', 'Bağcılar', 'Pendik', 'Sarıyer', 'Bakırköy'] },
  { city: 'Ankara', districts: ['Çankaya', 'Keçiören', 'Yenimahalle', 'Mamak', 'Etimesgut'] },
  { city: 'İzmir', districts: ['Karşıyaka', 'Bornova', 'Buca', 'Konak', 'Çiğli'] },
];

const formatPhoneDisplay = (digits: string) => {
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ');
};

// ─── Ortak alan sarmalayıcı ──────────────────────────────────────────────────
const Field: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode; color: string }> = ({ label, icon, children, color }) => (
  <div className="group">
    <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 tracking-wider">{label}</label>
    <div
      className="bg-[#0A0E14] border border-gray-800 p-4 rounded-2xl flex items-center gap-3 transition-colors focus-within:border-white/40"
      style={{ ['--tw-ring-color' as any]: color }}
    >
      <span className="shrink-0 text-gray-500">{icon}</span>
      {children}
    </div>
  </div>
);

const ServiceApplication: React.FC<ServiceApplicationProps> = ({ role, onSubmitted, onBack, rejectionNote }) => {
  const theme = THEME[role];
  const { color, glow } = theme;
  const isGk = role === UserRole.GOALKEEPER;

  const seedName = useMemo(() => {
    const u = auth.currentUser;
    return u?.displayName || (u?.email ? u.email.split('@')[0] : '') || '';
  }, []);

  const [fullName, setFullName] = useState(seedName);
  const [countryCode, setCountryCode] = useState('+90');
  const [showCodes, setShowCodes] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [fee, setFee] = useState('');
  const [bio, setBio] = useState('');
  const [style, setStyle] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [activeCity, setActiveCity] = useState(REGIONS[0].city);

  // GK
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  // Ref
  const [level, setLevel] = useState('');
  const [experienceYears, setExperienceYears] = useState('');

  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleZone = (z: string) => {
    setZones((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]));
  };

  const baseValid =
    fullName.trim().length >= 3 &&
    phoneDigits.length === 10 &&
    Number(fee) > 0 &&
    bio.trim().length >= 10 &&
    style.length > 0 &&
    zones.length > 0 &&
    agreed;

  const roleValid = isGk
    ? Number(height) >= 140 && Number(age) >= 14
    : level.length > 0;

  const canSubmit = baseValid && roleValid && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const payload: ServiceApplicationData = {
        fullName: fullName.trim(),
        phone: `${countryCode}${phoneDigits}`,
        fee: Number(fee),
        bio: bio.trim(),
        style,
        preferredZones: zones,
        ...(isGk
          ? { height: `${height} cm`, age: Number(age) }
          : { level, experienceYears: Number(experienceYears) || 0 }),
      };
      await submitServiceApplication(role, payload);
      if (navigator.vibrate) navigator.vibrate([40, 60, 120]);
      onSubmitted();
    } catch (err: any) {
      console.error('[ServiceApplication] başvuru hatası:', err);
      setError(err?.message || 'Başvuru gönderilemedi. Lütfen tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  const HeaderIcon = theme.icon;
  const districts = REGIONS.find((r) => r.city === activeCity)?.districts ?? [];

  return (
    <PageLayout showSafeBottom={false} onBack={onBack} className="relative z-10">
      {/* ─── Arka plan glow ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div
          className="absolute rounded-full blur-[120px]"
          style={{ width: 380, height: 380, top: '-18%', left: '-15%', background: glow }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="flex flex-col min-h-screen relative z-10 px-4 pt-16 pb-10 max-w-lg mx-auto w-full">
        {/* ─── Başlık ─── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="pt-6 pb-6 flex items-center gap-4"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${color}1a`, border: `1px solid ${color}40`, boxShadow: `0 0 22px ${glow}` }}
          >
            <HeaderIcon size={26} style={{ color }} />
          </div>
          <div>
            <span className="text-[10px] font-black tracking-widest uppercase" style={{ color }}>
              {theme.label} KAYDI
            </span>
            <h1 className="text-2xl font-black text-white italic tracking-tight leading-tight">{theme.title}</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">{theme.tagline}</p>
          </div>
        </motion.div>

        {/* ─── Bilgilendirme ─── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl p-4 mb-5 flex items-start gap-3"
          style={{ background: `${color}0d`, border: `1px solid ${color}26` }}
        >
          <Sparkles size={16} style={{ color }} className="mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-300 leading-relaxed">
            Başvurun ekibimiz tarafından <span className="font-bold" style={{ color }}>24 saat</span> içinde incelenir.
            Onaylandığında pazaryerinde listelenir ve maç tekliflerini almaya başlarsın.
          </p>
        </motion.div>

        {/* ─── Red notu (yeniden başvuru) ─── */}
        {rejectionNote && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07 }}
            className="rounded-2xl p-4 mb-5 flex items-start gap-3"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-black text-red-400 uppercase tracking-wider mb-1">
                Önceki başvurun onaylanmadı
              </p>
              <p className="text-[11px] text-gray-300 leading-relaxed">{rejectionNote}</p>
              <p className="text-[10px] text-gray-500 mt-1">Bilgilerini güncelleyip tekrar gönderebilirsin.</p>
            </div>
          </motion.div>
        )}

        {/* ─── Form kartı ─── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 26 }}
          className="rounded-[28px] border border-white/5 p-5 bg-[#161B22]/80 backdrop-blur-2xl shadow-2xl space-y-5"
        >
          {/* Ad Soyad */}
          <Field label="Ad Soyad" icon={<User size={20} />} color={color}>
            <input
              type="text"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setError(null); }}
              className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 text-sm"
              placeholder="Örn: Uğurcan Çakır"
            />
          </Field>

          {/* Telefon */}
          <Field label="Telefon Numarası" icon={<Smartphone size={20} />} color={color}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCodes(!showCodes)}
                className="flex items-center gap-1 text-white font-bold shrink-0 border-r border-white/10 pr-2 mr-1 text-sm outline-none"
              >
                {COUNTRY_CODES.find((c) => c.code === countryCode)?.flag} {countryCode}
                <ChevronDown size={10} />
              </button>
              <AnimatePresence>
                {showCodes && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute top-full mt-2 left-0 z-50 rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
                    style={{ background: '#161B22', minWidth: 120 }}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => { setCountryCode(c.code); setShowCodes(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-white hover:bg-white/10 transition-colors outline-none"
                      >
                        <span>{c.flag}</span>
                        <span className="font-bold">{c.code}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <input
              type="tel"
              inputMode="numeric"
              value={formatPhoneDisplay(phoneDigits)}
              onChange={(e) => { setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(null); }}
              className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 tracking-wide text-sm"
              placeholder="5XX XXX XX XX"
            />
          </Field>

          {/* Role-specific */}
          {isGk ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Boy" icon={<Ruler size={20} />} color={color}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 text-sm"
                  placeholder="188"
                />
                <span className="text-[10px] text-gray-500 font-bold shrink-0">cm</span>
              </Field>
              <Field label="Yaş" icon={<Calendar size={20} />} color={color}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 text-sm"
                  placeholder="25"
                />
              </Field>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 tracking-wider">Lisans Seviyesi</label>
                <div className="grid grid-cols-2 gap-2">
                  {REF_LEVELS.map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setLevel(lv)}
                      className="h-12 rounded-2xl text-xs font-black border transition-all flex items-center justify-center gap-1.5"
                      style={{
                        background: level === lv ? color : 'transparent',
                        color: level === lv ? '#000' : 'rgba(255,255,255,0.6)',
                        borderColor: level === lv ? color : 'rgba(255,255,255,0.1)',
                      }}
                    >
                      <Award size={13} /> {lv}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Deneyim (Yıl)" icon={<Calendar size={20} />} color={color}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 text-sm"
                  placeholder="5"
                />
              </Field>
            </>
          )}

          {/* Maç başı ücret */}
          <Field label="Maç Başı Ücret" icon={<Banknote size={20} />} color={color}>
            <span className="text-gray-400 font-bold text-sm shrink-0">₺</span>
            <input
              type="number"
              inputMode="numeric"
              value={fee}
              onChange={(e) => { setFee(e.target.value); setError(null); }}
              className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 text-sm"
              placeholder={isGk ? '250' : '350'}
            />
          </Field>

          {/* Stil */}
          <div>
            <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 tracking-wider">{theme.styleLabel}</label>
            <div className="flex flex-wrap gap-2">
              {theme.styles.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className="px-4 h-10 rounded-full text-xs font-black border transition-all"
                  style={{
                    background: style === s ? color : 'transparent',
                    color: style === s ? '#000' : 'rgba(255,255,255,0.6)',
                    borderColor: style === s ? color : 'rgba(255,255,255,0.1)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Tercih edilen bölgeler */}
          <div>
            <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 tracking-wider flex items-center gap-1.5">
              <MapPin size={12} style={{ color }} /> Tercih Edilen Bölgeler
            </label>
            <div className="flex gap-2 mb-3">
              {REGIONS.map((r) => (
                <button
                  key={r.city}
                  type="button"
                  onClick={() => setActiveCity(r.city)}
                  className="px-3 h-8 rounded-lg text-[11px] font-bold transition-all"
                  style={{
                    background: activeCity === r.city ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: activeCity === r.city ? '#fff' : 'rgba(255,255,255,0.4)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {r.city}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {districts.map((d) => {
                const key = `${activeCity} / ${d}`;
                const active = zones.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleZone(key)}
                    className="px-3 h-9 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1"
                    style={{
                      background: active ? `${color}1a` : 'transparent',
                      color: active ? color : 'rgba(255,255,255,0.5)',
                      borderColor: active ? color : 'rgba(255,255,255,0.1)',
                    }}
                  >
                    {active && <Check size={11} />} {d}
                  </button>
                );
              })}
            </div>
            {zones.length > 0 && (
              <p className="text-[10px] text-gray-500 mt-2 ml-1">{zones.length} bölge seçildi</p>
            )}
          </div>

          {/* Bio */}
          <div className="group">
            <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 tracking-wider">Kısa Tanıtım</label>
            <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-2xl flex items-start gap-3 focus-within:border-white/40 transition-colors">
              <FileText size={20} className="text-gray-500 shrink-0 mt-0.5" />
              <textarea
                value={bio}
                onChange={(e) => { setBio(e.target.value); setError(null); }}
                rows={3}
                maxLength={280}
                className="bg-transparent w-full outline-none text-white font-medium placeholder:text-gray-700 text-sm resize-none"
                placeholder={isGk
                  ? 'Refleks ve pozisyon almada uzmanım. Penaltı kurtarma oranım %40...'
                  : 'FIFA lisanslı hakem. 150+ maç deneyimi. Diyalog temelli yaklaşım...'}
              />
            </div>
            <p className="text-[10px] text-gray-600 mt-1 ml-1 text-right">{bio.length}/280</p>
          </div>

          {/* KVKK onayı */}
          <div className="flex items-start gap-3 px-1">
            <button
              type="button"
              onClick={() => setAgreed(!agreed)}
              className="mt-0.5 w-5 h-5 rounded-md border shrink-0 flex items-center justify-center transition-all outline-none"
              style={{
                background: agreed ? color : 'transparent',
                borderColor: agreed ? color : 'rgba(255,255,255,0.2)',
                boxShadow: agreed ? `0 0 10px ${color}40` : 'none',
              }}
            >
              {agreed && <Check size={12} className="text-black" />}
            </button>
            <p className="text-[10px] text-gray-400 leading-relaxed font-bold tracking-wide">
              Verdiğim bilgilerin doğru olduğunu ve iletişim ile lisans bilgilerimin doğrulama amacıyla işlenmesini (KVKK) onaylıyorum.
            </p>
          </div>

          {error && <p className="text-[11px] text-red-400 font-bold px-1">{error}</p>}
        </motion.div>

        {/* ─── Gönder ─── */}
        <div className="pt-5">
          <AnimatedButton
            onClick={handleSubmit}
            disabled={!canSubmit}
            isLoading={submitting}
            size="lg"
            className="w-full h-14"
            style={{
              background: canSubmit ? color : 'rgba(255,255,255,0.05)',
              color: canSubmit ? '#000' : 'rgba(255,255,255,0.2)',
              boxShadow: canSubmit ? `0 0 20px ${glow}` : 'none',
            }}
          >
            BAŞVURUYU GÖNDER <ArrowRight size={16} className="ml-1" />
          </AnimatedButton>
        </div>
      </div>
    </PageLayout>
  );
};

export default ServiceApplication;
