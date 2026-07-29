import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Spinner } from '../../components/ui/Spinner';
import {
  Search, MapPin, Zap, Loader2, Users, Swords, Send, Check, Clock,
} from 'lucide-react';
import TeamCrest from '../../components/social/TeamCrest';
import StatPill from '../../components/social/StatPill';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonList from '../../components/ui/SkeletonList';
import BottomSheet from '../../components/ui/BottomSheet';
import Chip from '../../components/ui/Chip';
import {
  PublicTeamRow, TeamPublicProfile, listPublicTeams, getTeamPublicProfile,
  requestToJoinTeam, formatLabel, parseTeamError, TeamFormat,
} from '../../services/teamSocialService';

// ================================================================
// TeamsDirectoryPanel — "Tüm Takımlar" keşif dizini (Spec §3.5-3.6)
// Şehir-öncelikli arama + Format/⚡Arıyor filtreleri + vitrin sayfası.
// Katılım her zaman istek → kaptan onayı (I53).
// ================================================================

interface TeamsDirectoryPanelProps {
  onOpenTeam: (teamId: string) => void; // üyeysem tam detaya
  onToast: (msg: string) => void;
}

const FORMATS: TeamFormat[] = ['5v5', '6v6', '7v7', '8v8', '11v11'];

const TeamsDirectoryPanel: React.FC<TeamsDirectoryPanelProps> = ({ onOpenTeam, onToast }) => {
  const [q, setQ] = useState('');
  const [format, setFormat] = useState<TeamFormat | null>(null);
  const [recruitingOnly, setRecruitingOnly] = useState(false);
  const [rows, setRows] = useState<PublicTeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [profile, setProfile] = useState<TeamPublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [requestMsg, setRequestMsg] = useState('');
  const [requesting, setRequesting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (reset: boolean) => {
    if (reset) setLoading(true); else setMoreLoading(true);
    try {
      const offset = reset ? 0 : rows.length;
      const page = await listPublicTeams({
        q: q.trim() || undefined,
        format: format ?? undefined,
        recruitingOnly,
        limit: 20,
        offset,
      });
      setRows(prev => reset ? page : [...prev, ...page]);
      setHasMore(page.length === 20);
    } catch (e) {
      console.error('[Dizin] yüklenemedi', e);
    } finally {
      setLoading(false); setMoreLoading(false);
    }
  }, [q, format, recruitingOnly, rows.length]);

  // Filtre/arama değişince debounce'lu tazeleme
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void load(true); }, q ? 300 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, format, recruitingOnly]);

  const openProfile = useCallback(async (row: PublicTeamRow) => {
    if (row.my_state === 'MEMBER') { onOpenTeam(row.team_id); return; }
    setProfileLoading(true);
    setProfile(null);
    setRequestMsg('');
    try {
      setProfile(await getTeamPublicProfile(row.team_id));
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setProfileLoading(false); }
  }, [onOpenTeam, onToast]);

  const sendRequest = useCallback(async () => {
    if (!profile) return;
    setRequesting(true);
    try {
      await requestToJoinTeam(profile.team_id, requestMsg.trim() || undefined);
      setProfile({ ...profile, my_request_pending: true });
      setRows(prev => prev.map(r =>
        r.team_id === profile.team_id ? { ...r, my_state: 'REQUEST_PENDING' } : r));
      onToast('Katılma isteğin gönderildi 📨');
    } catch (e) { onToast(parseTeamError(e)); }
    finally { setRequesting(false); }
  }, [profile, requestMsg, onToast]);

  return (
    <div className="pb-safe-nav">
      {/* Arama + filtreler (I52: üç filtre, fazlası değil) */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Takım ara…"
          className="w-full h-11 pl-9 pr-3 rounded-2xl bg-white/5 border border-white/8 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/20"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-4">
        <Chip
          label="⚡ Oyuncu Arıyor"
          selected={recruitingOnly}
          onClick={() => setRecruitingOnly(v => !v)}
        />
        {FORMATS.map(f => (
          <Chip
            key={f}
            label={formatLabel(f)}
            selected={format === f}
            onClick={() => setFormat(prev => (prev === f ? null : f))}
          />
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Swords}
          title="Takım bulunamadı"
          description="Filtreleri değiştir ya da kendi takımını kurup dizine ilk sen çık."
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map(t => {
            const c1 = t.color1 || '#39FF14';
            const full = t.member_count >= t.roster_max;
            return (
              <button
                key={t.team_id}
                onClick={() => openProfile(t)}
                className="relative w-full flex items-center gap-3 rounded-2xl bg-white/4 border border-white/6 p-3.5 text-left overflow-hidden active:scale-[0.99]"
              >
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: c1 }} />
                <div
                  className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center border border-white/8"
                  style={{ background: `linear-gradient(135deg, ${c1}22, transparent)` }}
                >
                  <TeamCrest config={t.crest_config} color1={t.color1} color2={t.color2} size={34} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold italic truncate">{t.name}</span>
                    {t.city && (
                      <span className="shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-white/8 text-white/50 uppercase">
                        {t.city}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-white/45 mt-0.5">
                    {formatLabel(t.format)} · {t.member_count}/{t.roster_max} oyuncu
                    · {t.wins}G {t.draws}B {t.losses}M
                  </div>
                  <div className="text-[11px] mt-0.5">
                    {full ? (
                      <span className="text-white/35">Kadro dolu · {t.member_count}/{t.roster_max}</span>
                    ) : t.is_recruiting ? (
                      <span className="text-[#39FF14] font-bold flex items-center gap-1">
                        <Zap size={10} /> Oyuncu arıyor
                      </span>
                    ) : (
                      <span className="text-white/35">Kadro kapalı</span>
                    )}
                  </div>
                </div>
                {t.my_state === 'MEMBER' ? (
                  <span className="shrink-0 text-[10px] font-extrabold text-white/40">ÜYESİN</span>
                ) : t.my_state === 'REQUEST_PENDING' ? (
                  <span className="shrink-0 text-[10px] font-extrabold text-amber-400/80 flex items-center gap-1">
                    <Clock size={11} /> BEKLİYOR
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] font-extrabold text-[#39FF14]">İncele ›</span>
                )}
              </button>
            );
          })}
          {hasMore && (
            <button
              onClick={() => load(false)}
              disabled={moreLoading}
              className="w-full min-h-[44px] rounded-2xl bg-white/4 border border-white/8 text-xs font-bold text-white/50 active:scale-[0.98]"
            >
              {moreLoading ? 'Yükleniyor…' : 'Daha fazla göster'}
            </button>
          )}
        </div>
      )}

      {/* Vitrin — üye olmayan görünümü (I56): taktik/kadro sızmaz */}
      <BottomSheet
        open={profileLoading || profile !== null}
        onClose={() => { setProfile(null); setProfileLoading(false); }}
        ariaLabel="Takım vitrini"
      >
        {profileLoading || !profile ? (
          <div className="py-12 flex justify-center">
            <Spinner size={22} color="rgba(255,255,255,0.4)" glow={false} />
          </div>
        ) : (
          <div className="pb-4">
            {/* Arma + renk kahraman alanı */}
            <div
              className="rounded-3xl border border-white/8 p-5 flex items-center gap-4"
              style={{
                background: `linear-gradient(135deg, ${profile.color1 || '#39FF14'}20, transparent 65%)`,
              }}
            >
              <TeamCrest
                config={profile.crest_config}
                color1={profile.color1}
                color2={profile.color2}
                size={72}
              />
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold italic truncate">{profile.name}</h2>
                <div className="text-xs text-white/45 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {profile.city && (<span className="flex items-center gap-0.5"><MapPin size={11} /> {profile.city}</span>)}
                  <span>{formatLabel(profile.format)}</span>
                  {profile.play_style && <span>· ⚔️ {profile.play_style}</span>}
                </div>
                <div className="text-[11px] text-white/40 mt-1 flex items-center gap-1">
                  <Users size={11} /> {profile.member_count}/{profile.roster_max} oyuncu
                  {profile.captain_name && <span>· Kaptan: {profile.captain_name}</span>}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <StatPill value={profile.wins} label="Galibiyet" accent />
              <StatPill value={profile.draws} label="Beraberlik" />
              <StatPill value={profile.losses} label="Mağlubiyet" />
            </div>

            {/* Aranızdaki maçlar (L77 — H2H) */}
            {profile.h2h && profile.h2h.played > 0 && (
              <div className="mt-3 rounded-2xl bg-white/4 border border-white/8 px-4 py-3 text-xs text-white/60">
                Aranızdaki maçlar:{' '}
                <b className="text-white">
                  {profile.h2h.wins}G · {profile.h2h.draws}B · {profile.h2h.played - profile.h2h.wins - profile.h2h.draws}M
                </b>
                <span className="text-white/35"> (onların gözünden)</span>
              </div>
            )}

            {/* Birincil aksiyon */}
            {profile.is_member ? (
              <button
                onClick={() => { onOpenTeam(profile.team_id); setProfile(null); }}
                className="mt-5 w-full min-h-[50px] rounded-2xl bg-[#39FF14] text-[#0A0E14] font-extrabold text-sm active:scale-[0.98]"
              >
                Takımına Git
              </button>
            ) : profile.my_request_pending ? (
              <div className="mt-5 w-full min-h-[50px] rounded-2xl bg-white/5 border border-white/10 text-white/60 font-bold text-sm flex items-center justify-center gap-2">
                <Check size={15} className="text-[#39FF14]" /> İsteğin kaptana iletildi
              </div>
            ) : profile.member_count >= profile.roster_max ? (
              <div className="mt-5 w-full min-h-[50px] rounded-2xl bg-white/5 border border-white/10 text-white/50 font-bold text-sm flex items-center justify-center">
                Kadro dolu · {profile.member_count}/{profile.roster_max}
              </div>
            ) : !profile.is_recruiting ? (
              <div className="mt-5 w-full min-h-[50px] rounded-2xl bg-white/5 border border-white/10 text-white/50 font-bold text-sm flex items-center justify-center">
                Kadro şu an kapalı
              </div>
            ) : (
              <>
                <input
                  value={requestMsg}
                  onChange={e => setRequestMsg(e.target.value.slice(0, 200))}
                  placeholder="Kısa not (isteğe bağlı): 'Kaleci arıyorsanız buradayım'"
                  className="mt-5 w-full h-12 px-4 rounded-2xl bg-white/5 border border-white/10 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/20"
                />
                <button
                  onClick={sendRequest}
                  disabled={requesting}
                  className="mt-2.5 w-full min-h-[50px] rounded-2xl bg-[#39FF14] text-[#0A0E14] font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                >
                  {requesting ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                  Katılma İsteği Gönder
                </button>
              </>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
};

export default TeamsDirectoryPanel;
