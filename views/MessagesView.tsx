import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Spinner } from '../components/ui/Spinner';
import {
  ArrowLeft, Send, MoreVertical, Ban, Flag, Loader2,
  MessageCircle, Check, CheckCheck, BellOff, Bell, Shield, ClipboardList, ChevronRight,
} from 'lucide-react';
import { auth } from '../supabaseAuth';
import {
  getMyConversations, getMessages, sendMessage, markConversationRead,
  subscribeToConversation,
  ConversationSummary, Message,
} from '../services/messageService';
// F2/F3: DM engelleme/şikayet artık sosyal katmanın GÜÇLÜ makinesine bağlı —
// blockUserFully (arkadaşlığı da düşürür, profil sheet'iyle aynı) + gerçek
// reportUser (user_reports'a yazar). Eski messageService.blockUser sadece
// user_blocks'a upsert edip arkadaşlığı koruyordu (tutarsız semantik).
import { blockUserFully, reportUser } from '../services/socialService';
import {
  getTeamChatOverview, getTeamMessages, sendTeamMessage, markTeamChatRead,
  setTeamChatMuted, subscribeTeamChat, parseTacticMessage,
  TeamChatOverviewRow, TeamMessage,
} from '../services/teamChatService';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import TeamCrest from '../components/social/TeamCrest';
import { UserAvatar } from '../components/common/UserAvatar';

// ================================================================
// MessagesView — BİRLEŞİK gelen kutusu (Spec §3.10 / N90):
// 1:1 sohbetler + takım sohbetleri tek listede, son etkinliğe göre.
// DM makinesi aynen korunur; takım sohbeti ayrı tablo/servis.
// Rozet: konuşma okunmamışları (bildirim kutusuna yazılmaz — N93).
// ================================================================

