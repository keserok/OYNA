import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Globe2, Lock, Zap, Link2, Copy, RefreshCw, ChevronRight,
  ArrowRightLeft, LogOut, Trash2, Check,
} from 'lucide-react';
import TeamCrest, { CrestGenerated, DEFAULT_CREST, normalizeCrest } from '../../components/social/TeamCrest';
import CrestKitEditor from '../../components/social/CrestKitEditor';
import BottomSheet from '../../components/ui/BottomSheet';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Avatar from '../../components/ui/Avatar';
import {
  MyTeamRow, TeamSquadRow, TeamFormat, TeamVisibility, CreateTeamPayload,
  formatLabel, updateTeamSettings, getTeamPublicProfile, parseTeamError,
  getTeamInviteLink, setTeamInviteLink, inviteLinkUrl,
  transferCaptaincy, leaveTeam, disbandTeam,
} from '../../services/teamSocialService';

// ================================================================
// TeamSettingsSheet — Takım Ayarları (Spec §3.8 Ayarlar; yönetici)
// KİMLİK (isim·kısa ad·arma·renkler) / YAPI (format·şehir) /
// GÖRÜNÜRLÜK (açık-gizli · ⚡arıyor · davet linki aç-kapa-yenile) /
// KİŞİLİK (oyun stili) / ⚠️ TEHLİKELİ BÖLGE (devir·ayrıl·dağıt).
// Yazım tek kapıdan: update_team_settings_v2 (yalnız değişen alanlar).
// ================================================================

const FORMATS: TeamFormat[] = ['3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 mb-2 mt-5 first:mt-0">
    {children}
  </h4>
);

interface TeamSettingsSheetProps {
  open: boolean;
  team: MyTeamRow;
  squad: TeamSquadRow[];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
  onGone: () => void; // ayrıldı/dağıttı → Takımlarım'a dön
  onToast: (msg: string) => void;
}

