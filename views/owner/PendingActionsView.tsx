// P-REFACTOR: OwnerPanel'den SALT TAŞIMA — davranış değişmedi.
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, RefreshCw, Users, X } from 'lucide-react';
import { useOwnerToast } from './components/useOwnerToast';
import { LoadingState, EmptyState } from '../../components/common/StatusState';
import { supabase } from '../../supabaseClient';
import { approveBooking, rejectBooking, getPitchAppMatches, toTurkishError } from '../../services/pitchOwnerService';

interface RealPendingBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  customer_name: string | null;
  price: number;
  deposit_amount: number;
  source: string;
  courts: { name: string } | null;
}

const RealPendingBookings: React.FC<{ pitchId: string | null }> = ({ pitchId }) => {
    const notify = useOwnerToast();
    const [rows, setRows] = useState<RealPendingBooking[]>([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = React.useCallback(async () => {
        if (!pitchId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('pitch_bookings')
                .select('id, booking_date, start_time, end_time, customer_name, price, deposit_amount, source, courts(name)')
                .eq('pitch_id', pitchId)
                .eq('status', 'PENDING')
                .in('source', ['APP_BOOKING', 'APP_MATCH'])
                .order('booking_date', { ascending: true })
                .order('start_time', { ascending: true });
            if (error) throw error;
            setRows((data ?? []) as unknown as RealPendingBooking[]);
        } catch (err) {
            notify(toTurkishError(err), 'error');
        } finally {
            setLoading(false);
        }
    }, [pitchId, notify]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!pitchId) return;
        const channel = supabase
            .channel(`owner-pending-${pitchId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pitch_bookings', filter: `pitch_id=eq.${pitchId}` }, () => load())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [pitchId, load]);

    const handle = async (id: string, action: 'APPROVE' | 'REJECT') => {
        setBusyId(id);
        try {
            if (action === 'APPROVE') {
                await approveBooking(id);
            } else {
                await rejectBooking(id, 'Tesis sahibi rezervasyonu onaylamadı.');
            }
            setRows(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            notify(toTurkishError(err), 'error');
        } finally {
            setBusyId(null);
        }
    };

    if (!pitchId) return null;

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Clock size={16} className="text-[#FACC15]" /> Uygulama Talepleri
                    {rows.length > 0 && <span className="bg-[#FACC15] text-black text-[10px] px-2 py-0.5 rounded-full">{rows.length}</span>}
                </h3>
                <button onClick={load} className="text-gray-400 hover:text-white" title="Yenile"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
            </div>
            {loading ? (
                <div className="bg-[#161B22] border border-white/5 rounded-2xl">
                    <LoadingState message="Yükleniyor..." size="sm" />
                </div>
            ) : rows.length === 0 ? (
                <div className="bg-[#161B22] border border-white/5 rounded-2xl">
                    <EmptyState title="Bekleyen Talep Yok" message="Onay bekleyen uygulama rezervasyonu bulunmuyor." />
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map(b => (
                        <div key={b.id} className="bg-[#161B22] border border-orange-500/20 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <p className="text-sm font-black text-white">{b.courts?.name ?? 'Saha'} · {b.start_time.slice(0,5)}-{b.end_time.slice(0,5)}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{new Date(b.booking_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })}{b.price > 0 ? ` · ₺${b.price}` : ''}</p>
                                </div>
                                <span className="text-[9px] font-black px-2 py-1 rounded-full bg-orange-500/15 text-orange-400 uppercase">Bekliyor</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    disabled={busyId === b.id}
                                    onClick={() => handle(b.id, 'REJECT')}
                                    className="py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-black uppercase hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                >
                                    Reddet
                                </button>
                                <button
                                    disabled={busyId === b.id}
                                    onClick={() => handle(b.id, 'APPROVE')}
                                    className="py-2.5 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] text-xs font-black uppercase hover:bg-[#39FF14]/20 transition-colors disabled:opacity-50"
                                >
                                    {busyId === b.id ? '...' : 'Onayla'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

interface PendingActionsViewProps {
    pendingRequests: any[];
    realPitchId?: string | null;
    autoApprove?: boolean;
    onToggleAutoApprove?: () => void;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onBack: () => void;
}

export const PendingActionsView: React.FC<PendingActionsViewProps> = ({ pendingRequests, realPitchId, autoApprove, onToggleAutoApprove, onApprove, onReject, onBack }) => {
    const notify = useOwnerToast();
    const [subTab, setSubTab] = useState<'REQUESTS' | 'PUBLIC_MATCHES'>('REQUESTS');
    const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
    const [publicMatches, setPublicMatches] = useState<Array<{
        id: string;
        title: string;
        pitchName: string;
        time: string;
        price: number;
        maxPlayers: number;
        joinedPlayers: number;
        status: string;
    }>>([]);
    const [matchesLoading, setMatchesLoading] = useState(false);

    const loadPublicMatches = React.useCallback(async () => {
        if (!realPitchId) {
            setPublicMatches([]);
            return;
        }
        setMatchesLoading(true);
        try {
            const rows = await getPitchAppMatches(realPitchId);
            setPublicMatches(rows);
        } catch (err) {
            notify(toTurkishError(err), 'error');
            setPublicMatches([]);
        } finally {
            setMatchesLoading(false);
        }
    }, [realPitchId, notify]);

    useEffect(() => {
        if (subTab === 'PUBLIC_MATCHES') loadPublicMatches();
    }, [subTab, loadPublicMatches]);

    const activeRequests = pendingRequests.filter(r => r.status === 'PENDING' && !r.source?.startsWith('APP_'));

    return (
        <div className="flex-1 bg-[#0A0E14] text-slate-200 font-sans flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-[#161B22] border-b border-white/5 flex items-center gap-3">
                <button onClick={onBack} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-base font-black text-white italic uppercase tracking-tight">TALEPLER & AÇIK MAÇLAR</h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Sahada oluşturulan organizasyonlar</p>
                </div>
            </div>

            {/* Sub Tabs */}
            <div className="flex p-1.5 bg-[#161B22] m-4 rounded-2xl border border-white/5 shadow-inner">
                <button
                    onClick={() => setSubTab('REQUESTS')}
                    className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${
                        subTab === 'REQUESTS' 
                        ? 'bg-[#FACC15] text-black shadow-lg scale-[1.02]' 
                        : 'text-gray-500 hover:text-white'
                    }`}
                >
                    <Clock size={16} /> Talepler ({activeRequests.length})
                </button>
                <button
                    onClick={() => setSubTab('PUBLIC_MATCHES')}
                    className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${
                        subTab === 'PUBLIC_MATCHES' 
                        ? 'bg-[#FACC15] text-black shadow-lg scale-[1.02]' 
                        : 'text-gray-500 hover:text-white'
                    }`}
                >
                    <Users size={16} /> Oyuncu Maçları ({publicMatches.length})
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-24">
                {subTab === 'REQUESTS' && realPitchId && onToggleAutoApprove && (
                    <div className="bg-[#161B22] border border-white/5 rounded-2xl p-4 mb-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-black text-white">Otomatik Onay</p>
                            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                                {autoApprove
                                    ? 'Açık: talepler süre sonunda otomatik onaylanır.'
                                    : 'Kapalı: her talebi elle onaylaman gerekir.'}
                            </p>
                        </div>
                        <button
                            onClick={onToggleAutoApprove}
                            className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${autoApprove ? 'bg-[#39FF14]' : 'bg-gray-600'}`}
                            aria-label="Otomatik onay aç/kapa"
                        >
                            <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${autoApprove ? 'translate-x-6' : ''}`} />
                        </button>
                    </div>
                )}
                {subTab === 'REQUESTS' && <RealPendingBookings pitchId={realPitchId ?? null} />}
                {subTab === 'REQUESTS' ? (
                    activeRequests.length > 0 ? (
                        <div className="space-y-4">
                            {activeRequests.map((req) => (
                                <div key={req.id} className="bg-[#161B22] border border-white/5 rounded-3xl p-5 shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 bg-yellow-500 h-full"></div>
                                    <div className="flex justify-between items-start mb-4 pl-2">
                                        <div>
                                            <h4 className="text-base font-black text-white">{req.title}</h4>
                                            <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">{req.subtitle}</p>
                                        </div>
                                        <div className="bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 rounded-xl text-[10px] text-yellow-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-ping"></span>
                                            Onay Bekliyor
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pl-2">
                                        <button
                                            onClick={() => onApprove(req.id)}
                                            className="flex-1 py-3 bg-green-500 text-black font-black text-xs rounded-xl hover:bg-green-400 active:scale-95 transition-all shadow-lg shadow-green-900/10"
                                        >
                                            REZERVE ET & ONAYLA
                                        </button>
                                        <button
                                            onClick={() => onReject(req.id)}
                                            className="px-6 py-3 bg-red-500/10 border border-red-500/20 text-red-500 font-bold text-xs rounded-xl hover:bg-red-500 hover:text-white active:scale-95 transition-all"
                                        >
                                            REDDET
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Clock size={48} className="text-gray-600 mb-4" />
                            <p className="text-base font-bold text-gray-400">Bekleyen Rezervasyon Talebi Bulunmuyor</p>
                            <p className="text-xs text-gray-500 mt-1 max-w-[280px]">Oyuncular uygulamanız üzerinden yer ayırttığında burada listelenecektir.</p>
                        </div>
                    )
                ) : publicMatches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Users size={48} className="text-gray-600 mb-4" />
                        <p className="text-base font-bold text-gray-400">
                            {matchesLoading ? 'Yükleniyor...' : 'Bu tesiste açık oyuncu maçı yok'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 max-w-[280px]">
                            Uygulama üzerinden bu sahaya bağlı maçlar burada listelenir.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {publicMatches.map((match) => {
                            const isFull = match.maxPlayers > 0 && match.joinedPlayers >= match.maxPlayers;
                            const percentage = match.maxPlayers > 0
                                ? Math.round((match.joinedPlayers / match.maxPlayers) * 100)
                                : 0;

                            return (
                                <div 
                                    key={match.id} 
                                    className="bg-[#161B22] border border-white/5 rounded-3xl p-5 shadow-xl relative overflow-hidden group hover:border-[#FACC15]/30 transition-all animate-in fade-in duration-300"
                                >
                                    <div className={`absolute top-0 left-0 w-1 h-full ${isFull ? 'bg-emerald-500' : 'bg-[#FACC15]'}`}></div>
                                    
                                    <div className="flex justify-between items-start mb-4 pl-2">
                                        <div>
                                            <span className="text-[9px] font-black uppercase bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-400 tracking-widest">{match.pitchName}</span>
                                            <h4 className="text-base font-black text-white mt-2 leading-tight">{match.title}</h4>
                                            <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase">{match.time}</p>
                                        </div>
                                        <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${
                                            match.status === 'COMPLETED' || match.status === 'READY'
                                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                                            : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
                                        }`}>
                                            {match.status === 'COMPLETED' ? 'TAMAMLANDI' : isFull ? 'MAÇ HAZIR' : 'KADRO KURULUYOR'}
                                        </div>
                                    </div>

                                    <div className="mb-2 pl-2 space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-black uppercase">
                                            <span className="text-gray-500">Kadro Doluluk</span>
                                            <span className={isFull ? 'text-emerald-400' : 'text-white'}>{match.joinedPlayers} / {match.maxPlayers || '—'} OYUNCU</span>
                                        </div>
                                        {match.maxPlayers > 0 && (
                                            <div className="h-2 w-full bg-black/20 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-[#FACC15] shadow-[0_0_8px_rgba(250,204,21,0.3)]'}`} 
                                                    style={{ width: `${percentage}%` }}
                                                ></div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center pl-2 pt-4 border-t border-white/5">
                                        <span className="text-sm font-black text-emerald-400 font-mono">
                                            {match.price > 0 ? `₺${match.price.toLocaleString('tr-TR')}` : 'Ücretsiz'}
                                        </span>
                                        <button 
                                            onClick={() => setSelectedMatch(match)}
                                            className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-wider"
                                        >
                                            DETAY
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Selected Match Details Modal */}
            {selectedMatch && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-[#161B22] w-full max-w-md rounded-[32px] border border-white/10 p-6 animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-black text-white italic uppercase tracking-tight">{selectedMatch.title}</h3>
                                <p className="text-xs text-gray-400 mt-1 uppercase font-bold">{selectedMatch.pitchName} • {selectedMatch.time}</p>
                            </div>
                            <button onClick={() => setSelectedMatch(null)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>

                        <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl mb-6 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 font-bold uppercase text-[10px]">Durum</span>
                                <span className="text-white font-black">{selectedMatch.status}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 font-bold uppercase text-[10px]">Oyuncu</span>
                                <span className="text-white font-black">{selectedMatch.joinedPlayers} / {selectedMatch.maxPlayers || '—'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 font-bold uppercase text-[10px]">Ücret</span>
                                <span className="text-emerald-400 font-black font-mono">₺{Number(selectedMatch.price || 0).toLocaleString('tr-TR')}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setSelectedMatch(null)}
                            className="w-full py-4 bg-[#FACC15] text-black font-black text-sm rounded-2xl hover:bg-yellow-300 active:scale-95 transition-all uppercase tracking-wider text-center"
                        >
                            KAPAT
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
