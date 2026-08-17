import React, { useCallback, useMemo, useState } from 'react';
import { Calendar, Download } from 'lucide-react';
import { money } from './financeUi';
import {
  ownerFinanceReport, toTurkishError, type OwnerFinanceReport,
} from '../../../services/pitchOwnerService';
import { dosyaKaydetVeyaPaylas } from '../../../utils/dosyaKaydet';

// ─── [S4 portu] Tarih aralıklı finans raporu ─────────────────────────────────
// main'deki S4.1 özelliği FI modülüne bileşen olarak taşındı: uygulama-içi
// tahsilatların gün-gün kırılımı (brüt/komisyon/net/iade) + Excel-TR CSV.
// Aylık ÖZET'in tamamlayıcısıdır: serbest tarih aralığı + yalnız APP tahsilatı.

const localDateISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const FinanceRangeReport: React.FC<{
  pitchId: string;
  notify: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}> = ({ pitchId, notify }) => {
  const today = useMemo(() => localDateISO(), []);
  const [reportFrom, setReportFrom] = useState(() => `${localDateISO().slice(0, 7)}-01`);
  const [reportTo, setReportTo] = useState(() => localDateISO());
  const [report, setReport] = useState<OwnerFinanceReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const handleRunReport = useCallback(async () => {
    if (!pitchId || pitchId.startsWith('mock-')) return;
    if (reportTo < reportFrom) {
      notify('Bitiş tarihi başlangıçtan önce olamaz.', 'error');
      return;
    }
    setReportLoading(true);
    try {
      const r = await ownerFinanceReport(pitchId, reportFrom, reportTo);
      setReport(r);
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setReportLoading(false);
    }
  }, [pitchId, reportFrom, reportTo, notify]);

  const handleDownloadCsv = useCallback(async () => {
    if (!report) return;
    const header = ['Gun', 'Odeme Adedi', 'Brut Tahsilat', 'OYNA Komisyonu', 'Net Kazanc', 'Iade'];
    const rows = report.days.map((d) => [
      d.day, String(d.count), String(d.gross), String(d.commission), String(d.owner_net), String(d.refunded),
    ]);
    const t = report.totals;
    rows.push(['TOPLAM', String(t.count), String(t.gross_captured), String(t.commission), String(t.owner_net), String(t.refunded)]);
    // UTF-8 BOM → Excel Türkçe karakter/ayraç uyumu.
    const csv = '﻿' + [header, ...rows].map((r) => r.join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    // Pakette `<a download>` sessizce çalışmaz (iOS/Android WebView) — rapor
    // dışa aktarımı ölü düğmeydi. Ortak yardımcı önce native paylaşım sayfasını
    // açar. `void` ile sonucu ATMAK, Android'de hiç oluşmayan dosya için
    // kullanıcıyı habersiz bırakıyordu; artık sonuca göre konuşuyoruz.
    const sonuc = await dosyaKaydetVeyaPaylas(blob, `oyna-finans-${report.from}_${report.to}.csv`, 'OYNA Finans Raporu');
    if (sonuc === 'PAYLASILDI') notify('Rapor paylaşıma hazır. Açılan pencereden kaydedebilirsin.', 'success');
    else if (sonuc === 'INDIRILDI') notify('Rapor indirildi.', 'success');
    else if (sonuc === 'DESTEKLENMIYOR') notify('Bu cihazda dosya kaydedilemedi. Uygulamayı güncelle veya web sürümünden dene.', 'error');
    // 'IPTAL' → kullanıcı vazgeçti; mesaj yok.
  }, [report, notify]);

  return (
    <div className="bg-[#161B22] border border-emerald-500/15 rounded-[32px] p-6">
      <h3 className="text-xs font-extrabold text-gray-400 uppercase mb-1 flex items-center gap-2">
        <Calendar size={16} className="text-emerald-400" /> TARİH ARALIKLI FİNANS RAPORU
      </h3>
      <p className="text-[11px] text-gray-500 mb-4">
        Seçtiğiniz tarih aralığındaki uygulama tahsilatlarını gün-gün analiz edin, CSV olarak indirin.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-extrabold text-gray-500 uppercase mb-1">Başlangıç</label>
          <input
            type="date"
            value={reportFrom}
            max={today}
            onChange={(e) => setReportFrom(e.target.value)}
            className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-2.5 text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-extrabold text-gray-500 uppercase mb-1">Bitiş</label>
          <input
            type="date"
            value={reportTo}
            max={today}
            onChange={(e) => setReportTo(e.target.value)}
            className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-2.5 text-white text-sm"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleRunReport}
        disabled={reportLoading}
        className="w-full py-3 bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 font-extrabold rounded-2xl text-sm disabled:opacity-50"
      >
        {reportLoading ? 'Rapor hazırlanıyor…' : 'RAPORU GÖSTER'}
      </button>

      {report && (
        <div className="mt-5">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <p className="text-[9px] text-gray-500 font-extrabold uppercase mb-1">Brüt Tahsilat</p>
              <p className="text-base font-extrabold text-white">{money(report.totals.gross_captured)}</p>
            </div>
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <p className="text-[9px] text-gray-500 font-extrabold uppercase mb-1">Net Kazanç</p>
              <p className="text-base font-extrabold text-emerald-400">{money(report.totals.owner_net)}</p>
            </div>
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <p className="text-[9px] text-gray-500 font-extrabold uppercase mb-1">OYNA Komisyonu</p>
              <p className="text-base font-extrabold text-red-300">−{money(report.totals.commission)}</p>
            </div>
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <p className="text-[9px] text-gray-500 font-extrabold uppercase mb-1">İade Edilen</p>
              <p className="text-base font-extrabold text-yellow-300">{money(report.totals.refunded)}</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            {report.from} → {report.to} · {report.totals.count} ödeme
          </p>

          {report.days.some((d) => d.count > 0 || d.refunded > 0) ? (
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-[11px] min-w-[420px]">
                <thead>
                  <tr className="text-gray-500 uppercase text-[9px] font-extrabold border-b border-white/10">
                    <th className="text-left py-2 pr-2">Gün</th>
                    <th className="text-right py-2 px-1">Adet</th>
                    <th className="text-right py-2 px-1">Brüt</th>
                    <th className="text-right py-2 px-1">Komisyon</th>
                    <th className="text-right py-2 px-1">Net</th>
                    <th className="text-right py-2 pl-1">İade</th>
                  </tr>
                </thead>
                <tbody>
                  {report.days
                    .filter((d) => d.count > 0 || d.refunded > 0)
                    .map((d) => (
                      <tr key={d.day} className="border-b border-white/5">
                        <td className="text-left py-2 pr-2 text-gray-300 whitespace-nowrap">{d.day}</td>
                        <td className="text-right py-2 px-1 text-gray-400">{d.count}</td>
                        <td className="text-right py-2 px-1 text-white font-bold">{money(d.gross)}</td>
                        <td className="text-right py-2 px-1 text-red-300">−{money(d.commission)}</td>
                        <td className="text-right py-2 px-1 text-emerald-400 font-bold">{money(d.owner_net)}</td>
                        <td className="text-right py-2 pl-1 text-yellow-300">{money(d.refunded)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">Bu aralıkta uygulama tahsilatı yok.</p>
          )}

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="mt-4 w-full py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-extrabold rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Download size={16} /> CSV İNDİR
          </button>
        </div>
      )}
    </div>
  );
};
