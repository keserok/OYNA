import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { RefreshCw, AlertTriangle, CheckCircle2, Target } from 'lucide-react';
import { HUNILER, HUNI_SIRASI, type HuniAnahtari } from '../../../shared/olayKatalogu';

// ════════════════════════════════════════════════════════════════════════════
// HUNİ — "kullanıcıyı nerede kaybediyoruz?"
// ────────────────────────────────────────────────────────────────────────────
// Prensip 1.6: "Ölçüm zorunludur. Huni ve 'başarılı maç' metriği olmadan ürün
// kararı verilmez." Bu ekran o iki şeyi gösterir.
//
// NASIL OKUNUR
//   • Her satır bir adım. Sayı = O ADIMA ULAŞAN KİŞİ sayısı (tık değil).
//   • Sağdaki yüzde, bir ÖNCEKİ adımdan kaçının devam ettiğini söyler.
//   • En büyük düşüşün olduğu satır kırmızı çerçeveyle işaretlenir — ürünün
//     kanadığı yer orasıdır.
//
// "DENEME" SÜTUNU: aynı kişinin ayrı ayrı denemeleri. Kişi sayısıyla arası
// açılıyorsa insanlar tekrar tekrar deniyor ve başaramıyor demektir.
//
// P-0: Ölçümün kendisi de denetlenir. Son 24 saatte hiç olay gelmediyse en
// üstte KIRMIZI uyarı çıkar — "kimse kullanmıyor" ile "ölçüm bozuldu" aynı
// görünmesin diye.
// ════════════════════════════════════════════════════════════════════════════

interface Adim { olay: string; sira: number; ad: string | null; kisi: number; deneme: number }
interface HuniOzet { huni: string; gun: number; adimlar: Adim[]; ilceler: string[]; platformlar: string[] }
interface Saglik { son_24_saat: number; son_1_saat: number; son_kayit: string | null; saglikli: boolean }
interface MacOzet {
  gun: number; oynanan: number; basarili: number; iptal: number;
  kadro_dolmadi: number; para_eksik: number; oran: number | null;
}

const GUNLER = [
  { etiket: 'Son 7 gün', gun: 7 },
  { etiket: 'Son 30 gün', gun: 30 },
  { etiket: 'Son 90 gün', gun: 90 },
];
const YENILIKLER = [
  { etiket: 'Herkes', deger: null },
  { etiket: 'Yeni kullanıcı', deger: 'yeni' },
  { etiket: 'Eski kullanıcı', deger: 'eski' },
];

const yuzde = (a: number, b: number) => (b === 0 ? null : Math.round((100 * a) / b));

