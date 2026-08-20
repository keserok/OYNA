/**
 * TÜRKİYE KUTUCUK HARİTASI — 81 ilin coğrafyaya yakın dizilmiş stilize haritası.
 *
 * Gerçek sınır çizimi (GeoJSON) yerine kutucuk (tile) harita bilinçli tercih:
 * her il eşit boyutta tıklanabilir bir hedef olur, Doğu'nun büyük illeri
 * Marmara'nın küçük illerini ezmez ve harita hiçbir dış veriye muhtaç olmadan
 * her ekranda okunaklı kalır. Konumlar yaklaşık coğrafyadır (komşuluk hissi
 * korunur); veri kaynağı data/turkeyRegions.ts ile birebir aynı il adlarıdır.
 */
import React from 'react';
import { TURKEY_REGIONS } from '../../../data/turkeyRegions';

/** İl → kutucuk konumu (sütun, satır). 17 sütun × 7 satır stilize ızgara. */
const PROVINCE_TILES: Record<string, { c: number; r: number }> = {
  // Satır 0 — Trakya kuzeyi + Karadeniz kıyısı
  'Kırklareli': { c: 1, r: 0 }, 'İstanbul': { c: 3, r: 0 }, 'Kocaeli': { c: 4, r: 0 },
  'Sakarya': { c: 5, r: 0 }, 'Düzce': { c: 6, r: 0 }, 'Zonguldak': { c: 7, r: 0 },
  'Bartın': { c: 8, r: 0 }, 'Kastamonu': { c: 9, r: 0 }, 'Sinop': { c: 10, r: 0 },
  'Samsun': { c: 11, r: 0 }, 'Ordu': { c: 12, r: 0 }, 'Giresun': { c: 13, r: 0 },
  'Trabzon': { c: 14, r: 0 }, 'Rize': { c: 15, r: 0 }, 'Artvin': { c: 16, r: 0 },
  // Satır 1
  'Edirne': { c: 0, r: 1 }, 'Tekirdağ': { c: 1, r: 1 }, 'Yalova': { c: 2, r: 1 },
  'Bursa': { c: 3, r: 1 }, 'Bilecik': { c: 4, r: 1 }, 'Bolu': { c: 5, r: 1 },
  'Karabük': { c: 7, r: 1 }, 'Çankırı': { c: 8, r: 1 }, 'Çorum': { c: 9, r: 1 },
  'Amasya': { c: 10, r: 1 }, 'Tokat': { c: 11, r: 1 }, 'Gümüşhane': { c: 13, r: 1 },
  'Bayburt': { c: 14, r: 1 }, 'Kars': { c: 15, r: 1 }, 'Ardahan': { c: 16, r: 1 },
  // Satır 2
  'Çanakkale': { c: 0, r: 2 }, 'Balıkesir': { c: 1, r: 2 }, 'Kütahya': { c: 3, r: 2 },
  'Eskişehir': { c: 4, r: 2 }, 'Ankara': { c: 6, r: 2 }, 'Kırıkkale': { c: 7, r: 2 },
  'Yozgat': { c: 8, r: 2 }, 'Sivas': { c: 10, r: 2 }, 'Erzincan': { c: 12, r: 2 },
  'Erzurum': { c: 14, r: 2 }, 'Ağrı': { c: 15, r: 2 }, 'Iğdır': { c: 16, r: 2 },
  // Satır 3
  'İzmir': { c: 0, r: 3 }, 'Manisa': { c: 1, r: 3 }, 'Uşak': { c: 2, r: 3 },
  'Afyonkarahisar': { c: 3, r: 3 }, 'Kırşehir': { c: 7, r: 3 }, 'Nevşehir': { c: 8, r: 3 },
  'Kayseri': { c: 9, r: 3 }, 'Malatya': { c: 11, r: 3 }, 'Elazığ': { c: 12, r: 3 },
  'Tunceli': { c: 13, r: 3 }, 'Bingöl': { c: 14, r: 3 }, 'Muş': { c: 15, r: 3 },
  'Van': { c: 16, r: 3 },
  // Satır 4
  'Aydın': { c: 0, r: 4 }, 'Denizli': { c: 1, r: 4 }, 'Burdur': { c: 2, r: 4 },
  'Isparta': { c: 3, r: 4 }, 'Konya': { c: 5, r: 4 }, 'Aksaray': { c: 7, r: 4 },
  'Niğde': { c: 8, r: 4 }, 'Kahramanmaraş': { c: 10, r: 4 }, 'Adıyaman': { c: 11, r: 4 },
  'Diyarbakır': { c: 12, r: 4 }, 'Batman': { c: 13, r: 4 }, 'Bitlis': { c: 14, r: 4 },
  'Siirt': { c: 15, r: 4 }, 'Hakkari': { c: 16, r: 4 },
  // Satır 5
  'Muğla': { c: 0, r: 5 }, 'Antalya': { c: 2, r: 5 }, 'Karaman': { c: 5, r: 5 },
  'Mersin': { c: 7, r: 5 }, 'Adana': { c: 8, r: 5 }, 'Osmaniye': { c: 9, r: 5 },
  'Gaziantep': { c: 10, r: 5 }, 'Şanlıurfa': { c: 11, r: 5 }, 'Mardin': { c: 12, r: 5 },
  'Şırnak': { c: 14, r: 5 },
  // Satır 6 — Akdeniz güney ucu
  'Hatay': { c: 9, r: 6 }, 'Kilis': { c: 10, r: 6 },
};

