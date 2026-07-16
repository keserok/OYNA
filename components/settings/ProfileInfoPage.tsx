import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, Camera, Mail, Lock, KeyRound, Calendar, RefreshCw, Check, AlertCircle,
} from 'lucide-react';
import { auth, getAuthIdentity, updateUserEmail, updateUserPassword, AuthIdentityInfo } from '../../supabaseAuth';
import { getFullUserProfile, updateProfileBasics, updateProfileName } from '../../services/userService';
import { useImageUpload } from '../../hooks/useImageUpload';
import Avatar from '../ui/Avatar';
import SettingsSubPage from '../common/SettingsSubPage';
import { ImageCropModal } from '../common/ImageCropModal';

// ─── Ayarlar → Profil Bilgileri ──────────────────────────────────────────────
// ProfileScreen'e gitmek yerine kimlik/hesap alanlarını burada yönetir:
// avatar · isim · doğum tarihi (yaş) · kayıt yöntemi (salt-okunur) · e-posta · şifre.
// Her alan bağımsız kaydeder. OAuth (Google/Apple) kullanıcısında e-posta kilitli,
// şifre ise "oluştur" akışına döner.
interface ProfileInfoPageProps {
  open: boolean;
  onClose: () => void;
}

type Msg = { text: string; variant: 'success' | 'error' } | null;

const ageFromBirthdate = (birthdate?: string | null): number | null => {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
};

const PROVIDER_LABEL: Record<string, string> = {
  email: 'E-posta ile kayıt',
  google: 'Google ile kayıt',
  apple: 'Apple ile kayıt',
  phone: 'Telefon ile kayıt',
  unknown: 'Bilinmiyor',
};

