import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle, ShieldCheck, Clock, Timer,
} from 'lucide-react';
import { useAdminToast } from '../context/AdminToastContext';
import { fetchPaymentHealth, toTurkishAdminError, type PaymentHealth } from '../../services/adminService';

/** Değişmez anahtarlarının Türkçe açıklaması (check_money_invariants çıktısı). */
const INVARIANT_LABELS: Record<string, string> = {
  I1_wallet_mirror_mismatch: 'Cüzdan aynası tutarsız',
  I2_idempotency_dup: 'Idempotency çifti (aynı anahtar → 2 intent)',
  I3_double_topup_credit: 'Çift para-yükleme kredisi',
  I4_negative_bucket: 'Negatif cüzdan kovası',
  I5_orphan_refund: 'Yetim iade',
  I7_cashout_fee_consistency: 'Çekim kesintisi tutarsız',
};

const WINDOWS = [
  { h: 24, label: '24 saat' },
  { h: 168, label: '7 gün' },
  { h: 720, label: '30 gün' },
];

function statusTone(status: string): { bg: string; text: string; icon: React.ReactNode; label: string } {
  switch (status) {
    case 'CRITICAL':
      return { bg: 'bg-red-500/[0.06] border-red-500/20', text: 'text-red-400', icon: <XCircle size={16} className="text-red-400 shrink-0" />, label: 'KRİTİK' };
    case 'WARN':
      return { bg: 'bg-amber-500/[0.06] border-amber-500/15', text: 'text-amber-400', icon: <AlertTriangle size={16} className="text-amber-400 shrink-0" />, label: 'UYARI' };
    default:
      return { bg: 'bg-green-500/[0.06] border-green-500/15', text: 'text-green-400', icon: <CheckCircle2 size={16} className="text-green-400 shrink-0" />, label: 'SAĞLIKLI' };
  }
}

/**
 * [S4] Ödeme sağlığı paneli — TESPİT katmanı. Son N saatlik başarı oranı, anlık
 * askıda ödemeler, ortalama tahsilat süresi, para değişmezleri (G1) ve süpürücü
 * durumunu tek ekranda toplar; eşik aşımında uyarı üretir.
 */
