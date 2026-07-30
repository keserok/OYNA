import React, { useEffect, useState, useCallback } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import { PageLoadingSkeleton } from '../components/PageLoadingSkeleton';
import { PaymentModePanel } from '../components/PaymentModePanel';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchAppConfig,
  setAppConfig,
  fetchFeatureFlags,
  setFeatureFlag,
  toTurkishAdminError,
  type AppConfigRow,
  type FeatureFlagRow,
} from '../../services/adminService';

const CATEGORY_LABELS: Record<string, string> = {
  MAC: 'Maç Kuralları',
  FAIRPLAY: 'Fair-Play (Güvenilirlik)',
  REZERVASYON: 'Rezervasyon',
  HESAP: 'Hesap',
  SISTEM: 'Sistem',
  ODEME: 'Ödeme',
  BILDIRIM: 'Bildirim',
  GUVENLIK: 'Güvenlik',
  HIZMET: 'Hizmet (Kaleci/Hakem)',
  GENEL: 'Genel',
};

/**
 * Sabit seçenekli (enum) metin anahtarları. Serbest metin kutusunda yazım hatası
 * yapmak sessizce geçersiz bir değer yazardı; bunlar açılır liste olarak render
 * edilir. Sunucu tarafı yine de bilinmeyen değerde güvenli tarafa düşer.
 */
const ENUM_OPTIONS: Record<string, { value: string; label: string }[]> = {
  payment_mode_global: [
    { value: 'CASH_ONLY', label: 'Sahada Ödeme (uygulama içinde para alınmaz)' },
    { value: 'ONLINE_ONLY', label: 'Online Ödeme (uygulama içinden zorunlu)' },
    { value: 'HYBRID', label: 'Hibrit (her tesis kendi modunu seçer)' },
  ],
  payment_provider: [
    { value: 'SIMULATION', label: 'SIMULATION (gerçek para çekilmez)' },
    { value: 'IYZICO', label: 'IYZICO (canlı tahsilat)' },
  ],
};

/**
 * Sistem Parametreleri — koda gömülü olan operasyonel kuralları (maç onay
 * penceresi, min-oyuncu %, fair-play eşikleri, oto-onay süresi, kapora oranı…)
 * ve modül anahtarlarını yazılımcıya ihtiyaç olmadan panelden yönetir.
 * Her değişiklik admin_set_config / admin_set_feature_flag RPC'leri ile AUDIT'lenir.
 */
export const SystemParamsPage: React.FC<{ onRefresh?: () => Promise<void> }> = () => {
  const { success, error: toastError } = useAdminToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfigRow[]>([]);
  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [c, f] = await Promise.all([fetchAppConfig(), fetchFeatureFlags()]);
      setConfig(c);
      setFlags(f);
    } catch (err) {
      setLoadError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async (row: AppConfigRow, raw: string | boolean) => {
    let value: unknown;
    if (row.value_type === 'number') {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        toastError('Geçerli bir sayı girin');
        return;
      }
      if (row.min_value != null && n < row.min_value) {
        toastError(`En az ${row.min_value} olmalı`);
        return;
      }
      if (row.max_value != null && n > row.max_value) {
        toastError(`En fazla ${row.max_value} olmalı`);
        return;
      }
      value = n;
    } else if (row.value_type === 'boolean') {
      value = Boolean(raw);
    } else {
      value = String(raw);
    }
    setSavingKey(row.key);
    try {
      await setAppConfig(row.key, value);
      setConfig((prev) => prev.map((r) => (r.key === row.key ? { ...r, value } : r)));
      success(`${row.label} kaydedildi`);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSavingKey(null);
    }
  };

  const toggleFlag = async (row: FeatureFlagRow) => {
    setSavingKey(row.key);
    try {
      await setFeatureFlag(row.key, !row.enabled);
      setFlags((prev) => prev.map((r) => (r.key === row.key ? { ...r, enabled: !r.enabled } : r)));
      success(`${row.label} ${!row.enabled ? 'açıldı' : 'kapatıldı'}`);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSavingKey(null);
    }
  };

  const grouped = config.reduce<Record<string, AppConfigRow[]>>((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {});

  return (
    <PageShell route="SYSTEM_PARAMS" icon={<SlidersHorizontal size={20} />}>
      {loading ? (
        <PageLoadingSkeleton />
      ) : loadError ? (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 text-center">
          <p className="text-sm text-red-400 font-bold mb-1">Parametreler yüklenemedi</p>
          <p className="text-xs text-gray-500 mb-4">{loadError}</p>
          <button
            onClick={() => void load()}
            className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold hover:bg-red-500/20"
          >
            Tekrar dene
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-cyan-500/[0.04] border border-cyan-500/15 rounded-2xl p-4">
            <p className="text-[11px] text-cyan-300/80 leading-relaxed">
              Bu ekrandan uygulamanın <b>operasyonel kurallarını</b> yazılımcıya ihtiyaç duymadan
              değiştirebilirsin. Her değişiklik anında kaydedilir ve <b>denetim kaydına</b> (audit) işlenir.
            </p>
          </div>

          {Object.entries(grouped).map(([cat, rows]) => (
            <section key={cat} className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
              <h3 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-4">
                {CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rows.map((row) => (
                  <div key={row.key} className="bg-black/30 border border-white/[0.06] rounded-xl p-4">
                    <label className="text-xs font-bold text-white block mb-1">{row.label}</label>
                    {row.description && (
                      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">{row.description}</p>
                    )}
                    {row.value_type === 'boolean' ? (
                      <button
                        type="button"
                        disabled={savingKey === row.key}
                        onClick={() => void saveConfig(row, !(row.value as boolean))}
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold disabled:opacity-40 ${
                          row.value ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'
                        }`}
                      >
                        {row.value ? 'AÇIK' : 'KAPALI'}
                      </button>
                    ) : ENUM_OPTIONS[row.key] ? (
                      <select
                        value={String(row.value ?? '')}
                        disabled={savingKey === row.key}
                        onChange={(e) => void saveConfig(row, e.target.value)}
                        className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-cyan-500/40 focus:outline-none disabled:opacity-40"
                      >
                        {ENUM_OPTIONS[row.key].map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type={row.value_type === 'number' ? 'number' : 'text'}
                          defaultValue={String(row.value ?? '')}
                          min={row.min_value ?? undefined}
                          max={row.max_value ?? undefined}
                          disabled={savingKey === row.key}
                          onBlur={(e) => {
                            if (e.target.value !== String(row.value)) void saveConfig(row, e.target.value);
                          }}
                          className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-cyan-500/40 focus:outline-none transition-colors"
                        />
                        {(row.min_value != null || row.max_value != null) && (
                          <span className="text-[9px] text-gray-600 self-center whitespace-nowrap">
                            {row.min_value ?? '–'}…{row.max_value ?? '–'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}

          <PaymentModePanel />

          {flags.length > 0 && (
            <section className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
              <h3 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1">
                Modül Anahtarları
              </h3>
              <p className="text-[11px] text-gray-500 mb-4">
                Modülleri yeni sürüm gerekmeden aç/kapat. Kapsam-dışı modüller varsayılan kapalıdır.
              </p>
              <div className="space-y-2">
                {flags.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-4 bg-black/30 border border-white/[0.06] rounded-xl p-4"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">{row.label}</p>
                      {row.description && <p className="text-[11px] text-gray-500">{row.description}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={savingKey === row.key}
                      onClick={() => void toggleFlag(row)}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold shrink-0 disabled:opacity-40 ${
                        row.enabled ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'
                      }`}
                    >
                      {row.enabled ? 'AÇIK' : 'KAPALI'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
};
