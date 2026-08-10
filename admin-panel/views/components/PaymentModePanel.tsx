import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, LockOpen, Search, TriangleAlert } from 'lucide-react';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchPitchPaymentModes,
  setPitchPaymentMode,
  toTurkishAdminError,
} from '../../services/adminService';
import type { AdminPitchPaymentMode, PaymentMode } from '../../../types';

const MODES: { value: PaymentMode; label: string }[] = [
  { value: 'CASH_ONLY', label: 'Sahada Ödeme' },
  { value: 'ONLINE_ONLY', label: 'Online Ödeme' },
  { value: 'HYBRID', label: 'Oyuncu Seçsin' },
];

const MODE_TONE: Record<PaymentMode, string> = {
  CASH_ONLY: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  ONLINE_ONLY: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  HYBRID: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
};

const modeLabel = (m: PaymentMode) => MODES.find((x) => x.value === m)?.label ?? m;

/**
 * Tesis bazlı ödeme modu yönetimi.
 *
 * Global mod bir TAVAN olduğu için tesisin TERCİHİ (`pitch_mode`) ile FİİLÎ
 * durumu (`effective_mode`) ayrışabilir. Bu panel farkı gizlemez — ayrıştığında
 * uyarı gösterir ki yönetici "neden online görünmüyor?" sorusunu panelden
 * cevaplayabilsin.
 */
export const PaymentModePanel: React.FC = () => {
  const { success, error: toastError } = useAdminToast();
  const [rows, setRows] = useState<AdminPitchPaymentMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await fetchPitchPaymentModes());
    } catch (err) {
      setLoadError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (row: AdminPitchPaymentMode, mode: PaymentMode, locked?: boolean) => {
    setSavingId(row.pitch_id);
    try {
      await setPitchPaymentMode(row.pitch_id, mode, locked);
      // Etkin mod sunucuda hesaplanıyor — yerel tahmin yerine tabloyu tazele.
      await load();
      success(`${row.pitch_name} güncellendi`);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.pitch_name.toLocaleLowerCase('tr').includes(q) ||
        (r.district ?? '').toLocaleLowerCase('tr').includes(q),
    );
  }, [rows, query]);

  const divergent = rows.filter((r) => r.pitch_mode !== r.effective_mode).length;

  return (
    <section className="bg-surface-1/60 border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
        <h3 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
          Tesis Bazlı Ödeme Modu
        </h3>
        {rows.length > 0 && (
          <span className="text-[10px] text-gray-500">{rows.length} tesis</span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
        Her tesisin ödeme modunu buradan değiştirebilir veya <b>kilitleyebilirsin</b>. Kilitliyken saha
        sahibi kendi panelinden modu değiştiremez. <b>Platform Ödeme Modu</b> bir tavandır: yukarıdaki
        global anahtar <i>Sahada Ödeme</i> iken hiçbir tesiste online ödeme açılmaz.
      </p>

      {divergent > 0 && (
        <div className="flex items-start gap-2 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl p-3 mb-4">
          <TriangleAlert size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            <b>{divergent} tesiste</b> seçilen mod ile fiilî mod farklı. Sebebi genelde global tavan ya
            da ödeme sağlayıcısının henüz canlı olmamasıdır.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-500 text-xs py-6">Tesisler yükleniyor…</p>
      ) : loadError ? (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-center">
          <p className="text-xs text-red-400 font-bold mb-3">{loadError}</p>
          <button
            onClick={() => void load()}
            className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-[11px] font-bold hover:bg-red-500/20"
          >
            Tekrar dene
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center text-gray-500 text-xs py-6">Henüz tesis yok.</p>
      ) : (
        <>
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tesis veya ilçe ara…"
              className="w-full h-9 bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 text-xs text-white focus:border-cyan-500/40 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            {filtered.map((row) => {
              const busy = savingId === row.pitch_id;
              const diverges = row.pitch_mode !== row.effective_mode;
              return (
                <div
                  key={row.pitch_id}
                  className="flex items-center justify-between gap-3 bg-black/30 border border-white/[0.06] rounded-xl p-3 flex-wrap"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{row.pitch_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {row.district && (
                        <span className="text-[10px] text-gray-500">{row.district}</span>
                      )}
                      <span
                        className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${MODE_TONE[row.effective_mode]}`}
                      >
                        FİİLÎ: {modeLabel(row.effective_mode).toLocaleUpperCase('tr')}
                      </span>
                      {diverges && (
                        <span className="text-[9px] text-amber-400/80">
                          (seçili: {modeLabel(row.pitch_mode)})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={row.pitch_mode}
                      disabled={busy}
                      onChange={(e) => void apply(row, e.target.value as PaymentMode)}
                      className="h-9 bg-black/40 border border-white/10 rounded-lg px-2 text-[11px] text-white focus:border-cyan-500/40 focus:outline-none disabled:opacity-40"
                    >
                      {MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void apply(row, row.pitch_mode, !row.locked)}
                      title={
                        row.locked
                          ? 'Kilidi aç — saha sahibi modu değiştirebilsin'
                          : 'Kilitle — saha sahibi modu değiştiremesin'
                      }
                      className={`h-9 w-9 grid place-items-center rounded-lg border disabled:opacity-40 ${
                        row.locked
                          ? 'bg-red-500/15 text-red-300 border-red-500/25'
                          : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {row.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-gray-600 text-[11px] py-4">Eşleşen tesis yok.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
};
