// ════════════════════════════════════════════════════════════════════════════
// AYARLAR → BİLGİLERİM
// ════════════════════════════════════════════════════════════════════════════
//
// Kaynak: onaylı profil tasarımı — "Bilgilerim · dolu" ve "Bilgilerim · eksik".
//
// ── NEDEN BURADA ────────────────────────────────────────────────────────────
// Kullanıcı kararı (2026-08): profili düzenlemenin TEK yeri burası. Eskiden iki
// kapı vardı ve ikisi FARKLI alanları düzenliyordu:
//   • Profil ekranındaki "Düzenle" → mevki, tanıtım, doğum tarihi, cinsiyet,
//     oyun stili, seviye
//   • Ayarlar → "Profil Bilgileri" → fotoğraf, ad, doğum tarihi, e-posta, şifre
// Doğum tarihi İKİSİNDE de vardı; hangisinin kazandığı sıraya bağlıydı.
// Artık hepsi tek sayfada.
//
// ── SATIRLAR NEREYE GİDİYOR ─────────────────────────────────────────────────
// Mevki · Cinsiyet · Yaş · Oyun stili · Seviye satırları `ProfileEditSheet`i
// açar. O katman zaten bu beş alanın TEK kaynağı (yönetim panelindeki
// Kullanıcı Profili Aynası da onu kullanır) ve kendi kilitli testleri var —
// özellikle "seviye beyanı geri alınamaz" kuralı. Aynı kuralları burada
// ikinci kez yazmak, er geç ikisinin ayrışması demekti.
//
// ── HESAP BÖLÜMÜ TASARIMDA YOK ──────────────────────────────────────────────
// Kayıt yöntemi · e-posta · şifre tasarımda çizilmedi ama uygulamada BAŞKA
// hiçbir yerde yönetilmiyor. Silmek bir yetenek kaybı olurdu; en alta, kendi
// başlığı altında korundu.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail, Lock, KeyRound, RefreshCw, Check, AlertCircle, ChevronRight, Plus,
} from 'lucide-react';
import { auth, getAuthIdentity, updateUserEmail, updateUserPassword, AuthIdentityInfo } from '../../supabaseAuth';
import {
  getFullUserProfile, getMatchHistory, updateProfileBasics, updateProfileName,
  setMySelfSkill, type MatchHistorySummary, type OynaUser,
} from '../../services/userService';
import { getMyTeams, type MyTeamRow } from '../../services/teamSocialService';
import { supabase } from '../../supabaseClient';
import { useImageUpload } from '../../hooks/useImageUpload';
import { useAppStore } from '../../store';
import SettingsSubPage from '../common/SettingsSubPage';
import TeamCrest from '../social/TeamCrest';
import { ProfileIdentityCard } from '../profile/ProfileIdentityCard';
import { ProfileEditSheet, type ProfileEditValues } from '../profile/ProfileEditSheet';
import { PLAY_STYLE_META, GENDER_LABEL } from '../../views/onboarding/onboardingShared';
import { ageFromBirthdate, formatPosition, winStats } from '../../shared/profilePresentation';

interface ProfileInfoPageProps {
  open: boolean;
  onClose: () => void;
}

type Msg = { text: string; variant: 'success' | 'error' } | null;

const PROVIDER_LABEL: Record<string, string> = {
  email: 'E-posta ile kayıt',
  google: 'Google ile kayıt',
  apple: 'Apple ile kayıt',
  phone: 'Telefon ile kayıt',
  unknown: 'Bilinmiyor',
};

