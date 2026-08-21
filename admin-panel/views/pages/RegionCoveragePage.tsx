/**
 * BÖLGE KAPSAMA (20 Ağu 2026 yeniden tasarımı — kurucu isteği):
 * "Tüm Türkiye'deki herhangi bir ili ve ilçeyi seçebilelim; en üstte ülke
 * haritası olsun, aktif iller görünsün; ile tıklayınca ilçeleri gelsin.
 * Ayrıca 'Beşiktaş'taki kullanıcı Sarıyer'i görsün, Beylikdüzü'nü görmesin'
 * sistemini bu ekrandan kurabilelim."
 *
 * Üç kat:
 *   1) TÜRKİYE HARİTASI — 81 il kutucuk haritası; aktif iller yeşil yanar.
 *   2) İLÇE KAPSAMI — seçili ilin RESMÎ ilçe listesi (data/turkeyRegions.ts);
 *      tek tıkla aç/kapa. Kayıt yoksa oluşturulur (region_coverage).
 *   3) GÖRÜNÜRLÜK KURALLARI — ilçe başına "bu ilçedeki kullanıcı hangi
 *      ilçelerin maç/sahalarını görür" izin listesi (region_visibility_rules).
 *      Kural YOKSA kısıtlama yoktur (mevcut yarıçap keşfi aynen çalışır);
 *      kural varken kullanıcının kendi ilçesi HER ZAMAN dahildir.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  MapPin, Check, X, RefreshCw, Globe2, Eye, Loader2, Plus, Trash2, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { TURKEY_REGIONS } from '../../../data/turkeyRegions';
import { TurkeyTileMap, type ProvinceState } from '../components/TurkeyTileMap';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchRegionVisibilityRules, setRegionVisibilityAdmin, upsertRegionCoverageAdmin,
  toTurkishAdminError, type RegionVisibilityRule,
} from '../../services/adminService';

interface CoverageRow {
  id: string;
  city: string;
  district: string | null;
  is_active: boolean;
  has_boundary: boolean;
}

type DistrictState = 'AKTIF' | 'KAPALI' | 'TANIMSIZ';

export const RegionCoveragePage: React.FC = () => {
  const { success, error: toastError } = useAdminToast();
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [rules, setRules] = useState<RegionVisibilityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  // Görünürlük kural editörü
  const [ruleDistrict, setRuleDistrict] = useState<string | null>(null);
  const [draftTargets, setDraftTargets] = useState<Array<{ city: string; district: string }>>([]);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [crossCity, setCrossCity] = useState('');
  const [crossDistrict, setCrossDistrict] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [covRes, ruleRows] = await Promise.all([
        supabase
          .from('region_coverage')
          .select('id, city, district, is_active, boundary')
          .order('city').order('sort_order'),
        fetchRegionVisibilityRules().catch(() => [] as RegionVisibilityRule[]),
      ]);
      if (covRes.error) throw covRes.error;
      setRows(((covRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        city: r.city as string,
        district: (r.district as string | null) ?? null,
        is_active: !!r.is_active,
        has_boundary: r.boundary != null,
      })));
      setRules(ruleRows);
      // İlk açılışta aktif kapsamı olan ilk ile odaklan.
      setSelectedCity((prev) => prev ?? ((covRes.data ?? []) as Array<{ city?: string; is_active?: boolean }>)
        .find((r) => r.is_active)?.city ?? null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw.includes('row-level security') ? 'Bu verilere erişim için ADMIN yetkisi gerekli.' : 'Kapsama verisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // İl seçimi değişince kural editörünü sıfırla.
  useEffect(() => { setRuleDistrict(null); setDraftTargets([]); }, [selectedCity]);

  // ── Türetilmiş görünümler ─────────────────────────────────────────────────
  const coverageByKey = useMemo(() => {
    const m = new Map<string, CoverageRow>();
    rows.forEach((r) => m.set(`${r.city}::${r.district ?? ''}`, r));
    return m;
  }, [rows]);

  const rulesBySource = useMemo(() => {
    const m = new Map<string, RegionVisibilityRule[]>();
    rules.filter((r) => r.is_active).forEach((r) => {
      const k = `${r.city}::${r.district}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    });
    return m;
  }, [rules]);

  const provinceStates = useMemo(() => {
    const states: Record<string, ProvinceState> = {};
    for (const r of rows) {
      const s = (states[r.city] ??= { activeCount: 0, totalRows: 0, ruleCount: 0 });
      s.totalRows += 1;
      if (r.is_active) s.activeCount += 1;
    }
    for (const [key, list] of rulesBySource) {
      if (list.length === 0) continue;
      const city = key.split('::')[0];
      (states[city] ??= { activeCount: 0, totalRows: 0, ruleCount: 0 }).ruleCount += 1;
    }
    return states;
  }, [rows, rulesBySource]);

  const region = useMemo(() => TURKEY_REGIONS.find((r) => r.city === selectedCity) ?? null, [selectedCity]);

  const districtState = useCallback((city: string, district: string | null): DistrictState => {
    const row = coverageByKey.get(`${city}::${district ?? ''}`);
    if (!row) return 'TANIMSIZ';
    return row.is_active ? 'AKTIF' : 'KAPALI';
  }, [coverageByKey]);

  // ── Kapsam aç/kapa ────────────────────────────────────────────────────────
  const toggleCoverage = async (city: string, district: string | null) => {
    const key = `${city}::${district ?? ''}`;
    const current = districtState(city, district);
    const next = current !== 'AKTIF'; // tanımsız/kapalı → aktif; aktif → kapalı
    setSavingKey(key);
    try {
      await upsertRegionCoverageAdmin(city, district, next);
      success(`${city}${district ? ` / ${district}` : ' (il geneli)'} ${next ? 'kapsama alındı' : 'kapsam dışına çıkarıldı'}`);
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSavingKey(null);
    }
  };

  // ── Görünürlük kural editörü ──────────────────────────────────────────────
  const openRuleEditor = (district: string) => {
    if (!selectedCity) return;
    setRuleDistrict(district);
    const existing = rulesBySource.get(`${selectedCity}::${district}`) ?? [];
    setDraftTargets(existing.map((r) => ({ city: r.visible_city, district: r.visible_district })));
    setCrossCity(''); setCrossDistrict('');
  };

  const targetSelected = (city: string, district: string) =>
    draftTargets.some((t) => t.city === city && t.district === district);

  const toggleTarget = (city: string, district: string) => {
    setDraftTargets((prev) =>
      prev.some((t) => t.city === city && t.district === district)
        ? prev.filter((t) => !(t.city === city && t.district === district))
        : [...prev, { city, district }]);
  };

  const saveRules = async (targets: Array<{ city: string; district: string }>) => {
    if (!selectedCity || !ruleDistrict) return;
    setRuleSaving(true);
    try {
      await setRegionVisibilityAdmin(selectedCity, ruleDistrict, targets);
      success(targets.length === 0
        ? `${ruleDistrict} için kurallar kaldırıldı — kısıtlama yok`
        : `${ruleDistrict} artık ${targets.length} bölgeyi görüyor (kendisi hariç, o hep dahil)`);
      setRules(await fetchRegionVisibilityRules());
      if (targets.length === 0) setRuleDistrict(null);
      else setDraftTargets(targets);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setRuleSaving(false);
    }
  };

  const activeCount = rows.filter((r) => r.is_active).length;
  const activeCities = new Set(rows.filter((r) => r.is_active).map((r) => r.city)).size;
  const ruledDistrictCount = rulesBySource.size;

  const crossRegion = TURKEY_REGIONS.find((r) => r.city === crossCity) ?? null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Globe2 size={22} className="text-yellow-400" /> Bölge Kapsama</h1>
          <p className="text-sm text-gray-400 mt-1">
            Türkiye'nin her ili ve ilçesi seçilebilir. Aktif bölgeler uygulamanın bölge seçicisinde görünür;
            görünürlük kuralları hangi ilçedeki kullanıcının hangi ilçelerin maç/sahalarını göreceğini belirler.
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            {activeCities} il · {activeCount} aktif bölge · {ruledDistrictCount} ilçede görünürlük kuralı
          </p>
        </div>
        <button onClick={() => void load()} className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/10">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">{error}</div>}

      {/* ── 1) ÜLKE HARİTASI ── */}
      <div className="bg-[#10151C] border border-white/[0.06] rounded-2xl p-4 mb-5">
        {loading && rows.length === 0 ? (
          <div className="text-gray-500 text-sm py-16 text-center flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Harita yükleniyor…</div>
        ) : (
          <TurkeyTileMap states={provinceStates} selected={selectedCity} onSelect={setSelectedCity} />
        )}
      </div>

      {/* ── 2) SEÇİLİ İL: İLÇE KAPSAMI ── */}
      {!region ? (
        <div className="bg-[#0D1117] border border-white/10 rounded-2xl px-4 py-10 text-center text-gray-500 text-sm">
          Haritadan bir il seç — ilçeleri burada açılır.
        </div>
      ) : (
        <>
          <div className="bg-[#10151C] border border-white/[0.06] rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <MapPin size={15} className="text-yellow-400" /> {region.city}
                <span className="text-[10px] font-mono text-gray-600">plaka {region.plate} · {region.districts.length} ilçe</span>
              </h2>
              {/* İl geneli kapsamı */}
              {(() => {
                const st = districtState(region.city, null);
                const key = `${region.city}::`;
                return (
                  <button
                    type="button"
                    disabled={savingKey === key}
                    onClick={() => void toggleCoverage(region.city, null)}
                    className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-extrabold uppercase tracking-wide border transition-colors ${
                      st === 'AKTIF' ? 'bg-green-500/15 text-green-400 border-green-500/30'
                        : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {savingKey === key ? <Loader2 size={12} className="animate-spin" /> : st === 'AKTIF' ? <Check size={12} /> : <Plus size={12} />}
                    İl Geneli {st === 'AKTIF' ? 'Aktif' : 'Kapsama Al'}
                  </button>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {region.districts.map((d) => {
                const st = districtState(region.city, d);
                const key = `${region.city}::${d}`;
                const ruleCount = (rulesBySource.get(key) ?? []).length;
                const row = coverageByKey.get(key);
                return (
                  <div
                    key={d}
                    className={`rounded-xl border p-2.5 flex flex-col gap-2 transition-colors ${
                      st === 'AKTIF' ? 'bg-[#39FF14]/[0.04] border-[#39FF14]/25'
                        : st === 'KAPALI' ? 'bg-amber-500/[0.03] border-amber-500/20'
                        : 'bg-black/20 border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                      <p className={`text-[11px] font-extrabold truncate ${st === 'AKTIF' ? 'text-white' : 'text-gray-400'}`} title={row?.has_boundary ? `${d} — sınır verisi var` : d}>
                        {d}
                      </p>
                      {ruleCount > 0 && (
                        <span className="shrink-0 text-[8px] font-extrabold text-purple-300 bg-purple-500/15 border border-purple-500/30 rounded px-1 py-0.5" title={`${ruleCount} görünürlük hedefi`}>
                          {ruleCount} kural
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={savingKey === key}
                        onClick={() => void toggleCoverage(region.city, d)}
                        className={`flex-1 flex items-center justify-center gap-1 h-7 rounded-lg text-[9px] font-extrabold uppercase tracking-wide border transition-colors ${
                          st === 'AKTIF' ? 'bg-green-500/15 text-green-400 border-green-500/30'
                            : 'bg-white/5 text-gray-500 border-white/10 hover:text-white'
                        }`}
                      >
                        {savingKey === key ? <Loader2 size={10} className="animate-spin" /> : st === 'AKTIF' ? <Check size={10} /> : <X size={10} />}
                        {st === 'AKTIF' ? 'Aktif' : st === 'KAPALI' ? 'Kapalı' : 'Kapsam dışı'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openRuleEditor(d)}
                        title="Görünürlük kuralı: bu ilçedeki kullanıcı hangi ilçeleri görür?"
                        className={`shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
                          ruleDistrict === d ? 'bg-purple-500/25 border-purple-400/50 text-purple-200'
                            : ruleCount > 0 ? 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'
                            : 'bg-white/5 border-white/10 text-gray-500 hover:text-white'
                        }`}
                      >
                        <Eye size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 3) GÖRÜNÜRLÜK KURAL EDİTÖRÜ ── */}
          {ruleDistrict && (
            <div className="bg-[#10151C] border border-purple-500/20 rounded-2xl p-5 mb-5">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <Eye size={15} className="text-purple-300" /> Görünürlük — {region.city} / {ruleDistrict}
                </h3>
                <button type="button" onClick={() => setRuleDistrict(null)} aria-label="Editörü kapat" className="w-7 h-7 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center shrink-0">
                  <X size={14} />
                </button>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed mb-4">
                <b className="text-gray-300">{ruleDistrict}</b>'teki kullanıcı aşağıda seçili ilçelerin maç ve sahalarını görür
                — <b className="text-gray-300">kendi ilçesi her zaman dahildir</b>, seçmene gerek yok.
                Hiç seçim yoksa kural yok demektir: kısıtlama uygulanmaz, yarıçap keşfi olduğu gibi çalışır.
                Örnek: Beşiktaş için yalnız Sarıyer'i seç → Beşiktaş'taki oyuncu Sarıyer'i görür, Beylikdüzü'nü görmez.
              </p>

              {/* Aynı ilin ilçeleri */}
              <p className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest mb-2">{region.city} ilçeleri</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {region.districts.filter((d) => d !== ruleDistrict).map((d) => {
                  const sel = targetSelected(region.city, d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleTarget(region.city, d)}
                      className={`px-2.5 h-8 rounded-lg border text-[10px] font-extrabold transition-colors ${
                        sel ? 'bg-purple-500/20 border-purple-400/50 text-purple-100'
                          : 'bg-black/30 border-white/10 text-gray-500 hover:text-white hover:border-white/25'
                      }`}
                    >
                      {sel ? '✓ ' : ''}{d}
                    </button>
                  );
                })}
              </div>

              {/* Başka ilden hedef ekleme */}
              <p className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest mb-2">Başka ilden ekle (opsiyonel)</p>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <select
                  value={crossCity}
                  onChange={(e) => { setCrossCity(e.target.value); setCrossDistrict(''); }}
                  className="h-9 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-purple-500/40"
                >
                  <option value="">İl seç…</option>
                  {TURKEY_REGIONS.filter((r) => r.city !== region.city).map((r) => <option key={r.city} value={r.city}>{r.city}</option>)}
                </select>
                <select
                  value={crossDistrict}
                  onChange={(e) => setCrossDistrict(e.target.value)}
                  disabled={!crossRegion}
                  className="h-9 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-purple-500/40 disabled:opacity-40"
                >
                  <option value="">İlçe seç…</option>
                  {(crossRegion?.districts ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button
                  type="button"
                  disabled={!crossCity || !crossDistrict || targetSelected(crossCity, crossDistrict)}
                  onClick={() => { toggleTarget(crossCity, crossDistrict); setCrossDistrict(''); }}
                  className="flex items-center gap-1 h-9 px-3 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-200 text-[10px] font-extrabold uppercase disabled:opacity-40"
                >
                  <Plus size={12} /> Ekle
                </button>
              </div>
              {draftTargets.some((t) => t.city !== region.city) && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {draftTargets.filter((t) => t.city !== region.city).map((t) => (
                    <button
                      key={`${t.city}-${t.district}`}
                      type="button"
                      onClick={() => toggleTarget(t.city, t.district)}
                      className="px-2.5 h-8 rounded-lg border bg-purple-500/20 border-purple-400/50 text-purple-100 text-[10px] font-extrabold"
                      title="Kaldırmak için tıkla"
                    >
                      ✓ {t.city} / {t.district} ×
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-white/[0.06]">
                <p className="text-[10px] text-gray-500">
                  {draftTargets.length === 0
                    ? 'Seçim yok — kaydedersen kural kalkar (kısıtlama yok).'
                    : <>Bu ilçe <b className="text-purple-200">{draftTargets.length}</b> bölgeyi görecek (+ kendisi).</>}
                </p>
                <div className="flex gap-2">
                  {(rulesBySource.get(`${region.city}::${ruleDistrict}`) ?? []).length > 0 && (
                    <button
                      type="button"
                      disabled={ruleSaving}
                      onClick={() => void saveRules([])}
                      className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-red-500/30 text-red-300 text-[10px] font-extrabold uppercase hover:bg-red-500/10 disabled:opacity-40"
                    >
                      <Trash2 size={12} /> Kuralları Kaldır
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={ruleSaving}
                    onClick={() => void saveRules(draftTargets)}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-extrabold uppercase disabled:opacity-40"
                  >
                    {ruleSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Kuralı Kaydet
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bu ildeki mevcut kurallar özeti */}
          {(() => {
            const cityRules = [...rulesBySource.entries()].filter(([k]) => k.startsWith(`${region.city}::`));
            if (cityRules.length === 0) return null;
            return (
              <div className="bg-[#0D1117] border border-white/[0.06] rounded-2xl p-4">
                <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3">
                  {region.city} — tanımlı görünürlük kuralları
                </p>
                <div className="space-y-1.5">
                  {cityRules.map(([key, list]) => {
                    const src = key.split('::')[1];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => openRuleEditor(src)}
                        className="w-full flex items-center gap-2 text-left bg-black/20 border border-white/[0.05] rounded-lg px-3 py-2 hover:border-purple-500/30"
                      >
                        <span className="text-[11px] font-extrabold text-white shrink-0">{src}</span>
                        <ChevronRight size={11} className="text-gray-600 shrink-0" />
                        <span className="text-[10px] text-gray-400 truncate min-w-0">
                          {list.map((r) => (r.visible_city === region.city ? r.visible_district : `${r.visible_city}/${r.visible_district}`)).join(' · ')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
};
