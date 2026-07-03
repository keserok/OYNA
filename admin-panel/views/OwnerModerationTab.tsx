import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Check, X, RefreshCw, AlertTriangle, Building2, Clock, ListChecks, ArrowRightLeft } from 'lucide-react';
import { moderatePitch, fetchPitchesAdmin, fetchProfileNamesAdmin, toTurkishAdminError } from '../services/adminService';
import { supabase } from '../../supabaseClient';
import { computeShowcaseScore, showcaseReadyBlockers, type ShowcaseTask } from '../../services/pitchShowcaseService';
import {
  fetchPendingChangeRequests,
  reviewPitchChangeRequest,
  type PitchChangeRequest,
} from '../../services/pitchContentService';

interface PendingPitch {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  owner_id: string | null;
  created_at: string | null;
  ownerName: string;
}

const CHANGE_FIELD_LABELS: Record<string, string> = {
  name: 'Ad',
  city: 'İl',
  district: 'İlçe',
  address: 'Adres',
  latitude: 'Enlem',
  longitude: 'Boylam',
};

const fmtDate = (iso: string | null): string => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

// Tesis onay kuyruğu. Para çekme talepleri tek kaynak olarak Finans → Payout
// Talepleri sekmesinde (payout_requests) yönetilir; burada artık yer almaz.
const OwnerModerationTab: React.FC = () => {
  const [pitches, setPitches] = useState<PendingPitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; ownerId: string | null; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // Karar #20: vitrin hazırlık kontrol listesi — eksikli tesis onaylanamaz
  const [blockersByPitch, setBlockersByPitch] = useState<Record<string, ShowcaseTask[]>>({});
  // Karar #4: onaylı tesislerin ad/konum değişiklik talepleri
  const [changeRequests, setChangeRequests] = useState<PitchChangeRequest[]>([]);

  const loadReadiness = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setBlockersByPitch({});
      return;
    }
    const { data } = await supabase
      .from('pitches')
      .select('id, description, amenities, images, latitude, longitude, courts(is_active), pitch_tariffs(is_active)')
      .in('id', ids);
    const map: Record<string, ShowcaseTask[]> = {};
    (data ?? []).forEach((row: { id: string } & Record<string, unknown>) => {
      map[row.id] = showcaseReadyBlockers(computeShowcaseScore(row as never));
    });
    setBlockersByPitch(map);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { pitches: pitchRows } = await fetchPitchesAdmin({ status: 'pending', limit: 200 });
      const ownerNames = await fetchProfileNamesAdmin(pitchRows.map((p) => p.owner_id ?? ''));
      setPitches(pitchRows.map((p) => ({
        id: p.id,
        name: p.name,
        city: p.city,
        district: p.district,
        owner_id: p.owner_id,
        created_at: p.created_at,
        ownerName: ownerNames[p.owner_id ?? ''] ?? 'Bilinmeyen',
      })));
      await loadReadiness(pitchRows.map((p) => p.id));
      setChangeRequests(await fetchPendingChangeRequests());
    } catch (err) {
      console.error('OwnerModerationTab fetch:', err);
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw.includes('row-level security') ? 'Bu verilere erişim için ADMIN yetkisi gerekli.' : 'Veriler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const approvePitch = async (p: PendingPitch) => {
    const blockers = blockersByPitch[p.id] ?? [];
    if (blockers.length > 0) {
      setError(`"${p.name}" vitrin için hazır değil: ${blockers.map((b) => b.label).join(' · ')}`);
      return;
    }
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

  const handleChangeRequest = async (req: PitchChangeRequest, approve: boolean) => {
    setActioningId(req.id);
    setError(null);
    try {
      await reviewPitchChangeRequest(req.id, approve, approve ? undefined : 'Admin tarafından reddedildi');
      setChangeRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
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
      await moderatePitch(rejectTarget.id, false, reason);
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
          <Building2 size={16} className="text-[#FFFF00]" /> Tesis Onayları
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

      <section>
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
          <MapPin size={14} /> Onay Bekleyen Tesisler ({pitches.length})
        </h3>
        {pitches.length === 0 && !loading ? (
          <div className="py-8 text-center text-gray-600 text-xs font-bold uppercase border border-dashed border-white/5 rounded-2xl">Onay bekleyen tesis yok</div>
        ) : (
          <div className="space-y-2">
            {pitches.map((p) => {
              const blockers = blockersByPitch[p.id] ?? [];
              const ready = blockers.length === 0;
              return (
                <div key={p.id} className="bg-[#161B22] border border-white/5 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{p.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{[p.district, p.city].filter(Boolean).join(', ') || '-'} • {p.ownerName}</p>
                      <p className="text-[10px] text-gray-600 flex items-center gap-1 mt-0.5"><Clock size={10} /> {fmtDate(p.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => approvePitch(p)}
                        disabled={actioningId === p.id || !ready}
                        title={ready ? 'Onayla' : 'Vitrin hazırlık şartları eksik'}
                        className="flex items-center gap-1 text-xs font-bold text-green-400 border border-green-500/30 bg-green-500/10 px-3 py-2 rounded-lg hover:bg-green-500/20 disabled:opacity-40"
                      >
                        {actioningId === p.id ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Onayla
                      </button>
                      <button onClick={() => { setRejectTarget({ id: p.id, ownerId: p.owner_id, name: p.name }); setRejectReason(''); setError(null); }} disabled={actioningId === p.id} className="flex items-center gap-1 text-xs font-bold text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-lg hover:bg-red-500/20 disabled:opacity-50">
                        <X size={14} /> Reddet
                      </button>
                    </div>
                  </div>
                  {/* Vitrin hazırlık kontrol listesi (Karar #20) */}
                  <div className="mt-3 flex items-center flex-wrap gap-1.5">
                    <span className={`flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-md border ${ready ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-amber-300 border-amber-500/30 bg-amber-500/10'}`}>
                      <ListChecks size={11} /> {ready ? 'Vitrine hazır' : `${blockers.length} eksik`}
                    </span>
                    {blockers.map((b) => (
                      <span key={b.key} className="text-[10px] font-bold text-gray-400 px-2 py-1 rounded-md bg-white/5 border border-white/10">
                        {b.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Onaylı tesislerin ad/konum değişiklik talepleri (Karar #4) */}
      <section>
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
          <ArrowRightLeft size={14} /> Ad/Konum Değişiklik Talepleri ({changeRequests.length})
        </h3>
        {changeRequests.length === 0 ? (
          <div className="py-6 text-center text-gray-600 text-xs font-bold uppercase border border-dashed border-white/5 rounded-2xl">Bekleyen talep yok</div>
        ) : (
          <div className="space-y-2">
            {changeRequests.map((req) => (
              <div key={req.id} className="bg-[#161B22] border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{req.pitches?.name ?? req.pitch_id.slice(0, 8)}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {Object.entries(req.changes).map(([field, value]) => (
                      <span key={field} className="text-[10px] font-bold text-blue-300 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
                        {CHANGE_FIELD_LABELS[field] ?? field}: <span className="text-white">{String(value)}</span>
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-600 flex items-center gap-1 mt-1.5"><Clock size={10} /> {fmtDate(req.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleChangeRequest(req, true)}
                    disabled={actioningId === req.id}
                    className="flex items-center gap-1 text-xs font-bold text-green-400 border border-green-500/30 bg-green-500/10 px-3 py-2 rounded-lg hover:bg-green-500/20 disabled:opacity-50"
                  >
                    {actioningId === req.id ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Uygula
                  </button>
                  <button
                    onClick={() => handleChangeRequest(req, false)}
                    disabled={actioningId === req.id}
                    className="flex items-center gap-1 text-xs font-bold text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-lg hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <X size={14} /> Reddet
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