interface MessagesViewProps {
  /** Geriye gitme (BottomNav / üst seviye). */
  onBack: () => void;
  /** SocialView'den gelen başlangıç DM'i — varsa direkt o sohbeti aç. */
  initialConversationId?: string | null;
  /** Takım Detayı / derin bağlantıdan gelen takım sohbeti hedefi. */
  initialTeamChatId?: string | null;
  /** Boş gelen kutusundan arkadaş bulmaya çıkış (IP-12). */
  onFindFriends: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const timeAgo = (iso: string | null): string => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Az önce';
  if (min < 60) return `${min} dk`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} g`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
};

const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/**
 * Sohbet avatarı — görünüm dili TEK bileşenden (components/common/UserAvatar).
 * Burada eskiden koyu yeşil gradyanlı kendi kopyası vardı: aynı kişi
 * Mesajlar'da yeşil kutuda, profilinde açık gri yuvarlakta görünüyordu.
 * Sohbet listesinin kare-yumuşak (rounded-2xl) biçimi korundu; değişen yalnız
 * renk ve harf dili.
 */
const Avatar: React.FC<{ name: string | null; url: string | null; size?: number }> = ({
  name, url, size = 48,
}) => (
  /* Punto kutu boyuyla orantılı (size × 0.33) — sınıf değil satır içi ölçü,
     çünkü `size` bir sayı olarak geliyor. UserAvatar puntoyu miras alsın diye
     `textClassName` boş geçiliyor. */
  <div
    style={{ width: `${size}px`, height: `${size}px`, fontSize: size * 0.33 }}
    className="flex-shrink-0"
  >
    <UserAvatar
      name={name}
      avatarUrl={url}
      className="w-full h-full rounded-2xl"
      textClassName=""
    />
  </div>
);

// Sohbette taktik kartı — "[taktik:ID] Ad · Diziliş" gövdesi zengin çizilir
const TacticCard: React.FC<{ tacticId: string; label: string; mine: boolean }> = ({
  tacticId, label, mine,
}) => {
  const openStudio = () => {
    const s = useAppStore.getState();
    s.setStudioContext({ tacticId });
    s.navigateTo('STUDIO');
  };
  return (
    <button
      onClick={openStudio}
      className={`w-full text-left rounded-2xl border p-3 flex items-center gap-2.5 active:scale-[0.98] ${
        mine ? 'bg-emerald-600/60 border-white/20' : 'bg-white/6 border-white/12'
      }`}
    >
      <span className="w-9 h-9 rounded-xl bg-[#39FF14]/12 border border-[#39FF14]/25 flex items-center justify-center shrink-0">
        <ClipboardList size={16} className="text-[#39FF14]" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[0.625rem] font-extrabold uppercase tracking-widest text-white/50">Taktik</span>
        <span className="block text-sm font-bold text-white truncate">{label}</span>
      </span>
      <span className="text-[0.6875rem] font-extrabold text-[#39FF14] shrink-0 flex items-center">
        Stüdyo'da Aç <ChevronRight size={12} />
      </span>
    </button>
  );
};

// ─── Birleşik liste satır modeli ────────────────────────────────────────────
type InboxItem =
  | { kind: 'DM'; at: string | null; dm: ConversationSummary }
  | { kind: 'TEAM'; at: string | null; team: TeamChatOverviewRow };

// ─── Konuşma Listesi (birleşik) ─────────────────────────────────────────────
const InboxList: React.FC<{
  items: InboxItem[];
  loading: boolean;
  onSelect: (item: InboxItem) => void;
  /** Boş gelen kutusundan çıkış — IP-12 · BULGU-066. */
  onFindFriends: () => void;
}> = ({ items, loading, onSelect, onFindFriends }) => {
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Spinner size={28} color="#34D399" />
    </div>
  );

  if (items.length === 0) return (
    <div className="text-center py-16">
      <MessageCircle size={40} className="mx-auto mb-3 text-ink-4" />
      <p className="text-sm text-ink-4">Henüz mesajın yok</p>
      {/* IP-12 · BULGU-066: burası çıkmaz sokaktı — ikon ve cümle vardı, çıkış yoktu. */}
      <button
        onClick={onFindFriends}
        className="mt-4 min-h-[44px] px-5 rounded-2xl bg-primary text-on-primary text-xs font-extrabold uppercase tracking-wide active:scale-[0.98] transition-transform"
      >
        Arkadaş Bul
      </button>
    </div>
  );

  return (
    <div className="space-y-2 pb-6">
      {items.map((item, i) => {
        if (item.kind === 'DM') {
          const c = item.dm;
          const name = c.otherName || c.otherOynaId || 'Oyuncu';
          return (
            <motion.button
              key={`dm-${c.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.03 }}
              onClick={() => onSelect(item)}
              className="w-full text-left bg-white/4 border border-white/8 rounded-2xl p-3.5 flex items-center gap-3 hover:bg-white/8 transition-colors"
            >
              <Avatar name={name} url={c.otherAvatar} size={50} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white truncate">{name}</span>
                  <span className="text-[0.6875rem] text-ink-4 flex-shrink-0">{timeAgo(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className={`text-xs truncate ${c.unreadCount > 0 ? 'text-gray-200 font-semibold' : 'text-ink-4'}`}>
                    {c.lastMessagePreview || 'Konuşmaya başla'}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 flex items-center justify-center text-[0.6875rem] font-extrabold text-white flex-shrink-0">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </motion.button>
          );
        }

        const t = item.team;
        const preview = t.last_body
          ? `${t.last_sender ? `${t.last_sender}: ` : ''}${parseTacticMessage(t.last_body) ? '📋 Taktik paylaşıldı' : t.last_body}`
          : 'Takım sohbetine başla';
        return (
          <motion.button
            key={`team-${t.team_id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.03 }}
            onClick={() => onSelect(item)}
            className="w-full text-left bg-white/4 border border-white/8 rounded-2xl p-3.5 flex items-center gap-3 hover:bg-white/8 transition-colors relative overflow-hidden"
          >
            {/* Takım-rengi kimlik şeridi */}
            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: t.color1 || '#39FF14' }} />
            <div
              className="w-[50px] h-[50px] rounded-2xl flex items-center justify-center border border-white/8 flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${t.color1 || '#39FF14'}22, transparent)` }}
            >
              <TeamCrest config={t.crest_config} color1={t.color1} color2={t.color2} size={36} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-white truncate flex items-center gap-1.5">
                  <Shield size={12} className="text-ink-4 shrink-0" />
                  {t.team_name}
                  {t.muted && <BellOff size={11} className="text-ink-4 shrink-0" />}
                </span>
                <span className="text-[0.6875rem] text-ink-4 flex-shrink-0">{timeAgo(t.last_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className={`text-xs truncate ${t.unread_count > 0 && !t.muted ? 'text-gray-200 font-semibold' : 'text-ink-4'}`}>
                  {preview}
                </span>
                {t.unread_count > 0 && (
                  <span className={`min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[0.6875rem] font-extrabold flex-shrink-0 ${
                    t.muted ? 'bg-white/10 text-gray-400' : 'bg-emerald-500 text-white'
                  }`}>
                    {t.unread_count}
                  </span>
                )}
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};

// ─── 1:1 Sohbet Görünümü (mevcut makine — dokunulmadı) ──────────────────────
const ChatView: React.FC<{
  conversation: ConversationSummary;
  myUid: string;
  onBack: () => void;
}> = ({ conversation, myUid, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false); // F1: bu kullanıcıyı engelledim

  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const name = conversation.otherName || conversation.otherOynaId || 'Oyuncu';

  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }, []);

  const pushMessage = useCallback((m: Message) => {
    if (seenIdsRef.current.has(m.id)) return;
    seenIdsRef.current.add(m.id);
    setMessages(prev => [...prev, m]);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    seenIdsRef.current = new Set();
    (async () => {
      try {
        const history = await getMessages(conversation.id);
        if (!active) return;
        history.forEach(m => seenIdsRef.current.add(m.id));
        setMessages(history);
        scrollToBottom();
        await markConversationRead(conversation.id);
      } catch (e: any) {
        if (active) setError(e?.message || 'Mesajlar yüklenemedi.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [conversation.id, scrollToBottom]);

  // Kopukluk telafisi: soket düşerken gelen mesajlar bir daha yayınlanmaz.
  // Kanal yeniden bağlanınca (ya da uygulama öne gelince) geçmişi baştan çekip
  // aradaki boşluğu kapatırız. Sessiz çalışır — `loading` iskeleti yakılmaz ki
  // açık sohbet ekranı gözle görülür şekilde sıfırlanmasın.
  const resyncMessages = useCallback(async () => {
    try {
      const history = await getMessages(conversation.id);
      seenIdsRef.current = new Set(history.map(m => m.id));
      setMessages(history);
    } catch { /* telafi en-iyi-çaba; sonraki olay ya da ekran açılışı tazeler */ }
  }, [conversation.id]);

  useEffect(() => {
    const unsubscribe = subscribeToConversation(conversation.id, (m) => {
      pushMessage(m);
      scrollToBottom(true);
      if (m.senderId !== myUid) {
        markConversationRead(conversation.id);
      }
    }, () => { void resyncMessages(); });
    return () => unsubscribe();
  }, [conversation.id, myUid, pushMessage, scrollToBottom, resyncMessages]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        markConversationRead(conversation.id);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [conversation.id]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendMessage(conversation.id, body);
      pushMessage(msg);
      setDraft('');
      scrollToBottom(true);
    } catch (e: any) {
      setError(e?.message || 'Mesaj gönderilemedi.');
    } finally {
      setSending(false);
    }
  }, [draft, sending, conversation.id, pushMessage, scrollToBottom]);

  const handleBlock = useCallback(async () => {
    setMenuOpen(false);
    setError(null);
    if (!conversation.otherId) { setError('Bu kullanıcı engellenemiyor.'); return; }
    try {
      await blockUserFully(myUid, conversation.otherId);
      // F1: blok sonrası sohbet AÇIK kalmasın — kompozer kilitlenir + net durum.
      setBlocked(true);
      setActionInfo(`${name} engellendi. Artık mesajlaşamazsın.`);
    } catch (e: any) {
      setError(e?.message || 'Kullanıcı engellenemedi.');
    }
  }, [conversation.otherId, name, myUid]);

  const handleReport = useCallback(async () => {
    setMenuOpen(false);
    setError(null);
    if (!conversation.otherId) { setError('Bu kullanıcı şikayet edilemiyor.'); return; }
    try {
      // F3: gerçek şikayet — user_reports'a yazar (eskiden yalnız "alındı" diyip
      // hiçbir şey kaydetmiyordu).
      await reportUser(myUid, conversation.otherId, 'HARASSMENT');
      setActionInfo('Şikayetin alındı, ekibimiz inceleyecek.');
    } catch (e: any) {
      setError(e?.message || 'Şikayet gönderilemedi.');
    }
  }, [conversation.otherId, myUid]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Sohbet Başlığı ── */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/8 flex items-center gap-3 relative bg-[#070B10]/80 backdrop-blur-xl">
        <button
          onClick={onBack}
          aria-label="Geri" className="w-11 h-11 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={18} className="text-gray-300" />
        </button>
        <Avatar name={name} url={conversation.otherAvatar} size={40} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white truncate">{name}</div>
          {conversation.otherOynaId && (
            <div className="text-[0.6875rem] text-ink-4 truncate">{conversation.otherOynaId}</div>
          )}
        </div>
        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menü" className="w-11 h-11 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors flex-shrink-0"
        >
          <MoreVertical size={18} className="text-gray-300" />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -6 }}
                className="absolute right-4 top-14 z-20 w-44 bg-[#0D1117] border border-white/12 rounded-2xl overflow-hidden shadow-xl"
              >
                <button
                  onClick={handleBlock}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Ban size={16} />
                  Engelle
                </button>
                <div className="h-px bg-white/8" />
                <button
                  onClick={handleReport}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-bold text-amber-400 hover:bg-amber-500/10 transition-colors"
                >
                  <Flag size={16} />
                  Şikayet Et
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mesaj Akışı ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={24} color="#34D399" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-ink-4 text-sm">
            Henüz mesaj yok. İlk mesajı sen yaz.
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => {
              const mine = m.senderId === myUid;
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl ${
                      mine
                        ? 'bg-emerald-500 text-white rounded-br-md'
                        : 'bg-white/8 text-gray-100 border border-white/10 rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm leading-snug whitespace-pre-wrap break-words">{m.body}</p>
                    <div className={`flex items-center gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                      <span className={`text-[0.6875rem] ${mine ? 'text-emerald-100/80' : 'text-ink-4'}`}>
                        {clockTime(m.createdAt)}
                      </span>
                      {mine && (
                        m.readAt
                          ? <CheckCheck size={13} className="text-emerald-100" />
                          : <Check size={13} className="text-emerald-100/70" />
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bilgi / Hata ── */}
      <AnimatePresence>
        {(error || actionInfo) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className={`mx-4 mb-2 px-3.5 py-2 rounded-xl text-xs font-semibold border ${
              error
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {error || actionInfo}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mesaj Girişi (F1: engellendiyse kompozer kilitli) ── */}
      {blocked ? (
        <div className="flex-shrink-0 px-4 py-4 border-t border-white/8 bg-[#070B10]/80 backdrop-blur-xl pb-safe text-center">
          <p className="text-[0.75rem] font-bold text-gray-400">
            Bu kullanıcıyı engelledin — mesajlaşma kapalı.
          </p>
        </div>
      ) : (
      <div className="flex-shrink-0 px-4 py-3 border-t border-white/8 flex items-end gap-2 bg-[#070B10]/80 backdrop-blur-xl pb-safe">
        <textarea
          value={draft}
          onChange={e => { setDraft(e.target.value); if (error) setError(null); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder="Mesaj yaz…"
          className="flex-1 resize-none max-h-28 bg-white/6 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-ink-4 focus:outline-none focus:border-emerald-500/50"
        />
        <button
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          className="w-11 h-11 rounded-2xl bg-emerald-500 flex items-center justify-center hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {sending
            ? <Loader2 size={18} className="text-white animate-spin" />
            : <Send size={18} className="text-white" />}
        </button>
      </div>
      )}
    </div>
  );
};

// ─── Takım Sohbeti Görünümü (Küme 4 — grup stili) ───────────────────────────
const TeamChatView: React.FC<{
  team: TeamChatOverviewRow;
  myUid: string;
  onBack: () => void;
}> = ({ team, myUid, onBack }) => {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(team.muted);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Gönderen ad/avatar önbelleği — realtime payload profil taşımaz
  const senderCacheRef = useRef<Map<string, { name: string; avatar: string | null }>>(new Map());

  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }, []);

  const pushMessage = useCallback((m: TeamMessage) => {
    if (seenIdsRef.current.has(m.id)) return;
    seenIdsRef.current.add(m.id);
    setMessages(prev => [...prev, m]);
  }, []);

  // İlk yükleme: geçmiş + okundu
  useEffect(() => {
    let active = true;
    setLoading(true);
    seenIdsRef.current = new Set();
    (async () => {
      try {
        const history = await getTeamMessages(team.team_id);
        if (!active) return;
        history.forEach(m => {
          seenIdsRef.current.add(m.id);
          senderCacheRef.current.set(m.senderId, { name: m.senderName, avatar: m.senderAvatar });
        });
        setMessages(history);
        scrollToBottom();
        await markTeamChatRead(team.team_id);
      } catch (e: any) {
        if (active) setError(e?.message || 'Mesajlar yüklenemedi.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [team.team_id, scrollToBottom]);

  // Kopukluk telafisi: DM tarafındaki resyncMessages ile aynı gerekçe —
  // soket düşerken gelen takım mesajları bir daha yayınlanmaz, geçmişi
  // yeniden çekip boşluğu kapatırız (sessiz: iskelet yakılmaz).
  const resyncTeamMessages = useCallback(async () => {
    try {
      const history = await getTeamMessages(team.team_id);
      seenIdsRef.current = new Set(history.map(m => m.id));
      history.forEach(m => {
        senderCacheRef.current.set(m.senderId, { name: m.senderName, avatar: m.senderAvatar });
      });
      setMessages(history);
    } catch { /* telafi en-iyi-çaba */ }
  }, [team.team_id]);

  // Realtime — gönderen bilinmiyorsa profili bir kez çek
  useEffect(() => {
    const unsubscribe = subscribeTeamChat(team.team_id, async (raw) => {
      let sender = senderCacheRef.current.get(raw.senderId);
      if (!sender) {
        const { data } = await supabase
          .from('public_profiles').select('full_name, avatar_url').eq('id', raw.senderId).maybeSingle();
        sender = { name: data?.full_name || 'Oyuncu', avatar: data?.avatar_url ?? null };
        senderCacheRef.current.set(raw.senderId, sender);
      }
      pushMessage({ ...raw, senderName: sender.name, senderAvatar: sender.avatar });
      scrollToBottom(true);
      if (raw.senderId !== myUid) markTeamChatRead(team.team_id);
    }, () => { void resyncTeamMessages(); });
    return () => unsubscribe();
  }, [team.team_id, myUid, pushMessage, scrollToBottom, resyncTeamMessages]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendTeamMessage(team.team_id, body);
      const me = senderCacheRef.current.get(myUid);
      pushMessage({ ...msg, senderName: me?.name || 'Sen', senderAvatar: me?.avatar ?? null });
      setDraft('');
      scrollToBottom(true);
    } catch (e: any) {
      setError(e?.message || 'Mesaj gönderilemedi.');
    } finally {
      setSending(false);
    }
  }, [draft, sending, team.team_id, myUid, pushMessage, scrollToBottom]);

  const toggleMute = useCallback(async () => {
    setMenuOpen(false);
    try {
      await setTeamChatMuted(team.team_id, !muted);
      setMuted(m => !m);
    } catch (e: any) {
      setError(e?.message || 'Ayar kaydedilemedi.');
    }
  }, [team.team_id, muted]);

  const goToTeam = useCallback(() => {
    const s = useAppStore.getState();
    s.setSelectedTeamId(team.team_id);
    s.navigateTo('MY_TEAM');
  }, [team.team_id]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Başlık — takım kimliği ── */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/8 flex items-center gap-3 relative bg-[#070B10]/80 backdrop-blur-xl">
        <button
          onClick={onBack}
          aria-label="Geri" className="w-11 h-11 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={18} className="text-gray-300" />
        </button>
        <button onClick={goToTeam} className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/8 flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${team.color1 || '#39FF14'}22, transparent)` }}
          >
            <TeamCrest config={team.crest_config} color1={team.color1} color2={team.color2} size={30} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white truncate flex items-center gap-1.5">
              {team.team_name}
              {muted && <BellOff size={12} className="text-ink-4" />}
            </div>
            <div className="text-[0.6875rem] text-ink-4 truncate">Takım sohbeti · Takıma git ›</div>
          </div>
        </button>
        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menü" className="w-11 h-11 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors flex-shrink-0"
        >
          <MoreVertical size={18} className="text-gray-300" />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -6 }}
                className="absolute right-4 top-14 z-20 w-52 bg-[#0D1117] border border-white/12 rounded-2xl overflow-hidden shadow-xl"
              >
                <button
                  onClick={toggleMute}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-bold text-gray-200 hover:bg-white/8 transition-colors"
                >
                  {muted ? <Bell size={16} className="text-[#39FF14]" /> : <BellOff size={16} className="text-amber-400" />}
                  {muted ? 'Sesi Aç' : 'Sessize Al'}
                </button>
                <div className="h-px bg-white/8" />
                <button
                  onClick={goToTeam}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-bold text-gray-200 hover:bg-white/8 transition-colors"
                >
                  <Shield size={16} className="text-white/50" />
                  Takım Detayı
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mesaj Akışı — grup stili (gönderen adı + avatar) ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={24} color="#34D399" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-ink-4 text-sm">
            Takım sohbetine ilk mesajı sen yaz. ⚽
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((m, i) => {
              const mine = m.senderId === myUid;
              const prev = messages[i - 1];
              const showHeader = !mine && (!prev || prev.senderId !== m.senderId);
              const tactic = parseTacticMessage(m.body);
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  {!mine && (
                    showHeader
                      ? <Avatar name={m.senderName} url={m.senderAvatar} size={28} />
                      : <span className="w-7 flex-shrink-0" />
                  )}
                  <div className={`max-w-[78%] ${tactic ? 'w-[78%]' : ''}`}>
                    {showHeader && (
                      <div className="text-[0.6875rem] font-bold text-ink-4 mb-0.5 ml-1">{m.senderName}</div>
                    )}
                    {tactic ? (
                      <TacticCard tacticId={tactic.tacticId} label={tactic.label} mine={mine} />
                    ) : (
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl ${
                          mine
                            ? 'bg-emerald-500 text-white rounded-br-md'
                            : 'bg-white/8 text-gray-100 border border-white/10 rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm leading-snug whitespace-pre-wrap break-words">{m.body}</p>
                        <div className={`mt-1 ${mine ? 'text-right' : 'text-left'}`}>
                          <span className={`text-[0.6875rem] ${mine ? 'text-emerald-100/80' : 'text-ink-4'}`}>
                            {clockTime(m.createdAt)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Hata ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mx-4 mb-2 px-3.5 py-2 rounded-xl text-xs font-semibold border bg-red-500/10 border-red-500/30 text-red-300"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mesaj Girişi ── */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-white/8 flex items-end gap-2 bg-[#070B10]/80 backdrop-blur-xl pb-safe">
        <textarea
          value={draft}
          onChange={e => { setDraft(e.target.value); if (error) setError(null); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder={`${team.team_name} sohbetine yaz…`}
          className="flex-1 resize-none max-h-28 bg-white/6 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-ink-4 focus:outline-none focus:border-emerald-500/50"
        />
        <button
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          className="w-11 h-11 rounded-2xl bg-emerald-500 flex items-center justify-center hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {sending
            ? <Loader2 size={18} className="text-white animate-spin" />
            : <Send size={18} className="text-white" />}
        </button>
      </div>
    </div>
  );
};

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
type ActiveChat =
  | { kind: 'DM'; dm: ConversationSummary }
  | { kind: 'TEAM'; team: TeamChatOverviewRow }
  | null;

const MessagesView: React.FC<MessagesViewProps> = ({
  onBack, initialConversationId, initialTeamChatId, onFindFriends,
}) => {
  const myUid = auth.currentUser?.uid || '';

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [teamChats, setTeamChats] = useState<TeamChatOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveChat>(null);
  const [listError, setListError] = useState<string | null>(null);

  const loadInbox = useCallback(async (): Promise<{
    dms: ConversationSummary[]; teams: TeamChatOverviewRow[];
  }> => {
    setLoading(true);
    setListError(null);
    try {
      const [dms, teams] = await Promise.all([getMyConversations(), getTeamChatOverview()]);
      setConversations(dms);
      setTeamChats(teams);
      return { dms, teams };
    } catch (e: any) {
      setListError(e?.message || 'Konuşmalar yüklenemedi.');
      return { dms: [], teams: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  // İlk yükleme + başlangıç hedefini otomatik aç (DM veya takım sohbeti).
  useEffect(() => {
    let alive = true;
    (async () => {
      const { dms, teams } = await loadInbox();
      if (!alive) return;
      if (initialTeamChatId) {
        const t = teams.find(x => x.team_id === initialTeamChatId);
        if (t) setActive({ kind: 'TEAM', team: t });
      } else if (initialConversationId) {
        const found = dms.find(c => c.id === initialConversationId);
        setActive({
          kind: 'DM',
          dm: found ?? {
            id: initialConversationId,
            lastMessageAt: null, lastMessagePreview: null,
            otherId: '', otherName: null, otherAvatar: null, otherOynaId: null,
            unreadCount: 0,
          },
        });
      }
    })();
    return () => { alive = false; };
    // Başlangıç hedefleri yalnız mount'ta değerlendirilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Birleşik liste — son etkinliğe göre (Spec §3.10)
  const items = useMemo<InboxItem[]>(() => {
    const rows: InboxItem[] = [
      ...conversations.map(c => ({ kind: 'DM' as const, at: c.lastMessageAt, dm: c })),
      ...teamChats.map(t => ({ kind: 'TEAM' as const, at: t.last_at, team: t })),
    ];
    return rows.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }, [conversations, teamChats]);

  const handleBackToList = useCallback(() => {
    setActive(null);
    loadInbox();
  }, [loadInbox]);

  if (active) {
    return (
      <div className="h-screen bg-[#070B10] text-white flex flex-col font-sans pt-safe">
        {active.kind === 'DM' ? (
          <ChatView conversation={active.dm} myUid={myUid} onBack={handleBackToList} />
        ) : (
          <TeamChatView team={active.team} myUid={myUid} onBack={handleBackToList} />
        )}
      </div>
    );
  }

  return (
    <div className="h-full bg-[#070B10] text-white flex flex-col font-sans">
      {/* ── Başlık ── */}
      <div className="pt-safe px-5 flex-shrink-0">
        <div className="flex items-center gap-3 pt-5 pb-4">
          <button
            onClick={onBack}
            aria-label="Geri" className="w-11 h-11 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={18} className="text-gray-300" />
          </button>
          <h1 className="text-2xl font-extrabold tracking-tight">Mesajlar</h1>
        </div>
      </div>

      {/* ── İçerik ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-2 custom-scrollbar">
        {listError && (
          <div className="mb-3 px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-300">
            {listError}
          </div>
        )}
        <InboxList
          items={items}
          loading={loading}
          onFindFriends={onFindFriends}
          onSelect={item => {
            setActive(item.kind === 'DM' ? { kind: 'DM', dm: item.dm } : { kind: 'TEAM', team: item.team });
          }}
        />
      </div>
    </div>
  );
};

export default MessagesView;