export interface ProvinceState {
  /** Aktif kapsam satırı sayısı (il geneli + ilçeler). */
  activeCount: number;
  /** Tanımlı (aktif+kapalı) kapsam satırı sayısı. */
  totalRows: number;
  /** Bu ilde görünürlük kuralı tanımlı ilçe sayısı. */
  ruleCount: number;
}

interface Props {
  states: Record<string, ProvinceState>;
  selected: string | null;
  onSelect: (city: string) => void;
}

const COLS = 17;
const ROWS = 7;

export const TurkeyTileMap: React.FC<Props> = ({ states, selected, onSelect }) => {
  // Konumu tanımsız kalan il olursa (katalog güncellenir de harita unutulursa)
  // hiçbir il KAYBOLMASIN: alt yedek şeride sırayla dizilir.
  const unplaced = TURKEY_REGIONS.filter((r) => !PROVINCE_TILES[r.city]);

  return (
    <div className="w-full overflow-x-auto custom-scrollbar">
      <div className="min-w-[860px]">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${ROWS}, 44px)` }}
        >
          {TURKEY_REGIONS.map((region) => {
            const tile = PROVINCE_TILES[region.city];
            if (!tile) return null;
            const st = states[region.city];
            const aktif = (st?.activeCount ?? 0) > 0;
            const tanimli = (st?.totalRows ?? 0) > 0;
            const isSelected = selected === region.city;
            return (
              <button
                key={region.city}
                type="button"
                onClick={() => onSelect(region.city)}
                title={`${region.city} (${region.plate})${aktif ? ` — ${st!.activeCount} aktif bölge` : tanimli ? ' — kapsam kapalı' : ' — kapsam dışı'}${st?.ruleCount ? ` · ${st.ruleCount} görünürlük kuralı` : ''}`}
                style={{ gridColumnStart: tile.c + 1, gridRowStart: tile.r + 1 }}
                className={`relative rounded-md border text-[8px] font-extrabold uppercase leading-none flex flex-col items-center justify-center gap-0.5 px-0.5 transition-all ${
                  isSelected
                    ? 'border-[#39FF14] bg-[#39FF14]/20 text-white shadow-[0_0_14px_rgba(57,255,20,0.35)] scale-105 z-10'
                    : aktif
                      ? 'border-[#39FF14]/40 bg-[#39FF14]/[0.08] text-[#8effa0] hover:bg-[#39FF14]/[0.16]'
                      : tanimli
                        ? 'border-amber-500/30 bg-amber-500/[0.05] text-amber-200/70 hover:bg-amber-500/[0.12]'
                        : 'border-white/[0.07] bg-white/[0.02] text-gray-600 hover:text-gray-300 hover:border-white/20'
                }`}
              >
                <span className="truncate max-w-full">{region.city}</span>
                {aktif && <span className="text-[7px] font-mono text-[#39FF14]">{st!.activeCount}</span>}
                {(st?.ruleCount ?? 0) > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_5px_rgba(192,132,252,0.9)]" title="Görünürlük kuralı var" />
                )}
              </button>
            );
          })}
        </div>

        {unplaced.length > 0 && (
          <div className="mt-2 flex gap-1 flex-wrap">
            {unplaced.map((r) => (
              <button
                key={r.city}
                type="button"
                onClick={() => onSelect(r.city)}
                className={`h-[44px] px-2 rounded-md border text-[8px] font-extrabold uppercase ${selected === r.city ? 'border-[#39FF14] bg-[#39FF14]/20 text-white' : 'border-white/[0.07] bg-white/[0.02] text-gray-600'}`}
              >
                {r.city}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 mt-3 text-[9px] font-bold text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#39FF14]/25 border border-[#39FF14]/50" /> Aktif kapsam</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/15 border border-amber-500/40" /> Tanımlı ama kapalı</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/[0.03] border border-white/15" /> Kapsam dışı</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Görünürlük kuralı</span>
        </div>
      </div>
    </div>
  );
};
