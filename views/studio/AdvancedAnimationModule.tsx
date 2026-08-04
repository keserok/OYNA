// ⚡ GELİŞMİŞ ANİMASYON MODÜLÜ (lazy-loaded / on-demand indirilir)
//
// MİMARİ: Çekirdek stüdyo HAFİF kalır. Top & oyuncu hareketi animasyonu,
// oynatma motoru, sekans/timeline ve ağır framer-motion zamanlama hesabı
// (getAnimationProps) BURADA yaşar. Kullanıcı stüdyoda "⚡ Gelişmiş Animasyon"
// butonuna basınca React.lazy ile bu chunk indirilir ve mount edilir.
//
// Bu modül üç parça export eder:
//  - getAnimationProps: framer-motion keyframe zamanlama hesabı. Çekirdek pitch
//    bunu, animasyon yüklüyken slot/rakip markörlerini hareket ettirmek için
//    kullanır (orijinal davranış birebir korunur).
//  - AnimationToolbar: simülasyon kontrolleri (OYNAT ⇄ DURDUR, topu göster/gizle,
//    sıralı/eşzamanlı oynatma).
//  - default AdvancedAnimationModule: saha üzerine binen top animasyonu +
//    sekans rozet/timeline editörü (additive overlay).

import React from 'react';
import { motion } from 'framer-motion';
import { Play, Square, Check, X, Trash2, Plus } from 'lucide-react';
import type { DrawingLine, PlayMode, SeqInfo } from './types';

// --- Ağır animasyon zamanlama hesabı (framer-motion keyframe üretimi) ---
// fadeOutsideWindow: yalnız TOP markörü için — SIRALI oynatmada top, kendi pas
// penceresi dışında gizlenir (sahada aynı anda tek top hissi). Oyuncu markörleri
// bu bayrağı GEÇMEZ; koşu bitince oldukları yerde görünür kalırlar.
export const getAnimationProps = (
    path: DrawingLine,
    isSimulating: boolean,
    playMode: PlayMode,
    seqInfo: SeqInfo,
    totalSeqDur: number,
    fadeOutsideWindow = false
) => {
    if (!isSimulating || !path) return { animate: {}, transition: {} };
    const pathDur = seqInfo.duration;
    const totalCycle = playMode === 'SEQ' ? Math.max(0.1, totalSeqDur) : pathDur;
    const startTime = playMode === 'SEQ' ? seqInfo.startTime : 0;

    let times: number[] = [];
    let lefts: string[] = [];
    let tops: string[] = [];
    const opacities: number[] = [];

    if (playMode === 'SEQ') {
        const normalizedStart = startTime / totalCycle;
        const normalizedEnd = (startTime + pathDur) / totalCycle;
        const EPS = 0.015; // ani belirme/kaybolma için pencere kenarı payı
        const startLeft = `${path.points[0].x}%`;
        const startTop = `${path.points[0].y}%`;
        const endLeft = `${path.points[path.points.length - 1].x}%`;
        const endTop = `${path.points[path.points.length - 1].y}%`;

        if (normalizedStart > 0) {
            times.push(0);
            lefts.push(startLeft);
            tops.push(startTop);
            opacities.push(0);
            if (fadeOutsideWindow && normalizedStart > EPS) {
                // pencere açılana dek görünmez kal (yumuşak sızma yerine anlık belirme)
                times.push(normalizedStart - EPS);
                lefts.push(startLeft);
                tops.push(startTop);
                opacities.push(0);
            }
        }

        path.points.forEach((p, idx) => {
            const fraction = idx / Math.max(1, path.points.length - 1);
            times.push(normalizedStart + fraction * (normalizedEnd - normalizedStart));
            lefts.push(`${p.x}%`);
            tops.push(`${p.y}%`);
            opacities.push(1);
        });

        if (normalizedEnd < 1) {
            if (fadeOutsideWindow && normalizedEnd + EPS < 1) {
                times.push(normalizedEnd + EPS);
                lefts.push(endLeft);
                tops.push(endTop);
                opacities.push(0);
            }
            times.push(1);
            lefts.push(endLeft);
            tops.push(endTop);
            opacities.push(fadeOutsideWindow ? 0 : 1);
        }
    } else {
        lefts = path.points.map(p => `${p.x}%`);
        tops = path.points.map(p => `${p.y}%`);
    }

    return {
        animate: {
            left: lefts,
            top: tops,
            ...(fadeOutsideWindow && playMode === 'SEQ' ? { opacity: opacities } : {})
        },
        transition: {
            duration: totalCycle,
            ease: "linear",
            // OYNAT başına toplam İKİ tur (ilk + 1 tekrar); sonra çekirdekteki
            // otomatik durdurma (PLAY_TIMES zamanlayıcısı) simülasyonu kapatır.
            repeat: 1,
            repeatType: "loop" as const,
            ...(playMode === 'SEQ' && { times })
        }
    };
};

