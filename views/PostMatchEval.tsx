import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Star, Layers, Scale, ShieldCheck, Check, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { submitServiceRating, getMatchServiceRequests, captainConfirmService } from '../services/serviceRequestService';
import type { PositionSlot } from '../types';
import { trInitials } from '../utils/trUpper';

// ═══════════════════════════════════════════════════════════════════════════
// MAÇ SONU DEĞERLENDİRME — 2 ekran + onay (onaylanan tasarım: varyant 1a)
//
// Akış:  1) KENDİ TAKIMIN — her oyuncuya tek dokunuşla/sürükleyerek 1–10 yıldız
//        2) TESİS & GÖREVLİLER — tesis 5 yıldız, hakem ve kaleci 10 puan
//        3) ONAY — ne kaydedildiğini dürüstçe anlatan kapanış
//
// Tasarım kararıyla akıştan ÇIKANLAR (bilinçli):
//   • Serbest not alanları (oyuncu / tesis / görevli yorumu)
//   • Skor onayı (el sıkışma) — skor teklifi/onayı takım maçı akışında
//     (views/social/TeamDetailView) yaşamaya devam eder
//   • Oyuncu başına centilmenlik seçimi — sunucu tarafında nötr (3) kaydedilir;
//     reliability_score'u BESLEMEDİĞİ doğrulandı (yalnız geç-ayrılma yaptırımı
//     yazıyor), yani ceza/güvenilirlik mekaniği bu kaldırmadan etkilenmez.
//
// Puan ölçekleri sunucu sözleşmesiyle birebir:
//   submit_match_evaluation → player_ratings.skill_score CHECK (1..10)
//   submit_pitch_rating     → p_score 1..5
//   submit_service_rating   → p_score 1..10  (sağlayıcı payout kapısı)
// ═══════════════════════════════════════════════════════════════════════════

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

interface EvalPlayer { id: string; name: string; pos: string; initials: string }

const MOCK_PLAYERS: EvalPlayer[] = [
  { id: 'p1', name: 'Burak Şen', pos: 'KL', initials: 'BŞ' },
  { id: 'p2', name: 'Emre Duran', pos: 'SAV', initials: 'ED' },
  { id: 'p3', name: 'Serkan Taş', pos: 'SAV', initials: 'ST' },
  { id: 'p4', name: 'Caner Kılıç', pos: 'ORT', initials: 'CK' },
  { id: 'p5', name: 'Mert Aksu', pos: 'ORT', initials: 'MA' },
  { id: 'p6', name: 'Onur Bulut', pos: 'ORT', initials: 'OB' },
  { id: 'p7', name: 'Ahmet Yıldız', pos: 'HÜC', initials: 'AY' },
];

// IP-13: baş harf üretimi tek kaynaktan — düz toUpperCase 'İ'yi 'I' yapardı.
const initialsOf = (name: string) => trInitials(name, 2);

const LBL10 = (v: number) =>
  v >= 10 ? 'EFSANE' : v >= 8 ? 'ÇOK İYİ' : v >= 6 ? 'İYİ' : v >= 4 ? 'ORTA' : v > 0 ? 'ZAYIF' : 'PUANLA';
const LBL5 = (v: number) =>
  v >= 5 ? 'MÜKEMMEL' : v >= 4 ? 'ÇOK İYİ' : v >= 3 ? 'İYİ' : v >= 2 ? 'ORTA' : v > 0 ? 'ZAYIF' : 'PUANLA';

const MONO = "'Space Grotesk', ui-monospace, monospace";

/**
 * Tek hareketle puanlama şeridi: dokun ya da sürükle. Aynı değere tekrar
 * dokunmak puanı sıfırlar (tasarımdaki toggle davranışı). Sürüklerken sıfırlama
 * tetiklenmez — parmak gezdirirken puan sürekli güncellenir.
 */
