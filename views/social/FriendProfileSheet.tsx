import React, { useState, useCallback } from 'react';
import {
  MessageCircle, Star, Users, MoreHorizontal, UserMinus, Ban, Flag,
  Loader2, ChevronLeft, Calendar, MapPin, Check,
} from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import GlassModal from '../../components/ui/GlassModal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import StatPill from '../../components/social/StatPill';
import { useMyMatches } from '../../hooks/useMyMatches';
import { isUserOnline, formatLastSeen } from '../../utils/lastSeen';
import {
  FriendRow, FriendList, setFriendFavorite, addFriendToList, removeFriendFromList,
  removeFriend, blockUserFully, reportUser, inviteFriendToMatch,
  parseSocialError, ReportReason,
} from '../../services/socialService';

// ================================================================
// FriendProfileSheet — arkadaş profil penceresi (Spec §3.3 / D22-25)
// Ekran ortasında buzlu cam modal (GlassModal): zenginlik burada
// yaşar — istatistik üçlüsü, Maça Çağır (birincil), ikincil sıra
// (Mesaj·Favori·Listeler), taşma (Çıkar·Engelle·Şikâyet).
// Kapatma: dışarı dokunuş (⋯ butonu sağ üstte olduğundan yüzen X yok).
// ================================================================

interface FriendProfileSheetProps {
  friend: FriendRow | null;
  userId: string;
  lists: FriendList[];
  onClose: () => void;
  onMessage: (friendId: string) => void;
  onChanged: () => void;      // çıkar/engelle sonrası liste tazeleme
  onToast: (msg: string) => void;
}

type SubPanel = 'NONE' | 'MATCH_PICKER' | 'LISTS' | 'OVERFLOW' | 'REPORT';

const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'SPAM', label: 'Spam' },
  { id: 'HARASSMENT', label: 'Taciz / Hakaret' },
  { id: 'FAKE_PROFILE', label: 'Sahte Profil' },
  { id: 'CHEATING', label: 'Hile / Sportmenlik Dışı' },
  { id: 'OTHER', label: 'Diğer' },
];