// --- Simülasyon Toolbar Kontrolleri ---
interface AnimationToolbarProps {
    isSimulating: boolean;
    /** DURDUR ile dondurulmuş mu (madde 18). */
    simPaused?: boolean;
    /** Rota sonuna ulaşıldı mı → buton "TEKRAR OYNAT". */
    simEnded?: boolean;
    /** OYNAT/DURDUR/DEVAM tek giriş noktası (durum makinesi Studio'da). */
    onPlayPause: () => void;
    /** Simülasyondan çıkıp düzenlemeye dön (sim aktifken görünür). */
    onExit?: () => void;
    showBall: boolean;
    setShowBall: (v: boolean) => void;
    playMode: PlayMode;
    setPlayMode: (fn: (p: PlayMode) => PlayMode) => void;
}

export const AnimationToolbar: React.FC<AnimationToolbarProps> = ({
    isSimulating, simPaused = false, simEnded = false, onPlayPause, onExit, showBall, setShowBall, playMode, setPlayMode
}) => {
    const playing = isSimulating && !simPaused && !simEnded; // şu an ilerliyor
    const label = playing ? 'DURDUR' : (simPaused ? 'DEVAM' : (simEnded ? 'TEKRAR OYNAT' : 'OYNAT'));
    const title = playing ? 'Taktiği durdur (olduğu yerde dondur)' : (simPaused ? 'Kaldığı yerden devam et' : 'Taktiği oynat');
    return (
    <>
        <button
            onClick={onPlayPause}
            title={title}
            aria-label={title}
            className={`shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-full text-xs font-extrabold transition-all whitespace-nowrap shadow-lg ${playing ? 'bg-red-500 text-white shadow-red-500/30' : 'bg-[#FACC15] text-black shadow-[#FACC15]/30 hover:scale-105'}`}
        >
            {playing ? (
                <><Square size={14} className="fill-current" /> {label}</>
            ) : (
                <><Play size={14} className="fill-current" /> {label}</>
            )}
        </button>
        {/* Düzenlemeye dön — yalnız oynatma sırasında görünen ek buton; araç
            çubuğunun 3. satırı en kalabalık haliyle dar telefonda (360px) da
            sığsın diye yazısız ve bir tık küçük. */}
        {isSimulating && onExit && (
            <button
                onClick={onExit}
                title="Düzenlemeye dön"
                aria-label="Düzenlemeye dön"
                className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-all bg-white/5 text-gray-300 hover:bg-white/10"
            >
                <X size={14} />
            </button>
        )}
        {/* Top ve oynatma sırası — araç çubuğunun 3. satırına sığsın diye yazısız;
            ne yaptıkları aria-label/title ile korunur, durum renkle okunur
            (top açıkken turuncu, sıralı oynatmada mor). */}
        <button
            onClick={() => setShowBall(!showBall)}
            title={showBall ? 'Topu gizle' : 'Topu göster'}
            aria-label={showBall ? 'Topu gizle' : 'Topu göster'}
            className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-sm transition-all shadow-lg ${showBall ? 'bg-orange-500 text-white shadow-orange-500/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
        >
            ⚽
        </button>
        <button
            onClick={() => setPlayMode(p => p === 'SYNC' ? 'SEQ' : 'SYNC')}
            className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-sm transition-all shadow-lg ${playMode === 'SEQ' ? 'bg-indigo-500 text-white shadow-indigo-500/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
            title={playMode === 'SEQ' ? 'Sıralı oynatılıyor — eşzamanlıya geç' : 'Eşzamanlı oynatılıyor — sıralıya geç'}
            aria-label={playMode === 'SEQ' ? 'Sıralı oynatılıyor — eşzamanlıya geç' : 'Eşzamanlı oynatılıyor — sıralıya geç'}
        >
            {playMode === 'SEQ' ? '🔄' : '👥'}
        </button>
    </>
    );
};

// --- Saha içine binen ağır oynatma katmanı (top animasyonu + sekans editörü) ---
interface AdvancedAnimationModuleProps {
    drawings: DrawingLine[];
    isSimulating: boolean;
    /** DURDUR ile dondurulmuş mu? true → top olduğu yerde durur (madde 18). */
    simPaused?: boolean;
    showBall: boolean;
    playMode: PlayMode;
    seqMap: Map<string, SeqInfo>;
    totalSeqDuration: number;
    selectedSeqBadge: string | null;
    setSelectedSeqBadge: (id: string | null) => void;
    isCustomSeqInputOpen: boolean;
    setIsCustomSeqInputOpen: (v: boolean) => void;
    customSeqValue: string;
    setCustomSeqValue: (v: string) => void;
    setDrawings: (fn: (prev: DrawingLine[]) => DrawingLine[]) => void;
    hideLines?: boolean;
    /** BİZ/RAKİP katmanı: pasif tarafın çizgileri — rozetleri soluk ve kilitli. */
    mutedLineIds?: string[];
}

const AdvancedAnimationModule: React.FC<AdvancedAnimationModuleProps> = ({
    drawings, isSimulating, simPaused = false, showBall, playMode,
    seqMap, totalSeqDuration, selectedSeqBadge, setSelectedSeqBadge,
    isCustomSeqInputOpen, setIsCustomSeqInputOpen, customSeqValue, setCustomSeqValue,
    setDrawings, hideLines, mutedLineIds
}) => {
    // ── TEK TOP + ZİNCİR (madde 19) + DONDUR/DEVAM (madde 18) ────────────────
    // Sahada YALNIZCA BİR top var: sıralı pas oklarını (seqStep) tek bir birleşik
    // rota olarak baştan sona kat eder. Hareket, CSS @keyframes ile sürülür;
    // DURDUR → animation-play-state:paused (top OLDUĞU YERDE donar), OYNAT →
    // running (kaldığı yerden devam). rAF/React churn'ü yok.
    const passChain = drawings.filter(d => d.type === 'arrow').slice().sort((a, b) => a.seqStep - b.seqStep);
    const chainPoints = passChain.flatMap(p => p.points);
    const ballDur = Math.max(0.4, totalSeqDuration || passChain.reduce((m, p) => Math.max(m, seqMap.get(p.id)?.duration || 0), 0) || 2);
    const ballKeyframes = chainPoints.length >= 2
        ? chainPoints.map((p, i) => `${((i / (chainPoints.length - 1)) * 100).toFixed(2)}%{left:${p.x}%;top:${p.y}%}`).join('')
        : '';
    return (
        <>
            {/* Tek top: birleşik zincir rotası boyunca CSS keyframe animasyonu */}
            {isSimulating && showBall && ballKeyframes && (
                <>
                    <style>{`@keyframes oyBallChain{${ballKeyframes}}`}</style>
                    <div
                        key={`ball-chain-${passChain.length}-${chainPoints.length}`}
                        className="absolute w-4 h-4 z-[60] bg-white rounded-full flex items-center justify-center text-[0.6875rem] shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                        style={{
                            transform: 'translate(-50%, -50%)',
                            left: `${chainPoints[0].x}%`,
                            top: `${chainPoints[0].y}%`,
                            animation: `oyBallChain ${ballDur}s linear forwards`,
                            animationPlayState: simPaused ? 'paused' : 'running',
                        }}
                    >
                        ⚽
                    </div>
                </>
            )}

            {/* Sekans Rozetleri (timeline sıralama editörü) — "Sadece Hareket" açıkken gizlenir.
                Pasif katmanın (BİZ/RAKİP) rozetleri soluk ve kilitli: genel adım akışı okunur
                ama düzenleme yalnız aktif tarafta yapılır. */}
            {playMode === 'SEQ' && !hideLines && drawings.map((line) => {
                const midIdx = Math.floor(line.points.length / 2);
                const midPoint = line.points[midIdx];
                if (!midPoint) return null;
                const isMuted = !!mutedLineIds?.includes(line.id);
                const isSelected = !isMuted && selectedSeqBadge === line.id;
                return (
                    <div
                        key={`badge-${line.id}`}
                        className={`absolute z-[70] ${isMuted ? 'opacity-40' : ''}`}
                        style={{ left: `${midPoint.x}%`, top: `${midPoint.y}%`, transform: 'translate(-50%, -50%)' }}
                    >
                        <div
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                if (isMuted) return;
                                setSelectedSeqBadge(isSelected ? null : line.id);
                                setIsCustomSeqInputOpen(false);
                            }}
                            className={`bg-indigo-500 text-white font-extrabold rounded-full w-6 h-6 flex items-center justify-center text-xs border-2 border-indigo-900 shadow-[0_0_10px_rgba(99,102,241,0.8)] transition-all ${isMuted ? 'pointer-events-none' : `cursor-pointer pointer-events-auto ${isSelected ? 'scale-125 bg-white text-indigo-500' : 'hover:bg-white hover:text-indigo-500 hover:scale-110'}`}`}
                            title={isMuted ? undefined : 'Sırayı Ayarla'}
                        >
                            {line.seqStep || 1}
                        </div>

                        {isSelected && (
                            <div
                                className="absolute top-10 left-1/2 -translate-x-1/2 bg-[#161B22] border border-white/10 rounded-xl p-2 shadow-2xl flex gap-1 pointer-events-auto"
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                {isCustomSeqInputOpen ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            autoFocus
                                            value={customSeqValue}
                                            onChange={e => setCustomSeqValue(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && customSeqValue && !isNaN(Number(customSeqValue))) {
                                                    setDrawings(prev => prev.map(d => d.id === line.id ? { ...d, seqStep: Number(customSeqValue) } : d));
                                                    setSelectedSeqBadge(null);
                                                    setIsCustomSeqInputOpen(false);
                                                }
                                            }}
                                            className="w-12 h-8 bg-black/50 text-white text-xs font-bold text-center rounded-lg border border-white/20 outline-none focus:border-[#39FF14]"
                                            placeholder="#"
                                        />
                                        <button
                                            onPointerDown={(e) => {
                                                e.stopPropagation();
                                                if (customSeqValue && !isNaN(Number(customSeqValue))) {
                                                    setDrawings(prev => prev.map(d => d.id === line.id ? { ...d, seqStep: Number(customSeqValue) } : d));
                                                    setSelectedSeqBadge(null);
                                                    setIsCustomSeqInputOpen(false);
                                                }
                                            }}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-[#39FF14]/20 text-[#39FF14] hover:bg-[#39FF14] hover:text-black transition-all"
                                            title="Onayla"
                                        >
                                            <Check size={14} />
                                        </button>
                                        <button
                                            onPointerDown={(e) => {
                                                e.stopPropagation();
                                                setIsCustomSeqInputOpen(false);
                                            }}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-white/5 text-gray-400 hover:bg-red-500/20 hover:text-red-500 transition-all"
                                            title="İptal"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {Array.from(new Set(drawings.map(d => d.seqStep || 1))).sort((a: any, b: any) => a - b).map((step: number) => (
                                            <button
                                                key={`set-${step}`}
                                                onPointerDown={(e) => {
                                                    e.stopPropagation();
                                                    setDrawings(prev => prev.map(d => d.id === line.id ? { ...d, seqStep: step } : d));
                                                    setSelectedSeqBadge(null);
                                                }}
                                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${(line.seqStep || 1) === step ? 'bg-indigo-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
                                            >
                                                {step}
                                            </button>
                                        ))}
                                        <button
                                            onPointerDown={(e) => {
                                                e.stopPropagation();
                                                setDrawings(prev => prev.filter(d => d.id !== line.id));
                                                setSelectedSeqBadge(null);
                                            }}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-white/5 text-gray-400 hover:bg-red-500/20 hover:text-red-500 transition-all ml-1"
                                            title="Koşuyu Sil"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        <button
                                            onPointerDown={(e) => {
                                                e.stopPropagation();
                                                setIsCustomSeqInputOpen(true);
                                                setCustomSeqValue('');
                                            }}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-white/5 text-gray-400 hover:bg-[#39FF14]/20 hover:text-[#39FF14] transition-all ml-1"
                                            title="Özel Sıra Numarası Gir"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
};

export default AdvancedAnimationModule;