function useSweepPick(value: number, max: number, onPick: (v: number) => void) {
  const moved = useRef(false);
  const startVal = useRef(0);

  const valueAt = (el: HTMLElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return Math.max(1, Math.min(max, Math.ceil((clientX - r.left) / r.width * max)));
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    moved.current = false;
    startVal.current = value;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const v = valueAt(e.currentTarget, e.clientX);
    if (v !== value) onPick(v);
    // Titreşim uygulamadan tamamen kaldırıldı (kullanıcı kararı) — sürme
    // geri bildirimi görsel: yıldızlar dolar, sağdaki rakam ve etiket değişir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, max, onPick]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    // Parmak gezdirildiği AN sürükleme sayılır — değer aynı kalsa bile. Aksi
    // halde sürükleyip başlangıç değerine dönmek "dokunma" gibi okunur ve
    // parmak kaldırılınca puan sessizce sıfırlanır.
    moved.current = true;
    const v = valueAt(e.currentTarget, e.clientX);
    if (v !== value) onPick(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, max, onPick]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    // Dokunma (sürükleme değil) + zaten aynı değerdeydi → temizle.
    if (!moved.current && startVal.current !== 0 && startVal.current === valueAt(e.currentTarget, e.clientX)) {
      onPick(0);
    }
    moved.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max, onPick]);

  return { onPointerDown, onPointerMove, onPointerUp };
}

/** Yıldız şeridi — `max` yıldız, dolu kısım soldan kırpılır. */
const StarStrip: React.FC<{
  value: number; max: number; size: number; height: number; onPick: (v: number) => void;
}> = ({ value, max, size, height, onPick }) => {
  const handlers = useSweepPick(value, max, onPick);
  const row = (filled: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', height, width: '100%' }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Star
            size={size}
            strokeWidth={1.5}
            style={filled ? { filter: 'drop-shadow(0 0 6px rgba(250,204,21,0.35))' } : undefined}
            color={filled ? '#FACC15' : 'rgba(255,255,255,0.13)'}
            fill={filled ? '#FACC15' : 'none'}
          />
        </div>
      ))}
    </div>
  );
  return (
    <div
      {...handlers}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      // 'pan-y': yıldızlar üzerinde YANA sürükleme puan seçer, YUKARI sürükleme
      // sayfayı kaydırır (puanlama ekranı uzun bir listedir).
      style={{ position: 'relative', height, cursor: 'pointer', touchAction: 'pan-y', userSelect: 'none' }}
    >
      {row(false)}
      {/* Dolu katman TAM genişlikte durur ve clipPath ile soldan açılır — böylece
          yıldızlar boş katmanla birebir hizalı kalır (dar kutuya sığdırma yok). */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height,
          pointerEvents: 'none',
          clipPath: `inset(0 ${(1 - value / max) * 100}% 0 0)`,
          transition: 'clip-path 0.12s ease',
        }}
      >
        {row(true)}
      </div>
    </div>
  );
};

/** 10 parçalı puan çubuğu (hakem / kaleci) — altında 1..10 sayı şeridi. */
const SegmentBar: React.FC<{
  value: number; max: number; color: string; onPick: (v: number) => void;
}> = ({ value, max, color, onPick }) => {
  const handlers = useSweepPick(value, max, onPick);
  return (
    <div>
      <div
        {...handlers}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        // 'pan-y': çubuk üzerinde YANA sürükleme puan seçer, YUKARI sürükleme
        // sayfayı kaydırır.
        style={{ display: 'flex', gap: 8, height: 30, cursor: 'pointer', touchAction: 'pan-y', userSelect: 'none' }}
      >
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1, borderRadius: 8,
              background: i < value ? color : 'rgba(255,255,255,0.05)',
              transition: 'background 0.12s ease',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {Array.from({ length: max }).map((_, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#8B949E' }}>{i + 1}</span>
        ))}
      </div>
    </div>
  );
};

const CARD: React.CSSProperties = {
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(22,27,34,0.72)',
  padding: '16px 14px 18px',
};

