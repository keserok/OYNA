import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet, RefreshCw, AlertTriangle, CheckCircle2, Clock, Undo2, Ban, Loader2,
} from 'lucide-react';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchKaporaOzeti, forceRefundIntentAdmin, toTurkishAdminError,
  type KaporaOzeti, type KaporaSatiri,
} from '../../services/adminService';

/**
 * KAPORA PANELİ — kurucu isteği (19 Ağustos 2026):
 *   "Uygulamadan yapılan kapora ödemelerinin admin panelinden çok net görünmesi
 *    şart."
 *   "İptal edilme durumunda admin panelinden maç kapora iptali olarak gözüksün.
 *    Ve iadeyi manuel gerçekleştirelim."
 *
 * İKİ İŞİ VAR:
 *   1. Tahsil edilen kaporaları kırılımıyla göstermek — kim, hangi maç için, ne
 *      kadar ödedi; bunun ne kadarı hizmet tabanı, ne kadarı kart bedeli, ne
 *      kadarı yuvarlama farkı.
 *   2. İadesi bekleyen kaporaları İŞ KUYRUĞU olarak sunmak. Sistem artık
 *      kendiliğinden iade geçmiyor; parayı bu ekrandan insan gönderiyor.
 */

/** Kapora durumlarının Türkçesi ve rengi. Ham İngilizce kod ekrana çıkmaz. */
const DURUM: Record<string, { etiket: string; renk: string; ikon: React.ReactNode }> = {
  AWAITING_PAYMENT: {
    etiket: 'Ödeme bekliyor',
    renk: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    ikon: <Clock size={13} />,
  },
  BLOCKED: {
    etiket: 'Tahsil edildi',
    renk: 'text-green-400 bg-green-500/10 border-green-500/20',
    ikon: <CheckCircle2 size={13} />,
  },
  CAPTURED: {
    etiket: 'Maça mahsup edildi',
    renk: 'text-green-400 bg-green-500/10 border-green-500/20',
    ikon: <CheckCircle2 size={13} />,
  },
  REFUND_PENDING: {
    etiket: 'İADE BEKLİYOR',
    renk: 'text-red-400 bg-red-500/10 border-red-500/25',
    ikon: <AlertTriangle size={13} />,
  },
  REFUNDED: {
    etiket: 'İade edildi',
    renk: 'text-gray-400 bg-white/5 border-white/10',
    ikon: <Undo2 size={13} />,
  },
  VOIDED: {
    etiket: 'İptal',
    renk: 'text-gray-400 bg-white/5 border-white/10',
    ikon: <Ban size={13} />,
  },
};

