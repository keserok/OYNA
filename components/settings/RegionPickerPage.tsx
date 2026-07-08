import React, { useState, useMemo } from 'react';
import { Search, MapPin, ChevronRight, Check, X, Plus } from 'lucide-react';
import { TURKEY_REGIONS } from '../../data/turkeyRegions';
import { makeManualLocation } from '../../utils/regionResolver';
import { isCoveredCity } from '../../data/regionCenters';
import { useAppStore } from '../../store';
import { auth } from '../../supabaseAuth';
import { fbUpdateUserLocation } from '../../supabaseMutations';
import type { OynaLocation } from '../../types';
import SettingsSubPage from '../common/SettingsSubPage';

// ─── Bölge seçici — çoklu il/ilçe seçimi ──────────────────────────────────────
// Kullanıcı birden fazla il/ilçe ekleyebilir; keşif (maç + saha) seçili
// bölgelerin birleşimini gösterir. Seçim listeye eklenir (sayfa kapanmaz);
// üstteki chip'lerden çıkarılabilir.
interface RegionPickerPageProps {
  open: boolean;
  onClose: () => void;
}

const RegionPickerPage: React.FC<RegionPickerPageProps> = ({ open, onClose }) => {
  const { selectedRegions, setUserLocation, addSelectedRegion, removeSelectedRegion } = useAppStore();
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

  const isSelected = (city: string, district: string | null) =>
    selectedRegions.some(r => r.city === city && (r.district ?? null) === district);

  const addRegion = (city: string, district: string | null) => {
    const loc = makeManualLocation(city, district, Date.now());
    addSelectedRegion(loc);
    if (loc.coordinates) {
      setUserLocation(loc.coordinates);
      if (auth.currentUser) {
        fbUpdateUserLocation(auth.currentUser.uid, loc.coordinates.lat, loc.coordinates.lng).catch(() => {});
      }
    }
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const toggleRegion = (city: string, district: string | null) => {
    if (isSelected(city, district)) {
      // Geçici bir konum nesnesi ile kaldır (yalnızca il/ilçe eşleşmesi kullanılır)
      removeSelectedRegion({ city, district } as OynaLocation);
    } else {
      addRegion(city, district);
    }
  };

  const handleBack = () => {
    if (selectedCity) {
      setSelectedCity(null);
      setQuery('');
    } else {
      setQuery('');
      onClose();
    }
  };

  return (
    <SettingsSubPage
      open={open}
      onClose={handleBack}
      title={selectedCity ? selectedCity : 'Bölgelerim'}
      subtitle={selectedCity ? 'İlçe ekle veya çıkar' : 'Birden fazla il/ilçe seçebilirsin'}
    >
      {/* Seçili bölgeler (chip) */}
      {selectedRegions.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2 ml-1">
            Seçili Bölgeler ({selectedRegions.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedRegions.map((r, i) => (
              <span
                key={`${r.city}|${r.district ?? ''}|${i}`}
                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/25 text-[#39FF14] text-xs font-bold"
              >
                <MapPin size={12} />
                {r.label}
                <button
                  onClick={() => removeSelectedRegion(r)}
                  className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                  aria-label={`${r.label} bölgesini çıkar`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

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
            const covered = isCoveredCity(region.city);
            const cityHasSelection = selectedRegions.some(r => r.city === region.city);
            return (
              <button
                key={region.plate}
                onClick={() => { setSelectedCity(region.city); setQuery(''); }}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-colors ${
                  cityHasSelection ? 'bg-[#39FF14]/8 border-[#39FF14]/25' : 'bg-[#161B22] border-white/6 hover:bg-white/5'
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
                  {cityHasSelection && (
                    <span className="text-[9px] font-black uppercase tracking-wide text-gray-400 bg-white/5 px-1.5 py-0.5 rounded">
                      Seçili
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
          {!query && (() => {
            const on = isSelected(selectedCity, null);
            return (
              <button
                onClick={() => toggleRegion(selectedCity, null)}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-colors mb-2 ${
                  on ? 'bg-[#00B0FF]/12 border-[#00B0FF]/40' : 'bg-[#00B0FF]/8 border-[#00B0FF]/25 hover:bg-[#00B0FF]/12'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-[#00B0FF]/15 flex items-center justify-center text-[#00B0FF]">
                    <MapPin size={16} />
                  </span>
                  <div className="text-left">
                    <span className="text-sm font-bold text-white block">{selectedCity} geneli</span>
                    <span className="text-[11px] text-gray-400">İlçe belirtmeden tüm ili ekle</span>
                  </div>
                </div>
                {on ? <Check size={18} className="text-[#00B0FF]" /> : <Plus size={18} className="text-[#00B0FF]" />}
              </button>
            );
          })()}
          {districts.map(district => {
            const on = isSelected(selectedCity, district);
            return (
              <button
                key={district}
                onClick={() => toggleRegion(selectedCity, district)}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-colors ${
                  on ? 'bg-[#39FF14]/8 border-[#39FF14]/30' : 'bg-[#161B22] border-white/6 hover:bg-white/5'
                }`}
              >
                <span className="text-sm font-bold text-white">{district}</span>
                {on ? <Check size={16} className="text-[#39FF14]" /> : <Plus size={16} className="text-gray-500" />}
              </button>
            );
          })}
          {districts.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">"{query}" ile eşleşen ilçe yok.</p>
          )}
        </div>
      )}

      {/* Bitti */}
      <button
        onClick={() => { setSelectedCity(null); setQuery(''); onClose(); }}
        className="w-full h-12 mt-5 rounded-2xl font-black text-sm bg-[#39FF14] text-black active:scale-[0.99] transition-transform"
      >
        Bitti{selectedRegions.length > 0 ? ` (${selectedRegions.length} bölge)` : ''}
      </button>
    </SettingsSubPage>
  );
};

export default RegionPickerPage;
