
import React, { useState, useEffect } from 'react';
import { ArrowRight, ChevronLeft, Check, Crown, Gift, Share2, Phone, X, Award, ShieldCheck, Zap, Activity } from 'lucide-react';

interface PartnerOnboardingProps {
  onComplete: () => void;
  onClose: () => void;
}

type Step = 'LANDING' | 'SETUP_1' | 'SETUP_2' | 'SETUP_3' | 'LOADING' | 'DASHBOARD';

const PartnerOnboarding: React.FC<PartnerOnboardingProps> = ({ onComplete, onClose }) => {
  const [step, setStep] = useState<Step>('LANDING');
  
  // Form State
  const [facilityName, setFacilityName] = useState('');
  const [price, setPrice] = useState('');
  
  // Dashboard State
  const [giftOpen, setGiftOpen] = useState(false);

  const handleNext = () => {
      if (navigator.vibrate) navigator.vibrate(50);
      if (step === 'SETUP_1') setStep('SETUP_2');
      else if (step === 'SETUP_2') setStep('SETUP_3');
      else if (step === 'SETUP_3') setStep('LOADING');
  };

  const handlePriceSuggestion = () => {
      setPrice('1800');
  };

  // --- SUB-VIEWS ---

  const LandingHero = () => (
      <div className="min-h-screen relative flex flex-col justify-end p-6 overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 z-0">
              <img 
                src="https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&q=80&w=1280" 
                className="w-full h-full object-cover opacity-60 filter blur-sm scale-105" 
                alt="Pitch"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/80 to-transparent"></div>
          </div>

          <button onClick={onClose} className="absolute top-6 right-6 z-20 bg-black/20 p-2 rounded-full text-white border border-white/10 hover:bg-black/40">
              <X size={20} />
          </button>

          <div className="relative z-10 animate-in slide-in-from-bottom-20 duration-1000">
              {/* Logo */}
              <div className="w-16 h-16 bg-[#FFFF00] rounded-2xl rotate-45 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,0,0.4)] mb-8 ml-4">
                  <div className="-rotate-45 font-black text-black text-2xl">O</div>
              </div>

              <h1 className="text-4xl font-black text-white leading-tight mb-4">
                  Hoş Geldiniz,<br/>
                  <span className="text-[#FFFF00]">Efsane Yönetici.</span>
              </h1>
              
              <div className="bg-[#161B22]/80 backdrop-blur-xl border-l-4 border-[#FFFF00] p-4 rounded-r-xl mb-8">
                  <p className="text-gray-300 text-sm leading-relaxed">
                      "<span className="text-white font-bold">Burak Kaptan</span> sizi şehrin en iyi sahası olarak önerdi. Tesisinizi dijitalin zirvesine taşımaya hazır mısınız?"
                  </p>
              </div>

              {/* Advantage Card */}
              <div className="bg-gradient-to-r from-yellow-900/40 to-[#161B22] border border-[#FFFF00]/30 p-4 rounded-2xl mb-8 flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#FFFF00]/10 rounded-full flex items-center justify-center text-[#FFFF00]">
                      <Crown size={24} />
                  </div>
                  <div>
                      <h4 className="font-bold text-white text-sm">Özel Davet Avantajı</h4>
                      <p className="text-[10px] text-gray-400">İlk 30 Gün %0 Komisyon & OYNA Pro Sertifikası</p>
                  </div>
              </div>

              <button 
                onClick={() => setStep('SETUP_1')}
                className="w-full h-16 bg-[#FFFF00] text-black font-black text-lg rounded-2xl flex items-center justify-center gap-2 hover:bg-yellow-300 transition-all shadow-[0_0_30px_rgba(255,255,0,0.2)]"
              >
                  MACERAYA BAŞLA <ArrowRight size={20} />
              </button>
          </div>
      </div>
  );

  const SetupWizard = () => {
      const progress = step === 'SETUP_1' ? 33 : step === 'SETUP_2' ? 66 : 100;
      
      return (
          <div className="min-h-screen bg-[#0A0E14] flex flex-col p-6">
              {/* Progress Bar */}
              <div className="w-full h-1 bg-gray-800 rounded-full mb-8 mt-2">
                  <div className="h-full bg-[#FFFF00] rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
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
                                    className="w-full bg-transparent border-b-2 border-white/20 py-3 text-2xl font-bold text-white focus:border-[#FFFF00] outline-none placeholder:text-gray-700 transition-colors"
                                    autoFocus
                                  />
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase">Şehir / Semt</label>
                                  <input 
                                    type="text" 
                                    placeholder="Örn: Beşiktaş, İstanbul" 
                                    className="w-full bg-transparent border-b-2 border-white/20 py-3 text-xl font-bold text-white focus:border-[#FFFF00] outline-none placeholder:text-gray-700 transition-colors"
                                  />
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
                                      <span className="text-3xl font-black text-[#FFFF00]">₺</span>
                                      <input 
                                        type="number" 
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        placeholder="0" 
                                        className="w-full bg-transparent border-b-2 border-white/20 py-3 text-4xl font-black text-white focus:border-[#FFFF00] outline-none placeholder:text-gray-700 transition-colors"
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
                                    placeholder="TR00 0000..." 
                                    className="w-full bg-transparent border-b-2 border-white/20 py-3 text-xl font-mono font-bold text-white focus:border-[#FFFF00] outline-none placeholder:text-gray-700 transition-colors"
                                  />
                              </div>
                              <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-2xl flex items-start gap-3">
                                  <ShieldCheck className="text-green-500 shrink-0" />
                                  <p className="text-xs text-green-200">
                                      Banka bilgileriniz 256-bit SSL sertifikası ile korunmaktadır. Ödemeler her Pazartesi hesabınıza geçer.
                                  </p>
                              </div>
                          </div>
                      </div>
                  )}
              </div>

              <div className="flex justify-between items-center mt-6">
                  <button 
                    onClick={() => {
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
                    className="flex-1 ml-4 h-16 bg-[#FFFF00] text-black font-black text-lg rounded-2xl flex items-center justify-center gap-2 hover:bg-yellow-300 transition-all shadow-lg shadow-yellow-900/20"
                  >
                      {step === 'SETUP_3' ? 'KURULUMU TAMAMLA' : 'DEVAM ET'} <ArrowRight size={20} />
                  </button>
              </div>
          </div>
      );
  };

  const LoadingScreen = () => {
      useEffect(() => {
          setTimeout(() => setStep('DASHBOARD'), 3000);
      }, []);

      return (
          <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 animate-spin-slow"></div>
              
              <div className="relative z-10 text-center">
                  <div className="w-24 h-24 border-4 border-[#FFFF00] border-t-transparent rounded-full animate-spin mx-auto mb-8 shadow-[0_0_50px_rgba(255,255,0,0.3)]"></div>
                  <h2 className="text-2xl font-black text-white mb-2">SAHANIZ DÜNYAYA AÇILIYOR...</h2>
                  <p className="text-gray-500">Sistem yapılandırılıyor.</p>
              </div>
          </div>
      );
  };

  const LaunchpadDashboard = () => (
      <div className="min-h-screen bg-[#0A0E14] flex flex-col relative">
          {/* Header */}
          <header className="p-6 flex justify-between items-center bg-[#161B22]/50 backdrop-blur-md">
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

          <main className="flex-1 p-6 space-y-6 overflow-y-auto">
              
              {/* Gift Modal/Section */}
              {giftOpen && (
                  <div className="bg-gradient-to-r from-yellow-900/30 to-[#161B22] border border-[#FFFF00]/30 rounded-[32px] p-6 animate-in zoom-in duration-300 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-6 opacity-10"><Crown size={100} /></div>
                      <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2">
                          <Gift className="text-[#FFFF00]" /> HEDİYE PAKETİNİZ
                      </h3>
                      <div className="space-y-3 relative z-10">
                          <div className="bg-black/40 p-3 rounded-xl flex items-center gap-3 border border-white/5">
                              <Zap className="text-[#FFFF00]" size={20} />
                              <div>
                                  <p className="font-bold text-white text-sm">Öncelikli Sıralama</p>
                                  <p className="text-[10px] text-gray-400">7 gün boyunca listenin en tepesindesiniz.</p>
                              </div>
                          </div>
                          <div className="bg-black/40 p-3 rounded-xl flex items-center gap-3 border border-white/5">
                              <Award className="text-blue-400" size={20} />
                              <div>
                                  <p className="font-bold text-white text-sm">Dijital OYNA Afişi</p>
                                  <p className="text-[10px] text-gray-400">QR kodlu afişiniz hazır. <button className="text-[#FFFF00] hover:underline">İndir (PDF)</button></p>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {/* Scout Credit */}
              <div className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-center gap-4">
                  <div className="relative">
                      <img src="https://i.pravatar.cc/150?u=kaptan" className="w-12 h-12 rounded-full border-2 border-green-500" alt="Scout" />
                      <div className="absolute -bottom-1 -right-1 bg-green-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded-full">SCOUT</div>
                  </div>
                  <div>
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Referans Olan</p>
                      <p className="text-sm font-bold text-white">Burak Kaptan</p>
                      <p className="text-[10px] text-gray-400">Bu tesis OYNA ekosistemine kazandırıldı.</p>
                  </div>
              </div>

              {/* Main Actions */}
              <div className="grid grid-cols-2 gap-4">
                  <button className="col-span-2 bg-[#FFFF00] h-20 rounded-2xl flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(255,255,0,0.15)] hover:scale-[1.02] transition-transform active:scale-95 group">
                      <div className="bg-black text-[#FFFF00] p-2 rounded-full group-hover:rotate-90 transition-transform">
                          <Activity size={24} />
                      </div>
                      <span className="text-black font-black text-lg">HEMEN İLK RANDEVUYU AÇ</span>
                  </button>

                  <button className="bg-[#161B22] h-24 rounded-2xl flex flex-col items-center justify-center gap-2 border border-white/5 hover:bg-white/5 transition-colors">
                      <Phone className="text-blue-400" size={24} />
                      <span className="text-xs font-bold text-white">Destek Hattı</span>
                  </button>
                  <button className="bg-[#161B22] h-24 rounded-2xl flex flex-col items-center justify-center gap-2 border border-white/5 hover:bg-white/5 transition-colors">
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
