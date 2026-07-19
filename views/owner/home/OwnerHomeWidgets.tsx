// P-REFACTOR: OwnerPanel'den SALT TAŞIMA — davranış değişmedi.
import React, { useState, useEffect } from 'react';
import { Check, Clock, X } from 'lucide-react';
import type { HourlyOccupancyCell } from '../../../services/pitchOwnerService';

export const MatchCountdownItem: React.FC<{
    request: any;
    onApprove: () => void;
    onReject: () => void;
}> = ({ request, onApprove, onReject }) => {
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

    return (
        <div className={`border p-4 rounded-xl flex flex-col gap-3 transition-colors ${isApproved ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-[#0A0E14] border-white/5'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className={`text-sm font-bold ${isApproved ? 'text-emerald-400' : 'text-white'}`}>{request.title}</p>
                    <p className="text-xs text-gray-400">{request.subtitle}</p>
                </div>
                {request.status === 'PENDING' && timeLeft > 0 && (
                    <div className="flex gap-2">
                        <button onClick={onApprove} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg hover:bg-emerald-500/30">Erken Onayla</button>
                        <button onClick={onReject} className="px-3 py-1.5 bg-red-500/20 text-red-400 text-[10px] font-bold rounded-lg hover:bg-red-500/30">Reddet</button>
                    </div>
                )}
            </div>
            
            <div className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${request.status === 'PENDING' && timeLeft > 0 ? 'bg-orange-500/10 border-orange-500/20' : isApproved ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-red-500/10 border-red-500/20'}`}>
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                        {request.status === 'PENDING' ? 'Maçın onaylanması için kalan süre' : 'Talep Durumu'}
                    </span>
                    {request.status === 'PENDING' && timeLeft > 0 ? (
                        <span className="text-sm font-black text-orange-400 flex items-center gap-1">
                            <Clock size={14} className="animate-pulse" /> 
                            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                        </span>
                    ) : isApproved ? (
                        <span className="text-sm font-black text-emerald-400 flex items-center gap-1">
                            <Check size={14} /> {timeLeft === 0 ? 'Otomatik Onaylandı' : 'Onaylandı'}
                        </span>
                    ) : (
                        <span className="text-sm font-black text-red-400 flex items-center gap-1">
                            <X size={14} /> Reddedildi
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
    const pitches = courtNames.length > 0 ? courtNames : ['Henüz saha yok'];
    // Başlık ve hücreler AYNI grid şablonunu paylaşır → saat etiketleri her dikdörtgenin
    // sol köşesine tam oturur, kayma olmaz. İlk sütun saha adı, kalan sütunlar saatler.
    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `5rem repeat(${data.length}, minmax(0, 1fr))`,
        columnGap: '2px',
    };

    return (
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
                                const bookingType = item.pitches[pitchIdx];
                                const isOccupied = bookingType !== null;
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

                                return (
                                    <div
                                        key={timeIdx}
                                        className={`h-8 rounded-md transition-all duration-300 border ${bgColor} ${borderColor} ${shadow} ${!isOccupied ? 'hover:bg-white/10' : ''}`}
                                        title={`${pitchName} · ${startH}:00-${endH}:00 · ${bookingType === 'SUB' ? 'ABONMAN' : bookingType === 'DAILY' ? 'GÜNLÜK' : 'BOŞ'}`}
                                    ></div>
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
    );
};
