import { useEffect, useState } from 'react';
import { parseMatchDate } from './useMyMatches';

// Etkinlik başlangıcına canlı geri sayım etiketi ("2s 15dk" / "5dk 30sn").
// MatchJoinCard'dan çıkarıldı; Maçlarım hub'ının hero geri sayımıyla paylaşılır.
export const useCountdown = (date: string, time: string): string => {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const tick = () => {
      const target = parseMatchDate(date, time);
      if (!target) { setLabel('Maç Başladı'); return; }
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setLabel('Maç Başladı'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(h > 0 ? `${h}s ${m}dk` : `${m}dk ${s}sn`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [date, time]);
  return label;
};

export default useCountdown;
