import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Save, Image as ImageIcon, Tag, Award, Sparkles, Eye,
  Trash2, Plus, Star, X, Smartphone, Tablet, Camera, Loader2, Check,
  ChevronRight, Percent, Calendar, AlertCircle, Building2, GripVertical
} from 'lucide-react';
import { useAppStore } from '../../store';
import { Pitch } from '../../types';
import { useImageUpload } from '../../hooks/useImageUpload';
import PitchShowcaseCard from '../../components/PitchShowcaseCard';

interface VitrinStudioProps {
  pitchId: string;
  onBack: () => void;
}

const EXTENDED_AMENITIES = [
  'Duş', 'Otopark', 'Kafe', 'WiFi', 'Kamera Kaydı', 'Mescit', 'Krampon Kiralama', 'Büfe',
  'Hakem', 'Kaleci', 'Top Kiralama', 'Forma Kiralama', 'Tribün', 'Engelli Erişimi',
  'Kredi Kartı', 'Yapay Çim', 'Doğal Çim', 'Kapalı Saha', 'Açık Saha', 'Isıtma',
  'Soğutma', 'Soyunma Odası', 'Kilitli Dolap'
];

type StudioTab = 'GENERAL' | 'GALLERY' | 'COURTS' | 'AMENITIES' | 'CAMPAIGN' | 'QUALITY';
type PreviewDevice = 'MOBILE' | 'TABLET';

const TAB_LABELS: Record<StudioTab, { label: string; icon: any }> = {
  GENERAL: { label: 'Genel', icon: Building2 },
  GALLERY: { label: 'Galeri', icon: ImageIcon },
  COURTS: { label: 'Sahalar', icon: Tag },
  AMENITIES: { label: 'Özellikler', icon: Award },
  CAMPAIGN: { label: 'Kampanya', icon: Sparkles },
  QUALITY: { label: 'Kalite Notu', icon: Star }
};

