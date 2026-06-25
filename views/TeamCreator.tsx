import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Users, ShieldCheck, CheckCircle2, ChevronRight, Palette } from 'lucide-react';
import { ICommunity } from '../types';

interface TeamCreatorProps {
  onBack: () => void;
  onComplete: (teamData: any) => void;
  communities: ICommunity[];
}

const COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-red-500', 'bg-amber-500', 
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'
];

const FORMATIONS = ['5+1', '6+1', '7+1'];

const TeamCreator: React.FC<TeamCreatorProps> = ({ onBack, onComplete, communities }) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [formation, setFormation] = useState('6+1');

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else onComplete({ name, color, communityId, formation });
  };

  return (
    <div className="h-full bg-slate-950 text-white flex flex-col font-sans">
      {/* Header */}
      <div className="pt-safe pt-12 pb-6 px-6 bg-slate-900 border-b border-white/10 relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Users size={120} />
        </div>
        <button onClick={onBack} className="mb-6 flex items-center text-emerald-500 hover:text-emerald-400 transition-colors">
          <ArrowLeft size={20} className="mr-2" />
          İptal
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Yeni Takım Kur</h1>
        <p className="text-slate-400 text-sm mt-1">Adım {step} / 3</p>
        
        {/* Progress Bar */}
        <div className="w-full h-1 bg-slate-800 mt-4 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-emerald-500"
            initial={{ width: '33%' }}
            animate={{ width: `${(step / 3) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Content — scrollable so long community lists don't push footer out */}
      <div className="flex-1 p-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-xl font-bold">Takım Kimliği</h2>
              
              <div className="space-y-2">
                <label className="text-sm text-slate-400 font-medium">Takım Adı</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: Boğaziçi FC"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm text-slate-400 font-medium flex items-center">
                  <Palette size={16} className="mr-2" /> Ana Renk
                </label>
                <div className="grid grid-cols-4 gap-4">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-12 h-12 rounded-full ${c} flex items-center justify-center transition-transform ${color === c ? 'ring-4 ring-white/20 scale-110' : 'hover:scale-105'}`}
                    >
                      {color === c && <CheckCircle2 size={20} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-xl font-bold">Topluluk Seçimi</h2>
              <p className="text-sm text-slate-400">Takımını bir topluluğa bağla veya bağımsız olarak kur.</p>
              
              <div className="space-y-3">
                <button
                  onClick={() => setCommunityId(null)}
                  className={`w-full p-4 rounded-xl border flex items-center justify-between transition-colors ${communityId === null ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-slate-900 border-white/10 text-white hover:border-white/20'}`}
                >
                  <div className="flex items-center">
                    <ShieldCheck size={24} className="mr-3" />
                    <div className="text-left">
                      <div className="font-bold">Bağımsız Takım</div>
                      <div className="text-xs opacity-70">Herhangi bir topluluğa bağlı değil</div>
                    </div>
                  </div>
                  {communityId === null && <CheckCircle2 size={20} />}
                </button>

                {communities.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCommunityId(c.id)}
                    className={`w-full p-4 rounded-xl border flex items-center justify-between transition-colors ${communityId === c.id ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-slate-900 border-white/10 text-white hover:border-white/20'}`}
                  >
                    <div className="flex items-center">
                      <Users size={24} className="mr-3" />
                      <div className="text-left">
                        <div className="font-bold">{c.name}</div>
                        <div className="text-xs opacity-70">{c.domain}</div>
                      </div>
                    </div>
                    {communityId === c.id && <CheckCircle2 size={20} />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-xl font-bold">Kadro Dizilimi</h2>
              <p className="text-sm text-slate-400">Takımının varsayılan maç formatını seç.</p>
              
              <div className="space-y-3">
                {FORMATIONS.map(f => (
                  <button
                    key={f}
                    onClick={() => setFormation(f)}
                    className={`w-full p-4 rounded-xl border flex items-center justify-between transition-colors ${formation === f ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-slate-900 border-white/10 text-white hover:border-white/20'}`}
                  >
                    <div className="font-bold text-lg">{f}</div>
                    {formation === f && <CheckCircle2 size={20} />}
                  </button>
                ))}
              </div>
              
              <div className="mt-8 p-4 bg-slate-900/50 backdrop-blur-sm border border-white/5 rounded-xl">
                <h3 className="text-sm font-bold text-slate-300 mb-2">Özet</h3>
                <div className="flex items-center space-x-3 mb-2">
                  <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center font-bold text-xs`}>
                    {name ? name.charAt(0) : '?'}
                  </div>
                  <span className="font-medium">{name || 'İsimsiz Takım'}</span>
                </div>
                <div className="text-xs text-slate-400 flex justify-between">
                  <span>Format: {formation}</span>
                  <span>{communityId ? communities.find(c => c.id === communityId)?.name : 'Bağımsız'}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer — flex-shrink-0 keeps it anchored; pb-safe clears device home indicator */}
      <div className="flex-shrink-0 p-6 pb-safe border-t border-white/10 bg-slate-950">
        <button
          onClick={handleNext}
          disabled={step === 1 && !name.trim()}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold py-4 rounded-xl flex items-center justify-center transition-colors"
        >
          {step === 3 ? 'Takımı Kur' : 'Devam Et'}
          {step < 3 && <ChevronRight size={20} className="ml-2" />}
        </button>
      </div>
    </div>
  );
};

export default TeamCreator;
