/**
 * Vitrin Skoru + analitik kartı (Karar #17, #29).
 * Owner "Tesis Ayarları > Vitrin" sekmesinde: 0-100 skor, eksik görev listesi,
 * 30 günlük görüntülenme / favori / uygulama rezervasyonu metrikleri.
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Eye, Star, Ticket } from 'lucide-react';
import { computeShowcaseScore, getPitchEngagement, type PitchEngagement, type ShowcaseScore } from '../../services/pitchShowcaseService';
import { supabase } from '../../supabaseClient';

interface Props {
  pitchId: string;
  /** Görev tıklanınca ilgili sekmeye götürmek için (opsiyonel) */
  onTaskClick?: (taskKey: string) => void;
  refreshKey?: number;
}

export const ShowcaseScoreCard: React.FC<Props> = ({ pitchId, onTaskClick, refreshKey }) => {
  const [score, setScore] = useState<ShowcaseScore | null>(null);
  const [engagement, setEngagement] = useState<PitchEngagement | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [{ data }, eng] = await Promise.all([
        supabase
          .from('pitches')
          .select('description, amenities, images, latitude, longitude, courts(is_active), pitch_tariffs(is_active)')
          .eq('id', pitchId)
          .single(),
        getPitchEngagement(pitchId),
      ]);
      if (!active) return;
      if (data) setScore(computeShowcaseScore(data as never));
      setEngagement(eng);
    };
    void load();
    return () => { active = false; };
  }, [pitchId, refreshKey]);

  if (!score) return null;

  const tone = score.score >= 85 ? 'text-[#39FF14]' : score.score >= 60 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest">Vitrin Skoru</p>
            <p className="text-[0.6875rem] text-ink-4 mt-1 max-w-[200px] leading-relaxed">
              Eksiksiz profiller vitrinde daha üstte listelenir ve daha çok rezervasyon alır.
            </p>
          </div>
          <div className={`text-4xl font-extrabold italic ${tone}`}>{score.score}<span className="text-sm text-ink-4">/100</span></div>
        </div>
        <div className="mt-3 h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${score.score >= 85 ? 'bg-[#39FF14]' : score.score >= 60 ? 'bg-yellow-400' : 'bg-red-400'}`}
            style={{ width: `${score.score}%` }}
          />
        </div>
        <div className="mt-4 space-y-2">
          {score.tasks.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => !t.done && onTaskClick?.(t.key)}
              className={`w-full flex items-center gap-2.5 text-left text-xs font-semibold ${t.done ? 'text-ink-4' : 'text-white'}`}
            >
              {t.done
                ? <CheckCircle2 size={15} className="text-[#39FF14] shrink-0" />
                : <Circle size={15} className="text-ink-4 shrink-0" />}
              <span className={t.done ? 'line-through' : ''}>{t.label}</span>
              <span className="ml-auto text-[0.6875rem] font-extrabold text-ink-4">+{t.points}</span>
            </button>
          ))}
        </div>
      </div>

      {engagement && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Eye, label: 'Görüntülenme', sub: '30 gün', value: engagement.views30d },
            { icon: Star, label: 'Favori', sub: 'toplam', value: engagement.favorites },
            { icon: Ticket, label: 'Rezervasyon', sub: '30 gün · app', value: engagement.appBookings30d },
          ].map(({ icon: Icon, label, sub, value }) => (
            <div key={label} className="bg-[#0A0E14] border border-white/5 rounded-2xl p-3.5 text-center">
              <Icon size={15} className="mx-auto text-[#39FF14]" />
              <div className="text-xl font-extrabold text-white mt-1.5">{value}</div>
              <div className="text-[0.625rem] font-bold text-ink-4 uppercase tracking-wider">{label}</div>
              <div className="text-[0.6875rem] text-ink-4">{sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShowcaseScoreCard;