export const PaymentHealthPanel: React.FC = () => {
  const { error: toastError } = useAdminToast();
  const [health, setHealth] = useState<PaymentHealth | null>(null);
  const [windowH, setWindowH] = useState(24);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (h: number) => {
    setLoading(true);
    try {
      setHealth(await fetchPaymentHealth(h));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(windowH); }, [load, windowH]);

  if (loading && !health) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-[#161B22]/60 border border-white/[0.06] rounded-2xl animate-pulse" />
        <div className="h-40 bg-[#161B22]/60 border border-white/[0.06] rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!health) {
    return (
      <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-6 text-center">
        <p className="text-sm text-gray-400 mb-3">Sağlık verisi yüklenemedi.</p>
        <button onClick={() => void load(windowH)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-gray-300">
          Tekrar dene
        </button>
      </div>
    );
  }

  const tone = statusTone(health.status);
  const rate = health.success_rate;
  const rateText = rate == null ? 'Yetersiz veri' : `%${rate}`;
  const rateTone = rate == null ? 'text-gray-400' : rate >= 90 ? 'text-green-400' : rate >= 75 ? 'text-amber-400' : 'text-red-400';
  const avgText = health.avg_capture_seconds == null ? '—' : `${health.avg_capture_seconds} sn`;
  const failedInvariants = Object.entries(health.invariants?.invariants ?? {}).filter(([, v]) => Number(v) > 0);

  const metricCards = [
    { label: `Başarı oranı (${health.window_hours}s)`, value: rateText, tone: rateTone, hint: `${health.succeeded} başarılı · ${health.failed} başarısız` },
    { label: 'Anlık askıda (PENDING)', value: String(health.pending_now), tone: health.pending_now > 0 ? 'text-amber-400' : 'text-green-400', hint: health.blocked_now > 0 ? `${health.blocked_now} bloke` : 'Bekleyen ödeme' },
    { label: '15 dk+ askıda', value: String(health.stale_pending), tone: health.stale_pending > 0 ? 'text-amber-400' : 'text-green-400', hint: health.sweeper_enabled ? 'Süpürücü aktif' : 'Süpürücü kapalı' },
    { label: 'Ort. tahsilat süresi', value: avgText, tone: 'text-white', hint: 'Oluşturma → tahsilat' },
  ];

  return (
    <div className="space-y-6">
      {/* Durum başlığı + pencere seçici */}
      <section className={`border rounded-2xl p-5 ${tone.bg}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
              <Activity size={18} className="text-cyan-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {tone.icon}
                <h3 className={`text-sm font-black ${tone.text}`}>Ödeme Sağlığı — {tone.label}</h3>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                Son {health.window_hours} saatlik ödeme akışının sağlık göstergeleri ve para değişmezleri.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 bg-black/30 border border-white/[0.06] rounded-lg">
              {WINDOWS.map((w) => (
                <button
                  key={w.h}
                  type="button"
                  onClick={() => setWindowH(w.h)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${windowH === w.h ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void load(windowH)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-gray-300 disabled:opacity-40"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        </div>

        {/* Uyarılar */}
        {health.alerts.length > 0 && (
          <div className="mt-4 space-y-2">
            {health.alerts.map((a, i) => (
              <div
                key={`${a.key}-${i}`}
                className={`flex items-start gap-2 rounded-xl px-4 py-2.5 border ${a.level === 'CRITICAL' ? 'bg-red-500/[0.05] border-red-500/20' : 'bg-amber-500/[0.05] border-amber-500/15'}`}
              >
                {a.level === 'CRITICAL' ? <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />}
                <p className={`text-[11px] leading-relaxed ${a.level === 'CRITICAL' ? 'text-red-400' : 'text-amber-400/90'}`}>{a.message}</p>
              </div>
            ))}
          </div>
        )}
        {health.alerts.length === 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5 bg-green-500/[0.05] border border-green-500/15">
            <CheckCircle2 size={14} className="text-green-400 shrink-0" />
            <p className="text-[11px] text-green-400/90">Tüm göstergeler eşiklerin içinde — aktif uyarı yok.</p>
          </div>
        )}
      </section>

      {/* Metrik kartları */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metricCards.map((c) => (
          <div key={c.label} className="bg-[#161B22]/60 border border-white/[0.06] rounded-xl p-4">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">{c.label}</p>
            <p className={`text-xl font-black mt-1 ${c.tone}`}>{c.value}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{c.hint}</p>
          </div>
        ))}
      </section>

      {/* Para değişmezleri (G1) */}
      <section className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
            <ShieldCheck size={18} className="text-cyan-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-white">Para Değişmezleri (G1)</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              Cüzdan aynası, idempotency, çift kredi, negatif kova, yetim iade ve çekim kesintisi denetimi.
            </p>
          </div>
        </div>
        {health.invariants?.ok && failedInvariants.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 bg-green-500/[0.06] border border-green-500/15">
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            <p className="text-xs font-bold text-green-400">Tüm değişmezler tutuyor — ledger tutarlı.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {failedInvariants.map(([key, v]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 bg-red-500/[0.05] border border-red-500/20">
                <span className="text-xs font-bold text-red-400">{INVARIANT_LABELS[key] ?? key}</span>
                <span className="text-xs font-black text-red-400">{String(v)} kayıt</span>
              </div>
            ))}
          </div>
        )}
        {/* I6 bilgi: stale-pending 6s+ */}
        {typeof health.invariants?.info?.I6_stale_pending_over_6h === 'number' && (
          <p className="text-[10px] text-gray-600 mt-3 flex items-center gap-1.5">
            <Clock size={11} /> 6 saatten uzun askıda: {health.invariants.info.I6_stale_pending_over_6h} (bilgi)
          </p>
        )}
      </section>

      <p className="text-[10px] text-gray-600 flex items-center gap-1.5">
        <Timer size={11} /> Son kontrol: {new Date(health.checked_at).toLocaleString('tr-TR')}
      </p>
    </div>
  );
};
