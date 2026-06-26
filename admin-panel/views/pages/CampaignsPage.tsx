import React, { useCallback, useEffect, useState } from 'react';
import {
  broadcastNotification,
  fetchSegmentPreview,
  toTurkishAdminError,
  type BroadcastSegment,
} from '../../services/adminService';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';
import { Megaphone, Send, Users } from 'lucide-react';

const SEGMENTS = [
  { id: 'ALL', label: 'Tüm Kullanıcılar' },
  { id: 'PRO', label: 'PRO Üyeler' },
  { id: 'OWNER', label: 'Saha Sahipleri' },
  { id: 'NEW_USERS', label: 'Son 30 Gün' },
  { id: 'GOALKEEPER', label: 'Kaleciler' },
  { id: 'REFEREE', label: 'Hakemler' },
] as const;

export const CampaignsPage: React.FC<{ route?: 'NOTIFICATIONS' | 'SEGMENTATION' }> = ({ route = 'NOTIFICATIONS' }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState<BroadcastSegment>('ALL');
  const [count, setCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { success, error: toastError } = useAdminToast();

  const loadCount = useCallback(async (seg: BroadcastSegment) => {
    setPreviewLoading(true);
    try {
      setCount(await fetchSegmentPreview(seg));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setPreviewLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void loadCount(segment); }, [segment, loadCount]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toastError('Başlık ve mesaj gerekli.');
      return;
    }
    setSending(true);
    try {
      const sent = await broadcastNotification(title.trim(), body.trim(), segment);
      success(`${sent} kullanıcıya bildirim gönderildi`);
      setTitle('');
      setBody('');
      void loadCount(segment);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <PageShell route={route} icon={<Megaphone size={20} />}>
      <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
        <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5 space-y-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Hedef Segment</p>
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSegment(s.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                segment === s.id ? 'bg-pink-500/10 border-pink-500/30 text-white' : 'bg-black/20 border-white/[0.06] text-gray-400 hover:border-white/10'
              }`}
            >
              <span className="text-sm font-semibold">{s.label}</span>
              {segment === s.id && <Users size={14} className="text-pink-400" />}
            </button>
          ))}
        </div>

        <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Önizleme & Gönder</p>
            {count !== null && (
              <span className="text-2xl font-black text-pink-400">
                {previewLoading ? '…' : count}
                <span className="text-xs text-gray-500 font-normal ml-1">kişi</span>
              </span>
            )}
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Başlık</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full mt-1.5 h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-pink-500/40" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mesaj</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full mt-1.5 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-pink-500/40" />
          </div>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending}
            className="flex items-center gap-2 px-6 py-3 bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs rounded-xl disabled:opacity-50 transition-colors"
          >
            <Send size={14} /> {sending ? 'Gönderiliyor...' : 'Yayınla'}
          </button>
        </div>
      </div>
    </PageShell>
  );
};
