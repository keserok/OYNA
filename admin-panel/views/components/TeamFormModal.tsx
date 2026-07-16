import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, UploadCloud, Loader2, Search, UserCheck, Shield } from 'lucide-react';
import { useImageUpload } from '../../../hooks/useImageUpload';
import { useAppStore } from '../../../store';
import { fetchAdminProfiles, type AdminTeamRow, type TeamAdminInput } from '../../services/adminService';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ImageCropModal } from '../../../components/common/ImageCropModal';

const LEVELS: Array<{ v: '' | 'EASY' | 'MEDIUM' | 'HARD'; label: string }> = [
  { v: '', label: 'Belirtilmedi' },
  { v: 'EASY', label: 'Kolay' },
  { v: 'MEDIUM', label: 'Orta' },
  { v: 'HARD', label: 'Zor' },
];

interface CaptainHit { id: string; name: string; email: string; avatar: string }

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  team?: AdminTeamRow | null;
  onClose: () => void;
  onSave: (input: TeamAdminInput) => Promise<void>;
}

export const TeamFormModal: React.FC<Props> = ({ open, mode, team, onClose, onSave }) => {
  const adminPitches = useAppStore((s) => s.adminPitches);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [location, setLocation] = useState('');
  const [level, setLevel] = useState<'' | 'EASY' | 'MEDIUM' | 'HARD'>('');
  const [homePitchId, setHomePitchId] = useState('');
  const [captainId, setCaptainId] = useState('');
  const [captainName, setCaptainName] = useState('');

  const [captainQuery, setCaptainQuery] = useState('');
  const debouncedCaptainQuery = useDebouncedValue(captainQuery, 300);
  const [captainHits, setCaptainHits] = useState<CaptainHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const { uploadImage, uploading, progress } = useImageUpload('teams');

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && team) {
      setName(team.name);
      setLogo(team.logo || '');
      setLocation(team.location || '');
      setLevel((team.level as '' | 'EASY' | 'MEDIUM' | 'HARD') || '');
      setHomePitchId(team.home_pitch_id || '');
      setCaptainId(team.captain_id || '');
      setCaptainName(team.captainName || '');
    } else {
      setName(''); setLogo(''); setLocation(''); setLevel('');
      setHomePitchId(''); setCaptainId(''); setCaptainName('');
    }
    setCaptainQuery(''); setCaptainHits([]);
  }, [open, mode, team]);

  useEffect(() => {
    const q = debouncedCaptainQuery.trim();
    if (q.length < 2) { setCaptainHits([]); return; }
    let stale = false;
    setSearching(true);
    void (async () => {
      try {
        const res = await fetchAdminProfiles({ search: q, limit: 8 });
        if (!stale) setCaptainHits(res.users.map((u) => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar })));
      } catch {
        if (!stale) setCaptainHits([]);
      } finally {
        if (!stale) setSearching(false);
      }
    })();
    return () => { stale = true; };
  }, [debouncedCaptainQuery]);

  const pickCaptain = (hit: CaptainHit) => {
    setCaptainId(hit.id);
    setCaptainName(hit.name);
    setCaptainQuery('');
    setCaptainHits([]);
  };

  const clearCaptain = () => { setCaptainId(''); setCaptainName(''); };

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        logo: logo.trim() || null,
        location: location.trim() || null,
        captain_id: captainId || null,
        home_pitch_id: homePitchId || null,
        level: level || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const selectedPitchName = useMemo(
    () => adminPitches.find((p) => p.id === homePitchId)?.name,
    [adminPitches, homePitchId],
  );

  if (!open) return null;

  return (
    <>
    <ImageCropModal
      file={cropFile}
      title="Takım Logosu"
      onCancel={() => setCropFile(null)}
      onCropped={async (f) => {
        setCropFile(null);
        const url = await uploadImage(f);
        if (url) setLogo(url);
      }}
    />
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-lg bg-[#161B22] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">
              {mode === 'create' ? 'Yeni Takım' : 'Takım Düzenle'}
            </h3>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            {/* Logo + isim */}
            <div className="flex gap-3 items-start">
              <div className="shrink-0">
                <label className={`w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden ${uploading ? 'border-red-500/40' : 'border-white/10 hover:border-white/20'}`}>
                  {uploading ? (
                    <span className="text-[10px] text-red-400 flex flex-col items-center gap-1"><Loader2 size={16} className="animate-spin" /> %{progress.toFixed(0)}</span>
                  ) : logo ? (
                    <img src={logo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gray-600 flex flex-col items-center gap-1"><UploadCloud size={18} /><span className="text-[8px] uppercase tracking-wide">Logo</span></span>
                  )}
                  <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) setCropFile(file);
                  }} />
                </label>
                {logo && !uploading && (
                  <button type="button" onClick={() => setLogo('')} className="mt-1 w-full text-[9px] font-bold text-gray-500 hover:text-red-400 uppercase tracking-wide">Kaldır</button>
                )}
              </div>
              <div className="flex-1">
                <Field label="Takım Adı">
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Kadıköy United" />
                </Field>
                <div className="mt-3">
                  <Field label="Seviye">
                    <select value={level} onChange={(e) => setLevel(e.target.value as '' | 'EASY' | 'MEDIUM' | 'HARD')} className={inputCls}>
                      {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            </div>

            {/* Kaptan arama & atama */}
            <Field label="Kaptan">
              {captainId ? (
                <div className="flex items-center justify-between gap-2 bg-black/40 border border-green-500/20 rounded-xl px-3 h-10">
                  <span className="flex items-center gap-2 text-sm text-white truncate">
                    <UserCheck size={14} className="text-green-400 shrink-0" /> {captainName || captainId.slice(0, 8)}
                  </span>
                  <button type="button" onClick={clearCaptain} className="text-gray-500 hover:text-red-400 shrink-0"><X size={14} /></button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      value={captainQuery}
                      onChange={(e) => setCaptainQuery(e.target.value)}
                      className={`${inputCls} pl-9`}
                      placeholder="Kaptan ara (isim / e-posta)…"
                    />
                    {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />}
                  </div>
                  {captainHits.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-52 overflow-y-auto custom-scrollbar">
                      {captainHits.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => pickCaptain(h)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5"
                        >
                          <img src={h.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(h.name)}&background=1f2937&color=fff`} alt="" className="w-6 h-6 rounded-full object-cover" />
                          <span className="min-w-0">
                            <span className="block text-xs text-white truncate">{h.name}</span>
                            <span className="block text-[10px] text-gray-500 truncate">{h.email}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Field>

            {/* İç saha */}
            <Field label="İç Saha (Tesis)">
              <select value={homePitchId} onChange={(e) => setHomePitchId(e.target.value)} className={inputCls}>
                <option value="">İç saha yok</option>
                {adminPitches.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {homePitchId && !selectedPitchName && (
                <p className="mt-1 text-[9px] text-amber-400">Seçili saha envanterde bulunamadı (id korunuyor).</p>
              )}
            </Field>

            {/* Konum */}
            <Field label="Konum / Bölge">
              <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} placeholder="Kadıköy, İstanbul" />
            </Field>
          </div>

          <button
            type="button"
            disabled={saving || uploading || !name.trim()}
            onClick={() => void submit()}
            className="w-full h-12 mt-4 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1 text-[9px] text-gray-600 uppercase tracking-widest">
            <Shield size={9} /> Takım meta verisi
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
    </>
  );
};

const inputCls = 'w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-red-500/40';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">{label}</label>
    {children}
  </div>
);
