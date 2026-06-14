// ═══════════════════════════════════════════════════════════════════════════
// OYNA — CreateSeekAdModal
// Kaptanın yeni oyuncu arama ilanı oluşturduğu çok adımlı modal.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, MapPin, Calendar, Clock, Users, Zap, Target, Feather, ChevronRight, ChevronLeft,
  CheckCircle2, Loader2, AlertTriangle,
} from 'lucide-react';
import { auth } from '../supabaseAuth';
import { useAppStore } from '../store';
import { createAd } from '../services/playerSeekService';

interface CreateSeekAdModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (adId: string) => void;
  presetPitch?: { id?: string; name: string };
  presetDate?: string;
  presetTime?: string;
  presetFormat?: string;
}

type Step = 'PITCH' | 'WHEN' | 'POSITIONS' | 'STYLE' | 'REVIEW' | 'SUCCESS';

const POSITIONS = [
  { id: 'KALECİ', label: 'Kaleci', color: '#10b981' },
  { id: 'SAVUNMA', label: 'Savunma', color: '#3b82f6' },
  { id: 'ORTA SAHA', label: 'Orta Saha', color: '#f97316' },
  { id: 'HÜCUM', label: 'Hücum', color: '#ef4444' },
];

const DIFFICULTY_OPTIONS = [
  { id: 'Rahat', subtitle: 'Eğlence odaklı', icon: Feather, color: '#10b981' },
  { id: 'Ciddi', subtitle: 'Rekabetçi', icon: Zap, color: '#FFFF00' },
  { id: 'Taktiksel', subtitle: 'Sistem & disiplin', icon: Target, color: '#3b82f6' },
] as const;

