import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Star, ShieldCheck, Users, Trophy, MessageSquare, Droplets, Hand, Gavel, CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { submitServiceRating, getMatchServiceRequests, captainConfirmService } from '../services/serviceRequestService';
import { getPendingScoreProposal, approveMatchScore, type ScoreProposal } from '../services/scoreService';
import type { PositionSlot } from '../types';

// FAZ 5: Maça atanmış kaleci/hakem hakkında değerlendirme ekranında gösterilecek bilgi
interface ServiceProviderInfo {
  id: string;
  type: 'GK' | 'REF';
  name: string;
  avatar?: string | null;
}

interface PostMatchEvalProps {
  onBack: () => void;
  onComplete: () => void;
}

interface EvalPlayer { id: string; name: string; pos: string; initials: string; color: string; tier: string }

const MOCK_PLAYERS: EvalPlayer[] = [
  { id: 'p1', name: 'Ahmet Y.', pos: 'SNT',     initials: 'AY', color: '#ffd54f', tier: 'gold' },
  { id: 'p2', name: 'Caner K.', pos: 'MID',     initials: 'CK', color: '#c5cef5', tier: 'silver' },
  { id: 'p3', name: 'Emre D.',  pos: 'DEF',     initials: 'ED', color: '#d4986a', tier: 'bronze' },
  { id: 'p4', name: 'Burak Ş.', pos: 'KL',      initials: 'BŞ', color: '#ffd54f', tier: 'gold' },
  { id: 'p5', name: 'Mert A.',  pos: 'MID',     initials: 'MA', color: '#c5cef5', tier: 'silver' },
];

const initialsOf = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';

// Oyuncu başına centilmenlik. Değerler player_ratings.fair_play_score
// CHECK (1..5) aralığına birebir oturur; seçim yapılmazsa 3 (nötr) gider.
const FAIR_PLAY_CHOICES = [
  { value: 5, label: 'Centilmendi' },
  { value: 3, label: 'Normal' },
  { value: 1, label: 'Sert oynadı' },
] as const;
const FAIR_PLAY_NEUTRAL = 3;

// Sparkle Particle Component
const Sparkle: React.FC<{ x: number; y: number; delay: number }> = ({ x, y, delay }) => (
  <motion.div
    initial={{ x, y, scale: 0, opacity: 1 }}
    animate={{ 
      y: y - 70, 
      x: x + (Math.random() - 0.5) * 50,
      scale: [0, 1.3, 0.7, 0],
      opacity: [1, 1, 0.5, 0],
      rotate: [0, 180, 360]
    }}
    transition={{ duration: 1.0, delay, ease: "easeOut" }}
    className="absolute pointer-events-none text-[#FACC15] z-50"
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" />
    </svg>
  </motion.div>
);