const para = (n: number | null | undefined): string =>
  n == null ? '—' : `${Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

const tarih = (s: string | null): string =>
  s ? new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const SUZGECLER: Array<{ id: string | null; etiket: string }> = [
  { id: 'REFUND_PENDING', etiket: 'İade bekleyenler' },
  { id: null, etiket: 'Hepsi' },
  { id: 'BLOCKED', etiket: 'Tahsil edilmiş' },
  { id: 'AWAITING_PAYMENT', etiket: 'Ödeme bekleyen' },
  { id: 'REFUNDED', etiket: 'İade edilmiş' },
];

export const KaporaPanel: React.FC = () => {
  const { error: toastError, success: toastSuccess } = useAdminToast();
  const [veri, setVeri] = useState<KaporaOzeti>({ satirlar: [], ozet: {} });
  const [suzgec, setSuzgec] = useState<string | null>('REFUND_PENDING');
  const [yukleniyor, setYukleniyor] = useState(true);
  // Hangi satırın iadesi gönderiliyor — çift tıklamayı ve çifte iadeyi keser.
  const [gonderilen, setGonderilen] = useState<string | null>(null);

  const yukle = useCallback(async (d: string | null) => {
    setYukleniyor(true);
    try {
      setVeri(await fetchKaporaOzeti(d ?? undefined));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setYukleniyor(false);
    }
  }, [toastError]);

  useEffect(() => { void yukle(suzgec); }, [suzgec, yukle]);

  const bekleyenSayisi = veri.ozet.REFUND_PENDING?.adet ?? 0;
  const bekleyenTutar = veri.ozet.REFUND_PENDING?.tutar ?? 0;

  const tahsilEdilen = useMemo(() => {
    const b = veri.ozet.BLOCKED ?? { adet: 0, tutar: 0 };
    const c = veri.ozet.CAPTURED ?? { adet: 0, tutar: 0 };
    return { adet: b.adet + c.adet, tutar: b.tutar + c.tutar };
  }, [veri.ozet]);

  const iadeEt = async (satir: KaporaSatiri) => {
    if (!satir.niyet_id) {
      toastError('Bu maçta tahsil edilmiş bir ödeme yok — iade edilecek para bulunmuyor.');
      return;
    }
    const onay = window.confirm(
      `${satir.kaptan ?? 'Kaptan'} kişisine ${para(satir.cekilen)} iade edilecek.\n\n` +
      `Maç: ${satir.mac_adi ?? '—'}\nSebep: ${satir.iade_sebebi ?? 'Maç iptali'}\n\n` +
      'Para karta gönderilecek. Onaylıyor musun?',
    );
    if (!onay) return;

    setGonderilen(satir.niyet_id);
    try {
      await forceRefundIntentAdmin(satir.niyet_id, satir.iade_sebebi ?? 'Maç kapora iptali — yönetici iadesi');
      toastSuccess(`${para(satir.cekilen)} iade kuyruğuna alındı.`);
      await yukle(suzgec);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setGonderilen(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Üst rakamlar ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={`rounded-2xl border p-4 ${bekleyenSayisi > 0
          ? 'bg-red-500/[0.06] border-red-500/25' : 'bg-white/[0.02] border-white/10'}`}>
          <p className="text-[0.65rem] font-bold tracking-wider uppercase text-gray-500 mb-1.5">
            İade bekleyen
          </p>
          <p className={`text-2xl font-extrabold tabular-nums ${bekleyenSayisi > 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {bekleyenSayisi}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 tabular-nums">{para(bekleyenTutar)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-[0.65rem] font-bold tracking-wider uppercase text-gray-500 mb-1.5">
            Tahsil edilmiş kapora
          </p>
          <p className="text-2xl font-extrabold tabular-nums text-green-400">{tahsilEdilen.adet}</p>
          <p className="text-xs text-gray-500 mt-0.5 tabular-nums">{para(tahsilEdilen.tutar)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-[0.65rem] font-bold tracking-wider uppercase text-gray-500 mb-1.5">
            Ödeme bekleyen
          </p>
          <p className="text-2xl font-extrabold tabular-nums text-amber-400">
            {veri.ozet.AWAITING_PAYMENT?.adet ?? 0}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">henüz para çekilmedi</p>
        </div>
      </div>

      {bekleyenSayisi > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 flex gap-3 items-start">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200/90 leading-relaxed">
            <strong>İade bu ekrandan elle yapılır.</strong> Sistem maç iptalinde parayı
            kendiliğinden geri göndermez; kapora “iade bekliyor”a düşer ve burada
            görünür. “İadeyi gönder”e bastığında para kullanıcının kartına gider.
          </p>
        </div>
      )}

      {/* ── Süzgeç + yenile ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {SUZGECLER.map((s) => (
          <button
            key={s.etiket}
            type="button"
            onClick={() => setSuzgec(s.id)}
            className={`h-8 px-3 rounded-lg text-xs font-bold border transition-colors ${
              suzgec === s.id
                ? 'bg-white/10 border-white/20 text-white'
                : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {s.etiket}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void yukle(suzgec)}
          disabled={yukleniyor}
          className="h-8 px-3 rounded-lg text-xs font-bold bg-white/[0.02] border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 flex items-center gap-1.5 ml-auto"
        >
          <RefreshCw size={13} className={yukleniyor ? 'animate-spin' : ''} />
          Yenile
        </button>
      </div>

      {/* ── Tablo ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[56rem]">
            <thead>
              <tr className="border-b border-white/10 text-[0.62rem] uppercase tracking-wider text-gray-500">
                <th className="text-left font-bold px-4 py-3">Maç</th>
                <th className="text-left font-bold px-4 py-3">Kaptan</th>
                <th className="text-right font-bold px-4 py-3">Çekilen</th>
                <th className="text-right font-bold px-4 py-3">Taban</th>
                <th className="text-right font-bold px-4 py-3">Kart bedeli</th>
                <th className="text-right font-bold px-4 py-3">Yuvarlama</th>
                <th className="text-left font-bold px-4 py-3">Durum</th>
                <th className="text-right font-bold px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {yukleniyor && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-xs">Yükleniyor…</td></tr>
              )}
              {!yukleniyor && veri.satirlar.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-xs">
                    {suzgec === 'REFUND_PENDING'
                      ? 'İadesi bekleyen kapora yok — kuyruk temiz.'
                      : 'Bu süzgeçte kapora kaydı yok.'}
                  </td>
                </tr>
              )}
              {veri.satirlar.map((r) => {
                const d = DURUM[r.durum] ?? { etiket: r.durum, renk: 'text-gray-400 bg-white/5 border-white/10', ikon: null };
                const iadeEdilebilir = r.durum === 'REFUND_PENDING' && !!r.niyet_id;
                return (
                  <tr key={r.mac_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white/90 truncate max-w-[16rem]">{r.mac_adi ?? 'Adsız maç'}</p>
                      <p className="text-[0.68rem] text-gray-500 truncate max-w-[16rem]">
                        {r.tesis ?? '—'} · {tarih(r.mac_saati)}
                      </p>
                      {r.iade_sebebi && (
                        <p className="text-[0.68rem] text-red-400/80 mt-0.5 truncate max-w-[16rem]">{r.iade_sebebi}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white/80 truncate max-w-[10rem]">{r.kaptan ?? '—'}</p>
                      <p className="text-[0.68rem] text-gray-500 tabular-nums">{r.kaptan_telefon ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-white/90">{para(r.cekilen)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-400">{para(r.kapora_taban)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-400">{para(r.kart_bedeli)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-400">{para(r.yuvarlama)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[0.62rem] font-bold ${d.renk}`}>
                        {d.ikon}{d.etiket}
                      </span>
                      {r.odendi && (
                        <p className="text-[0.62rem] text-gray-600 mt-1 tabular-nums">{tarih(r.odendi)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {iadeEdilebilir && (
                        <button
                          type="button"
                          onClick={() => void iadeEt(r)}
                          disabled={gonderilen === r.niyet_id}
                          className="h-8 px-3 rounded-lg text-[0.68rem] font-bold bg-red-500/10 border border-red-500/25 text-red-300 hover:bg-red-500/20 disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          {gonderilen === r.niyet_id
                            ? <><Loader2 size={12} className="animate-spin" />Gönderiliyor</>
                            : <><Undo2 size={12} />İadeyi gönder</>}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[0.68rem] text-gray-600 leading-relaxed px-1">
        <Wallet size={11} className="inline mr-1 -mt-0.5" />
        “Çekilen” kullanıcının kartından geçen toplamdır; taban tesise yazılan tutar,
        yuvarlama ise 10’un katına tamamlayan ve OYNA’da kalan farktır.
      </p>
    </div>
  );
};
