
import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserRole } from '../types';
import {
  ArrowLeft, Camera, Star, MapPin, Clock, Shield, Scale, Edit3,
  Check, X, Upload, Image as ImageIcon, Trash2,
  Award, Target, Zap, Trophy
} from 'lucide-react';

interface ServiceProfileProps {
  role: UserRole;
  onBack: () => void;
}

import { useAppStore } from '../store';
import { ORDU_CENTER, ORDU_DISTRICT_NAMES } from '../utils/orduData';
import { auth } from '../supabaseAuth';
import { Goalkeeper, Referee } from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from 'react-leaflet';

// Fix leaflet default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Uğurcan Çakır tarzı kaleci fotoğrafları
const GOALKEEPER_PHOTOS = [
  'https://images.unsplash.com/photo-1544966614-05a04dd69d0c?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1574629310576-6e84c60be5cb?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&q=80&w=400',
];

const REFEREE_PHOTOS = [
  'https://images.unsplash.com/photo-1574629310576-6e84c60be5cb?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1580234811497-9df7fd2f357e?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1599077108862-31aa1ab6a69e?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&q=80&w=400',
];

const GK_STYLES = ['Panter', 'Duvar', 'Libero', 'Atak', 'Dengeli'];
const REF_STYLES = ['Otoriter', 'Diyalogcu', 'Teknisyen', 'Hızlı Karar'];
const REGIONS = [
  { city: 'Ordu', districts: ORDU_DISTRICT_NAMES },
];

