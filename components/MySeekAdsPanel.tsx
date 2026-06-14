// ═══════════════════════════════════════════════════════════════════════════
// OYNA — MySeekAdsPanel
// Kaptanın kendi açtığı oyuncu arama ilanlarını ve gelen başvuruları yönetir.
// Kabul → DB trigger conversation oluşturur ve her iki tarafa bildirim atar.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Users, Check, X, Clock, MessageSquare, ChevronRight, MapPin, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { listApplicationsForAd, acceptApplication, rejectApplication, closeAd, type ApplicationRow } from '../services/playerSeekService';

interface AdRow {
  id: string;
  pitch_name: string;
  match_date: string | null;
  match_time: string | null;
  positions_needed: string[];
  difficulty: string;
  status: string;
  created_at: string;
  pending_count?: number;
}

interface MySeekAdsPanelProps {
  onOpenConversation: (conversationId: string) => void;
}

export const MySeekAdsPanel: React.FC<MySeekAdsPanelProps> = ({ onOpenConversation }) => {
  const myUid = auth.currentUser?.uid;
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAdId, setOpenAdId] = useState<string | null>(null);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [busyAppId, setBusyAppId] = useState<string | null>(null);

  const refreshAds = async () => {
    if (!myUid) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('player_seek_ads')
      .select('id, pitch_name, match_date, match_time, positions_needed, difficulty, status, created_at')
      .eq('creator_id', myUid)
      .in('status', ['ACTIVE'])
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[MySeekAdsPanel] refreshAds error:', error);
      setAds([]);
    } else {
      const list = (data ?? []) as AdRow[];
      // Pending count'ı her ilan için çek
      if (list.length > 0) {
        const adIds = list.map(a => a.id);
        const { data: counts } = await supabase
          .from('player_seek_applications')
          .select('ad_id, id')
          .in('ad_id', adIds)
          .eq('status', 'PENDING');
        const countMap = new Map<string, number>();
        (counts ?? []).forEach((r: any) => countMap.set(r.ad_id, (countMap.get(r.ad_id) || 0) + 1));
        list.forEach(a => { a.pending_count = countMap.get(a.id) || 0; });
      }
      setAds(list);
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshAds();
    if (!myUid) return;
    // Realtime: kendi ilanlarımdaki başvuru değişikliklerini dinle
    const channel = supabase
      .channel(`my_seek_apps:${myUid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_seek_applications' }, refreshAds)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_seek_ads', filter: `creator_id=eq.${myUid}` }, refreshAds)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myUid]);

  const openAd = async (adId: string) => {
    setOpenAdId(adId);
    const apps = await listApplicationsForAd(adId);
    setApplications(apps);
  };

  const handleAccept = async (app: ApplicationRow) => {
    setBusyAppId(app.id);
    const res = await acceptApplication(app.id);
    setBusyAppId(null);
    if (res.success && res.conversationId) {
      // Başvuruları yenile
      const apps = await listApplicationsForAd(app.ad_id);
      setApplications(apps);
    }
  };
  const handleReject = async (app: ApplicationRow) => {
    setBusyAppId(app.id);
    await rejectApplication(app.id);
    const apps = await listApplicationsForAd(app.ad_id);
    setApplications(apps);
    setBusyAppId(null);
  };
  const handleClose = async (adId: string) => {
    await closeAd(adId);
    setOpenAdId(null);
    refreshAds();
  };
  const openAppChat = async (app: ApplicationRow) => {
    if (app.status !== 'ACCEPTED') return;
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('type', 'PLAYER_SEEK')
      .eq('context_id', app.id)
      .maybeSingle();
    if (conv?.id) onOpenConversation(conv.id);
  };

  if (loading) {
    return <div className="text-center py-6 text-gray-500 text-xs font-bold uppercase tracking-widest">Yükleniyor…</div>;
  }
  if (ads.length === 0) {
    return null; // Aktif ilanın yoksa hiç gösterme
  }

  const activeAd = openAdId ? ads.find(a => a.id === openAdId) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Users size={16} className="text-[#39FF14]" />
        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-400">AKTİF İLANLARIM</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <div className="space-y-2">
        {ads.map((ad) => (
          <button
            key={ad.id}
            onClick={() => openAd(ad.id)}
            className="w-full bg-[#161B22]/60 border border-white/5 rounded-2xl p-4 flex items-center gap-3 hover:bg-white/5 transition-all text-left">
            <div className="w-10 h-10 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center text-[#39FF14] font-black text-xs shrink-0">
              {ad.positions_needed.length}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-white text-sm truncate">{ad.pitch_name}</h4>
                {(ad.pending_count ?? 0) > 0 && (
                  <span className="px-2 py-0.5 bg-[#FFFF00] text-black text-[9px] font-black rounded-full uppercase">
                    {ad.pending_count} yeni
                  </span>
                )}
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2">
                <MapPin size={9} /> {ad.match_date ?? '-'} {ad.match_time ?? ''}
                <span className="text-gray-600">•</span>
                {ad.positions_needed.join(' / ')}
              </p>
            </div>
            <ChevronRight size={16} className="text-gray-600 shrink-0" />
          </button>
        ))}
      </div>

      {/* Detail Modal */}
      {activeAd && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-[100] p-0 md:p-6" onClick={() => setOpenAdId(null)}>
          <div className="bg-[#0F1318] border border-white/10 rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#0F1318]/95 backdrop-blur-xl border-b border-white/5 p-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-white font-black text-sm">{activeAd.pitch_name}</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {activeAd.match_date ?? ''} {activeAd.match_time ?? ''} • {activeAd.positions_needed.join(' / ')}
                </p>
              </div>
              <button onClick={() => setOpenAdId(null)} className="p-1 text-gray-400 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Başvurular ({applications.length})</span>
                <button onClick={() => handleClose(activeAd.id)} className="text-[10px] text-red-400 font-black uppercase tracking-widest hover:underline">İlanı Kapat</button>
              </div>

              {applications.length === 0 ? (
                <div className="text-center py-10 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <AlertCircle size={24} className="mx-auto text-white/30 mb-2" />
                  <p className="text-xs text-gray-500">Henüz başvuru yok.</p>
                </div>
              ) : (
                applications.map((app) => {
                  const isPending = app.status === 'PENDING';
                  const isAccepted = app.status === 'ACCEPTED';
                  const isRejected = app.status === 'REJECTED';
                  return (
                    <div key={app.id} className="bg-[#1a1f2a] border border-white/5 rounded-2xl p-3 flex items-center gap-3">
                      {app.applicant_avatar ? (
                        <img src={app.applicant_avatar} className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0" alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold shrink-0">
                          {app.applicant_name?.charAt(0) || '?'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-bold truncate">{app.applicant_name || 'Oyuncu'}</p>
                        <p className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Clock size={9} /> {new Date(app.applied_at).toLocaleString('tr-TR')}
                        </p>
                      </div>

                      {isPending && (
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            disabled={busyAppId === app.id}
                            onClick={() => handleReject(app)}
                            className="w-8 h-8 bg-red-500/15 border border-red-500/40 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500/25 disabled:opacity-50"
                            title="Reddet">
                            <X size={14} />
                          </button>
                          <button
                            disabled={busyAppId === app.id}
                            onClick={() => handleAccept(app)}
                            className="w-8 h-8 bg-green-500/15 border border-green-500/40 text-green-400 rounded-lg flex items-center justify-center hover:bg-green-500/25 disabled:opacity-50"
                            title="Kabul Et">
                            <Check size={14} />
                          </button>
                        </div>
                      )}
                      {isAccepted && (
                        <button
                          onClick={() => openAppChat(app)}
                          className="px-3 py-1.5 bg-[#FFFF00] text-black rounded-lg text-[10px] font-black uppercase tracking-widest hover:brightness-110 flex items-center gap-1 shrink-0">
                          <MessageSquare size={11} /> Sohbet
                        </button>
                      )}
                      {isRejected && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-red-400 shrink-0">Reddedildi</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MySeekAdsPanel;
