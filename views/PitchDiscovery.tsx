import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Search, Filter, MapPin, Star, Layers,
  ChevronRight, ChevronLeft, X, Map as MapIcon, LayoutGrid,
  Thermometer, Wind, Flag, Calendar as CalendarIcon,
  LocateFixed, Loader2, Navigation2,
} from 'lucide-react';
import { Pitch, Court } from '../types';
import { useAppStore } from '../store';
import MapGL, { Marker as MapMarker, Source as MapSource, Layer as MapLayer, AttributionControl, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { OYNA_MAPLIBRE_STYLE, OYNA_MAPLIBRE_CSS, isWebglAvailable } from '../components/map/mapBase';
import { fetchActiveCoverage, type RegionCoverage } from '../services/regionCoverageService';
import { requestDeviceLocation } from '../services/locationService';
import { openDirections, isIOSPlatform, appleMapsDirectionsUrl, googleMapsDirectionsUrl } from '../utils/directions';
import { getHaversineDistance } from '../utils/geo';
import { ORDU_DISTRICTS } from '../utils/orduData';
import { TURKEY_REGIONS } from '../data/turkeyRegions';
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { LoadingState, ErrorState } from '../components/common/StatusState';
import { Toast } from '../components/common/Toast';
import { fetchPitchBookings, computeAvailability, subscribeToPitchBookings, todayISO } from '../services/pitchBookingService';
import { PitchBookingRow, toISODate, parseSlotLabel, generateSlotRanges } from '../services/availabilityService';
import {
  getAverageTariffPrice,
  mapDbTariffsToPitchTariffs,
  resolveTariffForSlot,
} from '../services/tariffService';
import { fetchMyFavoritePitchIds, togglePitchFavorite } from '../services/pitchFavoritesService';
import { recordPitchView } from '../services/pitchShowcaseService';
import { reportPitchContent } from '../services/pitchMediaService';
import { splitAmenities, normalizeAmenity, getAmenityDef } from '../shared/amenities';
import { transformedImageUrl } from '../utils/imageTransform';

// ── Owner module: canlı saha verisini UI Pitch tipine dönüştürme ──────────────
interface DbTariff {
  id: string;
  name?: string;
  applies_to_days: number[] | null;
  start_time: string;
  end_time: string;
  price_per_hour: number;
  deposit_amount?: number | null;
  is_active: boolean | null;
  tariff_type: string;
  sort_order?: number | null;
}

interface DbCourtRow {
  id: string;
  name: string;
  court_type: string | null;
  surface?: string | null;
  price: number | null;
  is_active: boolean | null;
  description?: string | null;
  images?: string[] | null;
  lighting_grade?: string | null;
  grass_grade?: string | null;
  locker_grade?: string | null;
  grades_status?: string | null;
  capacity?: number | null;
}

interface DbPitchRow {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  address: string | null;
  rating: number | null;
  google_rating: number | null;
  google_review_count: number | null;
  price_per_person: number | null;
  total_price: number | null;
  price_per_match: number | null;
  image: string | null;
  images: string[] | null;
  description: string | null;
  amenities: string[] | null;
  latitude: number | null;
  longitude: number | null;
  owner_id?: string | null;
  is_published?: boolean | null;
  is_featured?: boolean | null;
  working_hours?: { open?: string; close?: string; slot_duration?: number; slotDuration?: number } | null;
  courts?: DbCourtRow[];
  pitch_tariffs?: DbTariff[];
}

const gradeToScore = (g?: string | null): number => {
  if (g === 'A+') return 98;
  if (g === 'A') return 95;
  if (g === 'B') return 80;
  if (g === 'C') return 65;
  return 0;
};

const mapDbPitchToUiPitch = (
  row: DbPitchRow,
  flash?: { id: string; discount: number },
): Pitch => {
  const tariffs = mapDbTariffsToPitchTariffs(row.pitch_tariffs);
  const averagePrice =
    getAverageTariffPrice(row.pitch_tariffs) ?? row.total_price ?? row.price_per_match ?? 0;
  const displayPrice = flash?.discount
    ? Math.round(averagePrice * (1 - flash.discount / 100))
    : averagePrice;
  const wh = row.working_hours;
  const courts: Court[] = (row.courts ?? [])
    .filter((c) => c.is_active !== false)
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.court_type === 'CLOSED' ? 'CLOSED' : 'OPEN',
      surface: c.surface ?? 'TURF',
      price: c.price ?? averagePrice,
      slots: [],
      description: c.description ?? undefined,
      images: (c.images as string[] | undefined) ?? undefined,
      lighting: gradeToScore(c.lighting_grade),
      grassQuality: gradeToScore(c.grass_grade),
      lockerRoomQuality: gradeToScore(c.locker_grade),
      lightingGrade: c.lighting_grade ?? null,
      grassGrade: c.grass_grade ?? null,
      gradesStatus: (c.grades_status as Court['gradesStatus']) ?? 'approved',
    }));
  return {
    id: row.id,
    name: row.name,
    city: row.city ?? undefined,
    district: row.district ?? row.city ?? '',
    location: row.address ?? [row.district, row.city].filter(Boolean).join(', '),
    distance: '',
    rating: row.rating ?? row.google_rating ?? 0,
    googleRating: row.google_rating ?? 0,
    googleReviews: row.google_review_count ?? 0,
    pricePerPerson: row.price_per_person ?? 0,
    totalPrice: displayPrice,
    originalPrice: flash?.discount ? averagePrice : undefined,
    image: row.image ?? row.images?.[0] ?? '',
    images: row.images ?? (row.image ? [row.image] : []),
    description: row.description ?? '',
    amenities: row.amenities ?? [],
    lighting: 0,
    grassQuality: 0,
    lockerRoomQuality: 0,
    goalQuality: 0,
    occupancy: row.rating
      ? Math.min(95, Math.max(40, Math.round(row.rating * 16 + ((row.google_review_count ?? 0) % 20))))
      : 75,
    // Koordinat yoksa sahte varsayılan basma — undefined bırak (haritada gizlenir).
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: row.latitude, lng: row.longitude }
        : undefined,
    slots: [],
    courts,
    isApproved: true,
    ownerId: row.owner_id ?? undefined,
    isPublished: row.is_published !== false,
    isFeatured: row.is_featured === true,
    // Ham working_hours korunur (dizi ya da nesne); gün-bazlı çözümleme
    // buildAvailabilitySlots içinde rezervasyon tarihine göre yapılır.
    workingHoursRaw: wh ?? null,
    workingHours: wh && !Array.isArray(wh)
      ? {
          open: wh.open ?? '08:00',
          close: wh.close ?? '02:00',
          slotDuration: wh.slot_duration ?? wh.slotDuration ?? 60,
        }
      : { open: '08:00', close: '02:00', slotDuration: 60 },
    flashDiscount: flash?.discount,
    flashDealId: flash?.id,
    tariffs,
  };
};

interface MapViewProps {
  pitches: Pitch[];
  selectedPitch: Pitch | null;
  onPitchSelect: (p: Pitch | null) => void;
  onOpenDetail: (p: Pitch) => void;
  center: [number, number];
  userLocation: { lat: number; lng: number } | null;
  onLocate: () => Promise<{ lat: number; lng: number }>;
  onLocateError: (msg: string) => void;
  /** Seçili bölgelerin idari sınırları (sarı çizgi). Boşsa çizim yok. */
  regionBoundaries: GeoJSON.FeatureCollection | null;
}

// Zoom eşiği: altında fiyatlar gizlenir, sahalar yalnız nokta olarak görünür
// (dokununca yakınlaşır); üstünde seçilebilir fiyat balonları gösterilir.
const PIN_BUBBLE_ZOOM = 12.5;

// Fiyat pini — react-map-gl Marker (anchor="bottom" → tip TAM koordinatta).
// Maplibre pini GPU'da konumlar; zoom/pan'de native sabit (kayma yok).
const PricePin = React.memo(({ pitch, selected, onSelect }: { pitch: Pitch; selected: boolean; onSelect: (p: Pitch) => void }) => {
  const priceLabel = pitch.totalPrice ? `~${pitch.totalPrice}₺` : (pitch.name.split(' ')[0] || 'Saha');
  return (
    <MapMarker longitude={pitch.coordinates!.lng} latitude={pitch.coordinates!.lat} anchor="bottom">
      <div className="oyna-mlpin" onClick={(e) => { e.stopPropagation(); onSelect(pitch); }}>
        {pitch.flashDiscount ? <div className="pin-flash">🔥 %{pitch.flashDiscount}</div> : null}
        <div className={`pin-bubble${selected ? ' selected' : ''}`}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill={selected ? '#000' : '#39FF14'}><circle cx="4" cy="4" r="4" /></svg>
          {pitch.originalPrice ? <span style={{ textDecoration: 'line-through', color: '#888', fontSize: 8, marginRight: 2 }}>₺{pitch.originalPrice}</span> : null}
          {priceLabel}
        </div>
        <div className={`pin-nub${selected ? ' selected' : ''}`} />
      </div>
    </MapMarker>
  );
});

// Nokta pini — uzak zoom görünümü. Fiyat yok; dokununca harita sahaya yakınlaşır
// ve pinler seçilebilir fiyat balonlarına dönüşür (aşamalı keşif).
const DotPin = React.memo(({ pitch, selected, onZoomInto }: { pitch: Pitch; selected: boolean; onZoomInto: (p: Pitch) => void }) => (
  <MapMarker longitude={pitch.coordinates!.lng} latitude={pitch.coordinates!.lat} anchor="center">
    <div
      className={`oyna-mldot${selected ? ' selected' : ''}`}
      role="button"
      aria-label={`${pitch.name} — yakınlaş`}
      onClick={(e) => { e.stopPropagation(); onZoomInto(pitch); }}
    >
      <div className="dot-core" />
    </div>
  </MapMarker>
));

