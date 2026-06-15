import React, { useState } from 'react';
import { broadcastNotification, toTurkishAdminError } from '../../../services/adminService';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';
import { Megaphone, Send } from 'lucide-react';

const SEGMENTS = ['ALL', 'PRO', 'CAPTAIN', 'OWNER', 'NEW_USERS'] as const;

export const CampaignsPage: React.FC = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState<typeof SEGMENTS[number]>('ALL');
  const [sending, setSending] = useState(false);
  const { success, error: toastError } = useAdminToast();

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toastError('Başlık ve mesaj gerekli.');
      return;
    }
    setSending(true);
    try {
      const count = await broadcastNotification(title.trim(), body.trim(), segment);
      success(`${count} kullanıcıya bildirim gönderildi`);
      setTitle('');
      setBody('');
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <PageShell route="NOTIFICATIONS" icon={<Megaphone size={20} />}>
      <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-6 max-w-xl space-y-4">
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Segment</label>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value as typeof segment)}
            className="w-full mt-1.5 h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white"
          >
            {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
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
          onClick={() => void handleSend()}
          disabled={sending}
          className="flex items-center gap-2 px-6 py-3 bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs rounded-xl disabled:opacity-50 transition-colors"
        >
          <Send size={14} /> {sending ? 'Gönderiliyor...' : 'Yayınla'}
        </button>
      </div>
    </PageShell>
  );
};
