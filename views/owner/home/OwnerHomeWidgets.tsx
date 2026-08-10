// P-REFACTOR: OwnerPanel'den SALT TAŞIMA — davranış değişmedi.
import React, { useState } from 'react';
import type { DayOccupancyGrid, OccupancySlotBar } from '../../../services/pitchOwnerService';

// ─── SLOT-3 — DOLULUK ŞERİDİ ────────────────────────────────────────────────
// Dikdörtgenler SABİT değil, slotun GERÇEK süresiyle orantılıdır: 90 dakikalık
// slot 60'lıktan bir buçuk kat uzun çizilir. Süre tek kaynaktan gelir
// (pitch_tariffs.slot_minutes → shared/slotGrid → sunucudaki get_pitch_slots).
// Zaman ekseni YATAY olduğu için "boy" = genişliktir; dikey eksen kortlardır.
// Aynı gün içinde farklı tarife pencereleri farklı süre verebilir (sabah 60,
// akşam 90) — her dikdörtgen kendi süresini taşır, gün-boyu tek adım yoktur.

/** Şerit yüksekliği (px) — kort satırının kendisi; süreyi TEMSİL ETMEZ. */
const SERIT_YUKSEKLIGI = 36;
/** "Tüm saatler" görünümünde bir saatin piksel karşılığı (yatay kaydırma). */
// Zaman ekseninin ölçeği: bir saat kaç piksel. TEK ölçek — hem "Aktif saatler"
// hem "Tüm saatler" aynı genişlikte çizilir, ikisi de yatay kaydırılır.
// Ekrana sıkıştırma YOK: sıkıştırılan şeritte 90 dakikalık dilim saat
// etiketleriyle hizasını kaybediyor ve dar telefonda okunmuyordu.
// 72px/saat → 90 dakikalık dilim 108px, 60 dakikalık 72px (tam 1,5 katı).
const PX_SAAT = 72;

