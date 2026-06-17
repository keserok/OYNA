import React, { useState } from 'react';
import { AlertCircle, Check, ImagePlus, MapPin, Trash2 } from 'lucide-react';
import { toTurkishError, updatePitchProfile, uploadPitchImage } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerFullscreenModal } from './OwnerModalFrame';
import { FACILITY_AMENITIES, type OwnerFacilityFormData } from './ownerMenuTypes';

interface Props {
  onClose: () => void;
  facilityId: string;
  initialData?: OwnerFacilityFormData;
  onSave: (data: OwnerFacilityFormData) => void;
}

export const OwnerFacilitySettingsModal: React.FC<Props> = ({
  onClose,
  facilityId,
  initialData,
  onSave,
}) => {
  const notify = useOwnerToast();
  const [activeTab, setActiveTab] = useState<'general' | 'amenities'>('general');
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [city, setCity] = useState(initialData?.city ?? '');
  const [district, setDistrict] = useState(initialData?.district ?? '');
  const [address, setAddress] = useState(initialData?.address ?? '');
  const [images, setImages] = useState<string[]>(initialData?.images ?? []);
  const [amenities, setAmenities] = useState<string[]>(initialData?.amenities ?? []);
  const [customAmenity, setCustomAmenity] = useState('');
  const [extraAmenities, setExtraAmenities] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const allAmenities = [...FACILITY_AMENITIES, ...extraAmenities];
  const isRealPitch = !!facilityId && !facilityId.startsWith('mock-');

  const handleAddImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !isRealPitch) return;
      try {
        const url = await uploadPitchImage(file, facilityId);
        setImages((prev) => [...prev, url]);
      } catch (err) {
        notify(toTurkishError(err), 'error');
      }
    };
    input.click();
  };

  const toggleAmenity = (item: string) => {
    setAmenities((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item],
    );
  };

  const handleSave = async () => {
    if (!facilityId) return;
    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        city: city.trim() || undefined,
        district: district.trim() || undefined,
        address: address.trim() || undefined,
        amenities,
        images,
        image: images[0],
      };
      if (isRealPitch) {
        await updatePitchProfile(facilityId, payload);
      }
      onSave(payload);
      notify('Tesis ayarları kaydedildi.', 'success');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OwnerFullscreenModal
      title="Tesis Ayarları"
      onClose={onClose}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex gap-2 p-1 bg-[#0A0E14] rounded-2xl border border-white/5">
          {(['general', 'amenities'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'general' ? 'Genel Bilgiler' : 'Olanaklar'}
            </button>
          ))}
        </div>

        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Tesis Adı</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-500/40"
                placeholder="Tesis adı"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Açıklama</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/40 resize-none"
                placeholder="Tesisinizi tanıtın..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase">İl</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/40"
                  placeholder="İstanbul"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase">İlçe</label>
                <input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/40"
                  placeholder="Kadıköy"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
                <MapPin size={12} /> Adres
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/40"
                placeholder="Mahalle, sokak, no"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Fotoğraflar</label>
              <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                <button
                  type="button"
                  onClick={handleAddImage}
                  className="shrink-0 w-28 h-36 bg-[#161B22] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-white hover:border-white/30"
                >
                  <ImagePlus size={22} />
                  <span className="text-[10px] font-bold">EKLE</span>
                </button>
                {images.map((img, idx) => (
                  <div key={img} className="relative shrink-0 w-28 h-36 rounded-2xl overflow-hidden border border-white/10">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-2 right-2 p-1.5 bg-red-500/90 text-white rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                    {idx === 0 && (
                      <span className="absolute bottom-2 left-2 text-[9px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded">
                        KAPAK
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {initialData?.verificationStatus && initialData.verificationStatus !== 'approved' && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200">
                  Tesis doğrulama durumu:{' '}
                  <strong>
                    {initialData.verificationStatus === 'pending' ? 'İnceleniyor' : 'Reddedildi'}
                  </strong>
                  . Onay sonrası oyuncular tesisinizi görebilir.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'amenities' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {allAmenities.map((item) => {
                const active = amenities.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleAmenity(item)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                      active
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-[#161B22] border-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    {active && <Check size={12} className="inline mr-1" />}
                    {item}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                value={customAmenity}
                onChange={(e) => setCustomAmenity(e.target.value)}
                placeholder="Özel olanak ekle"
                className="flex-1 bg-[#161B22] border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = customAmenity.trim();
                  if (!trimmed) return;
                  if (!allAmenities.includes(trimmed)) {
                    setExtraAmenities((prev) => [...prev, trimmed]);
                  }
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
      </div>
    </OwnerFullscreenModal>
  );
};
