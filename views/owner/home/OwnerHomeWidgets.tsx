// P-REFACTOR: OwnerPanel'den SALT TAŞIMA — davranış değişmedi.
import React, { useState, useEffect } from 'react';
import { Check, Clock, Loader2, X } from 'lucide-react';
import type { HourlyOccupancyCell } from '../../../services/pitchOwnerService';

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
                    <div className="flex gap-2 shrink-0">
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
                            className="px-3.5 py-2 min-h-11 bg-red-500/20 text-red-400 text-[0.6875rem] font-bold rounded-lg hover:bg-red-500/30 active:scale-95 transition-all disabled:opacity-50"
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



export const PitchOccupancyGrid: React.FC<{
    data: HourlyOccupancyCell[];
    courtNames: string[];
    /** Bugünün çalışma penceresi — varsayılan görünür saat aralığı (00:00 kapanış = 24). */
    openHour?: number;
    closeHour?: number;
}> = ({ data, courtNames, openHour = 8, closeHour = 24 }) => {
    // Dokunmatikte hover-tooltip çalışmaz → seçili slot bilgisi (rezerve edenin adı dahil)
    // üstteki bilgi çubuğunda gösterilir.
    const [selected, setSelected] = useState<{ label: string; type: string; name: string | null } | null>(null);
    // Mobil-öncelikli: varsayılan yalnız çalışma-saati penceresi (ekrana sığar, yatay
    // kaydırma yok). "Tüm saatler" 00–24'ü açar (takvimdeki toggle ile tutarlı).
    const [showAll, setShowAll] = useState(false);

    if (courtNames.length === 0) {
        return (
            <div className="py-8 text-center">
                <p className="text-sm font-bold text-gray-400">Henüz saha eklenmedi</p>
                <p className="text-[0.6875rem] text-gray-500 mt-1">Doluluk analizini görmek için Sahalarım&apos;dan saha ekleyin.</p>
            </div>
        );
    }

    // Görünür saat penceresi. Kapanış 00:00 → 24; geçersiz/ters aralıkta güvenli varsayılan.
    const safeOpen = Number.isFinite(openHour) ? Math.max(0, Math.min(23, openHour)) : 8;
    let safeClose = Number.isFinite(closeHour) ? closeHour : 24;
    if (safeClose <= safeOpen) safeClose = 24;
    safeClose = Math.max(safeOpen + 1, Math.min(24, safeClose));
    const from = showAll ? 0 : safeOpen;
    const to = showAll ? 24 : safeClose;
    // data 0..23 saat sıralı; görünür pencereyi indeksle. Boşsa tüm güne düş.
    let visible = data.filter((_, h) => h >= from && h < to);
    if (visible.length === 0) visible = data;
    const span = visible.length;

    // Segment genişliği: "Aktif saatler" flex-1 ile ekranı doldurur (kaydırma yok);
    // "Tüm saatler" sabit genişlik + yatay kaydırma → 24 saatin hepsi ferah etiketlenir.
    const segCls = showAll ? 'w-7 shrink-0' : 'flex-1 min-w-0';
    const innerCls = showAll ? 'w-max' : 'w-full';
    // Saha adı sütunu yatay kaydırmada SABİT kalır (sticky) — hangi saha olduğu kaybolmaz.
    const nameColCls = 'sticky left-0 z-10 bg-[#161B22] w-14 shrink-0';

    return (
        <div>
            {/* Üst şerit: seçili slot bilgisi (rezerve eden) + saat penceresi toggle */}
            <div className="flex items-center justify-between gap-2 mb-3">
                {selected ? (
                    <div className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white truncate">{selected.label}</span>
                            <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md ${selected.type === 'ABONMAN' ? 'bg-blue-500/20 text-blue-300' : selected.type === 'GÜNLÜK' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-400'}`}>{selected.type}</span>
                        </div>
                        {selected.name && (
                            <p className="mt-1 text-[11px] font-bold text-gray-300 truncate">
                                <span className="text-gray-500 font-medium">Rezerve eden: </span>{selected.name}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="min-w-0 flex-1 text-[11px] text-gray-500 font-medium truncate">Bir slota dokun → rezerve edeni gör</p>
                )}
                <button
                    type="button"
                    onClick={() => { setShowAll((v) => !v); setSelected(null); }}
                    className={`shrink-0 px-2.5 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-wider transition-colors ${showAll ? 'bg-white/10 text-white border-white/20' : 'bg-[#0A0E14] text-gray-500 border-white/10 hover:text-gray-300'}`}
                >
                    {showAll ? 'Tüm saatler' : 'Aktif saatler'}
                </button>
            </div>

            {/* Zaman çizelgesi — sticky saha adı sütunu + her saat etiketli eksen.
                Aktif saatler: ekrana sığar (kaydırma yok). Tüm saatler: yatay kaydırılır,
                saha adları solda sabit kalır. */}
            <div className="relative">
                <div className="overflow-x-auto custom-scrollbar pb-1">
                    <div className={innerCls}>
                        {/* Saat ekseni: HER saat etiketli, segmentlerle birebir hizalı */}
                        <div className="flex gap-[2px] mb-1">
                            <div className={`${nameColCls} h-3`} />
                            {visible.map((item, i) => {
                                const h = parseInt(item.time, 10);
                                return (
                                    <div key={i} className={`${segCls} h-3 flex items-end justify-center`}>
                                        <span className="text-[9px] font-black text-gray-500 tabular-nums leading-none">{h}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Sahalar */}
                        <div className="space-y-2">
                            {courtNames.map((pitchName, pitchIdx) => {
                                const occupied = visible.filter((item) => item.pitches[pitchIdx]).length;
                                const pct = span > 0 ? Math.round((occupied / span) * 100) : 0;
                                return (
                                    <div key={pitchIdx} className="flex gap-[2px] items-stretch group">
                                        <div className={`${nameColCls} flex flex-col justify-center pr-2`}>
                                            <p className="text-[11px] font-bold text-gray-300 truncate leading-tight group-hover:text-white transition-colors">{pitchName}</p>
                                            <p className={`text-[9px] font-black tabular-nums leading-tight ${pct >= 50 ? 'text-emerald-400' : pct > 0 ? 'text-gray-400' : 'text-gray-600'}`}>%{pct}</p>
                                        </div>
                                        {visible.map((item, i) => {
                                            const cell = item.pitches[pitchIdx];
                                            const bookingType = cell?.type ?? null;
                                            const startH = parseInt(item.time, 10);
                                            const endH = (startH + 1) % 24;

                                            let cls = 'bg-white/[0.06] border-white/5 hover:bg-white/10';
                                            if (bookingType === 'SUB') cls = 'bg-blue-500/40 border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.2)]';
                                            else if (bookingType === 'DAILY') cls = 'bg-emerald-500/40 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.2)]';

                                            const typeLabel = bookingType === 'SUB' ? 'ABONMAN' : bookingType === 'DAILY' ? 'GÜNLÜK' : 'BOŞ';
                                            const label = `${pitchName} · ${String(startH).padStart(2, '0')}:00-${String(endH).padStart(2, '0')}:00`;
                                            const title = `${label} · ${typeLabel}${cell?.name ? ` · ${cell.name}` : ''}`;
                                            return (
                                                <button
                                                    type="button"
                                                    key={i}
                                                    onClick={() => setSelected({ label, type: typeLabel, name: cell?.name ?? null })}
                                                    className={`${segCls} h-9 rounded-[4px] border transition-all duration-200 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${cls}`}
                                                    title={title}
                                                    aria-label={title}
                                                ></button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                {/* Sağ kenar solma — "Tüm saatler"de daha fazla saat olduğunu sezdirir */}
                {showAll && (
                    <div className="pointer-events-none absolute top-0 right-0 bottom-1 w-8 bg-gradient-to-l from-[#161B22] to-transparent" />
                )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-5 px-0.5">
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
            </div>
        </div>
    );
};
