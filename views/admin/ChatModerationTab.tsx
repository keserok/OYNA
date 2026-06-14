// ═══════════════════════════════════════════════════════════════════════════
// OYNA — Chat Moderation Tab (Admin)
// Mesaj şikayetlerini incele, mesaj sil, kullanıcı banla.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, ShieldOff, Trash2, Check, X, MessageSquare, User, RefreshCw, Clock,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';

interface ReportRow {
  id: string;
  reporter_id: string;
  reporter_name?: string;
  message_id: string;
  conversation_id: string;
  reason: string;
  details: string | null;
  status: 'OPEN' | 'REVIEWED' | 'ACTION_TAKEN' | 'DISMISSED';
  admin_note: string | null;
  created_at: string;
  message_body?: string;
  message_sender_id?: string;
  sender_name?: string;
}

const REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam',
  HARASSMENT: 'Taciz / Tehdit',
  HATE: 'Nefret söylemi',
  PROFANITY: 'Küfür',
  SCAM: 'Dolandırıcılık',
  OTHER: 'Diğer',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Açık', color: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
  REVIEWED: { label: 'İncelendi', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  ACTION_TAKEN: { label: 'Aksiyon Alındı', color: 'text-green-400 bg-green-400/10 border-green-400/30' },
  DISMISSED: { label: 'Reddedildi', color: 'text-gray-400 bg-gray-400/10 border-gray-400/30' },
};

