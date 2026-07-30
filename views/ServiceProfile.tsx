
import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserRole } from '../types';
import {
  ArrowLeft, Camera, Star, MapPin, Clock, Shield, Scale, Edit3,
  Check, X, Upload, Image as ImageIcon, Trash2,
  Award, Target, Zap
} from 'lucide-react';

interface ServiceProfileProps {
  role: UserRole;
  onBack: () => void;
}

import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { useImageUpload } from '../hooks/useImageUpload';
import { showToast } from '../components/common/GlobalToast';
import { Goalkeeper, Referee } from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from 'react-leaflet';
import { OYNA_TILE_URL, oynaTileProps, oynaMapProps, OYNA_MAP_CSS } from '../components/map/mapBase';

// Fix leaflet default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// F3d: "Hazır Fotoğraflar" (Unsplash stok yabancı kaleci/hakem fotoğrafları)
// KALDIRILDI — stok foto sağlayıcının GERÇEK avatarı olarak DB'ye yazılıyor ve
// pazaryerinde kaptanlara kimlikmiş gibi gösteriliyordu (yanıltma + telif).
// Tek yol: cihazdan gerçek fotoğraf yükleme; yoksa baş harf avatarı.

const GK_STYLES = ['Panter', 'Duvar', 'Libero', 'Atak', 'Dengeli'];
const REF_STYLES = ['Otoriter', 'Diyalogcu', 'Teknisyen', 'Hızlı Karar'];