export const Huni: React.FC = () => {
  const [huni, setHuni] = useState<HuniAnahtari>('kaptan');
  const [gun, setGun] = useState(30);
  const [ilce, setIlce] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [yenilik, setYenilik] = useState<string | null>(null);

  const [ozet, setOzet] = useState<HuniOzet | null>(null);
  const [saglik, setSaglik] = useState<Saglik | null>(null);
  const [mac, setMac] = useState<MacOzet | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    const [h, s, m] = await Promise.all([
      supabase.rpc('huni_ozeti', {
        p_huni: huni, p_gun: gun, p_ilce: ilce, p_platform: platform, p_yenilik: yenilik,
      }),
      supabase.rpc('olcum_sagligi'),
      supabase.rpc('basarili_mac_ozeti', { p_gun: gun, p_ilce: ilce }),
    ]);
    if (h.error) setHata(h.error.message);
    else setOzet(h.data as HuniOzet);
    if (!s.error) setSaglik(s.data as Saglik);
    if (!m.error) setMac(m.data as MacOzet);
    setYukleniyor(false);
  }, [huni, gun, ilce, platform, yenilik]);

  useEffect(() => { void yukle(); }, [yukle]);

  const adimlar = ozet?.adimlar ?? [];
  const ilkKisi = adimlar[0]?.kisi ?? 0;

  /** En büyük düşüşün yaşandığı adımın sırası — ekranda işaretlenir. */
  const enBuyukDususSira = useMemo(() => {
    let enKotu = -1;
    let sira = -1;
    for (let i = 1; i < adimlar.length; i++) {
      const onceki = adimlar[i - 1].kisi;
      if (onceki === 0) continue;
      const kayip = onceki - adimlar[i].kisi;
      if (kayip > enKotu) { enKotu = kayip; sira = adimlar[i].sira; }
    }
    return enKotu > 0 ? sira : -1;
  }, [adimlar]);

  if (hata) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300 text-sm">
        Huni okunamadı: {hata}
        <p className="text-xs opacity-70 mt-1">
          Ölçüm veritabanı adımı henüz uygulanmamış olabilir.
        </p>
      </div>
    );
  }

  const tanim = HUNILER[huni];

  return (
    <div className="space-y-4">
      {/* ── P-0 · ölçümün kendi sağlığı ─────────────────────────────────── */}
      {saglik && !saglik.saglikli && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-extrabold text-red-300">Son 24 saatte hiç ölçüm kaydı gelmedi</p>
            <p className="text-xs text-red-200/80 mt-1">
              Aşağıdaki sayıların boş olması "kimse kullanmıyor" DEMEK OLMAYABİLİR —
              uygulama ölçüm yazmayı bırakmış da olabilir. Son kayıt:{' '}
              {saglik.son_kayit ? new Date(saglik.son_kayit).toLocaleString('tr-TR') : 'hiç yok'}.
            </p>
          </div>
        </div>
      )}

      {/* ── Kuzey yıldızı: başarılı maç ──────────────────────────────────── */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Target size={26} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-lg font-extrabold text-emerald-300">
                {mac ? `${mac.basarili} başarılı maç` : '—'}
                {mac?.oran != null && (
                  <span className="text-sm font-bold text-emerald-400/70"> · %{mac.oran}</span>
                )}
              </p>
              <p className="text-xs text-emerald-200/70">
                {mac
                  ? `${mac.oynanan} maçın saati geçti · kadro doldu + para toplandı + iptal olmadı`
                  : 'yükleniyor…'}
              </p>
            </div>
          </div>
          <button onClick={yukle} disabled={yukleniyor}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2 shrink-0">
            <RefreshCw size={14} className={yukleniyor ? 'animate-spin' : ''} /> Yenile
          </button>
        </div>
        {mac && mac.oynanan > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
            <span className="px-2 py-1 rounded bg-white/5 text-gray-300">Kadro dolmadı: {mac.kadro_dolmadi}</span>
            <span className="px-2 py-1 rounded bg-white/5 text-gray-300">Para eksik kaldı: {mac.para_eksik}</span>
            <span className="px-2 py-1 rounded bg-white/5 text-gray-300">İptal: {mac.iptal}</span>
          </div>
        )}
      </div>

      {/* ── Huni seçimi ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {HUNI_SIRASI.map((k) => (
          <button key={k} onClick={() => setHuni(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              huni === k ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {HUNILER[k].baslik}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 -mt-1">{tanim.soru}</p>

      {/* ── Kırılımlar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        {GUNLER.map((g) => (
          <button key={g.gun} onClick={() => setGun(g.gun)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
              gun === g.gun ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {g.etiket}
          </button>
        ))}
        <span className="w-px h-4 bg-white/10 mx-1" />
        {YENILIKLER.map((y) => (
          <button key={y.etiket} onClick={() => setYenilik(y.deger)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
              yenilik === y.deger ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {y.etiket}
          </button>
        ))}
        <span className="w-px h-4 bg-white/10 mx-1" />
        <select
          value={ilce ?? ''}
          onChange={(e) => setIlce(e.target.value || null)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-gray-200"
        >
          <option value="">Tüm ilçeler</option>
          {(ozet?.ilceler ?? []).map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select
          value={platform ?? ''}
          onChange={(e) => setPlatform(e.target.value || null)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-gray-200"
        >
          <option value="">Tüm telefonlar</option>
          {(ozet?.platformlar ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* ── Adımlar ──────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {adimlar.map((a, i) => {
          const onceki = i === 0 ? null : adimlar[i - 1].kisi;
          const devam = onceki == null ? null : yuzde(a.kisi, onceki);
          const genis = ilkKisi === 0 ? 0 : Math.round((100 * a.kisi) / ilkKisi);
          const kanama = a.sira === enBuyukDususSira;
          return (
            <div key={a.olay}
              className={`rounded-lg border px-3 py-2.5 ${
                kanama ? 'border-red-500/50 bg-red-500/[0.07]' : 'border-white/10 bg-white/5'}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-white/90 min-w-0">
                  <span className="text-gray-500 mr-2">{i + 1}.</span>
                  {tanim.adimlar[i]?.ad ?? a.ad ?? a.olay}
                </p>
                <div className="flex items-baseline gap-3 shrink-0">
                  {devam != null && (
                    <span className={`text-[11px] font-bold ${
                      kanama ? 'text-red-400' : devam >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      %{devam}
                    </span>
                  )}
                  <span className="text-base font-extrabold text-white tabular-nums">{a.kisi}</span>
                </div>
              </div>
              {/* Genişlik çubuğu: ilk adıma göre oran */}
              <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full ${kanama ? 'bg-red-500/70' : 'bg-emerald-500/60'}`}
                     style={{ width: `${genis}%` }} />
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">
                {a.deneme} deneme
                {a.deneme > a.kisi * 1.5 && a.kisi > 0 && ' · aynı kişiler tekrar tekrar deniyor'}
              </p>
            </div>
          );
        })}
      </div>

      {!yukleniyor && ilkKisi === 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-400 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-gray-500" />
          Seçilen aralıkta bu huniye hiç giren olmamış.
        </div>
      )}

      <p className="text-[11px] text-gray-500">
        Sayılar KİŞİ sayısıdır (aynı kişinin tekrarları tek sayılır). Ham kayıtlar
        90 gün saklanır, günlük özet süresiz kalır. Veri dışarıya hiçbir yere
        gönderilmez; kişisel bilgiler kaydedilmeden önce silinir.
      </p>
    </div>
  );
};

export default Huni;
