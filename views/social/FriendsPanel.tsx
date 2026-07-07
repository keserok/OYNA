import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, UserPlus, Check, X, Star, MessageCircle, Users, Loader2,
  ChevronLeft, Calendar, MapPin, Trash2,
} from 'lucide-react';
import { AppView } from '../../types';
import Avatar from '../../components/ui/Avatar';
import Chip from '../../components/ui/Chip';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonList from '../../components/ui/SkeletonList';
import BottomSheet from '../../components/ui/BottomSheet';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FriendProfileSheet from './FriendProfileSheet';
import { useMyMatches } from '../../hooks/useMyMatches';
import { isUserOnline, formatLastSeen } from '../../utils/lastSeen';
import {
  FriendRow, FriendRequestRow, FriendList,
  respondFriendRequest, cancelFriendRequest,
  createFriendList, renameFriendList, deleteFriendList,
  inviteListToMatch, parseSocialError,
} from '../../services/socialService';

// ================================================================
// FriendsPanel — Arkadaşlar sekmesinin yeni gövdesi (Spec §3.1)
// İstekler (Gelen/Gönderilen) → liste çipleri → sade kartlar.
// Kart: avatar+● · isim+★ · tek bilgi satırı · TEK 💬 (D20).
// Liste çipi seçiliyken: ⚽ Listeyi Maça Çağır (FCFS — §3.4).
// ================================================================

interface FriendsPanelProps {
  userId: string;
  friends: FriendRow[];
  requests: FriendRequestRow[];
  lists: FriendList[];
  loading: boolean;
  onRefresh: () => void;
  onNavigate: (view: AppView) => void;
  onMessage: (friendId: string) => void;
  messagingId: string | null;
  onToast: (msg: string) => void;
}

type RequestTab = 'IN' | 'OUT';
type ChipId = 'ALL' | 'FAV' | string;

