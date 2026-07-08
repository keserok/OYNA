import React, { useState, useMemo } from 'react';
import { Search, MapPin, ChevronRight, Check, X } from 'lucide-react';
import { TURKEY_REGIONS } from '../../data/turkeyRegions';
import { makeManualLocation } from '../../utils/regionResolver';
import { isCoveredCity } from '../../data/regionCenters';
import { useAppStore } from '../../store';
import { auth } from '../../supabaseAuth';
import { fbUpdateUserLocation } from '../../supabaseMutations';
import SettingsSubPage from '../common/SettingsSubPage';

// ─── Bölge seçici — elle il/ilçe seçimi ───────────────────────────────────────
// Altyapı (makeManualLocation + TURKEY_REGIONS) zaten vardı; eksik olan tek şey
// bu arayüzdü. İki adım: önce il, sonra ilçe (ya da "İl geneli"). Seçim
// setActiveRegion ile uygulama geneline yazılır (kaynak: 'manual').
interface RegionPickerPageProps {
  open: boolean;
  onClose: () => void;
}

const RegionPickerPage: React.FC<RegionPickerPageProps> = ({ open, onClose }) => {
  const { activeRegion, setUserLocation, setActiveRegion } = useAppStore();
  const [query, setQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  const cities = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return TURKEY_REGIONS;
    return TURKEY_REGIONS.filter(r => r.city.toLocaleLowerCase('tr').includes(q));
  }, [query]);

  const districts = useMemo(() => {
    if (!selectedCity) return [];
    const region = TURKEY_REGIONS.find(r => r.city === selectedCity);
    if (!region) return [];
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return region.districts;
    return region.districts.filter(d => d.toLocaleLowerCase('tr').includes(q));
  }, [selectedCity, query]);

  const applySelection = (city: string, district: string | null) => {
    const loc = makeManualLocation(city, district, Date.now());
    setActiveRegion(loc);
    if (loc.coordinates) {
      setUserLocation(loc.coordinates);
      if (auth.currentUser) {
        fbUpdateUserLocation(auth.currentUser.uid, loc.coordinates.lat, loc.coordinates.lng).catch(() => {});
      }
    }
    if (navigator.vibrate) navigator.vibrate(30);
    setQuery('');
    setSelectedCity(null);
    onClose();
  };

  const handleBack = () => {
    if (selectedCity) {
      setSelectedCity(null);
      setQuery('');
    } else {
      onClose();
    }
  };

  return (
    <SettingsSubPage
      open={open}
      onClose={handleBack}
      title={selectedCity ? selectedCity : 'Bölge Seç'}
      subtitle={selectedCity ? 'İlçe seç veya il genelini kullan' : 'İl ve ilçeni seç'}
    >
      {/* Arama */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={selectedCity ? 'İlçe ara…' : 'İl ara…'}
          className="w-full h-12 bg-[#161B22] border border-white/8 rounded-2xl pl-11 pr-10 text-sm font-medium text-white outline-none focus:border-[#39FF14]/40 transition-colors"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1"
            aria-label="Aramayı temizle"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {!selectedCity ? (
        /* İl listesi */
        <div className="space-y-1.5">
          {cities.map(region => {
            const isActive = activeRegion?.city === region.city;
            const covered = isCoveredCity(region.city);
            return (
              <button
                key={region.plate}
                onClick={() => { setSelectedCity(region.city); setQuery(''); }}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-colors ${
                  isActive ? 'bg-[#39FF14]/8 border-[#39FF14]/30' : 'bg-[#161B22] border-white/6 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[11px] font-black text-gray-400 tabular-nums">
                    {region.plate}
                  </span>
                  <span className="text-sm font-bold text-white">{region.city}</span>
                  {covered && (
                    <span className="text-[9px] font-black uppercase tracking-wide text-[#39FF14] bg-[#39FF14]/12 px-1.5 py-0.5 rounded">
                      Aktif
                    </span>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-600" />
              </button>
            );
          })}
          {cities.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">"{query}" ile eşleşen il yok.</p>
          )}
        </div>
      ) : (
        /* İlçe listesi */
        <div className="space-y-1.5">
          {/* İl geneli seçeneği */}
          {!query && (
            <button
              onClick={() => applySelection(selectedCity, null)}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-[#00B0FF]/25 bg-[#00B0FF]/8 hover:bg-[#00B0FF]/12 transition-colors mb-2"
            >
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-[#00B0FF]/15 flex items-center justify-center text-[#00B0FF]">
                  <MapPin size={16} />
                </span>
                <div className="text-left">
                  <span className="text-sm font-bold text-white block">{selectedCity} geneli</span>
                  <span className="text-[11px] text-gray-400">İlçe belirtmeden tüm ili kullan</span>
                </div>
              </div>
            </button>
          )}
          {districts.map(district => {
            const isActive = activeRegion?.city === selectedCity && activeRegion?.district === district;
            return (
              <button
                key={district}
                onClick={() => applySelection(selectedCity, district)}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-colors ${
                  isActive ? 'bg-[#39FF14]/8 border-[#39FF14]/30' : 'bg-[#161B22] border-white/6 hover:bg-white/5'
                }`}
              >
                <span className="text-sm font-bold text-white">{district}</span>
                {isActive && <Check size={16} className="text-[#39FF14]" />}
              </button>
            );
          })}
          {districts.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">"{query}" ile eşleşen ilçe yok.</p>
          )}
        </div>
      )}
    </SettingsSubPage>
  );
};

export default RegionPickerPage;
