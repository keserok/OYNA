import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { RefreshCw, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════════
// [P-4 / K-11.4] SİSTEM SAĞLIĞI
// ────────────────────────────────────────────────────────────────────────────
// Kurucu kararı S-4 = (a): ayrı sayfa değil, Komuta Merkezi içinde bir bölüm.
// Kurucu kararı S-2 = (b): şimdilik e-posta YOK — alarm yalnız burada görünür.
//
// Her gece 06:40'ta (Istanbul) sistem kendini denetler; sonuç burada durur.
// Kural K-11.3: "kontrol edilemedi" KIRMIZI sayılır, "sorun yok" sayılmaz.
// ════════════════════════════════════════════════════════════════════════════

type Kontrol = {
  kontrol_id: string;
  yapi_tasi: string;
  durum: 'YESIL' | 'SARI' | 'KIRMIZI' | 'OLCULEMEDI';
  olculen: number | null;
  mesaj: string;
};

type Ozet = {
  hic_calismadi?: boolean;
  son_calisma?: string;
  genel_durum?: 'YESIL' | 'SARI' | 'KIRMIZI';
  yesil?: number;
  sari?: number;
  kirmizi?: number;
  kontroller?: Kontrol[];
  gecmis_30_gun?: { gun: string; kirmizi: number }[];
};

const RENK: Record<string, string> = {
  YESIL: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  SARI: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  KIRMIZI: 'text-red-400 border-red-500/40 bg-red-500/10',
  OLCULEMEDI: 'text-red-400 border-red-500/40 bg-red-500/10',
};

const ETIKET: Record<string, string> = {
  YESIL: 'Sorun yok',
  SARI: 'Dikkat',
  KIRMIZI: 'Sorun var',
  OLCULEMEDI: 'Kontrol edilemedi',
};

export const SistemSagligi: React.FC = () => {
  const [ozet, setOzet] = useState<Ozet | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [calistiriliyor, setCalistiriliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setHata(null);
    const { data, error } = await supabase.rpc('sistem_saglik_ozet');
    if (error) setHata(error.message);
    else setOzet(data as Ozet);
    setYukleniyor(false);
  }, []);

  useEffect(() => { void yukle(); }, [yukle]);

  // Elle çalıştırma: denetimi beklemeden şimdi ölç.
  //
  // [DÜZELTME] Eskiden burada doğrudan `sistem_saglik_calistir` çağrılıyordu.
  // O fonksiyon `authenticated` rolüne KAPALI (gece işi çağırıyor, kapı
  // koyulsaydı cron kırılırdı) — yani bu düğme HİÇ ÇALIŞMIYORDU.
  // Artık yönetici kapılı sarmalayıcı çağrılıyor; sarmalayıcı hem ana denetimi
  // hem EK KONTROLLERİ çalıştırıyor, böylece düğme kartın tamamını tazeliyor
  // (eskiden ek kontroller elle çalıştırmada güncellenmiyordu).
  const simdiCalistir = async () => {
    setCalistiriliyor(true);
    const { error } = await supabase.rpc('admin_sistem_saglik_calistir');
    if (error) setHata(error.message);
    await yukle();
    setCalistiriliyor(false);
  };

  if (yukleniyor) return <div className="text-gray-400 text-sm p-4">Sistem sağlığı yükleniyor…</div>;

  if (hata) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300 text-sm">
        Sistem sağlığı okunamadı: {hata}
      </div>
    );
  }

  if (ozet?.hic_calismadi) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <p className="text-amber-300 text-sm mb-3">Denetim henüz hiç çalışmadı.</p>
        <button onClick={simdiCalistir} disabled={calistiriliyor}
          className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-200 text-sm font-bold">
          {calistiriliyor ? 'Çalışıyor…' : 'Şimdi Çalıştır'}
        </button>
      </div>
    );
  }

  const genel = ozet?.genel_durum ?? 'YESIL';
  const Ikon = genel === 'YESIL' ? ShieldCheck : genel === 'SARI' ? ShieldQuestion : ShieldAlert;

  return (
    <div className="space-y-4">
      {/* Üst özet */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${RENK[genel]}`}>
        <div className="flex items-center gap-3">
          <Ikon size={28} />
          <div>
            <p className="font-extrabold text-lg">
              {genel === 'YESIL' ? 'Sistem sağlıklı' : genel === 'SARI' ? 'Dikkat gerektiren durum var' : 'Sorun var'}
            </p>
            <p className="text-xs opacity-80">
              {ozet?.yesil ?? 0} sorunsuz · {ozet?.sari ?? 0} dikkat · {ozet?.kirmizi ?? 0} sorunlu
              {ozet?.son_calisma && ` · son kontrol: ${new Date(ozet.son_calisma).toLocaleString('tr-TR')}`}
            </p>
          </div>
        </div>
        <button onClick={simdiCalistir} disabled={calistiriliyor}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2">
          <RefreshCw size={14} className={calistiriliyor ? 'animate-spin' : ''} />
          {calistiriliyor ? 'Kontrol ediliyor…' : 'Şimdi Kontrol Et'}
        </button>
      </div>

      {/* Kontrol listesi — sorunlular üstte */}
      <div className="space-y-2">
        {(ozet?.kontroller ?? []).map((k) => (
          <div key={k.kontrol_id} className={`rounded-lg border px-3 py-2.5 flex items-start gap-3 ${RENK[k.durum]}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-wider mt-0.5 shrink-0 w-24">
              {ETIKET[k.durum]}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white/90">{k.mesaj}</p>
              <p className="text-[11px] opacity-70">{k.yapi_tasi} · {k.kontrol_id}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 30 günlük geçmiş — bir şeyin NE ZAMAN bozulduğunu görmek için (S-5 = a) */}
      {!!ozet?.gecmis_30_gun?.length && (
        <div>
          <p className="text-xs font-bold text-gray-400 mb-2">Son 30 gün</p>
          <div className="flex gap-1 flex-wrap">
            {ozet.gecmis_30_gun.map((g) => (
              <div key={g.gun} title={`${g.gun} · ${g.kirmizi} sorun`}
                className={`w-3 h-6 rounded-sm ${g.kirmizi > 0 ? 'bg-red-500/70' : 'bg-emerald-500/60'}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SistemSagligi;
