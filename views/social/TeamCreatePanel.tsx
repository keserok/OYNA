import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Check, Loader2, Globe2, Lock, Zap } from 'lucide-react';
import TeamCrest, { CrestGenerated, DEFAULT_CREST } from '../../components/social/TeamCrest';
import CrestKitEditor from '../../components/social/CrestKitEditor';
import Avatar from '../../components/ui/Avatar';
import {
  createTeamRpc, formatLabel, parseTeamError, TeamFormat, TeamVisibility,
} from '../../services/teamSocialService';
import { FriendRow } from '../../services/socialService';

// ================================================================
// TeamCreatePanel — "Takım Oluştur" alt-sekmesi (Spec §3.9 / J57-64)
// 4 adım: Kimlik → Arma&Renk → Kuruluş → Önizleme.
// Canlı kart önizlemesi üstte; taslak modül-düzeyinde yaşar (A eki):
// sekme değiştirsen de kaybolmaz, uygulama açılışında sıfırlanır.
// Kurucu davetler GERÇEK davettir (create_team RPC — hayalet roster öldü).
// ================================================================

interface Draft {
  step: 1 | 2 | 3 | 4;
  name: string;
  shortName: string;
  city: string;
  format: TeamFormat;
  crest: CrestGenerated;
  color1: string;
  color2: string;
  visibility: TeamVisibility;
  recruiting: boolean;
  inviteIds: string[];
}

const EMPTY_DRAFT: Draft = {
  step: 1, name: '', shortName: '', city: '', format: '7v7',
  crest: DEFAULT_CREST, color1: '#39FF14', color2: '#0A0E14',
  visibility: 'PUBLIC', recruiting: true, inviteIds: [],
};

// Oturum-içi taslak (Spec A eki: 4 adımlık formda veri kaybı = en kötü UX)
let savedDraft: Draft = { ...EMPTY_DRAFT };
export const hasTeamDraft = () =>
  savedDraft.name.trim().length > 0 || savedDraft.step > 1;

