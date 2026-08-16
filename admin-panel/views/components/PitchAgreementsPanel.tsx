/**
 * SAHA ANLAŞMALARI — "bu sahayla kaç liraya anlaştık, oyuncudan kaç lira alıyoruz"
 *
 * Alttaki ham `commission_config` tablosundan farkı: burada saha ADIYLA listelenir,
 * her satırda ÖRNEK HESAP vardır (2000₺'lik saat → sahaya ne gider, oyuncudan ne
 * toplanır) ve serbest iptal saati de aynı ekrandan ayarlanır.
 *
 * Yazma işleri RPC üzerindendir (`admin_set_pitch_agreement`,
 * `admin_set_pitch_cancel_policy`): doğrulama, denetim kaydı ve donmuş oranlar
 * sunucuda tutulur — panel tabloya doğrudan satır yazmaz.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAdminToast } from '../context/AdminToastContext';
import { Building2, RefreshCw, Edit2, X, Check, Search, RotateCcw } from 'lucide-react';

export interface PitchAgreement {
  pitch_id: string;
  pitch_name: string | null;
  district: string | null;
  city: string | null;
  is_published: boolean;
  model: 'MODEL_A' | 'MODEL_B';
  rate_pct: number;
  markup_pct: number;
  markup_amount: number;
  sahaya_ozel: boolean;
  ornek_taban: number;
  ornek_sahaya: number;
  ornek_oyuncudan: number;
  ornek_oyna: number;
  iptal_saati: number | null;
  yarim_saat: number | null;
  yarim_yuzde: number | null;
  /** Uygulamada listelenen son saat 'HH:MM'; null = sınırsız (pitches.listing_cutoff). */
  listeleme_siniri: string | null;
}

interface Taslak {
  pitch_id: string;
  pitch_name: string;
  model: 'MODEL_A' | 'MODEL_B';
  rate_pct: number;
  markup_tipi: 'YUZDE' | 'SABIT';
  markup_pct: number;
  markup_amount: number;
  notes: string;
  iptal_saati: number;
  yarim_saat: number;
  yarim_yuzde: number;
  /** '' = sınırsız; 'HH:MM' = bitişi bu saati aşan slot vitrine çıkmaz. */
  listeleme_siniri: string;
}

