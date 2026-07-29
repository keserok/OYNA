// P-REFACTOR: OwnerPanel'den SALT TAŞIMA — davranış değişmedi.
import React, { useState, useEffect } from 'react';
import { Check, Clock, Loader2, X } from 'lucide-react';
import type { DayOccupancyGrid, OccupancySlotBar } from '../../../services/pitchOwnerService';

export const MatchCountdownItem: React.FC<{
    request: any;
    onApprove: () => void;
    onReject: () => void;
    isProcessing?: boolean;
}> = ({ request, onApprove, onReject, isProcessing = false }) => {
    const [timeLeft, setTimeLeft] = useState(request.timerSeconds || (request.timerMinutes ? request.timerMinutes * 60 : 0));

    // OP-P1-9: istemci sayacı SADECE GÖRSEL geri sayımdır — sıfıra inince
    // otomatik onaylamaz. Otomatik onay kararı sunucu cron'una aittir
    // (auto_approve_pending_bookings), ki o auto_approve_enabled toggle'ına ve
    // dakikaya saygılıdır. Eski istemci-onayı toggle'ı yok sayıyor ve yalnız
    // ekran açıkken çalışıyordu (çelişkili/eksik onay). Erken onay hâlâ elle.
    useEffect(() => {
        if (request.status !== 'PENDING') return;
        const timerId = setInterval(() => {
            setTimeLeft((prev: number) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(timerId);
    }, [request.id, request.status]);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    
    const isApproved = request.status === 'APPROVED';
    const isRejected = request.status === 'REJECTED';
    const isPending = request.status === 'PENDING';
    const timerActive = isPending && timeLeft > 0;

    return (
        <div className={`border p-4 rounded-xl flex flex-col gap-3 transition-colors ${isApproved ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-[#0A0E14] border-white/5'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className={`text-sm font-bold ${isApproved ? 'text-emerald-400' : 'text-white'}`}>{request.title}</p>
                    <p className="text-xs text-gray-400">{request.subtitle}</p>
                </div>
                {request.status === 'PENDING' && (
                    // FAZ1: butonlar süre bitse de görünür (talep sunucuda hâlâ beklemede);
                    // istemci sayacı 0'a inince aksiyon kaybolmaz. İşlenirken kilitli + spinner.
                    <div className="flex gap-3 shrink-0">
                        <button
                            onClick={onApprove}
                            disabled={isProcessing}
                            className="px-3.5 py-2 min-h-11 bg-emerald-500/20 text-emerald-400 text-[0.6875rem] font-bold rounded-lg hover:bg-emerald-500/30 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1"
                        >
                            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : (timeLeft > 0 ? 'Erken Onayla' : 'Onayla')}
                        </button>
                        <button
                            onClick={onReject}
                            disabled={isProcessing}
                            // BULGU-121: yıkıcı aksiyon dolu blok olmamalı — çerçeveli/dolgusuz,
                            // onaydan 12px uzakta (yanlış dokunuş azalsın).
                            className="px-3.5 py-2 min-h-11 bg-transparent border border-[#F87171]/30 text-[#F87171] text-[0.6875rem] font-bold rounded-lg hover:bg-[#F87171]/10 active:scale-95 transition-all disabled:opacity-50"
                        >
                            Reddet
                        </button>
                    </div>
                )}
            </div>
            
            <div className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                timerActive ? 'bg-orange-500/10 border-orange-500/20'
                : isApproved ? 'bg-emerald-500/20 border-emerald-500/30'
                : isRejected ? 'bg-red-500/10 border-red-500/20'
                : 'bg-blue-500/10 border-blue-500/20'
            }`}>
                <div className="flex flex-col">
                    <span className="text-[0.6875rem] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                        {isPending ? (timerActive ? 'Maçın onaylanması için kalan süre' : 'Otomatik onay bekleniyor') : 'Talep Durumu'}
                    </span>
                    {timerActive ? (
                        <span className="text-sm font-black text-orange-400 flex items-center gap-1 tabular-nums">
                            <Clock size={14} className="animate-pulse" />
                            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                        </span>
                    ) : isApproved ? (
                        <span className="text-sm font-black text-emerald-400 flex items-center gap-1">
                            <Check size={14} /> Onaylandı
                        </span>
                    ) : isRejected ? (
                        <span className="text-sm font-black text-red-400 flex items-center gap-1">
                            <X size={14} /> Reddedildi
                        </span>
                    ) : (
                        // FAZ1: istemci sayacı bitti ama talep hâlâ PENDING — sunucu otomatik onayını
                        // bekliyor. Eskiden yanlışlıkla "Reddedildi" gösteriliyordu (para kaybı).
                        <span className="text-sm font-black text-blue-300 flex items-center gap-1">
                            <Clock size={14} className="animate-pulse" /> Onay bekleniyor
                        </span>
                    )}
                </div>
                {request.status === 'PENDING' && timeLeft > 0 && (
                    <span className="text-[9px] font-medium text-gray-500 max-w-[120px] text-right">
                        Süre bitince otomatik onaylanacaktır.
                    </span>
                )}
            </div>
        </div>
    );
};



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
const TUM_SAATLER_PX_SAAT = 30;

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

    // Yüzde konumlama: dikdörtgenin GENİŞLİĞİ = süresi / pencere. Böylece 90
    // dakikalık slot 60'lığın tam 1,5 katı olur ve kortlar arası saat hizası bozulmaz.
    const yuzde = (dakika: number) => (dakika / span) * 100;

    // Saat çizgileri — pencere içindeki her tam saat.
    const ilkSaat = Math.ceil(from / 60);
    const sonSaat = Math.floor(to / 60);
    const saatler: number[] = [];
    for (let h = ilkSaat; h <= sonSaat; h++) saatler.push(h * 60);
    // Dar pencerede etiketler üst üste binmesin: 12 saatten uzun görünümde 2'de bir.
    const etiketAdimi = span > 12 * 60 ? 2 : 1;

    // "Aktif saatler" ekrana sığar (kaydırma yok); "Tüm saatler" yatay kaydırılır.
    const seritStyle: React.CSSProperties = showAll
        ? { width: `${Math.round((span / 60) * TUM_SAATLER_PX_SAAT)}px` }
        : { width: '100%' };
    const innerCls = showAll ? 'w-max' : 'w-full';
    const seritCls = showAll ? 'shrink-0' : 'flex-1 min-w-0';
    // Saha adı sütunu yatay kaydırmada SABİT kalır (sticky) — hangi saha olduğu kaybolmaz.
    const nameColCls = 'sticky left-0 z-10 bg-[#161B22] w-14 shrink-0';

    return (
        <div>
            {/* Üst şerit: seçili slot bilgisi (rezerve eden + GERÇEK süre) + saat penceresi toggle */}
            <div className="flex items-center justify-between gap-2 mb-3">
                {selected ? (
                    <div className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white truncate">{selected.label}</span>
                            <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md ${selected.type === 'ABONMAN' ? 'bg-blue-500/20 text-blue-300' : selected.type === 'GÜNLÜK' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-400'}`}>{selected.type}</span>
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
                    className={`shrink-0 px-2.5 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-wider transition-colors ${showAll ? 'bg-white/10 text-white border-white/20' : 'bg-[#0A0E14] text-gray-500 border-white/10 hover:text-gray-300'}`}
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
                                {saatler.map((dk, i) => {
                                    if (i % etiketAdimi !== 0) return null;
                                    const sol = yuzde(dk - from);
                                    return (
                                        <span
                                            key={dk}
                                            className="absolute bottom-0 text-[9px] font-black text-gray-500 tabular-nums leading-none"
                                            style={{ left: `${sol}%`, transform: sol < 2 ? 'none' : 'translateX(-50%)' }}
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
                                        <p className={`text-[9px] font-black tabular-nums leading-tight ${row.occupancyPercent >= 50 ? 'text-emerald-400' : row.occupancyPercent > 0 ? 'text-gray-400' : 'text-gray-600'}`}>%{row.occupancyPercent}</p>
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
                                            const sol = yuzde(slot.offsetMinutes - from);
                                            const gen = yuzde(slot.minutes);
                                            if (sol >= 100 || sol + gen <= 0) return null;
                                            return (
                                                <button
                                                    type="button"
                                                    key={`${slot.offsetMinutes}-${slot.minutes}`}
                                                    onClick={() => setSelected({ label, sure: slot.minutes, type: typeLabel, name: slot.cell?.name ?? null })}
                                                    className={`absolute top-0 bottom-0 rounded-[4px] border transition-all duration-200 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${cls}`}
                                                    style={{ left: `${Math.max(0, sol)}%`, width: `calc(${Math.min(gen, 100 - Math.max(0, sol))}% - 2px)` }}
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
                    <div className="pointer-events-none absolute top-0 right-0 bottom-1 w-8 bg-gradient-to-l from-[#161B22] to-transparent" />
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
