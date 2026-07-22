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
                            className="px-3.5 py-2 min-h-[40px] bg-emerald-500/20 text-emerald-400 text-[0.6875rem] font-bold rounded-lg hover:bg-emerald-500/30 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1"
                        >
                            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : (timeLeft > 0 ? 'Erken Onayla' : 'Onayla')}
                        </button>
                        <button
                            onClick={onReject}
                            disabled={isProcessing}
                            className="px-3.5 py-2 min-h-[40px] bg-red-500/20 text-red-400 text-[0.6875rem] font-bold rounded-lg hover:bg-red-500/30 active:scale-95 transition-all disabled:opacity-50"
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



export const PitchOccupancyGrid: React.FC<{ data: HourlyOccupancyCell[]; courtNames: string[] }> = ({ data, courtNames }) => {
    // FAZ3: dokunmatikte hover-tooltip (title) çalışmaz → seçili hücre bilgisi üstteki çubukta gösterilir.
    // Dolu hücrede rezerve edenin adı da gösterilir (gerçek rezervasyon verisi).
    const [selectedCell, setSelectedCell] = useState<{ label: string; type: string; name: string | null } | null>(null);

    // FAZ3: sahte "Henüz saha yok" satırı yerine gerçek boş durum.
    if (courtNames.length === 0) {
        return (
            <div className="py-8 text-center">
                <p className="text-sm font-bold text-gray-400">Henüz saha eklenmedi</p>
                <p className="text-[0.6875rem] text-gray-500 mt-1">Doluluk analizini görmek için Sahalarım&apos;dan saha ekleyin.</p>
            </div>
        );
    }
    const pitches = courtNames;
    // Başlık ve hücreler AYNI grid şablonunu paylaşır → saat etiketleri her dikdörtgenin
    // sol köşesine tam oturur, kayma olmaz. İlk sütun saha adı, kalan sütunlar saatler.
    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `5rem repeat(${data.length}, minmax(0, 1fr))`,
        columnGap: '2px',
    };

    return (
        <div>
            {/* FAZ3: dokunmatik hücre bilgisi (hover yerine) — dolu slotta rezerve edenin adı görünür */}
            {selectedCell && (
                <div className="mb-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white truncate">{selectedCell.label}</span>
                        <span className={`shrink-0 font-black px-2 py-0.5 rounded-md ${selectedCell.type === 'ABONMAN' ? 'bg-blue-500/20 text-blue-300' : selectedCell.type === 'GÜNLÜK' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-300'}`}>{selectedCell.type}</span>
                    </div>
                    {selectedCell.name && (
                        <p className="mt-1 text-[11px] font-bold text-gray-300 truncate">
                            <span className="text-gray-500 font-medium">Rezerve eden: </span>{selectedCell.name}
                        </p>
                    )}
                </div>
            )}
            <div className="w-full overflow-x-auto custom-scrollbar pb-2">
            <div className="min-w-[820px]">
                {/* Başlık: saatler — her etiket kendi sütununun SOL kenarında (dikdörtgenin başlangıç köşesi). */}
                <div style={gridStyle} className="mb-1.5 h-4 items-end">
                    <div />
                    {data.map((item, idx) => (
                        <div key={idx} className="relative h-4">
                            <span className="absolute left-0 bottom-0 -translate-x-1/2 text-[8px] font-black text-gray-500 tabular-nums leading-none">
                                {item.time.split(':')[0]}
                            </span>
                        </div>
                    ))}
                    {/* Son köşe: kapanış saati (ör. 24) — son dikdörtgenin sağ köşesi. */}
                </div>

                {/* Satırlar: sahalar */}
                <div className="space-y-2">
                    {pitches.map((pitchName, pitchIdx) => (
                        <div key={pitchIdx} style={gridStyle} className="items-center group">
                            <div className="pr-2 text-[10px] font-bold text-gray-400 truncate group-hover:text-white transition-colors">
                                {pitchName}
                            </div>
                            {data.map((item, timeIdx) => {
                                const cell = item.pitches[pitchIdx];
                                const bookingType = cell?.type ?? null;
                                const isOccupied = cell !== null && cell !== undefined;
                                const startH = item.time.split(':')[0];
                                const endH = ((parseInt(startH, 10) + 1) % 24).toString().padStart(2, '0');

                                let bgColor = 'bg-white/5';
                                let borderColor = 'border-white/5';
                                let shadow = '';

                                if (bookingType === 'SUB') {
                                    bgColor = 'bg-blue-500/40';
                                    borderColor = 'border-blue-500/50';
                                    shadow = 'shadow-[0_0_10px_rgba(59,130,246,0.2)]';
                                } else if (bookingType === 'DAILY') {
                                    bgColor = 'bg-emerald-500/40';
                                    borderColor = 'border-emerald-500/50';
                                    shadow = 'shadow-[0_0_10px_rgba(16,185,129,0.2)]';
                                }

                                const typeLabel = bookingType === 'SUB' ? 'ABONMAN' : bookingType === 'DAILY' ? 'GÜNLÜK' : 'BOŞ';
                                const cellLabel = `${pitchName} · ${startH}:00-${endH}:00`;
                                const cellTitle = `${cellLabel} · ${typeLabel}${cell?.name ? ` · ${cell.name}` : ''}`;
                                return (
                                    <button
                                        type="button"
                                        key={timeIdx}
                                        onClick={() => setSelectedCell({ label: cellLabel, type: typeLabel, name: cell?.name ?? null })}
                                        className={`h-8 rounded-md transition-all duration-300 border ${bgColor} ${borderColor} ${shadow} ${!isOccupied ? 'hover:bg-white/10' : ''} active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60`}
                                        title={cellTitle}
                                        aria-label={cellTitle}
                                    ></button>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-6 px-2">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-blue-500/40 border border-blue-500/50"></div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Abonman</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-emerald-500/40 border border-emerald-500/50"></div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Günlük</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-white/5 border border-white/5"></div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Boş</span>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
};
