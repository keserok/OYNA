import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Banknote, Check, X, RefreshCw, ExternalLink, AlertTriangle, Building2, Clock } from 'lucide-react';
import { moderatePitch, processWithdrawal, fetchPitchesAdmin, fetchWithdrawalRequests, toTurkishAdminError } from '../../services/adminService';

interface PendingPitch {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  owner_id: string | null;
  created_at: string | null;
  ownerName: string;
}

interface PendingWithdrawal {
  id: string;
  pitch_id: string;
  owner_id: string;
  amount: number;
  iban: string;
  iban_photo_url: string | null;
  created_at: string;
  ownerName: string;
  pitchName: string;
}

type RejectTarget =
  | { kind: 'pitch'; id: string; ownerId: string | null; name: string }
  | { kind: 'withdrawal'; id: string; ownerId: string; name: string };

const fmtDate = (iso: string | null): string => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

const OwnerModerationTab: React.FC<{ pitchesOnly?: boolean }> = ({ pitchesOnly = false }) => {
  const [pitches, setPitches] = useState<PendingPitch[]>([]);
  const [withdrawals, setWithdrawals] = useState<PendingWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const namesByIds = async (ids: string[]): Promise<Record<string, string>> => {
    const { fetchProfileNamesAdmin } = await import('../../services/adminService');
    return fetchProfileNamesAdmin(ids);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pitchPromise = fetchPitchesAdmin({ status: 'pending', limit: 200 });
      const wdPromise = pitchesOnly
        ? Promise.resolve([] as Awaited<ReturnType<typeof fetchWithdrawalRequests>>)
        : fetchWithdrawalRequests('PENDING', 100);
      const [{ pitches: pitchRows }, wdRows] = await Promise.all([pitchPromise, wdPromise]);

      const ownerIds = [
        ...pitchRows.map((p) => p.owner_id ?? ''),
        ...wdRows.map((w) => w.owner_id),
      ];
      const ownerNames = await namesByIds(ownerIds);

      setPitches(pitchRows.map((p) => ({
        id: p.id,
        name: p.name,
        city: p.city,
        district: p.district,
        owner_id: p.owner_id,
        created_at: p.created_at,
        ownerName: ownerNames[p.owner_id ?? ''] ?? 'Bilinmeyen',
      })));

      setWithdrawals(pitchesOnly ? [] : wdRows.map((w) => ({
        id: w.id,
        pitch_id: w.pitch_id,
        owner_id: w.owner_id,
        amount: w.amount,
        iban: w.iban,
        iban_photo_url: w.iban_photo_url,
        created_at: w.created_at,
        ownerName: w.owner_name ?? ownerNames[w.owner_id] ?? 'Bilinmeyen',
        pitchName: w.pitch_name ?? 'Tesis',
      })));
    } catch (err) {
      console.error('OwnerModerationTab fetch:', err);
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw.includes('row-level security') ? 'Bu verilere erişim için ADMIN yetkisi gerekli.' : 'Veriler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [pitchesOnly]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const approvePitch = async (p: PendingPitch) => {
    setActioningId(p.id);
    setError(null);
    try {
      await moderatePitch(p.id, true);
      await fetchData();
    } catch (err) {
      console.error('approvePitch:', err);
      setError(toTurkishAdminError(err));
    } finally {
      setActioningId(null);
    }
  };

  const approveWithdrawal = async (w: PendingWithdrawal) => {
    setActioningId(w.id);
    setError(null);
    try {
      await processWithdrawal(w.id, true);
      await fetchData();
    } catch (err) {
      console.error('approveWithdrawal:', err);
      setError(toTurkishAdminError(err));
    } finally {
      setActioningId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 5) {
      setError('Lütfen en az 5 karakterlik bir red sebebi girin.');
      return;
    }
    setActioningId(rejectTarget.id);
    setError(null);
    try {
      if (rejectTarget.kind === 'pitch') {
        await moderatePitch(rejectTarget.id, false, reason);
      } else {
        await processWithdrawal(rejectTarget.id, false, reason);
      }
      setRejectTarget(null);
      setRejectReason('');
      await fetchData();
    } catch (err) {
      console.error('submitReject:', err);
      setError(toTurkishAdminError(err));
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-black/20 p-4 rounded-xl border border-white/5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
          <Building2 size={16} className="text-[#FFFF00]" /> {pitchesOnly ? 'Tesis Onayları' : 'Tesis Onayları & Para Çekme'}
        </h2>
        <button onClick={() => void fetchData()} disabled={loading} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white px-3 py-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-300 text-xs bg-red-900/20 border border-red-500/30 rounded-lg p-3">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {/* Pending pitches */}
      <section>
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
          <MapPin size={14} /> Onay Bekleyen Tesisler ({pitches.length})
        </h3>
        {pitches.length === 0 && !loading ? (
          <div className="py-8 text-center text-gray-600 text-xs font-bold uppercase border border-dashed border-white/5 rounded-2xl">Onay bekleyen tesis yok</div>
        ) : (
          <div className="space-y-2">
            {pitches.map((p) => (
              <div key={p.id} className="bg-[#161B22] border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{p.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{[p.district, p.city].filter(Boolean).join(', ') || '-'} • {p.ownerName}</p>
                  <p className="text-[10px] text-gray-600 flex items-center gap-1 mt-0.5"><Clock size={10} /> {fmtDate(p.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => approvePitch(p)} disabled={actioningId === p.id} className="flex items-center gap-1 text-xs font-bold text-green-400 border border-green-500/30 bg-green-500/10 px-3 py-2 rounded-lg hover:bg-green-500/20 disabled:opacity-50">
                    {actioningId === p.id ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Onayla
                  </button>
                  <button onClick={() => { setRejectTarget({ kind: 'pitch', id: p.id, ownerId: p.owner_id, name: p.name }); setRejectReason(''); setError(null); }} disabled={actioningId === p.id} className="flex items-center gap-1 text-xs font-bold text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-lg hover:bg-red-500/20 disabled:opacity-50">
                    <X size={14} /> Reddet
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending withdrawals */}
      {!pitchesOnly && (
      <section>
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
          <Banknote size={14} /> Bekleyen Para Çekme Talepleri ({withdrawals.length})
        </h3>
        {withdrawals.length === 0 && !loading ? (
          <div className="py-8 text-center text-gray-600 text-xs font-bold uppercase border border-dashed border-white/5 rounded-2xl">Bekleyen para çekme talebi yok</div>
        ) : (
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div key={w.id} className="bg-[#161B22] border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-[#39FF14]">{w.amount.toLocaleString('tr-TR')}₺</p>
                  <p className="text-[11px] text-gray-300 truncate">{w.pitchName} • {w.ownerName}</p>
                  <p className="text-[10px] text-gray-500 font-mono truncate">{w.iban}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] text-gray-600 flex items-center gap-1"><Clock size={10} /> {fmtDate(w.created_at)}</p>
                    {w.iban_photo_url && (
                      <a href={w.iban_photo_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline flex items-center gap-1">
                        <ExternalLink size={10} /> IBAN Fotoğrafı
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => approveWithdrawal(w)} disabled={actioningId === w.id} className="flex items-center gap-1 text-xs font-bold text-green-400 border border-green-500/30 bg-green-500/10 px-3 py-2 rounded-lg hover:bg-green-500/20 disabled:opacity-50">
                    {actioningId === w.id ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Onayla
                  </button>
                  <button onClick={() => { setRejectTarget({ kind: 'withdrawal', id: w.id, ownerId: w.owner_id, name: w.pitchName }); setRejectReason(''); setError(null); }} disabled={actioningId === w.id} className="flex items-center gap-1 text-xs font-bold text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-lg hover:bg-red-500/20 disabled:opacity-50">
                    <X size={14} /> Reddet
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setRejectTarget(null)}>
          <div className="w-full max-w-md bg-[#161B22] border border-white/10 rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white mb-1">Red Sebebi</h3>
            <p className="text-xs text-gray-400 mb-4">{rejectTarget.name} — sebep sahibe bildirilecek.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Red sebebini açıklayın (min. 5 karakter)..."
              className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-[#FFFF00] resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setRejectTarget(null)} className="flex-1 h-12 rounded-xl bg-[#0A0E14] border border-white/10 text-gray-300 font-bold">Vazgeç</button>
              <button onClick={submitReject} disabled={actioningId === rejectTarget.id} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black disabled:opacity-50 flex items-center justify-center gap-2">
                {actioningId === rejectTarget.id ? <RefreshCw size={16} className="animate-spin" /> : 'Reddet ve Bildir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OwnerModerationTab;
