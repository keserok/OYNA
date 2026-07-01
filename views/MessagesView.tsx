import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, MoreVertical, Ban, Flag, Loader2,
  MessageCircle, Check, CheckCheck,
} from 'lucide-react';
import { auth } from '../supabaseAuth';
import {
  getMyConversations, getMessages, sendMessage, markConversationRead,
  blockUser, reportUser, subscribeToConversation,
  ConversationSummary, Message, ReportReason,
} from '../services/messageService';

// Şikayet sebepleri (user_reports.reason ile birebir eşleşir).
const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'HARASSMENT',   label: 'Taciz / Hakaret' },
  { id: 'SPAM',         label: 'Spam / Reklam' },
  { id: 'FAKE_PROFILE', label: 'Sahte Profil' },
  { id: 'CHEATING',     label: 'Hile / Dolandırıcılık' },
  { id: 'OTHER',        label: 'Diğer' },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface MessagesViewProps {
  /** Geriye gitme (BottomNav / üst seviye). */
  onBack: () => void;
  /** SocialView'den gelen başlangıç konuşması — varsa direkt o sohbeti aç. */
  initialConversationId?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getInitials = (name: string | null) =>
  (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

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

const Avatar: React.FC<{ name: string | null; url: string | null; size?: number }> = ({
  name, url, size = 48,
}) => {
  const s = `${size}px`;
  if (url) return (
    <img src={url} alt={name || ''} style={{ width: s, height: s }}
      className="rounded-2xl object-cover flex-shrink-0" />
  );
  return (
    <div style={{ width: s, height: s }}
      className="rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center flex-shrink-0">
      <span className="text-white font-black" style={{ fontSize: size * 0.33 }}>
        {getInitials(name)}
      </span>
    </div>
  );
};

// ─── Konuşma Listesi ─────────────────────────────────────────────────────────
const ConversationList: React.FC<{
  conversations: ConversationSummary[];
  loading: boolean;
  onSelect: (c: ConversationSummary) => void;
}> = ({ conversations, loading, onSelect }) => {
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-emerald-400" size={28} />
    </div>
  );

  if (conversations.length === 0) return (
    <div className="text-center py-16">
      <MessageCircle size={40} className="mx-auto mb-3 text-gray-700" />
      <p className="text-sm text-gray-500">Henüz mesajın yok</p>
    </div>
  );

  return (
    <div className="space-y-2 pb-6">
      {conversations.map((c, i) => {
        const name = c.otherName || c.otherOynaId || 'Oyuncu';
        return (
          <motion.button
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onSelect(c)}
            className="w-full text-left bg-white/4 border border-white/8 rounded-2xl p-3.5 flex items-center gap-3 hover:bg-white/8 transition-colors"
          >
            <Avatar name={name} url={c.otherAvatar} size={50} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-white truncate">{name}</span>
                <span className="text-[10px] text-gray-500 flex-shrink-0">{timeAgo(c.lastMessageAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className={`text-xs truncate ${c.unreadCount > 0 ? 'text-gray-200 font-semibold' : 'text-gray-500'}`}>
                  {c.lastMessagePreview || 'Konuşmaya başla'}
                </span>
                {c.unreadCount > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-black text-white flex-shrink-0">
                    {c.unreadCount}
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

// ─── Sohbet Görünümü ─────────────────────────────────────────────────────────
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
  // Şikayet modalı (sebep seçimi + gerçek kayıt) ve engelleme onayı.
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const name = conversation.otherName || conversation.otherOynaId || 'Oyuncu';

  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }, []);

  // Yeni mesajı (id tekilliği koruyarak) listeye ekle.
  const pushMessage = useCallback((m: Message) => {
    if (seenIdsRef.current.has(m.id)) return;
    seenIdsRef.current.add(m.id);
    setMessages(prev => [...prev, m]);
  }, []);

  // İlk yükleme: geçmiş + okundu işaretle
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

  // Realtime abonelik — gelen mesajları canlı ekle; unmount'ta temizle.
  useEffect(() => {
    const unsubscribe = subscribeToConversation(conversation.id, (m) => {
      pushMessage(m);
      scrollToBottom(true);
      // Karşıdan gelen mesajı görünür haldeyken anında okundu işaretle.
      if (m.senderId !== myUid) {
        markConversationRead(conversation.id);
      }
    });
    return () => unsubscribe();
  }, [conversation.id, myUid, pushMessage, scrollToBottom]);

  // Görünür olduğunda (sekmeye geri dönüş) tekrar okundu işaretle.
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

  // Engelleme artık onay adımıyla (yanlışlıkla engelleme geri alınamazdı).
  const handleBlockConfirmed = useCallback(async () => {
    setConfirmBlock(false);
    setError(null);
    try {
      await blockUser(conversation.otherId, true);
      setActionInfo(`${name} engellendi.`);
    } catch (e: any) {
      setError(e?.message || 'Kullanıcı engellenemedi.');
    }
  }, [conversation.otherId, name]);

  // Şikayeti GERÇEK moderasyon kuyruğuna (user_reports) yazar.
  const handleSubmitReport = useCallback(async () => {
    if (!reportReason || reportSubmitting) return;
    setReportSubmitting(true);
    setError(null);
    try {
      await reportUser({
        reportedId: conversation.otherId,
        reason: reportReason,
        contextType: 'CHAT',
        contextId: conversation.id,
      });
      setShowReportModal(false);
      setReportReason(null);
      setActionInfo('Şikayetin ekibimize iletildi, inceleyeceğiz.');
    } catch (e: any) {
      setError(e?.message || 'Şikayet gönderilemedi.');
    } finally {
      setReportSubmitting(false);
    }
  }, [reportReason, reportSubmitting, conversation.otherId, conversation.id]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Sohbet Başlığı ── */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/8 flex items-center gap-3 relative bg-[#070B10]/80 backdrop-blur-xl">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={18} className="text-gray-300" />
        </button>
        <Avatar name={name} url={conversation.otherAvatar} size={40} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white truncate">{name}</div>
          {conversation.otherOynaId && (
            <div className="text-[11px] text-gray-500 truncate">{conversation.otherOynaId}</div>
          )}
        </div>
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="w-9 h-9 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors flex-shrink-0"
        >
          <MoreVertical size={18} className="text-gray-300" />
        </button>

        {/* "..." Menü */}
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
                  onClick={() => { setMenuOpen(false); setConfirmBlock(true); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Ban size={16} />
                  Engelle
                </button>
                <div className="h-px bg-white/8" />
                <button
                  onClick={() => { setMenuOpen(false); setReportReason(null); setShowReportModal(true); }}
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
            <Loader2 className="animate-spin text-emerald-400" size={24} />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-sm">
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
                      <span className={`text-[10px] ${mine ? 'text-emerald-100/80' : 'text-gray-500'}`}>
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
          placeholder="Mesaj yaz..."
          className="flex-1 resize-none max-h-28 bg-white/6 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50"
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

      {/* ── Engelleme Onayı ── */}
      <AnimatePresence>
        {confirmBlock && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmBlock(false)}>
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-[#0D1117] border border-white/12 rounded-3xl p-6 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
                <Ban size={24} className="text-red-400" />
              </div>
              <h3 className="text-base font-black text-white uppercase tracking-tight">{name} engellensin mi?</h3>
              <p className="text-[12px] text-gray-400 mt-2 mb-5">Bu kişi sana mesaj gönderemez. İstediğin zaman ayarlardan engeli kaldırabilirsin.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmBlock(false)} className="flex-1 h-12 rounded-2xl bg-white/6 border border-white/10 text-gray-300 font-bold text-sm">Vazgeç</button>
                <button onClick={handleBlockConfirmed} className="flex-1 h-12 rounded-2xl bg-red-500 text-white font-black text-sm uppercase tracking-wider">Engelle</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Şikayet (sebep seçimi + gerçek kayıt) ── */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !reportSubmitting && setShowReportModal(false)}>
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-[#0D1117] border border-white/12 rounded-3xl p-6"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <Flag size={18} className="text-amber-400" />
                <h3 className="text-base font-black text-white uppercase tracking-tight">Şikayet Nedeni</h3>
              </div>
              <div className="space-y-2 mb-5">
                {REPORT_REASONS.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setReportReason(r.id)}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-bold border transition-colors ${
                      reportReason === r.id
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-white/4 border-white/10 text-gray-300 hover:bg-white/8'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowReportModal(false)}
                  disabled={reportSubmitting}
                  className="flex-1 h-12 rounded-2xl bg-white/6 border border-white/10 text-gray-300 font-bold text-sm disabled:opacity-50"
                >
                  Vazgeç
                </button>
                <button
                  onClick={handleSubmitReport}
                  disabled={!reportReason || reportSubmitting}
                  className="flex-1 h-12 rounded-2xl bg-amber-500 text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {reportSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Gönder'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
const MessagesView: React.FC<MessagesViewProps> = ({ onBack, initialConversationId }) => {
  const myUid = auth.currentUser?.uid || '';

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ConversationSummary | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const loadConversations = useCallback(async (): Promise<ConversationSummary[]> => {
    setLoading(true);
    setListError(null);
    try {
      const list = await getMyConversations();
      setConversations(list);
      return list;
    } catch (e: any) {
      setListError(e?.message || 'Konuşmalar yüklenemedi.');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // İlk yükleme + başlangıç konuşmasını otomatik aç.
  useEffect(() => {
    let active = true;
    (async () => {
      const list = await loadConversations();
      if (!active) return;
      if (initialConversationId) {
        const found = list.find(c => c.id === initialConversationId);
        if (found) {
          setActive(found);
        } else {
          // Liste henüz bu konuşmayı içermiyorsa minimal bir kabuk ile aç.
          setActive({
            id: initialConversationId,
            lastMessageAt: null,
            lastMessagePreview: null,
            otherId: '',
            otherName: null,
            otherAvatar: null,
            otherOynaId: null,
            unreadCount: 0,
          });
        }
      }
    })();
    return () => { active = false; };
    // initialConversationId yalnız mount'ta değerlendirilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sohbetten listeye dönerken sayaçları tazele.
  const handleBackToList = useCallback(() => {
    setActive(null);
    loadConversations();
  }, [loadConversations]);

  if (active) {
    return (
      <div className="h-screen bg-[#070B10] text-white flex flex-col font-sans pt-safe">
        <ChatView conversation={active} myUid={myUid} onBack={handleBackToList} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070B10] text-white flex flex-col font-sans">
      {/* ── Başlık ── */}
      <div className="pt-safe px-5 flex-shrink-0">
        <div className="flex items-center gap-3 pt-5 pb-4">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={18} className="text-gray-300" />
          </button>
          <h1 className="text-2xl font-black tracking-tight">Mesajlar</h1>
        </div>
      </div>

      {/* ── İçerik ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-2 custom-scrollbar">
        {listError && (
          <div className="mb-3 px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-300">
            {listError}
          </div>
        )}
        <ConversationList
          conversations={conversations}
          loading={loading}
          onSelect={setActive}
        />
      </div>
    </div>
  );
};

export default MessagesView;