const FORMATS: TeamFormat[] = ['3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];

const STEP_TITLES = ['Kimlik', 'Arma & Renk', 'Kuruluş', 'Önizleme'];

interface TeamCreatePanelProps {
  friends: FriendRow[];
  onCreated: (teamId: string) => void;
  onToast: (msg: string) => void;
}

const TeamCreatePanel: React.FC<TeamCreatePanelProps> = ({ friends, onCreated, onToast }) => {
  const [draft, setDraftState] = useState<Draft>(savedDraft);
  const [creating, setCreating] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const setDraft = useCallback((patch: Partial<Draft>) => {
    setDraftState(prev => {
      const next = { ...prev, ...patch };
      savedDraft = next;
      return next;
    });
  }, []);

  const autoShort = useMemo(() => {
    const src = (draft.shortName || draft.name).trim();
    return src.replace(/\s+/g, '').slice(0, 4).toLocaleUpperCase('tr-TR');
  }, [draft.name, draft.shortName]);

  const canNext =
    draft.step === 1 ? draft.name.trim().length >= 2 && draft.city.trim().length >= 2
    : true;

  const go = (dir: 1 | -1) => {
    const next = Math.min(4, Math.max(1, draft.step + dir)) as Draft['step'];
    setDraft({ step: next });
  };

  const toggleInvite = (id: string) => {
    setDraft({
      inviteIds: draft.inviteIds.includes(id)
        ? draft.inviteIds.filter(x => x !== id)
        : [...draft.inviteIds, id].slice(0, 19), // kaptan + 19 = tavan 20
    });
  };

  const create = useCallback(async () => {
    setCreating(true);
    try {
      const res = await createTeamRpc({
        name: draft.name.trim(),
        short_name: autoShort,
        color1: draft.color1,
        color2: draft.color2,
        crest_config: draft.crest,
        format: draft.format,
        visibility: draft.visibility,
        is_recruiting: draft.recruiting,
        city: draft.city.trim(),
        invite_user_ids: draft.inviteIds,
      });
      // Kısa kutlama: arma sahneye iner (J64)
      setCelebrating(true);
      setTimeout(() => {
        savedDraft = { ...EMPTY_DRAFT };
        setDraftState({ ...EMPTY_DRAFT });
        setCelebrating(false);
        onCreated(res.team_id);
      }, 1400);
    } catch (e) {
      onToast(parseTeamError(e));
      setCreating(false);
    }
  }, [draft, autoShort, onCreated, onToast]);

  if (celebrating) {
    return (
      <div className="py-16 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.2, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', bounce: 0.5, duration: 0.9 }}
        >
          <TeamCrest config={draft.crest} color1={draft.color1} color2={draft.color2} size={120} />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-5 text-xl font-black italic"
        >
          {draft.name} kuruldu! 🎉
        </motion.h2>
      </div>
    );
  }

  return (
    <div className="pb-safe-nav">
      {/* Canlı takım kartı önizlemesi — yazdıkça şekillenir (J57) */}
      <div
        className="relative rounded-3xl border border-white/8 p-4 flex items-center gap-4 overflow-hidden mb-4"
        style={{ background: `linear-gradient(135deg, ${draft.color1}1f, transparent 60%)` }}
      >
        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: draft.color1 }} />
        <TeamCrest config={draft.crest} color1={draft.color1} color2={draft.color2} size={56} />
        <div className="min-w-0">
          <div className="text-lg font-black italic truncate">
            {draft.name.trim() || 'Takımının Adı'}
          </div>
          <div className="text-[11px] text-white/45">
            {autoShort || 'KISA'} · {formatLabel(draft.format)}
            {draft.city.trim() ? ` · ${draft.city.trim()}` : ''}
          </div>
        </div>
      </div>

      {/* Adım göstergesi */}
      <div className="flex items-center gap-1.5 mb-4">
        {STEP_TITLES.map((t, i) => (
          <React.Fragment key={t}>
            <span className={`text-[10px] font-black uppercase tracking-wide ${
              draft.step === i + 1 ? 'text-[#39FF14]' : 'text-white/30'
            }`}>
              {i + 1}. {t}
            </span>
            {i < 3 && <span className="flex-1 h-px bg-white/8" />}
          </React.Fragment>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={draft.step}
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -14 }}
          transition={{ duration: 0.16 }}
        >
          {/* ① KİMLİK */}
          {draft.step === 1 && (
            <div className="space-y-3">
              <input
                value={draft.name}
                onChange={e => setDraft({ name: e.target.value.slice(0, 32) })}
                placeholder="Takım adı *"
                className="w-full h-12 px-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold placeholder:text-white/25 focus:outline-none focus:border-[#39FF14]/50"
              />
              <div className="flex gap-2">
                <input
                  value={draft.shortName}
                  onChange={e => setDraft({ shortName: e.target.value.slice(0, 4) })}
                  placeholder={autoShort || 'KISA'}
                  className="w-24 h-12 px-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-black text-center uppercase placeholder:text-white/25 focus:outline-none focus:border-white/25"
                />
                <input
                  value={draft.city}
                  onChange={e => setDraft({ city: e.target.value.slice(0, 32) })}
                  placeholder="Şehir / ilçe *"
                  className="flex-1 h-12 px-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold placeholder:text-white/25 focus:outline-none focus:border-white/25"
                />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
                  Format <span className="text-white/25 normal-case font-semibold">(sonradan değiştirilebilir)</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {FORMATS.map(f => (
                    <button
                      key={f}
                      onClick={() => setDraft({ format: f })}
                      className={`min-h-[40px] rounded-xl text-xs font-black border ${
                        draft.format === f
                          ? 'bg-[#39FF14] text-[#0A0E14] border-[#39FF14]'
                          : 'bg-white/5 text-white/60 border-white/10'
                      }`}
                    >
                      {formatLabel(f)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ② ARMA & RENK — ortak editör (J60-61; Ayarlar'la paylaşılır) */}
          {draft.step === 2 && (
            <CrestKitEditor
              crest={draft.crest}
              color1={draft.color1}
              color2={draft.color2}
              onChange={patch => setDraft(patch)}
            />
          )}

          {/* ③ KURULUŞ — görünürlük + kurucu davetler (J62) */}
          {draft.step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDraft({ visibility: 'PUBLIC' })}
                  className={`rounded-2xl border p-3.5 text-left ${
                    draft.visibility === 'PUBLIC' ? 'border-[#39FF14]/50 bg-[#39FF14]/8' : 'border-white/10 bg-white/4'
                  }`}
                >
                  <Globe2 size={17} className="text-[#39FF14]" />
                  <div className="text-sm font-bold mt-1.5">Herkese Açık</div>
                  <div className="text-[10px] text-white/40">Dizinde görünür, istek alır</div>
                </button>
                <button
                  onClick={() => setDraft({ visibility: 'PRIVATE' })}
                  className={`rounded-2xl border p-3.5 text-left ${
                    draft.visibility === 'PRIVATE' ? 'border-[#39FF14]/50 bg-[#39FF14]/8' : 'border-white/10 bg-white/4'
                  }`}
                >
                  <Lock size={17} className="text-white/60" />
                  <div className="text-sm font-bold mt-1.5">Gizli</div>
                  <div className="text-[10px] text-white/40">Yalnız davetle katılım</div>
                </button>
              </div>

              <label className="flex items-center gap-3 rounded-2xl bg-white/4 border border-white/8 p-3.5">
                <Zap size={16} className="text-[#39FF14]" />
                <div className="flex-1">
                  <div className="text-sm font-bold">Oyuncu Arıyoruz</div>
                  <div className="text-[10px] text-white/40">Dizinde ⚡ rozetiyle görünür</div>
                </div>
                <button
                  role="switch"
                  aria-checked={draft.recruiting}
                  onClick={() => setDraft({ recruiting: !draft.recruiting })}
                  className={`w-12 h-7 rounded-full p-0.5 transition-colors ${draft.recruiting ? 'bg-[#39FF14]' : 'bg-white/10'}`}
                >
                  <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${draft.recruiting ? 'translate-x-5' : ''}`} />
                </button>
              </label>

              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
                  Kurucu Kadro Davetleri ({draft.inviteIds.length})
                  <span className="text-white/25 normal-case font-semibold"> — gerçek davet gider, kabul eden katılır</span>
                </div>
                {friends.length === 0 ? (
                  <p className="text-xs text-white/30">
                    Henüz arkadaşın yok — takımı kur, davet linkiyle çağır.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                    {friends.map(f => {
                      const sel = draft.inviteIds.includes(f.friend_id);
                      return (
                        <button
                          key={f.friend_id}
                          onClick={() => toggleInvite(f.friend_id)}
                          className={`w-full flex items-center gap-2.5 rounded-xl border p-2.5 ${
                            sel ? 'border-[#39FF14]/40 bg-[#39FF14]/6' : 'border-white/8 bg-white/4'
                          }`}
                        >
                          <Avatar name={f.full_name} src={f.avatar_url} size="sm" />
                          <span className="flex-1 text-left text-[13px] font-bold truncate">{f.full_name}</span>
                          {sel && <Check size={14} className="text-[#39FF14]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ④ ÖNİZLEME */}
          {draft.step === 4 && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/4 border border-white/8 p-4 text-sm space-y-2">
                {[
                  ['Ad', `${draft.name.trim()} (${autoShort})`],
                  ['Şehir', draft.city.trim()],
                  ['Format', formatLabel(draft.format)],
                  ['Görünürlük', draft.visibility === 'PUBLIC' ? 'Herkese Açık' : 'Gizli'],
                  ['Oyuncu arıyor', draft.recruiting ? 'Evet ⚡' : 'Hayır'],
                  ['Kurucu davet', `${draft.inviteIds.length} kişi`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-white/40">{k}</span>
                    <span className="font-bold text-right">{v}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={create}
                disabled={creating}
                className="w-full min-h-[52px] rounded-2xl bg-[#39FF14] text-[#0A0E14] font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : '🛡️'} Takımı Kur
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Adım gezinme */}
      <div className="flex gap-2 mt-5">
        {draft.step > 1 && (
          <button
            onClick={() => go(-1)}
            className="min-h-[46px] px-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white/70 flex items-center gap-1 active:scale-[0.97]"
          >
            <ChevronLeft size={15} /> Geri
          </button>
        )}
        {draft.step < 4 && (
          <button
            onClick={() => go(1)}
            disabled={!canNext}
            className="flex-1 min-h-[46px] rounded-2xl bg-white/8 border border-white/12 text-sm font-black text-white flex items-center justify-center gap-1 active:scale-[0.97] disabled:opacity-40"
          >
            İleri <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
};

export default TeamCreatePanel;
