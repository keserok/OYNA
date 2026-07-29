
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowRight, ChevronLeft, Check, Crown, Gift, Share2, Phone, X, Award, ShieldCheck, Zap, Activity, TrendingUp, MapPin, Hourglass, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import { UserRole } from '../types';
import { Spinner } from '../components/ui/Spinner';
import { ORDU_DISTRICT_NAMES, LAUNCH_CITY } from '../utils/orduData';
import { fetchActiveCoverage } from '../services/regionCoverageService';

interface PartnerOnboardingProps {
  onComplete: () => void;
  onClose: () => void;
}

type Step = 'LANDING' | 'SETUP_1' | 'SETUP_2' | 'SETUP_3' | 'LOADING' | 'DASHBOARD';

const LOADING_STEPS = [
  'Tesis profili oluşturuluyor...',
  'Varsayılan tarife yapılandırılıyor...',
  'Bölgesel pazar analizi yapılıyor...',
];

const PartnerOnboarding: React.FC<PartnerOnboardingProps> = ({ onComplete, onClose }) => {
  const [step, setStep] = useState<Step>('LANDING');

  // Form State
  const [facilityName, setFacilityName] = useState('');
  // Faz 2: serbest metin yerine il/ilçe seçimi (kayıt anından temiz veri).
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [coverage, setCoverage] = useState<{ city: string; district: string | null }[]>([]);
  const [price, setPrice] = useState('');
  const [iban, setIban] = useState('');
  const [pricingMode] = useState<'FULL' | 'PER_PERSON'>('FULL');

  // Onboard process state
  const [loadingStep, setLoadingStep] = useState(0);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [estimatedRevenue, setEstimatedRevenue] = useState<number>(0);
  const [nearbyCount, setNearbyCount] = useState<number>(0);
  const [firstBookingSeconds, setFirstBookingSeconds] = useState(1800);
  const onboardStartedRef = useRef(false);

  // Dashboard State
  const [giftOpen, setGiftOpen] = useState(false);

  // İl/İlçe seçenekleri: aktif kapsama → yoksa Ordu fallback.
  const cityOptions = useMemo(() => {
    const fromCoverage = Array.from(new Set(coverage.map((c) => c.city).filter(Boolean)));
    return fromCoverage.length ? fromCoverage : [LAUNCH_CITY];
  }, [coverage]);
  const districtOptions = useMemo(() => {
    const forCity = coverage.filter((c) => (city ? c.city === city : true)).map((c) => c.district).filter((d): d is string => !!d);
    return forCity.length ? Array.from(new Set(forCity)) : ORDU_DISTRICT_NAMES;
  }, [coverage, city]);

  useEffect(() => {
    fetchActiveCoverage()
      .then((rows) => setCoverage(rows.map((r) => ({ city: r.city, district: r.district }))))
      .catch(() => setCoverage([]));
  }, []);

  const handleNext = () => {
      if (navigator.vibrate) navigator.vibrate(50);
      if (step === 'SETUP_1') {
          if (!facilityName.trim()) { setOnboardError('Lütfen tesis adını girin.'); return; }
          if (!city.trim() || !district.trim()) { setOnboardError('Lütfen il ve ilçe seçin.'); return; }
          setOnboardError(null);
          setStep('SETUP_2');
      } else if (step === 'SETUP_2') {
          if (!price || Number(price) <= 0) { setOnboardError('Lütfen geçerli bir saatlik ücret girin.'); return; }
          setOnboardError(null);
          setStep('SETUP_3');
      } else if (step === 'SETUP_3') {
          if (!iban.trim()) { setOnboardError('Ödemeler için IBAN gereklidir.'); return; }
          setOnboardError(null);
          setStep('LOADING');
      }
  };

  const handlePriceSuggestion = () => {
      setPrice('1800');
  };

  // --- REAL DB SAVE (runs once when entering LOADING) ---
  const onboardPitch = useCallback(async () => {
      try {
          setOnboardError(null);
          setLoadingStep(0);

          const { data: userData, error: userErr } = await supabase.auth.getUser();
          if (userErr || !userData.user) throw new Error('Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.');
          const ownerId = userData.user.id;
          const basePrice = Number(price);

          // 1. Tesisi oluştur
          const { data: newPitch, error: pitchErr } = await supabase
              .from('pitches')
              .insert({
                  owner_id: ownerId,
                  name: facilityName.trim(),
                  // address NOT NULL — açık adres varsa o, yoksa ilçe/il birleşimi.
                  // Kesin konum (pin) sonradan Tesis Ayarları → Konum'dan girilir.
                  address: addressLine.trim() || [district, city].filter(Boolean).join(', '),
                  city,
                  district,
                  price_per_match: basePrice,
                  total_price: basePrice,
                  iban: iban.trim(),
                  verification_status: 'pending',
                  pricing_mode: pricingMode,
                  // Tesis KAPALI başlar: her saha için fiyat politikası girilmeden
                  // yayına alınamaz (sunucu kapısı: enforce_tariff_before_open +
                  // trg_enforce_court_tariff_before_activate). Buraya `true` yazmak
                  // sunucu tarafından zaten geri çevrilirdi — yalan alan bırakmıyoruz.
                  is_open: false,
                  auto_approve_minutes: 35,
              })
              .select()
              .single();
          if (pitchErr) throw pitchErr;
          const pitchId = (newPitch as { id: string }).id;

          // Tesis sahibi rolünü kazandır: bir sonraki girişte OwnerPanel'e düşsün
          // ve "Rol Değiştir" ile oyuncu moduna geçebilsin (Faz: rol geçişi).
          // Onboarding'i bloklamaz — hata olsa tesis yine oluşmuştur.
          try {
            await supabase.rpc('claim_owner_role');
            const store = useAppStore.getState();
            store.setRole(UserRole.OWNER);
            store.setMyRoles(Array.from(new Set([...(store.myRoles || []), UserRole.OWNER, UserRole.PLAYER])));
          } catch (roleErr) {
            console.warn('claim_owner_role:', roleErr);
          }

          setLoadingStep(1);

          // 2. Varsayılan saha (court)
          await supabase.from('courts').insert({
              pitch_id: pitchId,
              name: 'Saha 1',
              sort_order: 0,
          });

          // 3. Varsayılan tarifeler
          await supabase.from('pitch_tariffs').insert([
              { pitch_id: pitchId, name: 'Gündüz Tarifesi', tariff_type: 'WEEKDAY', applies_to_days: [1, 2, 3, 4, 5], start_time: '08:00', end_time: '17:00', price_per_hour: Math.round(basePrice * 0.8), deposit_amount: Math.round(basePrice * 0.2), sort_order: 0 },
              { pitch_id: pitchId, name: 'Akşam Tarifesi', tariff_type: 'WEEKDAY', applies_to_days: [1, 2, 3, 4, 5], start_time: '17:00', end_time: '00:00', price_per_hour: basePrice, deposit_amount: Math.round(basePrice * 0.3), sort_order: 1 },
              { pitch_id: pitchId, name: 'Hafta Sonu', tariff_type: 'WEEKEND', applies_to_days: [6, 7], start_time: '08:00', end_time: '00:00', price_per_hour: Math.round(basePrice * 1.2), deposit_amount: Math.round(basePrice * 0.4), sort_order: 2 },
          ]);

          // 4. Adminlere bildirim: DB trigger'ı üretir
          // (trg_notify_admins_pitch_verification_request — pending insert'te
          // tetiklenir; client bağlantıyı kaybetse bile bildirim garantidir).

          setLoadingStep(2);

          // 5. Bölgesel pazar analizi (WOW moment)
          const { data: regionStats } = await supabase
              .from('pitches')
              .select('price_per_match')
              .eq('city', city)
              .eq('verification_status', 'approved');

          const prices = (regionStats ?? [])
              .map((r) => (r as { price_per_match: number | null }).price_per_match)
              .filter((p): p is number => typeof p === 'number' && p > 0);
          const avgHourly = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : basePrice;
          // Aylık tahmini ek gelir: ortalama saatlik * 30 gün * 0.65 doluluk
          const monthly = Math.round(avgHourly * 30 * 0.65) || 120000;
          setEstimatedRevenue(monthly);

          const { count } = await supabase
              .from('pitches')
              .select('id', { count: 'exact', head: true })
              .eq('city', city)
              .eq('verification_status', 'approved');
          setNearbyCount(count ?? prices.length);

          // Adımların görünür kalması için kısa bekleme
          await new Promise((res) => setTimeout(res, 600));
          setStep('DASHBOARD');
      } catch (err) {
          console.error('onboardPitch:', err);
          const raw = err instanceof Error ? err.message : String(err);
          let msg = 'Tesis oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.';
          if (raw.includes('row-level security')) msg = 'Bu işlem için yetkiniz yok. Hesabınızın saha sahibi olduğundan emin olun.';
          else if (raw.includes('duplicate')) msg = 'Bu tesis zaten kayıtlı görünüyor.';
          else if (raw.includes('Oturum')) msg = raw;
          else if (raw.includes('Failed to fetch')) msg = 'Bağlantı hatası. İnternetinizi kontrol edin.';
          setOnboardError(msg);
      }
  }, [city, district, addressLine, facilityName, iban, price, pricingMode]);

  // LOADING adımına girince tek sefer çalıştır
  useEffect(() => {
      if (step === 'LOADING' && !onboardStartedRef.current) {
          onboardStartedRef.current = true;
          void onboardPitch();
      }
      if (step !== 'LOADING') onboardStartedRef.current = step === 'DASHBOARD' ? true : false;
  }, [step, onboardPitch]);

  // İlk rezervasyon geri sayımı (DASHBOARD)
  useEffect(() => {
      if (step !== 'DASHBOARD') return;
      const t = setInterval(() => setFirstBookingSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
      return () => clearInterval(t);
  }, [step]);

  const retryOnboard = () => {
      onboardStartedRef.current = true;
      void onboardPitch();
  };

  const fmtCountdown = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // --- SUB-VIEWS ---

  const LandingHero = () => (
      <div className="min-h-screen relative flex flex-col justify-end px-6 pt-6 pb-safe overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 z-0">
              {/* F3d: harici stok görsel yerine yerel gradient */}
              <div className="w-full h-full bg-gradient-to-br from-[#1a3a1a] via-[#12271b] to-[#0A0E14]" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/80 to-transparent"></div>
          </div>

          <button onClick={onClose} className="absolute top-6 right-6 z-20 bg-black/20 p-2 rounded-full text-white border border-white/10 hover:bg-black/40">
              <X size={20} />
          </button>

          <div className="relative z-10 animate-in slide-in-from-bottom-20 duration-1000">
              {/* Logo */}
              <div className="w-16 h-16 bg-[#FACC15] rounded-2xl rotate-45 flex items-center justify-center shadow-[0_0_30px_rgba(250,204,21,0.4)] mb-8 ml-4">
                  <div className="-rotate-45 font-black text-black text-2xl">O</div>
              </div>

              <h1 className="text-4xl font-black text-white leading-tight mb-4">
                  Hoş Geldiniz,<br/>
                  <span className="text-[#FACC15]">Efsane Yönetici.</span>
              </h1>
              
              <div className="bg-[#161B22]/80 backdrop-blur-xl border-l-4 border-[#FACC15] p-4 rounded-r-xl mb-8">
                  <p className="text-gray-300 text-sm leading-relaxed">
                      "<span className="text-white font-bold">Burak Kaptan</span> sizi şehrin en iyi sahası olarak önerdi. Tesisinizi dijitalin zirvesine taşımaya hazır mısınız?"
                  </p>
              </div>

              {/* Advantage Card */}
              <div className="bg-gradient-to-r from-yellow-900/40 to-[#161B22] border border-[#FACC15]/30 p-4 rounded-2xl mb-8 flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#FACC15]/10 rounded-full flex items-center justify-center text-[#FACC15]">
                      <Crown size={24} />
                  </div>
                  <div>
                      <h4 className="font-bold text-white text-sm">Şeffaf Gelir Modeli</h4>
                      {/* OP-P2-13 + F0: oranlar commission_config'ten (canlı teyit 2026-07-27):
                          kapora (Model A) %15; sahibinin OYNA-organize maçında Model B %5 + %20 markup.
                          Buradaki "%10" yanlıştı — kaleci/hakem hizmet oranıyla karışmış. */}
                      <p className="text-[10px] text-gray-400">Abonelik/sabit ücret yok — kapora işlemlerinde %15 komisyon; OYNA-organize maçlarda %5 + fiyat farkı</p>
                  </div>
              </div>

              <button 
                onClick={() => setStep('SETUP_1')}
                className="w-full h-16 bg-[#FACC15] text-black font-black text-lg rounded-2xl flex items-center justify-center gap-2 hover:bg-yellow-300 transition-all shadow-[0_0_30px_rgba(250,204,21,0.2)]"
              >
                  MACERAYA BAŞLA <ArrowRight size={20} />
              </button>
          </div>
      </div>
  );

  const SetupWizard = () => {
      const progress = step === 'SETUP_1' ? 33 : step === 'SETUP_2' ? 66 : 100;
      
      return (
          <div className="min-h-screen bg-[#0A0E14] flex flex-col px-6 pt-safe pb-safe">
              {/* Progress Bar */}
              <div className="w-full h-1 bg-gray-800 rounded-full mb-8 mt-2">
                  <div className="h-full bg-[#FACC15] rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
              </div>

              <div className="flex-1">
                  {step === 'SETUP_1' && (
                      <div className="animate-in slide-in-from-right-10 duration-500">
                          <h2 className="text-3xl font-black text-white mb-2">Tesisin Kimliği</h2>
                          <p className="text-gray-400 text-sm mb-8">Oyuncular sizi nasıl tanıyacak?</p>
                          
                          <div className="space-y-6">
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase">Tesis Adı</label>
                                  <input 
                                    type="text" 
                                    value={facilityName}
                                    onChange={(e) => setFacilityName(e.target.value)}
                                    placeholder="Örn: Arena Sport Center" 
                                    className="w-full bg-transparent border-b-2 border-white/20 py-3 text-2xl font-bold text-white focus:border-[#FACC15] outline-none placeholder:text-gray-700 transition-colors"
                                    autoFocus
                                  />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                      <label className="text-xs font-bold text-gray-500 uppercase">İl</label>
                                      <select
                                        value={city}
                                        onChange={(e) => { setCity(e.target.value); setDistrict(''); }}
                                        className="w-full bg-transparent border-b-2 border-white/20 py-3 text-xl font-bold text-white focus:border-[#FACC15] outline-none transition-colors appearance-none"
                                      >
                                        <option value="" disabled className="bg-[#0A0E14]">İl seçin</option>
                                        {cityOptions.map((c) => (
                                          <option key={c} value={c} className="bg-[#0A0E14]">{c}</option>
                                        ))}
                                      </select>
                                  </div>
                                  <div className="space-y-2">
                                      <label className="text-xs font-bold text-gray-500 uppercase">İlçe</label>
                                      <select
                                        value={district}
                                        onChange={(e) => setDistrict(e.target.value)}
                                        disabled={!city}
                                        className="w-full bg-transparent border-b-2 border-white/20 py-3 text-xl font-bold text-white focus:border-[#FACC15] outline-none transition-colors appearance-none disabled:opacity-40"
                                      >
                                        <option value="" disabled className="bg-[#0A0E14]">İlçe seçin</option>
                                        {districtOptions.map((d) => (
                                          <option key={d} value={d} className="bg-[#0A0E14]">{d}</option>
                                        ))}
                                      </select>
                                  </div>
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase">Açık Adres <span className="text-gray-600 normal-case">(opsiyonel)</span></label>
                                  <input
                                    type="text"
                                    value={addressLine}
                                    onChange={(e) => setAddressLine(e.target.value)}
                                    placeholder="Mahalle, sokak, no"
                                    className="w-full bg-transparent border-b-2 border-white/20 py-3 text-lg font-bold text-white focus:border-[#FACC15] outline-none placeholder:text-gray-700 transition-colors"
                                  />
                                  <p className="text-[11px] text-gray-600">Haritadaki kesin konumu kayıttan sonra Tesis Ayarları → Konum'dan işaretleyebilirsin.</p>
                              </div>
                          </div>
                      </div>
                  )}

                  {step === 'SETUP_2' && (
                      <div className="animate-in slide-in-from-right-10 duration-500">
                          <h2 className="text-3xl font-black text-white mb-2">Saha Değeri</h2>
                          <p className="text-gray-400 text-sm mb-8">Kalitenizin karşılığını belirleyin.</p>
                          
                          <div className="space-y-6">
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase">Saatlik Ücret (TL)</label>
                                  <div className="flex items-center gap-2">
                                      <span className="text-3xl font-black text-[#FACC15]">₺</span>
                                      <input 
                                        type="number" 
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        placeholder="0" 
                                        className="w-full bg-transparent border-b-2 border-white/20 py-3 text-4xl font-black text-white focus:border-[#FACC15] outline-none placeholder:text-gray-700 transition-colors"
                                      />
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}

                  {step === 'SETUP_3' && (
                      <div className="animate-in slide-in-from-right-10 duration-500">
                          <h2 className="text-3xl font-black text-white mb-2">Kazanç Rotası</h2>
                          <p className="text-gray-400 text-sm mb-8">Ödemeleri nereye gönderelim?</p>
                          
                          <div className="space-y-6">
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase">IBAN</label>
                                  <input 
                                    type="text" 
                                    value={iban}
                                    onChange={(e) => setIban(e.target.value)}
                                    placeholder="TR00 0000..." 
                                    className="w-full bg-transparent border-b-2 border-white/20 py-3 text-xl font-mono font-bold text-white focus:border-[#FACC15] outline-none placeholder:text-gray-700 transition-colors"
                                  />
                              </div>
                              <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-2xl flex items-start gap-3">
                                  <ShieldCheck className="text-green-500 shrink-0" />
                                  <p className="text-xs text-green-200">
                                      Banka bilgileriniz güvenle saklanır. Kazancınızı panelden çekim talebiyle IBAN'ınıza aktarabilirsiniz.
                                  </p>
                              </div>
                          </div>
                      </div>
                  )}
              </div>

              {onboardError && (
                  <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-3 mb-3 flex items-center gap-2">
                      <AlertTriangle className="text-red-400 shrink-0" size={18} />
                      <p className="text-xs text-red-200">{onboardError}</p>
                  </div>
              )}

              <div className="flex justify-between items-center mt-6">
                  <button 
                    onClick={() => {
                        setOnboardError(null);
                        if (step === 'SETUP_1') setStep('LANDING');
                        else if (step === 'SETUP_2') setStep('SETUP_1');
                        else if (step === 'SETUP_3') setStep('SETUP_2');
                    }}
                    className="p-4 rounded-full bg-[#161B22] text-gray-400 hover:text-white"
                  >
                      <ChevronLeft size={24} />
                  </button>
                  <button 
                    onClick={handleNext}
                    className="flex-1 ml-4 h-16 bg-[#FACC15] text-black font-black text-lg rounded-2xl flex items-center justify-center gap-2 hover:bg-yellow-300 transition-all shadow-lg shadow-yellow-900/20"
                  >
                      {step === 'SETUP_3' ? 'KURULUMU TAMAMLA' : 'DEVAM ET'} <ArrowRight size={20} />
                  </button>
              </div>
          </div>
      );
  };

  const LoadingScreen = () => {
      return (
          <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center relative overflow-hidden p-6">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 animate-spin-slow"></div>

              {!onboardError ? (
                  <div className="relative z-10 text-center w-full max-w-sm">
                      <Spinner size={96} thickness={5} color="#FACC15" className="mx-auto mb-8" style={{ filter: 'drop-shadow(0 0 24px rgba(250,204,21,0.35))' }} />
                      <h2 className="text-2xl font-black text-white mb-6">SAHANIZ DÜNYAYA AÇILIYOR...</h2>
                      <div className="space-y-3 text-left">
                          {LOADING_STEPS.map((label, idx) => {
                              const done = idx < loadingStep;
                              const active = idx === loadingStep;
                              return (
                                  <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${active ? 'bg-[#161B22] border-[#FACC15]/40' : done ? 'bg-[#161B22]/50 border-green-500/30' : 'bg-[#161B22]/30 border-white/5'}`}>
                                      {done ? (
                                          <span className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center"><Check className="text-green-400" size={14} /></span>
                                      ) : active ? (
                                          <Loader2 className="text-[#FACC15] animate-spin" size={20} />
                                      ) : (
                                          <span className="w-6 h-6 rounded-full border-2 border-white/10" />
                                      )}
                                      <span className={`text-sm font-bold ${done ? 'text-green-300' : active ? 'text-white' : 'text-gray-600'}`}>{label}</span>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              ) : (
                  <div className="relative z-10 text-center w-full max-w-sm bg-[#161B22] border border-red-500/30 rounded-3xl p-6">
                      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                          <AlertTriangle className="text-red-400" size={28} />
                      </div>
                      <h2 className="text-xl font-black text-white mb-2">Bir şeyler ters gitti</h2>
                      <p className="text-sm text-gray-400 mb-6">{onboardError}</p>
                      <div className="flex gap-3">
                          <button onClick={() => { setOnboardError(null); setStep('SETUP_3'); }} className="flex-1 h-12 rounded-xl bg-[#0A0E14] border border-white/10 text-gray-300 font-bold">Geri Dön</button>
                          <button onClick={retryOnboard} className="flex-1 h-12 rounded-xl bg-[#FACC15] text-black font-black">Tekrar Dene</button>
                      </div>
                  </div>
              )}
          </div>
      );
  };

  const LaunchpadDashboard = () => (
      <div className="min-h-screen bg-[#0A0E14] flex flex-col relative">
          {/* Header */}
          <header className="px-6 pt-safe pb-4 flex justify-between items-center bg-[#161B22]/50 backdrop-blur-md">
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-lg">A</div>
                  <div>
                      <h1 className="font-bold text-white text-sm">{facilityName || 'Arena Sport'}</h1>
                      <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-[10px] text-green-400 font-bold">CANLI</span>
                      </div>
                  </div>
              </div>
              <div className="flex gap-2">
                  <button 
                    onClick={() => setGiftOpen(!giftOpen)}
                    className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-full flex items-center justify-center text-black shadow-lg animate-bounce"
                  >
                      <Gift size={20} />
                  </button>
                  <button onClick={onComplete} className="w-10 h-10 bg-[#161B22] rounded-full flex items-center justify-center text-gray-400 border border-white/10 hover:text-white">
                      <X size={20} />
                  </button>
              </div>
          </header>

          <main className="flex-1 px-6 pt-6 pb-safe space-y-6 overflow-y-auto">
              
              {/* Gift Modal/Section */}
              {giftOpen && (
                  <div className="bg-gradient-to-r from-yellow-900/30 to-[#161B22] border border-[#FACC15]/30 rounded-[32px] p-6 animate-in zoom-in duration-300 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-6 opacity-10"><Crown size={100} /></div>
                      <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2">
                          <Gift className="text-[#FACC15]" /> HEDİYE PAKETİNİZ
                      </h3>
                      <div className="space-y-3 relative z-10">
                          <div className="bg-black/40 p-3 rounded-xl flex items-center gap-3 border border-white/5">
                              <Zap className="text-[#FACC15]" size={20} />
                              <div>
                                  <p className="font-bold text-white text-sm">Öncelikli Sıralama</p>
                                  <p className="text-[10px] text-gray-400">7 gün boyunca listenin en tepesindesiniz.</p>
                              </div>
                          </div>
                          <div className="bg-black/40 p-3 rounded-xl flex items-center gap-3 border border-white/5">
                              <Award className="text-blue-400" size={20} />
                              <div>
                                  <p className="font-bold text-white text-sm">Dijital OYNA Afişi</p>
                                  <p className="text-[10px] text-gray-400">QR kodlu afişiniz hazır. <button className="text-[#FACC15] hover:underline">İndir (PDF)</button></p>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {/* Onay durumu */}
              <div className="bg-gradient-to-r from-blue-900/30 to-[#161B22] border border-blue-500/30 rounded-2xl p-4 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Hourglass className="text-blue-400" size={20} />
                  </div>
                  <div>
                      <h4 className="font-bold text-white text-sm">Tesisiniz incelemeye alındı</h4>
                      <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                          Ekibimiz tesisinizi 24 saat içinde onaylar. Onaylandığında size anlık bildirim göndereceğiz ve tesisiniz oyunculara görünür olacak.
                      </p>
                  </div>
              </div>

              {/* WOW istatistik kartları */}
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#161B22] p-4 rounded-2xl border border-[#39FF14]/20">
                      <TrendingUp className="text-[#39FF14] mb-2" size={20} />
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Tahmini Aylık Ek Gelir</p>
                      <p className="text-xl font-black text-[#39FF14]">₺{estimatedRevenue.toLocaleString('tr-TR')}</p>
                  </div>
                  <div className="bg-[#161B22] p-4 rounded-2xl border border-white/5">
                      <MapPin className="text-[#FACC15] mb-2" size={20} />
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Bölgenizde OYNA'da</p>
                      <p className="text-xl font-black text-white">{nearbyCount} tesis</p>
                  </div>
                  <div className="col-span-2 bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                      <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold">İlk rezervasyona tahmini</p>
                          <p className="text-[11px] text-gray-400">Onay sonrası ilk talep beklentisi</p>
                      </div>
                      <p className="text-2xl font-black text-[#FACC15] font-mono tabular-nums">{fmtCountdown(firstBookingSeconds)}</p>
                  </div>
              </div>

              {/* Main Actions — F3e: üç buton da handler'sızdı (ölü); bağlandı. */}
              <div className="grid grid-cols-2 gap-4">
                  <button onClick={onComplete} className="col-span-2 bg-[#FACC15] h-20 rounded-2xl flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(250,204,21,0.15)] hover:scale-[1.02] transition-transform active:scale-95 group">
                      <div className="bg-black text-[#FACC15] p-2 rounded-full group-hover:rotate-90 transition-transform">
                          <Activity size={24} />
                      </div>
                      <span className="text-black font-black text-lg">PANELE GİT</span>
                  </button>

                  <button onClick={() => { window.location.href = 'mailto:destek@oyna.app?subject=OYNA%20Tesis%20Ba%C5%9Fvurusu%20Destek'; }} className="bg-[#161B22] h-24 rounded-2xl flex flex-col items-center justify-center gap-2 border border-white/5 hover:bg-white/5 transition-colors">
                      <Phone className="text-blue-400" size={24} />
                      <span className="text-xs font-bold text-white">Destek (e-posta)</span>
                  </button>
                  <button onClick={() => { if (navigator.share) navigator.share({ title: 'OYNA', text: 'Tesisim OYNA’da!', url: window.location.origin }).catch(() => {}); }} className="bg-[#161B22] h-24 rounded-2xl flex flex-col items-center justify-center gap-2 border border-white/5 hover:bg-white/5 transition-colors">
                      <Share2 className="text-green-400" size={24} />
                      <span className="text-xs font-bold text-white">Profili Paylaş</span>
                  </button>
              </div>

          </main>
      </div>
  );

  switch (step) {
      case 'LANDING': return <LandingHero />;
      case 'SETUP_1':
      case 'SETUP_2':
      case 'SETUP_3': return <SetupWizard />;
      case 'LOADING': return <LoadingScreen />;
      case 'DASHBOARD': return <LaunchpadDashboard />;
      default: return <LandingHero />;
  }
};

export default PartnerOnboarding;
