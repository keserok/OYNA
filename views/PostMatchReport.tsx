
import React, { useState, useEffect } from 'react';
import { Trophy, Star, TrendingUp, Zap, ChevronRight, Share2, Award, Crown, CheckCircle2, Lock, PenLine, Save, Shield } from 'lucide-react';
import { MATCH_HISTORY } from '../constants'; // Import just to mock structure

interface PostMatchReportProps {
  onBack: () => void;
}

const PostMatchReport: React.FC<PostMatchReportProps> = ({ onBack }) => {
  const [step, setStep] = useState<'SUMMARY' | 'NOTE' | 'SAVED'>('SUMMARY');
  const [note, setNote] = useState('');
  
  // Mock Data for current match
  const currentMatch = {
      score: '5-3',
      result: 'WIN',
      pitch: 'Arena Beşiktaş',
      date: 'Bugün',
      mvp: 'Burak'
  };

  const handleSaveNote = () => {
      // Simulate API Save
      if (navigator.vibrate) navigator.vibrate(50);
      setStep('SAVED');
  };

  // --- SUB-VIEWS ---

  if (step === 'SUMMARY') {
      return (
          <div className="min-h-screen bg-[#0A0E14] flex flex-col p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-full h-1/2 bg-gradient-to-b from-[#1B4332] to-[#0A0E14] opacity-20 z-0"></div>

              <div className="relative z-10 flex-1 flex flex-col justify-center items-center text-center animate-in zoom-in duration-500">
                  <p className="text-[#FFFF00] font-black tracking-widest uppercase mb-4">MAÇ SONUCU</p>
                  <h1 className="text-7xl font-black text-white mb-2">{currentMatch.score}</h1>
                  <div className="bg-[#1B4332] text-green-400 px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wide border border-green-500/30 mb-8">
                      GALİBİYET
                  </div>

                  <div className="w-full max-w-xs bg-[#161B22] border border-white/5 rounded-[24px] p-6 mb-8">
                      <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center text-yellow-500">
                              <Trophy size={24} />
                          </div>
                          <div className="text-left">
                              <p className="text-[10px] text-gray-500 font-bold uppercase">MAÇIN ADAMI</p>
                              <p className="text-xl font-black text-white">{currentMatch.mvp}</p>
                          </div>
                      </div>
                      <div className="h-px bg-white/5 w-full mb-4"></div>
                      <div className="text-left">
                          <p className="text-xs text-gray-400">Takım performansı harikaydı. Güvenilirlik puanın arttı.</p>
                      </div>
                  </div>

                  <button 
                    onClick={() => setStep('NOTE')}
                    className="w-full max-w-xs h-16 bg-[#FFFF00] text-black font-black text-lg rounded-2xl flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(255,215,0,0.2)] hover:scale-[1.02] active:scale-95 transition-all"
                  >
                      <PenLine size={20} /> KİŞİSEL NOT EKLE
                  </button>
                  <button onClick={onBack} className="mt-4 text-gray-500 text-xs font-bold hover:text-white">Şimdi Değil</button>
              </div>
          </div>
      );
  }

  if (step === 'NOTE') {
      return (
          <div className="min-h-screen bg-[#0A0E14] flex flex-col p-6">
              <header className="flex items-center gap-4 mb-6">
                  <button onClick={() => setStep('SUMMARY')} className="p-3 bg-[#161B22] rounded-full text-white border border-white/5">
                      <ChevronRight size={20} className="rotate-180" />
                  </button>
                  <h1 className="text-xl font-black text-white">Maç Günlüğü</h1>
              </header>

              <div className="flex-1 animate-in slide-in-from-bottom-10 duration-500">
                  <div className="bg-[#161B22] border border-white/10 rounded-[32px] p-6 h-full max-h-[60vh] flex flex-col relative overflow-hidden">
                      {/* Top Context */}
                      <div className="flex justify-between items-start mb-6">
                          <div>
                              <p className="text-white font-bold">{currentMatch.pitch}</p>
                              <p className="text-xs text-gray-500">{currentMatch.date}</p>
                          </div>
                          <Lock size={16} className="text-gray-600" />
                      </div>

                      {/* Text Area */}
                      <textarea 
                        className="flex-1 bg-transparent text-lg text-white placeholder:text-gray-600 outline-none resize-none font-serif leading-relaxed"
                        placeholder="Bugünkü maç nasıldı? Taktik işe yaradı mı? Kimi tutmakta zorlandın? Kendine notlar al..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        autoFocus
                      />

                      <div className="mt-4 text-[10px] text-gray-600 flex items-center gap-2">
                          <Shield size={12} /> Sadece senin görebileceğin özel alan.
                      </div>
                  </div>
              </div>

              <div className="mt-6">
                  <button 
                    onClick={handleSaveNote}
                    disabled={!note.trim()}
                    className="w-full h-16 bg-[#EF4444] disabled:bg-gray-800 disabled:text-gray-500 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:scale-[1.02] active:scale-95 transition-all"
                  >
                      <Save size={20} /> KAYDET
                  </button>
              </div>
          </div>
      );
  }

  // SAVED / END
  return (
      <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
          <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(34,197,94,0.4)]">
              <CheckCircle2 size={40} className="text-white" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">GÜNLÜĞE EKLENDİ</h2>
          <p className="text-gray-400 text-sm mb-12">Maç notların başarıyla kaydedildi.</p>
          
          <button 
            onClick={onBack}
            className="w-full max-w-xs h-16 bg-[#161B22] border border-white/10 text-white font-bold rounded-2xl hover:bg-white/5 transition-colors"
          >
              PROFİLE DÖN
          </button>
      </div>
  );
};

export default PostMatchReport;