export const ChatModerationTab: React.FC = () => {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('OPEN');
  const [selectedReport, setSelectedReport] = useState<ReportRow | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');

  const loadReports = async () => {
    setLoading(true);
    let query = supabase
      .from('message_reports')
      .select(`
        id, reporter_id, message_id, conversation_id, reason, details, status, admin_note, created_at,
        message:messages(body, body_masked, sender_id, created_at),
        reporter:profiles!message_reports_reporter_id_fkey(name)
      `)
      .order('created_at', { ascending: false });

    if (filter === 'OPEN') query = query.eq('status', 'OPEN');
    else if (filter === 'CLOSED') query = query.in('status', ['REVIEWED', 'ACTION_TAKEN', 'DISMISSED']);

    const { data, error } = await query;
    if (error) {
      console.error('[ChatModerationTab] loadReports error:', error);
      setLoading(false);
      return;
    }
    const enriched = (data ?? []).map((r: any) => ({
      ...r,
      reporter_name: r.reporter?.name,
      message_body: r.message?.body_masked || r.message?.body,
      message_sender_id: r.message?.sender_id,
    })) as ReportRow[];

    // Fetch sender names in bulk
    const senderIds = [...new Set(enriched.map(e => e.message_sender_id).filter(Boolean))] as string[];
    if (senderIds.length > 0) {
      const { data: senders } = await supabase.from('profiles').select('id, name').in('id', senderIds);
      const nameMap = new Map((senders ?? []).map((p: any) => [p.id, p.name]));
      enriched.forEach(e => { if (e.message_sender_id) e.sender_name = nameMap.get(e.message_sender_id) as string; });
    }

    setReports(enriched);
    setLoading(false);
  };

  useEffect(() => { loadReports(); }, [filter]);

  const handleAction = async (action: 'DELETE_MESSAGE' | 'BAN_USER' | 'DISMISS' | 'MARK_REVIEWED') => {
    if (!selectedReport) return;
    setActionInProgress(action);
    try {
      if (action === 'DELETE_MESSAGE') {
        await supabase.from('messages').delete().eq('id', selectedReport.message_id);
        await supabase.from('message_reports').update({
          status: 'ACTION_TAKEN', admin_note: adminNote || 'Mesaj silindi', reviewed_at: new Date().toISOString(),
        }).eq('id', selectedReport.id);
      } else if (action === 'BAN_USER') {
        if (!selectedReport.message_sender_id) return;
        await supabase.from('profiles').update({ is_banned: true }).eq('id', selectedReport.message_sender_id);
        await supabase.from('message_reports').update({
          status: 'ACTION_TAKEN', admin_note: adminNote || 'Kullanıcı banlandı', reviewed_at: new Date().toISOString(),
        }).eq('id', selectedReport.id);
      } else if (action === 'DISMISS') {
        await supabase.from('message_reports').update({
          status: 'DISMISSED', admin_note: adminNote || 'Şikayet yersiz bulundu', reviewed_at: new Date().toISOString(),
        }).eq('id', selectedReport.id);
      } else if (action === 'MARK_REVIEWED') {
        await supabase.from('message_reports').update({
          status: 'REVIEWED', admin_note: adminNote || null, reviewed_at: new Date().toISOString(),
        }).eq('id', selectedReport.id);
      }
      setSelectedReport(null);
      setAdminNote('');
      loadReports();
    } finally {
      setActionInProgress(null);
    }
  };

  const openReports = reports.filter(r => r.status === 'OPEN').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-400" /> Mesaj Şikayetleri
          </h2>
          {openReports > 0 && (
            <span className="px-2 py-1 bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[10px] font-black rounded-full uppercase tracking-widest">
              {openReports} açık
            </span>
          )}
        </div>
        <button onClick={loadReports} className="p-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['OPEN', 'CLOSED', 'ALL'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg border transition-colors ${
              filter === f ? 'bg-[#FFFF00] border-[#FFFF00] text-black' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {f === 'OPEN' ? 'Açık' : f === 'CLOSED' ? 'Kapanan' : 'Tümü'}
          </button>
        ))}
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 text-xs font-bold uppercase">Yükleniyor…</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-white/[0.02] border border-white/5 rounded-2xl">
          <Check size={32} className="mx-auto text-green-400 mb-2" />
          <p className="text-white font-bold text-sm">Hiç şikayet yok</p>
          <p className="text-gray-500 text-xs mt-1">İncelenecek mesaj şikayeti bulunmuyor.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const status = STATUS_LABELS[r.status];
            return (
              <button
                key={r.id}
                onClick={() => { setSelectedReport(r); setAdminNote(r.admin_note || ''); }}
                className="w-full text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded border ${status.color}`}>
                      {status.label}
                    </span>
                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                      {REASON_LABELS[r.reason] || r.reason}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Clock size={10} /> {new Date(r.created_at).toLocaleString('tr-TR')}
                  </span>
                </div>
                <p className="text-sm text-white font-medium truncate mb-1">"{r.message_body || '(mesaj silinmiş)'}"</p>
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1"><User size={10} /> Gönderen: <b className="text-gray-300">{r.sender_name || '?'}</b></span>
                  <span className="flex items-center gap-1"><AlertTriangle size={10} /> Şikayet eden: <b className="text-gray-300">{r.reporter_name || '?'}</b></span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-6" onClick={() => setSelectedReport(null)}>
          <div className="bg-[#0F1318] border border-white/10 rounded-3xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-white font-black text-lg flex items-center gap-2">
                  <AlertTriangle size={20} className="text-amber-400" /> Şikayet Detayı
                </h3>
                <p className="text-gray-500 text-xs mt-1">{REASON_LABELS[selectedReport.reason]}</p>
              </div>
              <button onClick={() => setSelectedReport(null)} className="p-1 text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="bg-[#1a1f2a] border border-white/5 rounded-2xl p-4 mb-4">
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Şikayet Edilen Mesaj</p>
              <p className="text-sm text-white">"{selectedReport.message_body || '(silinmiş)'}"</p>
              <p className="text-[10px] text-gray-500 mt-3">
                <span className="font-bold text-gray-300">{selectedReport.sender_name}</span> tarafından gönderildi
              </p>
            </div>

            {selectedReport.details && (
              <div className="bg-[#1a1f2a] border border-white/5 rounded-2xl p-4 mb-4">
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Şikayetçinin Açıklaması</p>
                <p className="text-sm text-gray-300">{selectedReport.details}</p>
              </div>
            )}

            <div className="mb-4">
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Admin Notu</p>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Kararının gerekçesini yaz (opsiyonel)"
                className="w-full bg-[#1a1f2a] border border-white/10 rounded-xl p-3 text-sm text-white outline-none placeholder:text-gray-600 resize-none"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={!!actionInProgress}
                onClick={() => handleAction('DELETE_MESSAGE')}
                className="px-4 py-3 bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Mesajı Sil
              </button>
              <button
                disabled={!!actionInProgress}
                onClick={() => handleAction('BAN_USER')}
                className="px-4 py-3 bg-red-700/20 border border-red-700/40 text-red-300 hover:bg-red-700/30 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <ShieldOff size={14} /> Kullanıcıyı Banla
              </button>
              <button
                disabled={!!actionInProgress}
                onClick={() => handleAction('MARK_REVIEWED')}
                className="px-4 py-3 bg-blue-500/15 border border-blue-500/40 text-blue-400 hover:bg-blue-500/25 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <MessageSquare size={14} /> İncelendi
              </button>
              <button
                disabled={!!actionInProgress}
                onClick={() => handleAction('DISMISS')}
                className="px-4 py-3 bg-gray-500/15 border border-gray-500/40 text-gray-400 hover:bg-gray-500/25 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <X size={14} /> Reddet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatModerationTab;