const VitrinStudio: React.FC<VitrinStudioProps> = ({ pitchId, onBack }) => {
  const { adminPitches, publishPitchShowcase } = useAppStore();
  const sourcePitch = useMemo(() => adminPitches.find((p) => p.id === pitchId), [adminPitches, pitchId]);

  const [activeTab, setActiveTab] = useState<StudioTab>('GENERAL');
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('MOBILE');
  const [isSaving, setIsSaving] = useState(false);
  const [savedJustNow, setSavedJustNow] = useState(false);

  // Çalışma kopyası state
  const [name, setName] = useState(sourcePitch?.name || '');
  const [description, setDescription] = useState(sourcePitch?.description || '');
  const [images, setImages] = useState<string[]>(sourcePitch?.images || []);
  const [coverImageIndex, setCoverImageIndex] = useState<number>(sourcePitch?.coverImageIndex || 0);
  const [amenities, setAmenities] = useState<string[]>(sourcePitch?.amenities || []);
  const [featuredAmenities, setFeaturedAmenities] = useState<string[]>(sourcePitch?.featuredAmenities || []);
  const [qualityGrades, setQualityGrades] = useState<{
    grass: 'A' | 'B' | 'C';
    lighting: 'A' | 'B' | 'C';
    lockerRoom: 'A' | 'B' | 'C';
  }>(
    sourcePitch?.qualityGrades || {
      grass: sourcePitch?.grassGrade || 'B',
      lighting: sourcePitch?.lightingGrade || 'B',
      lockerRoom: sourcePitch?.lockerRoomGrade || 'B'
    }
  );
  const [campaign, setCampaign] = useState<Pitch['showcaseCampaign']>(sourcePitch?.showcaseCampaign || null);
  const [courts, setCourts] = useState(sourcePitch?.courts || []);

  // Image upload
  const { uploadImage, uploading, progress } = useImageUpload(`pitches/${pitchId}`);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Owner formda yaptığı değişikliklerin live preview için "sentetik" Pitch objesi
  const previewPitch: Pitch = useMemo(() => {
    if (!sourcePitch) return {} as Pitch;
    return {
      ...sourcePitch,
      name,
      description,
      images,
      image: images[coverImageIndex] || sourcePitch.image,
      amenities,
      featuredAmenities,
      coverImageIndex,
      qualityGrades,
      showcaseCampaign: campaign,
      courts
    };
  }, [sourcePitch, name, description, images, coverImageIndex, amenities, featuredAmenities, qualityGrades, campaign, courts]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const url = await uploadImage(files[i]);
        setImages((prev) => [...prev, url]);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Yükleme başarısız');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    if (coverImageIndex === idx) setCoverImageIndex(0);
    else if (coverImageIndex > idx) setCoverImageIndex((c) => c - 1);
  };

  const toggleAmenity = (a: string) => {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
    if (featuredAmenities.includes(a)) {
      setFeaturedAmenities((prev) => prev.filter((x) => x !== a));
    }
  };

  const toggleFeatured = (a: string) => {
    setFeaturedAmenities((prev) => {
      if (prev.includes(a)) return prev.filter((x) => x !== a);
      if (prev.length >= 3) return prev;
      return [...prev, a];
    });
    // Featured yapıldıysa amenities'e de eklenmeli
    if (!amenities.includes(a) && !featuredAmenities.includes(a)) {
      setAmenities((prev) => [...prev, a]);
    }
  };

  const handlePublish = async () => {
    setIsSaving(true);
    const result = await publishPitchShowcase(pitchId, {
      name,
      description,
      image: images[coverImageIndex] || images[0] || null,
      images,
      amenities,
      featured_amenities: featuredAmenities,
      cover_image_index: coverImageIndex,
      quality_grades: qualityGrades,
      showcase_campaign: campaign,
      is_approved: true
    });
    setIsSaving(false);
    if (result.success) {
      setSavedJustNow(true);
      setTimeout(() => setSavedJustNow(false), 2500);
    } else {
      setUploadError(result.error || 'Yayınlama başarısız');
    }
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    await publishPitchShowcase(pitchId, {
      name,
      description,
      image: images[coverImageIndex] || images[0] || null,
      images,
      amenities,
      featured_amenities: featuredAmenities,
      cover_image_index: coverImageIndex,
      quality_grades: qualityGrades,
      showcase_campaign: campaign,
      is_approved: false
    });
    setIsSaving(false);
    setSavedJustNow(true);
    setTimeout(() => setSavedJustNow(false), 2500);
  };

  if (!sourcePitch) {
    return (
      <div className="min-h-screen bg-[#0A0E14] flex items-center justify-center text-white p-6">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 text-orange-400" size={48} />
          <p className="font-bold mb-4">Tesis bulunamadı</p>
          <button onClick={onBack} className="px-6 py-3 bg-[#FFFF00] text-black rounded-2xl font-black">
            Geri Dön
          </button>
        </div>
      </div>
    );
  }

  const previewWidth = previewDevice === 'MOBILE' ? 'max-w-[380px]' : 'max-w-[600px]';

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col">
      {/* HEADER */}
      <header className="bg-[#0A0E14]/95 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-30 shadow-lg">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-2xl bg-[#161B22] hover:bg-white/10 border border-white/5 flex items-center justify-center transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-lg font-black text-white italic tracking-tight uppercase">
                Vitrin Stüdyosu
              </h1>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                {sourcePitch.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {savedJustNow && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="px-3 py-2 bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-emerald-500/30 flex items-center gap-1.5"
              >
                <Check size={14} /> KAYDEDİLDİ
              </motion.div>
            )}
            <button
              onClick={handleSaveDraft}
              disabled={isSaving}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50"
            >
              Taslak
            </button>
            <button
              onClick={handlePublish}
              disabled={isSaving}
              className="px-5 py-2.5 bg-[#FFFF00] hover:bg-yellow-300 text-black text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,0,0.3)]"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              YAYINLA
            </button>
          </div>
        </div>
      </header>

      {/* MAIN GRID: SOL FORM + SAĞ PREVIEW */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_500px] gap-0 min-h-0">
        {/* SOL: FORM PANEL */}
        <div className="flex flex-col min-h-0 border-r border-white/5">
          {/* Tab bar */}
          <div className="flex overflow-x-auto custom-scrollbar bg-[#0A0E14] border-b border-white/5 shrink-0">
            {(Object.keys(TAB_LABELS) as StudioTab[]).map((tab) => {
              const Icon = TAB_LABELS[tab].icon;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-5 py-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                    isActive
                      ? 'border-[#FFFF00] text-[#FFFF00] bg-[#FFFF00]/5'
                      : 'border-transparent text-gray-500 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} /> {TAB_LABELS[tab].label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {activeTab === 'GENERAL' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                    Tesis Adı
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#161B22] border border-white/5 focus:border-[#FFFF00]/50 rounded-2xl px-5 py-4 text-white text-lg font-bold outline-none transition-colors"
                    placeholder="Örn: Arena Sport Center"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                    Açıklama
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={6}
                    className="w-full bg-[#161B22] border border-white/5 focus:border-[#FFFF00]/50 rounded-2xl px-5 py-4 text-white text-sm font-medium outline-none transition-colors resize-none"
                    placeholder="Tesisinizi oyunculara tanıtan kısa bir metin (max 300 karakter)"
                    maxLength={300}
                  />
                  <p className="text-[10px] text-gray-500 text-right">{description.length}/300</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-200 font-medium leading-relaxed">
                    Adınız ve açıklamanız oyuncuların ilk gördüğü bilgilerdir. Açıklamada konum avantajınızı,
                    açılış saatlerinizi ve öne çıkan özelliklerinizi vurgulayın.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'GALLERY' && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-white italic uppercase tracking-tight">
                    Galeri ({images.length})
                  </h3>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="px-5 py-3 bg-[#FFFF00] hover:bg-yellow-300 disabled:opacity-50 text-black text-[11px] font-black uppercase tracking-widest rounded-xl flex items-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> YÜKLENİYOR %{progress}
                      </>
                    ) : (
                      <>
                        <Plus size={14} /> FOTO EKLE
                      </>
                    )}
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                </div>

                {uploadError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-xs font-bold">
                    {uploadError}
                  </div>
                )}

                {images.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/10 rounded-3xl p-12 text-center cursor-pointer hover:border-white/20 hover:bg-white/5 transition-all"
                  >
                    <Camera size={48} className="text-gray-600 mx-auto mb-4" />
                    <p className="text-white font-bold mb-2">Henüz fotoğraf eklenmemiş</p>
                    <p className="text-xs text-gray-500">Tıklayın ve tesisinizin fotoğraflarını yükleyin</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {images.map((img, idx) => (
                      <motion.div
                        key={img + idx}
                        layout
                        className={`relative aspect-[16/10] rounded-2xl overflow-hidden border-2 transition-all group ${
                          coverImageIndex === idx
                            ? 'border-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.3)]'
                            : 'border-white/10'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() => setCoverImageIndex(idx)}
                            className="px-3 py-1.5 bg-[#FFFF00] text-black text-[9px] font-black uppercase rounded-lg"
                          >
                            Kapak Yap
                          </button>
                          <button
                            onClick={() => handleDeleteImage(idx)}
                            className="w-8 h-8 bg-red-500 text-white rounded-lg flex items-center justify-center"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {coverImageIndex === idx && (
                          <div className="absolute top-2 left-2 px-2 py-1 bg-[#FFFF00] text-black text-[8px] font-black uppercase tracking-widest rounded-md">
                            KAPAK
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'COURTS' && (
              <div className="space-y-6 max-w-3xl">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-200 font-medium leading-relaxed">
                    Tesisinizdeki her saha için ayrı açıklama ve özellikler ekleyebilirsiniz. Burada
                    yaptığınız değişiklikler oyuncular rezervasyon yaparken saha seçim ekranında görünür.
                  </p>
                </div>

                {courts.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-3xl">
                    <Tag size={48} className="text-gray-600 mx-auto mb-4" />
                    <p className="text-white font-bold">Henüz saha eklenmemiş</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Saha ekleme tesisleri yönetimi panelinden yapılır
                    </p>
                  </div>
                )}

                {courts.map((court, idx) => (
                  <div key={court.id} className="bg-[#161B22] border border-white/5 rounded-3xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FFFF00]/10 border border-[#FFFF00]/30 flex items-center justify-center text-[#FFFF00] font-black">
                          {idx + 1}
                        </div>
                        <input
                          type="text"
                          value={court.name}
                          onChange={(e) =>
                            setCourts(courts.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c)))
                          }
                          className="bg-transparent text-white font-black text-lg outline-none border-b border-transparent focus:border-[#FFFF00]/40"
                        />
                      </div>
                      <select
                        value={court.type}
                        onChange={(e) =>
                          setCourts(courts.map((c, i) => (i === idx ? { ...c, type: e.target.value as any } : c)))
                        }
                        className="bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-white text-[11px] font-bold outline-none"
                      >
                        <option value="OPEN">Açık</option>
                        <option value="CLOSED">Kapalı</option>
                      </select>
                    </div>
                    <textarea
                      value={court.description || ''}
                      onChange={(e) =>
                        setCourts(courts.map((c, i) => (i === idx ? { ...c, description: e.target.value } : c)))
                      }
                      rows={3}
                      className="w-full bg-[#0A0E14] border border-white/5 focus:border-[#FFFF00]/50 rounded-xl px-4 py-3 text-white text-sm outline-none resize-none"
                      placeholder="Bu sahaya özel detaylar (zemin türü, kapasite, tribün vs.)"
                    />
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                        Saatlik Ücret:
                      </span>
                      <input
                        type="number"
                        value={court.price}
                        onChange={(e) =>
                          setCourts(courts.map((c, i) => (i === idx ? { ...c, price: parseInt(e.target.value) || 0 } : c)))
                        }
                        className="bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-white font-black text-lg outline-none w-32"
                      />
                      <span className="text-sm font-bold text-gray-400">₺</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'AMENITIES' && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h3 className="text-lg font-black text-white italic uppercase tracking-tight mb-2">
                    Tesis Özellikleri
                  </h3>
                  <p className="text-xs text-gray-500">
                    İlk gördüğünüz <span className="text-[#FFFF00] font-bold">★</span> butonu özelliği vitrinde
                    öne çıkarır (max 3 adet).
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {EXTENDED_AMENITIES.map((amenity) => {
                    const isOn = amenities.includes(amenity);
                    const isFeatured = featuredAmenities.includes(amenity);
                    return (
                      <div
                        key={amenity}
                        className={`flex items-center gap-2 p-3 rounded-2xl border transition-all ${
                          isOn ? 'bg-[#FFFF00]/10 border-[#FFFF00]/30' : 'bg-[#161B22] border-white/5'
                        }`}
                      >
                        <button
                          onClick={() => toggleAmenity(amenity)}
                          className={`flex-1 text-left text-xs font-bold ${isOn ? 'text-[#FFFF00]' : 'text-gray-400'}`}
                        >
                          {isOn && <Check size={12} className="inline mr-1" />}
                          {amenity}
                        </button>
                        {isOn && (
                          <button
                            onClick={() => toggleFeatured(amenity)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                              isFeatured
                                ? 'bg-[#FFFF00] text-black'
                                : 'bg-white/5 text-gray-500 hover:bg-white/10'
                            }`}
                            title={isFeatured ? 'Öne çıkarmayı kaldır' : 'Vitrinde öne çıkar'}
                          >
                            <Star size={12} className={isFeatured ? 'fill-current' : ''} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {featuredAmenities.length > 0 && (
                  <div className="bg-[#FFFF00]/5 border border-[#FFFF00]/20 rounded-2xl p-4">
                    <p className="text-[10px] text-[#FFFF00] font-black uppercase tracking-widest mb-2">
                      VİTRİNDE ÖNE ÇIKAN ({featuredAmenities.length}/3)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {featuredAmenities.map((a) => (
                        <span
                          key={a}
                          className="px-3 py-1.5 bg-[#FFFF00] text-black text-[10px] font-black uppercase rounded-lg"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'CAMPAIGN' && (
              <div className="space-y-6 max-w-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-white italic uppercase tracking-tight">
                    Aktif Kampanya
                  </h3>
                  {campaign && (
                    <button
                      onClick={() => setCampaign(null)}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 text-[10px] font-black uppercase rounded-lg hover:bg-red-500/30"
                    >
                      KAMPANYAYI KALDIR
                    </button>
                  )}
                </div>

                {!campaign ? (
                  <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-3xl">
                    <Sparkles size={48} className="text-[#FFFF00]/50 mx-auto mb-4" />
                    <p className="text-white font-bold mb-2">Aktif kampanya yok</p>
                    <p className="text-xs text-gray-500 mb-6">
                      Vitrininize parıltılı bir kampanya ekleyin (örn. "Sabah saatleri %20 indirim")
                    </p>
                    <button
                      onClick={() =>
                        setCampaign({
                          title: 'Sabah Saatleri İndirimi',
                          subtitle: '08:00 - 12:00 arası %20 indirim',
                          discountPct: 20
                        })
                      }
                      className="px-6 py-3 bg-[#FFFF00] text-black font-black text-[11px] uppercase rounded-xl"
                    >
                      KAMPANYA OLUŞTUR
                    </button>
                  </div>
                ) : (
                  <div className="bg-gradient-to-br from-[#FFFF00]/10 to-transparent border border-[#FFFF00]/30 rounded-3xl p-5 space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                        Başlık
                      </label>
                      <input
                        type="text"
                        value={campaign.title}
                        onChange={(e) => setCampaign({ ...campaign, title: e.target.value })}
                        className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-[#FFFF00]/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                        Alt Başlık
                      </label>
                      <input
                        type="text"
                        value={campaign.subtitle || ''}
                        onChange={(e) => setCampaign({ ...campaign, subtitle: e.target.value })}
                        className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#FFFF00]/50"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1">
                          <Percent size={12} /> İndirim
                        </label>
                        <input
                          type="number"
                          value={campaign.discountPct || 0}
                          onChange={(e) =>
                            setCampaign({ ...campaign, discountPct: parseInt(e.target.value) || 0 })
                          }
                          className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-3 text-white font-black outline-none focus:border-[#FFFF00]/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1">
                          <Calendar size={12} /> Bitiş
                        </label>
                        <input
                          type="date"
                          value={campaign.validUntil || ''}
                          onChange={(e) => setCampaign({ ...campaign, validUntil: e.target.value })}
                          className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#FFFF00]/50"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'QUALITY' && (
              <div className="space-y-6 max-w-2xl">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-200 font-medium leading-relaxed">
                    A = Mükemmel, B = İyi, C = Yeterli. Bu notlar oyunculara saha kartında "Saha Notu" rozeti
                    olarak görünür. Dürüst not vermek müşteri güvenini artırır.
                  </p>
                </div>
                {([
                  { key: 'grass', label: 'Çim / Zemin', icon: '🌱' },
                  { key: 'lighting', label: 'Aydınlatma', icon: '💡' },
                  { key: 'lockerRoom', label: 'Soyunma Odası', icon: '🚿' }
                ] as const).map((cat) => (
                  <div key={cat.key} className="bg-[#161B22] border border-white/5 rounded-3xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{cat.icon}</span>
                        <span className="text-white font-black uppercase tracking-tight">{cat.label}</span>
                      </div>
                      <span className={`text-2xl font-black ${
                        qualityGrades[cat.key] === 'A' ? 'text-emerald-400' :
                        qualityGrades[cat.key] === 'B' ? 'text-yellow-400' : 'text-orange-400'
                      }`}>
                        {qualityGrades[cat.key]}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['A', 'B', 'C'] as const).map((grade) => (
                        <button
                          key={grade}
                          onClick={() => setQualityGrades({ ...qualityGrades, [cat.key]: grade })}
                          className={`py-3 rounded-xl font-black text-lg transition-all ${
                            qualityGrades[cat.key] === grade
                              ? grade === 'A'
                                ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/50'
                                : grade === 'B'
                                ? 'bg-yellow-500/20 text-yellow-400 border-2 border-yellow-500/50'
                                : 'bg-orange-500/20 text-orange-400 border-2 border-orange-500/50'
                              : 'bg-white/5 text-gray-500 border-2 border-transparent hover:bg-white/10'
                          }`}
                        >
                          {grade}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SAĞ: CANLI ÖNİZLEME */}
        <div className="bg-[#06080A] flex flex-col min-h-0 hidden lg:flex">
          <div className="border-b border-white/5 p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Eye size={16} className="text-[#FFFF00]" />
              <span className="text-[11px] font-black text-white uppercase tracking-widest">
                OYUNCU GÖRÜNÜMÜ
              </span>
            </div>
            <div className="flex items-center gap-1 bg-[#161B22] p-1 rounded-lg border border-white/5">
              <button
                onClick={() => setPreviewDevice('MOBILE')}
                className={`p-1.5 rounded-md transition-colors ${
                  previewDevice === 'MOBILE' ? 'bg-[#FFFF00] text-black' : 'text-gray-500'
                }`}
              >
                <Smartphone size={14} />
              </button>
              <button
                onClick={() => setPreviewDevice('TABLET')}
                className={`p-1.5 rounded-md transition-colors ${
                  previewDevice === 'TABLET' ? 'bg-[#FFFF00] text-black' : 'text-gray-500'
                }`}
              >
                <Tablet size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className={`mx-auto ${previewWidth} transition-all duration-300`}>
              <PitchShowcaseCard pitch={previewPitch} variant="preview" />

              {/* Owner'a yansıma: vitrin değişiklikleri canlıdır mesajı */}
              <div className="mt-6 p-4 bg-[#FFFF00]/5 border border-[#FFFF00]/20 rounded-2xl flex items-start gap-3">
                <Sparkles size={18} className="text-[#FFFF00] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-[#FFFF00] uppercase tracking-widest mb-1">
                    CANLI ÖNİZLEME
                  </p>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    Yaptığınız her değişiklik anlık burada görünür. "Yayınla"ya bastığınızda 2 saniye içinde
                    tüm oyunculara gerçek zamanlı yansır.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VitrinStudio;
