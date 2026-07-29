/**
 * Tesis Ayarları (Karar #4, #8, #14, #16-18, #25, #28):
 *  - Genel: ad + açıklama (40-500 sayaç) + adres alanları + PhotoManager (pitch_media)
 *  - Olanaklar: ikonlu standart katalog + özel girdi
 *  - Konum: sürüklenebilir harita pini (lat/lng)
 *  - Vitrin: yayın anahtarı + Vitrin Skoru + analitik + oyuncu gözüyle önizleme
 * Onaylı tesiste ad/konum değişikliği doğrudan yazılamaz (DB trigger korumalı);
 * değişiklik talebi olarak admin onayına gönderilir.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Clock, Eye, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toTurkishError, updatePitchProfile } from '../../../services/pitchOwnerService';
import {
  fetchPendingChangeRequests,
  setPitchPublished,
  submitPitchIdentityChange,
} from '../../../services/pitchContentService';
import { supabase } from '../../../supabaseClient';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerFullscreenModal } from './OwnerModalFrame';
import type { OwnerFacilityFormData } from './ownerMenuTypes';
import { AMENITY_CATALOG, normalizeAmenity } from '../../../shared/amenities';
import PhotoManager from '../../../components/pitch-editor/PhotoManager';
import ShowcaseScoreCard from '../../../components/pitch-editor/ShowcaseScoreCard';
import ShowcasePreview from '../../../components/pitch-editor/ShowcasePreview';
import { ORDU_CENTER, ORDU_DISTRICT_NAMES, LAUNCH_CITY } from '../../../utils/orduData';
import { OYNA_TILE_URL, oynaTileProps, oynaMapProps, OYNA_MAP_CSS } from '../../../components/map/mapBase';
import { geocodeAddress, reverseGeocode, type ReverseResult } from '../../../services/geocodingService';
import { fetchActiveCoverage } from '../../../services/regionCoverageService';

interface Props {
  onClose: () => void;
  facilityId: string;
  initialData?: OwnerFacilityFormData;
  /** Açılışta gösterilecek sekme (Kurulum Sihirbazı 'konum' adımı doğrudan haritayı açar). */
  initialTab?: 'general' | 'amenities' | 'location' | 'showcase';
  onSave: (data: OwnerFacilityFormData) => void;
  /** Vitrin sekmesinden kort yönetimine köprü (Sahalarım ekranı) */
  onOpenCourts?: () => void;
  /** Vitrin sekmesinden saha bazlı tarife girişine köprü (Sahalarım listesi).
   *  Tesis geneli tek fiyat ekranı kaldırıldı; her saha kendi politikasını girer. */
  onOpenPricing?: () => void;
  /** Vitrin sekmesinden çalışma saatleri editörüne köprü */
  onOpenHours?: () => void;
}

const DESC_MIN = 40;
const DESC_MAX = 500;

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#10B981;transform:rotate(-45deg);border:3px solid #0A0E14;box-shadow:0 0 14px rgba(16,185,129,0.8);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const DraggablePin: React.FC<{ pos: [number, number]; onMove: (lat: number, lng: number) => void }> = ({ pos, onMove }) => {
  useMapEvents({
    click: (e) => onMove(e.latlng.lat, e.latlng.lng),
  });
  return (
    <Marker
      position={pos}
      icon={pinIcon}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const p = (e.target as L.Marker).getLatLng();
          onMove(p.lat, p.lng);
        },
      }}
    />
  );
};

type Tab = 'general' | 'amenities' | 'location' | 'showcase';

