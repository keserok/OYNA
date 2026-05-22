import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Network, Target, MapPin, FileText, CheckCircle2 } from 'lucide-react';

interface CommunityApplicationWizardProps {
  onClose: () => void;
}

export const CommunityApplicationWizard: React.FC<CommunityApplicationWizardProps> = ({ onClose }) => {
  const [step, setStep] = useState(1);
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    audience: 'Kurumsal', // 'Kurumsal', 'Üniversite', 'Semt', 'Bağımsız'
    locations: '',
    manifesto: ''
  });

  const audienceTypes = [
      { id: 'Kurumsal', desc: 'Şirket içi veya şirketler arası' },
      { id: 'Üniversite', desc: 'Öğrenci kulüpleri veya kampüs ligleri' },
      { id: 'Semt', desc: 'Mahalle ve lokal saha organizasyonları' },
      { id: 'Bağımsız', desc: 'Genel ve karma oyuncu kitleleri' }
  ];

  const handleSend = () => {
      setIsSending(true);
      setTimeout(() => {
          setIsSending(false);
          setIsSent(true);
          setTimeout(() => {
              onClose();
          }, 3000);
      }, 2500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-2xl bg-[#0A0E14] border border-white/10 rounded-[32px] overflow-hidden flex flex-col relative shadow-[0_0_50px_rgba(0,0,0,0.8)] min-h-[500px]"
      >
          {!isSending && !isSent && (
              <button onClick={onClose} className="absolute top-5 right-5 z-50 w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
          )}

          <div className="px-8 py-6 border-b border-white/5 bg-[#161B22] flex items-center gap-4 relative overflow-hidden">
              <div className="absolute inset-0 opacity-20 pointer-events-none blur-2xl" style={{ background: 'radial-gradient(circle at 10% 50%, #3B82F6, transparent 50%)' }} />
              <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-center justify-center relative z-10">
                  <Network size={24} className="text-blue-400" />
              </div>
              <div className="relative z-10">
                  <h2 className="text-xl font-black italic uppercase tracking-tighter text-white leading-tight">Ağ Lisans Başvurusu</h2>
                  <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">OYNA Yönetimine Niyet Mektubu</p>
              </div>
          </div>

          <div className="flex-1 p-8 relative">
              <AnimatePresence mode="wait">
                  {isSent ? (
                      <motion.div 
                          key="sent"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute inset-0 flex flex-col items-center justify-center text-center p-8"
                      >
                          <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                              <CheckCircle2 size={48} className="text-emerald-400" />
                          </div>
                          <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white mb-2">Başvuru İletildi</h3>
                          <p className="text-sm font-bold text-gray-400 max-w-sm">
                              Niyet mektubun şifrelenerek OYNA merkezine gönderildi. İnceleme sonrası sana bildirim göndereceğiz.
                          </p>
                      </motion.div>
                  ) : isSending ? (
                      <motion.div 
                          key="sending"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 flex flex-col items-center justify-center text-center"
                      >
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                              <Network size={48} className="text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] mb-6" />
                          </motion.div>
                          <h3 className="text-lg font-black uppercase tracking-widest text-blue-400 animate-pulse">Şifreleniyor & Gönderiliyor...</h3>
                      </motion.div>
                  ) : step === 1 ? (
                      <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                          <div>
                              <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">
                                  <Target size={14} className="text-blue-400" /> Ağ İsmi
                              </label>
                              <input 
                                  type="text" 
                                  value={formData.name} 
                                  onChange={e => setFormData(prev => ({...prev, name: e.target.value}))}
                                  placeholder="Örn: Trendyol Tech League"
                                  className="w-full bg-[#161B22] border border-white/10 rounded-2xl px-5 py-4 text-white font-black outline-none focus:border-blue-500/50 transition-all text-lg"
                              />
                          </div>

                          <div>
                              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 block">Hedef Kitle / Tip</label>
                              <div className="grid grid-cols-2 gap-3">
                                  {audienceTypes.map(type => (
                                      <button 
                                          key={type.id}
                                          onClick={() => setFormData(prev => ({...prev, audience: type.id}))}
                                          className={`p-4 rounded-2xl border flex flex-col items-start gap-1 transition-all text-left ${formData.audience === type.id ? 'bg-blue-500/10 border-blue-500/50' : 'bg-[#161B22] border-white/5 hover:border-white/20'}`}
                                      >
                                          <span className={`text-sm font-black uppercase tracking-widest ${formData.audience === type.id ? 'text-blue-400' : 'text-white'}`}>{type.id}</span>
                                          <span className="text-[9px] text-gray-500 font-bold uppercase">{type.desc}</span>
                                      </button>
                                  ))}
                              </div>
                          </div>
                      </motion.div>
                  ) : step === 2 ? (
                      <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                          <div>
                              <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">
                                  <MapPin size={14} className="text-emerald-400" /> Merkez Sahalar
                              </label>
                              <p className="text-xs text-gray-400 font-bold mb-3">Maçların ağırlıklı olarak oynanacağı bölge veya favori saha isimlerini belirtin.</p>
                              <textarea 
                                  value={formData.locations} 
                                  onChange={e => setFormData(prev => ({...prev, locations: e.target.value}))}
                                  placeholder="Örn: Kadıköy Kalamış Sahası, Ataşehir çevresi..."
                                  className="w-full h-24 bg-[#161B22] border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-emerald-500/50 transition-all resize-none"
                              />
                          </div>
                      </motion.div>
                  ) : (
                      <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 flex flex-col h-full">
                          <div className="flex-1">
                              <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">
                                  <FileText size={14} className="text-amber-400" /> Niyet Mektubu (Manifesto)
                              </label>
                              <p className="text-xs text-gray-400 font-bold mb-3">
                                  Bu topluluğun vizyonu nedir? OYNA yönetiminin bu ağı onaylaması için bize kültürünüzden bahsedin.
                              </p>
                              <textarea 
                                  value={formData.manifesto} 
                                  onChange={e => setFormData(prev => ({...prev, manifesto: e.target.value}))}
                                  placeholder="Örn: Ekibimiz her hafta düzenli maç yapan yazılımcılardan oluşuyor. OYNA'nın rekabetçi ortamında kendi kapalı ligimizi kurup..."
                                  className="w-full h-40 bg-[#161B22] border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-amber-500/50 transition-all resize-none custom-scrollbar"
                              />
                          </div>
                      </motion.div>
                  )}
              </AnimatePresence>
          </div>

          {/* Footer Actions */}
          {!isSending && !isSent && (
              <div className="px-8 py-5 border-t border-white/5 flex items-center justify-between bg-[#0A0E14]">
                  <button 
                      onClick={() => setStep(s => Math.max(1, s - 1))}
                      className={`text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors ${step === 1 ? 'opacity-0 pointer-events-none' : ''}`}
                  >
                      Geri
                  </button>

                  <div className="flex gap-1.5">
                      {[1,2,3].map(i => (
                          <div key={i} className={`w-2 h-2 rounded-full ${step >= i ? 'bg-blue-500' : 'bg-white/10'}`} />
                      ))}
                  </div>

                  {step < 3 ? (
                      <button 
                          onClick={() => setStep(s => s + 1)}
                          disabled={(step === 1 && !formData.name) || (step === 2 && !formData.locations)}
                          className="px-6 py-3 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl disabled:opacity-50 hover:bg-gray-200 transition-colors"
                      >
                          İleri
                      </button>
                  ) : (
                      <button 
                          onClick={handleSend}
                          disabled={!formData.manifesto || formData.manifesto.length < 20}
                          className="px-6 py-3 bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl disabled:opacity-50 hover:bg-blue-400 transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                      >
                          Başvuruyu Gönder <Send size={14} />
                      </button>
                  )}
              </div>
          )}
      </motion.div>
    </div>
  );
};
