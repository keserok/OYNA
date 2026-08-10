import React, { useCallback, useEffect, useState } from 'react';
import {
  broadcastNotification,
  fetchSegmentPreview,
  fetchAppConfig,
  fetchBroadcastCampaigns,
  toTurkishAdminError,
  type BroadcastSegment,
  type BroadcastCampaignRow,
} from '../../services/adminService';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';
import { Megaphone, Send, Users, History, Smartphone, FlaskConical } from 'lucide-react';

const SEGMENTS = [
  { id: 'ALL', label: 'Tüm Kullanıcılar' },
  { id: 'OWNER', label: 'Saha Sahipleri' },
  { id: 'NEW_USERS', label: 'Son 30 Gün' },
  { id: 'GOALKEEPER', label: 'Kaleciler' },
  { id: 'REFEREE', label: 'Hakemler' },
] as const;

const SEGMENT_LABEL: Record<string, string> = Object.fromEntries(SEGMENTS.map((s) => [s.id, s.label]));

export const CampaignsPage: React.FC<{ route?: 'NOTIFICATIONS' }> = ({ route = 'NOTIFICATIONS' }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState<BroadcastSegment>('ALL');
  const [count, setCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pushLive, setPushLive] = useState<boolean | null>(null);
  const [history, setHistory] = useState<BroadcastCampaignRow[]>([]);
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

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchBroadcastCampaigns(20));
    } catch {
      /* geçmiş yoksa sessiz geç */
    }
  }, []);

  const loadPushStatus = useCallback(async () => {
    try {
      const cfg = await fetchAppConfig();
      const row = cfg.find((c) => c.key === 'push_live_enabled');
      setPushLive(row ? Boolean(row.value) : false);
    } catch {
      setPushLive(null);
    }
  }, []);

  useEffect(() => { void loadCount(segment); }, [segment, loadCount]);
  useEffect(() => { void loadHistory(); void loadPushStatus(); }, [loadHistory, loadPushStatus]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toastError('Başlık ve mesaj gerekli.');
      return;
    }
    setSending(true);
    try {
      const sent = await broadcastNotification(title.trim(), body.trim(), segment);
      success(`${sent} kullanıcıya bildirim gönderildi${pushLive ? '' : ' (simülasyon: uygulama içi)'}`);
      setTitle('');
      setBody('');
      void loadCount(segment);
      void loadHistory();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <PageShell route={route} icon={<Megaphone size={20} />}>
      {pushLive === false && (
        <div className="mb-4 bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
          <FlaskConical size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-300/90 leading-relaxed">
            <b>Simülasyon modu:</b> Gönderdiğin bildirimler kullanıcılara <b>uygulama içinde</b> görünür,
            ancak telefonlara <b>gerçek push GİTMEZ</b>. Gerçek push için Sistem Parametreleri → Bildirim →
            “Gerçek Push Bildirimi Aktif” anahtarını aç.
          </p>
        </div>
      )}
      {pushLive === true && (
        <div className="mb-4 bg-green-500/[0.06] border border-green-500/20 rounded-2xl p-4 flex items-start gap-3">
          <Smartphone size={16} className="text-green-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-green-300/90 leading-relaxed">
            <b>Gerçek push AÇIK:</b> Bildirimler kullanıcıların telefonlarına gerçek push olarak gider.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
        <div className="bg-surface-1/60 border border-white/[0.06] rounded-2xl p-5 space-y-2">
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

        <div className="bg-surface-1/60 border border-white/[0.06] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Önizleme & Gönder</p>
            {count !== null && (
              <span className="text-2xl font-extrabold text-pink-400">
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

      {history.length > 0 && (
        <div className="mt-6 max-w-4xl bg-surface-1/60 border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <History size={14} className="text-gray-400" />
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Son Gönderimler</p>
          </div>
          <div className="space-y-2">
            {history.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 bg-black/20 border border-white/[0.06] rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{c.title}</p>
                  <p className="text-[10px] text-gray-500">
                    {SEGMENT_LABEL[c.segment] ?? c.segment} · {c.recipient_count} kişi · {new Date(c.created_at).toLocaleString('tr-TR')}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[9px] font-extrabold px-2 py-1 rounded-md ${
                    c.is_simulation ? 'text-amber-400 bg-amber-500/10' : 'text-green-400 bg-green-500/10'
                  }`}
                >
                  {c.is_simulation ? 'SİMÜLASYON' : 'GERÇEK'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
};
