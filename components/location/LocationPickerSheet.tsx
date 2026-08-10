import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, Search, ChevronLeft, X, Loader2, Sparkles } from 'lucide-react';
import type { OynaLocation } from '../../types';
import { TURKEY_REGIONS, districtsOfCity } from '../../data/turkeyRegions';
import { isCoveredCity } from '../../data/regionCenters';
import { makeManualLocation } from '../../utils/regionResolver';
import { detectRegion } from '../../services/locationService';

interface LocationPickerSheetProps {
  open: boolean;
  onClose: () => void;
  /** Seçim (GPS ya da elle) tamamlanınca çağrılır. */
  onSelect: (location: OynaLocation) => void;
  /** Açılışta seçili gelecek il (varsa doğrudan ilçe adımına geçer). */
  initialCity?: string | null;
  title?: string;
}

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');

const LocationPickerSheet: React.FC<LocationPickerSheetProps> = ({
  open,
  onClose,
  onSelect,
  initialCity = null,
  title = 'Bölgeni Seç',
}) => {
  const [step, setStep] = useState<'city' | 'district'>(initialCity ? 'district' : 'city');
  const [selectedCity, setSelectedCity] = useState<string | null>(initialCity);
  const [search, setSearch] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const filteredCities = useMemo(() => {
    const q = trLower(search.trim());
    const rows = q
      ? TURKEY_REGIONS.filter((r) => trLower(r.city).includes(q))
      : TURKEY_REGIONS;
    // Aktif iller (Ordu) en üstte.
    return [...rows].sort((a, b) => {
      const ca = isCoveredCity(a.city) ? 0 : 1;
      const cb = isCoveredCity(b.city) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return a.city.localeCompare(b.city, 'tr');
    });
  }, [search]);

  const districts = useMemo(
    () => (selectedCity ? districtsOfCity(selectedCity) : []),
    [selectedCity],
  );

  const reset = () => {
    setStep(initialCity ? 'district' : 'city');
    setSelectedCity(initialCity);
    setSearch('');
    setGpsError(null);
    setGpsLoading(false);
  };

  const close = () => {
    onClose();
    // sheet kapandıktan sonra durumu sıfırla (animasyon bitince)
    setTimeout(reset, 250);
  };

  const handleGps = async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const loc = await detectRegion();
      onSelect(loc);
      close();
    } catch {
      setGpsError('Konum alınamadı. İzin verip tekrar dene ya da aşağıdan elle seç.');
    } finally {
      setGpsLoading(false);
    }
  };

  const pickCity = (city: string) => {
    setSelectedCity(city);
    setStep('district');
  };

  const pickDistrict = (district: string | null) => {
    if (!selectedCity) return;
    onSelect(makeManualLocation(selectedCity, district));
    close();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="loc-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={close}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            key="loc-sheet"
            initial={{ y: 60, opacity: 0.4 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full flex flex-col max-h-[85vh]
                       bg-gradient-to-b from-surface-1 to-bg
                       border border-white/10 border-b-0
                       rounded-t-[28px]
                       shadow-[0_-10px_60px_rgba(0,0,0,0.6)] overflow-hidden"
          >
            {/* grip */}
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-11 h-1.5 rounded-full bg-white/20" />
            </div>

            {/* header */}
            <div className="flex items-center gap-3 px-5 pt-3 pb-4">
              {step === 'district' && !initialCity ? (
                <button
                  onClick={() => setStep('city')}
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                  aria-label="Geri"
                >
                  <ChevronLeft size={18} />
                </button>
              ) : (
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
                  <MapPin size={18} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-extrabold italic uppercase tracking-tight text-white leading-none">
                  {step === 'district' ? selectedCity : title}
                </h3>
                <p className="text-[0.6875rem] font-semibold text-ink-4 mt-1">
                  {step === 'district' ? 'İlçeni seç' : 'GPS ile bul ya da elle seç'}
                </p>
              </div>
              <button
                onClick={close}
                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                aria-label="Kapat"
              >
                <X size={16} />
              </button>
            </div>

            {/* ─── STEP: CITY ─── */}
            {step === 'city' && (
              <div className="flex flex-col min-h-0 flex-1">
                {/* GPS button */}
                <div className="px-5 pb-3">
                  <button
                    onClick={handleGps}
                    disabled={gpsLoading}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl
                               bg-[#00B0FF]/10 border border-[#00B0FF]/35 text-left
                               hover:bg-[#00B0FF]/15 transition-colors disabled:opacity-60"
                  >
                    <span className="w-10 h-10 rounded-xl bg-[#00B0FF]/15 border border-[#00B0FF]/30 flex items-center justify-center text-[#00B0FF] flex-shrink-0">
                      {gpsLoading ? <Loader2 size={20} className="animate-spin" /> : <Navigation size={20} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-extrabold text-white">
                        {gpsLoading ? 'Konum aranıyor…' : 'Konumumu Kullan'}
                      </span>
                      <span className="block text-[0.6875rem] text-gray-400">GPS ile otomatik & en isabetli</span>
                    </span>
                  </button>
                  {gpsError && (
                    <p className="text-[0.6875rem] text-[#FFAA00] font-semibold mt-2 px-1">{gpsError}</p>
                  )}
                </div>

                {/* divider */}
                <div className="flex items-center gap-3 px-5 pb-3">
                  <div className="h-px flex-1 bg-white/8" />
                  <span className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4">veya elle seç</span>
                  <div className="h-px flex-1 bg-white/8" />
                </div>

                {/* search */}
                <div className="px-5 pb-3">
                  <div className="flex items-center gap-2.5 px-3.5 h-12 rounded-2xl bg-bg border border-white/10 focus-within:border-primary/40 transition-colors">
                    <Search size={18} className="text-ink-4 flex-shrink-0" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="İl ara (81 il)…"
                      className="flex-1 bg-transparent outline-none text-white text-sm font-semibold placeholder:text-ink-4"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} className="text-ink-4 hover:text-white">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* city list */}
                <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1">
                  {filteredCities.map((r) => {
                    const covered = isCoveredCity(r.city);
                    return (
                      <button
                        key={r.plate}
                        onClick={() => pickCity(r.city)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
                      >
                        <span className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[0.6875rem] font-extrabold text-gray-400 flex-shrink-0">
                          {String(r.plate).padStart(2, '0')}
                        </span>
                        <span className="flex-1 text-sm font-bold text-white">{r.city}</span>
                        {covered ? (
                          <span className="flex items-center gap-1.5 text-[0.625rem] font-extrabold uppercase tracking-wide text-primary">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_#39FF14]" />
                            Aktif
                          </span>
                        ) : (
                          <span className="text-[0.625rem] font-extrabold uppercase tracking-wide text-[#FFAA00]/70 px-2 py-0.5 rounded-full bg-[#FFAA00]/8 border border-[#FFAA00]/20">
                            yakında
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {filteredCities.length === 0 && (
                    <p className="text-center text-sm text-ink-4 py-8">"{search}" için il bulunamadı.</p>
                  )}
                </div>
              </div>
            )}

            {/* ─── STEP: DISTRICT ─── */}
            {step === 'district' && selectedCity && (
              <div className="flex flex-col min-h-0 flex-1">
                {!isCoveredCity(selectedCity) && (
                  <div className="mx-5 mb-3 flex items-start gap-2.5 p-3 rounded-2xl bg-[#FFAA00]/8 border border-[#FFAA00]/25">
                    <Sparkles size={16} className="text-[#FFAA00] flex-shrink-0 mt-0.5" />
                    <p className="text-[0.6875rem] font-semibold text-gray-300 leading-relaxed">
                      <b className="text-[#FFAA00]">{selectedCity}</b> yakında açılıyor. Şimdiden seçebilirsin;
                      bölge listeleri şehir aktif olunca dolar.
                    </p>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto px-5 pb-6">
                  {/* İl geneli */}
                  <button
                    onClick={() => pickDistrict(null)}
                    className="w-full flex items-center justify-between p-3.5 mb-3 rounded-2xl bg-primary/8 border border-primary/25 hover:bg-primary/12 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <MapPin size={16} className="text-primary" />
                      <span className="text-sm font-extrabold text-white">Tüm {selectedCity}</span>
                    </span>
                    <span className="text-[0.6875rem] font-bold text-gray-400">il geneli</span>
                  </button>

                  <p className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 mb-3 ml-1">
                    {selectedCity} İlçeleri
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {districts.map((d) => (
                      <button
                        key={d}
                        onClick={() => pickDistrict(d)}
                        className="min-h-[38px] px-4 rounded-xl bg-white/4 border border-white/10 text-[0.8125rem] font-bold text-gray-200
                                   hover:bg-primary/12 hover:border-primary/40 hover:text-primary active:scale-95 transition-all
                                   inline-flex items-center gap-1.5"
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LocationPickerSheet;
