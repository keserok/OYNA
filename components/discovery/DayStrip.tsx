import React, { useEffect, useRef } from 'react';
import type { DiscoveryDay } from '../../utils/discoveryDays';

// Top Oyna gün seçici — yatay kaydırılabilir gün şeridi.
// Her gün adıyla ve tarihiyle görünür; altındaki sayı o gündeki maç adedidir.
// Seçili gün değişince şerit o güne kaydırılır (uzak bir gün seçilip filtre
// panelinden dönüldüğünde seçim ekran dışında kalmasın).

const ACCENT = '#39FF14'; // --color-primary; bkz. index.css RENK-ROL TABLOSU

interface DayStripProps {
  days: DiscoveryDay[];
  /** Seçili günün zaman damgası; null = tüm günler. */
  value: number | null;
  onChange: (dayMs: number | null) => void;
  /** Gün filtresi kapalıyken ('Tümü') listedeki toplam maç sayısı. */
  totalCount: number;
}

export const DayStrip: React.FC<DayStripProps> = ({ days, value, onChange, totalCount }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = activeRef.current;
    const box = scrollerRef.current;
    if (!el || !box) return;
    // scrollIntoView SAYFAYI da kaydırabiliyor; yalnız şeridi yatayda kaydır.
    const target = Math.max(0, el.offsetLeft - (box.clientWidth - el.clientWidth) / 2);
    // scrollTo her ortamda yok (jsdom, eski WebView) — yoksa doğrudan ata.
    if (typeof box.scrollTo === 'function') {
      box.scrollTo({ left: target, behavior: 'smooth' });
    } else {
      box.scrollLeft = target;
    }
  }, [value]);

  return (
    <div
      ref={scrollerRef}
      role="radiogroup"
      aria-label="Gün seç"
      className="flex gap-2 overflow-x-auto no-scrollbar px-5 py-3"
    >
      {/* TÜMÜ — gün kısıtını kaldırır */}
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        ref={value === null ? activeRef : undefined}
        onClick={() => onChange(null)}
        className="shrink-0 min-w-[62px] min-h-[68px] px-3 rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95"
        style={
          value === null
            ? { background: ACCENT, borderColor: ACCENT, color: '#000', boxShadow: `0 0 18px ${ACCENT}44` }
            : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.75)' }
        }
      >
        <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.08em] leading-none">Tümü</span>
        <span className="font-numeric text-[0.6875rem] font-extrabold leading-none mt-1" style={{ opacity: 0.8 }}>
          {totalCount}
        </span>
      </button>

      {days.map((d) => {
        const selected = value === d.ms;
        const empty = d.count === 0;
        return (
          <button
            key={d.ms}
            type="button"
            role="radio"
            aria-checked={selected}
            ref={selected ? activeRef : undefined}
            aria-label={`${d.dayNum} ${d.month} ${d.weekday}${d.isToday ? ' (bugün)' : ''} — ${d.count} maç`}
            onClick={() => onChange(d.ms)}
            className="relative shrink-0 min-w-[62px] min-h-[68px] px-3 rounded-2xl border flex flex-col items-center justify-center transition-all active:scale-95"
            style={
              selected
                ? { background: ACCENT, borderColor: ACCENT, color: '#000', boxShadow: `0 0 18px ${ACCENT}44` }
                : {
                    background: 'rgba(255,255,255,0.03)',
                    borderColor: d.isToday ? `${ACCENT}55` : 'rgba(255,255,255,0.10)',
                    color: empty ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.90)',
                  }
            }
          >
            <span
              className="text-[0.625rem] font-extrabold uppercase tracking-[0.1em] leading-none"
              style={{ opacity: 0.8 }}
            >
              {d.isToday ? 'BUGÜN' : d.isTomorrow ? 'YARIN' : d.weekday}
            </span>
            <span className="font-numeric text-base font-extrabold leading-none mt-1">{d.dayNum}</span>
            <span
              className="text-[0.625rem] font-extrabold uppercase tracking-[0.08em] leading-none mt-0.5"
              style={{ opacity: 0.8 }}
            >
              {d.month}
            </span>
            {/* Maç sayısı — sıfırsa nokta yerine hiç çizilmez (yalan sayı yok) */}
            {d.count > 0 && (
              <span
                className="font-numeric absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-[0.625rem] font-extrabold flex items-center justify-center border"
                style={
                  selected
                    ? { background: '#000', color: ACCENT, borderColor: '#000' }
                    : { background: '#0A0E14', color: ACCENT, borderColor: `${ACCENT}55` }
                }
              >
                {d.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default DayStrip;
