// ═══════════════════════════════════════════════════════════════════════════
// OYNA — MyApplicationsList
// Oyuncunun kendi gönderdiği başvuruları gösterir.
// PENDING: bekliyor (geri çekebilir), ACCEPTED: sohbete git, REJECTED: bilgi.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Clock, CheckCircle2, XCircle, MessageSquare, MapPin, Hourglass } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { withdrawApplication } from '../services/playerSeekService';

interface MyApplicationRow {
  id: string;
  ad_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  applied_at: string;
  decided_at: string | null;
  ad: {
    creator_name: string;
    creator_avatar: string | null;
    pitch_name: string;
    match_date: string | null;
    match_time: string | null;
    positions_needed: string[];
    difficulty: string;
    format: string;
  };
}

interface MyApplicationsListProps {
  onOpenConversation: (conversationId: string) => void;
  emptyMode?: 'HINT' | 'HIDDEN';
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PENDING:   { label: 'Bekliyor',   color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
  ACCEPTED:  { label: 'Kabul Edildi', color: 'text-[#39FF14]', bg: 'bg-[#39FF14]/10', border: 'border-[#39FF14]/40' },
  REJECTED:  { label: 'Reddedildi', color: 'text-red-400',   bg: 'bg-red-400/10',   border: 'border-red-400/30' },
  WITHDRAWN: { label: 'Geri Çekildi', color: 'text-gray-400', bg: 'bg-gray-400/10', border: 'border-gray-400/30' },
};

export const MyApplicationsList: React.FC<MyApplicationsListProps> = ({ onOpenConversation, emptyMode = 'HINT' }) => {
  const myUid = auth.currentUser?.uid;
  const [apps, setApps] = useState<MyApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    if (!myUid) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('player_seek_applications')
      .select(`
        id, ad_id, status, applied_at, decided_at,
        ad:player_seek_ads(creator_name, creator_avatar, pitch_name, match_date, match_time, positions_needed, difficulty, format)
      `)
      .eq('applicant_id', myUid)
      .neq('status', 'WITHDRAWN')
      .order('applied_at', { ascending: false });

    if (error) {
      console.error('[MyApplicationsList] error:', error);
      setApps([]);
    } else {
      setApps((data ?? []) as unknown as MyApplicationRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    if (!myUid) return;
    const channel = supabase
      .channel(`my_applications:${myUid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_seek_applications', filter: `applicant_id=eq.${myUid}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myUid]);

  const handleOpenChat = async (appId: string) => {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('type', 'PLAYER_SEEK')
      .eq('context_id', appId)
      .maybeSingle();
    if (conv?.id) onOpenConversation(conv.id);
  };

  const handleWithdraw = async (appId: string) => {
    setBusyId(appId);
    await withdrawApplication(appId);
    await refresh();
    setBusyId(null);
  };

  if (loading) {
    return <div className="text-center py-6 text-gray-500 text-xs font-bold uppercase tracking-widest">Yükleniyor…</div>;
  }
  if (apps.length === 0) {
    if (emptyMode === 'HIDDEN') return null;
    return (
      <div className="bg-[#161B22]/40 border border-white/5 rounded-3xl p-6 text-center">
        <Hourglass size={28} className="mx-auto text-white/20 mb-2" />
        <p className="text-white font-bold text-sm mb-1">Aktif Başvurun Yok</p>
        <p className="text-gray-500 text-xs leading-relaxed">
          "Takıma Katıl" sekmesinden kaptanların ilanlarına başvurabilirsin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {apps.map((app, idx) => {
        const meta = STATUS_META[app.status] || STATUS_META.PENDING;
        return (
          <motion.div
            key={app.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            className="bg-[#161B22]/60 border border-white/5 rounded-2xl p-4"
          >
            <div className="flex items-start gap-3">
              {app.ad.creator_avatar ? (
                <img src={app.ad.creator_avatar} className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0" alt="" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold shrink-0">
                  {app.ad.creator_name?.charAt(0) || '?'}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-white text-sm truncate">{app.ad.creator_name}</h4>
                  <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-full border ${meta.bg} ${meta.border} ${meta.color} shrink-0`}>
                    {meta.label}
                  </span>
                </div>

                <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1.5">
                  <MapPin size={10} /> {app.ad.pitch_name}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <Clock size={9} /> {app.ad.match_date ?? '-'} {app.ad.match_time ?? ''} • {app.ad.format}
                </p>

                <div className="flex flex-wrap gap-1 mt-2">
                  {app.ad.positions_needed?.map((p, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white/5 text-[9px] font-black text-gray-300 uppercase tracking-widest rounded">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Action area */}
            <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between gap-2">
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Hourglass size={9} /> {new Date(app.applied_at).toLocaleString('tr-TR')}
              </span>

              {app.status === 'ACCEPTED' && (
                <button
                  onClick={() => handleOpenChat(app.id)}
                  className="px-4 py-2 bg-gradient-to-r from-[#39FF14] to-[#FFFF00] text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 flex items-center gap-1.5 shadow-[0_0_15px_rgba(57,255,20,0.3)]"
                >
                  <MessageSquare size={11} /> Sohbete Git
                </button>
              )}
              {app.status === 'PENDING' && (
                <button
                  disabled={busyId === app.id}
                  onClick={() => handleWithdraw(app.id)}
                  className="px-3 py-1.5 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 disabled:opacity-50"
                >
                  Geri Çek
                </button>
              )}
              {app.status === 'REJECTED' && (
                <XCircle size={14} className="text-red-400/60" />
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default MyApplicationsList;
