import React, { useCallback, useMemo, useState } from 'react';
import { CalendarRange, Download, BarChart3 } from 'lucide-react';
import { useAdminToast } from '../context/AdminToastContext';
import { fetchAdminFinanceReport, toTurkishAdminError, type AdminFinanceReport } from '../../services/adminService';
import { downloadCsv } from '../../utils/exportCsv';

/** Yerel (cihaz saatiyle) YYYY-MM-DD — UTC kayması olmadan bugünü verir. */
function localDateISO(d = new Date()): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function firstOfMonthISO(): string {
  return `${localDateISO().slice(0, 7)}-01`;
}

const fmtTry = (n: number | null | undefined): string =>
  `₺${(typeof n === 'number' && Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * [S4] Tarih aralıklı + gün kırılımlı finans raporu (admin). Kullanıcı isteği:
 * "tüm ödemelerin seçilen tarih aralıklarında ve günlerde dahi analiz
 * edilebilmesi. Tam profesyonellik." Seçilen aralıkta toplam hacim, OYNA
 * komisyonu, saha sahibi payı, iadeler, yüklemeler, çekimler + gün-gün tablo
 * ve CSV export (muhasebe/vergi).
 */
export const FinanceReportPanel: React.FC = () => {
  const { error: toastError } = useAdminToast();
  const today = useMemo(() => localDateISO(), []);
  const [from, setFrom] = useState(firstOfMonthISO);
  const [to, setTo] = useState(localDateISO);
  const [report, setReport] = useState<AdminFinanceReport | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    if (to < from) {
      toastError('Bitiş tarihi başlangıçtan önce olamaz.');
      return;
    }
    setLoading(true);
    try {
      setReport(await fetchAdminFinanceReport(from, to));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [from, to, toastError]);

  const exportCsv = useCallback(() => {
    if (!report) return;
    const rows = report.days.map((d) => [
      d.day,
      String(d.count),
      String(d.gross),
      String(d.commission),
      String(d.owner_share),
      String(d.refunded),
      String(d.topups),
    ]);
    const t = report.totals;
    rows.push(['TOPLAM', String(t.count), String(t.gross_captured), String(t.commission), String(t.owner_share), String(t.refunded), String(report.topups)]);
    downloadCsv(
      `oyna-finans-${report.from}_${report.to}.csv`,
      ['Gun', 'Odeme Adedi', 'Brut Tahsilat', 'OYNA Komisyonu', 'Saha Sahibi Payi', 'Iade', 'Cuzdan Yukleme'],
      rows,
    );
  }, [report]);

  const activeDays = useMemo(
    () => (report ? report.days.filter((d) => d.count > 0 || d.refunded > 0 || d.topups > 0) : []),
    [report],
  );

  const summaryCards = report
    ? [
        { label: 'Brüt Tahsilat', value: fmtTry(report.totals.gross_captured), tone: 'text-green-400' },
        { label: 'OYNA Komisyonu', value: fmtTry(report.totals.commission), tone: 'text-amber-400' },
        { label: 'Saha Sahibi Payı', value: fmtTry(report.totals.owner_share), tone: 'text-white' },
        { label: 'İade', value: fmtTry(report.totals.refunded), tone: report.totals.refunded > 0 ? 'text-red-400' : 'text-gray-400' },
        { label: 'Cüzdan Yükleme', value: fmtTry(report.topups), tone: 'text-blue-400' },
        { label: 'Çekim (net)', value: fmtTry(report.cashouts?.net), tone: 'text-white' },
        { label: 'Ödenen Payout', value: fmtTry(report.payouts_completed), tone: 'text-green-400' },
        { label: 'Ödeme Adedi', value: String(report.totals.count), tone: 'text-white' },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Tarih aralığı seçici */}
      <section className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
            <CalendarRange size={18} className="text-cyan-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-white">Tarih Aralıklı Finans Raporu</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              Seçtiğiniz aralıktaki tüm platform tahsilatlarını gün-gün analiz edin, muhasebe/vergi için CSV indirin.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Başlangıç</label>
            <input
              type="date"
              value={from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Bitiş</label>
            <input
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
            />
          </div>
          <button
            type="button"
            onClick={() => void run()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 hover:bg-cyan-500/25 disabled:opacity-40"
          >
            <BarChart3 size={14} /> {loading ? 'Hazırlanıyor…' : 'Raporu Göster'}
          </button>
        </div>
      </section>

      {report && (
        <>
          {/* Özet kartları */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {summaryCards.map((c) => (
              <div key={c.label} className="bg-[#161B22]/60 border border-white/[0.06] rounded-xl p-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{c.label}</p>
                <p className={`text-base font-black mt-1 ${c.tone}`}>{c.value}</p>
              </div>
            ))}
          </section>

          {/* Gün kırılımı tablosu + CSV */}
          <section className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="text-sm font-black text-white">Gün Kırılımı</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {report.from} – {report.to} · {report.totals.count} ödeme
                </p>
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-gray-300"
              >
                <Download size={14} /> CSV İndir
              </button>
            </div>

            {activeDays.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">Bu aralıkta tahsilat/iade/yükleme yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] min-w-[560px]">
                  <thead>
                    <tr className="text-gray-500 uppercase text-[9px] font-black border-b border-white/10">
                      <th className="text-left py-2 pr-2">Gün</th>
                      <th className="text-right py-2 px-2">Adet</th>
                      <th className="text-right py-2 px-2">Brüt</th>
                      <th className="text-right py-2 px-2">Komisyon</th>
                      <th className="text-right py-2 px-2">Saha Payı</th>
                      <th className="text-right py-2 px-2">İade</th>
                      <th className="text-right py-2 pl-2">Yükleme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDays.map((d) => (
                      <tr key={d.day} className="border-b border-white/5">
                        <td className="text-left py-2 pr-2 text-gray-300 whitespace-nowrap font-mono">{d.day}</td>
                        <td className="text-right py-2 px-2 text-gray-400">{d.count}</td>
                        <td className="text-right py-2 px-2 text-white font-bold">{fmtTry(d.gross)}</td>
                        <td className="text-right py-2 px-2 text-amber-300">{fmtTry(d.commission)}</td>
                        <td className="text-right py-2 px-2 text-emerald-400 font-bold">{fmtTry(d.owner_share)}</td>
                        <td className="text-right py-2 px-2 text-red-300">{fmtTry(d.refunded)}</td>
                        <td className="text-right py-2 pl-2 text-blue-300">{fmtTry(d.topups)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/15 font-black">
                      <td className="text-left py-2 pr-2 text-white">TOPLAM</td>
                      <td className="text-right py-2 px-2 text-gray-300">{report.totals.count}</td>
                      <td className="text-right py-2 px-2 text-white">{fmtTry(report.totals.gross_captured)}</td>
                      <td className="text-right py-2 px-2 text-amber-300">{fmtTry(report.totals.commission)}</td>
                      <td className="text-right py-2 px-2 text-emerald-400">{fmtTry(report.totals.owner_share)}</td>
                      <td className="text-right py-2 px-2 text-red-300">{fmtTry(report.totals.refunded)}</td>
                      <td className="text-right py-2 pl-2 text-blue-300">{fmtTry(report.topups)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
