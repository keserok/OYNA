import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Scale, User, Smartphone, FileText, MapPin,
  Check, ArrowRight, Banknote, Ruler, Calendar, Award, ChevronDown, Sparkles, XCircle, Search,
  CreditCard, Mail,
} from 'lucide-react';
import { UserRole } from '../types';
import { auth } from '../supabaseAuth';
import { submitServiceApplication, ServiceApplicationData } from '../services/serviceProviderService';
import { uploadProviderIdPhoto, submitProviderApplication } from '../services/serviceRequestService';
import { PageLayout } from '../components/common/PageLayout';
import { AnimatedButton } from '../components/AnimatedButton';
import { TURKEY_REGIONS, districtsOfCity } from '../data/turkeyRegions';

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

// Türkçe arama için aksan/normalize yardımcısı (İ/ı, ş, ğ vb.)
const normalizeTr = (s: string) =>
  s.toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();

const formatPhoneDisplay = (digits: string) => {
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ');
};

// ─── Ortak alan sarmalayıcı ──────────────────────────────────────────────────
const Field: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode; color: string; error?: string | null }> = ({ label, icon, children, color, error }) => (
  <div className="group">
    <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 tracking-wider">{label}</label>
    <div
      className={`bg-[#0A0E14] border p-4 rounded-2xl flex items-center gap-3 transition-colors focus-within:border-white/40 ${error ? 'border-red-500/50' : 'border-gray-800'}`}
      style={{ ['--tw-ring-color' as any]: color }}
    >
      <span className="shrink-0 text-gray-500">{icon}</span>
      {children}
    </div>
    {error && <p className="text-[10px] text-red-400 font-bold mt-1.5 ml-1">{error}</p>}
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
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [intentLetter, setIntentLetter] = useState('');
  const [style, setStyle] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [activeCity, setActiveCity] = useState('Ordu');
  const [citySearch, setCitySearch] = useState('');
  const [showCityList, setShowCityList] = useState(false);

  // GK
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  // Ref
  const [level, setLevel] = useState('');
  const [experienceYears, setExperienceYears] = useState('');

  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const markTouched = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  const toggleZone = (z: string) => {
    setZones((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]));
    markTouched('zones');
  };

  const fieldErrors = {
    fullName: fullName.trim().length < 3 ? 'Ad soyad en az 3 karakter olmalı' : null,
    phone: phoneDigits.length !== 10 ? 'Telefon numarası 10 haneli olmalı' : null,
    fee: !(Number(fee) > 0) ? 'Geçerli bir ücret girmelisin' : null,
    bio: bio.trim().length < 10 ? `En az 10 karakter yaz (${bio.trim().length}/10)` : null,
    idPhoto: !idPhoto ? 'Kimlik fotoğrafı yüklemelisin' : null,
    intentLetter: intentLetter.trim().length < 10 ? `En az 10 karakter yaz (${intentLetter.trim().length}/10)` : null,
    style: style.length === 0 ? `${theme.styleLabel} seçmelisin` : null,
    zones: zones.length === 0 ? 'En az 1 bölge seçmelisin' : null,
    agreed: !agreed ? 'Devam etmek için KVKK onayı vermelisin' : null,
    height: isGk && !(Number(height) >= 140) ? 'Boy en az 140 cm olmalı' : null,
    age: isGk && !(Number(age) >= 14) ? 'Yaş en az 14 olmalı' : null,
    level: !isGk && level.length === 0 ? 'Lisans seviyesi seçmelisin' : null,
  };

  const isFieldVisible = (field: keyof typeof fieldErrors) => touched[field] || submitAttempted;
  const visibleError = (field: keyof typeof fieldErrors) => (isFieldVisible(field) ? fieldErrors[field] : null);

  const canSubmit = Object.values(fieldErrors).every((e) => !e) && !submitting;

  const handleSubmit = async () => {
    if (submitting) return;
    if (!canSubmit) {
      setSubmitAttempted(true);
      if (navigator.vibrate) navigator.vibrate(80);
      return;
    }
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

      // Kaleci/Hakem onboarding: kimlik foto + niyet mektubu → admin onay kuyruğu
      const idPhotoPath = await uploadProviderIdPhoto(idPhoto!);
      await submitProviderApplication({
        role,
        idPhotoPath,
        phone: `${countryCode}${phoneDigits}`,
        intentLetter: intentLetter.trim(),
        ...(isGk ? {} : { level }),
      });

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
  const districts = districtsOfCity(activeCity);
  const filteredCities = useMemo(() => {
    const q = normalizeTr(citySearch);
    if (!q) return TURKEY_REGIONS;
    return TURKEY_REGIONS.filter((r) => normalizeTr(r.city).includes(q));
  }, [citySearch]);

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
          <Field label="Ad Soyad" icon={<User size={20} />} color={color} error={visibleError('fullName')}>
            <input
              type="text"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setError(null); }}
              onBlur={() => markTouched('fullName')}
              className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 text-sm"
              placeholder="Örn: Uğurcan Çakır"
            />
          </Field>

          {/* Telefon */}
          <Field label="Telefon Numarası" icon={<Smartphone size={20} />} color={color} error={visibleError('phone')}>
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
              onBlur={() => markTouched('phone')}
              className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 tracking-wide text-sm"
              placeholder="5XX XXX XX XX"
            />
          </Field>

          {/* Kimlik Fotoğrafı */}
          <div className="group">
            <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 tracking-wider">Kimlik Fotoğrafı</label>
            <label
              className={`bg-[#0A0E14] border p-4 rounded-2xl flex items-center gap-3 cursor-pointer transition-colors hover:border-white/40 ${visibleError('idPhoto') ? 'border-red-500/50' : 'border-gray-800'}`}
            >
              <CreditCard size={20} className="shrink-0 text-gray-500" />
              <span className={`text-sm font-bold truncate ${idPhoto ? 'text-white' : 'text-gray-700'}`}>
                {idPhoto ? idPhoto.name : 'Kimlik fotoğrafı seç (ön yüz)'}
              </span>
              {idPhoto && <Check size={16} className="shrink-0 ml-auto" style={{ color }} />}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { setIdPhoto(e.target.files?.[0] ?? null); markTouched('idPhoto'); setError(null); }}
              />
            </label>
            {visibleError('idPhoto') && <p className="text-[10px] text-red-400 font-bold mt-1.5 ml-1">{fieldErrors.idPhoto}</p>}
          </div>

          {/* Role-specific */}
          {isGk ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Boy" icon={<Ruler size={20} />} color={color} error={visibleError('height')}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  onBlur={() => markTouched('height')}
                  className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 text-sm"
                  placeholder="188"
                />
                <span className="text-[10px] text-gray-500 font-bold shrink-0">cm</span>
              </Field>
              <Field label="Yaş" icon={<Calendar size={20} />} color={color} error={visibleError('age')}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  onBlur={() => markTouched('age')}
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
                      onClick={() => { setLevel(lv); markTouched('level'); }}
                      className="h-12 rounded-2xl text-xs font-black border transition-all flex items-center justify-center gap-1.5"
                      style={{
                        background: level === lv ? color : 'transparent',
                        color: level === lv ? '#000' : 'rgba(255,255,255,0.6)',
                        borderColor: level === lv ? color : (visibleError('level') ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'),
                      }}
                    >
                      <Award size={13} /> {lv}
                    </button>
                  ))}
                </div>
                {visibleError('level') && <p className="text-[10px] text-red-400 font-bold mt-1.5 ml-1">{fieldErrors.level}</p>}
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
          <Field label="Maç Başı Ücret" icon={<Banknote size={20} />} color={color} error={visibleError('fee')}>
            <span className="text-gray-400 font-bold text-sm shrink-0">₺</span>
            <input
              type="number"
              inputMode="numeric"
              value={fee}
              onChange={(e) => { setFee(e.target.value); setError(null); }}
              onBlur={() => markTouched('fee')}
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
                  onClick={() => { setStyle(s); markTouched('style'); }}
                  className="px-4 h-10 rounded-full text-xs font-black border transition-all"
                  style={{
                    background: style === s ? color : 'transparent',
                    color: style === s ? '#000' : 'rgba(255,255,255,0.6)',
                    borderColor: style === s ? color : (visibleError('style') ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'),
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            {visibleError('style') && <p className="text-[10px] text-red-400 font-bold mt-1.5 ml-1">{fieldErrors.style}</p>}
          </div>

          {/* Tercih edilen bölgeler */}
          <div>
            <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 tracking-wider flex items-center gap-1.5">
              <MapPin size={12} style={{ color }} /> Tercih Edilen Bölgeler
            </label>
            {/* Şehir seçici (aranabilir — 81 il) */}
            <div className="relative mb-3">
              <button
                type="button"
                onClick={() => setShowCityList((v) => !v)}
                className="w-full h-11 px-3 rounded-2xl flex items-center justify-between text-sm font-bold text-white bg-[#0A0E14] border border-gray-800 outline-none focus:border-white/40 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <MapPin size={14} style={{ color }} /> {activeCity}
                </span>
                <ChevronDown size={14} className={`text-gray-500 transition-transform ${showCityList ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {showCityList && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute top-full mt-2 left-0 right-0 z-50 rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
                    style={{ background: '#161B22' }}
                  >
                    <div className="p-2 border-b border-white/5">
                      <div className="flex items-center gap-2 bg-[#0A0E14] rounded-xl px-3 h-9 border border-gray-800">
                        <Search size={14} className="text-gray-500 shrink-0" />
                        <input
                          autoFocus
                          value={citySearch}
                          onChange={(e) => setCitySearch(e.target.value)}
                          placeholder="İl ara…"
                          className="bg-transparent w-full outline-none text-white text-sm placeholder:text-gray-600"
                        />
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {filteredCities.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-4">İl bulunamadı</p>
                      ) : (
                        filteredCities.map((r) => (
                          <button
                            key={r.city}
                            type="button"
                            onClick={() => { setActiveCity(r.city); setShowCityList(false); setCitySearch(''); }}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-white hover:bg-white/10 transition-colors outline-none"
                            style={{ background: activeCity === r.city ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                          >
                            <span className="font-bold">{r.city}</span>
                            {activeCity === r.city && <Check size={14} style={{ color }} />}
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
            {visibleError('zones') && <p className="text-[10px] text-red-400 font-bold mt-1.5 ml-1">{fieldErrors.zones}</p>}
          </div>

          {/* Bio */}
          <div className="group">
            <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 tracking-wider">Kısa Tanıtım</label>
            <div className={`bg-[#0A0E14] border p-4 rounded-2xl flex items-start gap-3 focus-within:border-white/40 transition-colors ${visibleError('bio') ? 'border-red-500/50' : 'border-gray-800'}`}>
              <FileText size={20} className="text-gray-500 shrink-0 mt-0.5" />
              <textarea
                value={bio}
                onChange={(e) => { setBio(e.target.value); setError(null); }}
                onBlur={() => markTouched('bio')}
                rows={3}
                maxLength={280}
                className="bg-transparent w-full outline-none text-white font-medium placeholder:text-gray-700 text-sm resize-none"
                placeholder={isGk
                  ? 'Refleks ve pozisyon almada uzmanım. Penaltı kurtarma oranım %40...'
                  : 'FIFA lisanslı hakem. 150+ maç deneyimi. Diyalog temelli yaklaşım...'}
              />
            </div>
            <div className="flex items-center justify-between mt-1 ml-1">
              {visibleError('bio') ? (
                <p className="text-[10px] text-red-400 font-bold">{fieldErrors.bio}</p>
              ) : <span />}
              <p className="text-[10px] text-gray-600 text-right">{bio.length}/280</p>
            </div>
          </div>

          {/* Niyet Mektubu */}
          <div className="group">
            <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 tracking-wider">Niyet Mektubu</label>
            <div className={`bg-[#0A0E14] border p-4 rounded-2xl flex items-start gap-3 focus-within:border-white/40 transition-colors ${visibleError('intentLetter') ? 'border-red-500/50' : 'border-gray-800'}`}>
              <Mail size={20} className="text-gray-500 shrink-0 mt-0.5" />
              <textarea
                value={intentLetter}
                onChange={(e) => { setIntentLetter(e.target.value); setError(null); }}
                onBlur={() => markTouched('intentLetter')}
                rows={3}
                maxLength={500}
                className="bg-transparent w-full outline-none text-white font-medium placeholder:text-gray-700 text-sm resize-none"
                placeholder={isGk
                  ? 'Neden kaleci olmak istiyorsun? Kısaca anlat...'
                  : 'Neden hakem olmak istiyorsun? Kısaca anlat...'}
              />
            </div>
            <div className="flex items-center justify-between mt-1 ml-1">
              {visibleError('intentLetter') ? (
                <p className="text-[10px] text-red-400 font-bold">{fieldErrors.intentLetter}</p>
              ) : <span />}
              <p className="text-[10px] text-gray-600 text-right">{intentLetter.length}/500</p>
            </div>
          </div>

          {/* KVKK onayı */}
          <div>
            <div className="flex items-start gap-3 px-1">
              <button
                type="button"
                onClick={() => { setAgreed(!agreed); markTouched('agreed'); }}
                className="mt-0.5 w-5 h-5 rounded-md border shrink-0 flex items-center justify-center transition-all outline-none"
                style={{
                  background: agreed ? color : 'transparent',
                  borderColor: agreed ? color : (visibleError('agreed') ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.2)'),
                  boxShadow: agreed ? `0 0 10px ${color}40` : 'none',
                }}
              >
                {agreed && <Check size={12} className="text-black" />}
              </button>
              <p className="text-[10px] text-gray-400 leading-relaxed font-bold tracking-wide">
                Verdiğim bilgilerin doğru olduğunu ve iletişim ile lisans bilgilerimin doğrulama amacıyla işlenmesini (KVKK) onaylıyorum.
              </p>
            </div>
            {visibleError('agreed') && <p className="text-[10px] text-red-400 font-bold mt-1.5 ml-1">{fieldErrors.agreed}</p>}
          </div>

          {error && <p className="text-[11px] text-red-400 font-bold px-1">{error}</p>}
        </motion.div>

        {/* ─── Gönder ─── */}
        <div className="pt-5">
          {submitAttempted && !canSubmit && (
            <p className="text-[11px] text-red-400 font-bold text-center mb-3">
              {Object.values(fieldErrors).filter(Boolean).length} alanı tamamlamalısın
            </p>
          )}
          <AnimatedButton
            onClick={handleSubmit}
            disabled={submitting}
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
