/**
 * Maçlar (owner/müdür): tesiste kiralanan TÜM maçların gerçek listesi
 * (pitch_bookings.match_id → matches). Skoru olmayan maça sahibi/müdür
 * skor girer — QR akışıyla aynı sunucu yolu kullanılır
 * (get_or_create_match_score_token → submit_match_score).
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Minus, Plus, RefreshCw, Trophy } from 'lucide-react';
import { OwnerFullscreenModal } from './OwnerModalFrame';
import { useOwnerToast } from '../components/useOwnerToast';
import { supabase } from '../../../supabaseClient';
import {
  getPitchScoreMatches,
  getOrCreateScoreToken,
  toTurkishError,
  type OwnerScoreMatch,
} from '../../../services/pitchOwnerService';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Aktif', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  CONFIRMED: { label: 'Onaylı', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  COMPLETED: { label: 'Tamamlandı', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  FINISHED: { label: 'Bitti', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  CANCELLED: { label: 'İptal', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

const ScoreStepper: React.FC<{ value: number; onChange: (v: number) => void; label: string }> = ({ value, onChange, label }) => (
  <div className="flex-1 bg-[#0A0E14] border border-white/10 rounded-2xl p-3 text-center">
    <p className="text-[9px] font-black uppercase tracking-wider text-gray-500 truncate">{label}</p>
    <div className="flex items-center justify-center gap-3 mt-2">
      <button
        type="button"
        aria-label={`${label} skorunu azalt`}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-11 h-11 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 active:scale-95 transition-transform"
      >
        <Minus size={16} />
      </button>
      <span className="text-2xl font-black text-white font-mono w-8 tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`${label} skorunu artır`}
        onClick={() => onChange(Math.min(99, value + 1))}
        className="w-11 h-11 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 active:scale-95 transition-transform"
      >
        <Plus size={16} />
      </button>
    </div>
  </div>
);

export const OwnerMatchesModal: React.FC<{
  pitchId: string;
  readOnly?: boolean;
  onClose: () => void;
}> = ({ pitchId, readOnly = false, onClose }) => {
  const notify = useOwnerToast();
  const [matches, setMatches] = useState<OwnerScoreMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'PENDING'>('ALL');
  const [scoreEntryId, setScoreEntryId] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const load = React.useCallback(async () => {
    if (!pitchId) { setMatches([]); setLoading(false); return; }
    setLoading(true);
    try {
      setMatches(await getPitchScoreMatches(pitchId));
    } catch (err) {
      notify(toTurkishError(err), 'error');
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [pitchId]);

  useEffect(() => { load(); }, [load]);

  const submitScore = async (matchId: string) => {
    setSubmitting(true);
    try {
      const token = await getOrCreateScoreToken(matchId);
      const { error } = await supabase.rpc('submit_match_score', {
        p_token: token,
        p_home_score: homeScore,
        p_away_score: awayScore,
      });
      if (error) throw error;
      notify('Skor kaydedildi.', 'success');
      setScoreEntryId(null);
      setHomeScore(0);
      setAwayScore(0);
      await load();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OwnerFullscreenModal title="Maçlar" onClose={onClose}>
      <div className="max-w-md mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {([['ALL', 'Tümü'], ['PENDING', 'Skor Bekleyen']] as const).map(([key, label]) => {
              const count = key === 'PENDING' ? matches.filter((m) => !m.hasScore).length : matches.length;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border transition-colors ${
                    filter === key ? 'bg-white/10 text-white border-white/20' : 'bg-[#161B22] text-gray-500 border-white/5'
                  }`}
                >
                  {label}{count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>
          <button
            onClick={load}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white"
            title="Yenile"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : (filter === 'PENDING' ? matches.filter((m) => !m.hasScore) : matches).length === 0 ? (
          <div className="bg-[#161B22] border border-white/5 rounded-3xl p-8 text-center">
            <Trophy size={28} className="mx-auto text-gray-600" />
            <p className="text-sm font-bold text-gray-400 mt-3">
              {filter === 'PENDING' ? 'Skor bekleyen maç yok.' : 'Henüz maç yok.'}
            </p>
            <p className="text-[11px] text-gray-600 mt-1">
              Uygulama üzerinden sahanda kurulan maçlar burada listelenir.
            </p>
          </div>
        ) : (
          (filter === 'PENDING' ? matches.filter((m) => !m.hasScore) : matches).map((m) => {
            const st = STATUS_LABELS[m.status] ?? { label: m.status, cls: 'text-gray-400 bg-white/5 border-white/10' };
            const isEntering = scoreEntryId === m.matchId;
            return (
              <div key={m.matchId} className="bg-[#161B22] border border-white/5 rounded-3xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{m.title}</p>
                    <p className="text-[11px] text-gray-500 font-bold mt-0.5">
                      {m.when} · {m.courtName}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${st.cls}`}>
                    {st.label}
                  </span>
                </div>

                {m.hasScore ? (
                  <div className="mt-3 flex items-center justify-center gap-3 bg-[#0A0E14] border border-white/10 rounded-2xl py-3">
                    <span className="text-2xl font-black text-white font-mono">{m.homeScore}</span>
                    <span className="text-sm font-black text-gray-600">—</span>
                    <span className="text-2xl font-black text-white font-mono">{m.awayScore}</span>
                  </div>
                ) : isEntering ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex gap-2">
                      <ScoreStepper value={homeScore} onChange={setHomeScore} label="Ev Sahibi" />
                      <ScoreStepper value={awayScore} onChange={setAwayScore} label="Deplasman" />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setScoreEntryId(null)}
                        className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-400"
                      >
                        Vazgeç
                      </button>
                      <button
                        onClick={() => submitScore(m.matchId)}
                        disabled={submitting}
                        className="flex-1 py-3 rounded-xl bg-[#FACC15] text-black text-xs font-black disabled:opacity-50"
                      >
                        {submitting ? 'KAYDEDİLİYOR…' : 'SKORU KAYDET'}
                      </button>
                    </div>
                  </div>
                ) : !readOnly ? (
                  <button
                    onClick={() => { setScoreEntryId(m.matchId); setHomeScore(0); setAwayScore(0); }}
                    className="mt-3 w-full py-3 rounded-xl border border-dashed border-white/15 text-xs font-black text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                  >
                    SKOR GİR
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </OwnerFullscreenModal>
  );
};
