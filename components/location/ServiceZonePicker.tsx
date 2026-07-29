import React from 'react';
import { ChevronDown, Check, MapPin } from 'lucide-react';
import { TURKEY_CITIES, districtsOfCity } from '../../data/turkeyRegions';

interface ServiceZonePickerProps {
  /** Bölgelerin ait olduğu il. */
  city: string;
  onCityChange: (city: string) => void;
  /** Seçili ilçe adları (kaleci/hakem preferred_zones). */
  selectedZones: string[];
  onToggleZone: (zone: string) => void;
  /** En fazla kaç bölge seçilebilir (varsayılan 10). */
  maxZones?: number;
  className?: string;
}

/**
 * Kaleci/Hakem "hizmet verdiğim bölgeler" seçici — ÇOKLU ilçe.
 * İl seç → o ilin ilçelerini işaretle. Çıktı: string[] (preferred_zones).
 * Aynı 81-il verisiyle çalışır; serbest metin ya da sabit İstanbul yok.
 */
const ServiceZonePicker: React.FC<ServiceZonePickerProps> = ({
  city,
  onCityChange,
  selectedZones,
  onToggleZone,
  maxZones = 10,
  className = '',
}) => {
  const districts = city ? districtsOfCity(city) : [];
  const atMax = selectedZones.length >= maxZones;

  return (
    <div className={className}>
      {/* İl seçimi */}
      <label className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 block mb-1.5 ml-0.5">
        Hizmet İli
      </label>
      <div className="relative mb-4">
        <select
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          className="w-full appearance-none bg-[#0A0E14] border border-white/10 rounded-xl pl-3.5 pr-9 py-3
                     text-sm font-semibold text-white outline-none focus:border-[#39FF14]/40 transition-colors"
        >
          <option value="" className="bg-[#161B22] text-white">İl seç…</option>
          {TURKEY_CITIES.map((c) => (
            <option key={c} value={c} className="bg-[#161B22] text-white">
              {c}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
      </div>

      {/* Bölge (ilçe) chip'leri */}
      <div className="flex items-center justify-between mb-2.5 ml-0.5">
        <label className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4">
          Hizmet Bölgeleri
        </label>
        <span className={`text-[0.6875rem] font-extrabold ${atMax ? 'text-[#FFAA00]' : 'text-ink-4'}`}>
          {selectedZones.length}/{maxZones}
        </span>
      </div>

      {!city ? (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-white/[0.03] border border-white/8 text-ink-4 text-xs font-semibold">
          <MapPin size={15} /> Önce bir il seç.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {districts.map((d) => {
            const on = selectedZones.includes(d);
            const disabled = !on && atMax;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onToggleZone(d)}
                disabled={disabled}
                className={`min-h-[36px] px-3.5 rounded-xl text-[0.8125rem] font-bold inline-flex items-center gap-1.5 transition-all active:scale-95
                  ${on
                    ? 'bg-[#39FF14]/14 border border-[#39FF14]/45 text-[#39FF14] shadow-[0_0_14px_rgba(57,255,20,0.15)]'
                    : disabled
                      ? 'bg-white/[0.02] border border-white/5 text-ink-4 cursor-not-allowed'
                      : 'bg-white/4 border border-white/10 text-gray-200 hover:border-white/20'}`}
              >
                {on && <Check size={13} />}
                {d}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ServiceZonePicker;