const FriendProfileSheet: React.FC<FriendProfileSheetProps> = ({
  friend, userId, lists, onClose, onMessage, onChanged, onToast,
}) => {
  const { upcoming } = useMyMatches();
  const [panel, setPanel] = useState<SubPanel>('NONE');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'REMOVE' | 'BLOCK' | null>(null);
  const [fav, setFav] = useState<boolean | null>(null);
  const [memberLists, setMemberLists] = useState<string[] | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportBlock, setReportBlock] = useState(false);

  const close = useCallback(() => {
    setPanel('NONE'); setConfirm(null); setFav(null);
    setMemberLists(null); setReportReason(null); setReportBlock(false);
    onClose();
  }, [onClose]);

  if (!friend) return null;

  const isFav = fav ?? friend.is_favorite;
  const inLists = memberLists ?? friend.list_ids;
  const online = friend.last_active_at ? isUserOnline(friend.last_active_at) : null;
  const winRate = friend.total_matches > 0
    ? Math.round((friend.win_count / friend.total_matches) * 100)
    : 0;

  const toggleFav = async () => {
    const next = !isFav;
    setFav(next);
    try { await setFriendFavorite(userId, friend.friend_id, next); onChanged(); }
    catch (e) { setFav(!next); onToast(parseSocialError(e)); }
  };

  const toggleList = async (listId: string) => {
    const has = inLists.includes(listId);
    setMemberLists(has ? inLists.filter(x => x !== listId) : [...inLists, listId]);
    try {
      if (has) await removeFriendFromList(listId, friend.friend_id);
      else await addFriendToList(listId, friend.friend_id);
      onChanged();
    } catch (e) {
      setMemberLists(inLists);
      onToast(parseSocialError(e));
    }
  };

  const inviteToMatch = async (matchId: string) => {
    setBusy(matchId);
    try {
      await inviteFriendToMatch(matchId, friend.friend_id, userId);
      onToast('Davet gönderildi ⚽');
      setPanel('NONE');
    } catch (e) { onToast(parseSocialError(e)); }
    finally { setBusy(null); }
  };

  const doRemove = async () => {
    setConfirm(null);
    try { await removeFriend(friend.friend_id); onToast('Arkadaşlıktan çıkarıldı'); onChanged(); close(); }
    catch (e) { onToast(parseSocialError(e)); }
  };

  const doBlock = async () => {
    setConfirm(null);
    try { await blockUserFully(userId, friend.friend_id); onToast('Kullanıcı engellendi'); onChanged(); close(); }
    catch (e) { onToast(parseSocialError(e)); }
  };

  const doReport = async () => {
    if (!reportReason) return;
    setBusy('report');
    try {
      await reportUser(userId, friend.friend_id, reportReason);
      if (reportBlock) await blockUserFully(userId, friend.friend_id);
      onToast('Şikâyetin alındı, ekibimiz inceleyecek');
      if (reportBlock) { onChanged(); close(); } else setPanel('NONE');
    } catch (e) { onToast(parseSocialError(e)); }
    finally { setBusy(null); }
  };

  return (
    <>
      <GlassModal open={!!friend} onClose={close} ariaLabel="Arkadaş profili" showClose={false}>
        {panel === 'NONE' && (
          <div className="pb-4">
            {/* Başlık */}
            <div className="flex items-center gap-3.5">
              <Avatar name={friend.full_name} src={friend.avatar_url} size="xl" online={online} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg font-extrabold truncate">{friend.full_name}</h2>
                  {isFav && <Star size={14} className="text-amber-400 fill-amber-400 shrink-0" />}
                </div>
                <div className="text-xs text-ink-4">
                  {friend.oyna_id ? `@${friend.oyna_id}` : 'OYNA oyuncusu'}
                  {friend.pos ? ` · ${friend.pos}` : ''}
                </div>
                <div className={`text-xs mt-0.5 ${online ? 'text-primary' : 'text-ink-4'}`}>
                  {friend.last_active_at
                    ? (online ? 'Şimdi aktif' : `Son görülme: ${formatLastSeen(friend.last_active_at)}`)
                    : ' '}
                </div>
              </div>
              <button
                onClick={() => setPanel('OVERFLOW')}
                aria-label="Diğer işlemler"
                className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 active:scale-95"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>

            {/* İstatistik üçlüsü */}
            <div className="flex gap-2 mt-5">
              <StatPill value={`%${winRate}`} label="Galibiyet" accent />
              <StatPill value={friend.total_matches} label="Maç" />
              <StatPill value={friend.matches_together} label="Birlikte" />
            </div>

            {/* BİRİNCİL: Maça Çağır (D23 — çekirdek döngü) */}
            <button
              onClick={() => setPanel('MATCH_PICKER')}
              className="mt-5 w-full min-h-[52px] rounded-2xl bg-primary text-on-primary font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              ⚽ MAÇA ÇAĞIR
            </button>

            {/* İkincil sıra */}
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={() => { onMessage(friend.friend_id); close(); }}
                className="flex-1 min-h-[46px] rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white/80 flex items-center justify-center gap-1.5 active:scale-[0.97]"
              >
                <MessageCircle size={15} /> Mesaj
              </button>
              <button
                onClick={toggleFav}
                className={`flex-1 min-h-[46px] rounded-2xl border text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] ${
                  isFav
                    ? 'bg-amber-400/10 border-amber-400/30 text-amber-300'
                    : 'bg-white/5 border-white/10 text-white/80'
                }`}
              >
                <Star size={15} className={isFav ? 'fill-amber-400 text-amber-400' : ''} />
                Favori
              </button>
              <button
                onClick={() => setPanel('LISTS')}
                className="flex-1 min-h-[46px] rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white/80 flex items-center justify-center gap-1.5 active:scale-[0.97]"
              >
                <Users size={15} /> Listeler
              </button>
            </div>
          </div>
        )}

        {/* Maç seçici — yaklaşan boş-slotlu maçların */}
        {panel === 'MATCH_PICKER' && (
          <div className="pb-4">
            <button onClick={() => setPanel('NONE')} className="flex items-center gap-1 text-xs font-bold text-white/50 min-h-[44px]">
              <ChevronLeft size={14} /> Profil
            </button>
            <h3 className="text-base font-extrabold mb-3">Hangi maça çağırıyorsun?</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-4 py-6 text-center">
                Yaklaşan maçın yok. Önce Top Oyna'dan bir maç kur veya katıl.
              </p>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 8).map(m => {
                  const open = (m.slots || []).filter(s => !s.player).length
                    + (m.awaySlots || []).filter(s => !s.player).length;
                  return (
                    <button
                      key={m.id}
                      disabled={busy === m.id}
                      onClick={() => inviteToMatch(m.id)}
                      className="w-full rounded-2xl bg-white/4 border border-white/8 p-3.5 text-left flex items-center gap-3 active:scale-[0.98]"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold flex items-center gap-1.5">
                          <Calendar size={13} className="text-ink-4" />
                          {m.date} · {m.time}
                        </div>
                        <div className="text-[0.6875rem] text-ink-4 flex items-center gap-1 mt-0.5 truncate">
                          <MapPin size={11} /> {m.location} · {open} boş slot
                        </div>
                      </div>
                      {busy === m.id
                        ? <Loader2 size={16} className="animate-spin text-primary" />
                        : <span className="text-[0.6875rem] font-extrabold text-primary">ÇAĞIR</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Listelere ekle */}
        {panel === 'LISTS' && (
          <div className="pb-4">
            <button onClick={() => setPanel('NONE')} className="flex items-center gap-1 text-xs font-bold text-white/50 min-h-[44px]">
              <ChevronLeft size={14} /> Profil
            </button>
            <h3 className="text-base font-extrabold mb-3">Listelere ekle</h3>
            {lists.length === 0 ? (
              <p className="text-sm text-ink-4 py-4">
                Henüz listen yok. Arkadaşlar sekmesindeki “+ Yeni” çipiyle oluşturabilirsin.
              </p>
            ) : (
              <div className="space-y-2">
                {lists.map(l => {
                  const has = inLists.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleList(l.id)}
                      className={`w-full min-h-[48px] rounded-2xl border px-4 flex items-center gap-2.5 text-sm font-bold active:scale-[0.98] ${
                        has ? 'bg-primary/8 border-primary/30 text-white' : 'bg-white/4 border-white/8 text-white/70'
                      }`}
                    >
                      {l.emoji && <span>{l.emoji}</span>}
                      <span className="flex-1 text-left">{l.name}</span>
                      {has && <Check size={15} className="text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Taşma menüsü */}
        {panel === 'OVERFLOW' && (
          <div className="pb-4">
            <button onClick={() => setPanel('NONE')} className="flex items-center gap-1 text-xs font-bold text-white/50 min-h-[44px]">
              <ChevronLeft size={14} /> Profil
            </button>
            <div className="space-y-2">
              <button
                onClick={() => setConfirm('REMOVE')}
                className="w-full min-h-[48px] rounded-2xl bg-white/4 border border-white/8 px-4 flex items-center gap-3 text-sm font-bold text-white/80 active:scale-[0.98]"
              >
                <UserMinus size={16} className="text-white/50" /> Arkadaşlıktan çıkar
              </button>
              <button
                onClick={() => setConfirm('BLOCK')}
                className="w-full min-h-[48px] rounded-2xl bg-white/4 border border-white/8 px-4 flex items-center gap-3 text-sm font-bold text-[#FF4D4D] active:scale-[0.98]"
              >
                <Ban size={16} /> Engelle
              </button>
              <button
                onClick={() => setPanel('REPORT')}
                className="w-full min-h-[48px] rounded-2xl bg-white/4 border border-white/8 px-4 flex items-center gap-3 text-sm font-bold text-white/80 active:scale-[0.98]"
              >
                <Flag size={16} className="text-white/50" /> Şikâyet et
              </button>
            </div>
          </div>
        )}

        {/* Şikâyet akışı — gerçek user_reports backend'i (E33) */}
        {panel === 'REPORT' && (
          <div className="pb-4">
            <button onClick={() => setPanel('OVERFLOW')} className="flex items-center gap-1 text-xs font-bold text-white/50 min-h-[44px]">
              <ChevronLeft size={14} /> Geri
            </button>
            <h3 className="text-base font-extrabold mb-3">Neden şikâyet ediyorsun?</h3>
            <div className="space-y-2">
              {REPORT_REASONS.map(r => (
                <button
                  key={r.id}
                  onClick={() => setReportReason(r.id)}
                  className={`w-full min-h-[46px] rounded-2xl border px-4 text-left text-sm font-bold active:scale-[0.98] ${
                    reportReason === r.id
                      ? 'bg-[#FF4D4D]/10 border-[#FF4D4D]/40 text-white'
                      : 'bg-white/4 border-white/8 text-white/70'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2.5 mt-4 px-1 min-h-[44px]">
              <input
                type="checkbox"
                checked={reportBlock}
                onChange={e => setReportBlock(e.target.checked)}
                className="w-4 h-4 accent-[#FF4D4D]"
              />
              <span className="text-sm text-white/70">Bu kişiyi ayrıca engelle</span>
            </label>
            <button
              disabled={!reportReason || busy === 'report'}
              onClick={doReport}
              className="mt-3 w-full min-h-[48px] rounded-2xl bg-[#FF4D4D] text-white font-extrabold text-sm disabled:opacity-40 active:scale-[0.98]"
            >
              {busy === 'report' ? 'Gönderiliyor…' : 'Şikâyeti Gönder'}
            </button>
          </div>
        )}
      </GlassModal>

      {/* Yıkıcı onaylar (D25) */}
      <ConfirmDialog
        open={confirm === 'REMOVE'}
        title={`${friend.full_name} arkadaşlıktan çıkarılsın mı?`}
        description="Geri almak için yeniden istek göndermen gerekir."
        confirmLabel="Çıkar"
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'BLOCK'}
        title={`${friend.full_name} engellensin mi?`}
        description="Arkadaşlığınız sona erer; birbirinizi arama ve mesajlarda göremezsiniz. Ona bildirim gitmez."
        confirmLabel="Engelle"
        onConfirm={doBlock}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
};

export default FriendProfileSheet;