export const OwnerFacilitySettingsModal: React.FC<Props> = ({
  onClose,
  facilityId,
  initialData,
  initialTab,
  onSave,
  onOpenCourts,
  onOpenPricing,
  onOpenHours,
}) => {
  const notify = useOwnerToast();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'general');
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [city, setCity] = useState(initialData?.city ?? '');
  const [district, setDistrict] = useState(initialData?.district ?? '');
  const [address, setAddress] = useState(initialData?.address ?? '');
  const [images, setImages] = useState<string[]>(initialData?.images ?? []);
  const [amenities, setAmenities] = useState<string[]>((initialData?.amenities ?? []).map(normalizeAmenity));
  const [customAmenity, setCustomAmenity] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [scoreRefresh, setScoreRefresh] = useState(0);

  // Sunucudan taze durum: koordinat, yayın, doğrulama, bekleyen talep
  const [latLng, setLatLng] = useState<[number, number] | null>(null);
  const [origin, setOrigin] = useState<{ name: string; city: string; district: string; address: string; lat: number | null; lng: number | null } | null>(null);
  const [isPublished, setIsPublished] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected'>(initialData?.verificationStatus ?? 'pending');
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  // Faz 2 · konum: geocoding + il/ilçe listesi + pin→adres önerisi
  const [geocoding, setGeocoding] = useState(false);
  const [reverseSuggest, setReverseSuggest] = useState<ReverseResult | null>(null);
  const [coverage, setCoverage] = useState<{ city: string; district: string | null }[]>([]);

  const isRealPitch = !!facilityId && !facilityId.startsWith('mock-');

  // İl/İlçe seçenekleri: aktif kapsama (region_coverage) → yoksa Ordu fallback.
  const cityOptions = useMemo(() => {
    const fromCoverage = Array.from(new Set(coverage.map((c) => c.city).filter(Boolean)));
    const base = fromCoverage.length ? fromCoverage : [LAUNCH_CITY];
    // Mevcut kayıtlı il listede yoksa da göster (kirli eski veriyi kaybetme).
    if (city && !base.includes(city)) return [city, ...base];
    return base;
  }, [coverage, city]);

  const districtOptions = useMemo(() => {
    const forCity = coverage
      .filter((c) => (city ? c.city === city : true))
      .map((c) => c.district)
      .filter((d): d is string => !!d);
    const base = forCity.length ? Array.from(new Set(forCity)) : ORDU_DISTRICT_NAMES;
    if (district && !base.includes(district)) return [district, ...base];
    return base;
  }, [coverage, city, district]);

  useEffect(() => {
    if (!isRealPitch) return;
    supabase
      .from('pitches')
      .select('name, city, district, address, latitude, longitude, is_published, verification_status, description, amenities')
      .eq('id', facilityId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setName((v) => v || data.name || '');
        setCity((v) => v || data.city || '');
        setDistrict((v) => v || data.district || '');
        setAddress((v) => v || data.address || '');
        if (!initialData?.description && data.description) setDescription(data.description);
        if ((initialData?.amenities ?? []).length === 0 && Array.isArray(data.amenities)) {
          setAmenities((data.amenities as string[]).map(normalizeAmenity));
        }
        setOrigin({
          name: data.name ?? '',
          city: data.city ?? '',
          district: data.district ?? '',
          address: data.address ?? '',
          lat: data.latitude,
          lng: data.longitude,
        });
        if (data.latitude != null && data.longitude != null) setLatLng([data.latitude, data.longitude]);
        setIsPublished(data.is_published !== false);
        setVerificationStatus((data.verification_status as typeof verificationStatus) ?? 'pending');
      });
    fetchPendingChangeRequests(facilityId)
      .then((reqs) => setHasPendingRequest(reqs.length > 0))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId, isRealPitch]);

  useEffect(() => {
    fetchActiveCoverage()
      .then((rows) => setCoverage(rows.map((r) => ({ city: r.city, district: r.district }))))
      .catch(() => setCoverage([]));
  }, []);

  // Adres → koordinat: pini adresin bulunduğu yere taşır (Karar #11).
  const handleGeocode = async () => {
    if (!address.trim()) {
      notify('Önce adres girin, sonra haritada bulun.', 'warning');
      return;
    }
    setGeocoding(true);
    try {
      const hit = await geocodeAddress(address.trim(), { city, district });
      if (!hit) {
        notify('Adres bulunamadı. Daha açık yazmayı deneyin veya pini elle yerleştirin.', 'warning');
        return;
      }
      setLatLng([hit.lat, hit.lng]);
      setReverseSuggest(null);
      setActiveTab('location');
      notify('Konum bulundu — pini kontrol edip gerekiyorsa ince ayar yapın.', 'success');
    } catch {
      notify('Konum servisi şu an yanıt vermedi. Pini haritadan elle yerleştirebilirsiniz.', 'error');
    } finally {
      setGeocoding(false);
    }
  };

  // Pin taşınınca adres önerisi getir (Karar #14 — otomatik değiştirme YOK, öneri).
  const handlePinMoved = (lat: number, lng: number) => {
    setLatLng([Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
    reverseGeocode(lat, lng)
      .then((r) => setReverseSuggest(r))
      .catch(() => setReverseSuggest(null));
  };

  const applyReverseSuggestion = () => {
    if (!reverseSuggest) return;
    if (reverseSuggest.address) setAddress(reverseSuggest.address);
    if (reverseSuggest.city && cityOptions.includes(reverseSuggest.city)) setCity(reverseSuggest.city);
    if (reverseSuggest.district) setDistrict(reverseSuggest.district);
    setReverseSuggest(null);
    notify('Adres öneriden dolduruldu — kaydetmeyi unutmayın.', 'success');
  };

  const customAmenities = useMemo(
    () => amenities.filter((a) => !AMENITY_CATALOG.some((c) => c.value === a)),
    [amenities],
  );

  const toggleAmenity = (item: string) => {
    setAmenities((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item],
    );
  };

  const identityChanged = origin && (
    name.trim() !== origin.name ||
    city.trim() !== (origin.city ?? '') ||
    district.trim() !== (origin.district ?? '') ||
    address.trim() !== (origin.address ?? '') ||
    (latLng ? latLng[0] !== origin.lat || latLng[1] !== origin.lng : false)
  );

  const requiresApproval = verificationStatus === 'approved';

  const handleTogglePublished = async () => {
    if (!isRealPitch) return;
    const next = !isPublished;
    // Karar #12: koordinatsız tesis vitrine çıkamaz (haritada gösterilemez,
    // mesafe hesaplanamaz). Yayına almadan önce pin şart.
    if (next && !latLng) {
      notify('Vitrine çıkmadan önce Konum sekmesinden tesisin pinini yerleştirin.', 'warning');
      setActiveTab('location');
      return;
    }
    setIsPublished(next);
    try {
      await setPitchPublished(facilityId, next);
      notify(next ? 'Tesis vitrinde görünür.' : 'Tesis vitrinden gizlendi. Mevcut rezervasyonlar etkilenmez.', 'success');
    } catch (err) {
      setIsPublished(!next);
      notify(toTurkishError(err), 'error');
    }
  };

  const handleSave = async () => {
    if (!facilityId) return;
    const desc = description.trim();
    if (desc && desc.length < DESC_MIN) {
      notify(`Açıklama en az ${DESC_MIN} karakter olmalı (${desc.length}/${DESC_MIN}).`, 'error');
      setActiveTab('general');
      return;
    }
    setIsSaving(true);
    try {
      if (isRealPitch) {
        // Güvenli alanlar her zaman doğrudan yazılır
        await updatePitchProfile(facilityId, {
          description: desc,
          amenities,
        });

        if (identityChanged) {
          if (requiresApproval) {
            // Onaylı tesis: ad/konum admin onayına gider (Karar #4)
            await submitPitchIdentityChange(facilityId, {
              name: name.trim() !== origin!.name ? name.trim() : undefined,
              city: city.trim() !== (origin!.city ?? '') ? city.trim() : undefined,
              district: district.trim() !== (origin!.district ?? '') ? district.trim() : undefined,
              address: address.trim() !== (origin!.address ?? '') ? address.trim() : undefined,
              latitude: latLng && latLng[0] !== origin!.lat ? latLng[0] : undefined,
              longitude: latLng && latLng[1] !== origin!.lng ? latLng[1] : undefined,
            });
            setHasPendingRequest(true);
            notify('Ad/konum değişikliği admin onayına gönderildi. Onaylanınca vitrine yansır.', 'success');
          } else {
            // Henüz onaylanmamış tesis: serbest düzenleme
            await updatePitchProfile(facilityId, {
              name: name.trim(),
              city: city.trim() || undefined,
              district: district.trim() || undefined,
              address: address.trim() || undefined,
            });
            if (latLng) {
              await supabase
                .from('pitches')
                .update({ latitude: latLng[0], longitude: latLng[1] })
                .eq('id', facilityId);
            }
          }
        }
      }
      onSave({
        name: name.trim(),
        description: desc,
        city: city.trim() || undefined,
        district: district.trim() || undefined,
        address: address.trim() || undefined,
        amenities,
        images,
      });
      setScoreRefresh((v) => v + 1);
      notify('Tesis ayarları kaydedildi.', 'success');
      if (!identityChanged || !requiresApproval) onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const descLen = description.trim().length;
  const descTone = descLen === 0 ? 'text-gray-600' : descLen < DESC_MIN ? 'text-red-400' : 'text-[#10B981]';
  const mapCenter: [number, number] = latLng ?? [ORDU_CENTER.lat, ORDU_CENTER.lng];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: 'Genel' },
    { id: 'amenities', label: 'Olanaklar' },
    { id: 'location', label: 'Konum' },
    { id: 'showcase', label: 'Vitrin' },
  ];

  return (
    <OwnerFullscreenModal
      title="Tesis Ayarları"
      onClose={onClose}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex gap-1.5 p-1 bg-[#0A0E14] rounded-2xl border border-white/5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {hasPendingRequest && (
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
            <Clock size={18} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200">
              Onay bekleyen bir ad/konum değişikliği talebiniz var. Admin onaylayınca vitrine yansır.
            </p>
          </div>
        )}

        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                Tesis Adı
                {requiresApproval && <span className="text-blue-400 normal-case font-semibold">(değişiklik onay gerektirir)</span>}
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-500/40"
                placeholder="Tesis adı"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Açıklama</label>
                <span className={`text-[10px] font-bold ${descTone}`}>{descLen}/{DESC_MAX} · en az {DESC_MIN}</span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                rows={4}
                className="w-full bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/40 resize-none"
                placeholder="Zemin ve aydınlatmanızı, ulaşım kolaylığını ve öne çıkan imkanlarınızı anlatın. Örn: 'Kapalı ve açık iki sahamız, profesyonel zemin ve ışıklandırmamız var; duş ve soyunma odaları tam donanımlıdır.'"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase">İl</label>
                <select
                  value={city}
                  onChange={(e) => { setCity(e.target.value); setDistrict(''); }}
                  className="w-full bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/40 appearance-none"
                >
                  <option value="" disabled>İl seçin</option>
                  {cityOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase">İlçe</label>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/40 appearance-none"
                >
                  <option value="" disabled>İlçe seçin</option>
                  {districtOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
                <MapPin size={12} /> Adres
              </label>
              <div className="flex gap-2">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="flex-1 bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/40"
                  placeholder="Mahalle, sokak, no"
                />
                <button
                  type="button"
                  onClick={handleGeocode}
                  disabled={geocoding || !address.trim()}
                  className="shrink-0 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
                >
                  <MapPin size={14} /> {geocoding ? 'Bulunuyor…' : 'Haritada Bul'}
                </button>
              </div>
              <p className="text-[10px] text-gray-500">Adresi yazıp "Haritada Bul"a dokun; pin otomatik konumlanır, Konum sekmesinden ince ayar yapabilirsin.</p>
            </div>

            {isRealPitch ? (
              <PhotoManager
                pitchId={facilityId}
                onError={(m) => notify(m, 'error')}
                onChanged={(urls) => { setImages(urls); setScoreRefresh((v) => v + 1); }}
              />
            ) : (
              <p className="text-xs text-gray-500">Fotoğraf yüklemek için tesisinizin kaydı tamamlanmalı.</p>
            )}

            {verificationStatus !== 'approved' && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200">
                  Tesis doğrulama durumu:{' '}
                  <strong>{verificationStatus === 'pending' ? 'İnceleniyor' : 'Reddedildi'}</strong>.
                  Onay sonrası oyuncular tesisinizi görebilir.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'amenities' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {AMENITY_CATALOG.map(({ value, icon: Icon }) => {
                const active = amenities.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleAmenity(value)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                      active
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-[#161B22] border-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    {active ? <Check size={12} /> : <Icon size={12} />}
                    {value}
                  </button>
                );
              })}
            </div>

            {customAmenities.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">Diğer</p>
                <div className="flex flex-wrap gap-2">
                  {customAmenities.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleAmenity(item)}
                      className="px-4 py-2 rounded-xl text-xs font-bold border bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    >
                      <Check size={12} className="inline mr-1" />
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={customAmenity}
                onChange={(e) => setCustomAmenity(e.target.value)}
                placeholder="Özel olanak ekle (vitrinde 'Diğer' altında görünür)"
                className="flex-1 bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = normalizeAmenity(customAmenity.trim());
                  if (!trimmed) return;
                  if (!amenities.includes(trimmed)) {
                    setAmenities((prev) => [...prev, trimmed]);
                  }
                  setCustomAmenity('');
                }}
                className="px-4 py-3 bg-blue-600 text-white text-xs font-bold rounded-xl"
              >
                Ekle
              </button>
            </div>
          </div>
        )}

        {activeTab === 'location' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 leading-relaxed">
              Pini tesisinizin tam girişine yerleştirin — vitrindeki <strong className="text-white">"1.2 km"</strong> mesafeleri
              bu pinden hesaplanır. Haritaya dokunarak veya pini sürükleyerek konumlandırın.
              {requiresApproval && <span className="text-blue-300"> Onaylı tesiste pin değişikliği admin onayına gider.</span>}
            </p>
            <div className="h-72 rounded-2xl overflow-hidden border border-white/10">
              <style>{OYNA_MAP_CSS}</style>
              <MapContainer center={mapCenter} zoom={latLng ? 16 : 12} className="w-full h-full" {...oynaMapProps}>
                <TileLayer url={OYNA_TILE_URL} {...oynaTileProps} />
                <DraggablePin pos={mapCenter} onMove={handlePinMoved} />
              </MapContainer>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className={latLng ? 'text-[#10B981]' : 'text-red-400'}>
                {latLng ? `Pin: ${latLng[0].toFixed(5)}, ${latLng[1].toFixed(5)}` : 'Pin henüz yerleştirilmedi — vitrin için zorunlu'}
              </span>
            </div>
            {/* Pin taşınınca adres önerisi (Karar #14 — öneri, otomatik değiştirme yok) */}
            {reverseSuggest?.address && (
              <div className="bg-blue-500/10 border border-blue-500/25 rounded-2xl p-3.5 flex items-start gap-3">
                <MapPin size={16} className="text-blue-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-blue-200">Bu konumun adresi:</p>
                  <p className="text-xs text-white/80 mt-0.5 leading-snug">{reverseSuggest.address}</p>
                  <div className="flex gap-2 mt-2.5">
                    <button
                      type="button"
                      onClick={applyReverseSuggestion}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold"
                    >
                      Adres olarak kullan
                    </button>
                    <button
                      type="button"
                      onClick={() => setReverseSuggest(null)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 text-[11px] font-bold"
                    >
                      Kapat
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'showcase' && isRealPitch && (
          <div className="space-y-4">
            {/* Yayın anahtarı (Karar #28) */}
            <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Vitrinde Göster</p>
                <p className="text-[11px] text-gray-500 mt-1 max-w-[220px] leading-relaxed">
                  Tadilat veya sezon kapanışında tesisi geçici gizleyin; mevcut rezervasyonlar etkilenmez.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTogglePublished}
                className={`relative w-14 h-8 rounded-full transition-colors ${isPublished ? 'bg-[#10B981]' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${isPublished ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#FACC15]/10 border border-[#FACC15]/40 text-[#FACC15] text-xs font-extrabold uppercase tracking-wider"
            >
              <Eye size={15} /> Vitrinde Önizle
            </button>

            {/* Vitrinde görünen kort/fiyat/saat bilgileri tek dokunuşla düzenlenir */}
            {(onOpenCourts || onOpenPricing || onOpenHours) && (
              <div className="grid grid-cols-3 gap-2">
                {onOpenCourts && (
                  <button
                    type="button"
                    onClick={onOpenCourts}
                    className="py-3 rounded-2xl bg-[#161B22] border border-white/5 text-gray-300 text-[11px] font-bold hover:border-white/20 transition-colors"
                  >
                    Kortlar
                  </button>
                )}
                {onOpenPricing && (
                  <button
                    type="button"
                    onClick={onOpenPricing}
                    className="py-3 rounded-2xl bg-[#161B22] border border-white/5 text-gray-300 text-[11px] font-bold hover:border-white/20 transition-colors"
                  >
                    Saha Tarifeleri
                  </button>
                )}
                {onOpenHours && (
                  <button
                    type="button"
                    onClick={onOpenHours}
                    className="py-3 rounded-2xl bg-[#161B22] border border-white/5 text-gray-300 text-[11px] font-bold hover:border-white/20 transition-colors"
                  >
                    Çalışma Saatleri
                  </button>
                )}
              </div>
            )}

            <ShowcaseScoreCard
              pitchId={facilityId}
              refreshKey={scoreRefresh}
              onTaskClick={(key) => {
                if (key === 'photos' || key === 'description') setActiveTab('general');
                else if (key === 'amenities') setActiveTab('amenities');
                else if (key === 'pin') setActiveTab('location');
                else if (key === 'court') onOpenCourts?.();
                else if (key === 'tariff') onOpenPricing?.();
              }}
            />
          </div>
        )}
      </div>

      {showPreview && <ShowcasePreview pitchId={facilityId} onClose={() => setShowPreview(false)} />}
    </OwnerFullscreenModal>
  );
};