const ServiceProfile: React.FC<ServiceProfileProps> = ({ role, onBack }) => {
  const isRef = role === UserRole.REFEREE;

  const { adminGoalkeepers, adminReferees, updateOwnProvider, activeRegion } = useAppStore();
  const currentUser = auth.currentUser;
  
  const userProfile = React.useMemo(() => {
      if (!currentUser) return null;
      if (isRef) {
          return adminReferees.find(r => r.authUid === currentUser.uid || r.id === currentUser.uid) as Referee | undefined;
      } else {
          return adminGoalkeepers.find(g => g.id === currentUser.uid) as Goalkeeper | undefined;
      }
  }, [adminGoalkeepers, adminReferees, currentUser, isRef]);

  // KD-9/KD-M1: sahte demo default'ları ("UĞURCAN Ç." / "penaltı kurtarma %40" /
  // fee 250 / "Panter") kaldırıldı — profil yüklenene kadar boş; render'da yükleme
  // guard'ı sahte-düzenlenebilir profili engelliyor.
  const defaultName = userProfile?.name || '';
  const defaultBio = userProfile?.bio || '';
  const defaultFee = userProfile?.fee || 0;
  const defaultStyle = typeof userProfile?.style === 'string' ? userProfile.style : '';

  // Mevcut avatar stok Unsplash URL'siyse yok say (F3d veri temizliği migration'ı
  // canlıyı NULL'a çeker; UI de defansif davranır).
  const [customPhoto, setCustomPhoto] = useState<string | null>(() => {
    const a = userProfile?.avatar || null;
    return a && a.includes('images.unsplash.com') ? null : a;
  });
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState(defaultBio);
  const [tempBio, setTempBio] = useState(bio);
  const [selectedStyle, setSelectedStyle] = useState(defaultStyle);
  
  // Hizmet bölgesi editörü: gerçek profil konumu → activeRegion şehri → ülke merkezi.
  // Sabit ORDU_CENTER kaldırıldı (Ordu dışı sağlayıcı yanlış merkez görmesin).
  const defaultCenter: [number, number] = activeRegion?.coordinates
    ? [activeRegion.coordinates.lat, activeRegion.coordinates.lng]
    : [39.0, 35.0];
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    userProfile?.coordinates ? [userProfile.coordinates.lat, userProfile.coordinates.lng] : defaultCenter
  );
  // KD-6: radius yalnız yazılıp hiç GERİ OKUNMUYORDU → her açılışta 15'e dönüyordu.
  // Artık kayıtlı settings.radiusKm'den başlatılır + yüklenince senkronlanır (effect).
  const [radiusKm, setRadiusKm] = useState<number>(() => {
    const r = (userProfile as any)?.settings?.radiusKm;
    return typeof r === 'number' && Number.isFinite(r) ? r : 15;
  });
  
  const MapEventsComponent = () => {
    useMapEvents({
      moveend: (e) => {
        const center = e.target.getCenter();
        setMapCenter([center.lat, center.lng]);
      }
    });
    return null;
  };
  
  const [displayName, setDisplayName] = useState(defaultName);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(displayName);
  const [fee, setFee] = useState(defaultFee);
  const [editingFee, setEditingFee] = useState(false);

  React.useEffect(() => {
      if (userProfile) {
          if (userProfile.name) setDisplayName(userProfile.name);
          if (userProfile.bio) setBio(userProfile.bio);
          if (userProfile.fee) setFee(userProfile.fee);
          if (userProfile.style) setSelectedStyle(typeof userProfile.style === 'string' ? userProfile.style : 'Dengeli');
          if (userProfile.avatar) setCustomPhoto(userProfile.avatar);
          // KD-6: kayıtlı radius'u geri oku (mount'tan sonra yüklenirse de senkronla).
          const r = (userProfile as any).settings?.radiusKm;
          if (typeof r === 'number' && Number.isFinite(r)) setRadiusKm(r);
      }
  }, [userProfile]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Avatar'ı storage'a yükle (compress + public URL) — base64'ü DB kolonuna
  // yazmak yerine (satır/pazaryeri yükünü şişiriyordu).
  const { uploadImage, uploading: photoUploading } = useImageUpload('avatars', { minWidth: 200 });



  const currentPhoto = customPhoto;

  const accentColor = isRef ? '#ef4444' : '#22c55e';
  const accentBg = isRef ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)';
  const gradientFrom = isRef ? 'from-red-950' : 'from-green-950';

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!userProfile) {
      setSaveError('Sağlayıcı profilin yüklenemedi. Lütfen sayfayı yenileyip tekrar dene.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // FAZ 8A — self-servis RPC (provider_update_own_profile): admin yetkisi
      // istemez; radius sağlayıcı ayarı olarak settings JSONB'ye yazılır.
      await updateOwnProvider(isRef ? 'REF' : 'GK', {
        id: userProfile.id,
        bio: tempBio,
        fee,
        name: displayName,
        style: selectedStyle,
        // WYSIWYG: ekranda görünen (yüklenmiş) fotoğraf kaydedilir; stok havuz yok.
        avatar: currentPhoto,
        coordinates: { lat: mapCenter[0], lng: mapCenter[1] },
        settings: { ...(userProfile as any).settings, radiusKm },
      });
      setBio(tempBio);
      onBack();
    } catch (err: any) {
      console.error('Profil kaydetme hatası:', err);
      setSaveError(err?.message || 'Profil kaydedilemedi. Lütfen tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  // KD-8: fotoğraf base64 data-URL olarak goalkeepers.avatar'a yazılıyordu → satırı
  // ve HER find_providers/marketplace payload'ını şişiriyordu. Artık Storage'a
  // ('avatars') yüklenir, kalıcı public URL saklanır; hata kullanıcıya bildirilir.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      setCustomPhoto(url);
      setShowPhotoPicker(false);
    } catch (err: any) {
      console.error('Foto yükleme hatası:', err);
      showToast(err?.message || 'Fotoğraf yüklenemedi. JPG/PNG dene (en fazla ~10MB).');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  // Dürüstlük (KS0/KD-3): eksik veri sahte sayıya (42/12/94/9.2/4.9) düşürülmez;
  // gerçek değer yoksa "—". Puan 0-10 ölçeğinde ve yalnız >0 ise gösterilir.
  const ratingDisplay =
    typeof userProfile?.rating === 'number' && userProfile.rating > 0
      ? userProfile.rating.toFixed(1)
      : '—';
  const matchDisplay = userProfile?.matchCount != null ? String(userProfile.matchCount) : '—';
  const numOrDash = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '—');
  const strOrDash = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '—');
  const stats = isRef
    ? [
        { label: 'Yönetim', value: numOrDash((userProfile as Referee)?.stats?.authority), icon: <Scale size={14} /> },
        { label: 'VAR %', value: strOrDash((userProfile as Referee)?.stats?.varCallAccuracy), icon: <Target size={14} /> },
        { label: 'Puan', value: ratingDisplay, icon: <Star size={14} /> },
        { label: 'Sarı Kart Ort.', value: numOrDash((userProfile as Referee)?.stats?.avgCards), icon: <Award size={14} /> },
      ]
    : [
        // #107 cleanSheets'i kaldırdı (tip + tüm katmanlar); HS-serisi dürüst
        // değerleri (matchDisplay/strOrDash/ratingDisplay — sahte 42/94/9.2 yok)
        // korunur. İki niyet birleşti: CS satırı gitti, dürüstlük kaldı.
        { label: 'Maç', value: matchDisplay, icon: <Shield size={14} /> },
        { label: 'Refleks %', value: strOrDash((userProfile as Goalkeeper)?.stats?.savePercentage), icon: <Zap size={14} /> },
        { label: 'Puan', value: ratingDisplay, icon: <Star size={14} /> },
      ];

  // KD-9: profil store'a düşmeden SAHTE düzenlenebilir default'ları gösterme. Yükleme
  // durumu + "Geri Dön" ile kullanıcı boş/sahte formu düzenleyip "kaydedilemedi"
  // hatasına düşmez (eski davranış: UĞURCAN Ç./fee 250 fake formu düzenlenebiliyordu).
  if (!userProfile) {
    return (
      <div className="min-h-screen bg-[#060A12] text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-[#22c55e] animate-spin mb-4" />
        <p className="text-sm text-gray-400 font-bold">Profilin yükleniyor…</p>
        <button onClick={onBack} className="mt-6 h-11 px-5 rounded-2xl bg-white/5 border border-white/10 text-sm font-extrabold text-white/80 active:scale-95">
          Geri Dön
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060A12] text-white relative overflow-x-hidden">

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-72 h-72 rounded-full blur-[120px]"
          style={{ background: accentColor, opacity: 0.08 }} />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full blur-[100px]"
          style={{ background: accentColor, opacity: 0.05 }} />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 pt-12 pb-4 flex items-center justify-between bg-[#060A12]/80 backdrop-blur-xl border-b border-white/5">
        <button onClick={onBack} className="p-2.5 rounded-2xl bg-white/5 border border-white/10">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-sm font-extrabold uppercase tracking-widest" style={{ color: accentColor }}>
          {isRef ? 'HAKEM' : 'KALECİ'} PROFİLİ
        </h1>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handleSave}
          className="px-4 py-2 rounded-2xl font-extrabold text-xs uppercase tracking-wider text-black flex items-center gap-1.5"
          style={{ background: saving ? '#22c55e' : accentColor, minWidth: 72 }}
          disabled={saving}
        >
          {/* KD-7: yazım sürerken "Kaydedildi" demek yanlıştı (henüz kaydedilmedi,
              hata bile bilinmiyor). Doğrusu "Kaydediliyor…". */}
          {saving ? 'Kaydediliyor…' : 'KAYDET'}
        </motion.button>
      </div>

      <div className="pb-20 space-y-5 px-4">

        {saveError && (
          <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30">
            <p className="text-[0.6875rem] font-bold text-red-400">{saveError}</p>
          </div>
        )}

        {/* ─── Hero Photo Section ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mt-5"
        >
          {/* Background gradient card */}
          <div className={`absolute inset-0 rounded-[32px] bg-gradient-to-b ${gradientFrom} to-[#0d1420] opacity-70`} />

          <div className="relative rounded-[32px] overflow-hidden border border-white/8 shadow-2xl">
            {/* Cover */}
            <div className="h-36 w-full relative overflow-hidden">
              {currentPhoto ? (
                <img
                  src={currentPhoto}
                  className="w-full h-full object-cover opacity-30 blur-sm scale-110"
                  alt="cover"
                />
              ) : (
                <div className={`w-full h-full bg-gradient-to-br ${gradientFrom} to-[#0d1420] opacity-60`} />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0d1420]" />
            </div>

            {/* Profile photo + name */}
            <div className="px-5 pb-5">
              <div className="flex items-end gap-4 -mt-14 relative z-10">
                {/* Avatar */}
                <div className="relative">
                  <div
                    className="w-24 h-28 rounded-[20px] overflow-hidden border-2 shadow-2xl"
                    style={{ borderColor: accentColor, boxShadow: `0 0 24px ${accentColor}50` }}
                  >
                    {currentPhoto ? (
                      <img
                        src={currentPhoto}
                        className="w-full h-full object-cover object-top"
                        alt="profile"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl font-extrabold text-white/80" style={{ background: accentBg }}>
                        {(displayName || '?').trim().charAt(0).toLocaleUpperCase('tr-TR')}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowPhotoPicker(true)}
                    className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-black font-extrabold shadow-lg"
                    style={{ background: accentColor }}
                  >
                    <Camera size={14} />
                  </button>
                </div>

                {/* Name & badge */}
                <div className="flex-1 pb-1">
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={tempName}
                        onChange={e => setTempName(e.target.value)}
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white font-extrabold text-lg w-full outline-none"
                      />
                      <button
                        onClick={() => { setDisplayName(tempName); setEditingName(false); }}
                        className="p-1.5 rounded-lg text-black"
                        style={{ background: accentColor }}
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-extrabold text-white tracking-tight">{displayName}</h2>
                      <button onClick={() => setEditingName(true)} className="text-ink-4 hover:text-white">
                        <Edit3 size={14} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {/* "Elit/FIFA" rozeti yalnız gerçekten elit sağlayıcıda (isElite);
                        herkese "ELİT KALECİ" demek dürüst değil (KS0). */}
                    {userProfile?.isElite && (
                      <span
                        className="text-[0.625rem] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider text-black"
                        style={{ background: accentColor }}
                      >
                        {isRef ? 'FIFA LİSANSLI' : 'ELİT KALECİ'}
                      </span>
                    )}
                    <span className="text-[0.6875rem] text-gray-400 font-bold flex items-center gap-1">
                      <Star size={9} className="text-yellow-400" fill="currentColor" /> {ratingDisplay}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2 mt-5">
                {stats.map(stat => (
                  <div
                    key={stat.label}
                    className="rounded-2xl p-3 flex flex-col items-center gap-1 border border-white/5"
                    style={{ background: accentBg }}
                  >
                    <span style={{ color: accentColor }}>{stat.icon}</span>
                    <span className="text-base font-extrabold text-white">{stat.value}</span>
                    <span className="text-[0.625rem] text-gray-400 font-bold uppercase tracking-wider text-center leading-tight">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─── Açıklama (Bio) ─── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-[24px] p-5 border border-white/8 bg-[#0d1420]"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[0.625rem] font-extrabold uppercase tracking-widest" style={{ color: accentColor }}>
              Hakkımda
            </h3>
            <button onClick={() => { setTempBio(bio); setEditingBio(true); }} className="text-ink-4 hover:text-white p-1">
              <Edit3 size={14} />
            </button>
          </div>
          {editingBio ? (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={tempBio}
                onChange={e => setTempBio(e.target.value)}
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white outline-none resize-none focus:border-white/30 transition-colors"
                placeholder="Kendini tanıt…"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingBio(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 text-xs font-extrabold"
                >
                  İPTAL
                </button>
                <button
                  onClick={() => { setBio(tempBio); setEditingBio(false); }}
                  className="flex-1 py-2.5 rounded-xl text-black text-xs font-extrabold"
                  style={{ background: accentColor }}
                >
                  {/* KD-7: bu buton yalnız düzenlemeyi onaylar; DB'ye yazan üstteki
                      KAYDET'tir → "KAYDET" yerine "TAMAM" (yanıltıcı çift-kaydet yok). */}
                  TAMAM
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-300 leading-relaxed">{bio}</p>
          )}
        </motion.div>

        {/* ─── Ücret Ayarı ─── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13 }}
          className="rounded-[24px] p-5 border border-white/8 bg-[#0d1420]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.625rem] font-extrabold uppercase tracking-widest mb-1" style={{ color: accentColor }}>
                Maç Başı Standart Ücret
              </p>
              {editingFee ? (
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-extrabold" style={{ color: accentColor }}>₺</span>
                  <input
                    autoFocus
                    type="number"
                    value={fee}
                    onChange={e => setFee(Number(e.target.value))}
                    className="bg-transparent text-4xl font-extrabold text-white w-28 outline-none border-b-2 border-white/20 focus:border-white/60 transition-colors"
                  />
                  <button
                    onClick={() => setEditingFee(false)}
                    className="p-2 rounded-xl text-black"
                    style={{ background: accentColor }}
                  >
                    <Check size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-extrabold text-white">{fee}₺</span>
                  <button onClick={() => setEditingFee(true)} className="text-ink-4 hover:text-white p-1">
                    <Edit3 size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {[200, 300, 400, 500].map(v => (
                <button
                  key={v}
                  onClick={() => setFee(v)}
                  className="px-3 py-1 rounded-lg text-xs font-extrabold transition-all"
                  style={{
                    background: fee === v ? accentColor : 'rgba(255,255,255,0.05)',
                    color: fee === v ? '#000' : '#9ca3af',
                    border: `1px solid ${fee === v ? accentColor : 'rgba(255,255,255,0.08)'}`
                  }}
                >
                  {v}₺
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ─── Oyun Tarzı ─── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.17 }}
          className="rounded-[24px] p-5 border border-white/8 bg-[#0d1420]"
        >
          <h3 className="text-[0.625rem] font-extrabold uppercase tracking-widest mb-3" style={{ color: accentColor }}>
            {isRef ? 'Yönetim Tarzı' : 'Oyun Tarzı'}
          </h3>
          <div className="flex flex-wrap gap-2">
            {(isRef ? REF_STYLES : GK_STYLES).map(style => (
              <motion.button
                key={style}
                whileTap={{ scale: 0.94 }}
                onClick={() => setSelectedStyle(style)}
                className="px-4 py-2 rounded-2xl text-xs font-extrabold transition-all border"
                style={{
                  background: selectedStyle === style ? accentColor : 'rgba(255,255,255,0.04)',
                  color: selectedStyle === style ? '#000' : '#9ca3af',
                  borderColor: selectedStyle === style ? accentColor : 'rgba(255,255,255,0.08)',
                  boxShadow: selectedStyle === style ? `0 0 14px ${accentColor}50` : 'none'
                }}
              >
                {style}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* ─── Bölge Tercihleri (Harita) ─── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.21 }}
          className="rounded-[24px] p-5 border border-white/8 bg-[#0d1420] overflow-hidden"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin size={14} style={{ color: accentColor }} />
              <h3 className="text-[0.625rem] font-extrabold uppercase tracking-widest" style={{ color: accentColor }}>
                Çalışma Alanı (Yarıçap)
              </h3>
            </div>
            <span className="text-xs font-extrabold text-white">{radiusKm} km</span>
          </div>

          <div className="mb-4">
            <input 
              type="range" 
              min="5" max="50" step="5"
              value={radiusKm}
              onChange={(e) => setRadiusKm(parseInt(e.target.value))}
              className="w-full h-1 bg-white/20 rounded-full appearance-none outline-none"
              style={{ accentColor: accentColor }}
            />
            <div className="flex justify-between text-[0.6875rem] text-ink-4 font-bold mt-1">
              <span>5 km</span>
              <span>50 km</span>
            </div>
          </div>

          <div className="h-[200px] w-full rounded-2xl overflow-hidden border border-white/5 relative z-0">
            <style>{OYNA_MAP_CSS}</style>
            <MapContainer center={mapCenter} zoom={10} style={{ height: '100%', width: '100%', zIndex: 0 }} {...oynaMapProps}>
              <TileLayer url={OYNA_TILE_URL} {...oynaTileProps} />
              <MapEventsComponent />
              <Marker position={mapCenter} />
              <Circle 
                center={mapCenter} 
                radius={radiusKm * 1000} 
                pathOptions={{ fillColor: accentColor, color: accentColor, fillOpacity: 0.2 }}
              />
            </MapContainer>
            {/* Map overlay pointer block */}
            <div className="absolute inset-0 z-[400] flex items-center justify-center pointer-events-none">
                <div className="w-4 h-4 rounded-full border-2 border-white bg-transparent pointer-events-none opacity-50" />
            </div>
            <p className="absolute bottom-2 left-2 text-[0.6875rem] bg-black/60 px-2 py-1 rounded-md text-gray-300 z-[400] font-bold">
              Haritayı hareket ettirerek merkezi belirle
            </p>
          </div>
          
          <button 
            className="w-full mt-4 py-3 rounded-xl font-extrabold text-sm text-black transition-colors"
            style={{ background: accentColor }}
            onClick={async () => {
                if (userProfile?.id) {
                    try {
                        await updateOwnProvider(isRef ? 'REF' : 'GK', {
                            id: userProfile.id,
                            coordinates: { lat: mapCenter[0], lng: mapCenter[1] },
                            settings: { ...(userProfile.settings || {}), radiusKm },
                        });
                        setSaveError(null);
                    } catch (err: any) {
                        setSaveError(err?.message || 'Lokasyon kaydedilemedi.');
                    }
                }
            }}
          >
            LOKASYONU KAYDET
          </button>
        </motion.div>

      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* Photo Picker Modal */}
      <AnimatePresence>
        {showPhotoPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-end"
            onClick={() => setShowPhotoPicker(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full bg-[#0d1420] rounded-t-[36px] border-t border-white/10 p-6"
              onClick={e => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />

              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="font-extrabold text-white text-lg">Profil Fotoğrafı</h3>
                  <p className="text-[0.6875rem] text-ink-4 mt-0.5">Bir fotoğraf seç veya cihazından yükle</p>
                </div>
                <button onClick={() => setShowPhotoPicker(false)} className="p-2 bg-white/5 rounded-xl text-gray-400">
                  <X size={18} />
                </button>
              </div>

              {/* Upload from device */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="w-full mb-4 py-4 rounded-2xl border-2 border-dashed flex items-center justify-center gap-3 font-extrabold text-sm transition-all disabled:opacity-60"
                style={{ borderColor: accentColor + '60', background: accentBg, color: accentColor }}
              >
                <Upload size={20} />
                {photoUploading ? 'YÜKLENİYOR…' : 'CİHAZDAN FOTOĞRAF YÜKLE'}
              </motion.button>

              {/* F3d: stok "Hazır Fotoğraflar" ızgarası kaldırıldı — yalnız gerçek yükleme. */}

              {/* Remove custom photo */}
              {customPhoto && (
                <button
                  onClick={() => { setCustomPhoto(null); setShowPhotoPicker(false); }}
                  className="w-full py-3 rounded-2xl border border-red-500/30 text-red-400 font-extrabold text-xs flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} /> Yüklenen Fotoğrafı Kaldır
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default ServiceProfile;
