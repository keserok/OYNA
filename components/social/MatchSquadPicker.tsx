import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Check, Users, Shield, Loader2, ChevronRight } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Chip from '../ui/Chip';
import SegmentedTabs from '../ui/SegmentedTabs';
import EmptyState from '../ui/EmptyState';
import SkeletonList from '../ui/SkeletonList';
import TeamCrest from './TeamCrest';
import { isUserOnline } from '../../utils/lastSeen';
import { getFriends, FriendRow } from '../../services/socialService';
import { getMyTeams, MyTeamRow, formatLabel } from '../../services/teamSocialService';
import { useBackDismiss } from '../../hooks/useBackDismiss';

// ════════════════════════════════════════════════════════════════════════
// MatchSquadPicker — maç oluşturmada kadro kurma seçicisi (SOSYAL stilli).
// Sosyal arayüzle birebir tutarlı: aynı kart/Chip/SegmentedTabs kalıpları,
// gerçek veri (getFriends / getMyTeams / get_team_squad) ve TeamCrest armaları.
//   • Arkadaşlar  → çoklu-seçim → boş slotlara eklenir (onAddFriends)
//   • Takımlarım  → tek-seçim → kadro sahaya dizilir (onPickTeam→get_team_squad)
//   • Takım Kur   → önceliklendirilmiş hızlı oluşturma (createTeamRpc)
// Seçimler MatchCreate'e callback ile döner; DB yazma sözleşmesi değişmez.
// ════════════════════════════════════════════════════════════════════════

export interface PickedPlayer { id: string; name: string; avatar: string }

interface MatchSquadPickerProps {
  onClose: () => void;
  onAddFriends: (players: PickedPlayer[]) => void;
  onPickTeam: (teamId: string, teamName: string) => void;
  onToast?: (msg: string) => void;
  /** Sahada zaten dizili oyuncu id'leri — listede "eklendi" işaretlenir. */
  assignedIds?: string[];
  /** Kalan boş slot sayısı — çoklu seçimde üst sınır ipucu. */
  openSlotCount?: number;
  /** Takımı olmayan kullanıcıyı Sosyal → Takım Oluştur'a yönlendirir. */
  onGoToTeamCreate?: () => void;
}

type Tab = 'FRIENDS' | 'TEAMS';

