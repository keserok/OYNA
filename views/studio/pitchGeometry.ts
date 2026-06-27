// Hafif geometri yardımcıları — ÇEKİRDEK stüdyo tarafından kullanılır.
// Ağır animasyon hesabı (getAnimationProps) gelişmiş modülde yaşar.

import type { DrawingLine, SeqComputation } from './types';

/** Noktalardan yumuşatılmış SVG path string'i üretir (çizim katmanı için). */
export const getSmoothPathStr = (points: { x: number, y: number }[], width: number, height: number): string => {
    if (!points || points.length === 0) return '';
    const mapped = points.map(p => ({ x: (p.x * width) / 100, y: (p.y * height) / 100 }));
    if (mapped.length === 1) return `M ${mapped[0].x},${mapped[0].y}`;
    if (mapped.length === 2) return `M ${mapped[0].x},${mapped[0].y} L ${mapped[1].x},${mapped[1].y}`;

    let path = `M ${mapped[0].x},${mapped[0].y}`;
    for (let i = 1; i < mapped.length - 1; i++) {
        const xc = (mapped[i].x + mapped[i + 1].x) / 2;
        const yc = (mapped[i].y + mapped[i + 1].y) / 2;
        path += ` Q ${mapped[i].x},${mapped[i].y} ${xc},${yc}`;
    }
    path += ` L ${mapped[mapped.length - 1].x},${mapped[mapped.length - 1].y}`;
    return path;
};

/** Bir çizginin toplam yol uzunluğunu (yüzde birimi) hesaplar. */
export const getPathLength = (points: { x: number, y: number }[]): number => {
    let dist = 0;
    for (let i = 0; i < points.length - 1; i++) {
        dist += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    }
    return dist;
};

/**
 * Sekans haritasını hesaplar: her çizgi için başlangıç zamanı + süre,
 * ve sıralı oynatma için toplam süre. Çekirdek tarafından da gelişmiş modül
 * tarafından da kullanılabilir; hesap hafiftir (sadece path uzunluğu).
 */
export const computeSeqMap = (drawings: DrawingLine[]): SeqComputation => {
    const seqMap = new Map<string, { startTime: number, duration: number }>();
    let totalSeqDuration = 0;

    const steps = Array.from(new Set(drawings.map(d => d.seqStep || 1))).sort((a: any, b: any) => a - b);

    steps.forEach(stepIdx => {
        const linesInStep = drawings.filter(d => (d.seqStep || 1) === stepIdx);
        const maxDurInStep = Math.max(...linesInStep.map(d => Math.max(1, getPathLength(d.points) / 30)));

        linesInStep.forEach(d => {
            const dDur = Math.max(1, getPathLength(d.points) / 30);
            seqMap.set(d.id, { startTime: totalSeqDuration, duration: dDur });
        });

        totalSeqDuration += maxDurInStep;
    });

    return { seqMap, totalSeqDuration };
};