const FORMATS = ['5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];
const DURATIONS = ['60 Dakika', '90 Dakika', '120 Dakika'];
const GENDERS = ['Karma', 'Erkek', 'Kadın'];
const AGE_GROUPS = ['Tümü', '14-18', '18-22', '23-27', '28-35', '35+'];

const PROGRESS_STEPS: Step[] = ['PITCH', 'WHEN', 'POSITIONS', 'STYLE', 'REVIEW'];

export const CreateSeekAdModal: React.FC<CreateSeekAdModalProps> = ({
  open, onClose, onCreated, presetPitch, presetDate, presetTime, presetFormat,
}) => {
  const { adminPitches, adminUsers } = useAppStore();
  const myUid = auth.currentUser?.uid || 'u1';
  const me = adminUsers.find(u => u.id === myUid);

  const [step, setStep] = useState<Step>('PITCH');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tarih normalizer: "18.05.2026" / "Bugün" / "Yarın" / "2026-05-18" gibi girdiler için
  const normalizeDate = (raw: string | undefined): string => {
    if (!raw) return new Date().toISOString().split('T')[0];
    const low = raw.toLowerCase().trim();
    const today = new Date();
    if (low === 'bugün' || low === 'today') return today.toISOString().split('T')[0];
    if (low === 'yarın' || low === 'tomorrow') {
      const t = new Date(today); t.setDate(t.getDate() + 1);
      return t.toISOString().split('T')[0];
    }
    // YYYY-MM-DD zaten geçerli
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // DD.MM.YYYY → YYYY-MM-DD
    const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return today.toISOString().split('T')[0];
  };

  // Form alanları
  const [pitchQuery, setPitchQuery] = useState(presetPitch?.name ?? '');
  const [selectedPitchId, setSelectedPitchId] = useState<string | undefined>(presetPitch?.id);
  const [matchDate, setMatchDate] = useState(normalizeDate(presetDate));
  const [matchTime, setMatchTime] = useState(presetTime ?? '21:00');
  const [positions, setPositions] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<'Rahat' | 'Ciddi' | 'Taktiksel'>('Ciddi');
  const [format, setFormat] = useState(presetFormat ?? '7v7');
  const [duration, setDuration] = useState('90 Dakika');
  const [gender, setGender] = useState('Karma');
  const [ageGroup, setAgeGroup] = useState('Tümü');

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('PITCH');
        setError(null);
        setPositions([]);
      }, 250);
    }
  }, [open]);

  const pitchSuggestions = pitchQuery.length >= 2
    ? adminPitches.filter(p => p.name.toLowerCase().includes(pitchQuery.toLowerCase())).slice(0, 5)
    : [];

  const togglePosition = (id: string) => {
    setPositions(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const canProceed = (() => {
    if (step === 'PITCH') return pitchQuery.trim().length >= 3;
    if (step === 'WHEN') return matchDate && matchTime;
    if (step === 'POSITIONS') return positions.length > 0;
    if (step === 'STYLE') return difficulty && format && duration;
    return true;
  })();

  const goNext = () => {
    const order: Step[] = ['PITCH', 'WHEN', 'POSITIONS', 'STYLE', 'REVIEW'];
    const i = order.indexOf(step);
    if (i < order.length - 1) setStep(order[i + 1]);
  };
  const goBack = () => {
    const order: Step[] = ['PITCH', 'WHEN', 'POSITIONS', 'STYLE', 'REVIEW'];
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1]);
  };

  const handleSubmit = async () => {
    if (!myUid) { setError('Oturumun açık değil.'); return; }
    setSubmitting(true);
    setError(null);
    const created = await createAd({
      creator_id: myUid,
      creator_name: me?.name || 'Kaptan',
      creator_avatar: me?.avatar,
      pitch_id: selectedPitchId,
      pitch_name: pitchQuery.trim(),
      match_date: matchDate,
      match_time: matchTime,
      positions_needed: positions,
      difficulty,
      format,
      duration,
      gender,
      age_group: ageGroup,
    });
    setSubmitting(false);
    if (created) {
      setStep('SUCCESS');
      onCreated?.(created.id);
    } else {
      setError('İlan oluşturulurken bir hata oluştu. Tekrar dene.');
    }
  };

  if (!open) return null;

  const stepIndex = PROGRESS_STEPS.indexOf(step);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-end md:items-center justify-center"
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 220 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full md:max-w-md bg-[#0F1318] border-t md:border border-white/10 rounded-t-3xl md:rounded-3xl shadow-[0_-20px_60px_rgba(0,0,0,0.7)] flex flex-col max-h-[92vh] overflow-hidden"
        >
          {/* Notch (mobile) */}
          <div className="md:hidden absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/15 rounded-full" />

          {/* HEADER */}
          <div className="sticky top-0 bg-[#0F1318]/95 backdrop-blur-xl border-b border-white/5 z-10 pt-6 md:pt-5 pb-3 px-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-white font-black text-base leading-none">Oyuncu Arama İlanı</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                  {step === 'PITCH' && 'Adım 1 — Tesis'}
                  {step === 'WHEN' && 'Adım 2 — Zaman'}
                  {step === 'POSITIONS' && 'Adım 3 — Aranan Mevkiler'}
                  {step === 'STYLE' && 'Adım 4 — Maç Stili'}
                  {step === 'REVIEW' && 'Adım 5 — Önizleme'}
                  {step === 'SUCCESS' && 'Tamamlandı'}
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Progress bar */}
            {step !== 'SUCCESS' && (
              <div className="flex gap-1">
                {PROGRESS_STEPS.map((s, i) => (
                  <div
                    key={s}
                    className={`flex-1 h-1 rounded-full transition-colors ${i <= stepIndex ? 'bg-[#FFFF00]' : 'bg-white/5'}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* CONTENT */}
          <div className="flex-1 overflow-y-auto px-5 py-5 custom-scrollbar">

            {/* STEP: PITCH */}
            {step === 'PITCH' && (
              <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">
                    <MapPin size={11} className="inline mr-1" /> Tesis / Saha Adı
                  </label>
                  <input
                    autoFocus
                    value={pitchQuery}
                    onChange={(e) => { setPitchQuery(e.target.value); setSelectedPitchId(undefined); }}
                    placeholder="Ör. Arena Sport Center"
                    className="w-full bg-[#1a1f2a] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm outline-none focus:border-[#FFFF00]/50 placeholder:text-gray-600"
                  />
                </div>

                {pitchSuggestions.length > 0 && (
                  <div className="bg-[#1a1f2a] border border-white/5 rounded-2xl overflow-hidden">
                    <p className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 border-b border-white/5">Önerilen Tesisler</p>
                    {pitchSuggestions.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setPitchQuery(p.name); setSelectedPitchId(p.id); }}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/[0.03] last:border-0 flex items-center gap-3"
                      >
                        <MapPin size={14} className="text-gray-500" />
                        <span className="text-sm text-white">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-3.5 flex items-start gap-2.5">
                  <AlertTriangle size={14} className="text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-200/80 leading-relaxed">
                    Tesisin uygulamada kayıtlı değilse adı yazıp devam et — oyuncular yine de görebilir.
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP: WHEN */}
            {step === 'WHEN' && (
              <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">
                      <Calendar size={11} className="inline mr-1" /> Tarih
                    </label>
                    <input
                      type="date"
                      value={matchDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setMatchDate(e.target.value)}
                      className="w-full bg-[#1a1f2a] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm outline-none focus:border-[#FFFF00]/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">
                      <Clock size={11} className="inline mr-1" /> Saat
                    </label>
                    <input
                      type="time"
                      value={matchTime}
                      onChange={(e) => setMatchTime(e.target.value)}
                      className="w-full bg-[#1a1f2a] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm outline-none focus:border-[#FFFF00]/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">Süre</label>
                  <div className="grid grid-cols-3 gap-2">
                    {DURATIONS.map(d => (
                      <button
                        key={d}
                        onClick={() => setDuration(d)}
                        className={`py-3 rounded-xl text-xs font-bold transition-all border ${
                          duration === d
                            ? 'bg-[#FFFF00]/10 border-[#FFFF00]/50 text-white'
                            : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/5'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP: POSITIONS */}
            {step === 'POSITIONS' && (
              <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
                    <Users size={11} className="inline mr-1" /> Hangi mevkilerde oyuncu arıyorsun?
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {POSITIONS.map(pos => {
                      const isSelected = positions.includes(pos.id);
                      return (
                        <button
                          key={pos.id}
                          onClick={() => togglePosition(pos.id)}
                          className={`p-4 rounded-2xl border transition-all text-left ${
                            isSelected ? 'bg-white/[0.06]' : 'bg-white/[0.02] hover:bg-white/[0.04]'
                          }`}
                          style={isSelected ? { borderColor: pos.color, boxShadow: `0 0 20px ${pos.color}30` } : { borderColor: 'rgba(255,255,255,0.06)' }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-wider" style={{ color: isSelected ? pos.color : 'rgb(255 255 255 / 0.7)' }}>
                                {pos.label}
                              </p>
                              <p className="text-[9px] text-gray-500 uppercase tracking-widest mt-1">{pos.id}</p>
                            </div>
                            {isSelected && <CheckCircle2 size={18} style={{ color: pos.color }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {positions.length > 0 && (
                  <div className="bg-[#FFFF00]/5 border border-[#FFFF00]/20 rounded-xl p-3 text-center">
                    <p className="text-[11px] text-[#FFFF00]/90 font-bold">{positions.length} mevki seçildi</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* STEP: STYLE */}
            {step === 'STYLE' && (
              <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                {/* Difficulty */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Maç Stili</p>
                  <div className="grid grid-cols-3 gap-2">
                    {DIFFICULTY_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isSelected = difficulty === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setDifficulty(opt.id as any)}
                          className="p-3 rounded-2xl border transition-all"
                          style={isSelected ? { borderColor: opt.color, background: `${opt.color}15` } : { borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
                        >
                          <Icon size={18} className="mx-auto mb-1" style={{ color: isSelected ? opt.color : 'rgb(255 255 255 / 0.5)' }} />
                          <p className="text-[11px] font-black" style={{ color: isSelected ? opt.color : 'rgb(255 255 255 / 0.7)' }}>{opt.id}</p>
                          <p className="text-[9px] text-gray-500 mt-0.5">{opt.subtitle}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Format */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Format</p>
                  <div className="flex flex-wrap gap-2">
                    {FORMATS.map(f => (
                      <button
                        key={f}
                        onClick={() => setFormat(f)}
                        className={`px-4 py-2 rounded-full text-xs font-black border transition-all ${
                          format === f
                            ? 'bg-[#39FF14]/10 border-[#39FF14]/50 text-[#39FF14]'
                            : 'bg-white/[0.02] border-white/10 text-gray-400 hover:bg-white/5'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Cinsiyet</p>
                  <div className="grid grid-cols-3 gap-2">
                    {GENDERS.map(g => (
                      <button
                        key={g}
                        onClick={() => setGender(g)}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                          gender === g
                            ? 'bg-[#FFFF00]/10 border-[#FFFF00]/50 text-white'
                            : 'bg-white/[0.02] border-white/10 text-gray-400 hover:bg-white/5'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Age */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Yaş Aralığı</p>
                  <div className="grid grid-cols-3 gap-2">
                    {AGE_GROUPS.map(a => (
                      <button
                        key={a}
                        onClick={() => setAgeGroup(a)}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                          ageGroup === a
                            ? 'bg-[#FFFF00]/10 border-[#FFFF00]/50 text-white'
                            : 'bg-white/[0.02] border-white/10 text-gray-400 hover:bg-white/5'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP: REVIEW */}
            {step === 'REVIEW' && (
              <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <div className="bg-gradient-to-br from-[#1a1f2a] to-[#0F1318] border border-white/10 rounded-3xl p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#FFFF00] mb-3">İlan Özeti</p>

                  <div className="space-y-3">
                    <Summary label="Tesis" value={pitchQuery} icon={<MapPin size={12} />} />
                    <Summary label="Tarih & Saat" value={`${new Date(matchDate).toLocaleDateString('tr-TR')} • ${matchTime}`} icon={<Calendar size={12} />} />
                    <Summary label="Süre" value={duration} icon={<Clock size={12} />} />
                    <Summary label="Format" value={format} icon={<Users size={12} />} />
                    <Summary label="Stil" value={difficulty} icon={<Zap size={12} />} />
                    <Summary label="Cinsiyet / Yaş" value={`${gender} • ${ageGroup}`} icon={<Users size={12} />} />
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Aranan Mevkiler</p>
                      <div className="flex flex-wrap gap-1.5">
                        {positions.map(p => {
                          const meta = POSITIONS.find(x => x.id === p);
                          return (
                            <span
                              key={p}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border"
                              style={{ color: meta?.color, borderColor: `${meta?.color}40`, background: `${meta?.color}10` }}
                            >
                              {meta?.label || p}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3.5 flex items-start gap-2.5">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    İlan 7 gün boyunca aktif kalır. Sen kabul edene kadar oyuncular sadece başvuru gönderebilir.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-300 flex items-center gap-2">
                    <AlertTriangle size={14} /> {error}
                  </div>
                )}
              </motion.div>
            )}

            {/* STEP: SUCCESS */}
            {step === 'SUCCESS' && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-10">
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 12, delay: 0.1 }}
                  className="w-20 h-20 bg-gradient-to-br from-[#39FF14]/30 to-[#FFFF00]/20 border-2 border-[#39FF14] rounded-full mx-auto mb-5 flex items-center justify-center shadow-[0_0_40px_rgba(57,255,20,0.4)]"
                >
                  <CheckCircle2 size={40} className="text-[#39FF14]" />
                </motion.div>
                <h3 className="text-white font-black text-xl mb-2">İlanın Yayında! ⚽</h3>
                <p className="text-gray-400 text-sm leading-relaxed px-6">
                  Oyuncular ilanını görüp başvuru gönderebilir.
                  Başvuruyu kabul ettiğinde mesajlaşma otomatik açılır.
                </p>
                <button
                  onClick={onClose}
                  className="mt-6 px-8 py-3 bg-[#FFFF00] text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:brightness-110"
                >
                  Tamam
                </button>
              </motion.div>
            )}
          </div>

          {/* FOOTER */}
          {step !== 'SUCCESS' && (
            <div className="border-t border-white/5 bg-[#0F1318]/95 backdrop-blur-xl px-5 py-3 flex items-center gap-2">
              {step !== 'PITCH' && (
                <button
                  onClick={goBack}
                  className="px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-gray-300 font-bold text-xs uppercase tracking-widest hover:bg-white/10 flex items-center gap-2"
                >
                  <ChevronLeft size={14} /> Geri
                </button>
              )}
              <div className="flex-1" />
              {step !== 'REVIEW' ? (
                <button
                  onClick={goNext}
                  disabled={!canProceed}
                  className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all ${
                    canProceed
                      ? 'bg-[#FFFF00] text-black hover:brightness-110 shadow-[0_0_20px_rgba(255,255,0,0.3)]'
                      : 'bg-white/5 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Devam <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#39FF14] to-[#FFFF00] text-black font-black text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-50 shadow-[0_0_25px_rgba(57,255,20,0.4)]"
                >
                  {submitting ? <><Loader2 size={14} className="animate-spin" /> Yayınlanıyor</> : 'İlanı Yayınla ⚡'}
                </button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const Summary: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2 text-gray-400">
      <span className="text-gray-500">{icon}</span>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </div>
    <span className="text-sm text-white font-bold">{value}</span>
  </div>
);

export default CreateSeekAdModal;
