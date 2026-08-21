/**
 * ÖDEME KURULUŞU (PSP) MALİYET PANELİ — kurucu isteği (20 Ağu 2026):
 * "Finans merkezinde ödeme sağlayıcısı kuruluşa giden parayı da göster."
 *
 * Kaynak: admin_psp_costs → intent.raw->psp (iyzico auth cevabındaki gerçek
 * kesintiler; 19 Ağu 2026'dan beri her tahsilatta yazılıyor). Panelin cevabı
 * tek cümledir: "iyzico'ya ne kadar gitti ve bizim eklediğimiz kart işlem
 * bedeli bu maliyeti karşılıyor mu?"
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Landmark, Loader2, RefreshCw, TrendingDown, TrendingUp, Info } from 'lucide-react';
import { fetchPspCostsAdmin, toTurkishAdminError, type PspCosts } from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { DataTable } from './DataTable';

const fmt = (n: number) => `₺${Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

const RANGES = [7, 30, 90] as const;

export const PspCostPanel: React.FC = () => {
  const { error: toastError } = useAdminToast();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<PspCosts | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      setData(await fetchPspCostsAdmin(d));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(days); }, [days, load]);

  const t = data?.totals;
  const farkPozitif = (t?.fark ?? 0) >= 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-gray-500 leading-relaxed max-w-2xl">
          Gerçek kart tahsilatlarında (İYZİCO) ödeme kuruluşunun kestiği komisyon + işlem bedeli.
          Rakamlar kuruluşun kendi cevabından gelir (intent.raw→psp) — mutabakatın çıpası budur.
        </p>
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              className={`px-3 h-8 rounded-lg text-[10px] font-extrabold border transition-colors ${
                days === r ? 'bg-white/10 border-white/25 text-white' : 'border-white/10 text-gray-500 hover:text-white'
              }`}
            >
              {r} gün
            </button>
          ))}
          <button type="button" onClick={() => void load(days)} className="w-8 h-8 rounded-lg border border-white/10 text-gray-400 hover:text-white flex items-center justify-center">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="py-12 text-center text-gray-500 text-sm flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Yükleniyor…</p>
      ) : !t ? (
        <p className="py-12 text-center text-gray-500 text-sm">Veri okunamadı.</p>
      ) : (
        <>
          {/* Özet kartları */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-xl p-4">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Karttan Çekilen</p>
              <p className="text-lg font-extrabold mt-1 text-white font-mono">{fmt(t.cekilen)}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">{t.gercek_islem} gerçek işlem</p>
            </div>
            <div className="bg-[#161B22]/60 border border-red-500/15 rounded-xl p-4">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Landmark size={10} /> Kuruluşa Giden</p>
              <p className="text-lg font-extrabold mt-1 text-red-400 font-mono">{fmt(t.psp_kesinti)}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">iyzico komisyon + sabit bedel</p>
            </div>
            <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-xl p-4">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Bize Ödenecek Net</p>
              <p className="text-lg font-extrabold mt-1 text-blue-300 font-mono">{fmt(t.psp_net)}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">kuruluşun beyan ettiği</p>
            </div>
            <div className="bg-[#161B22]/60 border border-amber-500/15 rounded-xl p-4">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Kart Bedeli Gelirimiz</p>
              <p className="text-lg font-extrabold mt-1 text-amber-300 font-mono">{fmt(t.kart_bedeli)}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">fiyata eklediğimiz işlem bedeli</p>
            </div>
            <div className={`bg-[#161B22]/60 border rounded-xl p-4 ${farkPozitif ? 'border-green-500/20' : 'border-red-500/30'}`}>
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                {farkPozitif ? <TrendingUp size={10} className="text-green-400" /> : <TrendingDown size={10} className="text-red-400" />} Fark
              </p>
              <p className={`text-lg font-extrabold mt-1 font-mono ${farkPozitif ? 'text-green-400' : 'text-red-400'}`}>
                {t.fark >= 0 ? '+' : ''}{fmt(t.fark)}
              </p>
              <p className="text-[9px] text-gray-600 mt-0.5">
                {farkPozitif ? 'bedel, kuruluş maliyetini karşılıyor' : 'bedel maliyeti KARŞILAMIYOR'}
              </p>
            </div>
          </div>

          {/* Kapsama dürüstlüğü */}
          {(t.psp_verisiz > 0 || t.simulasyon_islem > 0) && (
            <div className="flex items-start gap-2 bg-black/25 border border-white/[0.06] rounded-xl px-4 py-3">
              <Info size={13} className="text-gray-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-gray-500 leading-relaxed">
                {t.psp_verisiz > 0 && <>Gerçek işlemlerin <b className="text-gray-300">{t.psp_verisiz}</b> adedinde kuruluş verisi yok
                (19 Ağustos 2026 öncesi tahsilatlar) — o satırlar kesinti toplamına girmez. </>}
                {t.simulasyon_islem > 0 && <>Ayrıca <b className="text-gray-300">{t.simulasyon_islem}</b> simülasyon işlemi bu panelin dışındadır (gerçek para akmadı).</>}
              </p>
            </div>
          )}

          {/* Günlük kırılım */}
          <DataTable
            columns={[
              { header: 'Gün', render: (r: PspCosts['days'][number]) => <span className="text-[11px] font-mono text-gray-300">{new Date(r.gun).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', weekday: 'short' })}</span> },
              { header: 'İşlem', render: (r: PspCosts['days'][number]) => <span className="text-[11px] font-bold text-white">{r.islem}</span> },
              { header: 'Çekilen', render: (r: PspCosts['days'][number]) => <span className="text-[11px] font-mono text-white">{fmt(r.cekilen)}</span> },
              { header: 'Kuruluşa Giden', render: (r: PspCosts['days'][number]) => <span className="text-[11px] font-mono text-red-400">{fmt(r.psp_kesinti)}</span> },
              { header: 'Bize Net', render: (r: PspCosts['days'][number]) => <span className="text-[11px] font-mono text-blue-300">{fmt(r.psp_net)}</span> },
              { header: 'Kart Bedeli', render: (r: PspCosts['days'][number]) => <span className="text-[11px] font-mono text-amber-300">{fmt(r.kart_bedeli)}</span> },
              { header: 'Gün Farkı', render: (r: PspCosts['days'][number]) => {
                const f = r.kart_bedeli - r.psp_kesinti;
                return <span className={`text-[11px] font-mono font-bold ${f >= 0 ? 'text-green-400' : 'text-red-400'}`}>{f >= 0 ? '+' : ''}{fmt(f)}</span>;
              } },
            ]}
            data={data?.days ?? []}
            loading={loading}
            emptyMessage="Bu aralıkta gerçek kart tahsilatı yok"
          />
        </>
      )}
    </div>
  );
};
