import React, { useEffect, useState, useCallback } from 'react';
import {
  Rocket,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  CreditCard,
  Scale,
  Banknote,
} from 'lucide-react';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchPaymentGoliveReadiness,
  fetchReconciliationSummary,
  fetchAppConfig,
  setAppConfig,
  toTurkishAdminError,
  fetchPayouts,
  fetchPayoutIdentityChecks,
  type PaymentGoliveCheck,
  type ReconciliationSummary,
  type AppConfigRow,
} from '../../services/adminService';

const PROVIDER_KEY = 'payment_provider';

/** Ön-uçuş kontrol anahtarlarının Türkçe başlıkları (RPC'den gelen detail metni alta yazılır). */
const CHECK_LABELS: Record<string, string> = {
  payment_provider: 'Ödeme sağlayıcısı',
  demo_mode_off: 'Demo modu kapalı',
  no_stuck_intents: 'Askıda ödeme yok',
  pending_payouts: 'Bekleyen ödeme talepleri',
  commission_configured: 'Komisyon oranı tanımlı',
  readonly_mode_off: 'Sistem yazılabilir (acil durdurma kapalı)',
};

/** ₺ biçimlendir — tutarlar kuruş değil, TL varsayılır. */
function formatTry(n: number | null | undefined): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return `₺${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCount(n: number | null | undefined): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return v.toLocaleString('tr-TR');
}

interface ReconRow {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'green' | 'red' | 'amber';
}

/**
 * Finans ekranına gömülen bağımsız panel: gerçek ödemeye geçiş ön-uçuş kontrolü,
 * ödeme sağlayıcısı (SIMULATION ↔ IYZICO) iki adımlı değişimi ve son 30 günlük
 * mutabakat özeti. Router / PageShell kullanmaz — yalnızca <section> kartları döner.
 */
export const FinanceGoLivePanel: React.FC = () => {
  const { success, error: toastError } = useAdminToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [checks, setChecks] = useState<PaymentGoliveCheck[]>([]);
  const [providerRow, setProviderRow] = useState<AppConfigRow | null>(null);
  const [recon, setRecon] = useState<ReconciliationSummary | null>(null);

  // F5.7: cashout (para çekme) açılış hazırlığı — bayrak + bekleyen talep +
  // kimliği doğrulanmamış talep sayısı tek yerde görünsün ki açma kararı
  // körlemesine verilmesin.
  const [cashoutCfg, setCashoutCfg] = useState<{ enabled: boolean; feePct: number; min: number; requireIdentity: boolean } | null>(null);
  const [cashoutPending, setCashoutPending] = useState(0);
  const [cashoutIdentityGaps, setCashoutIdentityGaps] = useState(0);

  const [refreshing, setRefreshing] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  // İki adımlı onay: hangi hedefe geçileceği bekliyor ('IYZICO' | 'SIMULATION' | null)
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [c, cfg, r] = await Promise.all([
        fetchPaymentGoliveReadiness(),
        fetchAppConfig(),
        fetchReconciliationSummary(),
      ]);
      setChecks(c);
      setProviderRow(cfg.find((row) => row.key === PROVIDER_KEY) ?? null);
      setRecon(r);

      // F5.7: cashout hazırlığı
      const cfgVal = (key: string) => cfg.find((row) => row.key === key)?.value;
      setCashoutCfg({
        enabled: cfgVal('wallet_cashout_enabled') === true,
        feePct: Number(cfgVal('wallet_cashout_fee_pct') ?? 10),
        min: Number(cfgVal('wallet_cashout_min') ?? 100),
        requireIdentity: cfgVal('wallet_cashout_require_identity') !== false,
      });
      try {
        const [payouts, idChecks] = await Promise.all([fetchPayouts(), fetchPayoutIdentityChecks('PENDING')]);
        const cashouts = payouts.filter((p) => p.payout_type === 'WALLET_CASHOUT');
        setCashoutPending(cashouts.filter((p) => p.status === 'PENDING' || p.status === 'PROCESSING').length);
        // Kimliği doğrulanmamış VEYA IBAN sahibi adı tutmayan bekleyen talepler
        setCashoutIdentityGaps(
          idChecks.filter((c) => c.identity_status !== 'VERIFIED' || c.name_match === false).length,
        );
      } catch {
        // hazırlık kartı bilgilendirme amaçlı — ana panel yüklenmesini bloklamaz
      }
    } catch (err) {
      setLoadError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshChecks = useCallback(async () => {
    setRefreshing(true);
    try {
      const c = await fetchPaymentGoliveReadiness();
      setChecks(c);
      success('Ön-uçuş kontrolü yenilendi');
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setRefreshing(false);
    }
  }, [success, toastError]);

  const provider = typeof providerRow?.value === 'string' ? providerRow.value : 'SIMULATION';
  const isLive = provider === 'IYZICO';
  const targetProvider = isLive ? 'SIMULATION' : 'IYZICO';

  const okCount = checks.filter((c) => c.ok).length;
  const totalCount = checks.length;
  const allOk = totalCount > 0 && okCount === totalCount;

  // IYZICO'ya geçiş sadece tüm kontroller yeşilse mümkün; SIMULATION'a dönüş her zaman serbest.
  const canSwitch = targetProvider === 'SIMULATION' ? true : allOk;

  const applyProvider = async (target: string) => {
    if (providerRow == null) {
      toastError('Ödeme sağlayıcısı parametresi bulunamadı');
      return;
    }
    setSavingProvider(true);
    try {
      await setAppConfig(PROVIDER_KEY, target);
      setProviderRow({ ...providerRow, value: target });
      setPendingTarget(null);
      success(
        target === 'IYZICO'
          ? 'Gerçek ödeme moduna (IYZICO) geçildi'
          : 'Test moduna (SIMULATION) geçildi',
      );
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSavingProvider(false);
    }
  };

  const reconRows: ReconRow[] = recon
    ? [
        { label: 'Tahsilat adedi', value: formatCount(recon.captured_count) },
        { label: 'Brüt tahsilat', value: formatTry(recon.gross_captured), tone: 'green' },
        { label: 'Toplam komisyon (OYNA)', value: formatTry(recon.total_commission), tone: 'amber' },
        { label: 'Saha sahibi payı', value: formatTry(recon.owner_share) },
        { label: 'Rezervasyon ödemeleri', value: formatTry(recon.booking_payments) },
        {
          label: 'İade adedi',
          value: formatCount(recon.refunded_count),
          hint: formatTry(recon.refunded_sum),
          tone: recon.refunded_count > 0 ? 'red' : 'default',
        },
        // Defter satırları artık YALNIZ hakediştir (tüketici cüzdanı kapalı;
        // eski TOP_UP/REFUND_CREDIT kayıtları tarihsel olarak duruyor).
        { label: 'Hakediş defteri — bekleyen', value: formatTry(recon.wallet_pending) },
        { label: 'Hakediş defteri — tamamlanan', value: formatTry(recon.wallet_completed) },
        { label: 'Ödeme talebi (payout)', value: formatTry(recon.payout_requested) },
        { label: 'Ödenen (payout)', value: formatTry(recon.payout_completed), tone: 'green' },
      ]
    : [];

  const toneClass = (tone?: ReconRow['tone']): string => {
    switch (tone) {
      case 'green':
        return 'text-green-400';
      case 'red':
        return 'text-red-400';
      case 'amber':
        return 'text-amber-400';
      default:
        return 'text-white';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-40 bg-[#161B22]/60 border border-white/[0.06] rounded-2xl animate-pulse" />
        <div className="h-32 bg-[#161B22]/60 border border-white/[0.06] rounded-2xl animate-pulse" />
        <div className="h-48 bg-[#161B22]/60 border border-white/[0.06] rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 text-center">
        <p className="text-sm text-red-400 font-bold mb-1">Ödeme verileri yüklenemedi</p>
        <p className="text-xs text-gray-500 mb-4">{loadError}</p>
        <button
          onClick={() => void load()}
          className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold hover:bg-red-500/20"
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1) Gerçek Ödemeye Geçiş — Ön-Uçuş */}
      <section className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
              <Rocket size={18} className="text-cyan-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-white">Gerçek Ödemeye Geçiş — Ön-Uçuş</h3>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                Gerçek para çekmeye başlamadan önce tamamlanması gereken hazırlık adımları.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshChecks()}
            disabled={refreshing}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-gray-300 disabled:opacity-40"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>

        {/* Özet rozet */}
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 mb-4 border ${
            allOk
              ? 'bg-green-500/[0.06] border-green-500/15'
              : 'bg-amber-500/[0.06] border-amber-500/15'
          }`}
        >
          {allOk ? (
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
          ) : (
            <ShieldAlert size={16} className="text-amber-400 shrink-0" />
          )}
          <p className={`text-xs font-extrabold ${allOk ? 'text-green-400' : 'text-amber-400'}`}>
            {okCount}/{totalCount} hazır
          </p>
          <p className="text-[11px] text-gray-500">
            {allOk
              ? 'Tüm kontroller tamam — gerçek ödemeye geçilebilir.'
              : 'Eksik adımlar var — tamamlanmadan gerçek ödemeye geçilemez.'}
          </p>
        </div>

        {totalCount === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">Kontrol listesi boş.</p>
        ) : (
          <div className="space-y-2">
            {checks.map((c) => (
              <div
                key={c.check_key}
                className="flex items-start gap-3 bg-black/30 border border-white/[0.06] rounded-xl px-4 py-3"
              >
                {c.ok ? (
                  <span className="shrink-0 w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-extrabold mt-0.5">
                    ✓
                  </span>
                ) : (
                  <span className="shrink-0 w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-extrabold mt-0.5">
                    ✗
                  </span>
                )}
                <div className="min-w-0">
                  <p className={`text-xs font-bold ${c.ok ? 'text-white' : 'text-red-400'}`}>
                    {CHECK_LABELS[c.check_key] ?? c.check_key}
                  </p>
                  {c.detail && (
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{c.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2) Ödeme Sağlayıcısı */}
      <section className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
            <CreditCard size={18} className="text-cyan-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-white">Ödeme Sağlayıcısı</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              Uygulamanın ödeme altyapısını test (SIMULATION) ve gerçek (IYZICO) modu arasında değiştirir.
            </p>
          </div>
        </div>

        {providerRow == null ? (
          <p className="text-xs text-amber-400 bg-amber-500/[0.06] border border-amber-500/15 rounded-xl px-4 py-3">
            Ödeme sağlayıcısı parametresi ({PROVIDER_KEY}) bulunamadı. Sistem parametrelerinden tanımlanmalı.
          </p>
        ) : (
          <>
            {/* Mevcut durum rozeti */}
            <div className="flex items-center justify-between gap-4 bg-black/30 border border-white/[0.06] rounded-xl px-4 py-3 mb-3">
              <span className="text-xs font-bold text-gray-400">Aktif sağlayıcı</span>
              <span
                className={`px-3 py-1 rounded-lg text-xs font-extrabold ${
                  isLive ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                {isLive ? 'IYZICO (GERÇEK)' : 'SIMULATION (TEST)'}
              </span>
            </div>

            {/* SIMULATION uyarısı */}
            {!isLive && (
              <div className="flex items-start gap-2 bg-amber-500/[0.06] border border-amber-500/15 rounded-xl px-4 py-3 mb-4">
                <ShieldAlert size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-400/90 leading-relaxed">
                  <b>Test modu</b> aktif — gerçek para çekilmez, ödemeler taklit edilir. Yayına almadan önce
                  yukarıdaki ön-uçuş kontrollerini tamamlayın.
                </p>
              </div>
            )}

            {/* IYZICO için tüm kontroller yeşil değilse engelle uyarısı */}
            {!isLive && !allOk && (
              <div className="flex items-start gap-2 bg-red-500/[0.05] border border-red-500/20 rounded-xl px-4 py-3 mb-4">
                <XCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-400 leading-relaxed">
                  Gerçek ödemeye (IYZICO) geçiş için <b>{okCount}/{totalCount}</b> kontrol yeterli değil.
                  Tüm adımlar yeşil olmadan bu geçiş yapılamaz.
                </p>
              </div>
            )}

            {/* İki adımlı onay */}
            {pendingTarget == null ? (
              <button
                type="button"
                disabled={!canSwitch || savingProvider}
                onClick={() => setPendingTarget(targetProvider)}
                className={`w-full px-4 py-3 rounded-xl text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed ${
                  targetProvider === 'IYZICO'
                    ? 'bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25'
                }`}
              >
                {targetProvider === 'IYZICO'
                  ? 'Gerçek ödemeye geç (IYZICO)'
                  : 'Test moduna dön (SIMULATION)'}
              </button>
            ) : (
              <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-4">
                <p className="text-xs font-bold text-white mb-1">Emin misiniz?</p>
                <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                  {pendingTarget === 'IYZICO'
                    ? 'Bu işlemden sonra kullanıcılardan GERÇEK PARA çekilmeye başlanır. Tüm ön-uçuş kontrollerinin tamam olduğundan emin olun.'
                    : 'Sağlayıcı test moduna (SIMULATION) alınır. Gerçek para çekme durur.'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingProvider}
                    onClick={() => void applyProvider(pendingTarget)}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-extrabold disabled:opacity-40 ${
                      pendingTarget === 'IYZICO'
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                    }`}
                  >
                    {savingProvider ? 'Kaydediliyor…' : 'Evet, onaylıyorum'}
                  </button>
                  <button
                    type="button"
                    disabled={savingProvider}
                    onClick={() => setPendingTarget(null)}
                    className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-gray-300 disabled:opacity-40"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* F5.7 — Cashout (para çekme) açılış hazırlığı */}
      <section className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center">
            <Banknote size={18} className="text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-white">Hakediş Ödemesi (Payout) Hazırlığı</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              Tesis · kaleci · hakem hakedişinin banka hesabına aktarımı. Otomatik havale
              entegrasyonu yoktur: talep onaylandığında transferi banka üzerinden ELLE yapıp
              referansı Payout Talepleri ekranına girersiniz.
              <br />
              <b className="text-amber-300">Tüketici cüzdanı 17 Ağustos 2026'da kapatıldı</b> — oyuncu
              bakiye tutmaz, dolayısıyla "cüzdandan çekim" diye bir yol da yoktur. Aşağıdaki
              sayılar yalnız HAKEDİŞ tarafını gösterir.
            </p>
          </div>
        </div>

        {cashoutCfg == null ? (
          <p className="text-xs text-gray-500 text-center py-4">Yapılandırma okunamadı.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between gap-4 bg-black/30 border border-white/[0.06] rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-gray-400">Tüketici cüzdanı</span>
                <span className="text-sm font-extrabold text-gray-400">KAPALI (kalıcı)</span>
              </div>
              <div className="flex items-center justify-between gap-4 bg-black/30 border border-white/[0.06] rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-gray-400">Hakediş aktarımında kesinti</span>
                <span className="text-sm font-extrabold text-white">yok</span>
              </div>
              <div className="flex items-center justify-between gap-4 bg-black/30 border border-white/[0.06] rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-gray-400">Bekleyen çekim talebi</span>
                <span className={`text-sm font-extrabold ${cashoutPending > 0 ? 'text-amber-400' : 'text-white'}`}>{cashoutPending}</span>
              </div>
              <div className="flex items-center justify-between gap-4 bg-black/30 border border-white/[0.06] rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-gray-400">Kimlik/isim uyuşmazlığı</span>
                <span className={`text-sm font-extrabold ${cashoutIdentityGaps > 0 ? 'text-red-400' : 'text-green-400'}`}>{cashoutIdentityGaps}</span>
              </div>
            </div>

            <div className="mt-4 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <p className="text-[11px] text-amber-200 leading-relaxed">
                <b>Hakediş ödemeden önce:</b> iyzico sözleşmesi/KYC tamam · manuel havale prosedürü (SOP)
                yazılı · Payout Talepleri ekranında <b>Geri Al</b> butonu çalışır durumda (yanlış
                işaretlemeyi düzeltmek için) · muhasebe CSV dışa aktarımı test edilmiş.
              </p>
            </div>
          </>
        )}
      </section>

      {/* 3) Mutabakat (Son 30 gün) */}
      <section className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
            <Scale size={18} className="text-cyan-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-white">Mutabakat (Son 30 gün)</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              {recon
                ? `Dönem: ${recon.from} – ${recon.to}. Tahsilat, komisyon, saha sahibi payı, iade ve ödemeler.`
                : 'Tahsilat, komisyon, saha sahibi payı, iade ve ödemeler.'}
            </p>
          </div>
        </div>

        {recon == null ? (
          <p className="text-xs text-gray-500 text-center py-4">Mutabakat verisi yok.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {reconRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 bg-black/30 border border-white/[0.06] rounded-xl px-4 py-3"
              >
                <span className="text-xs font-bold text-gray-400 min-w-0 truncate">{row.label}</span>
                <span className="text-right shrink-0">
                  <span className={`text-sm font-extrabold ${toneClass(row.tone)}`}>{row.value}</span>
                  {row.hint && <span className="block text-[10px] text-gray-600">{row.hint}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
