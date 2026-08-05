import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { AlertTriangle, CheckCircle2, RefreshCw, Wrench } from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════════
// ACİL DURUM FRENLERİ — durum göstergesi
// ────────────────────────────────────────────────────────────────────────────
// P-0: "peki bu koruma bozulursa kim söyleyecek?"
//
// Bakım modunun sessiz bozulma yolu şudur: AÇIK KALIR. Kurucu bir akşam açar,
// kapatmayı unutur; uygulama günlerce kapalı durur ve panelde hiçbir şey
// bunu söylemez. "Kullanıcı gelmiyor" sanılır. Bu kutu onu söyler.
//
// İkinci sessiz bozulma: sürüm eşiği yanlış girilir. "En düşük sürüm"
// yayındakinin İLERİSİNE yazılırsa HERKES kilitlenir — üstelik kilidi açmak
// için yeni sürüm yayınlamak gerekmez, sadece burada fark edilmesi gerekir.
// ════════════════════════════════════════════════════════════════════════════

interface Saglik {
  bakim_acik: boolean;
  bakim_bitis: string | null;
  bakim_suresiz: boolean;
  kayit_kapali: boolean;
  en_dusuk_surum: string | null;
  onerilen_surum: string | null;
  esik_tutarsiz: boolean;
}

export const KapiDurumu: React.FC = () => {
  const [s, setS] = useState<Saglik | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    const { data, error } = await supabase.rpc('kapi_sagligi');
    if (error) setHata(error.message);
    else setS(data as Saglik);
    setYukleniyor(false);
  }, []);

  useEffect(() => { void yukle(); }, [yukle]);

  if (hata) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300 text-sm">
        Kapı durumu okunamadı: {hata}
      </div>
    );
  }

  const alarmVar = !!s && (s.bakim_acik || s.kayit_kapali || s.esik_tutarsiz);

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${
        alarmVar ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
                 : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'}`}>
        <div className="flex items-center gap-3 min-w-0">
          {alarmVar ? <Wrench size={26} className="shrink-0" /> : <CheckCircle2 size={26} className="shrink-0" />}
          <div className="min-w-0">
            <p className="font-extrabold text-lg">
              {yukleniyor ? 'Yükleniyor…'
                : s?.bakim_acik ? 'BAKIM MODU AÇIK — uygulama kapalı'
                : alarmVar ? 'Dikkat gerektiren ayar var'
                : 'Uygulama herkese açık'}
            </p>
            <p className="text-xs opacity-80">
              {s?.bakim_acik
                ? 'Kullanıcılar hiçbir ekranı açamıyor. Kapatmayı unutma.'
                : 'Bakım kapalı, kayıt açık, sürüm eşikleri tutarlı.'}
            </p>
          </div>
        </div>
        <button onClick={yukle} disabled={yukleniyor}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2 shrink-0">
          <RefreshCw size={14} className={yukleniyor ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      {s?.bakim_suresiz && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">
            <b>Bakımın bitiş saati yok.</b> Kendiliğinden kapanmaz — elle kapatman
            gerekir. Planlı bir çalışmaysa bitiş saati gir, unutulma riski kalmasın.
          </p>
        </div>
      )}

      {s?.esik_tutarsiz && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">
            <b>Sürüm eşikleri ters.</b> "En düşük sürüm" ({s.en_dusuk_surum}),
            "önerilen sürüm"den ({s.onerilen_surum}) büyük. Bu hâlde herkes
            zorunlu güncelleme ekranına düşer.
          </p>
        </div>
      )}

      {s?.kayit_kapali && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200">
            <b>Yeni kayıt kapalı.</b> Uygulamayı indiren yeni kimse hesap açamıyor.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
          <p className="text-gray-500">En düşük sürüm</p>
          <p className="text-white font-bold">{s?.en_dusuk_surum ?? 'ayarlanmadı'}</p>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
          <p className="text-gray-500">Önerilen sürüm</p>
          <p className="text-white font-bold">{s?.onerilen_surum ?? 'ayarlanmadı'}</p>
        </div>
      </div>

      <p className="text-[11px] text-gray-500">
        "En düşük sürüm"ün altındaki uygulamalar kapatılamaz Güncelle ekranı görür.
        "Önerilen sürüm"ün altındakiler kapatılabilir bir şerit görür. Boş bırakılan
        kademe çalışmaz. Sunucuya ulaşılamadığında uygulama NORMAL açılır —
        kesinti kimseyi kilitlemez.
      </p>
    </div>
  );
};

export default KapiDurumu;