const para = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} ₺`;

/** Modalda anlık önizleme — sunucudaki `_markup_tutari` ile birebir aynı kural. */
const onizle = (t: Taslak, taban = 2000) => {
  const fark = t.markup_tipi === 'SABIT'
    ? Math.round(t.markup_amount * 100) / 100
    : Math.round(taban * t.markup_pct) / 100;
  return {
    sahaya: taban - Math.round(taban * t.rate_pct) / 100,
    oyuncudan: taban + fark,
    oyna: Math.round(taban * t.rate_pct) / 100 + fark,
  };
};

export const PitchAgreementsPanel: React.FC = () => {
  const [rows, setRows] = useState<PitchAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [taslak, setTaslak] = useState<Taslak | null>(null);
  const [saving, setSaving] = useState(false);
  const { success, error: toastError } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_pitch_agreements');
    if (error) { toastError(error.message); setLoading(false); return; }
    let list = (data ?? []) as PitchAgreement[];
    // Listeleme sınırı anlaşma RPC'sinde yok; pitches'tan okunup birleştirilir.
    const { data: cutoffs } = await supabase.from('pitches').select('id, listing_cutoff');
    const byId = new Map((cutoffs ?? []).map((p: { id: string; listing_cutoff: string | null }) =>
      [p.id, p.listing_cutoff ? String(p.listing_cutoff).slice(0, 5) : null]));
    list = list.map(r => ({ ...r, listeleme_siniri: byId.get(r.pitch_id) ?? null }));
    setRows(list);
    setLoading(false);
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const gorunen = useMemo(() => {
    const k = q.trim().toLocaleLowerCase('tr');
    if (!k) return rows;
    return rows.filter(r =>
      [r.pitch_name, r.district, r.city].filter(Boolean).join(' ').toLocaleLowerCase('tr').includes(k));
  }, [rows, q]);

  const ac = (r: PitchAgreement) => setTaslak({
    pitch_id: r.pitch_id,
    pitch_name: r.pitch_name ?? 'Saha',
    model: r.model,
    rate_pct: r.rate_pct,
    markup_tipi: r.markup_amount > 0 ? 'SABIT' : 'YUZDE',
    markup_pct: r.markup_pct,
    markup_amount: r.markup_amount,
    notes: '',
    iptal_saati: r.iptal_saati ?? 24,
    yarim_saat: r.yarim_saat ?? 6,
    yarim_yuzde: r.yarim_yuzde ?? 50,
    listeleme_siniri: r.listeleme_siniri ?? '',
  });

  const kaydet = async () => {
    if (!taslak) return;
    setSaving(true);
    try {
      const { error: e1 } = await supabase.rpc('admin_set_pitch_agreement', {
        p_pitch_id: taslak.pitch_id,
        p_model: taslak.model,
        p_rate_pct: taslak.rate_pct,
        p_markup_pct: taslak.markup_tipi === 'YUZDE' ? taslak.markup_pct : 0,
        p_markup_amount: taslak.markup_tipi === 'SABIT' ? taslak.markup_amount : 0,
        p_notes: taslak.notes || null,
      });
      if (e1) throw e1;

      const { error: e2 } = await supabase.rpc('admin_set_pitch_cancel_policy', {
        p_pitch_id: taslak.pitch_id,
        p_full_hours: taslak.iptal_saati,
        p_half_hours: taslak.yarim_saat,
        p_half_pct: taslak.yarim_yuzde,
      });
      if (e2) throw e2;

      // Listeleme sınırı anlaşmanın parçası: boş = sınırsız (NULL).
      const { error: e3 } = await supabase.rpc('admin_set_pitch_listing_cutoff', {
        p_pitch_id: taslak.pitch_id,
        p_cutoff: taslak.listeleme_siniri || null,
      });
      if (e3) throw e3;

      success(`${taslak.pitch_name} anlaşması güncellendi.`);
      setTaslak(null);
      void load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  /** Sahaya özel anlaşmayı kaldır → saha global varsayılana döner. */
  const sifirla = async (r: PitchAgreement) => {
    const { error } = await supabase.rpc('admin_set_pitch_agreement', { p_pitch_id: r.pitch_id, p_model: null });
    if (error) toastError(error.message);
    else { success(`${r.pitch_name ?? 'Saha'} global varsayılana döndü.`); void load(); }
  };

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 mr-auto">
          <Building2 size={18} className="text-[#39FF14]" />
          <h2 className="text-white font-extrabold text-base">Saha Anlaşmaları</h2>
          <span className="text-gray-500 text-xs">
            Sahaya ödenen tutar, oyuncudan toplanan tutar ve serbest iptal süresi
          </span>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Saha ara…"
            className="h-9 pl-8 pr-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm w-56 placeholder:text-gray-600" />
        </div>
        <button onClick={() => void load()}
          className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white flex items-center gap-2 text-sm transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              {['Saha','Anlaşma','Komisyon','Fiyat farkı','2.000₺’lik saat','Serbest iptal','Listeleme',''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : gorunen.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-600">Saha bulunamadı.</td></tr>
            ) : gorunen.map(r => (
              <tr key={r.pitch_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="font-bold text-white">{r.pitch_name ?? '—'}</p>
                  <p className="text-[11px] text-gray-500">
                    {[r.district, r.city].filter(Boolean).join(', ') || '—'}
                    {!r.is_published && <span className="ml-2 text-amber-400">· yayında değil</span>}
                  </p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.sahaya_ozel
                    ? <span className="text-[10px] font-extrabold px-2 py-1 rounded-full text-[#39FF14] bg-[#39FF14]/10">SAHAYA ÖZEL</span>
                    : <span className="text-[10px] font-extrabold px-2 py-1 rounded-full text-gray-400 bg-white/5">GLOBAL</span>}
                  <span className="ml-2 text-gray-500 text-xs">{r.model === 'MODEL_B' ? 'Model B' : 'Model A'}</span>
                </td>
                <td className="px-4 py-3 text-[#39FF14] font-extrabold whitespace-nowrap">%{r.rate_pct}</td>
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                  {r.markup_amount > 0 ? para(r.markup_amount) : r.markup_pct > 0 ? `%${r.markup_pct}` : '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">
                  <span className="text-gray-400">sahaya </span>
                  <span className="text-white font-bold">{para(r.ornek_sahaya)}</span>
                  <span className="text-gray-600"> · </span>
                  <span className="text-gray-400">oyunculardan </span>
                  <span className="text-white font-bold">{para(r.ornek_oyuncudan)}</span>
                  <span className="text-gray-600"> · </span>
                  <span className="text-gray-400">OYNA </span>
                  <span className="text-[#39FF14] font-bold">{para(r.ornek_oyna)}</span>
                </td>
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{r.iptal_saati ?? 24} saat</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.listeleme_siniri
                    ? <span className="text-[10px] font-extrabold px-2 py-1 rounded-full text-amber-300 bg-amber-400/10">{r.listeleme_siniri}&apos;a kadar</span>
                    : <span className="text-xs text-gray-500">Sınırsız</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => ac(r)} title="Anlaşmayı düzenle"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                      <Edit2 size={13} />
                    </button>
                    {r.sahaya_ozel && (
                      <button onClick={() => void sifirla(r)} title="Global varsayılana döndür"
                        className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors">
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {taslak && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-[#161B22] border border-white/10 rounded-[28px] p-6 w-full max-w-lg space-y-5 my-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white font-extrabold text-lg">{taslak.pitch_name}</h2>
                <p className="text-gray-500 text-xs">Ödeme anlaşması ve iptal süresi</p>
              </div>
              <button onClick={() => setTaslak(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>

            <Alan label="Anlaşma modeli">
              <select value={taslak.model}
                onChange={e => setTaslak(t => ({ ...t!, model: e.target.value as 'MODEL_A' | 'MODEL_B' }))}
                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm">
                <option value="MODEL_A">Model A — tarifedeki tutar sahanın fiyatıdır</option>
                <option value="MODEL_B">Model B — sahayı biz kiralarız, üstüne fark koyarız</option>
              </select>
            </Alan>

            <Alan label="Komisyon oranı (%) — sahanın hakedişinden düşülür">
              <input type="number" min="0" max="100" step="0.5" value={taslak.rate_pct}
                onChange={e => setTaslak(t => ({ ...t!, rate_pct: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
            </Alan>

            <Alan label="Oyuncudan alınan fark">
              <div className="flex gap-2 mb-2">
                {(['YUZDE','SABIT'] as const).map(tip => (
                  <button key={tip} onClick={() => setTaslak(t => ({ ...t!, markup_tipi: tip }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-colors ${
                      taslak.markup_tipi === tip ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                    {tip === 'YUZDE' ? 'Yüzde (%)' : 'Sabit tutar (₺)'}
                  </button>
                ))}
              </div>
              {taslak.markup_tipi === 'YUZDE' ? (
                <input type="number" min="0" max="200" step="0.5" value={taslak.markup_pct}
                  onChange={e => setTaslak(t => ({ ...t!, markup_pct: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
              ) : (
                <input type="number" min="0" step="10" value={taslak.markup_amount}
                  onChange={e => setTaslak(t => ({ ...t!, markup_amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
              )}
            </Alan>

            {/* Örnek hesap — girilen sayının parada karşılığı anında görünür. */}
            {(() => {
              const p = onizle(taslak);
              return (
                <div className="rounded-2xl border border-[#39FF14]/20 bg-[#1a2000] p-4 text-sm space-y-1">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">2.000 ₺&apos;lik bir saat</p>
                  <p className="text-gray-300">Sahaya ödenir: <b className="text-white">{para(p.sahaya)}</b></p>
                  <p className="text-gray-300">Oyunculardan toplanır: <b className="text-white">{para(p.oyuncudan)}</b></p>
                  <p className="text-gray-300">OYNA&apos;da kalan: <b className="text-[#39FF14]">{para(p.oyna)}</b></p>
                </div>
              );
            })()}

            <div className="grid grid-cols-3 gap-3">
              <Alan label="Serbest iptal (saat)">
                <input type="number" min="0" max="336" step="1" value={taslak.iptal_saati}
                  onChange={e => setTaslak(t => ({ ...t!, iptal_saati: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
              </Alan>
              <Alan label="Yarım iade (saat)">
                <input type="number" min="0" max="336" step="1" value={taslak.yarim_saat}
                  onChange={e => setTaslak(t => ({ ...t!, yarim_saat: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
              </Alan>
              <Alan label="Yarım iade (%)">
                <input type="number" min="0" max="100" step="5" value={taslak.yarim_yuzde}
                  onChange={e => setTaslak(t => ({ ...t!, yarim_yuzde: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
              </Alan>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Maça <b className="text-gray-300">{taslak.iptal_saati} saatten</b> fazla kala iptalde ödenen tutarın tamamı,
              {' '}<b className="text-gray-300">{taslak.yarim_saat}–{taslak.iptal_saati} saat</b> arasında %{taslak.yarim_yuzde}&apos;si iade edilir;
              {' '}<b className="text-gray-300">{taslak.yarim_saat} saatten</b> az kala iade yapılmaz. Bu saatler oyuncu ekranlarında da bu şekilde görünür.
            </p>

            <Alan label="Uygulamada listelenen son saat (boş = sınırsız)">
              <div className="flex items-center gap-2">
                <input type="time" value={taslak.listeleme_siniri}
                  onChange={e => setTaslak(t => ({ ...t!, listeleme_siniri: e.target.value }))}
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
                {taslak.listeleme_siniri && (
                  <button type="button" onClick={() => setTaslak(t => ({ ...t!, listeleme_siniri: '' }))}
                    className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white text-xs font-bold whitespace-nowrap">
                    Sınırsız yap
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500 leading-relaxed">
                Anlaşma gereği saha akşamını vitrine vermiyorsa buraya son saati yaz
                (ör. 20:00): bitişi bu saati aşan slotlar oyuncuya görünmez ve uygulamadan
                rezerve edilemez. Saha sahibi kendi panelindeki &quot;Uygulamada Listeleme
                Saati&quot; ekranından da değiştirebilir; elle yönetimi etkilenmez.
              </p>
            </Alan>

            <Alan label="Not (opsiyonel)">
              <input type="text" value={taslak.notes}
                onChange={e => setTaslak(t => ({ ...t!, notes: e.target.value }))}
                placeholder="ör. 2026 sezonu sözleşmesi"
                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
            </Alan>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setTaslak(null)}
                className="flex-1 py-3 bg-white/5 text-gray-400 font-bold rounded-xl hover:bg-white/10 transition-colors text-sm">
                Vazgeç
              </button>
              <button onClick={() => void kaydet()} disabled={saving}
                className="flex-1 py-3 bg-[#39FF14] text-black font-extrabold rounded-xl hover:brightness-110 active:scale-95 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const Alan = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-[11px] text-gray-500 font-extrabold uppercase tracking-wider block mb-2">{label}</label>
    {children}
  </div>
);
