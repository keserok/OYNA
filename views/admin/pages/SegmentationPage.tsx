import React, { useCallback, useEffect, useState } from 'react';
import { fetchSegmentPreview, broadcastNotification, toTurkishAdminError, type BroadcastSegment } from '../../../services/adminService';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';
import { Filter, Send, Users } from 'lucide-react';

const SEGMENTS = [
  { id: 'ALL', label: 'Tüm Kullanıcılar' },
  { id: 'PRO', label: 'PRO Üyeler' },
  { id: 'CAPTAIN', label: 'Kaptanlar' },
  { id: 'OWNER', label: 'Saha Sahipleri' },
  { id: 'NEW_USERS', label: 'Son 30 Gün' },
  { id: 'GOALKEEPER', label: 'Kaleciler' },
  { id: 'REFEREE', label: 'Hakemler' },
] as const;

export const SegmentationPage: React.FC = () => {
  const [segment, setSegment] = useState<string>('ALL');
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const { success, error: toastError } = useAdminToast();

  const loadCount = useCallback(async (seg: string) => {
    setLoading(true);
    try {
      setCount(await fetchSegmentPreview(seg));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void loadCount(segment); }, [segment, loadCount]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toastError('Başlık ve mesaj gerekli.');
      return;
    }
    setLoading(true);
    try {
      const sent = await broadcastNotification(title.trim(), body.trim(), segment as BroadcastSegment);
      success(`${sent} kullanıcıya gönderildi`);
      setTitle('');
      setBody('');
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell route="SEGMENTATION" icon={<Filter size={20} />}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5 space-y-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Hedef Segment</p>
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSegment(s.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                segment === s.id ? 'bg-cyan-500/10 border-cyan-500/30 text-white' : 'bg-black/20 border-white/[0.06] text-gray-400 hover:border-white/10'
              }`}
            >
              <span className="text-sm font-semibold">{s.label}</span>
              {segment === s.id && <Users size={14} className="text-cyan-400" />}
            </button>
          ))}
        </div>

        <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Önizleme</p>
            {count !== null && (
              <span className="text-2xl font-black text-cyan-400">{loading ? '…' : count} <span className="text-xs text-gray-500 font-normal">kişi</span></span>
            )}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bildirim başlığı" className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-cyan-500/40" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Mesaj içeriği" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-cyan-500/40" />
          <button
            onClick={() => void handleSend()}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl disabled:opacity-50 transition-colors"
          >
            <Send size={14} /> Segmente Gönder
          </button>
        </div>
      </div>
    </PageShell>
  );
};
