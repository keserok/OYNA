import React from 'react';
import { ChevronDown } from 'lucide-react';
import { TURKEY_CITIES, districtsOfCity } from '../../data/turkeyRegions';

interface CityDistrictSelectProps {
  city: string;
  district?: string;
  onChange: (next: { city: string; district: string }) => void;
  /** İlçe seçimini de göster (varsayılan true). */
  showDistrict?: boolean;
  /** Alan üstü etiketleri (İl / İlçe) göster. */
  labels?: boolean;
  className?: string;
}

/**
 * Paylaşılan il/ilçe seçimi — TURKEY_REGIONS ile DOĞRULANIR (serbest metin değil).
 * Form bağlamları (owner tesis, admin saha/kullanıcı/sağlayıcı) için native, sağlam.
 * İl değişince ilçe otomatik sıfırlanır; ikisi de kayıt şekliyle uyumlu string döner.
 */
const selectCls =
  'w-full appearance-none bg-[#0A0E14] border border-white/10 rounded-xl pl-3.5 pr-9 py-3 ' +
  'text-sm font-semibold text-white outline-none focus:border-[#39FF14]/40 transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const CityDistrictSelect: React.FC<CityDistrictSelectProps> = ({
  city,
  district = '',
  onChange,
  showDistrict = true,
  labels = true,
  className = '',
}) => {
  const districts = city ? districtsOfCity(city) : [];

  return (
    <div className={`grid ${showDistrict ? 'grid-cols-2' : 'grid-cols-1'} gap-2.5 ${className}`}>
      <div>
        {labels && (
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 block mb-1.5 ml-0.5">
            İl
          </label>
        )}
        <div className="relative">
          <select
            value={city}
            onChange={(e) => onChange({ city: e.target.value, district: '' })}
            className={selectCls}
          >
            <option value="" className="bg-[#161B22] text-white">İl seç…</option>
            {TURKEY_CITIES.map((c) => (
              <option key={c} value={c} className="bg-[#161B22] text-white">
                {c}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {showDistrict && (
        <div>
          {labels && (
            <label className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 block mb-1.5 ml-0.5">
              İlçe
            </label>
          )}
          <div className="relative">
            <select
              value={district}
              onChange={(e) => onChange({ city, district: e.target.value })}
              disabled={!city}
              className={selectCls}
            >
              <option value="" className="bg-[#161B22] text-white">
                {city ? 'İlçe seç…' : 'Önce il seç'}
              </option>
              {districts.map((d) => (
                <option key={d} value={d} className="bg-[#161B22] text-white">
                  {d}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>
      )}
    </div>
  );
};

export default CityDistrictSelect;
