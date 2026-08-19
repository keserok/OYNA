import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { RefreshCw, Users, CalendarDays, Receipt, MapPin } from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════════
// [STR-1] GERÇEK DURUM
// ────────────────────────────────────────────────────────────────────────────
// Stratejik Danışman turu şunu buldu: panelde okunan üç sayı da yanıltıcıydı.
//   "33 kullanıcı"  → 29'u demo
//   "4 gerçek maç"  → 3'ünü demo kullanıcılar kurmuştu
//   "1.920 ₺ para"  → 2 BAŞARISIZ ödeme denemesi
//
// Bu bir kod hatası değil, KARAR hatası üretir. Bu kart demo ile gerçeği
// yan yana gösterir ve "tahsil edilen para" ile "başarısız deneme"yi
// asla aynı kutuya koymaz.
// ════════════════════════════════════════════════════════════════════════════

type Durum = {
  kullanici: { gercek: number; demo: number; son30_aktif: number };
  mac: { gercek: number; demo: number; gelecek: number };
  para: {
    tahsil_edilen: number; tahsil_adedi: number;
    basarisiz_deneme: number; askida: number; demo_hacim: number;
  };
  saha: { toplam: number; yayinda: number; ilce: number };
  anahtarlar: { demo_modu: string; odeme_modu: string; saglayici: string };
  olcum_at: string;
};

const tl = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);

const Satir: React.FC<{
  ikon: React.ReactNode; baslik: string; gercek: string; demo?: string; not?: string;
}> = ({ ikon, baslik, gercek, demo, not }) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-white/[0.06] last:border-0">
    <span className="text-gray-500 mt-0.5 shrink-0">{ikon}</span>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] text-gray-400">{baslik}</p>
      <p className="text-sm font-extrabold text-white">{gercek}</p>
      {not && <p className="text-[10px] text-gray-500 mt-0.5">{not}</p>}
    </div>
    {demo !== undefined && (
      <div className="text-right shrink-0">
        <p className="text-[10px] text-gray-500">demo</p>
        <p className="text-xs font-bold text-gray-400">{demo}</p>
      </div>
    )}
  </div>
);

export const GercekDurum: React.FC = () => {
  const [d, setD] = useState<Durum | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    const { data, error } = await supabase.rpc('gercek_durum');
    if (error) setHata(error.message);
    else setD(data as Durum);
    setYukleniyor(false);
  }, []);

  useEffect(() => { void yukle(); }, [yukle]);

  if (hata) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300 text-sm">
        Gerçek durum okunamadı: {hata}
      </div>
    );
  }
  if (yukleniyor || !d) {
    return <div className="text-gray-400 text-sm p-2">Gerçek durum yükleniyor…</div>;
  }

  const demoAcik = d.anahtarlar.demo_modu === 'true';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500">
          Demo veriler ayrı sütunda — hiçbiri gerçek sayıya karışmaz.
        </p>
        <button onClick={yukle}
          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-bold flex items-center gap-1.5">
          <RefreshCw size={12} /> Yenile
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 px-4">
        <Satir
          ikon={<Users size={15} />}
          baslik="Gerçek kullanıcı"
          gercek={`${d.kullanici.gercek} kişi`}
          demo={`${d.kullanici.demo}`}
          not={`son 30 günde aktif: ${d.kullanici.son30_aktif}`}
        />
        <Satir
          ikon={<CalendarDays size={15} />}
          baslik="Gerçek maç"
          gercek={`${d.mac.gercek} maç`}
          demo={`${d.mac.demo}`}
          not={`gelecek tarihli: ${d.mac.gelecek}`}
        />
        <Satir
          ikon={<Receipt size={15} />}
          baslik="Tahsil edilen para"
          gercek={tl(d.para.tahsil_edilen)}
          demo={tl(d.para.demo_hacim)}
          not={
            d.para.basarisiz_deneme > 0
              ? `başarısız deneme: ${tl(d.para.basarisiz_deneme)} — bu tahsilat DEĞİLDİR`
              : `${d.para.tahsil_adedi} başarılı ödeme · askıda: ${d.para.askida}`
          }
        />
        <Satir
          ikon={<MapPin size={15} />}
          baslik="Yayında saha"
          gercek={`${d.saha.yayinda} / ${d.saha.toplam}`}
          not={`kapsama: ${d.saha.ilce} ilçe`}
        />
      </div>

      {/* Anahtarlar — "neden böyle görünüyor" sorusunun cevabı */}
      <div className="flex flex-wrap gap-2">
        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
          demoAcik ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
          Demo modu: {demoAcik ? 'AÇIK' : 'kapalı'}
        </span>
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-gray-400">
          Ödeme modu: {d.anahtarlar.odeme_modu.replace(/"/g, '')}
        </span>
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-gray-400">
          Sağlayıcı: {d.anahtarlar.saglayici.replace(/"/g, '')}
        </span>
      </div>

      {demoAcik && (
        <p className="text-[11px] text-amber-400/80">
          Demo modu açık olduğu için vitrinde demo maçlar görünüyor. Lansmandan
          önce kapatılmalı.
        </p>
      )}
    </div>
  );
};

export default GercekDurum;
