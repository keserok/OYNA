import React, { useState, useEffect, useCallback } from 'react';
import { Check, X, RefreshCw, AlertTriangle, Building2, Clock, ArrowRightLeft } from 'lucide-react';
import { toTurkishAdminError } from '../services/adminService';
import {
  fetchPendingChangeRequests,
  reviewPitchChangeRequest,
  type PitchChangeRequest,
} from '../../services/pitchContentService';

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

// IP-22: "Onay bekleyen tesis" kuyruğu KALDIRILDI — tesisler yönetici tarafından
// tanımlanıyor, onaylanacak bir başvuru yok. Bu ekranda kalan tek iş, tesis
// sahibinin gönderdiği ad/konum değişikliği taleplerini karara bağlamak
// (sunucudaki koruma tetikleyicisi sahibin doğrudan yazmasına izin vermiyor).
interface OwnerModerationTabProps {
  /** F5.5: bekleyen talep sayısını üst kabuğa bildirir (Doğrulama Merkezi rozeti). */
  onBadgeCount?: (n: number) => void;
}

const OwnerModerationTab: React.FC<OwnerModerationTabProps> = ({ onBadgeCount }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [changeRequests, setChangeRequests] = useState<PitchChangeRequest[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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

  useEffect(() => {
    onBadgeCount?.(changeRequests.length);
  }, [changeRequests.length, onBadgeCount]);

  const handleChangeRequest = async (req: PitchChangeRequest, approve: boolean) => {
    setActioningId(req.id);
    setError(null);
    try {
      await reviewPitchChangeRequest(req.id, approve, approve ? undefined : 'Yönetici tarafından reddedildi');
      setChangeRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      setError(toTurkishAdminError(err));
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-black/20 p-4 rounded-xl border border-white/5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-white flex items-center gap-2">
          <Building2 size={16} className="text-[#FFFF00]" /> Tesis Talepleri
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

      <div className="text-[11px] text-gray-500 leading-relaxed bg-white/[0.03] border border-white/5 rounded-xl p-3">
        Tesisler Sahalar → Kurulum Merkezi'nden eklenir ve yetkilileri oradan atanır;
        onaylanmayı bekleyen tesis diye bir kuyruk yoktur. Burada yalnız tesis sahibinin
        gönderdiği ad/konum değişikliği talepleri karara bağlanır.
      </div>

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
    </div>
  );
};

export default OwnerModerationTab;
