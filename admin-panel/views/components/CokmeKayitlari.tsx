import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { RefreshCw, Bug, CheckCircle2 } from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════════
// [SRE-3 / S-3] ÇÖKME KAYITLARI
// ────────────────────────────────────────────────────────────────────────────
// Kurucu kararı S-3 = "güvenli olsun": hata kayıtları üçüncü tarafa (Sentry
// vb.) GİTMEZ, kendi veritabanımızda durur. Bu ekran onları gösterir.
//
// Eskiden bir kullanıcının telefonunda uygulama çöktüğünde bunu ancak o kişi
// bize yazarsa öğreniyorduk. Artık kendiliğinden buraya düşüyor.
//
// Gizlilik: e-posta, telefon, kart, oturum anahtarı hem tarayıcıda hem
// sunucuda silinir — bu listede asla görünmez.
// ════════════════════════════════════════════════════════════════════════════

type Grup = {
  parmak_izi: string;
  nerede: string | null;
  mesaj: string;
  ekran: string | null;
  adet: number;
  kisi: number;
  son: string;
};

type Ozet = {
  pencere_saat: number;
  toplam: number;
  farkli_hata: number;
  etkilenen_kisi: number;
  gruplar: Grup[];
};

const PENCERELER = [
  { etiket: 'Son 24 saat', saat: 24 },
  { etiket: 'Son 7 gün', saat: 168 },
  { etiket: 'Son 30 gün', saat: 720 },
];

export const CokmeKayitlari: React.FC = () => {
  const [ozet, setOzet] = useState<Ozet | null>(null);
  const [saat, setSaat] = useState(24);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    const { data, error } = await supabase.rpc('hata_ozeti', { p_saat: saat });
    if (error) setHata(error.message);
    else setOzet(data as Ozet);
    setYukleniyor(false);
  }, [saat]);

  useEffect(() => { void yukle(); }, [yukle]);

  if (hata) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300 text-sm">
        Çökme kayıtları okunamadı: {hata}
      </div>
    );
  }

  const bosMu = !yukleniyor && (ozet?.toplam ?? 0) === 0;

  return (
    <div className="space-y-4">
      {/* Üst özet */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${
        bosMu ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
              : 'text-amber-400 border-amber-500/40 bg-amber-500/10'}`}>
        <div className="flex items-center gap-3">
          {bosMu ? <CheckCircle2 size={28} /> : <Bug size={28} />}
          <div>
            <p className="font-extrabold text-lg">
              {yukleniyor ? 'Yükleniyor…'
                : bosMu ? 'Hiç çökme kaydı yok'
                : `${ozet?.farkli_hata} farklı hata`}
            </p>
            <p className="text-xs opacity-80">
              {bosMu
                ? 'Seçilen sürede uygulama kimsede çökmemiş.'
                : `${ozet?.toplam} kez yaşandı · ${ozet?.etkilenen_kisi} kişi etkilendi`}
            </p>
          </div>
        </div>
        <button onClick={yukle} disabled={yukleniyor}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2">
          <RefreshCw size={14} className={yukleniyor ? 'animate-spin' : ''} />
          Yenile
        </button>
      </div>

      {/* Zaman aralığı */}
      <div className="flex gap-2">
        {PENCERELER.map((p) => (
          <button key={p.saat} onClick={() => setSaat(p.saat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              saat === p.saat ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {p.etiket}
          </button>
        ))}
      </div>

      {/* Hata grupları — en çok yaşanan üstte */}
      <div className="space-y-2">
        {(ozet?.gruplar ?? []).map((g) => (
          <div key={g.parmak_izi}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-white/90 min-w-0 break-words">{g.mesaj}</p>
              <span className="text-xs font-extrabold text-amber-400 shrink-0">{g.adet}×</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {g.nerede ?? 'yer bilinmiyor'}
              {g.ekran ? ` · ${g.ekran}` : ''}
              {` · ${g.kisi} kişi · son: ${new Date(g.son).toLocaleString('tr-TR')}`}
            </p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-500">
        Kayıtlar 30 gün saklanır ve dışarıya hiçbir yere gönderilmez. Kişisel
        bilgiler (e-posta, telefon, kart, oturum anahtarı) kaydedilmeden önce silinir.
      </p>
    </div>
  );
};

export default CokmeKayitlari;
