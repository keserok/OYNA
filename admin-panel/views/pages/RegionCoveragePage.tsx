import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { MapPin, Check, X, RefreshCw, Globe2 } from 'lucide-react';
import { supabase } from '../../../supabaseClient';

interface CoverageRow {
  id: string;
  city: string;
  district: string | null;
  is_active: boolean;
  has_boundary: boolean;
  sort_order: number;
}

/**
 * Bölge kapsama yönetimi — hangi il/ilçe hizmet kapsamında (aktif) ve sınırı var mı.
 * Keşif haritası sarı sınırları + bölge seçici bu tablodan (region_coverage) beslenir.
 */
export const RegionCoveragePage: React.FC = () => {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: e } = await supabase
        .from('region_coverage')
        .select('id, city, district, is_active, boundary, sort_order')
        .order('city').order('sort_order');
      if (e) throw e;
      setRows(((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        city: r.city as string,
        district: (r.district as string | null) ?? null,
        is_active: !!r.is_active,
        has_boundary: r.boundary != null,
        sort_order: (r.sort_order as number) ?? 0,
      })));
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw.includes('row-level security') ? 'Bu verilere erişim için ADMIN yetkisi gerekli.' : 'Kapsama verisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (row: CoverageRow) => {
    setSavingId(row.id); setError(null);
    // İyimser güncelleme
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
    const { error: e } = await supabase.from('region_coverage').update({ is_active: !row.is_active }).eq('id', row.id);
    if (e) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: row.is_active } : r)));
      setError('Güncellenemedi: ' + e.message);
    }
    setSavingId(null);
  };

  const byCity = useMemo(() => {
    const m: Record<string, CoverageRow[]> = {};
    rows.forEach((r) => { (m[r.city] ??= []).push(r); });
    return m;
  }, [rows]);

  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Globe2 size={22} className="text-yellow-400" /> Bölge Kapsama</h1>
          <p className="text-sm text-gray-400 mt-1">
            Hizmet kapsamındaki il/ilçeler. Aktif bölgeler keşif haritasında sarı sınırla çizilir ve kullanıcının bölge seçiminde görünür.
          </p>
          <p className="text-[11px] text-gray-500 mt-1">{activeCount}/{rows.length} bölge aktif · sınır verisi olanlar haritada çizilir</p>
        </div>
        <button onClick={() => void load()} className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/10">
          <RefreshCw size={13} /> Yenile
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">{error}</div>}

      {loading ? (
        <div className="text-gray-500 text-sm py-10 text-center">Yükleniyor…</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-500 text-sm py-10 text-center">Henüz kapsama bölgesi tanımlı değil.</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byCity).map(([city, items]) => (
            <div key={city}>
              <h2 className="text-xs font-extrabold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><MapPin size={12} /> {city}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((r) => (
                  <div key={r.id} className={`flex items-center justify-between p-3 rounded-xl border ${r.is_active ? 'bg-[#161B22] border-white/10' : 'bg-[#0D1117] border-white/5 opacity-70'}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{r.district ?? 'Tüm il'}</div>
                      <div className={`text-[10px] font-bold ${r.has_boundary ? 'text-green-400' : 'text-gray-500'}`}>
                        {r.has_boundary ? '● Sınır verisi var' : '○ Sınır verisi yok'}
                      </div>
                    </div>
                    <button
                      onClick={() => toggle(r)}
                      disabled={savingId === r.id}
                      className={`shrink-0 flex items-center gap-1 px-3 h-8 rounded-lg text-[11px] font-extrabold uppercase tracking-wide transition-colors ${r.is_active ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-white/5 text-gray-400 border border-white/10'}`}
                    >
                      {r.is_active ? <><Check size={12} /> Aktif</> : <><X size={12} /> Kapalı</>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
