import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Send, MoreVertical, AlertTriangle, Trash2, ShieldOff, Shield,
  CheckCheck, Check, Clock,
} from 'lucide-react';
import { auth } from '../supabaseAuth';
import {
  getConversation, getMessages, sendMessage, subscribeToMessages, markAsRead,
  clearMyHistory, blockUser, unblockUser, reportMessage, openTypingChannel,
  getUserPresence, subscribeToUserPresence, setMyPresenceOnline, formatLastSeen,
  type ChatMessageRow, type ConversationMeta, type ReportReason,
} from '../services/chatService';

interface ChatScreenProps {
  conversationId: string | null;
  onBack: () => void;
  // Geriye uyumluluk için (eski mock kullanım) — yeni kodda kullanılmıyor
  targetName?: string;
  targetRole?: string;
  targetAvatar?: string;
}

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'SPAM', label: 'Spam / İstenmeyen mesaj' },
  { value: 'HARASSMENT', label: 'Taciz / Tehdit' },
  { value: 'HATE', label: 'Nefret söylemi' },
  { value: 'PROFANITY', label: 'Küfür / Hakaret' },
  { value: 'SCAM', label: 'Dolandırıcılık' },
  { value: 'OTHER', label: 'Diğer' },
];

const ChatScreen: React.FC<ChatScreenProps> = ({ conversationId, onBack, targetName, targetRole, targetAvatar }) => {
  const myUid = auth.currentUser?.uid;

  const [conv, setConv] = useState<ConversationMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [otherIsOnline, setOtherIsOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<string>('');
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState<ChatMessageRow | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('SPAM');
  const [reportDetails, setReportDetails] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<null | 'CLEAR' | 'BLOCK' | 'UNBLOCK'>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof openTypingChannel> | null>(null);

  // Bilinen konuşma yok → geriye uyumlu salt mesaj görüntüleme paneli olarak çıkmak yerine
  // boş hâl gösterip kullanıcıyı geri yönlendir.
  const hasRealConversation = !!conversationId;

  const otherUserId = conv ? (conv.captain_id === myUid ? conv.other_id : conv.captain_id) : null;
  const otherName = conv ? (conv.captain_id === myUid ? conv.other_name : conv.captain_name) : targetName ?? 'Sohbet';
  const otherAvatar = conv ? (conv.captain_id === myUid ? conv.other_avatar : conv.captain_avatar) : targetAvatar ?? '';
  const otherRoleLabel = conv?.other_role || targetRole || 'Oyuncu';

  // ─── İlk yükleme ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasRealConversation || !conversationId) {
      setLoadingHistory(false);
      return;
    }
    let active = true;
    (async () => {
      const [convData, msgs] = await Promise.all([
        getConversation(conversationId),
        getMessages(conversationId, 50),
      ]);
      if (!active) return;
      setConv(convData);
      setMessages(msgs);
      setLoadingHistory(false);
      // Bizim için okundu işaretle
      markAsRead(conversationId);
    })();
    return () => { active = false; };
  }, [conversationId, hasRealConversation]);

  // ─── Realtime: yeni mesajlar + okundu güncellemeleri ────────────────────
  useEffect(() => {
    if (!conversationId || !myUid) return;
    const unsub = subscribeToMessages(
      conversationId,
      (msg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // Karşı taraf yazdıysa direkt okundu işaretle
        if (msg.sender_id !== myUid) markAsRead(conversationId);
      },
      (msg) => {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }
    );
    return () => unsub();
  }, [conversationId, myUid]);

  // ─── Karşı tarafın presence + typing ────────────────────────────────────
  useEffect(() => {
    if (!otherUserId || !conversationId || !myUid) return;

    // Kendi online status'ümüzü ayarla (heartbeat ile)
    setMyPresenceOnline(myUid);

    (async () => {
      const p = await getUserPresence(otherUserId);
      if (p) {
        setOtherIsOnline(p.is_online);
        setOtherLastSeen(p.last_seen_at);
      }
    })();

    const unsubPresence = subscribeToUserPresence(otherUserId, ({ is_online, last_seen_at }) => {
      setOtherIsOnline(is_online);
      setOtherLastSeen(last_seen_at);
    });

    const tch = openTypingChannel(conversationId, myUid, () => {
      setOtherIsTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setOtherIsTyping(false), 2500);
    });
    typingChannelRef.current = tch;

    return () => {
      unsubPresence();
      tch.unsubscribe();
      typingChannelRef.current = null;
    };
  }, [otherUserId, conversationId, myUid]);

  // ─── Engellenmiş mi kontrol ─────────────────────────────────────────────
  useEffect(() => {
    if (!otherUserId || !myUid) return;
    (async () => {
      const { supabase } = await import('../supabaseClient');
      const { data } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', myUid)
        .eq('blocked_id', otherUserId)
        .maybeSingle();
      setIsBlocked(!!data);
    })();
  }, [otherUserId, myUid]);

  // ─── Otomatik scroll ────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, otherIsTyping]);

  // ─── Mesaj gönder ───────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!conversationId || !myUid || !inputText.trim() || isSending) return;
    setIsSending(true);
    setErrorBanner(null);
    const body = inputText.trim();
    setInputText('');
    const res = await sendMessage(conversationId, myUid, body);
    setIsSending(false);
    if (!res.success) {
      let msg = res.error || 'Mesaj gönderilemedi.';
      if (res.errorCode === 'RATE_LIMITED') msg = 'Çok hızlı mesaj atıyorsunuz, biraz yavaşlayın.';
      else if (res.errorCode === 'PROFANITY_BLOCKED') msg = 'Mesajınız uygunsuz içerik nedeniyle engellendi.';
      else if (res.errorCode === 'BLOCKED') msg = 'Bu kullanıcıyla mesajlaşamazsınız.';
      setErrorBanner(msg);
      setInputText(body); // mesajı geri koy
      setTimeout(() => setErrorBanner(null), 4000);
    }
  }, [conversationId, myUid, inputText, isSending]);

  const handleInputChange = (v: string) => {
    setInputText(v);
    typingChannelRef.current?.sendTyping();
  };

  // ─── Aksiyon: Sohbeti sil (sadece bende) ────────────────────────────────
  const handleClearHistory = async () => {
    if (!conversationId) return;
    const ok = await clearMyHistory(conversationId);
    if (ok) {
      setMessages([]);
      setConfirmDialog(null);
      setShowMenu(false);
    }
  };

  // ─── Aksiyon: Engelle / Engeli kaldır ───────────────────────────────────
  const handleBlock = async () => {
    if (!otherUserId) return;
    const ok = await blockUser(otherUserId);
    if (ok) {
      setIsBlocked(true);
      setConfirmDialog(null);
      setShowMenu(false);
    }
  };
  const handleUnblock = async () => {
    if (!otherUserId) return;
    const ok = await unblockUser(otherUserId);
    if (ok) {
      setIsBlocked(false);
      setConfirmDialog(null);
      setShowMenu(false);
    }
  };

  // ─── Aksiyon: Mesaj şikayet et ──────────────────────────────────────────
  const handleSubmitReport = async () => {
    if (!showReportModal) return;
    const res = await reportMessage(showReportModal.id, reportReason, reportDetails || undefined);
    if (res.success) {
      setShowReportModal(null);
      setReportDetails('');
      setReportReason('SPAM');
      setErrorBanner('Şikayetin alındı. İncelenmek üzere yöneticilere iletildi.');
      setTimeout(() => setErrorBanner(null), 3500);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (!hasRealConversation) {
    return (
      <div className="flex flex-col h-screen bg-[#0A0E14] items-center justify-center p-6 text-center">
        <Clock size={40} className="text-white/30 mb-3" />
        <p className="text-white font-bold mb-2">Sohbet bulunamadı</p>
        <p className="text-gray-500 text-sm mb-6">
          Sohbetler yalnızca kaptan bir oyuncuyu kabul ettiğinde veya bir kaleci/hakem kiralandığında açılır.
        </p>
        <button onClick={onBack} className="px-5 py-3 bg-[#FFFF00] text-black font-black text-xs uppercase rounded-2xl">Geri Dön</button>
      </div>
    );
  }

  const dayBucket = (iso: string) => new Date(iso).toLocaleDateString('tr-TR');
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  let lastDay = '';

  return (
    <div className="flex flex-col h-screen bg-[#0A0E14]">

      {/* HEADER */}
      <header className="px-4 py-3 bg-[#161B22]/90 backdrop-blur-xl border-b border-white/5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-white/5 text-gray-400 shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              {otherAvatar ? (
                <img src={otherAvatar} className="w-10 h-10 rounded-full object-cover border border-white/10" alt={otherName} referrerPolicy="no-referrer" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold">
                  {otherName?.charAt(0) || '?'}
                </div>
              )}
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#161B22] ${otherIsOnline ? 'bg-green-500' : 'bg-gray-500'}`}></div>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white text-sm truncate">{otherName}</h3>
              <p className="text-[10px] text-gray-400 truncate">
                {otherIsTyping ? <span className="text-[#39FF14]">yazıyor…</span> : (
                  otherLastSeen ? formatLastSeen(otherLastSeen, otherIsOnline) : otherRoleLabel
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setShowMenu(v => !v)} className="p-2 hover:bg-white/5 rounded-full text-gray-400">
            <MoreVertical size={20} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-12 bg-[#161B22] border border-white/10 rounded-2xl shadow-2xl py-1 min-w-[200px] z-30">
              <button onClick={() => { setConfirmDialog('CLEAR'); }} className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/5 flex items-center gap-3">
                <Trash2 size={16} className="text-gray-400" /> Sohbetimi Sil
              </button>
              {!isBlocked ? (
                <button onClick={() => { setConfirmDialog('BLOCK'); }} className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-white/5 flex items-center gap-3">
                  <ShieldOff size={16} /> Kullanıcıyı Engelle
                </button>
              ) : (
                <button onClick={() => { setConfirmDialog('UNBLOCK'); }} className="w-full text-left px-4 py-3 text-sm text-green-400 hover:bg-white/5 flex items-center gap-3">
                  <Shield size={16} /> Engeli Kaldır
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* HATA BANNER */}
      {errorBanner && (
        <div className="px-4 py-2 bg-red-500/15 border-b border-red-500/30 text-red-300 text-xs font-medium flex items-center gap-2">
          <AlertTriangle size={14} /> {errorBanner}
        </div>
      )}

      {/* MESSAGES */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {loadingHistory ? (
          <div className="text-center text-gray-500 text-xs py-10">Yükleniyor…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-10">Henüz mesaj yok. Sohbeti başlatın.</div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === myUid;
            const day = dayBucket(msg.created_at);
            const showDay = day !== lastDay;
            lastDay = day;

            if (msg.is_system) {
              return (
                <div key={msg.id} className="flex justify-center my-3">
                  <div className="px-3 py-1.5 bg-white/5 text-gray-400 text-[10px] font-medium rounded-full border border-white/5">
                    {msg.body_masked}
                  </div>
                </div>
              );
            }

            return (
              <React.Fragment key={msg.id}>
                {showDay && (
                  <div className="flex justify-center my-3">
                    <div className="px-3 py-1 bg-white/5 text-gray-500 text-[10px] font-bold rounded-full">{day}</div>
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div
                    onContextMenu={(e) => { if (!isMe) { e.preventDefault(); setShowReportModal(msg); } }}
                    onDoubleClick={() => { if (!isMe) setShowReportModal(msg); }}
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                      isMe
                        ? 'bg-[#FFFF00] text-black rounded-tr-none shadow-lg shadow-yellow-900/20'
                        : 'bg-[#161B22] text-white border border-white/10 rounded-tl-none shadow-lg'
                    }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.body_masked}</p>
                    <div className={`text-[9px] mt-1 flex items-center gap-1 ${isMe ? 'justify-end text-black/60' : 'text-gray-500'}`}>
                      {formatTime(msg.created_at)}
                      {isMe && (msg.read_at ? <CheckCheck size={11} /> : <Check size={11} />)}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}

        {otherIsTyping && (
          <div className="flex justify-start">
            <div className="px-4 py-3 bg-[#161B22] border border-white/10 rounded-2xl rounded-tl-none">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* INPUT AREA */}
      {isBlocked ? (
        <div className="p-4 bg-[#161B22] border-t border-white/5 text-center text-red-400 text-sm font-medium">
          Bu kullanıcıyı engelledin. Mesajlaşmaya devam etmek için menüden engeli kaldır.
        </div>
      ) : (
        <div className="p-3 bg-[#161B22] border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[#0A0E14] border border-white/10 rounded-2xl flex items-center px-4">
              <input
                type="text"
                value={inputText}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder="Mesaj yaz..."
                maxLength={2000}
                className="flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-gray-600"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isSending}
              className={`p-3 rounded-2xl transition-all ${
                inputText.trim() && !isSending
                  ? 'bg-[#FFFF00] text-black hover:scale-105 active:scale-95 shadow-lg shadow-yellow-900/20'
                  : 'bg-white/5 text-gray-500'
              }`}>
              <Send size={20} />
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOGS */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setConfirmDialog(null)}>
          <div className="bg-[#161B22] border border-white/10 rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg mb-2">
              {confirmDialog === 'CLEAR' && 'Sohbeti sil?'}
              {confirmDialog === 'BLOCK' && 'Bu kullanıcıyı engelle?'}
              {confirmDialog === 'UNBLOCK' && 'Engeli kaldır?'}
            </h3>
            <p className="text-gray-400 text-sm mb-5">
              {confirmDialog === 'CLEAR' && 'Mesaj geçmişin yalnızca senin tarafından silinecek. Karşı taraf hala görmeye devam edecek.'}
              {confirmDialog === 'BLOCK' && 'Bu kullanıcı sana mesaj atamaz, sen de ona mesaj atamazsın. Mevcut sohbet kapanır.'}
              {confirmDialog === 'UNBLOCK' && 'Bu kullanıcıyla tekrar mesajlaşabileceksin.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 py-3 bg-white/5 text-white rounded-2xl font-bold text-sm">Vazgeç</button>
              <button
                onClick={
                  confirmDialog === 'CLEAR' ? handleClearHistory :
                  confirmDialog === 'BLOCK' ? handleBlock :
                  handleUnblock
                }
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-bold text-sm">
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setShowReportModal(null)}>
          <div className="bg-[#161B22] border border-white/10 rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg mb-1">Mesajı Şikayet Et</h3>
            <p className="text-gray-400 text-xs mb-4">"{showReportModal.body_masked.substring(0, 100)}..."</p>
            <div className="space-y-2 mb-4">
              {REPORT_REASONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setReportReason(r.value)}
                  className={`w-full text-left px-4 py-3 rounded-2xl text-sm border transition-colors ${
                    reportReason === r.value
                      ? 'bg-[#FFFF00]/10 border-[#FFFF00]/40 text-white'
                      : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Detay (isteğe bağlı)"
              maxLength={500}
              className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl p-3 text-sm text-white outline-none placeholder:text-gray-600 resize-none mb-4"
              rows={3}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowReportModal(null)} className="flex-1 py-3 bg-white/5 text-white rounded-2xl font-bold text-sm">Vazgeç</button>
              <button onClick={handleSubmitReport} className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-bold text-sm">Şikayet Et</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatScreen;
