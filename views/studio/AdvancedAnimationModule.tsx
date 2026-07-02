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
//  - AnimationToolbar: simülasyon kontrolleri (OYNAT/SIFIRLA, topu göster/gizle,
//    sıralı/eşzamanlı oynatma).
//  - default AdvancedAnimationModule: saha üzerine binen top animasyonu +
//    sekans rozet/timeline editörü (additive overlay).

import React from 'react';
import { motion } from 'framer-motion';
import { Play, Square, Check, X, Trash2, Plus } from 'lucide-react';
import type { DrawingLine, PlayMode, SeqInfo } from './types';

// --- Ağır animasyon zamanlama hesabı (framer-motion keyframe üretimi) ---
export const getAnimationProps = (
    path: DrawingLine,
    isSimulating: boolean,
    playMode: PlayMode,
    seqInfo: SeqInfo,
    totalSeqDur: number
) => {
    if (!isSimulating || !path) return { animate: {}, transition: {} };
    const pathDur = seqInfo.duration;
    const totalCycle = playMode === 'SEQ' ? Math.max(0.1, totalSeqDur) : pathDur;
    const startTime = playMode === 'SEQ' ? seqInfo.startTime : 0;

    let times: number[] = [];
    let lefts: string[] = [];
    let tops: string[] = [];

    if (playMode === 'SEQ') {
        const normalizedStart = startTime / totalCycle;
        const normalizedEnd = (startTime + pathDur) / totalCycle;

        if (normalizedStart > 0) {
            times.push(0);
            lefts.push(`${path.points[0].x}%`);
            tops.push(`${path.points[0].y}%`);
        }

        path.points.forEach((p, idx) => {
            const fraction = idx / Math.max(1, path.points.length - 1);
            times.push(normalizedStart + fraction * (normalizedEnd - normalizedStart));
            lefts.push(`${p.x}%`);
            tops.push(`${p.y}%`);
        });

        if (normalizedEnd < 1) {
            times.push(1);
            lefts.push(`${path.points[path.points.length - 1].x}%`);
            tops.push(`${path.points[path.points.length - 1].y}%`);
        }
    } else {
        lefts = path.points.map(p => `${p.x}%`);
        tops = path.points.map(p => `${p.y}%`);
    }

    return {
        animate: { left: lefts, top: tops },
        transition: {
            duration: totalCycle,
            ease: "linear",
            repeat: Infinity,
            repeatType: "loop" as const,
            ...(playMode === 'SEQ' && { times })
        }
    };
};

// --- Simülasyon Toolbar Kontrolleri ---
interface AnimationToolbarProps {
    isSimulating: boolean;
    setIsSimulating: (v: boolean) => void;
    showBall: boolean;
    setShowBall: (v: boolean) => void;
    playMode: PlayMode;
    setPlayMode: (fn: (p: PlayMode) => PlayMode) => void;
}

export const AnimationToolbar: React.FC<AnimationToolbarProps> = ({
    isSimulating, setIsSimulating, showBall, setShowBall, playMode, setPlayMode
}) => (
    <>
        <button
            onClick={() => setIsSimulating(!isSimulating)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap shadow-lg ${isSimulating ? 'bg-red-500 text-white shadow-red-500/30' : 'bg-[#FACC15] text-black shadow-[#FACC15]/30 hover:scale-105'}`}
        >
            {isSimulating ? (
                <><Square size={14} className="fill-current" /> SIFIRLA</>
            ) : (
                <><Play size={14} className="fill-current" /> OYNAT</>
            )}
        </button>
        <button
            onClick={() => setShowBall(!showBall)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap shadow-lg ${showBall ? 'bg-orange-500 text-white shadow-orange-500/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
        >
            ⚽ TOPU {showBall ? 'GİZLE' : 'GÖSTER'}
        </button>
        <button
            onClick={() => setPlayMode(p => p === 'SYNC' ? 'SEQ' : 'SYNC')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap shadow-lg ${playMode === 'SEQ' ? 'bg-indigo-500 text-white shadow-indigo-500/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
            title="Sıralı veya Eşzamanlı Simülasyon"
        >
            {playMode === 'SEQ' ? '🔄 SIRALI OYNAT' : '👥 EŞZAMANLI OYNAT'}
        </button>
    </>
);

// --- Saha içine binen ağır oynatma katmanı (top animasyonu + sekans editörü) ---
interface AdvancedAnimationModuleProps {
    drawings: DrawingLine[];
    isSimulating: boolean;
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
}

const AdvancedAnimationModule: React.FC<AdvancedAnimationModuleProps> = ({
    drawings, isSimulating, showBall, playMode,
    seqMap, totalSeqDuration, selectedSeqBadge, setSelectedSeqBadge,
    isCustomSeqInputOpen, setIsCustomSeqInputOpen, customSeqValue, setCustomSeqValue,
    setDrawings
}) => {
    return (
        <>
            {/* Pas topları animasyonu */}
            {isSimulating && showBall && drawings.filter(d => d.type === 'arrow').map(path => {
                if (!seqMap.get(path.id)) return null;
                const anim = getAnimationProps(path, isSimulating, playMode, seqMap.get(path.id)!, totalSeqDuration);
                return (
                    <motion.div
                        key={`ball-${path.id}`}
                        className="absolute w-4 h-4 z-[60] bg-white rounded-full flex items-center justify-center text-[10px] shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                        animate={anim.animate}
                        transition={anim.transition as any}
                        style={{ x: "-50%", y: "-50%" }}
                    >
                        ⚽
                    </motion.div>
                );
            })}

            {/* Sekans Rozetleri (timeline sıralama editörü) */}
            {playMode === 'SEQ' && drawings.map((line) => {
                const midIdx = Math.floor(line.points.length / 2);
                const midPoint = line.points[midIdx];
                if (!midPoint) return null;
                const isSelected = selectedSeqBadge === line.id;
                return (
                    <div
                        key={`badge-${line.id}`}
                        className="absolute z-[70]"
                        style={{ left: `${midPoint.x}%`, top: `${midPoint.y}%`, transform: 'translate(-50%, -50%)' }}
                    >
                        <div
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                setSelectedSeqBadge(isSelected ? null : line.id);
                                setIsCustomSeqInputOpen(false);
                            }}
                            className={`bg-indigo-500 text-white font-black rounded-full w-6 h-6 flex items-center justify-center text-xs border-2 border-indigo-900 shadow-[0_0_10px_rgba(99,102,241,0.8)] cursor-pointer pointer-events-auto transition-all ${isSelected ? 'scale-125 bg-white text-indigo-500' : 'hover:bg-white hover:text-indigo-500 hover:scale-110'}`}
                            title="Sırayı Ayarla"
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
