import React, { useState } from 'react';
import { ArrowLeft, Star, ShieldCheck, ThumbsUp, ThumbsDown, Crown, Users, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PostMatchEvalProps {
  onBack: () => void;
  onComplete: () => void;
}

const PLAYERS = [
  { id: 'p1', name: 'Ahmet Y.', pos: 'Forvet',   initials: 'AY', color: '#10B981' },
  { id: 'p2', name: 'Caner K.', pos: 'Orta Saha', initials: 'CK', color: '#3B82F6' },
  { id: 'p3', name: 'Emre D.',  pos: 'Defans',    initials: 'ED', color: '#EF4444' },
  { id: 'p4', name: 'Burak Ş.', pos: 'Kaleci',    initials: 'BŞ', color: '#F59E0B' },
  { id: 'p5', name: 'Mert A.',  pos: 'Orta Saha', initials: 'MA', color: '#8B5CF6' },
];

const FAIR_PLAY_TAGS = [
  { id: 'fair', label: '👍 Saygılıydı', positive: true },
  { id: 'rough', label: '💪 Sert Oynadı', positive: false },
  { id: 'spirit', label: '🤝 Fair Play Ruhu', positive: true },
  { id: 'argue', label: '😤 Tartışmacıydı', positive: false },
];

const PostMatchEval: React.FC<PostMatchEvalProps> = ({ onBack, onComplete }) => {
  const [step, setStep] = useState(1);
  const [fairPlay, setFairPlay] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [playerRatings, setPlayerRatings] = useState<Record<string, number>>({});
  const [motm, setMotm] = useState<string | null>(null);
  const [refRating, setRefRating] = useState(0);
  const [pitchRating, setPitchRating] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const toggleTag = (id: string) =>
    setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  const setPlayerRating = (pid: string, val: number) =>
    setPlayerRatings(prev => ({ ...prev, [pid]: val }));

  const motmPlayer = PLAYERS.find(p => p.id === motm);
  const ratingValues: number[] = Object.values(playerRatings) as number[];
  const avgPlayerRating = ratingValues.length > 0
    ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1)
    : '—';

  if (showResult) {
    return (
      <div className="min-h-screen bg-[#070B10] text-white font-sans flex flex-col items-center justify-center p-6">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200 }}
          className="flex flex-col items-center gap-6 w-full max-w-sm">
          <motion.div animate={{ rotate: [0, -10, 10, -10, 0] }} transition={{ duration: 0.6, delay: 0.3 }}
            className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-[0_0_60px_rgba(251,191,36,0.5)]">
            <Trophy size={44} className="text-black" />
          </motion.div>
          <div className="text-center">
            <h2 className="text-2xl font-black text-white">Değerlendirme Tamam!</h2>
            <p className="text-gray-500 text-sm mt-1">Puanların kaydedildi. Teşekkürler!</p>
          </div>

          {motmPlayer && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="w-full bg-amber-500/10 border border-amber-500/25 rounded-3xl p-5 text-center">
              <Crown size={20} className="text-amber-400 mx-auto mb-2" />
              <p className="text-[9px] text-amber-400/70 font-black uppercase tracking-widest">Maçın Adamı</p>
              <div className="w-14 h-14 rounded-2xl mx-auto my-3 flex items-center justify-center font-black text-xl border border-white/15"
                style={{ background: `${motmPlayer.color}25`, color: motmPlayer.color }}>
                {motmPlayer.initials}
              </div>
              <p className="text-lg font-black text-white">{motmPlayer.name}</p>
              <p className="text-xs text-gray-600 font-bold">{motmPlayer.pos}</p>
            </motion.div>
          )}

          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3 text-center">
              <p className="text-[9px] text-gray-600 font-bold uppercase mb-1">Rakip Fair Play</p>
              <div className="flex justify-center gap-0.5">{[1,2,3,4,5].map(s => (
                <Star key={s} size={12} className={s <= fairPlay ? 'text-amber-400 fill-amber-400' : 'text-gray-700'} />
              ))}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3 text-center">
              <p className="text-[9px] text-gray-600 font-bold uppercase mb-1">Ortalama Oyuncu</p>
              <p className="text-xl font-black text-amber-400">{avgPlayerRating}</p>
            </div>
          </div>

          <motion.button whileTap={{ scale: 0.97 }} onClick={onComplete}
            className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black rounded-2xl text-sm uppercase tracking-widest shadow-[0_0_30px_rgba(16,185,129,0.3)]">
            Topluluk Sayfasına Dön
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070B10] text-white font-sans flex flex-col">
      {/* Header */}
      <div className="pt-12 pb-4 px-5 bg-[#070B10]/95 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20">
        <button onClick={onBack} className="mb-4 flex items-center gap-2 text-gray-500 hover:text-white transition-colors">
          <ArrowLeft size={18} /> <span className="text-xs font-bold">Geri</span>
        </button>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-black tracking-tight">Maç Değerlendirmesi</h1>
            <p className="text-[9px] text-rose-400 font-black uppercase tracking-widest">Güney Kampüs SK · Bugün 21:00</p>
          </div>
          <span className="text-[10px] text-gray-600 font-black">{step}/3</span>
        </div>
        {/* Progress */}
        <div className="flex gap-1">
          {[1,2,3].map(s => (
            <motion.div key={s} className="flex-1 h-1 rounded-full overflow-hidden bg-white/10">
              <motion.div initial={{ width: 0 }} animate={{ width: step >= s ? '100%' : '0%' }} transition={{ duration: 0.4 }}
                className="h-full rounded-full bg-rose-500" />
            </motion.div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">
        <AnimatePresence mode="wait">

          {/* ─ Step 1: Fair Play ─ */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-500/15 border border-blue-500/25 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck size={30} className="text-blue-400" />
                </div>
                <h2 className="text-lg font-black">Rakip Takım Fair Play</h2>
                <p className="text-xs text-gray-600 mt-1">Güney Kampüs SK'nın centilmenliği nasıldı?</p>
              </div>

              {/* Star rating */}
              <div className="flex justify-center gap-3">
                {[1,2,3,4,5].map(star => (
                  <motion.button key={star} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setFairPlay(star)}
                    className="p-1">
                    <Star size={36} className={`transition-colors ${star <= fairPlay ? 'text-amber-400 fill-amber-400' : 'text-gray-800'}`} />
                  </motion.button>
                ))}
              </div>

              {/* Tags */}
              <div className="grid grid-cols-2 gap-2">
                {FAIR_PLAY_TAGS.map(tag => (
                  <motion.button key={tag.id} whileTap={{ scale: 0.95 }}
                    onClick={() => toggleTag(tag.id)}
                    className={`p-3.5 rounded-2xl border text-xs font-black transition-all text-left ${selectedTags.includes(tag.id)
                      ? tag.positive ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : 'bg-white/[0.02] border-white/8 text-gray-500 hover:border-white/15'}`}
                  >
                    {tag.label}
                  </motion.button>
                ))}
              </div>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                disabled={fairPlay === 0}
                onClick={() => setStep(2)}
                className="w-full py-4 bg-rose-500 disabled:bg-white/5 disabled:text-gray-700 text-white font-black rounded-2xl uppercase tracking-widest text-sm transition-all">
                Devam Et →
              </motion.button>
            </motion.div>
          )}

          {/* ─ Step 2: Player Ratings + MOTM ─ */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 bg-amber-500/15 border border-amber-500/25 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Users size={28} className="text-amber-400" />
                </div>
                <h2 className="text-lg font-black">Öne Çıkan Oyuncular</h2>
                <p className="text-xs text-gray-600 mt-1">Rakip oyuncuları değerlendirin ve 👑 MOTM seçin</p>
              </div>

              <div className="space-y-3">
                {PLAYERS.map(p => (
                  <div key={p.id} className={`bg-white/[0.02] border rounded-2xl p-4 transition-all ${motm === p.id ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/5'}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border border-white/10 flex-shrink-0"
                        style={{ background: `${p.color}20`, color: p.color }}>
                        {p.initials}
                      </div>
                      <div className="flex-1">
                        <p className="font-black text-sm text-white">{p.name}</p>
                        <p className="text-[9px] text-gray-600 font-bold">{p.pos}</p>
                      </div>
                      <motion.button whileTap={{ scale: 0.9 }}
                        onClick={() => setMotm(motm === p.id ? null : p.id)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-xl border text-[9px] font-black transition-all ${motm === p.id ? 'bg-amber-500/25 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-gray-600 hover:text-amber-400'}`}
                      >
                        <Crown size={10} /> {motm === p.id ? 'MOTM!' : 'MOTM'}
                      </motion.button>
                    </div>
                    {/* Star row */}
                    <div className="flex gap-1.5">
                      {[1,2,3,4,5].map(s => (
                        <motion.button key={s} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.85 }}
                          onClick={() => setPlayerRating(p.id, s)}>
                          <Star size={22} className={`transition-colors ${s <= (playerRatings[p.id] ?? 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-800'}`} />
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep(1)}
                  className="flex-1 py-3.5 bg-white/5 border border-white/8 text-white font-black rounded-2xl text-sm uppercase tracking-widest">
                  ← Geri
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep(3)}
                  className="flex-[2] py-3.5 bg-rose-500 text-white font-black rounded-2xl text-sm uppercase tracking-widest">
                  Devam Et →
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ─ Step 3: Referee + Pitch ─ */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-500/15 border border-emerald-500/25 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Star size={28} className="text-emerald-400" />
                </div>
                <h2 className="text-lg font-black">Hakem & Saha</h2>
                <p className="text-xs text-gray-600 mt-1">Organizasyonu değerlendirin</p>
              </div>

              {[
                { label: 'Hakem Performansı', val: refRating, set: setRefRating },
                { label: 'Saha Kalitesi', val: pitchRating, set: setPitchRating },
              ].map(({ label, val, set }) => (
                <div key={label} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-3">{label}</p>
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(s => (
                      <motion.button key={s} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={() => set(s)}>
                        <Star size={28} className={`transition-colors ${s <= val ? 'text-emerald-400 fill-emerald-400' : 'text-gray-800'}`} />
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Yorum (İsteğe Bağlı)</p>
                <textarea
                  className="w-full bg-black/30 border border-white/8 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-rose-500/50 min-h-[80px] resize-none placeholder-gray-700"
                  placeholder="Maç hakkında eklemek istedikleriniz..."
                />
              </div>

              <div className="flex gap-3">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep(2)}
                  className="flex-1 py-3.5 bg-white/5 border border-white/8 text-white font-black rounded-2xl text-sm uppercase tracking-widest">
                  ← Geri
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowResult(true)}
                  className="flex-[2] py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black rounded-2xl text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                  Tamamla ✓
                </motion.button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

export default PostMatchEval;
