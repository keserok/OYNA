// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA GÖRSELLERİ — kart + bölge bölge yönetim
// ════════════════════════════════════════════════════════════════════════════
//
// Oyuncunun ana sayfasındaki iki büyük kartın ("Saha Kirala" ve "Maç Kur" —
// ikincisi kurucu kararıyla 20 Ağu 2026'da aynı yapıya geçirildi) sağında
// duran fotoğraf. Önce YUVA (hangi kart) seçilir, sonra bölge; temelde TEK
// bir marka görseli durur, bölge bölge (il / ilçe) değiştirilebilir.
//
// ÇÖZÜMLEME KADEMESİ (sunucuda, `home_banner_for_region`, yuva başına):
//     ilçe kaydı  →  il kaydı  →  VARSAYILAN
// Yani Ordu/Altınordu için görsel koyarsan yalnız orası değişir; Ordu için
// koyarsan Ordu'nun tamamı; hiçbiri yoksa varsayılan marka görseli görünür.
//
// GÖRSEL BORU HATTI: yükleme sırasında üç boy WebP (@1x/@2x/@3x) ve bulanık
// yer tutucu (LQIP) üretilir. Üretim başarısız olursa yükleme yine de geçerli
// sayılır — fotoğraf tek boy gösterilir, panelde uyarı görünür.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Globe2, Image as ImageIcon, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { useImageUpload } from '../../../hooks/useImageUpload';

/** Ana sayfadaki görsel yuvaları — sıra, ekrandaki kart sırasıyla aynı. */
const SLOTS = [
  { value: 'PITCH_RENT', label: 'Saha Kirala kartı' },
  { value: 'MATCH_CREATE', label: 'Maç Kur kartı' },
] as const;
type SlotValue = (typeof SLOTS)[number]['value'];

interface BannerRow {
  id: string;
  city: string | null;
  district: string | null;
  source_url: string;
  storage_path: string | null;
  alt_text: string | null;
  updated_at: string;
}

interface CoverageRow {
  city: string;
  district: string | null;
}

/** Bölgenin insan okur adı. Varsayılan kaydın "bölgesi" yoktur. */
const regionLabel = (city: string | null, district: string | null): string => {
  if (!city) return 'VARSAYILAN (tüm Türkiye)';
  return district ? `${city} · ${district}` : `${city} · il geneli`;
};

/** Seçim kutusunun değeri — "il|ilçe"; boş dize = varsayılan. */
const regionValue = (city: string | null, district: string | null) =>
  city ? `${city}|${district ?? ''}` : '';

const parseRegionValue = (v: string): { city: string | null; district: string | null } => {
  if (!v) return { city: null, district: null };
  const [city, district] = v.split('|');
  return { city: city || null, district: district || null };
};