/** Tasarımın satır deseni: solda soluk etiket, sağda değer + ›. */
const InfoRow: React.FC<{
  label: string;
  value: string | null;
  /** Değer yokken gösterilecek çağrı ("Ekle" / "Beyan et"). */
  emptyText: string;
  onClick: () => void;
  last?: boolean;
}> = ({ label, value, emptyText, onClick, last }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center justify-between gap-3 px-[18px] py-[15px] min-h-[48px] text-left hover:bg-white/[0.03] transition-colors ${
      last ? '' : 'border-b border-white/[0.06]'
    }`}
  >
    <span className="text-[0.8125rem] text-ink-4">{label}</span>
    <span className={`flex items-center gap-2.5 text-[0.9375rem] ${value ? 'text-white' : 'text-ink-4'}`}>
      {value || emptyText}
      <ChevronRight size={15} className="text-ink-4 shrink-0" />
    </span>
  </button>
);

/** İstatistik kutusu — veri yoksa "—" (sıfır ile bilinmiyor aynı şey değil). */
const StatBox: React.FC<{ value: string; label: string; dim?: boolean }> = ({ value, label, dim }) => (
  <div className="flex-1 rounded-[20px] bg-surface-1 px-2 py-4 text-center">
    <p className={`m-0 text-[1.375rem] leading-none font-[Montserrat] font-extrabold italic ${dim ? 'text-ink-4' : 'text-white'}`}>
      {value}
    </p>
    <p className="mt-2 mb-0 text-[0.6875rem] leading-[1.2] text-ink-4">{label}</p>
  </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-3 mb-2.5 ml-0.5 text-[0.6875rem] tracking-[0.14em] text-ink-4">{children}</p>
);

const ProfileInfoPage: React.FC<ProfileInfoPageProps> = ({ open, onClose }) => {
  const uid = auth.currentUser?.uid || '';
  const { uploadImage, uploading } = useImageUpload('avatars', { minWidth: 200 });
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<AuthIdentityInfo | null>(null);
  const [profile, setProfile] = useState<OynaUser | null>(null);
  const [history, setHistory] = useState<MatchHistorySummary[]>([]);
  const [team, setTeam] = useState<MyTeamRow | null>(null);
  const [motmCount, setMotmCount] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<Msg>(null);

  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<Msg>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);
  const [passMsg, setPassMsg] = useState<Msg>(null);

  const [avatarMsg, setAvatarMsg] = useState<Msg>(null);

  // Beş alanın düzenleme katmanı
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    // Beşi de bağımsız: biri düşse diğerleri yine dolsun.
    const [profileRes, idRes, histRes, teamsRes, motmRes] = await Promise.allSettled([
      getFullUserProfile(uid),
      getAuthIdentity(),
      getMatchHistory(uid),
      getMyTeams(),
      supabase.rpc('get_player_motm_count', { p_user_id: uid }),
    ]);

    const id = idRes.status === 'fulfilled' ? idRes.value : null;
    if (id) setIdentity(id);

    const p = profileRes.status === 'fulfilled' ? profileRes.value : null;
    if (p) {
      setProfile(p);
      setName(p.full_name ?? '');
      setSavedName(p.full_name ?? '');
    }
    const em = p?.email ?? id?.email ?? '';
    setEmail(em);
    setSavedEmail(em);

    if (histRes.status === 'fulfilled') setHistory(histRes.value);
    if (teamsRes.status === 'fulfilled') {
      // Tasarımda TEK takım yeri var. Kural: arşivlenmemiş takımlar arasında
      // sıralaması en önde olan — kullanıcı sırayı Sosyal'de kendi belirliyor.
      const aktif = teamsRes.value.filter((t) => !t.is_archived);
      setTeam(aktif.length > 0 ? aktif[0] : null);
    }
    if (motmRes.status === 'fulfilled' && !motmRes.value.error) {
      setMotmCount(Number(motmRes.value.data ?? 0));
    }
    setLoading(false);
  }, [uid]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const isOAuthEmail = !!identity && !identity.hasPassword; // e-posta sağlayıcı-yönetimli
  const hasPassword = !!identity?.hasPassword;

  const handleAvatarPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file || !uid) return;
    setAvatarMsg(null);
    try {
      const url = await uploadImage(file);
      await updateProfileBasics(uid, { avatar_url: url });
      setProfile((p) => (p ? { ...p, avatar_url: url } : p));
      if (auth.currentUser) auth.currentUser.photoURL = url; // bellek-içi senkron
      // MOB-S4: ana sayfadaki avatar store'daki oturum kimliğinden beslenir —
      // fotoğraf değişimini ANINDA oraya da yansıt.
      const cur = useAppStore.getState().currentUserProfile;
      if (cur && cur.id === uid) useAppStore.getState().setCurrentUserProfile({ ...cur, avatar: url });
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
      setProfile((p) => (p ? { ...p, full_name: trimmed } : p));
      if (auth.currentUser) auth.currentUser.displayName = trimmed;
      setNameMsg({ text: 'İsmin güncellendi.', variant: 'success' });
    } catch (err) {
      setNameMsg({ text: err instanceof Error ? err.message : 'İsim güncellenemedi.', variant: 'error' });
    } finally { setSavingName(false); }
  };

  const handleSaveEmail = async () => {
    if (!uid || savingEmail) return;
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setEmailMsg({ text: 'Geçerli bir e-posta gir.', variant: 'error' }); return; }
    setSavingEmail(true); setEmailMsg(null);
    try {
      const res = await updateUserEmail(e);
      if (res.applied) {
        setSavedEmail(e); setEmail(e);
        setEmailMsg({ text: 'E-postan güncellendi.', variant: 'success' });
      } else {
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
      if (wasCreate) getAuthIdentity().then(setIdentity).catch(() => {});
    } catch (err) {
      setPassMsg({ text: err instanceof Error ? err.message : 'Şifre kaydedilemedi.', variant: 'error' });
    } finally { setSavingPass(false); }
  };

  /**
   * Beş alanın kaydı — Profil ekranındaki eski `saveEdit` ile AYNI sözleşme:
   * hata FIRLATILIR ki katman açık kalsın ve kullanıcı yeniden denesin.
   */
  const saveEdit = async (v: ProfileEditValues) => {
    if (!uid) {
      setEditError('Oturumun kapanmış görünüyor. Tekrar giriş yapıp dene.');
      throw new Error('ProfileInfoPage.saveEdit: oturum yok');
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await updateProfileBasics(uid, {
        position: v.position,
        bio: v.bio,
        birthdate: v.birthdate || null,
        gender: v.gender || null,
        play_style: v.playStyle || null,
        ...(v.avatarUrl && v.avatarUrl !== profile?.avatar_url ? { avatar_url: v.avatarUrl } : {}),
      });
      // Seviye beyanı ayrı kapıdan: RPC aralığı doğrular, NULL'u reddeder
      // (beyan bir kez verildikten sonra silinemez — kadro çipi sözleşmesi).
      if (v.selfSkill != null && v.selfSkill !== profile?.selfSkill) {
        await setMySelfSkill(v.selfSkill);
      }
      if (v.avatarUrl && v.avatarUrl !== profile?.avatar_url) {
        const cur = useAppStore.getState().currentUserProfile;
        if (cur && cur.id === uid) useAppStore.getState().setCurrentUserProfile({ ...cur, avatar: v.avatarUrl });
      }
      await load();
    } catch (e) {
      console.error('Profil güncelleme hatası:', e);
      setEditError('Kaydedilemedi. Bağlantını kontrol edip tekrar dene.');
      throw e;
    } finally {
      setSavingEdit(false);
    }
  };

  const MsgLine: React.FC<{ msg: Msg }> = ({ msg }) => msg ? (
    <p className={`text-[0.6875rem] font-bold flex items-center gap-1 mt-1 ${msg.variant === 'success' ? 'text-green-400' : 'text-red-400'}`}>
      {msg.variant === 'success' ? <Check size={12} /> : <AlertCircle size={12} />} {msg.text}
    </p>
  ) : null;

  const age = ageFromBirthdate(profile?.birthdate);
  const nameDirty = name.trim() !== savedName;
  const emailDirty = email.trim().toLowerCase() !== savedEmail.trim().toLowerCase();
  const { total, winRate } = winStats(history);
  const styleMeta = profile?.playStyle
    ? PLAY_STYLE_META[profile.playStyle as keyof typeof PLAY_STYLE_META]
    : undefined;
  const genderText = profile?.gender === 'kadin' || profile?.gender === 'erkek'
    ? GENDER_LABEL[profile.gender] : null;

  const acEdit = () => { setEditError(null); setEditOpen(true); };

  return (
    <>
      <SettingsSubPage open={open} onClose={onClose} title="Bilgilerim" subtitle="Profilini ve hesabını yönet">
        {loading ? (
          <div className="py-16 flex justify-center"><RefreshCw size={20} className="animate-spin text-ink-4" /></div>
        ) : (
          // Aralar `space-y-3` ile — flex kolon kullanılmıyor. Sebep
          // ProfileScreen'dekiyle aynı: flex çocukları sıkışabilir, blok
          // çocukları sıkışmaz.
          <div className="space-y-3">
            {/* ═══ KİMLİK KARTI ═══ */}
            <ProfileIdentityCard
              name={savedName || 'Oyuncu'}
              avatarUrl={profile?.avatar_url}
              verified={profile?.verification_status === 'approved'}
              position={profile?.position}
              age={age}
              ageRange={profile?.ageRange}
              gender={profile?.gender}
              playStyle={profile?.playStyle}
              selfSkill={profile?.selfSkill}
              layout="column"
              onEditAvatar={() => fileRef.current?.click()}
            />
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarPick} className="hidden" />
            {uploading && (
              <p className="text-[0.6875rem] text-ink-4 flex items-center gap-1.5">
                <RefreshCw size={11} className="animate-spin" /> Fotoğraf yükleniyor…
              </p>
            )}
            <MsgLine msg={avatarMsg} />

            {/* ═══ AD ═══
                Ayrı duruyor çünkü serbest metin: seçim listesi değil, yazılır. */}
            <div className="rounded-[24px] bg-surface-1 p-4">
              <label className="text-[0.6875rem] tracking-[0.14em] text-ink-4 block mb-2">AD SOYAD</label>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Adın Soyadın"
                  className="flex-1 min-w-0 h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm font-bold text-white outline-none focus:border-primary/40"
                />
                <button
                  onClick={handleSaveName}
                  disabled={!nameDirty || savingName}
                  className="px-4 h-11 rounded-xl font-extrabold text-sm bg-primary text-on-primary disabled:opacity-40"
                >
                  {savingName ? '…' : 'Kaydet'}
                </button>
              </div>
              <MsgLine msg={nameMsg} />
            </div>

            {/* ═══ BEŞ ALAN ═══
                Hepsi aynı katmanı açar; katman TEK kaynaktır (yönetim
                panelindeki ayna da onu kullanır). */}
            <div className="rounded-[24px] bg-surface-1 overflow-hidden">
              <InfoRow label="Mevki" value={formatPosition(profile?.position)} emptyText="Ekle" onClick={acEdit} />
              <InfoRow label="Cinsiyet" value={genderText} emptyText="Ekle" onClick={acEdit} />
              <InfoRow
                label="Yaş"
                value={age != null ? `${age}` : (profile?.ageRange ? profile.ageRange.replace('-', '–') : null)}
                emptyText="Ekle"
                onClick={acEdit}
              />
              <InfoRow label="Oyun stili" value={styleMeta?.label ?? null} emptyText="Ekle" onClick={acEdit} />
              <InfoRow
                label="Seviye"
                value={profile?.selfSkill != null ? `${profile.selfSkill} / 10` : null}
                emptyText="Beyan et"
                onClick={acEdit}
                last
              />
            </div>

            {/* ═══ FAVORİ TAKIM ═══ */}
            <div>
              <SectionLabel>FAVORİ TAKIM</SectionLabel>
              <button
                type="button"
                onClick={() => {
                  // Takım yönetimi Sosyal'de; buradan oraya derin bağ verilir.
                  useAppStore.getState().setSocialTarget({ tab: 'TEAMS', subTab: 'MINE' });
                  onClose();
                  useAppStore.getState().switchTab('SOCIAL');
                }}
                className="w-full rounded-[24px] bg-surface-1 px-[18px] py-4 flex items-center gap-3.5 min-h-[48px] text-left hover:bg-white/[0.06] transition-colors"
              >
                {team ? (
                  <TeamCrest
                    config={team.crest_config}
                    color1={team.color1}
                    color2={team.color2}
                    size={44}
                    className="shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full border border-dashed border-white/25 flex items-center justify-center text-ink-4 shrink-0">
                    <Plus size={18} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-[0.9375rem] text-white truncate">{team ? team.name : 'Takımın yok'}</p>
                  <p className="mt-0.5 mb-0 text-[0.8125rem] text-ink-4 truncate">
                    {team
                      ? [team.city, `${team.member_count} oyuncu`].filter(Boolean).join(' · ')
                      : 'Bir takıma katıl ya da kendi takımını kur'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-ink-4 shrink-0" />
              </button>
            </div>

            {/* ═══ İSTATİSTİKLER ═══
                Sayı kuralı: veri yoksa "—". Galibiyet oranı YALNIZ skoru
                girilmiş maçlardan hesaplanır (IP-18); hiç skorlu maç yoksa
                "%0" yazmak yalan olurdu. */}
            <div>
              <SectionLabel>İSTATİSTİKLER</SectionLabel>
              <div className="flex gap-2.5">
                <StatBox value={`${total}`} label="Oynanan maç" dim={total === 0} />
                <StatBox value={winRate === null ? '—' : `%${winRate}`} label="Galibiyet oranı" dim={winRate === null} />
                <StatBox value={motmCount == null ? '—' : `${motmCount}`} label="En iyi seçildi" dim={!motmCount} />
              </div>
            </div>

            {/* ═══ HESAP ═══
                Tasarımda yok; uygulamada başka yeri de yok. Kimlik/giriş
                alanları olduğu için ayrı başlık altında, en altta duruyor. */}
            <SectionLabel>HESAP</SectionLabel>

            <div className="rounded-[24px] bg-surface-1 p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.6875rem] tracking-[0.14em] text-ink-4 mb-1">KAYIT YÖNTEMİ</p>
                <p className="text-sm font-bold text-white truncate">{PROVIDER_LABEL[identity?.primaryProvider ?? 'unknown']}</p>
              </div>
              <span className="shrink-0 text-[0.625rem] font-extrabold uppercase tracking-wide text-ink-4 bg-white/5 border border-white/10 px-2 py-1 rounded">
                Değiştirilemez
              </span>
            </div>

            <div className="rounded-[24px] bg-surface-1 p-4">
              <label className="text-[0.6875rem] tracking-[0.14em] text-ink-4 flex items-center gap-1.5 mb-2">
                <Mail size={12} /> E-POSTA
              </label>
              {isOAuthEmail ? (
                <>
                  <div className="flex items-center gap-2 h-11 bg-black/20 border border-white/5 rounded-xl px-3">
                    <Lock size={14} className="text-ink-4 shrink-0" />
                    <span className="text-sm font-bold text-ink-2 truncate">{email || '—'}</span>
                  </div>
                  <p className="text-[0.6875rem] text-ink-4 mt-1.5 leading-relaxed">
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
                      className="flex-1 min-w-0 h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm font-bold text-white outline-none focus:border-primary/40"
                    />
                    <button
                      onClick={handleSaveEmail}
                      disabled={!emailDirty || savingEmail}
                      className="px-4 h-11 rounded-xl font-extrabold text-sm bg-primary text-on-primary disabled:opacity-40"
                    >
                      {savingEmail ? '…' : 'Kaydet'}
                    </button>
                  </div>
                  <p className="text-[0.6875rem] text-ink-4 mt-1.5">Ayara göre e-postan anında değişir ya da yeni adresine bir onay linki gönderilir.</p>
                  <MsgLine msg={emailMsg} />
                </>
              )}
            </div>

            <div className="rounded-[24px] bg-surface-1 p-4">
              <label className="text-[0.6875rem] tracking-[0.14em] text-ink-4 flex items-center gap-1.5 mb-2">
                <KeyRound size={12} /> {hasPassword ? 'ŞİFRE DEĞİŞTİR' : 'ŞİFRE OLUŞTUR'}
              </label>
              {!hasPassword && (
                <p className="text-[0.6875rem] text-ink-4 mb-2 leading-relaxed">
                  Şu an sadece {PROVIDER_LABEL[identity?.primaryProvider ?? 'unknown'].replace(' ile kayıt', '')} ile giriş yapıyorsun. Bir şifre oluşturursan e-posta + şifre ile de girebilirsin.
                </p>
              )}
              <div className="space-y-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Yeni şifre (en az 6 karakter)"
                  className="w-full h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-primary/40"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Yeni şifre (tekrar)"
                  className="w-full h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-primary/40"
                />
                <button
                  onClick={handleSavePassword}
                  disabled={savingPass || !newPassword || !confirmPassword}
                  className="w-full h-11 rounded-xl font-extrabold text-sm bg-info-fill text-on-info-fill disabled:opacity-40"
                >
                  {savingPass ? 'Kaydediliyor…' : (hasPassword ? 'Şifreyi Güncelle' : 'Şifre Oluştur')}
                </button>
                <MsgLine msg={passMsg} />
              </div>
            </div>
          </div>
        )}
      </SettingsSubPage>

      {/* ═══ BEŞ ALANIN DÜZENLEME KATMANI — TEK KAYNAK ═══ */}
      <ProfileEditSheet
        open={editOpen}
        name={savedName || 'Oyuncu'}
        initial={{
          position: profile?.position || '',
          bio: profile?.bio || '',
          birthdate: profile?.birthdate || '',
          gender: profile?.gender || '',
          playStyle: profile?.playStyle || '',
          avatarUrl: profile?.avatar_url || '',
          selfSkill: profile?.selfSkill ?? null,
        }}
        saving={savingEdit}
        errorText={editError}
        onSave={saveEdit}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
};

export default ProfileInfoPage;