// FAZ 5: Kaleci/Hakem 1-10 puanlama + opsiyonel yorum bloğu.
// Puan girilmezse (score === 0) gönderim atlanır — değerlendirme zorunlu değildir.
const ServiceRatingCard: React.FC<{
  info: ServiceProviderInfo;
  score: number;
  comment: string;
  onScore: (val: number) => void;
  onComment: (val: string) => void;
}> = ({ info, score, comment, onScore, onComment }) => {
  const isGk = info.type === 'GK';
  const accent = isGk ? 'text-[#FACC15]' : 'text-blue-400';
  const ring = isGk ? 'border-[#FACC15]/20 bg-[#FACC15]/10' : 'border-blue-500/20 bg-blue-500/10';
  const Icon = isGk ? Hand : Gavel;
  return (
    <div className="bg-[#121620]/50 border border-white/5 rounded-[24px] p-5 flex flex-col gap-4 relative overflow-hidden">
      {/* Sağlayıcı kimliği */}
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border overflow-hidden shrink-0 ${ring}`}>
          {info.avatar
            ? <img src={info.avatar} alt={info.name} className="w-full h-full object-cover" />
            : <Icon size={20} className={accent} />}
        </div>
        <div className="min-w-0">
          <p className="text-[0.75rem] font-semibold text-[#8B949E]">
            {isGk ? 'Kaleci değerlendirmesi' : 'Hakem değerlendirmesi'}
          </p>
          <p className="text-sm font-extrabold text-white uppercase tracking-tight italic truncate">{info.name}</p>
        </div>
        {score > 0 && (
          <span className={`ml-auto text-lg font-extrabold italic tracking-tighter ${accent}`}>{score}<span className="text-[#8B949E] text-xs">/10</span></span>
        )}
      </div>

      {/* 1-10 puan butonları */}
      <div className="grid grid-cols-10 gap-1.5">
        {Array.from({ length: 10 }).map((_, i) => {
          const val = i + 1;
          const active = val <= score;
          return (
            <motion.button
              key={val}
              whileTap={{ scale: 0.88 }}
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(15);
                onScore(score === val ? 0 : val);
              }}
              className={`h-9 rounded-lg border text-[0.6875rem] font-extrabold transition-all ${
                active
                  ? isGk
                    ? 'bg-[#FACC15] text-black border-[#FACC15] shadow-[0_0_8px_rgba(250,204,21,0.3)]'
                    : 'bg-blue-500 text-white border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                  : 'bg-black/30 border-white/5 text-[#8B949E] hover:text-white hover:border-white/10'
              }`}
            >
              {val}
            </motion.button>
          );
        })}
      </div>

      {/* Opsiyonel yorum */}
      <textarea
        value={comment}
        onChange={(e) => onComment(e.target.value)}
        placeholder={isGk ? 'Kaleci hakkında not (isteğe bağlı)…' : 'Hakem hakkında not (isteğe bağlı)…'}
        className="w-full bg-black/40 border border-white/8 rounded-2xl p-3.5 text-[0.9375rem] leading-[22px] text-white focus:outline-none focus:border-white/20 min-h-[60px] resize-none placeholder-[#8B949E] font-normal transition-all"
      />
    </div>
  );
};

const PostMatchEval: React.FC<PostMatchEvalProps> = ({ onBack, onComplete }) => {
  const { selectedMatch } = useAppStore();
  // Gerçek (UUID) maç mı? Mock/demo yollarını tek yerden kapılar (G1/G2).
  const isRealMatch = !!selectedMatch?.id && /^[0-9a-f-]{36}$/i.test(selectedMatch.id);

  // Gerçek katılımcıları maçın kadrosundan türet; demo maçta örnek kadro,
  // gerçek-ama-katılımcısız maçta BOŞ (G2: mock oyuncuları gerçek RPC'ye
  // puanlamak reddediliyordu).
  const PLAYERS = useMemo<EvalPlayer[]>(() => {
    if (!selectedMatch) return MOCK_PLAYERS;
    const uid = auth.currentUser?.uid;
    const allSlots: PositionSlot[] = [
      ...(selectedMatch.slots ?? []),
      ...(selectedMatch.awaySlots ?? []),
    ];
    const real = allSlots
      .filter(s => s.status === 'TAKEN' && s.player && s.player.id !== uid)
      .map((s): EvalPlayer => ({
        id: s.player!.id,
        name: s.player!.name,
        pos: s.player!.position || s.role || '—',
        initials: initialsOf(s.player!.name),
        color: '#c5cef5',
        tier: 'silver',
      }));
    if (real.length > 0) return real;
    return isRealMatch ? [] : MOCK_PLAYERS;
  }, [selectedMatch, isRealMatch]);

  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  // G1: skor onayı YALNIZ gerçek bir bekleyen öneri varsa gösterilir (sabit
  // 5-3 sahte ekranı öldü). Varsayılan kapalı; effect gerçek öneriyi bulunca açar.
  const [showHandshake, setShowHandshake] = useState(false);
  const [scoreProposal, setScoreProposal] = useState<ScoreProposal | null>(null);
  const [approvingScore, setApprovingScore] = useState(false);
  // BULGU-097: saha notu artık gerçekten kaydediliyor — submit_pitch_rating'in
  // mevcut p_comment parametresiyle gider (eskiden yalnız state'te durup yok oluyordu).
  const [orgComment, setOrgComment] = useState('');
  const [playerCardIdx, setPlayerCardIdx] = useState(0);
  const [playerRatings, setPlayerRatings] = useState<Record<string, number>>({});
  // BULGU-096: centilmenlik artık oyuncu başına. Tek global değer, puanlanan
  // HERKESE (kendi takım arkadaşların dahil) aynı fair_play_score olarak gidiyordu.
  const [playerFairPlay, setPlayerFairPlay] = useState<Record<string, number>>({});
  // F2.2: MOTM seçimi kaldırıldı — ayrı oy saklanmaz; MVP, player_ratings
  // ortalamasından TÜRETİLİR (match_motm görünümü + get_player_motm_count).
  // Eski buton kullanıcıya seçim yaptırıp hiçbir yere yazmıyordu (sessiz kayıp).
  const [pitchRating, setPitchRating] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  // BULGU-097: sonuç ekranı yalnız GERÇEKTEN kaydedilen veriyi anlatır.
  const [saveErrors, setSaveErrors] = useState<string[]>([]);

  // FAZ 5: Maça atanmış kaleci/hakem değerlendirmesi (1-10 + opsiyonel yorum)
  const [providers, setProviders] = useState<ServiceProviderInfo[]>([]);
  const [serviceScores, setServiceScores] = useState<Record<string, number>>({});      // key: provider id
  const [serviceComments, setServiceComments] = useState<Record<string, string>>({});   // key: provider id

  // Atanmış sağlayıcı bilgilerini (ad/avatar) çek
  useEffect(() => {
    let cancelled = false;

    const fetchProvider = async (
      table: 'goalkeepers' | 'referees',
      id: string,
      type: 'GK' | 'REF',
      fallbackName: string,
    ): Promise<ServiceProviderInfo> => {
      try {
        const { data } = await supabase.from(table).select('name,avatar').eq('id', id).maybeSingle();
        return { id, type, name: (data as any)?.name || fallbackName, avatar: (data as any)?.avatar ?? null };
      } catch {
        return { id, type, name: fallbackName, avatar: null };
      }
    };

    const loadProviders = async () => {
      if (!selectedMatch) { setProviders([]); return; }
      const tasks: Promise<ServiceProviderInfo>[] = [];
      // İki taraflı kaleci: ev sahibi + deplasman kalecisi ayrı ayrı değerlendirilir.
      if (selectedMatch.gkId) tasks.push(fetchProvider('goalkeepers', selectedMatch.gkId, 'GK', 'Ev Sahibi Kalecisi'));
      if (selectedMatch.awayGkId) tasks.push(fetchProvider('goalkeepers', selectedMatch.awayGkId, 'GK', 'Deplasman Kalecisi'));
      if (selectedMatch.refereeId) tasks.push(fetchProvider('referees', selectedMatch.refereeId, 'REF', 'Hakem'));
      const results = await Promise.all(tasks);
      if (!cancelled) setProviders(results);
    };

    loadProviders();
    return () => { cancelled = true; };
  }, [selectedMatch]);

  const showInfo = (msg: string) => {
    setInfoToast(msg);
    setTimeout(() => setInfoToast(null), 3500);
  };

  // G1: gerçek maç için bekleyen skor önerisini çek; varsa onay ekranını aç.
  useEffect(() => {
    let cancelled = false;
    if (!isRealMatch || !selectedMatch?.id) return;
    getPendingScoreProposal(selectedMatch.id)
      .then((p) => { if (!cancelled && p) { setScoreProposal(p); setShowHandshake(true); } })
      .catch(() => { /* öneri yoksa onay ekranı gösterilmez */ });
    return () => { cancelled = true; };
  }, [isRealMatch, selectedMatch?.id]);

  const handleApproveScore = async () => {
    if (!scoreProposal || approvingScore) { setShowHandshake(false); return; }
    setApprovingScore(true);
    try {
      await approveMatchScore(scoreProposal.id);
      showInfo('Skoru onayladın.');
    } catch (e: any) {
      showInfo(e?.message || 'Skor onaylanamadı.');
    } finally {
      setApprovingScore(false);
      setShowHandshake(false);
    }
  };

  // Değerlendirmeyi kalıcılaştır: oyuncu puanları + maçı sonlandır ("başarılı maç" sinyali)
  const persistEvaluation = async () => {
    if (submitting) return;
    // Demo (UUID olmayan) maçta sunucu çağrılarını atla; gerçek maçta kaydet.
    if (!isRealMatch) {
      // Gerçek (UUID) maç değil → yalnız sonuç ekranını göster (demo)
      setShowResult(true);
      return;
    }
    setSubmitting(true);
    setSaveErrors([]);
    // Kaydedilemeyen parçaların adları; sonuç ekranı bu listeyi okur.
    const failed: string[] = [];

    // Bug C: Oyuncu-değerlendirmesi başarısız olsa bile servis (kaleci/hakem)
    // puanlaması ÇALIŞMALI — aksi halde sağlayıcı ödemesi serbest bırakılmaz.
    // Bu yüzden oyuncu-değerlendirme ile servis-puanlama bağımsız try/catch'lerde.
    try {
      const ratings = Object.entries(playerRatings).map(([ratee_id, stars]) => ({
        ratee_id,
        skill_score: Math.max(1, Math.min(10, Math.round((stars as number) * 2))),
        // BULGU-096: her oyuncunun KENDİ centilmenlik seçimi; seçilmediyse nötr 3.
        fair_play_score: playerFairPlay[ratee_id] ?? FAIR_PLAY_NEUTRAL,
      }));
      if (ratings.length > 0) {
        const { error: evalErr } = await supabase.rpc('submit_match_evaluation', {
          p_match_id: selectedMatch.id, p_ratings: ratings,
        });
        if (evalErr) throw evalErr;
      }
    } catch (err) {
      // Oyuncu-değerlendirme başarısız → kullanıcıyı bilgilendir ama
      // servis puanlamasını engelleme (return etme).
      console.warn('[PostMatchEval] Oyuncu değerlendirmesi kaydedilemedi:', err);
      const em = String((err as any)?.message || '');
      if (/already|zaten|duplicate/i.test(em)) {
        showInfo('Bu maçı zaten değerlendirdin.');
      } else {
        failed.push('Oyuncu puanların');
        showInfo('Oyuncu puanların kaydedilemedi. Tekrar dene.');
      }
    }

    // finalize yalnız maç sahibi/kaptan için yetkili; değilse otomatik cron
    // sonlandırır. Ayrı try/catch: bu bir yaşam-döngüsü adımı, kullanıcının
    // girdiği bir veri değil — hatası "puanın kaydedilemedi" diye raporlanmaz.
    try {
      const uid = auth.currentUser?.uid;
      if (uid && selectedMatch.creatorId === uid) {
        const { error: finErr } = await supabase.rpc('finalize_match', { p_match_id: selectedMatch.id });
        if (finErr) throw finErr;
      }
    } catch (err) {
      console.warn('[PostMatchEval] Maç sonlandırılamadı (cron devralır):', err);
    }

    // SAHA PUANI + SAHA NOTU: yıldız submit_pitch_rating ile kaydedilir; BULGU-097
    // gereği not da aynı çağrıda p_comment ile gider. Not yalnız yıldızla birlikte
    // gönderilir: p_score 1..5 zorunlu olduğu için yıldızsız not sahaya sahte
    // 1 yıldız yazardı. Bağımsız try/catch: saha düşse de oyuncu/servis etkilenmez.
    if (pitchRating > 0) {
      try {
        const { error: prErr } = await supabase.rpc('submit_pitch_rating', {
          p_match_id: selectedMatch.id,
          p_score: Math.max(1, Math.min(5, Math.round(pitchRating))),
          p_comment: orgComment.trim() || null,
        });
        if (prErr) throw prErr;
      } catch (e) {
        console.warn('[PostMatchEval] Saha puanı kaydedilemedi:', e);
        failed.push('Saha puanın');
      }
    }

    // FAZ 5: Kaleci/Hakem 1-10 puanlaması — sağlayıcı rating'ini günceller + payout serbest.
    // Atlanabilir: yalnız puan girilmiş (score > 0) sağlayıcılar gönderilir.
    // Oyuncu-değerlendirme başarısız olsa bile burası bağımsız çalışır.
    for (const p of providers) {
      const score = serviceScores[p.id] ?? 0;
      if (score <= 0) continue;
      try {
        await submitServiceRating(selectedMatch.id, p.id, p.type, score, serviceComments[p.id]?.trim() || undefined);
      } catch (e) {
        console.warn(`[PostMatchEval] ${p.type} puanlaması kaydedilemedi:`, e);
        failed.push(p.type === 'GK' ? 'Kaleci puanın' : 'Hakem puanın');
      }
    }

    // F1.1c: Kaptan değerlendirmeyi gönderdiğinde, bekleyen hizmet taleplerinin
    // kaptan onayı da işlenir (iki-taraflı payout kapısının kaptan ayağı —
    // ayrı butona gerek kalmadan "değerlendirme = katılım kanıtı" prensibi).
    // Sunucu yetkiyi ayrıca doğrular (_hire_side_for); hata payout'u bloklamaz.
    try {
      const uid2 = auth.currentUser?.uid;
      if (uid2 && selectedMatch.creatorId === uid2) {
        const reqs = await getMatchServiceRequests(selectedMatch.id);
        for (const r of reqs) {
          if (r.status === 'CAPTURED' && !r.captainConfirmed && !r.payoutReleased) {
            try { await captainConfirmService(r.id); }
            catch (e) { console.warn('[PostMatchEval] kaptan hizmet onayı kaydedilemedi:', e); }
          }
        }
      }
    } catch (e) {
      console.warn('[PostMatchEval] hizmet onayı adımı atlandı:', e);
    }
    // İki kaleci varsa aynı etiket iki kez düşmesin.
    setSaveErrors(Array.from(new Set(failed)));
    setSubmitting(false);
    setShowResult(true);
  };

  // Sparkle burst coordinates
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number; delay: number }[]>([]);

  const setPlayerRating = (pid: string, val: number, e: React.MouseEvent) => {
    if (navigator.vibrate) navigator.vibrate(20);
    setPlayerRatings(prev => ({ ...prev, [pid]: val }));
    triggerSparkles(e);
  };

  const triggerSparkles = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newSparkles = Array.from({ length: 6 }).map((_, i) => ({
      id: Math.random() + i,
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      delay: i * 0.04
    }));
    
    setSparkles(prev => [...prev, ...newSparkles]);
    
    setTimeout(() => {
      setSparkles(prev => prev.filter(s => !newSparkles.some(n => n.id === s.id)));
    }, 1200);
  };

  const ratingValues: number[] = Object.values(playerRatings) as number[];
  const avgPlayerRating = ratingValues.length > 0
    ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1)
    : '—';

  const getTierBadgeClass = (tier: string) => {
    if (tier === 'gold') return 'bg-gradient-to-br from-[#ffe082] to-[#ffb300] text-black border border-[#ffb300] shadow-[0_0_12px_rgba(255,179,0,0.35)]';
    if (tier === 'silver') return 'bg-gradient-to-br from-[#e0e0e0] to-[#9e9e9e] text-black border border-[#9e9e9e] shadow-[0_0_10px_rgba(200,200,200,0.15)]';
    return 'bg-gradient-to-br from-[#bcaaa4] to-[#8d6e63] text-white border border-[#8d6e63]';
  };

  if (showResult) {
    return (
      <div className="fixed inset-0 bg-[#0A0E14] text-white font-sans flex flex-col items-center justify-center p-6 z-50 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-[#FACC15]/4 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-[300px] h-[300px] bg-[#39FF14]/4 rounded-full blur-3xl pointer-events-none" />

        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }} 
          transition={{ type: 'spring', damping: 20, stiffness: 150 }}
          className="flex flex-col items-center gap-6 w-full max-w-sm relative z-10"
        >
          {/* Kısmi hatada kutlama rozeti gösterilmez — ekran ne olduğunu dürüstçe anlatır. */}
          {saveErrors.length === 0 ? (
            <motion.div
              animate={{
                rotate: [0, -10, 10, -10, 0],
                scale: [1, 1.05, 1]
              }}
              transition={{ duration: 0.8, ease: "easeInOut", repeat: 0, delay: 0.2 }}
              className="w-24 h-24 rounded-full bg-gradient-to-br from-[#FACC15] to-amber-500 flex items-center justify-center shadow-[0_0_50px_rgba(250,204,21,0.5)] border border-[#FACC15]/40"
            >
              <Trophy size={42} className="text-black" />
            </motion.div>
          ) : (
            <div className="w-24 h-24 rounded-full bg-[rgba(248,113,113,0.12)] border border-[rgba(248,113,113,0.35)] flex items-center justify-center">
              <AlertTriangle size={42} className="text-[#F87171]" />
            </div>
          )}

          {/* BULGU-097: "başarıyla yüklendi" artık koşulsuz değil; ne kaydedilemediyse adıyla yazılır. */}
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-extrabold uppercase tracking-tighter italic leading-none">
              {saveErrors.length === 0 ? 'DEĞERLENDİRMEN KAYDEDİLDİ' : 'DEĞERLENDİRME YARIM KALDI'}
            </h2>
            <p className="text-[0.8125rem] font-semibold text-[#A9B4C0]">
              {saveErrors.length === 0
                ? 'Puanların kaydedildi.'
                : `Şunlar kaydedilemedi: ${saveErrors.join(', ')}.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="bg-[#121620]/50 border border-white/5 rounded-2xl p-4 text-center flex flex-col justify-center">
              <p className="text-[0.75rem] text-[#8B949E] font-bold mb-1.5">Puanladığın oyuncu</p>
              <p className="text-xl font-extrabold text-white italic tracking-tighter leading-none">{Object.keys(playerRatings).length}</p>
            </div>
            <div className="bg-[#121620]/50 border border-white/5 rounded-2xl p-4 text-center flex flex-col justify-center">
              <p className="text-[0.75rem] text-[#8B949E] font-bold mb-1.5">Ortalama puanın</p>
              <p className="text-xl font-extrabold text-[#39FF14] italic tracking-tighter leading-none">{avgPlayerRating}</p>
            </div>
          </div>

          {/* Tekrar güvenli: tüm yazma yolları upsert (ON CONFLICT DO UPDATE). */}
          {saveErrors.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => { setShowResult(false); persistEvaluation(); }}
              className="w-full h-14 bg-white/5 border border-white/10 text-white font-extrabold rounded-2xl text-xs uppercase tracking-widest"
            >
              Tekrar dene
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onComplete}
            className="w-full h-14 bg-[#39FF14] text-[#0A0E14] font-bold rounded-2xl text-[0.9375rem] shadow-[0_0_30px_rgba(57,255,20,0.25)] hover:shadow-[0_0_40px_rgba(57,255,20,0.4)] active:scale-95 transition-all"
          >
            Maçlarıma dön
          </motion.button>
        </motion.div>
      </div>
    );
  }

  if (showHandshake) {
    return (
      <div className="fixed inset-0 bg-[#0A0E14] text-white font-sans flex flex-col items-center justify-center p-6 z-50 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />

        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }} 
          animate={{ scale: 1, opacity: 1, y: 0 }} 
          className="bg-[#121620]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 w-full max-w-sm relative z-10 flex flex-col items-center text-center shadow-2xl"
        >
          <div className="w-16 h-16 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center mb-4">
            <Trophy size={32} className="text-blue-400" />
          </div>
          <h2 className="text-2xl font-extrabold uppercase italic tracking-tight text-white mb-2">SKOR ONAYI</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-6">Maç Skoru Girildi — Onayla</p>

          <div className="flex items-center justify-center gap-6 mb-8 w-full">
            <div className="text-center flex-1">
              <span className="text-[0.75rem] text-[#8B949E] font-bold uppercase block mb-2">EV</span>
              <div className="text-5xl font-extrabold text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{scoreProposal?.homeScore ?? 0}</div>
            </div>
            <div className="text-3xl font-extrabold text-ink-4">-</div>
            <div className="text-center flex-1">
              <span className="text-[0.75rem] text-[#8B949E] font-bold uppercase block mb-2">DEP</span>
              <div className="text-5xl font-extrabold text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{scoreProposal?.awayScore ?? 0}</div>
            </div>
          </div>

          <div className="w-full space-y-3">
            <motion.button
              whileTap={{ scale: 0.96 }}
              disabled={approvingScore}
              onClick={handleApproveScore}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-500 text-white font-extrabold text-sm rounded-2xl uppercase tracking-widest shadow-[0_0_20px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <ShieldCheck size={18} /> {approvingScore ? 'ONAYLANIYOR…' : 'SKORU ONAYLA'}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                // Prensipler §3.4: skor itirazı ayrı bir özellik değil; sorunlar
                // admin'e "Sorun Bildir" ile gider. Eskiden sahte "iletildi" toast'ı
                // vardı (hiçbir kayıt/RPC yok) — gerçek kanalı söyle.
                showInfo('Hakemin girdiği skor resmîdir. İtirazın varsa maç detayından "Sorun Bildir"i kullan.');
                setShowHandshake(false);
              }}
              className="w-full py-4 bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 font-extrabold text-xs rounded-2xl uppercase tracking-widest transition-all"
            >
              KATILMIYORUM
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0A0E14] text-white font-sans flex flex-col overflow-hidden select-none">
      {infoToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[999] bg-blue-900/90 border border-blue-500/40 text-blue-200 text-[0.6875rem] font-bold px-4 py-2 rounded-xl shadow-xl backdrop-blur-sm">
          {infoToast}
        </div>
      )}
      {/* ── HEADER (Glassmorphic & safe area top) ── */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#0E131F]/80 backdrop-blur-xl border-b border-white/5 pb-4 pt-safe px-5">
        <div className="flex items-center justify-between pt-3 mb-3">
          <button onClick={onBack} className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all shadow-md">
            <ArrowLeft size={20} className="text-white" />
          </button>
          
          <div className="text-center flex-1 mx-4">
            <h1 className="text-sm font-extrabold uppercase tracking-[0.2em] italic text-white truncate leading-[1.2]">MAÇ DEĞERLENDİRME</h1>
            {/* BULGU-101: hangi maçın puanlandığı sabit metinden değil, maçın kendisinden okunur. */}
            {selectedMatch && (
              <p className="text-[0.75rem] font-bold text-[#8B949E] truncate mt-1">
                {[
                  selectedMatch.courtName || selectedMatch.pitchName || selectedMatch.location,
                  [selectedMatch.date, selectedMatch.time].filter(Boolean).join(' '),
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="w-11 h-11 bg-white/5 border border-white/10 rounded-full flex items-center justify-center">
            <span className="text-[0.6875rem] font-extrabold text-white/50">{step}/2</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-1.5 px-1">
          {[1,2].map(s => (
            <div key={s} className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: step >= s ? '100%' : '0%' }} 
                transition={{ duration: 0.4 }}
                className="h-full rounded-full bg-gradient-to-r from-[#39FF14] to-emerald-400" 
              />
            </div>
          ))}
        </div>
      </header>

      {/* ── CONTENT AREA ── */}
      <div className="flex-1 overflow-y-auto pt-32 pb-12 px-5 custom-scrollbar">
        <AnimatePresence mode="wait">

          {/* ─ ADIM 1: OYUNCU PUANLARI — kart kart hızlı puanla ─ */}
          {step === 1 && (() => {
            // G2: gerçek maçta değerlendirilecek katılımcı yoksa boş-durum +
            // devam (mock oyuncu göstermek yerine dürüst atlama).
            if (PLAYERS.length === 0) {
              return (
                <motion.div key="s1-empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
                    <Users size={28} className="text-[#8B949E]" />
                  </div>
                  <p className="text-[0.9375rem] leading-[22px] font-medium text-[#A9B4C0] max-w-xs mx-auto">
                    Bu maçta puanlayacağın başka oyuncu yok. Saha ve görevli puanına geçebilirsin.
                  </p>
                  <button onClick={() => setStep(2)}
                    className="px-6 py-3 rounded-2xl bg-[#39FF14] text-[#0A0E14] font-bold text-[0.9375rem] active:scale-95 transition-all">
                    Devam et
                  </button>
                </motion.div>
              );
            }
            const p = PLAYERS[playerCardIdx];
            if (!p) return null;
            const currentRating = playerRatings[p.id] ?? 0;
            const isLast = playerCardIdx === PLAYERS.length - 1;
            const advanceCard = () => {
              if (isLast) setStep(2);
              else { setPlayerCardIdx(i => i + 1); if (navigator.vibrate) navigator.vibrate(12); }
            };
            return (
              <motion.div
                key={`s1-${playerCardIdx}`}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="space-y-5"
              >
                {/* BULGU-106: puanlamanın anonim olduğu sözü ekranda verilir (RLS ile de karşılanır). */}
                <p className="text-[0.75rem] font-medium text-[#8B949E] leading-[16px]">
                  Puanların gizli. Kimin kaç yıldız verdiği hiç kimseye gösterilmez.
                </p>

                {/* Progress */}
                <div className="flex items-center gap-3">
                  {/* Artık geri gidilecek bir adım yok; ekrandan çıkış üstteki ok ile yapılır. */}
                  <button onClick={() => setPlayerCardIdx(i => Math.max(0, i - 1))}
                    disabled={playerCardIdx === 0}
                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#A9B4C0] active:scale-95 transition-all disabled:opacity-30">
                    ←
                  </button>
                  <div className="flex-1 flex gap-1">
                    {PLAYERS.map((_, i) => (
                      <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i < playerCardIdx ? 'bg-[#39FF14]' : i === playerCardIdx ? 'bg-[#FACC15]' : 'bg-white/10'}`} />
                    ))}
                  </div>
                  <span className="text-[0.75rem] font-bold text-[#8B949E]">{playerCardIdx + 1}/{PLAYERS.length}</span>
                </div>

                {/* Player card */}
                <div className="rounded-[32px] border p-7 flex flex-col gap-6 relative overflow-hidden transition-all bg-[#121620]/70 border-white/8">
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-500/6 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-base border ${getTierBadgeClass(p.tier)}`}>
                      {p.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-extrabold text-white uppercase tracking-tight italic">{p.name}</p>
                      <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[0.625rem] font-extrabold text-gray-400 tracking-wider uppercase">{p.pos}</span>
                    </div>
                  </div>

                  {/* Stars */}
                  <div className="flex gap-3 justify-center relative overflow-visible">
                    {[1,2,3,4,5].map(s => (
                      <motion.button key={s} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.85 }}
                        onClick={(e) => setPlayerRating(p.id, s, e)} className="p-1 relative overflow-visible">
                        <Star size={34} className={`transition-all duration-200 ${s <= currentRating ? 'text-[#FACC15] fill-[#FACC15] drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]' : 'text-gray-800 hover:text-ink-4'}`} />
                      </motion.button>
                    ))}
                    <div className="absolute inset-0 pointer-events-none overflow-visible">
                      {sparkles.map(s => <Sparkle key={s.id} x={s.x} y={s.y} delay={s.delay} />)}
                    </div>
                  </div>
                  {currentRating > 0 && (
                    <p className="text-center text-[0.625rem] font-extrabold uppercase tracking-widest text-[#FACC15]/70 -mt-3">
                      {currentRating === 5 ? 'Mükemmel' : currentRating >= 4 ? 'Çok İyi' : currentRating >= 3 ? 'İyi' : currentRating >= 2 ? 'Orta' : 'Zayıf'}
                    </p>
                  )}

                  {/* BULGU-096: centilmenlik oyuncu başına. Seçim yapılmazsa nötr 3 gider. */}
                  <div className="space-y-2">
                    <span className="block text-[0.8125rem] font-semibold text-[#8B949E]">Centilmenlik</span>
                    <div className="grid grid-cols-3 gap-2">
                      {FAIR_PLAY_CHOICES.map(c => {
                        const active = playerFairPlay[p.id] === c.value;
                        const tone = c.value === 5
                          ? 'bg-[rgba(57,255,20,0.12)] border-[rgba(57,255,20,0.35)] text-[#39FF14]'
                          : c.value === 1
                            ? 'bg-[rgba(248,113,113,0.12)] border-[rgba(248,113,113,0.35)] text-[#F87171]'
                            : 'bg-white/10 border-white/25 text-white';
                        return (
                          <button
                            key={c.value}
                            type="button"
                            aria-pressed={active}
                            disabled={currentRating === 0}
                            onClick={() => {
                              if (navigator.vibrate) navigator.vibrate(15);
                              setPlayerFairPlay(prev => ({ ...prev, [p.id]: c.value }));
                            }}
                            className={`h-11 rounded-2xl border text-[0.8125rem] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-40 ${
                              active ? tone : 'bg-black/30 border-white/8 text-[#8B949E]'
                            }`}
                          >
                            {active && c.value === 5 && <CheckCircle2 size={14} />}
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                    {/* Centilmenlik yalnız yıldızla birlikte gönderiliyor; yıldızsız seçim
                        sessizce kaybolmasın diye kapalı tutulur. */}
                    {currentRating === 0 && (
                      <p className="text-[0.75rem] font-medium text-[#8B949E]">Centilmenlik notu için önce yıldız ver.</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={advanceCard}
                    className="w-14 h-14 bg-white/5 border border-white/10 text-gray-400 rounded-2xl text-[0.6875rem] font-extrabold uppercase flex items-center justify-center hover:bg-white/8 transition-all">
                    Atla
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.98 }} onClick={advanceCard}
                    disabled={currentRating === 0}
                    className={`flex-1 h-14 font-extrabold rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${currentRating > 0 ? 'bg-gradient-to-r from-[#39FF14] to-emerald-400 text-black shadow-[0_0_20px_rgba(57,255,20,0.2)]' : 'bg-white/5 border border-white/10 text-[#8B949E]'}`}>
                    {isLast ? 'TAMAMLA →' : 'SONRAKI →'}
                  </motion.button>
                </div>
              </motion.div>
            );
          })()}

          {/* ─ ADIM 2: SAHA VE GÖREVLİLER ─ */}
          {step === 2 && (
            <motion.div 
              key="s2" 
              initial={{ opacity: 0, x: 25 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: -25 }} 
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="space-y-6"
            >
              <div className="text-center py-4 bg-[#121620]/40 rounded-[32px] border border-white/5 p-5 relative overflow-hidden">
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3.5 shadow-[inset_0_2px_8px_rgba(16,185,129,0.15)]">
                  <Star size={26} className="text-emerald-400" />
                </div>
                <h2 className="text-base font-extrabold uppercase tracking-tight italic">Saha ve görevliler</h2>
                <p className="text-[0.8125rem] font-semibold text-[#8B949E] mt-1">Sahayı ve maça gelen görevlileri puanla</p>
              </div>

              {/* BULGU-097: 1-5 yıldızlı "HAKEM PERFORMANSI" kalktı — hiçbir yere yazılmıyordu.
                  Hakem puanı tek yerde, aşağıdaki ServiceRatingCard (1-10) ile toplanır. */}
              {[
                { label: 'Saha / zemin kalitesi', val: pitchRating, set: setPitchRating, icon: Droplets, color: 'text-[#39FF14]' },
              ].map(({ label, val, set, icon: Icon, color }) => (
                <div key={label} className="bg-[#121620]/50 border border-white/5 rounded-[24px] p-5 flex flex-col gap-3.5 relative overflow-visible">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.8125rem] font-semibold text-[#8B949E]">{label}</span>
                    <Icon size={16} className={color} />
                  </div>
                  <div className="flex gap-2 justify-center relative overflow-visible">
                    {[1,2,3,4,5].map(s => (
                      <motion.button 
                        key={s} 
                        whileHover={{ scale: 1.15 }} 
                        whileTap={{ scale: 0.9 }} 
                        onClick={(e) => {
                          if (navigator.vibrate) navigator.vibrate(20);
                          set(s);
                          triggerSparkles(e);
                        }}
                        className="p-1 relative overflow-visible"
                      >
                        <Star 
                          size={28} 
                          className={`transition-colors ${
                            s <= val 
                              ? 'text-[#39FF14] fill-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]' 
                              : 'text-gray-800 hover:text-ink-4'
                          }`} 
                        />
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Saha notu: yıldızla aynı çağrıda (submit_pitch_rating p_comment) gider,
                  bu yüzden saha kartının hemen altında ve yıldıza bağlı. */}
              <div className="bg-[#121620]/50 border border-white/5 rounded-[24px] p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-[#8B949E]" />
                  <span className="text-[0.8125rem] font-semibold text-[#8B949E]">Saha hakkında not (isteğe bağlı)</span>
                </div>
                <textarea
                  value={orgComment}
                  onChange={(e) => setOrgComment(e.target.value)}
                  maxLength={500}
                  disabled={pitchRating === 0}
                  className="w-full bg-black/40 border border-white/8 rounded-2xl p-4 text-[0.9375rem] leading-[22px] text-white focus:outline-none focus:border-[#39FF14]/50 min-h-[96px] resize-none placeholder-[#8B949E] font-normal disabled:opacity-50 transition-all"
                  placeholder="Zemin, soyunma odası, ışık… sahayla ilgili notun"
                />
                {pitchRating === 0 && (
                  <p className="text-[0.75rem] font-medium text-[#8B949E]">Not bırakmak için önce sahaya yıldız ver.</p>
                )}
              </div>

              {/* Sparkle burst layer */}
              <div className="absolute inset-0 pointer-events-none overflow-visible">
                {sparkles.map(s => (
                  <Sparkle key={s.id} x={s.x} y={s.y} delay={s.delay} />
                ))}
              </div>

              {/* FAZ 5: Atanmış Kaleci / Hakem 1-10 değerlendirmesi (varsa, atlanabilir) */}
              {providers.length > 0 && (
                <div className="space-y-3">
                  <span className="text-[0.8125rem] font-semibold text-[#8B949E] block ml-1">
                    Görevli puanı (isteğe bağlı)
                  </span>
                  {providers.map(p => (
                    <ServiceRatingCard
                      key={p.id}
                      info={p}
                      score={serviceScores[p.id] ?? 0}
                      comment={serviceComments[p.id] ?? ''}
                      onScore={(val) => setServiceScores(prev => ({ ...prev, [p.id]: val }))}
                      onComment={(val) => setServiceComments(prev => ({ ...prev, [p.id]: val }))}
                    />
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <motion.button 
                  whileTap={{ scale: 0.98 }} 
                  onClick={() => setStep(1)}
                  className="flex-1 h-14 bg-white/5 border border-white/10 text-white font-extrabold rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center hover:bg-white/10"
                >
                  ← GERİ
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={persistEvaluation}
                  disabled={submitting}
                  className="flex-[2] h-14 bg-gradient-to-r from-emerald-600 to-[#39FF14] text-[#0A0E14] font-bold rounded-2xl text-[0.9375rem] flex items-center justify-center shadow-[0_0_20px_rgba(57,255,20,0.2)] hover:shadow-[0_0_30px_rgba(57,255,20,0.3)] transition-all disabled:opacity-60"
                >
                  {submitting ? 'Gönderiliyor…' : 'Değerlendirmeyi gönder'}
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