const ProfileInfoPage: React.FC<ProfileInfoPageProps> = ({ open, onClose }) => {
  const uid = auth.currentUser?.uid || '';
  const { uploadImage, uploading } = useImageUpload('avatars', { minWidth: 200 });
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<AuthIdentityInfo | null>(null);

  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [email, setEmail] = useState('');

  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<Msg>(null);
  const [savedName, setSavedName] = useState('');

  const [savingBirth, setSavingBirth] = useState(false);
  const [birthMsg, setBirthMsg] = useState<Msg>(null);
  const [savedBirth, setSavedBirth] = useState('');

  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<Msg>(null);
  const [savedEmail, setSavedEmail] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);
  const [passMsg, setPassMsg] = useState<Msg>(null);

  const [avatarMsg, setAvatarMsg] = useState<Msg>(null);

  // Sayfa açıldığında profil + kimlik bilgisini tazele
  useEffect(() => {
    if (!open || !uid) return;
    let active = true;
    setLoading(true);
    (async () => {
      // Bağımsız çek: biri başarısız olsa diğeri yine dolsun.
      const [profileRes, idRes] = await Promise.allSettled([getFullUserProfile(uid), getAuthIdentity()]);
      if (!active) return;
      const id = idRes.status === 'fulfilled' ? idRes.value : null;
      if (id) setIdentity(id);
      const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
      if (profile) {
        setAvatar(profile.avatar_url ?? null);
        setName(profile.full_name ?? '');
        setSavedName(profile.full_name ?? '');
        setBirthdate(profile.birthdate ?? '');
        setSavedBirth(profile.birthdate ?? '');
      }
      const em = profile?.email ?? id?.email ?? '';
      setEmail(em);
      setSavedEmail(em);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [open, uid]);

  const isOAuthEmail = !!identity && !identity.hasPassword; // e-posta sağlayıcı-yönetimli
  const hasPassword = !!identity?.hasPassword;

  // Dosya seçilince önce kare kırpma modalı açılır; kırpılan görsel yüklenir.
  const handleAvatarPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (file) setCropFile(file);
  }, []);

  const handleCroppedAvatar = useCallback(async (file: File) => {
    setCropFile(null);
    if (!uid) return;
    setAvatarMsg(null);
    try {
      const url = await uploadImage(file);
      await updateProfileBasics(uid, { avatar_url: url });
      setAvatar(url);
      if (auth.currentUser) auth.currentUser.photoURL = url; // bellek-içi senkron (bayat kalmasın)
      setAvatarMsg({ text: 'Profil fotoğrafın güncellendi.', variant: 'success' });
    } catch (err) {
      setAvatarMsg({ text: err instanceof Error ? err.message : 'Fotoğraf yüklenemedi.', variant: 'error' });
    }
  }, [uid, uploadImage]);

  const handleSaveName = async () => {
    if (!uid || savingName) return;
    if (!name.trim()) { setNameMsg({ text: 'İsim boş olamaz.', variant: 'error' }); return; }
    setSavingName(true); setNameMsg(null);
    try {
      await updateProfileName(uid, name);
      const trimmed = name.trim();
      setSavedName(trimmed);
      if (auth.currentUser) auth.currentUser.displayName = trimmed; // bellek-içi senkron
      setNameMsg({ text: 'İsmin güncellendi.', variant: 'success' });
    } catch (err) {
      setNameMsg({ text: err instanceof Error ? err.message : 'İsim güncellenemedi.', variant: 'error' });
    } finally { setSavingName(false); }
  };

  const handleSaveBirth = async () => {
    if (!uid || savingBirth) return;
    setSavingBirth(true); setBirthMsg(null);
    try {
      await updateProfileBasics(uid, { birthdate: birthdate || null });
      setSavedBirth(birthdate);
      setBirthMsg({ text: 'Doğum tarihin kaydedildi.', variant: 'success' });
    } catch (err) {
      setBirthMsg({ text: err instanceof Error ? err.message : 'Kaydedilemedi.', variant: 'error' });
    } finally { setSavingBirth(false); }
  };

  const handleSaveEmail = async () => {
    if (!uid || savingEmail) return;
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setEmailMsg({ text: 'Geçerli bir e-posta gir.', variant: 'error' }); return; }
    setSavingEmail(true); setEmailMsg(null);
    try {
      const res = await updateUserEmail(e);
      if (res.applied) {
        // Onay kapalı → e-posta anında değişti.
        setSavedEmail(e); setEmail(e);
        setEmailMsg({ text: 'E-postan güncellendi.', variant: 'success' });
      } else {
        // Onay açık → yeni adrese doğrulama linki gitti.
        setEmailMsg({ text: `Onay linki ${e} adresine gönderildi. Onayladıktan sonra e-postan değişir.`, variant: 'success' });
      }
    } catch (err) {
      setEmailMsg({ text: err instanceof Error ? err.message : 'E-posta güncellenemedi.', variant: 'error' });
    } finally { setSavingEmail(false); }
  };

  const handleSavePassword = async () => {
    if (savingPass) return;
    if (newPassword.length < 6) { setPassMsg({ text: 'Şifre en az 6 karakter olmalı.', variant: 'error' }); return; }
    if (newPassword !== confirmPassword) { setPassMsg({ text: 'Şifreler eşleşmiyor.', variant: 'error' }); return; }
    setSavingPass(true); setPassMsg(null);
    try {
      await updateUserPassword(newPassword);
      const wasCreate = !hasPassword;
      setNewPassword(''); setConfirmPassword('');
      setPassMsg({ text: wasCreate ? 'Şifren oluşturuldu. Artık e-posta + şifre ile de giriş yapabilirsin.' : 'Şifren güncellendi.', variant: 'success' });
      // Şifre ilk kez oluşturulduysa kimliği tazele ki etiket "Şifre Değiştir"e dönsün.
      if (wasCreate) getAuthIdentity().then(setIdentity).catch(() => {});
    } catch (err) {
      setPassMsg({ text: err instanceof Error ? err.message : 'Şifre kaydedilemedi.', variant: 'error' });
    } finally { setSavingPass(false); }
  };

  const MsgLine: React.FC<{ msg: Msg }> = ({ msg }) => msg ? (
    <p className={`text-[11px] font-bold flex items-center gap-1 mt-1 ${msg.variant === 'success' ? 'text-green-400' : 'text-red-400'}`}>
      {msg.variant === 'success' ? <Check size={12} /> : <AlertCircle size={12} />} {msg.text}
    </p>
  ) : null;

  const age = ageFromBirthdate(birthdate);
  const nameDirty = name.trim() !== savedName;
  const birthDirty = (birthdate || '') !== (savedBirth || '');
  const emailDirty = email.trim().toLowerCase() !== savedEmail.trim().toLowerCase();

  return (
    <SettingsSubPage open={open} onClose={onClose} title="Profil Bilgileri" subtitle="Hesabını ve kimlik bilgilerini yönet">
      <ImageCropModal file={cropFile} title="Profil Fotoğrafı" circle onCancel={() => setCropFile(null)} onCropped={handleCroppedAvatar} />
      {loading ? (
        <div className="py-16 flex justify-center"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>
      ) : (
        <div className="space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="relative group"
              aria-label="Profil fotoğrafını değiştir"
            >
              <Avatar name={name || 'Oyuncu'} src={avatar} size="xl" />
              <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#39FF14] text-black flex items-center justify-center border-2 border-[#0A0E14]">
                {uploading ? <RefreshCw size={15} className="animate-spin" /> : <Camera size={15} />}
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarPick} className="hidden" />
            <MsgLine msg={avatarMsg} />
          </div>

          {/* İsim */}
          <div className="bg-[#161B22] border border-white/8 rounded-2xl p-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5 mb-2">
              <User size={12} /> Ad Soyad
            </label>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Adın Soyadın"
                className="flex-1 h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm font-bold text-white outline-none focus:border-[#39FF14]/40"
              />
              <button
                onClick={handleSaveName}
                disabled={!nameDirty || savingName}
                className="px-4 h-11 rounded-xl font-black text-sm bg-[#39FF14] text-black disabled:opacity-40"
              >
                {savingName ? '...' : 'Kaydet'}
              </button>
            </div>
            <MsgLine msg={nameMsg} />
          </div>

          {/* Doğum Tarihi / Yaş */}
          <div className="bg-[#161B22] border border-white/8 rounded-2xl p-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5 mb-2">
              <Calendar size={12} /> Doğum Tarihi {age !== null && <span className="text-[#39FF14] normal-case tracking-normal">· {age} yaşında</span>}
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={birthdate ? birthdate.slice(0, 10) : ''}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBirthdate(e.target.value)}
                className="flex-1 h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm font-bold text-white outline-none focus:border-[#39FF14]/40"
              />
              <button
                onClick={handleSaveBirth}
                disabled={!birthDirty || savingBirth}
                className="px-4 h-11 rounded-xl font-black text-sm bg-[#39FF14] text-black disabled:opacity-40"
              >
                {savingBirth ? '...' : 'Kaydet'}
              </button>
            </div>
            <MsgLine msg={birthMsg} />
          </div>

          {/* Kayıt Yöntemi (salt-okunur) */}
          <div className="bg-[#161B22] border border-white/8 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Kayıt Yöntemi</p>
              <p className="text-sm font-bold text-white">{PROVIDER_LABEL[identity?.primaryProvider ?? 'unknown']}</p>
            </div>
            <span className="text-[9px] font-black uppercase tracking-wide text-gray-400 bg-white/5 border border-white/10 px-2 py-1 rounded">
              Değiştirilemez
            </span>
          </div>

          {/* E-posta */}
          <div className="bg-[#161B22] border border-white/8 rounded-2xl p-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5 mb-2">
              <Mail size={12} /> E-posta
            </label>
            {isOAuthEmail ? (
              <>
                <div className="flex items-center gap-2 h-11 bg-black/20 border border-white/5 rounded-xl px-3">
                  <Lock size={14} className="text-gray-500 shrink-0" />
                  <span className="text-sm font-bold text-gray-300 truncate">{email || '—'}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                  {PROVIDER_LABEL[identity?.primaryProvider ?? 'unknown'].replace(' ile kayıt', '')} hesabınla giriş yaptığın için e-postan oradan yönetilir ve buradan değiştirilemez.
                </p>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ornek@eposta.com"
                    className="flex-1 h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm font-bold text-white outline-none focus:border-[#39FF14]/40"
                  />
                  <button
                    onClick={handleSaveEmail}
                    disabled={!emailDirty || savingEmail}
                    className="px-4 h-11 rounded-xl font-black text-sm bg-[#39FF14] text-black disabled:opacity-40"
                  >
                    {savingEmail ? '...' : 'Kaydet'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">Ayara göre e-postan anında değişir ya da yeni adresine bir onay linki gönderilir.</p>
                <MsgLine msg={emailMsg} />
              </>
            )}
          </div>

          {/* Şifre */}
          <div className="bg-[#161B22] border border-white/8 rounded-2xl p-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5 mb-2">
              <KeyRound size={12} /> {hasPassword ? 'Şifre Değiştir' : 'Şifre Oluştur'}
            </label>
            {!hasPassword && (
              <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
                Şu an sadece {PROVIDER_LABEL[identity?.primaryProvider ?? 'unknown'].replace(' ile kayıt', '')} ile giriş yapıyorsun. Bir şifre oluşturursan e-posta + şifre ile de girebilirsin.
              </p>
            )}
            <div className="space-y-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Yeni şifre (en az 6 karakter)"
                className="w-full h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-[#39FF14]/40"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Yeni şifre (tekrar)"
                className="w-full h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-[#39FF14]/40"
              />
              <button
                onClick={handleSavePassword}
                disabled={savingPass || !newPassword || !confirmPassword}
                className="w-full h-11 rounded-xl font-black text-sm bg-[#3b82f6] text-white disabled:opacity-40"
              >
                {savingPass ? 'Kaydediliyor...' : (hasPassword ? 'Şifreyi Güncelle' : 'Şifre Oluştur')}
              </button>
              <MsgLine msg={passMsg} />
            </div>
          </div>
        </div>
      )}
    </SettingsSubPage>
  );
};

export default ProfileInfoPage;