const ServiceProfile: React.FC<ServiceProfileProps> = ({ role, onBack }) => {
  const isRef = role === UserRole.REFEREE;
  const photoPool = isRef ? REFEREE_PHOTOS : GOALKEEPER_PHOTOS;

  const { adminGoalkeepers, adminReferees, updateGoalkeeper, updateReferee } = useAppStore();
  const currentUser = auth.currentUser;
  
  const userProfile = React.useMemo(() => {
      if (!currentUser) return null;
      if (isRef) {
          return adminReferees.find(r => r.authUid === currentUser.uid || r.id === currentUser.uid) as Referee | undefined;
      } else {
          return adminGoalkeepers.find(g => g.id === currentUser.uid) as Goalkeeper | undefined;
      }
  }, [adminGoalkeepers, adminReferees, currentUser, isRef]);

  const defaultName = userProfile?.name || (isRef ? 'CÜNEYT A.' : 'UĞURCAN Ç.');
  const defaultBio = userProfile?.bio || (isRef
      ? 'FIFA lisanslı hakem. 150+ maç deneyimi. Pozisyon odaklı, diyalog temelli yaklaşım.'
      : 'Saha kalecisi. Refleks ve pozisyon almada uzmanım. Penaltı kurtarma oranım %40.');
  const defaultFee = userProfile?.fee || (isRef ? 350 : 250);
  const defaultStyle = typeof userProfile?.style === 'string' ? userProfile.style : (isRef ? 'Otoriter' : 'Panter');

  const [photoIndex, setPhotoIndex] = useState(0);
  const [customPhoto, setCustomPhoto] = useState<string | null>(userProfile?.avatar || null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState(defaultBio);
  const [tempBio, setTempBio] = useState(bio);
  const [selectedStyle, setSelectedStyle] = useState(defaultStyle);
  
  const defaultCenter: [number, number] = [ORDU_CENTER.lat, ORDU_CENTER.lng];
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    userProfile?.coordinates ? [userProfile.coordinates.lat, userProfile.coordinates.lng] : defaultCenter
  );
  const [radiusKm, setRadiusKm] = useState(15);
  
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
      }
  }, [userProfile]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);



  const currentPhoto = customPhoto ?? photoPool[photoIndex];

  const accentColor = isRef ? '#ef4444' : '#22c55e';
  const accentBg = isRef ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)';
  const gradientFrom = isRef ? 'from-red-950' : 'from-green-950';

  const handleSave = async () => {
    if (!userProfile) {
      onBack();
      return;
    }
    setSaving(true);
    try {
      const update = {
        ...userProfile,
        bio: tempBio,
        fee,
        name: displayName,
        style: selectedStyle,
        avatar: customPhoto || userProfile.avatar,
        coordinates: { lat: mapCenter[0], lng: mapCenter[1] },
      };
      if (isRef) await updateReferee(update as Referee);
      else await updateGoalkeeper(update as Goalkeeper);
      setBio(tempBio);
      onBack();
    } catch (err) {
      console.error('Profil kaydetme hatası:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCustomPhoto(ev.target?.result as string);
      setShowPhotoPicker(false);
    };
    reader.readAsDataURL(file);
  };

  const stats = isRef
    ? [
        { label: 'Yönetim', value: (userProfile as Referee)?.stats?.authority?.toString() || '95', icon: <Scale size={14} /> },
        { label: 'VAR %', value: (userProfile as Referee)?.stats?.varCallAccuracy || '98', icon: <Target size={14} /> },
        { label: 'Puan', value: userProfile?.rating?.toString() || '4.9', icon: <Star size={14} /> },
        { label: 'Sarı Kart Ort.', value: (userProfile as Referee)?.stats?.avgCards?.toString() || '2.1', icon: <Award size={14} /> },
      ]
    : [
        { label: 'Maç', value: userProfile?.matchCount?.toString() || '42', icon: <Shield size={14} /> },
        { label: 'CS', value: (userProfile as Goalkeeper)?.stats?.cleanSheets?.toString() || '12', icon: <Trophy size={14} /> },
        { label: 'Refleks %', value: (userProfile as Goalkeeper)?.stats?.savePercentage?.toString() || '94', icon: <Zap size={14} /> },
        { label: 'Puan', value: userProfile?.rating?.toString() || '9.2', icon: <Star size={14} /> },
      ];

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
        <h1 className="text-sm font-black uppercase tracking-widest" style={{ color: accentColor }}>
          {isRef ? 'HAKEM' : 'KALECİ'} PROFİLİ
        </h1>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handleSave}
          className="px-4 py-2 rounded-2xl font-black text-xs uppercase tracking-wider text-black flex items-center gap-1.5"
          style={{ background: saving ? '#22c55e' : accentColor, minWidth: 72 }}
        >
          {saving ? <><Check size={14} /> Kaydedildi</> : 'KAYDET'}
        </motion.button>
      </div>

      <div className="pb-20 space-y-5 px-4">

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
              <img
                src={currentPhoto}
                className="w-full h-full object-cover opacity-30 blur-sm scale-110"
                alt="cover"
              />
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
                    <img
                      src={currentPhoto}
                      className="w-full h-full object-cover object-top"
                      alt="profile"
                    />
                  </div>
                  <button
                    onClick={() => setShowPhotoPicker(true)}
                    className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-black font-black shadow-lg"
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
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white font-black text-lg w-full outline-none"
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
                      <h2 className="text-2xl font-black text-white tracking-tight">{displayName}</h2>
                      <button onClick={() => setEditingName(true)} className="text-gray-500 hover:text-white">
                        <Edit3 size={14} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider text-black"
                      style={{ background: accentColor }}
                    >
                      {isRef ? 'FIFA LİSANSLI' : 'ELİT KALECİ'}
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                      <Star size={9} className="text-yellow-400" fill="currentColor" /> 4.9
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
                    <span className="text-base font-black text-white">{stat.value}</span>
                    <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider text-center leading-tight">{stat.label}</span>
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
            <h3 className="text-[10px] font-black uppercase tracking-widest" style={{ color: accentColor }}>
              Hakkımda
            </h3>
            <button onClick={() => { setTempBio(bio); setEditingBio(true); }} className="text-gray-500 hover:text-white p-1">
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
                placeholder="Kendini tanıt..."
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingBio(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 text-xs font-black"
                >
                  İPTAL
                </button>
                <button
                  onClick={() => { setBio(tempBio); setEditingBio(false); }}
                  className="flex-1 py-2.5 rounded-xl text-black text-xs font-black"
                  style={{ background: accentColor }}
                >
                  KAYDET
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
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: accentColor }}>
                Maç Başı Standart Ücret
              </p>
              {editingFee ? (
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-black" style={{ color: accentColor }}>₺</span>
                  <input
                    autoFocus
                    type="number"
                    value={fee}
                    onChange={e => setFee(Number(e.target.value))}
                    className="bg-transparent text-4xl font-black text-white w-28 outline-none border-b-2 border-white/20 focus:border-white/60 transition-colors"
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
                  <span className="text-4xl font-black text-white">{fee}₺</span>
                  <button onClick={() => setEditingFee(true)} className="text-gray-500 hover:text-white p-1">
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
                  className="px-3 py-1 rounded-lg text-xs font-black transition-all"
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
          <h3 className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: accentColor }}>
            {isRef ? 'Yönetim Tarzı' : 'Oyun Tarzı'}
          </h3>
          <div className="flex flex-wrap gap-2">
            {(isRef ? REF_STYLES : GK_STYLES).map(style => (
              <motion.button
                key={style}
                whileTap={{ scale: 0.94 }}
                onClick={() => setSelectedStyle(style)}
                className="px-4 py-2 rounded-2xl text-xs font-black transition-all border"
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
              <h3 className="text-[10px] font-black uppercase tracking-widest" style={{ color: accentColor }}>
                Çalışma Alanı (Yarıçap)
              </h3>
            </div>
            <span className="text-xs font-black text-white">{radiusKm} km</span>
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
            <div className="flex justify-between text-[9px] text-gray-500 font-bold mt-1">
              <span>5 km</span>
              <span>50 km</span>
            </div>
          </div>

          <div className="h-[200px] w-full rounded-2xl overflow-hidden border border-white/5 relative z-0">
            <MapContainer center={mapCenter} zoom={10} style={{ height: '100%', width: '100%', zIndex: 0 }}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
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
            <p className="absolute bottom-2 left-2 text-[10px] bg-black/60 px-2 py-1 rounded-md text-gray-300 z-[400] font-bold">
              Haritayı hareket ettirerek merkezi belirle
            </p>
          </div>
          
          <button 
            className="w-full mt-4 py-3 rounded-xl font-black text-sm text-black transition-colors"
            style={{ background: accentColor }}
            onClick={() => {
                // Burada veritabanına kayıt işlemi olacak
                if (userProfile?.id) {
                    const update = { id: userProfile.id, coordinates: { lat: mapCenter[0], lng: mapCenter[1] }, settings: { ...(userProfile.settings || {}), radiusKm } };
                    if (isRef) useAppStore.getState().updateReferee(update as any);
                    else useAppStore.getState().updateGoalkeeper(update as any);
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
                  <h3 className="font-black text-white text-lg">Profil Fotoğrafı</h3>
                  <p className="text-[10px] text-gray-500 mt-0.5">Bir fotoğraf seç veya cihazından yükle</p>
                </div>
                <button onClick={() => setShowPhotoPicker(false)} className="p-2 bg-white/5 rounded-xl text-gray-400">
                  <X size={18} />
                </button>
              </div>

              {/* Upload from device */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => fileInputRef.current?.click()}
                className="w-full mb-4 py-4 rounded-2xl border-2 border-dashed flex items-center justify-center gap-3 font-black text-sm transition-all"
                style={{ borderColor: accentColor + '60', background: accentBg, color: accentColor }}
              >
                <Upload size={20} />
                CİHAZDAN FOTOĞRAF YÜKLE
              </motion.button>

              {/* Preset grid */}
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Hazır Fotoğraflar</p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {photoPool.map((url, idx) => (
                  <motion.button
                    key={idx}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => { setPhotoIndex(idx); setCustomPhoto(null); setShowPhotoPicker(false); }}
                    className="relative rounded-2xl overflow-hidden aspect-square border-2 transition-all"
                    style={{
                      borderColor: !customPhoto && photoIndex === idx ? accentColor : 'rgba(255,255,255,0.08)',
                      boxShadow: !customPhoto && photoIndex === idx ? `0 0 12px ${accentColor}60` : 'none'
                    }}
                  >
                    <img src={url} className="w-full h-full object-cover object-top" />
                    {!customPhoto && photoIndex === idx && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-black" style={{ background: accentColor }}>
                          <Check size={12} />
                        </div>
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>

              {/* Remove custom photo */}
              {customPhoto && (
                <button
                  onClick={() => { setCustomPhoto(null); setShowPhotoPicker(false); }}
                  className="w-full py-3 rounded-2xl border border-red-500/30 text-red-400 font-black text-xs flex items-center justify-center gap-2"
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
