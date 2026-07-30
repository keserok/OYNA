import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil } from 'lucide-react';
import { useImageUpload } from '../../hooks/useImageUpload';
import { POSITION_LABEL, POSITION_ABBR, PLAY_STYLE_META, GENDER_LABEL } from '../../views/onboarding/onboardingShared';

// ════════════════════════════════════════════════════════════════════════
// PROFİLİ DÜZENLE ALT SAYFASI — TEK KAYNAK
// ProfileScreen (kullanıcı kendi profili) ve admin panelin Kullanıcı Profili
// Aynası (admin, seçili kullanıcı adına) AYNI düzenleme yüzeyini kullanır.
// Yazma yolu bileşenin dışındadır: kullanıcı updateProfileBasics'e, admin
// audit'li admin_update_user_profile RPC'sine kaydeder (onSave ile).
// ════════════════════════════════════════════════════════════════════════

const POSITION_ORDER = ['kaleci', 'defans', 'orta', 'forvet'] as const;
const GENDER_ORDER = ['kadin', 'erkek'] as const;
const PLAY_STYLE_ORDER = ['ciddi', 'taktiksel', 'rahat'] as const;

export interface ProfileEditValues {
    position: string;
    bio: string;
    birthdate: string;
    gender: string;
    playStyle: string;
    avatarUrl: string;
}

export interface ProfileEditSheetProps {
    open: boolean;
    initial: ProfileEditValues;
    saving: boolean;
    onSave: (values: ProfileEditValues) => void | Promise<void>;
    onClose: () => void;
    /** Varsayılan "Profili Düzenle"; admin aynasında kullanıcı adıyla özelleştirilebilir. */
    title?: string;
}