const PostMatchEval: React.FC<PostMatchEvalProps> = ({ onBack, onComplete }) => {
  const { selectedMatch } = useAppStore();
  // Gerçek (UUID) maç mı? Mock/demo yollarını tek yerden kapılar.
  const isRealMatch = !!selectedMatch?.id && /^[0-9a-f-]{36}$/i.test(selectedMatch.id);

  /**
   * Kullanıcının OYNADIĞI taraf. Tasarım "KENDİ TAKIMIN" diyor: yalnız kendi
   * takım arkadaşlarını puanlarsın. Taraf çözülemezse (ör. kadroda yer almayan
   * kurucu) tüm kadroya düşer ve başlık "KADRO" olur — sahte takım uydurulmaz.
   */
  const mySide = useMemo<'home' | 'away' | null>(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !selectedMatch) return null;
    const isMine = (s: PositionSlot) => s.occupant === uid || s.player?.id === uid;
    if ((selectedMatch.slots ?? []).some(isMine)) return 'home';
    if ((selectedMatch.awaySlots ?? []).some(isMine)) return 'away';
    return null;
  }, [selectedMatch]);

  const PLAYERS = useMemo<EvalPlayer[]>(() => {
    if (!selectedMatch) return MOCK_PLAYERS;
    const uid = auth.currentUser?.uid;
    const source: PositionSlot[] =
      mySide === 'home' ? (selectedMatch.slots ?? [])
        : mySide === 'away' ? (selectedMatch.awaySlots ?? [])
          : [...(selectedMatch.slots ?? []), ...(selectedMatch.awaySlots ?? [])];

    const real = source
      .filter(s => s.status === 'TAKEN' && s.player && s.player.id !== uid)
      .map((s): EvalPlayer => ({
        id: s.player!.id,
        name: s.player!.name,
        pos: s.player!.position || s.role || '—',
        initials: initialsOf(s.player!.name),
      }));
    if (real.length > 0) return real;
    return isRealMatch ? [] : MOCK_PLAYERS;
  }, [selectedMatch, isRealMatch, mySide]);

  const [step, setStep] = useState<1 | 2>(1);
  const [showResult, setShowResult] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  // Sonuç ekranı YALNIZ gerçekten kaydedileni anlatır; kaydedilemeyenler adıyla.
  const [saveErrors, setSaveErrors] = useState<string[]>([]);

  const [playerRatings, setPlayerRatings] = useState<Record<string, number>>({});
  const [pitchRating, setPitchRating] = useState(0);
  const [providers, setProviders] = useState<ServiceProviderInfo[]>([]);
  const [serviceScores, setServiceScores] = useState<Record<string, number>>({});

  const pitchName = (selectedMatch as { pitchName?: string; location?: string } | null)?.pitchName
    || selectedMatch?.location
    || 'Tesis';

  // Atanmış sağlayıcılar. "Kendi takımın" çerçevesiyle tutarlı: kendi tarafının
  // kalecisi + maçın hakemi. Taraf çözülemezse iki kaleci de listelenir.
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
      const wantHomeGk = mySide !== 'away';
      const wantAwayGk = mySide !== 'home';
      if (selectedMatch.gkId && wantHomeGk) {
        tasks.push(fetchProvider('goalkeepers', selectedMatch.gkId, 'GK', 'Kaleci'));
      }
      if (selectedMatch.awayGkId && wantAwayGk) {
        tasks.push(fetchProvider('goalkeepers', selectedMatch.awayGkId, 'GK', 'Deplasman Kalecisi'));
      }
      if (selectedMatch.refereeId) {
        tasks.push(fetchProvider('referees', selectedMatch.refereeId, 'REF', 'Hakem'));
      }
      const results = await Promise.all(tasks);
      if (!cancelled) setProviders(results);
    };

    loadProviders();
    return () => { cancelled = true; };
  }, [selectedMatch, mySide]);

  const showInfo = (msg: string) => {
    setInfoToast(msg);
    setTimeout(() => setInfoToast(null), 3500);
  };

  const rated = useMemo(() => Object.values(playerRatings).filter(v => v > 0), [playerRatings]);
  const avgLabel = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1) : '—';

  const summaryText = useMemo(() => {
    const extra: string[] = [];
    if (pitchRating > 0) extra.push('tesis');
    if (providers.some(p => p.type === 'REF' && (serviceScores[p.id] ?? 0) > 0)) extra.push('hakem');
    if (providers.some(p => p.type === 'GK' && (serviceScores[p.id] ?? 0) > 0)) extra.push('kaleci');
    const head = rated.length > 0 ? `${rated.length} oyuncu` : 'Oyuncu puanı yok';
    return extra.length ? `${head} · ${extra.join(' · ')} puanlandı.` : `${head} puanlandı.`;
  }, [rated.length, pitchRating, providers, serviceScores]);

  // ─── Kaydetme: her parça BAĞIMSIZ try/catch ──────────────────────────────
  // Oyuncu puanı düşse de servis puanlaması çalışmalı (sağlayıcı payout kapısı).
  const persistEvaluation = async () => {
    if (submitting) return;
    if (!isRealMatch) { setShowResult(true); return; }

    setSubmitting(true);
    setSaveErrors([]);
    const failed: string[] = [];

    try {
      // skill_score DOĞRUDAN 1–10: şerit zaten 10'luk. (Eski ekran 5 yıldızı
      // ×2 ile 10'a çeviriyordu; artık ara dönüşüm yok.)
      const ratings = Object.entries(playerRatings)
        .filter(([, v]) => (v as number) > 0)
        .map(([ratee_id, v]) => ({
          ratee_id,
          skill_score: Math.max(1, Math.min(10, Math.round(v as number))),
          // fair_play_score GÖNDERİLMEZ → sunucu nötr 3 yazar (RPC COALESCE).
        }));
      if (ratings.length > 0) {
        const { error } = await supabase.rpc('submit_match_evaluation', {
          p_match_id: selectedMatch!.id, p_ratings: ratings,
        });
        if (error) throw error;
      }
    } catch (err) {
      console.warn('[PostMatchEval] Oyuncu değerlendirmesi kaydedilemedi:', err);
      const em = String((err as any)?.message || '');
      if (/already|zaten|duplicate/i.test(em)) {
        showInfo('Bu maçı zaten değerlendirdin.');
      } else {
        failed.push('Oyuncu puanların');
        showInfo('Oyuncu puanların kaydedilemedi. Tekrar dene.');
      }
    }

    // Yaşam döngüsü adımı (kullanıcı verisi değil) → hatası rapor edilmez, cron devralır.
    try {
      const uid = auth.currentUser?.uid;
      if (uid && selectedMatch!.creatorId === uid) {
        const { error } = await supabase.rpc('finalize_match', { p_match_id: selectedMatch!.id });
        if (error) throw error;
      }
    } catch (err) {
      console.warn('[PostMatchEval] Maç sonlandırılamadı (cron devralır):', err);
    }

    // Tesis puanı 1..5. Not alanı akıştan çıktı → p_comment null.
    if (pitchRating > 0) {
      try {
        const { error } = await supabase.rpc('submit_pitch_rating', {
          p_match_id: selectedMatch!.id,
          p_score: Math.max(1, Math.min(5, Math.round(pitchRating))),
          p_comment: null,
        });
        if (error) throw error;
      } catch (e) {
        console.warn('[PostMatchEval] Tesis puanı kaydedilemedi:', e);
        failed.push('Tesis puanın');
      }
    }

    // Kaleci/hakem 1..10 → sağlayıcı rating'i + payout serbest bırakma.
    for (const p of providers) {
      const score = serviceScores[p.id] ?? 0;
      if (score <= 0) continue;
      try {
        await submitServiceRating(selectedMatch!.id, p.id, p.type, score, undefined);
      } catch (e) {
        console.warn(`[PostMatchEval] ${p.type} puanlaması kaydedilemedi:`, e);
        failed.push(p.type === 'GK' ? 'Kaleci puanın' : 'Hakem puanın');
      }
    }

    // Kaptan onayı: "değerlendirme = katılım kanıtı" — payout'un kaptan ayağı.
    try {
      const uid = auth.currentUser?.uid;
      if (uid && selectedMatch!.creatorId === uid) {
        const reqs = await getMatchServiceRequests(selectedMatch!.id);
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

    setSaveErrors(Array.from(new Set(failed)));
    setSubmitting(false);
    setShowResult(true);
  };

  // ─── Ortak arka plan: tesis görseli + koyu gradyan (görsel yoksa düz koyu) ──
  const Backdrop: React.FC<{ hero?: boolean }> = ({ hero }) => (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {selectedMatch?.image && (
        <div
          style={{
            position: 'absolute', top: hero ? 0 : '-8%', left: '-20%', right: '-20%',
            height: hero ? '100%' : '66%',
            backgroundImage: `url(${selectedMatch.image})`,
            backgroundSize: 'cover', backgroundPosition: hero ? '50% 30%' : '50% 22%',
            opacity: hero ? 0.22 : 0.16,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: hero
            ? 'linear-gradient(180deg,rgba(10,14,20,0.62) 0%,rgba(10,14,20,0.80) 40%,rgba(10,14,20,0.96) 100%)'
            : 'linear-gradient(180deg,rgba(10,14,20,0.30) 0%,rgba(10,14,20,0.88) 34%,#0A0E14 62%)',
        }}
      />
    </div>
  );

  const Toast = () => infoToast ? (
    <div style={{
      position: 'absolute', left: 16, right: 16, bottom: 104, zIndex: 5,
      borderRadius: 14, padding: '11px 14px', fontSize: 12, fontWeight: 600, color: '#0A0E14',
      background: '#FACC15', boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    }}>{infoToast}</div>
  ) : null;

  // ═══ ONAY EKRANI ═══
  if (showResult) {
    const ok = saveErrors.length === 0;
    return (
      <div lang="tr" style={{ position: 'fixed', inset: 0, background: '#0A0E14', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 50 }}>
        <Backdrop hero />
        <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: '0 28px' }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 170 }}
            style={{
              width: 78, height: 78, borderRadius: 999,
              border: `1px solid ${ok ? 'rgba(250,204,21,0.45)' : 'rgba(248,113,113,0.35)'}`,
              background: ok ? 'rgba(250,204,21,0.10)' : 'rgba(248,113,113,0.12)',
              color: ok ? '#FACC15' : '#F87171',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: ok ? '0 0 40px rgba(250,204,21,0.14)' : 'none',
            }}
          >
            {ok ? <Check size={34} /> : <AlertTriangle size={34} />}
          </motion.div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 22, lineHeight: '26px', letterSpacing: '-0.02em', fontWeight: 800, fontStyle: 'italic', textTransform: 'uppercase' }}>
              {ok ? 'DEĞERLENDİRMEN KAYDEDİLDİ' : 'DEĞERLENDİRME YARIM KALDI'}
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: '18px', color: '#A9B4C0' }}>
              {ok ? summaryText : `${saveErrors.join(', ')} kaydedilemedi. Diğerleri kaydedildi.`}
            </p>
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 2, padding: '0 16px 46px' }}>
          <button
            type="button"
            onClick={onComplete}
            style={{
              width: '100%', height: 52, border: 'none', borderRadius: 16,
              background: '#39FF14', color: '#0A0E14', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 0 24px rgba(57,255,20,0.22)',
            }}
          >
            Ana ekrana dön
          </button>
        </div>
      </div>
    );
  }

  const headerTitle = step === 1
    ? (mySide ? 'KENDİ TAKIMIN' : 'KADRO')
    : 'TESİS VE GÖREVLİLER';

  return (
    <div lang="tr" style={{ position: 'fixed', inset: 0, background: '#0A0E14', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 50 }}>
      <Backdrop />

      {/* ═══ BAŞLIK ═══ */}
      <header style={{ position: 'relative', zIndex: 2, padding: '58px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => (step === 1 ? onBack() : setStep(1))}
            style={{
              width: 44, height: 44, flex: 'none', borderRadius: 999,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
            aria-label="Geri"
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 10, lineHeight: '12px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800, color: '#8B949E' }}>
              MAÇ DEĞERLENDİRME · {step}/2
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 16, lineHeight: '20px', letterSpacing: '-0.01em', fontWeight: 800, fontStyle: 'italic', textTransform: 'uppercase', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {headerTitle}
            </p>
          </div>
          {step === 1 && PLAYERS.length > 0 && (
            <div style={{ flex: 'none', textAlign: 'right' }}>
              <p style={{ margin: 0, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: 22, lineHeight: '22px', fontWeight: 600, color: '#FACC15' }}>
                {rated.length}<span style={{ color: '#8B949E', fontSize: 13 }}>/{PLAYERS.length}</span>
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 10, lineHeight: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 800, color: '#8B949E' }}>
                PUANLANDI
              </p>
            </div>
          )}
        </div>
      </header>

      {/* ═══ EKRAN 1 · KADRO ═══ */}
      {step === 1 && (
        <>
          <div style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 16px 20px' }}>
            {PLAYERS.length === 0 ? (
              <div style={{ ...CARD, textAlign: 'center', marginTop: 24 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff' }}>Puanlanacak takım arkadaşın yok</p>
                <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: '17px', color: '#8B949E' }}>
                  Bu maçın kadrosunda senden başka oyuncu görünmüyor. Tesis ve görevlileri yine puanlayabilirsin.
                </p>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 14px', fontSize: 11, lineHeight: '15px', color: '#8B949E' }}>
                  Puanların gizli. Kimin kaç yıldız verdiği kimseye gösterilmez.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {PLAYERS.map(p => {
                    const v = playerRatings[p.id] ?? 0;
                    return (
                      <div
                        key={p.id}
                        style={{
                          borderRadius: 18, padding: '12px 13px 14px',
                          border: `1px solid ${v ? 'rgba(250,204,21,0.30)' : 'rgba(255,255,255,0.07)'}`,
                          background: v ? 'rgba(250,204,21,0.05)' : 'rgba(255,255,255,0.02)',
                          transition: 'border-color 0.15s ease, background 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <div style={{
                            width: 36, height: 36, flex: 'none', borderRadius: 11,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 800, letterSpacing: '0.02em',
                            background: 'rgba(255,255,255,0.06)', color: '#C9D1D9',
                            border: '1px solid rgba(255,255,255,0.12)',
                          }}>{p.initials}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 14, lineHeight: '18px', fontWeight: 700, letterSpacing: '-0.01em', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                            <p style={{ margin: '1px 0 0', fontSize: 10, lineHeight: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 800, color: '#8B949E' }}>{p.pos}</p>
                          </div>
                          <p style={{ margin: 0, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: 20, lineHeight: '20px', fontWeight: 600, color: v ? '#FACC15' : 'rgba(255,255,255,0.22)', minWidth: 28, textAlign: 'right' }}>
                            {v ? String(v) : '—'}
                          </p>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <StarStrip
                            value={v}
                            max={10}
                            size={26}
                            height={28}
                            onPick={(nv) => setPlayerRatings(prev => ({ ...prev, [p.id]: nv }))}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ margin: '16px 2px 0', fontSize: 11, lineHeight: '15px', color: '#8B949E' }}>
                  Boş bıraktığın oyuncu gönderilmez. Kendini puanlayamazsın.
                </p>
              </>
            )}
          </div>

          <footer style={{ position: 'relative', zIndex: 2, padding: '12px 16px 40px', borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(10,14,20,0.86)', backdropFilter: 'blur(18px)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, lineHeight: '16px', fontWeight: 600, color: '#C9D1D9' }}>
                {rated.length}/{PLAYERS.length} oyuncu puanlandı
              </p>
              <p style={{ margin: '1px 0 0', fontSize: 11, lineHeight: '15px', color: '#8B949E' }}>
                Ortalaman <span style={{ fontFamily: MONO, color: '#FACC15' }}>{avgLabel}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                flex: 'none', height: 52, padding: '0 26px', border: 'none', borderRadius: 16,
                background: '#39FF14', color: '#0A0E14', fontSize: 15, fontWeight: 700,
                letterSpacing: '-0.01em', cursor: 'pointer', boxShadow: '0 0 24px rgba(57,255,20,0.22)',
              }}
            >
              Devam
            </button>
          </footer>
        </>
      )}

      {/* ═══ EKRAN 2 · TESİS & GÖREVLİLER ═══ */}
      {step === 2 && (
        <>
          <div style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* TESİS — 5 yıldız, tek genel puan */}
            <div style={{ ...CARD, flex: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 36, height: 36, flex: 'none', borderRadius: 11, background: 'rgba(57,255,20,0.10)', border: '1px solid rgba(57,255,20,0.35)', color: '#39FF14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={19} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 10, lineHeight: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: '#8B949E' }}>TESİS</p>
                  <p style={{ margin: '1px 0 0', fontSize: 15, lineHeight: '19px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pitchName}</p>
                </div>
                <p style={{ margin: 0, fontSize: 10, lineHeight: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 800, color: '#FACC15' }}>{LBL5(pitchRating)}</p>
              </div>
              <div style={{ marginTop: 12 }}>
                <StarStrip value={pitchRating} max={5} size={44} height={46} onPick={setPitchRating} />
              </div>
              <p style={{ margin: '8px 2px 0', fontSize: 11, lineHeight: '15px', color: '#8B949E' }}>
                Zemin, soyunma odası, ışık — tek genel puan.
              </p>
            </div>

            {/* GÖREVLİLER — hakem mavi, kaleci altın; 10 puan */}
            {providers.map(p => {
              const isGk = p.type === 'GK';
              const v = serviceScores[p.id] ?? 0;
              const color = isGk ? '#FACC15' : '#60A5FA';
              const tint = isGk ? 'rgba(250,204,21,0.12)' : 'rgba(96,165,250,0.12)';
              const line = isGk ? 'rgba(250,204,21,0.35)' : 'rgba(96,165,250,0.35)';
              return (
                <div key={p.id} style={{ ...CARD, flex: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 36, height: 36, flex: 'none', borderRadius: 11, background: tint, border: `1px solid ${line}`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {p.avatar
                        ? <img src={p.avatar} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : isGk ? <ShieldCheck size={19} /> : <Scale size={19} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 10, lineHeight: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: '#8B949E' }}>
                        {isGk ? 'KALECİ' : 'HAKEM'}
                      </p>
                      <p style={{ margin: '1px 0 0', fontSize: 15, lineHeight: '19px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                    </div>
                    <p style={{ margin: 0, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: 22, lineHeight: '22px', fontWeight: 600, color: v ? '#fff' : 'rgba(255,255,255,0.22)' }}>
                      {v ? String(v) : '—'}<span style={{ fontSize: 12, color: '#8B949E' }}>/10</span>
                    </p>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <SegmentBar
                      value={v}
                      max={10}
                      color={color}
                      onPick={(nv) => setServiceScores(prev => ({ ...prev, [p.id]: nv }))}
                    />
                  </div>
                </div>
              );
            })}

            <p style={{ margin: '2px 2px 0', fontSize: 11, lineHeight: '15px', color: '#8B949E' }}>
              Hepsi isteğe bağlı. Puan vermediğin başlık gönderilmez.
            </p>
          </div>

          <footer style={{ position: 'relative', zIndex: 2, padding: '12px 16px 40px', borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(10,14,20,0.86)', backdropFilter: 'blur(18px)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                flex: 'none', width: 52, height: 52, borderRadius: 16,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                color: '#A9B4C0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
              aria-label="Kadroya dön"
            >
              <ArrowLeft size={20} />
            </button>
            <button
              type="button"
              onClick={persistEvaluation}
              disabled={submitting}
              style={{
                flex: 1, height: 52, border: 'none', borderRadius: 16,
                background: '#39FF14', color: '#0A0E14', fontSize: 15, fontWeight: 700,
                letterSpacing: '-0.01em', cursor: submitting ? 'default' : 'pointer',
                opacity: submitting ? 0.6 : 1,
                boxShadow: '0 0 24px rgba(57,255,20,0.22)',
              }}
            >
              {submitting ? 'Gönderiliyor…' : 'Değerlendirmeyi gönder'}
            </button>
          </footer>
        </>
      )}

      <Toast />
    </div>
  );
};

export default PostMatchEval;