const MapViewComponent = ({
  pitches, selectedPitch, onPitchSelect, onOpenDetail, center, userLocation,
  onLocate, onLocateError, regionBoundaries,
}: MapViewProps) => {
  const mapRef = React.useRef<MapRef | null>(null);
  const isFlyingRef = React.useRef(false);
  const carouselRef = React.useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = React.useRef(false);
  const webglOk = useMemo(() => isWebglAvailable(), []);
  const [locating, setLocating] = useState(false);
  // iOS: Apple/Google seçici; Android/Web doğrudan Google.
  const [directionsFor, setDirectionsFor] = useState<Pitch | null>(null);

  // Zoom'a bağlı pin modu: eşik altı nokta (fiyat gizli), üstü fiyat balonu.
  const [bubbleMode, setBubbleMode] = useState(true); // initialViewState zoom=13 ≥ eşik

  // Pin ölçeği React render'ı OLMADAN CSS değişkeniyle güncellenir — zoom
  // sırasında her karede setState jank üretirdi; CSS var'ı GPU'da ucuz.
  const applyPinScale = useCallback((zoom: number) => {
    const el = mapRef.current?.getMap()?.getContainer();
    if (!el) return;
    const dotScale = Math.min(1, Math.max(0.5, 0.5 + (zoom - 8) * (0.5 / 4.5)));
    const bubbleScale = Math.min(1, Math.max(0.88, 0.88 + (zoom - PIN_BUBBLE_ZOOM) * 0.08));
    el.style.setProperty('--oyna-dot-scale', dotScale.toFixed(3));
    el.style.setProperty('--oyna-bubble-scale', bubbleScale.toFixed(3));
  }, []);

  const handleZoomChange = useCallback((zoom: number) => {
    applyPinScale(zoom);
    setBubbleMode(zoom >= PIN_BUBBLE_ZOOM); // değer değişmezse React render atlar
  }, [applyPinScale]);

  // Nokta pinine dokunuş: seçim değil, sahaya yumuşak yakınlaşma — balonlar
  // görünür olduğu anda pinler seçilebilir hale gelir (aşamalı keşif).
  const zoomIntoPitch = useCallback((p: Pitch) => {
    const map = mapRef.current;
    if (!p.coordinates || !map) return;
    isFlyingRef.current = true;
    map.flyTo({
      center: [p.coordinates.lng, p.coordinates.lat],
      zoom: Math.max(map.getZoom() + 1.6, PIN_BUBBLE_ZOOM + 1.2),
      duration: 650,
    });
  }, []);

  const handleDirections = (p: Pitch) => {
    if (!p.coordinates) return;
    if (isIOSPlatform()) setDirectionsFor(p);
    else openDirections(p.coordinates.lat, p.coordinates.lng);
  };

  // Karuselde yalnız koordinatlı sahalar (haritadaki pinlerle birebir aynı sıra).
  const mapPitches = useMemo(
    () => pitches.filter((p) => p.coordinates?.lat && p.coordinates?.lng),
    [pitches],
  );

  const flyToPitch = (p: Pitch) => {
    const map = mapRef.current;
    if (!p.coordinates || !map) return;
    isFlyingRef.current = true;
    const z = Math.max(map.getZoom(), 15);
    map.flyTo({ center: [p.coordinates.lng, p.coordinates.lat], zoom: z, duration: 700 });
  };

  // Pin tap → seçim + uçuş + karuseli o karta kaydır (Airbnb çift yönlü senkron).
  const selectFromPin = (p: Pitch) => {
    onPitchSelect(p);
    flyToPitch(p);
    const idx = mapPitches.findIndex((x) => x.id === p.id);
    if (idx >= 0 && carouselRef.current) {
      programmaticScrollRef.current = true;
      const el = carouselRef.current.children[idx] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      setTimeout(() => { programmaticScrollRef.current = false; }, 650);
    }
  };

  // Karusel kaydırıldı → merkezdeki kart seçilir + harita ona uçar.
  const scrollDebounce = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCarouselScroll = () => {
    if (programmaticScrollRef.current) return;
    if (scrollDebounce.current) clearTimeout(scrollDebounce.current);
    scrollDebounce.current = setTimeout(() => {
      const c = carouselRef.current;
      if (!c) return;
      const mid = c.scrollLeft + c.clientWidth / 2;
      let best = 0; let bestDist = Infinity;
      Array.from(c.children).forEach((child, i) => {
        const el = child as HTMLElement;
        const elMid = el.offsetLeft + el.offsetWidth / 2;
        const d = Math.abs(elMid - mid);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      const p = mapPitches[best];
      if (p && p.id !== selectedPitch?.id) {
        onPitchSelect(p);
        flyToPitch(p);
      }
    }, 140);
  };

  const handleLocate = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const coords = await onLocate();
      isFlyingRef.current = true;
      mapRef.current?.flyTo({ center: [coords.lng, coords.lat], zoom: 15, duration: 800 });
    } catch (e) {
      onLocateError((e as { message?: string })?.message || 'Konum alınamadı. Konum iznini kontrol et.');
    } finally {
      setLocating(false);
    }
  };

  // Seçili bölge sınırları geldiğinde haritayı o sınırların kapsamına sığdır
  // (kullanıcının seçtiği ilçe/ilçeler kadraja gelir). Sınır imzası değişince bir kez.
  const boundsSig = useMemo(() => {
    if (!regionBoundaries?.features?.length) return '';
    return regionBoundaries.features.map((f) => (f.properties?.key as string) ?? '').sort().join('|');
  }, [regionBoundaries]);

  const mapReadyRef = React.useRef(false);
  // Seçili bölge sınırlarını kadraja sığdır (kenar boşluğuyla → sarı sınır İÇERİDE).
  const fitToBoundaries = useCallback(() => {
    const map = mapRef.current;
    if (!map || !regionBoundaries?.features?.length) return;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    const scan = (c: unknown): void => {
      if (typeof (c as number[])[0] === 'number') {
        const [lng, lat] = c as number[];
        if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
      } else { (c as unknown[]).forEach(scan); }
    };
    regionBoundaries.features.forEach((f) => f.geometry && scan((f.geometry as { coordinates: unknown }).coordinates));
    if (minLng !== Infinity) {
      isFlyingRef.current = true;
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, maxZoom: 13, duration: 700 });
    }
  }, [regionBoundaries]);

  // Sınır imzası değişince VE harita hazırsa sığdır (yarış koşulu yok).
  useEffect(() => {
    if (boundsSig && mapReadyRef.current) fitToBoundaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsSig]);

  // Merkez prop'u değişince (ilçe filtresi / bölge) yumuşak uçuş. İlk değeri
  // initialViewState koyar; bu efekt yalnız SONRAKİ değişimlerde uçar.
  const didInitCenter = React.useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!didInitCenter.current) { didInitCenter.current = true; return; }
    isFlyingRef.current = true;
    map.flyTo({ center: [center[1], center[0]], zoom: map.getZoom(), duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  const distanceLabel = (p: Pitch): string | null => {
    if (!userLocation || !p.coordinates) return null;
    const km = getHaversineDistance(userLocation.lat, userLocation.lng, p.coordinates.lat, p.coordinates.lng);
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  };

  const showCarousel = !!selectedPitch && mapPitches.length > 0;

  // WebGL yoksa (çok eski/zayıf cihaz) nazik fallback — harita çökmesin.
  if (!webglOk) {
    return (
      <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-3 px-8 text-center bg-[#0A0E14]">
        <MapPin size={30} className="text-white/20" />
        <p className="text-white/70 text-xs font-black uppercase tracking-wide">Harita bu cihazda desteklenmiyor</p>
        <p className="text-white/40 text-[11px] leading-relaxed">Sahaları liste görünümünde inceleyebilirsin.</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-0">
      <style>{OYNA_MAPLIBRE_CSS}</style>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: center[1], latitude: center[0], zoom: 13 }}
        mapStyle={OYNA_MAPLIBRE_STYLE}
        attributionControl={false}
        dragRotate={false}
        pitchWithRotate={false}
        touchZoomRotate={true}
        style={{ width: '100%', height: '100%' }}
        onClick={() => onPitchSelect(null)}
        onZoom={(e) => handleZoomChange(e.viewState.zoom)}
        onLoad={() => {
          mapReadyRef.current = true;
          handleZoomChange(mapRef.current?.getZoom() ?? 13);
          fitToBoundaries();
        }}
      >
        <AttributionControl compact position="bottom-right" />

        {/* Seçili bölgelerin idari sınırı — belirgin sarı çizgi (glow'lu) + çok hafif dolgu */}
        {regionBoundaries && regionBoundaries.features.length > 0 && (
          <MapSource id="oyna-regions" type="geojson" data={regionBoundaries}>
            <MapLayer id="oyna-regions-fill" type="fill" paint={{ 'fill-color': '#FFE100', 'fill-opacity': 0.035 }} />
            <MapLayer id="oyna-regions-glow" type="line" layout={{ 'line-join': 'round' }} paint={{ 'line-color': '#FFE100', 'line-width': 9, 'line-opacity': 0.18, 'line-blur': 6 }} />
            <MapLayer id="oyna-regions-line" type="line" layout={{ 'line-join': 'round', 'line-cap': 'round' }} paint={{ 'line-color': '#FFE100', 'line-width': 3, 'line-opacity': 1 }} />
          </MapSource>
        )}

        {/* Mavi nokta YALNIZ gerçek kullanıcı konumunda — harita merkezinde değil */}
        {userLocation && (
          <MapMarker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
            <div className="oyna-mluser"><div className="pulse" /><div className="dot" /></div>
          </MapMarker>
        )}

        {mapPitches.map((pitch) => (
          bubbleMode ? (
            <PricePin key={pitch.id} pitch={pitch} selected={selectedPitch?.id === pitch.id} onSelect={selectFromPin} />
          ) : (
            <DotPin key={pitch.id} pitch={pitch} selected={selectedPitch?.id === pitch.id} onZoomInto={zoomIntoPitch} />
          )
        ))}
      </MapGL>

      {/* Konumuma dön FAB — karusel açıkken üstüne çıkar */}
      <button
        onClick={handleLocate}
        aria-label="Konumuma dön"
        className={`absolute right-4 z-[500] w-12 h-12 rounded-full bg-[#0D111A]/90 border border-white/10 backdrop-blur-md flex items-center justify-center text-[#00D8FF] shadow-[0_6px_24px_rgba(0,0,0,0.6)] active:scale-90 transition-all duration-300 ${showCarousel ? 'bottom-[9.5rem]' : 'bottom-4'}`}
      >
        {locating ? <Loader2 size={20} className="animate-spin" /> : <LocateFixed size={20} />}
      </button>

      {/* ── Alt kart karuseli: pin ↔ kart çift yönlü senkron (Airbnb) ── */}
      <AnimatePresence>
        {showCarousel && (
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="absolute bottom-3 left-0 right-0 z-[490]"
          >
            <div
              ref={carouselRef}
              onScroll={onCarouselScroll}
              className="oyna-map-carousel flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory"
            >
              {mapPitches.map((p) => {
                const isSel = selectedPitch?.id === p.id;
                const dist = distanceLabel(p);
                return (
                  <div
                    key={p.id}
                    onClick={() => (isSel ? onOpenDetail(p) : selectFromPin(p))}
                    className={`shrink-0 w-[76%] max-w-[320px] snap-center rounded-3xl overflow-hidden cursor-pointer bg-[#0D111A]/95 backdrop-blur-xl border transition-all duration-200 ${
                      isSel
                        ? 'border-[#39FF14]/60 shadow-[0_10px_36px_rgba(0,0,0,0.7),0_0_20px_rgba(57,255,20,0.18)]'
                        : 'border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.6)] opacity-80'
                    }`}
                  >
                    <div className="flex gap-3 p-3 pb-2">
                      <div className="w-[64px] h-[64px] rounded-2xl overflow-hidden shrink-0 relative">
                        <SafeImage src={p.image} alt={p.name} variant="thumb" className="w-full h-full object-cover" />
                        {p.flashDiscount ? (
                          <div className="absolute top-1 left-1 bg-[#FF3B30] text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">🔥 %{p.flashDiscount}</div>
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-[12px] font-black italic uppercase text-white truncate">{p.name}</h4>
                          <span className="flex items-center gap-0.5 text-[10px] font-black text-[#FACC15] shrink-0">★ {p.rating}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] font-bold text-white/50">
                          <span className="truncate">{p.district}</span>
                          {dist && (
                            <span className="flex items-center gap-0.5 shrink-0 text-[#00D8FF]">
                              <MapPin size={9} /> {dist}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Aksiyon satırı kartın TAM genişliğinde — kırpılma yok */}
                    <div className="flex items-center justify-between gap-2 px-3 pb-3">
                      {p.totalPrice > 0 ? (
                        <span className="text-[14px] font-black text-[#39FF14] shrink-0">~{p.totalPrice}₺</span>
                      ) : (
                        <span className="text-[9px] font-bold text-white/35 shrink-0">Fiyat bilgisi yok</span>
                      )}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDirections(p); }}
                          aria-label="Yol tarifi"
                          className="w-7 h-7 rounded-xl bg-white/5 border border-white/15 text-white/70 flex items-center justify-center active:scale-95"
                        >
                          <Navigation2 size={12} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenDetail(p); }}
                          className="px-3 h-7 rounded-xl bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] text-[9px] font-black uppercase tracking-wide flex items-center gap-1 active:scale-95 whitespace-nowrap"
                        >
                          İncele <ChevronRight size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="shrink-0 w-3" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS yol tarifi seçici: Apple Maps / Google Maps */}
      <AnimatePresence>
        {directionsFor && directionsFor.coordinates && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[600] flex items-end justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setDirectionsFor(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="w-full bg-[#0D111A] border-t border-white/10 rounded-t-3xl p-5 pb-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-4" />
              <p className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-3">Yol Tarifi — {directionsFor.name}</p>
              <a
                href={appleMapsDirectionsUrl(directionsFor.coordinates.lat, directionsFor.coordinates.lng, directionsFor.name)}
                target="_blank" rel="noreferrer"
                onClick={() => setDirectionsFor(null)}
                className="flex items-center gap-3 h-13 px-4 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-[12px] font-black mb-2 active:scale-[0.98]"
              >
                 Apple Haritalar
              </a>
              <a
                href={googleMapsDirectionsUrl(directionsFor.coordinates.lat, directionsFor.coordinates.lng)}
                target="_blank" rel="noreferrer"
                onClick={() => setDirectionsFor(null)}
                className="flex items-center gap-3 h-13 px-4 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-[12px] font-black active:scale-[0.98]"
              >
                <MapIcon size={16} className="text-[#39FF14]" /> Google Haritalar
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


interface PitchDiscoveryProps {
  onBack: () => void;
  isSelectionMode?: boolean;
  onSelectTime?: (pitch: Pitch, court: Court, date: string, time: string) => void;
  onNavigate?: (view: string) => void;
}

// --- HELPERS ---

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_TR_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const WEEKDAY_HEADERS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const CALENDAR_MAX_DAYS = 90; // Karar #12: 3 ay ileri

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayOffsetFromToday = (d: Date) => Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86400000);

/** Favori/puan ayrımı: favori = büyük sarı yıldız (dolu/boş), puan = küçük altın yıldız */
const FavStar: React.FC<{ active: boolean; size?: number }> = ({ active, size = 18 }) => (
  <Star
    size={size}
    className={active ? 'fill-[#FFFF00] text-[#FFFF00]' : 'text-white'}
    strokeWidth={2}
  />
);

/** Görsel yoksa/kırıksa tasarımdaki yeşil gradient'e düşen güvenli görsel (Karar #11) */
const SafeImage: React.FC<{ src?: string; alt: string; className?: string; variant?: 'card' | 'detail' | 'thumb' }> = ({ src, alt, className, variant = 'card' }) => {
  const [failed, setFailed] = useState(false);
  const url = transformedImageUrl(src, variant);
  if (!url || failed) {
    return (
      <div className={`${className ?? ''} bg-[linear-gradient(160deg,#143a22_0%,#0b1f14_55%,#05080c_100%)] flex items-center justify-center`}>
        <Layers size={28} className="text-white/15" />
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />;
};

// --- COMPONENTS ---

/** Vitrin kartı — editoryal tam genişlik kart (tasarım 1a) */
const PitchCard: React.FC<{
  pitch: Pitch;
  isFavorite: boolean;
  onToggleFavorite: (pitch: Pitch) => void;
  onClick: (pitch: Pitch) => void;
}> = ({ pitch, isFavorite, onToggleFavorite, onClick }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="cursor-pointer"
      onClick={() => onClick(pitch)}
    >
      <div className="relative h-52 rounded-3xl overflow-hidden border border-white/5">
        <SafeImage src={pitch.image} alt={pitch.name} className="w-full h-full object-cover" variant="card" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent pointer-events-none" />

        {/* Rozetler: indirim + öne çıkan */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {pitch.flashDiscount ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600 text-[10px] font-black text-white shadow-md">
              🔥 %{pitch.flashDiscount} İNDİRİM
            </span>
          ) : null}
          {pitch.isFeatured && (
            <span className="px-2 py-1 rounded-lg bg-[#FFFF00] text-[10px] font-black text-black shadow-md uppercase">Öne Çıkan</span>
          )}
        </div>

        {/* Favori yıldızı */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(pitch); }}
          title={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center active:scale-90 transition-transform"
        >
          <FavStar active={isFavorite} />
        </button>

        {/* Mesafe */}
        {pitch.distance && (
          <div className="absolute left-3 bottom-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/50 backdrop-blur-md border border-white/10">
            <MapPin size={11} className="text-[#39FF14]" />
            <span className="text-[11px] font-extrabold text-white">{pitch.distance}</span>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between mt-3 gap-3">
        <h3 className="text-lg font-black italic uppercase tracking-tight leading-none text-white">{pitch.name}</h3>
        <div className="flex items-center gap-1 shrink-0">
          <Star size={12} className="fill-[#FACC15] text-[#FACC15]" />
          <span className="text-sm font-extrabold text-white">{pitch.rating.toFixed(1)}</span>
          {pitch.googleReviews > 0 && (
            <span className="text-xs font-medium text-white/45">({pitch.googleReviews})</span>
          )}
        </div>
      </div>
      <p className="mt-1 text-[13px] font-medium text-white/55">{pitch.district}</p>

      <div className="mt-2.5 flex items-end justify-between">
        <div>
          <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-white/40 mb-0.5">Ort. Saatlik</span>
          <span className="flex items-baseline gap-2">
            <span className={`text-lg font-black ${pitch.originalPrice ? 'text-[#39FF14]' : 'text-white'}`}>~₺{pitch.totalPrice}</span>
            {pitch.originalPrice && (
              <span className="text-[13px] font-semibold text-white/35 line-through">₺{pitch.originalPrice}</span>
            )}
          </span>
        </div>
        {pitch.todayAvailableCount !== undefined && (
          pitch.todayAvailableCount > 0 ? (
            <span className="px-3 py-2 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/35 text-[#39FF14] text-[11px] font-black">
              Bugün {pitch.todayAvailableCount} saat müsait
            </span>
          ) : (
            <span className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[11px] font-black">
              Bugün dolu
            </span>
          )
        )}
      </div>
    </motion.div>
  );
};

const DISTRICT_COORDINATES: Record<string, [number, number]> = ORDU_DISTRICTS;

const PitchDiscovery: React.FC<PitchDiscoveryProps> = ({ onBack, isSelectionMode, onSelectTime, onNavigate }) => {
  const {
    userLocation,
    setUserLocation,
    activeRegion,
    selectedRegions,
    addUserNotification,
    setBookingPitch,
    setBookingCourt,
    setBookingDate,
    setBookingSlot,
    setBookingPrice,
    setBookingDeposit,
    navigateTo,
    setPaymentContext,
  } = useAppStore();

  // Canlı saha verisi (onaylı + açık + yayında). Mock'a düşme — vitrin yalnızca gerçek veriyi gösterir.
  const [realPitches, setRealPitches] = useState<Pitch[]>([]);
  const [pitchesLoading, setPitchesLoading] = useState(true);
  const [pitchesError, setPitchesError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [todayAvailability, setTodayAvailability] = useState<Record<string, number>>({});

  const showActionError = (msg: string) => {
    setActionError(msg);
    setTimeout(() => setActionError(null), 4000);
  };

  const fetchPitches = useCallback(async () => {
    setPitchesLoading(true);
    setPitchesError(null);
    try {
      const [pitchRes, dealRes] = await Promise.all([
        supabase
          .from('pitches')
          .select('*, courts(id, name, court_type, surface, price, is_active, description, images, lighting_grade, grass_grade, locker_grade, grades_status, capacity), pitch_tariffs(*)')
          .eq('verification_status', 'approved')
          .eq('is_open', true)
          .eq('is_published', true),
        supabase
          .from('pitch_flash_deals')
          .select('id, pitch_id, discount_percent, expires_at, is_claimed')
          .eq('is_claimed', false)
          .gt('expires_at', new Date().toISOString()),
      ]);

      if (pitchRes.error) throw pitchRes.error;

      const rows = (pitchRes.data ?? []) as unknown as DbPitchRow[];
      const flashByPitch: Record<string, { id: string; discount: number }> = {};
      ((dealRes.data ?? []) as { id: string; pitch_id: string; discount_percent: number }[]).forEach((d) => {
        const existing = flashByPitch[d.pitch_id];
        if (!existing || d.discount_percent > existing.discount) {
          flashByPitch[d.pitch_id] = { id: d.id, discount: d.discount_percent };
        }
      });

      const mapped = rows.map((r) => mapDbPitchToUiPitch(r, flashByPitch[r.id]));
      setRealPitches(mapped);
      void loadTodayAvailability(mapped);
    } catch (err) {
      console.error('PitchDiscovery fetch:', err);
      setRealPitches([]);
      setPitchesError('Sahalar yüklenemedi. Lütfen tekrar dene.');
    } finally {
      setPitchesLoading(false);
    }
  }, []);

  /**
   * "Bugün X saat müsait" rozeti (Karar #7): tüm sahaların bugünkü rezervasyonları
   * TEK sorguda çekilir; bir slot, tesisteki kortlardan en az biri boşsa müsait sayılır.
   */
  const loadTodayAvailability = async (pitches: Pitch[]) => {
    try {
      const today = todayISO();
      const { data, error } = await supabase
        .from('pitch_bookings')
        .select('pitch_id, court_id, start_time, status')
        .eq('booking_date', today)
        .neq('status', 'CANCELLED');
      if (error) throw error;
      const byPitch: Record<string, Record<string, number>> = {};
      (data ?? []).forEach((b: { pitch_id: string; start_time: string }) => {
        const t = b.start_time.slice(0, 5);
        byPitch[b.pitch_id] = byPitch[b.pitch_id] ?? {};
        byPitch[b.pitch_id][t] = (byPitch[b.pitch_id][t] ?? 0) + 1;
      });
      const nowHour = new Date().getHours();
      const result: Record<string, number> = {};
      pitches.forEach((p) => {
        const courtCount = Math.max(1, p.courts?.length ?? 1);
        const ranges = generateSlotRanges(p.workingHours);
        const booked = byPitch[p.id] ?? {};
        result[p.id] = ranges.filter((r) => {
          const h = parseInt(r.startTime.split(':')[0], 10);
          const isFuture = h >= nowHour || h < 6; // gece 00-06 ertesi güne sarkan saatler
          return isFuture && (booked[r.startTime] ?? 0) < courtCount;
        }).length;
      });
      setTodayAvailability(result);
    } catch (e) {
      console.warn('Bugünkü müsaitlik hesaplanamadı:', e);
    }
  };

  useEffect(() => {
    fetchPitches();
  }, [fetchPitches]);

  const sourcePitches = useMemo(
    () => realPitches.map((p) => ({ ...p, todayAvailableCount: todayAvailability[p.id] })),
    [realPitches, todayAvailability],
  );

  const [viewMode, setViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPitch, setSelectedPitch] = useState<Pitch | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [selectedPlacement, setSelectedPlacement] = useState<'OPEN' | 'CLOSED'>('CLOSED');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(0); // bugünden gün farkı (0 = bugün)
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'GUNDUZ' | 'GECE'>('ALL');
  const [bookings, setBookings] = useState<PitchBookingRow[]>([]);

  useEffect(() => {
    if (!selectedPitch) {
      setBookings([]);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const data = await fetchPitchBookings(selectedPitch.id);
        if (active) setBookings(data);
      } catch (e) {
        console.error('Error fetching bookings:', e);
        showActionError('Müsaitlik bilgisi yüklenemedi. Lütfen tekrar dene.');
      }
    };
    load();
    const unsubscribe = subscribeToPitchBookings(selectedPitch.id, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [selectedPitch]);

  // ── Filtreler ───────────────────────────────────────────────────────────
  // maxPrice=null → fiyat limiti yok (varsayılan). Sınırlar gerçek veriden
  // türetilir (priceBounds); sabit 4000₺ tavanı kaldırıldı.
  const [filters, setFilters] = useState<{
    district: string;
    minRating: number;
    maxPrice: number | null;
    hasAmenities: string[];
    type: 'Tümü' | 'Kapalı' | 'Açık';
    availability: 'Tümü' | 'Bugün';
  }>({
    district: 'Tümü',
    minRating: 0,
    maxPrice: null,
    hasAmenities: [],
    type: 'Tümü',
    availability: 'Tümü',
  });
  const [sortOrder, setSortOrder] = useState<'DEFAULT' | 'PRICE_ASC' | 'RATING_DESC' | 'DISTANCE_ASC'>('DEFAULT');
  const [onlyDiscounted, setOnlyDiscounted] = useState(false);

  const resetAllFilters = useCallback(() => {
    setFilters({ district: 'Tümü', minRating: 0, maxPrice: null, hasAmenities: [], type: 'Tümü', availability: 'Tümü' });
    setSortOrder('DEFAULT');
    setOnlyDiscounted(false);
  }, []);

  // Header'daki filtre rozetinde gösterilen aktif filtre sayısı (sıralama hariç).
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.district !== 'Tümü') n += 1;
    if (filters.maxPrice != null) n += 1;
    if (filters.minRating > 0) n += 1;
    if (filters.type !== 'Tümü') n += 1;
    n += filters.hasAmenities.length;
    if (filters.availability === 'Bugün') n += 1;
    if (onlyDiscounted) n += 1;
    return n;
  }, [filters, onlyDiscounted]);

  // ── Kalıcı favoriler (Karar #3-4) ─────────────────────────────────────────
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favOnly, setFavOnly] = useState(false);

  useEffect(() => {
    fetchMyFavoritePitchIds().then(setFavorites).catch(() => undefined);
  }, []);

  const toggleFavorite = async (pitch: Pitch) => {
    if (!auth.currentUser?.uid) {
      showActionError('Favorilere eklemek için giriş yapmalısın.');
      return;
    }
    const wasFavorite = favorites.has(pitch.id);
    setFavorites(prev => {
      const n = new Set(prev);
      if (wasFavorite) n.delete(pitch.id); else n.add(pitch.id);
      return n;
    });
    if (navigator.vibrate) navigator.vibrate(18);
    try {
      await togglePitchFavorite(pitch.id, wasFavorite);
    } catch (e) {
      // Sunucu reddetti — optimistic durumu geri al
      setFavorites(prev => {
        const n = new Set(prev);
        if (wasFavorite) n.add(pitch.id); else n.delete(pitch.id);
        return n;
      });
      showActionError('Favori güncellenemedi. Lütfen tekrar dene.');
    }
  };

  // Harita merkezi fallback zinciri (ORDU_CENTER sabiti KALDIRILDI):
  // gerçek konum → seçili ilçe → activeRegion şehir merkezi → sonuçtaki ilk
  // koordinatlı saha → (son çare) ülke merkezi. Yanlış şehir gösterilmez.
  const regionFallbackCenter = useCallback((): [number, number] => {
    if (activeRegion?.coordinates) return [activeRegion.coordinates.lat, activeRegion.coordinates.lng];
    const firstWithCoords = sourcePitches.find((p) => p.coordinates?.lat && p.coordinates?.lng);
    if (firstWithCoords?.coordinates) return [firstWithCoords.coordinates.lat, firstWithCoords.coordinates.lng];
    return [39.0, 35.0]; // Türkiye geneli — nadir son çare
  }, [activeRegion, sourcePitches]);

  const [mapCenter, setMapCenter] = useState<[number, number]>(
    userLocation ? [userLocation.lat, userLocation.lng] : regionFallbackCenter(),
  );

  useEffect(() => {
    if (userLocation) setMapCenter([userLocation.lat, userLocation.lng]);
  }, [userLocation]);

  useEffect(() => {
    if (filters.district !== 'Tümü' && DISTRICT_COORDINATES[filters.district]) {
      setMapCenter(DISTRICT_COORDINATES[filters.district]);
    } else if (userLocation) {
      setMapCenter([userLocation.lat, userLocation.lng]);
    } else {
      setMapCenter(regionFallbackCenter());
    }
  }, [filters.district, userLocation, regionFallbackCenter]);

  // FAB: cihaz konumunu iste, store'a yaz, koordinatı döndür (harita uçar).
  const handleLocate = useCallback(async () => {
    const coords = await requestDeviceLocation();
    setUserLocation({ lat: coords.lat, lng: coords.lng });
    return { lat: coords.lat, lng: coords.lng };
  }, [setUserLocation]);

  // ── Bölge kapsama + idari sınırlar (region_coverage) ──────────────────────
  const [coverage, setCoverage] = useState<RegionCoverage[]>([]);
  useEffect(() => { fetchActiveCoverage().then(setCoverage).catch(() => setCoverage([])); }, []);

  // Seçili bölgelerin sınır GeoJSON'u (sarı çizgi). İl seçilmişse o ilin tüm
  // aktif ilçe sınırları; ilçe seçilmişse yalnız o ilçe.
  const regionBoundaries = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (selectedRegions.length === 0 || coverage.length === 0) return null;
    const wanted = coverage.filter((c) => c.boundary && selectedRegions.some((r) =>
      r.district ? (c.city === r.city && c.district === r.district) : (c.city === r.city),
    ));
    if (wanted.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: wanted.map((c) => ({
        type: 'Feature',
        properties: { key: `${c.city}/${c.district ?? ''}` },
        geometry: c.boundary as unknown as GeoJSON.Geometry,
      })),
    };
  }, [selectedRegions, coverage]);

  const handleOpenDetail = (pitch: Pitch) => {
    setSelectedPitch(pitch);
    setIsDetailOpen(true);
    const placements = new Set((pitch.courts ?? []).map(c => c.type));
    const initialPlacement: 'OPEN' | 'CLOSED' = placements.has('CLOSED') ? 'CLOSED' : 'OPEN';
    setSelectedPlacement(initialPlacement);
    setSelectedCourtId(pitch.courts?.find(c => c.type === initialPlacement)?.id ?? pitch.courts?.[0]?.id ?? null);
    setSelectedSlot(null);
    setSelectedDate(0);
    setCalendarOpen(false);
    setCalendarMonth({ y: new Date().getFullYear(), m: new Date().getMonth() });
    if (pitch.coordinates?.lat && pitch.coordinates?.lng) {
      setMapCenter([pitch.coordinates.lat, pitch.coordinates.lng]);
    }
    void recordPitchView(pitch.id);
  };

  // ── Kapalı/Açık gruplaması (Karar #10): tip seçilir, kort otomatik atanır ──
  const courtsByPlacement = useMemo(() => {
    const groups: Record<'OPEN' | 'CLOSED', Court[]> = { OPEN: [], CLOSED: [] };
    (selectedPitch?.courts ?? []).forEach(c => groups[c.type].push(c));
    return groups;
  }, [selectedPitch]);

  const placementCourts = courtsByPlacement[selectedPlacement];

  const selectedCourt = useMemo(() => {
    if (!selectedPitch || !selectedCourtId) return null;
    return selectedPitch.courts?.find(c => c.id === selectedCourtId) || null;
  }, [selectedPitch, selectedCourtId]);

  const selectedDateISO = useMemo(() => {
    const dateObj = new Date();
    dateObj.setDate(dateObj.getDate() + selectedDate);
    return toISODate(dateObj);
  }, [selectedDate]);

  /**
   * Seçili gün + saha tipi için birleşik slot listesi: bir saat, o tipteki
   * kortlardan en az biri boşsa müsait; müsait ilk kort o saate otomatik atanır.
   */
  const mergedSlots = useMemo(() => {
    if (!selectedPitch || placementCourts.length === 0) return [];
    const perCourt = placementCourts.map(court => ({
      court,
      slots: computeAvailability(selectedPitch, selectedDateISO, bookings, court.id),
    }));
    const base = perCourt[0].slots;
    return base.map((slot, idx) => {
      const freeEntry = perCourt.find(pc => pc.slots[idx]?.status === 'available');
      const anyPending = perCourt.some(pc => pc.slots[idx]?.status === 'pending');
      return {
        label: slot.label,
        startTime: slot.startTime,
        price: freeEntry?.slots[idx]?.price ?? slot.price,
        deposit: freeEntry?.slots[idx]?.deposit ?? slot.deposit,
        status: freeEntry ? 'available' : (anyPending ? 'pending' : slot.status === 'closed' ? 'closed' : 'booked'),
        assignedCourtId: freeEntry?.court.id ?? null,
      };
    });
  }, [selectedPitch, placementCourts, selectedDateISO, bookings]);

  const filteredSlots = useMemo(() => mergedSlots.filter(s => {
    const hour = parseInt(s.startTime.split(':')[0], 10);
    if (timeFilter === 'GUNDUZ') return hour >= 6 && hour < 18;
    if (timeFilter === 'GECE') return hour >= 18 || hour < 6;
    return true;
  }), [mergedSlots, timeFilter]);

  const selectedSlotQuote = useMemo(() => {
    if (!selectedPitch || !selectedSlot) return null;
    const { startTime } = parseSlotLabel(selectedSlot);
    const fromTariff = resolveTariffForSlot(selectedPitch.tariffs, selectedDateISO, startTime);
    // Karar #16: işletmenin tarifedeki kaporası öncelikli; yoksa %30 (10₺'ye yuvarlı)
    const fallbackDeposit = (price: number) => Math.round(price * 0.3 / 10) * 10;
    if (fromTariff) {
      return { ...fromTariff, deposit: fromTariff.deposit > 0 ? fromTariff.deposit : fallbackDeposit(fromTariff.price) };
    }
    const hit = mergedSlots.find((s) => s.label === selectedSlot);
    const price = hit?.price ?? selectedCourt?.price ?? selectedPitch.totalPrice;
    const deposit = hit?.deposit && hit.deposit > 0 ? hit.deposit : fallbackDeposit(price);
    return { price, deposit };
  }, [selectedPitch, selectedSlot, selectedDateISO, mergedSlots, selectedCourt]);

  const persistBookingSelection = () => {
    if (!selectedPitch || !selectedCourt || !selectedSlot || !selectedSlotQuote) return;
    setBookingPitch(selectedPitch);
    setBookingCourt(selectedCourt);
    setBookingDate(selectedDateISO);
    setBookingSlot(selectedSlot);
    setBookingPrice(selectedSlotQuote.price);
    setBookingDeposit(selectedSlotQuote.deposit);
  };

  // Kapora ödemesi → birleşik ödeme ekranı (tasarım 1b, bağlam: SAHA KİRALAMA).
  // Kart zorunluluğu ön kapısı kalktı: kart ekleme artık ödeme ekranının içinde.
  const handlePayDeposit = () => {
    if (!selectedSlot || !selectedCourtId || !selectedPitch || !selectedCourt || !selectedSlotQuote) return;
    persistBookingSelection();
    setIsDetailOpen(false);
    const prettyDate = (() => {
      try { return new Date(`${selectedDateISO}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }); }
      catch { return selectedDateISO; }
    })();
    setPaymentContext({
      kind: 'PITCH_DEPOSIT',
      badge: 'SAHA KİRALAMA',
      title: selectedPitch.name,
      subtitle: `${selectedCourt.name} · ${selectedDateISO} · ${selectedSlot}`,
      details: [
        { icon: 'court', text: selectedCourt.name },
        { icon: 'calendar', text: prettyDate },
        { icon: 'clock', text: selectedSlot },
      ],
      amount: selectedSlotQuote.deposit,
      amountLabel: 'Ödenecek Kapora',
      amountHint: `Saha ücreti ${selectedSlotQuote.price.toLocaleString('tr-TR')}₺ · kalan tesiste ödenir`,
      isDeposit: true,
      allowBalance: true,
      successTitle: 'Kapora Onaylandı!',
      successSubtitle: 'Rezervasyon güvende',
      infoNote: 'Kapora rezervasyonunu güvenceye alır. İptal koşulları tesis politikasına göre uygulanır.',
    });
    navigateTo('PAYMENT');
  };

  const handleReportContent = async () => {
    if (!selectedPitch) return;
    const reason = window.prompt('Bu tesisin içeriğinde (fotoğraf/açıklama) sorun mu var? Kısaca belirt:');
    if (!reason?.trim()) return;
    try {
      await reportPitchContent(selectedPitch.id, reason.trim(), selectedPitch.ownerId);
      addUserNotification({
        id: `report-${Date.now()}`,
        title: 'Bildirim Alındı',
        desc: 'İçerik bildirimi moderasyon ekibine iletildi.',
        time: 'Şimdi',
        type: 'success',
        iconName: 'CheckCircle',
        color: 'bg-[#39FF14]',
        textColor: 'text-[#39FF14]',
      });
    } catch {
      showActionError('Bildirim gönderilemedi. Lütfen tekrar dene.');
    }
  };

  // ── Filtre seçenekleri GERÇEK veriden türetilir (boş seçenek üretilmez) ────
  const districtOptions = useMemo(() => {
    const counts = new Map<string, number>();
    sourcePitches.forEach(p => {
      if (!p.district) return;
      counts.set(p.district, (counts.get(p.district) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [sourcePitches]);

  // Fiyat aralığı: vitrindeki gerçek en düşük/en yüksek ort. saatlik fiyat (50₺ adım).
  const priceBounds = useMemo(() => {
    const prices = sourcePitches.map(p => p.totalPrice).filter(v => v > 0);
    if (prices.length === 0) return null;
    const min = Math.floor(Math.min(...prices) / 50) * 50;
    const max = Math.ceil(Math.max(...prices) / 50) * 50;
    return { min, max: max > min ? max : min + 50 };
  }, [sourcePitches]);

  // Olanaklar: tüm sahaların birleşimi + kaç tesiste bulunduğu (katalog ikonuyla).
  const amenityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    sourcePitches.forEach(p => {
      const seen = new Set<string>();
      (p.amenities ?? []).forEach(raw => {
        const v = normalizeAmenity(raw);
        if (seen.has(v)) return;
        seen.add(v);
        counts.set(v, (counts.get(v) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count, icon: getAmenityDef(value)?.icon ?? null }));
  }, [sourcePitches]);

  const typeCounts = useMemo(() => ({
    'Kapalı': sourcePitches.filter(p => p.courts?.some(c => c.type === 'CLOSED')).length,
    'Açık': sourcePitches.filter(p => p.courts?.some(c => c.type === 'OPEN')).length,
  }), [sourcePitches]);

  const todayCount = useMemo(
    () => sourcePitches.filter(p => (p.todayAvailableCount ?? 0) > 0).length,
    [sourcePitches],
  );
  const discountCount = useMemo(
    () => sourcePitches.filter(p => p.flashDiscount).length,
    [sourcePitches],
  );

  // Çoklu bölge üyeliği: seçili bölgelerden herhangi biri sahayı kapsıyor mu?
  // ilçe seçiliyse ilçe eşleşir; il geneli seçiliyse il (ya da o ilin ilçeleri).
  const pitchInSelectedRegions = useCallback((p: { city?: string; district: string }) => {
    if (selectedRegions.length === 0) return true;
    return selectedRegions.some(r => {
      if (r.district) return p.district === r.district;
      if (p.city) return p.city === r.city;
      const cityDistricts = TURKEY_REGIONS.find(t => t.city === r.city)?.districts ?? [];
      return cityDistricts.includes(p.district);
    });
  }, [selectedRegions]);

  const filteredPitches = useMemo(() => {
    let result = sourcePitches.filter(p => {
      if (p.isApproved === false) return false;
      if (favOnly && !favorites.has(p.id)) return false;
      if (onlyDiscounted && !p.flashDiscount) return false;
      if (!pitchInSelectedRegions(p)) return false;

      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.district.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDistrict = filters.district === 'Tümü' || p.district === filters.district;
      const matchesRating = p.rating >= filters.minRating;
      // maxPrice=null → limit yok. Fiyatı bilinmeyen (0₺) sahalar limitten elenmez.
      const matchesPrice = filters.maxPrice == null || p.totalPrice <= filters.maxPrice;
      const matchesAvailability = filters.availability !== 'Bugün' || (p.todayAvailableCount ?? 1) > 0;

      // Seçili olanakların TAMAMI tesiste bulunmalı (kanonik yazımla karşılaştır).
      let matchesAmenities = true;
      if (filters.hasAmenities.length > 0) {
        const pitchAmenities = new Set((p.amenities ?? []).map(normalizeAmenity));
        matchesAmenities = filters.hasAmenities.every(a => pitchAmenities.has(a));
      }

      let matchesType = true;
      if (filters.type === 'Kapalı') {
        matchesType = p.courts?.some(c => c.type === 'CLOSED') || false;
      } else if (filters.type === 'Açık') {
        matchesType = p.courts?.some(c => c.type === 'OPEN') || false;
      }

      return matchesSearch && matchesDistrict && matchesRating && matchesPrice && matchesType && matchesAvailability && matchesAmenities;
    }).map(p => {
      if (p.coordinates?.lat && p.coordinates?.lng) {
        const dist = getHaversineDistance(mapCenter[0], mapCenter[1], p.coordinates.lat, p.coordinates.lng);
        return {
          ...p,
          distance: `${dist.toFixed(1)} km`
        };
      }
      return p;
    });

    if (sortOrder === 'PRICE_ASC') {
      result.sort((a, b) => a.totalPrice - b.totalPrice);
    } else if (sortOrder === 'RATING_DESC') {
      result.sort((a, b) => b.rating - a.rating);
    } else if (sortOrder === 'DISTANCE_ASC') {
      result.sort((a, b) => {
        const da = parseFloat(a.distance) || 999;
        const db = parseFloat(b.distance) || 999;
        return da - db;
      });
    }

    // Öne çıkanlar her sıralamada üstte (Karar #23)
    result.sort((a, b) => Number(b.isFeatured ?? false) - Number(a.isFeatured ?? false));

    return result;
  }, [sourcePitches, searchQuery, filters, sortOrder, mapCenter, favOnly, favorites, onlyDiscounted, pitchInSelectedRegions]);

  // Haritanın pin kaynağı: bölge seçiliyse bölge-filtreli sahalar; bölge yoksa
  // GÜNCEL KONUM çevresi (30 km); konum da yoksa mevcut liste (kullanıcı kararı).
  const mapPins = useMemo(() => {
    const withCoords = filteredPitches.filter((p) => p.coordinates?.lat && p.coordinates?.lng);
    if (selectedRegions.length > 0) return withCoords;
    if (userLocation) {
      return withCoords.filter((p) =>
        getHaversineDistance(userLocation.lat, userLocation.lng, p.coordinates!.lat, p.coordinates!.lng) <= 30,
      );
    }
    return withCoords;
  }, [filteredPitches, selectedRegions, userLocation]);

  // ── Takvim ızgarası (Karar #12: bugün + 90 gün) ────────────────────────────
  const calendarWeeks = useMemo(() => {
    const { y, m } = calendarMonth;
    const first = new Date(y, m, 1);
    const startWd = (first.getDay() + 6) % 7; // Pzt=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const rows = Math.ceil((startWd + daysInMonth) / 7);
    const gridStart = new Date(y, m, 1 - startWd);
    const weeks: { date: Date; inMonth: boolean; offset: number }[][] = [];
    for (let w = 0; w < rows; w++) {
      const days: { date: Date; inMonth: boolean; offset: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + w * 7 + i);
        days.push({ date: d, inMonth: d.getMonth() === m, offset: dayOffsetFromToday(d) });
      }
      weeks.push(days);
    }
    return weeks;
  }, [calendarMonth]);

  const now = new Date();
  const currentMonthIdx = now.getFullYear() * 12 + now.getMonth();
  const calMonthIdx = calendarMonth.y * 12 + calendarMonth.m;
  const maxMonthIdx = currentMonthIdx + 3;

  const selectedDateObj = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + selectedDate);
    return d;
  }, [selectedDate]);

  // Onaylı kalite notları (Karar #2, #11): seçili tipteki ilk onaylı korttan
  const approvedGrades = useMemo(() => {
    const graded = placementCourts.find(c => c.gradesStatus === 'approved' && (c.lightingGrade || c.grassGrade));
    if (!graded) return null;
    return { lighting: graded.lightingGrade, grass: graded.grassGrade };
  }, [placementCourts]);

  const amenitySplit = useMemo(() => splitAmenities(selectedPitch?.amenities ?? []), [selectedPitch]);

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col font-sans overflow-hidden">

      {/* Header Section */}
      <header className="px-6 pt-safe pb-3 bg-gradient-to-b from-[#0A0E14] to-transparent sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            {isSelectionMode && (
              <button
                onClick={onBack}
                className="mb-2 w-10 h-10 rounded-full bg-[#161B22] border border-white/5 flex items-center justify-center text-white"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h1 className="mt-1 text-[32px] font-black italic uppercase tracking-[-0.04em] leading-[0.9]">
              Saha<br />Vitrini
            </h1>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-[13px] p-[3px]">
              <button
                onClick={() => setViewMode('LIST')}
                className={`px-3 py-[7px] rounded-[10px] text-[10px] font-black flex items-center gap-1 transition-all ${viewMode === 'LIST' ? 'bg-[#FFFF00] text-black' : 'text-white/50'}`}
              >
                <LayoutGrid size={11} /> Liste
              </button>
              <button
                onClick={() => setViewMode('MAP')}
                className={`px-3 py-[7px] rounded-[10px] text-[10px] font-black flex items-center gap-1 transition-all ${viewMode === 'MAP' ? 'bg-[#FFFF00] text-black' : 'text-white/50'}`}
              >
                <MapIcon size={11} /> Harita
              </button>
            </div>
            <div className="flex gap-2">
              {/* Favori filtresi: kapalıyken yıldız BOŞ, açılınca dolar ve yalnız favoriler listelenir */}
              <button
                onClick={() => setFavOnly(v => !v)}
                title={favOnly ? 'Tüm sahaları göster' : 'Favori sahaları göster'}
                aria-pressed={favOnly}
                className={`relative w-10 h-10 rounded-[13px] flex items-center justify-center transition-all border ${
                  favOnly
                    ? 'bg-[#FFFF00]/15 border-[#FFFF00] shadow-[0_0_14px_rgba(255,255,0,0.4)]'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <Star
                  size={19}
                  strokeWidth={2}
                  className={`transition-colors ${favOnly ? 'fill-[#FFFF00] text-[#FFFF00]' : 'fill-transparent text-[#FFFF00]/80'}`}
                />
                {favorites.size > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-lg bg-[#39FF14] text-black text-[9px] font-black flex items-center justify-center border-2 border-[#0A0E14]">
                    {favorites.size}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowFilters(true)}
                title="Filtrele"
                className={`relative w-10 h-10 rounded-[13px] border flex items-center justify-center transition-all ${
                  activeFilterCount > 0 ? 'bg-[#FFFF00]/15 border-[#FFFF00]/60 text-[#FFFF00]' : 'bg-white/5 border-white/10'
                }`}
              >
                <Filter size={17} />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-lg bg-[#FFFF00] text-black text-[9px] font-black flex items-center justify-center border-2 border-[#0A0E14]">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative group mt-4">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-[#FFFF00] transition-colors">
            <Search size={17} />
          </div>
          <input
            type="text"
            placeholder="Saha veya bölge ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 bg-[#161B22] border border-white/5 rounded-2xl pl-12 pr-5 text-sm font-bold outline-none focus:border-[#FFFF00]/50 focus:bg-[#1C232B] transition-all shadow-inner"
          />
        </div>

      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 pb-32 custom-scrollbar">
        {viewMode === 'LIST' ? (
          <div>
            <div className="flex justify-between items-center mb-5 mt-1">
              <h2 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">
                {favOnly ? `${filteredPitches.length} FAVORİ SAHA` : `${filteredPitches.length} TESİS BULUNDU`}
              </h2>
              {filters.district !== 'Tümü' && (
                <span className="text-[10px] font-black text-[#FFFF00] bg-[#FFFF00]/10 px-2 py-1 rounded-lg">
                  {filters.district}
                </span>
              )}
            </div>

            {!pitchesLoading && !pitchesError && (
              <div className="space-y-7 pb-8">
                <AnimatePresence mode="popLayout">
                  {filteredPitches.map((pitch) => (
                    <PitchCard
                      key={pitch.id}
                      pitch={pitch}
                      isFavorite={favorites.has(pitch.id)}
                      onToggleFavorite={toggleFavorite}
                      onClick={() => handleOpenDetail(pitch)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {pitchesLoading ? (
              <LoadingState message="Sahalar yükleniyor..." />
            ) : pitchesError ? (
              <ErrorState message={pitchesError} onRetry={fetchPitches} />
            ) : filteredPitches.length === 0 ? (
              favOnly && favorites.size === 0 ? (
                /* Boş favori durumu (tasarım 1a) */
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <Star size={40} strokeWidth={1.6} className="text-white/25" />
                  <h3 className="mt-4 text-[15px] font-extrabold text-white/70">Henüz favori saha yok</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/40 max-w-xs">
                    Kartların üstündeki yıldıza dokunarak sahaları favorilerine ekle, sonra buradan hızlıca ulaş.
                  </p>
                  <button
                    onClick={() => setFavOnly(false)}
                    className="mt-6 text-[#FFFF00] text-[10px] font-black uppercase tracking-widest underline"
                  >
                    TÜM SAHALARI GÖSTER
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-[#161B22] rounded-full flex items-center justify-center mb-4 border border-white/5">
                    <Search size={32} className="text-gray-600" />
                  </div>
                  <h3 className="text-lg font-black italic text-white">SONUÇ BULUNAMADI</h3>
                  <p className="text-gray-500 text-xs mt-2">Filtreleri temizleyip tekrar dene.</p>
                  <button
                    onClick={() => {
                      resetAllFilters();
                      setSearchQuery('');
                      setFavOnly(false);
                    }}
                    className="mt-6 text-[#FFFF00] text-[10px] font-black uppercase tracking-widest underline"
                  >
                    FİLTRELERİ SIFIRLA
                  </button>
                </div>
              )
            ) : null}
          </div>
        ) : (
          <div className="w-full h-[calc(100vh-250px)] relative rounded-[40px] overflow-hidden border border-white/5 shadow-2xl">
            <MapViewComponent
              pitches={mapPins}
              selectedPitch={selectedPitch}
              onPitchSelect={setSelectedPitch}
              onOpenDetail={handleOpenDetail}
              center={mapCenter}
              userLocation={userLocation}
              onLocate={handleLocate}
              onLocateError={showActionError}
              regionBoundaries={regionBoundaries}
            />
          </div>
        )}
      </main>

      {/* ── Filtre sheet: TÜM seçenekler gerçek vitrin verisinden türetilir ── */}
      <AnimatePresence>
        {showFilters && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFilters(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-[#161B22] border-t border-white/10 rounded-t-[36px] shadow-2xl max-h-[88vh] flex flex-col overflow-hidden"
            >
              {/* Başlık — sabit */}
              <div className="shrink-0 px-7 pt-4 pb-2">
                <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-5" />
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">FİLTRELE</h2>
                  <div className="flex items-center gap-2">
                    {(activeFilterCount > 0 || sortOrder !== 'DEFAULT') && (
                      <button
                        onClick={resetAllFilters}
                        className="px-3 h-9 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 active:scale-95 transition-transform"
                      >
                        Temizle
                      </button>
                    )}
                    <button
                      onClick={() => setShowFilters(false)}
                      className="w-9 h-9 bg-[#0A0E14] rounded-full flex items-center justify-center text-gray-400"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* İçerik — kaydırılır */}
              <div className="flex-1 overflow-y-auto custom-scrollbar px-7 pt-5 pb-6 space-y-8">
                {/* Sıralama */}
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">SIRALAMA</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['DEFAULT', 'Önerilen'],
                      ['DISTANCE_ASC', 'En Yakın'],
                      ['PRICE_ASC', 'En Uygun Fiyat'],
                      ['RATING_DESC', 'En Yüksek Puan'],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setSortOrder(key)}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all border ${sortOrder === key ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#0A0E14] text-gray-400 border-white/5'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Müsaitlik + fırsat: sayaçlar gerçek veriden, 0 ise devre dışı */}
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">MÜSAİTLİK & FIRSAT</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setFilters(f => ({ ...f, availability: f.availability === 'Bugün' ? 'Tümü' : 'Bugün' }))}
                      disabled={todayCount === 0 && filters.availability !== 'Bugün'}
                      className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all border disabled:opacity-35 ${filters.availability === 'Bugün' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-[#0A0E14] text-gray-400 border-white/5'}`}
                    >
                      Bugün Müsait{todayCount > 0 ? ` · ${todayCount}` : ''}
                    </button>
                    <button
                      onClick={() => setOnlyDiscounted(v => !v)}
                      disabled={discountCount === 0 && !onlyDiscounted}
                      className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all border disabled:opacity-35 ${onlyDiscounted ? 'bg-[#FF3B30] text-white border-[#FF3B30]' : 'bg-[#0A0E14] text-gray-400 border-white/5'}`}
                    >
                      🔥 İndirimli{discountCount > 0 ? ` · ${discountCount}` : ''}
                    </button>
                  </div>
                </div>

                {/* Bölge — vitrindeki gerçek ilçeler + tesis sayısı */}
                {districtOptions.length > 1 && (
                  <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">BÖLGE</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setFilters({ ...filters, district: 'Tümü' })}
                        className={`px-4 py-2.5 rounded-xl text-[10px] font-black transition-all border ${filters.district === 'Tümü' ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#0A0E14] text-gray-400 border-white/5'}`}
                      >
                        TÜMÜ · {sourcePitches.length}
                      </button>
                      {districtOptions.map(([d, count]) => (
                        <button
                          key={d}
                          onClick={() => setFilters({ ...filters, district: filters.district === d ? 'Tümü' : d })}
                          className={`px-4 py-2.5 rounded-xl text-[10px] font-black transition-all border ${filters.district === d ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#0A0E14] text-gray-400 border-white/5'}`}
                        >
                          {d.toUpperCase()} · {count}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Saha tipi — gerçek kort sayılarıyla; hiç yoksa devre dışı */}
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">SAHA TİPİ</p>
                  <div className="flex gap-2">
                    {(['Tümü', 'Kapalı', 'Açık'] as const).map(t => {
                      const count = t === 'Tümü' ? sourcePitches.length : typeCounts[t];
                      const disabled = t !== 'Tümü' && count === 0 && filters.type !== t;
                      return (
                        <button
                          key={t}
                          disabled={disabled}
                          onClick={() => setFilters({ ...filters, type: filters.type === t ? 'Tümü' : t })}
                          className={`flex-1 py-3 rounded-xl transition-all border disabled:opacity-35 ${filters.type === t ? 'bg-[#FFFF00] border-[#FFFF00]' : 'bg-[#0A0E14] border-white/5'}`}
                        >
                          <span className={`block text-[10px] font-black uppercase ${filters.type === t ? 'text-black' : 'text-gray-400'}`}>{t}</span>
                          <span className={`block text-[9px] font-bold mt-0.5 ${filters.type === t ? 'text-black/60' : 'text-gray-600'}`}>{count} tesis</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fiyat — gerçek min/max aralığı; en sağ = limitsiz */}
                {priceBounds && (
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">ORT. SAATLİK FİYAT</p>
                      <span className="text-sm font-black text-[#FFFF00]">
                        {filters.maxPrice == null ? 'Tümü' : `≤ ${filters.maxPrice}₺`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={priceBounds.min}
                      max={priceBounds.max}
                      step={50}
                      value={filters.maxPrice ?? priceBounds.max}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setFilters({ ...filters, maxPrice: v >= priceBounds.max ? null : v });
                      }}
                      className="w-full h-2 bg-[#0A0E14] rounded-lg appearance-none cursor-pointer accent-[#FFFF00]"
                    />
                    <div className="flex justify-between mt-1.5 text-[9px] font-bold text-white/30">
                      <span>₺{priceBounds.min}</span>
                      <span>₺{priceBounds.max}+</span>
                    </div>
                  </div>
                )}

                {/* Puan */}
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">MİNİMUM PUAN</p>
                  <div className="flex gap-2">
                    {[0, 3.5, 4.0, 4.5].map(r => (
                      <button
                        key={r}
                        onClick={() => setFilters({ ...filters, minRating: r })}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all border flex items-center justify-center gap-1 ${filters.minRating === r ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#0A0E14] text-gray-400 border-white/5'}`}
                      >
                        {r === 0 ? 'HEPSİ' : <><Star size={10} fill="currentColor" /> {r}+</>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Olanaklar — vitrindeki tesislerde gerçekten bulunanlar */}
                {amenityOptions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">TESİS OLANAKLARI</p>
                    <div className="flex flex-wrap gap-2">
                      {amenityOptions.map(({ value, count, icon: Icon }) => {
                        const active = filters.hasAmenities.includes(value);
                        return (
                          <button
                            key={value}
                            onClick={() => setFilters(f => ({
                              ...f,
                              hasAmenities: active
                                ? f.hasAmenities.filter(a => a !== value)
                                : [...f.hasAmenities, value],
                            }))}
                            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[10px] font-extrabold transition-all border ${active ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#0A0E14] text-gray-400 border-white/5'}`}
                          >
                            {Icon && <Icon size={13} className={active ? 'text-black' : 'text-[#39FF14]'} />}
                            {value}
                            <span className={active ? 'text-black/50' : 'text-gray-600'}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Alt bar — canlı sonuç sayacı; sonuç yoksa tek dokunuşla temizleme */}
              <div className="shrink-0 px-7 py-4 pb-safe border-t border-white/[0.07] bg-[#161B22]">
                {filteredPitches.length > 0 ? (
                  <button
                    onClick={() => setShowFilters(false)}
                    className="w-full h-14 bg-[#FFFF00] text-black rounded-2xl font-black text-sm tracking-widest uppercase shadow-[0_10px_30px_rgba(255,255,0,0.2)] active:scale-[0.98] transition-transform"
                  >
                    {filteredPitches.length} SAHAYI GÖSTER
                  </button>
                ) : (
                  <button
                    onClick={resetAllFilters}
                    className="w-full h-14 bg-white/10 text-white/80 border border-white/15 rounded-2xl font-black text-sm tracking-widest uppercase active:scale-[0.98] transition-transform"
                  >
                    SONUÇ YOK — FİLTRELERİ TEMİZLE
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Saha Detay · Rezervasyon (tam ekran, tasarım 1a) ─────────────────── */}
      <AnimatePresence>
        {isDetailOpen && selectedPitch && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[60] bg-[#0A0E14] flex flex-col overflow-hidden"
          >
            {/* Üst aksiyonlar */}
            <div className="absolute top-0 left-0 w-full p-4 pt-safe flex justify-between items-center z-20">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/15"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => toggleFavorite(selectedPitch)}
                className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/15"
              >
                <FavStar active={favorites.has(selectedPitch.id)} size={19} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pb-44">
              {/* Galeri */}
              <div className="relative w-full h-[35vh]">
                <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar">
                  {(selectedPitch.images.length > 0 ? selectedPitch.images : ['']).map((img, idx) => (
                    <div key={idx} className="w-full h-full flex-shrink-0 snap-center relative">
                      <SafeImage src={img} alt={`${selectedPitch.name} ${idx + 1}`} className="w-full h-full object-cover" variant="detail" />
                    </div>
                  ))}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0A0E14] to-transparent pointer-events-none"></div>
                {selectedPitch.images.length > 1 && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {selectedPitch.images.map((_, idx) => (
                      <div key={idx} className={`h-1.5 rounded-full backdrop-blur-md ${idx === 0 ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}></div>
                    ))}
                  </div>
                )}
              </div>

              {/* Başlık + puan */}
              <div className="px-6 -mt-6 relative z-10">
                <h1 className="text-[26px] font-black italic uppercase tracking-[-0.03em] leading-[0.95] text-white pr-4">{selectedPitch.name}</h1>
                <div className="flex items-center gap-1.5 mt-2.5 text-[13.5px] text-white/65 font-medium">
                  <Star size={13} className="fill-white text-white" />
                  <span className="text-white font-bold">{selectedPitch.rating}</span>
                  <span className="opacity-50">·</span>
                  {selectedPitch.googleReviews > 0 && (
                    <>
                      <span className="underline">{selectedPitch.googleReviews} değerlendirme</span>
                      <span className="opacity-50">·</span>
                    </>
                  )}
                  <span>{selectedPitch.district}</span>
                </div>
                {selectedPitch.description && (
                  <DescriptionClamp text={selectedPitch.description} />
                )}
              </div>

              {/* Tesis İmkanları — ikonlu katalog + Diğer (Karar #16) */}
              {(amenitySplit.known.length > 0 || amenitySplit.other.length > 0) && (
                <div className="px-6 mt-7">
                  <h3 className="text-base font-extrabold tracking-tight mb-3">Tesis İmkanları</h3>
                  <div className="flex flex-wrap gap-2">
                    {amenitySplit.known.map(a => {
                      const Icon = a.icon;
                      return (
                        <span key={a.value} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-semibold text-white/80">
                          <Icon size={14} className="text-[#39FF14]" /> {a.value}
                        </span>
                      );
                    })}
                    {amenitySplit.other.map(a => (
                      <span key={a} className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs font-medium text-white/50">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Saha Tipi — Kapalı/Açık seçici, kort otomatik atanır (Karar #10) */}
              {selectedPitch.courts && selectedPitch.courts.length > 0 && (
                <div className="px-6 mt-8">
                  <h3 className="text-base font-extrabold tracking-tight mb-3">Saha Tipi</h3>
                  <div className="flex flex-col gap-2.5">
                    {(['CLOSED', 'OPEN'] as const).map(placement => {
                      const courts = courtsByPlacement[placement];
                      if (courts.length === 0) return null;
                      const isSel = selectedPlacement === placement;
                      const price = courts[0].price || selectedPitch.totalPrice;
                      const capacityInfo = courts[0].description?.trim() || '6v6 / 7v7 oynanabilir';
                      return (
                        <button
                          key={placement}
                          onClick={() => {
                            setSelectedPlacement(placement);
                            setSelectedCourtId(courts[0].id);
                            setSelectedSlot(null);
                          }}
                          className={`flex items-center justify-between p-4 rounded-[20px] text-left transition-all border ${isSel ? 'bg-[#39FF14]/[0.06] border-[#39FF14]/50' : 'bg-[#161B22] border-white/5'}`}
                        >
                          <div className="flex items-center gap-3.5">
                            <div className={`w-11 h-11 rounded-[14px] bg-black/40 border border-white/10 flex items-center justify-center ${isSel ? 'text-[#39FF14]' : 'text-white/70'}`}>
                              {placement === 'CLOSED' ? <Thermometer size={21} /> : <Wind size={21} />}
                            </div>
                            <div>
                              <div className="text-[15px] font-extrabold text-white">{placement === 'CLOSED' ? 'Kapalı Saha' : 'Açık Saha'}</div>
                              <div className="text-[11px] font-semibold text-white/50 mt-0.5">
                                {capacityInfo}{courts.length > 1 ? ` · ${courts.length} kort` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-base font-black ${isSel ? 'text-[#39FF14]' : 'text-white'}`}>₺{price}</div>
                            <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-white/40">ort. / saat</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Kalite notları: sadece Aydınlatma + Zemin, sadece admin onaylı (Karar #2, #11) */}
                  {approvedGrades && (
                    <div className="mt-5 flex items-center justify-around bg-[#0D111A] border border-white/[0.06] rounded-[20px] p-4">
                      <div className="text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.1em] text-white/40">Aydınlatma</div>
                        <div className="text-xl font-black text-[#39FF14] mt-1">{approvedGrades.lighting ?? '—'}</div>
                      </div>
                      <div className="w-px h-8 bg-white/10" />
                      <div className="text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.1em] text-white/40">Zemin</div>
                        <div className="text-xl font-black text-[#39FF14] mt-1">{approvedGrades.grass ?? '—'}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tarih Seç: hızlı 5 gün + tam takvim (Karar #12) */}
              <div className="px-6 mt-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-extrabold tracking-tight">Tarih Seç</h3>
                  <button
                    onClick={() => setCalendarOpen(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-[7px] rounded-full bg-white/5 border border-white/10 text-[11px] font-extrabold text-white/80"
                  >
                    <CalendarIcon size={13} />
                    {calendarOpen ? 'Takvimi kapat' : 'Tüm tarihler'}
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {Array.from({ length: 5 }).map((_, d) => {
                    const date = new Date();
                    date.setDate(date.getDate() + d);
                    const dayName = date.toLocaleDateString('tr-TR', { weekday: 'short' });
                    const isSel = selectedDate === d;
                    return (
                      <button
                        key={d}
                        onClick={() => { setSelectedDate(d); setSelectedSlot(null); }}
                        className={`flex-shrink-0 w-[58px] h-[74px] rounded-[18px] border flex flex-col items-center justify-center transition-all ${
                          isSel
                            ? 'bg-[#39FF14]/10 border-[#39FF14] text-[#39FF14]'
                            : 'bg-white/[0.03] border-white/[0.07] text-white/60'
                        }`}
                      >
                        <span className="text-[10px] font-extrabold uppercase">{d === 0 ? 'Bugün' : dayName}</span>
                        <span className="text-xl font-black mt-0.5">{String(date.getDate()).padStart(2, '0')}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tam takvim */}
                <AnimatePresence>
                  {calendarOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3.5 bg-[#0D111A] border border-white/[0.06] rounded-[20px] p-4">
                        <div className="flex items-center justify-between mb-3.5">
                          <button
                            onClick={() => {
                              if (calMonthIdx > currentMonthIdx) {
                                setCalendarMonth(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 });
                              }
                            }}
                            className={`w-[34px] h-[34px] rounded-[11px] bg-white/5 border border-white/10 flex items-center justify-center ${calMonthIdx > currentMonthIdx ? '' : 'opacity-30'}`}
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <span className="text-sm font-extrabold tracking-tight">
                            {MONTHS_TR[calendarMonth.m]} {calendarMonth.y}
                          </span>
                          <button
                            onClick={() => {
                              if (calMonthIdx < maxMonthIdx) {
                                setCalendarMonth(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 });
                              }
                            }}
                            className={`w-[34px] h-[34px] rounded-[11px] bg-white/5 border border-white/10 flex items-center justify-center ${calMonthIdx < maxMonthIdx ? '' : 'opacity-30'}`}
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-1.5 mb-2">
                          {WEEKDAY_HEADERS.map(w => (
                            <div key={w} className="text-center text-[10px] font-extrabold text-white/35 uppercase">{w}</div>
                          ))}
                        </div>
                        {calendarWeeks.map((week, wi) => (
                          <div key={wi} className="grid grid-cols-7 gap-1.5 mb-1.5">
                            {week.map((day, di) => {
                              const disabled = !day.inMonth || day.offset < 0 || day.offset > CALENDAR_MAX_DAYS;
                              const isSel = !disabled && day.offset === selectedDate;
                              return (
                                <button
                                  key={di}
                                  disabled={disabled}
                                  onClick={() => { setSelectedDate(day.offset); setSelectedSlot(null); }}
                                  className={`h-[38px] rounded-[11px] flex items-center justify-center text-[13px] font-bold transition-all ${
                                    isSel
                                      ? 'bg-[#39FF14] text-[#05070b]'
                                      : disabled
                                        ? 'text-white/[0.18]'
                                        : 'bg-white/[0.04] text-white/85'
                                  }`}
                                >
                                  {day.date.getDate()}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Saat Seç: Tümü/Gündüz/Gece + DOLU kilitli slotlar (Karar #13-14) */}
              <div className="px-6 mt-7">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-extrabold tracking-tight">Saat Seç</h3>
                  <div className="flex gap-1.5">
                    {([
                      ['ALL', 'Tümü'],
                      ['GUNDUZ', 'Gündüz'],
                      ['GECE', 'Gece'],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setTimeFilter(key)}
                        className={`px-3 py-1.5 rounded-full border text-[10px] font-extrabold transition-all ${
                          timeFilter === key
                            ? 'bg-[#39FF14]/[0.14] border-[#39FF14]/50 text-[#39FF14]'
                            : 'bg-white/[0.04] border-white/10 text-white/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {filteredSlots.map(slot => {
                    const isBooked = slot.status === 'booked' || slot.status === 'pending';
                    const isClosed = slot.status === 'closed';
                    const isSelected = selectedSlot === slot.label;
                    if (isClosed) return null;
                    return (
                      <button
                        key={slot.label}
                        disabled={isBooked}
                        onClick={() => {
                          setSelectedSlot(slot.label);
                          if (slot.assignedCourtId) setSelectedCourtId(slot.assignedCourtId);
                          if (navigator.vibrate) navigator.vibrate(12);
                        }}
                        className={`h-14 rounded-[14px] border flex flex-col items-center justify-center gap-0.5 transition-all ${
                          isSelected
                            ? 'bg-[#FFFF00] border-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.35)]'
                            : isBooked
                              ? 'bg-red-500/[0.08] border-red-500/20 opacity-60 cursor-not-allowed'
                              : 'bg-white/[0.03] border-white/[0.07]'
                        }`}
                      >
                        <span className={`text-sm ${isSelected ? 'font-black text-[#05070b]' : isBooked ? 'font-extrabold text-red-400 line-through' : 'font-extrabold text-white'}`}>
                          {slot.startTime}
                        </span>
                        <span className={`${isBooked ? 'text-[9px] tracking-[0.1em]' : 'text-[10px]'} font-black ${isSelected ? 'text-[#05070b]/70' : isBooked ? 'text-red-400' : 'text-[#39FF14]'}`}>
                          {isBooked ? 'DOLU' : slot.price != null ? `₺${slot.price}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {filteredSlots.filter(s => s.status !== 'closed').length === 0 && (
                  <p className="text-center text-xs text-white/40 py-6">Bu gün için uygun saat bulunmuyor.</p>
                )}

                {/* İçerik bildir (Karar #12 moderasyon) */}
                <button
                  onClick={handleReportContent}
                  className="mt-8 mx-auto flex items-center gap-1.5 text-[10px] font-bold text-white/30 uppercase tracking-widest"
                >
                  <Flag size={11} /> İçeriği bildir
                </button>
              </div>
            </div>

            {/* Yapışkan kapora barı (tasarım 1a) */}
            <div className="absolute bottom-0 left-0 w-full bg-[#0A0E14]/95 backdrop-blur-xl border-t border-white/[0.07] z-20">
              <div className="px-6 py-4 pb-safe flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.08em] text-white/45 truncate">
                    {selectedPlacement === 'CLOSED' ? 'Kapalı' : 'Açık'}
                    {' · '}{selectedDateObj.getDate()} {MONTHS_TR_SHORT[selectedDateObj.getMonth()]}
                    {selectedSlot ? ` · ${parseSlotLabel(selectedSlot).startTime}` : ''}
                    {!isSelectionMode ? ' · Kapora' : ''}
                  </div>
                  {selectedSlotQuote ? (
                    <div className="text-xl font-black italic mt-0.5">
                      {isSelectionMode ? (
                        <>₺{selectedSlotQuote.price}<span className="text-xs font-semibold text-white/50"> / saat</span></>
                      ) : (
                        <>₺{selectedSlotQuote.deposit}<span className="text-xs font-semibold text-white/50"> / ₺{selectedSlotQuote.price}</span></>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm font-bold text-white/50 mt-0.5">Önce saat seç</div>
                  )}
                </div>
                {isSelectionMode ? (
                  <button
                    disabled={!selectedSlot || !selectedCourtId}
                    onClick={() => {
                      if (selectedPitch && selectedCourt && selectedSlot && onSelectTime) {
                        const date = new Date();
                        date.setDate(date.getDate() + selectedDate);
                        onSelectTime(selectedPitch, selectedCourt, date.toLocaleDateString('tr-TR'), selectedSlot);
                      }
                    }}
                    className={`px-6 h-14 rounded-2xl bg-[#FFFF00] text-black text-[13px] font-black italic uppercase tracking-wide whitespace-nowrap transition-all ${
                      selectedSlot && selectedCourtId
                        ? 'shadow-[0_0_30px_rgba(255,255,0,0.3)] active:scale-95'
                        : 'opacity-60 cursor-not-allowed'
                    }`}
                  >
                    Bu Saati Seç
                  </button>
                ) : (
                  <button
                    disabled={!selectedSlot || !selectedCourtId}
                    onClick={handlePayDeposit}
                    className={`px-6 h-14 rounded-2xl bg-[#FFFF00] text-black text-[13px] font-black italic uppercase tracking-wide whitespace-nowrap transition-all ${
                      selectedSlot && selectedCourtId
                        ? 'shadow-[0_0_30px_rgba(255,255,0,0.3)] active:scale-95'
                        : 'opacity-60 cursor-not-allowed'
                    }`}
                  >
                    Kaporayı Öde
                  </button>
                )}
              </div>
              {selectedSlotQuote && !isSelectionMode && (
                <p className="px-6 pb-3 -mt-1 text-[9px] text-white/35 leading-relaxed">
                  Kapora rezervasyon güvencesidir; kalan ₺{selectedSlotQuote.price - selectedSlotQuote.deposit} maç günü tesiste ödenir. İptalde tesis politikasına göre iade edilir.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionError && <Toast message={actionError} variant="error" />}
      </AnimatePresence>

    </div>
  );
};

/** 3 satır + "devamını gör" açıklama (Karar #14) */
const DescriptionClamp: React.FC<{ text: string }> = ({ text }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 160;
  return (
    <div className="mt-3.5">
      <p className={`text-sm leading-relaxed text-white/70 font-medium ${!expanded && isLong ? 'line-clamp-3' : ''}`}>
        {text}
      </p>
      {isLong && (
        <button onClick={() => setExpanded(v => !v)} className="mt-1 text-xs font-bold text-[#39FF14]">
          {expanded ? 'Daha az göster' : 'Devamını gör'}
        </button>
      )}
    </div>
  );
};

export default PitchDiscovery;