export const PitchOccupancyGrid: React.FC<{
    /** Tarifeden türetilmiş günlük şerit (services/pitchOwnerService.buildDayOccupancyGrid). */
    grid: DayOccupancyGrid;
}> = ({ grid }) => {
    // Dokunmatikte hover-tooltip çalışmaz → seçili slot bilgisi (rezerve edenin adı dahil)
    // üstteki bilgi çubuğunda gösterilir.
    const [selected, setSelected] = useState<{ label: string; sure: number; type: string; name: string | null } | null>(null);
    // Mobil-öncelikli: varsayılan yalnız tarifenin kapsadığı pencere (ekrana sığar,
    // yatay kaydırma yok). "Tüm saatler" 00–24'ü açar (takvimdeki toggle ile tutarlı).
    const [showAll, setShowAll] = useState(false);

    if (grid.rows.length === 0) {
        return (
            <div className="py-8 text-center">
                <p className="text-sm font-bold text-gray-400">Henüz saha eklenmedi</p>
                <p className="text-[0.6875rem] text-gray-500 mt-1">Doluluk analizini görmek için Sahalarım&apos;dan saha ekleyin.</p>
            </div>
        );
    }

    const bosSerit = grid.rows.every((r) => r.slots.length === 0);

    // Görünür pencere. "Aktif saatler" = tarifenin gerçekten kapsadığı aralık;
    // "Tüm saatler" = 00:00–24:00 (gece yarısını aşan slot varsa o kadar uzar).
    const from = showAll ? 0 : grid.startMinutes;
    const to = showAll ? Math.max(1440, grid.endMinutes) : grid.endMinutes;
    const span = Math.max(1, to - from);

    // DOĞRUSAL PİKSEL KONUMLAMA. Dakika → piksel tek bir ölçekten geçer; saat
    // etiketleri de dilimler de AYNI fonksiyonu kullanır. Bu yüzden "13" etiketi
    // neredeyse dilim tam oradan başlar, 90 dakikalıksa 14 ile 15'in tam
    // ortasında biter — hiza matematiksel olarak garanti.
    const px = (dakika: number) => (dakika / 60) * PX_SAAT;

    // Saat çizgileri — pencere içindeki HER tam saat. Atlama yok: eskiden 12
    // saatten uzun görünümde 2'de bir etiket basılıyordu, şerit "ikişer ikişer"
    // görünüyor ve dilimlerle ilişkisi kopuyordu. Sabit ölçekte yer bol,
    // etiketler üst üste binmiyor.
    const ilkSaat = Math.ceil(from / 60);
    const sonSaat = Math.floor(to / 60);
    const saatler: number[] = [];
    for (let h = ilkSaat; h <= sonSaat; h++) saatler.push(h * 60);

    // Her iki kip de sabit genişlikte ve yatay kaydırılır (ferah görünüm).
    const toplamPx = px(span);
    const seritStyle: React.CSSProperties = { width: `${Math.round(toplamPx)}px` };
    const innerCls = 'w-max';
    const seritCls = 'shrink-0';
    // Saha adı sütunu yatay kaydırmada SABİT kalır (sticky) — hangi saha olduğu kaybolmaz.
    const nameColCls = 'sticky left-0 z-10 bg-surface-1 w-14 shrink-0';

    return (
        <div>
            {/* Üst şerit: seçili slot bilgisi (rezerve eden + GERÇEK süre) + saat penceresi toggle */}
            <div className="flex items-center justify-between gap-2 mb-3">
                {selected ? (
                    <div className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white truncate">{selected.label}</span>
                            <span className={`shrink-0 text-[10px] font-extrabold px-2 py-0.5 rounded-md ${selected.type === 'ABONMAN' ? 'bg-blue-500/20 text-blue-300' : selected.type === 'GÜNLÜK' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-400'}`}>{selected.type}</span>
                        </div>
                        <p className="mt-1 text-[11px] font-bold text-gray-300 truncate">
                            <span className="text-gray-500 font-medium">Süre: </span>{selected.sure} dakika
                            {selected.name && (
                                <>
                                    <span className="text-gray-600"> · </span>
                                    <span className="text-gray-500 font-medium">Rezerve eden: </span>{selected.name}
                                </>
                            )}
                        </p>
                    </div>
                ) : (
                    <p className="min-w-0 flex-1 text-[11px] text-gray-500 font-medium truncate">Bir slota dokun → süresini ve rezerve edeni gör</p>
                )}
                <button
                    type="button"
                    onClick={() => { setShowAll((v) => !v); setSelected(null); }}
                    className={`shrink-0 px-2.5 py-1.5 rounded-full border text-[9px] font-extrabold uppercase tracking-wider transition-colors ${showAll ? 'bg-white/10 text-white border-white/20' : 'bg-bg text-gray-500 border-white/10 hover:text-gray-300'}`}
                >
                    {showAll ? 'Tüm saatler' : 'Aktif saatler'}
                </button>
            </div>

            {bosSerit && (
                <p className="mb-3 text-[11px] font-medium text-gray-500">
                    Bugün için tanımlı slot yok — Aktif saatler ve ücretler bölümünden tarife ekleyin.
                </p>
            )}

            {/* Zaman çizelgesi — sticky saha adı sütunu + tam saat ekseni.
                Aktif saatler: ekrana sığar (kaydırma yok). Tüm saatler: yatay kaydırılır,
                saha adları solda sabit kalır. */}
            <div className="relative">
                <div className="overflow-x-auto custom-scrollbar pb-1">
                    <div className={innerCls}>
                        {/* Saat ekseni — dikdörtgenlerle birebir aynı ölçekte konumlanır */}
                        <div className="flex gap-[2px] mb-1">
                            <div className={`${nameColCls} h-3`} />
                            <div className={`${seritCls} relative h-3`} style={seritStyle}>
                                {saatler.map((dk) => {
                                    const sol = px(dk - from);
                                    return (
                                        <span
                                            key={dk}
                                            className="absolute bottom-0 text-[10px] font-extrabold text-gray-500 tabular-nums leading-none"
                                            // Etiket, temsil ettiği ANIN tam üstünde durur; dilim de
                                            // aynı noktadan başlar. Sıfır noktasında sola taşmasın diye
                                            // yalnız ilk etiket ortalanmaz.
                                            style={{ left: `${sol}px`, transform: sol < 6 ? 'none' : 'translateX(-50%)' }}
                                        >
                                            {Math.floor((dk % 1440) / 60)}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Sahalar */}
                        <div className="space-y-2">
                            {grid.rows.map((row) => (
                                <div key={row.courtId} className="flex gap-[2px] items-stretch group">
                                    <div className={`${nameColCls} flex flex-col justify-center pr-2`}>
                                        <p className="text-[11px] font-bold text-gray-300 truncate leading-tight group-hover:text-white transition-colors">{row.courtName}</p>
                                        <p className={`text-[9px] font-extrabold tabular-nums leading-tight ${row.occupancyPercent >= 50 ? 'text-emerald-400' : row.occupancyPercent > 0 ? 'text-gray-400' : 'text-gray-600'}`}>%{row.occupancyPercent}</p>
                                    </div>
                                    <div
                                        className={`${seritCls} relative rounded-[4px] bg-white/[0.015]`}
                                        style={{ ...seritStyle, height: SERIT_YUKSEKLIGI }}
                                    >
                                        {row.slots.map((slot: OccupancySlotBar) => {
                                            const bookingType = slot.cell?.type ?? null;
                                            let cls = 'bg-white/[0.06] border-white/5 hover:bg-white/10';
                                            if (bookingType === 'SUB') cls = 'bg-blue-500/40 border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.2)]';
                                            else if (bookingType === 'DAILY') cls = 'bg-emerald-500/40 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.2)]';

                                            const typeLabel = bookingType === 'SUB' ? 'ABONMAN' : bookingType === 'DAILY' ? 'GÜNLÜK' : 'BOŞ';
                                            const label = `${row.courtName} · ${slot.startTime}-${slot.endTime}`;
                                            const title = `${label} · ${slot.minutes} dakika · ${typeLabel}${slot.cell?.name ? ` · ${slot.cell.name}` : ''}`;
                                            // Pencerenin dışına taşan dilim kırpılır (gece taşması "Tüm saatler"de görünür).
                                            const sol = px(slot.offsetMinutes - from);
                                            const gen = px(slot.minutes);
                                            if (sol >= toplamPx || sol + gen <= 0) return null;
                                            return (
                                                <button
                                                    type="button"
                                                    key={`${slot.offsetMinutes}-${slot.minutes}`}
                                                    onClick={() => setSelected({ label, sure: slot.minutes, type: typeLabel, name: slot.cell?.name ?? null })}
                                                    className={`absolute top-0 bottom-0 rounded-[4px] border transition-all duration-200 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${cls}`}
                                                    // Genişlik TAM süredir; kırpma dışında hiçbir şey düşülmez.
                                                    // Eskiden 2px boşluk düşülüyordu ve oran bozuluyordu
                                                    // (90/60 = 1,514 çıkıyordu, 1,5 değil). Komşu dilimler
                                                    // artık kendi kenarlıklarıyla ayrılıyor: hem tam hizalı
                                                    // hem birbirinden ayırt edilebilir.
                                                    style={{ left: `${Math.max(0, sol)}px`, width: `${Math.max(0, Math.min(gen, toplamPx - Math.max(0, sol)))}px` }}
                                                    title={title}
                                                    aria-label={title}
                                                    data-slot-minutes={slot.minutes}
                                                    data-slot-start={slot.startTime}
                                                ></button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                {/* Sağ kenar solma — "Tüm saatler"de daha fazla saat olduğunu sezdirir */}
                {showAll && (
                    <div className="pointer-events-none absolute top-0 right-0 bottom-1 w-8 bg-gradient-to-l from-surface-1 to-transparent" />
                )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-5 px-0.5">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-blue-500/40 border border-blue-500/50"></div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Abonman</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-emerald-500/40 border border-emerald-500/50"></div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Günlük</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-white/[0.06] border border-white/5"></div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Boş</span>
                </div>
                {/* E3(a): süreye tam bölünmeyen artık slot ÜRETMEZ — şeritte boşluk kalır. */}
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-white/[0.015] border border-white/5"></div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Slot yok</span>
                </div>
            </div>
        </div>
    );
};
