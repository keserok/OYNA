
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Share2, Wallet, Users, Info, Copy, CheckCircle2, TrendingUp, Building2, MapPin, ChevronRight, Lock, Award, Coins, Loader2 } from 'lucide-react';

interface ScoutDashboardProps {
  onBack: () => void;
}

const ScoutDashboard: React.FC<ScoutDashboardProps> = ({ onBack }) => {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const REFERRAL_CODE = "OYNA-KAPTAN-2024";
  const SHARE_LINK = `https://oyna.app/partner?ref=${REFERRAL_CODE}`;

  const REFERRED_PITCHES = [
      { id: 1, name: 'Altınordu Sahası', matches: 42, earning: 840, status: 'ACTIVE' },
      { id: 2, name: 'Yıldız Park', matches: 12, earning: 240, status: 'ACTIVE' },
      { id: 3, name: 'Vadi Spor', matches: 0, earning: 0, status: 'PENDING' },
  ];

  const handleCopy = () => {
      navigator.clipboard.writeText(SHARE_LINK);
      setToastMessage("Referans linki kopyalandı!");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
  };

  const handleShare = async () => {
      if (isSharing) return;

      if (navigator.share) {
          try {
              setIsSharing(true);
              await navigator.share({
                  title: 'OYNA Partner Ol',
                  text: 'Sahanı OYNA sistemine taşı, boş saatlerini doldur!',
                  url: SHARE_LINK
              });
          } catch (error: any) {
              console.error('Sharing failed:', error);
              // Fallback to copy if it's not a user cancellation (AbortError)
              if (error.name !== 'AbortError') {
                  handleCopy();
              }
          } finally {
              setIsSharing(false);
          }
      } else {
          handleCopy();
      }
  };

  const handleWithdraw = () => {
      setIsWithdrawing(true);
      // Haptic Feedback Simulation
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      
      setTimeout(() => {
          setIsWithdrawing(false);
          setToastMessage("Tutar cüzdana aktarıldı!");
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
      }, 3500); // Wait for animation
  };

  if (isWithdrawing) {
      return (
          <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none">
                  {/* Gold Rain Effect */}
                  {Array.from({ length: 50 }).map((_, i) => (
                      <div 
                        key={i}
                        className="absolute top-[-20px] w-4 h-4 bg-[#FFD700] rounded-full animate-[spin_2s_linear_infinite]"
                        style={{
                            left: `${Math.random() * 100}%`,
                            animationDuration: `${Math.random() * 2 + 1}s`,
                            animationDelay: `${Math.random() * 2}s`,
                            animationName: 'slideOutBottom' 
                        }}
                      ></div>
                  ))}
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-40 animate-spin-slow"></div>
              </div>

              <div className="relative z-10 text-center animate-in zoom-in duration-700">
                  <div className="w-32 h-32 bg-[#FFFF00]/10 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-[#FFFF00] shadow-[0_0_50px_rgba(255,215,0,0.4)] animate-bounce">
                      <Wallet size={48} className="text-[#FFFF00]" />
                  </div>
                  <h2 className="text-4xl font-black text-white mb-2">1.080₺</h2>
                  <p className="text-gray-400 font-bold uppercase tracking-widest">Cüzdana Aktarılıyor...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#0A0E14] font-sans pb-12 relative overflow-x-hidden">
      
      {/* Header */}
      <header className="p-6 flex justify-between items-center sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20 border-b border-white/5">
          <div className="flex items-center gap-3">
              <button onClick={onBack} className="w-11 h-11 flex items-center justify-center bg-[#161B22] border border-white/5 rounded-full text-white hover:bg-white/10 transition-colors">
                  <ArrowLeft size={20} />
              </button>
              <div>
                  <h1 className="text-xl font-black text-white uppercase tracking-tight">Scout Merkezi</h1>
                  <p className="text-[10px] text-[#FFFF00] font-bold tracking-widest">PASİF GELİR PANELİ</p>
              </div>
          </div>
          <button className="w-11 h-11 flex items-center justify-center bg-[#161B22] border border-white/5 rounded-full text-gray-400 hover:text-white">
              <Info size={20} />
          </button>
      </header>

      <main className="p-6 space-y-6">
          
          {/* 1. Main Earnings Card (Bento Large) */}
          <div className="relative overflow-hidden rounded-[32px] p-6 bg-gradient-to-br from-yellow-900/20 via-[#161B22] to-[#0A0E14] border border-[#FFFF00]/20 shadow-[0_0_40px_rgba(255,215,0,0.1)] group">
              <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                  <Coins size={140} />
              </div>
              
              <div className="relative z-10">
                  <div className="flex justify-between items-start mb-2">
                      <p className="text-xs font-bold text-yellow-500 uppercase tracking-widest flex items-center gap-2">
                          <Wallet size={14} /> Toplam Scout Kazancı
                      </p>
                      <div className="bg-[#FFFF00]/10 border border-[#FFFF00]/20 px-2 py-1 rounded-lg text-[10px] font-black text-[#FFFF00]">
                          KOMİSYON %5
                      </div>
                  </div>
                  <h2 className="text-5xl font-black text-white tracking-tight mb-6">1.080₺</h2>
                  
                  <button 
                    onClick={handleWithdraw}
                    className="w-full py-4 bg-[#FFFF00] text-black font-black rounded-2xl shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                      CÜZDANA AKTAR <ArrowLeft size={18} className="rotate-180" />
                  </button>
              </div>
          </div>

          {/* 2. Stats Grid (Bento Small) */}
          <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#161B22] p-4 rounded-[24px] border border-white/5 hover:border-white/10 transition-colors">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 mb-3">
                      <Building2 size={20} />
                  </div>
                  <p className="text-2xl font-black text-white">3</p>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Kazandırılan Saha</p>
              </div>
              <div className="bg-[#161B22] p-4 rounded-[24px] border border-white/5 hover:border-white/10 transition-colors">
                  <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center text-green-400 mb-3">
                      <TrendingUp size={20} />
                  </div>
                  <p className="text-2xl font-black text-white">54</p>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Toplam Maç</p>
              </div>
          </div>

          {/* 3. Referral Action (Bento Medium) */}
          <div className="bg-[#161B22] p-6 rounded-[32px] border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-[50px] rounded-full"></div>
              
              <div className="flex items-center justify-between mb-4">
                  <div>
                      <h3 className="text-lg font-black text-white">Saha Kazandır</h3>
                      <p className="text-xs text-gray-400 max-w-[200px]">İşletme sahibine bu kodu ver, ömür boyu komisyon kazan.</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-full text-white">
                      <Users size={24} />
                  </div>
              </div>

              <div className="bg-[#0A0E14] border border-white/10 rounded-xl p-3 flex items-center justify-between mb-4">
                  <code className="text-[#FFFF00] font-mono font-bold tracking-wider">{REFERRAL_CODE}</code>
                  <button onClick={handleCopy} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                      <Copy size={16} />
                  </button>
              </div>

              <button 
                onClick={handleShare}
                disabled={isSharing}
                className="w-full py-3 bg-white/10 border border-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  {isSharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                  {isSharing ? 'Paylaşılıyor...' : 'DAVET LİNKİ PAYLAŞ'}
              </button>
          </div>

          {/* 4. Gamification / Rank (Bento Wide) */}
          <div className="bg-gradient-to-r from-[#161B22] to-[#1F1A0B] p-5 rounded-[24px] border border-[#FFFF00]/10">
              <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                      <Award size={20} className="text-yellow-500" />
                      <span className="font-bold text-white text-sm">Rütbe: Efsane Menajer</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">Level 3</span>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
                  <div className="h-full w-[70%] bg-gradient-to-r from-yellow-600 to-[#FFFF00]"></div>
              </div>
              <p className="text-[10px] text-gray-400">
                  <span className="text-white font-bold">2 Saha</span> daha kazandır, komisyon oranını <span className="text-[#FFFF00]">%7</span> yap!
              </p>
          </div>

          {/* 5. Referred Pitches List */}
          <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase ml-2">SAHALARIM</h3>
              {REFERRED_PITCHES.map(pitch => (
                  <div key={pitch.id} className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex justify-between items-center hover:bg-white/5 transition-colors group">
                      <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pitch.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                              {pitch.status === 'ACTIVE' ? <CheckCircle2 size={20} /> : <Lock size={20} />}
                          </div>
                          <div>
                              <h4 className="font-bold text-white text-sm">{pitch.name}</h4>
                              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                  <span className="flex items-center gap-0.5"><MapPin size={10} /> Beşiktaş</span>
                                  {pitch.status === 'PENDING' && <span className="text-yellow-500 font-bold">• Onay Bekliyor</span>}
                              </div>
                          </div>
                      </div>
                      <div className="text-right">
                          <p className="font-black text-white text-sm">+{pitch.earning}₺</p>
                          <p className="text-[10px] text-gray-500">{pitch.matches} Maç</p>
                      </div>
                  </div>
              ))}
          </div>

      </main>

      {/* Toast Notification */}
      {showToast && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-[#FFFF00] text-black px-6 py-3 rounded-full font-bold text-sm shadow-[0_0_30px_rgba(255,215,0,0.4)] animate-in fade-in zoom-in duration-300 z-50 flex items-center gap-2">
              <CheckCircle2 size={16} /> {toastMessage}
          </div>
      )}

    </div>
  );
};

export default ScoutDashboard;