const FriendsPanel: React.FC<FriendsPanelProps> = ({
  userId, friends, requests, lists, loading,
  onRefresh, onNavigate, onMessage, messagingId, onToast,
}) => {
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<ChipId>('ALL');
  const [reqTab, setReqTab] = useState<RequestTab>('IN');
  const [busyReq, setBusyReq] = useState<string | null>(null);
  const [profileFriend, setProfileFriend] = useState<FriendRow | null>(null);
  const [listSheet, setListSheet] = useState<'CREATE' | FriendList | null>(null);
  const [listName, setListName] = useState('');
  const [listEmoji, setListEmoji] = useState('');
  const [deleteList, setDeleteList] = useState<FriendList | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [invitePicker, setInvitePicker] = useState(false);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const { upcoming } = useMyMatches();

  const incoming = useMemo(() => requests.filter(r => r.direction === 'IN'), [requests]);
  const outgoing = useMemo(() => requests.filter(r => r.direction === 'OUT'), [requests]);

  // Sabit akıllı sıra: çevrimiçi → favori → yeni arkadaşlık (D26)
  const visibleFriends = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return friends
      .filter(f => {
        if (chip === 'FAV' && !f.is_favorite) return false;
        if (chip !== 'ALL' && chip !== 'FAV' && !f.list_ids.includes(chip)) return false;
        if (q && !f.full_name.toLocaleLowerCase('tr-TR').includes(q)
              && !(f.oyna_id || '').includes(q.replace(/^@/, ''))) return false;
        return true;
      })
      .sort((a, b) => {
        const ao = a.last_active_at && isUserOnline(a.last_active_at) ? 1 : 0;
        const bo = b.last_active_at && isUserOnline(b.last_active_at) ? 1 : 0;
        if (ao !== bo) return bo - ao;
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return (b.friends_since || '').localeCompare(a.friends_since || '');
      });
  }, [friends, chip, search]);

  const handleRespond = useCallback(async (req: FriendRequestRow, accept: boolean) => {
    setBusyReq(req.request_id);
    try {
      await respondFriendRequest(req.request_id, accept);
      if (accept) onToast('Artık arkadaşsınız 🤝');
      onRefresh();
    } catch (e) { onToast(parseSocialError(e)); }
    finally { setBusyReq(null); }
  }, [onRefresh, onToast]);

  const handleCancel = useCallback(async (req: FriendRequestRow) => {
    setBusyReq(req.request_id);
    try { await cancelFriendRequest(req.request_id); onRefresh(); }
    catch (e) { onToast(parseSocialError(e)); }
    finally { setBusyReq(null); }
  }, [onRefresh, onToast]);

  const acceptAll = useCallback(async () => {
    setBusyReq('ALL');
    try {
      for (const r of incoming) await respondFriendRequest(r.request_id, true);
      onToast(`${incoming.length} istek kabul edildi 🤝`);
      onRefresh();
    } catch (e) { onToast(parseSocialError(e)); onRefresh(); }
    finally { setBusyReq(null); }
  }, [incoming, onRefresh, onToast]);

  const saveList = useCallback(async () => {
    const name = listName.trim();
    if (name.length < 1) return;
    setListBusy(true);
    try {
      if (listSheet === 'CREATE') {
        const created = await createFriendList(userId, name, listEmoji || null);
        setChip(created.id);
      } else if (listSheet) {
        await renameFriendList(listSheet.id, name, listEmoji || null);
      }
      setListSheet(null); setListName(''); setListEmoji('');
      onRefresh();
    } catch (e) { onToast(parseSocialError(e)); }
    finally { setListBusy(false); }
  }, [listSheet, listName, listEmoji, userId, onRefresh, onToast]);

  const doDeleteList = useCallback(async () => {
    if (!deleteList) return;
    try {
      await deleteFriendList(deleteList.id);
      if (chip === deleteList.id) setChip('ALL');
      setDeleteList(null); setListSheet(null);
      onRefresh();
    } catch (e) { onToast(parseSocialError(e)); }
  }, [deleteList, chip, onRefresh, onToast]);

  const inviteList = useCallback(async (matchId: string) => {
    if (chip === 'ALL' || chip === 'FAV') return;
    setInviteBusy(matchId);
    try {
      const res = await inviteListToMatch(matchId, chip);
      onToast(`${res.sent} kişiye davet gitti · ilk ödeyen katılır ⚽`);
      setInvitePicker(false);
    } catch (e) { onToast(parseSocialError(e)); }
    finally { setInviteBusy(null); }
  }, [chip, onToast]);

  const activeList = chip !== 'ALL' && chip !== 'FAV' ? lists.find(l => l.id === chip) : null;

  if (loading) return <SkeletonList rows={5} />;

  return (
    <div className="pb-safe-nav">
      {/* Arama (mevcut arkadaşlarda) + Arkadaş Ekle kapısı (B7) */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Arkadaşlarında ara…"
            className="w-full h-11 pl-9 pr-3 rounded-2xl bg-white/5 border border-white/8 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/20"
          />
        </div>
        <button
          onClick={() => onNavigate('FRIEND_ADD')}
          aria-label="Arkadaş ekle"
          className="w-11 h-11 shrink-0 rounded-2xl bg-[#39FF14] text-[#0A0E14] flex items-center justify-center active:scale-95"
        >
          <UserPlus size={18} />
        </button>
      </div>

      {/* İstekler bloğu — yoksa tamamen gizli (C15) */}
      {requests.length > 0 && (
        <div className="mb-5 rounded-2xl bg-white/4 border border-white/8 p-3.5">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
              İstekler · {requests.length}
            </span>
            <div className="flex gap-1 ml-auto">
              {([['IN', `Gelen (${incoming.length})`], ['OUT', `Gönderilen (${outgoing.length})`]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setReqTab(id)}
                  className={`h-7 px-2.5 rounded-lg text-[11px] font-bold ${
                    reqTab === id ? 'bg-white/10 text-white' : 'text-white/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {reqTab === 'IN' && incoming.length >= 5 && (
            <button
              onClick={acceptAll}
              disabled={busyReq === 'ALL'}
              className="mb-2.5 text-[11px] font-bold text-[#39FF14] min-h-[32px]"
            >
              {busyReq === 'ALL' ? 'Kabul ediliyor…' : 'Tümünü Kabul Et'}
            </button>
          )}

          <div className="space-y-2">
            {(reqTab === 'IN' ? incoming : outgoing).map(r => (
              <div key={r.request_id} className="flex items-center gap-2.5">
                <Avatar name={r.full_name} src={r.avatar_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold truncate">{r.full_name}</div>
                  <div className="text-[10px] text-white/35 truncate">
                    {r.oyna_id ? `@${r.oyna_id}` : 'OYNA oyuncusu'}
                  </div>
                </div>
                {busyReq === r.request_id ? (
                  <Loader2 size={15} className="animate-spin text-white/40" />
                ) : reqTab === 'IN' ? (
                  <>
                    <button
                      onClick={() => handleRespond(r, false)}
                      aria-label="Reddet"
                      className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 active:scale-95"
                    >
                      <X size={14} />
                    </button>
                    <button
                      onClick={() => handleRespond(r, true)}
                      className="h-9 px-3 rounded-xl bg-[#39FF14] text-[#0A0E14] text-[11px] font-black flex items-center gap-1 active:scale-95"
                    >
                      <Check size={12} /> Kabul Et
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleCancel(r)}
                    className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-white/60 active:scale-95"
                  >
                    Geri Çek
                  </button>
                )}
              </div>
            ))}
            {reqTab === 'OUT' && outgoing.length === 0 && (
              <p className="text-[11px] text-white/30 py-1">Bekleyen gönderilmiş isteğin yok.</p>
            )}
          </div>
        </div>
      )}

      {/* Liste çipleri (E28) — uzun-bas: yönet */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
        <Chip label="Tümü" selected={chip === 'ALL'} onClick={() => setChip('ALL')} />
        <Chip label="★ Favoriler" selected={chip === 'FAV'} onClick={() => setChip('FAV')} />
        {lists.map(l => (
          <Chip
            key={l.id}
            label={l.name}
            emoji={l.emoji}
            selected={chip === l.id}
            onClick={() => setChip(l.id)}
            onLongPress={() => { setListSheet(l); setListName(l.name); setListEmoji(l.emoji || ''); }}
          />
        ))}
        <Chip
          label="+ Yeni"
          onClick={() => { setListSheet('CREATE'); setListName(''); setListEmoji(''); }}
        />
      </div>

      {/* Liste seçiliyken bağlamsal bar: toplu maç daveti (E30/§3.4) */}
      {activeList && (
        <button
          onClick={() => setInvitePicker(true)}
          className="mb-4 w-full min-h-[46px] rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          ⚽ Listeyi Maça Çağır
        </button>
      )}

      {/* Arkadaş kartları — radikal sade (D20) */}
      {visibleFriends.length === 0 ? (
        friends.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Henüz arkadaşın yok"
            description="Birlikte oynadıklarını bul, rehberini bağla ya da OYNA-ID ile ekle."
            actions={[{ label: '+ Arkadaş Ekle', onClick: () => onNavigate('FRIEND_ADD'), primary: true }]}
          />
        ) : (
          <EmptyState icon={Search} title="Sonuç yok" description="Filtreyi ya da aramayı değiştirmeyi dene." />
        )
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {visibleFriends.map((f, i) => {
              const online = f.last_active_at ? isUserOnline(f.last_active_at) : null;
              return (
                <motion.button
                  key={f.friendship_id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                  onClick={() => setProfileFriend(f)}
                  className="w-full flex items-center gap-3 rounded-2xl bg-white/4 border border-white/6 p-3 text-left active:scale-[0.99]"
                >
                  <Avatar name={f.full_name} src={f.avatar_url} size="lg" online={online} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold truncate">{f.full_name}</span>
                      {f.is_favorite && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
                    </div>
                    <div className="text-[11px] text-white/40 truncate mt-0.5">
                      {f.pos || 'OS'}
                      {f.matches_together > 0
                        ? ` · ${f.matches_together} maç birlikte`
                        : f.last_active_at
                          ? ` · ${online ? 'Şimdi aktif' : formatLastSeen(f.last_active_at)}`
                          : ''}
                    </div>
                  </div>
                  <span
                    role="button"
                    aria-label="Mesaj gönder"
                    onClick={e => { e.stopPropagation(); onMessage(f.friend_id); }}
                    className="w-10 h-10 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 active:scale-95"
                  >
                    {messagingId === f.friend_id
                      ? <Loader2 size={15} className="animate-spin text-[#39FF14]" />
                      : <MessageCircle size={16} />}
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Profil alt-sayfası */}
      <FriendProfileSheet
        friend={profileFriend}
        userId={userId}
        lists={lists}
        onClose={() => setProfileFriend(null)}
        onMessage={onMessage}
        onChanged={onRefresh}
        onToast={onToast}
      />

      {/* Liste oluştur / yönet sayfası */}
      <BottomSheet
        open={listSheet !== null}
        onClose={() => setListSheet(null)}
        ariaLabel="Liste yönetimi"
        maxHeightClass="max-h-[60vh]"
      >
        <div className="pb-4">
          <h3 className="text-base font-black mb-4">
            {listSheet === 'CREATE' ? 'Yeni Liste' : 'Listeyi Düzenle'}
          </h3>
          <div className="flex gap-2">
            <input
              value={listEmoji}
              onChange={e => setListEmoji(e.target.value.slice(0, 4))}
              placeholder="⚽"
              className="w-14 h-12 rounded-2xl bg-white/5 border border-white/10 text-center text-lg focus:outline-none focus:border-white/25"
            />
            <input
              value={listName}
              onChange={e => setListName(e.target.value.slice(0, 30))}
              placeholder="Liste adı (ör. Halı Saha Tayfası)"
              autoFocus
              className="flex-1 h-12 px-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold placeholder:text-white/25 focus:outline-none focus:border-[#39FF14]/50"
            />
          </div>
          <button
            disabled={listBusy || listName.trim().length < 1}
            onClick={saveList}
            className="mt-3 w-full min-h-[48px] rounded-2xl bg-[#39FF14] text-[#0A0E14] font-black text-sm disabled:opacity-40 active:scale-[0.98]"
          >
            {listBusy ? 'Kaydediliyor…' : listSheet === 'CREATE' ? 'Oluştur' : 'Kaydet'}
          </button>
          {listSheet !== 'CREATE' && listSheet !== null && (
            <button
              onClick={() => setDeleteList(listSheet)}
              className="mt-2 w-full min-h-[44px] rounded-2xl bg-white/4 border border-white/8 text-[#FF4D4D] text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Trash2 size={14} /> Listeyi Sil
            </button>
          )}
        </div>
      </BottomSheet>

      {/* Liste → maç seçici (FCFS) */}
      <BottomSheet
        open={invitePicker}
        onClose={() => setInvitePicker(false)}
        ariaLabel="Maç seç"
        maxHeightClass="max-h-[70vh]"
      >
        <div className="pb-4">
          <h3 className="text-base font-black">Hangi maça?</h3>
          <p className="text-[11px] text-white/40 mb-3">
            {activeList?.name} listesindekilere davet gider · boş slota <b>ilk ödeyen katılır</b>.
          </p>
          {upcoming.length === 0 ? (
            <p className="text-sm text-white/40 py-6 text-center">Yaklaşan maçın yok. Önce bir maç kur.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.slice(0, 8).map(m => {
                const open = (m.slots || []).filter(s => !s.player).length
                  + (m.awaySlots || []).filter(s => !s.player).length;
                return (
                  <button
                    key={m.id}
                    disabled={inviteBusy === m.id}
                    onClick={() => inviteList(m.id)}
                    className="w-full rounded-2xl bg-white/4 border border-white/8 p-3.5 text-left flex items-center gap-3 active:scale-[0.98]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold flex items-center gap-1.5">
                        <Calendar size={13} className="text-white/40" /> {m.date} · {m.time}
                      </div>
                      <div className="text-[11px] text-white/40 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin size={11} /> {m.location} · {open} boş slot
                      </div>
                    </div>
                    {inviteBusy === m.id
                      ? <Loader2 size={16} className="animate-spin text-[#39FF14]" />
                      : <span className="text-[11px] font-black text-[#39FF14]">DAVET ET</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={deleteList !== null}
        title={`"${deleteList?.name}" listesi silinsin mi?`}
        description="Arkadaşların silinmez; yalnız liste kaldırılır."
        confirmLabel="Sil"
        onConfirm={doDeleteList}
        onCancel={() => setDeleteList(null)}
      />
    </div>
  );
};

export default FriendsPanel;