const TeamSettingsSheet: React.FC<TeamSettingsSheetProps> = ({
  open, team, squad, userId, onClose, onSaved, onGone, onToast,
}) => {
  const isCaptain = team.my_role === 'CAPTAIN';

  // Form durumu — açılışta takımdan hidrate edilir
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [city, setCity] = useState('');
  const [format, setFormat] = useState<TeamFormat>('7v7');
  const [visibility, setVisibility] = useState<TeamVisibility>('PUBLIC');
  const [recruiting, setRecruiting] = useState(true);
  const [playStyle, setPlayStyle] = useState('');
  const [origPlayStyle, setOrigPlayStyle] = useState('');
  const [crest, setCrest] = useState<CrestGenerated>(DEFAULT_CREST);
  const [color1, setColor1] = useState('#39FF14');
  const [color2, setColor2] = useState('#0A0E14');
  const [crestTouched, setCrestTouched] = useState(false);
  const [crestOpen, setCrestOpen] = useState(false);

  const [link, setLink] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<TeamSquadRow | null>(null);
  const [confirm, setConfirm] = useState<'LEAVE' | 'DISBAND' | null>(null);
  const [dangerBusy, setDangerBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(team.name);
    setShortName(team.short_name || '');
    setCity(team.city || '');
    setFormat(team.format || '7v7');
    setVisibility(team.visibility);
    setRecruiting(team.is_recruiting);
    const norm = normalizeCrest(team.crest_config);
    setCrest(norm.type === 'GENERATED' ? norm : DEFAULT_CREST);
    setColor1(team.color1 || '#39FF14');
    setColor2(team.color2 || '#0A0E14');
    setCrestTouched(false); setCrestOpen(false);
    setTransferOpen(false); setTransferTarget(null); setConfirm(null);
    // play_style get_my_teams'te yok — vitrin RPC'sinden hidrate edilir
    getTeamPublicProfile(team.team_id)
      .then(p => { setPlayStyle(p.play_style || ''); setOrigPlayStyle(p.play_style || ''); })
      .catch(() => {});
    setLinkLoading(true);
    getTeamInviteLink(team.team_id)
      .then(setLink).catch(() => setLink(null))
      .finally(() => setLinkLoading(false));
  }, [open, team]);

  const save = useCallback(async () => {
    const patch: Partial<CreateTeamPayload> = {};
    if (name.trim().length >= 2 && name.trim() !== team.name) patch.name = name.trim();
    if (shortName.trim() && shortName.trim().toLocaleUpperCase('tr-TR') !== (team.short_name || '')) {
      patch.short_name = shortName.trim().slice(0, 4).toLocaleUpperCase('tr-TR');
    }
    if (city.trim() && city.trim() !== (team.city || '')) patch.city = city.trim();
    if (format !== (team.format || '7v7')) patch.format = format;
    if (visibility !== team.visibility) patch.visibility = visibility;
    if (recruiting !== team.is_recruiting) patch.is_recruiting = recruiting;
    if (playStyle.trim() !== origPlayStyle) patch.play_style = playStyle.trim();
    if (crestTouched) {
      patch.crest_config = crest;
      patch.color1 = color1;
      patch.color2 = color2;
    }
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      await updateTeamSettings(team.team_id, patch);
      onToast('Takım ayarları kaydedildi');
      onSaved(); onClose();
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setSaving(false); }
  }, [name, shortName, city, format, visibility, recruiting, playStyle, origPlayStyle,
      crestTouched, crest, color1, color2, team, onClose, onSaved, onToast]);

  // ── Davet linki: aç / kopyala / yenile / kapat (K68) ──
  const linkAction = async (action: 'CREATE' | 'RENEW' | 'DISABLE') => {
    setLinkBusy(true);
    try {
      if (action === 'DISABLE') {
        await setTeamInviteLink(team.team_id, false);
        setLink(null);
        onToast('Davet linki kapatıldı');
      } else {
        const token = await setTeamInviteLink(team.team_id, true);
        setLink(token);
        onToast(action === 'RENEW' ? 'Yeni link oluşturuldu — eskisi geçersiz' : 'Davet linki açıldı');
      }
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setLinkBusy(false); }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(inviteLinkUrl(link));
      onToast('Link kopyalandı');
    } catch { onToast('Kopyalanamadı'); }
  };

  // ── Tehlikeli bölge ──
  const doTransfer = async () => {
    if (!transferTarget) return;
    setDangerBusy(true);
    try {
      await transferCaptaincy(team.team_id, transferTarget.user_id);
      onToast(`Kaptanlık ${transferTarget.full_name} oyuncusuna devredildi 👑`);
      setTransferTarget(null); setTransferOpen(false);
      onSaved(); onClose();
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setDangerBusy(false); }
  };

  const doLeave = async () => {
    setDangerBusy(true);
    try {
      await leaveTeam(team.team_id);
      onToast(`${team.name} takımından ayrıldın`);
      setConfirm(null); onClose(); onGone();
    } catch (e) {
      // E5 emniyet ağı: squad henüz yüklenmeden (yarış) ya da istemci durumu
      // sunucudan sapmışsa kaptan "Ayrıl" derse sunucu CAPTAIN_MUST_TRANSFER
      // döndürür. Ham hata yerine devir akışına yönlendir (captainMustTransfer
      // ön-kapısı squad'a dayandığından bu, tek gerçek doğruluk kaynağıdır).
      const msg = (e as { message?: string })?.message || '';
      if (msg.includes('CAPTAIN_MUST_TRANSFER')) {
        setConfirm(null);
        setTransferOpen(true);
        onToast('Ayrılmadan önce kaptanlığı devretmelisin.');
      } else {
        onToast(parseTeamError(e));
        setConfirm(null);
      }
    }
    finally { setDangerBusy(false); }
  };

  const doDisband = async () => {
    setDangerBusy(true);
    try {
      await disbandTeam(team.team_id);
      onToast('Takım dağıtıldı — 30 gün içinde geri açabilirsin');
      setConfirm(null); onClose(); onGone();
    } catch (e) { onToast(parseTeamError(e)); setConfirm(null); }
    finally { setDangerBusy(false); }
  };

  const transferCandidates = squad.filter(m => m.user_id !== userId);
  // E5: Kaptan başka üyeler varken doğrudan ayrılamaz (sunucu reddeder). "Ayrıl"
  // dialog'unu, sonradan hataya düşmek yerine önce devir akışına yönlendiren bir
  // kapıya çeviririz.
  const captainMustTransfer = isCaptain && transferCandidates.length > 0;

  return (
    <>
      <BottomSheet open={open} onClose={onClose} maxHeightClass="max-h-[92vh]" ariaLabel="Takım ayarları">
        <div className="pb-8">
          <h3 className="text-base font-extrabold">Takım Ayarları</h3>

          {/* ═══ KİMLİK ═══ */}
          <SectionTitle>Kimlik</SectionTitle>
          <div className="space-y-2">
            <input
              value={name}
              onChange={e => setName(e.target.value.slice(0, 32))}
              placeholder="Takım adı"
              className="w-full h-12 px-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold placeholder:text-ink-4 focus:outline-none focus:border-[#39FF14]/50"
            />
            <div className="flex gap-2">
              <input
                value={shortName}
                onChange={e => setShortName(e.target.value.slice(0, 4))}
                placeholder="KISA"
                className="w-24 h-12 px-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-extrabold text-center uppercase placeholder:text-ink-4 focus:outline-none focus:border-white/25"
              />
              <button
                onClick={() => setCrestOpen(v => !v)}
                className="flex-1 h-12 px-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-2.5 active:scale-[0.99]"
              >
                <TeamCrest config={crest} color1={color1} color2={color2} size={28} />
                <span className="flex-1 text-left text-sm font-bold text-white/80">Arma & Renkler</span>
                <ChevronRight size={15} className={`text-ink-4 transition-transform ${crestOpen ? 'rotate-90' : ''}`} />
              </button>
            </div>
            {crestOpen && (
              <div className="rounded-2xl bg-white/3 border border-white/6 p-3">
                <CrestKitEditor
                  crest={crest}
                  color1={color1}
                  color2={color2}
                  onChange={patch => {
                    setCrestTouched(true);
                    if (patch.crest) setCrest(patch.crest);
                    if (patch.color1) setColor1(patch.color1);
                    if (patch.color2) setColor2(patch.color2);
                  }}
                />
              </div>
            )}
          </div>

          {/* ═══ YAPI ═══ */}
          <SectionTitle>Yapı</SectionTitle>
          <div className="space-y-2.5">
            <div className="grid grid-cols-5 gap-1.5">
              {/* Format sonradan değiştirilebilir (K); taktikler kendi boyunu korur */}
              {FORMATS.map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`min-h-[40px] rounded-xl text-xs font-extrabold border ${
                    format === f
                      ? 'bg-[#39FF14] text-[#0A0E14] border-[#39FF14]'
                      : 'bg-white/5 text-white/60 border-white/10'
                  }`}
                >
                  {formatLabel(f)}
                </button>
              ))}
            </div>
            <input
              value={city}
              onChange={e => setCity(e.target.value.slice(0, 32))}
              placeholder="Şehir / ilçe"
              className="w-full h-12 px-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold placeholder:text-ink-4 focus:outline-none focus:border-white/25"
            />
          </div>

          {/* ═══ GÖRÜNÜRLÜK ═══ */}
          <SectionTitle>Görünürlük</SectionTitle>
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setVisibility('PUBLIC')}
                className={`rounded-2xl border p-3 text-left ${
                  visibility === 'PUBLIC' ? 'border-[#39FF14]/50 bg-[#39FF14]/8' : 'border-white/10 bg-white/4'
                }`}
              >
                <Globe2 size={15} className="text-[#39FF14]" />
                <div className="text-[0.8125rem] font-bold mt-1">Herkese Açık</div>
                <div className="text-[0.6875rem] text-ink-4">Dizinde görünür</div>
              </button>
              <button
                onClick={() => setVisibility('PRIVATE')}
                className={`rounded-2xl border p-3 text-left ${
                  visibility === 'PRIVATE' ? 'border-[#39FF14]/50 bg-[#39FF14]/8' : 'border-white/10 bg-white/4'
                }`}
              >
                <Lock size={15} className="text-white/60" />
                <div className="text-[0.8125rem] font-bold mt-1">Gizli</div>
                <div className="text-[0.6875rem] text-ink-4">Yalnız davetle</div>
              </button>
            </div>

            <label className="flex items-center gap-3 rounded-2xl bg-white/4 border border-white/8 p-3">
              <Zap size={15} className="text-[#39FF14]" />
              <div className="flex-1">
                <div className="text-[0.8125rem] font-bold">Oyuncu Arıyoruz</div>
                <div className="text-[0.6875rem] text-ink-4">Dizinde ⚡ rozetiyle görünür</div>
              </div>
              <button
                role="switch"
                aria-checked={recruiting}
                onClick={() => setRecruiting(v => !v)}
                className={`w-12 h-7 rounded-full p-0.5 transition-colors ${recruiting ? 'bg-[#39FF14]' : 'bg-white/10'}`}
              >
                <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${recruiting ? 'translate-x-5' : ''}`} />
              </button>
            </label>

            {/* Davet linki — token deny-all tabloda; yalnız yönetici RPC'yle okur */}
            <div className="rounded-2xl bg-white/4 border border-white/8 p-3">
              <div className="flex items-center gap-2">
                <Link2 size={14} className="text-[#39FF14]" />
                <span className="text-[0.8125rem] font-bold flex-1">Davet Linki</span>
                {linkLoading && <Loader2 size={13} className="animate-spin text-ink-4" />}
              </div>
              {link ? (
                <>
                  <div className="text-[0.6875rem] text-ink-4 font-mono truncate mt-2">
                    {inviteLinkUrl(link)}
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={copyLink}
                      className="flex-1 h-9 rounded-xl bg-white/6 border border-white/10 text-[0.6875rem] font-bold flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <Copy size={12} /> Kopyala
                    </button>
                    <button
                      onClick={() => linkAction('RENEW')}
                      disabled={linkBusy}
                      className="flex-1 h-9 rounded-xl bg-white/6 border border-white/10 text-[0.6875rem] font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw size={12} /> Yenile
                    </button>
                    <button
                      onClick={() => linkAction('DISABLE')}
                      disabled={linkBusy}
                      className="h-9 px-3 rounded-xl bg-[#FF4D4D]/8 border border-[#FF4D4D]/25 text-[0.6875rem] font-bold text-[#FF4D4D] active:scale-95 disabled:opacity-50"
                    >
                      Kapat
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => linkAction('CREATE')}
                  disabled={linkBusy || linkLoading}
                  className="w-full h-10 mt-2 rounded-xl bg-white/6 border border-white/10 text-xs font-bold active:scale-[0.98] disabled:opacity-50"
                >
                  {linkBusy ? '…' : 'Link Oluştur'}
                </button>
              )}
            </div>
          </div>

          {/* ═══ KİŞİLİK ═══ */}
          <SectionTitle>Kişilik</SectionTitle>
          <input
            value={playStyle}
            onChange={e => setPlayStyle(e.target.value.slice(0, 24))}
            placeholder="Oyun stili — ör. Tiki-taka, Kontra"
            className="w-full h-12 px-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold placeholder:text-ink-4 focus:outline-none focus:border-white/25"
          />

          <button
            onClick={save}
            disabled={saving || name.trim().length < 2}
            className="w-full mt-5 min-h-[50px] rounded-2xl bg-[#39FF14] text-[#0A0E14] font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Kaydet
          </button>

          {/* ═══ ⚠️ TEHLİKELİ BÖLGE ═══ */}
          <SectionTitle>⚠️ Tehlikeli Bölge</SectionTitle>
          <div className="space-y-2">
            {isCaptain && transferCandidates.length > 0 && (
              <div className="rounded-2xl bg-white/4 border border-white/8 overflow-hidden">
                <button
                  onClick={() => setTransferOpen(v => !v)}
                  className="w-full min-h-[46px] px-3.5 flex items-center gap-2 text-sm font-bold text-white/80 active:scale-[0.99]"
                >
                  <ArrowRightLeft size={15} className="text-[#F2C500]" />
                  <span className="flex-1 text-left">Kaptanlığı Devret</span>
                  <ChevronRight size={15} className={`text-ink-4 transition-transform ${transferOpen ? 'rotate-90' : ''}`} />
                </button>
                {transferOpen && (
                  <div className="px-3 pb-3 space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {transferCandidates.map(m => (
                      <button
                        key={m.user_id}
                        onClick={() => setTransferTarget(m)}
                        className="w-full flex items-center gap-2.5 rounded-xl bg-white/4 border border-white/8 p-2.5 active:scale-[0.98]"
                      >
                        <Avatar name={m.full_name} src={m.avatar_url} size="sm" />
                        <span className="flex-1 text-left text-[0.8125rem] font-bold truncate">{m.full_name}</span>
                        <span className="text-[0.6875rem] text-ink-4">
                          {m.role === 'ADMIN' ? 'Yönetici' : 'Oyuncu'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setConfirm('LEAVE')}
              className="w-full min-h-[46px] rounded-2xl bg-white/4 border border-white/8 text-sm font-bold text-white/70 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <LogOut size={15} /> Takımdan Ayrıl
            </button>

            {isCaptain && (
              <button
                onClick={() => setConfirm('DISBAND')}
                className="w-full min-h-[46px] rounded-2xl bg-[#FF4D4D]/8 border border-[#FF4D4D]/25 text-sm font-bold text-[#FF4D4D] flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <Trash2 size={15} /> Takımı Dağıt
              </button>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* Onaylar — yıkıcı işlemler (D25) */}
      <ConfirmDialog
        open={!!transferTarget}
        title="Kaptanlığı devret?"
        description={`${transferTarget?.full_name || ''} takımın yeni kaptanı olur; sen yönetici olarak kalırsın.`}
        confirmLabel={dangerBusy ? '…' : 'Devret'}
        danger={false}
        onConfirm={doTransfer}
        onCancel={() => setTransferTarget(null)}
      />
      <ConfirmDialog
        open={confirm === 'LEAVE'}
        title={captainMustTransfer ? 'Önce kaptanlığı devret' : 'Takımdan ayrıl?'}
        description={captainMustTransfer
          ? 'Kaptansın ve takımda başka üyeler var. Ayrılmadan önce kaptanlığı bir takım arkadaşına devretmen gerekir.'
          : `${team.name} kadrosundan çıkacaksın.`}
        confirmLabel={captainMustTransfer ? 'Kaptanlığı Devret' : (dangerBusy ? '…' : 'Ayrıl')}
        // Devir yapıcı bir eylem (yeşil); gerçek ayrılma yıkıcı (kırmızı).
        danger={!captainMustTransfer}
        onConfirm={captainMustTransfer
          ? () => { setConfirm(null); setTransferOpen(true); }
          : doLeave}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'DISBAND'}
        title="Takımı dağıt?"
        description="Takım arşive kalkar; 30 gün içinde geri açabilirsin. Üyeler nazikçe bilgilendirilir."
        confirmLabel={dangerBusy ? '…' : 'Dağıt'}
        onConfirm={doDisband}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
};

export default TeamSettingsSheet;
