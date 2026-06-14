// ═══════════════════════════════════════════════════════════════════════════
// OYNA — InboxList
// Profil ekranında ve bildirimler ekranında gösterilen aktif sohbet listesi.
// Yalnızca PLAYER_SEEK (Kaptan↔Oyuncu) ve SERVICE_OFFER (Kaptan↔Servis) için.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { MessageSquare, Clock, ChevronRight, Inbox as InboxIcon } from 'lucide-react';
import { auth } from '../supabaseAuth';
import { getInbox, subscribeToInbox, type InboxItem } from '../services/chatService';

interface InboxListProps {
  onOpenConversation: (conversationId: string) => void;
  emptyMode?: 'HINT' | 'HIDDEN';
}

const formatRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
};

export const InboxList: React.FC<InboxListProps> = ({ onOpenConversation, emptyMode = 'HINT' }) => {
  const myUid = auth.currentUser?.uid;
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const data = await getInbox();
    setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    if (!myUid) return;
    const unsub = subscribeToInbox(myUid, refresh);
    return () => unsub();
  }, [myUid]);

  if (loading) {
    return (
      <div className="text-center py-6 text-gray-500 text-xs font-bold uppercase tracking-widest">
        Yükleniyor…
      </div>
    );
  }

  if (items.length === 0) {
    if (emptyMode === 'HIDDEN') return null;
    return (
      <div className="bg-[#161B22]/40 border border-white/5 rounded-3xl p-6 text-center">
        <InboxIcon size={32} className="mx-auto text-white/20 mb-3" />
        <p className="text-white font-bold text-sm mb-1">Gelen Kutun Boş</p>
        <p className="text-gray-500 text-xs leading-relaxed">
          Bir kaleci/hakem kiraladığında veya kaptan oyuncu başvurunu kabul ettiğinde
          sohbetler burada görünecek.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const roleColor =
          item.other_role === 'Kaleci' ? 'text-green-400' :
          item.other_role === 'Hakem' ? 'text-red-400' :
          'text-[#FFFF00]';
        return (
          <button
            key={item.conversation_id}
            onClick={() => onOpenConversation(item.conversation_id)}
            className="w-full bg-[#161B22]/60 border border-white/5 rounded-2xl p-4 flex items-center gap-3 hover:bg-white/5 hover:border-white/10 active:scale-[0.98] transition-all text-left">
            <div className="relative shrink-0">
              {item.other_avatar ? (
                <img
                  src={item.other_avatar}
                  className="w-12 h-12 rounded-full object-cover border border-white/10"
                  alt={item.other_name}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white font-bold">
                  {item.other_name?.charAt(0) || '?'}
                </div>
              )}
              {item.unread_count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#FFFF00] text-black text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[#0A0E14]">
                  {item.unread_count > 9 ? '9+' : item.unread_count}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-white text-sm truncate">{item.other_name}</h4>
                <span className="text-[10px] text-gray-500 shrink-0 flex items-center gap-1">
                  <Clock size={9} /> {formatRelative(item.last_message_at)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-xs text-gray-400 truncate">
                  {item.last_message_preview || 'Sohbet başladı'}
                </p>
                <span className={`text-[9px] font-black uppercase tracking-widest shrink-0 ${roleColor}`}>
                  {item.other_role}
                </span>
              </div>
            </div>

            <ChevronRight size={16} className="text-gray-600 shrink-0" />
          </button>
        );
      })}
    </div>
  );
};

export default InboxList;