export const HomeBannersPage: React.FC = () => {
  const [rows, setRows] = useState<BannerRow[]>([]);
  const [regions, setRegions] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState('');
  const [slot, setSlot] = useState<SlotValue>('PITCH_RENT');
  const slotLabel = SLOTS.find((s) => s.value === slot)?.label ?? slot;

  // Üç boy + LQIP burada üretilir. `pitch-rent-banner` klasörü ayrı: bu
  // görseller bir sahaya değil, BÖLGEYE aittir.
  const { uploadImageDetailed, uploading, progress } = useImageUpload('home-banners', {
    withVariants: true,
    // Bant 148px genişliğinde görünür ama ekranın sağ yarısını kaplar; 16:9
    // kırpma diğer vitrin görselleriyle aynı dili konuşur.
    aspectRatio: 16 / 9,
    minWidth: 1280,
  });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [banners, coverage] = await Promise.all([
        supabase
          .from('home_banners')
          .select('id, city, district, source_url, storage_path, alt_text, updated_at')
          .eq('slot', slot)
          .eq('is_active', true)
          .order('city', { nullsFirst: true })
          .order('district', { nullsFirst: true }),
        supabase
          .from('region_coverage')
          .select('city, district')
          .eq('is_active', true)
          .order('city')
          .order('sort_order'),
      ]);
      if (banners.error) throw banners.error;
      if (coverage.error) throw coverage.error;
      setRows((banners.data ?? []) as BannerRow[]);
      setRegions((coverage.data ?? []) as CoverageRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıtlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [slot]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Seçim listesi: varsayılan + kapsamdaki her il (il geneli) + her ilçe.
   * `region_coverage` tek kaynaktır — burada elle il listesi tutulmaz.
   */
  const options = useMemo(() => {
    const out: { value: string; label: string }[] = [{ value: '', label: regionLabel(null, null) }];
    const cities = Array.from(new Set(regions.map((r) => r.city)));
    for (const city of cities) {
      out.push({ value: regionValue(city, null), label: regionLabel(city, null) });
      for (const r of regions.filter((x) => x.city === city && x.district)) {
        out.push({ value: regionValue(city, r.district), label: regionLabel(city, r.district) });
      }
    }
    return out;
  }, [regions]);

  const onPick = async (file: File | null | undefined) => {
    if (!file) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { url, storagePath, variantsReady } = await uploadImageDetailed(file);
      const { city, district } = parseRegionValue(target);
      const { error: e } = await supabase.rpc('admin_upsert_home_banner', {
        p_city: city,
        p_district: district,
        p_source_url: url,
        p_storage_path: storagePath,
        p_alt_text: null,
        p_slot: slot,
      });
      if (e) throw e;
      setNotice(
        variantsReady
          ? `${slotLabel} · ${regionLabel(city, district)} görseli güncellendi.`
          : `${slotLabel} · ${regionLabel(city, district)} görseli güncellendi — fakat küçük boylar üretilemedi, fotoğraf tek boy gösterilecek.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Görsel kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: BannerRow) => {
    // Varsayılan kayıt silinirse hiçbir bölgede görsel kalmaz; ekran o zaman
    // bandı hiç çizmez (kart boş zeminle durur, kırılmaz).
    const soru = row.city
      ? `${slotLabel} · ${regionLabel(row.city, row.district)} görseli kaldırılsın mı? Bu bölge bir üst kademeye düşer.`
      : `${slotLabel} varsayılan görseli kaldırılsın mı? Kendi görseli olmayan bölgelerde kart fotoğrafsız kalır.`;
    if (!window.confirm(soru)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { error: e } = await supabase.rpc('admin_delete_home_banner', { p_id: row.id });
      if (e) throw e;
      setNotice('Görsel kaldırıldı.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaldırılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const working = busy || uploading;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-white flex items-center gap-2">
            <ImageIcon size={20} className="text-emerald-400" />
            Ana Sayfa Görselleri
          </h1>
          <p className="mt-1 text-sm text-gray-400 max-w-2xl">
            Oyuncunun ana sayfasında “Saha Kirala” ve “Maç Kur” kartlarının
            sağında duran fotoğraflar. Önce kartı, sonra bölgeyi seç; görsel
            koymadığın her yer bir üst kademeye düşer:{' '}
            <strong className="text-gray-200">ilçe → il → varsayılan</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={working}
          className="shrink-0 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Yenile
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* ── Yuva seçimi: hangi kartın görseli? ──────────────────────────── */}
      <div role="tablist" aria-label="Kart seç" className="inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
        {SLOTS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={slot === s.value}
            disabled={working}
            onClick={() => setSlot(s.value)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50 ${
              slot === s.value ? 'bg-emerald-500/20 text-emerald-200' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Yükleme ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Görsel Ata — {slotLabel}</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={working}
            aria-label="Bölge seç"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {options.map((o) => (
              <option key={o.value || 'default'} value={o.value}>{o.label}</option>
            ))}
          </select>

          <label className={`flex shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm ${working ? 'cursor-not-allowed border-white/10 text-gray-500' : 'cursor-pointer border-white/25 text-gray-200 hover:border-white/50 hover:bg-white/5'}`}>
            {working ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
            {uploading ? `Yükleniyor… %${progress}` : 'Fotoğraf Seç'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={working}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';   // aynı dosya ikinci kez seçilebilsin
                void onPick(f);
              }}
            />
          </label>
        </div>
        <p className="text-xs text-gray-500">
          En az 1280px genişlik önerilir; 16:9 oranına kırpılır. Yükleme sırasında
          üç ayrı boy ve bulanık önizleme otomatik üretilir.
        </p>
      </section>

      {/* ── Mevcut kayıtlar ─────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
          Tanımlı Görseller — {slotLabel} ({rows.length})
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" /> Yükleniyor…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-gray-400">
            <Globe2 size={22} className="mx-auto mb-2 text-gray-600" />
            Henüz görsel yok. Varsayılanı atadığında tüm bölgelerde o görünür.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                <img
                  src={r.source_url}
                  alt=""
                  className="h-16 w-28 shrink-0 rounded-lg object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">
                    {regionLabel(r.city, r.district)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {new Date(r.updated_at).toLocaleString('tr-TR')}
                    {!r.storage_path && ' · küçük boylar yok'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onDelete(r)}
                  disabled={working}
                  aria-label={`${regionLabel(r.city, r.district)} görselini kaldır`}
                  className="shrink-0 rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default HomeBannersPage;
