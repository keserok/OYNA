// ⚡ GELİŞMİŞ ANİMASYON MODÜLÜ (lazy-loaded / on-demand indirilir)
//
// MİMARİ: Çekirdek stüdyo HAFİF kalır. Top & oyuncu hareketi animasyonu,
// oynatma motoru, sekans/timeline ve ağır zamanlama hesabı BURADA yaşar.
// Stüdyo açılınca bu chunk arka planda indirilir ve mount edilir.
//
// Bu modül üç parça export eder:
//  - getPlayerCssAnimation: oyuncu markörü için CSS @keyframes üretir. Çekirdek
//    pitch bunu, animasyon yüklüyken slot/rakip markörlerini sürmek için kullanır.
//  - AnimationToolbar: simülasyon kontrolleri (OYNAT ⇄ DURDUR, topu göster/gizle,
//    sıralı/eşzamanlı oynatma).
//  - default AdvancedAnimationModule: saha üzerine binen top animasyonu +
//    sekans rozet/timeline editörü (additive overlay).
//
// ── NEDEN CSS, NEDEN framer-motion DEĞİL? (2026-08-04) ───────────────────────
// Top ve bitiş sayacı zaten CSS @keyframes ile sürülüyordu; DURDUR bunları
// `animation-play-state: paused` ile OLDUĞU YERDE donduruyordu. Oyuncular ise
// framer-motion ile sürülüyordu ve framer-motion'da "olduğu yerde dondur" yok:
// DURDUR'a basınca top duruyor ama oyuncular yürümeye devam ediyordu.
// Ayrıca oyuncular rotayı İKİ tur yürürken (repeat: 1) top ve bitiş sayacı BİR
// tur koşuyordu; buton "TEKRAR OYNAT"a döndüğünde oyuncular hâlâ hareketliydi.
// Çözüm: oyuncular da topla AYNI motora (CSS keyframes) alındı ve herkes BİR tur
// koşuyor. Böylece OYNAT/DURDUR anında ve topla eşzamanlı çalışıyor.

import React from 'react';
import { motion } from 'framer-motion';
import { Play, Square, Check, X, Trash2, Plus } from 'lucide-react';
import type { DrawingLine, PlayMode, SeqInfo } from './types';

/** Bir oyuncu markörünü süren CSS animasyonu. */
export interface PlayerCssAnimation {
    /** @keyframes adı — CSS kimliği olarak güvenli (harf/rakam). */
    name: string;
    /** `@keyframes <name>{...}` metni; <style> içine basılır. */
    css: string;
    /** Bir turun saniye cinsinden süresi. */
    duration: number;
    /** Rotanın ilk noktası — animasyon başlamadan markör buraya oturur (sıçrama olmasın). */
    startX: number;
    startY: number;
}

/**
 * Koşu rotasından oyuncu markörü için CSS @keyframes üretir.
 *
 * Zamanlama, önceki framer-motion hesabıyla BİREBİR aynıdır:
 *  • SIRALI (SEQ): çizgi, toplam turun içinde yalnız kendi zaman penceresinde
 *    (startTime → startTime+duration) ilerler; penceresinden önce başlangıç,
 *    sonra bitiş noktasında bekler.
 *  • EŞZAMANLI (SYNC): rota, kendi süresi boyunca eşit aralıklarla kat edilir.
 *
 * Saf fonksiyondur (DOM'a dokunmaz) — testlerde doğrudan çağrılabilir.
 * Nokta sayısı 2'den azsa animasyon yoktur: null döner.
 */
export const getPlayerCssAnimation = (
    path: DrawingLine,
    playMode: PlayMode,
    seqInfo: SeqInfo,
    totalSeqDur: number,
): PlayerCssAnimation | null => {
    if (!path || !path.points || path.points.length < 2) return null;
    const pathDur = seqInfo?.duration ?? 0;
    const totalCycle = playMode === 'SEQ' ? Math.max(0.1, totalSeqDur) : pathDur;
    if (!(totalCycle > 0)) return null;

    const first = path.points[0];
    const last = path.points[path.points.length - 1];
    // Yüzde durakları: {at: 0..1, x, y}
    const stops: { at: number; x: number; y: number }[] = [];

    if (playMode === 'SEQ') {
        const start = seqInfo.startTime / totalCycle;
        const end = (seqInfo.startTime + pathDur) / totalCycle;
        // Penceresi başlamadan başlangıç noktasında bekle
        if (start > 0) stops.push({ at: 0, x: first.x, y: first.y });
        path.points.forEach((p, i) => {
            const f = i / Math.max(1, path.points.length - 1);
            stops.push({ at: start + f * (end - start), x: p.x, y: p.y });
        });
        // Penceresi bitince bitiş noktasında bekle
        if (end < 1) stops.push({ at: 1, x: last.x, y: last.y });
    } else {
        path.points.forEach((p, i) => {
            stops.push({ at: i / Math.max(1, path.points.length - 1), x: p.x, y: p.y });
        });
    }

    // Yüzdeleri 0-100 aralığına sıkıştır, yuvarla ve artan sırayı koru.
    // Aynı yüzdeye düşen duraklarda SONUNCU geçerlidir (CSS'in kendi kuralı).
    const seen = new Map<string, string>();
    stops.forEach(s => {
        const pct = (Math.min(1, Math.max(0, s.at)) * 100).toFixed(3).replace(/\.?0+$/, '');
        seen.set(pct || '0', `left:${s.x}%;top:${s.y}%`);
    });
    const frames = Array.from(seen.entries())
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([pct, decl]) => `${pct}%{${decl}}`)
        .join('');

    const name = `oyRun${String(path.id).replace(/[^a-zA-Z0-9]/g, '')}`;
    return { name, css: `@keyframes ${name}{${frames}}`, duration: totalCycle, startX: first.x, startY: first.y };
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
                // Sıra paneli SAHANIN İÇİNDE kalmalı: saha `overflow-hidden` olduğu
                // için ortalanmış panel, kenardaki rozetlerde dışarı taşıp kesiliyordu
                // (sol kenardaki oyuncularda numaralar hiç görünmüyordu).
                // Çözüm: rozet nerede duruyorsa panel oraya göre açılır —
                //   sol üçte bir  → sağa doğru açılır (sol kenarı rozete yaslı)
                //   sağ üçte bir  → sola doğru açılır (sağ kenarı rozete yaslı)
                //   orta          → eskisi gibi ortalanır
                // Alt kenarda da aynı sorun var: aşağıdaki rozetlerde panel yukarı açılır.
                const panelX = midPoint.x < 33 ? 'left-0'
                    : midPoint.x > 67 ? 'right-0'
                    : 'left-1/2 -translate-x-1/2';
                const panelY = midPoint.y > 70 ? 'bottom-10' : 'top-10';
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
                            // flex-wrap + max-w: numaralar çoksa panel sahayı aşmak
                            // yerine İKİ SATIRA iner; daha da çoksa kendi içinde kayar.
                            <div
                                className={`absolute ${panelY} ${panelX} w-max max-w-[13rem] max-h-24 overflow-y-auto no-scrollbar bg-[#161B22] border border-white/10 rounded-xl p-2 shadow-2xl flex flex-wrap gap-1 pointer-events-auto`}
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