export const ProfileEditSheet: React.FC<ProfileEditSheetProps> = ({ open, initial, saving, onSave, onClose, title }) => {
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [pos, setPos] = useState(initial.position);
    const [bio, setBio] = useState(initial.bio);
    const [avatar, setAvatar] = useState(initial.avatarUrl);
    const [birthdate, setBirthdate] = useState(initial.birthdate);
    const [gender, setGender] = useState(initial.gender);
    const [style, setStyle] = useState(initial.playStyle);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { uploadImage, uploading } = useImageUpload('avatars', { minWidth: 200 });

    // Sayfa her açılışta güncel profil değerleriyle tohumlanır.
    useEffect(() => {
        if (!open) return;
        setPhotoError(null);
        setPos(initial.position);
        setBio(initial.bio);
        setAvatar(initial.avatarUrl);
        setBirthdate(initial.birthdate);
        setGender(initial.gender);
        setStyle(initial.playStyle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoError(null);
        try {
            const url = await uploadImage(file);
            setAvatar(url);
        } catch (err: any) {
            // D5: eskiden yalnız console.error → kullanıcı neden yüklenmediğini
            // bilmiyordu. imageCompression açıklayıcı mesaj verir (HEIC/boyut/…).
            console.error('Fotoğraf yükleme hatası:', err);
            setPhotoError(err?.message || 'Fotoğraf yüklenemedi. Farklı bir görsel dene (JPG/PNG, en fazla 10MB).');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (!open) return null;

    // z-[260]: uygulamada BottomNav'ın, admin panelde 360 drawer'ının (z-[240]) üstünde kalmalı.
    return createPortal(
        <div className="fixed inset-0 z-[260] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[88vh] overflow-y-auto custom-scrollbar bg-bg-main border-t border-white/10 rounded-t-[28px] p-6 pb-10 space-y-4">
                <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
                <h3 className="text-base font-extrabold text-white uppercase tracking-wider">{title || 'Profili Düzenle'}</h3>
                {/* Profil fotoğrafı */}
                <div className="flex flex-col items-center gap-3">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="relative group active:scale-95 transition-all disabled:opacity-60"
                    >
                        <img
                            src={avatar || '/player_card_photo.png'}
                            alt="Profil"
                            referrerPolicy="no-referrer"
                            className="w-24 h-24 rounded-3xl object-cover border border-white/10"
                        />
                        <div className="absolute inset-0 rounded-3xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Pencil size={20} className="text-white" />
                        </div>
                        {uploading && (
                            <div className="absolute inset-0 rounded-3xl bg-black/70 flex items-center justify-center">
                                <span className="text-[0.625rem] font-extrabold text-primary uppercase tracking-widest">Yükleniyor…</span>
                            </div>
                        )}
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-[0.625rem] font-extrabold text-primary uppercase tracking-widest disabled:opacity-60">
                        Fotoğrafı Değiştir
                    </button>
                    {photoError && (
                        <p className="text-[0.6875rem] font-bold text-red-400 text-center max-w-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                            {photoError}
                        </p>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickPhoto} />
                </div>
                <div>
                    <label className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wider ml-1">Pozisyon</label>
                    <div className="mt-1.5 grid grid-cols-4 gap-2">
                        {POSITION_ORDER.map((code) => {
                            const label = POSITION_LABEL[code];
                            const sel = pos === label;
                            return (
                                <button
                                    key={code}
                                    type="button"
                                    onClick={() => setPos(sel ? '' : label)}
                                    className={`py-2.5 rounded-2xl border transition-all active:scale-95 flex flex-col items-center gap-0.5 ${
                                        sel ? 'bg-primary text-black border-primary' : 'bg-[#161B22] text-white/60 border-white/10 hover:bg-white/5'
                                    }`}
                                >
                                    <span className="text-[0.8125rem] font-extrabold">{POSITION_ABBR[code]}</span>
                                    <span className="text-[0.6875rem] font-bold opacity-80">{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <label className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wider ml-1">Doğum Tarihi</label>
                    <input
                        type="date"
                        value={birthdate}
                        onChange={(e) => setBirthdate(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                        className="mt-1.5 w-full bg-[#161B22] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-primary/40 [color-scheme:dark]"
                    />
                </div>
                <div>
                    <label className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wider ml-1">Cinsiyet</label>
                    <div className="mt-1.5 flex gap-2">
                        {GENDER_ORDER.map((g) => {
                            const sel = gender === g;
                            return (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => setGender(sel ? '' : g)}
                                    className={`flex-1 py-3 rounded-2xl text-[0.6875rem] font-extrabold uppercase tracking-widest border transition-all active:scale-95 ${
                                        sel ? 'bg-primary text-black border-primary' : 'bg-[#161B22] text-white/60 border-white/10 hover:bg-white/5'
                                    }`}
                                >
                                    {g === 'kadin' ? '♀' : '♂'} {GENDER_LABEL[g]}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <label className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wider ml-1">Oyun Stili</label>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                        {/* Kimlik renkleri (kanonik K/S/Y) seçim beklenmeden görünür:
                            seçili → dolu renk, değil → kendi renginde tonlu */}
                        {PLAY_STYLE_ORDER.map((s) => {
                            const sel = style === s;
                            const meta = PLAY_STYLE_META[s];
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStyle(sel ? '' : s)}
                                    className="py-3 rounded-2xl text-[0.6875rem] font-extrabold uppercase tracking-widest border transition-all active:scale-95"
                                    style={sel
                                        ? { color: '#000', backgroundColor: meta.color, borderColor: meta.color, boxShadow: `0 0 14px ${meta.color}40` }
                                        : { color: meta.color, backgroundColor: `${meta.color}12`, borderColor: `${meta.color}45` }}
                                >
                                    {meta.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <label className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wider ml-1">Kısa Tanıtım</label>
                    <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={200} placeholder="Kendini birkaç kelimeyle anlat…" className="mt-1.5 w-full bg-[#161B22] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-primary/40 resize-none" />
                </div>
                <button
                    onClick={() => void onSave({ position: pos.trim(), bio: bio.trim(), birthdate, gender, playStyle: style, avatarUrl: avatar })}
                    disabled={saving || uploading}
                    className="w-full h-12 rounded-2xl bg-primary text-black font-extrabold text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                >
                    {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
            </div>
        </div>,
        document.body
    );
};
