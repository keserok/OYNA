import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { useAdminToast } from '../context/AdminToastContext';

// ─── D1 — Elle bakılacak maçlar ──────────────────────────────────────────────
//
// Arka planda çalışan otomatik iş bir maçı üst üste 3 kez işleyemezse onu
// buraya koyar ve BİR DAHA DENEMEZ.
//
// Neden gerekli: Eskiden aynı bozuk maç 10 dakikada bir sonsuza kadar
// deneniyordu. Daha kötüsü, maçları sonuçlandıran iş hiç hata yakalamıyordu —
// tek bir bozuk kayıt o turdaki BÜTÜN maçların sonuçlandırılmasını durduruyordu.
//
// Bu liste normalde BOŞTUR. Dolduğu gün gerçekten bakılması gerekiyor demektir.

interface Satir {
  match_id: string;
  baslik: string | null;
  basliyor: string | null;
  durum: string | null;
  deneme: number;
  son_hata: string | null;
  son_deneme: string | null;
}

export const ElleBakilacaklar: React.FC = () => {
  const { success, error: toastError } = useAdminToast();
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [islenen, setIslenen] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    try {
      const { data, error } = await supabase.rpc('admin_elle_bakilacaklar');
      if (error) throw error;
      setSatirlar((data ?? []) as Satir[]);
    } catch (e: any) {
      setHata(e?.message ?? 'Liste okunamadı.');
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { void yukle(); }, [yukle]);

  const tekrarDene = async (id: string, baslik: string | null) => {
    if (islenen) return;
    setIslenen(id);
    try {
      const { error } = await supabase.rpc('admin_raftan_indir', { p_match_id: id });
      if (error) throw error;
      success(`"${baslik ?? 'Maç'}" yeniden denenecek — otomatik iş bir sonraki turda alacak`);
      await yukle();
    } catch (e: any) {
      toastError(e?.message ?? 'İşlem tamamlanamadı.');
    } finally {
      setIslenen(null);
    }
  };

  return (
    <section className="bg-[#161B22] border border-white/[0.08] rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-400" />
          Elle Bakılacak Maçlar
        </h3>
        <button
          type="button"
          onClick={() => void yukle()}
          disabled={yukleniyor}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-gray-200 disabled:opacity-40"
        >
          Yenile
        </button>
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed mb-4">
        Otomatik iş bu maçları 3 kez işlemeye çalıştı, olmadı ve artık denemiyor.
        Bu liste normalde boştur.
      </p>

      {yukleniyor && <p className="text-[11px] text-gray-400">Yükleniyor…</p>}

      {hata && (
        <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {hata}
        </p>
      )}

      {!yukleniyor && !hata && satirlar.length === 0 && (
        <div className="flex items-center gap-2 text-[11px] text-emerald-300 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-3 py-2.5">
          <CheckCircle2 size={14} className="shrink-0" />
          Takılan maç yok — otomatik iş sorunsuz çalışıyor.
        </div>
      )}

      {satirlar.length > 0 && (
        <div className="space-y-2">
          {satirlar.map((s) => (
            <div key={s.match_id} className="bg-black/40 border border-amber-500/20 rounded-xl p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-white truncate">{s.baslik ?? 'Adsız maç'}</p>
                  <p className="text-[10px] font-mono text-gray-400 mt-0.5">{s.match_id}</p>
                </div>
                <span className="shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded text-amber-300 bg-amber-500/15">
                  {s.deneme} deneme
                </span>
              </div>

              {s.son_hata && (
                <p className="mt-2 text-[10px] font-mono text-red-300 bg-red-500/8 border border-red-500/15 rounded-lg px-2 py-1.5 break-words">
                  {s.son_hata}
                </p>
              )}

              <div className="flex items-center justify-between gap-3 mt-2.5">
                <span className="text-[10px] text-gray-400">
                  Durum: {s.durum ?? '—'}
                  {s.basliyor && ` · Başlangıç: ${new Date(s.basliyor).toLocaleString('tr-TR')}`}
                </span>
                <button
                  type="button"
                  disabled={islenen === s.match_id}
                  onClick={() => void tekrarDene(s.match_id, s.baslik)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-[10px] font-bold text-cyan-300 disabled:opacity-40"
                  title="Rafı temizler; otomatik iş bu maçı yeniden dener"
                >
                  <RotateCcw size={11} />
                  {islenen === s.match_id ? 'Bekle…' : 'Yeniden Dene'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