const MatchSquadPicker: React.FC<MatchSquadPickerProps> = ({
  onClose, onAddFriends, onPickTeam, onToast, assignedIds = [], openSlotCount, onGoToTeamCreate,
}) => {
  // Parent yalnız seçici açıkken mount ediyor → open sabit true. Geri tuşu +
  // Esc yalnız bu seçiciyi kapatır, arkadaki ekran DEĞİŞMEZ (BULGU-020).
  useBackDismiss(true, onClose, 'match-squad-picker');
  const [tab, setTab] = useState<Tab>('FRIENDS');

  // ── Arkadaş verisi ──
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [search, setSearch] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  // ── Takım verisi ──
  const [teams, setTeams] = useState<MyTeamRow[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [pickingTeam, setPickingTeam] = useState<string | null>(null);

  const assigned = useMemo(() => new Set(assignedIds), [assignedIds]);

  const loadFriends = useCallback(async () => {
    setLoadingFriends(true);
    try { setFriends(await getFriends()); }
    catch (e) { console.warn('[MatchSquadPicker] arkadaşlar yüklenemedi', e); }
    finally { setLoadingFriends(false); }
  }, []);

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    try { setTeams((await getMyTeams()).filter(t => !t.is_archived)); }
    catch (e) { console.warn('[MatchSquadPicker] takımlar yüklenemedi', e); }
    finally { setLoadingTeams(false); }
  }, []);

  useEffect(() => { loadFriends(); loadTeams(); }, [loadFriends, loadTeams]);

  // Sabit akıllı sıra: çevrimiçi → favori → isim (sosyal ekranla aynı his)
  const visibleFriends = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return friends
      .filter(f => {
        if (favOnly && !f.is_favorite) return false;
        if (q && !f.full_name.toLocaleLowerCase('tr-TR').includes(q)
              && !(f.oyna_id || '').includes(q.replace(/^@/, ''))) return false;
        return true;
      })
      .sort((a, b) => {
        const ao = a.last_active_at && isUserOnline(a.last_active_at) ? 1 : 0;
        const bo = b.last_active_at && isUserOnline(b.last_active_at) ? 1 : 0;
        if (ao !== bo) return bo - ao;
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.full_name.localeCompare(b.full_name, 'tr-TR');
      });
  }, [friends, search, favOnly]);

  const toggle = (id: string) => {
    if (assigned.has(id)) return; // zaten sahada
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const confirmFriends = () => {
    const picked: PickedPlayer[] = selected
      .map(id => friends.find(f => f.friend_id === id))
      .filter((f): f is FriendRow => !!f)
      .map(f => ({ id: f.friend_id, name: f.full_name || 'Oyuncu', avatar: f.avatar_url || '' }));
    onAddFriends(picked);
    onClose();
  };

  const pickTeam = async (t: MyTeamRow) => {
    setPickingTeam(t.team_id);
    try {
      await onPickTeam(t.team_id, t.name);
      onClose();
    } finally {
      setPickingTeam(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#0A0E14] flex flex-col"
    >
      {/* ── Başlık ── */}
      <div className="pt-safe px-5 pt-5 pb-3 border-b border-white/8 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-extrabold text-white italic tracking-tight uppercase">Kadroyu Kur</h2>
            <p className="text-[0.6875rem] text-[#39FF14] font-bold uppercase tracking-widest mt-0.5">Arkadaş çağır · takım diz</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 active:scale-95"
          >
            <X size={18} />
          </button>
        </div>
        <SegmentedTabs
          layoutId="squadPickerTabs"
          activeId={tab}
          onChange={id => setTab(id as Tab)}
          items={[
            { id: 'FRIENDS', label: 'Arkadaşlar' },
            { id: 'TEAMS', label: 'Takımlarım' },
          ]}
        />
      </div>

      {/* ── İçerik ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-40">
        <AnimatePresence mode="wait">
          {tab === 'FRIENDS' && (
            <motion.div key="friends" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.16 }}>
              {/* Arama + favori filtresi */}
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Arkadaşlarında ara…"
                    className="w-full h-11 pl-9 pr-3 rounded-2xl bg-white/5 border border-white/8 text-sm text-white placeholder:text-ink-4 focus:outline-none focus:border-white/20"
                  />
                </div>
              </div>
              <div className="flex gap-2 mb-3">
                <Chip label="Tümü" selected={!favOnly} onClick={() => setFavOnly(false)} />
                <Chip label="★ Favoriler" selected={favOnly} onClick={() => setFavOnly(true)} />
              </div>

              {loadingFriends ? (
                <SkeletonList rows={5} />
              ) : visibleFriends.length === 0 ? (
                <EmptyState
                  icon={friends.length === 0 ? Users : Search}
                  title={friends.length === 0 ? 'Henüz arkadaşın yok' : 'Sonuç yok'}
                  description={friends.length === 0
                    ? 'Sosyal sekmesinden arkadaş ekleyip buradan kadrona çağırabilirsin.'
                    : 'Aramayı ya da filtreyi değiştirmeyi dene.'}
                />
              ) : (
                <div className="space-y-2.5">
                  {visibleFriends.map(f => {
                    const already = assigned.has(f.friend_id);
                    const sel = selected.includes(f.friend_id);
                    const online = f.last_active_at ? isUserOnline(f.last_active_at) : null;
                    return (
                      <button
                        key={f.friendship_id}
                        onClick={() => toggle(f.friend_id)}
                        disabled={already}
                        className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.99] ${
                          already
                            ? 'bg-white/[0.02] border-white/6 opacity-45'
                            : sel
                              ? 'bg-[#39FF14]/6 border-[#39FF14]/40'
                              : 'bg-white/4 border-white/6'
                        }`}
                      >
                        <Avatar name={f.full_name} src={f.avatar_url} size="lg" online={online} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-white truncate">{f.full_name}</div>
                          <div className="text-[0.6875rem] text-ink-4 truncate mt-0.5">
                            {f.pos || 'OS'}
                            {f.matches_together > 0 ? ` · ${f.matches_together} maç birlikte` : ''}
                          </div>
                        </div>
                        <span className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                          already
                            ? 'border-white/15 text-ink-4'
                            : sel ? 'bg-[#39FF14] border-[#39FF14] text-[#0A0E14]' : 'border-white/20 text-transparent'
                        }`}>
                          <Check size={14} strokeWidth={3} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {tab === 'TEAMS' && (
            <motion.div key="teams" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.16 }}>
              {loadingTeams ? (
                <SkeletonList rows={4} />
              ) : teams.length === 0 ? (
                <EmptyState
                  icon={Shield}
                  title="Henüz takımın yok"
                  description="Sosyal sekmesinden takımını kurup kadronu buradan sahaya dizebilirsin."
                  actions={onGoToTeamCreate ? [{ label: 'Takım Oluştur', onClick: onGoToTeamCreate, primary: true }] : []}
                />
              ) : (
                <div className="space-y-2.5">
                  {teams.map(t => {
                    const c1 = t.color1 || '#39FF14';
                    const busy = pickingTeam === t.team_id;
                    return (
                      <button
                        key={t.team_id}
                        onClick={() => pickTeam(t)}
                        disabled={!!pickingTeam}
                        className="relative w-full flex items-center gap-3 rounded-2xl bg-white/4 border border-white/6 p-3.5 overflow-hidden text-left active:scale-[0.99] disabled:opacity-60"
                      >
                        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: c1 }} />
                        <div
                          className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center border border-white/8"
                          style={{ background: `linear-gradient(135deg, ${c1}22, transparent)` }}
                        >
                          <TeamCrest config={t.crest_config} color1={t.color1} color2={t.color2} size={40} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[0.9375rem] font-extrabold italic text-white truncate">{t.name}</span>
                            <span className="shrink-0 text-[0.6875rem] font-extrabold px-1.5 py-0.5 rounded bg-white/8 text-white/50">
                              {formatLabel(t.format)}
                            </span>
                          </div>
                          <div className="text-[0.6875rem] text-ink-4 mt-0.5">
                            {t.wins}G {t.draws}B {t.losses}M · {t.member_count} oyuncu
                          </div>
                          <div className="text-[0.6875rem] text-[#39FF14] font-bold mt-1">Kadroyu sahaya diz →</div>
                        </div>
                        {busy
                          ? <Loader2 size={18} className="animate-spin text-[#39FF14] shrink-0" />
                          : <ChevronRight size={18} className="text-ink-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Sabit seçim çubuğu (yalnız Arkadaşlar sekmesi) ── */}
      {tab === 'FRIENDS' && selected.length > 0 && (
        <div className="absolute bottom-0 inset-x-0 p-5 pb-safe bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/95 to-transparent">
          <button
            onClick={confirmFriends}
            className="w-full min-h-[54px] rounded-2xl bg-[#39FF14] text-[#0A0E14] font-extrabold text-base uppercase tracking-widest active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(57,255,20,0.3)]"
          >
            Seçili {selected.length} Oyuncuyu Ekle
            {typeof openSlotCount === 'number' && (
              <span className="text-[0.6875rem] font-bold opacity-70">· {openSlotCount} boş slot</span>
            )}
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default MatchSquadPicker;
